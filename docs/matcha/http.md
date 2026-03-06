# Matcha! HTTP API

All JSON endpoints use `Content-Type: application/json` unless noted.

Base URL (public service): `https://butter.lat`

## Errors

Most Matcha endpoints return a consistent shape:

```json
{ "ok": false, "error": "..." }
```

## Auth endpoints

### POST /api/matcha/register

Create a Matcha account.

Two modes are supported:

- **Immediate creation** (default)
- **Two-step registration** (`deferCreate: true`) to show a one-time **Secure Key** before the account exists

#### Request (immediate)

```json
{
  "username": "MyName",
  "password": "a-strong-password",
  "password2": "a-strong-password",
  "getApiToken": false
}
```

Notes:

- `getApiToken` is optional. If `true`, the response also returns an **authserver API token** (`apiToken`, prefix `AM:`).
- This is **opt-in** and does not change the normal login flow for existing clients.

#### Response (immediate)

```json
{
  "ok": true,
  "token": "<matcha_jwt>",
  "apiToken": "AM:...",
  "user": { "id": "...", "handle": "MyName#1234", "role": "user" },
  "masterKey": "BM:...",
  "proofId": "BM:..."
}
```

Notes:

- `apiToken` is only present if you requested it (`getApiToken: true`).

Notes:

- `masterKey` / `proofId` is **shown once** on creation. Store it safely.
- Registration is limited to **5 accounts per IP per 24 hours**.

#### Request (two-step)

```json
{
  "username": "MyName",
  "password": "a-strong-password",
  "password2": "a-strong-password",
  "deferCreate": true
}
```

#### Response (two-step)

```json
{
  "ok": true,
  "pendingId": "<24hex>",
  "handle": "MyName#1234",
  "masterKey": "BM:...",
  "proofId": "BM:..."
}
```

The pending registration expires after ~15 minutes.

Common status codes:

- `400` invalid username/password
- `409` no discriminators available for that username
- `429` too many accounts from the same IP

---

### POST /api/matcha/register/confirm

Complete a deferred registration (create the account).

#### Request

```json
{
  "pendingId": "<24hex>",
  "proofId": "BM:...",
  "getApiToken": false
}
```

Notes:

- `getApiToken` is optional. If `true`, the response also returns an `apiToken`.

Aliases:

- `masterKey` is accepted as an alternative to `proofId`.

#### Response

```json
{
  "ok": true,
  "token": "<matcha_jwt>",
  "apiToken": "AM:...",
  "user": { "id": "...", "handle": "MyName#1234", "role": "user" }
}
```

Notes:

- `apiToken` is only present if you requested it (`getApiToken: true`).

Notes:

- `pendingId` is single-use.
- Confirmation must be completed from the same public IP as the initial registration step.

Common status codes:

- `404` pending not found
- `410` pending expired
- `429` too many accounts from the same IP

---

### POST /api/matcha/login

Log in with a handle + password.

#### Request

```json
{ "handle": "MyName#1234", "password": "...", "getApiToken": false }
```

Notes:

- `getApiToken` is optional. If `true`, the response also returns an `apiToken`.
- `password` normally contains the account password.
- For trusted authservers, `password` may also be an **API token** (`AM:...`). This is supported but not recommended for human logins.

Fallback:

- If you pass a plain `username` without `#`, the server only allows it if it uniquely matches **exactly one** account; otherwise it returns an error asking for the full handle.

#### Response

```json
{
  "ok": true,
  "token": "<matcha_jwt>",
  "apiToken": "AM:...",
  "user": { "id": "...", "handle": "MyName#1234", "role": "user" }
}
```

Notes:

- `apiToken` is only present if you requested it (`getApiToken: true`).

---

## Authserver API tokens (optional)

Matcha supports an optional **per-user API token** meant for trusted authservers.

Properties:

- Prefix: `AM:`
- Exactly **one active API token per user**.
- When you request an API token (`getApiToken: true`), the token is **rotated** (previous token becomes invalid).

### GET /api/matcha/authservers/validate

Validate an API token.

Headers:

- `Authorization: Bearer <apiToken>`

Response:

- `204 No Content` if valid
- `401` if invalid

### POST /api/matcha/authservers/login

Exchange an API token for a normal Matcha JWT.

Headers:

- `Authorization: Bearer <apiToken>`

Body (optional):

```json
{ "handle": "MyName#1234" }
```

Response:

```json
{ "ok": true, "token": "<matcha_jwt>", "user": { "id": "...", "handle": "MyName#1234", "role": "user" } }
```

Notes:

- If `handle` is provided, it must match the user bound to the API token.

### POST /api/matcha/authservers/invalidate

Invalidate (revoke) the current API token.

Headers:

- `Authorization: Bearer <apiToken>`

Response:

- `204 No Content` if revoked
- `401` if invalid

---

## Terms of Service

### GET /api/matcha/tos

Public endpoint to fetch the server-configured Matcha Terms of Service.

Response:

```json
{
  "ok": true,
  "terms": {
    "title": "Matcha! System — Terms of Service",
    "lastUpdated": "Last Updated: ...",
    "body": "..."
  },
  "tos": "...",
  "updatedAt": "..."
}
```

Notes:

- `tos` is a backward-compatible alias of `terms.body`.

---

## Server configuration notes (self-host)

### Authserver rate-limit bypass

Self-hosted servers can optionally bypass the Matcha register IP limit for trusted authserver IPs.

- Configure via `matcha_authservers.json` (recommended)
- Or legacy env var `MATCHA_AUTHSERVERS_IPS` (comma-separated), which overrides the JSON.
  - For backward compatibility, `MATCHA_AUTHSERVER_IPS` is also accepted.

Bans:

- `403` with `{ ok: false, error: "Banned", bannedUntil, reason, remainingMs }`

---

### GET /matcha/reset-password

Serves a minimal HTML page used to redeem password reset links.

Query:

- `token=<string>`

This endpoint is meant to be opened in a browser.

---

### POST /api/matcha/reset-password

Redeem a password reset token.

#### Request

```json
{ "token": "...", "password1": "newpass", "password2": "newpass" }
```

#### Response

```json
{ "ok": true }
```

Common failures:

- `404` link not found
- `400` link expired / already used

## Profile

### GET /api/matcha/me

Auth required.

#### Response

```json
{
  "ok": true,
  "user": {
    "id": "...",
    "handle": "MyName#1234",
    "role": "user",
    "createdAt": "...",
    "messagesSentTotal": 123,
    "avatarHash": "...",
    "avatarMode": "hytale",
    "avatarDisabled": false,
    "settings": {
      "hideServerIp": false
    }
  },
  "system": {
    "devs": { "id": "...", "handle": "Devs#0000" }
  }
}
```

---

### POST /api/matcha/me/settings

Auth required.

Update self profile settings.

Notes:

- `hideServerIp` is a **server-side** privacy setting stored on your Matcha user profile.
- It affects what **other users** can see about you:
  - When your presence state is `multiplayer`, the backend may store your last reported `server` (from `POST /api/matcha/presence/event`).
  - If `hideServerIp=true`, the backend will **redact** that value when returning presence to others (friends list / public profile), so they will not receive your `server` string.
- This does not change your presence state (`multiplayer` vs `in_game` etc), only whether `server` is returned.

#### Request

```json
{ "hideServerIp": true }
```

#### Response

```json
{ "ok": true, "settings": { "hideServerIp": true } }
```

---

### GET /api/matcha/users/:id

Auth required.

Returns a public profile (safe fields only).

Notes:

- The response includes a `user.presence` object (best-effort): `{ state, server }`.
- Presence freshness is endpoint-specific:
  - This endpoint treats presence as “fresh” for ~10 minutes.
- Presence visibility is relationship-based:
  - **Friends** may see detailed `state` values (`in_game`, `singleplayer`, `multiplayer`, etc).
  - **Non-friends** only see `online` / `offline`.
  - `server` is only included for friends when `state: "multiplayer"` and only if the user has not enabled `hideServerIp`.

## Presence

### POST /api/matcha/heartbeat

Auth required.

#### Request

```json
{ "state": "online" }
```

Allowed states:

- `online`
- `offline` (also accepts `logout`, `ended`, `session_ended`)

Notes:

- `heartbeat` is used to keep `lastSeenAt` fresh and to mark a user online/offline.
- It does **not** set in-game state. Use `POST /api/matcha/presence/event` for launcher-driven game/session presence.
- To prevent “stuck in-game” after abrupt shutdowns (power loss / kill), if the stored state is game-related (`in_game`, `singleplayer`, `multiplayer`) but the last seen timestamp is already stale (currently ~2 minutes), the server will downgrade the state back to `online` on the next `online` heartbeat. This only happens when the previous presence was already stale; if the game is actually running, the launcher should soon send a new `POST /api/matcha/presence/event` (e.g. `game_opened` / `multiplayer_connected` / `singleplayer_entered`) which will update the state back from `online` to the correct in-game state.

#### Response

```json
{ "ok": true }
```

---

### POST /api/matcha/presence/event

Auth required.

Launcher-driven presence updates. Use this to explicitly report game lifecycle and session transitions.

#### Request

```json
{ "event": "game_opened" }
```

Supported events:

- `game_opened` → sets state `in_game`
- `game_closed` → sets state `online`
- `singleplayer_entered` → sets state `singleplayer`
- `multiplayer_connected` → sets state `multiplayer` and stores `server`
- `session_left` → sets state `in_game` (no active session)

For `multiplayer_connected`, include the `server` string:

```json
{ "event": "multiplayer_connected", "server": "1.2.3.4:1234" }
```

Notes:

- The launcher should still send `server` for `multiplayer_connected` so the backend can keep accurate state.
- If the user has enabled `hideServerIp`, the backend will not expose this `server` value to other users in presence responses.

#### Response

```json
{ "ok": true }
```

## Avatars

### GET /api/matcha/avatar/:userId

Public endpoint. Returns `image/png`.

- `404` if no avatar is stored.

---

### POST /api/matcha/avatar

Upload a cropped square PNG for “hytale” avatar mode.

- Auth required.
- Body is **raw bytes**, not JSON.
- Content-Type: `image/png` or `application/octet-stream`
- Max size: 800KB

Headers:

- `x-avatar-hash` (optional): sha256 hex of the body; if provided and mismatched the server rejects.
- `x-avatar-enable: 1` (optional): required if the user previously disabled avatars.
- `x-avatar-force: 1` (optional): required if `avatarMode` is currently `custom` and you want to overwrite it.

Response:

```json
{ "ok": true, "changed": true, "avatarHash": "<sha256>" }
```

---

### POST /api/matcha/avatar/custom

Upload a **custom** PNG.

- Auth required
- Body is raw bytes
- Max size: 1MB
- Must be exactly **92x92** (validated from PNG IHDR)

Response:

```json
{ "ok": true, "changed": true, "avatarHash": "<sha256>", "avatarMode": "custom" }
```

---

### DELETE /api/matcha/avatar

Auth required.

Deletes the stored avatar file and sets `avatarDisabled=true`.

Response:

```json
{ "ok": true }
```

## Friends

### GET /api/matcha/friends

Auth required.

Returns:

- `friends`: list of friends with state and avatar hash
  - For `state: "multiplayer"`, the server may also include `server` (string) **only if** that friend has not enabled `hideServerIp`.
- `incoming`: incoming friend requests
- `outgoing`: outgoing requests

Presence:

- Presence is considered “fresh” for ~2 minutes.
- If a friend's `lastSeenAt` is older than this window, the server returns `state: "offline"` for that friend (even if the DB still contains the last game-related state).

---

### POST /api/matcha/friends/request

Auth required.

Request body:

```json
{ "toHandle": "OtherName#0001" }
```

---

### POST /api/matcha/friends/request/cancel

Auth required.

Two ways:

- By request id:

```json
{ "id": "<requestId>" }
```

- Or by handle:

```json
{ "toHandle": "OtherName#0001" }
```

---

### POST /api/matcha/friends/request/accept

Auth required.

```json
{ "id": "<requestId>" }
```

---

### POST /api/matcha/friends/request/reject

Auth required.

```json
{ "id": "<requestId>" }
```

Note: reject hides the request from the recipient but keeps it pending for the sender.

---

### POST /api/matcha/friends/remove

Auth required.

```json
{ "friendId": "<userId>" }
```

## Unread counters

### GET /api/matcha/unread

Auth required.

Response:

```json
{ "ok": true, "dm": { "<otherUserId>": 3 } }
```

Counts are capped at 99.

---

### POST /api/matcha/unread/clear

Auth required.

```json
{ "with": "<otherUserId>" }
```

## Messages

### GET /api/matcha/messages

Auth required.

Query params:

- `with=global` for global chat
- `with=<otherUserId>` for DMs
- `limit` (default 30, max 60)
- Pagination:
  - `cursor=<messageId>` loads older messages (IDs `< cursor`)
  - `after=<messageId>` loads newer messages (IDs `> after`)

Response:

```json
{ "ok": true, "messages": [ /* chronological */ ], "nextCursor": "<olderCursorOrNull>" }
```

Message shape:

```json
{
  "id": "...",
  "fromId": "...",
  "fromHandle": "Name#0000",
  "fromIsDev": false,
  "fromBadge": "dev",
  "fromAvatarHash": "...",
  "toId": "...",
  "body": "...",
  "kind": "text",
  "meta": {},
  "deleted": false,
  "deletedByAdmin": false,
  "replyToId": null,
  "replyToFromHandle": "",
  "replyToSnippet": "",
  "createdAt": "..."
}
```

Notes:

- Deleted messages return `body: ""` and `deleted: true`.
- `kind`/`meta` are optional structured fields used for richer UI cards.
  - Clients should treat `meta` as an extensible object (unknown keys may appear).

---

### POST /api/matcha/messages/send

Auth required.

Request:

```json
{ "to": "global", "body": "hello" }
```

For DMs:

```json
{ "to": "OtherName#0001", "body": "hi" }
```

Optional reply:

```json
{ "to": "global", "body": "...", "replyTo": "<messageId>" }
```

Constraints:

- max 500 chars
- max 3 line breaks
- server-side blocked words filter
- DMs require an existing friend edge (otherwise `403 Not friends`)

Response:

```json
{ "ok": true, "id": "<messageId>" }
```

---

## Game invites & join requests (DM protocol)

Matcha supports two **special DM commands** that are sent using the normal message send APIs (HTTP or WebSocket). When the backend detects these commands, it will store a structured message (`kind`/`meta`) instead of a plain text body.

These commands are **DM-only** (they require an existing friend edge) and are detected by reading the **first token** of the message body (whitespace is ignored). Examples like `"/invite   "` are accepted.

### Command: `/invite`

Send a DM with `body: "/invite"`.

Server behavior:

- Requires the sender to currently be in `multiplayer` presence and have a non-empty `server` set.
  - If not, the server returns `400` `{ ok: false, error: "Not in multiplayer" }`.
- Persists a message with:
  - `kind: "game_invite"`
  - `body: ""`
  - `meta: { server: "<ip:port>", serverHidden: <boolean> }`

`serverHidden` is a **privacy hint** that reflects the sender’s profile setting `hideServerIp`.

- If `serverHidden: true`, the sender has opted to hide their server IP in presence/public profile responses.
- This flag is **not a security guarantee** (the invite/accept message may still carry `meta.server`). It exists so clients can choose a respectful UI (e.g. don’t display the IP by default, require a click to reveal/copy, etc.).

### Command: `/request-to-join`

Send a DM with `body: "/request-to-join"`.

Server behavior:

- Persists a message with:
  - `kind: "join_request"`
  - `body: ""`
  - `meta: {}` initially

The receiver can then accept/decline the request using the endpoints below.

---

## Join request actions

Join requests are represented as a message with `kind: "join_request"`. Accepting/declining will **edit that original message** by updating `message.meta.status` (and `resolvedAt`) so clients can hide action buttons without spamming extra messages.

### POST /api/matcha/join-requests/:id/accept

Auth required.

Accept a join request message (DM only). Only the **recipient** of the original request may accept.

Behavior:

- Marks the original request message `meta.status = "accepted"` and sets `meta.resolvedAt`.
- Requires the accepter to be in `multiplayer` presence.
- Creates a follow-up message:
  - `kind: "join_accept"`
  - `meta: { server: "<ip:port>", serverHidden: <boolean>, requestId: "<originalRequestMessageId>" }`

`serverHidden` here has the same meaning as in `/invite` (privacy hint based on `hideServerIp`).

Response:

```json
{ "ok": true, "id": "<joinAcceptMessageId>" }
```

Common failures:

- `400` invalid id / not a join_request / not in multiplayer
- `403` not allowed (not the recipient)
- `404` request not found
- `409` already declined

### POST /api/matcha/join-requests/:id/decline

Auth required.

Decline a join request message (DM only). Only the **recipient** of the original request may decline.

Behavior:

- Marks the original request message `meta.status = "declined"` and sets `meta.resolvedAt`.
- Does **not** create a follow-up “declined” message (silent edit).

Response:

```json
{ "ok": true }
```

Common failures:

- `400` invalid id / not a join_request
- `403` not allowed (not the recipient)
- `404` request not found
- `409` already accepted

---

### POST /api/matcha/messages/:id/delete

Auth required.

- Users can delete their own messages.
- Sometimes a message may appear deleted with `deletedByAdmin: true` (for example, if it was removed server-side). Clients should treat it as deleted content.

Response:

```json
{ "ok": true, "deletedByAdmin": false }
```

## Reports

### POST /api/matcha/reports

Auth required.

Request:

```json
{
  "messageId": "<messageId>",
  "category": "spam_quality",
  "reason": "spam",
  "details": "optional"
}
```

Allowed categories:

- `security_violence`
- `offensive`
- `spam_quality`
- `other`

Notes:

- You can’t report your own message.
- For DMs, only participants can report.

Response:

```json
{ "ok": true }
```
