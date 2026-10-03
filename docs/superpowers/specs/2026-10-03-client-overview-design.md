# Client Profile Overview Redesign + Tab Behavior — Design

Status: Approved by owner 2026-10-03, modelled on a reference instructor app's client profile (Training / Sessions / Metrics sections), in our green matte theme.

## Tab behavior (bug fix)

Every hash change called `window.scrollTo(0, 0)`, and a tab tap changes the hash (`?tab=...`), so each tap threw you to the top. Now `useRoute` only resets scroll when the path changes; query-only changes keep your place.

Because the tab bar is now pinned (sticky) under the page header, `ClientProfilePage` also lines up the new tab's content directly beneath it when you had scrolled past the bar's natural position, instead of stranding you mid-page on a shorter tab. Near the top, nothing moves.

## Layout

Header card (avatar, name, "36 yrs · Female · Since Jan 10, 2026", status badges) then the pinned tab bar, then the tab. The four stat tiles, package card and goal card that sat above the tabs (and pushed every tab down the page) moved into Overview.

Overview sections:
- **Training:** Workouts card ("1 of 3 tracked this week", "Next: <template> · Mon 5 Oct", taps through to the Training tab) and a Default template card (links to the template, or to Edit client when none).
- **Sessions:** sessions remaining / sessions done tiles, a footer line (package status, used of total, expiry, last session), and a "Log a new session" button.
- **Metrics:** Pain, RPE (latest session that has one), Body score (average of each area's latest score), Readiness (latest movement screen), each with its date; "No data yet" when empty. "View more" opens Progress.
- **Details:** personal details, contact, health & safety, current goal, general notes (unchanged content, restyled cards).

There is no Tasks card (no equivalent in this app). No data or schema changes.

## Code

`OverviewTab` rewritten in `app.js`; `overviewMetrics` in `data.js`; `workoutsSummary` in `training.js`; `.ov-*` and `.profile-tabs` styles reuse the matte tokens via `.ex-theme`.

## Tests

`overviewMetrics` (empty, latest-with-value selection, averages, tones) in data.test.js; `workoutsSummary` (unavailable, empty, active, next item, all done) in training.test.js. UI verified at 375px with the real profile page: no scroll-to-top calls on tab switch (while a path change still resets), pinned tab bar aligned to the header, empty and populated Overview.
