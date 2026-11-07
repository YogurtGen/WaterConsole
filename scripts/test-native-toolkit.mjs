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
