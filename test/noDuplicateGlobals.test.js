const assert = require("assert");
const fs = require("fs");
const path = require("path");

// The app is plain <script> tags sharing one global scope, in the order
// index.html loads them. A top-level function/var defined in two files
// silently lets the later file win, so a stale copy can shadow a fixed one
// while per-file unit tests (which load a single file) still pass.
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const files = [...html.matchAll(/<script src="([^"]+\.js)"><\/script>/g)]
  .map(function (m) { return m[1]; })
  .filter(function (f) { return !/^https?:/.test(f); });

assert.ok(files.length > 3, "found the app's local script files");

const seen = {};
const dups = [];
files.forEach(function (file) {
  const src = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
  [...src.matchAll(/^(?:function|var)\s+([A-Za-z_$][\w$]*)/gm)].forEach(function (m) {
    const name = m[1];
    if (seen[name] && seen[name] !== file) dups.push(name + " (" + seen[name] + " and " + file + ")");
    else seen[name] = file;
  });
});

assert.deepEqual(dups, [], "top-level names defined in more than one script: " + dups.join(", "));
console.log("noDuplicateGlobals.test.js: all assertions passed");
