import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { IconChevronDown, IconChevronLeft, IconChevronRight, IconMessage, IconTrash, IconUserCircle, IconUserPlus } from "@tabler/icons-react";
import cn from "../utils/cn";
import matchaIcon from "../assets/matcha-icon.png";
import matchaStartSfx from "../assets/matchastart.ogg";
import notiSfx from "../assets/noti.ogg";

const API_BASE = "https://butter.lat";
const WS_BASE = API_BASE.replace(/^http/, "ws");
const WS_URL = `${WS_BASE}/api/matcha/ws`;
const LS_TOKEN = "matcha:token";
const LS_UNREAD_PREFIX = "matcha:unread:";
const LS_DND_PREFIX = "matcha:dnd:";

type MatchaMe = {
  id: string;
  handle: string;
  createdAt?: string;
  messagesSentTotal?: number;
  totalMessagesSent?: number;
  messagesSent?: number;
  sentCount?: number;
};

type FriendRow = { id: string; handle: string; state: "online" | "in_game" | "singleplayer" | "multiplayer" | "offline" | string };

type FriendRequestRow = {
  id: string;
  fromId?: string;
  fromHandle?: string;
  toId?: string;
  toHandle?: string;
  createdAt?: string;
};

type MsgRow = {
  id: string;
  fromId: string;
  fromHandle: string;
  fromIsDev?: boolean;
  toId: string | null;
  body: string;
  deleted: boolean;
  deletedByAdmin: boolean;
  replyToId?: string | null;
  replyToFromHandle?: string;
  replyToSnippet?: string;
  createdAt: string;
};

type MsgMenuState = { id: string; dir: "left" | "right"; v: "up" | "down" };

type ReportCategory = "security_violence" | "offensive" | "spam_quality" | "other";

type ReportDraft = {
  open: boolean;
  msg: MsgRow | null;
  category: ReportCategory | "";
  reason: string;
  details: string;
  sending: boolean;
};

const apiJson = async (path: string, init?: RequestInit) => {
  // Use main-process fetch to avoid CORS in Electron renderer.
  return await window.ipcRenderer.invoke("fetch:json", `${API_BASE}${path}`, init ?? {});
};

const authHeaders = (token: string | null) => {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
};

const readSavedToken = () => {
  try {
    const t = (localStorage.getItem(LS_TOKEN) || "").trim();
    return t || null;
  } catch {
    return null;
  }
};

const unreadKeyFor = (meId: string) => `${LS_UNREAD_PREFIX}${String(meId || "").trim()}`;

const dndKeyFor = (meId: string) => `${LS_DND_PREFIX}${String(meId || "").trim()}`;

const readUnreadMap = (meId: string): Record<string, number> => {
  try {
    const key = unreadKeyFor(meId);
    if (!key) return {};
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, any>)) {
      const id = String(k || "").trim();
      const n = typeof v === "number" ? v : Number(v);
      if (!id) continue;
      if (!Number.isFinite(n) || n <= 0) continue;
      out[id] = Math.min(99, Math.floor(n));
    }
    return out;
  } catch {
    return {};
  }
};

const sanitizeUnreadMap = (raw: any): Record<string, number> => {
  try {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(raw as Record<string, any>)) {
      const id = String(k || "").trim();
      const n = typeof v === "number" ? v : Number(v);
      if (!id) continue;
      if (!Number.isFinite(n) || n <= 0) continue;
      out[id] = Math.min(99, Math.floor(n));
    }
    return out;
  } catch {
    return {};
  }
};

const writeUnreadMap = (meId: string, map: Record<string, number>) => {
  try {
    const key = unreadKeyFor(meId);
    if (!key) return;
    localStorage.setItem(key, JSON.stringify(map || {}));
  } catch {
    // ignore
  }
};

const readDnd = (meId: string): boolean => {
  try {
    const key = dndKeyFor(meId);
    if (!key) return false;
    const raw = (localStorage.getItem(key) || "").trim();
    return raw === "1" || raw.toLowerCase() === "true";
  } catch {
    return false;
  }
};

const writeDnd = (meId: string, enabled: boolean) => {
  try {
    const key = dndKeyFor(meId);
    if (!key) return;
    localStorage.setItem(key, enabled ? "1" : "0");
  } catch {
    // ignore
  }
};

export default function FriendsMenu({
  onClose,
  open,
  onOpenTerms,
  openTo,
  openToNonce,
}: {
  onClose: () => void;
  open: boolean;
  onOpenTerms: () => void;
  openTo?: "friends" | "globalChat";
  openToNonce?: number;
}) {
  const { t } = useTranslation();

  const [token, setToken] = useState<string | null>(() => readSavedToken());

  const [me, setMe] = useState<MatchaMe | null>(null);
  const [mode, setMode] = useState<"intro" | "login" | "register" | "app" | "proof">(() => (readSavedToken() ? "app" : "intro"));
  const [error, setError] = useState<string>("");
  const [introSeq, setIntroSeq] = useState(0);
  const [introDocked, setIntroDocked] = useState(false);
  const introSfxRef = useRef<HTMLAudioElement | null>(null);

  const [profileOpen, setProfileOpen] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileErr, setProfileErr] = useState<string>("");
  const [profileUser, setProfileUser] = useState<MatchaMe | null>(null);

  const [loginHandle, setLoginHandle] = useState("");
  const [loginPass, setLoginPass] = useState("");

  const [regUser, setRegUser] = useState("");
  const [regPass, setRegPass] = useState("");
  const [regPass2, setRegPass2] = useState("");

  const [registeredHandle, setRegisteredHandle] = useState<string | null>(null);

  const [proofId, setProofId] = useState<string | null>(null);
  const keepProofRef = useRef(false);

  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [incoming, setIncoming] = useState<FriendRequestRow[]>([]);
  const [outgoing, setOutgoing] = useState<FriendRequestRow[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(false);

  const [unreadDmByFriendId, setUnreadDmByFriendId] = useState<Record<string, number>>({});
  const [dmUnreadMarker, setDmUnreadMarker] = useState<null | { friendId: string; count: number }>(null);

  const [addHandle, setAddHandle] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  const [friendSearch, setFriendSearch] = useState("");

  const [appView, setAppView] = useState<"friends" | "globalChat" | "dm">("friends");
  const [selectedFriend, setSelectedFriend] = useState<FriendRow | null>(null);
  const [messages, setMessages] = useState<MsgRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [msgText, setMsgText] = useState("");
  const [replyDraft, setReplyDraft] = useState<null | { id: string; fromHandle: string; snippet: string }>(null);

  const appViewRef = useRef(appView);
  const selectedFriendRef = useRef<FriendRow | null>(selectedFriend);
  const [doNotDisturb, setDoNotDisturb] = useState(false);
  const doNotDisturbRef = useRef(false);
  const lastUnreadClearRef = useRef<Record<string, number>>({});

  useEffect(() => {
    appViewRef.current = appView;
  }, [appView]);

  useEffect(() => {
    selectedFriendRef.current = selectedFriend;
  }, [selectedFriend]);

  useEffect(() => {
    doNotDisturbRef.current = doNotDisturb;
  }, [doNotDisturb]);

  const [msgMenu, setMsgMenu] = useState<MsgMenuState | null>(null);
  const [report, setReport] = useState<ReportDraft>({
    open: false,
    msg: null,
    category: "",
    reason: "",
    details: "",
    sending: false,
  });

  useEffect(() => {
    if (!msgMenu) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (t.closest?.("[data-msg-menu-root='1']")) return;
      setMsgMenu(null);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [msgMenu]);

  const computeMenuPlacement = (
    btnEl: HTMLElement | null,
    baseDir: "left" | "right",
  ): { dir: "left" | "right"; v: "up" | "down" } => {
    try {
      const container = msgScrollRef.current;
      if (!btnEl || !container) return { dir: baseDir, v: "down" };

      const btn = btnEl.getBoundingClientRect();
      const box = container.getBoundingClientRect();

      const menuW = 176; // a bit more than w-40
      const menuH = 120; // enough for header + 2 actions

      const spaceRight = box.right - btn.right;
      const spaceLeft = btn.left - box.left;
      const spaceBottom = box.bottom - btn.bottom;
      const spaceTop = btn.top - box.top;

      let dir: "left" | "right" = baseDir;
      if (baseDir === "right" && spaceRight >= menuW) dir = "right";
      else if (baseDir === "left" && spaceLeft >= menuW) dir = "left";
      else if (spaceRight >= menuW) dir = "right";
      else if (spaceLeft >= menuW) dir = "left";
      else dir = spaceRight >= spaceLeft ? "right" : "left";

      const v: "up" | "down" = spaceBottom >= menuH || spaceBottom >= spaceTop ? "down" : "up";
      return { dir, v };
    } catch {
      return { dir: baseDir, v: "down" };
    }
  };

  const [requestsKind, setRequestsKind] = useState<"incoming" | "outgoing">("incoming");
  const [requestsOpen, setRequestsOpen] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [ctxMenu, setCtxMenu] = useState<null | { x: number; y: number; friend: FriendRow }>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const wsAuthedRef = useRef(false);

  const msgScrollRef = useRef<HTMLDivElement | null>(null);

  const makeConvoIdClient = (aId: string, bId: string) => {
    const a = String(aId);
    const b = String(bId);
    return a < b ? `${a}:${b}` : `${b}:${a}`;
  };

  const otherIdFromConvo = (convo: string, myId: string): string | null => {
    try {
      const raw = String(convo || "").trim();
      if (!raw || raw === "global") return null;
      const parts = raw.split(":");
      if (parts.length !== 2) return null;
      const [a, b] = parts;
      if (a === myId) return b;
      if (b === myId) return a;
      return null;
    } catch {
      return null;
    }
  };

  const friendsOnlineCount = useMemo(() => {
    return friends.filter((f) => f.state !== "offline").length;
  }, [friends]);

  const filteredFriends = useMemo(() => {
    const q = friendSearch.trim().toLowerCase();
    if (!q) return friends;
    return friends.filter((f) => f.handle.toLowerCase().includes(q));
  }, [friends, friendSearch]);

  const initials = (handle: string) => {
    const h = String(handle || "").trim();
    if (!h) return "?";
    const base = h.split("#")[0] || h;
    const parts = base.split(/\s+/g).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return base.slice(0, 2).toUpperCase();
  };

  const copyToClipboard = async (text: string) => {
    const t = String(text || "");
    if (!t) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(t);
        return;
      }
    } catch {
      // fallback below
    }

    try {
      const ta = document.createElement("textarea");
      ta.value = t;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      ta.style.top = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    } catch {
      // ignore
    }
  };

  const saveToken = (t: string | null) => {
    setToken(t);
    try {
      if (!t) localStorage.removeItem(LS_TOKEN);
      else localStorage.setItem(LS_TOKEN, t);
    } catch {
      // ignore
    }
  };

  const refreshFriends = async (t: string) => {
    setLoadingFriends(true);
    try {
      const resp = await apiJson("/api/matcha/friends", {
        method: "GET",
        headers: authHeaders(t),
      });
      if (!resp?.ok) throw new Error(String(resp?.error || "Failed"));
      setFriends(Array.isArray(resp.friends) ? resp.friends : []);
      setIncoming(Array.isArray(resp.incoming) ? resp.incoming : []);
      setOutgoing(Array.isArray(resp.outgoing) ? resp.outgoing : []);
    } finally {
      setLoadingFriends(false);
    }
  };

  const refreshUnread = async (t: string) => {
    try {
      const resp = await apiJson("/api/matcha/unread", {
        method: "GET",
        headers: authHeaders(t),
      });
      if (!resp?.ok) return;
      setUnreadDmByFriendId(sanitizeUnreadMap(resp.dm));
    } catch {
      // ignore
    }
  };

  const clearUnread = async (t: string, friendId: string) => {
    const withId = String(friendId || "").trim();
    if (!withId) return;
    setUnreadDmByFriendId((prev) => {
      if (!prev[withId]) return prev;
      const next = { ...prev };
      delete next[withId];
      return next;
    });
    await apiJson("/api/matcha/unread/clear", {
      method: "POST",
      headers: authHeaders(t),
      body: JSON.stringify({ with: withId }),
    }).catch(() => {});
  };

  const heartbeat = async (t: string) => {
    await apiJson("/api/matcha/heartbeat", {
      method: "POST",
      headers: authHeaders(t),
      body: JSON.stringify({ state: "online" }),
    }).catch(() => {});
  };

  const loadMessages = async (t: string, withId: string, cursor?: string | null, appendOlder?: boolean) => {
    setLoadingMsgs(true);
    try {
      const qs = new URLSearchParams();
      qs.set("with", withId);
      qs.set("limit", "30");
      if (cursor) qs.set("cursor", cursor);
      const resp = await apiJson(`/api/matcha/messages?${qs.toString()}`, {
        method: "GET",
        headers: authHeaders(t),
      });
      if (!resp?.ok) throw new Error(String(resp?.error || "Failed"));
      const rows = Array.isArray(resp.messages) ? resp.messages : [];
      const nc = typeof resp.nextCursor === "string" ? resp.nextCursor : null;

      setNextCursor(nc);
      setMessages((prev) => {
        if (appendOlder) return [...rows, ...prev];
        return rows;
      });
    } finally {
      setLoadingMsgs(false);
    }
  };

  const openProfile = async () => {
    if (!token) return;
    setProfileOpen(true);
    setProfileErr("");
    setProfileLoading(true);
    try {
      const resp = await apiJson("/api/matcha/me", {
        method: "GET",
        headers: authHeaders(token),
      });
      if (!resp?.ok) throw new Error(String(resp?.error || "Failed"));
      const u = resp.user as MatchaMe;
      setProfileUser(u);
    } catch {
      setProfileErr(t("friendsMenu.profile.loadFailed"));
      setProfileUser(null);
    } finally {
      setProfileLoading(false);
    }
  };

  useEffect(() => {
    if (!token) {
      setMe(null);
      setUnreadDmByFriendId({});
      keepProofRef.current = false;
      setMode("intro");
      setIntroSeq((v) => v + 1);
      setIntroDocked(false);
      return;
    }

    let alive = true;
    (async () => {
      try {
        const resp = await apiJson("/api/matcha/me", {
          method: "GET",
          headers: authHeaders(token),
        });
        if (!resp?.ok) throw new Error(String(resp?.error || "Invalid token"));
        if (!alive) return;
        setMe(resp.user as MatchaMe);
        if (!keepProofRef.current) setMode("app");
        await heartbeat(token);
        void refreshFriends(token);
      } catch {
        if (!alive) return;
        saveToken(null);
        setMe(null);
        keepProofRef.current = false;
        setMode("intro");
        setIntroSeq((v) => v + 1);
        setIntroDocked(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [token]);

  useEffect(() => {
    if (!me?.id) {
      setUnreadDmByFriendId({});
      return;
    }
    setUnreadDmByFriendId(readUnreadMap(me.id));
    if (!token) return;

    void refreshUnread(token);
  }, [me?.id, token]);

  useEffect(() => {
    if (!me?.id) {
      setDoNotDisturb(false);
      return;
    }
    setDoNotDisturb(readDnd(me.id));
  }, [me?.id]);

  useEffect(() => {
    if (!me?.id) return;
    writeUnreadMap(me.id, unreadDmByFriendId);
  }, [me?.id, unreadDmByFriendId]);

  useEffect(() => {
    if (!me?.id) return;
    writeDnd(me.id, doNotDisturb);
  }, [me?.id, doNotDisturb]);

  useEffect(() => {
    // Play the intro SFX when the logged-out intro animation is shown.
    if (!open || mode !== "intro") {
      try {
        introSfxRef.current?.pause();
        if (introSfxRef.current) introSfxRef.current.currentTime = 0;
      } catch {
        // ignore
      }
      return;
    }

    try {
      const a = new Audio(matchaStartSfx);
      a.volume = 0.8;
      introSfxRef.current = a;
      const p = a.play();
      if (p && typeof (p as Promise<void>).catch === "function") {
        (p as Promise<void>).catch(() => {});
      }
    } catch {
      // ignore
    }

    return () => {
      try {
        introSfxRef.current?.pause();
        if (introSfxRef.current) introSfxRef.current.currentTime = 0;
      } catch {
        // ignore
      }
    };
    // Re-run per intro open sequence so it plays again on each open.
  }, [open, mode, introSeq]);

  useEffect(() => {
    if (!token || mode !== "app" || !me) return;

    let closed = false;
    wsAuthedRef.current = false;

    const connect = () => {
      try {
        wsRef.current?.close();
      } catch {
        // ignore
      }

      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        try {
          ws.send(JSON.stringify({ type: "auth", token }));
        } catch {
          // ignore
        }
      };

      ws.onmessage = (ev) => {
        let data: any;
        try {
          data = JSON.parse(String(ev.data || ""));
        } catch {
          return;
        }

        if (data?.type === "authed") {
          wsAuthedRef.current = true;
          return;
        }

        if (data?.type === "error") {
          // Don't spam UI for reconnect noise; show only actionable errors.
          const msg = String(data?.error || "");
          if (msg && msg !== "Not authed") setError(msg);
          return;
        }

        if (data?.type === "message") {
          const convo = String(data?.convo || "");
          const m = data?.message as MsgRow | undefined;
          if (!m || !m.id) return;

          const isIncomingDm = convo && convo !== "global" && String(m.fromId || "") && String(m.fromId) !== String(me.id);
          if (isIncomingDm && !doNotDisturbRef.current) {
            try {
              const a = new Audio(notiSfx);
              a.volume = 0.85;
              const p = a.play();
              if (p && typeof (p as Promise<void>).catch === "function") (p as Promise<void>).catch(() => {});
            } catch {
              // ignore
            }
          }

          const view = appViewRef.current;
          const sf = selectedFriendRef.current;

          const activeConvo =
            view === "globalChat"
              ? "global"
              : view === "dm" && sf
                ? makeConvoIdClient(me.id, sf.id)
                : null;

          // Track unread DMs for friends when not currently viewing that DM.
          if (convo && convo !== "global" && String(m.fromId || "") && String(m.fromId) !== String(me.id)) {
            const otherId =
              String(m.fromId) !== String(me.id)
                ? String(m.fromId)
                : m.toId && String(m.toId) !== String(me.id)
                  ? String(m.toId)
                  : otherIdFromConvo(convo, me.id);

            if (otherId && (!activeConvo || convo !== activeConvo)) {
              setUnreadDmByFriendId((prev) => ({
                ...prev,
                [otherId]: Math.min(99, (prev[otherId] || 0) + 1),
              }));
            } else if (otherId && activeConvo && convo === activeConvo) {
              const now = Date.now();
              const last = lastUnreadClearRef.current[otherId] || 0;
              if (now - last > 1000) {
                lastUnreadClearRef.current = { ...lastUnreadClearRef.current, [otherId]: now };
                void clearUnread(token, otherId);
              }
            }
          }

          if (!activeConvo || convo !== activeConvo) return;

          setMessages((prev) => {
            if (prev.some((x) => x.id === m.id)) return prev;
            return [...prev, m];
          });

          setTimeout(() => {
            try {
              const el = msgScrollRef.current;
              if (!el) return;
              el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
            } catch {
              // ignore
            }
          }, 0);
        }

        if (data?.type === "announcement") {
          const m = data?.message as MsgRow | undefined;
          if (!m || !m.id) return;

          const view = appViewRef.current;
          const sf = selectedFriendRef.current;

          const activeConvo =
            view === "globalChat"
              ? "global"
              : view === "dm" && sf
                ? makeConvoIdClient(me.id, sf.id)
                : null;
          if (!activeConvo) return;

          setMessages((prev) => {
            if (prev.some((x) => x.id === m.id)) return prev;
            return [...prev, m];
          });

          setTimeout(() => {
            try {
              const el = msgScrollRef.current;
              if (!el) return;
              el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
            } catch {
              // ignore
            }
          }, 0);
        }

        if (data?.type === "message_deleted") {
          const convo = String(data?.convo || "");
          const id = String(data?.id || "");
          if (!convo || !id) return;

          const view = appViewRef.current;
          const sf = selectedFriendRef.current;

          const activeConvo =
            view === "globalChat"
              ? "global"
              : view === "dm" && sf
                ? makeConvoIdClient(me.id, sf.id)
                : null;
          if (!activeConvo || convo !== activeConvo) return;

          const deletedByAdmin = !!data?.deletedByAdmin;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === id
                ? { ...m, body: "", deleted: true, deletedByAdmin }
                : m,
            ),
          );
        }
      };

      ws.onclose = () => {
        wsAuthedRef.current = false;
        if (closed) return;
        // Basic reconnect.
        window.setTimeout(() => {
          if (!closed) connect();
        }, 2000);
      };
    };

    connect();
    return () => {
      closed = true;
      wsAuthedRef.current = false;
      try {
        wsRef.current?.close();
      } catch {
        // ignore
      }
    };
  }, [token, mode, me]);

  useEffect(() => {
    if (!open) return;
    if (!token || mode !== "app") return;

    const refresh = () => {
      void refreshFriends(token);
    };

    const beat = () => {
      void heartbeat(token);
    };

    refresh();
    beat();

    const friendsTimer = window.setInterval(refresh, 12_000);
    const hbTimer = window.setInterval(beat, 5 * 60_000);
    return () => {
      window.clearInterval(friendsTimer);
      window.clearInterval(hbTimer);
    };
  }, [token, mode, open]);

  useEffect(() => {
    if (!open) return;
    if (!msgScrollRef.current) return;
    const el = msgScrollRef.current;

    const onScroll = () => {
      if (!token) return;
      if (loadingMsgs) return;
      if (!nextCursor) return;
      const withId = appView === "globalChat" ? "global" : appView === "dm" ? selectedFriend?.id : null;
      if (!withId) return;
      if (el.scrollTop <= 10) {
        void loadMessages(token, withId, nextCursor, true);
      }
    };

    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, [token, appView, selectedFriend, loadingMsgs, nextCursor, open]);

  useEffect(() => {
    if (!open) return;
    if (!token || mode !== "app" || !me) return;
    if (appView === "globalChat") {
      if (!loadingMsgs && messages.length === 0) void loadMessages(token, "global");
    } else if (appView === "dm") {
      if (selectedFriend && !loadingMsgs && messages.length === 0) void loadMessages(token, selectedFriend.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, mode, me, appView, open]);

  useEffect(() => {
    const onAnyClick = () => {
      setCtxMenu(null);
      setRequestsOpen(false);
      setAddOpen(false);
    };
    window.addEventListener("click", onAnyClick);
    window.addEventListener("contextmenu", onAnyClick);
    return () => {
      window.removeEventListener("click", onAnyClick);
      window.removeEventListener("contextmenu", onAnyClick);
    };
  }, []);

  const logout = () => {
    if (token) {
      void apiJson("/api/matcha/heartbeat", {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({ state: "offline", reason: "logout" }),
      }).catch(() => {});
    }
    saveToken(null);
    setMe(null);
    setUnreadDmByFriendId({});
    setSelectedFriend(null);
    setMessages([]);
    setNextCursor(null);
    setError("");
    setAppView("friends");
    setRequestsOpen(false);
    setAddOpen(false);
    setCtxMenu(null);
    onClose();
  };

  useEffect(() => {
    if (!token || mode !== "app" || !me) return;
    const sendOffline = () => {
      try {
        void apiJson("/api/matcha/heartbeat", {
          method: "POST",
          headers: authHeaders(token),
          body: JSON.stringify({ state: "offline", reason: "window_close" }),
        }).catch(() => {});
      } catch {
        // ignore
      }
    };

    window.addEventListener("beforeunload", sendOffline);
    window.addEventListener("unload", sendOffline);
    return () => {
      window.removeEventListener("beforeunload", sendOffline);
      window.removeEventListener("unload", sendOffline);
    };
  }, [token, mode, me]);

  const doLogin = async () => {
    setError("");
    const resp = await apiJson("/api/matcha/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handle: loginHandle, password: loginPass }),
    });

    if (!resp?.ok) {
      try {
        const err = String((resp as any)?.error || "Login failed");
        if (err === "Banned" || (resp as any)?.bannedUntil) {
          const untilRaw = (resp as any)?.bannedUntil;
          const untilMs = untilRaw ? new Date(untilRaw).getTime() : 0;
          const remainingMs =
            typeof (resp as any)?.remainingMs === "number"
              ? Math.max(0, Number((resp as any).remainingMs))
              : untilMs
                ? Math.max(0, untilMs - Date.now())
                : 0;
          const reason = String((resp as any)?.reason || "").trim();

          const formatRemaining = (ms: number) => {
            const s = Math.floor(ms / 1000);
            const days = Math.floor(s / 86400);
            const hours = Math.floor((s % 86400) / 3600);
            const mins = Math.floor((s % 3600) / 60);
            if (days > 0) return `${days}d ${hours}h`;
            if (hours > 0) return `${hours}h ${mins}m`;
            return `${Math.max(0, mins)}m`;
          };

          const untilLabel = untilMs ? new Date(untilMs).toLocaleString() : "-";
          const remainingLabel = formatRemaining(remainingMs);
          const reasonLabel = reason || t("friendsMenu.errors.bannedReasonFallback");
          setError(
            t("friendsMenu.errors.banned", {
              reason: reasonLabel,
              until: untilLabel,
              remaining: remainingLabel,
            }),
          );
          return;
        }
      } catch {
        // ignore
      }

      setError(String((resp as any)?.error || "Login failed"));
      return;
    }

    saveToken(String(resp.token || ""));
    setMe(resp.user as MatchaMe);
    setRegisteredHandle(null);
    keepProofRef.current = false;
    setMode("app");
  };

  const doRegister = async () => {
    setError("");
    const resp = await apiJson("/api/matcha/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: regUser, password: regPass, password2: regPass2 }),
    });

    if (!resp?.ok) {
      setError(String(resp?.error || "Register failed"));
      return;
    }

    saveToken(String(resp.token || ""));
    setMe(resp.user as MatchaMe);
    try {
      const h = String((resp.user as MatchaMe | undefined)?.handle || "").trim();
      setRegisteredHandle(h || null);
    } catch {
      setRegisteredHandle(null);
    }
    const pid =
      typeof (resp as any).masterKey === "string"
        ? String((resp as any).masterKey)
        : typeof resp.proofId === "string"
          ? resp.proofId
          : null;
    setProofId(pid);
    keepProofRef.current = !!pid;
    setMode(pid ? "proof" : "app");
  };

  const sendFriendRequest = async () => {
    if (!token) return;
    setError("");
    const resp = await apiJson("/api/matcha/friends/request", {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ toHandle: addHandle }),
    });
    if (!resp?.ok) {
      setError(String(resp?.error || "Failed"));
      return;
    }
    setAddHandle("");
    setAddOpen(false);
    void refreshFriends(token);
  };

  const removeFriend = async (friendId: string) => {
    if (!token) return;
    setError("");
    const resp = await apiJson("/api/matcha/friends/remove", {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ friendId }),
    });
    if (!resp?.ok) {
      setError(String(resp?.error || t("friendsMenu.errors.removeFriendFailed")));
      return;
    }
    if (selectedFriend?.id === friendId && appView === "dm") {
      setAppView("friends");
      setSelectedFriend(null);
      setMessages([]);
      setNextCursor(null);
    }
    void refreshFriends(token);
  };

  const acceptIncoming = async (id: string) => {
    if (!token) return;
    await apiJson("/api/matcha/friends/request/accept", {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ id }),
    }).catch(() => {});
    void refreshFriends(token);
  };

  const rejectIncoming = async (id: string) => {
    if (!token) return;
    await apiJson("/api/matcha/friends/request/reject", {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ id }),
    }).catch(() => {});
    void refreshFriends(token);
  };

  const cancelOutgoing = async (id: string) => {
    if (!token) return;
    await apiJson("/api/matcha/friends/request/cancel", {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ id }),
    }).catch(() => {});
    void refreshFriends(token);
  };

  const openDmChat = async (f: FriendRow) => {
    if (!token) return;
    const unread = unreadDmByFriendId[f.id] || 0;
    setDmUnreadMarker(unread > 0 ? { friendId: f.id, count: unread } : null);
    void clearUnread(token, f.id);
    setAppView("dm");
    setSelectedFriend(f);
    setMessages([]);
    setNextCursor(null);
    setReplyDraft(null);
    await loadMessages(token, f.id);
    setTimeout(() => {
      try {
        msgScrollRef.current?.scrollTo({ top: msgScrollRef.current.scrollHeight });
      } catch {
        // ignore
      }
    }, 0);
  };

  useEffect(() => {
    if (appView !== "dm" || !selectedFriend) {
      setDmUnreadMarker(null);
      return;
    }
    if (dmUnreadMarker && dmUnreadMarker.friendId !== selectedFriend.id) {
      setDmUnreadMarker(null);
    }
  }, [appView, selectedFriend, dmUnreadMarker]);

  const openGlobalChat = async () => {
    if (!token) return;
    setAppView("globalChat");
    setMessages([]);
    setNextCursor(null);
    setReplyDraft(null);
    await loadMessages(token, "global");
    setTimeout(() => {
      try {
        msgScrollRef.current?.scrollTo({ top: msgScrollRef.current.scrollHeight });
      } catch {
        // ignore
      }
    }, 0);
  };

  useEffect(() => {
    if (!open) return;
    if (mode !== "app") return;
    if (openTo !== "globalChat") return;
    void openGlobalChat();
  }, [openToNonce, open, mode, openTo]);

  const sendMessage = async () => {
    if (!token) return;
    const body = msgText.trim();
    if (!body) return;

    const replyTo = replyDraft?.id ? String(replyDraft.id) : "";

    const to = appView === "globalChat" ? "global" : selectedFriend?.handle;
    const withId = appView === "globalChat" ? "global" : selectedFriend?.id;
    if (!to || !withId) {
      setError(t("friendsMenu.errors.selectFriendToChat"));
      return;
    }

    setMsgText("");
  setReplyDraft(null);

    // Prefer WebSocket for low latency.
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN && wsAuthedRef.current) {
      try {
        ws.send(JSON.stringify(replyTo ? { type: "send", to, body, replyTo } : { type: "send", to, body }));
      } catch {
        // fallback to HTTP
        const resp = await apiJson("/api/matcha/messages/send", {
          method: "POST",
          headers: authHeaders(token),
          body: JSON.stringify(replyTo ? { to, body, replyTo } : { to, body }),
        });
        if (!resp?.ok) {
          setError(String(resp?.error || "Failed"));
          return;
        }
        await loadMessages(token, withId);
      }
    } else {
      const resp = await apiJson("/api/matcha/messages/send", {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify(replyTo ? { to, body, replyTo } : { to, body }),
      });
      if (!resp?.ok) {
        setError(String(resp?.error || "Failed"));
        return;
      }
      await loadMessages(token, withId);
    }

    setTimeout(() => {
      try {
        msgScrollRef.current?.scrollTo({ top: msgScrollRef.current.scrollHeight, behavior: "smooth" });
      } catch {
        // ignore
      }
    }, 0);
  };

  const snippet10 = (raw: string) => {
    const s = String(raw || "").replace(/\s+/g, " ").trim();
    if (!s) return "";
    return s.length <= 10 ? s : `${s.slice(0, 10)}…`;
  };

  const startReply = (m: MsgRow, isMe: boolean) => {
    const raw = m.deleted ? "(deleted)" : String(m.body || "");
    setReplyDraft({
      id: m.id,
      fromHandle: isMe ? t("friendsMenu.you") : String(m.fromHandle || "-"),
      snippet: snippet10(raw),
    });
  };

  const copyMessage = async (m: MsgRow) => {
    try {
      if (m.deleted) return;
      const text = String(m.body || "");
      if (!text) return;
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore
    }
  };

  const deleteOwnMessage = async (id: string) => {
    if (!token) return;
    try {
      const r = await apiJson(`/api/matcha/messages/${encodeURIComponent(id)}/delete`, {
        method: "POST",
        headers: authHeaders(token),
      });
      if (!r?.ok) {
        setError(r?.error || t("friendsMenu.errors.deleteFailed"));
        return;
      }
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, body: "", deleted: true, deletedByAdmin: false } : m)));
    } catch {
      setError(t("friendsMenu.errors.deleteFailed"));
    }
  };

  const openReport = (m: MsgRow) => {
    setMsgMenu(null);
    setReport({ open: true, msg: m, category: "", reason: "", details: "", sending: false });
  };

  const submitReport = async () => {
    if (!token) return;
    if (!report.msg) return;
    if (!report.category) {
      setError(t("friendsMenu.errors.reportMissingCategory"));
      return;
    }
    if (report.category !== "other" && !report.reason.trim()) {
      setError(t("friendsMenu.errors.reportMissingReason"));
      return;
    }
    if (report.category === "other" && !report.details.trim()) {
      setError(t("friendsMenu.errors.reportMissingDetails"));
      return;
    }

    try {
      setReport((p) => ({ ...p, sending: true }));
      const r = await apiJson(`/api/matcha/reports`, {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({
          messageId: report.msg.id,
          category: report.category,
          reason: report.category === "other" ? "" : report.reason,
          details: report.details,
        }),
      });
      if (!r?.ok) {
        setReport((p) => ({ ...p, sending: false }));
        setError(r?.error || t("friendsMenu.errors.reportFailed"));
        return;
      }
      setReport({ open: false, msg: null, category: "", reason: "", details: "", sending: false });
    } catch {
      setReport((p) => ({ ...p, sending: false }));
      setError(t("friendsMenu.errors.reportFailed"));
    }
  };

  return (
    <div ref={containerRef} className="relative rounded-xl border border-white/10 bg-black/45 backdrop-blur-md shadow-xl text-white overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-white/5" />

      {mode === "intro" && open ? (
        !introDocked ? (
          <img
            key={`matcha-intro-${introSeq}`}
            src={matchaIcon}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute z-30 matcha-intro-dock"
            onAnimationEnd={() => setIntroDocked(true)}
          />
        ) : (
          <div key={`matcha-intro-spark-${introSeq}`} aria-hidden="true" className="matcha-intro-spark z-30" />
        )
      ) : null}

      <div className="relative p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-normal tracking-wide">
            {mode === "intro" ? (
              <div className={cn("flex items-center gap-2", !introDocked && "opacity-0")}
              >
                <img
                  src={matchaIcon}
                  alt={t("friendsMenu.brand")}
                  className="h-8 w-8 shrink-0"
                />
                <span className="text-xl font-bold normal-case tracking-wide leading-none">{t("friendsMenu.brand")}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <img
                  src={matchaIcon}
                  alt={t("friendsMenu.brand")}
                  className="h-7 w-7 shrink-0"
                />
                <span className="text-base normal-case tracking-wide">{t("friendsMenu.brand")}</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {mode === "app" && me ? (
              <>
                <button
                  type="button"
                  className={cn(
                    "h-9 w-9 rounded-lg border border-white/10 bg-black/35 hover:bg-white/5 transition",
                    "flex items-center justify-center",
                  )}
                  title={t("friendsMenu.profile.open")}
                  aria-label={t("friendsMenu.profile.open")}
                  onClick={() => void openProfile()}
                >
                  <IconUserCircle size={18} className="text-white/80" />
                </button>

                <button
                  type="button"
                  className="h-9 px-3 text-xs rounded-lg border border-white/10 bg-black/35 hover:bg-white/5 transition whitespace-nowrap shrink-0 text-white"
                  onClick={() => {
                    if (appView === "globalChat") {
                      setAppView("friends");
                      setMessages([]);
                      setNextCursor(null);
                      setMsgText("");
                    } else {
                      void openGlobalChat();
                    }
                  }}
                  title={t("friendsMenu.globalChat")}
                >
                  {appView === "globalChat" ? t("friendsMenu.friends") : t("friendsMenu.globalChat")}
                </button>
              </>
            ) : null}

            {me ? (
              <button
                type="button"
                className="h-9 px-3 text-xs rounded-lg border border-white/10 bg-black/35 hover:bg-white/5 transition whitespace-nowrap text-white"
                onClick={logout}
                title={t("friendsMenu.logout")}
              >
                {t("friendsMenu.logout")}
              </button>
            ) : null}
          </div>
        </div>

        {profileOpen && typeof document !== "undefined" && document.body
          ? createPortal(
              <div
                className="fixed inset-0 z-50 flex items-center justify-center glass-backdrop animate-fade-in"
                data-matcha-profile-modal="1"
                onClick={() => setProfileOpen(false)}
                role="dialog"
                aria-modal="true"
                aria-label={t("friendsMenu.profile.title")}
              >
                <div
                  className={cn(
                    "w-full max-w-[420px] rounded-2xl border border-white/10",
                    "bg-black/70 backdrop-blur shadow-2xl p-4",
                  )}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-extrabold tracking-widest text-white/70 uppercase">
                      {t("friendsMenu.profile.title")}
                    </div>
                    <button
                      type="button"
                      className="px-2 py-1 text-xs rounded-lg border border-white/10 bg-black/25 hover:bg-white/5 transition text-white"
                      onClick={() => setProfileOpen(false)}
                    >
                      {t("common.close")}
                    </button>
                  </div>

                  {profileErr ? (
                    <div className="mt-3 text-xs text-red-200 border border-red-400/20 bg-red-500/10 rounded-lg px-2 py-2">
                      {profileErr}
                    </div>
                  ) : null}

                  <div className="mt-3 space-y-2 text-xs">
                    <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
                      <div className="text-[10px] font-extrabold tracking-widest text-white/60 uppercase">
                        {t("friendsMenu.profile.username")}
                      </div>
                      <div className="mt-1 text-sm font-bold text-white/90">
                        {profileLoading ? t("common.loading") : profileUser?.handle || me?.handle || "—"}
                      </div>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
                      <div className="text-[10px] font-extrabold tracking-widest text-white/60 uppercase">
                        {t("friendsMenu.profile.createdAt")}
                      </div>
                      <div className="mt-1 text-sm font-bold text-white/90">
                        {(() => {
                          const raw = profileUser?.createdAt || me?.createdAt;
                          if (profileLoading) return t("common.loading");
                          if (!raw) return "—";
                          const d = new Date(raw);
                          if (Number.isNaN(d.getTime())) return String(raw);
                          return d.toLocaleString();
                        })()}
                      </div>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
                      <div className="text-[10px] font-extrabold tracking-widest text-white/60 uppercase">
                        {t("friendsMenu.profile.totalMessages")}
                      </div>
                      <div className="mt-1 text-sm font-bold text-white/90">
                        {(() => {
                          const u = profileUser || me;
                          const n =
                            typeof u?.messagesSentTotal === "number"
                              ? u.messagesSentTotal
                              : typeof u?.totalMessagesSent === "number"
                                ? u.totalMessagesSent
                                : typeof u?.messagesSent === "number"
                                  ? u.messagesSent
                                  : typeof u?.sentCount === "number"
                                    ? u.sentCount
                                    : null;
                          if (profileLoading) return t("common.loading");
                          return typeof n === "number" ? n.toLocaleString() : "—";
                        })()}
                      </div>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[10px] font-extrabold tracking-widest text-white/60 uppercase">{t("friendsMenu.profile.dndTitle")}</div>
                          <div className="mt-1 text-[11px] text-white/70">{t("friendsMenu.profile.dndHint")}</div>
                        </div>
                        <input
                          type="checkbox"
                          checked={doNotDisturb}
                          onChange={(e) => setDoNotDisturb(e.target.checked)}
                          className="h-4 w-4 accent-yellow-300"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>,
              document.body,
            )
          : null}

        {error ? (
          <div className="mt-2 flex items-start justify-between gap-2 text-xs text-red-300 border border-red-400/20 bg-red-500/10 rounded-lg px-2 py-1">
            <div className="min-w-0 break-words">{error}</div>
            <button
              type="button"
              className="shrink-0 -mt-0.5 px-1 rounded hover:bg-white/10 text-red-200"
              title={t("common.close")}
              aria-label={t("common.close")}
              onClick={() => setError("")}
            >
              ×
            </button>
          </div>
        ) : null}

        {mode === "proof" && proofId ? (
          <div className="mt-3 rounded-lg border border-blue-400/20 bg-blue-500/10 p-3">
            <div className="text-xs font-bold text-blue-200">{t("friendsMenu.proof.uniqueId")}</div>

            {registeredHandle || me?.handle ? (
              <div className="mt-2">
                <div className="text-[11px] font-extrabold tracking-widest text-gray-200/80 uppercase">{t("friendsMenu.proof.yourHandle")}</div>
                <div className="mt-1 flex items-stretch gap-2">
                  <div className="flex-1 text-xs break-all rounded-lg border border-white/10 bg-black/35 p-2">
                    {registeredHandle || me?.handle}
                  </div>
                  <button
                    type="button"
                    className="shrink-0 px-3 rounded-lg font-extrabold text-xs border border-white/10 bg-black/35 hover:bg-white/5 transition"
                    onClick={() => void copyToClipboard(String(registeredHandle || me?.handle || ""))}
                    title={t("friendsMenu.copy")}
                  >
                    {t("friendsMenu.copy")}
                  </button>
                </div>
                <div className="mt-1 text-[11px] text-gray-200/70 leading-snug">
                  {t("friendsMenu.proof.saveHandleHint")}
                </div>
              </div>
            ) : null}

            <div className="mt-2 flex items-stretch gap-2">
              <div className="flex-1 text-xs break-all rounded-lg border border-white/10 bg-black/35 p-2">{proofId}</div>
              <button
                type="button"
                className="shrink-0 px-3 rounded-lg font-extrabold text-xs border border-white/10 bg-black/35 hover:bg-white/5 transition"
                onClick={() => void copyToClipboard(proofId)}
                title={t("friendsMenu.copy")}
              >
                {t("friendsMenu.copy")}
              </button>
            </div>
            <div className="mt-2 text-[11px] text-gray-200/80 leading-snug">
              {t("friendsMenu.proof.uniqueIdHint")}
            </div>
            <button
              type="button"
              className="mt-3 w-full px-3 py-2 rounded-lg font-bold border border-white/10 bg-black/35 hover:bg-white/5 transition"
              onClick={() => {
                keepProofRef.current = false;
                setMode("app");
                setProofId(null);
              }}
            >
              {t("friendsMenu.continue")}
            </button>
          </div>
        ) : null}

        {mode === "intro" ? (
          <div className="mt-3">
            <div className={cn("space-y-4", introDocked ? "matcha-intro-text" : "opacity-0")}>
              <div className="text-sm text-white/75 leading-snug">{t("friendsMenu.intro.subtitle")}</div>

                <div className="space-y-2 text-sm">
                  <div className="rounded-lg border border-white/10 bg-black/25 px-3 py-2">{t("friendsMenu.intro.feature1")}</div>
                  <div className="rounded-lg border border-white/10 bg-black/25 px-3 py-2">{t("friendsMenu.intro.feature2")}</div>
                  <div className="rounded-lg border border-white/10 bg-black/25 px-3 py-2">{t("friendsMenu.intro.feature3")}</div>
                </div>

                <div className="text-sm text-white/80 leading-snug">
                  <div>{t("friendsMenu.intro.cta")}</div>
                  <div className="mt-1 text-white/65">{t("friendsMenu.intro.powered")}</div>
                </div>

                <div className="text-xs text-white/60 leading-snug">
                  <span>{t("friendsMenu.intro.acceptTermsPrefix")} </span>
                  <button
                    type="button"
                    className="text-blue-400 hover:text-blue-300 underline"
                    onClick={onOpenTerms}
                  >
                    {t("friendsMenu.intro.acceptTermsLink")}
                  </button>
                </div>

                <button
                  type="button"
                  className={cn(
                    "w-full px-5 py-2 rounded-lg font-bold text-white",
                    "bg-linear-to-r from-blue-500 to-cyan-400 hover:from-blue-600 hover:to-cyan-500 transition shadow-lg",
                  )}
                  onClick={() => setMode("login")}
                >
                  {t("friendsMenu.continue")}
                </button>
            </div>
          </div>
        ) : null}

        {mode === "login" ? (
          <div className="mt-3">
            <div className="flex gap-2">
              <button
                type="button"
                className={cn(
                  "flex-1 px-3 py-2 rounded-lg text-xs font-bold border border-white/10",
                  "bg-black/35 hover:bg-white/5 transition",
                )}
                onClick={() => setMode("login")}
              >
                {t("friendsMenu.signIn")}
              </button>
              <button
                type="button"
                className={cn(
                  "flex-1 px-3 py-2 rounded-lg text-xs font-bold border border-white/10",
                  "bg-black/35 hover:bg-white/5 transition",
                )}
                onClick={() => setMode("register")}
              >
                {t("friendsMenu.create")}
              </button>
            </div>

            <div className="mt-3 space-y-2">
              <input
                value={loginHandle}
                onChange={(e) => setLoginHandle(e.target.value)}
                placeholder={t("friendsMenu.placeholders.handle")}
                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              />
              <input
                value={loginPass}
                onChange={(e) => setLoginPass(e.target.value)}
                placeholder={t("friendsMenu.placeholders.password")}
                type="password"
                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void doLogin();
                }}
              />
              <button
                type="button"
                className="w-full px-3 py-2 rounded-lg font-bold border border-white/10 bg-black/35 hover:bg-white/5 transition"
                onClick={() => void doLogin()}
              >
                {t("friendsMenu.signIn")}
              </button>
            </div>
          </div>
        ) : null}

        {mode === "register" ? (
          <div className="mt-3">
            <div className="flex gap-2">
              <button
                type="button"
                className={cn(
                  "flex-1 px-3 py-2 rounded-lg text-xs font-bold border border-white/10",
                  "bg-black/35 hover:bg-white/5 transition",
                )}
                onClick={() => setMode("login")}
              >
                {t("friendsMenu.signIn")}
              </button>
              <button
                type="button"
                className={cn(
                  "flex-1 px-3 py-2 rounded-lg text-xs font-bold border border-white/10",
                  "bg-black/35 hover:bg-white/5 transition",
                )}
                onClick={() => setMode("register")}
              >
                {t("friendsMenu.create")}
              </button>
            </div>

            <div className="mt-3 space-y-2">
              <input
                value={regUser}
                onChange={(e) => setRegUser(e.target.value)}
                placeholder={t("friendsMenu.placeholders.username")}
                className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-white/25"
              />
              <div className="text-[11px] text-white/60">
                {t("friendsMenu.register.handleHint")}
              </div>
              <input
                value={regPass}
                onChange={(e) => setRegPass(e.target.value)}
                placeholder={t("friendsMenu.placeholders.password")}
                type="password"
                className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-white/25"
              />
              <input
                value={regPass2}
                onChange={(e) => setRegPass2(e.target.value)}
                placeholder={t("friendsMenu.placeholders.passwordRepeat")}
                type="password"
                className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-white/25"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void doRegister();
                }}
              />
              <button
                type="button"
                className="w-full px-3 py-2 rounded-lg font-bold border border-white/10 bg-black/35 hover:bg-white/5 transition"
                onClick={() => void doRegister()}
              >
                {t("friendsMenu.createAccount")}
              </button>
            </div>
          </div>
        ) : null}

        {mode === "app" && token && !me ? (
          <div className="mt-3 text-xs text-white/70">
            {t("common.loading")}
          </div>
        ) : null}

        {mode === "app" && me ? (
          <div className="mt-3 flex flex-col h-[640px] max-h-[75vh] min-h-0">
            {appView === "friends" ? (
              <>
                <input
                  value={friendSearch}
                  onChange={(e) => setFriendSearch(e.target.value)}
                  placeholder={t("friendsMenu.searchFriends")}
                  className={cn(
                    "w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2",
                    "text-xs placeholder:text-white/40 focus:outline-none focus:border-white/20",
                  )}
                />

                <div className="mt-2">
                  <div className="relative">
                    <button
                      type="button"
                      className={cn(
                        "w-full flex items-center justify-between gap-2",
                        "rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition",
                        "px-3 py-2",
                      )}
                      onClick={(e) => {
                        e.stopPropagation();
                        setRequestsOpen((v) => !v);
                      }}
                    >
                      <div className="min-w-0 text-left">
                        <div className="text-[10px] font-extrabold tracking-widest text-white/70 uppercase">
                          {t("friendsMenu.requests")}
                        </div>
                        <div className="text-xs font-bold truncate">
                          {requestsKind === "incoming"
                            ? t("friendsMenu.requestsIncoming", { count: incoming.length })
                            : t("friendsMenu.requestsOutgoing", { count: outgoing.length })}
                        </div>
                      </div>
                      <IconChevronDown size={16} className={cn("shrink-0 text-white/70 transition", requestsOpen && "rotate-180")} />
                    </button>

                    {requestsOpen ? (
                      <div
                        className={cn(
                          "absolute z-20 mt-2 w-full rounded-lg border border-white/10 bg-black/45 backdrop-blur-md",
                          "p-2 shadow-xl",
                        )}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className={cn(
                              "flex-1 px-2 py-2 rounded-lg border border-white/10 text-xs font-extrabold",
                              requestsKind === "incoming" ? "bg-white/10" : "bg-white/5 hover:bg-white/10",
                            )}
                            onClick={() => setRequestsKind("incoming")}
                          >
                            {t("friendsMenu.received")}
                          </button>
                          <button
                            type="button"
                            className={cn(
                              "flex-1 px-2 py-2 rounded-lg border border-white/10 text-xs font-extrabold",
                              requestsKind === "outgoing" ? "bg-white/10" : "bg-white/5 hover:bg-white/10",
                            )}
                            onClick={() => setRequestsKind("outgoing")}
                          >
                            {t("friendsMenu.sent")}
                          </button>
                        </div>

                        <div className="mt-2 max-h-44 overflow-y-auto dark-scrollbar">
                          {requestsKind === "incoming" ? (
                            incoming.length === 0 ? (
                              <div className="text-xs text-white/60 px-2 py-2">{t("friendsMenu.none")}</div>
                            ) : (
                              <div className="space-y-1">
                                {incoming.map((r) => (
                                  <div
                                    key={r.id}
                                    className="flex items-center justify-between gap-2 px-2 py-2 rounded-lg border border-white/10 bg-white/5"
                                  >
                                    <div className="truncate text-xs font-bold">{r.fromHandle}</div>
                                    <div className="flex gap-2 shrink-0">
                                      <button
                                        type="button"
                                        className="px-2 py-1 text-[10px] rounded-lg border border-white/10 bg-white/5 hover:bg-white/10"
                                        onClick={() => void acceptIncoming(r.id)}
                                      >
                                        {t("friendsMenu.accept")}
                                      </button>
                                      <button
                                        type="button"
                                        className="px-2 py-1 text-[10px] rounded-lg border border-red-400/20 bg-red-500/10 hover:bg-red-500/20 text-red-200"
                                        onClick={() => void rejectIncoming(r.id)}
                                      >
                                        {t("friendsMenu.reject")}
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )
                          ) : outgoing.length === 0 ? (
                            <div className="text-xs text-white/60 px-2 py-2">{t("friendsMenu.none")}</div>
                          ) : (
                            <div className="space-y-1">
                              {outgoing.map((r) => (
                                <div
                                  key={r.id}
                                    className="flex items-center justify-between gap-2 px-2 py-2 rounded-lg border border-white/10 bg-white/5"
                                >
                                  <div className="truncate text-xs font-bold">{r.toHandle}</div>
                                  <button
                                    type="button"
                                    className="px-2 py-1 text-[10px] rounded-lg border border-white/10 bg-white/5 hover:bg-white/10"
                                    onClick={() => void cancelOutgoing(r.id)}
                                  >
                                    {t("friendsMenu.cancel")}
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between gap-2">
                  <div className="text-[11px] font-normal tracking-widest text-white/70 uppercase">
                    {t("friendsMenu.friendsListCounts", { online: friendsOnlineCount, total: friends.length })}
                  </div>
                  <div className="relative">
                    <button
                      type="button"
                      className="p-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition"
                      title={t("friendsMenu.addFriend")}
                      onClick={(e) => {
                        e.stopPropagation();
                        setAddOpen((v) => !v);
                      }}
                    >
                      <IconUserPlus size={18} />
                    </button>

                    {addOpen ? (
                      <div
                        className={cn(
                          "absolute z-30 right-0 mt-2 w-[260px] rounded-lg border border-white/10",
                          "bg-black/45 backdrop-blur-md shadow-xl p-2",
                        )}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="text-[10px] font-extrabold tracking-widest text-white/70 uppercase">
                          {t("friendsMenu.addFriend")}
                        </div>
                        <input
                          value={addHandle}
                          onChange={(e) => setAddHandle(e.target.value)}
                          placeholder={t("friendsMenu.placeholders.handle")}
                          className={cn(
                            "mt-2 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2",
                            "text-xs placeholder:text-white/40 focus:outline-none focus:border-white/20",
                          )}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void sendFriendRequest();
                          }}
                        />
                        <button
                          type="button"
                          className="mt-2 w-full px-3 py-2 rounded-lg font-extrabold text-xs border border-white/10 bg-white/5 hover:bg-white/10 transition"
                          onClick={() => void sendFriendRequest()}
                        >
                          {t("friendsMenu.sendRequest")}
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="mt-2 flex-1 min-h-0 overflow-y-auto dark-scrollbar pr-1">
                  <div className="space-y-1">
                    {filteredFriends.length === 0 ? (
                      <div className="text-xs text-white/60 px-2 py-3">{t("friendsMenu.noFriendsFound")}</div>
                    ) : (
                      filteredFriends.map((f) => {
                        const isOnline = f.state !== "offline";
                        const statusLabel =
                          f.state === "in_game"
                            ? t("friendsMenu.status.inGame")
                            : f.state === "singleplayer"
                              ? t("friendsMenu.status.singleplayer")
                              : f.state === "multiplayer"
                                ? t("friendsMenu.status.multiplayer")
                              : isOnline
                                ? t("friendsMenu.status.online")
                                : t("friendsMenu.status.offline");

                        return (
                          <button
                            key={f.id}
                            type="button"
                            className={cn(
                              "w-full text-left rounded-xl px-3 py-2",
                              "bg-white/5 hover:bg-white/10 border border-white/0 hover:border-white/10",
                              "transition",
                              selectedFriend?.id === f.id && "border-white/10 ring-2 ring-white/10",
                            )}
                            onClick={() => setSelectedFriend(f)}
                            onDoubleClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              void openDmChat(f);
                            }}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              e.stopPropagation();

                              const root = containerRef.current;
                              const rect = root?.getBoundingClientRect();
                              const x0 = rect ? e.clientX - rect.left : e.clientX;
                              const y0 = rect ? e.clientY - rect.top : e.clientY;

                              const x = Math.max(8, Math.min(x0, (rect?.width ?? 520) - 200));
                              const y = Math.max(8, Math.min(y0, (rect?.height ?? 700) - 120));
                              setCtxMenu({ x, y, friend: f });
                            }}
                          >
                            <div className="flex items-center gap-3 min-w-0 w-full">
                              <div className="relative h-10 w-10 rounded-full bg-white/10 border border-white/10 flex items-center justify-center shrink-0">
                                <span className="text-xs font-extrabold text-white/80">{initials(f.handle)}</span>
                                <span
                                  className={cn(
                                    "absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full border-2 border-black/40",
                                    isOnline ? "bg-green-400" : "bg-white/20",
                                  )}
                                />
                              </div>

                              <div className="min-w-0">
                                <div className="truncate text-sm font-extrabold tracking-wide">{f.handle}</div>
                                <div className={cn("mt-0.5 flex items-center gap-2 text-xs", isOnline ? "text-white/75" : "text-white/40")}>
                                  <span className={cn("h-2 w-2 rounded-full", isOnline ? "bg-green-400" : "bg-white/20")} />
                                  <span className="font-semibold">{statusLabel}</span>
                                </div>
                              </div>

                              {unreadDmByFriendId[f.id] ? (
                                <div className="ml-auto shrink-0">
                                  <div
                                    className={cn(
                                      "min-w-[22px] h-[18px] px-1.5",
                                      "rounded-full",
                                      "bg-yellow-400 text-black",
                                      "text-[11px] font-extrabold",
                                      "flex items-center justify-center",
                                    )}
                                    title={t("friendsMenu.unread.badgeTitle")}
                                  >
                                    {unreadDmByFriendId[f.id]}
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>

                  <div className="text-[10px] text-gray-300/60 mt-2">{loadingFriends ? t("friendsMenu.refreshing") : ""}</div>
                </div>

                {ctxMenu ? (
                  <div
                    className={cn(
                      "absolute z-40 rounded-lg border border-white/10 bg-black/70 backdrop-blur-md shadow-xl",
                      "w-[190px] overflow-hidden",
                    )}
                    style={{ left: ctxMenu.x, top: ctxMenu.y }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold hover:bg-white/5 transition"
                      onClick={() => {
                        const f = ctxMenu.friend;
                        setCtxMenu(null);
                        void openDmChat(f);
                      }}
                    >
                      <IconMessage size={16} className="text-white/80" />
                      <span>{t("friendsMenu.ctx.sendMessage")}</span>
                    </button>
                    <button
                      type="button"
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold hover:bg-white/5 transition text-red-200"
                      onClick={() => {
                        const f = ctxMenu.friend;
                        setCtxMenu(null);
                        void removeFriend(f.id);
                      }}
                    >
                      <IconTrash size={16} className="text-red-200" />
                      <span>{t("friendsMenu.ctx.removeFriend")}</span>
                    </button>
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[11px] font-extrabold tracking-widest text-white/70 uppercase">
                    {appView === "globalChat" ? t("friendsMenu.globalChat") : selectedFriend?.handle}
                  </div>
                  <button
                    type="button"
                    className="px-2 py-1 text-xs rounded-lg border border-white/10 bg-black/25 hover:bg-white/5 transition"
                    onClick={() => {
                      setAppView("friends");
                      setMessages([]);
                      setNextCursor(null);
                      setMsgText("");
                      setReplyDraft(null);
                    }}
                  >
                    {t("friendsMenu.backToFriends")}
                  </button>
                </div>

                <div
                  ref={msgScrollRef}
                  className="mt-2 flex-1 min-h-0 overflow-y-auto overflow-x-hidden rounded-xl border border-white/10 bg-black/25 p-2 space-y-2 dark-scrollbar"
                >
                  {loadingMsgs && messages.length === 0 ? <div className="text-xs text-white/50">{t("common.loading")}</div> : null}
                  {messages.map((m, idx) => {
                    const showUnreadSep =
                      appView === "dm" &&
                      !!selectedFriend &&
                      !!dmUnreadMarker &&
                      dmUnreadMarker.friendId === selectedFriend.id &&
                      dmUnreadMarker.count > 0 &&
                      messages.length > 0;

                    const unreadInsertIndex = showUnreadSep
                      ? Math.max(0, messages.length - dmUnreadMarker!.count)
                      : -1;

                    const isMe = me.id === m.fromId;
                    const baseDir: "left" | "right" = isMe ? "left" : "right";
                    const activeDir = msgMenu?.id === m.id ? msgMenu.dir : baseDir;
                    return (
                      <div key={m.id}>
                        {unreadInsertIndex === idx ? (
                          <div className="flex items-center gap-2 py-1">
                            <div className="flex-1 h-px bg-white/10" />
                            <div className="text-[10px] font-extrabold tracking-widest text-yellow-200/90 uppercase">{t("friendsMenu.unread.separator")}</div>
                            <div className="flex-1 h-px bg-white/10" />
                          </div>
                        ) : null}

                        <div className={cn("flex group", isMe ? "justify-end" : "justify-start")}>
                          <div className={cn("max-w-[85%]", isMe ? "text-right" : "text-left")}>
                            <div className={cn("flex items-start gap-2", isMe ? "flex-row" : "flex-row")}>
                            {isMe ? (
                              <div
                                className={cn("relative shrink-0 pt-4", "opacity-0 group-hover:opacity-100 transition")}
                                data-msg-menu-root="1"
                              >
                                <button
                                  type="button"
                                  className="px-1.5 py-1 rounded-lg border border-white/10 bg-black/35 hover:bg-white/5"
                                  onClick={(e) => {
                                    setMsgMenu((prev) => {
                                      if (prev?.id === m.id) return null;
                                      const p = computeMenuPlacement(e.currentTarget as HTMLElement, baseDir);
                                      return { id: m.id, ...p };
                                    });
                                  }}
                                >
                                  {activeDir === "left" ? (
                                    <IconChevronLeft size={14} className="text-white/70" />
                                  ) : (
                                    <IconChevronRight size={14} className="text-white/70" />
                                  )}
                                </button>

                                {msgMenu?.id === m.id ? (
                                  <div
                                    className={cn(
                                      "absolute w-40 rounded-xl border border-white/10 bg-black/70 backdrop-blur p-1 text-xs",
                                      msgMenu.v === "up" ? "bottom-0" : "top-0",
                                      msgMenu.dir === "left" ? "right-full mr-2" : "left-full ml-2",
                                    )}
                                  >
                                    <div className="px-2 py-1 text-[10px] text-white/60">
                                      {t("friendsMenu.msgMenu.sentAt")}: {new Date(m.createdAt).toLocaleString()}
                                    </div>

                                    <button
                                      type="button"
                                      className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-white/5 transition"
                                      onClick={() => {
                                        startReply(m, true);
                                        setMsgMenu(null);
                                      }}
                                    >
                                      {t("friendsMenu.msgMenu.reply")}
                                    </button>
                                    <button
                                      type="button"
                                      className={cn(
                                        "w-full text-left px-2 py-1.5 rounded-lg hover:bg-white/5 transition",
                                        m.deleted && "opacity-50 cursor-not-allowed hover:bg-transparent",
                                      )}
                                      disabled={m.deleted}
                                      onClick={() => {
                                        void copyMessage(m);
                                        setMsgMenu(null);
                                      }}
                                    >
                                      {t("friendsMenu.msgMenu.copy")}
                                    </button>

                                    <button
                                      type="button"
                                      className={cn(
                                        "w-full text-left px-2 py-1.5 rounded-lg hover:bg-white/5 transition text-red-200",
                                        m.deleted && "opacity-50 cursor-not-allowed hover:bg-transparent",
                                      )}
                                      disabled={m.deleted}
                                      onClick={() => {
                                        setMsgMenu(null);
                                        void deleteOwnMessage(m.id);
                                      }}
                                    >
                                      {t("friendsMenu.msgMenu.delete")}
                                    </button>
                                  </div>
                                ) : null}
                              </div>
                            ) : null}

                            <div className="min-w-0">
                              <div className={cn("text-[10px] font-bold", isMe ? "text-blue-300" : "text-gray-300/70")}>
                                {isMe ? (
                                  t("friendsMenu.you")
                                ) : (
                                  <span className="inline-flex items-center gap-1.5">
                                    <span>{m.fromHandle}</span>
                                    {m.fromIsDev ? (
                                      <span className="px-1.5 py-0.5 rounded bg-red-600/80 text-white text-[9px] font-black uppercase">
                                        {t("friendsMenu.devs")}
                                      </span>
                                    ) : null}
                                  </span>
                                )}
                              </div>
                              <div
                                className={cn(
                                  "mt-0.5 px-3 py-2 rounded-2xl text-xs border border-white/10 whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-justify",
                                  isMe ? "bg-blue-600/80" : "bg-white/5",
                                  m.deleted && "italic text-gray-300/70",
                                )}
                              >
                                {m.replyToId ? (
                                  <div className="mb-1 px-2 py-1 rounded-xl border border-white/10 bg-black/20 text-[10px] text-white/70 text-left">
                                    <div className="font-extrabold tracking-widest uppercase text-white/50">
                                      {t("friendsMenu.reply.to")} {String(m.replyToFromHandle || "-")}
                                    </div>
                                    <div className="text-white/80">{String(m.replyToSnippet || "")}</div>
                                  </div>
                                ) : null}

                                {m.deleted
                                  ? m.deletedByAdmin
                                    ? t("friendsMenu.deletedByAdmin")
                                    : t("friendsMenu.deleted")
                                  : m.body}
                              </div>
                            </div>

                            {!isMe ? (
                              <div
                                className={cn("relative shrink-0 pt-4", "opacity-0 group-hover:opacity-100 transition")}
                                data-msg-menu-root="1"
                              >
                                <button
                                  type="button"
                                  className="px-1.5 py-1 rounded-lg border border-white/10 bg-black/35 hover:bg-white/5"
                                  onClick={(e) => {
                                    setMsgMenu((prev) => {
                                      if (prev?.id === m.id) return null;
                                      const p = computeMenuPlacement(e.currentTarget as HTMLElement, baseDir);
                                      return { id: m.id, ...p };
                                    });
                                  }}
                                >
                                  {activeDir === "left" ? (
                                    <IconChevronLeft size={14} className="text-white/70" />
                                  ) : (
                                    <IconChevronRight size={14} className="text-white/70" />
                                  )}
                                </button>

                                {msgMenu?.id === m.id ? (
                                  <div
                                    className={cn(
                                      "absolute w-40 rounded-xl border border-white/10 bg-black/70 backdrop-blur p-1 text-xs",
                                      msgMenu.v === "up" ? "bottom-0" : "top-0",
                                      msgMenu.dir === "left" ? "right-full mr-2" : "left-full ml-2",
                                    )}
                                  >
                                    <div className="px-2 py-1 text-[10px] text-white/60">
                                      {t("friendsMenu.msgMenu.sentAt")}: {new Date(m.createdAt).toLocaleString()}
                                    </div>

                                    <button
                                      type="button"
                                      className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-white/5 transition"
                                      onClick={() => {
                                        startReply(m, false);
                                        setMsgMenu(null);
                                      }}
                                    >
                                      {t("friendsMenu.msgMenu.reply")}
                                    </button>
                                    <button
                                      type="button"
                                      className={cn(
                                        "w-full text-left px-2 py-1.5 rounded-lg hover:bg-white/5 transition",
                                        m.deleted && "opacity-50 cursor-not-allowed hover:bg-transparent",
                                      )}
                                      disabled={m.deleted}
                                      onClick={() => {
                                        void copyMessage(m);
                                        setMsgMenu(null);
                                      }}
                                    >
                                      {t("friendsMenu.msgMenu.copy")}
                                    </button>

                                    <button
                                      type="button"
                                      className={cn(
                                        "w-full text-left px-2 py-1.5 rounded-lg hover:bg-white/5 transition",
                                        m.deleted && "opacity-50 cursor-not-allowed hover:bg-transparent",
                                      )}
                                      disabled={m.deleted}
                                      onClick={() => openReport(m)}
                                    >
                                      {t("friendsMenu.msgMenu.report")}
                                    </button>
                                  </div>
                                ) : null}
                              </div>
                            ) : null}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-2 space-y-2">
                  {replyDraft ? (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-white/10 bg-black/25">
                      <div className="text-[10px] font-extrabold tracking-widest text-white/60 uppercase">{t("friendsMenu.reply.replyingTo")}</div>
                      <div className="flex-1 min-w-0 text-[11px] text-white/80 truncate">
                        {replyDraft.fromHandle}: {replyDraft.snippet}
                      </div>
                      <button
                        type="button"
                        className="px-2 py-1 text-[11px] rounded-lg border border-white/10 bg-black/35 hover:bg-white/5 transition"
                        onClick={() => setReplyDraft(null)}
                      >
                        {t("friendsMenu.reply.cancel")}
                      </button>
                    </div>
                  ) : null}

                  <div className="flex gap-2">
                    <input
                      value={msgText}
                      onChange={(e) => setMsgText(e.target.value)}
                      placeholder={appView === "globalChat" ? t("friendsMenu.placeholders.globalMessage") : t("friendsMenu.placeholders.dmMessage")}
                      disabled={appView === "dm" && !selectedFriend}
                      className={cn(
                        "flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500",
                        appView === "dm" && !selectedFriend && "opacity-60 cursor-not-allowed",
                      )}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void sendMessage();
                      }}
                    />
                    <button
                      type="button"
                      disabled={appView === "dm" && !selectedFriend}
                      className={cn(
                        "px-3 py-2 rounded-lg border border-white/10 bg-black/35 hover:bg-white/5 transition",
                        appView === "dm" && !selectedFriend && "opacity-60 cursor-not-allowed hover:bg-black/35",
                      )}
                      onClick={() => void sendMessage()}
                    >
                      {t("common.send")}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        ) : null}

        {report.open ? (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/50 p-3">
            <div className="w-full max-w-[360px] rounded-2xl border border-white/10 bg-black/70 backdrop-blur p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-extrabold tracking-widest text-white/70 uppercase">{t("friendsMenu.report.title")}</div>
                <button
                  type="button"
                  className="px-2 py-1 text-xs rounded-lg border border-white/10 bg-black/25 hover:bg-white/5 transition"
                  onClick={() => setReport({ open: false, msg: null, category: "", reason: "", details: "", sending: false })}
                  disabled={report.sending}
                >
                  X
                </button>
              </div>

              <div className="mt-2 text-[11px] text-white/70">
                {t("friendsMenu.report.reporting")}{" "}
                <span className="font-bold text-white/80">{report.msg?.fromHandle || "-"}</span>
              </div>

              <div className="mt-3 space-y-2 text-xs">
                <div className="text-[11px] font-bold text-white/70 uppercase">{t("friendsMenu.report.category")}</div>
                {([
                  { k: "security_violence", label: t("friendsMenu.report.cats.security_violence") },
                  { k: "offensive", label: t("friendsMenu.report.cats.offensive") },
                  { k: "spam_quality", label: t("friendsMenu.report.cats.spam_quality") },
                  { k: "other", label: t("friendsMenu.report.cats.other") },
                ] as const).map((c) => (
                  <label key={c.k} className="flex items-center gap-2 p-2 rounded-xl border border-white/10 bg-black/25">
                    <input
                      type="radio"
                      name="repCat"
                      checked={report.category === c.k}
                      onChange={() => setReport((p) => ({ ...p, category: c.k, reason: "", details: "" }))}
                    />
                    <span>{c.label}</span>
                  </label>
                ))}

                {report.category && report.category !== "other" ? (
                  <>
                    <div className="mt-2 text-[11px] font-bold text-white/70 uppercase">{t("friendsMenu.report.reason")}</div>
                    <div className="space-y-2">
                      {report.category === "security_violence" ? (
                        <>
                          {([
                            { k: "threats_violence", label: t("friendsMenu.report.reasons.threats_violence") },
                            { k: "bullying", label: t("friendsMenu.report.reasons.bullying") },
                            { k: "doxxing", label: t("friendsMenu.report.reasons.doxxing") },
                          ] as const).map((r) => (
                            <label key={r.k} className="flex items-center gap-2 p-2 rounded-xl border border-white/10 bg-black/25">
                              <input
                                type="radio"
                                name="repReason"
                                checked={report.reason === r.k}
                                onChange={() => setReport((p) => ({ ...p, reason: r.k }))}
                              />
                              <span>{r.label}</span>
                            </label>
                          ))}
                        </>
                      ) : null}

                      {report.category === "offensive" ? (
                        <>
                          {([
                            { k: "hate_speech", label: t("friendsMenu.report.reasons.hate_speech") },
                            { k: "sexual_nsfw", label: t("friendsMenu.report.reasons.sexual_nsfw") },
                          ] as const).map((r) => (
                            <label key={r.k} className="flex items-center gap-2 p-2 rounded-xl border border-white/10 bg-black/25">
                              <input
                                type="radio"
                                name="repReason"
                                checked={report.reason === r.k}
                                onChange={() => setReport((p) => ({ ...p, reason: r.k }))}
                              />
                              <span>{r.label}</span>
                            </label>
                          ))}
                        </>
                      ) : null}

                      {report.category === "spam_quality" ? (
                        <>
                          {([
                            { k: "spam_ads", label: t("friendsMenu.report.reasons.spam_ads") },
                            { k: "phishing", label: t("friendsMenu.report.reasons.phishing") },
                          ] as const).map((r) => (
                            <label key={r.k} className="flex items-center gap-2 p-2 rounded-xl border border-white/10 bg-black/25">
                              <input
                                type="radio"
                                name="repReason"
                                checked={report.reason === r.k}
                                onChange={() => setReport((p) => ({ ...p, reason: r.k }))}
                              />
                              <span>{r.label}</span>
                            </label>
                          ))}
                        </>
                      ) : null}
                    </div>
                  </>
                ) : null}

                {report.category === "other" ? (
                  <textarea
                    value={report.details}
                    onChange={(e) => setReport((p) => ({ ...p, details: e.target.value }))}
                    placeholder={t("friendsMenu.report.otherPlaceholder")}
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs min-h-[90px] focus:outline-none focus:border-blue-500"
                  />
                ) : null}

                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    className={cn(
                      "flex-1 px-3 py-2 rounded-lg font-bold border border-white/10 bg-black/35 hover:bg-white/5 transition",
                      report.sending && "opacity-60 cursor-not-allowed",
                    )}
                    onClick={() => setReport({ open: false, msg: null, category: "", reason: "", details: "", sending: false })}
                    disabled={report.sending}
                  >
                    {t("common.cancel")}
                  </button>
                  <button
                    type="button"
                    className={cn(
                      "flex-1 px-3 py-2 rounded-lg font-bold border border-white/10 bg-blue-600/80 hover:bg-blue-600/70 transition",
                      report.sending && "opacity-60 cursor-not-allowed",
                    )}
                    onClick={() => void submitReport()}
                    disabled={report.sending}
                  >
                    {t("friendsMenu.report.submit")}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
