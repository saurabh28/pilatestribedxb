# Exercise Entry: Fast, iPhone-First Redesign — Design

Status: Approved by owner 2026-10-01 (via visual-companion mockups).

## Purpose

Logging exercises is the slowest, most repetitive part of using this app, and it's used on an iPhone far more than a desktop. Today's `ExerciseRow` (`app.js`) is keyboard-heavy — every rep count, rest time, spring count, and spring color/level is a text input, several of which open the iOS keyboard even for small fixed-range values. On top of that, two real structural gaps surfaced during design: spring color and spring count were nearly impossible to read back correctly from a flat multi-select, and there was no way to log a choreographed combo (e.g. "single leg bridge + leg raises + pulses + hold") as anything other than one meaningless exercise name.

This redesign changes the **input widgets and layout** of the exercise editor for speed and iPhone fit. It does **not** change what's stored for `setDetails`, `springs`, or `selectedProps` — same shapes as the `2026-09-25-exercise-structure-by-category` spec — so every exercise already logged keeps displaying and editing correctly, no migration. It adds exactly one new optional field (`steps`, for combos) with a safe default that doesn't affect anything already saved.

## Collapsed vs. expanded card state

Each exercise card is either **collapsed** (a glance-line summary) or **expanded** (full editing UI):

- **Expanded by default:** a brand-new blank exercise (nothing to summarize yet) — the coach needs to fill it in immediately.
- **Collapsed by default:** any exercise that already has data when it appears — a clone from "Add exercise," a "log other side" clone, or any exercise in a session being edited/reviewed. Tapping a collapsed card expands it in place.

This is the single biggest speed win for the already-shipped "copy previous exercise" / "log other side" features: since most fields are already correct on a clone, the coach glances at the one-line summary, taps to expand only if something actually needs changing, instead of scrolling past a fully-expanded form every time.

The summary line reads (example): `Pilates · Both sides` / `2 sets · 12 reps` / spring-color dots + counts + level — built from the same data as the expanded view, via a shared summary-formatting function (already exists as `formatSetLine`/`formatSpringLine`/`ExerciseSummary` — extended, not replaced, to also serve this collapsed-card summary).

## Control mapping

| Field | Today | Redesigned |
|---|---|---|
| Category | `<select>` dropdown | Tappable chips (reuses the exact `.chip`/`.chip-group` pattern already used for Props — wrapping, not horizontal-scroll) |
| Side | `<select>` dropdown | Segmented control (reuses the existing `.segmented` CSS component, not yet used for exercise fields) |
| Reps / Rest / Hold seconds / Spring count | Number `<input>` (opens keyboard) | Stepper (`− value +`). **The displayed value itself is tappable** — tapping it turns it into a focused, select-all number input for direct typing (e.g. an unusual 47s rest), then reverts to stepper display on blur. One mechanism reused everywhere a stepper appears, rather than building a second "type an exact value" control. |
| Spring color | Text input with an iOS-unreliable `<datalist>` | Chips (`SPRING_COLORS`: Red/Yellow/Green/Black/Blue) — fixes a real bug, not just a speed issue, since `<input list>` suggestions are inconsistent on iOS Safari |
| Spring level | Free text | Chips: `1 / 2 / 3 / Other` — "Other" reveals a text input for BASI-style or unusual setups |
| Exercise name | Plain text input | Text input unchanged, but with **recent-name suggestion chips** above it (see below) |
| Weight/resistance (Strength/Functional/Other sets), Props, Notes, Distance, Intensity, Assistance level | Free text | **Unchanged.** These are inherently open-ended (mixed units, descriptive text) or already fast (Props is already a chip picker) — no redesign needed. |

### Spring rows stay a list — each row keeps its own color + count + level

The first mockup draft incorrectly tried to flatten "which colors are used" into one multi-select chip row sharing a single count — that's ambiguous (can't tell "3 Red + 1 Blue" apart from "4 of some mix"). **Corrected design: springs remain exactly the repeatable list they are today** (`ex.springs: [{id, color, count, level}]`), unchanged data shape and unchanged "Add spring" behavior (clones the last row, per the existing feature) — only the widgets *inside* each row change to chips/steppers. Row 1 might read "Red · 3 · Level 1", row 2 "Blue · 1 · Level 1" — unambiguous, same mental model as today, just faster to fill.

### Recent-name suggestions

Above the exercise-name text input, up to 8 tappable chips show the coach's most frequently-logged exercise names, **filtered to the currently-selected category** and recomputed whenever the category chip changes (a Pilates exercise's name history isn't relevant once the category is switched to Cardio). Computed by a pure function scanning the trainer's own historical sessions:

```js
function topExerciseNames(allSessions, category, limit) {
  // counts ex.exerciseName by frequency across all sessions' exercises
  // where ex.category === category, returns top `limit` names
  // ties broken by most-recent session date
}
```

Tapping a chip fills the name field; typing still works normally for anything new. This is pure UI convenience — it reads existing session data, writes nothing new.

## Combo / sequence exercises (new: `steps`)

Some exercises are a choreographed sequence of distinct phases, not one repeated movement — e.g. "single leg bridge (hold) → leg raises ×10 → pulses ×15 → hold 10s." Cramming that into the flat `exerciseName` loses the structure. This is **universal across all 7 categories** (a Strength complex, a Yoga flow, a Cardio circuit, etc. are the same shape of problem), so it's not gated by `CATEGORY_FIELD_CONFIG` the way sets/springs/props are — every exercise, regardless of category, can optionally become a sequence.

**New field**, added to `blankExercise()` with a safe empty default:
```js
steps: []   // [{ id, label: "", reps: null, holdSeconds: null }, ...]
```

**UI:** right under the exercise-name field, a 2-way chip toggle — "One movement" (default) / "A sequence of steps." Choosing "A sequence of steps" reveals an ordered, numbered list of steps (add/remove/reorder), each a short free-text label (e.g. "Leg raises" — intentionally free text, too compositional for a suggestion list) plus a small Reps/Hold toggle and one stepper for whichever quantity applies to that step. There's no separate persisted "is this a sequence" flag — **whether a saved exercise is in sequence mode is simply `steps.length > 0`**; for a new, not-yet-saved exercise the toggle is local component state until the first step is actually added.

**Sets, springs, and props stay exercise-level, shared across all steps** — e.g. the whole 4-step bridge combo still has one shared spring setup, not one per step. When `steps.length > 0`, the existing Sets block gets a one-line clarifying caption: "Sets = how many times you repeat this whole sequence," so the two concepts (steps = what's inside one pass, sets = how many passes) don't get confused. No new field needed for that caption — it's conditional copy, not data.

**Backward compatibility:** `steps` defaults to `[]` for every exercise that predates this field (same pattern as every other additive field in this app's JSONB-stored `exercises` column) — nothing to migrate, old exercises just render in "one movement" mode as before.

## iPhone-specific fixes (bugs, not preferences)

- **Safe-area insets:** the app already sets `viewport-fit=cover` but has zero `env(safe-area-inset-*)` padding anywhere in `styles.css`, so `.bottom-nav` and modal sheets can sit flush against the home-indicator bar, and `.page-header` against the notch in landscape. Fix: add `padding-bottom: env(safe-area-inset-bottom)` to `.bottom-nav` and `.modal-sheet`, and `padding-top: env(safe-area-inset-top)` to `.page-header`.
- **Minimum tap targets:** Apple HIG's 44×44pt minimum isn't met by `.set-remove-btn` (30px), `.icon-btn` (34px), or the new chip/stepper buttons if sized too small. Fix: bump interactive controls introduced or touched by this redesign to at least 44px in at least one dimension (chips can stay visually compact in height via padding, but the tappable area must reach 44px), and bump `.set-remove-btn`/`.icon-btn` while in the file either way, since they're genuinely under Apple's own guideline.

## Touch points

- `app.js` — `blankExercise()` (add `steps: []`), new `blankStep()`, `normalizedSteps(ex)` (same fallback pattern as `normalizedSprings`/`normalizedProps`, trivial here since there's no legacy shape to fall back to — just `ex.steps || []`).
- `app.js` — `cloneExerciseForRepeat` already regenerates fresh nested ids for `setDetails`/`springs`/`selectedProps` specifically so an edited clone never mutates the original (they'd otherwise share references via `Object.assign`'s shallow copy). **`steps` must get the same treatment** — add `steps: (ex.steps || []).map(function (s) { return Object.assign({}, s, { id: generateId() }); })` to that function, or a cloned exercise's steps would silently share objects with the source exercise's steps.
- `app.js` — `ExerciseRow` restructured per the control mapping above; collapsed/expanded state as local component state (`useState`), defaulting per the rule in "Collapsed vs. expanded" above.
- `app.js` — `ExerciseSummary` / `formatSetLine` / `formatSpringLine` extended to also render the Steps sequence (when present) and reused as the collapsed-card summary line.
- `app.js` — new `topExerciseNames(allSessions, category, limit)` pure function, wired into `ExerciseRow` wherever session history is already available to the page.
- `styles.css` — new stepper/chip-toggle styles (reusing `.chip`/`.chip-group`/`.segmented` where possible rather than inventing new classes), safe-area and tap-target fixes above.
- No `data.js` repository or schema changes — `exercises` is JSONB on `sessions` (and on `programs`, which share the same `ExerciseEditor`/`ExerciseRow` components), so the new `steps` field needs no migration.

## Testing

Pure functions get Node tests via the existing `test/helpers/load-browser-script.js` harness:
- `normalizedSteps` — empty/missing `steps` returns `[]`.
- `topExerciseNames` — correct frequency ranking, correct category filtering, correct tie-breaking by recency, caps at the requested limit.
- `formatSpringLine` / summary-line formatting still produce the unambiguous per-row "3 Red · Level 1" style output after the widget change (data shape didn't change, so existing formatting tests should still pass unmodified — this is a regression check, not new behavior).

UI (chip toggles, steppers, tap-to-edit, collapse/expand, safe-area rendering) verified manually in the browser preview and, where possible, by checking actual on-device Safari for the safe-area fix specifically, same limitation as the rest of this app.

## Explicitly out of scope (carried over / unchanged)

- **Mandatory program templates + exercise library with progression/regression suggestions** — a separate, larger feature flagged in the previous conversation; still deferred to its own brainstorming cycle, unaffected by this spec.
- **Per-step springs/props** — steps share the exercise's springs/props; revisit only if a real combo needs different resistance per phase.
- Everything in the `2026-09-25-exercise-structure-by-category` spec's own "out of scope" section remains out of scope here too.
