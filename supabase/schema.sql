-- ============================================================================
-- Client Session Tracker — multi-tenant schema for Supabase (Postgres)
--
-- HOW TO RUN:
--   1. Open your Supabase project → SQL Editor → "New query".
--   2. Paste this entire file and click "Run".
-- It's safe to re-run: every statement uses IF NOT EXISTS / OR REPLACE / DROP-then-CREATE,
-- so running it again (e.g. after adding a table later) won't duplicate anything or wipe data.
--
-- WHAT THIS DOES:
--   - Creates 4 tables: programs, clients, sessions, goals.
--   - Every row is tagged with trainer_id, defaulting to the logged-in user automatically.
--   - Row Level Security (RLS) is turned on for all 4 tables, with a policy that only
--     lets a trainer see/change their OWN rows (trainer_id = the logged-in user's id).
--     This is enforced by Postgres itself — even a bug in the app's frontend code could
--     never leak one trainer's clients to another trainer, because the database refuses
--     the query at the row level.
--   - This means the schema is ready for many trainers to use the same project safely,
--     even though for now sign-up isn't advertised and you're the only trainer using it.
-- ============================================================================

create extension if not exists pgcrypto;

-- Reusable trigger: keeps updated_at accurate on every UPDATE, regardless of
-- what the app sends.
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- programs — reusable workout templates
-- ----------------------------------------------------------------------------
create table if not exists programs (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  description text not null default '',
  exercises jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists programs_trainer_idx on programs (trainer_id);

drop trigger if exists trg_programs_updated_at on programs;
create trigger trg_programs_updated_at before update on programs
  for each row execute function set_updated_at();

alter table programs enable row level security;
drop policy if exists "programs_owner_all" on programs;
create policy "programs_owner_all" on programs
  for all using (trainer_id = auth.uid()) with check (trainer_id = auth.uid());

-- ----------------------------------------------------------------------------
-- clients
-- ----------------------------------------------------------------------------
create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  full_name text not null,
  gender text,
  date_of_birth date,
  email text,
  phone text,
  start_date date,
  preferred_training text[] not null default '{}',
  current_goal text not null default '',
  medical_history text not null default '',
  injuries_and_pain text not null default '',
  precautions text not null default '',
  emergency_contact_name text not null default '',
  emergency_contact_phone text not null default '',
  package_total_sessions integer,
  package_start_date date,
  package_expiry_date date,
  status text not null default 'active',
  general_notes text not null default '',
  assigned_program_id uuid references programs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists clients_trainer_idx on clients (trainer_id);
create index if not exists clients_trainer_name_idx on clients (trainer_id, full_name);

drop trigger if exists trg_clients_updated_at on clients;
create trigger trg_clients_updated_at before update on clients
  for each row execute function set_updated_at();

alter table clients enable row level security;
drop policy if exists "clients_owner_all" on clients;
create policy "clients_owner_all" on clients
  for all using (trainer_id = auth.uid()) with check (trainer_id = auth.uid());

-- ----------------------------------------------------------------------------
-- sessions
-- ----------------------------------------------------------------------------
create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  date date not null,
  session_number integer not null default 1,
  training_type text[] not null default '{}',
  duration_minutes integer,
  exercises jsonb not null default '[]'::jsonb,
  session_note text not null default '',
  client_response text not null default '',
  pain_score integer,
  rpe integer,
  modifications text not null default '',
  progression text not null default '',
  homework text not null default '',
  next_session_focus text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sessions_trainer_idx on sessions (trainer_id);
create index if not exists sessions_client_date_idx on sessions (client_id, date);

drop trigger if exists trg_sessions_updated_at on sessions;
create trigger trg_sessions_updated_at before update on sessions
  for each row execute function set_updated_at();

alter table sessions enable row level security;
drop policy if exists "sessions_owner_all" on sessions;
create policy "sessions_owner_all" on sessions
  for all using (trainer_id = auth.uid()) with check (trainer_id = auth.uid());

-- ----------------------------------------------------------------------------
-- goals
-- ----------------------------------------------------------------------------
create table if not exists goals (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  timeframe text not null,
  goal text not null default '',
  measurable_target text not null default '',
  status text not null default 'Not started',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, timeframe)
);
create index if not exists goals_trainer_idx on goals (trainer_id);

drop trigger if exists trg_goals_updated_at on goals;
create trigger trg_goals_updated_at before update on goals
  for each row execute function set_updated_at();

alter table goals enable row level security;
drop policy if exists "goals_owner_all" on goals;
create policy "goals_owner_all" on goals
  for all using (trainer_id = auth.uid()) with check (trainer_id = auth.uid());

-- ----------------------------------------------------------------------------
-- clients.tracked_body_areas — which anatomy areas this client's coach scores
-- ----------------------------------------------------------------------------
alter table clients add column if not exists tracked_body_areas text[] not null default
  array['Core','Lower back','Hips','Hamstring','Shoulder','Cervical spine','Pelvic floor'];

-- ----------------------------------------------------------------------------
-- body_scores — insert-only history of per-area anatomy scores (1-10).
-- Never updated, matching how `sessions` history is treated: every entry is
-- a new row, so a per-area trend can be charted over time.
-- ----------------------------------------------------------------------------
create table if not exists body_scores (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  area text not null,
  score integer not null check (score between 1 and 10),
  source text not null default 'assessment' check (source in ('assessment', 'session')),
  session_id uuid references sessions(id) on delete set null,
  notes text not null default '',
  recorded_at date not null default current_date,
  created_at timestamptz not null default now()
);
create index if not exists body_scores_trainer_idx on body_scores (trainer_id);
create index if not exists body_scores_client_area_idx on body_scores (client_id, area, recorded_at);

alter table body_scores enable row level security;
drop policy if exists "body_scores_owner_all" on body_scores;
create policy "body_scores_owner_all" on body_scores
  for all using (trainer_id = auth.uid()) with check (trainer_id = auth.uid());

-- ----------------------------------------------------------------------------
-- Base table grants.
--
-- If your project has "Automatically expose new tables" turned OFF (Project
-- Settings -> Data API), Postgres never grants anon/authenticated any
-- privilege on a new table at all -- the request is rejected before Row
-- Level Security even runs (error: "permission denied for table X"). RLS
-- only decides which ROWS a role can see once it already has table-level
-- access, so both are required. Safe to re-run.
-- ----------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on
  public.programs, public.clients, public.sessions, public.goals, public.body_scores
  to anon, authenticated;

-- ----------------------------------------------------------------------------
-- movement_screens -- one row per Movement & ROM screening event. Scores are
-- stored as JSONB keyed by test id (from movementScreen.js), never as fixed
-- columns, so the test list can keep changing without a migration.
-- ----------------------------------------------------------------------------
create table if not exists movement_screens (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  screened_at date not null default current_date,
  movement_scores jsonb not null default '{}'::jsonb,
  rom_scores jsonb not null default '{}'::jsonb,
  overall_result text not null check (overall_result in ('green','amber','red')),
  readiness_score integer not null check (readiness_score between 0 and 100),
  notes text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists movement_screens_trainer_idx on movement_screens (trainer_id);
create index if not exists movement_screens_client_date_idx on movement_screens (client_id, screened_at);

alter table movement_screens enable row level security;
drop policy if exists "movement_screens_owner_all" on movement_screens;
create policy "movement_screens_owner_all" on movement_screens
  for all using (trainer_id = auth.uid()) with check (trainer_id = auth.uid());

grant select, insert, update, delete on public.movement_screens to anon, authenticated;

-- ============================================================================
-- Done. Verify in Table Editor: you should see 6 tables (programs, clients,
-- sessions, goals, body_scores, movement_screens), each with a shield icon
-- indicating RLS is on.
-- ============================================================================
