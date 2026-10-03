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

// Sessions remember which workout template they were run from (program_id).
assert.strictEqual(sandbox.rowToSession({ program_id: "t1" }).programId, "t1");
assert.strictEqual(sandbox.rowToSession({}).programId, null);
assert.strictEqual(sandbox.sessionToRow({ programId: "t1" }).program_id, "t1");
assert.strictEqual(sandbox.sessionToRow({ programId: null }).program_id, null);
assert.strictEqual("program_id" in sandbox.sessionToRow({ date: "2026-01-01" }), false, "absent field is not written");

// Until the program_id column exists in the live database, saving must still
// work: detect that specific failure and retry without the column.
assert.strictEqual(sandbox.isMissingProgramIdColumn({ message: "Could not find the 'program_id' column of 'sessions' in the schema cache" }), true);
assert.strictEqual(sandbox.isMissingProgramIdColumn({ message: 'column "program_id" of relation "sessions" does not exist' }), true);
assert.strictEqual(sandbox.isMissingProgramIdColumn({ message: "permission denied for table sessions" }), false);
assert.strictEqual(sandbox.isMissingProgramIdColumn(null), false);
const withPid = { a: 1, program_id: "x" };
assert.deepEqual(sandbox.stripProgramId(withPid), { a: 1 });
assert.strictEqual(withPid.program_id, "x", "original row is not mutated");

// sessionCountsByTemplate: how many sessions were run from each template.
assert.deepEqual(
  sandbox.sessionCountsByTemplate([{ programId: "t1" }, { programId: "t1" }, { programId: "t2" }, { programId: null }, {}]),
  { t1: 2, t2: 1 }
);
assert.deepEqual(sandbox.sessionCountsByTemplate(undefined), {});

console.log("data.test.js: all assertions passed");
