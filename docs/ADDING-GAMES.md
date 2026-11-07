# Adding a game

WaterConsole Core ships **Controller Lab only**. This guide describes building an integration in your own checkout. A library card is metadata; a playable integration also needs a runtime, an adapter, a usable phone layout, and evidence from the actual game.

Read [AGENTS.md](../AGENTS.md), [SECURITY.md](../SECURITY.md), [ARCHITECTURE.md](ARCHITECTURE.md), and [PROTOCOL.md](PROTOCOL.md) first. Keep launch paths and input injection on the trusted PC. Never accept shell commands, executable paths, arbitrary Windows keycodes, or driver installation requests from a phone.

## Two ways to add games

**No code / no paid AI:** click **Add game** beside the Home library search. Choose your own installation, edit its metadata/artwork and configure controls in Controller Studio. Follow [the visual editor guide](CONTROLLER-STUDIO.md). The app bundles the generic PC helper; virtual gamepads need separately installed optional support. A saved entry remains **Ready to test** until you record gameplay observations.

**Source / AI:** keep reading for specialized launchers, custom phone interfaces, game-specific behavior or verified feedback sources. Codex and Claude Code remain optional. The user-configured runtime and specialized adapters coexist; do not replace one with the other.

## Before writing code

Record the following in a short integration note. Use **unknown** when something has not been tested.

| Question | Required evidence |
| --- | --- |
| Where does it run? | An original, user-installed executable or an original/licensed web game. No redistributed commercial binary. |
| Which modes work? | The actual menu route to local multiplayer, supported player count, and shared/split-screen modes. |
| What does the game accept? | Separate keyboard bindings, XInput/gamepad devices, analog axes, focus requirements, and device selection for menus **and** gameplay. |
| Does it work offline? | A cold-launch test with internet disconnected. Launchers, authentication, and multiplayer services can differ from the local console. |
| What needs simultaneous input? | Typical combinations such as movement + jump + attack or steer + throttle + drift. |
| What is feedback based on? | A local touch cue or a verified game rumble callback. Do not label a button pulse as a detected collision. |
| What can be published? | Source/assets you own or can redistribute, with licenses and attribution. |

Do not bypass game authentication, DRM, anti-cheat, or platform checks. If normal supported input is rejected, document the limitation and choose another approach or leave the adapter unavailable.

## Repository map

| File or directory | Responsibility |
| --- | --- |
| `src/shared/types.ts` | `GameManifest`, `GAMES`, `ControllerProfile`/`PROFILES`, actions, session/input contracts, display modes. |
| `src/server/index.ts` | Authoritative slots, pairing/authorization, profile validation, sequence/epoch handling, input recovery, and session routing. |
| `src/server/entry.ts` | Server utility-process IPC. |
| `src/electron/adapters.ts` | **Empty by default:** explicit native adapter registration and desktop-only adapter contract. |
| `src/electron/native-router.ts`, `library-store.ts`, `library-ipc.ts` | Generic local-game routing, private catalog, images and restricted PC editor IPC. |
| `src/shared/studio-model.ts`, `studio-validation.ts`, `studio-engine.ts` | Versioned declarative controls, allowlisted bindings, held-source unions, themes and responsive geometry. |
| `src/renderer/studio-surface.tsx`, `controller-studio.tsx` | Shared safe touch runtime and PC visual editor. |
| `src/electron/native-game.ts` | Desktop native-runtime facade and registered adapter lifecycle. |
| `src/electron/main.ts`, `preload.ts` | Restricted host bridge, desktop lifecycle, and trusted IPC. |
| `src/renderer/host.tsx` | Host library, game detail, Controller Lab, and session management. |
| `src/renderer/controller.tsx` | Phone pairing, fullscreen entry, settings, menu controller, and gameplay layouts. |
| `src/renderer/direction-pad.ts` | Drag pad sectors, dead zone, and directional transitions. |
| `src/renderer/haptics.ts` | Per-phone preference, activation, bounded pulses, and cancellation. |
| `src/renderer/style.css` | Responsive host/controller styling and reduced-motion behavior. |
| `assets/public/assets/` | Redistributable local graphics. Record every addition in `assets/ASSET-LICENSES.md`. |
| `toolkit/native/` | Optional generic Windows gamepad bridge source; not a shipped game adapter. |
| `tests/`, `scripts/e2e.mjs` | Protocol, authorization, lifecycle, input, and UI regression checks. |

A native registry entry has a `manifest` and `create(context)` factory. The context supplies `helperPath`, `onState`, and `onRumble`. The created adapter implements async `available()`, `start()`, `stop()`, and `focus()`, plus synchronous `input(snapshot)` and `reset()`. Read the exported interfaces in `src/electron/adapters.ts` rather than copying an outdated signature. Mark a manifest `requiresGamepad` only when that runtime actually needs it.

The generic profiles are `menu`, `lab`, and `gamepad`; native control modes are `menu` and `game`. Read the current type definitions before extending them. Add an explicit typed profile or mapping when a game needs more than the generic controls, rather than making one game's assumptions global.

## Implement in this order

1. **Specify behavior.** Define the real player limit, startup path, supported display modes, controller mapping, haptic source, stop behavior, and unavailable/error states. An online/offline label must match observed behavior.
2. **Register the manifest.** Use a unique ID, honest availability, correct runtime, player range, supported layouts, and a controller profile. Keep an unverified integration unavailable. A manifest cannot force split-screen into a game.
3. **Write the runtime adapter.** For native games, add an explicitly registered PC adapter in `src/electron/adapters.ts`. Read paths from trusted PC configuration and validate the executable. Use a process API with an argument array; do not build shell command strings. Do not scan for or modify unrelated installations.
4. **Map semantic input.** Convert allowlisted actions/axes to tested game bindings inside the adapter. Maintain a complete held-input state per slot. Every player must get an independent device or tested independent binding set. Do not assume menu success proves gameplay input.
5. **Build the phone layout.** Use touch controls shaped for the game's repeated actions. Keep movement under one thumb and frequent actions under the other; consider a shoulder area or an explicit optional combined action when three actions must be held together. Offer understandable per-phone preferences when both layouts are useful.
6. **Implement recovery and shutdown.** Reset on focus loss, disconnect, hidden tab, pointer cancel, profile/epoch changes, watchdog expiry, stop, and helper EOF. Return Home should have an explicit outcome: stop the owned game cleanly or clearly report that it remains open. Never kill unrelated processes.
7. **Add original cover art and documentation.** Bundle assets locally, include their provenance/license, and keep private extracts and screenshots out of the repository. Handle a missing image with a deliberate fallback.
8. **Test and record the limits.** Run the automated checks below, then use the actual game and phones. Update the integration note with measured results and remaining unknowns.

### Native toolkit

`npm run build:native` compiles the optional generic bridge to `build/native/WaterConsole.InputBridge.exe`. It uses `toolkit/native/GamepadBridge.cs` and `VirtualGamepad.cs` plus the pinned `assets/native/vigem/ViGEmClient.dll`. Follow the toolkit README for compiler prerequisites and the JSON contract.

```powershell
npm run build:native
& '.\build\native\WaterConsole.InputBridge.exe' --probe
```

The attach form is `--pid PID --exe ABSOLUTE_PATH --players 1..4`. It attaches to a deliberately selected running process; it is not a launcher or an automatic game detector. The helper accepts newline-delimited semantic snapshots containing `type: "state"`, `version: 1`, `epoch`, increasing `seq`, `mode` (`menu` or `game`), `profile` (`standard`), `playerMax`, `displayMode`, and `players: [{slot, buttons}]`. The first frame after an epoch/mode change is a neutral barrier; a subsequent increasing sequence can apply input. Use the exact current schema in the toolkit README rather than inventing extra fields.

Only install the optional system driver after a user deliberately chooses an adapter that needs it. Preserve its license, provenance, checksum, and retirement notice. Missing support must leave the integration unavailable with a useful explanation.

### Touch behavior

Use Pointer Events, `touch-action: none` in input regions, pointer capture, and independent pointer ownership. A finger dragged **right → down → left → up** must release the previous direction and press the new one without lifting. Another finger must be able to hold an action throughout. Diagonals and the dead zone need predictable behavior.

Send input changes immediately; visual animation must not delay them. Send state snapshots, not just button edges. Clear held input on `pointerup`, `pointercancel`, lost capture, blur, and hidden-tab transitions. Keep safe areas, landscape/portrait fallbacks, large hit targets, keyboard focus, and reduced motion.

### Haptics

Reuse `ControllerHaptics` and the phone's existing **Vibration / Test vibration** controls. Respect feature detection, the per-phone preference, user activation, cooldowns, maximum duration, and cancellation. Do not add a second vibration preference for one game.

- **Touch cues** confirm an action taken on the controller. They need only a supported phone browser.
- **Native rumble** requires a real game/controller feedback callback, the correct player slot and epoch, and server-side gating. Route feedback only while that player's game session is valid and focused.
- **Detected events** such as a collision require an actual supported event source. If none exists, describe the cue as touch feedback.

Test vibration on a physical phone separately from a mocked browser API. Stop it when a tab hides, the session ends, or the device disconnects. See [INSTALL.md](INSTALL.md#vibration-and-optional-native-support).

## Use Codex or Claude Code

AI assistance is optional. Install the developer prerequisites from [INSTALL.md](INSTALL.md) first. AI tools have their own accounts, service access, network use, and possible charges. Do not commit their credentials or a game's private files.

### Codex

Install Codex using its [official CLI instructions](https://github.com/openai/codex#quickstart). With Node/npm already available, the documented package-manager option is:

```powershell
npm install -g @openai/codex
codex --version
Set-Location E:\Projects\WaterConsole
codex
```

Authenticate through the tool's own flow. Alternatively, open the repository as a project in the Codex app or supported editor integration. The `codex` CLI is separate from the `openai` API CLI.

### Claude Code

Follow the [official Windows setup guide](https://code.claude.com/docs/en/setup). A documented Windows option is:

```powershell
winget install Anthropic.ClaudeCode
```

Open a new terminal, then:

```powershell
claude --version
Set-Location E:\Projects\WaterConsole
claude
```

Complete the tool's own sign-in. Read [CLAUDE.md](../CLAUDE.md) and follow the same project contracts as Codex. Tool installation commands can change; use the linked official instructions if an installer or authentication step differs.

### Prompt 1: investigate and implement

Replace the bracketed values before pasting. The installation path belongs only in your local task, not a public bug report.

```text
Work in this WaterConsole checkout. Read AGENTS.md, CLAUDE.md, SECURITY.md,
docs/ADDING-GAMES.md, docs/ARCHITECTURE.md, docs/PROTOCOL.md, and docs/TESTING.md.

Add [GAME TITLE] from my original local installation at [LOCAL PATH].
Requested mode: [LOCAL/ONLINE], up to [N] players, [SHARED/SPLIT-2/SPLIT-4].
First inspect the shipped files and supported normal input paths. Separate
observations from guesses. Verify the player count, menu route, gameplay device
selection, independent bindings, authentication/offline requirements, and
possible rumble callbacks. Do not bypass authentication, DRM, or anti-cheat.

Write a short integration note with unknowns, then implement a complete adapter,
manifest, ergonomic drag/multitouch phone profile, local original/licensed cover,
honest connectivity labels, and the existing per-phone vibration controls.
Never send executable paths, shell commands, or unrestricted keycodes over LAN.
Keep every native adapter desktop-only and register it explicitly. Do not install
a system driver without explaining the concrete component and obtaining consent.

Test menu AND gameplay input, held combinations, every player independently,
focus/disconnect/cancel/watchdog/epoch reset, safe stop/return Home, missing-driver
and missing-game states, and haptic routing. Run typecheck, tests, build, and the
relevant UI checks. Distinguish automated tests from real-game/physical-phone
tests. Do not mark an integration playable or offline without evidence. Leave a
clear unavailable state if a required test fails. Report changed files, evidence,
remaining limits, and the exact manual checks I should perform.
```

### Prompt 2: improve an uncomfortable controller

```text
Read the project instructions and inspect the current phone controller.
For [GAME/PROFILE], the frequent combination is [A + B + C]. Players use
[THUMBS/THUMBS + INDEX FINGERS] in [PORTRAIT/LANDSCAPE].
Propose the smallest ergonomic change, then implement it with independent
multi-touch and a continuous drag pad. Preserve the old layout as an explicit
per-phone option if the new layout combines actions. Release all logical actions
when the touch ends, cancels, the tab hides, the profile changes, or connection
is lost. Reuse the vibration preference. Check the target phone dimensions and
run meaningful input/recovery tests; do not change unrelated game bindings.
```

## Acceptance checklist

- All declared slots control independent players in **actual gameplay**, including nonconsecutive slots.
- Menu mode, game mode, pause, confirm/back, movement, held combinations, and repeated actions map correctly.
- The phone supports continuous drag, diagonals, dead zone, and simultaneous action touches.
- No input or vibration remains after cancel, blur, disconnect, stale frame, profile change, stop, or helper failure.
- A stale or unapproved phone cannot inject input or change PC configuration.
- Native focus and stop behavior are visible and predictable; unrelated processes are untouched.
- Display modes and online/offline labels reflect tested runtime capabilities.
- Covers load in a **packaged** build; paths are not tied to one developer's PC.
- Assets, dependencies, and optional binaries have provenance, license, and checksums where appropriate.
- `npm run typecheck`, `npm test`, `npm run build`, and relevant e2e checks pass; physical-device/game tests are recorded separately.

Keep a general-purpose adapter framework separate from private game configuration. Publishing an integration does not give permission to redistribute its game.

## Declarative profiles and the user-configured helper

`local-*` records are managed by the PC library and validated against `studio-model.ts` / `studio-validation.ts`. Do not hand-edit a live catalog. Prototype a declarative profile in Studio or create it in an isolated fixture; apply it through the same validated PC save path. A phone receives only the sanitized active controller definition, never launch paths, arguments or bindings.

`WaterConsole.UserBridge.exe` uses a separate **v2** private stdin contract with complete standard button/axis/key reports. It is built alongside the v1 semantic `InputBridge`, not substituted for it. Read [the native contract](../toolkit/native/README.md#user-configured-runtime-v2). Keep output coalescing, the neutral epoch barrier, process/foreground validation, EOF/watchdog cleanup and independent devices. Do not make a gamepad label promise a virtual PlayStation device.

For a custom AI-built controller, ask the agent to preserve both development paths, inspect `AGENTS.md`, list the intended semantic actions and per-player outputs, implement the smallest isolated profile/adapter, and demonstrate real held combinations and recovery. Include a compatibility note and avoid shipping the user's commercial art or executable.
