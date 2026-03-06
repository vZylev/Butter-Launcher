/**
 * useMatchaWebSocket — WebSocket connection management for Matcha chat.
 *
 * Extracted from FriendsMenu.tsx (~220 LOC of WS setup).
 * Handles connect, reconnect, message dispatch, and heartbeat.
 */

import { useEffect, useRef, useCallback } from "react";
import { type MsgRow, type FriendRow } from "../../services/ChatService";
import { MATCHA_WS_URL } from "../../ipc/channels";
import { useChatStore } from "../../store/chatStore";

type WsCallbacks = {
  onMessage?: (msg: MsgRow) => void;
  onAnnouncement?: (text: string) => void;
  onMessageDeleted?: (msgId: string) => void;
  onAvatarUpdated?: (userId: string, hash: string) => void;
  onBanned?: () => void;
  onFriendsUpdate?: (friends: FriendRow[]) => void;
  onStatusChange?: (friendId: string, state: string) => void;
};

export function useMatchaWebSocket(
  token: string | null,
  enabled: boolean,
  callbacks?: WsCallbacks,
) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const setWsConnected = useChatStore((s) => s.setWsConnected);

  const connect = useCallback(() => {
    if (!token || !enabled) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const url = `${MATCHA_WS_URL}?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) return;
      setWsConnected(true);
    };

    ws.onmessage = (event) => {
      if (!mountedRef.current) return;
      try {
        const data = JSON.parse(event.data);
        const type = data?.type;

        if (type === "message" || type === "dm" || type === "global") {
          callbacks?.onMessage?.(data as MsgRow);
        } else if (type === "announcement") {
          callbacks?.onAnnouncement?.(data.text);
        } else if (type === "message_deleted") {
          callbacks?.onMessageDeleted?.(data.id);
        } else if (type === "avatar_updated") {
          callbacks?.onAvatarUpdated?.(data.userId, data.hash);
        } else if (type === "banned") {
          callbacks?.onBanned?.();
        } else if (type === "friends_update" || type === "friends") {
          if (Array.isArray(data.friends)) {
            callbacks?.onFriendsUpdate?.(data.friends);
          }
        } else if (type === "status_change") {
          callbacks?.onStatusChange?.(data.friendId, data.state);
        }
      } catch {
        // Malformed WS message — ignore.
      }
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      setWsConnected(false);
      // Reconnect after 2 seconds.
      reconnectRef.current = setTimeout(() => {
        if (mountedRef.current) connect();
      }, 2000);
    };

    ws.onerror = () => {
      // Will trigger onclose.
    };
  }, [token, enabled, callbacks, setWsConnected]);

  // Send a message through the WebSocket.
  const send = useCallback((data: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(data);
      return true;
    }
    return false;
  }, []);

  // Disconnect explicitly.
  const disconnect = useCallback(() => {
    if (reconnectRef.current) {
      clearTimeout(reconnectRef.current);
      reconnectRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    setWsConnected(false);
  }, [setWsConnected]);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      disconnect();
    };
  }, [connect, disconnect]);

  return { wsRef, send, disconnect, connect };
}
