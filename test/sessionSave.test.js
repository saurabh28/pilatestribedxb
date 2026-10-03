const assert = require("assert");
const path = require("path");
const { loadScript } = require("./helpers/load-browser-script");

// A fake Supabase client for the sessions table. `mode` controls how it
// responds to a row containing program_id: "ok" (column exists),
// "missing" (column not migrated yet), or "denied" (some other failure).
let mode = "ok";
let calls = [];
function respond(row) {
  if ("program_id" in row && mode === "missing") {
    return { data: null, error: { message: "Could not find the 'program_id' column of 'sessions' in the schema cache" } };
  }
  if (mode === "denied") return { data: null, error: { message: "permission denied for table sessions" } };
  return { data: Object.assign({}, row), error: null };
}
const fakeClient = {
  auth: {
    getSession: function () { return Promise.resolve({ data: { session: null } }); },
    onAuthStateChange: function () {},
  },
  from: function () {
    return {
      insert: function (row) {
        calls.push(row);
        const res = respond(row);
        return { select: function () { return { single: function () { return Promise.resolve(res); } }; } };
      },
      update: function (row) {
        calls.push(row);
        const res = respond(row);
        return { eq: function () { return { select: function () { return { maybeSingle: function () { return Promise.resolve(res); } }; } }; } };
      },
    };
  },
};

const sandbox = {
  console: console,
  window: { SUPABASE_URL: "http://localhost", SUPABASE_ANON_KEY: "k", supabase: { createClient: function () { return fakeClient; } } },
};
loadScript(path.join(__dirname, "..", "data.js"), sandbox);

const input = { clientId: "c1", date: "2026-10-03", programId: "t1" };

(async function () {
  // Column exists: one write, program_id saved and read back.
  mode = "ok"; calls = [];
  let created = await sandbox.sessionRepository.create(input);
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].program_id, "t1");
  assert.strictEqual(created.programId, "t1");

  // Column not migrated yet: retries once without program_id, save still succeeds.
  mode = "missing"; calls = [];
  created = await sandbox.sessionRepository.create(input);
  assert.strictEqual(calls.length, 2, "one failed attempt, one retry");
  assert.strictEqual("program_id" in calls[1], false, "retry omits program_id");
  assert.strictEqual(created.clientId, "c1");
  assert.strictEqual(created.programId, null);

  // Same for updates.
  calls = [];
  const updated = await sandbox.sessionRepository.update("s1", { programId: "t1", date: "2026-10-04" });
  assert.strictEqual(calls.length, 2);
  assert.strictEqual("program_id" in calls[1], false);
  assert.strictEqual(updated.date, "2026-10-04");

  // Any other failure is NOT swallowed or retried.
  mode = "denied"; calls = [];
  await assert.rejects(
    function () { return sandbox.sessionRepository.create(input); },
    function (err) { return /permission denied/.test(err.message); }
  );
  assert.strictEqual(calls.length, 1, "no retry for unrelated errors");

  console.log("sessionSave.test.js: all assertions passed");
})().catch(function (e) { console.error(e); process.exit(1); });
