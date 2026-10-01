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
