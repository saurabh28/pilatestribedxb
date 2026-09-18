# Body Score Visualization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a coach-customizable, anatomy-based body-score radar chart (with history and trend) to `pilatestribe-beta-platform`, matching the spec at `docs/superpowers/specs/2026-09-17-body-score-visualization-design.md`.

**Architecture:** New `body_scores` table (insert-only history) + `clients.tracked_body_areas` column, a pure `bodyScoreRepository` + mapper layer in `data.js`, a dependency-free `RadarChart` SVG component in `charts.js`, and UI wiring in `app.js` (Progress tab card, assessment modal, manage-areas modal, session-form section). Finishes with a GitHub Actions Supabase keep-alive workflow.

**Tech Stack:** Vanilla JS (ES5-style, no build step), React 18 UMD via `h = React.createElement`, Supabase JS v2, plain Node.js for pure-function tests (no test framework installed — uses `assert` + a small `vm`-based script loader since the app files are browser globals, not CommonJS modules).

**Important constraint:** This app has no test framework, no bundler, and no live Supabase project yet (`config.js` has placeholders). Steps that need a live database or a logged-in browser session are marked **[MANUAL — needs live Supabase]** and are deferred until the owner supplies real Supabase credentials; do not skip writing the code, just skip running that specific verification until then.

---

### Task 1: Test harness for browser-global scripts

**Files:**
- Create: `test/helpers/load-browser-script.js`

- [ ] **Step 1: Write the loader helper**

`data.js` and `charts.js` are loaded as plain `<script>` tags (no `module.exports`), and `data.js` creates a Supabase client at top-level load time (`var supabase = window.supabase.createClient(...)`), so `require()`-ing them directly in Node crashes (no `window`). This helper runs a file's source in a sandboxed V8 context via Node's `vm` module, so top-level `var`/`function` declarations land as properties on the sandbox object we pass in — no changes to the shipped app files needed.

```javascript
// test/helpers/load-browser-script.js
const fs = require("fs");
const vm = require("vm");

function loadScript(filePath, sandbox) {
  const code = fs.readFileSync(filePath, "utf8");
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: filePath });
  return sandbox;
}

module.exports = { loadScript };
```

- [ ] **Step 2: Verify it loads a trivial script**

Run:
```bash
node -e "
const { loadScript } = require('./test/helpers/load-browser-script.js');
const sandbox = { console };
vm_test = loadScript(require.resolve('./test/helpers/load-browser-script.js'), sandbox);
console.log('loader OK');
"
```
Expected output: `loader OK` (this just confirms `loadScript` itself is requireable; real usage is in Tasks 2 and 4).

- [ ] **Step 3: Commit**

```bash
git add test/helpers/load-browser-script.js
git commit -m "test: add vm-based loader for browser-global scripts"
```

---

### Task 2: `data.js` — standard areas, mappers, and pure `latestScoresByArea`

**Files:**
- Modify: `data.js` (add near the top, right after the existing constants block at line 15 — after `var GOAL_TIMEFRAMES = [...]`)
- Test: `test/data.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// test/data.test.js
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

assert.deepStrictEqual(sandbox.STANDARD_BODY_AREAS, [
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

console.log("data.test.js: all assertions passed");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test/data.test.js`
Expected: `TypeError: Cannot read properties of undefined` (or similar) because `STANDARD_BODY_AREAS` doesn't exist yet in `data.js`.

- [ ] **Step 3: Add the constant, mappers, and pure function to `data.js`**

Insert immediately after the existing line `var GOAL_TIMEFRAMES = ["1 month", "3 months", "6 months", "12 months"];` (currently line 15):

```javascript
var STANDARD_BODY_AREAS = ["Core", "Lower back", "Hips", "Hamstring", "Shoulder", "Cervical spine", "Pelvic floor"];
```

Then, after the existing `programToRow` function (right before the `/* Repositories */` section comment, currently around line 235), add:

```javascript
function rowToBodyScore(r) {
  if (!r) return r;
  return {
    id: r.id, trainerId: r.trainer_id, clientId: r.client_id, area: r.area,
    score: r.score, source: r.source, sessionId: r.session_id,
    notes: r.notes || "", recordedAt: r.recorded_at, createdAt: r.created_at,
  };
}
function bodyScoreToRow(s) {
  var row = {};
  if ("id" in s) row.id = s.id;
  if ("clientId" in s) row.client_id = s.clientId;
  if ("area" in s) row.area = s.area;
  if ("score" in s) row.score = s.score;
  if ("source" in s) row.source = s.source;
  if ("sessionId" in s) row.session_id = s.sessionId || null;
  if ("notes" in s) row.notes = s.notes || "";
  if ("recordedAt" in s) row.recorded_at = s.recordedAt;
  return row;
}
/* Pure reducer: given the full body_scores history for a client, returns the
   most recently recorded row per area, e.g. { "Core": { area, score, recordedAt, ... } }.
   Used by the radar chart (which only ever shows the latest value per area). */
function latestScoresByArea(history) {
  var latest = {};
  history.forEach(function (entry) {
    var current = latest[entry.area];
    if (!current || entry.recordedAt > current.recordedAt) latest[entry.area] = entry;
  });
  return latest;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node test/data.test.js`
Expected: `data.test.js: all assertions passed`

- [ ] **Step 5: Commit**

```bash
git add data.js test/data.test.js
git commit -m "feat: add STANDARD_BODY_AREAS, body-score mappers, and latestScoresByArea"
```

---

### Task 3: `data.js` — `bodyScoreRepository` and `clients.trackedBodyAreas`

**Files:**
- Modify: `data.js:241-277` (the `clientRepository` object and its `rowToClient`/`clientToRow` mappers just above it, currently lines 130-167)
- Modify: `data.js` (add `bodyScoreRepository` after `programRepository`, currently ending around line 368)

- [ ] **Step 1: Extend the client mappers**

In `rowToClient` (currently `data.js:130-143`), add one line inside the returned object, right after `preferredTraining: r.preferred_training || [],`:

```javascript
    trackedBodyAreas: r.tracked_body_areas && r.tracked_body_areas.length ? r.tracked_body_areas : STANDARD_BODY_AREAS,
```

In `clientToRow` (currently `data.js:144-167`), add right after `if ("preferredTraining" in c) row.preferred_training = c.preferredTraining || [];`:

```javascript
  if ("trackedBodyAreas" in c) row.tracked_body_areas = c.trackedBodyAreas && c.trackedBodyAreas.length ? c.trackedBodyAreas : STANDARD_BODY_AREAS;
```

- [ ] **Step 2: Add `bodyScoreRepository`**

Add this after the closing of `programRepository` (currently ends at `data.js:368` with `};`), before the `instantiateProgramExercises` comment block:

```javascript
var bodyScoreRepository = {
  listByClient: function (clientId) {
    return supabase.from("body_scores").select("*").eq("client_id", clientId).then(checkError).then(function (rows) {
      var items = rows.map(rowToBodyScore);
      items.sort(function (a, b) { return a.recordedAt < b.recordedAt ? -1 : a.recordedAt > b.recordedAt ? 1 : 0; });
      return items;
    });
  },
  createMany: function (inputs) {
    if (!inputs || inputs.length === 0) return Promise.resolve([]);
    var rows = inputs.map(function (input) { return bodyScoreToRow(Object.assign({ id: generateId() }, input)); });
    return supabase.from("body_scores").insert(rows).select().then(checkError).then(function (rows) {
      return rows.map(rowToBodyScore);
    }).then(afterWrite);
  },
};
```

This has no automated test in this task — it's a thin pass-through to Supabase, and this app doesn't mock the Supabase client anywhere (same as `sessionRepository`/`goalRepository` today, which also have no unit tests). It's exercised in Task 9's **[MANUAL — needs live Supabase]** pass.

- [ ] **Step 3: Update `blankClient()` in `app.js`**

`app.js` has a `blankClient()` factory (currently around line 440-446). Add one field so new clients get the default tracked areas:

Find:
```javascript
    preferredTraining: [], currentGoal: "", medicalHistory: "", injuriesAndPain: "", precautions: "",
```
Change to:
```javascript
    preferredTraining: [], currentGoal: "", medicalHistory: "", injuriesAndPain: "", precautions: "",
    trackedBodyAreas: STANDARD_BODY_AREAS.slice(),
```

- [ ] **Step 4: Sanity-check by eye (no live DB yet)**

Run: `node -c data.js && node -c app.js`
Expected: no output (both files are syntactically valid JS — `node -c` only checks syntax, it doesn't execute the browser-only code, so this is safe to run even though the files reference `window`).

- [ ] **Step 5: Commit**

```bash
git add data.js app.js
git commit -m "feat: add bodyScoreRepository and clients.trackedBodyAreas"
```

---

### Task 4: `charts.js` — `radarChartPoints` (pure) and `RadarChart` component

**Files:**
- Modify: `charts.js` (add after the existing `CHART_W`/`CHART_H`/`PAD_X` constants at line 3, and after `ProgressRing` at the end of the file, currently line 79)
- Test: `test/charts.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// test/charts.test.js
const assert = require("assert");
const path = require("path");
const { loadScript } = require("./helpers/load-browser-script");

const sandbox = { console: console };
loadScript(path.join(__dirname, "..", "charts.js"), sandbox);

function approx(actual, expected, msg) {
  assert.ok(Math.abs(actual - expected) < 0.5, msg + " (got " + actual + ", expected ~" + expected + ")");
}

// 4 axes all scored at max -> vertices sit exactly on the radius circle,
// starting straight up and going clockwise.
const full = sandbox.radarChartPoints(
  [
    { label: "A", value: 10, max: 10 },
    { label: "B", value: 10, max: 10 },
    { label: "C", value: 10, max: 10 },
    { label: "D", value: 10, max: 10 },
  ],
  100
);
approx(full.axes[0].vx, 100, "axis 0 x"); approx(full.axes[0].vy, 0, "axis 0 y");
approx(full.axes[1].vx, 200, "axis 1 x"); approx(full.axes[1].vy, 100, "axis 1 y");
approx(full.axes[2].vx, 100, "axis 2 x"); approx(full.axes[2].vy, 200, "axis 2 y");
approx(full.axes[3].vx, 0, "axis 3 x");   approx(full.axes[3].vy, 100, "axis 3 y");

// All-zero scores collapse every vertex to the center.
const empty = sandbox.radarChartPoints(
  [
    { label: "A", value: 0, max: 10 },
    { label: "B", value: 0, max: 10 },
    { label: "C", value: 0, max: 10 },
  ],
  100
);
empty.axes.forEach(function (a) { approx(a.vx, 100, "zero-score x"); approx(a.vy, 100, "zero-score y"); });

console.log("charts.test.js: all assertions passed");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test/charts.test.js`
Expected: `TypeError: sandbox.radarChartPoints is not a function`

- [ ] **Step 3: Add `radarChartPoints`, `ringPolygon`, and `RadarChart` to `charts.js`**

Add after the `CHART_W`/`CHART_H`/`PAD_X`/`PAD_TOP`/`PAD_BOTTOM` line (currently line 3):

```javascript
/* Pure geometry for an N-axis radar/spider chart. `radius` is the distance
   from center to a value of 1.0 (i.e. value === max). Axis 0 points straight
   up; axes go clockwise. Returns unpadded coordinates (center = radius, radius) —
   RadarChart below adds its own padding for labels. */
function radarChartPoints(data, radius) {
  var n = data.length;
  var center = radius;
  if (n === 0) return { axes: [], center: center };
  var angleStep = (2 * Math.PI) / n;
  var axes = data.map(function (d, i) {
    var angle = -Math.PI / 2 + i * angleStep;
    var max = d.max || 10;
    var ratio = Math.max(0, Math.min(1, d.value / max));
    return {
      label: d.label, value: d.value, angle: angle,
      vx: center + Math.cos(angle) * radius * ratio,
      vy: center + Math.sin(angle) * radius * ratio,
      lx: center + Math.cos(angle) * (radius + 16),
      ly: center + Math.sin(angle) * (radius + 16),
    };
  });
  return { axes: axes, center: center };
}
function ringPolygon(n, radius, center, ratio) {
  var angleStep = (2 * Math.PI) / n;
  var pts = [];
  for (var i = 0; i < n; i++) {
    var angle = -Math.PI / 2 + i * angleStep;
    pts.push((center + Math.cos(angle) * radius * ratio).toFixed(1) + "," + (center + Math.sin(angle) * radius * ratio).toFixed(1));
  }
  return pts.join(" ");
}
```

Add at the end of the file, after `ProgressRing` (currently ends at line 79 with `}`):

```javascript
function RadarChart(props) {
  var data = props.data || [];
  if (data.length < 3) return h("div", { className: "chart-empty" }, "Add at least 3 tracked areas to see the radar chart.");

  var radius = 90, pad = 40;
  var size = radius * 2 + pad * 2;
  var geo = radarChartPoints(data, radius);
  var axes = geo.axes.map(function (a) {
    return Object.assign({}, a, { vx: a.vx + pad, vy: a.vy + pad, lx: a.lx + pad, ly: a.ly + pad });
  });
  var center = geo.center + pad;
  var polygon = axes.map(function (a) { return a.vx.toFixed(1) + "," + a.vy.toFixed(1); }).join(" ");

  return h("svg", { viewBox: "0 0 " + size + " " + size, width: "100%", height: size, role: "img", "aria-label": "Body score radar chart" },
    [0.5, 1].map(function (ratio, i) {
      return h("polygon", {
        key: "ring-" + i, points: ringPolygon(data.length, radius, center, ratio),
        fill: "none", stroke: "var(--separator)", strokeWidth: 1,
        strokeDasharray: ratio < 1 ? "3,3" : undefined,
      });
    }),
    axes.map(function (a, i) {
      var outerX = center + Math.cos(a.angle) * radius, outerY = center + Math.sin(a.angle) * radius;
      return h("line", { key: "spoke-" + i, x1: center, y1: center, x2: outerX, y2: outerY, stroke: "var(--separator)", strokeWidth: 1 });
    }),
    h("polygon", { points: polygon, fill: "var(--accent)", fillOpacity: 0.25, stroke: "var(--accent)", strokeWidth: 2 }),
    axes.map(function (a, i) { return h("circle", { key: "pt-" + i, cx: a.vx, cy: a.vy, r: 2.5, fill: "var(--accent)" }); }),
    axes.map(function (a, i) {
      var anchor = a.lx < center - 4 ? "end" : a.lx > center + 4 ? "start" : "middle";
      return h("text", { key: "label-" + i, x: a.lx, y: a.ly, textAnchor: anchor, dominantBaseline: "middle", fontSize: 10.5, fill: "var(--text-tertiary)" }, a.label);
    })
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node test/charts.test.js`
Expected: `charts.test.js: all assertions passed`

- [ ] **Step 5: Syntax-check the browser-facing render code**

Run: `node -c charts.js`
Expected: no output (valid syntax — `RadarChart` itself isn't executed by this check since it needs `h`/React, but this catches typos).

- [ ] **Step 6: Commit**

```bash
git add charts.js test/charts.test.js
git commit -m "feat: add radarChartPoints (pure) and RadarChart SVG component"
```

---

### Task 5: `body_scores` table and `tracked_body_areas` column (SQL)

**Files:**
- Modify: `supabase/schema.sql` (append before the final "Done." comment block, currently line 159)

- [ ] **Step 1: Add the migration SQL**

Insert before the closing comment block (currently starting at line 159 with `-- ============================================================================\n-- Done. Verify...`):

```sql
-- ----------------------------------------------------------------------------
-- clients.tracked_body_areas — which anatomy areas this client's coach scores
-- ----------------------------------------------------------------------------
alter table clients add column if not exists tracked_body_areas text[] not null default
  array['Core','Lower back','Hips','Hamstring','Shoulder','Cervical spine','Pelvic floor'];

-- ----------------------------------------------------------------------------
-- body_scores — insert-only history of per-area anatomy scores (1-10).
-- Never updated, matching how `sessions` history is treated: every entry is
-- a new row, so a per-area trend can be charted over time.
-- ----------------------------------------------------------------------------
create table if not exists body_scores (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  area text not null,
  score integer not null check (score between 1 and 10),
  source text not null default 'assessment' check (source in ('assessment', 'session')),
  session_id uuid references sessions(id) on delete set null,
  notes text not null default '',
  recorded_at date not null default current_date,
  created_at timestamptz not null default now()
);
create index if not exists body_scores_trainer_idx on body_scores (trainer_id);
create index if not exists body_scores_client_area_idx on body_scores (client_id, area, recorded_at);

alter table body_scores enable row level security;
drop policy if exists "body_scores_owner_all" on body_scores;
create policy "body_scores_owner_all" on body_scores
  for all using (trainer_id = auth.uid()) with check (trainer_id = auth.uid());
```

- [ ] **Step 2: Validate the SQL parses** [MANUAL — needs live Supabase]

There is no local Postgres in this environment to run this against. Once the owner provides a Supabase project, run the entire `supabase/schema.sql` file (it's idempotent — safe to re-run) in that project's SQL Editor and confirm in Table Editor that `body_scores` exists with RLS enabled (shield icon) and `clients` has a new `tracked_body_areas` column.

- [ ] **Step 3: Commit**

```bash
git add supabase/schema.sql
git commit -m "feat: add body_scores table and clients.tracked_body_areas column"
```

---

### Task 6: `app.js` — Body score card in the Progress tab (radar, overall score, breakdown)

**Files:**
- Modify: `app.js:26-36` (data hooks section — add `useBodyScoresForClient`)
- Modify: `app.js:709-743` (`ProgressTab` function)
- Modify: `app.js:745-793` (`ClientProfilePage` — pass `bodyScores` prop to `ProgressTab`)

- [ ] **Step 1: Add the data hook**

Right after `function useSessionsForClient(id) { return useLiveQuery(function () { return id ? sessionRepository.listByClient(id) : []; }, [id]); }` (currently `app.js:30`), add:

```javascript
function useBodyScoresForClient(id) { return useLiveQuery(function () { return id ? bodyScoreRepository.listByClient(id) : []; }, [id]); }
```

- [ ] **Step 2: Wire it into `ClientProfilePage`**

Find (currently `app.js:750-751`):
```javascript
  var sessions = useSessionsForClient(clientId);
  var goals = useGoalsForClient(clientId);
```
Change to:
```javascript
  var sessions = useSessionsForClient(clientId);
  var goals = useGoalsForClient(clientId);
  var bodyScores = useBodyScoresForClient(clientId);
```

Find (currently `app.js:792`):
```javascript
      tab === "progress" && h(ProgressTab, { client: client, sessions: sessions, goals: goals || [] })
```
Change to:
```javascript
      tab === "progress" && h(ProgressTab, { client: client, sessions: sessions, goals: goals || [], bodyScores: bodyScores || [] })
```

- [ ] **Step 3: Rewrite `ProgressTab` to add the Body score card**

Replace the whole `ProgressTab` function (currently `app.js:709-743`) with:

```javascript
function ProgressTab(props) {
  var client = props.client, sessions = props.sessions, goals = props.goals, bodyScores = props.bodyScores || [];
  var chronological = useMemo(function () { return sessions.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; }); }, [sessions]);
  var painPoints = chronological.filter(function (s) { return s.painScore != null; }).map(function (s) { return { label: shortDate(s.date), value: s.painScore }; });
  var rpePoints = chronological.filter(function (s) { return s.rpe != null; }).map(function (s) { return { label: shortDate(s.date), value: s.rpe }; });
  var attendanceByMonth = useMemo(function () {
    var map = {};
    chronological.forEach(function (s) { var k = monthKey(s.date); map[k] = (map[k] || 0) + 1; });
    var keys = Object.keys(map).sort().slice(-6);
    return keys.map(function (k) { return { label: monthLabel(k), value: map[k] }; });
  }, [chronological]);
  var sessionsOverTime = chronological.map(function (s, i) { return { label: shortDate(s.date), value: i + 1 }; });

  var trackedAreas = client.trackedBodyAreas && client.trackedBodyAreas.length ? client.trackedBodyAreas : STANDARD_BODY_AREAS;
  var latestByArea = useMemo(function () { return latestScoresByArea(bodyScores); }, [bodyScores]);
  var scoredAreas = trackedAreas.filter(function (a) { return latestByArea[a]; });
  var overallScore = scoredAreas.length
    ? scoredAreas.reduce(function (sum, a) { return sum + latestByArea[a].score; }, 0) / scoredAreas.length
    : null;
  var radarData = trackedAreas.map(function (area) {
    var entry = latestByArea[area];
    return { label: area, value: entry ? entry.score : 0, max: 10 };
  });

  var _aa = useState(false), assessmentOpen = _aa[0], setAssessmentOpen = _aa[1];
  var _ma = useState(false), manageAreasOpen = _ma[0], setManageAreasOpen = _ma[1];
  var _ta = useState(trackedAreas[0] || ""), trendArea = _ta[0], setTrendArea = _ta[1];
  var trendData = bodyScores.filter(function (s) { return s.area === trendArea; })
    .map(function (s) { return { label: shortDate(s.recordedAt), value: s.score }; });

  return h("div", { className: "stack" },
    h("div", { className: "chart-card" },
      h("div", { className: "flex-between", style: { marginBottom: 10 } },
        h("div", null,
          h("div", { className: "chart-title" }, "Body score"),
          h("div", { className: "chart-subtitle" }, scoredAreas.length ? "Overall " + overallScore.toFixed(1) + "/10" : "No assessments yet")
        ),
        h("div", { className: "flex-row gap-8" },
          h(Button, { type: "button", variant: "text", size: "sm", onClick: function () { setManageAreasOpen(true); } }, "Manage areas"),
          h(Button, { type: "button", variant: "secondary", size: "sm", onClick: function () { setAssessmentOpen(true); } }, "New assessment")
        )
      ),
      scoredAreas.length === 0
        ? h(EmptyState, { icon: h(TargetIcon, { width: 32, height: 32 }), title: "No assessments yet", message: "Run the first body-score assessment to see the radar chart." })
        : h(React.Fragment, null,
            h(RadarChart, { data: radarData }),
            h("div", { className: "stack", style: { gap: 6, marginTop: 12 } },
              trackedAreas.map(function (area) {
                var entry = latestByArea[area];
                var score = entry ? entry.score : 0;
                return h("div", { key: area, className: "flex-between", style: { fontSize: 13 } },
                  h("span", null, area),
                  h("div", { className: "flex-row gap-8", style: { alignItems: "center" } },
                    h("div", { style: { width: 80, height: 6, background: "var(--pill-bg)", borderRadius: 3, overflow: "hidden" } },
                      h("div", { style: { width: (score / 10 * 100) + "%", height: "100%", background: "var(--accent)" } })
                    ),
                    h("span", { className: "text-secondary" }, entry ? score + "/10" : "—")
                  )
                );
              })
            )
          )
    ),
    trackedAreas.length > 0 && h("div", { className: "chart-card" },
      h("div", { className: "flex-between", style: { marginBottom: 8, alignItems: "flex-end" } },
        h("div", null, h("div", { className: "chart-title" }, "Body score trend"), h("div", { className: "chart-subtitle" }, "One area over time")),
        h("div", { style: { minWidth: 160 } },
          h(SelectField, { label: "Area", value: trendArea, onChange: function (e) { setTrendArea(e.target.value); } },
            trackedAreas.map(function (a) { return h("option", { key: a, value: a }, a); }))
        )
      ),
      h(LineChart, { data: trendData, yMin: 1, yMax: 10, formatValue: function (v) { return v + "/10"; } })
    ),
    h(AssessmentModal, { open: assessmentOpen, client: client, areas: trackedAreas, onClose: function () { setAssessmentOpen(false); } }),
    h(ManageAreasModal, { open: manageAreasOpen, client: client, onClose: function () { setManageAreasOpen(false); } }),
    h("div", { className: "chart-card" }, h("div", { className: "chart-title" }, "Sessions over time"), h("div", { className: "chart-subtitle" }, "Cumulative sessions completed"), h(LineChart, { data: sessionsOverTime, formatValue: function (v) { return "" + v; } })),
    h("div", { className: "chart-card" }, h("div", { className: "chart-title" }, "Session attendance"), h("div", { className: "chart-subtitle" }, "Sessions per month (last 6 months)"), h(BarChart, { data: attendanceByMonth })),
    h("div", { className: "chart-card" }, h("div", { className: "chart-title" }, "Pain score over time"), h("div", { className: "chart-subtitle" }, "0 (none) – 10 (severe)"), h(LineChart, { data: painPoints, color: "var(--danger)", yMin: 0, yMax: 10, formatValue: function (v) { return v + "/10"; } })),
    h("div", { className: "chart-card" }, h("div", { className: "chart-title" }, "RPE over time"), h("div", { className: "chart-subtitle" }, "Rate of perceived exertion, 1–10"), h(LineChart, { data: rpePoints, color: "var(--info)", yMin: 1, yMax: 10, formatValue: function (v) { return v + "/10"; } })),
    h("div", { className: "chart-card" },
      h("div", { className: "chart-title" }, "Goal progress"),
      h("div", { className: "chart-subtitle" }, "Status across the four goal horizons"),
      h("div", { className: "flex-row wrap", style: { justifyContent: "space-around", gap: 16 } },
        GOAL_TIMEFRAMES.map(function (tf) {
          var goal = goals.filter(function (g) { return g.timeframe === tf; })[0];
          var status = goal ? goal.status : "Not started";
          return h("div", { key: tf, style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 6 } },
            h(ProgressRing, { percent: STATUS_PERCENT[status] }),
            h("span", { style: { fontSize: 12, fontWeight: 700 } }, tf),
            h("span", { className: "text-secondary", style: { fontSize: 11 } }, status)
          );
        })
      )
    )
  );
}
```

(This is the original `ProgressTab` body with the new Body-score and trend cards inserted at the top — the five pre-existing charts below are unchanged.)

- [ ] **Step 4: Syntax-check**

Run: `node -c app.js`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add app.js
git commit -m "feat: add body score radar card and trend chart to Progress tab"
```

---

### Task 7: `app.js` — `AssessmentModal` and `ManageAreasModal`

**Files:**
- Modify: `app.js` (add both components right before `function ProgressTab` — search for `var STATUS_PERCENT = {` which is the line directly above `ProgressTab`, currently `app.js:705`)

- [ ] **Step 1: Add the two modal components**

Insert directly above `function ProgressTab(props) {`:

```javascript
function AssessmentModal(props) {
  var open = props.open, client = props.client, areas = props.areas;
  var _s = useState({}), scores = _s[0], setScores = _s[1];
  var _n = useState(""), notes = _n[0], setNotes = _n[1];
  var _sv = useState(false), saving = _sv[0], setSaving = _sv[1];

  useEffect(function () { if (open) { setScores({}); setNotes(""); } }, [open]);
  if (!open) return null;

  function setScore(area, value) {
    setScores(function (s) { var next = Object.assign({}, s); next[area] = value; return next; });
  }
  function handleSave() {
    var today = todayIso();
    var inputs = areas.filter(function (a) { return scores[a] != null && scores[a] !== ""; })
      .map(function (a) { return { clientId: client.id, area: a, score: Number(scores[a]), source: "assessment", recordedAt: today, notes: notes }; });
    if (inputs.length === 0) { props.onClose(); return; }
    setSaving(true);
    bodyScoreRepository.createMany(inputs).then(function () { props.onClose(); }).finally(function () { setSaving(false); });
  }

  return h("div", { className: "modal-overlay", onClick: props.onClose },
    h("div", { className: "modal-sheet", role: "dialog", "aria-modal": "true", onClick: function (e) { e.stopPropagation(); } },
      h("div", { className: "modal-title" }, "New assessment"),
      h("div", { className: "stack", style: { marginBottom: 14 } },
        areas.map(function (area) {
          return h(TextField, {
            key: area, label: area, type: "number", min: 1, max: 10, inputMode: "numeric", optional: true,
            value: scores[area] == null ? "" : scores[area],
            onChange: function (e) { setScore(area, e.target.value); },
          });
        }),
        h(TextAreaField, { label: "Notes", optional: true, value: notes, onChange: function (e) { setNotes(e.target.value); } })
      ),
      h("div", { className: "modal-actions" },
        h(Button, { type: "button", variant: "secondary", className: "btn-block", onClick: props.onClose }, "Cancel"),
        h(Button, { type: "button", className: "btn-block", onClick: handleSave, disabled: saving }, saving ? "Saving…" : "Save assessment")
      )
    )
  );
}
function ManageAreasModal(props) {
  var open = props.open, client = props.client;
  var _a = useState(client.trackedBodyAreas || STANDARD_BODY_AREAS), areas = _a[0], setAreas = _a[1];
  var _c = useState(""), customArea = _c[0], setCustomArea = _c[1];
  var _sv = useState(false), saving = _sv[0], setSaving = _sv[1];

  useEffect(function () { if (open) { setAreas(client.trackedBodyAreas || STANDARD_BODY_AREAS); setCustomArea(""); } }, [open, client]);
  if (!open) return null;

  var allOptions = STANDARD_BODY_AREAS.concat(areas.filter(function (a) { return STANDARD_BODY_AREAS.indexOf(a) === -1; }));

  function addCustom() {
    var v = customArea.trim();
    if (!v || areas.indexOf(v) !== -1) return;
    setAreas(areas.concat([v]));
    setCustomArea("");
  }
  function handleSave() {
    setSaving(true);
    clientRepository.update(client.id, { trackedBodyAreas: areas }).then(function () { props.onClose(); }).finally(function () { setSaving(false); });
  }

  return h("div", { className: "modal-overlay", onClick: props.onClose },
    h("div", { className: "modal-sheet", role: "dialog", "aria-modal": "true", onClick: function (e) { e.stopPropagation(); } },
      h("div", { className: "modal-title" }, "Manage tracked areas"),
      h(MultiSelectChips, { label: "Tracked areas", options: allOptions, value: areas, onChange: setAreas }),
      h("div", { className: "flex-row gap-8", style: { marginBottom: 14, marginTop: 10 } },
        h("input", {
          className: "input", placeholder: "Add a custom area", value: customArea,
          onChange: function (e) { setCustomArea(e.target.value); },
          onKeyDown: function (e) { if (e.key === "Enter") { e.preventDefault(); addCustom(); } },
        }),
        h(Button, { type: "button", variant: "secondary", onClick: addCustom }, "Add")
      ),
      h("div", { className: "modal-actions" },
        h(Button, { type: "button", variant: "secondary", className: "btn-block", onClick: props.onClose }, "Cancel"),
        h(Button, { type: "button", className: "btn-block", onClick: handleSave, disabled: saving }, saving ? "Saving…" : "Save")
      )
    )
  );
}
```

- [ ] **Step 2: Syntax-check**

Run: `node -c app.js`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add app.js
git commit -m "feat: add AssessmentModal and ManageAreasModal components"
```

---

### Task 8: `app.js` — optional "Update body scores" section in the session form

**Files:**
- Modify: `app.js` (`SessionFormPage`, currently starting at line 808)

- [ ] **Step 1: Add state**

Find (currently `app.js:816-819`):
```javascript
  var _cd = useState(false), confirmDeleteOpen = _cd[0], setConfirmDeleteOpen = _cd[1];
```
Add directly after it:
```javascript
  var _bso = useState(false), bodyScoresOpen = _bso[0], setBodyScoresOpen = _bso[1];
  var _bsd = useState({}), bodyScoreDraft = _bsd[0], setBodyScoreDraft = _bsd[1];
  function setDraftScore(area, value) { setBodyScoreDraft(function (d) { var next = Object.assign({}, d); next[area] = value; return next; }); }
```

- [ ] **Step 2: Save body scores after the session saves**

Find `handleSubmit` (currently `app.js:866-872`):
```javascript
  function handleSubmit(e) {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    var p = mode === "create" ? sessionRepository.create(form) : sessionRepository.update(props.sessionId, form);
    p.then(function (result) { navigate("/sessions/" + (mode === "create" ? result.id : props.sessionId)); }).finally(function () { setSaving(false); });
  }
```
Replace with:
```javascript
  function handleSubmit(e) {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    var p = mode === "create" ? sessionRepository.create(form) : sessionRepository.update(props.sessionId, form);
    p.then(function (result) {
      var sessionId = mode === "create" ? result.id : props.sessionId;
      var trackedAreas = client && client.trackedBodyAreas ? client.trackedBodyAreas : [];
      var scoreInputs = trackedAreas.filter(function (a) { return bodyScoreDraft[a] != null && bodyScoreDraft[a] !== ""; })
        .map(function (a) { return { clientId: form.clientId, area: a, score: Number(bodyScoreDraft[a]), source: "session", sessionId: sessionId, recordedAt: form.date, notes: "" }; });
      var scoreSave = scoreInputs.length ? bodyScoreRepository.createMany(scoreInputs) : Promise.resolve();
      return scoreSave.then(function () { navigate("/sessions/" + sessionId); });
    }).finally(function () { setSaving(false); });
  }
```

- [ ] **Step 3: Add the collapsible UI section**

Find the "Client response" fieldset's closing (currently `app.js:909-916`, ending with `),` right before the "Session notes" fieldset at `app.js:917`). Insert a new fieldset between them:

```javascript
        client && client.trackedBodyAreas && client.trackedBodyAreas.length > 0 && h("fieldset", { className: "form-group" },
          h("legend", null,
            h("button", {
              type: "button", className: "btn-text", style: { fontWeight: 700 },
              onClick: function () { setBodyScoresOpen(!bodyScoresOpen); },
            }, (bodyScoresOpen ? "Hide" : "Update") + " body scores")
          ),
          bodyScoresOpen && h("div", { className: "form-grid-2" },
            client.trackedBodyAreas.map(function (area) {
              return h(TextField, {
                key: area, label: area, type: "number", min: 1, max: 10, inputMode: "numeric", optional: true,
                value: bodyScoreDraft[area] == null ? "" : bodyScoreDraft[area],
                onChange: function (e) { setDraftScore(area, e.target.value); },
              });
            })
          )
        ),
```

- [ ] **Step 4: Syntax-check**

Run: `node -c app.js`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add app.js
git commit -m "feat: add optional body-score entry to the session log form"
```

---

### Task 9: Live verification pass [MANUAL — needs live Supabase]

**Files:** none (verification only)

- [ ] **Step 1:** Once the owner supplies a real Supabase project URL + anon key, put them in `config.js` (replacing the placeholder `window.SUPABASE_URL` / `window.SUPABASE_ANON_KEY` values).
- [ ] **Step 2:** Run `supabase/schema.sql` in that project's SQL Editor.
- [ ] **Step 3:** Serve the app locally (e.g. `npx serve .` or any static file server) and open it in the browser preview.
- [ ] **Step 4:** The owner signs in once (their own credentials — not entered by the agent).
- [ ] **Step 5:** Click through: open a client → Progress tab → confirm the empty state shows → "New assessment" → enter scores for a few areas → Save → confirm the radar chart, overall score, and bar list all populate → pick an area in "Body score trend" → confirm the line chart shows one point.
- [ ] **Step 6:** Log a new session for the same client → expand "Update body scores" → enter a different score for one area → Save → return to Progress tab → confirm that area's radar value and trend chart updated.
- [ ] **Step 7:** Reload the page entirely → confirm all of the above persisted (proves it round-tripped through Supabase, not just local React state).
- [ ] **Step 8:** "Manage areas" → remove one area, add a custom one → Save → confirm the radar chart and forms reflect the new list.

---

### Task 10: Supabase keep-alive GitHub Actions workflow

**Files:**
- Create: `.github/workflows/supabase-keepalive.yml`

- [ ] **Step 1: Write the workflow**

```yaml
name: Supabase keep-alive

on:
  schedule:
    - cron: "0 6 */3 * *"
  workflow_dispatch: {}

jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - name: Ping Supabase REST endpoint
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}
        run: |
          curl -sf "${SUPABASE_URL}/rest/v1/clients?select=id&limit=1" \
            -H "apikey: ${SUPABASE_ANON_KEY}" \
            -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
            -o /dev/null
```

Runs every 3 days plus on-demand (`workflow_dispatch`, so the owner can click "Run workflow" in the GitHub UI to test it immediately). The request has no user JWT, so Row Level Security will return zero rows — that's fine and expected; a `200 OK` (which `curl -f` requires, or it exits non-zero and fails the job) is activity against the project's database either way, which is what prevents the free-tier auto-pause.

- [ ] **Step 2: Add the two repository secrets** [MANUAL — needs live Supabase]

Once the Supabase project exists: on GitHub, go to the `pilatestribedxb` repo → Settings → Secrets and variables → Actions → New repository secret, and add `SUPABASE_URL` and `SUPABASE_ANON_KEY` with the real values.

- [ ] **Step 3: Validate the YAML syntax**

Run: `node -e "JSON.stringify(require('fs').readFileSync('.github/workflows/supabase-keepalive.yml','utf8'))"`

This just confirms the file reads as valid UTF-8 text; there's no YAML parser installed in this project. Real validation happens in Step 4.

- [ ] **Step 4: Trigger it manually once secrets are set** [MANUAL — needs live Supabase]

On GitHub: Actions tab → "Supabase keep-alive" → "Run workflow". Confirm the run succeeds (green check). A failure most likely means the secret values are wrong or the project URL is missing its `https://` scheme.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/supabase-keepalive.yml
git commit -m "ci: add Supabase keep-alive workflow to prevent free-tier auto-pause"
```

---

### Task 11: Push to GitHub

**Files:** none (git operations only)

- [ ] **Step 1: Push all commits from this plan**

```bash
git push origin main
```

- [ ] **Step 2: Confirm on GitHub**

Visit https://github.com/saurabh28/pilatestribedxb and confirm the new commits, `.github/workflows/supabase-keepalive.yml`, and `test/` folder are all present.
