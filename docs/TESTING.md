# Testing

Record what was actually tested. Source inspection, automated browser tests, packaged-app checks, physical phones, and native game tests provide different evidence.

## Automated checks

From a configured Windows developer checkout:

```powershell
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Unit/integration coverage should exercise session ownership, approval, action/schema validation, stale sequence/epoch rejection, rate/payload limits, slot reservations, and neutral input recovery. The drag-pad tests should cover sectors, diagonals, dead zone, and transitions. The e2e runner exercises the Electron host and controller browser flow with isolated local state.

The runner uses installed Google Chrome by default. To use its Chromium fallback, install it through the repository wrapper so its cache stays in the checkout:

```powershell
node scripts/run-local.mjs node_modules/playwright/cli.js install chromium
$env:WATERCONSOLE_BROWSER = 'chromium'
npm run test:e2e
Remove-Item Env:WATERCONSOLE_BROWSER
```

A missing executable or skipped check is not a pass. Optional native tooling has separate `npm run build:native` and `npm run test:native` commands; its pure self-test does not create controllers, install drivers, or prove game compatibility.

Do not launch third-party games or install system drivers as an implicit test prerequisite. Core tests must work with an empty native adapter registry.

## Manual core checklist

| Area | Test and expected behavior |
| --- | --- |
| Offline cold start | Disconnect internet while keeping LAN available. Start the installed app; lobby, Home, local assets, pairing, and Controller Lab work without a CDN/account. |
| Pairing | Pair four real phones with PC approval. Compare verification codes. The fifth receives a clear capacity message. An unapproved phone cannot navigate or input. |
| Host administration | Approve/reject, transfer navigation, kick, lock pairing, and end/reset the session. Other phones cannot perform PC admin actions. |
| Fullscreen | On Android Chrome, tap Enter controller; check fullscreen, exit, rotation, and normal browser fallback. Record browser/device when an API is declined. |
| Multi-touch | Hold movement and an action together; test multiple action fingers. Drag right → down → left → up, diagonals, and through the dead zone without lifting. |
| Neutral recovery | Hold input, then cancel a touch, hide the tab, switch profile/layout, disconnect Wi-Fi, or close the tab. Input returns neutral. |
| Reconnect | Reconnect inside 30 seconds to reclaim the slot with neutral input. Outside the reservation/session lifetime, require pairing again. |
| Layouts | Inspect shared, split-2, and split-4 in Controller Lab with correct player colors and independent movement. |
| Vibration | On a supported physical phone, enable/disable and Test vibration; confirm cancellation on hide/end. Record unsupported/declined API as a limitation. |
| Host UI | Check 1920×1080 and 1280×720; keyboard/mouse/phone navigation, selected card motion, audio mute, favorites, recents, search, empty results, and reduced motion. |
| Lifecycle | Check a busy port, selected adapter/IP changes, server failure, app exit, and reopen. No orphan server or held input remains. |
| Packaging | On a clean Windows user environment, run Setup/portable without Node/Git. Verify bundled assets/fonts/notices and the independent Core settings profile. |

Do not include active QR codes, tokens, or pairing secrets in test evidence. Use a deliberate preview fixture for public screenshots.

## Network/performance checks

Use four physical phones on the intended private LAN for a sustained 30-minute session. Record PC/phone/browser versions, network hardware, player count, duration, reconnects, and failures. The design target is **LAN RTT p95 ≤50 ms on the measured network**; it is not a published measured result until such a run is recorded. RTT and visual input-to-screen latency are different measurements.

Test foreign Origin/Host, expired credentials, malformed/oversized messages, flooding, stale frames, and asset traversal in an isolated test session. Preserve the firewall; do not expose the test server publicly.

## Custom native adapters

Follow [ADDING-GAMES.md](ADDING-GAMES.md). Test menu and gameplay separately, every supported slot (including nonconsecutive slots), held combinations, focus/device changes, clean stop, missing installation, missing helper/driver, helper EOF, and per-slot feedback. A launcher sign-in or anti-cheat failure is not permission to bypass it.

A virtual gamepad visible in Windows or a passing helper probe does not prove the game accepts that controller during gameplay. A browser vibration mock does not prove physical rumble. Use explicit evidence for claims such as offline, playable, four-player, or collision feedback.

## Documentation previews

`scripts/capture-docs.mjs` renders the real React interface with simulated documentation-only state. It generates the images in `docs/media/` and visibly marks them **Documentation preview**. Its URLs use `example.invalid` and its pairing code is `PREVIEW`; it must not connect to a real console or publish a live invitation.

These images show the interface, not device compatibility or performance. Regenerate them after relevant UI changes and visually inspect desktop and phone captures. See [docs/media/README.md](media/README.md).

## Controller Studio integration fixture

`npm run test:studio` compiles an owned lightweight Windows fixture, tests crop outputs and four approved browser controllers in a safe preview, analog dragging, rotation bounds and the explicit vibration test. It opens no third-party game. It uses installed Google Chrome and an isolated local data folder. Build the application first.

To additionally create virtual controllers and launch only that owned fixture, deliberately set `$env:WATERCONSOLE_STUDIO_NATIVE='1'` before running it. Existing optional PC controller support and free XInput slots are required; no driver installs automatically. Clear the variable afterward. The native path verifies independent real XInput reports, linked holds, release and normal exit. It is an opt-in device test, not a commercial-game compatibility check.

For a packaged app, set `WATERCONSOLE_EXECUTABLE` to its exact executable; for a custom development Electron runtime also set `WATERCONSOLE_APP_ROOT` to this checkout. All caches/reports remain in the checkout. Do not publish live pairing state or its local data folder.

`npm run test:editor` checks the native file picker through a controlled owned fixture, first-use spotlight/Skip/replay/persistence, target interaction, keyboard dismissal, all crop and Studio guide steps, icon/shape/color editing and library persistence. It does not launch the selected fixture or third-party games. Screenshot connection/path values are sanitized before public documentation use.

### Layout fidelity and store import

Run `node scripts/run-local.mjs scripts/test-layout-fidelity.mjs` for the shared Studio/phone geometry comparison and console-model palette. It uses an isolated library and browser-emulated phones, without launching a commercial game. `tests/controller-fidelity.test.ts` covers shape/size ratios and hand anchors; `tests/store-import.test.ts` covers fixture discovery, manifest containment, launcher identity, metadata identity, destination allowlists, redirects and response bounds. Real metadata availability and physical-phone comfort are separate manual checks.

Run `node scripts/run-local.mjs scripts/test-store-picker.mjs` for the import-dialog layout regression:18 generic installed-game fixtures, long titles/paths, four desktop sizes down to800×600, selection/launch-file panel, store filtering, search and editable import. It uses an isolated test IPC fixture, launches no game and fetches no publisher artwork. Scrollable flex-column rows must not shrink into overlapping text.
