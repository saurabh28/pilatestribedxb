const assert = require("assert");
const path = require("path");
const { loadScript } = require("./helpers/load-browser-script");

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
};
loadScript(path.join(__dirname, "..", "data.js"), sandbox);

// Every category has a config entry.
sandbox.EXERCISE_CATEGORIES.forEach(function (cat) {
  assert.ok(sandbox.CATEGORY_FIELD_CONFIG[cat], "CATEGORY_FIELD_CONFIG has an entry for " + cat);
});

// Pilates: sets without weight, springs + props on, assistance/box on.
var pilates = sandbox.CATEGORY_FIELD_CONFIG.Pilates;
assert.strictEqual(pilates.usesSets, true);
assert.deepEqual(pilates.setFields, ["reps", "restSeconds"]);
assert.strictEqual(pilates.setFields.indexOf("weight"), -1, "Pilates sets have no weight field");
assert.strictEqual(pilates.usesSprings, true);
assert.strictEqual(pilates.usesProps, true);
assert.strictEqual(pilates.usesAssistance, true);
assert.strictEqual(pilates.usesBox, true);

// Strength: unchanged reps/weight/rest shape, no springs.
var strength = sandbox.CATEGORY_FIELD_CONFIG.Strength;
assert.deepEqual(strength.setFields, ["reps", "weight", "restSeconds"]);
assert.strictEqual(strength.usesSprings, false);
assert.strictEqual(strength.usesProps, true);

// Cardio: no sets at all, distance + intensity instead.
var cardio = sandbox.CATEGORY_FIELD_CONFIG.Cardio;
assert.strictEqual(cardio.usesSets, false);
assert.strictEqual(cardio.usesDistance, true);
assert.strictEqual(cardio.usesIntensity, true);

// Mobility and Yoga: hold-time based, no weight.
["Mobility", "Yoga"].forEach(function (cat) {
  var config = sandbox.CATEGORY_FIELD_CONFIG[cat];
  assert.deepEqual(config.setFields, ["holdSeconds"]);
  assert.strictEqual(config.usesProps, true);
});

// DEFAULT_PROPS is a non-empty list including the two named in the spec.
assert.ok(Array.isArray(sandbox.DEFAULT_PROPS) && sandbox.DEFAULT_PROPS.length > 0);
assert.ok(sandbox.DEFAULT_PROPS.indexOf("Magic Circle") !== -1);
assert.ok(sandbox.DEFAULT_PROPS.indexOf("Dumbbell") !== -1);

console.log("exerciseStructure.test.js: all assertions passed");
