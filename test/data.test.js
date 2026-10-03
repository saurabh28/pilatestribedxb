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

// deepEqual (not deepStrictEqual): sandbox.STANDARD_BODY_AREAS is an Array from
// the vm sandbox's own realm, so it has a different Array.prototype reference
// than this file's arrays — deepStrictEqual's prototype check would fail even
// though the contents are identical. deepEqual compares structurally instead.
assert.deepEqual(sandbox.STANDARD_BODY_AREAS, [
  "Core", "Lower back", "Hips", "Hamstring", "Shoulder", "Cervical spine", "Pelvic floor",
]);

const row = {
  id: "s1", trainer_id: "t1", client_id: "c1", area: "Core", score: 8,
  source: "assessment", session_id: null, notes: "good", recorded_at: "2026-01-01",
  created_at: "2026-01-01T00:00:00Z",
};
const model = sandbox.rowToBodyScore(row);
assert.strictEqual(model.clientId, "c1");
assert.strictEqual(model.score, 8);
assert.strictEqual(model.recordedAt, "2026-01-01");

const backToRow = sandbox.bodyScoreToRow(model);
assert.strictEqual(backToRow.client_id, "c1");
assert.strictEqual(backToRow.recorded_at, "2026-01-01");
assert.strictEqual(backToRow.score, 8);

const history = [
  { area: "Core", score: 5, recordedAt: "2026-01-01" },
  { area: "Core", score: 8, recordedAt: "2026-02-01" },
  { area: "Hips", score: 6, recordedAt: "2026-01-15" },
];
const latest = sandbox.latestScoresByArea(history);
assert.strictEqual(latest.Core.score, 8);
assert.strictEqual(latest.Hips.score, 6);
assert.strictEqual(latest.Shoulder, undefined);

// defaultTemplateId: the client's default template if it still exists, else "".
const tpls = [{ id: "t1" }, { id: "t2" }];
assert.strictEqual(sandbox.defaultTemplateId({ assignedProgramId: "t2" }, tpls), "t2");
assert.strictEqual(sandbox.defaultTemplateId({ assignedProgramId: "gone" }, tpls), "", "deleted template is ignored");
assert.strictEqual(sandbox.defaultTemplateId({ assignedProgramId: null }, tpls), "");
assert.strictEqual(sandbox.defaultTemplateId(undefined, tpls), "");
assert.strictEqual(sandbox.defaultTemplateId({ assignedProgramId: "t1" }, undefined), "");

// instantiateProgramExercises gives every nested item a fresh id, so a
// session loaded from a template never shares ids with the template.
const tplEx = [{
  id: "e1", exerciseName: "Footwork",
  setDetails: [{ id: "s1", reps: 10 }], springs: [{ id: "sp1", color: "Red" }],
  selectedProps: [{ id: "p1", name: "Magic Circle" }], steps: [{ id: "st1", label: "Bridge" }],
}];
const inst = sandbox.instantiateProgramExercises(tplEx)[0];
assert.notStrictEqual(inst.id, "e1");
assert.notStrictEqual(inst.setDetails[0].id, "s1");
assert.notStrictEqual(inst.springs[0].id, "sp1");
assert.notStrictEqual(inst.selectedProps[0].id, "p1");
assert.notStrictEqual(inst.steps[0].id, "st1");
assert.strictEqual(inst.springs[0].color, "Red");
assert.strictEqual(inst.steps[0].label, "Bridge");
assert.strictEqual(tplEx[0].springs[0].id, "sp1", "template itself is not mutated");
assert.deepEqual(sandbox.instantiateProgramExercises(undefined), []);
// Older templates have no springs/steps keys at all -- must not crash or invent data.
const legacy = sandbox.instantiateProgramExercises([{ id: "x", exerciseName: "Old", setDetails: [] }])[0];
assert.deepEqual(legacy.springs, []);
assert.deepEqual(legacy.steps, []);

console.log("data.test.js: all assertions passed");
