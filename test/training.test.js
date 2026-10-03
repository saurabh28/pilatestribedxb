const assert = require("assert");
const path = require("path");
const { loadScript } = require("./helpers/load-browser-script");

// training.js has no top-level React/DOM calls; components only run when
// rendered, so the pure helpers can be loaded with just `h` stubbed.
const sandbox = {
  console: console,
  window: {
    SUPABASE_URL: "http://localhost",
    SUPABASE_ANON_KEY: "k",
    supabase: {
      createClient: function () {
        return { auth: { getSession: function () { return Promise.resolve({ data: { session: null } }); }, onAuthStateChange: function () {} } };
      },
    },
  },
  h: function () { return {}; },
};
loadScript(path.join(__dirname, "..", "data.js"), sandbox);
loadScript(path.join(__dirname, "..", "training.js"), sandbox);

// dayParts: weekday / day number / month for a YYYY-MM-DD string.
assert.deepEqual(JSON.parse(JSON.stringify(sandbox.dayParts("2026-09-28"))), { dow: "Mon", num: 28, month: "Sep" });
assert.deepEqual(JSON.parse(JSON.stringify(sandbox.dayParts("2026-10-04"))), { dow: "Sun", num: 4, month: "Oct" });
assert.strictEqual(sandbox.dayParts("2026-10-01").num, 1);

// weekRangeLabel: "Sep 28 – Oct 4".
assert.strictEqual(sandbox.weekRangeLabel("2026-09-28"), "Sep 28 – Oct 4");
assert.strictEqual(sandbox.weekRangeLabel("2026-12-28"), "Dec 28 – Jan 3");

// weekRelativeLabel: how to name the week being shown.
const cur = "2026-09-28";
assert.strictEqual(sandbox.weekRelativeLabel("2026-09-28", cur), "This week");
assert.strictEqual(sandbox.weekRelativeLabel("2026-10-05", cur), "Next week");
assert.strictEqual(sandbox.weekRelativeLabel("2026-09-21", cur), "Last week");
assert.strictEqual(sandbox.weekRelativeLabel("2026-11-02", cur), "Week of Nov 2");

// statValue: "0" when nothing assigned, otherwise tracked/assigned.
assert.strictEqual(sandbox.statValue({ assigned: 0, tracked: 0 }), "0");
assert.strictEqual(sandbox.statValue({ assigned: 1, tracked: 0 }), "0/1");
assert.strictEqual(sandbox.statValue({ assigned: 4, tracked: 3 }), "3/4");

// exerciseCountLabel
assert.strictEqual(sandbox.exerciseCountLabel(14), "14 exercises");
assert.strictEqual(sandbox.exerciseCountLabel(1), "1 exercise");
assert.strictEqual(sandbox.exerciseCountLabel(0), "No exercises");

// filterTemplates: case-insensitive match on name or description.
const tpls = [
  { id: "a", name: "Lower Body 40:20", description: "Five exercises, 40 seconds of work", exercises: [] },
  { id: "b", name: "Full Body EMOM", description: "Four rounds of five exercises", exercises: [] },
  { id: "c", name: "Mobility Flow", description: "", exercises: [] },
];
assert.deepEqual(sandbox.filterTemplates(tpls, "").map(function (t) { return t.id; }), ["a", "b", "c"]);
assert.deepEqual(sandbox.filterTemplates(tpls, "emom").map(function (t) { return t.id; }), ["b"]);
assert.deepEqual(sandbox.filterTemplates(tpls, "  FIVE ").map(function (t) { return t.id; }), ["a", "b"], "matches description, trims the query");
assert.deepEqual(sandbox.filterTemplates(tpls, "zzz"), []);
assert.deepEqual(sandbox.filterTemplates(undefined, "x"), []);

// sortScheduled: items on the same day keep the order they were assigned in.
const sorted = sandbox.sortScheduled([
  { id: "2", date: "2026-09-29", createdAt: "2026-09-27T10:00:02Z" },
  { id: "1", date: "2026-09-29", createdAt: "2026-09-27T10:00:01Z" },
  { id: "0", date: "2026-09-28", createdAt: "2026-09-27T10:00:09Z" },
]);
assert.deepEqual(sorted.map(function (i) { return i.id; }), ["0", "1", "2"]);

console.log("training.test.js: all assertions passed");
