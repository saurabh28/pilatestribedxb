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
