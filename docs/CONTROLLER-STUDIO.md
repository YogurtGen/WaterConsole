# Add games and design your phone controller

WaterConsole 0.3 lets you add a game without editing source, installing Node, or paying for an AI service. Your original game stays in its own installation. Only Controller Lab is bundled.

## Guided tutorials

On first use, Add Game, crop and Controller Studio offer a spotlight walkthrough: the rest of the screen dims while the current control stays bright and usable. Use **Back / Next**, **Skip tutorial**, or Escape. Skipping does not close your editor or erase changes. Press the **?** button in that workspace header to replay from the beginning. Dismissal is remembered on this PC/browser profile. Tutorials run locally and only navigate the editor; they do not launch or reconfigure a game for you.

![Replayable spotlight explaining gamepad versus keyboard output](media/tutorial-output.png)

## Add a game

1. On Home, click **Add game** beside the library search.
2. Choose the original Windows `.exe`. Picking a file does not start it. Set a title and, if needed, an existing working directory and separate launch arguments.
3. Write a description, choose tags, and set the player count, supported display modes and connection label. These describe your game; they do not add multiplayer or split-screen to it.
4. Upload **Cover** and **Banner** independently. Crop them, then inspect the library preview.
5. Choose **Virtual gamepad** or **Keyboard bindings** for the PC output. Xbox/PlayStation phone labels only change appearance. Open **Controller Studio** to configure controls.
6. Connect and approve your phones. Save, test menus, select the game's input device if necessary, and test actual gameplay. Record your observations in **Test & save**.

If a launcher must open the game, select **Connect to a game I open myself**, open it through its normal launcher, then choose its matching window. WaterConsole disconnects from an attached game on Return Home. For a game launched by WaterConsole, it requests a normal close and waits; a game's confirmation dialog may need your response on the PC. It does not kill processes or bypass login/anti-cheat.

An entry can be saved as **Needs setup** or **Ready to test**. **Tested by you** is your recorded observation, not an automatic compatibility certification. Use the card's edit menu to edit, relink, duplicate or remove a local entry. Removing it does not uninstall the game.

## Cover and banner have different frames

| Destination | Recommended export | Shape |
| --- | --- | --- |
| Cover / library card | 900 × 1200 | 3:4 portrait |
| Banner / detail preview | 1920 × 1080 | 16:9 landscape |
| Custom button image | 512 × 512 | 1:1 |

**Recommended size** is specific to the destination. You can also choose Original, 1:1, 1:3, 3:4, 2:3, 16:9, 3:1 or Free crop. Drag the crop, resize its corners, rotate, or enter coordinates. The destination preview shows **Fit** (complete crop) or **Fill** (cover the frame). Manual crops preserve their chosen proportions; only Recommended exports to the destination pixel size. A small source may look soft when enlarged.

The normalized original and crop coordinates are kept, so **Re-crop** is reversible. Upload PNG/JPEG/WebP up to 25 MiB and 32 megapixels. Imported images are normalized locally; scriptable SVG/HTML uploads are not accepted. Only use artwork you are entitled to use; a local upload does not grant redistribution rights.

![Separate cover crop with destination-specific Recommended size](media/crop-editor.png)

## Controller Studio

Start with **Menu**, **Standard**, **Fight** or **Race**. Modes have their own controls and outputs. Keep Menu for recovery. The current Navigator can switch the shared game mode from the phone; the PC can also switch it. WaterConsole does not guess the game's scene.

- Add buttons, true analog sticks, draggable cross D-pads, triggers/sliders, and decorative labels.
- Select and drag a control; use its resize handle or numeric coordinates. Choose circle, square, triangle, rounded rectangle or pill. Equal-sided shapes keep their proportions.
- Shift-select controls to move/group, align or distribute them. Lock a layer to prevent accidental movement. Undo/Redo keeps the last 50 changes.
- **Show grid** and **Snap to grid** are independent. Set spacing from 1 to 128 design units or switch snap off.
- In Appearance, choose text, icon, icon + text, or your own image. Search the 6,257 bundled Tabler icons offline by name/category/aliases; keep favorites and recent choices. Select an optional pressed image and re-crop the normal image later.
- Edit base/mode/control colors and background, text/icon tint, border, pressed, disabled and focus colors. Reset an override to inherit its parent. Change sizes and opacity independently.
- Preview landscape/portrait phone sizes, player slot, Navigator/Other player and the separate PC preview theme. The **host** is the PC; the phone with navigation permission is the **Navigator**. Styling a role does not give it permissions.

Role colors follow the Navigator when the PC transfers that permission. Slot themes follow P1–P4. Per-control overrides take precedence over inherited phone colors. Avoid color combinations with unreadable text.

![Controller Studio using an owned documentation fixture](media/controller-studio.png)

## Link actions, such as Drift + Throttle

Select a button → **Actions** → **While held, also hold…**. Check both **accelerate** and **drift**. Map each semantic action to the actual PC output for the selected player and mode. Up to eight actions/outputs can be held together.

When you press the combined button, both actions start immediately. Releasing it stops its contribution. If a separate Throttle button remains held, throttle stays on until that other touch releases. The same union rule protects shared keyboard outputs across players. Triggers take the greatest active contribution; stick contributions combine and clamp to the valid range.

Use **Show in variant** to make controls Classic-only, Assisted-only or visible in both. Race supplies separate Throttle/Drift in Classic and a combined button in Assisted. Each phone can select its variant when the owner allows it. This is a simultaneous held combination, not a timed macro, script, toggle or repeated-input bot.

For a sliding button cluster, give its buttons the same **Slide-between-buttons group**. Dragging between them releases the previous action without lifting. For continuous steering/movement, prefer an analog stick or 4/8-way D-pad with an adjustable dead zone. Other fingers can keep action buttons held.

## PC output and compatibility

Each player/mode has separate bindings in the Actions inspector. **Gamepad** outputs use standard buttons, sticks and triggers. The standard D-pad sends independent directional button bits; analog sticks remain separate axes. Use Directional buttons to map negative/positive axis directions when needed. **Keyboard** outputs use the fixed game-key allowlist; phones never send raw keys. Separate key sets only work if the original game supports separate keyboard players. Global OS escape shortcuts are filtered; games running at a higher integrity level may decline input.

Virtual gamepads need the separately installed optional PC driver described in [INSTALL.md](INSTALL.md#vibration-and-optional-native-support). The helper/client is bundled, but the system driver never installs silently. Upstream support for that legacy driver has ended. A driver probe or working menu does not prove the game's racing/fighting controls use the same device: select the matching controller inside the game and test gameplay.

## Preview, fitting and vibration

**Preview on my phone** sends a sanitized draft to approved phones. It does not inject input into a game. Editing remains on the PC. End preview or choose **Save & test in game** to launch explicitly.

Layouts use a logical 960 × 540 canvas. The phone reserves its toolbar and safe areas, preserves control proportions, and chooses a generated compact arrangement if normal scaling would make targets too small. If there is still insufficient space, it shows an actionable rotate/simplify message instead of clipping controls. Check your layout on the actual phone, especially with many controls. Do not place dozens of required controls in a tiny viewport and expect them all to remain comfortable.

On each phone, use **Controller settings → Vibration → Test vibration**. Press feedback is configurable up to 100 ms per control and can be disabled per phone. Native feedback is forwarded only from a real controller rumble callback for the matching active slot/epoch. A button pulse is not collision detection. Browser/device support varies; physical vibration requires a real-phone check.

Input is released on cancellation, lost capture, focus/tab/connection loss, mode/epoch change and watchdog expiry. Reconnect restores the reserved slot, never old held buttons. Settings pause controls; leaving fullscreen does not disconnect the phone.

## Data and recovery

Catalog, images and drafts are local in the **Saved on this PC** folder shown by the wizard. Use **Change data folder** to copy the library to another drive. It preserves the previous folder. Back up the entire `library` directory while the app is closed, including its images. The app also keeps an atomic previous catalog and preserves a damaged file for recovery.

Do not publish your catalog: it contains personal executable paths and arguments. Shareable sanitized presets/import/export, advanced analog curves and reusable user templates are future extensions. For specialized controller behavior or supported game telemetry, the [source/AI route](ADDING-GAMES.md) remains available alongside this editor.