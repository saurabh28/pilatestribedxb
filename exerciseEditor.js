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
        onFocus: function (e) { e.target.select(); },
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
/* A titled section of the exercise card. In the list view it is always open
   (as before); in the session carousel it is collapsible and shows a
   one-line summary while closed, so a card stays short. */
function ExSection(props) {
  var _o = useState(!props.collapsible), open = _o[0], setOpen = _o[1];
  if (!props.collapsible) {
    return h("div", { className: "ex-section" },
      h("div", { className: "exercise-card-title", style: { marginBottom: 8 } }, props.title),
      props.children
    );
  }
  return h("div", { className: "ex-section" },
    h("button", { type: "button", className: "ex-section-head", "aria-expanded": open, onClick: function () { setOpen(!open); } },
      h("span", { className: "exercise-card-title" }, props.title),
      h("span", { className: "ex-section-summary" }, props.summary || "None"),
      h(ChevronRightIcon, { className: classNames("exercise-card-chevron", open && "expanded"), width: 16, height: 16 })
    ),
    open && h("div", { style: { marginTop: 10 } }, props.children)
  );
}
/* Ref callback that sizes a textarea to its content, so a long step name
   wraps onto as many lines as it needs instead of being cut off. */
function autoGrow(el) {
  if (el) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; }
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
function normalizedSteps(ex) {
  return ex.steps || [];
}
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
    steps: (ex.steps || []).map(function (s) { return Object.assign({}, s, { id: generateId() }); }),
  });
}
function flipSide(side) {
  if (side === "Left") return "Right";
  if (side === "Right") return "Left";
  return side;
}
/* Which card is "current" in a horizontal carousel, from its scroll
   position. `stride` is the distance from one card's left edge to the next
   (card width + gap); `count` includes the trailing "add exercise" slide. */
function carouselIndexFromScroll(scrollLeft, stride, count) {
  if (!stride || stride <= 0 || count <= 0) return 0;
  return Math.max(0, Math.min(count - 1, Math.round(scrollLeft / stride)));
}

/* Swipeable one-card-at-a-time view of a session's exercises, used once a
   template is loaded (a full exercise card is tall, so a vertical stack of
   them gets long). The next card peeks in to show it swipes; the track's
   height follows the current card so shorter cards leave no empty gap. */
function ExerciseCarousel(props) {
  var exercises = props.exercises;
  var count = exercises.length + 1;
  var trackRef = React.useRef(null);
  var _a = useState(0), active = _a[0], setActive = _a[1];

  function slideStride(track) {
    var kids = track.children;
    return kids.length > 1 ? kids[1].offsetLeft - kids[0].offsetLeft : track.clientWidth;
  }
  function onScroll() {
    var track = trackRef.current;
    if (!track) return;
    var idx = carouselIndexFromScroll(track.scrollLeft, slideStride(track), count);
    if (idx !== active) setActive(idx);
  }
  function goTo(i, instant) {
    var track = trackRef.current;
    var kid = track && track.children[i];
    if (!kid) return;
    track.scrollTo({ left: Math.max(0, kid.offsetLeft - 4), behavior: instant ? "auto" : "smooth" });
  }

  React.useLayoutEffect(function () {
    var track = trackRef.current;
    var slide = track && track.children[active];
    if (!slide) return undefined;
    function fit() {
      var cs = window.getComputedStyle(track);
      track.style.height = (slide.offsetHeight + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)) + "px";
    }
    fit();
    if (typeof ResizeObserver === "undefined") return undefined;
    var ro = new ResizeObserver(fit);
    ro.observe(slide);
    return function () { ro.disconnect(); };
  }, [active, count]);

  useEffect(function () {
    if (props.focusRequest && props.focusRequest.token) goTo(props.focusRequest.index);
  }, [props.focusRequest]);

  useEffect(function () {
    if (active > count - 1) { goTo(count - 1, true); setActive(count - 1); }
  }, [count]);

  var onAddSlide = active >= exercises.length;
  function dots() {
    return exercises.length > 0 && count <= 11 && h("div", { className: "ex-dots" },
      Array.apply(null, Array(count)).map(function (_, i) {
        return h("button", {
          key: i, type: "button", className: classNames("ex-dot", i === active && "active"),
          "aria-label": i < exercises.length ? "Go to exercise " + (i + 1) : "Go to add exercise", onClick: function () { goTo(i); },
        });
      })
    );
  }
  return h("div", null,
    exercises.length > 0 && h("div", { className: "ex-pager" },
      h("span", { className: "ex-pager-label" }, onAddSlide ? "Add exercise" : "Exercise " + (active + 1) + "/" + exercises.length),
      h("div", { className: "ex-pager-nav" },
        h("button", { type: "button", className: "ex-pager-btn", "aria-label": "Previous exercise", disabled: active === 0, onClick: function () { goTo(active - 1); } }, h(ChevronLeftIcon, { width: 18, height: 18 })),
        h("button", { type: "button", className: "ex-pager-btn", "aria-label": "Next exercise", disabled: active >= count - 1, onClick: function () { goTo(active + 1); } }, h(ChevronRightIcon, { width: 18, height: 18 }))
      )
    ),
    dots(),
    h("div", { className: "ex-carousel", ref: trackRef, onScroll: onScroll },
      exercises.map(function (ex, i) { return h("div", { key: ex.id, className: "ex-slide" }, props.renderRow(ex, i)); }),
      h("div", { key: "__add", className: "ex-slide ex-slide-add" }, props.addButton)
    ),
    h("div", { className: "ex-dots-bottom" }, dots())
  );
}

function ExerciseEditor(props) {
  var exercises = props.exercises;
  var carousel = props.layout === "carousel";
  var _fr = useState({ index: 0, token: 0 }), focusRequest = _fr[0], setFocusRequest = _fr[1];
  function requestFocus(index) { setFocusRequest(function (r) { return { index: index, token: r.token + 1 }; }); }
  function update(id, patch) { props.onChange(exercises.map(function (e) { return e.id === id ? Object.assign({}, e, patch) : e; })); }
  function remove(id) { props.onChange(exercises.filter(function (e) { return e.id !== id; })); }
  function add() {
    props.onChange(exercises.concat([blankExercise()]));
    if (carousel) requestFocus(exercises.length);
  }
  function logOtherSide(id) {
    var idx = exercises.findIndex(function (e) { return e.id === id; });
    if (idx === -1) return;
    var clone = cloneExerciseForRepeat(exercises[idx]);
    clone.side = flipSide(exercises[idx].side);
    var next = exercises.slice();
    next.splice(idx + 1, 0, clone);
    props.onChange(next);
    if (carousel) requestFocus(idx + 1);
  }
  function renderRow(ex, i) {
    return h(ExerciseRow, {
      key: ex.id, index: i, exercise: ex, allSessions: props.allSessions, alwaysExpanded: carousel,
      onChange: function (patch) { update(ex.id, patch); }, onRemove: function () { remove(ex.id); }, onLogOtherSide: function () { logOtherSide(ex.id); },
    });
  }
  var addButton = h(Button, { type: "button", variant: "secondary", className: "btn-block", onClick: add }, h(PlusCircleIcon, { width: 18, height: 18 }), "Add exercise");
  var emptyNote = exercises.length === 0 && h("p", { className: "text-secondary", style: { marginBottom: 12, fontSize: 13.5 } }, "No exercises added yet. Add each exercise performed this session.");

  if (carousel) {
    return h("div", { className: "exercise-editor" },
      emptyNote,
      h(ExerciseCarousel, { exercises: exercises, renderRow: renderRow, addButton: addButton, focusRequest: focusRequest })
    );
  }
  return h("div", { className: "exercise-editor" },
    emptyNote,
    exercises.map(renderRow),
    addButton
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

  function summaryLineParts() {
    var parts = [];
    if (steps.length) parts.push(steps.length + "-step sequence");
    var hasSetData = setDetails.some(function (s) { return s.reps != null || s.weight || s.restSeconds != null || s.holdSeconds != null; });
    if (hasSetData) parts.push(setDetails.length + " set" + (setDetails.length === 1 ? "" : "s"));
    if (springs.length) parts.push(springs.map(formatSpringLine).join(", "));
    if (selectedProps.length) parts.push(selectedProps.map(function (p) { return p.name; }).join(", "));
    return parts;
  }

  var steps = normalizedSteps(ex);
  var _seqIntent = useState(steps.length > 0), sequenceIntent = _seqIntent[0], setSequenceIntent = _seqIntent[1];
  var isSequence = sequenceIntent || steps.length > 0;
  var _collapsed = useState(!props.alwaysExpanded && exerciseHasData(ex)), collapsed = _collapsed[0], setCollapsed = _collapsed[1];
  // In the session carousel the template already set name/category/side, so
  // those fold into an "Edit details" toggle to keep each card short.
  var _details = useState(!ex.exerciseName), detailsOpen = _details[0], setDetailsOpen = _details[1];
  var showDetails = !props.alwaysExpanded || detailsOpen;

  function updateStep(stepId, patch) {
    props.onChange({ steps: steps.map(function (s) { return s.id === stepId ? Object.assign({}, s, patch) : s; }) });
  }
  function addStep() {
    props.onChange({ steps: steps.concat([blankStep()]) });
  }
  function removeStep(stepId) {
    props.onChange({ steps: steps.filter(function (s) { return s.id !== stepId; }) });
  }

  var propOptions = DEFAULT_PROPS.concat(
    selectedProps.map(function (p) { return p.name; }).filter(function (n) { return DEFAULT_PROPS.indexOf(n) === -1; })
  );
  var suggestedNames = topExerciseNames(props.allSessions, ex.category, 8);

  if (collapsed) {
    var summaryParts = summaryLineParts();
    return h("div", { className: "exercise-card", key: "collapsed" },
      h("div", { className: "exercise-card-head ex-collapsed-head" },
        h("button", { type: "button", className: "exercise-card-summary-toggle", onClick: function () { setCollapsed(false); } },
          h("span", { className: "ex-collapsed-text" },
            h("span", { className: "ex-tag" }, ex.category + (ex.side && ex.side !== "N/A" ? " · " + ex.side : "")),
            h("span", { className: "ex-name" }, ex.exerciseName || "Untitled exercise"),
            summaryParts.length > 0 && h("span", { className: "ex-summary" }, summaryParts.join(" · "))
          ),
          h(ChevronRightIcon, { className: "exercise-card-chevron", width: 16, height: 16 })
        ),
        h("button", { type: "button", className: "exercise-remove-btn", "aria-label": "Remove exercise " + (props.index + 1), onClick: props.onRemove }, h(TrashIcon, { width: 15, height: 15 }))
      )
    );
  }

  return h("div", { className: "exercise-card", key: "expanded" },
    h("div", { className: "exercise-card-head" },
      h("span", { className: "ex-tag" }, props.alwaysExpanded ? ex.category + (ex.side && ex.side !== "N/A" ? " · " + ex.side : "") : "Exercise " + (props.index + 1)),
      h("div", { className: "ex-head-actions" },
        h("button", { type: "button", className: "ex-collapse-btn", "aria-label": "Collapse exercise " + (props.index + 1), onClick: function () { setCollapsed(true); } },
          h(ChevronRightIcon, { className: "exercise-card-chevron up", width: 14, height: 14 }), "Collapse"),
        h("button", { type: "button", className: "exercise-remove-btn", onClick: props.onRemove }, h(TrashIcon, { width: 15, height: 15 }), "Remove")
      )
    ),
    h("div", { className: "exercise-fields-grid", style: { marginBottom: 10 } },
      props.alwaysExpanded && h("div", { className: "ex-session-head" },
        h("span", { className: "ex-name" }, ex.exerciseName || "Untitled exercise"),
        h("button", { type: "button", className: "ex-details-toggle", "aria-expanded": detailsOpen, onClick: function () { setDetailsOpen(!detailsOpen); } }, detailsOpen ? "Hide details" : "Edit details")
      ),
      showDetails && h("div", { className: "form-field", style: { gridColumn: "1 / -1" } },
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
      showDetails && h("div", { className: "form-field", style: { gridColumn: "1 / -1" } },
        h("label", { className: "form-label" }, "This exercise is"),
        h("div", { className: "chip-group" },
          h("button", { type: "button", className: classNames("chip", !isSequence && "selected"), onClick: function () { setSequenceIntent(false); } }, "One movement"),
          h("button", { type: "button", className: classNames("chip", isSequence && "selected"), onClick: function () { setSequenceIntent(true); } }, "A sequence of steps")
        )
      ),
      isSequence && h("div", { className: "form-field", style: { gridColumn: "1 / -1" } },
        h(ExSection, { title: "Sequence · " + steps.length + (steps.length === 1 ? " step" : " steps"), collapsible: props.alwaysExpanded, summary: steps.map(function (s) { return s.label; }).filter(Boolean).join(" → ") },
          steps.map(function (s, i) {
            return h("div", { key: s.id, className: "step-item" },
              h("div", { className: "step-item-row" },
                h("span", { className: "step-num", "aria-hidden": true }, i + 1),
                h("textarea", {
                  className: "step-name-input", rows: 1, ref: autoGrow, value: s.label, placeholder: "e.g. Leg raises",
                  onChange: function (e) { updateStep(s.id, { label: e.target.value }); },
                  onKeyDown: function (e) { if (e.key === "Enter") e.preventDefault(); },
                }),
                h("button", { type: "button", className: "set-remove-btn", "aria-label": "Remove step " + (i + 1), onClick: function () { removeStep(s.id); } }, h(XIcon, { width: 14, height: 14 }))
              ),
              h("div", { className: "step-item-row", style: { marginTop: 8 } },
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
              )
            );
          }),
          h("button", { type: "button", className: "btn-text", style: { fontSize: 13, fontWeight: 700 }, onClick: addStep }, h(PlusCircleIcon, { width: 16, height: 16 }), "Add step")
        )
      ),
      showDetails && h("div", { className: "form-field", style: { gridColumn: "1 / -1" } },
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
      showDetails && h("div", { className: "form-field", style: { gridColumn: "1 / -1" } },
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
      showDetails && h("div", { className: "form-field" },
        h("label", { className: "form-label", htmlFor: idp + "-dur" }, "Duration (sec)"),
        h("input", { id: idp + "-dur", className: "input", type: "number", min: 0, inputMode: "numeric", value: ex.duration == null ? "" : ex.duration, onChange: num("duration") })
      ),
      showDetails && config.usesDistance && h("div", { className: "form-field" },
        h("label", { className: "form-label", htmlFor: idp + "-dist" }, "Distance"),
        h("input", { id: idp + "-dist", className: "input", value: ex.distance || "", onChange: txt("distance"), placeholder: "e.g. 5km" })
      ),
      showDetails && config.usesIntensity && h("div", { className: "form-field" },
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

    config.usesSets && h("div", { className: "ex-section" },
      h("div", { className: "flex-between", style: { marginBottom: 8 } },
        h("span", { className: "exercise-card-title" }, "Sets"),
        h("span", { className: "text-tertiary", style: { fontSize: 11 } }, setDetails.length + " set" + (setDetails.length === 1 ? "" : "s"))
      ),
      isSequence && h("p", { className: "form-hint", style: { marginTop: -4, marginBottom: 8 } }, "Sets = how many times you repeat this whole sequence. Springs/props below are shared across all steps."),
      setDetails.map(function (s, i) {
        var sidp = idp + "-set-" + s.id;
        return h("div", { key: s.id, className: "set-row" },
          h("span", { className: "set-row-index", "aria-hidden": true }, i + 1),
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
          h("button", { type: "button", className: "set-remove-btn", "aria-label": "Remove set " + (i + 1), onClick: function () { removeSet(s.id); } }, h(XIcon, { width: 14, height: 14 }))
        );
      }),
      h("button", { type: "button", className: "btn-text", style: { fontSize: 13, fontWeight: 700 }, onClick: addSet }, h(PlusCircleIcon, { width: 16, height: 16 }), "Add set")
    ),

    config.usesSprings && h(ExSection, { title: "Springs", collapsible: props.alwaysExpanded, summary: springs.map(formatSpringLine).join(", ") },
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

    config.usesProps && h(ExSection, { title: "Props", collapsible: props.alwaysExpanded, summary: selectedProps.map(function (p) { return p.name; }).join(", ") },
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

    (config.usesAssistance || config.usesBox) && h(ExSection, { title: "Pilates detail", collapsible: props.alwaysExpanded, summary: [ex.assistanceLevel, ex.box ? "Box" : ""].filter(Boolean).join(", ") },
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
  if (sp.level && sp.level.trim()) parts.push("level " + sp.level.trim());
  return parts.join(" ") || "Spring";
}
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
