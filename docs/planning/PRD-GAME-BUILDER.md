# PRD — Game Library Builder and Controller Studio

**Status:** Implemented baseline for Core 0.3.0. This document retains the broader design targets; see [the shipped feature guide](../CONTROLLER-STUDIO.md) and [validation/remaining limits](../releases/0.3.0.md) for the exact release scope.

**Document version:** 0.1 · 7 November 2026.

**Baseline:** WaterConsole Core 0.2.0; source baseline `6d01b08`.

**Release milestone:** 0.3.0. Physical-device and first-time usability targets remain separate manual validation.

**Product language:** English. Local operation, no PHP, no AI subscription required.

## 1. Product outcome

A PC owner can add an installed game, design its library presentation, configure its phone controls, and test them entirely inside WaterConsole. No source editing, Node installation, paid AI account, or cloud service is required for the installed application.

Two connected workspaces:

- **Game Library Builder:** choose the original executable, write a title/description, add tags, upload and crop artwork, select player/display capabilities, and manage the entry.
- **Controller Studio:** start from a usable preset or customize controls, colors, shapes, icons/images, positions, sizes, modes, input bindings, combined actions, and responsive layouts.

Adding an executable and making its controls work are separate steps. Show the difference between a saved entry, configured controls, and gameplay actually tested by the owner. Never promise that every executable accepts synthetic input, supports multiple players, runs offline, or supports split-screen.

### Success targets

Proposed targets, not measured results:

| Outcome        | Target                                                                                                                                             |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Simple setup   | At least 4 of 5 first-time testers configure a compatible single-player game within 10 minutes without code/AI help; record sample/device details. |
| Customization  | Move/resize a button, change appearance and configure a two-output hold without technical documentation.                                           |
| Recovery       | No held input/vibration survives cancel, lost capture, focus/connection loss, profile change, helper failure or watchdog expiry.                   |
| Responsive fit | Every control stays inside the usable supported viewport; no silent clipping, hidden actions or stretched circular controls.                       |
| Ownership      | All game data/art/profiles remain local. Core setup/edit/play works offline after required components are installed.                               |
| Distribution   | Packaged Setup/portable can create, reopen, edit and launch a user entry without a development checkout.                                           |

## 2. Current state and necessary change

Current Core supplies Controller Lab, fixed `GAMES`/`PROFILES`, a restricted `HostBridge`, and an empty developer-native-adapter registry. Its generic helper maps digital directions/fixed semantic buttons. It is **not** an existing no-code catalog or full analog engine.

This proposal needs a persistent user catalog, declarative controller schema, binding engine, configurable PC adapter, continuous analog transport and restricted desktop import/edit IPC. Changing cards alone is insufficient.

Current accents follow **P1–P4**, not host/guest status. The **host is the PC**; the approved phone with menu control is the **Navigator**, which can move between players. Add Navigator/Other players styling without changing permissions.

## 3. Scope and priorities

P0 is the complete first release of this proposal, implemented in milestones.

| Priority       | Scope                                                                                                                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P0 · Library   | Local `.exe`; metadata/tags; separate cover/banner; non-destructive crop; edit/duplicate/remove/relink; honest setup/test states.                                                          |
| P0 · Controls  | Standard gamepad; Xbox/PlayStation label styles; Menu/Fight/Race; buttons, analog sticks, draggable cross D-pad and triggers/sliders; per-player binding inspection; simultaneous actions. |
| P0 · Studio    | Drag/resize, shapes, grid/snap, alignment/distribution, undo/redo, phone preview, role/player colors, icons/text/images, responsive fitting with compact/portrait fallbacks.               |
| P0 · Runtime   | Foreground/process checks, separate supported devices, constrained keyboard mappings, recovery, vibration, guided testing and normal stop.                                                 |
| P1             | Shareable configuration/preset import/export, extra modes/variants, reusable user templates, advanced analog curves, batch library management.                                             |
| Later research | Additional native backends, actual non-XInput device emulation, supported launcher shortcuts and game-specific scene/event detection.                                                      |

Exclude bundled commercial games/art, cloud accounts, phone executable uploads, authentication bypass, forced split-screen, arbitrary scripts/plugins, unattended macros/turbo and automatic driver installation.

## 4. Home UI and information placement

Keep mint/dark gray, card selection lift, navigation sounds and existing console hierarchy.

```text
WaterConsole               P1 P2 P3 P4   Add phones   Fullscreen   Settings
SELECTED GAME DETAIL
Title                        | User's banner / hero image
1–4 players · Connection     | Separate crop and destination preview
Genre / setup status         |
Description                  |
[Start game] [Connect phones] [⋯]
Shared screen · Controller profile · Test status

Your local library       [+ Add game] [All Favorites Recent] [Search]
[Filter: Tags / Players / Connection / Setup status] [Clear filters]
[Controller Lab] [User game] [User game] ...
```

- **Add game** is a persistent PC button beside library controls, plus an empty-state action. Never bury it in Settings.
- At 1280×720, put search/filters on a second row instead of shrinking primary actions; keep the row compact at 1920×1080.
- Detail overflow: **Edit game, Controller Studio, Test controls, Duplicate setup, Locate executable, Remove from library**. Removal never uninstalls/deletes the original game.
- Title, player count, connectivity, description, hero image and cover are independently editable: these are the regions highlighted in the owner's reference.
- Cards show cover, favorite, title, player count and at most two useful badges. Extra tags stay in details.
- Protect built-in Controller Lab from executable replacement/removal. Only PC can edit/import/remove/open Studio. Phones cannot administer the library.

### Tags and readiness

| Field        | Values / behavior                                                                                                            |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Connectivity | Offline / Online / Offline & Online / Not specified; owner-declared until tested, never inferred from installation location. |
| Players      | 1–4 slots, constrained by the real game/mode. Four phones do not imply four supported players.                               |
| Display      | Shared / Split into 2 / Split into 4. Tags do not split a native game.                                                       |
| Genre        | Fighting, Racing, Party, Platformer, Puzzle, Sports, Adventure, Shooter; custom tags supported.                              |
| Input        | Gamepad / Keyboard, separate from visual Xbox/PlayStation style.                                                             |
| Setup        | Draft / Needs setup / Ready to test / Tested by you. Missing file/component is a separate blocking reason.                   |

Record launch, menu, gameplay, tested players and offline launch separately, with date/notes. A driver probe is not a gameplay test. Executable/binding changes invalidate affected checks; artwork edits do not. Saving or explicitly launching an unverified entry never falsely marks it tested.

Defaults: title 120 characters, description 2,000, 12 tags of 24 characters. Escape text, normalize duplicate tags, reject HTML. Search title/description/tags. Filters combine with All/Favorites/Recent and offer Clear filters.

## 5. Add Game wizard

Large desktop workspace: left step list, central fields, live library preview. Preserve drafts between steps.

| Step               | Content                                                                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Game**        | Browse `.exe`, title, file status, optional trusted working directory. Selection does not launch. Safe filename-based title guess stays editable. |
| **2. Details**     | Description, tags, connection, players, shared/split modes, optional instructions for reaching local multiplayer.                                 |
| **3. Artwork**     | Independent Cover/Banner uploads; crop/reposition; actual card/detail preview; Fit/Fill; original placeholder when skipped.                       |
| **4. Controller**  | Standard/Custom; template, label style, input method, player assignments; open Studio without losing the draft.                                   |
| **5. Test & save** | Readiness, phone preview, explicit launch, separate menu/gameplay checks. **Save & test**, **Save for later**, **Back**.                          |

Edit uses the same workspace. Save commits a valid atomic revision; Cancel leaves the published entry unchanged. Keep a bounded autosaved draft for crash recovery and explain discarding unsaved work. Active-game changes stay draft until input is paused and a new revision is explicitly applied.

For launcher/bootstrap programs, provide PC-only **Select running game** to approve the actual gameplay process/executable. Never inject into an arbitrary launcher or every child process. Launcher support is a separate capability; direct `.exe` launch does not bypass sign-in.

## 6. Artwork import and crop

Cover is the library tile; Banner is the large selected-game image. Cropping never overwrites the reusable source.

- Required aspect presets, explicitly **width:height**: **1:1, 1:3, 3:4, Free crop**. Label 1:3 Tall to distinguish it from 3:1.
- Also offer Original, 2:3, 16:9 and 3:1 for covers/banners. Never force these choices.
- Pan, zoom, crop handles, numeric aspect/dimensions, reset, 90° rotate, keyboard nudge and unlockable aspect in Free crop.
- Show the chosen crop and its actual destination. The current card frame is not inherently 3:4; use the real component dimensions.
- **Fit** preserves the complete crop with a themed backdrop; **Fill** has a separately adjustable focal point. No silent recropping or stretching.
- Normalize orientation, strip metadata, preserve a safe normalized source, store coordinates and generate derivatives asynchronously. Reopening restores the crop.
- PNG/JPEG/WebP; initial limits 25 MiB and 32 megapixels. Validate signature/type/dimensions before expensive decoding; useful invalid/oversized-file errors. No SVG/animated uploads in P0. One large image job at a time with cancel/progress.
- Button images use the same safe pipeline at 5 MiB / 8 megapixels. No remote image URL or CDN required.
- Copy assets into managed data outside installation/resources/repository. Moving/deleting the source image or updating the app must not break artwork. Removing an entry never deletes source images/executables.

## 7. Standard controllers, modes and output

Three distinct, plainly labeled choices:

| Choice           | Example                            | Meaning                                                     |
| ---------------- | ---------------------------------- | ----------------------------------------------------------- |
| **Label style**  | Xbox / PlayStation / Custom labels | Phone appearance; does not select a native emulated device. |
| **Layout**       | Standard / Fight / Race / Custom   | Visible controls, ergonomics and mode actions.              |
| **Input method** | Virtual gamepad / Keyboard         | What the original PC game receives.                         |

Initial virtual output is a compatible Xbox/XInput-style device when its backend is available. PlayStation labels do **not** promise a virtual DualShock/DualSense, adaptive triggers or native compatibility.

| Template | Starting layout                                                                                                                   |
| -------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Menu     | Directional control, Confirm, Back, Start/Pause; Navigator handles global menu actions.                                           |
| Standard | Two sticks, D-pad, face buttons, shoulders/triggers, Start/Back and compact alternative.                                          |
| Fight    | Movement left; frequent Light/Heavy/Jump/Dodge/Throw-style actions right. All labels/bindings editable; no assumed game defaults. |
| Race     | Steering left; large acceleration/drift right; boost/skill/rear-view secondary; Classic and Assisted variants.                    |

PC or authorized Navigator switches modes explicitly; no automatic scene-detection claim. Each player may choose an allowed handedness/layout variant. Menu/gameplay bindings can differ. Neutralize before applying a mode/profile change.

Choose/record keyboard bindings on PC; phone stays gamepad-shaped. Disjoint P1/P2 keys work only where the game accepts them; one OS keyboard is not four independent devices. Block OS escape/task-management shortcuts and arbitrary commands. Elevated games can reject lower-integrity input: diagnose, never auto-elevate the application.

Virtual-device installation/backend readiness is explicit. The current optional bus is retired upstream. A stable general-purpose release must resolve a supportable backend strategy or clearly isolate/label the legacy option. Add Game, artwork, Lab and keyboard-capable setup remain available without a virtual-device driver.

## 8. Controller Studio workspace

```text
← Game / Studio            Menu | Fight | Race | + Mode   Undo Redo Save
CONTROLS           LIVE PHONE CANVAS                     INSPECTOR
Button             [Portrait/Landscape] [Device size]     Selected: Drift + gas
Analog stick       [Navigator/Player] [P1 P2 P3 P4]        Appearance | Action
D-pad +            [safe-area / touch bounds]             Shape / Size / Position
Trigger / slider                                         Icon / Text / Image
Label / spacer     drag · resize · align · distribute     Colors / States
Groups / layers                                          While held:
                   [Grid] [Snap] [Spacing: 8]             Accelerate + Drift
                   [Preview on phone] [Test in game]      Press feedback
```

Start from a usable preset. Palette drag creates controls; select, move and resize with handles or inspector numbers. Multi-select, group/ungroup, duplicate, delete, lock, align edges/centers and distribute spacing. Keep a layers list for overlapping/hidden objects.

Undo/redo at least 50 edits, including bindings/appearance. Text-field undo stays local. Keyboard nudge: one logical pixel, modifier for larger movement. Name edit actions clearly; Restore template is reversible. Switching modes/previews never silently discards drafts.

**Edit** selects controls and emits no game input. **Preview** shows simulated values. **Test in game** is separate, explicitly activated, with approved phone and matching foreground process. The connection/settings/mode/return safety toolbar sits outside the editable canvas and cannot be deleted or covered.

### Controls, shapes and gestures

| Control           | Required behavior                                                                                                                                                |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Button            | Hold or tap, independent pointers; release on lift/cancel.                                                                                                       |
| Analog stick      | Continuous X/Y, dead zone, fixed/floating center, return to center, clamped travel, independent pointer. Digital direction output must not pretend to be analog. |
| Cross D-pad (`+`) | Continuous slide across directions, 4-way/8-way, center dead zone, 8-way diagonals, neutral on cancel. No repeated taps needed.                                  |
| Trigger / slider  | Continuous 0–1 with clear rest/release value and safe target.                                                                                                    |
| Label / spacer    | Decorative; cannot create a hidden input target.                                                                                                                 |

Shapes: **circle, square, triangle, rounded rectangle**, plus useful pill/ellipse variants. Triangle direction and corner radius adjustable where applicable. Shape does not change binding. Show visual and touch bounds separately: a triangle/image still needs a usable hit target. Default at least 48 CSS pixels; warn below 44 and prevent unusable/invisible published targets in supported layouts.

Regular buttons may join **Slide between buttons**: sliding transfers to the new button and releases the previous; leaving the group releases. Default buttons keep original ownership until release, so crossing unrelated Boost cannot accidentally trigger it. D-pad/analog drag is independent. Lost capture/cancel ends the gesture; moving an old pointer cannot re-arm it.

### Grid and alignment

- Separate **Show grid** and **Snap to grid**; both may be off. Default 8 logical pixels; presets 2/4/8/12/16/24/32/64 and a custom value from 1–128.
- Move and resize snap to the same logical grid, independent of editor zoom/device pixels. Show centerlines, alignment guides and distances.
- Align left/center/right and top/middle/bottom; distribute equal horizontal/vertical spacing. Moving groups preserves internal positions.
- Safe-area/minimum-target guides are independent of grid. Snap cannot put a control outside valid bounds.
- Temporary free-move modifier bypasses snap. Numeric fields work with guides off. Guides are editor aids, not part of the saved gameplay image.

## 9. Colors, roles, icons, text and images

The complete appearance editor is P0.

| Scope          | Editable properties                                                                                                                |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Controller     | Background color, local background image, panel colors, opacity, spacing. Never cover the safety toolbar.                          |
| Button         | Fill, border, text/icon tint, border width, shape/radius, width/height, opacity.                                                   |
| States         | Normal, pressed/held, disabled, keyboard focus; preview each.                                                                      |
| Analog / D-pad | Base, knob, marks, active sectors, border, dead-zone visualization.                                                                |
| Roles          | **Navigator** and **Other players**, plus per-P1/P2/P3/P4 overrides.                                                               |
| PC host view   | Separate host-preview/theme controls and player badges; not another phone controller. Global app chrome retains readable defaults. |

Precedence: built-in defaults → game base → active mode → role override → player-slot override → owner-permitted personal preference → transient interaction state. Show where an inherited value comes from; Reset/Use inherited is always available. Navigator transfers its role style without changing identity color or bindings. Always show number/name/role text: permissions cannot rely on color alone.

Color picker, HEX/opacity, saved swatches, role/state preview, copy/paste style, reset and contrast warnings are required. Do not silently replace selected colors. Full-color uploads retain pixels; optional monochrome-mask tint is not guaranteed recoloring of arbitrary images.

Every button supports **Icon only, Icon + text, Text only, Custom image**; image mode may add a caption. Icon/image size, label size, padding, placement/alignment are independent from target size. Images offer Fit/Fill/crop and optional pressed image; otherwise use normal pressed styling. Icon/image-only controls still have an accessible action name.

### Offline icon library

Search categories, Gaming favorites, recent/favorites, outline/filled variants and aliases such as inventory/bag, gas/throttle/accelerate, boost/drift and arrow. Icon selection changes appearance only, never the binding.

Primary candidate: **Tabler Icons**. The official index at the recorded commit contains 5,203 outline and 1,054 filled icons under MIT. Plan a pinned searchable offline catalog, with curated results first and virtualized/lazy local chunks. Load only selected icons on a phone. Measure the final package/memory budget before release. [Verified IDs and source research](CONTROLLER-ICON-CATALOG.md).

Categories cover inventory, racing, movement, combat, health/items, interactions, camera, menus, multiplayer and status. Fuel is not acceleration: provide a pedal for throttle and pump for fuel. Precise missing symbols such as Drift need original MIT pictograms, not extracted game icons or misleading aliases.

Preserve icon provenance/licenses. No runtime CDN. Trusted catalog SVGs are validated at build time; arbitrary user SVG/HTML/script uploads remain outside P0.

## 10. Combined actions and safe behavior

Plain-language setting: **While this button is held, also hold…**. A racing control can hold **Accelerate + Drift** immediately and release both on lift/cancel. This is simultaneous held input, not a timed macro.

Offer per-phone **Classic** (separate) and **Assisted** (combined) variants, with a visual explanation. Owner can allow players to choose independently; both stay editable.

Compute the union/reference count of active sources per player/output. One finger holding Accelerate plus another holding Accelerate + Drift means releasing the combo stops Drift, but **Accelerate remains until its other source releases**. Apply the same rule to shared keyboard outputs across players. Opposite digital directions neutralize; analog merging is bounded/documented; trigger contributions use the maximum. Never silently use last-event-wins.

Default momentary hold and bounded tap; at most eight simultaneous outputs per control. No loops, scripts, hidden repeat, delayed key sequences or unattended play in P0. A future latched action requires a visible on-state and mandatory safety resets.

Send input before animation/vibration. Binding/mode/variant changes first neutralize affected players, advance the appropriate revision and require fresh valid state. Purely personal appearance edits must not interrupt unrelated players; separate appearance revisions from binding revisions.

## 11. Phone sizes and preventing cropped controls

Do not stretch absolute coordinates independently by width/height. Use **visual viewport minus safe-area insets, browser chrome, permanent toolbar and status banners**.

1. Save logical design space, anchored groups (left/right/center, top/bottom), relative offsets, size constraints and variants. Uniform scaling preserves shapes/stick travel.
2. Prefer responsive groups; reposition anchors/adjust gaps before shrinking targets. Labels wrap inside their own reservation and cannot push controls outside bounds.
3. Every preset includes tested landscape, compact-landscape and portrait variants. Custom layouts get generated fallbacks the owner can inspect/adjust; publishing requires an acceptable fallback.
4. When the primary layout cannot fit with usable targets, select its compact/portrait variant and explain. Never hide overflow or require gameplay scrolling. If even supported minimums cannot fit, show an actionable fit/rotate state with Back/Settings available, not a partly cropped controller.
5. Recompute after rotation, visual-viewport change, fullscreen, address-bar movement, split-view and text-size changes. Neutralize before structural reflow; require fresh touches afterward.

Proposed envelope: at least 320 CSS pixels wide and 240 usable CSS pixels high. Validate 320×568 portrait, 568×320 landscape, 360×640, 640×360, 390×844, 844×390, 412×915, 915×412 and tablets, with notch/bottom-gesture insets. These are release targets, not claimed tested devices.

Studio includes viewport presets/custom dimensions, safe-area toggles, orientation/fullscreen simulation, role/player preview, actual CSS target sizes, clipping/overlap diagnostics and **Preview on my phone**. That sends only a sanitized draft to an approved preview phone; editing stays on PC, and draft preview cannot inject gameplay input.

## 12. Test, launch, stop and feedback

Guided checks: file/components → Lab preview → explicit launch → menu directions/confirm/back → gameplay/held combinations → independent supported players → focus/cancel/disconnect reset → normal stop. Record mode/player count/binding revision. Include notes for required in-game controller selection. Menu success does not prove gameplay.

Device setup reports actual Windows/XInput assignments, conflicts and unavailable slots; never rearrange unrelated physical devices. Extra unsupported players are spectators. Preserve a disconnected logical slot for 30 seconds and neutral input; measure native device reconnect behavior rather than assuming it.

**Stop game & return Home** requests normal close for an owned process and waits for exit. Pending native dialogs/slow shutdown retain usable menu controls and clear status. A close request alone is not successful exit. Attached user-opened processes use **Disconnect controllers & return Home**, explaining the game stays open. No forced kill or generic automated Yes-clicking.

Reuse each phone's **Vibration / Test**. Select bounded press feedback or real rumble when available; browser/user-activation limits remain. A touch pulse is not a detected collision. Do not offer fake event haptics when no adapter event exists. Test feedback targets only approved preview players and stops on focus/visibility/session change.

## 13. Data, protocol and trust boundaries

Proposed records, not current shipped types:

| Record                 | Contents                                                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `LocalGameRecord`      | Opaque ID, metadata/tags, players/display capabilities; references to launch/art/profile; separate setup/test states.                |
| `LaunchConfig`         | PC-only executable, working directory, structured arguments, approved gameplay identity, ownership/stop policy. Never sent over LAN. |
| `ArtworkRecord`        | Managed normalized source/derivatives, crop/aspect/focal/Fit-Fill and content hashes.                                                |
| `ControllerDefinition` | Version, stable control/action/mode IDs, layouts, role/player themes, assets, variants. No executable code.                          |
| `BindingProfile`       | Private per-mode/per-player semantic-action → allowlisted key/device outputs, combined rules and revision.                           |
| `CompatibilityReport`  | Owner declarations and dated checks against executable/binding revision; no fabricated universal rating.                             |

Load built-in Lab plus valid local entries into one authoritative catalog. Host/phones use sanitized snapshots, not separate hard-coded lists. A reviewed **UserConfiguredAdapter** runs validated data through fixed keyboard/gamepad transports. Never load arbitrary JS/DLL plugins from imported templates. Trusted developer adapters can coexist.

The current protocol/helper cannot carry arbitrary controls or continuous sticks unchanged. Design a versioned update before implementation: epoch, sequence, profile/binding revision, complete pressed control IDs and bounded declared analog values. Server resolves active-schema semantic actions; PC resolves private mappings. Reject unknown IDs, nonfinite/out-of-range axes, duplicate controls, stale revisions and oversized frames. Preserve 8 KiB payload limit, immediate changes, 100 ms snapshots and 300 ms watchdog.

Initial bounds: 64 controls, 8 analog controls, 8 outputs per control, 8 modes, 4 players. Unsupported schemas fail safely with reload/update guidance. Personal variants need revision handshake; never reinterpret an old held frame as a new action.

### Desktop-only import/storage

- Restricted typed IPC, native dialogs and opaque handles. No general filesystem/shell capability in renderer. Revalidate executable before launch; block recursive WaterConsole launch.
- Spawn approved executable/argument array with no shell. Default arguments empty; advanced arguments edited as separate values. Scripts/batch/shortcuts are not silently accepted as executables.
- Keep foreground/gameplay-process identity checks. Never broaden injection to all windows to solve a launcher problem.
- Atomic saves, recovery/backups, versioned migration/rollback. Preserve library/favorites/recent after upgrade.
- Data directory can be chosen/moved through PC settings to a drive with space. Assets stay outside ASAR/source. Upgrades/uninstall preserve library data unless owner explicitly deletes it.
- Custom controller-image downloads require approved-device authorization and active asset/revision allowlisting. Opaque IDs, never paths. PC-only covers/launch details are not public LAN files.
- Preserve CSP, sandbox, Host/Origin checks, rate limits and approval. Labels/assets/config cannot insert HTML, scripts, arbitrary CSS or traversal.

P1 export excludes executables, private paths/arguments, tokens, device identities and captures. Artwork optional/off by default; owner chooses what can be shared. Import stays inert until reviewed/validated and bound to a local executable. Bound archive entries/uncompressed size; reject traversal/symlinks/unknown versions. Never silently replace a working profile.

## 14. Architecture work map

Suggested modules, names subject to implementation review:

| Area              | Change                                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------- |
| `src/shared/`     | Versioned catalog/controller schemas, capabilities/status, public projection, migrations.                     |
| `src/electron/`   | Library store, import/crop service, dialogs/IPC, process supervisor, configurable adapter, backend readiness. |
| `src/renderer/`   | Add/Edit wizard, Crop editor, Studio canvas/inspector, icon/theme pickers, diagnostics.                       |
| `src/server/`     | Dynamic catalog/profiles, revisions, semantic routing, authorized controller assets.                          |
| `toolkit/native/` | Configurable mappings, true axes/triggers, output union, watchdog, rumble callbacks.                          |
| `assets/`         | Pinned icon pack, original missing pictograms, template art, complete notices/provenance.                     |
| `docs/`           | User setup, Studio cookbook, accessibility, components, troubleshooting, measured validation.                 |

A PC-selected key binding never gives phones permission to send raw Windows keycodes. Preserve that boundary while extending contracts.

## 15. Milestones and GitHub release gates

| Milestone                   | Outcome / gate                                                                                                                                                                   |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **M0 · Design/feasibility** | Review PRD/wireframe; prototype dynamic catalog/schema; demonstrate supported transports without unrelated games. Resolve backend/migration risks.                               |
| **M1 · Library/artwork**    | Add/edit/relink/remove, metadata/tags, every crop ratio, persistent packaged assets and safe imports.                                                                            |
| **M2 · Studio/appearance**  | Templates, shapes, analog/D-pad, drag/resize, grid/alignment, label modes, icon/image picker, role/player colors, responsive fit and phone preview. Preview emits no game input. |
| **M3 · Input/recovery**     | Keyboard/gamepad output, continuous analog, simultaneous holds, variants/modes, guided testing, independent slots, focus/watchdog/stop/haptics recovery.                         |
| **M4 · Preview release**    | Versioned GitHub prerelease with Setup/portable/source/checksums, limitations and real-device feedback.                                                                          |
| **M5 · Stable release**     | All P0 gates and supported-device/backend checks pass; migrations, clean-machine and offline-core tests complete. Update README/screenshots/site to shipped behavior only.       |

Do not replace the current release or advertise this proposal as available. GitHub docs remain **Proposed**; a stable 0.3 needs these gates. A UI-only prototype is not a finished integration system. Existing releases remain intact. No proprietary game entries/artwork enter public source/installers.

## 16. Acceptance criteria

| ID  | Evidence required                                                                                                                                                                             |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A01 | Owner adds executable, edits highlighted metadata/art/tags, saves/restarts and gets the same entry. Cancel preserves active data.                                                             |
| A02 | Cover/banner/button crop restores 1:1, 1:3, 3:4 and Free. Fit/Fill match packaged components, including Unicode/spaced paths.                                                                 |
| A03 | Assets survive original-file deletion/upgrades. Invalid/oversized images fail without freeze, unsafe decode or unrelated changes.                                                             |
| A04 | Label style/output stay separate; missing driver and rejected keyboard/gamepad input have useful diagnostics.                                                                                 |
| A05 | Menu/Fight/Race mappings are independently tested in menus and gameplay.                                                                                                                      |
| A06 | Steer + combined drift/gas works with two fingers; releasing a combo does not release another active gas source. Cancel/variant change leave no stuck output.                                 |
| A07 | Role/player themes and normal/pressed/disabled/focus states persist; Navigator transfer preserves identity/bindings/permissions correctly.                                                    |
| A08 | Icon-only, icon+text, text-only and custom images retain accessible names. Picker search/recent/favorites and selected art work offline.                                                      |
| A09 | Required shapes resize/position predictably. Analog is continuous; D-pad/action-slide groups change direction/button without repeated taps.                                                   |
| A10 | Grid/snap independent; spacing consistent across zoom; alignment/distribution/group/undo restore exact positions.                                                                             |
| A11 | Viewport matrix/notches/fullscreen/rotation/larger text show fully contained usable controls or actionable fit fallback, never hidden clipping or gameplay scrolling.                         |
| A12 | Four real approved phones test supported independent slots; fifth rejection, nonconsecutive players, focus loss and 30-second reconnect stay safe. Separate physical evidence from emulation. |
| A13 | Draft preview cannot inject; unapproved phones cannot edit/input. Reject invalid IDs/revisions/imports, hostile paths and LAN executable requests.                                            |
| A14 | Owned stop waits for exit; confirmation dialogs keep menu controls; attached user processes are not killed.                                                                                   |
| A15 | Vibration preferences, touch cues and actual rumble remain distinct; resets stop feedback. Test physical vibration on supported phones.                                                       |
| A16 | Clean Windows Setup/portable contains required core helpers/assets and sets up a tested game without Node, AI, source edits or internet-dependent core services.                              |
| A17 | Existing Lab/pairing/library/sounds/navigation/security regressions, migrations and rollback pass.                                                                                            |

Automated: schemas/migrations, crop geometry, binding unions, analog bounds, revisions/authorization, responsive/hit bounds, assets and packaged persistence. Manual: phone comfort, physical vibration/fullscreen, original-game input/stop, native backend and sustained LAN checks. Browser screenshots do not prove hardware/native results.

## 17. Evidence and sources

- Current [types](../../src/shared/types.ts), [host](../../src/renderer/host.tsx), [adapters](../../src/electron/adapters.ts), [protocol](../PROTOCOL.md), [architecture](../ARCHITECTURE.md), [security](../../SECURITY.md).
- File dialogs belong in Electron main: [Electron dialogs](https://www.electronjs.org/docs/latest/api/dialog).
- XInput provides up to four controllers and defined axes/buttons: [Microsoft XInput](https://learn.microsoft.com/en-us/windows/win32/xinput/getting-started-with-xinput); this is a backend limit, not every game's player count.
- Keyboard injection has integrity-level restrictions: [Microsoft SendInput](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-sendinput).
- Legacy backend status: [ViGEmBus](https://github.com/nefarius/ViGEmBus).
- [Tabler catalog](https://tabler.io/icons), [MIT license](https://github.com/tabler/tabler-icons/blob/main/LICENSE); alternative [Lucide license](https://lucide.dev/license).
- Owner screenshot informed field placement only; no screenshot or third-party game artwork is redistributed. [Original planning wireframe](UI-WIREFRAMES.svg).
