/* Training calendar: a client's week of assigned workout templates.
   Pure helpers up top (unit-tested); components below. Date math lives in
   data.js (weekStartIso, addDaysIso, scheduleStatus, trainingStats). */

var WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
var MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function dayParts(iso) {
  var p = iso.split("-").map(Number);
  var dow = new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay();
  return { dow: WEEKDAY_NAMES[dow], num: p[2], month: MONTH_NAMES[p[1] - 1] };
}
function weekRangeLabel(startIso) {
  var a = dayParts(startIso), b = dayParts(addDaysIso(startIso, 6));
  return a.month + " " + a.num + " – " + b.month + " " + b.num;
}
function weekRelativeLabel(weekStart, currentWeekStart) {
  if (weekStart === currentWeekStart) return "This week";
  if (weekStart === addDaysIso(currentWeekStart, 7)) return "Next week";
  if (weekStart === addDaysIso(currentWeekStart, -7)) return "Last week";
  var d = dayParts(weekStart);
  return "Week of " + d.month + " " + d.num;
}
function statValue(c) {
  return c.assigned === 0 ? "0" : c.tracked + "/" + c.assigned;
}
function exerciseCountLabel(n) {
  if (!n) return "No exercises";
  return n + " exercise" + (n === 1 ? "" : "s");
}
function filterTemplates(templates, query) {
  var q = (query || "").trim().toLowerCase();
  return (templates || []).filter(function (t) {
    if (!q) return true;
    return (t.name || "").toLowerCase().indexOf(q) !== -1 || (t.description || "").toLowerCase().indexOf(q) !== -1;
  });
}
function sortScheduled(items) {
  return (items || []).slice().sort(function (a, b) {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return String(a.createdAt || "") < String(b.createdAt || "") ? -1 : 1;
  });
}
var STATUS_LABEL = { tracked: "Tracked", missed: "Missed", planned: "Planned" };

/* Text for the Overview's "Workouts" card: how this week is going and what's
   next. `items` is null when the calendar table hasn't been created yet. */
function workoutsSummary(items, today) {
  if (items === null) return { kind: "unavailable", text: "Set up the training calendar to assign workouts.", next: null };
  var all = sortScheduled(items);
  var stats = trainingStats(all, today);
  var upcoming = all.filter(function (i) { return !i.sessionId && i.date >= today; })[0];
  var next = upcoming ? { name: upcoming.programName || "Workout", date: upcoming.date } : null;
  if (stats.thisWeek.assigned === 0 && !next) return { kind: "empty", text: "No workout assigned this week", next: null };
  return {
    kind: "active",
    text: stats.thisWeek.assigned > 0 ? stats.thisWeek.tracked + " of " + stats.thisWeek.assigned + " tracked this week" : "Nothing assigned this week",
    next: next,
  };
}

/* null = the scheduled_workouts table has not been created yet. */
function useScheduledForClient(id) {
  return useLiveQuery(function () { return id ? scheduledWorkoutRepository.listByClient(id) : []; }, [id]);
}

/* Bottom sheet: search your templates, tick one or more, assign them to a day. */
function AssignWorkoutSheet(props) {
  var _q = useState(""), query = _q[0], setQuery = _q[1];
  var _s = useState([]), selected = _s[0], setSelected = _s[1];
  var _b = useState(false), busy = _b[0], setBusy = _b[1];
  var _e = useState(""), error = _e[0], setError = _e[1];
  var d = dayParts(props.date);
  var list = filterTemplates(props.templates, query);

  useEffect(function () {
    function onKey(e) { if (e.key === "Escape") props.onClose(); }
    document.addEventListener("keydown", onKey);
    return function () { document.removeEventListener("keydown", onKey); };
  }, []);

  function toggle(id) {
    setSelected(function (sel) { return sel.indexOf(id) === -1 ? sel.concat([id]) : sel.filter(function (x) { return x !== id; }); });
  }
  function submit() {
    if (!selected.length || busy) return;
    setBusy(true);
    setError("");
    props.onAssign(selected).then(function () { props.onClose(); }).catch(function (err) {
      setError(err.message || "Couldn't assign. Check your connection and try again.");
      setBusy(false);
    });
  }

  return h("div", { className: "modal-overlay", onClick: props.onClose },
    h("div", { className: "modal-sheet tr-sheet", role: "dialog", "aria-modal": "true", "aria-label": "Assign workout", onClick: function (e) { e.stopPropagation(); } },
      h("div", { className: "flex-between" },
        h("div", { className: "modal-title" }, "Assign workout"),
        h(Link, { to: "/programs/new", className: "icon-btn", "aria-label": "Create a new template" }, h(PlusCircleIcon, null))
      ),
      h("p", { className: "tr-sheet-sub" }, d.dow + ", " + d.month + " " + d.num),
      (props.templates || []).length === 0
        ? h("div", { className: "tr-notice" },
            h("div", { className: "tr-notice-title" }, "No workout templates yet"),
            h("p", null, "Design a workout template first, then assign it to any day."),
            h("div", { style: { marginTop: 12 } }, h(Link, { to: "/programs/new" }, h(Button, { type: "button" }, h(PlusCircleIcon, { width: 18, height: 18 }), "Create a template")))
          )
        : h(React.Fragment, null,
            h(SearchBar, { value: query, onChange: setQuery, placeholder: "Search workout name.." }),
            h("div", { className: "tr-assign-list" },
              list.length === 0 && h("p", { className: "text-secondary", style: { fontSize: 13.5 } }, "No templates match."),
              list.map(function (t) {
                var picked = selected.indexOf(t.id) !== -1;
                return h("button", { key: t.id, type: "button", className: classNames("tr-tpl", picked && "selected"), "aria-pressed": picked, onClick: function () { toggle(t.id); } },
                  h("div", { className: "tr-tpl-name" }, t.name),
                  h("div", { className: "tr-tpl-count" }, exerciseCountLabel((t.exercises || []).length)),
                  t.description && h("div", { className: "tr-tpl-desc" }, t.description),
                  h("span", { className: "tr-tpl-check", "aria-hidden": true }, "✓")
                );
              })
            )
          ),
      error && h("p", { className: "tr-sheet-error", role: "alert" }, error),
      h("div", { className: "tr-sheet-actions" },
        h(Button, { type: "button", variant: "secondary", onClick: props.onClose }, "Cancel"),
        h(Button, { type: "button", onClick: submit, disabled: !selected.length || busy }, busy ? "Assigning…" : selected.length > 1 ? "Assign " + selected.length : "Assign")
      )
    )
  );
}

/* Sheet for one assigned workout: start the session, view it, or remove it. */
function ScheduledItemSheet(props) {
  var item = props.item;
  var _b = useState(false), busy = _b[0], setBusy = _b[1];
  var _e = useState(""), error = _e[0], setError = _e[1];
  var d = dayParts(item.date);
  var status = scheduleStatus(item, props.today);
  var name = (props.program && props.program.name) || item.programName || "Workout template";

  useEffect(function () {
    function onKey(e) { if (e.key === "Escape") props.onClose(); }
    document.addEventListener("keydown", onKey);
    return function () { document.removeEventListener("keydown", onKey); };
  }, []);

  function remove() {
    setBusy(true);
    setError("");
    scheduledWorkoutRepository.remove(item.id).then(function () { props.onClose(); }).catch(function (err) {
      setError(err.message || "Couldn't remove it. Try again.");
      setBusy(false);
    });
  }

  return h("div", { className: "modal-overlay", onClick: props.onClose },
    h("div", { className: "modal-sheet tr-sheet", role: "dialog", "aria-modal": "true", "aria-label": name, onClick: function (e) { e.stopPropagation(); } },
      h("div", { className: "modal-title" }, name),
      h("p", { className: "tr-sheet-sub" }, d.dow + ", " + d.month + " " + d.num + " · " + STATUS_LABEL[status] + (props.program ? " · " + exerciseCountLabel((props.program.exercises || []).length) : "")),
      error && h("p", { className: "tr-sheet-error", role: "alert" }, error),
      h("div", { className: "tr-sheet-stack" },
        item.sessionId
          ? h(Link, { to: "/sessions/" + item.sessionId }, h(Button, { type: "button", className: "btn-block" }, "View session"))
          : props.program
            ? h(Button, { type: "button", className: "btn-block", onClick: function () { navigate("/clients/" + item.clientId + "/sessions/new?scheduled=" + item.id); } }, "Start session")
            : h("p", { className: "text-secondary", style: { fontSize: 13.5 } }, "This template was deleted, so a session can't be started from it. You can remove it from the plan."),
        h(Button, { type: "button", variant: "danger", className: "btn-block", onClick: remove, disabled: busy }, "Remove from plan"),
        h(Button, { type: "button", variant: "secondary", className: "btn-block", onClick: props.onClose }, "Close")
      )
    )
  );
}

function TrainingTab(props) {
  var client = props.client;
  var items = useScheduledForClient(client.id);
  var programs = useAllPrograms();
  var today = localTodayIso();
  var currentWeek = weekStartIso(today);
  var _w = useState(currentWeek), weekStart = _w[0], setWeekStart = _w[1];
  var _a = useState(""), assignDate = _a[0], setAssignDate = _a[1];
  var _i = useState(""), openItemId = _i[0], setOpenItemId = _i[1];

  if (items === undefined) return null;
  if (items === null) {
    return h("div", { className: "ex-theme" },
      h("div", { className: "tr-notice" },
        h("div", { className: "tr-notice-title" }, "Training calendar needs a one-time setup"),
        h("p", null, "Run the scheduled_workouts block from supabase/schema.sql in the Supabase SQL editor, then reload. Everything else in the app keeps working meanwhile.")
      )
    );
  }

  var all = sortScheduled(items);
  var stats = trainingStats(all, today);
  var templates = programs || [];
  function programFor(item) { return item.programId ? templates.filter(function (p) { return p.id === item.programId; })[0] : undefined; }
  var openItem = all.filter(function (i) { return i.id === openItemId; })[0];

  function assign(ids) {
    return scheduledWorkoutRepository.createMany(ids.map(function (id) {
      var t = templates.filter(function (p) { return p.id === id; })[0];
      return { clientId: client.id, programId: id, programName: t ? t.name : "", date: assignDate };
    }));
  }

  return h("div", { className: "ex-theme" },
    h("div", { className: "tr-stats" },
      h("div", { className: "tr-stat" }, h("div", { className: "tr-stat-label" }, "Last 7 days"), h("div", { className: "tr-stat-value" }, statValue(stats.last7)), h("div", { className: "tr-stat-sub" }, "Tracked")),
      h("div", { className: "tr-stat" }, h("div", { className: "tr-stat-label" }, "This week"), h("div", { className: "tr-stat-value" }, statValue(stats.thisWeek)), h("div", { className: "tr-stat-sub" }, "Tracked")),
      h("div", { className: "tr-stat" }, h("div", { className: "tr-stat-label" }, "Next week"), h("div", { className: "tr-stat-value" }, String(stats.nextWeek.assigned)), h("div", { className: "tr-stat-sub" }, "Assigned"))
    ),
    h("div", { className: "tr-week" },
      h("button", { type: "button", className: "tr-week-nav", "aria-label": "Previous week", onClick: function () { setWeekStart(function (w) { return addDaysIso(w, -7); }); } }, h(ChevronLeftIcon, { width: 18, height: 18 })),
      h("button", { type: "button", className: "tr-week-mid", "aria-label": "Go to this week", onClick: function () { setWeekStart(currentWeek); } },
        h("span", { className: "tr-week-label" }, weekRelativeLabel(weekStart, currentWeek)),
        h("span", { className: "tr-week-range" }, weekRangeLabel(weekStart))
      ),
      h("button", { type: "button", className: "tr-week-nav", "aria-label": "Next week", onClick: function () { setWeekStart(function (w) { return addDaysIso(w, 7); }); } }, h(ChevronRightIcon, { width: 18, height: 18 }))
    ),
    weekDaysIso(weekStart).map(function (iso) {
      var parts = dayParts(iso);
      var dayItems = all.filter(function (i) { return i.date === iso; });
      return h("div", { key: iso, className: classNames("tr-day", dayItems.length > 0 && "has-items") },
        h("div", { className: classNames("tr-date", iso === today && "today") },
          h("div", { className: "tr-date-dow" }, parts.dow),
          h("div", { className: "tr-date-num" }, String(parts.num).length < 2 ? "0" + parts.num : String(parts.num))
        ),
        h("div", { className: "tr-slot" },
          dayItems.map(function (item) {
            var status = scheduleStatus(item, today);
            var program = programFor(item);
            var name = (program && program.name) || item.programName || "Workout template";
            return h("button", { key: item.id, type: "button", className: "tr-item", onClick: function () { setOpenItemId(item.id); } },
              h("span", { className: "tr-item-name" }, name),
              h("span", { className: "tr-item-meta" },
                h("span", { className: "tr-status " + status }, STATUS_LABEL[status]),
                "·",
                program ? exerciseCountLabel((program.exercises || []).length) : "Template deleted"
              )
            );
          }),
          h("button", { type: "button", className: "tr-add", "aria-label": "Assign a workout on " + parts.dow + " " + parts.num, onClick: function () { setAssignDate(iso); } },
            h("span", { className: "tr-add-dot" }, h(PlusCircleIcon, { width: 18, height: 18 }))
          )
        )
      );
    }),
    assignDate && h(AssignWorkoutSheet, { date: assignDate, templates: templates, onAssign: assign, onClose: function () { setAssignDate(""); } }),
    openItem && h(ScheduledItemSheet, { item: openItem, program: programFor(openItem), today: today, onClose: function () { setOpenItemId(""); } })
  );
}
