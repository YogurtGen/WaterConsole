import { spawnSync } from "node:child_process";
import { mkdirSync, existsSync, readFileSync, copyFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
if (process.platform !== "win32")
  throw new Error("The native game bridge requires a Windows build host.");
const compiler = path.join(
  process.env.WINDIR || "C:/Windows",
  "Microsoft.NET/Framework64/v4.0.30319/csc.exe",
);
if (!existsSync(compiler))
  throw new Error("The Windows .NET Framework C# compiler was not found.");
const clientRoot = path.resolve("assets/native/vigem");
const client = path.join(clientRoot, "ViGEmClient.dll");
const provenance = JSON.parse(
  readFileSync(path.join(clientRoot, "SOURCE.json"), "utf8").replace(
    /^\uFEFF/,
    "",
  ),
);
if (
  createHash("sha256").update(readFileSync(client)).digest("hex") !==
  provenance.sha256
)
  throw new Error(
    "The pinned virtual gamepad client checksum does not match its provenance.",
  );
mkdirSync("build/native", { recursive: true });
const result = spawnSync(
  compiler,
  [
    "/nologo",
    "/optimize+",
    "/target:exe",
    "/platform:x64",
    "/reference:System.Web.Extensions.dll",
    "/out:" + path.resolve("build/native/WaterConsole.InputBridge.exe"),
    path.resolve("toolkit/native/GamepadBridge.cs"),
    path.resolve("toolkit/native/VirtualGamepad.cs"),
  ],
  { stdio: "inherit", windowsHide: true },
);
if (result.status !== 0)
  throw new Error("The semantic native gamepad toolkit did not compile.");
copyFileSync(client, "build/native/ViGEmClient.dll");
copyFileSync(
  path.join(clientRoot, "LICENSE"),
  "build/native/ViGEmClient-LICENSE.txt",
);
copyFileSync(
  path.join(clientRoot, "SOURCE.json"),
  "build/native/ViGEmClient-SOURCE.json",
);
console.log(
  "Built optional Windows gamepad toolkit; no adapters or driver installed.",
);
