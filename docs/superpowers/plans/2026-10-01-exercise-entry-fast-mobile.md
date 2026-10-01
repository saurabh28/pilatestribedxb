# Exercise Entry: Fast, iPhone-First Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the keyboard-heavy exercise-entry form with tap-first controls (chips, steppers, segmented controls), add a collapsed glance-state for already-filled exercises, add an optional Steps structure for choreographed combos, and fix two real iPhone bugs (missing safe-area insets, under-sized tap targets) — all without changing any already-saved data.

**Architecture:** Extract the exercise-editor code (currently inline in `app.js`) into its own file, `exerciseEditor.js`, both because it's about to roughly double in size and because it lets the new pure functions be unit-tested without stubbing React's render pipeline the way testing anything in `app.js` itself would require (`app.js` calls `ReactDOM.createRoot(...).render(...)` at load time; `exerciseEditor.js` will not). Everything stays vanilla JS/`h()`, no build step, no new dependencies.

**Tech Stack:** Vanilla JS, React 18 UMD (`h`/`useState` globals from `icons.js`), plain `<script>` tags, Node `vm`-based test harness (`test/helpers/load-browser-script.js`).

---

## File Structure

- **Create** `exerciseEditor.js` — all exercise-editing pure functions and components, moved from `app.js`: `blankSetDetail`, `blankExercise`, `blankSpring`, `blankSelectedProp`, `normalizedSetDetails`, `normalizedSprings`, `normalizedProps`, `cloneExerciseForRepeat`, `flipSide`, `ExerciseEditor`, `ExerciseRow`, `formatSetLine`, `formatSpringLine`, `ExerciseSummary`. Plus new: `blankStep`, `normalizedSteps`, `exerciseHasData`, `topExerciseNames`, `formatStepLine`, `Stepper`.
- **Modify** `app.js` — remove the code that moved out; at the two `h(ExerciseEditor, {...})` call sites (`SessionFormPage`, `ProgramFormPage`), add a `useAllSessions()` call and pass the result through as a new `allSessions` prop.
- **Modify** `index.html` — add `<script src="exerciseEditor.js"></script>` immediately before the existing `<script src="app.js"></script>`.
- **Modify** `sw.js` — add `"./exerciseEditor.js"` to `SHELL_FILES`, bump `CACHE_NAME` so installed PWAs actually fetch the new file instead of running a stale cached shell that's missing it.
- **Modify** `styles.css` — new `.stepper`/`.stepper-value` styles, safe-area insets, 44px tap-target bumps, collapsed-card summary styles.
- **Create** `test/exerciseEditor.test.js` — Node tests for every new/moved pure function.

---

## Task 1: Extract exercise-editor code into `exerciseEditor.js`, no behavior change

**Files:**
- Create: `exerciseEditor.js`
- Modify: `app.js:143-438` (delete the block being moved)
- Modify: `index.html:39-40`
- Modify: `sw.js:5,6-20`
- Create: `test/exerciseEditor.test.js`

- [ ] **Step 1: Create `exerciseEditor.js` with the moved code, verbatim**

Create `exerciseEditor.js` with exactly this content (this is `app.js` lines 143-438 today, unchanged):

```js
/* Exercise editor — blank/normalize/clone helpers, ExerciseEditor,
   ExerciseRow, and the read-only ExerciseSummary. Pulled out of app.js
   because this file is about to grow substantially (fast-entry redesign)
   and because keeping it free of app.js's boot()/ReactDOM call lets its
   pure functions be unit-tested without stubbing React's render pipeline. */

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
/* Single-limb exercises (side = Left/Right) are usually logged twice, once
   per side, with the same category/sets/springs/props and only a marginal
   difference (e.g. a lighter spring on the weaker side). Every nested id
   (sets, springs, props) gets freshly generated so editing the copy never
   mutates the original. Used by the "log other side" checkbox below, not by
   plain "Add exercise" -- that stays a blank exercise so unrelated exercises
   don't need to be cleared out of a stale copy. */
function cloneExerciseForRepeat(ex) {
  return Object.assign({}, ex, {
    id: generateId(),
    setDetails: (ex.setDetails || []).map(function (s) { return Object.assign({}, s, { id: generateId() }); }),
    springs: (ex.springs || []).map(function (s) { return Object.assign({}, s, { id: generateId() }); }),
    selectedProps: (ex.selectedProps || []).map(function (p) { return Object.assign({}, p, { id: generateId() }); }),
  });
}
function flipSide(side) {
  if (side === "Left") return "Right";
  if (side === "Right") return "Left";
  return side;
}
function ExerciseEditor(props) {
  var exercises = props.exercises;
  function update(id, patch) { props.onChange(exercises.map(function (e) { return e.id === id ? Object.assign({}, e, patch) : e; })); }
  function remove(id) { props.onChange(exercises.filter(function (e) { return e.id !== id; })); }
  function add() {
    props.onChange(exercises.concat([blankExercise()]));
  }
  function logOtherSide(id) {
    var idx = exercises.findIndex(function (e) { return e.id === id; });
    if (idx === -1) return;
    var clone = cloneExerciseForRepeat(exercises[idx]);
    clone.side = flipSide(exercises[idx].side);
    var next = exercises.slice();
    next.splice(idx + 1, 0, clone);
    props.onChange(next);
  }

  return h("div", null,
    exercises.length === 0 && h("p", { className: "text-secondary", style: { marginBottom: 12, fontSize: 13.5 } }, "No exercises added yet. Add each exercise performed this session."),
    exercises.map(function (ex, i) { return h(ExerciseRow, { key: ex.id, index: i, exercise: ex, onChange: function (patch) { update(ex.id, patch); }, onRemove: function () { remove(ex.id); }, onLogOtherSide: function () { logOtherSide(ex.id); } }); }),
    h(Button, { type: "button", variant: "secondary", className: "btn-block", onClick: add }, h(PlusCircleIcon, { width: 18, height: 18 }), "Add exercise")
  );
}
function ExerciseRow(props) {
  var ex = props.exercise;
  var config = CATEGORY_FIELD_CONFIG[ex.category] || CATEGORY_FIELD_CONFIG.Other;
  var idp = "ex-" + ex.id;
  var setDetails = normalizedSetDetails(ex);
  var springs = normalizedSprings(ex);
  var selectedProps = normalizedProps(ex);
  var _cp = useState(""), customPropInput = _cp[0], setCustomPropInput = _cp[1];
  var _os = useState(false), otherSideAdded = _os[0], setOtherSideAdded = _os[1];
  var canLogOtherSide = ex.side === "Left" || ex.side === "Right";

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
  function addSpring() {
    var last = springs[springs.length - 1];
    var copy = last ? Object.assign({}, last, { id: generateId() }) : blankSpring();
    props.onChange({ springs: springs.concat([copy]) });
  }
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

    canLogOtherSide && h("label", { className: "checkbox-row", style: { marginBottom: 10 } },
      h("input", {
        type: "checkbox", checked: otherSideAdded, disabled: otherSideAdded,
        onChange: function (e) {
          if (!e.target.checked || otherSideAdded) return;
          setOtherSideAdded(true);
          props.onLogOtherSide();
        },
      }),
      otherSideAdded ? "Other side added below — edit what's different" : "Also log the other side (adds a copy with side flipped)"
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
      h("datalist", { id: idp + "-spring-colors" }, SPRING_COLORS.map(function (c) { return h("option", { key: c, value: c }); })),
      springs.map(function (sp, i) {
        var spidp = idp + "-spring-" + sp.id;
        return h("div", { key: sp.id, className: "set-row" },
          h("span", { className: "set-row-index", "aria-hidden": true }, i + 1),
          h("div", { className: "form-field" },
            h("label", { className: "form-label", htmlFor: spidp + "-color" }, "Color"),
            h("input", { id: spidp + "-color", className: "input", list: idp + "-spring-colors", value: sp.color || "", onChange: function (e) { updateSpring(sp.id, { color: e.target.value }); }, placeholder: "e.g. Red" })
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

- [ ] **Step 2: Delete the moved block from `app.js`**

In `app.js`, delete everything from the `/* Exercise editor */` section header comment (line 140) through the closing `}` of `ExerciseSummary` (this is lines 140-438 as of this writing — confirm by searching for the `/* Exercise editor` comment and the `/* ---... Dashboard` comment that follows the moved block, and delete everything between them, including the "Exercise editor" header but not the "Dashboard" header). Leave everything else in `app.js` untouched.

- [ ] **Step 3: Wire up the new script in `index.html`**

In `index.html`, find:
```html
<script src="charts.js"></script>
<script src="app.js"></script>
```
Replace with:
```html
<script src="charts.js"></script>
<script src="exerciseEditor.js"></script>
<script src="app.js"></script>
```

- [ ] **Step 4: Add the new file to the service-worker cache and bump the cache version**

In `sw.js`, find:
```js
var CACHE_NAME = "cst-shell-v2";
var SHELL_FILES = [
  "./",
  "./index.html",
  "./styles.css",
  "./config.js",
  "./data.js",
  "./icons.js",
  "./ui.js",
  "./charts.js",
  "./app.js",
```
Replace with:
```js
var CACHE_NAME = "cst-shell-v3";
var SHELL_FILES = [
  "./",
  "./index.html",
  "./styles.css",
  "./config.js",
  "./data.js",
  "./icons.js",
  "./ui.js",
  "./charts.js",
  "./exerciseEditor.js",
  "./app.js",
```
(The version bump matters: the `activate` handler deletes any cache whose name isn't the current `CACHE_NAME`, which is what makes an already-installed PWA actually re-fetch the new file set on next load instead of running a stale shell that's missing `exerciseEditor.js` entirely.)

- [ ] **Step 5: Create the test harness and first regression tests**

Create `test/exerciseEditor.test.js`:

```js
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

console.log("exerciseEditor.test.js: all assertions passed");
```

- [ ] **Step 6: Run the test**

Run:
```bash
node test/exerciseEditor.test.js
```
Expected: `exerciseEditor.test.js: all assertions passed`

- [ ] **Step 7: Run the full existing test suite to confirm nothing else broke**

Run:
```bash
node test/data.test.js && node test/charts.test.js && node test/movementScreen.test.js && node test/exerciseStructure.test.js
```
Expected: all four print their "all assertions passed" lines.

- [ ] **Step 8: Manual smoke check in the browser**

Start the local static server and open the app (use whatever local server this project already uses, e.g. `node scratch-static-server.js` on port 5050, or the project's `preview_start` tool config if one exists). Sign in, open any client, start a new session, click "Add exercise," confirm the exercise card renders exactly as before (no console errors about `ExerciseEditor`/`ExerciseRow` being undefined — this would mean the script tag order is wrong).

- [ ] **Step 9: Commit**

```bash
git add exerciseEditor.js app.js index.html sw.js test/exerciseEditor.test.js
git commit -m "refactor: extract exercise editor into its own file

Pulled blankExercise/normalizedX/cloneExerciseForRepeat/ExerciseEditor/
ExerciseRow/ExerciseSummary out of app.js and into exerciseEditor.js,
no behavior change. app.js calls boot() -> ReactDOM.render at load
time, which made it untestable via the Node vm harness; this file
doesn't, so its pure functions get their first unit test coverage.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 2: `steps` field for combo exercises

**Files:**
- Modify: `exerciseEditor.js` (`blankExercise`, add `blankStep`, `normalizedSteps`, update `cloneExerciseForRepeat`)
- Modify: `test/exerciseEditor.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `test/exerciseEditor.test.js`, before the final `console.log` line:

```js
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node test/exerciseEditor.test.js`
Expected: `AssertionError` — `blankExercise()` has no `steps` property yet, and `blankStep`/`normalizedSteps` aren't defined.

- [ ] **Step 3: Implement**

In `exerciseEditor.js`, find:
```js
function blankExercise() {
  return {
    id: generateId(), exerciseName: "", category: "Pilates", setDetails: [blankSetDetail()],
    duration: null, distance: "", intensity: "", side: "N/A", notes: "",
    springs: [], selectedProps: [], box: false, assistanceLevel: "",
  };
}
```
Replace with:
```js
function blankExercise() {
  return {
    id: generateId(), exerciseName: "", category: "Pilates", setDetails: [blankSetDetail()],
    duration: null, distance: "", intensity: "", side: "N/A", notes: "",
    springs: [], selectedProps: [], box: false, assistanceLevel: "", steps: [],
  };
}
/* A choreographed combo (e.g. "bridge hold -> leg raises -> pulses") broken
   into ordered phases. Optional and universal across every category -- not
   gated by CATEGORY_FIELD_CONFIG the way sets/springs/props are, since a
   Strength complex or a Yoga flow is the same shape of problem as a Pilates
   combo. Whether a saved exercise is "in sequence mode" is simply
   `steps.length > 0`; there's no separate persisted flag. */
function blankStep() {
  return { id: generateId(), label: "", reps: null, holdSeconds: null };
}
```

Then find:
```js
function normalizedProps(ex) {
  if (ex.selectedProps && ex.selectedProps.length) return ex.selectedProps;
  if (ex.props) return [{ id: "legacy-" + ex.id, name: ex.props, value: "" }];
  return [];
}
```
Add immediately after it:
```js
function normalizedSteps(ex) {
  return ex.steps || [];
}
```

Then find:
```js
function cloneExerciseForRepeat(ex) {
  return Object.assign({}, ex, {
    id: generateId(),
    setDetails: (ex.setDetails || []).map(function (s) { return Object.assign({}, s, { id: generateId() }); }),
    springs: (ex.springs || []).map(function (s) { return Object.assign({}, s, { id: generateId() }); }),
    selectedProps: (ex.selectedProps || []).map(function (p) { return Object.assign({}, p, { id: generateId() }); }),
  });
}
```
Replace with:
```js
function cloneExerciseForRepeat(ex) {
  return Object.assign({}, ex, {
    id: generateId(),
    setDetails: (ex.setDetails || []).map(function (s) { return Object.assign({}, s, { id: generateId() }); }),
    springs: (ex.springs || []).map(function (s) { return Object.assign({}, s, { id: generateId() }); }),
    selectedProps: (ex.selectedProps || []).map(function (p) { return Object.assign({}, p, { id: generateId() }); }),
    steps: (ex.steps || []).map(function (s) { return Object.assign({}, s, { id: generateId() }); }),
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node test/exerciseEditor.test.js`
Expected: `exerciseEditor.test.js: all assertions passed`

- [ ] **Step 5: Commit**

```bash
git add exerciseEditor.js test/exerciseEditor.test.js
git commit -m "feat: add steps field for choreographed combo exercises

Optional, defaults to [], available across every category. No
migration needed -- exercises is stored as JSONB, old exercises just
read back with steps: [] via normalizedSteps.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 3: `topExerciseNames` — recent exercise-name suggestions

**Files:**
- Modify: `exerciseEditor.js`
- Modify: `test/exerciseEditor.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `test/exerciseEditor.test.js`, before the final `console.log` line:

```js
// topExerciseNames: frequency ranking, scoped to the given category, tie-
// broken by most-recent session date, capped at `limit`.
function makeSession(date, exNames, category) {
  return { date: date, exercises: exNames.map(function (n) { return { exerciseName: n, category: category || "Pilates" }; }) };
}
var sessions = [
  makeSession("2026-09-01", ["Footwork", "Footwork", "Hundred"]),
  makeSession("2026-09-10", ["Footwork", "Leg Circles"]),
  makeSession("2026-09-20", ["Short Spine"]),
  makeSession("2026-09-05", ["Running"], "Cardio"),
];
var top = sandbox.topExerciseNames(sessions, "Pilates", 3);
assert.deepEqual(top, ["Footwork", "Hundred", "Leg Circles"]);
// Hundred (2026-09-01) and Leg Circles (2026-09-10) and Short Spine
// (2026-09-20) are all frequency 1; most-recent-first breaks the tie, and
// the limit of 3 cuts off Short Spine even though it's the most recent.

assert.deepEqual(sandbox.topExerciseNames(sessions, "Cardio", 8), ["Running"]);
assert.deepEqual(sandbox.topExerciseNames([], "Pilates", 8), []);
assert.deepEqual(sandbox.topExerciseNames(undefined, "Pilates", 8), []);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node test/exerciseEditor.test.js`
Expected: `TypeError: sandbox.topExerciseNames is not a function`

- [ ] **Step 3: Implement**

In `exerciseEditor.js`, add this function right after `normalizedSteps`:

```js
/* Up to `limit` of the trainer's most-used exercise names for `category`,
   across every session ever logged (any client) -- shown as tappable
   suggestion chips above the exercise-name field so a brand-new exercise
   entry (not a clone) still rarely needs typing. Ties in frequency are
   broken by most-recent use. Pure function of already-loaded session data;
   writes nothing, reads nothing new. */
function topExerciseNames(allSessions, category, limit) {
  var lastUsed = {};
  var counts = {};
  (allSessions || []).forEach(function (session) {
    (session.exercises || []).forEach(function (ex) {
      if (ex.category !== category || !ex.exerciseName) return;
      counts[ex.exerciseName] = (counts[ex.exerciseName] || 0) + 1;
      if (!lastUsed[ex.exerciseName] || session.date > lastUsed[ex.exerciseName]) {
        lastUsed[ex.exerciseName] = session.date;
      }
    });
  });
  return Object.keys(counts)
    .sort(function (a, b) {
      if (counts[b] !== counts[a]) return counts[b] - counts[a];
      return lastUsed[b] < lastUsed[a] ? -1 : lastUsed[b] > lastUsed[a] ? 1 : 0;
    })
    .slice(0, limit);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node test/exerciseEditor.test.js`
Expected: `exerciseEditor.test.js: all assertions passed`

- [ ] **Step 5: Commit**

```bash
git add exerciseEditor.js test/exerciseEditor.test.js
git commit -m "feat: add topExerciseNames for recent-name suggestion chips

Pure function over already-loaded session history, category-scoped,
recency tie-break. Wired into the UI in a later task.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 4: iPhone safe-area insets and minimum tap targets

**Files:**
- Modify: `styles.css`

- [ ] **Step 1: Add safe-area padding**

In `styles.css`, find:
```css
.bottom-nav {
  position: fixed; bottom: 0; left: 0; right: 0; display: flex;
  background: var(--nav-bg); backdrop-filter: saturate(180%) blur(20px); -webkit-backdrop-filter: saturate(180%) blur(20px);
  border-top: 1px solid var(--separator); z-index: 40;
}
```
Replace with:
```css
.bottom-nav {
  position: fixed; bottom: 0; left: 0; right: 0; display: flex;
  background: var(--nav-bg); backdrop-filter: saturate(180%) blur(20px); -webkit-backdrop-filter: saturate(180%) blur(20px);
  border-top: 1px solid var(--separator); z-index: 40;
  padding-bottom: env(safe-area-inset-bottom);
}
```

Find:
```css
.page-header {
  position: sticky; top: 0; z-index: 20; background: var(--nav-bg);
  backdrop-filter: saturate(180%) blur(20px); -webkit-backdrop-filter: saturate(180%) blur(20px);
  padding: 12px 16px; border-bottom: 1px solid var(--separator);
  display: flex; align-items: center; gap: 10px; min-height: 52px;
}
```
Replace with:
```css
.page-header {
  position: sticky; top: 0; z-index: 20; background: var(--nav-bg);
  backdrop-filter: saturate(180%) blur(20px); -webkit-backdrop-filter: saturate(180%) blur(20px);
  padding: calc(12px + env(safe-area-inset-top)) 16px 12px; border-bottom: 1px solid var(--separator);
  display: flex; align-items: center; gap: 10px; min-height: 52px;
}
```

Find:
```css
.modal-sheet { background: var(--surface); border-radius: 18px; width: 100%; max-width: 420px; padding: 22px; box-shadow: var(--shadow); max-height: calc(100vh - 24px); overflow-y: auto; }
```
Replace with:
```css
.modal-sheet { background: var(--surface); border-radius: 18px; width: 100%; max-width: 420px; padding: 22px; padding-bottom: calc(22px + env(safe-area-inset-bottom)); box-shadow: var(--shadow); max-height: calc(100vh - 24px); overflow-y: auto; }
```

- [ ] **Step 2: Bump under-sized tap targets to 44px**

Find:
```css
.icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; border-radius: 999px; color: var(--accent); background: none; border: none; cursor: pointer; flex-shrink: 0; }
```
Replace with:
```css
.icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 44px; border-radius: 999px; color: var(--accent); background: none; border: none; cursor: pointer; flex-shrink: 0; }
```

Find:
```css
.set-remove-btn {
  width: 30px; height: 30px; border-radius: 8px; border: none; background: var(--pill-bg); color: var(--danger);
  display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; margin-bottom: 1px;
}
```
Replace with:
```css
.set-remove-btn {
  width: 44px; height: 44px; border-radius: 8px; border: none; background: var(--pill-bg); color: var(--danger);
  display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; margin-bottom: 1px;
}
```

- [ ] **Step 3: Manual verification**

Open the app in the browser preview, use `resize_window` with the `mobile` preset, and confirm: (a) the bottom nav and any open modal still render correctly with no visual overlap or clipping, (b) `icon-btn`/`set-remove-btn` elements look the same size relative to surrounding content (44px is a modest bump from 30-34px, shouldn't look obviously different) — note that `env(safe-area-inset-*)` evaluates to `0` in a desktop browser preview (there's no notch/home-indicator to inset around), so this specific fix can only be fully confirmed on an actual iPhone; note that limitation rather than claiming full verification.

- [ ] **Step 4: Commit**

```bash
git add styles.css
git commit -m "fix: iPhone safe-area insets and 44px minimum tap targets

viewport-fit=cover was set but nothing padded for the notch/home-
indicator, so content could sit flush against them in standalone PWA
mode. icon-btn and set-remove-btn were also under Apple's 44pt HIG
minimum.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 5: `Stepper` component, wired into Sets (reps/rest/hold)

**Files:**
- Modify: `exerciseEditor.js`
- Modify: `styles.css`

- [ ] **Step 1: Add the `Stepper` component**

In `exerciseEditor.js`, add this near the top, right after `blankStep`/`normalizedSteps`:

```js
/* Generic tap-first numeric control: - value + buttons, with the value
   itself tappable to drop into a focused, select-all number input for an
   exact/unusual value (e.g. 47s rest), then reverts to stepper display on
   blur or Enter. One mechanism, reused for every reps/rest/hold/spring-
   count field instead of building a second "type an exact value" control.
   `value` may be null (treated as 0 for display and as the base for +/-;
   typing a value and blurring with the field empty commits null, same as
   the old free-text inputs' "no value entered" state). */
function Stepper(props) {
  var display = props.value == null ? 0 : props.value;
  var _editing = useState(false), editing = _editing[0], setEditing = _editing[1];
  var _draft = useState(""), draft = _draft[0], setDraft = _draft[1];

  function clamp(v) { return Math.max(props.min, Math.min(props.max, v)); }
  function dec() { props.onChange(clamp(display - props.step)); }
  function inc() { props.onChange(clamp(display + props.step)); }
  function startEdit() { setDraft(String(display)); setEditing(true); }
  function commitEdit() {
    var trimmed = draft.trim();
    if (trimmed === "") { props.onChange(null); }
    else { var n = Number(trimmed); props.onChange(isNaN(n) ? null : clamp(n)); }
    setEditing(false);
  }

  if (editing) {
    return h("div", { className: "stepper" },
      h("button", { type: "button", "aria-label": (props.ariaLabel || "value") + " decrease", onClick: dec }, "−"),
      h("input", {
        className: "stepper-input", type: "number", inputMode: "numeric", autoFocus: true, value: draft,
        onChange: function (e) { setDraft(e.target.value); },
        onBlur: commitEdit,
        onKeyDown: function (e) { if (e.key === "Enter") { e.preventDefault(); commitEdit(); } },
      }),
      h("button", { type: "button", "aria-label": (props.ariaLabel || "value") + " increase", onClick: inc }, "+")
    );
  }
  return h("div", { className: "stepper" },
    h("button", { type: "button", "aria-label": (props.ariaLabel || "value") + " decrease", onClick: dec }, "−"),
    h("button", { type: "button", className: "stepper-value", onClick: startEdit }, String(display)),
    h("button", { type: "button", "aria-label": (props.ariaLabel || "value") + " increase", onClick: inc }, "+")
  );
}
```

- [ ] **Step 2: Add `.stepper` CSS**

In `styles.css`, add after the `.set-remove-btn:hover` rule:

```css
.stepper { display: flex; align-items: center; gap: 4px; background: var(--pill-bg); border-radius: 11px; padding: 4px; width: fit-content; }
.stepper button { width: 36px; height: 36px; min-width: 44px; min-height: 44px; border-radius: 9px; border: none; background: var(--surface); box-shadow: 0 1px 2px rgba(0,0,0,.12); font-weight: 700; font-size: 17px; color: var(--accent); cursor: pointer; display: flex; align-items: center; justify-content: center; font-family: inherit; }
.stepper-value { min-width: 48px; font-size: 15px; font-weight: 700; color: var(--text); }
.stepper-input { width: 48px; min-height: 44px; text-align: center; font-size: 15px; font-weight: 700; border: 1px solid var(--accent); border-radius: 8px; background: var(--surface); color: var(--text); font-family: inherit; }
```

(`.stepper button`'s visible box stays a compact 36px so steppers don't look oversized next to text, but `min-width`/`min-height: 44px` extends the actual tappable hit area to meet the iPhone tap-target fix from Task 4 — the visual size and the tap target don't have to be the same thing.)

- [ ] **Step 3: Wire `Stepper` into the Sets block**

In `exerciseEditor.js`, inside `ExerciseRow`, find:
```js
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
```
Replace with:
```js
          config.setFields.indexOf("reps") !== -1 && h("div", { className: "form-field" },
            h("label", { className: "form-label" }, "Reps"),
            h(Stepper, { value: s.reps, min: 0, max: 50, step: 1, ariaLabel: "Reps", onChange: function (v) { updateSet(s.id, { reps: v }); } })
          ),
          config.setFields.indexOf("weight") !== -1 && h("div", { className: "form-field" },
            h("label", { className: "form-label", htmlFor: sidp + "-weight" }, "Weight / resistance"),
            h("input", { id: sidp + "-weight", className: "input", value: s.weight || "", onChange: setTxt(s.id, "weight"), placeholder: "e.g. 20kg, red band" })
          ),
          config.setFields.indexOf("holdSeconds") !== -1 && h("div", { className: "form-field" },
            h("label", { className: "form-label" }, "Hold (sec)"),
            h(Stepper, { value: s.holdSeconds, min: 0, max: 300, step: 5, ariaLabel: "Hold seconds", onChange: function (v) { updateSet(s.id, { holdSeconds: v }); } })
          ),
          config.setFields.indexOf("restSeconds") !== -1 && h("div", { className: "form-field" },
            h("label", { className: "form-label" }, "Rest (sec)"),
            h(Stepper, { value: s.restSeconds, min: 0, max: 300, step: 5, ariaLabel: "Rest seconds", onChange: function (v) { updateSet(s.id, { restSeconds: v }); } })
          ),
```

- [ ] **Step 4: Manual verification**

Open the app in the browser preview, add a Pilates exercise, confirm the Reps and Rest fields render as `− N +` steppers, tapping +/- changes the value, tapping the number itself turns it into a focused input, typing a value and tapping elsewhere (blur) commits it back to stepper display. Switch category to Strength/Mobility/Yoga and confirm their respective set fields (reps+weight+rest, or hold-only) still render correctly per `CATEGORY_FIELD_CONFIG`.

- [ ] **Step 5: Commit**

```bash
git add exerciseEditor.js styles.css
git commit -m "feat: add Stepper control, wire into Sets reps/rest/hold

Tap +/- for the common case, tap the value to type an exact number
for the rare one. Replaces number-input keyboards for these three
fields; weight/resistance stays free text (mixed units)."
```

---

## Task 6: Side → segmented control, Category → chips

**Files:**
- Modify: `exerciseEditor.js`

- [ ] **Step 1: Replace the Category and Side selects with chips/segmented**

In `exerciseEditor.js`, inside `ExerciseRow`'s returned JSX, find:
```js
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
```
Replace with:
```js
      h("div", { className: "form-field", style: { gridColumn: "1 / -1" } },
        h("label", { className: "form-label" }, "Category"),
        h("div", { className: "chip-group" },
          EXERCISE_CATEGORIES.map(function (c) {
            return h("button", {
              type: "button", key: c, className: classNames("chip", ex.category === c && "selected"),
              "aria-pressed": ex.category === c, onClick: function () { props.onChange({ category: c }); },
            }, c);
          })
        )
      ),
      h("div", { className: "form-field", style: { gridColumn: "1 / -1" } },
        h("label", { className: "form-label" }, "Side"),
        h("div", { className: "segmented" },
          SIDES.map(function (s) {
            return h("button", {
              type: "button", key: s, className: classNames(ex.side === s && "active"),
              onClick: function () { props.onChange({ side: s }); },
            }, s);
          })
        )
      ),
```

- [ ] **Step 2: Manual verification**

In the browser preview, confirm Category renders as 7 tappable chips (wrapping to a second line on a narrow viewport) and Side renders as a 4-way segmented control, both reflecting and updating `ex.category`/`ex.side` correctly, and that switching category still correctly shows/hides the Sets/Springs/Props/Pilates-detail sections per `CATEGORY_FIELD_CONFIG` as before.

- [ ] **Step 3: Commit**

```bash
git add exerciseEditor.js
git commit -m "feat: Category and Side as tappable chips/segmented control

Replaces two native <select> dropdowns with the same chip/segmented
patterns already used for Props and (now) Stepper -- one tap instead
of opening a picker."
```

---

## Task 7: Spring rows — per-row color chips, count stepper, level chips

**Files:**
- Modify: `exerciseEditor.js`
- Modify: `styles.css`

- [ ] **Step 1: Add spring-row CSS**

In `styles.css`, add after the new `.stepper-input` rule from Task 5:

```css
.spring-row-card { background: var(--pill-bg); border-radius: 11px; padding: 10px; margin-bottom: 8px; }
.spring-row-head { display: flex; justify-content: space-between; margin-bottom: 8px; }
```

- [ ] **Step 2: Rewrite the Springs block**

In `exerciseEditor.js`, inside `ExerciseRow`, find the entire Springs block:
```js
    config.usesSprings && h("div", { style: { borderTop: "1px dashed var(--separator)", paddingTop: 10, marginBottom: 10 } },
      h("div", { className: "flex-between", style: { marginBottom: 8 } }, h("span", { className: "exercise-card-title" }, "Springs")),
      h("datalist", { id: idp + "-spring-colors" }, SPRING_COLORS.map(function (c) { return h("option", { key: c, value: c }); })),
      springs.map(function (sp, i) {
        var spidp = idp + "-spring-" + sp.id;
        return h("div", { key: sp.id, className: "set-row" },
          h("span", { className: "set-row-index", "aria-hidden": true }, i + 1),
          h("div", { className: "form-field" },
            h("label", { className: "form-label", htmlFor: spidp + "-color" }, "Color"),
            h("input", { id: spidp + "-color", className: "input", list: idp + "-spring-colors", value: sp.color || "", onChange: function (e) { updateSpring(sp.id, { color: e.target.value }); }, placeholder: "e.g. Red" })
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
```
Replace with:
```js
    config.usesSprings && h("div", { style: { borderTop: "1px dashed var(--separator)", paddingTop: 10, marginBottom: 10 } },
      h("div", { className: "flex-between", style: { marginBottom: 8 } }, h("span", { className: "exercise-card-title" }, "Springs")),
      springs.map(function (sp, i) {
        return h("div", { key: sp.id, className: "spring-row-card" },
          h("div", { className: "spring-row-head" },
            h("span", { className: "text-tertiary", style: { fontSize: 11, fontWeight: 700 } }, "SPRING " + (i + 1)),
            h("button", { type: "button", className: "exercise-remove-btn", "aria-label": "Remove spring " + (i + 1), onClick: function () { removeSpring(sp.id); } }, "Remove")
          ),
          h("div", { className: "chip-group", style: { marginBottom: 10 } },
            SPRING_COLORS.map(function (c) {
              return h("button", {
                type: "button", key: c, className: classNames("chip", sp.color === c && "selected"),
                "aria-pressed": sp.color === c, onClick: function () { updateSpring(sp.id, { color: c }); },
              }, c);
            })
          ),
          h("div", { className: "flex-row gap-12 wrap", style: { alignItems: "flex-start" } },
            h("div", { className: "form-field", style: { marginBottom: 0 } },
              h("label", { className: "form-label" }, "Count"),
              h(Stepper, { value: sp.count, min: 0, max: 6, step: 1, ariaLabel: "Spring count", onChange: function (v) { updateSpring(sp.id, { count: v }); } })
            ),
            h("div", { className: "form-field", style: { marginBottom: 0 } },
              h("label", { className: "form-label" }, "Level"),
              h("div", { className: "chip-group" },
                ["1", "2", "3"].map(function (lvl) {
                  return h("button", {
                    type: "button", key: lvl, className: classNames("chip", sp.level === lvl && "selected"),
                    "aria-pressed": sp.level === lvl, onClick: function () { updateSpring(sp.id, { level: lvl }); },
                  }, lvl);
                }).concat([
                  h("button", {
                    type: "button", key: "other", className: classNames("chip", ["1", "2", "3", ""].indexOf(sp.level) === -1 && "selected"),
                    onClick: function () { updateSpring(sp.id, { level: sp.level && ["1", "2", "3"].indexOf(sp.level) === -1 ? sp.level : " " }); },
                  }, "Other")
                ])
              ),
              ["1", "2", "3", ""].indexOf(sp.level) === -1 && h("input", {
                className: "input", style: { marginTop: 8, maxWidth: 120 }, value: sp.level === " " ? "" : sp.level,
                onChange: function (e) { updateSpring(sp.id, { level: e.target.value }); }, placeholder: "e.g. B2", autoFocus: true,
              })
            )
          )
        );
      }),
      h("button", { type: "button", className: "btn-text", style: { fontSize: 13, fontWeight: 700 }, onClick: addSpring }, h(PlusCircleIcon, { width: 16, height: 16 }), "Add spring")
    ),
```

(The `" "` sentinel for a freshly-chosen "Other" level, distinct from `""` (truly unset), is what makes the custom text input appear immediately on tapping "Other" even before the coach has typed anything — without it, an empty string would look identical to no level chosen at all and "Other" wouldn't visibly stay selected.)

- [ ] **Step 3: Guard against the "Other" sentinel leaking into the summary display**

The `" "` sentinel is truthy in JS, so if a coach taps "Other" and leaves it blank, `formatSpringLine`'s `if (sp.level)` check would render "level " with a stray trailing space. In `exerciseEditor.js`, find:
```js
function formatSpringLine(sp) {
  var parts = [];
  if (sp.count != null) parts.push(sp.count + "x");
  if (sp.color) parts.push(sp.color);
  if (sp.level) parts.push("level " + sp.level);
  return parts.join(" ") || "Spring";
}
```
Replace with:
```js
function formatSpringLine(sp) {
  var parts = [];
  if (sp.count != null) parts.push(sp.count + "x");
  if (sp.color) parts.push(sp.color);
  if (sp.level && sp.level.trim()) parts.push("level " + sp.level.trim());
  return parts.join(" ") || "Spring";
}
```

Add this case to `test/exerciseEditor.test.js`, before the final `console.log` line:
```js
// formatSpringLine ignores a blank/whitespace-only level (the "Other"
// chip's sentinel value before anything's been typed).
assert.strictEqual(sandbox.formatSpringLine({ count: 1, color: "Red", level: " " }), "1x Red");
```
Run `node test/exerciseEditor.test.js` and confirm it still passes.

- [ ] **Step 4: Manual verification**

In the browser preview, add a Pilates exercise, add two spring rows, set row 1 to Red/count 3/level 1 and row 2 to Blue/count 1/level 1 — confirm both rows keep independent values (this is the exact bug the spec caught: verify row 2's color selection does NOT also change row 1's displayed color or count). Tap "Other" on a level and confirm a text input appears and accepts a custom value like "B2". Remove a spring row and confirm only that row disappears.

- [ ] **Step 5: Commit**

```bash
git add exerciseEditor.js styles.css
git commit -m "feat: spring rows as chips/stepper, drop iOS-unreliable datalist

Each row keeps its own independent color/count/level -- same list
structure as before, just chip/stepper widgets instead of text
inputs. Also fixes a real bug: <input list> spring-color suggestions
were unreliable on iOS Safari; chips always work."
```

---

## Task 8: Steps (combo) UI

**Files:**
- Modify: `exerciseEditor.js`
- Modify: `styles.css`

- [ ] **Step 1: Add step-list CSS**

In `styles.css`, add after the `.spring-row-head` rule from Task 7:

```css
.step-item { display: flex; align-items: center; gap: 8px; background: var(--pill-bg); border-radius: 11px; padding: 9px 11px; margin-bottom: 7px; }
.step-num { width: 22px; height: 22px; border-radius: 999px; background: var(--accent); color: var(--accent-contrast); font-size: 11px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.step-name-input { flex: 1; border: none; background: none; font-size: 13.5px; font-weight: 600; color: var(--text); min-width: 0; }
.step-name-input:focus { outline: none; }
```

- [ ] **Step 2: Add the Steps toggle and list**

In `exerciseEditor.js`, inside `ExerciseRow`, add these helper functions right after `addCustomProp`:

```js
  var steps = normalizedSteps(ex);
  var _seqIntent = useState(steps.length > 0), sequenceIntent = _seqIntent[0], setSequenceIntent = _seqIntent[1];
  var isSequence = sequenceIntent || steps.length > 0;

  function updateStep(stepId, patch) {
    props.onChange({ steps: steps.map(function (s) { return s.id === stepId ? Object.assign({}, s, patch) : s; }) });
  }
  function addStep() {
    props.onChange({ steps: steps.concat([blankStep()]) });
  }
  function removeStep(stepId) {
    props.onChange({ steps: steps.filter(function (s) { return s.id !== stepId; }) });
  }
```

Then find the exercise-name field block:
```js
      h("div", { className: "form-field", style: { gridColumn: "1 / -1" } },
        h("label", { className: "form-label", htmlFor: idp + "-name" }, "Exercise name"),
        h("input", { id: idp + "-name", className: "input", value: ex.exerciseName, onChange: txt("exerciseName"), placeholder: "e.g. Footwork on reformer" })
      ),
```
Replace with:
```js
      h("div", { className: "form-field", style: { gridColumn: "1 / -1" } },
        h("label", { className: "form-label", htmlFor: idp + "-name" }, "Exercise name"),
        h("input", { id: idp + "-name", className: "input", value: ex.exerciseName, onChange: txt("exerciseName"), placeholder: "e.g. Footwork on reformer" })
      ),
      h("div", { className: "form-field", style: { gridColumn: "1 / -1" } },
        h("label", { className: "form-label" }, "This exercise is"),
        h("div", { className: "chip-group", style: { marginBottom: isSequence ? 10 : 0 } },
          h("button", { type: "button", className: classNames("chip", !isSequence && "selected"), onClick: function () { setSequenceIntent(false); } }, "One movement"),
          h("button", { type: "button", className: classNames("chip", isSequence && "selected"), onClick: function () { setSequenceIntent(true); } }, "A sequence of steps")
        ),
        isSequence && h("div", null,
          steps.map(function (s, i) {
            return h("div", { key: s.id, className: "step-item" },
              h("span", { className: "step-num", "aria-hidden": true }, i + 1),
              h("input", { className: "step-name-input", value: s.label, onChange: function (e) { updateStep(s.id, { label: e.target.value }); }, placeholder: "e.g. Leg raises" }),
              h(Stepper, { value: s.reps != null ? s.reps : s.holdSeconds, min: 0, max: s.holdSeconds != null ? 300 : 50, step: s.holdSeconds != null ? 5 : 1, ariaLabel: "Step quantity",
                onChange: function (v) { updateStep(s.id, s.holdSeconds != null ? { holdSeconds: v } : { reps: v }); } }),
              h("button", { type: "button", className: "set-remove-btn", "aria-label": "Remove step " + (i + 1), onClick: function () { removeStep(s.id); } }, h(XIcon, { width: 14, height: 14 }))
            );
          }),
          h("button", { type: "button", className: "btn-text", style: { fontSize: 13, fontWeight: 700 }, onClick: addStep }, h(PlusCircleIcon, { width: 16, height: 16 }), "Add step")
        )
      ),
```

- [ ] **Step 3: Add the Sets caption when in sequence mode**

In `exerciseEditor.js`, find:
```js
    config.usesSets && h("div", { style: { borderTop: "1px dashed var(--separator)", paddingTop: 10, marginBottom: 10 } },
      h("div", { className: "flex-between", style: { marginBottom: 8 } },
        h("span", { className: "exercise-card-title" }, "Sets"),
        h("span", { className: "text-tertiary", style: { fontSize: 11 } }, setDetails.length + " set" + (setDetails.length === 1 ? "" : "s"))
      ),
```
Replace with:
```js
    config.usesSets && h("div", { style: { borderTop: "1px dashed var(--separator)", paddingTop: 10, marginBottom: 10 } },
      h("div", { className: "flex-between", style: { marginBottom: 8 } },
        h("span", { className: "exercise-card-title" }, "Sets"),
        h("span", { className: "text-tertiary", style: { fontSize: 11 } }, setDetails.length + " set" + (setDetails.length === 1 ? "" : "s"))
      ),
      isSequence && h("p", { className: "form-hint", style: { marginTop: -4, marginBottom: 8 } }, "Sets = how many times you repeat this whole sequence. Springs/props below are shared across all steps."),
```

- [ ] **Step 4: Each step's quantity defaults to reps, not hold — add an explicit toggle**

A step with both `reps` and `holdSeconds` null (a freshly-added step) needs to default its `Stepper` to reps mode, and the coach needs a way to switch a given step to hold-seconds mode. In `exerciseEditor.js`, find the step-item block just added in Step 2 and replace the single `Stepper` line:
```js
              h(Stepper, { value: s.reps != null ? s.reps : s.holdSeconds, min: 0, max: s.holdSeconds != null ? 300 : 50, step: s.holdSeconds != null ? 5 : 1, ariaLabel: "Step quantity",
                onChange: function (v) { updateStep(s.id, s.holdSeconds != null ? { holdSeconds: v } : { reps: v }); } }),
```
with:
```js
              h("div", { className: "flex-row gap-8" },
                h("button", {
                  type: "button", className: classNames("chip", "sm", s.holdSeconds == null && "selected"),
                  onClick: function () { updateStep(s.id, { holdSeconds: null }); },
                }, "Reps"),
                h("button", {
                  type: "button", className: classNames("chip", "sm", s.holdSeconds != null && "selected"),
                  onClick: function () { updateStep(s.id, { holdSeconds: s.holdSeconds == null ? 0 : s.holdSeconds, reps: null }); },
                }, "Hold"),
                h(Stepper, {
                  value: s.holdSeconds != null ? s.holdSeconds : s.reps, min: 0, max: s.holdSeconds != null ? 300 : 50, step: s.holdSeconds != null ? 5 : 1, ariaLabel: "Step quantity",
                  onChange: function (v) { updateStep(s.id, s.holdSeconds != null ? { holdSeconds: v } : { reps: v }); },
                })
              ),
```

In `styles.css`, add a small-chip modifier after `.chip-group`:
```css
.chip.sm { padding: 5px 10px; font-size: 11.5px; }
```

- [ ] **Step 5: Also render Steps in the read-only `ExerciseSummary`**

`ExerciseSummary` (shown on `SessionDetailPage` when viewing an already-saved session, separate from the editable `ExerciseRow`) needs to show the sequence too — the spec requires both views to agree, and right now only the editable card (Task 10, next) would show it. In `exerciseEditor.js`, find:
```js
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
```
Replace with:
```js
function formatStepLine(s) {
  var qty = s.holdSeconds != null ? s.holdSeconds + "s hold" : (s.reps != null ? "×" + s.reps : "");
  return s.label + (qty ? " (" + qty + ")" : "");
}
function ExerciseSummary(props) {
  var ex = props.exercise;
  var setDetails = normalizedSetDetails(ex);
  var springs = normalizedSprings(ex);
  var selectedProps = normalizedProps(ex);
  var steps = normalizedSteps(ex);
  var hasRealSetData = setDetails.some(function (s) { return s.reps != null || s.weight || s.restSeconds != null || s.holdSeconds != null; });
  var meta = [];
  if (steps.length) meta.push(steps.length + "-step sequence: " + steps.map(formatStepLine).join(" → "));
  if (ex.distance) meta.push(ex.distance);
  if (ex.intensity) meta.push(ex.intensity);
  if (ex.duration != null) meta.push(ex.duration + "s");
  if (ex.side && ex.side !== "N/A") meta.push(ex.side);
  if (springs.length) meta.push("Springs: " + springs.map(formatSpringLine).join(", "));
```

Add this to `test/exerciseEditor.test.js`, before the final `console.log` line:
```js
// formatStepLine reads a step's quantity correctly for either mode.
assert.strictEqual(sandbox.formatStepLine({ label: "Bridge & hold", reps: null, holdSeconds: 10 }), "Bridge & hold (10s hold)");
assert.strictEqual(sandbox.formatStepLine({ label: "Leg raises", reps: 10, holdSeconds: null }), "Leg raises (×10)");
assert.strictEqual(sandbox.formatStepLine({ label: "Rest", reps: null, holdSeconds: null }), "Rest");
```
Run `node test/exerciseEditor.test.js` and confirm it still passes.

- [ ] **Step 6: Manual verification**

In the browser preview, add an exercise, tap "A sequence of steps," add 4 steps labeled "Bridge & hold" (Hold, 10), "Leg raises" (Reps, 10), "Pulses" (Reps, 15), "Hold" (Hold, 10) — matching the original combo example — confirm each step's Reps/Hold toggle and stepper work independently, confirm the Sets caption appears, and confirm removing a step only removes that one. Switch back to "One movement" and confirm the steps list hides (existing `steps` data is preserved, not deleted, if you re-toggle back). Save the session and open its read-only detail page — confirm the 4-step sequence renders there too, in the same order, via `ExerciseSummary`.

- [ ] **Step 7: Commit**

```bash
git add exerciseEditor.js styles.css
git commit -m "feat: Steps UI for choreographed combo exercises

Toggle between one movement and an ordered sequence of labeled
phases, each with an independent Reps/Hold quantity. Universal across
all 7 categories. Sets block gets a clarifying caption when in
sequence mode (sets = repeats of the whole sequence)."
```

---

## Task 9: Recent-name suggestion chips

**Files:**
- Modify: `exerciseEditor.js`
- Modify: `app.js` (wire `allSessions` through `SessionFormPage` and `ProgramFormPage`)

- [ ] **Step 1: Thread `allSessions` through `ExerciseEditor` → `ExerciseRow`**

In `exerciseEditor.js`, find:
```js
    exercises.map(function (ex, i) { return h(ExerciseRow, { key: ex.id, index: i, exercise: ex, onChange: function (patch) { update(ex.id, patch); }, onRemove: function () { remove(ex.id); }, onLogOtherSide: function () { logOtherSide(ex.id); } }); }),
```
Replace with:
```js
    exercises.map(function (ex, i) { return h(ExerciseRow, { key: ex.id, index: i, exercise: ex, allSessions: props.allSessions, onChange: function (patch) { update(ex.id, patch); }, onRemove: function () { remove(ex.id); }, onLogOtherSide: function () { logOtherSide(ex.id); } }); }),
```

- [ ] **Step 2: Render suggestion chips above the name field**

In `exerciseEditor.js`, inside `ExerciseRow`, add right after the `var propOptions = ...` line:
```js
  var suggestedNames = topExerciseNames(props.allSessions, ex.category, 8);
```

Then find the exercise-name field block (now preceded by the sequence toggle from Task 8) and insert the suggestion chips directly above the name `<input>`:
```js
      h("div", { className: "form-field", style: { gridColumn: "1 / -1" } },
        h("label", { className: "form-label", htmlFor: idp + "-name" }, "Exercise name"),
        suggestedNames.length > 0 && h("div", { className: "chip-group", style: { marginBottom: 8 } },
          suggestedNames.map(function (name) {
            return h("button", {
              type: "button", key: name, className: "chip",
              onClick: function () { props.onChange({ exerciseName: name }); },
            }, name);
          })
        ),
        h("input", { id: idp + "-name", className: "input", value: ex.exerciseName, onChange: txt("exerciseName"), placeholder: "e.g. Footwork on reformer" })
      ),
```

- [ ] **Step 3: Call `useAllSessions()` and pass it down from the two page components**

In `app.js`, find (inside `SessionFormPage`):
```js
  var programs = useAllPrograms();
```
Replace with:
```js
  var programs = useAllPrograms();
  var allSessions = useAllSessions();
```

Then find the `ExerciseEditor` usage inside `SessionFormPage` (`h(ExerciseEditor, { exercises: form.exercises, onChange: function (v) { set("exercises", v); } })`) and replace with:
```js
h(ExerciseEditor, { exercises: form.exercises, allSessions: allSessions, onChange: function (v) { set("exercises", v); } })
```

In `app.js`, find (inside `ProgramFormPage`):
```js
  var existing = useProgram(mode === "edit" ? programId : undefined);
```
Replace with:
```js
  var existing = useProgram(mode === "edit" ? programId : undefined);
  var allSessions = useAllSessions();
```

Then find the `ExerciseEditor` usage inside `ProgramFormPage` and replace with:
```js
h(ExerciseEditor, { exercises: form.exercises, allSessions: allSessions, onChange: function (v) { set("exercises", v); } })
```

- [ ] **Step 4: Manual verification**

Open the app, go to a client with existing session history, start a new session, confirm suggestion chips appear above the exercise-name field showing names from past sessions in that category, tapping one fills the name field. Switch category and confirm the suggestions change to match. For a brand-new account with zero session history, confirm the name field renders normally with no suggestion row (not a broken empty chip-group).

- [ ] **Step 5: Commit**

```bash
git add exerciseEditor.js app.js
git commit -m "feat: recent-name suggestion chips on exercise name field

Wires topExerciseNames into ExerciseRow via a new allSessions prop
threaded from SessionFormPage/ProgramFormPage. Category-scoped, so
switching category updates the suggestions."
```

---

## Task 10: Collapsed glance-state for exercise cards

**Files:**
- Modify: `exerciseEditor.js`
- Modify: `test/exerciseEditor.test.js`
- Modify: `styles.css`

- [ ] **Step 1: Write the failing test for `exerciseHasData`**

Append to `test/exerciseEditor.test.js`, before the final `console.log` line:

```js
// exerciseHasData: true only once something real has been entered.
assert.strictEqual(sandbox.exerciseHasData(sandbox.blankExercise()), false);
var named = sandbox.blankExercise(); named.exerciseName = "Footwork";
assert.strictEqual(sandbox.exerciseHasData(named), true);
var sprung = sandbox.blankExercise(); sprung.springs = [{ id: "a", color: "Red", count: 1, level: "1" }];
assert.strictEqual(sandbox.exerciseHasData(sprung), true);
var stepped = sandbox.blankExercise(); stepped.steps = [{ id: "a", label: "Bridge", reps: null, holdSeconds: 10 }];
assert.strictEqual(sandbox.exerciseHasData(stepped), true);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node test/exerciseEditor.test.js`
Expected: `TypeError: sandbox.exerciseHasData is not a function`

- [ ] **Step 3: Implement `exerciseHasData`**

In `exerciseEditor.js`, add this function right after `topExerciseNames`:

```js
/* Does this exercise already have anything worth summarizing? Used to pick
   whether a card starts collapsed (a clone, or any exercise being reviewed
   in an existing session -- most fields are already right, so default to a
   glance-line) or expanded (a brand-new blank exercise -- nothing to
   summarize yet, needs filling in immediately). */
function exerciseHasData(ex) {
  var setDetails = normalizedSetDetails(ex);
  var hasSetData = setDetails.some(function (s) { return s.reps != null || s.weight || s.restSeconds != null || s.holdSeconds != null; });
  return !!(
    ex.exerciseName || hasSetData ||
    normalizedSprings(ex).length || normalizedProps(ex).length || normalizedSteps(ex).length || ex.notes
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node test/exerciseEditor.test.js`
Expected: `exerciseEditor.test.js: all assertions passed`

- [ ] **Step 5: Add collapsed-card CSS**

In `styles.css`, add after the `.chip.sm` rule from Task 8:
```css
.exercise-card-summary { cursor: pointer; }
.exercise-card-summary-line { font-size: 13.5px; color: var(--text-secondary); line-height: 1.5; }
.exercise-card-chevron { transition: transform .15s ease; color: var(--text-tertiary); flex-shrink: 0; }
.exercise-card-chevron.expanded { transform: rotate(90deg); }
```

- [ ] **Step 6: Build the collapsed summary line and wrap the card**

In `exerciseEditor.js`, inside `ExerciseRow`, add right after the `var isSequence = ...` line from Task 8:
```js
  var _collapsed = useState(exerciseHasData(ex)), collapsed = _collapsed[0], setCollapsed = _collapsed[1];
```

Then build the summary-line parts. Add this function right after `addCustomProp` (reusing the same formatting functions the expanded view and `ExerciseSummary` already use, so collapsed and expanded always agree):
```js
  function summaryLineParts() {
    var parts = [ex.category];
    if (ex.side && ex.side !== "N/A") parts.push(ex.side);
    if (steps.length) parts.push(steps.length + "-step sequence");
    var hasSetData = setDetails.some(function (s) { return s.reps != null || s.weight || s.restSeconds != null || s.holdSeconds != null; });
    if (hasSetData) parts.push(setDetails.length + " set" + (setDetails.length === 1 ? "" : "s"));
    if (springs.length) parts.push(springs.map(formatSpringLine).join(", "));
    if (selectedProps.length) parts.push(selectedProps.map(function (p) { return p.name; }).join(", "));
    return parts;
  }
```

Finally, wrap the whole return value. Find the start of the returned JSX:
```js
  return h("div", { className: "exercise-card" },
    h("div", { className: "exercise-card-head" },
      h("span", { className: "exercise-card-title" }, "Exercise " + (props.index + 1)),
      h("button", { type: "button", className: "exercise-remove-btn", onClick: props.onRemove }, h(TrashIcon, { width: 15, height: 15 }), "Remove")
    ),
```
Replace with:
```js
  if (collapsed) {
    return h("div", { className: "exercise-card" },
      h("div", { className: "exercise-card-head exercise-card-summary", onClick: function () { setCollapsed(false); } },
        h("span", { className: "exercise-card-title", style: { color: "var(--text)", fontSize: 14.5, fontWeight: 700 } }, ex.exerciseName || "Untitled exercise"),
        h(ChevronRightIcon, { className: "exercise-card-chevron", width: 16, height: 16 })
      ),
      h("div", { className: "exercise-card-summary-line exercise-card-summary", onClick: function () { setCollapsed(false); } }, summaryLineParts().join(" · "))
    );
  }

  return h("div", { className: "exercise-card" },
    h("div", { className: "exercise-card-head" },
      h("span", { className: "exercise-card-title" }, "Exercise " + (props.index + 1)),
      h("button", { type: "button", className: "exercise-remove-btn", onClick: props.onRemove }, h(TrashIcon, { width: 15, height: 15 }), "Remove")
    ),
```

- [ ] **Step 7: Manual verification**

In the browser preview: (a) click "Add exercise" and confirm the new blank card is expanded by default (nothing to collapse yet); (b) fill it in, use "log other side" or go back and click "Add exercise" again — wait, per the spec only clones (not plain "Add exercise") default collapsed; confirm a plain new "Add exercise" card stays expanded, and a "log other side" clone appears **collapsed** showing a one-line summary; (c) click the collapsed card's header or summary line and confirm it expands in place with all data intact; (d) open an existing saved session for editing and confirm its exercises render collapsed initially.

- [ ] **Step 8: Commit**

```bash
git add exerciseEditor.js styles.css test/exerciseEditor.test.js
git commit -m "feat: collapsed glance-state for exercise cards

A cloned ('Add exercise' from a non-empty row via copy, or 'log other
side') or already-saved exercise starts collapsed to a one-line
summary; tap to expand. A brand-new blank exercise starts expanded.
exerciseHasData is the pure function deciding the initial state."
```

---

## Task 11: Final cross-category QA pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite one more time**

Run:
```bash
node test/data.test.js && node test/charts.test.js && node test/movementScreen.test.js && node test/exerciseStructure.test.js && node test/exerciseEditor.test.js
```
Expected: all five print their "all assertions passed" line.

- [ ] **Step 2: Manual pass through all 7 categories**

In the browser preview, for each of Pilates, Strength, Cardio, Mobility, Yoga, Functional, Other: add one exercise, confirm the category-appropriate fields render (Cardio shows Distance/Intensity and no Sets block; Mobility/Yoga show hold-only sets; Pilates shows Springs/Props/Pilates-detail; the rest show reps+weight+rest and Props), and confirm nothing throws a console error.

- [ ] **Step 3: Confirm old data still displays correctly**

Open a session logged before this redesign (if one exists in this account's history) and confirm its exercises render correctly in both collapsed and expanded state — this exercises every `normalized*` fallback function against real pre-existing data, not just the synthetic test fixtures.

- [ ] **Step 4: Confirm the PWA shell update lands**

With the site already open from before these changes (simulating an existing installed user), hard-refresh and check the browser console/network tab for the service worker re-fetching `exerciseEditor.js` and the other shell files (the `cst-shell-v3` cache name from Task 1 should appear in the Application/Storage panel's Cache Storage list, replacing `cst-shell-v2`).

- [ ] **Step 5: No commit needed** — this task is verification only; if anything fails, fix it under the task where the regression was introduced and commit there, then re-run this task's checks.

---

## Explicitly out of scope (unchanged from the spec)

- Mandatory program templates + exercise library with progression/regression suggestions.
- Per-step springs/props.
- Everything the `2026-09-25-exercise-structure-by-category` and `2026-09-26-client-status-freeze-design` specs already marked out of scope.
