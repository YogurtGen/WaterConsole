# Controller usability 0.4 validation

Automated evidence uses isolated application profiles, owned lightweight input fixtures and browser controllers. No third-party game or new system driver is opened by these tests.

- TypeScript and unit tests cover pairing/authorization, input recovery, hardware model completeness, per-player assignment isolation, linked outputs, keyboard directions, old semantic aliases and personal-layout bounds.
- Editor GUI checks scroll the icon catalog, apply live/HEX colors, decode a cropped controller background through the app asset protocol, and assign Xbox/PlayStation/104-key visual inputs with shared-use information.
- Four approved browser controllers exercise analog drag and linked inputs, rotation fit, Vibration API recording, per-device drag/resize persistence, Cancel and Reset. Orientation APIs are explicitly mocked for success/denial coverage.
- Native self-tests inspect the allowlist, extended-key flags and analog reports without creating devices. Opt-in native integration uses a project-owned lightweight fixture only.

The visual hardware models are original schematics. Layout/name references: [Sony DualSense part names](https://controller.dl.playstation.net/controller/lang/en/DS_partnames.html), [Microsoft Xbox controller guide](https://support.xbox.com/en-US/help/hardware-network/controller/get-to-know-your-xbox-series-x-s-controller), and [Microsoft XINPUT_GAMEPAD](https://learn.microsoft.com/en-us/windows/win32/api/xinput/ns-xinput-xinput_gamepad). Touchpad/mic/Home/Share and reserved keyboard system keys are intentionally disabled in the visual editor. Keyboard model: ANSI 104; regional physical layouts can differ.

Physical Android fullscreen/rotation, vibration, prolonged LAN timing and individual commercial-game compatibility still need device/game testing. See [MDN orientation lock](https://developer.mozilla.org/en-US/docs/Web/API/ScreenOrientation/lock) for browser limits.

Source evidence: 91 Core unit tests, 16 editor GUI checks, 14 Studio/native fixture checks, 17 original toolkit plus 11 configured-helper self-checks. Hardware geometry checks sample hotspot perimeters against the original SVG shell and check button text bounds. The private PC edition also runs its legacy controller fixtures. Orientation/fullscreen success/denial coverage uses mock APIs; native XInput and keyboard delivery use the owned test application.
