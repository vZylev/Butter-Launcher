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
  "password2": "a-strong-password"
}
```

#### Response (immediate)

```json
{
  "ok": true,
  "token": "<matcha_jwt>",
  "user": { "id": "...", "handle": "MyName#1234", "role": "user" },
  "masterKey": "BM:...",
  "proofId": "BM:..."
}
```

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
  "proofId": "BM:..."
}
```

Aliases:

- `masterKey` is accepted as an alternative to `proofId`.

#### Response

```json
{
  "ok": true,
  "token": "<matcha_jwt>",
  "user": { "id": "...", "handle": "MyName#1234", "role": "user" }
}
```

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
{ "handle": "MyName#1234", "password": "..." }
```

Fallback:

- If you pass a plain `username` without `#`, the server only allows it if it uniquely matches **exactly one** account; otherwise it returns an error asking for the full handle.

#### Response

```json
{
  "ok": true,
  "token": "<matcha_jwt>",
  "user": { "id": "...", "handle": "MyName#1234", "role": "user" }
}
```

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
    "avatarDisabled": false
  },
  "system": {
    "devs": { "id": "...", "handle": "Devs#0000" }
  }
}
```

---

### GET /api/matcha/users/:id

Auth required.

Returns a public profile (safe fields only).

## Presence

### POST /api/matcha/heartbeat

Auth required.

#### Request

```json
{ "state": "online" }
```

Allowed states (server normalizes these):

- `online`
- `in_game`
- `singleplayer`
- `multiplayer`
- `offline` (also accepts `logout`, `ended`, `session_ended`)

Notes:

- The backend may override the requested state by inferring a recent game session by IP.

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
- `incoming`: incoming friend requests
- `outgoing`: outgoing requests

Presence:

- Presence is considered “fresh” for ~10 minutes.

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
