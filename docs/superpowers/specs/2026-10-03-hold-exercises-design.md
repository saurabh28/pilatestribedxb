# Hold-Based Exercises (plank, wall sit, Spanish squat) — Design

Status: Approved by owner 2026-10-03.

## Problem

Only Mobility and Yoga sets had a hold-time field. Pilates, Strength, Functional and Other sets only had reps / weight / rest, so a strength hold such as a plank had nowhere to record its time per set (the exercise-level Duration is a single number, not per set).

## Design

- Optional flag `ex.holdBased` (absent on older exercises, treated as reps; `blankExercise` sets `false`). No schema change: exercises are JSONB.
- A **Count by: Reps | Hold (time)** switch at the top of the Sets section, shown only for categories whose sets count reps (Pilates, Strength, Functional, Other). Mobility and Yoga already count hold time; Cardio has no sets.
- In Hold mode each set shows Hold (sec) first, then Weight (if the category has it, e.g. a banded Spanish squat), then Rest. Reps is hidden.
- Switching never deletes numbers: the inactive mode's values stay stored but hidden, so switching back restores them.
- Summaries show the active mode only: collapsed card "3 sets · 45s hold" (or "45/45/30s hold" if sets differ), read-only session detail "Set 1: 45s hold".
- Templates, cloning ("log other side") and loading a template into a session carry the flag automatically.

## Pure functions (unit-tested)

`canToggleHold`, `effectiveSetFields`, `setVisibility`, `setsSummary`, and `formatSetLine(s, i, vis)` (visibility optional; omitted prints everything as before).
