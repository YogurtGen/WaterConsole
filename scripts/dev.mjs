import { spawn } from "node:child_process";
import electron from "electron";
const builder = spawn(process.execPath, ["scripts/build.mjs"], {
  stdio: "inherit",
});
builder.on("exit", (code) => {
  if (code) {
    process.exitCode = code;
    return;
  }
  const child = spawn(electron, ["."], {
    stdio: "inherit",
    windowsHide: true,
    env: { ...process.env, WATERCONSOLE_WINDOWED: "1" },
  });
  child.on("exit", (exitCode) => {
    process.exitCode = exitCode ?? 1;
  });
  process.on("SIGINT", () => child.kill());
});
