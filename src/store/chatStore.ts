/**
 * Chat store — Zustand store for Matcha chat state.
 *
 * Holds friends list, messages, unread counts, and DM state.
 * WebSocket connection logic lives here (not in a component).
 */

import { create } from "zustand";
import { StorageService } from "../services/StorageService";
import type { MatchaMe, FriendRow, FriendRequestRow, MsgRow } from "../services/ChatService";

// ── Types ──────────────────────────────────────────────────────

interface ChatState {
  // Connection
  wsConnected: boolean;

  // User
  me: MatchaMe | null;
  registered: boolean;

  // Friends
  friends: FriendRow[];
  pendingRequests: FriendRequestRow[];
  sentRequests: FriendRequestRow[];
  blocked: string[];

  // Chat
  activeDmId: string | null;
  dmMessages: Record<string, MsgRow[]>;
  globalMessages: MsgRow[];
  unreadMap: Record<string, number>;
  dnd: boolean;

  // Avatar cache
  avatarHashByUserId: Record<string, string>;

  // UI
  tab: "friends" | "requests" | "global";
}

interface ChatActions {
  setWsConnected: (connected: boolean) => void;
  setMe: (me: MatchaMe | null) => void;
  setRegistered: (r: boolean) => void;
  setFriends: (friends: FriendRow[]) => void;
  setPendingRequests: (reqs: FriendRequestRow[]) => void;
  setSentRequests: (reqs: FriendRequestRow[]) => void;
  setBlocked: (ids: string[]) => void;
  setActiveDmId: (id: string | null) => void;
  appendDmMessage: (friendId: string, msg: MsgRow) => void;
  setDmMessages: (friendId: string, msgs: MsgRow[]) => void;
  appendGlobalMessage: (msg: MsgRow) => void;
  setGlobalMessages: (msgs: MsgRow[]) => void;
  setUnreadMap: (map: Record<string, number>) => void;
  incrementUnread: (friendId: string) => void;
  clearUnread: (friendId: string) => void;
  setDnd: (dnd: boolean) => void;
  setAvatarHash: (userId: string, hash: string) => void;
  setTab: (tab: "friends" | "requests" | "global") => void;
}

// ── Store ──────────────────────────────────────────────────────

export const useChatStore = create<ChatState & ChatActions>()((set, get) => ({
  wsConnected: false,
  me: null,
  registered: false,
  friends: [],
  pendingRequests: [],
  sentRequests: [],
  blocked: [],
  activeDmId: null,
  dmMessages: {},
  globalMessages: [],
  unreadMap: {},
  dnd: false,
  avatarHashByUserId: {},
  tab: "friends",

  setWsConnected: (connected) => set({ wsConnected: connected }),

  setMe: (me) => set({ me }),

  setRegistered: (r) => set({ registered: r }),

  setFriends: (friends) => {
    // Also update avatar hash cache from friends list.
    const avatarUpdates: Record<string, string> = {};
    for (const f of friends) {
      if (f.avatarHash) avatarUpdates[f.id] = f.avatarHash;
    }
    set((s) => ({
      friends,
      avatarHashByUserId: { ...s.avatarHashByUserId, ...avatarUpdates },
    }));
  },

  setPendingRequests: (reqs) => set({ pendingRequests: reqs }),
  setSentRequests: (reqs) => set({ sentRequests: reqs }),
  setBlocked: (ids) => set({ blocked: ids }),

  setActiveDmId: (id) => set({ activeDmId: id }),

  appendDmMessage: (friendId, msg) =>
    set((s) => ({
      dmMessages: {
        ...s.dmMessages,
        [friendId]: [...(s.dmMessages[friendId] ?? []), msg],
      },
    })),

  setDmMessages: (friendId, msgs) =>
    set((s) => ({
      dmMessages: { ...s.dmMessages, [friendId]: msgs },
    })),

  appendGlobalMessage: (msg) =>
    set((s) => ({ globalMessages: [...s.globalMessages, msg] })),

  setGlobalMessages: (msgs) => set({ globalMessages: msgs }),

  setUnreadMap: (map) => {
    set({ unreadMap: map });
    const me = get().me;
    if (me?.id) {
      StorageService.setUnreadMap(me.id, map);
      StorageService.emitUnreadChanged(me.id, map);
    }
  },

  incrementUnread: (friendId) => {
    const current = get().unreadMap;
    const count = Math.min(99, (current[friendId] ?? 0) + 1);
    const next = { ...current, [friendId]: count };
    get().setUnreadMap(next);
  },

  clearUnread: (friendId) => {
    const current = get().unreadMap;
    if (!(friendId in current)) return;
    const { [friendId]: _, ...rest } = current;
    get().setUnreadMap(rest);
  },

  setDnd: (dnd) => {
    set({ dnd });
    const me = get().me;
    if (me?.id) StorageService.setDnd(me.id, dnd);
  },

  setAvatarHash: (userId, hash) =>
    set((s) => ({
      avatarHashByUserId: { ...s.avatarHashByUserId, [userId]: hash },
    })),

  setTab: (tab) => set({ tab }),
}));
