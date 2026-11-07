# Release validation — Core 0.2.0

Checked on Windows x64 on 7 November 2026. These results cover the public Controller Lab edition with an empty native adapter registry.

| Check | Result |
| --- | --- |
| TypeScript contracts | Passed |
| Unit/integration tests | 49 passed across four files: server/session authorization and recovery, drag-pad sectors, haptics, and mock native adapters |
| Production build | Passed; fonts, graphics, scripts and navigation audio are local |
| Native toolkit self-test | 17 mapping/parser checks passed; no native device or third-party game opened |
| Source Electron/browser flow | 14 checks passed in Chrome |
| Packaged Windows app/browser flow | 14 checks passed against the actual unpacked executable used for Setup/portable packaging |
| Website | 11 responsive, interaction, keyboard and reduced-motion checks passed; no missing assets or console errors |
| Website sizes | Desktop 1440, 1280×720, 768×1024, 390×844 and 320×740; no horizontal overflow |
| Documentation media | Six actual-UI previews generated with simulated state; no page errors; visually reviewed |
| Public source audit | No private game integrations, personal installation paths, credential patterns, dependency caches or generated releases in tracked source |
| Production dependency audit | `npm audit --omit=dev` reported zero advisories at this check |

The complete development dependency tree still reports six moderate transitive advisories. They concern the development/build toolchain and are not included in the production-only audit result. Review compatible upstream updates; do not apply a forced major-version change without testing the release pipeline.

The packaged flow checks independent approved slots, fifth-device rejection, navigator ownership, browser multi-touch, sliding directions while holding an action, mocked Vibration/Test and bounded pulses, shared/2/4 Lab layouts, neutral return Home, reload reconnect, session end, local-resource loading, app restart persistence and server port release.

## Limits

- Browser controllers are emulated clients, not four physical phones.
- Mocked `navigator.vibrate` proves routing/preferences, not a physical vibration motor.
- Android fullscreen/orientation, Wi-Fi isolation/reliability and a sustained 30-minute RTT target need real-device testing.
- No third-party game, native gameplay compatibility or collision feedback is claimed. Optional toolkit tests created no virtual controllers.
- Setup and portable artifacts were built; a clean-machine installation without developer tools has not been separately tested. Packaged-app checks ran the bundled executable with isolated settings.
- Binaries are unsigned. The optional third-party bus driver is separately signed upstream, carries its BSD license, and was retired upstream in 2023.
- The installed core is designed for a trusted private LAN using unencrypted HTTP/WebSocket. See [SECURITY.md](../SECURITY.md).

Public screenshots are documentation fixtures marked as previews, using `example.invalid` and `PREVIEW`; they contain no active invitation. Repeat [TESTING.md](TESTING.md) after relevant changes.
