# Training Calendar — Design

Status: Approved by owner 2026-10-03, modelled on a reference instructor app (Training week with + per day, Assign workout picker, Missed/Tracked status), in our green matte theme.

## Scope

Weekly training calendar per client plus assigning workout templates to days. Not in this round: the client-profile Overview redesign, the app-wide restyle, moving an assignment between days (remove and re-add), reminders for missed workouts.

## Behavior

- **Training tab** on the client profile (after Overview). Three tiles: Last 7 days (tracked/assigned), This week (tracked/assigned), Next week (assigned). Week switcher with prev/next and a tappable label back to this week. Weeks run Monday to Sunday; today is highlighted. Seven day rows; several assignments per day; a + tile stays at the bottom of each day.
- **Status** per assignment: Tracked (a session was logged from it), Missed (date passed, nothing logged), Planned (today or later). There is no client-facing app, so "tracked" only ever means the coach logged the session.
- **Assign:** + opens a sheet with search, template cards (name, exercise count, description, tick circle). Tick one or more, Assign. A + in the sheet opens the template builder; with no templates it says so and links there.
- **Tap an assignment:** Start session (Missed/Planned), View session (Tracked), Remove from plan. Start session opens a new session at `?scheduled=<id>` with that day's date and template pre-loaded in the swipe cards (planned template wins over the client default; a deleted template falls back to the default). Saving links the assignment to the new session (`session_id`), which marks it Tracked. The link is explicit so two assignments on one day are never confused.
- **Local date:** `localTodayIso()` is used for the calendar (the existing UTC `todayIso()` is the wrong day for a few hours each night in Dubai).

## Data

New table `scheduled_workouts` (trainer_id, client_id, program_id nullable / set null, program_name snapshot, scheduled_date, session_id nullable / set null, created_at) with RLS and grants; SQL is in `supabase/schema.sql`. Deleting a session returns its assignment to Missed/Planned. Until the SQL is run, reads return `null` and the tab shows a setup notice; assigning shows a plain-language error. The rest of the app is unaffected.

## Code

`training.js` (helpers + `TrainingTab`, `AssignWorkoutSheet`, `ScheduledItemSheet`), `scheduledWorkoutRepository` and pure date/status/stats helpers in `data.js`, session-form handling for `?scheduled=` in `app.js`. Matte tokens apply to a new `.ex-theme` wrapper as well as `.exercise-editor`.

## Tests

Date/week math, `scheduleStatus`, `trainingStats`, row mappers, `resolveSessionStart`, `isMissingScheduleTable` (data.test.js); repository against a fake client incl. missing table (scheduledWorkouts.test.js); label/search/sort helpers (training.test.js). UI verified end to end at 375px with an in-memory fake: assign (several per day), Missed/Planned, start session, save, Tracked, remove, week navigation, setup notice.
