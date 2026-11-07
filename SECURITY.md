# Security policy

WaterConsole Core is a **local-network console**, not a remote-access service. Use it on a trusted private LAN or hotspot. The controller connection is HTTP/WebSocket and **is not encrypted**. Device approval and session tokens restrict application access; they do not prevent a network attacker from observing or modifying traffic.

Do not expose the controller port through router forwarding, UPnP, a public tunnel, or Public-network firewall rules. Do not pair devices on untrusted guest/public Wi-Fi.

## Trust boundaries

- The Electron host is the administrator. Approval, rejection, kicking, navigation assignment, network selection, and session reset are trusted PC operations through restricted IPC.
- The LAN exposes only the controller, local public assets, public metadata, pairing requests/status, and the controller WebSocket. The host interface and administrative IPC are not an HTTP admin panel.
- Phones send allowlisted semantic actions and bounded axes. They cannot submit shell commands, executable paths, or unrestricted Windows keycodes.
- Native adapters execute on the PC and must be explicitly registered by a developer. Core ships no native game adapters, automatic executable discovery, or automatic driver installer.
- Optional drivers and games have separate security/support lifecycles. A game's authentication, anti-cheat, or DRM must not be bypassed.

## Implemented safeguards

The source is the authority for exact limits; review `src/server/index.ts` when changing the protocol.

- Random pairing nonce of at least 128 bits and a manual code, both expiring after two minutes.
- PC approval for every new device; individual session tokens; four player slots; bounded pending requests and connections.
- Origin and Host validation, strict message schemas, allowlisted actions, payload limits, and pairing/input rate limits.
- Input sequence and epoch checks so an old profile/session cannot replay held input into a new one.
- Input neutralization on cancellation, focus/visibility changes, disconnect, profile changes, and a 300 ms input watchdog. Disconnected slots are reserved for 30 seconds for valid-token reconnect.
- Public-asset path containment and a strict Content Security Policy. Renderer sandboxing, context isolation, and Node integration disabled.
- Local preferences written through temporary-file replacement. Active pairing/session state remains in memory.
- Private-network/LocalSubnet firewall configuration for the selected executable; no global firewall disable or automatic WAN exposure.

These protections reduce application-level risk on a trusted network. They are not a substitute for TLS or a hostile-network threat model.

## Reporting a vulnerability

Use [GitHub's private vulnerability reporting](https://github.com/YogurtGen/WaterConsole/security/advisories/new) if it is available. If that route is unavailable, open a minimal issue asking for a private reporting channel **without** publishing exploit steps, secrets, personal paths, or private captures. No response-time or security-support SLA is promised.

Include the affected version/commit, the trust boundary involved, a sanitized reproduction, expected/actual behavior, and impact. Use an isolated local test session. Do not test other people's devices or networks.

Never post a live QR, pairing nonce/code/ticket secret, session token, credentials, game binary, or unreviewed user-data/log archive. Ordinary reproducible UI/input issues belong in [GitHub Issues](https://github.com/YogurtGen/WaterConsole/issues).

## Contributor requirements

Keep authorization in the server and privileged operations on the desktop. A disabled button is not an authorization check. Validate every incoming frame and callback; check slot ownership, session epoch, runtime state, and profile before delivering input or haptics. Fail closed on unknown actions/adapters. Reset held input before recovery or teardown.

Do not log tokens or full pairing URLs. Keep screenshots and fixtures credential-free. Do not commit personal game paths, extracted commercial assets, credentials, dependency caches, or local settings. Review third-party binary provenance and licenses, and disclose archived or unsupported optional components clearly.
