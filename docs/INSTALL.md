# Installation and downloads

WaterConsole Core targets **Windows 10/11 x64**. The PC displays the console and runs the local server. Phones open its controller page in a browser on the same trusted private network.

## What to download

| You want to… | Download or install | Already included / unnecessary |
| --- | --- | --- |
| Use the console and Controller Lab | The **Setup** `.exe` or **portable** `.zip` from [WaterConsole Releases](https://github.com/YogurtGen/WaterConsole/releases/latest) | Electron/runtime, local server, interface, fonts, art, sounds, and phone controller are bundled. No Node.js, Git, or phone app. |
| Connect a phone | A current Android Chrome browser; the phone's built-in QR scanner or camera | No controller APK or cloud account. Another browser can work, with API limitations. |
| Build or modify the console | [Git for Windows](https://git-scm.com/downloads/win), [Node.js 24 LTS, Windows x64](https://nodejs.org/en/download), and this repository | npm comes with Node.js. `npm run setup` installs the locked project dependencies, including Electron. |
| Run automated UI checks | Developer setup, then the browser selected by `scripts/e2e.mjs` | Browser testing does not replace tests on real phones. |
| Ask Codex or Claude Code to add a game | One optional AI coding tool and its own account/authentication | Neither AI tool is required to run WaterConsole. See [ADDING-GAMES.md](ADDING-GAMES.md#use-codex-or-claude-code). |
| Develop a Windows virtual-gamepad adapter | The optional native toolkit and, if the adapter requires it, ViGEmBus | Core ships no native adapters and does not automatically install a driver. Browser touch vibration needs neither. |

The initial download and source dependency installation require internet. Once installed, the core's Home, pairing, and Controller Lab operate locally. Future games, launchers, updates, and optional AI services may have their own internet requirements.

## Install the released application

1. Open the [latest release](https://github.com/YogurtGen/WaterConsole/releases/latest). Download the Windows x64 Setup installer or portable ZIP, plus its published checksum file.
2. Compare the SHA-256 hash with the release checksum before opening the download:

   ```powershell
   Get-FileHash -Algorithm SHA256 -LiteralPath 'E:\Downloads\WaterConsole-Core-Setup-0.2.0-x64.exe'
   ```

   Adjust the path to the file you downloaded. A matching hash detects a changed download; it is not a publisher signature.
3. For Setup, choose an installation folder with enough free space. For portable, extract the **entire** ZIP into a writable folder; keep its files together.
4. Launch WaterConsole Core. Keep a trusted home network set to **Private** and permit this app on Private networks if Windows asks. Do not disable the firewall.

An unsigned build may show a Windows reputation warning. Check the download origin and release hash. The project does not claim a paid code-signing certificate.

WaterConsole Core has its own application ID and settings profile, separate from private/custom builds. It starts with Controller Lab; it does not import another installation's game collection.

## Connect your phones

1. Connect the PC and phone to the same Wi-Fi/router or private hotspot. Internet access is not required for Controller Lab.
2. In the PC lobby, check the selected LAN IPv4 address. Avoid `127.0.0.1`, VPNs, and virtual adapters. Use the network selector if the suggested adapter is wrong.
3. Scan the **current** QR code. Alternatively, open the shown address in a phone browser and enter the current pairing code.
4. Enter a player name. Compare the phone's verification code with the request on the PC, then approve that device on the PC.
5. Tap **Enter controller** on the phone. This user action requests fullscreen. If fullscreen or orientation lock is unavailable, keep playing in the responsive browser view.
6. Open Controller Lab. Repeat for up to four phones. The PC can transfer navigation, remove a player, lock pairing, or end the session.

The default server port is `8787`; a busy port may cause a different port to appear. Always use the displayed address. QR/code invitations expire after two minutes. A disconnected device retains its slot for up to 30 seconds when its session token remains valid.

If a phone loads slowly or cannot connect, start with the [LAN checklist](TROUBLESHOOTING.md#phone-will-not-connect-or-keeps-loading).

## Vibration and optional native support

### Phone feedback: no extra install

On the phone, tap **Enter controller**, open **Controller settings** using the gear, turn **Vibration** on, and tap **Test vibration**. The preference belongs to that phone/browser. Touch cues are short pulses; they are not proof that a game detected a hit or collision.

This uses the browser's [Vibration API](https://developer.mozilla.org/en-US/docs/Web/API/Vibration_API). Support depends on browser, phone hardware, OS settings, and user interaction. A browser may expose the API while declining to vibrate. Unsupported browsers keep working with **Vibration unavailable**. No separate phone app, driver, or desktop helper is needed for these cues.

### Native gamepad and game rumble: optional developer path

The optional Windows toolkit is for adapters that create independent Xbox-compatible virtual controllers. It contains a generic bridge, its source, and the pinned **ViGEmClient** user-mode library and MIT license. It is not an adapter for an arbitrary game.

The separate **optional native tools** release ZIP contains the upstream **ViGEmBus 1.22.0** installer, its BSD-3-Clause license, provenance, and SHA-256 checksum. The [upstream project](https://github.com/nefarius/ViGEmBus) is archived and the driver was retired in November 2023. Evaluate it before installing a system-level component; it is unnecessary for Controller Lab or phone vibration.

If an adapter you intentionally build needs it:

1. Read the toolkit's instructions and the [official release notes](https://github.com/nefarius/ViGEmBus/releases/tag/v1.22.0).
2. Verify the installer checksum and inspect its Authenticode signature. The expected publisher is **Nefarius Software Solutions e.U.**.
3. Run the installer deliberately on the PC and respond to Windows administrator/UAC prompts. The app never installs it silently. Reboot if requested by the installer.
4. Use the toolkit's `--probe` command to check availability before attaching an adapter. A missing driver must produce a clear error, not a false “ready” state.

Native rumble needs the game to produce controller feedback, the adapter to receive the correct controller's callback, and WaterConsole to route bounded feedback to the matching phone. A driver alone does not add vibration to a game. See [ADDING-GAMES.md](ADDING-GAMES.md#haptics).

## Developer setup

Choose a checkout on a drive with enough space. These commands use `E:\Projects`; change it to your preferred development folder.

```powershell
Set-Location E:\Projects
git clone https://github.com/YogurtGen/WaterConsole.git
Set-Location WaterConsole
node --version
npm --version
git --version
npm run setup
npm run build
npm start
```

Use Node.js **24.x LTS** for the documented toolchain. `npm run setup` uses the lockfile. It does not install optional AI tools or system drivers. The base TypeScript/Electron app does not require Visual Studio or a native C++ build environment.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Build/watch and open the development application. |
| `npm run build` | Compile the local host, controller, server, and build notices. |
| `npm start` | Open an already built application. |
| `npm run typecheck` | Check TypeScript contracts. |
| `npm test` | Run unit/integration tests. |
| `npm run test:e2e` | Run the Electron/browser suite. |
| `npm run pack` | Create an unpacked Windows application. |
| `npm run dist` | Create the Windows Setup and portable packages. |

Keep the `build`, `dist`, and `releases` output on the same drive as the checkout. The repository wrapper routes its npm, Electron, builder, temporary, and browser caches under `.cache`; do not copy `node_modules`, caches, or build products into Git. Windows and third-party installers may still maintain their own system files outside the project.

The optional native toolkit uses the Windows .NET Framework x64 C# compiler at `%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe`. If it is absent, install the appropriate Microsoft .NET Framework developer tooling or leave native tooling unbuilt; the core build remains available. See `toolkit/native/README.md`.

```powershell
npm run build:native
npm run test:native
```

The native self-test checks mapping/protocol logic without creating gamepads or launching games. `npm run tools:download` separately fetches and verifies the pinned official driver installer into the project's local tools area; it does **not** run the installer. Neither downloading nor building the toolkit makes it a registered game adapter. Do not make an optional driver a requirement for a clean core build.

### Browser checks

The e2e runner uses installed [Google Chrome](https://www.google.com/chrome/) by default. If Chrome is unavailable, install the Playwright Chromium fallback using the commands in [TESTING.md](TESTING.md#automated-checks) rather than skipping the test. See [TESTING.md](TESTING.md). A desktop browser with a phone viewport validates layout and protocol behavior; it cannot validate physical haptics or Android fullscreen.

## Updating and uninstalling

Keep your downloaded release checksums with the package. Close the app before updating, then use the new installer or extract a new portable folder. Settings belong to the Core profile. Copy only settings you understand; never share pairing/session state between running instances.

Uninstall the desktop app through Windows Settings, or remove an extracted portable folder after closing it. Optional system drivers have their own Windows uninstall entries and lifecycle; removing WaterConsole does not automatically remove a driver used by other software.

