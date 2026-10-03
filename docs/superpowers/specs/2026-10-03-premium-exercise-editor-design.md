# Premium Exercise Editor Skin — Design

Status: Direction approved by owner 2026-10-03 (refined "Option A" mockup, plus spring level).

## Purpose

The tap-first exercise editor works, but looks flat: a bordered gray box, stock iOS grays, no depth, no motion, default-browser outlines on the "Add set/spring/step" buttons. Goal: a sleek, premium finish. Visual-only: no data shape, schema or behavior changes, so every saved exercise is untouched.

## Scope

Exercise editor only (`ExerciseEditor`/`ExerciseRow`). All new tokens are scoped to a `.exercise-editor` wrapper. Rolling the same look out to the rest of the app later means moving the tokens to `:root`; nothing else changes.

## Look

- **Palette:** warm cream surface (`#fffefb`), green-tinted ink (`#11211a`), deep emerald brand (`#15764e`), two-tone gradients for selected states (`#2cab76 -> #0f6b45`), brand-tinted hairline borders instead of neutral gray, soft green-tinted layered shadows. Dark mode gets its own token set (OLED-friendly surface, brighter emerald, dark text on the gradient).
- **Type:** eyebrow labels (10.5px, 800, wide tracking, uppercase, brand color); exercise name 19px/750 with -0.025em tracking; tabular numerals on every stepper value.
- **Card:** 20px radius, hairline border, layered shadow. Collapsed card = dark-green glowing tag (`CATEGORY . SIDE`), big name, uppercase muted summary line (sets, springs with level, props), chevron, Remove. Expanded card header = tag pill "Exercise N".
- **Sections** (Sequence, Sets, Springs, Props, Pilates detail): tinted rounded sub-cards instead of dashed dividers. Step rows and spring rows are white inner cards.
- **Controls:** chips are rounded-rect with hairline + soft shadow; selected = gradient with glow and inset highlight. Segmented control sits in a brand-tinted track with a raised active segment. Steppers have a hairline container and soft inner buttons. Inputs get a brand focus ring.
- **"Add set / spring / step / exercise":** dashed brand-outline full-width buttons (also fixes the browser-default dark border they have today).
- **Spring level:** chips 1 / 2 / 3 / Other on every spring row (unchanged behavior, restyled); level appears in the collapsed summary via `formatSpringLine`.
- **Motion:** cards fade/slide in on mount, including collapsed to expanded (the two states get different React keys so the animation replays); press-down scale on chips, steppers and segments; honors `prefers-reduced-motion`.

## Markup changes (`exerciseEditor.js`)

- Root div of `ExerciseEditor` gets `className: "exercise-editor"`.
- Collapsed card: single full-width toggle button containing tag, name, summary and chevron (category/side move from the summary into the tag); Remove stays a sibling button. Summary no longer repeats category/side.
- Expanded header: "Exercise N" becomes the tag pill.
- The four dashed-border section wrappers become `className: "ex-section"`; the steps list wrapper becomes an `ex-section` with a "Sequence . N steps" label.
- Distinct `key` on the collapsed vs expanded root div so the enter animation replays on expand.

## Testing

Pure-function tests are unaffected (all 5 suites must still pass). Visual verification with the standalone demo harness (real `exerciseEditor.js`, fake data, no login) in light, dark and phone-width viewports.

## Out of scope

App-wide rollout (dashboard, lists, profile), program/template flow redesign, anything touching data.
