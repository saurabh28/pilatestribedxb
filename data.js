/* Data layer: Supabase-backed (Postgres + Auth), same repository API as the
   original local-first version (clientRepository, sessionRepository,
   goalRepository, programRepository, exportBackup, restoreBackup,
   wipeAllData) so ui.js / app.js barely change.

   Requires config.js to run first and define:
     window.SUPABASE_URL, window.SUPABASE_ANON_KEY
   and the Supabase UMD script tag to have loaded before this file. */

var TRAINING_TYPES = ["Pilates", "Strength", "Yoga", "Functional", "Mobility", "Combination", "Other"];
var GENDERS = ["Male", "Female", "Other", "Prefer not to say"];
var EXERCISE_CATEGORIES = ["Pilates", "Strength", "Cardio", "Mobility", "Yoga", "Functional", "Other"];
var SIDES = ["Left", "Right", "Both", "N/A"];
var GOAL_STATUSES = ["Not started", "In progress", "Achieved", "Revised"];
var GOAL_TIMEFRAMES = ["1 month", "3 months", "6 months", "12 months"];
var STANDARD_BODY_AREAS = ["Core", "Lower back", "Hips", "Hamstring", "Shoulder", "Cervical spine", "Pelvic floor"];

function generateId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    var r = (Math.random() * 16) | 0;
    var v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
function nowIso() { return new Date().toISOString(); }
function todayIso() { return new Date().toISOString().slice(0, 10); }

function formatDate(iso) {
  if (!iso) return "—";
  var d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}
function formatDateTime(iso) {
  if (!iso) return "—";
  var d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function calculateAge(dob) {
  if (!dob) return null;
  var d = new Date(dob);
  if (isNaN(d.getTime())) return null;
  var today = new Date();
  var age = today.getFullYear() - d.getFullYear();
  var m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--;
  return age;
}
function isValidEmail(v) { if (!v) return true; return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
function classNames() {
  var out = [];
  for (var i = 0; i < arguments.length; i++) if (arguments[i]) out.push(arguments[i]);
  return out.join(" ");
}
function initials(name) {
  var parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/* ---------------------------------------------------------------------- */
/* Supabase client + auth                                                   */
/* ---------------------------------------------------------------------- */

var supabase = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});

var authState = { session: null, ready: false };
var authListeners = [];
function onAuthChange(fn) {
  authListeners.push(fn);
  return function () {
    var i = authListeners.indexOf(fn);
    if (i !== -1) authListeners.splice(i, 1);
  };
}
function setAuthState(session) {
  authState = { session: session, ready: true };
  authListeners.slice().forEach(function (fn) { fn(authState); });
}
supabase.auth.getSession().then(function (r) { setAuthState(r.data.session); });
supabase.auth.onAuthStateChange(function (_event, session) {
  setAuthState(session);
  notifyDataChanged();
});

var authRepository = {
  signInWithPassword: function (email, password) {
    return supabase.auth.signInWithPassword({ email: email, password: password }).then(function (r) {
      if (r.error) throw r.error;
      return r.data;
    });
  },
  signUp: function (email, password) {
    return supabase.auth.signUp({ email: email, password: password }).then(function (r) {
      if (r.error) throw r.error;
      return r.data;
    });
  },
  signOut: function () { return supabase.auth.signOut(); },
  getState: function () { return authState; },
  currentUser: function () { return authState.session ? authState.session.user : null; },
};

/* ---------------------------------------------------------------------- */
/* Change bus — replaces Dexie.liveQuery's automatic reactivity. Every      */
/* repository write calls notifyDataChanged(); useLiveQuery (in app.js)     */
/* subscribes and re-runs its query whenever anything changes.             */
/* ---------------------------------------------------------------------- */

var dataChangeListeners = [];
function notifyDataChanged() { dataChangeListeners.slice().forEach(function (fn) { fn(); }); }
function onDataChanged(fn) {
  dataChangeListeners.push(fn);
  return function () {
    var i = dataChangeListeners.indexOf(fn);
    if (i !== -1) dataChangeListeners.splice(i, 1);
  };
}
function afterWrite(result) { notifyDataChanged(); return result; }
function checkError(r) { if (r.error) throw r.error; return r.data; }

/* ---------------------------------------------------------------------- */
/* Row <-> JS object mappers (DB is snake_case; app stays camelCase)        */
/* ---------------------------------------------------------------------- */

function rowToClient(r) {
  if (!r) return r;
  return {
    id: r.id, trainerId: r.trainer_id, fullName: r.full_name, gender: r.gender,
    dateOfBirth: r.date_of_birth, email: r.email, phone: r.phone, startDate: r.start_date,
    preferredTraining: r.preferred_training || [], currentGoal: r.current_goal || "",
    trackedBodyAreas: r.tracked_body_areas && r.tracked_body_areas.length ? r.tracked_body_areas : STANDARD_BODY_AREAS,
    medicalHistory: r.medical_history || "", injuriesAndPain: r.injuries_and_pain || "",
    precautions: r.precautions || "", emergencyContactName: r.emergency_contact_name || "",
    emergencyContactPhone: r.emergency_contact_phone || "",
    packageTotalSessions: r.package_total_sessions, packageStartDate: r.package_start_date,
    packageExpiryDate: r.package_expiry_date, status: r.status, generalNotes: r.general_notes || "",
    assignedProgramId: r.assigned_program_id, createdAt: r.created_at, updatedAt: r.updated_at,
  };
}
function clientToRow(c) {
  var row = {};
  if ("id" in c) row.id = c.id;
  if ("fullName" in c) row.full_name = c.fullName;
  if ("gender" in c) row.gender = c.gender || null;
  if ("dateOfBirth" in c) row.date_of_birth = c.dateOfBirth || null;
  if ("email" in c) row.email = c.email || null;
  if ("phone" in c) row.phone = c.phone || null;
  if ("startDate" in c) row.start_date = c.startDate || null;
  if ("preferredTraining" in c) row.preferred_training = c.preferredTraining || [];
  if ("trackedBodyAreas" in c) row.tracked_body_areas = c.trackedBodyAreas && c.trackedBodyAreas.length ? c.trackedBodyAreas : STANDARD_BODY_AREAS;
  if ("currentGoal" in c) row.current_goal = c.currentGoal || "";
  if ("medicalHistory" in c) row.medical_history = c.medicalHistory || "";
  if ("injuriesAndPain" in c) row.injuries_and_pain = c.injuriesAndPain || "";
  if ("precautions" in c) row.precautions = c.precautions || "";
  if ("emergencyContactName" in c) row.emergency_contact_name = c.emergencyContactName || "";
  if ("emergencyContactPhone" in c) row.emergency_contact_phone = c.emergencyContactPhone || "";
  if ("packageTotalSessions" in c) row.package_total_sessions = c.packageTotalSessions;
  if ("packageStartDate" in c) row.package_start_date = c.packageStartDate || null;
  if ("packageExpiryDate" in c) row.package_expiry_date = c.packageExpiryDate || null;
  if ("status" in c) row.status = c.status;
  if ("generalNotes" in c) row.general_notes = c.generalNotes || "";
  if ("assignedProgramId" in c) row.assigned_program_id = c.assignedProgramId || null;
  return row;
}

function rowToSession(r) {
  if (!r) return r;
  return {
    id: r.id, trainerId: r.trainer_id, clientId: r.client_id, date: r.date,
    sessionNumber: r.session_number, trainingType: r.training_type || [],
    durationMinutes: r.duration_minutes, exercises: r.exercises || [],
    sessionNote: r.session_note || "", clientResponse: r.client_response || "",
    painScore: r.pain_score, rpe: r.rpe, modifications: r.modifications || "",
    progression: r.progression || "", homework: r.homework || "",
    nextSessionFocus: r.next_session_focus || "", createdAt: r.created_at, updatedAt: r.updated_at,
  };
}
function sessionToRow(s) {
  var row = {};
  if ("id" in s) row.id = s.id;
  if ("clientId" in s) row.client_id = s.clientId;
  if ("date" in s) row.date = s.date;
  if ("sessionNumber" in s) row.session_number = s.sessionNumber;
  if ("trainingType" in s) row.training_type = s.trainingType || [];
  if ("durationMinutes" in s) row.duration_minutes = s.durationMinutes;
  if ("exercises" in s) row.exercises = s.exercises || [];
  if ("sessionNote" in s) row.session_note = s.sessionNote || "";
  if ("clientResponse" in s) row.client_response = s.clientResponse || "";
  if ("painScore" in s) row.pain_score = s.painScore;
  if ("rpe" in s) row.rpe = s.rpe;
  if ("modifications" in s) row.modifications = s.modifications || "";
  if ("progression" in s) row.progression = s.progression || "";
  if ("homework" in s) row.homework = s.homework || "";
  if ("nextSessionFocus" in s) row.next_session_focus = s.nextSessionFocus || "";
  return row;
}

function rowToGoal(r) {
  if (!r) return r;
  return {
    id: r.id, trainerId: r.trainer_id, clientId: r.client_id, timeframe: r.timeframe,
    goal: r.goal || "", measurableTarget: r.measurable_target || "", status: r.status,
    notes: r.notes || "", createdAt: r.created_at, updatedAt: r.updated_at,
  };
}
function goalToRow(g) {
  var row = {};
  if ("id" in g) row.id = g.id;
  if ("clientId" in g) row.client_id = g.clientId;
  if ("timeframe" in g) row.timeframe = g.timeframe;
  if ("goal" in g) row.goal = g.goal || "";
  if ("measurableTarget" in g) row.measurable_target = g.measurableTarget || "";
  if ("status" in g) row.status = g.status;
  if ("notes" in g) row.notes = g.notes || "";
  return row;
}

function rowToProgram(r) {
  if (!r) return r;
  return {
    id: r.id, trainerId: r.trainer_id, name: r.name, description: r.description || "",
    exercises: r.exercises || [], createdAt: r.created_at, updatedAt: r.updated_at,
  };
}
function programToRow(p) {
  var row = {};
  if ("id" in p) row.id = p.id;
  if ("name" in p) row.name = p.name;
  if ("description" in p) row.description = p.description || "";
  if ("exercises" in p) row.exercises = p.exercises || [];
  return row;
}

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

/* ---------------------------------------------------------------------- */
/* Repositories                                                             */
/* ---------------------------------------------------------------------- */

var clientRepository = {
  list: function (filter) {
    return supabase.from("clients").select("*").order("full_name", { ascending: true })
      .then(checkError).then(function (rows) {
        var items = rows.map(rowToClient);
        if (filter && filter.status) items = items.filter(function (c) { return c.status === filter.status; });
        if (filter && filter.search) {
          var q = filter.search.trim().toLowerCase();
          if (q) items = items.filter(function (c) {
            return c.fullName.toLowerCase().indexOf(q) !== -1 ||
              (c.email || "").toLowerCase().indexOf(q) !== -1 ||
              (c.phone || "").toLowerCase().indexOf(q) !== -1;
          });
        }
        return items;
      });
  },
  get: function (id) {
    if (!id) return Promise.resolve(undefined);
    return supabase.from("clients").select("*").eq("id", id).maybeSingle().then(checkError).then(rowToClient);
  },
  create: function (input) {
    var row = clientToRow(Object.assign({ id: generateId() }, input));
    return supabase.from("clients").insert(row).select().single().then(checkError).then(rowToClient).then(afterWrite);
  },
  update: function (id, patch) {
    var row = clientToRow(patch);
    return supabase.from("clients").update(row).eq("id", id).select().maybeSingle().then(checkError).then(function (r) {
      if (!r) throw new Error("Client not found");
      return afterWrite(rowToClient(r));
    });
  },
  remove: function (id) {
    // sessions/goals cascade-delete server-side via foreign keys.
    return supabase.from("clients").delete().eq("id", id).then(checkError).then(afterWrite);
  },
};

var sessionRepository = {
  listByClient: function (clientId) {
    return supabase.from("sessions").select("*").eq("client_id", clientId).then(checkError).then(function (rows) {
      var items = rows.map(rowToSession);
      items.sort(function (a, b) {
        if (a.date < b.date) return 1;
        if (a.date > b.date) return -1;
        return b.sessionNumber - a.sessionNumber;
      });
      return items;
    });
  },
  listAll: function () {
    return supabase.from("sessions").select("*").then(checkError).then(function (rows) {
      var items = rows.map(rowToSession);
      items.sort(function (a, b) { return a.date < b.date ? 1 : -1; });
      return items;
    });
  },
  get: function (id) {
    if (!id) return Promise.resolve(undefined);
    return supabase.from("sessions").select("*").eq("id", id).maybeSingle().then(checkError).then(rowToSession);
  },
  create: function (input) {
    var row = sessionToRow(Object.assign({ id: generateId() }, input));
    return supabase.from("sessions").insert(row).select().single().then(checkError).then(rowToSession).then(afterWrite);
  },
  update: function (id, patch) {
    var row = sessionToRow(patch);
    return supabase.from("sessions").update(row).eq("id", id).select().maybeSingle().then(checkError).then(function (r) {
      if (!r) throw new Error("Session not found");
      return afterWrite(rowToSession(r));
    });
  },
  remove: function (id) { return supabase.from("sessions").delete().eq("id", id).then(checkError).then(afterWrite); },
  nextSessionNumber: function (clientId) {
    return supabase.from("sessions").select("session_number").eq("client_id", clientId).then(checkError).then(function (rows) {
      var max = rows.reduce(function (m, s) { return Math.max(m, s.session_number || 0); }, 0);
      return max + 1;
    });
  },
};

var goalRepository = {
  listByClient: function (clientId) {
    return supabase.from("goals").select("*").eq("client_id", clientId).then(checkError).then(function (rows) { return rows.map(rowToGoal); });
  },
  listAll: function () {
    return supabase.from("goals").select("*").then(checkError).then(function (rows) { return rows.map(rowToGoal); });
  },
  upsertForTimeframe: function (clientId, timeframe, patch) {
    return supabase.from("goals").select("*").eq("client_id", clientId).eq("timeframe", timeframe).maybeSingle()
      .then(checkError).then(function (existing) {
        if (existing) {
          var row = goalToRow(patch);
          return supabase.from("goals").update(row).eq("id", existing.id).select().single()
            .then(checkError).then(rowToGoal).then(afterWrite);
        }
        var createRow = goalToRow(Object.assign({
          id: generateId(), clientId: clientId, timeframe: timeframe,
          goal: "", measurableTarget: "", status: "Not started", notes: "",
        }, patch));
        return supabase.from("goals").insert(createRow).select().single()
          .then(checkError).then(rowToGoal).then(afterWrite);
      });
  },
  remove: function (id) { return supabase.from("goals").delete().eq("id", id).then(checkError).then(afterWrite); },
};

var programRepository = {
  list: function () {
    return supabase.from("programs").select("*").order("name", { ascending: true }).then(checkError).then(function (rows) { return rows.map(rowToProgram); });
  },
  get: function (id) {
    if (!id) return Promise.resolve(undefined);
    return supabase.from("programs").select("*").eq("id", id).maybeSingle().then(checkError).then(rowToProgram);
  },
  create: function (input) {
    var row = programToRow(Object.assign({ id: generateId() }, input));
    return supabase.from("programs").insert(row).select().single().then(checkError).then(rowToProgram).then(afterWrite);
  },
  update: function (id, patch) {
    var row = programToRow(patch);
    return supabase.from("programs").update(row).eq("id", id).select().maybeSingle().then(checkError).then(function (r) {
      if (!r) throw new Error("Program not found");
      return afterWrite(rowToProgram(r));
    });
  },
  remove: function (id) { return supabase.from("programs").delete().eq("id", id).then(checkError).then(afterWrite); },
};

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

/* Deep-clones a saved program's exercises into a fresh, independent set of
   exercise records (new ids all the way down) so editing them inside a
   session never mutates the original template. Unchanged from the local
   version — pure JS, no DB access. */
function instantiateProgramExercises(exercises) {
  return (exercises || []).map(function (ex) {
    return Object.assign({}, ex, {
      id: generateId(),
      setDetails: (ex.setDetails || []).map(function (s) { return Object.assign({}, s, { id: generateId() }); }),
    });
  });
}

/* ---------------------------------------------------------------------- */
/* Session counting — unchanged, pure function                             */
/* ---------------------------------------------------------------------- */

var PACKAGE_STATUS_LABEL = {
  "no-package": "No package", active: "Active", "expiring-soon": "Expiring soon",
  expired: "Expired", completed: "Package completed",
};

function computeSessionStats(client, sessions) {
  var consumed = sessions.length;
  var lastSessionDate = sessions.reduce(function (latest, s) {
    if (!latest || s.date > latest) return s.date;
    return latest;
  }, null);

  var consumedInCurrentPackage = client.packageStartDate
    ? sessions.filter(function (s) { return s.date >= client.packageStartDate; }).length
    : consumed;

  var total = client.packageTotalSessions != null ? client.packageTotalSessions : null;
  if (total == null) {
    return { consumed: consumed, remaining: null, total: null, packageStatus: "no-package", lastSessionDate: lastSessionDate, consumedInCurrentPackage: consumedInCurrentPackage };
  }

  var remaining = Math.max(total - consumedInCurrentPackage, 0);
  var today = todayIso();
  var packageStatus = "active";
  if (remaining <= 0) {
    packageStatus = "completed";
  } else if (client.packageExpiryDate && client.packageExpiryDate < today) {
    packageStatus = "expired";
  } else if (client.packageExpiryDate) {
    var daysLeft = Math.ceil((new Date(client.packageExpiryDate).getTime() - new Date(today).getTime()) / 86400000);
    if (daysLeft <= 14) packageStatus = "expiring-soon";
  }

  return { consumed: consumed, remaining: remaining, total: total, packageStatus: packageStatus, lastSessionDate: lastSessionDate, consumedInCurrentPackage: consumedInCurrentPackage };
}

/* ---------------------------------------------------------------------- */
/* Backup / restore — same file format as the local-first version, so an   */
/* old export from that app can be imported straight into this one.       */
/* ---------------------------------------------------------------------- */

function exportBackup() {
  return Promise.all([clientRepository.list(), sessionRepository.listAll(), goalRepository.listAll(), programRepository.list()])
    .then(function (r) {
      return { app: "client-session-tracker", schemaVersion: 2, exportedAt: nowIso(), clients: r[0], sessions: r[1], goals: r[2], programs: r[3] };
    });
}
function isBackupFile(v) {
  return v && typeof v === "object" && v.app === "client-session-tracker" &&
    Array.isArray(v.clients) && Array.isArray(v.sessions) && Array.isArray(v.goals);
}
function restoreBackup(backup, mode) {
  var programs = Array.isArray(backup.programs) ? backup.programs : [];
  var clients = Array.isArray(backup.clients) ? backup.clients : [];
  var sessions = Array.isArray(backup.sessions) ? backup.sessions : [];
  var goals = Array.isArray(backup.goals) ? backup.goals : [];

  var clearStep = mode === "replace" ? wipeAllData() : Promise.resolve();

  return clearStep.then(function () {
    var programRows = programs.map(programToRow);
    var p1 = programRows.length ? supabase.from("programs").upsert(programRows).then(checkError) : Promise.resolve();
    return p1.then(function () {
      var clientRows = clients.map(clientToRow);
      return clientRows.length ? supabase.from("clients").upsert(clientRows).then(checkError) : Promise.resolve();
    }).then(function () {
      var sessionRows = sessions.map(sessionToRow);
      var goalRows = goals.map(goalToRow);
      var p3 = sessionRows.length ? supabase.from("sessions").upsert(sessionRows).then(checkError) : Promise.resolve();
      var p4 = goalRows.length ? supabase.from("goals").upsert(goalRows).then(checkError) : Promise.resolve();
      return Promise.all([p3, p4]);
    });
  }).then(afterWrite);
}
function wipeAllData() {
  var ALL = "00000000-0000-0000-0000-000000000000"; // Supabase requires a filter on delete; this matches every real row.
  return Promise.all([
    supabase.from("sessions").delete().neq("id", ALL).then(checkError),
    supabase.from("goals").delete().neq("id", ALL).then(checkError),
  ]).then(function () {
    return Promise.all([
      supabase.from("clients").delete().neq("id", ALL).then(checkError),
      supabase.from("programs").delete().neq("id", ALL).then(checkError),
    ]);
  }).then(afterWrite);
}

/* ---------------------------------------------------------------------- */
/* Demo seed data (first login only, per account, so a brand-new trainer   */
/* account opens in a realistic state instead of a blank slate)            */
/* ---------------------------------------------------------------------- */

function seedDemoDataIfEmpty() {
  return clientRepository.list().then(function (existing) {
    if (existing.length > 0) return { seeded: false };

    var today = new Date();
    function daysAgo(n) { var d = new Date(today); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); }
    function daysAhead(n) { var d = new Date(today); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }

    var programPilatesInput = {
      name: "Postnatal Core Foundations",
      description: "Gentle reformer-based core rebuild. Progress spring resistance only once pain-free.",
      exercises: [
        { id: generateId(), exerciseName: "Footwork series", category: "Pilates", springSetting: "2 red", duration: null, side: "N/A", notes: "Start light, build spring load over weeks.", reformerSprings: "2 red", box: false, props: "", repetitions: null, assistanceLevel: "independent",
          setDetails: [{ id: generateId(), reps: 10, weight: "2 red springs", restSeconds: 20 }, { id: generateId(), reps: 10, weight: "2 red springs", restSeconds: 20 }] },
        { id: generateId(), exerciseName: "Hundred (modified)", category: "Pilates", springSetting: "", duration: 60, side: "N/A", notes: "Head down until neck/TA control improves.", reformerSprings: "", box: false, props: "small ball", repetitions: null, assistanceLevel: "light assist",
          setDetails: [{ id: generateId(), reps: null, weight: "", restSeconds: 30 }] },
        { id: generateId(), exerciseName: "Pelvic curl", category: "Pilates", springSetting: "", duration: null, side: "N/A", notes: "Focus on segmental spine articulation.", reformerSprings: "", box: true, props: "", repetitions: null, assistanceLevel: "",
          setDetails: [{ id: generateId(), reps: 8, weight: "", restSeconds: 20 }] },
      ],
    };
    var programStrengthInput = {
      name: "Squat Strength Block A",
      description: "4-week linear progression toward a clean 100kg squat.",
      exercises: [
        { id: generateId(), exerciseName: "Back squat", category: "Strength", springSetting: "", duration: null, side: "N/A", notes: "Reset bar path each set.", reformerSprings: "", box: false, props: "", repetitions: null, assistanceLevel: "",
          setDetails: [{ id: generateId(), reps: 5, weight: "70kg", restSeconds: 120 }, { id: generateId(), reps: 5, weight: "80kg", restSeconds: 120 }, { id: generateId(), reps: 5, weight: "85kg", restSeconds: 150 }] },
        { id: generateId(), exerciseName: "Romanian deadlift", category: "Strength", springSetting: "", duration: null, side: "N/A", notes: "", reformerSprings: "", box: false, props: "", repetitions: null, assistanceLevel: "",
          setDetails: [{ id: generateId(), reps: 8, weight: "50kg", restSeconds: 90 }, { id: generateId(), reps: 8, weight: "50kg", restSeconds: 90 }] },
        { id: generateId(), exerciseName: "Farmer carry", category: "Functional", springSetting: "", duration: 40, side: "Both", notes: "", reformerSprings: "", box: false, props: "", repetitions: null, assistanceLevel: "",
          setDetails: [{ id: generateId(), reps: null, weight: "32kg/hand", restSeconds: 60 }] },
      ],
    };

    return Promise.all([
      programRepository.create(programPilatesInput),
      programRepository.create(programStrengthInput),
    ]).then(function (progs) {
      var programPilates = progs[0], programStrength = progs[1];

      var clientAInput = {
        fullName: "Amira Al Farsi", gender: "Female", dateOfBirth: "1990-04-12",
        email: "amira@example.com", phone: "+971 50 111 2233", startDate: daysAgo(120),
        preferredTraining: ["Pilates", "Mobility"], currentGoal: "Rebuild core strength after pregnancy, pain-free by month 3.",
        medicalHistory: "C-section 8 months ago.", injuriesAndPain: "Occasional lower back tightness.",
        precautions: "Avoid heavy loaded flexion for first 6 weeks of any new phase.",
        emergencyContactName: "Yousef Al Farsi", emergencyContactPhone: "+971 50 999 8877",
        packageTotalSessions: 20, packageStartDate: daysAgo(120), packageExpiryDate: daysAhead(10),
        status: "active", generalNotes: "Prefers morning sessions. Very consistent.",
        assignedProgramId: programPilates.id,
      };
      var clientBInput = {
        fullName: "Daniel Cross", gender: "Male", dateOfBirth: "1985-11-02",
        email: "daniel@example.com", phone: "+971 55 222 3344", startDate: daysAgo(45),
        preferredTraining: ["Strength", "Functional"], currentGoal: "Squat 100kg for 5 reps with clean form.",
        medicalHistory: "None reported.", injuriesAndPain: "Mild right shoulder impingement, improving.",
        precautions: "Cap overhead pressing range until shoulder clears.",
        emergencyContactName: "Sara Cross", emergencyContactPhone: "+971 55 888 1122",
        packageTotalSessions: 12, packageStartDate: daysAgo(45), packageExpiryDate: daysAhead(60),
        status: "active", generalNotes: "", assignedProgramId: programStrength.id,
      };

      return Promise.all([clientRepository.create(clientAInput), clientRepository.create(clientBInput)]).then(function (clients) {
        var clientA = clients[0], clientB = clients[1];

        var sessionInputsA = [
          { n: 18, d: daysAgo(3), pain: 2, rpe: 6, note: "Reformer footwork + tower, feeling strong." },
          { n: 17, d: daysAgo(7), pain: 3, rpe: 5, note: "Focused on pelvic floor + breath work." },
          { n: 16, d: daysAgo(10), pain: 2, rpe: 6, note: "Added light spring resistance to leg circles." },
          { n: 15, d: daysAgo(14), pain: 4, rpe: 5, note: "Slight flare-up after long car ride, kept it gentle." },
        ].map(function (s) {
          return {
            clientId: clientA.id, date: s.d, sessionNumber: s.n, trainingType: ["Pilates"], durationMinutes: 55,
            exercises: [
              { id: generateId(), exerciseName: "Footwork series", category: "Pilates", springSetting: "2 red", duration: null, side: "N/A", notes: "", reformerSprings: "2 red", box: false, props: "", repetitions: 10, assistanceLevel: "independent",
                setDetails: [{ id: generateId(), reps: 10, weight: "2 red springs", restSeconds: 20 }, { id: generateId(), reps: 10, weight: "1 red + 1 blue", restSeconds: 20 }] },
              { id: generateId(), exerciseName: "Hundred (modified)", category: "Pilates", springSetting: "", duration: 60, side: "N/A", notes: "Kept head down, focus on TA activation.", reformerSprings: "", box: false, props: "small ball", repetitions: null, assistanceLevel: "light assist",
                setDetails: [{ id: generateId(), reps: null, weight: "", restSeconds: 30 }] },
            ],
            sessionNote: s.note, clientResponse: "Reported feeling stable, no sharp pain.",
            painScore: s.pain, rpe: s.rpe, modifications: "Kept range small on flexion-based work.",
            progression: "Ready to add single-leg stretch next session.", homework: "Daily 5-min breathing + pelvic tilt.",
            nextSessionFocus: "Introduce short spine massage progression.",
          };
        });
        var sessionInputsB = [
          { n: 10, d: daysAgo(2), pain: 1, rpe: 8, note: "Back squat 90kg x5x3, great bar speed." },
          { n: 9, d: daysAgo(6), pain: 1, rpe: 7, note: "Deadlift technique work + sled push." },
          { n: 8, d: daysAgo(9), pain: 2, rpe: 7, note: "Upper body push/pull, shoulder felt fine." },
        ].map(function (s) {
          return {
            clientId: clientB.id, date: s.d, sessionNumber: s.n, trainingType: ["Strength"], durationMinutes: 60,
            exercises: [
              { id: generateId(), exerciseName: "Back squat", category: "Strength", springSetting: "", duration: null, side: "N/A", notes: "Depth consistent.", reformerSprings: "", box: false, props: "", repetitions: null, assistanceLevel: "",
                setDetails: [{ id: generateId(), reps: 5, weight: "70kg", restSeconds: 120 }, { id: generateId(), reps: 5, weight: "80kg", restSeconds: 120 }, { id: generateId(), reps: 5, weight: "85kg", restSeconds: 150 }, { id: generateId(), reps: 5, weight: "90kg", restSeconds: 150 }, { id: generateId(), reps: 5, weight: "90kg", restSeconds: 0 }] },
              { id: generateId(), exerciseName: "Farmer carry", category: "Functional", springSetting: "", duration: 40, side: "Both", notes: "", reformerSprings: "", box: false, props: "", repetitions: null, assistanceLevel: "",
                setDetails: [{ id: generateId(), reps: null, weight: "32kg/hand", restSeconds: 60 }, { id: generateId(), reps: null, weight: "32kg/hand", restSeconds: 60 }, { id: generateId(), reps: null, weight: "36kg/hand", restSeconds: 0 }] },
            ],
            sessionNote: s.note, clientResponse: "High energy throughout.",
            painScore: s.pain, rpe: s.rpe, modifications: "", progression: "Add 2.5kg next week if RPE stays under 8.",
            homework: "Mobility flow 3x this week.", nextSessionFocus: "Retest squat top single.",
          };
        });

        var goalInputsA = [
          { timeframe: "1 month", goal: "Pain-free daily activities", measurableTarget: "Pain score under 3/10 daily", status: "Achieved" },
          { timeframe: "3 months", goal: "Return to full core loading", measurableTarget: "Full hundred with no compensation", status: "In progress" },
          { timeframe: "6 months", goal: "Rebuild general strength base", measurableTarget: "2x strength sessions/week", status: "Not started" },
          { timeframe: "12 months", goal: "Run 5k comfortably", measurableTarget: "Continuous 5k under 35 min", status: "Not started" },
        ].map(function (g) { return Object.assign({ clientId: clientA.id, notes: "" }, g); });
        var goalInputsB = [
          { timeframe: "1 month", goal: "Shoulder pain-free overhead", measurableTarget: "Full ROM press, 0 pain", status: "In progress" },
          { timeframe: "3 months", goal: "Squat 100kg x5", measurableTarget: "100kg x5 clean depth", status: "In progress" },
          { timeframe: "6 months", goal: "Deadlift 150kg", measurableTarget: "150kg x3", status: "Not started" },
          { timeframe: "12 months", goal: "Complete a Hyrox event", measurableTarget: "Finish under 90 min", status: "Not started" },
        ].map(function (g) { return Object.assign({ clientId: clientB.id, notes: "" }, g); });

        return Promise.all(
          sessionInputsA.concat(sessionInputsB).map(function (s) { return sessionRepository.create(s); })
            .concat(goalInputsA.concat(goalInputsB).map(function (g) { return goalRepository.upsertForTimeframe(g.clientId, g.timeframe, g); }))
        ).then(function () {
          return { seeded: true, clientIds: [clientA.id, clientB.id], programIds: [programPilates.id, programStrength.id] };
        });
      });
    });
  });
}
