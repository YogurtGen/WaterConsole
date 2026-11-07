# Controller protocol

Protocol version: **1**. Type definitions in `src/shared/types.ts` and validation in `src/server/index.ts` are authoritative. This document explains the trust and state model; it is not permission to expose privileged commands on LAN.

## Public surface

| Route | Purpose |
| --- | --- |
| `GET /` | Redirect to the controller. |
| `GET /controller` | Bundled phone interface. |
| `GET /assets/*` | Allowlisted local public assets inside the asset directory. |
| `GET /api/public` | Protocol version, product name, capacity, and pairing-lock state. |
| `POST /api/pair` | Request approval using a current invitation. |
| `GET /api/pair/:id` | Poll the request with its ticket secret in the Authorization header. |
| `WS /ws` | Authenticate a device and exchange controller messages. |

Host administration uses the restricted Electron `HostBridge` over IPC, not these HTTP routes. A phone cannot approve itself, set executable paths, or run commands.

## Pairing

1. The PC advertises a current URL containing a random invitation nonce in its fragment, plus a manual pairing code. The fragment is removed from the controller URL after it is read.
2. The phone submits a name and either the nonce or code. The server checks the invitation's two-minute lifetime, pairing lock, capacity, schema, and rate limits.
3. The server returns a short-lived ticket: ID, secret, verification code, and expiration. Polling requires the ticket secret as a bearer value.
4. The PC compares the verification code and approves or rejects the request. Only approval creates a device/session token and player slot.
5. The phone authenticates its WebSocket with the token, then receives its player ID and authoritative state.

Tokens and invitation secrets must not be logged, committed, embedded in public screenshots, or copied into bug reports. They do not encrypt HTTP traffic.

## Input snapshots

An example uses placeholders and is not an active session:

```json
{
  "type": "input",
  "version": 1,
  "epoch": 7,
  "seq": 42,
  "buttons": ["right", "a"],
  "axes": { "x": 1, "y": 0 }
}
```

`epoch` identifies the current session/profile generation. `seq` must increase for that device. `buttons` is the complete held-state snapshot, containing only actions permitted by the active controller profile. Axes must meet the server's numeric bounds. The server derives ownership from the authenticated device; the phone does not choose another player's slot.

The supplied semantic actions are directional navigation, confirm/back, face buttons, start/select, and shoulder/trigger actions. Profiles `menu`, `lab`, and `gamepad` define their allowlists. A future action must be typed, validated, mapped, and tested end to end.

The controller sends changes immediately and active snapshots every 100 ms. A valid frame refreshes the watchdog; ping alone does not substitute for held-input state. The server neutralizes stale input after 300 ms. Native helpers must also fail safely if the parent disappears.

## Device messages

Besides authentication and input, the current client contract includes personal rename/readiness, allowed navigation-toolbar actions, native controller mode/layout requests when authorized for that runtime, and ping. Do not confuse a limited runtime control request with PC administration.

The server returns authentication/state, errors, pong, session-ended notices, and bounded haptic messages. An error should be actionable without including private state or secrets.

```json
{ "type": "haptics", "epoch": 7, "durationMs": 40 }
```

Haptics must match the current epoch and valid player/runtime. A zero duration cancels feedback. The phone also checks user activation, its preference, visibility/focus, supported API, and runtime before playing native feedback. Touch feedback is local and must be described as such.

## Reset and reconnect rules

- Clear held actions on pointer cancel/lost capture, blur, hidden tab, orientation change, profile/epoch change, disconnect, stop, and helper failure.
- Clear input before applying a recovered state. Reconnect must never replay buttons held before disconnection.
- Reserve a disconnected slot for up to **30 seconds**. A still-valid token is required to reclaim it. After expiration, pair again.
- Locking pairing blocks new invitations; ending/resetting the session invalidates its active credentials.
- Apply input/haptic routing only to the current slot/profile/runtime. A four-slot console does not override a game's smaller player limit.

## Validation and limits

The implementation rejects foreign Origin/Host values, unknown fields/types/actions, stale sequence/epoch, malformed payloads, oversized messages, capacity excess, and request floods. The current HTTP/WebSocket payload maximum is **8192 bytes**. Limits for pairing, polling, sockets, and input are separate; inspect source before changing them.

Public assets are resolved within the real public directory; traversal must not access source, preferences, toolkit, or host files. Keep controller assets self-contained, CSP-compatible, and local.

Native bridge JSON is a separate **desktop-only** contract documented in `toolkit/native/README.md`. Never pass its executable/process configuration through the phone protocol.
