# Body Score Visualization — Design

Status: Approved by owner 2026-09-17. Building against placeholder Supabase credentials; real project pending.

## Purpose

`pilatestribe-beta-platform` already has full session tracking (client CRUD, session logging with exercises/pain/RPE, goals, programs) and a Progress tab with line/bar charts. It has no anatomy-based body-score visualization. The owner's marketing site (pilatestribedxb.com) shows a radar/spider chart of per-area body scores as a headline feature; this spec adds the real thing to this app, for the personal trainer community (not Pilates-only — this app already supports Strength/Yoga/Functional/Mobility/Combination training types).

## Decisions (from brainstorming)

1. **Scoring cadence:** both. A coach can log scores as part of a session, or run a standalone periodic assessment. Either way, the radar chart always shows the latest score per area.
2. **Areas scored:** coach-customizable per client. Default list on client creation: Core, Lower back, Hips, Hamstring, Shoulder, Cervical spine, Pelvic floor (7 areas — the full rubric, not just the 6 shown in the marketing mockup).
3. **History:** every score is a permanent, insert-only row (never overwritten) — same pattern as `sessions`. This enables a per-area trend line, not just a current snapshot.
4. **Placement:** the radar chart, overall score, area breakdown, and trend chart all live inside the existing Progress tab (not a new top-level tab), as a new card above the existing session/pain/RPE charts.

## Data model

### `clients` — one new column

```sql
alter table clients add column if not exists tracked_body_areas text[] not null default
  array['Core','Lower back','Hips','Hamstring','Shoulder','Cervical spine','Pelvic floor'];
```

Free text, not an enum — matches this schema's existing "text constraints, not enums" convention (`status`, `training_type`, etc.), and lets a coach add a custom area for one client.

### `body_scores` — new table, insert-only

```sql
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
create policy "body_scores_owner_all" on body_scores
  for all using (trainer_id = auth.uid()) with check (trainer_id = auth.uid());
```

No `updated_at` / no update trigger — rows are never mutated, matching the "always insert, never update" rule already used for score-like history in this product family.

"Latest score per area" and "trend for one area" are both computed client-side by reducing the full history array (same style as `computeSessionStats` in `data.js` today) — no SQL window functions needed at this data size.

## Repository layer (`data.js`)

- `STANDARD_BODY_AREAS` constant: the 7 default areas.
- `rowToBodyScore` / `bodyScoreToRow` mappers (snake_case ↔ camelCase, matching existing pattern).
- `bodyScoreRepository`:
  - `listByClient(clientId)` — full history, sorted by `recordedAt` ascending (for trend charts).
  - `createMany(rows)` — bulk insert (used by both the assessment modal and the session-form section).
- `latestScoresByArea(history)` — pure function, returns `{ area: { score, recordedAt } }` using the most recent row per area.
- `clientToRow`/`rowToClient` gain `trackedBodyAreas` / `tracked_body_areas`.

## UI

### Progress tab — new "Body score" card (top of the tab)

- Overall score badge: average of latest-per-area scores, one decimal (e.g. "7.3/10"). Hidden/empty-state ("No assessments yet — run the first one") if the client has zero body-score rows.
- New `RadarChart` component in `charts.js`: dependency-free inline SVG, N-axis polygon (N = client's tracked area count), same visual language (CSS vars, no external libs) as existing `LineChart`/`BarChart`. Props: `data: [{ label, value, max }]`.
- Bar-list breakdown below the radar: one row per tracked area, current score, small horizontal bar (reuses existing `.chart-card`/badge styling, no new heavy component).
- "Manage tracked areas" small edit affordance (pencil icon) → reuses the existing `MultiSelectChips` component from `ui.js`, seeded from `STANDARD_BODY_AREAS` plus a free-text "add custom area" input, writes to `clients.trackedBodyAreas` via `clientRepository.update`.
- "New assessment" button → modal listing every tracked area with a 1–10 number input + optional notes field; on save, `bodyScoreRepository.createMany` with `source: 'assessment'`, `recordedAt: todayIso()`.

### Trend chart (below the radar/breakdown, same card or the one directly under it)

- A `SegmentedControl` or `SelectField` (both already exist in `ui.js`) to pick one tracked area.
- Reuses the existing `LineChart` component, fed that area's history (`{ label: shortDate(recordedAt), value: score }`), `yMin: 1, yMax: 10` — this is the "progress or regress over time" point chart the owner asked for. No new chart component needed here.

### Session form — optional "Update body scores" section

- Collapsible section in `SessionFormPage`, listing the client's tracked areas, each with an optional 1–10 input (blank = skip, not inserted).
- On session save, any filled-in areas are inserted via `bodyScoreRepository.createMany` with `source: 'session'`, `sessionId: <new/edited session id>`, `recordedAt: form.date`.

## Error handling / empty states

- Zero history for a client → empty state on the Body score card, matching the existing `.chart-empty` pattern used by `LineChart`/`BarChart` today.
- Score input is constrained to 1–10 both client-side (number input min/max) and server-side (`check` constraint on `body_scores.score`).
- Deleting a client cascades to `body_scores` via `on delete cascade`, matching `sessions`/`goals`.

## Supabase keep-alive (separate but related concern)

The owner's previous Supabase project was permanently suspended after ~90 days of inactivity. Fix: a scheduled GitHub Actions workflow (`.github/workflows/supabase-keepalive.yml`) that runs every 3 days and makes one lightweight authenticated REST call to the project (e.g. `GET /rest/v1/clients?select=id&limit=1` with the anon key), which counts as project activity and prevents auto-pause. Uses the anon key as a GitHub Actions repository secret (`SUPABASE_URL`, `SUPABASE_ANON_KEY`) — not committed to the repo, even though the anon key itself is safe to ship client-side, to keep it out of workflow logs.

## Testing plan

This app has no automated test suite and no mocking layer for Supabase — it's a thin, direct wrapper around the real client. Verification is manual:
1. Run `schema.sql` (including the additions above) against a real Supabase project.
2. Put the project's URL/anon key in `config.js`.
3. Serve the app locally; the owner signs in once (I do not handle the password); I then drive the UI — add tracked areas, run an assessment, log a session with body scores, confirm the radar chart, bar list, and trend chart all update and survive a page reload.
4. No project is available yet (placeholder credentials) — code will be written and reviewed for correctness now, with the live pass done as soon as real credentials are provided.
