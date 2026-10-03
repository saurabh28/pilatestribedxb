# Template-First Sessions + Swipeable Exercise Cards — Design

Status: Approved by owner 2026-10-03. One-on-one personal training only (no group sessions).

## Purpose

Sessions were logged freehand with an optional "apply a program". The owner wants the workflow to be: design a workout template first (any mix of categories), assign it to a client, and run sessions from it. One expanded exercise card is also far too tall to stack in a list (about 2,000px on a phone), so loaded exercises should be swipeable cards.

Templates already existed (`programs` table: name, description, `exercises` JSONB; `clients.assigned_program_id`). This change is flow and layout, plus one additive nullable column (`sessions.program_id`); no existing data is rewritten and saved sessions/templates are untouched.

## Decisions

- **Required but editable.** A new session cannot be saved until a template is chosen. Once loaded, exercises can still be edited, removed or added on the day.
- **Default plan + per-session pick.** A client's default template (existing `assignedProgramId`) is auto-loaded when a session starts; the coach can pick a different template for that session.
- **Templates are category-agnostic.** The template has no category; each exercise carries its own.
- **Label rename only:** "Programs" becomes "Workout Templates" in the UI. Routes (`/programs`), table and field names are unchanged.
- **A session remembers its template** (`sessions.program_id`, nullable, `on delete set null`). Needs a one-line SQL migration the owner runs by hand. Until it is run, saving still works: the repository detects the missing-column error and retries without it (covered by `test/sessionSave.test.js`). Session detail shows a "Template: X" badge; the templates list shows "N sessions".

## Behavior

- Session form (create): "Workout template" chips (the default is marked "Default"). No templates yet shows an empty state linking to the builder. Saving without a template shows "Choose a workout template to start this session."
- The default template's exercises load once, automatically, after the client and template list have loaded.
- Switching template: silent if the loaded exercises are untouched; if the coach has edited them, a "Switch template?" confirm appears first.
- Edit-session mode has no template chooser and shows the same carousel.
- Template builder keeps the vertical list of collapsible cards.

## Carousel (`ExerciseEditor layout="carousel"`)

- One full-width card at a time (no neighbor peeks in); CSS scroll-snap; pager "EXERCISE 2/6" with prev/next buttons, tappable dots above and below the card (up to 10 slides), trailing dashed "Add exercise" slide.
- Track height follows the current card (ResizeObserver) so short cards leave no gap.
- "Add exercise" and "Also log the other side" scroll to the new card.
- Session-mode card is compact: name/category/side/duration fold behind "Edit details" (open by default only for an unnamed exercise); Sequence, Springs, Props and Pilates detail are collapsible with a one-line summary. Sets stay open. Result: ~2,070px down to ~740px on a phone.

## Fixes found while building

- `instantiateProgramExercises` now gives springs, props and steps fresh ids (previously only sets).
- Sets row overflowed at 375px (steppers now wrap).
- `fieldset.form-group` gets `min-width: 0`; without it the carousel stretched the whole page to 786px on a phone.

## Testing

Pure functions unit-tested: `carouselIndexFromScroll`, `defaultTemplateId`, `instantiateProgramExercises`. UI verified by running the real `SessionFormPage` against stubbed repositories (default-loaded, no-default, no-templates, silent switch, confirm-on-edit, save blocked/allowed) at 375px.

## Out of scope

Progression/regression suggestions, exercise library, group sessions.
