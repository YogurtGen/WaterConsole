# Optional Windows gamepad toolkit

This is a generic transport for developers writing a reviewed WaterConsole adapter. **No native game adapter is registered in Core.** It is not needed for Controller Lab or browser touch vibration. It does not launch games, install a driver, or listen on the network.

Build on Windows x64 with Node.js and the .NET Framework 4.x C# compiler at `%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe`. Windows 10/11 normally supplies this; the build fails clearly if it is missing. An SDK is not required for these sources.

```powershell
npm run build:native
npm run test:native
& '.\build\native\WaterConsole.InputBridge.exe' --probe
```

`test:native` performs pure mapping/parser checks without creating devices. `--probe` checks the bundled client and optional bus without creating a controller. For an actual attachment, a trusted PC adapter must verify its selected executable, start/attach only with owner authorization, and spawn this helper with an argument array:

```text
--pid PID --exe ABSOLUTE_EXE_PATH --players 1..4
```

The PID must already exist and its executable must exactly match the selected absolute `.exe` path. The helper has no launch/discovery/keyboard-injection commands. Each player receives a separate virtual Xbox controller, created sequentially with actual XInput arrival checks; setup fails if no independent index becomes available. Unrelated controllers are not removed.

## Input: newline-delimited JSON over stdin

The adapter assigns its own increasing stream sequence, translates the session snapshot to the exact schema, and writes a complete snapshot at least every 100 ms. Omitted players are neutral. Allowed buttons: `up`, `down`, `left`, `right`, `a`, `b`, `x`, `y`, `l`, `r`, `lt`, `rt`, `start`, `select`, `confirm`, `back`.

```json
{"type":"state","version":1,"profile":"standard","epoch":1,"seq":0,"mode":"game","playerMax":2,"displayMode":"shared","players":[{"slot":1,"buttons":["right","a"]},{"slot":2,"buttons":[]}]}
```

- `epoch` is a positive safe integer. `seq` is a nonnegative safe integer increasing within an epoch.
- `profile` is `standard`; `mode` is `menu` or `game`.
- `playerMax` must equal the CLI player count; `displayMode` is `shared`, `split-2`, or `split-4`. The adapter must validate the real game's supported modes separately.
- The first frame after an epoch/mode change is a neutral barrier. Submit a fresh increasing-sequence snapshot afterward to apply held input.
- Old epochs/sequences neutralize input and are ignored. Duplicate slots/actions, unknown actions, malformed data, frames above 16 KiB, or more than 240 frames/second are rejected. Invalid frames stop the helper and dispose its own controllers.
- The exact process must be in the foreground. Focus loss, EOF, errors, disposal, or 300 ms without a valid snapshot neutralizes input.

## Standard mapping

| Semantic action | Xbox report |
| --- | --- |
| Directions in `menu` | D-pad; opposite directions cancel |
| Directions in `game` | Left stick at full digital deflection; opposite directions cancel |
| `a` / `confirm` | A |
| `b` / `back` | B |
| `x`, `y` | X, Y |
| `l`, `r` | LB, RB |
| `lt`, `rt` | LT, RT |
| `start`, `select` | Start, Back |

This is a standard mapping, not proof of any game's bindings. Adapt and test each game independently; do not describe digital input as analog steering.

## Output and vibration

The helper writes JSON lines for `ready` (slot → actual XInput index), `focus`, `probe`, `error`, and motor feedback:

```json
{"type":"rumble","epoch":1,"slot":1,"largeMotor":120,"smallMotor":60,"durationMs":100}
```

Motor values are bytes (0–255). Stop reports contain zeros and duration 0. The callback stores motor state atomically; bridge output never runs inside the SDK callback. A desktop adapter validates/bounds feedback and forwards it through `NativeAdapterContext.onRumble` with the active epoch. The server and phone perform their own slot/session/focus/permission checks. A callback proves game rumble only when it actually came from that game; synthetic tests and touch pulses do not prove collisions.

Closing stdin releases only helper-owned devices. The adapter remains responsible for cleanly stopping an owned game, waiting for process exit, handling confirmation dialogs through supported methods, and reporting when it remains open.

## Optional dependencies and redistribution

`assets/native/vigem/` contains the pinned MIT ViGEmClient DLL, full license, source URL, commit and SHA-256. The client is not the driver. Native device creation additionally needs the third-party **ViGEmBus 1.22.0** system driver, whose upstream project was retired in 2023. It is a deliberate optional dependency, not part of base setup.

`npm run tools:download` retrieves and verifies the exact official installer and its BSD-3-Clause license into `.local/optional-tools/`; it does **not** install it. The release's separate Optional Controller Tools ZIP carries that installer, compiled helper/client, provenance and notices. Read [INSTALL.md](../../docs/INSTALL.md) before choosing it. System installation requires the user's administrator approval. Never trigger installation over LAN or during tests.
