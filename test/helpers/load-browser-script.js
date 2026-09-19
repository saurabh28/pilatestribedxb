const fs = require("fs");
const vm = require("vm");

function loadScript(filePath, sandbox) {
  const code = fs.readFileSync(filePath, "utf8");
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: filePath });
  return sandbox;
}

module.exports = { loadScript };
