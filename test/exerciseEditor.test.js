const assert = require("assert");
const path = require("path");
const { loadScript } = require("./helpers/load-browser-script");

// exerciseEditor.js has no top-level ReactDOM/document calls (unlike
// app.js, which calls boot() -> ReactDOM.createRoot(...) at load time), so
// it only needs `h` stubbed -- the component functions that reference
// useState/useEffect are never invoked here, only the plain pure functions.
const sandbox = {
  console: console,
  window: {
    SUPABASE_URL: "http://localhost",
    SUPABASE_ANON_KEY: "test-anon-key",
    supabase: {
      createClient: function () {
        return {
          auth: {
            getSession: function () { return Promise.resolve({ data: { session: null } }); },
            onAuthStateChange: function () {},
          },
        };
      },
    },
  },
  h: function () { return {}; },
};
loadScript(path.join(__dirname, "..", "data.js"), sandbox);
loadScript(path.join(__dirname, "..", "exerciseEditor.js"), sandbox);

// blankExercise() has the expected shape.
var ex = sandbox.blankExercise();
assert.strictEqual(ex.category, "Pilates");
assert.strictEqual(ex.side, "N/A");
assert.deepEqual(ex.springs, []);
assert.deepEqual(ex.selectedProps, []);
assert.strictEqual(ex.setDetails.length, 1);

// flipSide: Left/Right swap, Both/N/A unchanged.
assert.strictEqual(sandbox.flipSide("Left"), "Right");
assert.strictEqual(sandbox.flipSide("Right"), "Left");
assert.strictEqual(sandbox.flipSide("Both"), "Both");
assert.strictEqual(sandbox.flipSide("N/A"), "N/A");

// cloneExerciseForRepeat regenerates every nested id so editing the clone
// never mutates the source exercise.
var source = sandbox.blankExercise();
source.springs = [{ id: "s1", color: "Red", count: 2, level: "1" }];
var clone = sandbox.cloneExerciseForRepeat(source);
assert.notStrictEqual(clone.id, source.id);
assert.notStrictEqual(clone.springs[0].id, source.springs[0].id);
assert.strictEqual(clone.springs[0].color, "Red");

// formatSpringLine stays unambiguous per-row.
assert.strictEqual(sandbox.formatSpringLine({ count: 3, color: "Red", level: "1" }), "3x Red level 1");
// ...and ignores a blank/whitespace-only level (the "Other" chip's
// sentinel value before anything's been typed).
assert.strictEqual(sandbox.formatSpringLine({ count: 1, color: "Red", level: " " }), "1x Red");

// steps defaults to an empty array on a brand-new exercise.
assert.deepEqual(sandbox.blankExercise().steps, []);

// blankStep() has the expected shape.
var step = sandbox.blankStep();
assert.strictEqual(step.label, "");
assert.strictEqual(step.reps, null);
assert.strictEqual(step.holdSeconds, null);
assert.ok(step.id);

// normalizedSteps: missing/empty steps always returns [].
assert.deepEqual(sandbox.normalizedSteps({}), []);
assert.deepEqual(sandbox.normalizedSteps({ steps: [] }), []);
var withSteps = { steps: [{ id: "a", label: "Bridge", reps: null, holdSeconds: 10 }] };
assert.deepEqual(sandbox.normalizedSteps(withSteps), withSteps.steps);

// cloneExerciseForRepeat regenerates step ids too, same as springs/sets/props.
var comboSource = sandbox.blankExercise();
comboSource.steps = [{ id: "step-1", label: "Bridge & hold", reps: null, holdSeconds: 10 }];
var comboClone = sandbox.cloneExerciseForRepeat(comboSource);
assert.notStrictEqual(comboClone.steps[0].id, comboSource.steps[0].id);
assert.strictEqual(comboClone.steps[0].label, "Bridge & hold");

// topExerciseNames: frequency ranking, scoped to the given category, tie-
// broken by most-recent session date, capped at `limit`.
function makeSession(date, exNames, category) {
  return { date: date, exercises: exNames.map(function (n) { return { exerciseName: n, category: category || "Pilates" }; }) };
}
var sessions = [
  makeSession("2026-09-01", ["Footwork", "Footwork", "Hundred"]),
  makeSession("2026-09-10", ["Footwork", "Leg Circles"]),
  makeSession("2026-09-20", ["Short Spine"]),
  makeSession("2026-09-05", ["Running"], "Cardio"),
];
var top = sandbox.topExerciseNames(sessions, "Pilates", 3);
// Footwork has frequency 2, so it's first regardless of recency. Hundred,
// Leg Circles, and Short Spine are all frequency 1 -- tied, so most-recent
// session date breaks the tie: Short Spine (09-20) > Leg Circles (09-10) >
// Hundred (09-01). The limit of 3 cuts off Hundred.
assert.deepEqual(top, ["Footwork", "Short Spine", "Leg Circles"]);

assert.deepEqual(sandbox.topExerciseNames(sessions, "Cardio", 8), ["Running"]);
assert.deepEqual(sandbox.topExerciseNames([], "Pilates", 8), []);
assert.deepEqual(sandbox.topExerciseNames(undefined, "Pilates", 8), []);

console.log("exerciseEditor.test.js: all assertions passed");
