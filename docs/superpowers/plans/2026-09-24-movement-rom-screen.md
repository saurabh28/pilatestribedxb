# PilatesTribe Movement & ROM Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Digitize the owner's paper movement-screening sheet as a PilatesTribe-branded, config-driven feature: an intake form, pure scoring logic, and a premium client-facing results report with two overlaid radar charts and corrective exercises.

**Architecture:** A new config file (`movementScreen.js`) holds the test list and corrective-exercise library as plain data plus pure scoring functions (Node-testable, zero Supabase dependency). A new `movement_screens` table stores one JSONB row per screening event. `RadarChart` gains optional multi-series overlay support (backward compatible with its existing single-series body-score usage). A new "Screening" tab on the client profile shows the results report; a new full-page form (matching the existing `SessionFormPage` pattern) handles intake.

**Tech Stack:** Same as the rest of the app — vanilla JS, React 18 UMD (`h`), Supabase JS v2, dependency-free inline SVG. Tests via the existing `test/helpers/load-browser-script.js` Node harness.

**Reference:** `docs/superpowers/specs/2026-09-24-movement-rom-screen-design.md`

---

### Task 1: `movementScreen.js` — test config, corrective library, and pure scoring functions

**Files:**
- Create: `movementScreen.js`
- Test: `test/movementScreen.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// test/movementScreen.test.js
const assert = require("assert");
const path = require("path");
const { loadScript } = require("./helpers/load-browser-script");

const sandbox = { console: console };
loadScript(path.join(__dirname, "..", "movementScreen.js"), sandbox);

// Config shape
assert.ok(Array.isArray(sandbox.MOVEMENT_TESTS) && sandbox.MOVEMENT_TESTS.length === 6, "6 movement tests");
assert.ok(Array.isArray(sandbox.ROM_TESTS) && sandbox.ROM_TESTS.length === 5, "5 ROM tests");
sandbox.MOVEMENT_TESTS.concat(sandbox.ROM_TESTS).forEach(function (t) {
  assert.ok(t.id && t.label && t.maxScore, "test " + JSON.stringify(t) + " has id/label/maxScore");
  assert.ok(Array.isArray(t.corrective) && t.corrective.length >= 2 && t.corrective.length <= 3, t.id + " has 2-3 corrective exercises");
  t.corrective.forEach(function (ex) {
    assert.ok(ex.name && ex.sets && ex.cue, t.id + " exercise missing name/sets/cue: " + JSON.stringify(ex));
  });
});
var deadHang = sandbox.MOVEMENT_TESTS.filter(function (t) { return t.id === "deadHang"; })[0];
assert.ok(deadHang && deadHang.timedHang === true, "deadHang is marked timedHang");

// deadHangScoreFromSeconds
assert.strictEqual(sandbox.deadHangScoreFromSeconds(65, false), 3);
assert.strictEqual(sandbox.deadHangScoreFromSeconds(45, false), 2);
assert.strictEqual(sandbox.deadHangScoreFromSeconds(15, false), 1);
assert.strictEqual(sandbox.deadHangScoreFromSeconds(5, false), 0);
assert.strictEqual(sandbox.deadHangScoreFromSeconds(65, true), 0, "pain always scores 0 regardless of hold time");
assert.strictEqual(sandbox.deadHangScoreFromSeconds(null, false), null, "no time recorded yet");

// computeReadinessScore: all-max = 100, all-zero = 0, known partial case
var allMaxMovement = { overheadSquat: 3, walkingLunges: 3, stepDown: 3, deadHang: 3, thomasTest: 3, pslr: 3 };
var allMaxRom = {
  ankleDorsiflexion: { left: 2, right: 2 }, hipInternalRotation: { left: 2, right: 2 },
  hipExternalRotation: { left: 2, right: 2 }, shoulderInternalRotation: { left: 2, right: 2 },
  shoulderExternalRotation: { left: 2, right: 2 },
};
assert.strictEqual(sandbox.computeReadinessScore(allMaxMovement, allMaxRom), 100);

var allZeroMovement = { overheadSquat: 0, walkingLunges: 0, stepDown: 0, deadHang: 0, thomasTest: 0, pslr: 0 };
var allZeroRom = {
  ankleDorsiflexion: { left: 0, right: 0 }, hipInternalRotation: { left: 0, right: 0 },
  hipExternalRotation: { left: 0, right: 0 }, shoulderInternalRotation: { left: 0, right: 0 },
  shoulderExternalRotation: { left: 0, right: 0 },
};
assert.strictEqual(sandbox.computeReadinessScore(allZeroMovement, allZeroRom), 0);

// Movement max total = 6*3=18, ROM max total = 5*2*2=20, combined max = 38.
// One test at 0 (overheadSquat), rest max: (18-3+20)/38 = 35/38 = 92.1% -> rounds to 92.
var partialMovement = Object.assign({}, allMaxMovement, { overheadSquat: 0 });
assert.strictEqual(sandbox.computeReadinessScore(partialMovement, allMaxRom), 92);

// computeOverallResult
assert.strictEqual(sandbox.computeOverallResult(allMaxMovement, allMaxRom), "green");
assert.strictEqual(sandbox.computeOverallResult(partialMovement, allMaxRom), "red", "any 0 score means red");
var oneMinorCompensation = Object.assign({}, allMaxMovement, { walkingLunges: 2 });
assert.strictEqual(sandbox.computeOverallResult(oneMinorCompensation, allMaxRom), "amber", "below max but no zero means amber");
var oneSidedRom = Object.assign({}, allMaxRom, { hipInternalRotation: { left: 2, right: 1 } });
assert.strictEqual(sandbox.computeOverallResult(allMaxMovement, oneSidedRom), "amber", "left/right imbalance means amber even with no zero");

console.log("movementScreen.test.js: all assertions passed");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test/movementScreen.test.js`
Expected: `Cannot find module '.../movementScreen.js'` (file doesn't exist yet).

- [ ] **Step 3: Create `movementScreen.js`**

```javascript
// movementScreen.js
/* Config-driven test list for the Movement & ROM Screen. Add, remove, or
   edit a test by editing these two arrays only -- nothing elsewhere in the
   app hardcodes a test id, so the list can keep changing without a schema
   or code change. Flagged for a physio/senior coach review before relying
   on this with real clients: the corrective exercises and score thresholds
   below are a reasonable first pass, not clinically validated. */

var MOVEMENT_TESTS = [
  { id: "overheadSquat", label: "Overhead Squat", maxScore: 3,
    corrective: [
      { name: "Wall-facing squat", sets: "3x8", cue: "Nose to wall, sit back without losing wall contact." },
      { name: "Ankle dorsiflexion rocks", sets: "2x10/side", cue: "Drive knee forward over toes, heel stays down." },
      { name: "Dead bug", sets: "3x8/side", cue: "Press low back flat into the floor throughout." },
    ] },
  { id: "walkingLunges", label: "Walking Lunges", maxScore: 3,
    corrective: [
      { name: "Reverse lunge to balance", sets: "3x8/side", cue: "Control the descent, drive through the front heel to stand." },
      { name: "Standing hip flexor stretch", sets: "2x30s/side", cue: "Squeeze the back glute, keep ribs stacked over the pelvis." },
      { name: "Single-leg RDL", sets: "3x8/side", cue: "Hinge from the hip, keep the back flat, light touch down only." },
    ] },
  { id: "stepDown", label: "Step-Down Test", maxScore: 3,
    corrective: [
      { name: "Slow tempo step-downs", sets: "3x8/side", cue: "4-second lower, don't let the knee cave inward." },
      { name: "Single-leg glute bridge", sets: "3x10/side", cue: "Drive through the heel, squeeze the glute at the top." },
      { name: "Lateral band walks", sets: "2x10 steps/direction", cue: "Stay low, keep tension on the band throughout." },
    ] },
  { id: "deadHang", label: "Dead Hang", maxScore: 3, timedHang: true,
    corrective: [
      { name: "Dead hang holds", sets: "3x max hold", cue: "Relax shoulders down, breathe steadily through the hold." },
      { name: "Scapular pull-ups", sets: "3x8", cue: "Pull the shoulder blades down and together without bending the elbows." },
      { name: "Farmer's carry", sets: "3x30m", cue: "Brace the core, keep shoulders packed, avoid leaning to one side." },
    ] },
  { id: "thomasTest", label: "Thomas Test (Hip Flexor Length)", maxScore: 3,
    corrective: [
      { name: "Half-kneeling hip flexor stretch", sets: "2x30s/side", cue: "Tuck the pelvis under, squeeze the glute on the down knee." },
      { name: "Couch stretch", sets: "2x30s/side", cue: "Keep hips square, ease in only as far as comfortable." },
      { name: "Glute bridge march", sets: "3x8/side", cue: "Keep hips level as you lift each foot." },
    ] },
  { id: "pslr", label: "PSLR (Passive Straight Leg Raise)", maxScore: 3,
    corrective: [
      { name: "Supine hamstring stretch with strap", sets: "2x30s/side", cue: "Keep the raised leg straight, gently pull without bouncing." },
      { name: "Assisted Nordic curl eccentrics", sets: "2x6", cue: "Lower as slowly as control allows." },
      { name: "Standing hamstring floss", sets: "2x10/side", cue: "Hinge hips back, keep the spine neutral." },
    ] },
];

var ROM_TESTS = [
  { id: "ankleDorsiflexion", label: "Ankle to Wall (Dorsiflexion)", maxScore: 2, normative: "≥ 10 cm",
    corrective: [
      { name: "Knee-to-wall stretch", sets: "3x10/side", cue: "Keep the heel flat, tap the knee to the wall and back." },
      { name: "Banded ankle mobilization", sets: "2x10/side", cue: "Drive the knee forward against band tension, heel stays down." },
      { name: "Slow-eccentric calf raises", sets: "3x12", cue: "3-second lower on every rep." },
    ] },
  { id: "hipInternalRotation", label: "Hip Internal Rotation", maxScore: 2, normative: "30–40°",
    corrective: [
      { name: "90/90 seated hip switches", sets: "3x8/direction", cue: "Keep the chest tall, lead with the hip not the knee." },
      { name: "90/90 internal rotation lift-offs", sets: "2x10/side", cue: "Lift the back foot without letting the front knee move." },
      { name: "Supine windshield wipers", sets: "2x10/side", cue: "Move slow and controlled, stop at the first resistance." },
    ] },
  { id: "hipExternalRotation", label: "Hip External Rotation", maxScore: 2, normative: "40–60°",
    corrective: [
      { name: "Seated figure-4 stretch", sets: "2x30s/side", cue: "Keep the back straight, gently lean forward from the hips." },
      { name: "Clamshells", sets: "3x12/side", cue: "Keep feet together, rotate from the hip not the low back." },
      { name: "90/90 external rotation lift-offs", sets: "2x10/side", cue: "Lift the front shin while keeping the back hip down." },
    ] },
  { id: "shoulderInternalRotation", label: "Shoulder Internal Rotation", maxScore: 2, normative: "60–70°",
    corrective: [
      { name: "Sleeper stretch", sets: "2x30s/side", cue: "Keep the shoulder pinned down, gently press the forearm toward the floor." },
      { name: "Towel behind-back reach", sets: "2x10/side", cue: "Use the top hand to gently assist, stop at tension not pain." },
      { name: "Band internal rotation", sets: "3x12/side", cue: "Keep the elbow pinned to your side throughout." },
    ] },
  { id: "shoulderExternalRotation", label: "Shoulder External Rotation", maxScore: 2, normative: "90–100°",
    corrective: [
      { name: "Band external rotation", sets: "3x12/side", cue: "Keep the elbow pinned to your side, rotate from the shoulder." },
      { name: "Doorway pec stretch", sets: "2x30s", cue: "Step through gently until you feel a stretch across the chest." },
      { name: "Prone Y-raises", sets: "3x10", cue: "Lead with the thumbs up, squeeze the shoulder blades together." },
    ] },
];

function deadHangScoreFromSeconds(seconds, hadPain) {
  if (hadPain) return 0;
  if (seconds == null) return null;
  if (seconds >= 60) return 3;
  if (seconds >= 30) return 2;
  if (seconds >= 10) return 1;
  return 0;
}

function computeReadinessScore(movementScores, romScores) {
  var earned = 0, max = 0;
  MOVEMENT_TESTS.forEach(function (t) {
    var v = movementScores[t.id];
    if (v == null) return;
    earned += v; max += t.maxScore;
  });
  ROM_TESTS.forEach(function (t) {
    var v = romScores[t.id];
    if (!v) return;
    if (v.left != null) { earned += v.left; max += t.maxScore; }
    if (v.right != null) { earned += v.right; max += t.maxScore; }
  });
  if (max === 0) return 0;
  return Math.round((earned / max) * 100);
}

function computeOverallResult(movementScores, romScores) {
  var hasZero = false, hasBelowMax = false;
  MOVEMENT_TESTS.forEach(function (t) {
    var v = movementScores[t.id];
    if (v == null) return;
    if (v === 0) hasZero = true;
    if (v < t.maxScore) hasBelowMax = true;
  });
  ROM_TESTS.forEach(function (t) {
    var v = romScores[t.id];
    if (!v) return;
    [v.left, v.right].forEach(function (side) {
      if (side == null) return;
      if (side === 0) hasZero = true;
      if (side < t.maxScore) hasBelowMax = true;
    });
  });
  if (hasZero) return "red";
  if (hasBelowMax) return "amber";
  return "green";
}

var RESULT_INTERPRETATION = {
  green: "Cleared for full training",
  amber: "Train with corrective focus",
  red: "Corrective phase before loading",
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node test/movementScreen.test.js`
Expected: `movementScreen.test.js: all assertions passed`

- [ ] **Step 5: Commit**

```bash
git add movementScreen.js test/movementScreen.test.js
git commit -m "feat: add config-driven movement/ROM test list and scoring functions"
```

---

### Task 2: Database — `movement_screens` table

**Files:**
- Modify: `supabase/schema.sql` (append before the final "Done." comment block)

- [ ] **Step 1: Add the table, indexes, RLS policy, and grants**

```sql
-- ----------------------------------------------------------------------------
-- movement_screens -- one row per Movement & ROM screening event. Scores are
-- stored as JSONB keyed by test id (from movementScreen.js), never as fixed
-- columns, so the test list can keep changing without a migration.
-- ----------------------------------------------------------------------------
create table if not exists movement_screens (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  screened_at date not null default current_date,
  movement_scores jsonb not null default '{}'::jsonb,
  rom_scores jsonb not null default '{}'::jsonb,
  overall_result text not null check (overall_result in ('green','amber','red')),
  readiness_score integer not null check (readiness_score between 0 and 100),
  notes text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists movement_screens_trainer_idx on movement_screens (trainer_id);
create index if not exists movement_screens_client_date_idx on movement_screens (client_id, screened_at);

alter table movement_screens enable row level security;
drop policy if exists "movement_screens_owner_all" on movement_screens;
create policy "movement_screens_owner_all" on movement_screens
  for all using (trainer_id = auth.uid()) with check (trainer_id = auth.uid());

grant select, insert, update, delete on public.movement_screens to anon, authenticated;
```

(This repeats the `grant` statement rather than editing the earlier combined one, so the file stays append-only and idempotent the same way the rest of it is.)

- [ ] **Step 2: Apply it** [MANUAL — owner runs this in the Supabase SQL Editor]

Paste the new block (or the whole file, it's idempotent) into the SQL Editor for the live project and run it. Verify with:

```bash
curl -s -o /dev/null -w "%{http_code}\n" "https://otwuisvpbpecknnysviz.supabase.co/rest/v1/movement_screens?select=id&limit=1" -H "apikey: sb_publishable_OsByYkLMM2MmuBsyoufReA_JmKCsHMz" -H "Authorization: Bearer sb_publishable_OsByYkLMM2MmuBsyoufReA_JmKCsHMz"
```

Expected: `200` (not `401`/`404`).

- [ ] **Step 3: Commit**

```bash
git add supabase/schema.sql
git commit -m "feat: add movement_screens table"
```

---

### Task 3: `data.js` — `movementScreenRepository`

**Files:**
- Modify: `data.js` (add after `bodyScoreRepository`, which currently ends with the `remove` method)

- [ ] **Step 1: Add mappers and the repository**

```javascript
function rowToMovementScreen(r) {
  if (!r) return r;
  return {
    id: r.id, trainerId: r.trainer_id, clientId: r.client_id, screenedAt: r.screened_at,
    movementScores: r.movement_scores || {}, romScores: r.rom_scores || {},
    overallResult: r.overall_result, readinessScore: r.readiness_score,
    notes: r.notes || "", createdAt: r.created_at,
  };
}
function movementScreenToRow(s) {
  var row = {};
  if ("id" in s) row.id = s.id;
  if ("clientId" in s) row.client_id = s.clientId;
  if ("screenedAt" in s) row.screened_at = s.screenedAt;
  if ("movementScores" in s) row.movement_scores = s.movementScores || {};
  if ("romScores" in s) row.rom_scores = s.romScores || {};
  if ("overallResult" in s) row.overall_result = s.overallResult;
  if ("readinessScore" in s) row.readiness_score = s.readinessScore;
  if ("notes" in s) row.notes = s.notes || "";
  return row;
}
var movementScreenRepository = {
  listByClient: function (clientId) {
    return supabase.from("movement_screens").select("*").eq("client_id", clientId).then(checkError).then(function (rows) {
      var items = rows.map(rowToMovementScreen);
      items.sort(function (a, b) { return a.screenedAt < b.screenedAt ? -1 : a.screenedAt > b.screenedAt ? 1 : 0; });
      return items;
    });
  },
  create: function (input) {
    var row = movementScreenToRow(Object.assign({ id: generateId() }, input));
    return supabase.from("movement_screens").insert(row).select().single().then(checkError).then(rowToMovementScreen).then(afterWrite);
  },
};
```

- [ ] **Step 2: Syntax-check**

Run: `node -c data.js`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add data.js
git commit -m "feat: add movementScreenRepository"
```

---

### Task 4: `charts.js` — multi-series `RadarChart` (backward compatible)

**Files:**
- Modify: `charts.js` (replace the `RadarChart` function added for body scores)
- Modify: `charts.js` (extend `ProgressRing` with an optional `color` prop)

- [ ] **Step 1: Replace `RadarChart` to support optional `series`**

Find the existing `RadarChart` function (added for the body-score feature) and replace its body so it defaults to the old single-`data` behavior but also accepts a `series` array:

```javascript
function RadarChart(props) {
  var series = props.series;
  if (!series) series = [{ data: props.data || [], color: props.color || "var(--accent)", filled: true }];
  var axisSource = series[0] ? series[0].data : [];
  if (axisSource.length < 3) return h("div", { className: "chart-empty" }, "Add at least 3 tracked areas to see the radar chart.");

  var radius = 90, pad = 40;
  var size = radius * 2 + pad * 2;
  var center = radius + pad;

  var seriesGeo = series.map(function (s) {
    var geo = radarChartPoints(s.data, radius);
    var axes = geo.axes.map(function (a) {
      return Object.assign({}, a, { vx: a.vx + pad, vy: a.vy + pad, lx: a.lx + pad, ly: a.ly + pad });
    });
    var polygon = axes.map(function (a) { return a.vx.toFixed(1) + "," + a.vy.toFixed(1); }).join(" ");
    return { axes: axes, polygon: polygon, color: s.color || "var(--accent)", dashed: !!s.dashed, filled: s.filled !== false };
  });
  var labelAxes = seriesGeo[0].axes;

  return h("svg", { viewBox: "0 0 " + size + " " + size, width: "100%", height: size, role: "img", "aria-label": "Radar chart" },
    [0.5, 1].map(function (ratio, i) {
      return h("polygon", {
        key: "ring-" + i, points: ringPolygon(axisSource.length, radius, center, ratio),
        fill: "none", stroke: "var(--separator)", strokeWidth: 1,
        strokeDasharray: ratio < 1 ? "3,3" : undefined,
      });
    }),
    labelAxes.map(function (a, i) {
      var outerX = center + Math.cos(a.angle) * radius, outerY = center + Math.sin(a.angle) * radius;
      return h("line", { key: "spoke-" + i, x1: center, y1: center, x2: outerX, y2: outerY, stroke: "var(--separator)", strokeWidth: 1 });
    }),
    seriesGeo.map(function (sg, si) {
      return h("polygon", {
        key: "series-" + si, points: sg.polygon,
        fill: sg.filled ? sg.color : "none", fillOpacity: sg.filled ? 0.25 : 0,
        stroke: sg.color, strokeWidth: 2, strokeDasharray: sg.dashed ? "5,4" : undefined,
      });
    }),
    seriesGeo[0].filled && seriesGeo[0].axes.map(function (a, i) { return h("circle", { key: "pt-" + i, cx: a.vx, cy: a.vy, r: 2.5, fill: seriesGeo[0].color }); }),
    labelAxes.map(function (a, i) {
      var anchor = a.lx < center - 4 ? "end" : a.lx > center + 4 ? "start" : "middle";
      return h("text", { key: "label-" + i, x: a.lx, y: a.ly, textAnchor: anchor, dominantBaseline: "middle", fontSize: 10.5, fill: "var(--text-tertiary)" }, a.label);
    })
  );
}
```

This is behavior-identical to the current single-series `RadarChart` when only `data` is passed (the body-score feature's call site is untouched and needs no changes) — `series` defaults to a one-item array built from `data`, so every existing render path is the same, just reached through one extra layer.

- [ ] **Step 2: Add an optional `color` prop to `ProgressRing`**

Find:
```javascript
function ProgressRing(props) {
  var size = props.size || 56, stroke = 6;
  var r = (size - stroke) / 2, c = 2 * Math.PI * r;
  var clamped = Math.max(0, Math.min(100, props.percent));
  return h("svg", { width: size, height: size, viewBox: "0 0 " + size + " " + size, role: "img", "aria-label": Math.round(clamped) + "% complete" },
    h("circle", { cx: size / 2, cy: size / 2, r: r, fill: "none", stroke: "var(--pill-bg)", strokeWidth: stroke }),
    h("circle", {
      cx: size / 2, cy: size / 2, r: r, fill: "none", stroke: "var(--accent)", strokeWidth: stroke,
      strokeDasharray: c, strokeDashoffset: c - (c * clamped) / 100, strokeLinecap: "round",
      transform: "rotate(-90 " + size / 2 + " " + size / 2 + ")",
    }),
    h("text", { x: "50%", y: "52%", textAnchor: "middle", dominantBaseline: "middle", fontSize: size * 0.24, fontWeight: 700, fill: "var(--text)" }, Math.round(clamped) + "%")
  );
}
```
Change to (add a `color` variable, use it in place of the hardcoded `"var(--accent)"` on the progress arc only):
```javascript
function ProgressRing(props) {
  var size = props.size || 56, stroke = 6;
  var color = props.color || "var(--accent)";
  var r = (size - stroke) / 2, c = 2 * Math.PI * r;
  var clamped = Math.max(0, Math.min(100, props.percent));
  return h("svg", { width: size, height: size, viewBox: "0 0 " + size + " " + size, role: "img", "aria-label": Math.round(clamped) + "% complete" },
    h("circle", { cx: size / 2, cy: size / 2, r: r, fill: "none", stroke: "var(--pill-bg)", strokeWidth: stroke }),
    h("circle", {
      cx: size / 2, cy: size / 2, r: r, fill: "none", stroke: color, strokeWidth: stroke,
      strokeDasharray: c, strokeDashoffset: c - (c * clamped) / 100, strokeLinecap: "round",
      transform: "rotate(-90 " + size / 2 + " " + size / 2 + ")",
      className: "readiness-ring-arc",
    }),
    h("text", { x: "50%", y: "52%", textAnchor: "middle", dominantBaseline: "middle", fontSize: size * 0.24, fontWeight: 700, fill: "var(--text)" }, Math.round(clamped) + "%")
  );
}
```

- [ ] **Step 3: Syntax-check and rerun existing tests**

Run: `node -c charts.js && node test/charts.test.js`
Expected: no syntax errors, `charts.test.js: all assertions passed` (the existing `radarChartPoints` tests are untouched by this change, since only the `RadarChart`/`ProgressRing` rendering functions changed, not the pure geometry helper).

- [ ] **Step 4: Commit**

```bash
git add charts.js
git commit -m "feat: add multi-series overlay support to RadarChart, color prop to ProgressRing"
```

---

### Task 5: `styles.css` — premium visual polish

**Files:**
- Modify: `styles.css` (append near the end, after the existing `@keyframes pulse` rule)

- [ ] **Step 1: Add the new rules**

```css
.result-hero { text-align: center; padding: 28px 16px 20px; }
.result-hero .readiness-ring-wrap { display: inline-block; animation: ringPop .5s cubic-bezier(.34,1.56,.64,1) both; }
.result-hero .readiness-ring-wrap svg { width: 120px; height: 120px; }
.result-hero .readiness-ring-arc { transition: stroke-dashoffset 1s cubic-bezier(.65,0,.35,1), stroke .3s ease; }
.result-hero .result-date { font-size: 12px; color: var(--text-tertiary); margin-top: 10px; }
.result-hero .result-delta { font-size: 13px; font-weight: 700; margin-top: 4px; }
.result-hero .result-delta.positive { color: var(--success); }
.result-hero .result-delta.negative { color: var(--danger); }
@keyframes ringPop { from { opacity: 0; transform: scale(.85); } to { opacity: 1; transform: scale(1); } }

.result-interpretation { text-align: center; font-size: 14px; color: var(--text-secondary); margin: 10px 0 4px; }

.screen-legend { display: flex; gap: 14px; justify-content: center; flex-wrap: wrap; font-size: 11.5px; color: var(--text-tertiary); margin-top: 10px; }
.screen-legend span { display: inline-flex; align-items: center; gap: 5px; }
.screen-legend .dot { width: 8px; height: 8px; border-radius: 999px; display: inline-block; }

.corrective-list { display: flex; flex-direction: column; gap: 10px; }
.corrective-list .exercise-card { margin-bottom: 0; }
.corrective-test-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.corrective-test-header .test-name { font-weight: 700; font-size: 14px; }
```

- [ ] **Step 2: Commit**

```bash
git add styles.css
git commit -m "feat: add premium visual polish styles for the screening results report"
```

---

### Task 6: `app.js` — data hook, router entry, and profile tab wiring

**Files:**
- Modify: `app.js:31` area (data hooks, right after `useBodyScoresForClient`)
- Modify: `app.js` (`ClientProfilePage`, add `movementScreens` hook + pass to new tab)
- Modify: `app.js` (`App()` router, add the intake-form route)

- [ ] **Step 1: Add the data hook**

Find:
```javascript
function useBodyScoresForClient(id) { return useLiveQuery(function () { return id ? bodyScoreRepository.listByClient(id) : []; }, [id]); }
```
Add directly after it:
```javascript
function useMovementScreensForClient(id) { return useLiveQuery(function () { return id ? movementScreenRepository.listByClient(id) : []; }, [id]); }
```

- [ ] **Step 2: Wire it into `ClientProfilePage`**

Find:
```javascript
  var bodyScores = useBodyScoresForClient(clientId);
```
Add directly after it:
```javascript
  var movementScreens = useMovementScreensForClient(clientId);
```

Find the `TabBar` call:
```javascript
      h(TabBar, {
        value: tab, onChange: function (t) { setQueryParam("tab", t); },
        tabs: [{ value: "overview", label: "Overview" }, { value: "sessions", label: "Sessions" }, { value: "goals", label: "Goals" }, { value: "progress", label: "Progress" }],
      }),
      tab === "overview" && h(OverviewTab, { client: client, assignedProgram: assignedProgram }),
      tab === "sessions" && h(SessionsTab, { client: client, sessions: sessions }),
      tab === "goals" && h(GoalsTab, { client: client, goals: goals || [] }),
      tab === "progress" && h(ProgressTab, { client: client, sessions: sessions, goals: goals || [], bodyScores: bodyScores || [] })
```
Replace with:
```javascript
      h(TabBar, {
        value: tab, onChange: function (t) { setQueryParam("tab", t); },
        tabs: [{ value: "overview", label: "Overview" }, { value: "sessions", label: "Sessions" }, { value: "goals", label: "Goals" }, { value: "progress", label: "Progress" }, { value: "screening", label: "Screening" }],
      }),
      tab === "overview" && h(OverviewTab, { client: client, assignedProgram: assignedProgram }),
      tab === "sessions" && h(SessionsTab, { client: client, sessions: sessions }),
      tab === "goals" && h(GoalsTab, { client: client, goals: goals || [] }),
      tab === "progress" && h(ProgressTab, { client: client, sessions: sessions, goals: goals || [], bodyScores: bodyScores || [] }),
      tab === "screening" && h(ScreeningTab, { client: client, screens: movementScreens || [] })
```

- [ ] **Step 3: Add the intake-form route**

Find in `App()`:
```javascript
  else if (p[0] === "clients" && p.length === 4 && p[2] === "sessions" && p[3] === "new") page = h(SessionFormPage, { mode: "create", clientId: p[1] });
```
Add directly after it:
```javascript
  else if (p[0] === "clients" && p.length === 4 && p[2] === "movement-screen" && p[3] === "new") page = h(MovementScreenFormPage, { clientId: p[1] });
```

- [ ] **Step 4: Syntax-check**

Run: `node -c app.js`
Expected: `ReferenceError`-free syntax check passes (note: `ScreeningTab` and `MovementScreenFormPage` don't exist yet — that's fine, `node -c` only checks syntax, not that every referenced identifier resolves; they're added in Tasks 7-8 before this is ever run in a browser).

- [ ] **Step 5: Commit**

```bash
git add app.js
git commit -m "feat: wire Screening tab and movement-screen route into the app"
```

---

### Task 7: `app.js` — `MovementScreenFormPage` (the intake form)

**Files:**
- Modify: `app.js` (add a new page component; place it right before `function ClientProfilePage`)

- [ ] **Step 1: Add the form page**

```javascript
function blankMovementScreenForm() {
  return { movement: {}, deadHangSeconds: "", deadHangPain: false, rom: {}, notes: "" };
}
function MovementScreenFormPage(props) {
  var client = useClient(props.clientId);
  var _f = useState(blankMovementScreenForm()), form = _f[0], setForm = _f[1];
  var _sv = useState(false), saving = _sv[0], setSaving = _sv[1];

  function setMovementScore(testId, value) {
    setForm(function (f) { var next = Object.assign({}, f, { movement: Object.assign({}, f.movement) }); next.movement[testId] = value; return next; });
  }
  function setRomScore(testId, side, value) {
    setForm(function (f) {
      var next = Object.assign({}, f, { rom: Object.assign({}, f.rom) });
      var current = Object.assign({}, next.rom[testId]);
      current[side] = value;
      next.rom[testId] = current;
      return next;
    });
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!client) return;
    setSaving(true);

    var movementScores = {};
    MOVEMENT_TESTS.forEach(function (t) {
      if (t.timedHang) {
        var seconds = form.deadHangSeconds === "" ? null : Number(form.deadHangSeconds);
        movementScores[t.id] = deadHangScoreFromSeconds(seconds, form.deadHangPain);
      } else if (form.movement[t.id] != null && form.movement[t.id] !== "") {
        movementScores[t.id] = Number(form.movement[t.id]);
      }
    });
    var romScores = {};
    ROM_TESTS.forEach(function (t) {
      var side = form.rom[t.id] || {};
      var entry = {};
      if (side.left != null && side.left !== "") entry.left = Number(side.left);
      if (side.right != null && side.right !== "") entry.right = Number(side.right);
      if (entry.left != null || entry.right != null) romScores[t.id] = entry;
    });

    var overallResult = computeOverallResult(movementScores, romScores);
    var readinessScore = computeReadinessScore(movementScores, romScores);

    var painfulLabels = [];
    MOVEMENT_TESTS.forEach(function (t) { if (movementScores[t.id] === 0) painfulLabels.push(t.label); });
    ROM_TESTS.forEach(function (t) {
      var v = romScores[t.id];
      if (v && (v.left === 0 || v.right === 0)) painfulLabels.push(t.label);
    });

    var screeningInput = {
      clientId: client.id, screenedAt: todayIso(), movementScores: movementScores, romScores: romScores,
      overallResult: overallResult, readinessScore: readinessScore, notes: form.notes,
    };

    movementScreenRepository.create(screeningInput).then(function () {
      if (painfulLabels.length === 0) return;
      var note = "Pain noted during movement screen — " + painfulLabels.join(", ") + ", " + formatDate(todayIso()) + ".";
      var combined = client.injuriesAndPain ? client.injuriesAndPain + "\n" + note : note;
      return clientRepository.update(client.id, { injuriesAndPain: combined });
    }).then(function () {
      navigate("/clients/" + client.id + "?tab=screening");
    }).finally(function () { setSaving(false); });
  }

  if (!client) return h(React.Fragment, null, h(PageHeader, { title: "Movement Screen", back: true }), h("div", { className: "page-content" }));

  return h(React.Fragment, null,
    h(PageHeader, { title: "PilatesTribe Movement & ROM Screen", back: true }),
    h("div", { className: "page-content" },
      h("p", { className: "text-secondary", style: { marginBottom: 14, fontSize: 14 } }, "For " + client.fullName + " — " + formatDate(todayIso())),
      h("form", { onSubmit: handleSubmit, noValidate: true },
        h("fieldset", { className: "form-group" },
          h("legend", null, "A. Movement Screening (0–3: Pain/Unable → Optimal)"),
          MOVEMENT_TESTS.map(function (t) {
            if (t.timedHang) {
              return h("div", { key: t.id, className: "form-grid-2" },
                h(TextField, {
                  label: t.label + " — hold time (seconds)", type: "number", min: 0, inputMode: "numeric", optional: true,
                  value: form.deadHangSeconds, onChange: function (e) { setForm(Object.assign({}, form, { deadHangSeconds: e.target.value })); },
                }),
                h("label", { className: "checkbox-row", style: { alignSelf: "center" } },
                  h("input", { type: "checkbox", checked: form.deadHangPain, onChange: function (e) { setForm(Object.assign({}, form, { deadHangPain: e.target.checked })); } }),
                  "Client reported pain"
                )
              );
            }
            return h(SelectField, {
              key: t.id, label: t.label, optional: true,
              value: form.movement[t.id] == null ? "" : form.movement[t.id],
              onChange: function (e) { setMovementScore(t.id, e.target.value); },
            },
              h("option", { value: "" }, "— Not tested —"),
              [0, 1, 2, 3].map(function (n) { return h("option", { key: n, value: n }, n + (n === t.maxScore ? " (Optimal)" : n === 0 ? " (Pain/Unable)" : "")); })
            );
          })
        ),
        h("fieldset", { className: "form-group" },
          h("legend", null, "B. Range of Motion Screening (0–2: Restricted → Meets Norm)"),
          ROM_TESTS.map(function (t) {
            var side = form.rom[t.id] || {};
            return h("div", { key: t.id, style: { marginBottom: 14 } },
              h("div", { style: { fontWeight: 700, fontSize: 13.5, marginBottom: 2 } }, t.label),
              h("div", { className: "text-tertiary", style: { fontSize: 11.5, marginBottom: 6 } }, "Normative: " + t.normative),
              h("div", { className: "form-grid-2" },
                h(SelectField, {
                  label: "Left", optional: true, value: side.left == null ? "" : side.left,
                  onChange: function (e) { setRomScore(t.id, "left", e.target.value); },
                },
                  h("option", { value: "" }, "—"),
                  [0, 1, 2].map(function (n) { return h("option", { key: n, value: n }, n); })
                ),
                h(SelectField, {
                  label: "Right", optional: true, value: side.right == null ? "" : side.right,
                  onChange: function (e) { setRomScore(t.id, "right", e.target.value); },
                },
                  h("option", { value: "" }, "—"),
                  [0, 1, 2].map(function (n) { return h("option", { key: n, value: n }, n); })
                )
              )
            );
          })
        ),
        h("fieldset", { className: "form-group" },
          h("legend", null, "Notes"),
          h(TextAreaField, { label: "Corrective focus / observations", optional: true, value: form.notes, onChange: function (e) { setForm(Object.assign({}, form, { notes: e.target.value })); } })
        ),
        h("div", { className: "form-actions" },
          h(Button, { type: "submit", className: "btn-block", disabled: saving }, saving ? "Saving…" : "Save screening")
        )
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
git commit -m "feat: add MovementScreenFormPage intake form"
```

---

### Task 8: `app.js` — `ScreeningTab` results report (the premium "story" screen)

**Files:**
- Modify: `app.js` (add right before `function MovementScreenFormPage`)

- [ ] **Step 1: Add the component**

```javascript
var RESULT_TONE = { green: "success", amber: "warning", red: "danger" };
var RESULT_COLOR_VAR = { green: "var(--success)", amber: "var(--warning)", red: "var(--danger)" };

function ScreeningTab(props) {
  var client = props.client, screens = props.screens;
  var latest = screens.length ? screens[screens.length - 1] : null;
  var previous = screens.length > 1 ? screens[screens.length - 2] : null;

  if (!latest) {
    return h("div", { className: "stack" },
      h(EmptyState, {
        icon: h(TargetIcon, { width: 36, height: 36 }),
        title: "No movement screen yet",
        message: "Run the PilatesTribe Movement & ROM Screen to get a readiness score, a Green/Amber/Red result, and a corrective exercise plan.",
        action: h(Link, { to: "/clients/" + client.id + "/movement-screen/new" }, h(Button, null, h(PlusCircleIcon, { width: 18, height: 18 }), "Run first screening")),
      })
    );
  }

  var delta = previous ? latest.readinessScore - previous.readinessScore : null;

  var movementSeries = [{
    data: MOVEMENT_TESTS.map(function (t) { return { label: t.label, value: latest.movementScores[t.id] == null ? 0 : latest.movementScores[t.id], max: t.maxScore }; }),
    color: RESULT_COLOR_VAR[latest.overallResult], filled: true,
  }];
  if (previous) {
    movementSeries.push({
      data: MOVEMENT_TESTS.map(function (t) { return { label: t.label, value: previous.movementScores[t.id] == null ? 0 : previous.movementScores[t.id], max: t.maxScore }; }),
      color: "var(--text-tertiary)", dashed: true, filled: false,
    });
  }

  var romSeries = [
    { data: ROM_TESTS.map(function (t) { var v = latest.romScores[t.id] || {}; return { label: t.label, value: v.left == null ? 0 : v.left, max: t.maxScore }; }), color: "var(--info)", filled: true },
    { data: ROM_TESTS.map(function (t) { var v = latest.romScores[t.id] || {}; return { label: t.label, value: v.right == null ? 0 : v.right, max: t.maxScore }; }), color: "var(--accent)", filled: true },
  ];

  var weakTests = [];
  MOVEMENT_TESTS.forEach(function (t) {
    var v = latest.movementScores[t.id];
    if (v != null && v < t.maxScore) weakTests.push({ test: t, painful: v === 0, detail: null });
  });
  ROM_TESTS.forEach(function (t) {
    var v = latest.romScores[t.id];
    if (!v) return;
    var worst = Math.min(v.left == null ? t.maxScore : v.left, v.right == null ? t.maxScore : v.right);
    if (worst < t.maxScore) weakTests.push({ test: t, painful: worst === 0, detail: "L " + (v.left == null ? "—" : v.left) + " / R " + (v.right == null ? "—" : v.right) });
  });
  weakTests.sort(function (a, b) { return (b.painful ? 1 : 0) - (a.painful ? 1 : 0); });

  return h("div", { className: "stack" },
    h("div", { className: "chart-card result-hero" },
      h("div", { className: "readiness-ring-wrap" }, h(ProgressRing, { size: 120, percent: latest.readinessScore, color: RESULT_COLOR_VAR[latest.overallResult] })),
      h("div", { style: { marginTop: 12 } }, h(Badge, { tone: RESULT_TONE[latest.overallResult] }, latest.overallResult.toUpperCase())),
      h("div", { className: "result-interpretation" }, RESULT_INTERPRETATION[latest.overallResult]),
      delta != null && h("div", { className: "result-delta " + (delta >= 0 ? "positive" : "negative") }, (delta >= 0 ? "+" : "") + delta + " since last screen"),
      h("div", { className: "result-date" }, "Screened " + formatDate(latest.screenedAt))
    ),
    h("div", { className: "chart-card" },
      h("div", { className: "chart-title" }, "Movement Quality"),
      h("div", { className: "chart-subtitle" }, previous ? "Solid = latest, dashed = previous screen" : "This screening"),
      h(RadarChart, { series: movementSeries })
    ),
    h("div", { className: "chart-card" },
      h("div", { className: "chart-title" }, "Mobility Balance"),
      h("div", { className: "chart-subtitle" }, "Left vs right, same screening"),
      h(RadarChart, { series: romSeries }),
      h("div", { className: "screen-legend" },
        h("span", null, h("span", { className: "dot", style: { background: "var(--info)" } }), "Left"),
        h("span", null, h("span", { className: "dot", style: { background: "var(--accent)" } }), "Right")
      )
    ),
    weakTests.length > 0 && h("div", { className: "chart-card" },
      h("div", { className: "chart-title" }, "Corrective exercises"),
      h("div", { className: "chart-subtitle" }, "Weakest and painful areas first"),
      h("div", { className: "corrective-list" },
        weakTests.map(function (w) {
          return h("div", { key: w.test.id, className: "exercise-card" },
            h("div", { className: "corrective-test-header" },
              h("span", { className: "test-name" }, w.test.label + (w.detail ? " (" + w.detail + ")" : "")),
              w.painful && h(Badge, { tone: "danger" }, "Pain")
            ),
            w.test.corrective.map(function (ex, i) {
              return h("div", { key: i, style: { fontSize: 13, marginBottom: i === w.test.corrective.length - 1 ? 0 : 6 } },
                h("strong", null, ex.name), " — " + ex.sets + ". ", h("span", { className: "text-secondary" }, ex.cue)
              );
            })
          );
        })
      )
    ),
    h(Link, { to: "/clients/" + client.id + "/movement-screen/new" }, h(Button, { className: "btn-block" }, "Re-screen")),
    screens.length > 1 && h("section", null,
      h(SectionLabel, null, "History"),
      h("div", { className: "list-card" },
        screens.slice().reverse().map(function (s) {
          return h("div", { key: s.id, className: "list-row" },
            h("div", { className: "list-row-body" },
              h("div", { className: "list-row-title" }, formatDate(s.screenedAt)),
              h("div", { className: "list-row-subtitle" }, "Readiness " + s.readinessScore + "/100")
            ),
            h(Badge, { tone: RESULT_TONE[s.overallResult] }, s.overallResult.toUpperCase())
          );
        })
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
git commit -m "feat: add ScreeningTab premium results report"
```

---

### Task 9: `index.html` — load the new script

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add the script tag**

Find:
```html
<script src="data.js"></script>
<script src="icons.js"></script>
```
Change to:
```html
<script src="data.js"></script>
<script src="movementScreen.js"></script>
<script src="icons.js"></script>
```

(Placed after `data.js` and before `icons.js`/`ui.js`/`charts.js`/`app.js` — none of `movementScreen.js`'s top-level code touches `window`/`document`/React, so its load order relative to those only matters in that it must come before `app.js`, which it does.)

- [ ] **Step 2: Run the full test suite**

Run: `node test/data.test.js && node test/charts.test.js && node test/movementScreen.test.js`
Expected: all three print their "all assertions passed" line.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: load movementScreen.js in index.html"
```

---

### Task 10: Live verification pass [MANUAL]

**Files:** none (verification only)

- [ ] **Step 1:** Confirm Task 2's migration has been run against the live Supabase project (the `curl` check in that task).
- [ ] **Step 2:** Reload the app, open a client, go to the new **Screening** tab, confirm the empty state and "Run first screening" button appear.
- [ ] **Step 3:** Run a screening: fill in a mix of scores including at least one 0 (to test the RED path and the injury-note side effect) and at least one Dead Hang time, save, confirm it lands back on the Screening tab showing the readiness ring, GREEN/AMBER/RED badge, both radar charts, and corrective exercises for every below-max test.
- [ ] **Step 4:** Check the client's Overview tab — confirm the pain note was appended to "Injuries & pain".
- [ ] **Step 5:** Run a second screening with better scores, confirm the Movement Quality chart now shows the previous screening as a dashed outline behind the new solid shape, and the "+N since last screen" delta appears.
- [ ] **Step 6:** Check at iPhone width (375px) in the browser pane that the results report and both radar charts remain readable and don't overflow.

---

### Task 11: Push to GitHub

```bash
git push origin main
```
