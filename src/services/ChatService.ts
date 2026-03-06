/**
 * ChatService — WebSocket management, Matcha API calls, token
 * handling. No React state, no DOM — just transport.
 */

import { IPC_FETCH_JSON } from "../ipc/channels";
import { MATCHA_API_BASE, MATCHA_WS_URL } from "../ipc/channels";
import { StorageService } from "./StorageService";

// ── Types ──────────────────────────────────────────────────────

export type MatchaMe = {
  id: string;
  handle: string;
  role?: string;
  createdAt?: string;
  messagesSentTotal?: number;
  totalMessagesSent?: number;
  messagesSent?: number;
  sentCount?: number;
  avatarHash?: string;
  avatarMode?: "hytale" | "custom" | string;
  avatarDisabled?: boolean;
  settings?: {
    hideServerIp?: boolean;
    [key: string]: unknown;
  };
};

export type MatchaPublicProfile = {
  id: string;
  handle: string;
  role?: string;
  createdAt?: string | null;
  messagesSentTotal?: number;
  avatarHash?: string;
  avatarMode?: "hytale" | "custom" | string;
  avatarDisabled?: boolean;
};

export type FriendRow = {
  id: string;
  handle: string;
  state:
    | "online"
    | "in_game"
    | "singleplayer"
    | "multiplayer"
    | "offline"
    | string;
  avatarHash?: string;
};

export type FriendRequestRow = {
  id: string;
  fromId?: string;
  fromHandle?: string;
  toId?: string;
  toHandle?: string;
  createdAt?: string;
};

export type MsgRow = {
  id: string;
  fromId: string;
  fromHandle: string;
  fromIsDev?: boolean;
  fromBadge?: string;
  fromAvatarHash?: string;
  toId: string | null;
  body: string;
  deleted: boolean;
  deletedByAdmin: boolean;
  replyToId?: string | null;
  replyToFromHandle?: string;
  replyToSnippet?: string;
  createdAt: string;
  meta?: Record<string, unknown>;
};

export type ReportCategory =
  | "security_violence"
  | "offensive"
  | "spam_quality"
  | "other";

// ── Helpers ────────────────────────────────────────────────────

const authHeaders = (token: string | null): Record<string, string> => {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
};

// ── Service ────────────────────────────────────────────────────

export const ChatService = {
  /**
   * Perform a JSON fetch through the main-process proxy (avoids CORS).
   */
  async apiJson(path: string, init?: RequestInit): Promise<any> {
    return await window.ipcRenderer.invoke(
      IPC_FETCH_JSON,
      `${MATCHA_API_BASE}${path}`,
      init ?? {},
    );
  },

  authHeaders,

  getToken(): string | null {
    return StorageService.getMatchaToken();
  },

  /** Build a WebSocket URL with the current token. */
  buildWsUrl(): string | null {
    const token = StorageService.getMatchaToken();
    if (!token) return null;
    return `${MATCHA_WS_URL}?token=${encodeURIComponent(token)}`;
  },

  // -- REST API wrappers --

  async register(handle: string, token: string): Promise<any> {
    return await ChatService.apiJson("/api/matcha/register", {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ handle }),
    });
  },

  async getMe(token: string): Promise<any> {
    return await ChatService.apiJson("/api/matcha/me", {
      headers: authHeaders(token),
    });
  },

  async getFriends(token: string): Promise<any> {
    return await ChatService.apiJson("/api/matcha/friends", {
      headers: authHeaders(token),
    });
  },

  async sendFriendRequest(token: string, handle: string): Promise<any> {
    return await ChatService.apiJson("/api/matcha/friends/request", {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ handle }),
    });
  },

  async acceptFriendRequest(token: string, requestId: string): Promise<any> {
    return await ChatService.apiJson(
      `/api/matcha/friends/request/${requestId}/accept`,
      {
        method: "POST",
        headers: authHeaders(token),
      },
    );
  },

  async declineFriendRequest(token: string, requestId: string): Promise<any> {
    return await ChatService.apiJson(
      `/api/matcha/friends/request/${requestId}/decline`,
      {
        method: "POST",
        headers: authHeaders(token),
      },
    );
  },

  async removeFriend(token: string, friendId: string): Promise<any> {
    return await ChatService.apiJson(`/api/matcha/friends/${friendId}`, {
      method: "DELETE",
      headers: authHeaders(token),
    });
  },

  async blockUser(token: string, userId: string): Promise<any> {
    return await ChatService.apiJson(`/api/matcha/block/${userId}`, {
      method: "POST",
      headers: authHeaders(token),
    });
  },

  async unblockUser(token: string, userId: string): Promise<any> {
    return await ChatService.apiJson(`/api/matcha/block/${userId}`, {
      method: "DELETE",
      headers: authHeaders(token),
    });
  },

  async getBlockedUsers(token: string): Promise<any> {
    return await ChatService.apiJson("/api/matcha/block", {
      headers: authHeaders(token),
    });
  },

  async getDmHistory(
    token: string,
    friendId: string,
    before?: string,
  ): Promise<any> {
    const qs = before ? `?before=${encodeURIComponent(before)}` : "";
    return await ChatService.apiJson(`/api/matcha/dm/${friendId}${qs}`, {
      headers: authHeaders(token),
    });
  },

  async getGlobalHistory(token: string, before?: string): Promise<any> {
    const qs = before ? `?before=${encodeURIComponent(before)}` : "";
    return await ChatService.apiJson(`/api/matcha/global${qs}`, {
      headers: authHeaders(token),
    });
  },

  async reportMessage(
    token: string,
    messageId: string,
    category: ReportCategory,
    reason: string,
    details: string,
  ): Promise<any> {
    return await ChatService.apiJson("/api/matcha/report", {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ messageId, category, reason, details }),
    });
  },

  async getPublicProfile(token: string, userId: string): Promise<any> {
    return await ChatService.apiJson(`/api/matcha/profile/${userId}`, {
      headers: authHeaders(token),
    });
  },

  async deleteMessage(token: string, messageId: string): Promise<any> {
    return await ChatService.apiJson(`/api/matcha/messages/${messageId}`, {
      method: "DELETE",
      headers: authHeaders(token),
    });
  },

  // -- WebSocket message formatting --

  formatWsMessage(payload: Record<string, unknown>): string {
    return JSON.stringify(payload);
  },

  buildDmMessage(toId: string, body: string, replyToId?: string): string {
    return ChatService.formatWsMessage({
      type: "dm",
      toId,
      body,
      ...(replyToId ? { replyToId } : {}),
    });
  },

  buildGlobalMessage(body: string, replyToId?: string): string {
    return ChatService.formatWsMessage({
      type: "global",
      body,
      ...(replyToId ? { replyToId } : {}),
    });
  },

  buildTypingMessage(toId?: string): string {
    return ChatService.formatWsMessage({
      type: "typing",
      ...(toId ? { toId } : {}),
    });
  },
};
