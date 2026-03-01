# Matcha API (Launcher Integration)

Matcha is Butter’s social layer: accounts, friends, global chat, DMs, avatars, presence, and realtime messaging.

This folder is **client-facing** documentation: everything you need to integrate Matcha into your own launcher.

## Contents

- [HTTP API](http.md)
- [WebSocket API (realtime)](websocket.md)

## Service URL

Public Matcha service:

- Info/landing page: `https://butter.lat/matcha`
- HTTP base: `https://butter.lat`
- WebSocket: `wss://butter.lat/api/matcha/ws`

If you’re integrating against a different deployment, replace `https://butter.lat` with your backend origin.

## Authentication

Most endpoints require a Matcha token:

- Send header: `Authorization: Bearer <token>`
- You obtain a token from:
  - `POST /api/matcha/register` (registration)
  - `POST /api/matcha/register/confirm` (finish two-step registration)
  - `POST /api/matcha/login` (login)

Common auth failures:

- `401` `{ ok: false, error: "Missing token" }`
- `403` `{ ok: false, error: "Invalid token" }`
- If the account is banned/disabled, the server returns `403` with `{ ok: false, error: "Banned", bannedUntil, reason }`.

## Key concepts

- **User ID**: 24-hex string.
- **Handle**: `Name#1234` (username + discriminator).
- **Conversations**:
  - Global chat: `with=global`
  - DMs: load by user id: `with=<otherUserId>`

## Recommended integration flow

1. Register (recommended: two-step “Secure Key” flow) or login.
2. Store token securely.
3. Fetch the current user: `GET /api/matcha/me`.
4. Open WebSocket and authenticate immediately: `{ "type": "auth", "token": "..." }`.
5. Pull friend state:
   - `GET /api/matcha/friends`
   - `GET /api/matcha/unread`
6. Load message history on demand:
   - `GET /api/matcha/messages?with=global&limit=30`
   - `GET /api/matcha/messages?with=<otherUserId>&limit=30`
7. Send messages:
   - Prefer WebSocket `{ "type": "send", ... }`
   - Fallback HTTP `POST /api/matcha/messages/send`
8. Send presence heartbeat periodically while the launcher is open (and optionally `offline` on exit): `POST /api/matcha/heartbeat`.

## Practical client notes

- Rate limits exist. If you receive `429`, back off and show “slow down”.
- Avatar caching: fetch `GET /api/matcha/avatar/<userId>?v=<avatarHash>` to bust caches when `avatarHash` changes.

