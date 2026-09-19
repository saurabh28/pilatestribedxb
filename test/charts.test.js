const assert = require("assert");
const path = require("path");
const { loadScript } = require("./helpers/load-browser-script");

const sandbox = { console: console };
loadScript(path.join(__dirname, "..", "charts.js"), sandbox);

function approx(actual, expected, msg) {
  assert.ok(Math.abs(actual - expected) < 0.5, msg + " (got " + actual + ", expected ~" + expected + ")");
}

// 4 axes all scored at max -> vertices sit exactly on the radius circle,
// starting straight up and going clockwise.
const full = sandbox.radarChartPoints(
  [
    { label: "A", value: 10, max: 10 },
    { label: "B", value: 10, max: 10 },
    { label: "C", value: 10, max: 10 },
    { label: "D", value: 10, max: 10 },
  ],
  100
);
approx(full.axes[0].vx, 100, "axis 0 x"); approx(full.axes[0].vy, 0, "axis 0 y");
approx(full.axes[1].vx, 200, "axis 1 x"); approx(full.axes[1].vy, 100, "axis 1 y");
approx(full.axes[2].vx, 100, "axis 2 x"); approx(full.axes[2].vy, 200, "axis 2 y");
approx(full.axes[3].vx, 0, "axis 3 x");   approx(full.axes[3].vy, 100, "axis 3 y");

// All-zero scores collapse every vertex to the center.
const empty = sandbox.radarChartPoints(
  [
    { label: "A", value: 0, max: 10 },
    { label: "B", value: 0, max: 10 },
    { label: "C", value: 0, max: 10 },
  ],
  100
);
empty.axes.forEach(function (a) { approx(a.vx, 100, "zero-score x"); approx(a.vy, 100, "zero-score y"); });

console.log("charts.test.js: all assertions passed");
