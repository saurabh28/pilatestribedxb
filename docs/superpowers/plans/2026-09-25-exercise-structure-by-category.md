# Exercise Structure By Category Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the one-size-fits-all "reps/weight/rest" exercise structure with a config-driven structure per category, plus structured springs (color/count/level) and props (name/value) replacing today's free-text fields.

**Architecture:** A new `CATEGORY_FIELD_CONFIG` object in `data.js` (same pattern as `movementScreen.js`'s test config) declares which fields each of the 7 existing categories uses. `ExerciseRow` in `app.js` reads this config to conditionally render fields instead of hardcoding one shape for everyone. Springs and props become structured arrays with pure fallback functions (`normalizedSprings`/`normalizedProps`) for backward compatibility with already-saved free-text data, mirroring the existing `normalizedSetDetails` pattern exactly.

**Tech Stack:** Same as the rest of the app — vanilla JS, React 18 UMD (`h`), no build step. Config/constants tested via the existing Node `test/helpers/load-browser-script.js` harness; `ExerciseRow`/`ExerciseSummary` UI changes verified manually in the browser (same as `normalizedSetDetails`, which has never had automated coverage either, since loading `app.js` in Node would require stubbing out its `boot()` call and the full React/DOM surface).

**Reference:** `docs/superpowers/specs/2026-09-25-exercise-structure-by-category-design.md`

---

### Task 1: `data.js` — `CATEGORY_FIELD_CONFIG` and `DEFAULT_PROPS`

**Files:**
- Modify: `data.js:12` (right after the existing `EXERCISE_CATEGORIES` line)
- Test: `test/exerciseStructure.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// test/exerciseStructure.test.js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test/exerciseStructure.test.js`
Expected: `TypeError: Cannot read properties of undefined (reading 'Pilates')` (or similar) since `CATEGORY_FIELD_CONFIG` doesn't exist yet.

- [ ] **Step 3: Add the config to `data.js`**

Find (currently `data.js:12`):
```javascript
var EXERCISE_CATEGORIES = ["Pilates", "Strength", "Cardio", "Mobility", "Yoga", "Functional", "Other"];
```
Add directly after it:
```javascript
/* Declares which fields each exercise category uses, so ExerciseRow reads
   this instead of hardcoding one shape for every category. Add a new
   category or change an existing one's fields by editing this object only. */
var CATEGORY_FIELD_CONFIG = {
  "Pilates":    { usesSets: true,  setFields: ["reps", "restSeconds"],           usesSprings: true,  usesProps: true, usesDistance: false, usesIntensity: false, usesAssistance: true,  usesBox: true },
  "Strength":   { usesSets: true,  setFields: ["reps", "weight", "restSeconds"], usesSprings: false, usesProps: true, usesDistance: false, usesIntensity: false, usesAssistance: false, usesBox: false },
  "Cardio":     { usesSets: false, setFields: [],                                usesSprings: false, usesProps: false, usesDistance: true, usesIntensity: true,  usesAssistance: false, usesBox: false },
  "Mobility":   { usesSets: true,  setFields: ["holdSeconds"],                   usesSprings: false, usesProps: true, usesDistance: false, usesIntensity: false, usesAssistance: false, usesBox: false },
  "Yoga":       { usesSets: true,  setFields: ["holdSeconds"],                   usesSprings: false, usesProps: true, usesDistance: false, usesIntensity: false, usesAssistance: false, usesBox: false },
  "Functional": { usesSets: true,  setFields: ["reps", "weight", "restSeconds"], usesSprings: false, usesProps: true, usesDistance: false, usesIntensity: false, usesAssistance: false, usesBox: false },
  "Other":      { usesSets: true,  setFields: ["reps", "weight", "restSeconds"], usesSprings: false, usesProps: true, usesDistance: false, usesIntensity: false, usesAssistance: false, usesBox: false },
};
/* Default prop options for the Props picker on any category that uses props.
   Coaches can add a custom one from the UI too -- this is just the seed list. */
var DEFAULT_PROPS = ["Magic Circle", "Dumbbell", "Resistance Band", "Ankle Weights", "Foam Roller", "Long Box", "Foot Strap", "Small Ball", "Theraband", "Kettlebell", "Medicine Ball"];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node test/exerciseStructure.test.js`
Expected: `exerciseStructure.test.js: all assertions passed`

- [ ] **Step 5: Commit**

```bash
git add data.js test/exerciseStructure.test.js
git commit -m "feat: add CATEGORY_FIELD_CONFIG and DEFAULT_PROPS"
```

---

### Task 2: `app.js` — data shape changes and normalization functions

**Files:**
- Modify: `app.js:143-159` (`blankSetDetail`, `blankExercise`, `normalizedSetDetails`)

- [ ] **Step 1: Replace the exercise data-shape functions**

Find (currently `app.js:143-159`):
```javascript
function blankSetDetail() {
  return { id: generateId(), reps: null, weight: "", restSeconds: null };
}
function blankExercise() {
  return { id: generateId(), exerciseName: "", category: "Pilates", setDetails: [blankSetDetail()], springSetting: "", duration: null, side: "N/A", notes: "", reformerSprings: "", box: false, props: "", repetitions: null, assistanceLevel: "" };
}
/* Older saved exercises only had a single aggregate sets/reps/resistance
   trio. Normalize any exercise (old or new) to a non-empty setDetails array
   so the per-set editor and summary always have something to render, and so
   editing an old exercise upgrades it to the new per-set shape. */
function normalizedSetDetails(ex) {
  if (ex.setDetails && ex.setDetails.length) return ex.setDetails;
  if (ex.reps != null || ex.resistance || ex.sets != null) {
    return [{ id: "legacy-" + ex.id, reps: ex.reps != null ? ex.reps : null, weight: ex.resistance || "", restSeconds: null }];
  }
  return [blankSetDetail()];
}
```
Replace with:
```javascript
function blankSetDetail() {
  return { id: generateId(), reps: null, weight: "", restSeconds: null, holdSeconds: null };
}
function blankExercise() {
  return {
    id: generateId(), exerciseName: "", category: "Pilates", setDetails: [blankSetDetail()],
    duration: null, distance: "", intensity: "", side: "N/A", notes: "",
    springs: [], selectedProps: [], box: false, assistanceLevel: "",
  };
}
function blankSpring() {
  return { id: generateId(), color: "", count: null, level: "" };
}
function blankSelectedProp(name) {
  return { id: generateId(), name: name, value: "" };
}
/* Older saved exercises only had a single aggregate sets/reps/resistance
   trio. Normalize any exercise (old or new) to a non-empty setDetails array
   so the per-set editor and summary always have something to render, and so
   editing an old exercise upgrades it to the new per-set shape. */
function normalizedSetDetails(ex) {
  if (ex.setDetails && ex.setDetails.length) return ex.setDetails;
  if (ex.reps != null || ex.resistance || ex.sets != null) {
    return [{ id: "legacy-" + ex.id, reps: ex.reps != null ? ex.reps : null, weight: ex.resistance || "", restSeconds: null, holdSeconds: null }];
  }
  return [blankSetDetail()];
}
/* Older saved exercises stored spring info as a single free-text string in
   either `springSetting` or `reformerSprings`. Wrap that into the new
   structured shape so old exercises still display correctly; editing one
   upgrades it to the new shape on save, same as normalizedSetDetails above. */
function normalizedSprings(ex) {
  if (ex.springs && ex.springs.length) return ex.springs;
  if (ex.reformerSprings || ex.springSetting) {
    return [{ id: "legacy-" + ex.id, color: ex.reformerSprings || ex.springSetting, count: null, level: "" }];
  }
  return [];
}
/* Same idea as normalizedSprings, for the old free-text `props` field. */
function normalizedProps(ex) {
  if (ex.selectedProps && ex.selectedProps.length) return ex.selectedProps;
  if (ex.props) return [{ id: "legacy-" + ex.id, name: ex.props, value: "" }];
  return [];
}
```

- [ ] **Step 2: Syntax-check**

Run: `node -c app.js`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add app.js
git commit -m "feat: add structured springs/props data shape and normalization functions"
```

---

### Task 3: `app.js` — rewrite `ExerciseRow` to be config-driven

**Files:**
- Modify: `app.js:172-280` (the whole `ExerciseRow` function)

- [ ] **Step 1: Replace the entire `ExerciseRow` function**

Find the whole function starting at `app.js:172` (`function ExerciseRow(props) {`) through its closing `}` at `app.js:280` — this is the full current body:

```javascript
function ExerciseRow(props) {
  var ex = props.exercise;
  var isPilates = ex.category === "Pilates";
  var idp = "ex-" + ex.id;
  var setDetails = normalizedSetDetails(ex);
  function num(field) { return function (e) { var v = e.target.value; var patch = {}; patch[field] = v === "" ? null : Number(v); props.onChange(patch); }; }
  function txt(field) { return function (e) { var patch = {}; patch[field] = e.target.value; props.onChange(patch); }; }

  function updateSet(setId, patch) {
    props.onChange({ setDetails: setDetails.map(function (s) { return s.id === setId ? Object.assign({}, s, patch) : s; }) });
  }
  function setNum(setId, field) { return function (e) { var v = e.target.value; var patch = {}; patch[field] = v === "" ? null : Number(v); updateSet(setId, patch); }; }
  function setTxt(setId, field) { return function (e) { var patch = {}; patch[field] = e.target.value; updateSet(setId, patch); }; }
  function addSet() {
    var last = setDetails[setDetails.length - 1];
    var copy = last ? Object.assign({}, last, { id: generateId() }) : blankSetDetail();
    props.onChange({ setDetails: setDetails.concat([copy]) });
  }
  function removeSet(setId) {
    var next = setDetails.filter(function (s) { return s.id !== setId; });
    props.onChange({ setDetails: next.length ? next : [blankSetDetail()] });
  }

  return h("div", { className: "exercise-card" },
    h("div", { className: "exercise-card-head" },
      h("span", { className: "exercise-card-title" }, "Exercise " + (props.index + 1)),
      h("button", { type: "button", className: "exercise-remove-btn", onClick: props.onRemove }, h(TrashIcon, { width: 15, height: 15 }), "Remove")
    ),
    h("div", { className: "exercise-fields-grid", style: { marginBottom: 10 } },
      h("div", { className: "form-field", style: { gridColumn: "1 / -1" } },
        h("label", { className: "form-label", htmlFor: idp + "-name" }, "Exercise name"),
        h("input", { id: idp + "-name", className: "input", value: ex.exerciseName, onChange: txt("exerciseName"), placeholder: "e.g. Footwork on reformer" })
      ),
      h("div", { className: "form-field" },
        h("label", { className: "form-label", htmlFor: idp + "-cat" }, "Category"),
        h("select", { id: idp + "-cat", className: "select", value: ex.category, onChange: txt("category") },
          EXERCISE_CATEGORIES.map(function (c) { return h("option", { key: c, value: c }, c); }))
      ),
      h("div", { className: "form-field" },
        h("label", { className: "form-label", htmlFor: idp + "-side" }, "Side"),
        h("select", { id: idp + "-side", className: "select", value: ex.side || "N/A", onChange: txt("side") },
          SIDES.map(function (s) { return h("option", { key: s, value: s }, s); }))
      ),
      h("div", { className: "form-field" },
        h("label", { className: "form-label", htmlFor: idp + "-spring" }, "Spring setting"),
        h("input", { id: idp + "-spring", className: "input", value: ex.springSetting || "", onChange: txt("springSetting"), placeholder: "e.g. medium" })
      ),
      h("div", { className: "form-field" },
        h("label", { className: "form-label", htmlFor: idp + "-dur" }, "Duration (sec)"),
        h("input", { id: idp + "-dur", className: "input", type: "number", min: 0, inputMode: "numeric", value: ex.duration == null ? "" : ex.duration, onChange: num("duration") })
      )
    ),
    h("div", { style: { borderTop: "1px dashed var(--separator)", paddingTop: 10, marginBottom: 10 } },
      h("div", { className: "flex-between", style: { marginBottom: 8 } },
        h("span", { className: "exercise-card-title" }, "Sets"),
        h("span", { className: "text-tertiary", style: { fontSize: 11 } }, setDetails.length + " set" + (setDetails.length === 1 ? "" : "s"))
      ),
      setDetails.map(function (s, i) {
        var sidp = idp + "-set-" + s.id;
        return h("div", { key: s.id, className: "set-row" },
          h("span", { className: "set-row-index", "aria-hidden": true }, i + 1),
          h("div", { className: "form-field" },
            h("label", { className: "form-label", htmlFor: sidp + "-reps" }, "Reps"),
            h("input", { id: sidp + "-reps", className: "input", type: "number", min: 0, inputMode: "numeric", value: s.reps == null ? "" : s.reps, onChange: setNum(s.id, "reps") })
          ),
          h("div", { className: "form-field" },
            h("label", { className: "form-label", htmlFor: sidp + "-weight" }, "Weight / resistance"),
            h("input", { id: sidp + "-weight", className: "input", value: s.weight || "", onChange: setTxt(s.id, "weight"), placeholder: "e.g. 20kg, red band" })
          ),
          h("div", { className: "form-field" },
            h("label", { className: "form-label", htmlFor: sidp + "-rest" }, "Rest (sec)"),
            h("input", { id: sidp + "-rest", className: "input", type: "number", min: 0, inputMode: "numeric", value: s.restSeconds == null ? "" : s.restSeconds, onChange: setNum(s.id, "restSeconds") })
          ),
          h("button", { type: "button", className: "set-remove-btn", "aria-label": "Remove set " + (i + 1), onClick: function () { removeSet(s.id); } }, h(XIcon, { width: 14, height: 14 }))
        );
      }),
      h("button", { type: "button", className: "btn-text", style: { fontSize: 13, fontWeight: 700 }, onClick: addSet }, h(PlusCircleIcon, { width: 16, height: 16 }), "Add set")
    ),
    isPilates && h("div", { style: { borderTop: "1px dashed var(--separator)", paddingTop: 10, marginBottom: 10 } },
      h("div", { className: "exercise-card-title", style: { marginBottom: 8 } }, "Pilates detail"),
      h("div", { className: "exercise-fields-grid" },
        h("div", { className: "form-field" },
          h("label", { className: "form-label", htmlFor: idp + "-rspr" }, "Reformer springs"),
          h("input", { id: idp + "-rspr", className: "input", value: ex.reformerSprings || "", onChange: txt("reformerSprings"), placeholder: "e.g. 2 red" })
        ),
        h("div", { className: "form-field" },
          h("label", { className: "form-label", htmlFor: idp + "-reps2" }, "Repetitions"),
          h("input", { id: idp + "-reps2", className: "input", type: "number", min: 0, inputMode: "numeric", value: ex.repetitions == null ? "" : ex.repetitions, onChange: num("repetitions") })
        ),
        h("div", { className: "form-field" },
          h("label", { className: "form-label", htmlFor: idp + "-props" }, "Props"),
          h("input", { id: idp + "-props", className: "input", value: ex.props || "", onChange: txt("props"), placeholder: "e.g. magic circle" })
        ),
        h("div", { className: "form-field" },
          h("label", { className: "form-label", htmlFor: idp + "-assist" }, "Assistance level"),
          h("input", { id: idp + "-assist", className: "input", value: ex.assistanceLevel || "", onChange: txt("assistanceLevel"), placeholder: "e.g. independent" })
        ),
        h("label", { className: "checkbox-row" },
          h("input", { type: "checkbox", checked: !!ex.box, onChange: function (e) { props.onChange({ box: e.target.checked }); } }),
          "Box used"
        )
      )
    ),
    h("div", { className: "form-field", style: { marginBottom: 0 } },
      h("label", { className: "form-label", htmlFor: idp + "-notes" }, "Notes"),
      h("textarea", { id: idp + "-notes", className: "textarea", style: { minHeight: 56 }, value: ex.notes || "", onChange: txt("notes") })
    )
  );
}
```

Replace it with:

```javascript
function ExerciseRow(props) {
  var ex = props.exercise;
  var config = CATEGORY_FIELD_CONFIG[ex.category] || CATEGORY_FIELD_CONFIG.Other;
  var idp = "ex-" + ex.id;
  var setDetails = normalizedSetDetails(ex);
  var springs = normalizedSprings(ex);
  var selectedProps = normalizedProps(ex);
  var _cp = useState(""), customPropInput = _cp[0], setCustomPropInput = _cp[1];

  function num(field) { return function (e) { var v = e.target.value; var patch = {}; patch[field] = v === "" ? null : Number(v); props.onChange(patch); }; }
  function txt(field) { return function (e) { var patch = {}; patch[field] = e.target.value; props.onChange(patch); }; }

  function updateSet(setId, patch) {
    props.onChange({ setDetails: setDetails.map(function (s) { return s.id === setId ? Object.assign({}, s, patch) : s; }) });
  }
  function setNum(setId, field) { return function (e) { var v = e.target.value; var patch = {}; patch[field] = v === "" ? null : Number(v); updateSet(setId, patch); }; }
  function setTxt(setId, field) { return function (e) { var patch = {}; patch[field] = e.target.value; updateSet(setId, patch); }; }
  function addSet() {
    var last = setDetails[setDetails.length - 1];
    var copy = last ? Object.assign({}, last, { id: generateId() }) : blankSetDetail();
    props.onChange({ setDetails: setDetails.concat([copy]) });
  }
  function removeSet(setId) {
    var next = setDetails.filter(function (s) { return s.id !== setId; });
    props.onChange({ setDetails: next.length ? next : [blankSetDetail()] });
  }

  function updateSpring(springId, patch) {
    props.onChange({ springs: springs.map(function (s) { return s.id === springId ? Object.assign({}, s, patch) : s; }) });
  }
  function addSpring() { props.onChange({ springs: springs.concat([blankSpring()]) }); }
  function removeSpring(springId) { props.onChange({ springs: springs.filter(function (s) { return s.id !== springId; }) }); }

  function togglePropOption(name) {
    var exists = selectedProps.some(function (p) { return p.name === name; });
    if (exists) props.onChange({ selectedProps: selectedProps.filter(function (p) { return p.name !== name; }) });
    else props.onChange({ selectedProps: selectedProps.concat([blankSelectedProp(name)]) });
  }
  function updatePropValue(propId, value) {
    props.onChange({ selectedProps: selectedProps.map(function (p) { return p.id === propId ? Object.assign({}, p, { value: value }) : p; }) });
  }
  function addCustomProp() {
    var v = customPropInput.trim();
    if (!v || selectedProps.some(function (p) { return p.name === v; })) return;
    props.onChange({ selectedProps: selectedProps.concat([blankSelectedProp(v)]) });
    setCustomPropInput("");
  }

  var propOptions = DEFAULT_PROPS.concat(
    selectedProps.map(function (p) { return p.name; }).filter(function (n) { return DEFAULT_PROPS.indexOf(n) === -1; })
  );

  return h("div", { className: "exercise-card" },
    h("div", { className: "exercise-card-head" },
      h("span", { className: "exercise-card-title" }, "Exercise " + (props.index + 1)),
      h("button", { type: "button", className: "exercise-remove-btn", onClick: props.onRemove }, h(TrashIcon, { width: 15, height: 15 }), "Remove")
    ),
    h("div", { className: "exercise-fields-grid", style: { marginBottom: 10 } },
      h("div", { className: "form-field", style: { gridColumn: "1 / -1" } },
        h("label", { className: "form-label", htmlFor: idp + "-name" }, "Exercise name"),
        h("input", { id: idp + "-name", className: "input", value: ex.exerciseName, onChange: txt("exerciseName"), placeholder: "e.g. Footwork on reformer" })
      ),
      h("div", { className: "form-field" },
        h("label", { className: "form-label", htmlFor: idp + "-cat" }, "Category"),
        h("select", { id: idp + "-cat", className: "select", value: ex.category, onChange: txt("category") },
          EXERCISE_CATEGORIES.map(function (c) { return h("option", { key: c, value: c }, c); }))
      ),
      h("div", { className: "form-field" },
        h("label", { className: "form-label", htmlFor: idp + "-side" }, "Side"),
        h("select", { id: idp + "-side", className: "select", value: ex.side || "N/A", onChange: txt("side") },
          SIDES.map(function (s) { return h("option", { key: s, value: s }, s); }))
      ),
      h("div", { className: "form-field" },
        h("label", { className: "form-label", htmlFor: idp + "-dur" }, "Duration (sec)"),
        h("input", { id: idp + "-dur", className: "input", type: "number", min: 0, inputMode: "numeric", value: ex.duration == null ? "" : ex.duration, onChange: num("duration") })
      ),
      config.usesDistance && h("div", { className: "form-field" },
        h("label", { className: "form-label", htmlFor: idp + "-dist" }, "Distance"),
        h("input", { id: idp + "-dist", className: "input", value: ex.distance || "", onChange: txt("distance"), placeholder: "e.g. 5km" })
      ),
      config.usesIntensity && h("div", { className: "form-field" },
        h("label", { className: "form-label", htmlFor: idp + "-int" }, "Intensity"),
        h("input", { id: idp + "-int", className: "input", value: ex.intensity || "", onChange: txt("intensity"), placeholder: "e.g. RPE 7, Zone 2" })
      )
    ),

    config.usesSets && h("div", { style: { borderTop: "1px dashed var(--separator)", paddingTop: 10, marginBottom: 10 } },
      h("div", { className: "flex-between", style: { marginBottom: 8 } },
        h("span", { className: "exercise-card-title" }, "Sets"),
        h("span", { className: "text-tertiary", style: { fontSize: 11 } }, setDetails.length + " set" + (setDetails.length === 1 ? "" : "s"))
      ),
      setDetails.map(function (s, i) {
        var sidp = idp + "-set-" + s.id;
        return h("div", { key: s.id, className: "set-row" },
          h("span", { className: "set-row-index", "aria-hidden": true }, i + 1),
          config.setFields.indexOf("reps") !== -1 && h("div", { className: "form-field" },
            h("label", { className: "form-label", htmlFor: sidp + "-reps" }, "Reps"),
            h("input", { id: sidp + "-reps", className: "input", type: "number", min: 0, inputMode: "numeric", value: s.reps == null ? "" : s.reps, onChange: setNum(s.id, "reps") })
          ),
          config.setFields.indexOf("weight") !== -1 && h("div", { className: "form-field" },
            h("label", { className: "form-label", htmlFor: sidp + "-weight" }, "Weight / resistance"),
            h("input", { id: sidp + "-weight", className: "input", value: s.weight || "", onChange: setTxt(s.id, "weight"), placeholder: "e.g. 20kg, red band" })
          ),
          config.setFields.indexOf("holdSeconds") !== -1 && h("div", { className: "form-field" },
            h("label", { className: "form-label", htmlFor: sidp + "-hold" }, "Hold (sec)"),
            h("input", { id: sidp + "-hold", className: "input", type: "number", min: 0, inputMode: "numeric", value: s.holdSeconds == null ? "" : s.holdSeconds, onChange: setNum(s.id, "holdSeconds") })
          ),
          config.setFields.indexOf("restSeconds") !== -1 && h("div", { className: "form-field" },
            h("label", { className: "form-label", htmlFor: sidp + "-rest" }, "Rest (sec)"),
            h("input", { id: sidp + "-rest", className: "input", type: "number", min: 0, inputMode: "numeric", value: s.restSeconds == null ? "" : s.restSeconds, onChange: setNum(s.id, "restSeconds") })
          ),
          h("button", { type: "button", className: "set-remove-btn", "aria-label": "Remove set " + (i + 1), onClick: function () { removeSet(s.id); } }, h(XIcon, { width: 14, height: 14 }))
        );
      }),
      h("button", { type: "button", className: "btn-text", style: { fontSize: 13, fontWeight: 700 }, onClick: addSet }, h(PlusCircleIcon, { width: 16, height: 16 }), "Add set")
    ),

    config.usesSprings && h("div", { style: { borderTop: "1px dashed var(--separator)", paddingTop: 10, marginBottom: 10 } },
      h("div", { className: "flex-between", style: { marginBottom: 8 } }, h("span", { className: "exercise-card-title" }, "Springs")),
      springs.map(function (sp, i) {
        var spidp = idp + "-spring-" + sp.id;
        return h("div", { key: sp.id, className: "set-row" },
          h("span", { className: "set-row-index", "aria-hidden": true }, i + 1),
          h("div", { className: "form-field" },
            h("label", { className: "form-label", htmlFor: spidp + "-color" }, "Color"),
            h("input", { id: spidp + "-color", className: "input", value: sp.color || "", onChange: function (e) { updateSpring(sp.id, { color: e.target.value }); }, placeholder: "e.g. Red" })
          ),
          h("div", { className: "form-field" },
            h("label", { className: "form-label", htmlFor: spidp + "-count" }, "Count"),
            h("input", { id: spidp + "-count", className: "input", type: "number", min: 0, inputMode: "numeric", value: sp.count == null ? "" : sp.count, onChange: function (e) { var v = e.target.value; updateSpring(sp.id, { count: v === "" ? null : Number(v) }); } })
          ),
          h("div", { className: "form-field" },
            h("label", { className: "form-label", htmlFor: spidp + "-level" }, "Level"),
            h("input", { id: spidp + "-level", className: "input", value: sp.level || "", onChange: function (e) { updateSpring(sp.id, { level: e.target.value }); }, placeholder: "e.g. 1" })
          ),
          h("button", { type: "button", className: "set-remove-btn", "aria-label": "Remove spring " + (i + 1), onClick: function () { removeSpring(sp.id); } }, h(XIcon, { width: 14, height: 14 }))
        );
      }),
      h("button", { type: "button", className: "btn-text", style: { fontSize: 13, fontWeight: 700 }, onClick: addSpring }, h(PlusCircleIcon, { width: 16, height: 16 }), "Add spring")
    ),

    config.usesProps && h("div", { style: { borderTop: "1px dashed var(--separator)", paddingTop: 10, marginBottom: 10 } },
      h("div", { className: "exercise-card-title", style: { marginBottom: 8 } }, "Props"),
      h("div", { className: "chip-group", style: { marginBottom: 10 } },
        propOptions.map(function (name) {
          var selected = selectedProps.some(function (p) { return p.name === name; });
          return h("button", {
            type: "button", key: name, className: classNames("chip", selected && "selected"),
            "aria-pressed": selected, onClick: function () { togglePropOption(name); },
          }, name);
        })
      ),
      selectedProps.length > 0 && h("div", { className: "stack", style: { gap: 8, marginBottom: 10 } },
        selectedProps.map(function (p) {
          return h("div", { key: p.id, className: "form-field", style: { marginBottom: 0 } },
            h("label", { className: "form-label" }, p.name + " — value (optional)"),
            h("input", { className: "input", value: p.value || "", onChange: function (e) { updatePropValue(p.id, e.target.value); }, placeholder: "e.g. 2kg" })
          );
        })
      ),
      h("div", { className: "flex-row gap-8" },
        h("input", {
          className: "input", placeholder: "Add a custom prop", value: customPropInput,
          onChange: function (e) { setCustomPropInput(e.target.value); },
          onKeyDown: function (e) { if (e.key === "Enter") { e.preventDefault(); addCustomProp(); } },
        }),
        h(Button, { type: "button", variant: "secondary", onClick: addCustomProp }, "Add")
      )
    ),

    (config.usesAssistance || config.usesBox) && h("div", { style: { borderTop: "1px dashed var(--separator)", paddingTop: 10, marginBottom: 10 } },
      h("div", { className: "exercise-card-title", style: { marginBottom: 8 } }, "Pilates detail"),
      h("div", { className: "exercise-fields-grid" },
        config.usesAssistance && h("div", { className: "form-field" },
          h("label", { className: "form-label", htmlFor: idp + "-assist" }, "Assistance level"),
          h("input", { id: idp + "-assist", className: "input", value: ex.assistanceLevel || "", onChange: txt("assistanceLevel"), placeholder: "e.g. independent" })
        ),
        config.usesBox && h("label", { className: "checkbox-row" },
          h("input", { type: "checkbox", checked: !!ex.box, onChange: function (e) { props.onChange({ box: e.target.checked }); } }),
          "Box used"
        )
      )
    ),

    h("div", { className: "form-field", style: { marginBottom: 0 } },
      h("label", { className: "form-label", htmlFor: idp + "-notes" }, "Notes"),
      h("textarea", { id: idp + "-notes", className: "textarea", style: { minHeight: 56 }, value: ex.notes || "", onChange: txt("notes") })
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
git commit -m "feat: make ExerciseRow config-driven per exercise category"
```

---

### Task 4: `app.js` — update `formatSetLine` and `ExerciseSummary` for the new shape

**Files:**
- Modify: `app.js:1422-1453` (`formatSetLine` and `ExerciseSummary`)

- [ ] **Step 1: Replace both functions**

Find (currently `app.js:1422-1453`):
```javascript
function formatSetLine(s, i) {
  var parts = [];
  if (s.reps != null) parts.push(s.reps + " reps");
  if (s.weight) parts.push(s.weight);
  if (s.restSeconds != null) parts.push(s.restSeconds + "s rest");
  return "Set " + (i + 1) + (parts.length ? ": " + parts.join(", ") : " — no detail recorded");
}
function ExerciseSummary(props) {
  var ex = props.exercise;
  var setDetails = normalizedSetDetails(ex);
  var hasRealSetData = setDetails.some(function (s) { return s.reps != null || s.weight || s.restSeconds != null; });
  var meta = [];
  if (ex.repetitions != null) meta.push(ex.repetitions + " reps");
  if (ex.springSetting) meta.push("Spring: " + ex.springSetting);
  if (ex.reformerSprings) meta.push("Reformer springs: " + ex.reformerSprings);
  if (ex.duration != null) meta.push(ex.duration + "s");
  if (ex.side && ex.side !== "N/A") meta.push(ex.side);
  if (ex.props) meta.push("Props: " + ex.props);
  if (ex.assistanceLevel) meta.push(ex.assistanceLevel);
  if (ex.box) meta.push("Box");
  return h("div", { style: { padding: "10px 0", borderBottom: "1px solid var(--separator)" } },
    h("div", { className: "flex-between" },
      h("span", { style: { fontWeight: 700, fontSize: 14.5 } }, (props.index + 1) + ". " + (ex.exerciseName || "Untitled exercise")),
      h(Badge, { tone: "neutral" }, ex.category)
    ),
    hasRealSetData && h("div", { style: { marginTop: 6, display: "flex", flexDirection: "column", gap: 2 } },
      setDetails.map(function (s, i) { return h("div", { key: s.id || i, className: "text-secondary", style: { fontSize: 12.5 } }, formatSetLine(s, i)); })
    ),
    meta.length > 0 && h("div", { className: "text-secondary", style: { fontSize: 12.5, marginTop: 4 } }, meta.join(" · ")),
    ex.notes && h("div", { className: "text-secondary", style: { fontSize: 12.5, marginTop: 4, fontStyle: "italic" } }, ex.notes)
  );
}
```
Replace with:
```javascript
function formatSetLine(s, i) {
  var parts = [];
  if (s.reps != null) parts.push(s.reps + " reps");
  if (s.weight) parts.push(s.weight);
  if (s.holdSeconds != null) parts.push(s.holdSeconds + "s hold");
  if (s.restSeconds != null) parts.push(s.restSeconds + "s rest");
  return "Set " + (i + 1) + (parts.length ? ": " + parts.join(", ") : " — no detail recorded");
}
function formatSpringLine(sp) {
  var parts = [];
  if (sp.count != null) parts.push(sp.count + "x");
  if (sp.color) parts.push(sp.color);
  if (sp.level) parts.push("level " + sp.level);
  return parts.join(" ") || "Spring";
}
function ExerciseSummary(props) {
  var ex = props.exercise;
  var setDetails = normalizedSetDetails(ex);
  var springs = normalizedSprings(ex);
  var selectedProps = normalizedProps(ex);
  var hasRealSetData = setDetails.some(function (s) { return s.reps != null || s.weight || s.restSeconds != null || s.holdSeconds != null; });
  var meta = [];
  if (ex.distance) meta.push(ex.distance);
  if (ex.intensity) meta.push(ex.intensity);
  if (ex.duration != null) meta.push(ex.duration + "s");
  if (ex.side && ex.side !== "N/A") meta.push(ex.side);
  if (springs.length) meta.push("Springs: " + springs.map(formatSpringLine).join(", "));
  if (selectedProps.length) meta.push("Props: " + selectedProps.map(function (p) { return p.value ? p.name + " (" + p.value + ")" : p.name; }).join(", "));
  if (ex.assistanceLevel) meta.push(ex.assistanceLevel);
  if (ex.box) meta.push("Box");
  return h("div", { style: { padding: "10px 0", borderBottom: "1px solid var(--separator)" } },
    h("div", { className: "flex-between" },
      h("span", { style: { fontWeight: 700, fontSize: 14.5 } }, (props.index + 1) + ". " + (ex.exerciseName || "Untitled exercise")),
      h(Badge, { tone: "neutral" }, ex.category)
    ),
    hasRealSetData && h("div", { style: { marginTop: 6, display: "flex", flexDirection: "column", gap: 2 } },
      setDetails.map(function (s, i) { return h("div", { key: s.id || i, className: "text-secondary", style: { fontSize: 12.5 } }, formatSetLine(s, i)); })
    ),
    meta.length > 0 && h("div", { className: "text-secondary", style: { fontSize: 12.5, marginTop: 4 } }, meta.join(" · ")),
    ex.notes && h("div", { className: "text-secondary", style: { fontSize: 12.5, marginTop: 4, fontStyle: "italic" } }, ex.notes)
  );
}
```

- [ ] **Step 2: Syntax-check and rerun the full test suite**

Run: `node -c app.js && node test/data.test.js && node test/charts.test.js && node test/movementScreen.test.js && node test/exerciseStructure.test.js`
Expected: no syntax errors, all four test files print their "all assertions passed" line.

- [ ] **Step 3: Commit**

```bash
git add app.js
git commit -m "feat: display structured springs/props in ExerciseSummary"
```

---

### Task 5: Manual verification in the browser

**Files:** none (verification only)

- [ ] **Step 1:** Reload the app (hard refresh to bypass any cached JS), sign in, open a client, log a new session.
- [ ] **Step 2:** Add an exercise, category **Pilates** — confirm: Sets show only Reps + Rest (no Weight input), a Springs section appears with Color/Count/Level rows and "Add spring" works, a Props section appears with the chip picker + custom-add input, Assistance level + Box-used still appear.
- [ ] **Step 3:** Add a second exercise, category **Strength** — confirm: Sets show Reps + Weight + Rest (unchanged), no Springs section, Props section still appears, no Assistance/Box fields.
- [ ] **Step 4:** Add a third exercise, category **Cardio** — confirm: no Sets block at all, Distance and Intensity fields appear instead, no Springs/Props/Assistance/Box.
- [ ] **Step 5:** Add a fourth exercise, category **Mobility** — confirm: Sets show only a Hold (sec) field, Props section appears, no Springs/weight/Assistance/Box.
- [ ] **Step 6:** Save the session, open it from Session History, confirm `ExerciseSummary` shows the springs (e.g. "Springs: 3x Red level 1") and props (e.g. "Props: Dumbbell (2kg), Magic Circle") correctly for the Pilates exercise, and reasonable output for the others.
- [ ] **Step 7:** Check at iPhone width (375px) in the browser pane that the new Springs/Props rows don't overflow or look cramped.

---

### Task 6: Push to GitHub

```bash
git push origin main
```
