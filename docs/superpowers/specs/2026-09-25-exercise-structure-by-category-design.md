# Exercise Structure By Category — Design

Status: Approved by owner 2026-09-25. Owner's note: this is expected to keep evolving — the config-driven approach below is chosen specifically so future changes are cheap.

## Purpose

Today, every exercise logged in a session (`ExerciseRow` in `app.js`) is forced through one generic "Strength" shape: reps + weight (free text) + rest, per set. Pilates gets a few extra free-text fields bolted on top (`springSetting`, `reformerSprings`, `props`, `repetitions`), which has produced real duplication: two different free-text fields both trying to capture spring info, and a top-level "Repetitions" field that duplicates the per-set "Reps" field. Springs and props have no structure at all — they're single strings like `"2 red"` or `"magic circle"`.

This redesign makes exercise structure config-driven per category (same architecture as `movementScreen.js`'s test list), gives Pilates its own appropriate shape instead of Strength's, and adds two new structured, reusable building blocks: **springs** and **props**.

## New structured building blocks

### Springs (Pilates only)

Replaces `springSetting` and `reformerSprings` (both free text, both trying to capture the same thing). A repeatable list, each row:

```js
{ id, color: string, count: number, level: string }
```

`color` and `level` are free text (not a fixed dropdown) because reformer color coding and level/bar count vary by brand and machine (e.g. some machines have 2 attachment levels, BASI-style machines have 3) — owner's explicit choice. Example: two rows — `{color:"Red", count:3, level:"1"}` and `{color:"Blue", count:1, level:"2"}` reads as "3 red on level 1, 1 blue on level 2."

### Props (every category)

Replaces the free-text `props` field. A chip-style multi-select seeded with a default list, extendable with a custom entry (same UX pattern as the body-score tracked-areas picker already in the app):

```js
var DEFAULT_PROPS = ["Magic Circle", "Dumbbell", "Resistance Band", "Ankle Weights", "Foam Roller", "Long Box", "Foot Strap", "Small Ball", "Theraband", "Kettlebell", "Medicine Ball"];
```

Selected props are stored as:
```js
[{ id, name: string, value: string }]
```

Every selected prop gets the same optional free-text `value` field (not a per-prop-name special case for "this one needs a number and this one doesn't" — that would be brittle and the owner already chose free text over fixed lists for springs for the same reason). A coach leaves `value` blank for Magic Circle, fills in "2kg" for Dumbbell, etc.

## Category field configuration

New config object (in `data.js`, next to `EXERCISE_CATEGORIES`), declaring which fields each category uses instead of hardcoding per-category JSX branches everywhere:

```js
var CATEGORY_FIELD_CONFIG = {
  "Pilates":    { usesSets: true,  setFields: ["reps", "restSeconds"],           usesSprings: true,  usesProps: true, usesAssistance: true, usesBox: true },
  "Strength":   { usesSets: true,  setFields: ["reps", "weight", "restSeconds"], usesSprings: false, usesProps: true },
  "Cardio":     { usesSets: false, usesDistance: true, usesIntensity: true,      usesSprings: false, usesProps: false },
  "Mobility":   { usesSets: true,  setFields: ["holdSeconds"],                   usesSprings: false, usesProps: true },
  "Yoga":       { usesSets: true,  setFields: ["holdSeconds"],                   usesSprings: false, usesProps: true },
  "Functional": { usesSets: true,  setFields: ["reps", "weight", "restSeconds"], usesSprings: false, usesProps: true },
  "Other":      { usesSets: true,  setFields: ["reps", "weight", "restSeconds"], usesSprings: false, usesProps: true },
};
```

Key changes per category vs. today:
- **Pilates**: per-set Weight field removed (springs/props carry resistance info, not a per-set text guess); the redundant top-level "Repetitions" field is removed entirely (per-set Reps already covers it, and `usesSets: true` means a Pilates exercise can still have multiple sets, per owner's "there can be more sets" note).
- **Strength / Functional / Other**: unchanged shape (reps + weight + rest already fits), gain the new structured Props picker.
- **Cardio**: no Sets block at all — gains exercise-level Distance and Intensity fields instead (alongside the existing generic Duration field).
- **Mobility / Yoga**: Sets become hold-time based (`holdSeconds`), no weight; gain Props (blocks, straps).

`duration` (top-level, already exists) stays available to every category unconditionally — it's already used for things like a Pilates "Hundred" hold time in the seed data, unrelated to this per-category redesign.

## Data shape changes

`blankExercise()` becomes:
```js
function blankExercise() {
  return {
    id: generateId(), exerciseName: "", category: "Pilates", setDetails: [blankSetDetail()],
    duration: null, distance: "", intensity: "", side: "N/A", notes: "",
    springs: [], selectedProps: [], box: false, assistanceLevel: "",
  };
}
```
Removed: `springSetting`, `reformerSprings`, `props` (string), `repetitions` (top-level).

`blankSetDetail()` gains `holdSeconds`:
```js
function blankSetDetail() {
  return { id: generateId(), reps: null, weight: "", restSeconds: null, holdSeconds: null };
}
```

## Backward compatibility

Any exercise already saved under the old shape keeps displaying correctly — two pure fallback functions, same pattern as the existing `normalizedSetDetails()`:

```js
function normalizedSprings(ex) {
  if (ex.springs && ex.springs.length) return ex.springs;
  if (ex.reformerSprings || ex.springSetting) return [{ id: "legacy-" + ex.id, color: ex.reformerSprings || ex.springSetting, count: null, level: "" }];
  return [];
}
function normalizedProps(ex) {
  if (ex.selectedProps && ex.selectedProps.length) return ex.selectedProps;
  if (ex.props) return [{ id: "legacy-" + ex.id, name: ex.props, value: "" }];
  return [];
}
```
Editing an old exercise upgrades it to the new structured shape on save, same as sets already do today. No database migration needed — `exercises` is stored as JSONB on `sessions`, so the shape change needs no schema change, and there's negligible real exercise data logged yet to worry about.

## UI changes

`ExerciseRow` is restructured to read `CATEGORY_FIELD_CONFIG[ex.category]` and conditionally render:
1. Always: Exercise name, Category, Side, Duration (unchanged, generic)
2. If `usesSets`: the Sets block, but only showing the input fields listed in that category's `setFields` (so Pilates shows Reps + Rest, no Weight input; Strength shows all three; Mobility/Yoga show only a Hold time input)
3. If `usesDistance` / `usesIntensity`: Cardio's Distance and Intensity fields
4. If `usesSprings`: the Springs list editor (color/count/level rows, add/remove)
5. If `usesProps`: the Props chip picker + custom-add input, with a value field per selected prop
6. If `usesAssistance` / `usesBox`: Pilates' Assistance level and Box-used fields
7. Always: Notes

`ExerciseSummary` (read-only display on `SessionDetailPage`) is updated to render springs/props from the new structured shape via the same `normalizedSprings`/`normalizedProps` fallback functions, so old and new exercises both display correctly.

## Testing

`CATEGORY_FIELD_CONFIG`, `normalizedSprings`, and `normalizedProps` are pure functions — covered by Node tests via the existing `test/helpers/load-browser-script.js` harness, same pattern as every other pure-function feature in this app. UI changes verified manually in the browser preview, same limitation as the rest of the app (no component-level test framework).
