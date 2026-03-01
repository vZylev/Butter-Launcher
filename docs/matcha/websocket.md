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
    "deleted": false,
    "deletedByAdmin": false,
    "replyToId": null,
    "replyToFromHandle": "",
    "replyToSnippet": "",
    "createdAt": "..."
  }
}
```

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

