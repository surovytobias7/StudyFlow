const { spawn } = require("node:child_process");
const electron = require("electron");
// IDEs built on Electron may export this flag for their Node subprocesses.
// StudyFlow is a desktop application, so remove it only from this child.
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
// This is the interactive application the user needs to see, not a background helper.
const child = spawn(electron, [".", ...process.argv.slice(2)], {
  stdio: "inherit",
  env,
  windowsHide: false,
});
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
