/* Pages, layout, router, and app bootstrap. Plain React.createElement (h). */

/* ---------------------------------------------------------------------- */
/* useLiveQuery + data hooks                                               */
/* ---------------------------------------------------------------------- */

function useLiveQuery(querier, deps) {
  var _s = useState(undefined), result = _s[0], setResult = _s[1];
  useEffect(function () {
    var cancelled = false;
    function run() {
      Promise.resolve(querier()).then(function (v) { if (!cancelled) setResult(v); })
        .catch(function (e) { console.error("query error", e); });
    }
    run();
    var unsubscribe = onDataChanged(run);
    return function () { cancelled = true; unsubscribe(); };
  }, deps || []);
  return result;
}
function useAuth() {
  var _s = useState(authRepository.getState()), state = _s[0], setState = _s[1];
  useEffect(function () { return onAuthChange(setState); }, []);
  return state;
}
function useClients(filter) {
  return useLiveQuery(function () { return clientRepository.list(filter); }, [filter && filter.status, filter && filter.search]);
}
function useClient(id) { return useLiveQuery(function () { return id ? clientRepository.get(id) : undefined; }, [id]); }
function useSessionsForClient(id) { return useLiveQuery(function () { return id ? sessionRepository.listByClient(id) : []; }, [id]); }
function useBodyScoresForClient(id) { return useLiveQuery(function () { return id ? bodyScoreRepository.listByClient(id) : []; }, [id]); }
function useMovementScreensForClient(id) { return useLiveQuery(function () { return id ? movementScreenRepository.listByClient(id) : []; }, [id]); }
function useSession(id) { return useLiveQuery(function () { return id ? sessionRepository.get(id) : undefined; }, [id]); }
function useAllSessions() { return useLiveQuery(function () { return sessionRepository.listAll(); }, []); }
function useGoalsForClient(id) { return useLiveQuery(function () { return id ? goalRepository.listByClient(id) : []; }, [id]); }
function useAllGoals() { return useLiveQuery(function () { return goalRepository.listAll(); }, []); }
function useAllPrograms() { return useLiveQuery(function () { return programRepository.list(); }, []); }
function useProgram(id) { return useLiveQuery(function () { return id ? programRepository.get(id) : undefined; }, [id]); }

/* ---------------------------------------------------------------------- */
/* Router                                                                   */
/* ---------------------------------------------------------------------- */

function parseHash() {
  var raw = window.location.hash.replace(/^#/, "") || "/";
  var qIndex = raw.indexOf("?");
  var path = qIndex === -1 ? raw : raw.slice(0, qIndex);
  var query = {};
  if (qIndex !== -1) {
    raw.slice(qIndex + 1).split("&").forEach(function (pair) {
      if (!pair) return;
      var kv = pair.split("=");
      query[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || "");
    });
  }
  var parts = path.split("/").filter(Boolean);
  return { path: path, parts: parts, query: query };
}
function navigate(hash) { window.location.hash = hash; }
function useRoute() {
  var _s = useState(parseHash()), route = _s[0], setRoute = _s[1];
  useEffect(function () {
    function onChange() { setRoute(parseHash()); window.scrollTo(0, 0); }
    window.addEventListener("hashchange", onChange);
    return function () { window.removeEventListener("hashchange", onChange); };
  }, []);
  return route;
}
function setQueryParam(key, value) {
  var route = parseHash();
  route.query[key] = value;
  var q = Object.keys(route.query).map(function (k) { return encodeURIComponent(k) + "=" + encodeURIComponent(route.query[k]); }).join("&");
  window.location.hash = "/" + route.parts.join("/") + (q ? "?" + q : "");
}

function Link(props) {
  var rest = Object.assign({}, props);
  delete rest.to; delete rest.children;
  return h("a", Object.assign({
    href: "#" + props.to,
    onClick: function (e) {
      if (props.onClick) props.onClick(e);
    },
  }, rest), props.children);
}

/* ---------------------------------------------------------------------- */
/* Layout                                                                    */
/* ---------------------------------------------------------------------- */

var PRIMARY_NAV = [
  { to: "/", label: "Dashboard", icon: HomeIcon, match: function (p) { return p.length === 0; } },
  { to: "/clients", label: "Clients", icon: UsersIcon, match: function (p) { return p[0] === "clients"; } },
  { to: "/add-session", label: "Add Session", icon: PlusCircleIcon, match: function (p) { return p[0] === "add-session"; } },
];
var DESKTOP_NAV = [
  { to: "/sessions", label: "Session History", icon: CalendarIcon, match: function (p) { return p[0] === "sessions"; } },
  { to: "/goals", label: "Goals", icon: TargetIcon, match: function (p) { return p[0] === "goals"; } },
  { to: "/programs", label: "Programs", icon: ClipboardIcon, match: function (p) { return p[0] === "programs"; } },
  { to: "/settings", label: "Settings", icon: GearIcon, match: function (p) { return p[0] === "settings"; } },
];

function Sidebar(props) {
  return h("nav", { className: "sidebar", "aria-label": "Primary" },
    h("div", { className: "sidebar-brand" },
      h("div", { className: "sidebar-brand-mark", "aria-hidden": true }),
      h("div", { className: "sidebar-brand-text" }, "Client Session", h("br"), "Tracker")
    ),
    PRIMARY_NAV.concat(DESKTOP_NAV).map(function (item) {
      var active = item.match(props.route.parts);
      return h(Link, { key: item.to, to: item.to, className: "sidebar-link" + (active ? " active" : "") },
        h(item.icon, { width: 20, height: 20 }), item.label
      );
    })
  );
}
function BottomNav(props) {
  var moreActive = ["sessions", "goals", "programs", "settings", "more"].indexOf(props.route.parts[0]) !== -1;
  return h("nav", { className: "bottom-nav", "aria-label": "Primary" },
    PRIMARY_NAV.map(function (item) {
      var active = item.match(props.route.parts);
      return h(Link, { key: item.to, to: item.to, className: "bottom-nav-item" + (active ? " active" : "") },
        h(item.icon, null), h("span", null, item.label)
      );
    }),
    h(Link, { to: "/more", className: "bottom-nav-item" + (moreActive ? " active" : "") },
      h(MoreIcon, null), h("span", null, "More")
    )
  );
}
function PageHeader(props) {
  return h("header", { className: "page-header" },
    props.back && h("button", { className: "icon-btn", "aria-label": "Go back", onClick: function () { window.history.back(); } }, h(ChevronLeftIcon, null)),
    h("h1", null, props.title),
    props.action || null
  );
}

/* ---------------------------------------------------------------------- */
/* Exercise editor                                                          */
/* ---------------------------------------------------------------------- */

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
function ExerciseEditor(props) {
  var exercises = props.exercises;
  function update(id, patch) { props.onChange(exercises.map(function (e) { return e.id === id ? Object.assign({}, e, patch) : e; })); }
  function remove(id) { props.onChange(exercises.filter(function (e) { return e.id !== id; })); }
  function add() { props.onChange(exercises.concat([blankExercise()])); }

  return h("div", null,
    exercises.length === 0 && h("p", { className: "text-secondary", style: { marginBottom: 12, fontSize: 13.5 } }, "No exercises added yet. Add each exercise performed this session."),
    exercises.map(function (ex, i) { return h(ExerciseRow, { key: ex.id, index: i, exercise: ex, onChange: function (patch) { update(ex.id, patch); }, onRemove: function () { remove(ex.id); } }); }),
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

/* ---------------------------------------------------------------------- */
/* Dashboard                                                                 */
/* ---------------------------------------------------------------------- */

function startOfWeekIso() {
  var d = new Date();
  var day = d.getDay();
  var diff = (day + 6) % 7;
  d.setDate(d.getDate() - diff);
  return d.toISOString().slice(0, 10);
}
function SampleDataBanner() {
  var _s = useState(function () {
    try { return JSON.parse(localStorage.getItem("cst_sample_ids") || "null"); } catch (e) { return null; }
  });
  var sampleIds = _s[0];
  var _p = useState(function () {
    try { return JSON.parse(localStorage.getItem("cst_sample_program_ids") || "null"); } catch (e) { return null; }
  });
  var sampleProgramIds = _p[0];
  if (!sampleIds || !sampleIds.length) return null;
  function removeSamples() {
    var removals = sampleIds.map(function (id) { return clientRepository.remove(id); })
      .concat((sampleProgramIds || []).map(function (id) { return programRepository.remove(id); }));
    Promise.all(removals).then(function () {
      localStorage.removeItem("cst_sample_ids");
      localStorage.removeItem("cst_sample_program_ids");
      window.location.reload();
    });
  }
  return h("div", { className: "banner" },
    h(AlertIcon, { width: 16, height: 16 }),
    h("span", { style: { flex: 1 } }, "You're viewing sample clients so you can see how the app works."),
    h("button", { className: "btn-text", style: { fontWeight: 700, fontSize: 13 }, onClick: removeSamples }, "Remove sample data")
  );
}
function Dashboard() {
  var clients = useClients();
  var sessions = useAllSessions();
  var today = todayIso();
  var weekStart = useMemo(function () { return startOfWeekIso(); }, []);
  var activeClients = (clients || []).filter(function (c) { return c.status === "active"; });
  var sessionsToday = (sessions || []).filter(function (s) { return s.date === today; });
  var sessionsThisWeek = (sessions || []).filter(function (s) { return s.date >= weekStart; });

  var expiring = useMemo(function () {
    if (!clients || !sessions) return [];
    return clients.filter(function (c) { return c.status === "active"; })
      .map(function (c) { return { client: c, stats: computeSessionStats(c, sessions.filter(function (s) { return s.clientId === c.id; })) }; })
      .filter(function (x) { return x.stats.packageStatus === "expiring-soon" || x.stats.packageStatus === "expired"; })
      .sort(function (a, b) { return a.stats.packageStatus === "expired" ? -1 : 1; });
  }, [clients, sessions]);

  var recentSessions = (sessions || []).slice(0, 5);
  var clientById = useMemo(function () {
    var m = {}; (clients || []).forEach(function (c) { m[c.id] = c; }); return m;
  }, [clients]);

  var loading = clients === undefined || sessions === undefined;

  return h(React.Fragment, null,
    h(PageHeader, { title: "Dashboard" }),
    h("div", { className: "page-content stack" },
      h(SampleDataBanner, null),
      !loading && clients && clients.length === 0
        ? h(EmptyState, {
            icon: h(UsersIcon, { width: 40, height: 40 }),
            title: "Welcome! Let's add your first client",
            message: "Everything lives in this browser — clients, sessions, and goals are stored locally and privately.",
            action: h(Link, { to: "/clients/new" }, h(Button, null, h(PlusCircleIcon, { width: 18, height: 18 }), "Add your first client")),
          })
        : h(React.Fragment, null,
            h("div", { className: "stat-grid" },
              h(StatCard, { label: "Active clients", value: activeClients.length }),
              h(StatCard, { label: "Sessions today", value: sessionsToday.length }),
              h(StatCard, { label: "Sessions this week", value: sessionsThisWeek.length }),
              h(StatCard, { label: "Packages needing attention", value: expiring.length, tone: expiring.length > 0 ? "warning" : undefined })
            ),
            h("div", { className: "flex-row gap-12" },
              h(Link, { to: "/clients/new", style: { flex: 1 } }, h(Button, { variant: "secondary", className: "btn-block" }, h(UsersIcon, { width: 18, height: 18 }), "New client")),
              h(Link, { to: "/add-session", style: { flex: 1 } }, h(Button, { className: "btn-block" }, h(PlusCircleIcon, { width: 18, height: 18 }), "Log a session"))
            ),
            expiring.length > 0 && h("section", null,
              h("div", { className: "section-label" }, "Needs attention"),
              h("div", { className: "list-card" },
                expiring.map(function (x) {
                  return h(Link, { key: x.client.id, to: "/clients/" + x.client.id, className: "list-row" },
                    h(AlertIcon, { width: 20, height: 20, color: x.stats.packageStatus === "expired" ? "var(--danger)" : "var(--warning)" }),
                    h("div", { className: "list-row-body" },
                      h("div", { className: "list-row-title" }, x.client.fullName),
                      h("div", { className: "list-row-subtitle" }, PACKAGE_STATUS_LABEL[x.stats.packageStatus] + (x.stats.remaining != null ? " · " + x.stats.remaining + " sessions left" : ""))
                    ),
                    h(ChevronRightIcon, { className: "list-row-chevron" })
                  );
                })
              )
            ),
            h("section", null,
              h("div", { className: "section-label" }, "Recent sessions"),
              recentSessions.length === 0
                ? h(Card, null, h("p", { className: "text-secondary", style: { margin: 0 } }, "No sessions logged yet."))
                : h("div", { className: "list-card" },
                    recentSessions.map(function (s) {
                      var c = clientById[s.clientId];
                      return h(Link, { key: s.id, to: "/sessions/" + s.id, className: "list-row" },
                        h("div", { className: "avatar", "aria-hidden": true }, initials(c ? c.fullName : "?")),
                        h("div", { className: "list-row-body" },
                          h("div", { className: "list-row-title" }, c ? c.fullName : "Unknown client"),
                          h("div", { className: "list-row-subtitle" }, formatDate(s.date) + " · Session #" + s.sessionNumber + " · " + s.trainingType.join(", "))
                        ),
                        h(ChevronRightIcon, { className: "list-row-chevron" })
                      );
                    })
                  )
            )
          )
    )
  );
}

/* ---------------------------------------------------------------------- */
/* Clients list + form                                                      */
/* ---------------------------------------------------------------------- */

function ClientsList() {
  var _s = useState(""), search = _s[0], setSearch = _s[1];
  var _s2 = useState("active"), statusFilter = _s2[0], setStatusFilter = _s2[1];
  var clients = useClients({ search: search || undefined, status: statusFilter === "all" ? undefined : statusFilter });
  var sessions = useAllSessions();

  return h(React.Fragment, null,
    h(PageHeader, { title: "Clients", action: h(Link, { to: "/clients/new", className: "icon-btn", "aria-label": "Add client" }, h(PlusCircleIcon, null)) }),
    h("div", { className: "page-content" },
      h(SearchBar, { value: search, onChange: setSearch, placeholder: "Search clients" }),
      h("div", { style: { marginBottom: 14 } },
        h(SegmentedControl, {
          ariaLabel: "Filter by status", value: statusFilter, onChange: setStatusFilter,
          options: [{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }, { value: "all", label: "All" }],
        })
      ),
      clients === undefined ? null : clients.length === 0
        ? h(EmptyState, { icon: h(UsersIcon, { width: 36, height: 36 }), title: "No clients found", message: search ? "Try a different search." : "Add your first client to get started." })
        : h("div", { className: "list-card" },
            clients.map(function (c) {
              var stats = sessions ? computeSessionStats(c, sessions.filter(function (s) { return s.clientId === c.id; })) : null;
              return h(Link, { key: c.id, to: "/clients/" + c.id, className: "list-row" },
                h("div", { className: "avatar", "aria-hidden": true }, initials(c.fullName)),
                h("div", { className: "list-row-body" },
                  h("div", { className: "list-row-title" }, c.fullName),
                  h("div", { className: "list-row-subtitle" }, (c.preferredTraining.join(", ") || "No training preference set") + (stats && stats.remaining != null ? " · " + stats.remaining + " sessions left" : ""))
                ),
                c.status === "inactive" && h(Badge, { tone: "neutral" }, "Inactive"),
                h(ChevronRightIcon, { className: "list-row-chevron" })
              );
            })
          )
    )
  );
}

function blankClient() {
  return {
    fullName: "", gender: "Prefer not to say", dateOfBirth: null, email: "", phone: "", startDate: todayIso(),
    preferredTraining: [], currentGoal: "", medicalHistory: "", injuriesAndPain: "", precautions: "",
    trackedBodyAreas: STANDARD_BODY_AREAS.slice(),
    emergencyContactName: "", emergencyContactPhone: "", packageTotalSessions: null, packageStartDate: null,
    packageExpiryDate: null, status: "active", generalNotes: "", assignedProgramId: null,
  };
}
function ClientFormPage(props) {
  var mode = props.mode, clientId = props.clientId;
  var existing = useClient(mode === "edit" ? clientId : undefined);
  var programs = useAllPrograms();
  var _s = useState(blankClient()), form = _s[0], setForm = _s[1];
  var _e = useState({}), errors = _e[0], setErrors = _e[1];
  var _sv = useState(false), saving = _sv[0], setSaving = _sv[1];
  var _se = useState(""), submitError = _se[0], setSubmitError = _se[1];
  var _cd = useState(false), confirmDeleteOpen = _cd[0], setConfirmDeleteOpen = _cd[1];
  var _hy = useState(mode === "create"), hydrated = _hy[0], setHydrated = _hy[1];

  useEffect(function () {
    if (mode === "edit" && existing && !hydrated) {
      setForm({
        fullName: existing.fullName, gender: existing.gender, dateOfBirth: existing.dateOfBirth,
        email: existing.email, phone: existing.phone, startDate: existing.startDate,
        preferredTraining: existing.preferredTraining, currentGoal: existing.currentGoal,
        medicalHistory: existing.medicalHistory, injuriesAndPain: existing.injuriesAndPain,
        precautions: existing.precautions, emergencyContactName: existing.emergencyContactName,
        emergencyContactPhone: existing.emergencyContactPhone, packageTotalSessions: existing.packageTotalSessions,
        packageStartDate: existing.packageStartDate, packageExpiryDate: existing.packageExpiryDate,
        status: existing.status, generalNotes: existing.generalNotes, assignedProgramId: existing.assignedProgramId || null,
      });
      setHydrated(true);
    }
  }, [mode, existing, hydrated]);

  function set(key, value) { setForm(function (f) { var next = Object.assign({}, f); next[key] = value; return next; }); }
  function validate() {
    var next = {};
    if (!form.fullName.trim()) next.fullName = "Full name is required.";
    if (!isValidEmail(form.email)) next.email = "Enter a valid email address.";
    if (form.packageTotalSessions != null && Number(form.packageTotalSessions) < 0) next.packageTotalSessions = "Must be zero or more.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }
  function handleSubmit(e) {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    setSubmitError("");
    var p = mode === "create" ? clientRepository.create(form) : clientRepository.update(clientId, form);
    p.then(function (result) {
      navigate("/clients/" + (mode === "create" ? result.id : clientId));
    }).catch(function (err) {
      setSubmitError(err.message || "Couldn't save this client. Check your connection and try again.");
    }).finally(function () { setSaving(false); });
  }
  function handleDelete() {
    clientRepository.remove(clientId).then(function () { navigate("/clients"); });
  }

  if (mode === "edit" && !hydrated) return h(React.Fragment, null, h(PageHeader, { title: "Edit client", back: true }), h("div", { className: "page-content" }));

  return h(React.Fragment, null,
    h(PageHeader, { title: mode === "create" ? "New client" : "Edit client", back: true }),
    h("div", { className: "page-content" },
      h("form", { onSubmit: handleSubmit, noValidate: true },
        h("fieldset", { className: "form-group" },
          h("legend", null, "Personal details"),
          h(TextField, { label: "Full name", value: form.fullName, onChange: function (e) { set("fullName", e.target.value); }, error: errors.fullName, required: true }),
          h(RadioGroupField, { label: "Gender", name: "gender", options: GENDERS, value: form.gender, onChange: function (v) { set("gender", v); } }),
          h(TextField, { label: "Date of birth", type: "date", optional: true, value: form.dateOfBirth || "", onChange: function (e) { set("dateOfBirth", e.target.value || null); } })
        ),
        h("fieldset", { className: "form-group" },
          h("legend", null, "Contact"),
          h("div", { className: "form-grid-2" },
            h(TextField, { label: "Email", type: "email", optional: true, value: form.email, onChange: function (e) { set("email", e.target.value); }, error: errors.email }),
            h(TextField, { label: "Phone", type: "tel", optional: true, value: form.phone, onChange: function (e) { set("phone", e.target.value); } })
          ),
          h("div", { className: "form-grid-2" },
            h(TextField, { label: "Emergency contact name", optional: true, value: form.emergencyContactName, onChange: function (e) { set("emergencyContactName", e.target.value); } }),
            h(TextField, { label: "Emergency contact phone", type: "tel", optional: true, value: form.emergencyContactPhone, onChange: function (e) { set("emergencyContactPhone", e.target.value); } })
          )
        ),
        h("fieldset", { className: "form-group" },
          h("legend", null, "Training"),
          h(MultiSelectChips, { label: "Preferred training", options: TRAINING_TYPES, value: form.preferredTraining, onChange: function (v) { set("preferredTraining", v); } }),
          h(TextField, { label: "Start date", type: "date", value: form.startDate, onChange: function (e) { set("startDate", e.target.value); } }),
          h(TextAreaField, { label: "Current goal", optional: true, value: form.currentGoal, onChange: function (e) { set("currentGoal", e.target.value); }, placeholder: "What is this client working toward right now?" }),
          h(SelectField, { label: "Status", value: form.status, onChange: function (e) { set("status", e.target.value); } },
            h("option", { value: "active" }, "Active"), h("option", { value: "inactive" }, "Inactive")),
          h(SelectField, {
            label: "Assigned workout program", optional: true, value: form.assignedProgramId || "",
            onChange: function (e) { set("assignedProgramId", e.target.value || null); },
            hint: "Build reusable programs under Programs, then assign one here as this client's default.",
          },
            h("option", { value: "" }, "— None —"),
            (programs || []).map(function (p) { return h("option", { key: p.id, value: p.id }, p.name); })
          )
        ),
        h("fieldset", { className: "form-group" },
          h("legend", null, "Session package"),
          h("div", { className: "form-grid-2" },
            h(TextField, { label: "Total sessions in package", type: "number", min: 0, inputMode: "numeric", optional: true, value: form.packageTotalSessions == null ? "" : form.packageTotalSessions, onChange: function (e) { set("packageTotalSessions", e.target.value === "" ? null : Number(e.target.value)); }, error: errors.packageTotalSessions }),
            h("div"),
            h(TextField, { label: "Package start date", type: "date", optional: true, value: form.packageStartDate || "", onChange: function (e) { set("packageStartDate", e.target.value || null); } }),
            h(TextField, { label: "Package expiry date", type: "date", optional: true, value: form.packageExpiryDate || "", onChange: function (e) { set("packageExpiryDate", e.target.value || null); } })
          )
        ),
        h("fieldset", { className: "form-group" },
          h("legend", null, "Health & safety"),
          h(TextAreaField, { label: "Medical history", optional: true, value: form.medicalHistory, onChange: function (e) { set("medicalHistory", e.target.value); } }),
          h(TextAreaField, { label: "Injuries & pain", optional: true, value: form.injuriesAndPain, onChange: function (e) { set("injuriesAndPain", e.target.value); } }),
          h(TextAreaField, { label: "Precautions", optional: true, value: form.precautions, onChange: function (e) { set("precautions", e.target.value); }, hint: "Movements or loads to avoid, contraindications, etc." })
        ),
        h("fieldset", { className: "form-group" },
          h("legend", null, "Notes"),
          h(TextAreaField, { label: "General notes", optional: true, value: form.generalNotes, onChange: function (e) { set("generalNotes", e.target.value); } })
        ),
        submitError && h("p", { className: "form-error", role: "alert", style: { marginBottom: 8 } }, submitError),
        h("div", { className: "form-actions" },
          h(Button, { type: "submit", disabled: saving, className: "btn-block" }, saving ? "Saving…" : mode === "create" ? "Add client" : "Save changes")
        ),
        mode === "edit" && h("div", { className: "form-actions" },
          h(Button, { type: "button", variant: "danger", className: "btn-block", onClick: function () { setConfirmDeleteOpen(true); } }, "Delete client")
        )
      )
    ),
    h(ConfirmDialog, {
      open: confirmDeleteOpen, title: "Delete this client?",
      message: "This permanently deletes the client along with all of their sessions and goals. This cannot be undone.",
      confirmLabel: "Delete", onCancel: function () { setConfirmDeleteOpen(false); }, onConfirm: handleDelete,
    })
  );
}

/* ---------------------------------------------------------------------- */
/* Client profile + tabs                                                    */
/* ---------------------------------------------------------------------- */

function Field(props) {
  return h("div", { style: { marginBottom: 12 } },
    h("div", { className: "text-secondary", style: { fontSize: 12, fontWeight: 700, marginBottom: 2 } }, props.label),
    h("div", { style: { fontSize: 14.5, whiteSpace: "pre-wrap" } }, props.value && props.value.trim ? (props.value.trim() ? props.value : "—") : (props.value || "—"))
  );
}
function OverviewTab(props) {
  var client = props.client;
  var program = props.assignedProgram;
  var age = calculateAge(client.dateOfBirth);
  return h("div", { className: "stack" },
    h("section", null, h(SectionLabel, null, "Personal details"), h(Card, null,
      h(Field, { label: "Gender", value: client.gender }),
      h(Field, { label: "Date of birth", value: client.dateOfBirth ? formatDate(client.dateOfBirth) + (age != null ? " (" + age + " yrs)" : "") : null }),
      h(Field, { label: "Preferred training", value: client.preferredTraining.join(", ") })
    )),
    h("section", null, h(SectionLabel, null, "Assigned program"), h(Card, null,
      client.assignedProgramId && program
        ? h("div", { className: "flex-between" },
            h("div", { style: { minWidth: 0 } },
              h("div", { style: { fontWeight: 700, fontSize: 14.5 } }, program.name),
              program.description && h("div", { className: "text-secondary", style: { fontSize: 12.5, marginTop: 2 } }, program.description),
              h("div", { className: "text-tertiary", style: { fontSize: 11.5, marginTop: 4 } }, program.exercises.length + " exercise" + (program.exercises.length === 1 ? "" : "s"))
            ),
            h(Link, { to: "/programs/" + program.id + "/edit" }, h(Button, { variant: "text", size: "sm" }, "View"))
          )
        : h("p", { className: "text-secondary", style: { margin: 0, fontSize: 13.5 } },
            "No program assigned. ", h(Link, { to: "/clients/" + client.id + "/edit" }, "Assign one"), " from a saved template."
          )
    )),
    h("section", null, h(SectionLabel, null, "Contact"), h(Card, null,
      h(Field, { label: "Email", value: client.email }),
      h(Field, { label: "Phone", value: client.phone }),
      h(Field, { label: "Emergency contact", value: client.emergencyContactName }),
      h(Field, { label: "Emergency phone", value: client.emergencyContactPhone })
    )),
    h("section", null, h(SectionLabel, null, "Health & safety"), h(Card, null,
      h(Field, { label: "Medical history", value: client.medicalHistory }),
      h(Field, { label: "Injuries & pain", value: client.injuriesAndPain }),
      h(Field, { label: "Precautions", value: client.precautions })
    )),
    h("section", null, h(SectionLabel, null, "Current goal"), h(Card, null, h("p", { style: { margin: 0, fontSize: 14.5, whiteSpace: "pre-wrap" } }, client.currentGoal || "—"))),
    h("section", null, h(SectionLabel, null, "General notes"), h(Card, null, h("p", { style: { margin: 0, fontSize: 14.5, whiteSpace: "pre-wrap" } }, client.generalNotes || "—")))
  );
}
function truncate(text, max) {
  max = max || 80;
  var t = (text || "").trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1) + "…";
}
function SessionsTab(props) {
  var client = props.client, sessions = props.sessions;
  return h("div", { className: "stack" },
    h(Link, { to: "/clients/" + client.id + "/sessions/new" }, h(Button, { className: "btn-block" }, h(PlusCircleIcon, { width: 18, height: 18 }), "Log a new session")),
    sessions.length === 0
      ? h(EmptyState, { icon: h(CalendarIcon, { width: 36, height: 36 }), title: "No sessions logged yet" })
      : h("div", { className: "list-card" },
          sessions.map(function (s) {
            return h(Link, { key: s.id, to: "/sessions/" + s.id, className: "list-row", style: { alignItems: "flex-start" } },
              h("div", { className: "list-row-body" },
                h("span", { className: "list-row-title" }, "#" + s.sessionNumber + " · " + formatDate(s.date)),
                h("div", { className: "list-row-subtitle", style: { whiteSpace: "normal" } }, (s.trainingType.join(", ") || "Session") + (s.sessionNote ? " — " + truncate(s.sessionNote) : "")),
                h("div", { className: "flex-row gap-8", style: { marginTop: 6 } },
                  s.painScore != null && h(Badge, { tone: s.painScore >= 5 ? "danger" : "neutral" }, "Pain " + s.painScore + "/10"),
                  s.rpe != null && h(Badge, { tone: "info" }, "RPE " + s.rpe + "/10")
                )
              ),
              h(ChevronRightIcon, { className: "list-row-chevron", style: { marginTop: 4 } })
            );
          })
        )
  );
}
var STATUS_TONE = { "Not started": "neutral", "In progress": "info", Achieved: "success", Revised: "warning" };
function GoalCard(props) {
  var clientId = props.clientId, timeframe = props.timeframe, goal = props.goal;
  var _e = useState(false), editing = _e[0], setEditing = _e[1];
  var _d = useState({ goal: goal ? goal.goal : "", measurableTarget: goal ? goal.measurableTarget : "", status: goal ? goal.status : "Not started", notes: goal ? goal.notes : "" });
  var draft = _d[0], setDraft = _d[1];
  var _sv = useState(false), saving = _sv[0], setSaving = _sv[1];

  function startEdit() {
    setDraft({ goal: goal ? goal.goal : "", measurableTarget: goal ? goal.measurableTarget : "", status: goal ? goal.status : "Not started", notes: goal ? goal.notes : "" });
    setEditing(true);
  }
  function save() {
    setSaving(true);
    goalRepository.upsertForTimeframe(clientId, timeframe, draft).then(function () { setEditing(false); }).finally(function () { setSaving(false); });
  }
  var isEmpty = !goal || (!goal.goal && !goal.measurableTarget && goal.status === "Not started" && !goal.notes);

  return h(Card, null,
    h("div", { className: "flex-between", style: { marginBottom: editing ? 14 : 6 } },
      h("div", { style: { fontWeight: 700, fontSize: 15 } }, timeframe + " goal"),
      !editing && h(Badge, { tone: STATUS_TONE[(goal && goal.status) || "Not started"] }, (goal && goal.status) || "Not started")
    ),
    editing
      ? h("div", null,
          h(TextField, { label: "Goal", value: draft.goal, onChange: function (e) { setDraft(Object.assign({}, draft, { goal: e.target.value })); }, placeholder: "e.g. Improve core control" }),
          h(TextField, { label: "Measurable target", optional: true, value: draft.measurableTarget, onChange: function (e) { setDraft(Object.assign({}, draft, { measurableTarget: e.target.value })); }, placeholder: "e.g. Pain under 3/10 for 4 weeks" }),
          h(SelectField, { label: "Status", value: draft.status, onChange: function (e) { setDraft(Object.assign({}, draft, { status: e.target.value })); } },
            GOAL_STATUSES.map(function (s) { return h("option", { key: s, value: s }, s); })),
          h(TextAreaField, { label: "Notes", optional: true, value: draft.notes, onChange: function (e) { setDraft(Object.assign({}, draft, { notes: e.target.value })); } }),
          h("div", { className: "form-actions" },
            h(Button, { variant: "secondary", className: "btn-block", onClick: function () { setEditing(false); } }, "Cancel"),
            h(Button, { className: "btn-block", onClick: save, disabled: saving }, saving ? "Saving…" : "Save")
          )
        )
      : isEmpty
      ? h(Button, { variant: "secondary", size: "sm", onClick: startEdit }, "Set a goal")
      : h("div", null,
          h("p", { style: { margin: "0 0 6px", fontSize: 14.5 } }, goal.goal),
          goal.measurableTarget && h("p", { className: "text-secondary", style: { margin: "0 0 6px", fontSize: 13.5 } }, "Target: " + goal.measurableTarget),
          goal.notes && h("p", { className: "text-secondary", style: { margin: "0 0 10px", fontSize: 13.5 } }, goal.notes),
          h("div", { className: "flex-between" },
            h("span", { className: "text-tertiary", style: { fontSize: 11.5 } }, "Updated " + formatDate(goal.updatedAt)),
            h(Button, { variant: "text", size: "sm", onClick: startEdit }, "Edit")
          )
        )
  );
}
function GoalsTab(props) {
  var goals = props.goals;
  return h("div", { className: "stack" },
    GOAL_TIMEFRAMES.map(function (tf) {
      var goal = goals.filter(function (g) { return g.timeframe === tf; })[0];
      return h(GoalCard, { key: tf, clientId: props.client.id, timeframe: tf, goal: goal });
    })
  );
}
var STATUS_PERCENT = { "Not started": 0, "In progress": 55, Revised: 30, Achieved: 100 };
function shortDate(iso) { var d = new Date(iso); return d.toLocaleDateString(undefined, { day: "numeric", month: "short" }); }
function monthKey(iso) { return iso.slice(0, 7); }
function monthLabel(key) { var parts = key.split("-").map(Number); return new Date(parts[0], parts[1] - 1, 1).toLocaleDateString(undefined, { month: "short" }); }
function AssessmentModal(props) {
  var open = props.open, client = props.client, areas = props.areas;
  var _s = useState({}), scores = _s[0], setScores = _s[1];
  var _n = useState(""), notes = _n[0], setNotes = _n[1];
  var _sv = useState(false), saving = _sv[0], setSaving = _sv[1];
  var _se = useState(""), submitError = _se[0], setSubmitError = _se[1];

  useEffect(function () { if (open) { setScores({}); setNotes(""); setSubmitError(""); } }, [open]);
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
    setSubmitError("");
    bodyScoreRepository.createMany(inputs).then(function () { props.onClose(); }).catch(function (err) {
      setSubmitError(err.message || "Couldn't save this assessment. Check your connection and try again.");
    }).finally(function () { setSaving(false); });
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
      submitError && h("p", { className: "form-error", role: "alert", style: { marginBottom: 10 } }, submitError),
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
  var _se = useState(""), submitError = _se[0], setSubmitError = _se[1];

  useEffect(function () { if (open) { setAreas(client.trackedBodyAreas || STANDARD_BODY_AREAS); setCustomArea(""); setSubmitError(""); } }, [open, client]);
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
    setSubmitError("");
    clientRepository.update(client.id, { trackedBodyAreas: areas }).then(function () { props.onClose(); }).catch(function (err) {
      setSubmitError(err.message || "Couldn't save tracked areas. Check your connection and try again.");
    }).finally(function () { setSaving(false); });
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
      submitError && h("p", { className: "form-error", role: "alert", style: { marginBottom: 10 } }, submitError),
      h("div", { className: "modal-actions" },
        h(Button, { type: "button", variant: "secondary", className: "btn-block", onClick: props.onClose }, "Cancel"),
        h(Button, { type: "button", className: "btn-block", onClick: handleSave, disabled: saving }, saving ? "Saving…" : "Save")
      )
    )
  );
}
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
  var _de = useState(null), deleteEntryId = _de[0], setDeleteEntryId = _de[1];
  var trendEntries = bodyScores.filter(function (s) { return s.area === trendArea; });
  var trendData = trendEntries.map(function (s) { return { label: shortDate(s.recordedAt), value: s.score }; });
  var trendEntriesRecent = trendEntries.slice().reverse();

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
      h(LineChart, { data: trendData, yMin: 1, yMax: 10, formatValue: function (v) { return v + "/10"; } }),
      trendEntriesRecent.length > 0 && h("div", { className: "stack", style: { gap: 6, marginTop: 12 } },
        trendEntriesRecent.map(function (entry) {
          return h("div", { key: entry.id, className: "flex-between", style: { fontSize: 13 } },
            h("span", null, formatDate(entry.recordedAt) + " — " + entry.score + "/10" + (entry.source === "session" ? " (session)" : " (assessment)")),
            h("button", { type: "button", className: "icon-btn", "aria-label": "Delete this entry", onClick: function () { setDeleteEntryId(entry.id); } }, h(TrashIcon, { width: 15, height: 15 }))
          );
        })
      )
    ),
    h(AssessmentModal, { open: assessmentOpen, client: client, areas: trackedAreas, onClose: function () { setAssessmentOpen(false); } }),
    h(ManageAreasModal, { open: manageAreasOpen, client: client, onClose: function () { setManageAreasOpen(false); } }),
    h(ConfirmDialog, {
      open: !!deleteEntryId, title: "Delete this score?",
      message: "This permanently removes this body-score entry. This cannot be undone.",
      confirmLabel: "Delete",
      onCancel: function () { setDeleteEntryId(null); },
      onConfirm: function () { bodyScoreRepository.remove(deleteEntryId).then(function () { setDeleteEntryId(null); }); },
    }),
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

var ROM_SCORE_LABEL = { 2: "Meets norm", 1: "Borderline", 0: "Restricted/Pain" };
function blankMovementScreenForm() {
  return { screenedAt: todayIso(), movement: {}, deadHangSeconds: "", deadHangPain: false, rom: {}, notes: "" };
}
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
      h("div", { className: "chart-title" }, "Readiness score over time"),
      h("div", { className: "chart-subtitle" }, "Across all screenings"),
      h(LineChart, {
        data: screens.map(function (s) { return { label: shortDate(s.screenedAt), value: s.readinessScore }; }),
        yMin: 0, yMax: 100, color: RESULT_COLOR_VAR[latest.overallResult],
        formatValue: function (v) { return v + "/100"; },
      })
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

function MovementScreenFormPage(props) {
  var client = useClient(props.clientId);
  var _f = useState(blankMovementScreenForm()), form = _f[0], setForm = _f[1];
  var _sv = useState(false), saving = _sv[0], setSaving = _sv[1];
  var _se = useState(""), submitError = _se[0], setSubmitError = _se[1];

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
    setSubmitError("");

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
      clientId: client.id, screenedAt: form.screenedAt, movementScores: movementScores, romScores: romScores,
      overallResult: overallResult, readinessScore: readinessScore, notes: form.notes,
    };

    movementScreenRepository.create(screeningInput).then(function () {
      if (painfulLabels.length === 0) return;
      var note = "Pain noted during movement screen — " + painfulLabels.join(", ") + ", " + formatDate(form.screenedAt) + ".";
      var combined = client.injuriesAndPain ? client.injuriesAndPain + "\n" + note : note;
      return clientRepository.update(client.id, { injuriesAndPain: combined });
    }).then(function () {
      navigate("/clients/" + client.id + "?tab=screening");
    }).catch(function (err) {
      setSubmitError(err.message || "Couldn't save this screening. Check your connection and try again.");
    }).finally(function () { setSaving(false); });
  }

  if (!client) return h(React.Fragment, null, h(PageHeader, { title: "Movement Screen", back: true }), h("div", { className: "page-content" }));

  return h(React.Fragment, null,
    h(PageHeader, { title: "PilatesTribe Movement & ROM Screen", back: true }),
    h("div", { className: "page-content" },
      h("p", { className: "text-secondary", style: { marginBottom: 14, fontSize: 14 } }, "For " + client.fullName),
      h("form", { onSubmit: handleSubmit, noValidate: true },
        h("fieldset", { className: "form-group" },
          h("legend", null, "Screening details"),
          h(TextField, {
            label: "Date screened", type: "date", value: form.screenedAt,
            onChange: function (e) { setForm(Object.assign({}, form, { screenedAt: e.target.value })); },
            hint: "If this screening actually happened on a different day than today, set that date here so the trend chart stays accurate.",
          })
        ),
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
                  [2, 1, 0].map(function (n) { return h("option", { key: n, value: n }, n + " (" + ROM_SCORE_LABEL[n] + ")"); })
                ),
                h(SelectField, {
                  label: "Right", optional: true, value: side.right == null ? "" : side.right,
                  onChange: function (e) { setRomScore(t.id, "right", e.target.value); },
                },
                  h("option", { value: "" }, "—"),
                  [2, 1, 0].map(function (n) { return h("option", { key: n, value: n }, n + " (" + ROM_SCORE_LABEL[n] + ")"); })
                )
              )
            );
          })
        ),
        h("fieldset", { className: "form-group" },
          h("legend", null, "Notes"),
          h(TextAreaField, { label: "Corrective focus / observations", optional: true, value: form.notes, onChange: function (e) { setForm(Object.assign({}, form, { notes: e.target.value })); } })
        ),
        submitError && h("p", { className: "form-error", role: "alert", style: { marginBottom: 8 } }, submitError),
        h("div", { className: "form-actions" },
          h(Button, { type: "submit", className: "btn-block", disabled: saving }, saving ? "Saving…" : "Save screening")
        )
      )
    )
  );
}

function ClientProfilePage(props) {
  var clientId = props.clientId;
  var route = useRoute();
  var tab = route.query.tab || "overview";
  var client = useClient(clientId);
  var sessions = useSessionsForClient(clientId);
  var bodyScores = useBodyScoresForClient(clientId);
  var movementScreens = useMovementScreensForClient(clientId);
  var goals = useGoalsForClient(clientId);
  var assignedProgram = useProgram(client && client.assignedProgramId);

  if (client === undefined || sessions === undefined) return h(React.Fragment, null, h(PageHeader, { title: "Client", back: true }), h("div", { className: "page-content" }));

  var stats = computeSessionStats(client, sessions);

  return h(React.Fragment, null,
    h(PageHeader, { title: client.fullName, back: true, action: h(Link, { to: "/clients/" + client.id + "/edit", className: "icon-btn", "aria-label": "Edit client" }, h(EditIcon, null)) }),
    h("div", { className: "page-content stack" },
      h("div", { className: "card", style: { display: "flex", alignItems: "center", gap: 14 } },
        h("div", { className: "avatar avatar-lg", "aria-hidden": true }, initials(client.fullName)),
        h("div", { style: { minWidth: 0 } },
          h("h2", { style: { fontSize: 18, fontWeight: 700, marginBottom: 4 } }, client.fullName),
          h("div", { className: "flex-row gap-8 wrap" },
            h(Badge, { tone: client.status === "active" ? "success" : "neutral" }, client.status === "active" ? "Active" : "Inactive"),
            client.preferredTraining.map(function (t) { return h(Badge, { key: t, tone: "info" }, t); })
          )
        )
      ),
      h("div", { className: "stat-grid" },
        h(StatCard, { label: "Sessions consumed", value: stats.consumed }),
        h(StatCard, { label: "Sessions remaining", value: stats.remaining == null ? "—" : stats.remaining, tone: (stats.packageStatus === "expired" || stats.packageStatus === "expiring-soon") ? "warning" : undefined }),
        h(StatCard, { label: "Start date", value: formatDate(client.startDate) }),
        h(StatCard, { label: "Last session", value: formatDate(stats.lastSessionDate) })
      ),
      stats.total != null && h("div", { className: "card flex-between" },
        h("div", null,
          h("div", { style: { fontWeight: 700, fontSize: 14 } }, "Package status"),
          h("div", { className: "text-secondary", style: { fontSize: 13 } }, stats.consumedInCurrentPackage + " of " + stats.total + " sessions used" + (client.packageExpiryDate ? " · expires " + formatDate(client.packageExpiryDate) : ""))
        ),
        h(Badge, { tone: stats.packageStatus === "expired" ? "danger" : stats.packageStatus === "expiring-soon" ? "warning" : stats.packageStatus === "completed" ? "neutral" : "success" }, PACKAGE_STATUS_LABEL[stats.packageStatus])
      ),
      client.currentGoal && h("div", { className: "card" }, h("div", { className: "section-label", style: { marginBottom: 4 } }, "Current goal"), h("p", { style: { margin: 0, fontSize: 14.5 } }, client.currentGoal)),
      h(TabBar, {
        value: tab, onChange: function (t) { setQueryParam("tab", t); },
        tabs: [{ value: "overview", label: "Overview" }, { value: "sessions", label: "Sessions" }, { value: "goals", label: "Goals" }, { value: "progress", label: "Progress" }, { value: "screening", label: "Screening" }],
      }),
      tab === "overview" && h(OverviewTab, { client: client, assignedProgram: assignedProgram }),
      tab === "sessions" && h(SessionsTab, { client: client, sessions: sessions }),
      tab === "goals" && h(GoalsTab, { client: client, goals: goals || [] }),
      tab === "progress" && h(ProgressTab, { client: client, sessions: sessions, goals: goals || [], bodyScores: bodyScores || [] }),
      tab === "screening" && h(ScreeningTab, { client: client, screens: movementScreens || [] })
    )
  );
}

/* ---------------------------------------------------------------------- */
/* Sessions: form, detail, picker, history                                  */
/* ---------------------------------------------------------------------- */

function blankSession(clientId, sessionNumber) {
  return {
    clientId: clientId, date: todayIso(), sessionNumber: sessionNumber, trainingType: [], durationMinutes: 60,
    exercises: [], sessionNote: "", clientResponse: "", painScore: null, rpe: null, modifications: "",
    progression: "", homework: "", nextSessionFocus: "",
  };
}
function SessionFormPage(props) {
  var mode = props.mode;
  var existingSession = useSession(mode === "edit" ? props.sessionId : undefined);
  var resolvedClientId = mode === "create" ? props.clientId : (existingSession && existingSession.clientId);
  var client = useClient(resolvedClientId);
  var programs = useAllPrograms();
  var _f = useState(null), form = _f[0], setForm = _f[1];
  var _sv = useState(false), saving = _sv[0], setSaving = _sv[1];
  var _se = useState(""), submitError = _se[0], setSubmitError = _se[1];
  var _cd = useState(false), confirmDeleteOpen = _cd[0], setConfirmDeleteOpen = _cd[1];
  var _pp = useState(""), selectedProgramId = _pp[0], setSelectedProgramId = _pp[1];
  var _cpo = useState(false), confirmApplyOpen = _cpo[0], setConfirmApplyOpen = _cpo[1];
  var _pdefault = useState(false), programDefaulted = _pdefault[0], setProgramDefaulted = _pdefault[1];
  var _bso = useState(false), bodyScoresOpen = _bso[0], setBodyScoresOpen = _bso[1];
  var _bsd = useState({}), bodyScoreDraft = _bsd[0], setBodyScoreDraft = _bsd[1];
  function setDraftScore(area, value) { setBodyScoreDraft(function (d) { var next = Object.assign({}, d); next[area] = value; return next; }); }

  useEffect(function () {
    var cancelled = false;
    if (mode === "create" && props.clientId && !form) {
      sessionRepository.nextSessionNumber(props.clientId).then(function (n) { if (!cancelled) setForm(blankSession(props.clientId, n)); });
    }
    return function () { cancelled = true; };
  }, [mode, props.clientId, form]);

  useEffect(function () {
    if (mode === "edit" && existingSession && !form) {
      setForm({
        clientId: existingSession.clientId, date: existingSession.date, sessionNumber: existingSession.sessionNumber,
        trainingType: existingSession.trainingType, durationMinutes: existingSession.durationMinutes,
        exercises: existingSession.exercises, sessionNote: existingSession.sessionNote, clientResponse: existingSession.clientResponse,
        painScore: existingSession.painScore, rpe: existingSession.rpe, modifications: existingSession.modifications,
        progression: existingSession.progression, homework: existingSession.homework, nextSessionFocus: existingSession.nextSessionFocus,
      });
    }
  }, [mode, existingSession, form]);

  // Pre-select the client's assigned program (if any) as a one-time default,
  // so logging a session for them starts with their usual program pre-picked.
  useEffect(function () {
    if (mode === "create" && client && client.assignedProgramId && !programDefaulted) {
      setSelectedProgramId(client.assignedProgramId);
      setProgramDefaulted(true);
    }
  }, [mode, client, programDefaulted]);

  function set(key, value) { setForm(function (f) { var next = Object.assign({}, f); next[key] = value; return next; }); }

  var selectedProgram = (programs || []).filter(function (p) { return p.id === selectedProgramId; })[0];
  function applyProgram(program) {
    set("exercises", instantiateProgramExercises(program.exercises));
  }
  function handleApplyClick() {
    if (!selectedProgram || !form) return;
    if (form.exercises.length > 0) setConfirmApplyOpen(true);
    else applyProgram(selectedProgram);
  }
  function confirmApply() {
    if (selectedProgram) applyProgram(selectedProgram);
    setConfirmApplyOpen(false);
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setSubmitError("");
    var p = mode === "create" ? sessionRepository.create(form) : sessionRepository.update(props.sessionId, form);
    p.then(function (result) {
      var sessionId = mode === "create" ? result.id : props.sessionId;
      var trackedAreas = client && client.trackedBodyAreas ? client.trackedBodyAreas : [];
      var scoreInputs = trackedAreas.filter(function (a) { return bodyScoreDraft[a] != null && bodyScoreDraft[a] !== ""; })
        .map(function (a) { return { clientId: form.clientId, area: a, score: Number(bodyScoreDraft[a]), source: "session", sessionId: sessionId, recordedAt: form.date, notes: "" }; });
      var scoreSave = scoreInputs.length ? bodyScoreRepository.createMany(scoreInputs) : Promise.resolve();
      return scoreSave.then(function () { navigate("/sessions/" + sessionId); });
    }).catch(function (err) {
      setSubmitError(err.message || "Couldn't save this session. Check your connection and try again.");
    }).finally(function () { setSaving(false); });
  }
  function handleDelete() {
    sessionRepository.remove(props.sessionId).then(function () { navigate("/clients/" + form.clientId + "?tab=sessions"); });
  }

  if (!form || client === undefined) return h(React.Fragment, null, h(PageHeader, { title: "Session", back: true }), h("div", { className: "page-content" }));

  return h(React.Fragment, null,
    h(PageHeader, { title: mode === "create" ? ("New session" + (client ? " · " + client.fullName : "")) : "Edit session", back: true }),
    h("div", { className: "page-content" },
      h("form", { onSubmit: handleSubmit, noValidate: true },
        h("fieldset", { className: "form-group" },
          h("legend", null, "Session details"),
          h("div", { className: "form-grid-2" },
            h(TextField, { label: "Date", type: "date", value: form.date, onChange: function (e) { set("date", e.target.value); } }),
            h(TextField, { label: "Session number", type: "number", min: 1, inputMode: "numeric", value: form.sessionNumber, onChange: function (e) { set("sessionNumber", Number(e.target.value)); } })
          ),
          h(MultiSelectChips, { label: "Training type", options: TRAINING_TYPES, value: form.trainingType, onChange: function (v) { set("trainingType", v); } }),
          h(TextField, { label: "Duration (minutes)", type: "number", min: 0, inputMode: "numeric", optional: true, value: form.durationMinutes == null ? "" : form.durationMinutes, onChange: function (e) { set("durationMinutes", e.target.value === "" ? null : Number(e.target.value)); } })
        ),
        programs && programs.length > 0 && h("fieldset", { className: "form-group" },
          h("legend", null, "Apply a program"),
          h("div", { className: "flex-row gap-8 wrap", style: { alignItems: "flex-end" } },
            h("div", { style: { flex: "1 1 200px", minWidth: 0 } },
              h(SelectField, {
                label: "Saved program", value: selectedProgramId,
                onChange: function (e) { setSelectedProgramId(e.target.value); },
              },
                h("option", { value: "" }, "— Select a program —"),
                programs.map(function (p) { return h("option", { key: p.id, value: p.id }, p.name); })
              )
            ),
            h(Button, { type: "button", variant: "secondary", onClick: handleApplyClick, disabled: !selectedProgramId }, "Apply")
          ),
          h("p", { className: "text-tertiary", style: { fontSize: 12, marginTop: -8 } }, "Loads that program's exercises into this session so you can adjust them to what actually happened.")
        ),
        h("fieldset", { className: "form-group" }, h("legend", null, "Exercises"), h(ExerciseEditor, { exercises: form.exercises, onChange: function (v) { set("exercises", v); } })),
        h("fieldset", { className: "form-group" },
          h("legend", null, "Client response"),
          h("div", { className: "form-grid-2" },
            h(TextField, { label: "Pain score (0–10)", type: "number", min: 0, max: 10, inputMode: "numeric", optional: true, value: form.painScore == null ? "" : form.painScore, onChange: function (e) { set("painScore", e.target.value === "" ? null : Number(e.target.value)); } }),
            h(TextField, { label: "RPE (1–10)", type: "number", min: 1, max: 10, inputMode: "numeric", optional: true, value: form.rpe == null ? "" : form.rpe, onChange: function (e) { set("rpe", e.target.value === "" ? null : Number(e.target.value)); } })
          ),
          h(TextAreaField, { label: "Client response", optional: true, value: form.clientResponse, onChange: function (e) { set("clientResponse", e.target.value); }, placeholder: "How did the client feel / respond?" })
        ),
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
        h("fieldset", { className: "form-group" },
          h("legend", null, "Session notes"),
          h(TextAreaField, { label: "Session note", optional: true, value: form.sessionNote, onChange: function (e) { set("sessionNote", e.target.value); } }),
          h(TextAreaField, { label: "Modifications", optional: true, value: form.modifications, onChange: function (e) { set("modifications", e.target.value); } }),
          h(TextAreaField, { label: "Progression", optional: true, value: form.progression, onChange: function (e) { set("progression", e.target.value); } }),
          h(TextAreaField, { label: "Homework", optional: true, value: form.homework, onChange: function (e) { set("homework", e.target.value); } }),
          h(TextAreaField, { label: "Focus for next session", optional: true, value: form.nextSessionFocus, onChange: function (e) { set("nextSessionFocus", e.target.value); } })
        ),
        submitError && h("p", { className: "form-error", role: "alert", style: { marginBottom: 8 } }, submitError),
        h("div", { className: "form-actions" }, h(Button, { type: "submit", className: "btn-block", disabled: saving }, saving ? "Saving…" : mode === "create" ? "Save session" : "Save changes")),
        mode === "edit" && h("div", { className: "form-actions" }, h(Button, { type: "button", variant: "danger", className: "btn-block", onClick: function () { setConfirmDeleteOpen(true); } }, "Delete session"))
      )
    ),
    h(ConfirmDialog, { open: confirmDeleteOpen, title: "Delete this session?", message: "This permanently removes the session record. This cannot be undone.", onCancel: function () { setConfirmDeleteOpen(false); }, onConfirm: handleDelete }),
    h(ConfirmDialog, {
      open: confirmApplyOpen, title: "Replace current exercises?",
      message: "This session already has exercises added. Applying \"" + (selectedProgram ? selectedProgram.name : "this program") + "\" will replace them with the program's exercises.",
      confirmLabel: "Replace", onCancel: function () { setConfirmApplyOpen(false); }, onConfirm: confirmApply,
    })
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
function DetailRow(props) {
  if (!props.value || !props.value.trim()) return null;
  return h("div", { style: { marginBottom: 12 } },
    h("div", { className: "text-secondary", style: { fontSize: 12, fontWeight: 700, marginBottom: 2 } }, props.label),
    h("div", { style: { fontSize: 14.5, whiteSpace: "pre-wrap" } }, props.value)
  );
}
function SessionDetailPage(props) {
  var session = useSession(props.sessionId);
  var client = useClient(session && session.clientId);
  if (session === undefined) return h(React.Fragment, null, h(PageHeader, { title: "Session", back: true }), h("div", { className: "page-content" }));

  var hasNotes = session.sessionNote || session.clientResponse || session.modifications || session.progression || session.homework || session.nextSessionFocus;

  return h(React.Fragment, null,
    h(PageHeader, { title: "Session #" + session.sessionNumber, back: true, action: h(Link, { to: "/sessions/" + session.id + "/edit", className: "icon-btn", "aria-label": "Edit session" }, h(EditIcon, null)) }),
    h("div", { className: "page-content stack" },
      h(Card, null,
        h("div", { style: { fontWeight: 700, fontSize: 16 } }, client ? h(Link, { to: "/clients/" + client.id }, client.fullName) : "Client"),
        h("div", { className: "text-secondary", style: { fontSize: 13, marginBottom: 8 } }, formatDate(session.date) + " · " + (session.durationMinutes ? session.durationMinutes + " min" : "Duration not set")),
        h("div", { className: "flex-row gap-8 wrap" },
          session.trainingType.map(function (t) { return h(Badge, { key: t, tone: "info" }, t); }),
          session.painScore != null && h(Badge, { tone: session.painScore >= 5 ? "danger" : "neutral" }, "Pain " + session.painScore + "/10"),
          session.rpe != null && h(Badge, { tone: "info" }, "RPE " + session.rpe + "/10")
        )
      ),
      session.exercises.length > 0 && h("section", null,
        h(SectionLabel, null, "Exercises (" + session.exercises.length + ")"),
        h(Card, null, session.exercises.map(function (ex, i) { return h(ExerciseSummary, { key: ex.id, exercise: ex, index: i }); }))
      ),
      h("section", null, h(SectionLabel, null, "Notes"), h(Card, null,
        h(DetailRow, { label: "Session note", value: session.sessionNote }),
        h(DetailRow, { label: "Client response", value: session.clientResponse }),
        h(DetailRow, { label: "Modifications", value: session.modifications }),
        h(DetailRow, { label: "Progression", value: session.progression }),
        h(DetailRow, { label: "Homework", value: session.homework }),
        h(DetailRow, { label: "Focus for next session", value: session.nextSessionFocus }),
        !hasNotes && h("p", { className: "text-secondary" }, "No notes recorded for this session.")
      ))
    )
  );
}
function AddSessionPickerPage() {
  var _s = useState(""), search = _s[0], setSearch = _s[1];
  var clients = useClients({ search: search || undefined });
  return h(React.Fragment, null,
    h(PageHeader, { title: "Add Session" }),
    h("div", { className: "page-content" },
      h("p", { className: "text-secondary", style: { marginBottom: 14, fontSize: 14 } }, "Choose a client to log a session for."),
      h(SearchBar, { value: search, onChange: setSearch, placeholder: "Search clients" }),
      clients === undefined ? null : clients.length === 0
        ? h(EmptyState, { icon: h(UsersIcon, { width: 36, height: 36 }), title: "No clients found" })
        : h("div", { className: "list-card" },
            clients.map(function (c) {
              return h(Link, { key: c.id, to: "/clients/" + c.id + "/sessions/new", className: "list-row" },
                h("div", { className: "avatar", "aria-hidden": true }, initials(c.fullName)),
                h("div", { className: "list-row-body" }, h("div", { className: "list-row-title" }, c.fullName), h("div", { className: "list-row-subtitle" }, c.preferredTraining.join(", ") || "No preference set")),
                c.status === "inactive" && h(Badge, { tone: "neutral" }, "Inactive"),
                h(ChevronRightIcon, { className: "list-row-chevron" })
              );
            })
          )
    )
  );
}
function AllSessionsPage() {
  var _s = useState(""), search = _s[0], setSearch = _s[1];
  var sessions = useAllSessions();
  var clients = useClients();
  var clientById = useMemo(function () { var m = {}; (clients || []).forEach(function (c) { m[c.id] = c; }); return m; }, [clients]);
  var filtered = useMemo(function () {
    if (!sessions) return undefined;
    var q = search.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter(function (s) { var c = clientById[s.clientId]; return (c && c.fullName.toLowerCase().indexOf(q) !== -1) || s.sessionNote.toLowerCase().indexOf(q) !== -1; });
  }, [sessions, search, clientById]);

  return h(React.Fragment, null,
    h(PageHeader, { title: "Session History" }),
    h("div", { className: "page-content" },
      h(SearchBar, { value: search, onChange: setSearch, placeholder: "Search by client or note" }),
      filtered === undefined ? null : filtered.length === 0
        ? h(EmptyState, { icon: h(CalendarIcon, { width: 36, height: 36 }), title: "No sessions found" })
        : h("div", { className: "list-card" },
            filtered.map(function (s) {
              var c = clientById[s.clientId];
              return h(Link, { key: s.id, to: "/sessions/" + s.id, className: "list-row" },
                h("div", { className: "avatar", "aria-hidden": true }, initials(c ? c.fullName : "?")),
                h("div", { className: "list-row-body" }, h("div", { className: "list-row-title" }, c ? c.fullName : "Unknown client"), h("div", { className: "list-row-subtitle" }, formatDate(s.date) + " · #" + s.sessionNumber + " · " + s.trainingType.join(", "))),
                s.painScore != null && s.painScore >= 5 && h(Badge, { tone: "danger" }, "Pain " + s.painScore),
                h(ChevronRightIcon, { className: "list-row-chevron" })
              );
            })
          )
    )
  );
}
function AllGoalsPage() {
  var _s = useState(""), search = _s[0], setSearch = _s[1];
  var clients = useClients({ status: "active", search: search || undefined });
  var goals = useAllGoals();
  return h(React.Fragment, null,
    h(PageHeader, { title: "Goals" }),
    h("div", { className: "page-content" },
      h(SearchBar, { value: search, onChange: setSearch, placeholder: "Search clients" }),
      clients === undefined || goals === undefined ? null : clients.length === 0
        ? h(EmptyState, { icon: h(TargetIcon, { width: 36, height: 36 }), title: "No active clients yet" })
        : h("div", { className: "list-card" },
            clients.map(function (c) {
              var clientGoals = goals.filter(function (g) { return g.clientId === c.id; });
              return h(Link, { key: c.id, to: "/clients/" + c.id + "?tab=goals", className: "list-row", style: { alignItems: "flex-start" } },
                h("div", { className: "avatar", "aria-hidden": true }, initials(c.fullName)),
                h("div", { className: "list-row-body" },
                  h("div", { className: "list-row-title" }, c.fullName),
                  h("div", { className: "flex-row gap-8 wrap", style: { marginTop: 6 } },
                    GOAL_TIMEFRAMES.map(function (tf) {
                      var g = clientGoals.filter(function (x) { return x.timeframe === tf; })[0];
                      return h(Badge, { key: tf, tone: STATUS_TONE[(g && g.status) || "Not started"] }, tf.split(" ")[0] + "mo: " + ((g && g.status) || "Not started"));
                    })
                  )
                ),
                h(ChevronRightIcon, { className: "list-row-chevron", style: { marginTop: 4 } })
              );
            })
          )
    )
  );
}

/* ---------------------------------------------------------------------- */
/* Workout programs                                                         */
/* ---------------------------------------------------------------------- */

function ProgramsListPage() {
  var programs = useAllPrograms();
  return h(React.Fragment, null,
    h(PageHeader, { title: "Workout Programs", action: h(Link, { to: "/programs/new", className: "icon-btn", "aria-label": "New program" }, h(PlusCircleIcon, null)) }),
    h("div", { className: "page-content" },
      h("p", { className: "text-secondary", style: { marginBottom: 14, fontSize: 13.5 } }, "Build a workout once, then apply it to any client's session or assign it as their default plan."),
      programs === undefined ? null : programs.length === 0
        ? h(EmptyState, {
            icon: h(ClipboardIcon, { width: 36, height: 36 }),
            title: "No programs yet",
            message: "Create a reusable program with its exercises and sets planned out in advance.",
            action: h(Link, { to: "/programs/new" }, h(Button, null, h(PlusCircleIcon, { width: 18, height: 18 }), "Create a program")),
          })
        : h("div", { className: "list-card" },
            programs.map(function (p) {
              return h(Link, { key: p.id, to: "/programs/" + p.id + "/edit", className: "list-row" },
                h("div", { className: "list-row-body" },
                  h("div", { className: "list-row-title" }, p.name),
                  h("div", { className: "list-row-subtitle" }, p.exercises.length + " exercise" + (p.exercises.length === 1 ? "" : "s") + (p.description ? " · " + truncate(p.description, 50) : ""))
                ),
                h(ChevronRightIcon, { className: "list-row-chevron" })
              );
            })
          )
    )
  );
}

function blankProgram() { return { name: "", description: "", exercises: [] }; }
function ProgramFormPage(props) {
  var mode = props.mode, programId = props.programId;
  var existing = useProgram(mode === "edit" ? programId : undefined);
  var _f = useState(blankProgram()), form = _f[0], setForm = _f[1];
  var _hy = useState(mode === "create"), hydrated = _hy[0], setHydrated = _hy[1];
  var _sv = useState(false), saving = _sv[0], setSaving = _sv[1];
  var _se = useState(""), submitError = _se[0], setSubmitError = _se[1];
  var _cd = useState(false), confirmDeleteOpen = _cd[0], setConfirmDeleteOpen = _cd[1];

  useEffect(function () {
    if (mode === "edit" && existing && !hydrated) {
      setForm({ name: existing.name, description: existing.description, exercises: existing.exercises });
      setHydrated(true);
    }
  }, [mode, existing, hydrated]);

  function set(key, value) { setForm(function (f) { var next = Object.assign({}, f); next[key] = value; return next; }); }

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    setSubmitError("");
    var p = mode === "create" ? programRepository.create(form) : programRepository.update(programId, form);
    p.then(function () { navigate("/programs"); }).catch(function (err) {
      setSubmitError(err.message || "Couldn't save this program. Check your connection and try again.");
    }).finally(function () { setSaving(false); });
  }
  function handleDelete() {
    programRepository.remove(programId).then(function () { navigate("/programs"); });
  }

  if (mode === "edit" && !hydrated) return h(React.Fragment, null, h(PageHeader, { title: "Program", back: true }), h("div", { className: "page-content" }));

  return h(React.Fragment, null,
    h(PageHeader, { title: mode === "create" ? "New program" : "Edit program", back: true }),
    h("div", { className: "page-content" },
      h("form", { onSubmit: handleSubmit, noValidate: true },
        h("fieldset", { className: "form-group" },
          h("legend", null, "Program details"),
          h(TextField, { label: "Program name", value: form.name, onChange: function (e) { set("name", e.target.value); }, placeholder: "e.g. Beginner Reformer Foundations" }),
          h(TextAreaField, { label: "Description", optional: true, value: form.description, onChange: function (e) { set("description", e.target.value); }, placeholder: "Who is this for, and what is it building toward?" })
        ),
        h("fieldset", { className: "form-group" },
          h("legend", null, "Planned exercises"),
          h(ExerciseEditor, { exercises: form.exercises, onChange: function (v) { set("exercises", v); } })
        ),
        submitError && h("p", { className: "form-error", role: "alert", style: { marginBottom: 8 } }, submitError),
        h("div", { className: "form-actions" },
          h(Button, { type: "submit", className: "btn-block", disabled: saving || !form.name.trim() }, saving ? "Saving…" : mode === "create" ? "Save program" : "Save changes")
        ),
        mode === "edit" && h("div", { className: "form-actions" },
          h(Button, { type: "button", variant: "danger", className: "btn-block", onClick: function () { setConfirmDeleteOpen(true); } }, "Delete program")
        )
      )
    ),
    h(ConfirmDialog, {
      open: confirmDeleteOpen, title: "Delete this program?",
      message: "This removes the saved template. Clients assigned to it and sessions already logged from it are not affected.",
      confirmLabel: "Delete", onCancel: function () { setConfirmDeleteOpen(false); }, onConfirm: handleDelete,
    })
  );
}

/* ---------------------------------------------------------------------- */
/* Settings + More                                                          */
/* ---------------------------------------------------------------------- */

function SettingsPage() {
  var fileInputRef = useRef(null);
  var _st = useState(null), status = _st[0], setStatus = _st[1];
  var _cw = useState(false), confirmWipeOpen = _cw[0], setConfirmWipeOpen = _cw[1];
  var _cr = useState(false), confirmRestoreOpen = _cr[0], setConfirmRestoreOpen = _cr[1];
  var _pf = useState(null), pendingFile = _pf[0], setPendingFile = _pf[1];
  var _b = useState(false), busy = _b[0], setBusy = _b[1];
  var clients = useClients();
  var sessions = useAllSessions();
  var goals = useAllGoals();

  function handleExport() {
    setBusy(true); setStatus(null);
    exportBackup().then(function (backup) {
      var blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url; a.download = "client-session-tracker-backup-" + backup.exportedAt.slice(0, 10) + ".json";
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      setStatus("Backup downloaded.");
    }).catch(function (err) { setStatus("Export failed: " + err.message); }).finally(function () { setBusy(false); });
  }
  function handleFileSelected(e) {
    var file = e.target.files[0];
    if (!file) return;
    setPendingFile(file); setConfirmRestoreOpen(true);
    e.target.value = "";
  }
  function handleConfirmRestore() {
    if (!pendingFile) return;
    setBusy(true); setStatus(null);
    pendingFile.text().then(function (text) {
      var parsed = JSON.parse(text);
      if (!isBackupFile(parsed)) { setStatus("That file does not look like a Client Session Tracker backup."); return; }
      return restoreBackup(parsed, "replace").then(function () {
        setStatus("Restored " + parsed.clients.length + " clients, " + parsed.sessions.length + " sessions, " + parsed.goals.length + " goals.");
      });
    }).catch(function (err) { setStatus("Import failed: " + err.message); }).finally(function () { setBusy(false); setConfirmRestoreOpen(false); setPendingFile(null); });
  }
  function handleWipe() {
    setBusy(true);
    wipeAllData().then(function () { localStorage.removeItem("cst_sample_ids"); setStatus("All data cleared."); }).finally(function () { setBusy(false); setConfirmWipeOpen(false); });
  }

  return h(React.Fragment, null,
    h(PageHeader, { title: "Settings" }),
    h("div", { className: "page-content stack" },
      h("section", null, h(SectionLabel, null, "Your data"), h(Card, null,
        h("p", { className: "text-secondary", style: { marginBottom: 12, fontSize: 13.5 } }, (clients ? clients.length : "—") + " clients · " + (sessions ? sessions.length : "—") + " sessions · " + (goals ? goals.length : "—") + " goals"),
        h("p", { className: "text-secondary", style: { fontSize: 13, lineHeight: 1.5 } }, "Stored in your account's database, tied to your login — accessible from any device you sign in on. Still worth exporting a backup regularly as a second, independent copy.")
      )),
      h("section", null, h(SectionLabel, null, "Account"), h(Card, null,
        h("p", { style: { fontSize: 13.5, marginBottom: 12 } }, (authRepository.currentUser() && authRepository.currentUser().email) || "—"),
        h(Button, { variant: "secondary", className: "btn-block", onClick: function () { authRepository.signOut(); } }, "Sign out")
      )),
      h("section", null, h(SectionLabel, null, "Backup & restore"), h(Card, null,
        h(Button, { className: "btn-block", onClick: handleExport, disabled: busy, style: { marginBottom: 10 } }, h(DownloadIcon, null), "Export backup (.json)"),
        h(Button, { variant: "secondary", className: "btn-block", onClick: function () { fileInputRef.current && fileInputRef.current.click(); }, disabled: busy }, h(UploadIcon, null), "Restore from backup…"),
        h("input", { ref: fileInputRef, type: "file", accept: "application/json", onChange: handleFileSelected, className: "sr-only", "aria-label": "Choose backup file" }),
        status && h("p", { role: "status", style: { marginTop: 12, fontSize: 13.5 } }, status)
      )),
      h("section", null, h(SectionLabel, null, "Danger zone"), h(Card, null,
        h("div", { className: "flex-row gap-8", style: { marginBottom: 10 } }, h(AlertIcon, { color: "var(--danger)" }), h("span", { style: { fontSize: 13.5 } }, "This cannot be undone. Export a backup first.")),
        h(Button, { variant: "danger", className: "btn-block", onClick: function () { setConfirmWipeOpen(true); }, disabled: busy }, "Erase all data")
      )),
      h("section", null, h(SectionLabel, null, "About"), h(Card, null,
        h("p", { style: { fontSize: 13.5, margin: 0 } }, "Client Session Tracker · v1.0.0"),
        h("p", { className: "text-secondary", style: { fontSize: 12, marginTop: 4 } }, "Cloud-backed: your data lives in your own account, protected so only you can see it.")
      ))
    ),
    h(ConfirmDialog, { open: confirmWipeOpen, title: "Erase all data?", message: "This deletes every client, session, and goal from this browser permanently.", confirmLabel: "Erase everything", onCancel: function () { setConfirmWipeOpen(false); }, onConfirm: handleWipe }),
    h(ConfirmDialog, { open: confirmRestoreOpen, title: "Restore from backup?", message: "This replaces all data currently in this browser with the contents of \"" + (pendingFile && pendingFile.name) + "\".", confirmLabel: "Restore", onCancel: function () { setConfirmRestoreOpen(false); setPendingFile(null); }, onConfirm: handleConfirmRestore })
  );
}
function MorePage() {
  var items = [
    { to: "/sessions", label: "Session History", description: "All sessions across every client", icon: CalendarIcon },
    { to: "/goals", label: "Goals", description: "Goal status across all active clients", icon: TargetIcon },
    { to: "/programs", label: "Workout Programs", description: "Build once, apply to any client's session", icon: ClipboardIcon },
    { to: "/settings", label: "Settings", description: "Backup, restore, and app data", icon: GearIcon },
  ];
  return h(React.Fragment, null,
    h(PageHeader, { title: "More" }),
    h("div", { className: "page-content" },
      h("div", { className: "list-card" },
        items.map(function (item) {
          return h(Link, { key: item.to, to: item.to, className: "list-row" },
            h(item.icon, { width: 22, height: 22, color: "var(--accent)" }),
            h("div", { className: "list-row-body" }, h("div", { className: "list-row-title" }, item.label), h("div", { className: "list-row-subtitle" }, item.description)),
            h(ChevronRightIcon, { className: "list-row-chevron" })
          );
        })
      )
    )
  );
}

/* ---------------------------------------------------------------------- */
/* Login                                                                    */
/* ---------------------------------------------------------------------- */

function LoginPage() {
  var _m = useState("signin"), mode = _m[0], setMode = _m[1]; // "signin" | "signup"
  var _e = useState(""), email = _e[0], setEmail = _e[1];
  var _p = useState(""), password = _p[0], setPassword = _p[1];
  var _b = useState(false), busy = _b[0], setBusy = _b[1];
  var _err = useState(""), error = _err[0], setError = _err[1];
  var _ok = useState(""), okMsg = _ok[0], setOkMsg = _ok[1];

  function handleSubmit(e) {
    e.preventDefault();
    setError(""); setOkMsg(""); setBusy(true);
    var action = mode === "signup" ? authRepository.signUp(email, password) : authRepository.signInWithPassword(email, password);
    action.then(function (data) {
      if (mode === "signup" && data && data.user && !data.session) {
        setOkMsg("Account created. Check your email to confirm, then sign in.");
        setMode("signin");
      }
    }).catch(function (err) {
      setError(err.message || "Something went wrong.");
    }).finally(function () { setBusy(false); });
  }

  return h("div", { className: "app-shell", style: { display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" } },
    h("div", { style: { width: "100%", maxWidth: 380, padding: "0 20px" } },
      h("div", { style: { textAlign: "center", marginBottom: 24 } },
        h("div", { style: { fontSize: 22, fontWeight: 700, color: "var(--accent)" } }, "Client Session Tracker"),
        h("div", { className: "text-secondary", style: { fontSize: 13.5, marginTop: 4 } }, "Sign in to your trainer account")
      ),
      h(Card, null,
        h("form", { onSubmit: handleSubmit, className: "stack" },
          h(TextField, { label: "Email", type: "email", value: email, onChange: function (e) { setEmail(e.target.value); }, autoComplete: "email", required: true }),
          h(TextField, { label: "Password", type: "password", value: password, onChange: function (e) { setPassword(e.target.value); }, autoComplete: mode === "signup" ? "new-password" : "current-password", required: true, minLength: 6 }),
          error && h("p", { role: "alert", style: { color: "var(--danger)", fontSize: 13, margin: 0 } }, error),
          okMsg && h("p", { role: "status", style: { color: "var(--success)", fontSize: 13, margin: 0 } }, okMsg),
          h(Button, { type: "submit", className: "btn-block", disabled: busy }, busy ? "Please wait…" : (mode === "signup" ? "Create account" : "Sign in"))
        ),
        h("p", { className: "text-secondary", style: { fontSize: 13, textAlign: "center", marginTop: 16 } },
          mode === "signup" ? "Already have an account? " : "New here? ",
          h("a", { href: "#", onClick: function (e) { e.preventDefault(); setError(""); setOkMsg(""); setMode(mode === "signup" ? "signin" : "signup"); } },
            mode === "signup" ? "Sign in" : "Create an account")
        )
      )
    )
  );
}

/* ---------------------------------------------------------------------- */
/* Root app + bootstrap                                                     */
/* ---------------------------------------------------------------------- */

function App() {
  var route = useRoute();
  var p = route.parts;
  var page;

  if (p.length === 0) page = h(Dashboard, null);
  else if (p[0] === "clients" && p.length === 1) page = h(ClientsList, null);
  else if (p[0] === "clients" && p[1] === "new") page = h(ClientFormPage, { mode: "create" });
  else if (p[0] === "clients" && p.length === 3 && p[2] === "edit") page = h(ClientFormPage, { mode: "edit", clientId: p[1] });
  else if (p[0] === "clients" && p.length === 4 && p[2] === "sessions" && p[3] === "new") page = h(SessionFormPage, { mode: "create", clientId: p[1] });
  else if (p[0] === "clients" && p.length === 4 && p[2] === "movement-screen" && p[3] === "new") page = h(MovementScreenFormPage, { clientId: p[1] });
  else if (p[0] === "clients" && p.length === 2) page = h(ClientProfilePage, { clientId: p[1] });
  else if (p[0] === "add-session") page = h(AddSessionPickerPage, null);
  else if (p[0] === "sessions" && p.length === 1) page = h(AllSessionsPage, null);
  else if (p[0] === "sessions" && p.length === 3 && p[2] === "edit") page = h(SessionFormPage, { mode: "edit", sessionId: p[1] });
  else if (p[0] === "sessions" && p.length === 2) page = h(SessionDetailPage, { sessionId: p[1] });
  else if (p[0] === "goals") page = h(AllGoalsPage, null);
  else if (p[0] === "programs" && p.length === 1) page = h(ProgramsListPage, null);
  else if (p[0] === "programs" && p[1] === "new") page = h(ProgramFormPage, { mode: "create" });
  else if (p[0] === "programs" && p.length === 3 && p[2] === "edit") page = h(ProgramFormPage, { mode: "edit", programId: p[1] });
  else if (p[0] === "settings") page = h(SettingsPage, null);
  else if (p[0] === "more") page = h(MorePage, null);
  else page = h(Dashboard, null);

  return h("div", { className: "app-shell" },
    h(Sidebar, { route: route }),
    h("main", { className: "app-main" }, page),
    h(BottomNav, { route: route })
  );
}

function Root() {
  var auth = useAuth();

  if (!auth.ready) {
    return h("div", { className: "app-shell", style: { display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" } },
      h("div", { className: "text-secondary" }, "Loading…"));
  }
  if (!auth.session) return h(LoginPage, null);
  return h(App, null);
}

function boot() {
  var root = ReactDOM.createRoot(document.getElementById("root"));
  root.render(h(Root, null));
}
boot();
