# WaterConsole contributor instructions

WaterConsole is an English-language, MIT-licensed Windows console foundation. Work in this checkout and keep project dependencies, caches, builds and releases on the selected project drive. Read README.md, SECURITY.md, docs/ARCHITECTURE.md and docs/PROTOCOL.md first. Before adding a game, also read docs/ADDING-GAMES.md and docs/TESTING.md. Claude Code users should read CLAUDE.md.

## Product scope

Only Controller Lab ships. Preserve QR pairing and PC approval, four phone slots, Home/library/search/favorites/recent, local navigation audio, fullscreen, independent multi-touch, draggable directions, input recovery and per-phone Vibration/Test. The developer adapter registry is empty by default; the reviewed user-configured runtime supports local PC entries. Preserve both no-code and source/AI routes. A manifest alone does not make a game playable. Player limits and shared/split-screen layouts must follow each runtime's actual capability.

Public presentation: WaterConsole. Slogan: **Playing together should be free.** Palette: mint green and dark gray. Product UI is English. Core has its own app ID and settings profile. Keep every runtime font, script and asset local; no CDN/account dependency for installed core features.

## Input, safety and privacy

- Phones send allowlisted semantic actions, never shell commands, executable paths, arbitrary Windows keycodes, configuration or administrator actions.
- Preserve Origin/Host checks, approval, rate/payload limits, tokens, increasing sequence/epoch, sandboxed Electron, and a maximum of four slots. HTTP LAN traffic is unencrypted; document that limit.
- Neutralize input on blur/focus loss, hidden tab, pointer cancellation/lost capture, disconnect, profile/epoch/mode changes, helper EOF/exit and the 300 ms watchdog. Reconnect inside 30 seconds restores a reserved slot, never held input.
- Keep phone controls gamepad-shaped and ergonomic. Validate simultaneous combinations, drag transitions and nonconsecutive player slots. Animation must not delay input.
- Touch vibration needs no separate phone app/driver. Native rumble needs an actual adapter callback, slot/epoch/focus gating, and optional PC gamepad support. A touch cue does not prove a hit or collision. Preserve one per-phone toggle, gesture activation, feature detection, bounded pulses and cancellation.
- Do not install drivers or open/control third-party games as an implicit test step. Do not change authentication, DRM, anti-cheat, launcher caches, global firewall settings or unrelated processes. A custom integration must explain its concrete requirements. Never force-kill a user-opened game; distinguish an owned process from an attachment and verify clean exit before returning Home.
- Never commit game binaries, extracted/recorded media, login captures, live QR invitations, credentials, tokens, user profiles or private research. Use original or redistributable assets and update assets/ASSET-LICENSES.md. Preserve third-party licenses/provenance. The optional legacy bus driver is a separate download and never installs automatically.

## Implementation and checks

The stack is Electron, React/TypeScript, Vite, Fastify/ws and an optional C# gamepad toolkit. No PHP. Native extensions register explicit desktop-only factories in src/electron/adapters.ts; inspect the current contracts before writing one. Test menu and gameplay independently rather than inferring compatibility from a driver probe or successful menu navigation.

Use npm run setup for dependencies; project commands route caches/temp through scripts/run-local.mjs. Source is in src/, original assets in assets/, help/site in docs/, generic native sources in toolkit/native/, installers in Setup/ and other artifacts in releases/<version>/. Do not move generated files to a different drive. Gitignore and the source ZIP allowlist must both exclude private/generated additions.

For code changes run npm run typecheck, npm test and npm run build, then npm run test:e2e when host/phone flows change. Native mapping changes also need npm run test:native; it opens no game/device. Run appropriate focused checks once and broaden only for a new concern. Report the actual evidence and remaining limits. Browser mocks cannot prove physical vibration, Android fullscreen, four real phones, sustained Wi-Fi RTT, clean-machine installation or native game compatibility.

## Add games and custom controllers with AI

Read [docs/ADDING-GAMES.md](docs/ADDING-GAMES.md) and [docs/CONTROLLER-STUDIO.md](docs/CONTROLLER-STUDIO.md). The GUI is a complete alternative for users without an AI subscription; do not remove it when adding specialized source integrations. Reserve `local-*` IDs for validated library records. Source adapters use their own explicit IDs and factories; never redirect every game through one genre mapping.

Use declarative ControllerDefinition profiles when their controls/actions are sufficient. For specialized UI/telemetry/launchers, isolate the adapter/profile, add allowed semantic actions and a safe phone layout, and keep private bindings on PC. Phones never get native keycodes or executable paths. UserBridge v2 is separate from the original semantic toolkit. Do not load JS/DLL plugins from library records.

Linked actions are simultaneous holds: a source can hold game-bound inputs such as RT + B, while releasing it must preserve Accelerate if another source still holds it. Use the existing union engine; no last-event-wins, timed macros, automatic repeats, or global keyboard shortcuts. Preserve per-slot true analog values.

Record menu and gameplay bindings separately, actual player limits, the multiplayer menu route, offline evidence, launcher requirements, focus/watchdog recovery, and clean stop. Reuse per-phone Vibration/Test and slot/epoch rumble gates. Test native input with an owned lightweight fixture before opening a third-party game. Do not claim physical-phone vibration or real-game compatibility from browser mocks.

Controller appearance: keep the compact contextual Color & fill panel and persistent Canvas background. Optional theme icon/pressedIcon overrides inherit text/pressedText when absent; preserve old profiles. Only one color picker should open at once. Library shelf scrollbars stay hidden; phone navigation can reveal cards but cannot open PC edit/delete actions.

Configured-game launch: keep running-window titles/paths PC-only and validate each executable before selection/attachment. Auto recognizes a local Steam installation, calls the fixed Steam route with only a validated numeric app ID, and waits for the real game window. Reuse a matching open window without claiming ownership; only a console-started game closes on normal Stop. A stale PID can fall back to one exact-executable window; multiple windows require owner selection. Preserve the95s native/100s desktop deadlines for local entries. Custom arguments use Direct. Cover this with game-launch.test.ts and the owned-window fixture in test-editor.mjs; never substitute a brief process spawn for successful game startup.
