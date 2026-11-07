# Controller icon catalog — planning research

**Proposed, not shipped.** Checked 7 November 2026. This is the icon-picker specification and a verified metadata seed, not an installed icon package.

## Primary collection

[Tabler Icons](https://tabler.io/icons) offers a consistent outline/filled family. Its [official MIT license](https://github.com/tabler/tabler-icons/blob/main/LICENSE) permits redistribution with required notices. The pinned official Git tree used here is [ed177a085b652fe04ec4f37ced867c94621e7840](https://github.com/tabler/tabler-icons/tree/ed177a085b652fe04ec4f37ced867c94621e7840), with **5203 outline and 1054 filled SVGs** at this snapshot. Counts can change upstream; the release will bundle a pinned version.

Plan the full catalog offline, with a curated gaming view first. Search results must be virtualized and loaded from local chunks. Phones receive only selected icons, not thousands of SVGs. Keep version/license/copyright/source metadata and notices in packaged distributions. This planning change imports no third-party SVG artwork.

[Lucide](https://lucide.dev/icons/) is an alternative consistent collection. Its [license](https://lucide.dev/license) is ISC, with MIT terms for listed Feather-derived icons. Prefer one primary family rather than mixing styles by default.

## Verified starter view

Every one of the **138 IDs below** was checked against the official outline tree. [Machine-readable seed](controller-icon-catalog.json) records immutable source links and example search aliases. These are pictogram candidates; selecting one does not bind a gameplay action.

| Category               | Verified Tabler IDs                                                                                                                                                                                                                                                                                                                |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inventory and items    | `backpack`, `briefcase`, `box`, `package`, `packages`, `archive`, `key`, `coin`, `coins`, `diamond`, `gift`, `flask`, `bottle`, `book`, `book-2`, `map`, `compass`                                                                                                                                                                 |
| Racing and vehicles    | `car`, `car-4wd`, `steering-wheel`, `engine`, `gas-station`, `gauge`, `automatic-gearbox`, `manual-gearbox`, `flag`, `flag-2`, `flag-check`, `traffic-lights`, `road`, `route`, `cone`, `wind`, `bolt`, `flame`, `shoe`, `rotate-clockwise`                                                                                        |
| Movement and arrows    | `arrow-up`, `arrow-down`, `arrow-left`, `arrow-right`, `arrow-up-left`, `arrow-up-right`, `arrow-down-left`, `arrow-down-right`, `arrows-move`, `arrows-horizontal`, `arrows-vertical`, `chevron-up`, `chevron-down`, `chevron-left`, `chevron-right`, `player-track-next`, `run`, `walk`, `jump-rope`, `stairs-up`, `stairs-down` |
| Combat and aim         | `sword`, `swords`, `shield`, `shield-check`, `target`, `crosshair`, `bow`, `bomb`, `hand-grab`, `hand-stop`, `karate`, `skull`, `focus`, `focus-2`                                                                                                                                                                                 |
| Health and skills      | `heart`, `heartbeat`, `heart-plus`, `medical-cross`, `bandage`, `first-aid-kit`, `plus`, `circle-plus`, `droplet`, `flame`, `sparkles`, `wand`, `snowflake`, `sun`, `moon`, `star`, `battery`, `battery-charging`                                                                                                                  |
| Camera and view        | `eye`, `eye-off`, `camera`, `video`, `zoom-in`, `zoom-out`, `focus-centered`, `arrows-maximize`, `view-360`, `rotate`, `rotate-2`                                                                                                                                                                                                  |
| Menus and interaction  | `menu`, `menu-2`, `settings`, `player-play`, `player-pause`, `player-stop`, `player-skip-back`, `arrow-back`, `check`, `x`, `question-mark`, `info-circle`, `door-enter`, `door-exit`, `message-circle`, `hand-click`, `pointer`, `switch-horizontal`                                                                              |
| Multiplayer and status | `users`, `user`, `user-plus`, `user-check`, `crown`, `device-gamepad`, `device-gamepad-2`, `wifi`, `wifi-off`, `plug`, `lock`, `lock-open`, `circle-check`, `circle-x`, `alert-triangle`, `volume`, `volume-off`, `microphone`, `microphone-off`                                                                                   |

## Search and appearance behavior

- Categories: Gaming favorites, Inventory/items, Racing, Movement/arrows, Combat, Health/skills, Camera, Menus, Multiplayer/status and All icons.
- Support English names and common aliases. Examples: inventory/bag/items/tas; throttle/accelerate/gas; fuel/petrol/bensin; boost/nitro; left/kiri. Distinguish fuel from acceleration in labels/results.
- Include recent/favorites, outline/filled filter, keyboard navigation, loading/no-results states and preview at the target button size.
- Modes: **Icon only, Icon + text, Text only, Custom image**. Keep an accessible action name in every mode. Image mode can optionally show a caption.
- Edit icon size/tint/stroke, text size/placement, background/border and normal/pressed/disabled/focus states. A glyph's geometry/color is independent from its action mapping and hit target.
- User PNG/JPEG/WebP uploads remain local and use the safe crop pipeline. Do not fetch external icons or run uploaded SVG/HTML.

## Original pictogram gaps

Create original MIT WaterConsole symbols for accelerator pedal, brake pedal, drift, jump/hop, throwing an item, light/heavy attack and other gaps such as a treasure chest/potion when the curated set cannot communicate the meaning accurately. The current metadata seed has no fabricated Tabler ID for those symbols. A shoe can be a temporary pedal candidate, but the final accelerator should be recognizable without explanation.

Face-button labels A/B/X/Y and circle/cross/square/triangle can use original text/geometric marks. Xbox/PlayStation-style labels do not imply native device emulation or ownership of a platform logo. Do not copy publisher-specific item/skill art into the public pack; users may choose their own local image.

## Acceptance

Offline search and selected rendering work in Setup/portable with no CDN. IDs resolve to the pinned pack, notices ship, invalid IDs fall back visibly, and an imported button cannot request arbitrary paths. Check tiny/large controls, every role/player color, high contrast, image-only accessible labels and physical phone readability.
