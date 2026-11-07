# Contributing

WaterConsole is an MIT-licensed local console foundation. The public core ships Controller Lab only. Please keep contributions usable without a cloud account, runtime CDN, or a commercial game installation.

## Set up

Read [AGENTS.md](AGENTS.md), [SECURITY.md](SECURITY.md), and [INSTALL.md](docs/INSTALL.md). Use Windows 10/11 x64, Node 24 LTS, and Git. Keep the checkout and its caches/builds on a drive with enough free space.

```powershell
npm run setup
npm run build
npm start
```

Use `npm run dev` while working. Follow [ADDING-GAMES.md](docs/ADDING-GAMES.md) for an integration and [CLAUDE.md](CLAUDE.md) when using Claude Code. AI assistance is welcome; you remain responsible for the change and its validation.

## Make a reviewable change

- Describe the problem and expected behavior. For a substantial feature, discuss its scope in an issue before a large implementation.
- Keep privileged desktop operations out of the LAN protocol. Preserve PC approval, four independent slots, semantic input, neutral resets, and per-phone vibration settings.
- Keep optional native adapters/tools optional. Do not silently install system drivers or add game-specific code to a generic control path.
- Use original or appropriately licensed local assets. Update [asset provenance](assets/ASSET-LICENSES.md). Do not contribute commercial binaries, extracted game assets, personal paths, secrets, or private research.
- Support safe areas, touch/keyboard input, browser fallbacks, and reduced motion. Input must be sent before decorative feedback.
- Add a regression test when a meaningful behavior or failure path changes. Avoid tests that only restate an implementation.

## Validate

```powershell
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Run the manual checks relevant to your change from [TESTING.md](docs/TESTING.md). State which browser checks, physical-device checks, packaged-build checks, and actual game tests you ran. Mark untested behavior clearly; a simulated phone does not establish vibration or native game compatibility.

A pull request should explain the concrete before/after behavior, changed contracts or dependencies, validation, and any remaining limitation. Include redacted screenshots for visual changes. Never put live pairing details in screenshots or logs.

## License

By submitting a contribution, you agree to license your original work under the repository's [MIT license](LICENSE). Third-party material must retain its required license and attribution. Report suspected vulnerabilities using [SECURITY.md](SECURITY.md).
