# Asset and third-party provenance

WaterConsole source and original project assets use the root [MIT license](../LICENSE). Third-party components retain their own licenses. This inventory describes the public core, not private game installations.

| Asset/component | Origin | License / distribution notes |
| --- | --- | --- |
| WaterConsole name treatment, mint/dark interface, inline UI SVGs, app icon | Original WaterConsole project work | MIT. `scripts/make-icon.mjs` builds the app icon. |
| `assets/public/assets/lab-world.svg` | Original WaterConsole illustration | MIT; bundled locally. |
| `assets/public/assets/lobby-devices.svg` | Original WaterConsole illustration | MIT; bundled locally. |
| Documentation screenshots in `docs/media/` | Actual WaterConsole React UI rendered with a simulated documentation fixture | MIT; no commercial game artwork, live invitation, or hardware test claim. |
| Website graphics in `docs/assets/` | Original WaterConsole website illustrations and branding | MIT unless a file's own notice states otherwise. |
| Inter and Nunito Sans font files | `@fontsource/inter` and `@fontsource/nunito-sans` packages | SIL Open Font License 1.1; required notices are collected by the build. Fonts are bundled locally. |
| Interface sounds | Synthesized by `src/renderer/sounds.ts` | Original implementation, MIT; no captured commercial audio. |
| ViGEmClient user-mode DLL | Pinned upstream artifact recorded in `assets/native/vigem/SOURCE.json` | MIT, copyright Benjamin Höglinger-Stelzer; license beside DLL. Optional native toolkit component, not a system driver. |
| ViGEmBus optional installer | Official upstream v1.22.0, provided separately in the optional tools release archive | BSD-3-Clause; include its license, provenance, hash, and retirement notice. Not required by core/phone vibration and never silently installed. |
| npm dependencies and Electron runtime | Versions locked in `package-lock.json` | Their respective licenses. `scripts/notices.mjs` collects dependency notices for distribution. |

The core includes no commercial game binaries, extracted sprites/covers, recorded game audio, launcher credentials, or proprietary website screenshots. Reference research is not a license to redistribute an asset.

When adding an asset, record its exact source/creator, license, any required attribution, local path, and modifications. Keep a copy of applicable notices. Use only material you created or have permission to redistribute. Do not rely on an external CDN at runtime.

## Optional binary integrity

`assets/native/vigem/SOURCE.json` pins ViGEmClient **1.21.231.0**, upstream commit, Windows x64 architecture, and SHA-256. The sibling `LICENSE` is part of its distribution. Check the hash before replacing the binary; update source, license, and hash together.

The optional driver archive has its own provenance and checksums. A checksum establishes file integrity relative to a published value; it does not extend upstream support or replace publisher-signature review. [ViGEmBus upstream](https://github.com/nefarius/ViGEmBus) is archived; the driver was retired in November 2023.
