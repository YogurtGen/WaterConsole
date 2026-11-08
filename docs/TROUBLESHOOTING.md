# Troubleshooting

Start with Controller Lab. If a control works there but not in a custom game, the likely problem is the adapter, game's device selection, or bindings rather than phone pairing.

## Phone will not connect or keeps loading

| Check | Action |
| --- | --- |
| Correct address | Use the address shown in the running PC lobby, including its port. `localhost` and `127.0.0.1` on a phone point to the phone itself. |
| Correct network adapter | Select the PC's active Wi-Fi/Ethernet IPv4 address. A VPN, virtual adapter, or old IP can make a QR point to the wrong network. Scan the new QR after changing it. |
| Same reachable network | Both devices should use the same trusted home Wi-Fi/hotspot. Guest Wi-Fi, access-point/client isolation, or a phone using cellular data can block LAN access even when Wi-Fi names look similar. |
| Windows network profile | Use Private only for a network you trust. Permit the actual installed WaterConsole executable for Private networks/LocalSubnet. Do not disable the firewall or open all ports. |
| Server and port | Keep the app open. A busy default port can cause a different port to be selected; use the new displayed address. Look for a visible server error on the PC. |
| Fresh browser request | Try the shown `http://ADDRESS:PORT/controller` directly. If it opens, use the current manual code. Close an old tab if it still points at a previous session. |

Do not set up router port forwarding, UPnP, a public tunnel, or a Public-network firewall rule. These are not needed for local play. If the PC IP changes, choose the current interface and generate a new invitation. Restarting the app creates a new session.

## Pairing and reconnect

| Symptom | Likely cause / fix |
| --- | --- |
| “Pairing code expired or incorrect” | Invitations last two minutes. Scan the current QR or use the new code on the PC. |
| Waiting for approval | Compare the verification codes and approve the request on the **PC**. The phone cannot approve itself. |
| All four slots occupied | Remove an unused device on the PC, or wait for its reconnect reservation to expire. Closing a tab does not immediately release its slot. |
| Phone cannot navigate Home | Only the assigned navigator may navigate. Transfer navigation on the PC. Other players can still use their allowed settings/readiness. |
| Reconnected but returned to pairing | The 30-second slot reservation or session token expired, the session ended, or the app restarted. Pair again; old input must not resume. |
| Repeated requests are temporarily blocked | Wait for the rate limit to expire. Do not repeatedly refresh or automate pairing attempts. |

## Touch controls or fullscreen

| Symptom | Check / fix |
| --- | --- |
| Fullscreen did not start after scanning | Approval alone cannot guarantee fullscreen. Tap **Enter controller**. If the browser declines, use the responsive page; do not require a second app. |
| Rotation did not lock | Browser orientation lock may require fullscreen or be unavailable. Rotate the phone manually. |
| Need to tap every direction | In Controller Lab, keep the finger within the drag pad and slide between directions. If transitions fail, report browser/version, orientation, and a short video or direction sequence. |
| A button seems stuck | Release all touches, bring the controller tab back, and reconnect if needed. The input should neutralize on cancel, hidden tab, disconnect, or watchdog expiry. Stop the test/game from the PC if it does not. Report the exact transition. |
| Buttons overlap or are clipped | Reset browser zoom, check landscape/portrait and fullscreen, then report the viewport and device. Safe areas and larger text can affect available space. |
| Controller Lab moves but a custom game does not | Confirm that the adapter is running, the game is focused, the right game mode/profile is selected, and the game accepts the intended keyboard/gamepad device during gameplay. Menus can accept a different device from races or fights. |
| Two phones move one player | The adapter probably shares one device/binding set, or the game is not in its local multiplayer mode. Each player needs independent supported input. |
| A declared four-player layout shows only two players | Display layout metadata does not change a game's player limit. Verify the actual mode and join/device assignment. |

Do not “fix” input by disabling anti-cheat or bypassing login. Keep a failing custom adapter unavailable until normal supported input works.

## Vibration does not work

1. On the phone, tap **Enter controller** and open the gear → **Controller settings**.
2. Turn **Vibration** on, then tap **Test vibration**.
3. If the page says **Vibration unavailable**, the browser does not expose the needed API. Try a supported Android browser; controls still work without vibration.
4. If the API exists but Test is silent, check the phone's vibration/quiet-mode settings and browser policy. A desktop browser or emulated phone viewport cannot prove physical haptics.
5. Distinguish a touch cue from game rumble. A Test pulse or button pulse does not indicate a detected in-game collision. Native rumble requires a working adapter feedback callback and matching slot/epoch.

**Do not install a PC driver to fix phone Test vibration.** Browser feedback requires no extra phone app or driver. Optional virtual-gamepad support is relevant only to a custom native adapter that explicitly needs it. Its retired upstream driver is documented in [INSTALL.md](INSTALL.md#vibration-and-optional-native-support).

## Source and packaging problems

| Symptom | Check / fix |
| --- | --- |
| `npm`, `node`, or `git` not found | Install the developer tools listed in [INSTALL.md](INSTALL.md), then open a new terminal. Released-app users do not need them. |
| Dependency installation fails | Use Node 24.x, a stable connection, and `npm run setup` from the checkout root. Read the first actual error. Keep the lockfile; do not replace it with arbitrary package upgrades. |
| Controller says it is not built | Run `npm run build` before `npm start`. Keep the generated renderer/server assets together. |
| App cannot write settings/builds | Use a writable folder with free space. Keep the project, dependencies, cache, and output on the chosen data drive. Do not run the whole app as administrator to conceal a folder permission issue. |
| Browser e2e executable is missing | Install the browser requested by the runner or its documented Chromium fallback. Rerun the test; do not classify a missing browser as a passed UI check. |
| A cover loads in development but not after installation | Bundle the image as a local public asset and check its built URL/case. Absolute developer-PC paths will not work in a release. |
| A native bridge reports unavailable | Core has no adapters by default. For your custom adapter, use the toolkit's `--probe`, verify the selected process, helper/DLL architecture and files, and driver state. Do not install or reinstall a driver blindly. |
| Return Home leaves a custom game open | Inspect the adapter's declared stop behavior. A game may ask for confirmation; the adapter must either complete safe shutdown of its owned process or report the remaining game state. Never terminate unrelated processes. |

When disk space is low, inspect the project's `.cache`, build, and release folders before removing known regenerable outputs. Do not delete unknown system folders or shared game installations. Close the app and build processes first; keep source, lockfile, settings, and release checksums.

## Collect a useful bug report

Open [GitHub Issues](https://github.com/YogurtGen/WaterConsole/issues) with:

- Core version or commit; Setup/portable/source; Windows version and architecture.
- Phone model, OS, browser/version, orientation, fullscreen status, and number of players/slots.
- The smallest numbered steps, expected result, actual result, and whether Controller Lab reproduces it.
- Relevant error text, time of failure, and a redacted screenshot/video. For networking, mention Wi-Fi/guest/VPN setup without sharing credentials.
- For development, failing command and the first meaningful error; for an adapter, menu versus gameplay behavior and supported input device.

**Redact** live QR codes, pairing codes/nonces/ticket secrets, device/session tokens, credentials, private LAN details you do not want public, and personal file paths. Never upload game binaries, private research, or a full unreviewed user-data folder.

### Safe prompt for an AI coding agent

```text
Work in my WaterConsole checkout. Read AGENTS.md, CLAUDE.md, SECURITY.md,
docs/TROUBLESHOOTING.md, docs/PROTOCOL.md, and relevant tests.

Version/commit: [VERSION]
PC/phone/browser: [REDACTED DETAILS]
Steps: [MINIMAL STEPS]
Expected: [EXPECTED]
Actual: [ACTUAL]
Controller Lab reproduces: [YES/NO/UNKNOWN]
Sanitized error: [ERROR WITHOUT TOKENS, QR SECRETS, OR CREDENTIALS]

Reproduce or trace the failure before changing code. Preserve PC-only admin,
allowlisted semantic input, per-player independence, neutral resets, and the
existing vibration preference. Make the smallest complete fix, add a meaningful
regression test where needed, and run typecheck, tests, build, and relevant UI
checks. Do not disable security, bypass game authentication, silently install
system components, wipe settings, or rewrite unrelated integrations. Report
verified results separately from physical-device/game checks I still need to run.
```

For suspected vulnerabilities, use the reporting route in [SECURITY.md](../SECURITY.md) rather than publishing a working exploit or secrets in an ordinary issue.

## Added game or custom controller

- **Saved but not playable:** open Edit game and verify the original executable/working directory. A card or checkmark does not make an unsupported game compatible. For a launcher-owned process, choose Connect to a game I open myself and select the matching window.
- **Menus work, gameplay does not:** select the matching gamepad inside the original game. Compare the player's Menu and gameplay bindings in Studio. Confirm the PC output backend and each slot's actual device; never broadcast all phones into P1.
- **A combined action releases unexpectedly:** inspect While held, also hold… and each action's PC output for the current player/mode. The union engine preserves other held sources; reproduce in safe phone preview and check for profile/focus/connection resets.
- **Layout does not fit:** use the Studio device previews and actual phone, rotate/fullscreen, reduce controls or create a simpler mode. The fit fallback deliberately avoids clipped or microscopic controls.
- **Color differs between players:** base → mode → Navigator/Other-player → P1–P4 → selected-control overrides apply. Reset a more specific override to inherit. PC preview has its own theme; it is not the Navigator phone.
- **Artwork missing:** restore the complete library folder including images, not only catalog.json. Use Re-crop from its normalized source or replace the file. Keep cover and banner separate. A different manual ratio can leave letterboxing with Fit.
- **Native helper stopped:** controls neutralize automatically. Close the owned game normally on PC, then choose Return Home again. Do not kill unrelated games or delete their settings. Reinstall the matching app version if its helper/client is missing.
- **Restore a backup:** close WaterConsole, copy the whole library folder somewhere safe, then inspect catalog.previous.json and preserved recovery files. Do not overwrite the only copy of images or a working catalog. The app can load a validated previous catalog after corruption.

For an AI-assisted fix, include the WaterConsole version, selected mode/variant/backend, affected player slots, exact held combination, reproduction steps and sanitized errors. Omit personal paths, live invitations/tokens and commercial media. Ask it to read AGENTS.md and reproduce the issue before editing either controller route.

## Studio colors, icons, backgrounds and phone layout

- Colors: select the intended scope. **Button fill** changes a button; **Background** changes the controller canvas. HEX applies on Enter or when leaving the field; swatches/presets update live. Reset removes a local override. A role/player/control override can take precedence over the base theme.
- Controller image missing: select **This mode** or **Controller base** before adding a Background image. Use Button content for a button image. If an older draft put a background on a control, use **Use existing image as mode background** to recover it.
- Icon blank-screen fix: update to 0.4.0. The scrolling event is captured before deferred updates. If a tool fails, close it and save your draft before restarting.
- Rotation: tap fullscreen, then select the gameplay mode. If your browser declines orientation lock, rotate the phone physically and disable its system portrait lock. Safari/fullscreen behavior varies.
- Uncomfortable controls: phone gear → Adjust layout → drag/corner resize → Done. Reset + Done restores the host design for that profile/orientation. Changes only affect this browser and cannot edit PC bindings.
- Wrong game action: use Actions → Visual binding and compare the original game's Controls menu. Xbox/PlayStation labels are not fixed gameplay functions. Menu input working does not prove the game selected the same device for gameplay.

## Long libraries and controller foreground colors (0.4.1)

Use the mouse wheel directly over a game row, its left/right arrows, a trackpad or swipe. Navigator-phone directions change selection and reveal the selected card automatically. Right-click editing/deletion belongs to the PC; only Add Game entries have editable records. Delete removes the WaterConsole entry, never the installed game.

In Controller Studio, select a control → **Color & fill** → Fill/Text/Icon. Switch **Normal / While pressed** for its held state. The base **Canvas background** remains available when nothing is selected. Open **Role & player themes** for mode/Navigator/P1–P4 overrides. **Text color** changes labels and **Icon color** changes built-in glyphs/direction symbols. Their separate **Pressed…** colors apply while held. An inherited icon uses the inherited text color until overridden. Uploaded image buttons are not recolored. Use the local Preview on my phone to check the result safely.

### Store scan or missing artwork

Open Add game → Scan Steam & Epic. Only installed Windows games from recognized local manifests appear. Refresh after installing/moving a game. Multiple executables require review; Browse .exe or Choose running game remains available. An already-added title uses its existing card. If a store cannot be reached, local details still fill the setup; use your own artwork or retry importing before saving. Unknown compatibility/player counts require your own test. Imported details can be edited from the card's PC right-click menu.

### Controller collects in the center or differs from Studio

Use Controller Studio → Phone scaling → Fit to hands and select the intended Left hand / Center / Right hand anchor on controls. Group related controls. Inspect the matching phone View so the header is included. Keep composition together intentionally retains all relative spacing; full-canvas mode also preserves blank margins. On the phone, gear → Adjust layout → Reset → Done removes that browser's personal offsets without changing the host design. Refresh the phone after updating the PC app.
