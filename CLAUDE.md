# Claude Code project instructions

Read and follow [AGENTS.md](AGENTS.md) first. It is the shared instruction source for coding agents. This file adds navigation, not a second set of conflicting rules.

Before changing behavior, read:

- [README.md](README.md) and [SECURITY.md](SECURITY.md).
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/PROTOCOL.md](docs/PROTOCOL.md).
- [docs/ADDING-GAMES.md](docs/ADDING-GAMES.md) for integrations, native input, touch layout, and haptics.
- [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) for a bug, then the relevant source/tests.
- [docs/TESTING.md](docs/TESTING.md) before reporting validation.

Public branding is **WaterConsole**. The slogan is **Playing together should be free.** Product packages are **WaterConsole Core** with an isolated Core app/settings identity. Only Controller Lab ships in the public core; specialized native adapter registration is empty by default. Preserve the no-code Add Game / Controller Studio path and specialized source/AI path together. Keep optional extension tooling and browser vibration support without copying private game integrations, paths, artwork, or research.

Keep changes inside this checkout. Preserve the PC/LAN trust boundary, explicit desktop adapter registration, allowlisted semantic input, per-slot ownership, epoch/sequence checks, neutral input recovery, and the existing per-phone vibration preference/Test UI. Do not install a system driver silently or bypass game authentication/anti-cheat.

Use the repository scripts so caches and outputs stay with the checkout. Run appropriate checks, normally `npm run typecheck`, `npm test`, `npm run build`, and relevant e2e checks. Distinguish source inspection, mocked/browser tests, physical-device tests, and actual game tests. Do not label untested behavior playable, offline, or compatible.

Document the result with changed behavior, evidence, and remaining limits. Do not commit credentials, live pairing QR/nonces/tokens, personal installation paths, generated caches, dependencies, or commercial game assets.

For declarative layouts and simultaneous held actions read [docs/CONTROLLER-STUDIO.md](docs/CONTROLLER-STUDIO.md). Keep generic UserBridge v2 separate from specialized adapters, and use the existing held-source union/recovery engine.
