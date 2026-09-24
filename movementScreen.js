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
  { id: "thomasTest", label: "Thomas Test (Hip Flexor Tightness)", maxScore: 2, normative: "0° (thigh level with table)",
    corrective: [
      { name: "Half-kneeling hip flexor stretch", sets: "2x30s/side", cue: "Tuck the pelvis under, squeeze the glute on the down knee." },
      { name: "Couch stretch", sets: "2x30s/side", cue: "Keep hips square, ease in only as far as comfortable." },
      { name: "Glute bridge march", sets: "3x8/side", cue: "Keep hips level as you lift each foot." },
    ] },
  { id: "pslr", label: "PSLR (Hamstring Flexibility)", maxScore: 2, normative: "≥ 80°",
    corrective: [
      { name: "Supine hamstring stretch with strap", sets: "2x30s/side", cue: "Keep the raised leg straight, gently pull without bouncing." },
      { name: "Assisted Nordic curl eccentrics", sets: "2x6", cue: "Lower as slowly as control allows." },
      { name: "Standing hamstring floss", sets: "2x10/side", cue: "Hinge hips back, keep the spine neutral." },
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
