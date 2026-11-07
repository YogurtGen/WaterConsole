import { spawnSync } from "node:child_process";
const result = spawnSync(
  "build/native/WaterConsole.InputBridge.exe",
  ["--self-test"],
  { encoding: "utf8", windowsHide: true, timeout: 10000 },
);
if (result.error || result.status !== 0)
  throw new Error(
    result.stderr ||
      result.stdout ||
      result.error?.message ||
      "Native toolkit self-test failed.",
  );
const summary = JSON.parse(result.stdout.trim());
if (
  summary.type !== "self-test" ||
  summary.nativeDevicesCreated !== false ||
  summary.checks < 15
)
  throw new Error("Invalid toolkit test report.");
console.log(
  `${summary.checks} semantic mapping/protocol checks passed; no game or virtual device opened.`,
);

const configured = spawnSync(
  "build/native/WaterConsole.UserBridge.exe",
  ["--self-test"],
  { encoding: "utf8", windowsHide: true, timeout: 10000 },
);
if (configured.status !== 0)
  throw new Error(
    configured.stdout ||
      configured.stderr ||
      "Configured runtime self-test failed.",
  );
const report = JSON.parse(configured.stdout.trim());
if (report.nativeDevicesCreated !== false || report.checks < 7)
  throw new Error("Invalid configured runtime report.");
console.log(
  `${report.checks} configured report/keyboard/analog checks passed; no device opened.`,
);
