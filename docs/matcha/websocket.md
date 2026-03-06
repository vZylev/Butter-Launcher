# Matcha! WebSocket API (realtime)

Path:

- `/api/matcha/ws`

Use `wss://` in production.

## Why WS?

Use HTTP for:

- auth/login
- friends list
- presence heartbeat
- message history / pagination

Use WebSocket for:

- realtime message delivery
- low-latency sending
- avatar updates

## Connection & auth

1. Connect:

- `wss://<host>/api/matcha/ws`

2. Within ~10 seconds, send an auth message:

```json
{ "type": "auth", "token": "<matcha_jwt>" }
```

On success:

```json
{ "type": "authed", "user": { "id": "...", "handle": "Name#0000" } }
```

If you don’t authenticate in time the socket is closed with:

- Close code `4001` and reason `"Auth required"`

If the user is banned the server sends:

```json
{ "type": "banned", "reason": "...", "bannedUntil": "...", "remainingMs": 123456 }
```

…and closes with:

- Close code `4003` and reason `"Banned"`

## Client -> server messages

### Send message

```json
{ "type": "send", "to": "global", "body": "hello" }
```

DM:

```json
{ "type": "send", "to": "OtherName#0001", "body": "hi" }
```

Reply-to:

```json
{ "type": "send", "to": "global", "body": "...", "replyTo": "<messageId>" }
```

Special DM commands:

- In DMs, `body: "/invite"` and `body: "/request-to-join"` are treated as **commands**.
- The backend persists a structured message (`kind`/`meta`) instead of plain text.
- See the HTTP docs section “Game invites & join requests (DM protocol)” for the exact behavior and required presence state.

Constraints match the HTTP endpoint:

- 500 chars max
- 3 line breaks max
- 800ms per-user send interval
- blocked words filter
- DMs require friendship

Error response:

```json
{ "type": "error", "error": "..." }
```

## Server -> client events

### type: message

Emitted to:

- everyone for global messages
- both DM participants for DMs

Payload:

```json
{
  "type": "message",
  "convo": "global",
  "message": {
    "id": "...",
    "fromId": "...",
    "fromHandle": "Name#0000",
    "fromIsDev": false,
    "fromBadge": "dev",
    "fromAvatarHash": "<sha256 or empty>",
    "toId": null,
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
}
```

Notes on `kind` / `meta`:

- `kind` is a message category used for richer UI cards (e.g. `game_invite`, `join_request`, `join_accept`).
- `meta` is an extensible object. Unknown keys may appear.
- For invite/accept messages, `meta` may include:
  - `server`: string like `"1.2.3.4:1234"`
  - `serverHidden`: boolean privacy hint based on the sender’s `hideServerIp` setting
    - If `true`, clients should consider not displaying the raw IP by default (or require an explicit reveal/copy).
    - This flag is not a security boundary; treat it as UI guidance.

### type: message_update

The server may **edit** an existing message (same `id`) and broadcast an update event.

This is used for join requests so the original `join_request` message can be marked as resolved (`meta.status = "accepted" | "declined"`) without sending extra “declined” spam.

Payload:

```json
{ "type": "message_update", "convo": "<convo>", "message": { /* same shape as type: message.message */ } }
```

Client handling:

- Merge the updated message into local state by `message.id`.
- If you haven’t loaded that message yet, you may ignore the update (it will be visible when history is fetched).

### type: message_deleted

```json
{ "type": "message_deleted", "convo": "global", "id": "<messageId>", "deletedByAdmin": true }
```

### type: avatar_updated

Emitted to:

- the user
- that user’s friends

```json
{
  "type": "avatar_updated",
  "userId": "<userId>",
  "avatarHash": "<sha256 or empty>",
  "avatarMode": "hytale",
  "avatarDisabled": false
}
```

### type: announcement

An announcement is also persisted as a normal global message, but this event lets clients show it as a toast/banner.

```json
{ "type": "announcement", "message": { /* same shape as message.message */ } }
```

### type: banned

```json
{ "type": "banned", "reason": "...", "bannedUntil": "...", "remainingMs": 123456 }
```

When you receive `type: "banned"`, the client should log out of Matcha mode and stop sending requests.

## Keepalive

The server pings clients every ~30 seconds. Clients should reply automatically (standard WS pong).

