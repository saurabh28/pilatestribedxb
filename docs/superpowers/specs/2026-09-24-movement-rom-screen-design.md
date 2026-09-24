# PilatesTribe Movement & ROM Screen — Design

Status: Approved by owner 2026-09-24, building against the live Supabase project (otwuisvpbpecknnysviz). Owner's explicit direction: "keep it premium" — the results report is the client-facing moment, so visual polish (animated readiness ring fill-in, smooth green/amber/red color transitions, generous spacing, refined typography reusing the app's existing sage-green design system) is a real requirement here, not a nice-to-have.

**Correction (2026-09-24, post-implementation):** Thomas Test and PSLR were initially placed under `MOVEMENT_TESTS` with the same subjective 0-3 "Pain/Unable → Optimal" compensation scale as Overhead Squat/Walking Lunges/Step-Down/Dead Hang, mechanically copying the PDF's original section grouping. That's wrong: both are muscle-length/tightness tests measured against a degree-based normative range, the same shape as the ROM tests, not movement-quality tests. Moved both into `ROM_TESTS` (bilateral, normative degrees, 0-2 scale) — Thomas Test normative "0° (thigh level with table)", PSLR normative "≥ 80°". `MOVEMENT_TESTS` is now 4 entries, `ROM_TESTS` is now 7. Because the whole UI (form, both radar charts, corrective-exercise list) is driven generically off these two arrays, this move required zero UI code changes — only the config file and its tests.

## Purpose

Digitize the owner's paper "Movement, ROM & Performance Screening Sheet" (source: `Client Screening Sheet.pdf`, originally branded "Defeat Fitness Studio") as a PilatesTribe-branded feature in `pilatestribe-beta-platform`. This is a periodic functional-movement assessment, distinct from the existing body-score radar chart (which tracks anatomy pain/strength areas continuously). The result should read as a **results story for the client** — a readiness score, a clear color-coded verdict, a visual before/after, and concrete next-step exercises — not just a data table.

## Source material

The PDF defines two sections:
- **A. Movement Screening** (0–3 scale: 3 Optimal, 2 Minor Compensation, 1 Major Compensation, 0 Pain/Unable): Overhead Squat, Walking Lunges, Step-Down Test, Pull-Ups (Quality), Thomas Test, PSL Test.
- **B. Range of Motion Screening** (0–2 scale per side: 2 Meets Norm, 1 Borderline, 0 Restricted/Pain), each with a normative reference range: Ankle Dorsiflexion (≥10cm), Hip Internal Rotation (30–40°), Hip External Rotation (40–60°), Shoulder Internal Rotation (60–70°), Shoulder External Rotation (90–100°).
- Overall interpretation bands: GREEN (cleared for full training), AMBER (train with corrective focus), RED (corrective phase before loading).

Owner's changes to the source list: "Pull-Ups (Quality)" → **Dead Hang**, scored from hold time, not a subjective 0–3 call. "PSL Test" renamed **PSLR**. Branding becomes "PilatesTribe Movement & ROM Screen."

## Key decision: config-driven test list

The owner is still iterating on the exact test list. Tests, their scales, normative ranges, and corrective exercises are NOT hardcoded into the schema, scoring logic, or UI — they live in one data file, `movementScreen.js`, as plain arrays (`MOVEMENT_TESTS`, `ROM_TESTS`). Adding, removing, renaming, or re-scaling a test later means editing that file only. Scores are stored in JSONB keyed by each test's `id` (a string), never as fixed table columns — so a schema change is never required to change the test list, and historical screenings keep whatever test ids existed when they were recorded even if the list changes later.

```js
// movementScreen.js (new file, loaded as a <script> tag like charts.js/data.js)
var MOVEMENT_TESTS = [
  { id: "overheadSquat", label: "Overhead Squat", maxScore: 3,
    corrective: [
      { name: "Wall-facing squat", sets: "3x8", cue: "Nose to wall, sit back without losing wall contact." },
      { name: "Ankle mobility rocks", sets: "2x10/side", cue: "Knee over toes, heel stays down." },
    ] },
  { id: "walkingLunges", label: "Walking Lunges", maxScore: 3, corrective: [ /* 2-3 entries */ ] },
  { id: "stepDown", label: "Step-Down Test", maxScore: 3, corrective: [ /* ... */ ] },
  { id: "deadHang", label: "Dead Hang", maxScore: 3, timedHang: true, corrective: [ /* ... */ ] },
  { id: "thomasTest", label: "Thomas Test (Hip Flexor Length)", maxScore: 3, corrective: [ /* ... */ ] },
  { id: "pslr", label: "PSLR (Passive Straight Leg Raise)", maxScore: 3, corrective: [ /* ... */ ] },
];
var ROM_TESTS = [
  { id: "ankleDorsiflexion", label: "Ankle to Wall (Dorsiflexion)", maxScore: 2, normative: "≥ 10 cm", corrective: [ /* ... */ ] },
  { id: "hipInternalRotation", label: "Hip Internal Rotation", maxScore: 2, normative: "30–40°", corrective: [ /* ... */ ] },
  { id: "hipExternalRotation", label: "Hip External Rotation", maxScore: 2, normative: "40–60°", corrective: [ /* ... */ ] },
  { id: "shoulderInternalRotation", label: "Shoulder Internal Rotation", maxScore: 2, normative: "60–70°", corrective: [ /* ... */ ] },
  { id: "shoulderExternalRotation", label: "Shoulder External Rotation", maxScore: 2, normative: "90–100°", corrective: [ /* ... */ ] },
];
```

Every corrective list has 2–3 entries authored now for a working v1; **flag clearly to the owner that a physio or senior coach should review the exercise selections and scoring thresholds before relying on this with real clients** — same caveat that applies to any exercise-prescription content.

## Data model

One new table, `movement_screens` — one row per screening EVENT (not per test; the test list is fixed-at-time-of-recording per screening, so one JSONB blob per event is simpler and matches how `sessions.exercises` already stores structured data):

```sql
create table if not exists movement_screens (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  screened_at date not null default current_date,
  movement_scores jsonb not null default '{}'::jsonb,
  -- shape: { [testId]: { score: 0-3, seconds: number|null } }
  rom_scores jsonb not null default '{}'::jsonb,
  -- shape: { [testId]: { left: 0-2, right: 0-2 } }
  overall_result text not null check (overall_result in ('green','amber','red')),
  readiness_score integer not null check (readiness_score between 0 and 100),
  notes text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists movement_screens_trainer_idx on movement_screens (trainer_id);
create index if not exists movement_screens_client_date_idx on movement_screens (client_id, screened_at);

alter table movement_screens enable row level security;
create policy "movement_screens_owner_all" on movement_screens
  for all using (trainer_id = auth.uid()) with check (trainer_id = auth.uid());
```

Grants: must include this table in the same `grant select, insert, update, delete ... to anon, authenticated` statement already added to schema.sql for the other 5 tables (learned the hard way — see the fix committed 2026-09-24).

No update/delete UI in v1 beyond re-screening (a mistake here is corrected by running a fresh screen, matching how the paper form works — there is no "edit last screening" concept on paper either). This is insert-only from the app's perspective, same spirit as `body_scores` and `sessions`.

## Scoring (pure functions, unit-testable — no Supabase dependency)

```js
function deadHangScoreFromSeconds(seconds, hadPain) {
  if (hadPain) return 0;
  if (seconds == null) return null;
  if (seconds >= 60) return 3;
  if (seconds >= 30) return 2;
  if (seconds >= 10) return 1;
  return 0;
}
function computeReadinessScore(movementScores, romScores) {
  // sum of every recorded sub-score (movement tests + left/right ROM) over
  // the sum of their max possible values, as a percentage, rounded.
}
function computeOverallResult(movementScores, romScores) {
  // 'red' if any recorded sub-score is 0
  // else 'amber' if any recorded sub-score is below its max
  // else 'green'
}
```

A sub-score of 0 (pain/unable/restricted) on any test appends one line to the client's existing `injuriesAndPain` field via `clientRepository.update` — e.g. "Pain noted during movement screen — Hip Internal Rotation, 24 Sep 2026." Reuses the existing free-text field rather than introducing a new structured tag system (YAGNI — the app has no other consumer of structured injury tags yet).

## UI — the results story

New **"Screening"** tab on `ClientProfilePage`, alongside Overview/Sessions/Goals/Progress (a new tab, not folded into Progress — this is a periodic *event* with its own rich report, not a continuously-updating trend like body scores).

**Empty state:** "No movement screen yet" + a "Run first screening" button.

**Results report (the "story"), top to bottom:**
1. Readiness score ring (0–100, reusing the existing `ProgressRing` component from `charts.js`) with the date screened.
2. GREEN / AMBER / RED badge with plain-language interpretation text (from the PDF: "Cleared for full training" / "Train with corrective focus" / "Corrective phase before loading").
3. **Movement Quality radar chart** — one axis per `MOVEMENT_TESTS` entry, this screening (filled, colored by result) overlaid with the previous screening (dashed outline, no fill) if one exists. This is the "old vs new" progress view.
4. **Mobility Balance radar chart** — one axis per `ROM_TESTS` entry, Left vs Right overlaid on the same chart (two distinct colors, both filled lightly) — surfaces asymmetry directly, which matters more for ROM than a time trend.
5. **Corrective exercises** — for every test below its max score this screening, show its 2–3 exercises from the config, worst/painful tests first.
6. **Re-screen** button (opens the same intake form) and a compact history list below (date, result badge, readiness score) for past screenings.

**`RadarChart` extension:** currently takes a single `data` array (used by the body-score feature, already shipped). Extend it to optionally accept a `series` array of `{ data, color, dashed, filled }` for multi-shape overlays, falling back to the existing single-`data` behavior when `series` is absent — so the body-score usage is untouched.

**Intake form** (new screening): two fieldsets matching the PDF's two sections, driven by `MOVEMENT_TESTS`/`ROM_TESTS` arrays (map over them, don't hardcode fields) — Dead Hang gets a "seconds held" number input instead of a 0–3 picker, with a "client reported pain" checkbox; every other movement test gets a 0–3 select; every ROM test gets Left/Right 0–2 selects plus its normative range shown as a hint. Save computes `overall_result`/`readiness_score` client-side via the pure functions above, appends any pain notes to the client record, then inserts the row.

## Testing

Pure functions (`deadHangScoreFromSeconds`, `computeReadinessScore`, `computeOverallResult`) get Node-based tests via the existing `test/helpers/load-browser-script.js` harness, same pattern as `latestScoresByArea`/`radarChartPoints`. UI and Supabase round-trip verified manually against the live project, same limitation as every other feature in this app (no test framework, no live-DB test harness).

## Out of scope for this pass

- Per-client customization of the test list (unlike body-score's `tracked_body_areas`) — the owner is iterating on ONE standard list for now; per-client overrides can be added later the same way body-score's customization was, if ever needed.
- Editing/deleting a past screening beyond re-screening.
- Client-facing portal view of results (no client-facing app exists yet in this codebase — this is coach-facing only, meant to be shown to the client in-session by the coach).
