const assert = require("assert");
const path = require("path");
const { loadScript } = require("./helpers/load-browser-script");

// A chainable fake of the Supabase query builder. Every call is recorded in
// `ops`; awaiting it resolves to whatever `respond(ops)` returns.
let respond = function () { return { data: [], error: null }; };
let ops = [];
let table = null;
function builder() {
  const b = {
    select: function () { ops.push(["select"]); return b; },
    insert: function (rows) { ops.push(["insert", rows]); return b; },
    update: function (v) { ops.push(["update", v]); return b; },
    delete: function () { ops.push(["delete"]); return b; },
    eq: function (c, v) { ops.push(["eq", c, v]); return b; },
    order: function (c) { ops.push(["order", c]); return b; },
    maybeSingle: function () { ops.push(["maybeSingle"]); return b; },
    then: function (res, rej) { return Promise.resolve(respond(ops)).then(res, rej); },
  };
  return b;
}
const fakeClient = {
  auth: {
    getSession: function () { return Promise.resolve({ data: { session: null } }); },
    onAuthStateChange: function () {},
  },
  from: function (t) { table = t; return builder(); },
};
const sandbox = {
  console: console,
  window: { SUPABASE_URL: "http://localhost", SUPABASE_ANON_KEY: "k", supabase: { createClient: function () { return fakeClient; } } },
};
loadScript(path.join(__dirname, "..", "data.js"), sandbox);
const repo = sandbox.scheduledWorkoutRepository;
const missingTable = { code: "PGRST205", message: "Could not find the table 'public.scheduled_workouts' in the schema cache" };
function reset(fn) { ops = []; table = null; respond = fn; }

(async function () {
  // list: queries the right table/client, orders by date, maps rows.
  reset(function () {
    return { data: [{ id: "w1", client_id: "c1", program_id: "t1", program_name: "Lower Body", scheduled_date: "2026-09-28", session_id: null }], error: null };
  });
  let list = await repo.listByClient("c1");
  assert.strictEqual(table, "scheduled_workouts");
  assert.deepEqual(ops.filter(function (o) { return o[0] === "eq"; })[0], ["eq", "client_id", "c1"]);
  assert.ok(ops.some(function (o) { return o[0] === "order" && o[1] === "scheduled_date"; }));
  assert.strictEqual(list.length, 1);
  assert.strictEqual(list[0].programName, "Lower Body");
  assert.strictEqual(list[0].date, "2026-09-28");

  // list: table not created yet -> null (the UI shows a setup notice), not an error.
  reset(function () { return { data: null, error: missingTable }; });
  assert.strictEqual(await repo.listByClient("c1"), null);

  // list: any other failure is a real error.
  reset(function () { return { data: null, error: { code: "42501", message: "permission denied for table scheduled_workouts" } }; });
  await assert.rejects(function () { return repo.listByClient("c1"); }, function (e) { return /permission denied/.test(e.message); });

  // createMany: one row per template, fresh ids, snake_case columns; several per day.
  reset(function (o) { return { data: o.filter(function (x) { return x[0] === "insert"; })[0][1], error: null }; });
  const created = await repo.createMany([
    { clientId: "c1", programId: "t1", programName: "Lower Body", date: "2026-09-29" },
    { clientId: "c1", programId: "t2", programName: "Core", date: "2026-09-29" },
  ]);
  const inserted = ops.filter(function (o) { return o[0] === "insert"; })[0][1];
  assert.strictEqual(inserted.length, 2);
  assert.strictEqual(inserted[0].scheduled_date, "2026-09-29");
  assert.strictEqual(inserted[1].program_id, "t2");
  assert.notStrictEqual(inserted[0].id, inserted[1].id, "each row gets its own id");
  assert.strictEqual(created.length, 2);
  assert.strictEqual(created[1].programName, "Core");

  // createMany: table missing -> a plain-language error telling the owner what to do.
  reset(function () { return { data: null, error: missingTable }; });
  await assert.rejects(
    function () { return repo.createMany([{ clientId: "c1", programId: "t1", programName: "x", date: "2026-09-29" }]); },
    function (e) { return !!e && /one-time database update/i.test(e.message); }
  );

  // linkSession marks an assignment as tracked by pointing it at the session.
  reset(function () { return { data: null, error: null }; });
  await repo.linkSession("w1", "s9");
  assert.deepEqual(ops.filter(function (o) { return o[0] === "update"; })[0], ["update", { session_id: "s9" }]);
  assert.deepEqual(ops.filter(function (o) { return o[0] === "eq"; })[0], ["eq", "id", "w1"]);

  // remove deletes just that assignment.
  reset(function () { return { data: null, error: null }; });
  await repo.remove("w1");
  assert.ok(ops.some(function (o) { return o[0] === "delete"; }));
  assert.deepEqual(ops.filter(function (o) { return o[0] === "eq"; })[0], ["eq", "id", "w1"]);

  // get returns one mapped assignment (or undefined when there is none / no table).
  reset(function () { return { data: { id: "w1", client_id: "c1", program_id: "t1", program_name: "Lower Body", scheduled_date: "2026-09-28", session_id: null }, error: null }; });
  assert.strictEqual((await repo.get("w1")).programId, "t1");
  reset(function () { return { data: null, error: null }; });
  assert.strictEqual(await repo.get("nope"), null);
  reset(function () { return { data: null, error: missingTable }; });
  assert.strictEqual(await repo.get("w1"), undefined);
  assert.strictEqual(await repo.get(""), undefined, "no id, no query");

  console.log("scheduledWorkouts.test.js: all assertions passed");
})().catch(function (e) { console.error(e); process.exit(1); });
