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

console.log("exerciseEditor.test.js: all assertions passed");
