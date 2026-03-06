import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  IconArrowUpRight,
  IconCheck,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconCopy,
  IconDeviceGamepad2,
  IconMessage,
  IconPlayerPlay,
  IconPlus,
  IconRefresh,
  IconTrash,
  IconUserCircle,
  IconUserPlus,
  IconX,
} from "@tabler/icons-react";
import { Box, HStack, VStack, Text } from "@chakra-ui/react";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const cn = (...args: (string | boolean | undefined | null)[]): string =>
  args.filter(Boolean).join(" ");
import matchaIcon from "../assets/icons/matcha_bold.svg";
import matchaStartSfx from "../assets/sounds/matchastart.ogg";
import notiSfx from "../assets/sounds/noti.ogg";
import ConfirmModal from "./ConfirmModal";

// ── Extracted imports ──────────────────────────────────────────
import { MATCHA_API_BASE, MATCHA_WS_URL } from "../ipc/channels";
import { StorageService } from "../services/StorageService";
import { ChatService } from "../services/ChatService";
import type {
  MatchaMe,
  MatchaPublicProfile,
  FriendRow,
  FriendRequestRow,
  MsgRow,
  ReportCategory,
} from "../services/ChatService";
import {
  MAX_MSG_LINE_BREAKS,
  countLineBreaks,
  splitHttpLinks,
  openExternalSafe,
  isMongoObjectId,
} from "../features/chat/chatHelpers";
import { KAOMOJI_CATEGORIES } from "../features/chat/kaomojiData";


// ── Local-only types (not shared) ──────────────────────────────

type MsgMenuState = {
  id: string;
  dir: "left" | "right";
  v: "up" | "down";
  baseDir: "left" | "right";
};

type ReportDraft = {
  open: boolean;
  msg: MsgRow | null;
  category: ReportCategory | "";
  reason: string;
  details: string;
  sending: boolean;
};

// ── Local helpers (thin wrappers over services) ────────────────

const apiJson = ChatService.apiJson;

const authHeaders = (token: string | null) => {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
};

// Best-effort: let the main process know our Matcha token so it can send an
// `offline` heartbeat on app quit (renderer unload fetches can be canceled).
const syncTokenToMain = (token: string | null) => {
  try {
    const ipc = (window as any)?.ipcRenderer;
    if (ipc && typeof ipc.send === "function") ipc.send("matcha:token", { token });
  } catch {
    // ignore
  }
};

const readSavedToken = (): string | null => StorageService.getMatchaToken();

const readUnreadMap = (meId: string) => StorageService.getUnreadMap(meId);
const writeUnreadMap = (meId: string, map: Record<string, number>) =>
  StorageService.setUnreadMap(meId, map);
const emitUnreadChanged = (meId: string, map: Record<string, number>) =>
  StorageService.emitUnreadChanged(meId, map);
const readDnd = (meId: string) => StorageService.getDnd(meId);
const writeDnd = (meId: string, enabled: boolean) =>
  StorageService.setDnd(meId, enabled);
const readLastInteractionMap = (meId: string) =>
  StorageService.getLastInteractionMap(meId);
const writeLastInteractionMap = (meId: string, map: Record<string, number>) =>
  StorageService.setLastInteractionMap(meId, map);

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

export default function FriendsMenu({
  onClose,
  open,
  inline,
  onOpenTerms,
  openTo,
  openToNonce,
  launcherUsername,
  gameDir,
}: {
  onClose: () => void;
  open: boolean;
  inline?: boolean;
  onOpenTerms: () => void;
  openTo?: "friends" | "globalChat";
  openToNonce?: number;
  launcherUsername?: string | null;
  gameDir?: string | null;
}) {
  const { t } = useTranslation();

  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);

  const [token, setToken] = useState<string | null>(() => readSavedToken());

  const [me, setMe] = useState<MatchaMe | null>(null);
  const [mode, setMode] = useState<
    "intro" | "login" | "register" | "app" | "proof"
  >(() => (readSavedToken() ? "app" : "intro"));
  const [error, setError] = useState<string>("");
  const [introSeq, setIntroSeq] = useState(0);
  const [introDocked, setIntroDocked] = useState(false);
  const introSfxRef = useRef<HTMLAudioElement | null>(null);
  const hasPlayedIntroRef = useRef(false);

  const [profileOpen, setProfileOpen] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileLoadingUi, setProfileLoadingUi] = useState(false);
  const [profileErr, setProfileErr] = useState<string>("");
  const [profileUser, setProfileUser] = useState<MatchaMe | null>(null);
  const [profileSettingsWorking, setProfileSettingsWorking] = useState(false);
  const [profilePublicPresence, setProfilePublicPresence] = useState<null | {
    state: string;
    server: string;
  }>(null);
  const [profilePublicPresenceLoading, setProfilePublicPresenceLoading] = useState(false);
  const [profilePublicPresenceErr, setProfilePublicPresenceErr] = useState<string>("");
  const profilePublicPresenceInFlightRef = useRef(false);
  const profileFetchInFlightRef = useRef(false);
  const profileLoadingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const [profileUsernameCopied, setProfileUsernameCopied] = useState(false);
  const profileUsernameCopiedTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  // Tiny UX dopamine: otherwise the user will click "Copy" five times, just to be sure.

  const [proofHandleCopied, setProofHandleCopied] = useState(false);
  const proofHandleCopiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const [proofKeyCopied, setProofKeyCopied] = useState(false);
  const proofKeyCopiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const [loginHandle, setLoginHandle] = useState("");
  const [loginPass, setLoginPass] = useState("");

  const [userProfileOpen, setUserProfileOpen] = useState(false);
  const [userProfileLoading, setUserProfileLoading] = useState(false);
  const [userProfileErr, setUserProfileErr] = useState<string>("");
  const [userProfileUser, setUserProfileUser] = useState<MatchaPublicProfile | null>(
    null,
  );
  const [userProfileRequestWorking, setUserProfileRequestWorking] = useState(false);
  const userProfileTargetIdRef = useRef<string>("");

  const [regUser, setRegUser] = useState("");
  const [regPass, setRegPass] = useState("");
  const [regPass2, setRegPass2] = useState("");

  const [registeredHandle, setRegisteredHandle] = useState<string | null>(null);

  const [pendingRegisterId, setPendingRegisterId] = useState<string | null>(
    null,
  );

  const [proofId, setProofId] = useState<string | null>(null);
  const [proofStep, setProofStep] = useState<"show" | "confirm">("show");
  const [proofCheckInput, setProofCheckInput] = useState<string>("");
  const [proofCheckErr, setProofCheckErr] = useState<string>("");
  const keepProofRef = useRef(false);
  const [pendingAuth, setPendingAuth] = useState<
    null | { token: string; user: MatchaMe }
  >(null);

  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [incoming, setIncoming] = useState<FriendRequestRow[]>([]);
  const [outgoing, setOutgoing] = useState<FriendRequestRow[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const friendsRefreshInFlightRef = useRef(false);
  const friendsLoadingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const [myPresence, setMyPresence] = useState<{ state: string; server: string }>(
    {
      state: "offline",
      server: "",
    },
  );
  const [myPresenceLoading, setMyPresenceLoading] = useState(false);
  const myPresenceInFlightRef = useRef(false);

  const [friendsCopyNotice, setFriendsCopyNotice] = useState<string>("");
  const friendsCopyNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const [copiedIpMsgId, setCopiedIpMsgId] = useState<string | null>(null);
  const copiedIpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [joinReqWorkingById, setJoinReqWorkingById] = useState<
    Record<string, "accept" | "decline">
  >({});
  const [lastInteractionByFriendId, setLastInteractionByFriendId] = useState<
    Record<string, number>
  >({});

  const [unreadDmByFriendId, setUnreadDmByFriendId] = useState<
    Record<string, number>
  >({});
  const [dmUnreadMarker, setDmUnreadMarker] = useState<null | {
    friendId: string;
    count: number;
  }>(null);

  const [addHandle, setAddHandle] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  const [avatarHashByUserId, setAvatarHashByUserId] = useState<
    Record<string, string>
  >({});
  const [avatarBrokenByUserId, setAvatarBrokenByUserId] = useState<
    Record<string, boolean>
  >({});
  const [avatarSyncWorking, setAvatarSyncWorking] = useState(false);

  const lastInteractionSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const avatarUrlFor = (userId: string, hash?: string | null): string | null => {
    const h = String(hash || "").trim();
    if (!userId || !h) return null;
    return `${MATCHA_API_BASE}/api/matcha/avatar/${encodeURIComponent(userId)}?v=${encodeURIComponent(h)}`;
  };

  const refreshMyPresence = useCallback(async () => {
    if (!token) return;
    if (!me?.id) return;
    const userId = String(me.id || "").trim();
    if (!isMongoObjectId(userId)) return;
    if (myPresenceInFlightRef.current) return;
    myPresenceInFlightRef.current = true;
    setMyPresenceLoading(true);

    try {
      const resp = await apiJson(
        `/api/matcha/users/${encodeURIComponent(userId)}`,
        {
          method: "GET",
          headers: authHeaders(token),
        },
      );
      if (!resp?.ok) return;

      const u = resp.user as MatchaPublicProfile;
      const p = (u as any)?.presence;
      const state = String(p?.state || "offline");
      const server = String(p?.server || "").trim();
      setMyPresence({ state, server });
    } catch {
      // ignore
    } finally {
      myPresenceInFlightRef.current = false;
      setMyPresenceLoading(false);
    }
  }, [token, me?.id]);

  useEffect(() => {
    if (!open) return;
    if (mode !== "app") return;
    void refreshMyPresence();
    const id = setInterval(() => {
      void refreshMyPresence();
    }, 15_000);
    return () => clearInterval(id);
  }, [open, mode, refreshMyPresence]);

  const refreshProfilePublicPresence = useCallback(async () => {
    if (!token) return;
    if (!me?.id) return;
    const userId = String(me.id || "").trim();
    if (!isMongoObjectId(userId)) return;

    if (profilePublicPresenceInFlightRef.current) return;
    profilePublicPresenceInFlightRef.current = true;
    setProfilePublicPresenceLoading(true);
    setProfilePublicPresenceErr("");

    try {
      const resp = await apiJson(
        `/api/matcha/users/${encodeURIComponent(userId)}`,
        {
          method: "GET",
          headers: authHeaders(token),
        },
      );
      if (!resp?.ok) throw new Error(String(resp?.error || "Failed"));

      const u = resp.user as MatchaPublicProfile;
      const p = (u as any)?.presence;
      const state = String(p?.state || "offline");
      const server = String(p?.server || "").trim();
      setProfilePublicPresence({ state, server });
    } catch (e) {
      setProfilePublicPresenceErr(String((e as any)?.message || "Failed"));
    } finally {
      profilePublicPresenceInFlightRef.current = false;
      setProfilePublicPresenceLoading(false);
    }
  }, [token, me?.id]);

  useEffect(() => {
    if (!profileOpen) return;
    void refreshProfilePublicPresence();
    const id = setInterval(() => {
      void refreshProfilePublicPresence();
    }, 20_000);
    return () => clearInterval(id);
  }, [profileOpen, refreshProfilePublicPresence]);

  const [friendSearch, setFriendSearch] = useState("");

  const [appView, setAppView] = useState<"friends" | "globalChat" | "dm">(
    "friends",
  );
  const [selectedFriend, setSelectedFriend] = useState<FriendRow | null>(null);
  const [messages, setMessages] = useState<MsgRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const nextCursorRef = useRef<string | null>(null);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [msgText, setMsgText] = useState("");
  const msgInputRef = useRef<HTMLTextAreaElement | null>(null);
  const [replyDraft, setReplyDraft] = useState<null | {
    id: string;
    fromHandle: string;
    snippet: string;
  }>(null);

  const [highlightMsgId, setHighlightMsgId] = useState<string | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [kaomojiOpen, setKaomojiOpen] = useState(false);
  const [kaomojiCatId, setKaomojiCatId] = useState<string>(
    KAOMOJI_CATEGORIES[0]?.id || "joy",
  );
  const kaomojiBtnRef = useRef<HTMLButtonElement | null>(null);
  const kaomojiBoxRef = useRef<HTMLDivElement | null>(null);
  const [kaomojiMenuPos, setKaomojiMenuPos] = useState<{ left: number; top: number } | null>(
    null,
  );

  const appViewRef = useRef(appView);
  const selectedFriendRef = useRef<FriendRow | null>(selectedFriend);
  const [doNotDisturb, setDoNotDisturb] = useState(false);
  const doNotDisturbRef = useRef(false);
  const lastUnreadClearRef = useRef<Record<string, number>>({});

  useEffect(() => {
    nextCursorRef.current = nextCursor;
  }, [nextCursor]);

  useEffect(() => {
    if (!open) return;
    const el = msgScrollRef.current;
    if (!el) return;

    const thresholdPx = 240;
    const update = () => {
      try {
        const distance =
          el.scrollHeight - el.clientHeight - Math.max(0, el.scrollTop);
        setShowScrollToBottom(distance > thresholdPx);
      } catch {
        // ignore
      }
    };

    update();
    el.addEventListener("scroll", update);
    return () => el.removeEventListener("scroll", update);
  }, [open, appView, selectedFriend?.id, messages.length]);

  useEffect(() => {
    appViewRef.current = appView;
  }, [appView]);

  useEffect(() => {
    selectedFriendRef.current = selectedFriend;
  }, [selectedFriend]);

  useEffect(() => {
    doNotDisturbRef.current = doNotDisturb;
  }, [doNotDisturb]);

  useEffect(() => {
    if (!kaomojiOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (t.closest?.("[data-kaomoji-root='1']")) return;
      if (t.closest?.("[data-kaomoji-box='1']")) return;
      setKaomojiOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setKaomojiOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [kaomojiOpen]);

  useEffect(() => {
    // Close picker on major view changes.
    setKaomojiOpen(false);
  }, [appView, selectedFriend?.id]);

  useLayoutEffect(() => {
    if (!kaomojiOpen) return;
    const btn = kaomojiBtnRef.current;
    const box = kaomojiBoxRef.current;
    if (!btn || !box) return;

    try {
      const btnRect = btn.getBoundingClientRect();
      const menuRect = box.getBoundingClientRect();

      const pad = 8;
      const vw = Math.max(320, window.innerWidth || 0);
      const vh = Math.max(240, window.innerHeight || 0);

      // Horizontal: align right edges by default.
      let left = btnRect.right - menuRect.width;
      left = Math.max(pad, Math.min(left, vw - menuRect.width - pad));

      // Vertical: prefer opening above; fall back below.
      const aboveTop = btnRect.top - pad - menuRect.height;
      const belowTop = btnRect.bottom + pad;
      let top = aboveTop;
      if (top < pad) top = belowTop;
      top = Math.max(pad, Math.min(top, vh - menuRect.height - pad));

      setKaomojiMenuPos({ left, top });
    } catch {
      // ignore
    }
  }, [kaomojiOpen, kaomojiCatId]);

  const insertKaomoji = (raw: string, keepOpen?: boolean) => {
    const k = String(raw || "");
    if (!k) return;
    const ta = msgInputRef.current;

    const current = ta ? String(ta.value || "") : msgText;
    const selStart =
      ta && typeof ta.selectionStart === "number" ? ta.selectionStart : current.length;
    const selEnd =
      ta && typeof ta.selectionEnd === "number" ? ta.selectionEnd : current.length;

    const before = current.slice(0, selStart);
    const after = current.slice(selEnd);

    const needsLeadingSpace = before.length > 0 && !/\s$/.test(before);
    const needsTrailingSpace = after.length > 0 && !/^\s/.test(after);
    const insert = `${needsLeadingSpace ? " " : ""}${k}${needsTrailingSpace ? " " : ""}`;

    const next = `${before}${insert}${after}`;
    const nextCursor = (before + insert).length;
    setMsgText(next);
    if (!keepOpen) setKaomojiOpen(false);

    // Restore focus + cursor position.
    setTimeout(() => {
      try {
        const el = msgInputRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(nextCursor, nextCursor);
      } catch {
        // ignore
      }
    }, 0);
  };

  const [msgMenu, setMsgMenu] = useState<MsgMenuState | null>(null);
  const msgMenuAnchorRef = useRef<HTMLElement | null>(null);
  const msgMenuBoxRef = useRef<HTMLDivElement | null>(null);
  const [report, setReport] = useState<ReportDraft>({
    open: false,
    msg: null,
    category: "",
    reason: "",
    details: "",
    sending: false,
  });

  useLayoutEffect(() => {
    if (!msgMenu) return;
    try {
      const anchor = msgMenuAnchorRef.current;
      const menuEl = msgMenuBoxRef.current;
      const container = msgScrollRef.current;
      if (!anchor || !menuEl || !container) return;

      const btn = anchor.getBoundingClientRect();
      const box = container.getBoundingClientRect();
      const menuRect = menuEl.getBoundingClientRect();

      // Matches Tailwind `ml-2`/`mr-2` used for the gap.
      const gap = 8;
      // Add a small safety margin so we prefer the roomy side.
      const safe = 6;

      const menuW = menuRect.width + gap + safe;
      const menuH = menuRect.height + safe;

      const spaceRight = box.right - btn.right;
      const spaceLeft = btn.left - box.left;
      const spaceBottom = box.bottom - btn.bottom;
      const spaceTop = btn.top - box.top;

      const baseDir = msgMenu.baseDir;
      let dir: "left" | "right" = baseDir;
      if (baseDir === "right" && spaceRight >= menuW) dir = "right";
      else if (baseDir === "left" && spaceLeft >= menuW) dir = "left";
      else if (spaceRight >= menuW) dir = "right";
      else if (spaceLeft >= menuW) dir = "left";
      else dir = spaceRight >= spaceLeft ? "right" : "left";

      const v: "up" | "down" =
        spaceBottom >= menuH || spaceBottom >= spaceTop ? "down" : "up";

      if (dir === msgMenu.dir && v === msgMenu.v) return;
      setMsgMenu((prev) => {
        if (!prev || prev.id !== msgMenu.id) return prev;
        if (prev.dir === dir && prev.v === v) return prev;
        return { ...prev, dir, v };
      });
    } catch {
      // ignore
    }
  }, [msgMenu?.id, msgMenu?.dir, msgMenu?.v]);

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

      const v: "up" | "down" =
        spaceBottom >= menuH || spaceBottom >= spaceTop ? "down" : "up";
      return { dir, v };
    } catch {
      return { dir: baseDir, v: "down" };
    }
  };

  const [requestsKind, setRequestsKind] = useState<"incoming" | "outgoing">(
    "incoming",
  );
  const [requestsOpen, setRequestsOpen] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [ctxMenu, setCtxMenu] = useState<null | {
    x: number;
    y: number;
    friend: FriendRow;
  }>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const wsAuthedRef = useRef(false);

  const msgScrollRef = useRef<HTMLDivElement | null>(null);
  const pendingPrependAdjustRef = useRef<null | {
    prevTop: number;
    prevHeight: number;
  }>(null);

  useLayoutEffect(() => {
    const pending = pendingPrependAdjustRef.current;
    if (!pending) return;
    const el = msgScrollRef.current;
    if (!el) return;

    // Keep the currently visible content anchored after prepending older rows.
    const delta = el.scrollHeight - pending.prevHeight;
    el.scrollTop = pending.prevTop + Math.max(0, delta);
    pendingPrependAdjustRef.current = null;
  }, [messages.length]);

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

  const sortedFriends = useMemo(() => {
    const byLast = lastInteractionByFriendId;
    const out = [...friends];
    out.sort((a, b) => {
      const aOnline = String(a.state || "").toLowerCase() !== "offline";
      const bOnline = String(b.state || "").toLowerCase() !== "offline";
      if (aOnline !== bOnline) return aOnline ? -1 : 1;

      const at = byLast[a.id] || 0;
      const bt = byLast[b.id] || 0;
      if (bt !== at) return bt - at;

      return String(a.handle || "").localeCompare(String(b.handle || ""), undefined, {
        sensitivity: "base",
      });
    });
    return out;
  }, [friends, lastInteractionByFriendId]);

  const filteredFriends = useMemo(() => {
    const q = friendSearch.trim().toLowerCase();
    if (!q) return sortedFriends;
    return sortedFriends.filter((f) => f.handle.toLowerCase().includes(q));
  }, [sortedFriends, friendSearch]);

  const initials = (handle: string) => {
    const h = String(handle || "").trim();
    if (!h) return "?";
    const base = h.split("#")[0] || h;
    const parts = base.split(/\s+/g).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return base.slice(0, 2).toUpperCase();
  };

  const displayHandle = (handle?: string | null) => {
    const h = String(handle || "").trim();
    if (!h) return h;
    if (/#dev$/i.test(h)) return h.replace(/#dev$/i, "");
    return h;
  };

  const copyToClipboard = async (text: string): Promise<boolean> => {
    const t = String(text || "");
    if (!t) return false;
    try {
      if (navigator?.clipboard?.writeText) {
        // Clipboard API: modern, async, and still somehow a little magical.
        await navigator.clipboard.writeText(t);
        return true;
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
      // execCommand("copy") is the vintage fallback we keep around like a lucky charm.
      return true;
    } catch {
      // ignore
    }

    return false;
  };

  const showFriendsCopyNotice = (text: string) => {
    setFriendsCopyNotice(text);
    if (friendsCopyNoticeTimerRef.current)
      clearTimeout(friendsCopyNoticeTimerRef.current);
    friendsCopyNoticeTimerRef.current = setTimeout(() => {
      setFriendsCopyNotice("");
      friendsCopyNoticeTimerRef.current = null;
    }, 1500);
  };

  useEffect(() => {
    if (profileOpen) return;
    if (profileUsernameCopiedTimerRef.current) {
      clearTimeout(profileUsernameCopiedTimerRef.current);
      profileUsernameCopiedTimerRef.current = null;
    }
    setProfileUsernameCopied(false);
  }, [profileOpen]);

  useEffect(() => {
    if (mode === "proof") return;

    if (proofHandleCopiedTimerRef.current) {
      clearTimeout(proofHandleCopiedTimerRef.current);
      proofHandleCopiedTimerRef.current = null;
    }
    if (proofKeyCopiedTimerRef.current) {
      clearTimeout(proofKeyCopiedTimerRef.current);
      proofKeyCopiedTimerRef.current = null;
    }

    setProofHandleCopied(false);
    setProofKeyCopied(false);
  }, [mode]);

  const saveToken = (t: string | null) => {
    setToken(t);
    try {
      if (!t) StorageService.removeMatchaToken();
      else StorageService.setMatchaToken(t);
    } catch {
      // ignore
    }
  };

  const kickForBan = (raw: any) => {
    try {
      const untilRaw = raw?.bannedUntil;
      const untilMs = untilRaw ? new Date(untilRaw).getTime() : 0;
      const remainingMs =
        typeof raw?.remainingMs === "number"
          ? Math.max(0, Number(raw.remainingMs))
          : untilMs
            ? Math.max(0, untilMs - Date.now())
            : 0;
      const reason = String(raw?.reason || "").trim();

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
    } catch {
      setError(String(raw?.error || "Banned"));
    }

    // Force logout immediately but keep the ban message visible.
    try {
      wsAuthedRef.current = false;
      wsRef.current?.close();
    } catch {
      // ignore
    }
    keepProofRef.current = false;
    setProfileOpen(false);
    setProfileUser(null);
    setUnreadDmByFriendId({});
    setSelectedFriend(null);
    setMessages([]);
    setNextCursor(null);
    setMsgText("");
    setReplyDraft(null);
    setAppView("friends");
    setRequestsOpen(false);
    setAddOpen(false);
    setCtxMenu(null);
    saveToken(null);
  };

  const refreshFriends = async (t: string) => {
    if (friendsRefreshInFlightRef.current) return;
    friendsRefreshInFlightRef.current = true;

    if (friendsLoadingTimerRef.current) {
      clearTimeout(friendsLoadingTimerRef.current);
      friendsLoadingTimerRef.current = null;
    }

    const showLoadingImmediately = friends.length === 0;
    if (showLoadingImmediately) setLoadingFriends(true);
    else {
      friendsLoadingTimerRef.current = setTimeout(() => {
        setLoadingFriends(true);
      }, 250);
    }

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
      if (friendsLoadingTimerRef.current) {
        clearTimeout(friendsLoadingTimerRef.current);
        friendsLoadingTimerRef.current = null;
      }
      setLoadingFriends(false);
      friendsRefreshInFlightRef.current = false;
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

  const loadMessages = async (
    t: string,
    withId: string,
    cursor?: string | null,
    appendOlder?: boolean,
  ) => {
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

      // Track last interaction timestamp for DM ordering.
      if (!appendOlder && withId && withId !== "global") {
        let latest = 0;
        for (const r of rows) {
          const ms = r?.createdAt ? new Date(String(r.createdAt)).getTime() : 0;
          if (Number.isFinite(ms) && ms > latest) latest = ms;
        }
        if (latest > 0) {
          setLastInteractionByFriendId((prev) =>
            prev[withId] === latest ? prev : { ...prev, [withId]: latest },
          );
        }
      }

      if (appendOlder) {
        const el = msgScrollRef.current;
        if (el) {
          pendingPrependAdjustRef.current = {
            prevTop: el.scrollTop,
            prevHeight: el.scrollHeight,
          };
        }
      }

      setNextCursor(nc);
      setMessages((prev) => {
        if (appendOlder) return [...rows, ...prev];
        return rows;
      });
    } finally {
      setLoadingMsgs(false);
    }
  };

  const jumpInFlightRef = useRef(false);
  const jumpToMessage = async (targetId: string) => {
    const id = String(targetId || "").trim();
    if (!id) return;
    const container = msgScrollRef.current;
    if (!container) return;

    const escapeAttr = (raw: string) =>
      String(raw || "")
        .replace(/\\/g, "\\\\")
        .replace(/\"/g, "\\\"");

    const findEl = (): HTMLElement | null => {
      try {
        return container.querySelector(
          `[data-msg-id="${escapeAttr(id)}"]`,
        ) as HTMLElement | null;
      } catch {
        return null;
      }
    };

    const scrollTo = (): boolean => {
      const el = findEl();
      if (!el) return false;
      try {
        const prefersReduced =
          typeof window !== "undefined" &&
          typeof window.matchMedia === "function" &&
          window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        el.scrollIntoView({
          block: "center",
          behavior: prefersReduced ? "auto" : "smooth",
        });

        setHighlightMsgId(id);
        if (highlightTimerRef.current) {
          clearTimeout(highlightTimerRef.current);
          highlightTimerRef.current = null;
        }
        highlightTimerRef.current = setTimeout(() => {
          setHighlightMsgId((prev) => (prev === id ? null : prev));
        }, 1200);

        return true;
      } catch {
        return false;
      }
    };

    if (scrollTo()) return;
    if (!token) return;
    if (jumpInFlightRef.current) return;

    const withId =
      appView === "globalChat"
        ? "global"
        : appView === "dm"
          ? selectedFriend?.id
          : null;
    if (!withId) return;

    jumpInFlightRef.current = true;
    try {
      let cursor = nextCursorRef.current;
      let tries = 0;
      while (!findEl() && cursor && tries < 12) {
        await loadMessages(token, withId, cursor, true);
        await new Promise<void>((r) => requestAnimationFrame(() => r()));
        cursor = nextCursorRef.current;
        tries += 1;
      }
      scrollTo();
    } finally {
      jumpInFlightRef.current = false;
    }
  };

  const openProfile = async () => {
    if (!token) return;
    setProfileOpen(true);
    void refreshProfilePublicPresence();
    setProfileErr("");
    // Keep existing data visible to avoid a noticeable "refresh" flash.
    setProfileUser((prev) => prev ?? me);

    // Always enter loading state, but show the indicator with a tiny delay
    // so the UI doesn't flicker on very fast responses.
    setProfileLoading(true);
    setProfileLoadingUi(false);

    if (profileLoadingTimerRef.current) {
      clearTimeout(profileLoadingTimerRef.current);
      profileLoadingTimerRef.current = null;
    }

    profileLoadingTimerRef.current = setTimeout(() => {
      setProfileLoadingUi(true);
    }, 140);

    if (profileFetchInFlightRef.current) return;
    profileFetchInFlightRef.current = true;
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
    } finally {
      if (profileLoadingTimerRef.current) {
        clearTimeout(profileLoadingTimerRef.current);
        profileLoadingTimerRef.current = null;
      }
      setProfileLoading(false);
      setProfileLoadingUi(false);
      profileFetchInFlightRef.current = false;
    }
  };

  const openUserProfile = async (
    userIdRaw: string,
    opts?: { allowSelfPublic?: boolean },
  ) => {
    if (!token) return;
    if (!me?.id) return;

    const userId = String(userIdRaw || "").trim();
    if (!isMongoObjectId(userId)) return;

    // If the user clicks themselves, normally open the self-profile UI.
    // In global chat we also support opening the public profile view ("as others see you").
    if (String(me.id) === userId && !opts?.allowSelfPublic) {
      void openProfile();
      return;
    }

    setUserProfileOpen(true);
    setUserProfileLoading(true);
    setUserProfileErr("");
    setUserProfileUser(null);
    setUserProfileRequestWorking(false);
    userProfileTargetIdRef.current = userId;

    try {
      const resp = await apiJson(
        `/api/matcha/users/${encodeURIComponent(userId)}`,
        {
          method: "GET",
          headers: authHeaders(token),
        },
      );
      if (!resp?.ok) throw new Error(String(resp?.error || "Failed"));
      if (userProfileTargetIdRef.current !== userId) return;

      const u = resp.user as MatchaPublicProfile;
      setUserProfileUser(u);

      try {
        const h = String(u?.avatarHash || "").trim();
        if (h) {
          setAvatarHashByUserId((prev) =>
            prev[userId] === h ? prev : { ...prev, [userId]: h },
          );
        }
      } catch {
        // ignore
      }
    } catch (e) {
      if (userProfileTargetIdRef.current !== userId) return;
      setUserProfileErr(String((e as any)?.message || "Failed"));
    } finally {
      if (userProfileTargetIdRef.current === userId) {
        setUserProfileLoading(false);
      }
    }
  };

  const sendFriendRequestToHandle = async (toHandleRaw: string) => {
    if (!token) return;

    const toHandle = String(toHandleRaw || "").trim();
    if (!toHandle) return;

    setUserProfileRequestWorking(true);
    setUserProfileErr("");
    try {
      const resp = await apiJson("/api/matcha/friends/request", {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({ toHandle }),
      });
      if (!resp?.ok) throw new Error(String(resp?.error || "Failed"));
      void refreshFriends(token);
    } catch (e) {
      setUserProfileErr(String((e as any)?.message || "Failed"));
    } finally {
      setUserProfileRequestWorking(false);
    }
  };

  const updateHideServerIp = async (nextValue: boolean) => {
    if (!token) return;
    if (profileSettingsWorking) return;

    setProfileSettingsWorking(true);
    try {
      const resp = await apiJson("/api/matcha/me/settings", {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({ hideServerIp: !!nextValue }),
      });
      if (!resp?.ok) throw new Error(String(resp?.error || "Failed"));

      const hideServerIp = !!resp?.settings?.hideServerIp;

      setMe((prev) =>
        prev
          ? {
              ...prev,
              settings: { ...(prev.settings || {}), hideServerIp },
            }
          : prev,
      );
      setProfileUser((prev) =>
        prev
          ? {
              ...prev,
              settings: { ...(prev.settings || {}), hideServerIp },
            }
          : prev,
      );
    } catch (e) {
      setProfileErr(String((e as any)?.message || "Failed"));
    } finally {
      setProfileSettingsWorking(false);
    }
  };

  useEffect(() => {
    syncTokenToMain(token);

    if (!token) {
      setMe(null);
      setUnreadDmByFriendId({});
      setLastInteractionByFriendId({});
      keepProofRef.current = false;
      setMode("intro");
      setIntroSeq((v) => v + 1);
      if (!hasPlayedIntroRef.current) setIntroDocked(false);

      setUserProfileOpen(false);
      setUserProfileLoading(false);
      setUserProfileErr("");
      setUserProfileUser(null);
      setUserProfileRequestWorking(false);
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
        if (!hasPlayedIntroRef.current) setIntroDocked(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [token]);

  useEffect(() => {
    // Presence events are forwarded globally by MatchaBackground.
    // Friends list refresh is handled by polling while the menu is open.
    return;
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
      setLastInteractionByFriendId({});
      return;
    }
    setLastInteractionByFriendId(readLastInteractionMap(me.id));
  }, [me?.id]);

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
    emitUnreadChanged(me.id, unreadDmByFriendId);
  }, [me?.id, unreadDmByFriendId]);

  useEffect(() => {
    if (!me?.id) return;
    writeDnd(me.id, doNotDisturb);
  }, [me?.id, doNotDisturb]);

  useEffect(() => {
    if (!me?.id) return;

    if (lastInteractionSaveTimerRef.current) {
      clearTimeout(lastInteractionSaveTimerRef.current);
      lastInteractionSaveTimerRef.current = null;
    }

    // Debounce localStorage writes; this can update frequently while chatting.
    lastInteractionSaveTimerRef.current = setTimeout(() => {
      writeLastInteractionMap(me.id, lastInteractionByFriendId);
    }, 200);

    return () => {
      if (lastInteractionSaveTimerRef.current) {
        clearTimeout(lastInteractionSaveTimerRef.current);
        lastInteractionSaveTimerRef.current = null;
      }
    };
  }, [me?.id, lastInteractionByFriendId]);

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

      const ws = new WebSocket(MATCHA_WS_URL);
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

        if (data?.type === "avatar_updated") {
          const userId = String(data?.userId || "").trim();
          const avatarHash = String(data?.avatarHash || "").trim();
          const avatarModeRaw = String(data?.avatarMode || "").trim();
          const avatarMode = avatarModeRaw === "custom" ? "custom" : avatarModeRaw === "hytale" ? "hytale" : "";
          const avatarDisabled = !!data?.avatarDisabled;
          if (!userId) return;

          setAvatarHashByUserId((prev) => {
            if (avatarDisabled || !avatarHash) {
              if (!prev[userId]) return prev;
              const next = { ...prev };
              delete next[userId];
              return next;
            }
            return prev[userId] === avatarHash ? prev : { ...prev, [userId]: avatarHash };
          });
          setAvatarBrokenByUserId((prev) => {
            if (!prev[userId]) return prev;
            const next = { ...prev };
            delete next[userId];
            return next;
          });
          setFriends((prev) =>
            prev.map((f) =>
              f.id === userId ? { ...f, avatarHash: avatarDisabled ? "" : avatarHash } : f,
            ),
          );
          setMe((prev) =>
            prev && prev.id === userId
              ? {
                  ...prev,
                  ...(prev.avatarHash === avatarHash ? {} : { avatarHash: avatarDisabled ? "" : avatarHash }),
                  ...(avatarMode ? { avatarMode } : {}),
                  avatarDisabled,
                }
              : prev,
          );
          setProfileUser((prev) =>
            prev && prev.id === userId
              ? {
                  ...prev,
                  ...(prev.avatarHash === avatarHash ? {} : { avatarHash: avatarDisabled ? "" : avatarHash }),
                  ...(avatarMode ? { avatarMode } : {}),
                  avatarDisabled,
                }
              : prev,
          );
          return;
        }

        if (data?.type === "banned") {
          kickForBan(data);
          return;
        }

        if (data?.type === "authed") {
          wsAuthedRef.current = true;
          return;
        }

        if (data?.type === "error") {
          // Don't spam UI for reconnect noise; show only actionable errors.
          const msg = String(data?.error || "");
          if (msg === "Banned") {
            kickForBan(data);
            return;
          }
          if (msg && msg !== "Not authed") setError(msg);
          return;
        }

        if (data?.type === "message") {
          const convo = String(data?.convo || "");
          const m = data?.message as MsgRow | undefined;
          if (!m || !m.id) return;

            // Keep friends ordering in sync with latest DM activity.
            if (convo && convo !== "global") {
              const otherId =
                String(m.fromId) !== String(me.id)
                  ? String(m.fromId)
                  : m.toId && String(m.toId) !== String(me.id)
                    ? String(m.toId)
                    : otherIdFromConvo(convo, me.id);
              if (otherId) {
                const ms = m?.createdAt ? new Date(String(m.createdAt)).getTime() : Date.now();
                const t0 = Number.isFinite(ms) ? ms : Date.now();
                setLastInteractionByFriendId((prev) =>
                  prev[otherId] === t0 ? prev : { ...prev, [otherId]: t0 },
                );
              }
            }

          const isIncomingDm =
            convo &&
            convo !== "global" &&
            String(m.fromId || "") &&
            String(m.fromId) !== String(me.id);
          if (isIncomingDm && !doNotDisturbRef.current) {
            try {
              const a = new Audio(notiSfx);
              a.volume = 0.85;
              const p = a.play();
              if (p && typeof (p as Promise<void>).catch === "function")
                (p as Promise<void>).catch(() => {});
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
          if (
            convo &&
            convo !== "global" &&
            String(m.fromId || "") &&
            String(m.fromId) !== String(me.id)
          ) {
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
                lastUnreadClearRef.current = {
                  ...lastUnreadClearRef.current,
                  [otherId]: now,
                };
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

        if (data?.type === "message_update") {
          const convo = String(data?.convo || "");
          const m = data?.message as MsgRow | undefined;
          if (!convo || !m || !m.id) return;

          const view = appViewRef.current;
          const sf = selectedFriendRef.current;
          const activeConvo =
            view === "globalChat"
              ? "global"
              : view === "dm" && sf
                ? makeConvoIdClient(me.id, sf.id)
                : null;
          if (!activeConvo || convo !== activeConvo) return;

          setMessages((prev) =>
            prev.map((x) => (x.id === m.id ? { ...x, ...m } : x)),
          );
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
    const hbTimer = window.setInterval(beat, 60_000);
    return () => {
      window.clearInterval(friendsTimer);
      window.clearInterval(hbTimer);
    };
  }, [token, mode, open]);

  // Avatar sync: on Matcha login/open and every 10 minutes.
  useEffect(() => {
    if (!open) return;
    if (!token || mode !== "app" || !me) return;
    const meId = String(me.id || "").trim();
    if (!meId) return;
    const user = String(launcherUsername || "").trim();
    const dir = String(gameDir || "").trim();
    if (!user || !dir) return;

    const safeAccountType = (() => {
      try {
        return StorageService.getAccountType();
      } catch {
        return "";
      }
    })();

    const storedMode = StorageService.getAvatarMode(safeAccountType, user).toLowerCase();

    // If the user explicitly chose a custom avatar, don't run the Hytale sync.
    // The backend may ignore the upload, but our local hash update would still
    // override the visible avatar after reopening Friends.
    const effectiveMode = String(me?.avatarMode || storedMode || "")
      .trim()
      .toLowerCase();
    if (effectiveMode === "custom") return;

    const readBgColor = () => StorageService.getAvatarBgColor(safeAccountType, user);

    let stopped = false;

    const doSync = async (force: boolean) => {
      if (avatarSyncWorking && !force) return;
      try {
        if (!force) {
          const isDisabled = StorageService.isAvatarDisabled(safeAccountType, user);
          if (isDisabled || !!me?.avatarDisabled) return;
        }

        setAvatarSyncWorking(true);
        const lastUuid = StorageService.getAvatarLastUuid(safeAccountType, user);
        const lastHash = lastUuid ? StorageService.getAvatarLastHash(lastUuid) : "";

        const customUUID = (() => {
          try {
            const raw = StorageService.get("customUUID") || "";
            return raw.length ? raw : null;
          } catch {
            return null;
          }
        })();

        const bgColor = readBgColor();

        const res = await window.config.matchaAvatarSync({
          gameDir: dir,
          username: user,
          token,
          accountType: safeAccountType,
          customUUID,
          bgColor: bgColor || null,
          lastHash,
          force,
        });

        if (stopped) return;
        if (res && res.ok) {
          StorageService.setAvatarLastUuid(safeAccountType, user, res.uuid);
          StorageService.setAvatarLastHash(res.uuid, res.hash);
          StorageService.setAvatarDisabled(safeAccountType, user, false);

          setAvatarHashByUserId((prev) =>
            prev[meId] === res.hash ? prev : { ...prev, [meId]: res.hash },
          );
          setMe((prev) =>
            prev && prev.avatarHash === res.hash
              ? (prev.avatarDisabled ? { ...prev, avatarDisabled: false } : prev)
              : prev
                ? { ...prev, avatarHash: res.hash, avatarDisabled: false }
                : prev,
          );
          setProfileUser((prev) =>
            prev && prev.avatarHash === res.hash
              ? (prev.avatarDisabled ? { ...prev, avatarDisabled: false } : prev)
              : prev
                ? { ...prev, avatarHash: res.hash, avatarDisabled: false }
                : prev,
          );
        } else {
          const err = typeof (res as any)?.error === "string" ? (res as any).error : "";
          if (err.trim().toLowerCase() === "avatar disabled") {
            StorageService.setAvatarDisabled(safeAccountType, user, true);
            setAvatarHashByUserId((prev) => {
              if (!prev[meId]) return prev;
              const next = { ...prev };
              delete next[meId];
              return next;
            });
            setMe((prev) => (prev ? { ...prev, avatarHash: "", avatarDisabled: true } : prev));
            setProfileUser((prev) =>
              prev ? { ...prev, avatarHash: "", avatarDisabled: true } : prev,
            );
          }
        }
      } catch {
        // ignore
      } finally {
        if (!stopped) setAvatarSyncWorking(false);
      }
    };

    void doSync(false);
    const timer = window.setInterval(() => void doSync(false), 10 * 60_000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [open, token, mode, me?.id, launcherUsername, gameDir]);

  useEffect(() => {
    if (!open) return;
    if (!msgScrollRef.current) return;
    const el = msgScrollRef.current;

    const onScroll = () => {
      if (!token) return;
      if (loadingMsgs) return;
      if (!nextCursor) return;
      const withId =
        appView === "globalChat"
          ? "global"
          : appView === "dm"
            ? selectedFriend?.id
            : null;
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
      if (!loadingMsgs && messages.length === 0)
        void loadMessages(token, "global");
    } else if (appView === "dm") {
      if (selectedFriend && !loadingMsgs && messages.length === 0)
        void loadMessages(token, selectedFriend.id);
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
    setPendingAuth(null);
    setRegisteredHandle(null);
    setProofId(null);
    setProofStep("show");
    setProofCheckInput("");
    setProofCheckErr("");
    keepProofRef.current = false;
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
          const reasonLabel =
            reason || t("friendsMenu.errors.bannedReasonFallback");
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
      body: JSON.stringify({
        username: regUser,
        password: regPass,
        password2: regPass2,
        // New flow: do not create the account until the user confirms the Secure Key.
        deferCreate: true,
      }),
    });

    if (!resp?.ok) {
      setError(String(resp?.error || "Register failed"));
      return;
    }

    const pid =
      typeof (resp as any).masterKey === "string"
        ? String((resp as any).masterKey)
        : typeof resp.proofId === "string"
          ? resp.proofId
          : null;

    // New server flow: pendingId + secure key, no account/token yet.
    const pendingIdRaw =
      typeof (resp as any).pendingId === "string"
        ? String((resp as any).pendingId)
        : null;
    if (pendingIdRaw && pid) {
      setPendingRegisterId(pendingIdRaw);
      setPendingAuth(null);

      try {
        const h =
          typeof (resp as any)?.handle === "string"
            ? String((resp as any).handle).trim()
            : "";
        setRegisteredHandle(h || null);
      } catch {
        setRegisteredHandle(null);
      }
      setProofId(pid);
      setProofStep("show");
      setProofCheckInput("");
      setProofCheckErr("");
      keepProofRef.current = true;
      setMode("proof");
      return;
    }

    // Back-compat: old servers create the account immediately and return token/user.
    const nextToken = String((resp as any).token || "");
    const nextUser = (resp as any).user as MatchaMe;

    // Require a final check (re-enter key) before proceeding.
    if (pid && nextToken && nextUser) {
      setPendingAuth({ token: nextToken, user: nextUser });
      try {
        const h = String((nextUser as MatchaMe | undefined)?.handle || "").trim();
        setRegisteredHandle(h || null);
      } catch {
        setRegisteredHandle(null);
      }
      setPendingRegisterId(null);
      setProofId(pid);
      setProofStep("show");
      setProofCheckInput("");
      setProofCheckErr("");
      keepProofRef.current = true;
      setMode("proof");
      return;
    }

    // Fallback: if server didn't return a key, proceed.
    saveToken(nextToken);
    setMe(nextUser);
    setRegisteredHandle(null);
    setProofId(null);
    setPendingAuth(null);
    setPendingRegisterId(null);
    keepProofRef.current = false;
    setMode("app");
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
      setError(
        String(resp?.error || t("friendsMenu.errors.removeFriendFailed")),
      );
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
        msgScrollRef.current?.scrollTo({
          top: msgScrollRef.current.scrollHeight,
        });
      } catch {
        // ignore
      }
    }, 0);
  };

  const sendQuickDmCommand = async (
    friend: FriendRow,
    command: "/invite" | "/request-to-join",
  ) => {
    if (!token) return;
    const body = String(command || "").trim();
    if (!body) return;
    const to = String(friend?.handle || "").trim();
    const withId = String(friend?.id || "").trim();
    if (!to || !withId) return;

    await openDmChat(friend);

    setLastInteractionByFriendId((prev) => ({
      ...prev,
      [withId]: Date.now(),
    }));

    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN && wsAuthedRef.current) {
      try {
        ws.send(JSON.stringify({ type: "send", to, body }));
      } catch {
        const resp = await apiJson("/api/matcha/messages/send", {
          method: "POST",
          headers: authHeaders(token),
          body: JSON.stringify({ to, body }),
        });
        if (!resp?.ok) {
          if (String((resp as any)?.error || "") === "Banned" || (resp as any)?.bannedUntil) {
            kickForBan(resp);
            return;
          }
          setError(String(resp?.error || "Failed"));
          return;
        }
        await loadMessages(token, withId);
      }
    } else {
      const resp = await apiJson("/api/matcha/messages/send", {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({ to, body }),
      });
      if (!resp?.ok) {
        if (String((resp as any)?.error || "") === "Banned" || (resp as any)?.bannedUntil) {
          kickForBan(resp);
          return;
        }
        setError(String(resp?.error || "Failed"));
        return;
      }
      await loadMessages(token, withId);
    }

    setTimeout(() => {
      try {
        msgScrollRef.current?.scrollTo({
          top: msgScrollRef.current.scrollHeight,
          behavior: "smooth",
        });
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
        msgScrollRef.current?.scrollTo({
          top: msgScrollRef.current.scrollHeight,
        });
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

    if (withId !== "global") {
      setLastInteractionByFriendId((prev) => ({
        ...prev,
        [withId]: Date.now(),
      }));
    }

    setMsgText("");
    setReplyDraft(null);

    // Prefer WebSocket for low latency.
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN && wsAuthedRef.current) {
      try {
        ws.send(
          JSON.stringify(
            replyTo
              ? { type: "send", to, body, replyTo }
              : { type: "send", to, body },
          ),
        );
      } catch {
        // fallback to HTTP
        const resp = await apiJson("/api/matcha/messages/send", {
          method: "POST",
          headers: authHeaders(token),
          body: JSON.stringify(replyTo ? { to, body, replyTo } : { to, body }),
        });
        if (!resp?.ok) {
          if (String((resp as any)?.error || "") === "Banned" || (resp as any)?.bannedUntil) {
            kickForBan(resp);
            return;
          }
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
        if (String((resp as any)?.error || "") === "Banned" || (resp as any)?.bannedUntil) {
          kickForBan(resp);
          return;
        }
        setError(String(resp?.error || "Failed"));
        return;
      }
      await loadMessages(token, withId);
    }

    setTimeout(() => {
      try {
        msgScrollRef.current?.scrollTo({
          top: msgScrollRef.current.scrollHeight,
          behavior: "smooth",
        });
      } catch {
        // ignore
      }
    }, 0);
  };

  const snippet10 = (raw: string) => {
    const s = String(raw || "")
      .replace(/\s+/g, " ")
      .trim();
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

  const copyServerIp = async (msgId: string, server: string) => {
    const s = String(server || "").trim();
    if (!s) return;
    const ok = await copyToClipboard(s);
    if (!ok) return;

    setCopiedIpMsgId(msgId);
    if (copiedIpTimerRef.current) clearTimeout(copiedIpTimerRef.current);
    copiedIpTimerRef.current = setTimeout(() => {
      setCopiedIpMsgId(null);
      copiedIpTimerRef.current = null;
    }, 1500);
  };

  const acceptJoinRequest = async (msgId: string) => {
    if (!token) return;
    const id = String(msgId || "").trim();
    if (!isMongoObjectId(id)) return;
    if (joinReqWorkingById[id]) return;

    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== id) return m;
        const meta = m.meta && typeof m.meta === "object" ? m.meta : {};
        return { ...m, meta: { ...meta, status: "accepted" } };
      }),
    );

    setJoinReqWorkingById((prev) => ({ ...prev, [id]: "accept" }));
    try {
      const r = await apiJson(
        `/api/matcha/join-requests/${encodeURIComponent(id)}/accept`,
        {
          method: "POST",
          headers: authHeaders(token),
        },
      );
      if (!r?.ok) {
        setError(String(r?.error || "Failed"));
        return;
      }
    } catch (e) {
      setError(String((e as any)?.message || "Failed"));
    } finally {
      setJoinReqWorkingById((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  };

  const declineJoinRequest = async (msgId: string) => {
    if (!token) return;
    const id = String(msgId || "").trim();
    if (!isMongoObjectId(id)) return;
    if (joinReqWorkingById[id]) return;

    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== id) return m;
        const meta = m.meta && typeof m.meta === "object" ? m.meta : {};
        return { ...m, meta: { ...meta, status: "declined" } };
      }),
    );

    setJoinReqWorkingById((prev) => ({ ...prev, [id]: "decline" }));
    try {
      const r = await apiJson(
        `/api/matcha/join-requests/${encodeURIComponent(id)}/decline`,
        {
          method: "POST",
          headers: authHeaders(token),
        },
      );
      if (!r?.ok) {
        setError(String(r?.error || "Failed"));
        return;
      }
    } catch (e) {
      setError(String((e as any)?.message || "Failed"));
    } finally {
      setJoinReqWorkingById((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  };

  const deleteOwnMessage = async (id: string) => {
    if (!token) return;
    try {
      const r = await apiJson(
        `/api/matcha/messages/${encodeURIComponent(id)}/delete`,
        {
          method: "POST",
          headers: authHeaders(token),
        },
      );
      if (!r?.ok) {
        setError(r?.error || t("friendsMenu.errors.deleteFailed"));
        return;
      }
      const deletedByAdmin =
        typeof (r as any)?.deletedByAdmin === "boolean"
          ? !!(r as any).deletedByAdmin
          : false;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === id
            ? { ...m, body: "", deleted: true, deletedByAdmin }
            : m,
        ),
      );
    } catch {
      setError(t("friendsMenu.errors.deleteFailed"));
    }
  };

  const openReport = (m: MsgRow) => {
    setMsgMenu(null);
    setReport({
      open: true,
      msg: m,
      category: "",
      reason: "",
      details: "",
      sending: false,
    });
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
      setReport({
        open: false,
        msg: null,
        category: "",
        reason: "",
        details: "",
        sending: false,
      });
    } catch {
      setReport((p) => ({ ...p, sending: false }));
      setError(t("friendsMenu.errors.reportFailed"));
    }
  };

  return (
    <Box
      ref={containerRef}
      className="no-drag"
      position="relative"
      color="white"
      overflow="hidden"
      rounded={inline ? undefined : "xl"}
      border={inline ? undefined : "1px solid"}
      borderColor={inline ? undefined : "rgba(255,255,255,0.1)"}
      bg={inline ? undefined : "rgba(0,0,0,0.45)"}
      style={inline ? undefined : { backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}
      boxShadow={inline ? undefined : "xl"}
      h={inline ? "full" : undefined}
      display={inline ? "flex" : undefined}
      flexDirection={inline ? "column" : undefined}
    >
      <Box pointerEvents="none" position="absolute" inset={0} bg="rgba(255,255,255,0.05)" />

      {mode === "intro" && open ? (
        !introDocked ? (
          <img
            key={`matcha-intro-${introSeq}`}
            src={matchaIcon}
            alt=""
            aria-hidden="true"
            className="matcha-intro-dock"
            style={{pointerEvents:"none", position:"absolute", zIndex:30}}
            onAnimationEnd={() => { setIntroDocked(true); hasPlayedIntroRef.current = true; }}
          />
        ) : (
          <img
            src={matchaIcon}
            alt=""
            aria-hidden="true"
            style={{pointerEvents:"none", position:"absolute", zIndex:10, left:"50%", top:"52px", width:"48px", height:"48px", transform:"translateX(-50%)"}}
          />
        )
      ) : null}

      <Box
        position="relative"
        p={4}
        flex={inline ? "1" : undefined}
        minH={inline ? 0 : undefined}
        display={inline ? "flex" : undefined}
        flexDirection={inline ? "column" : undefined}
        overflow={inline ? "hidden" : undefined}
      >
        {error ? (
          <Box position="absolute" left={4} right={4} top={16} zIndex={50}>
            <HStack
              align="start"
              gap={3}
              fontSize="xs"
              color="red.100"
              rounded="xl"
              border="1px solid"
              borderColor="rgba(252,165,165,0.4)"
              bg="rgba(239,68,68,0.2)"
              style={{ backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }}
              px={3}
              py={2}
              boxShadow="0 0 0 4px rgba(239,68,68,0.25)"
              role="alert"
            >
              <Box minW={0} style={{ wordBreak: "break-word" }}>{error}</Box>
              <button
                type="button"
                style={{
                  flexShrink: 0,
                  marginTop: "-2px",
                  width: "28px",
                  height: "28px",
                  borderRadius: "8px",
                  border: "1px solid rgba(252,165,165,0.3)",
                  background: "rgba(0,0,0,0.2)",
                  color: "#fecaca",
                  fontWeight: 800,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                }}
                title={t("common.close")}
                aria-label={t("common.close")}
                onClick={() => setError("")}
              >
                ×
              </button>
            </HStack>
          </Box>
        ) : null}

        <HStack justify="space-between" gap={2}>
          {!inline && (
            <Box fontSize="sm" fontWeight="normal" letterSpacing="wide">
              {mode === "intro" ? null : (
                <HStack gap={2}>
                  <img
                    src={matchaIcon}
                    alt={t("friendsMenu.brand")}
                    style={{ height: "28px", width: "28px", flexShrink: 0 }}
                  />
                  <Text fontSize="md" textTransform="none" letterSpacing="wide">
                    {t("friendsMenu.brand")}
                  </Text>
                </HStack>
              )}
            </Box>
          )}

          <HStack gap={2}>
            {mode === "app" && me ? (
              <>
                <button
                  type="button"
                  style={{
                    position: "relative",
                    height: "36px",
                    width: "36px",
                    borderRadius: "9999px",
                    border: "1px solid rgba(255,255,255,0.1)",
                    background: "rgba(0,0,0,0.35)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                    cursor: "pointer",
                    outline: "none",
                    color: "white",
                  }}
                  title={t("friendsMenu.profile.open")}
                  aria-label={t("friendsMenu.profile.open")}
                  onClick={() => void openProfile()}
                >
                  <IconUserCircle
                    style={{ position: "absolute", inset: 0, height: "100%", width: "100%", color: "rgba(255,255,255,0.35)", pointerEvents: "none" }}
                    stroke={1.6}
                  />

                  {(() => {
                    const userId = String(me.id || "").trim();
                    const h =
                      avatarHashByUserId[userId] || String(me.avatarHash || "").trim();
                    const broken = !!avatarBrokenByUserId[userId];
                    const src = !broken ? avatarUrlFor(userId, h) : null;
                    if (src) {
                      return (
                        <Box position="relative" h="28px" w="28px" rounded="full" overflow="hidden" border="1px solid rgba(255,255,255,0.1)" bg="rgba(0,0,0,0.35)">
                          <img
                            src={src}
                            alt={String(me.handle || "")}
                            style={{ height: "100%", width: "100%", objectFit: "cover" }}
                            onError={() =>
                              setAvatarBrokenByUserId((prev) => ({
                                ...prev,
                                [userId]: true,
                              }))
                            }
                          />
                        </Box>
                      );
                    }
                    return (
                      <Box position="relative" h="28px" w="28px" rounded="full" overflow="hidden" border="1px solid rgba(255,255,255,0.1)" bg="rgba(0,0,0,0.35)" display="flex" alignItems="center" justifyContent="center">
                        <Text fontSize="10px" fontWeight="extrabold" color="rgba(255,255,255,0.8)">
                          {initials(String(me.handle || ""))}
                        </Text>
                      </Box>
                    );
                  })()}
                </button>

                <button
                  type="button"
                  style={{ height: "36px", padding: "0 12px", fontSize: "0.75rem", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.1)", background: "rgba(0,0,0,0.35)", color: "white", cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0, fontFamily: "inherit" }}
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
                  {appView === "globalChat"
                    ? t("friendsMenu.friends")
                    : t("friendsMenu.globalChat")}
                </button>
              </>
            ) : null}

            {me ? (
              <button
                type="button"
                style={{ height: "36px", padding: "0 12px", fontSize: "0.75rem", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.1)", background: "rgba(0,0,0,0.35)", color: "white", cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit" }}
                onClick={() => setLogoutConfirmOpen(true)}
                title={t("friendsMenu.logout")}
              >
                {t("friendsMenu.logout")}
              </button>
            ) : null}
          </HStack>
        </HStack>

        <ConfirmModal
          open={logoutConfirmOpen}
          title={t("friendsMenu.logoutConfirmTitle")}
          message={t("friendsMenu.logoutConfirmMessage")}
          cancelText={t("common.cancel")}
          confirmText={t("friendsMenu.logout")}
          onCancel={() => setLogoutConfirmOpen(false)}
          onConfirm={() => {
            setLogoutConfirmOpen(false);
            logout();
          }}
        />

        {profileOpen && typeof document !== "undefined" && document.body
          ? createPortal(
              <Box
                position="fixed"
                inset={0}
                zIndex={50}
                display="flex"
                alignItems="center"
                justifyContent="center"
                className="glass-backdrop animate-fade-in"
                data-matcha-profile-modal="1"
                onMouseDown={(e: React.MouseEvent) => {
                  if (e.target !== e.currentTarget) return;
                  e.preventDefault();
                  e.stopPropagation();
                  setProfileOpen(false);
                }}
                onClick={(e: React.MouseEvent) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                role="dialog"
                aria-modal="true"
                aria-label={t("friendsMenu.profile.title")}
              >
                <Box
                  w="full"
                  maxW="420px"
                  rounded="2xl"
                  border="1px solid"
                  borderColor="rgba(255,255,255,0.1)"
                  bg="rgba(0,0,0,0.7)"
                  style={{ backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}
                  boxShadow="2xl"
                  p={4}
                  className="animate-popIn"
                  onClick={(e: React.MouseEvent) => e.stopPropagation()}
                  onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}
                >
                  <HStack justify="space-between" gap={2}>
                    <Text fontSize="10px" fontWeight="extrabold" letterSpacing="widest" color="rgba(255,255,255,0.7)" textTransform="uppercase">
                      {t("friendsMenu.profile.title")}
                    </Text>
                    <button
                      type="button"
                      style={{ padding: "4px 8px", fontSize: "0.75rem", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.1)", background: "rgba(0,0,0,0.25)", color: "white", cursor: "pointer", fontFamily: "inherit" }}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setProfileOpen(false);
                      }}
                    >
                      {t("common.close")}
                    </button>
                  </HStack>

                  <Box
                    mt={1}
                    fontSize="10px"
                    fontWeight="bold"
                    letterSpacing="widest"
                    textTransform="uppercase"
                    color="rgba(255,255,255,0.5)"
                    transition="opacity 0.2s"
                    opacity={profileLoadingUi ? 1 : 0}
                    aria-live="polite"
                  >
                    {t("common.loading")}
                  </Box>

                  {profileErr ? (
                    <Box mt={3} fontSize="xs" color="red.200" border="1px solid rgba(248,113,113,0.2)" bg="rgba(239,68,68,0.1)" rounded="lg" px={2} py={2}>
                      {profileErr}
                    </Box>
                  ) : null}

                  <VStack mt={3} gap={2} fontSize="xs" align="stretch" transition="opacity 0.2s" opacity={profileLoadingUi ? 0.7 : 1}>
                    <Box rounded="xl" border="1px solid" borderColor="rgba(255,255,255,0.1)" bg="rgba(0,0,0,0.25)" px={3} py={2}>
                      <Text fontSize="10px" fontWeight="extrabold" letterSpacing="widest" color="rgba(255,255,255,0.6)" textTransform="uppercase">
                        {t("friendsMenu.profile.avatar")}
                      </Text>
                      <HStack mt={2} justify="space-between" gap={2}>
                        <Box position="relative" h="56px" w="56px" rounded="full" bg="rgba(255,255,255,0.1)" border="1px solid" borderColor="rgba(255,255,255,0.1)" display="flex" alignItems="center" justifyContent="center" flexShrink={0} overflow="hidden">
                          {(() => {
                            const u = profileUser || me;
                            const userId = String(u?.id || "");
                            const h =
                              avatarHashByUserId[userId] ||
                              String(u?.avatarHash || "").trim();
                            const broken = !!avatarBrokenByUserId[userId];
                            const src = !broken ? avatarUrlFor(userId, h) : null;
                            if (!src) {
                              return (
                                <Text fontSize="xs" fontWeight="extrabold" color="rgba(255,255,255,0.8)">
                                  {initials(String(u?.handle || ""))}
                                </Text>
                              );
                            }

                            return (
                              <img
                                src={src}
                                alt={String(u?.handle || "")}
                                style={{ height: "100%", width: "100%", objectFit: "cover" }}
                                onError={() =>
                                  setAvatarBrokenByUserId((prev) => ({
                                    ...prev,
                                    [userId]: true,
                                  }))
                                }
                              />
                            );
                          })()}
                        </Box>

                        <Box display="flex" flexWrap="wrap" alignItems="center" justifyContent="flex-end" gap={2} minW={0}>
                          {(() => {
                            const u = profileUser || me;
                            const isSelf = !!me && String(u?.id || "") === String(me.id || "");
                            const avatarMode = String(u?.avatarMode || "hytale").trim() === "custom" ? "custom" : "hytale";
                            const isCustom = avatarMode === "custom";

                            const safeAccountType = (() => {
                              try {
                                return StorageService.getAccountType();
                              } catch {
                                return "";
                              }
                            })();

                            const user = String(launcherUsername || "").trim();
                            const dir = String(gameDir || "").trim();

                            const disabled =
                              !isSelf ||
                              profileLoading ||
                              avatarSyncWorking ||
                              !token ||
                              mode !== "app";

                            const uploadCustom = () => {
                              if (disabled) return;
                              void (async () => {
                                try {
                                  setAvatarSyncWorking(true);
                                  const picked = await window.config.pickFile({
                                    title: t(
                                      isCustom
                                        ? "friendsMenu.profile.changeAvatar"
                                        : "friendsMenu.profile.uploadAvatar",
                                    ),
                                    extensions: ["png", "jpg", "jpeg", "webp"],
                                  });
                                  if (!picked?.ok || !picked.path) return;

                                  if (profileErr) setProfileErr("");

                                  const res = await window.config.matchaAvatarUploadCustom({
                                    token,
                                    filePath: picked.path,
                                  });
                                  if (!res || !res.ok) {
                                    const raw = String((res as any)?.error || "").trim();
                                    const isRequirementsError =
                                      /\b(file too large|avatar too large|avatar must be 92x92)\b/i.test(
                                        raw,
                                      );
                                    if (isRequirementsError) {
                                      setProfileErr(
                                        t("friendsMenu.profile.avatarRequirementsError"),
                                      );
                                    } else if (raw) {
                                      setProfileErr(raw);
                                    }
                                    return;
                                  }

                                  if (profileErr) setProfileErr("");

                                  const meId = String(me?.id || "").trim();
                                  if (meId) {
                                    setAvatarHashByUserId((prev) =>
                                      prev[meId] === res.hash
                                        ? prev
                                        : { ...prev, [meId]: res.hash },
                                    );
                                    setAvatarBrokenByUserId((prev) => {
                                      if (!prev[meId]) return prev;
                                      const next = { ...prev };
                                      delete next[meId];
                                      return next;
                                    });
                                  }

                                  setMe((prev) =>
                                    prev
                                      ? {
                                          ...prev,
                                          avatarHash: res.hash,
                                          avatarMode: "custom",
                                          avatarDisabled: false,
                                        }
                                      : prev,
                                  );
                                  setProfileUser((prev) =>
                                    prev
                                      ? {
                                          ...prev,
                                          avatarHash: res.hash,
                                          avatarMode: "custom",
                                          avatarDisabled: false,
                                        }
                                      : prev,
                                  );

                                  StorageService.setAvatarDisabled(safeAccountType, user, false);
                                  if (user) StorageService.setAvatarMode(safeAccountType, user, "custom");
                                } catch {
                                  // ignore
                                } finally {
                                  setAvatarSyncWorking(false);
                                }
                              })();
                            };

                            const removeAvatar = () => {
                              if (disabled) return;
                              void (async () => {
                                try {
                                  setAvatarSyncWorking(true);
                                  const resp = await apiJson("/api/matcha/avatar", {
                                    method: "DELETE",
                                    headers: authHeaders(token),
                                  });
                                  if (!resp || !resp.ok) return;

                                  const meId = String(me?.id || "").trim();
                                  if (meId) {
                                    setAvatarHashByUserId((prev) => {
                                      if (!prev[meId]) return prev;
                                      const next = { ...prev };
                                      delete next[meId];
                                      return next;
                                    });
                                    setAvatarBrokenByUserId((prev) => {
                                      if (!prev[meId]) return prev;
                                      const next = { ...prev };
                                      delete next[meId];
                                      return next;
                                    });
                                  }

                                  setMe((prev) =>
                                    prev
                                      ? {
                                          ...prev,
                                          avatarHash: "",
                                          avatarMode: "hytale",
                                          avatarDisabled: true,
                                        }
                                      : prev,
                                  );
                                  setProfileUser((prev) =>
                                    prev
                                      ? {
                                          ...prev,
                                          avatarHash: "",
                                          avatarMode: "hytale",
                                          avatarDisabled: true,
                                        }
                                      : prev,
                                  );

                                  StorageService.setAvatarDisabled(safeAccountType, user, true);
                                  if (user) StorageService.setAvatarMode(safeAccountType, user, "disabled");
                                } catch {
                                  // ignore
                                } finally {
                                  setAvatarSyncWorking(false);
                                }
                              })();
                            };

                            const useHytale = () => {
                              if (disabled) return;
                              if (!user || !dir) return;

                              const lastUuid = StorageService.getAvatarLastUuid(safeAccountType, user);
                              const lastHash = lastUuid ? StorageService.getAvatarLastHash(lastUuid) : "";
                              const customUUID = StorageService.getString("customUUID") || null;
                              const bgColor = StorageService.getAvatarBgColor(safeAccountType, user);

                              void (async () => {
                                try {
                                  setAvatarSyncWorking(true);
                                  const res = await window.config.matchaAvatarSync({
                                    gameDir: dir,
                                    username: user,
                                    token,
                                    accountType: safeAccountType,
                                    customUUID,
                                    bgColor: bgColor || null,
                                    lastHash,
                                    force: true,
                                  });
                                  if (res && res.ok) {
                                    StorageService.setAvatarLastUuid(safeAccountType, user, res.uuid);
                                    StorageService.setAvatarLastHash(res.uuid, res.hash);

                                    const meId = String(me?.id || "").trim();
                                    if (meId) {
                                      setAvatarHashByUserId((prev) =>
                                        prev[meId] === res.hash
                                          ? prev
                                          : { ...prev, [meId]: res.hash },
                                      );
                                      setAvatarBrokenByUserId((prev) => {
                                        if (!prev[meId]) return prev;
                                        const next = { ...prev };
                                        delete next[meId];
                                        return next;
                                      });
                                    }

                                    setMe((prev) =>
                                      prev
                                        ? {
                                            ...prev,
                                            avatarHash: res.hash,
                                            avatarMode: "hytale",
                                            avatarDisabled: false,
                                          }
                                        : prev,
                                    );
                                    setProfileUser((prev) =>
                                      prev
                                        ? {
                                            ...prev,
                                            avatarHash: res.hash,
                                            avatarMode: "hytale",
                                            avatarDisabled: false,
                                          }
                                        : prev,
                                    );

                                    StorageService.setAvatarDisabled(safeAccountType, user, false);
                                    if (user) StorageService.setAvatarMode(safeAccountType, user, "hytale");
                                  }
                                } catch {
                                  // ignore
                                } finally {
                                  setAvatarSyncWorking(false);
                                }
                              })();
                            };

                            if (isCustom) {
                              return (
                                <>
                                  <button
                                    type="button"
                                    style={{flexShrink:0, padding:"0 12px", height:"32px", borderRadius:"8px", fontWeight:800, fontSize:"0.75rem", border:"1px solid rgba(255,255,255,0.1)", background:"rgba(0,0,0,0.35)", color:"white", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.6 : 1, fontFamily:"inherit"}}
                                    disabled={disabled}
                                    onClick={uploadCustom}
                                    title={t("friendsMenu.profile.changeAvatar")}
                                  >
                                    {t("friendsMenu.profile.changeAvatar")}
                                  </button>

                                  <button
                                    type="button"
                                    style={{flexShrink:0, padding:"0 12px", height:"32px", borderRadius:"8px", fontWeight:800, fontSize:"0.75rem", border:"1px solid rgba(255,255,255,0.1)", background:"rgba(0,0,0,0.35)", color:"white", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.6 : 1, fontFamily:"inherit"}}
                                    disabled={disabled}
                                    onClick={useHytale}
                                    title={t("friendsMenu.profile.useHytaleAvatar")}
                                  >
                                    {t("friendsMenu.profile.useHytaleAvatar")}
                                  </button>

                                  <button
                                    type="button"
                                    style={{flexShrink:0, width:"32px", height:"32px", borderRadius:"8px", border:"1px solid rgba(255,255,255,0.1)", background:"rgba(0,0,0,0.35)", color:"white", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.6 : 1, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"inherit"}}
                                    disabled={disabled}
                                    onClick={removeAvatar}
                                    title={t("friendsMenu.profile.removeAvatar")}
                                    aria-label={t("friendsMenu.profile.removeAvatar")}
                                  >
                                    <IconTrash size={16} />
                                  </button>
                                </>
                              );
                            }

                            const current = StorageService.getAvatarBgColor(safeAccountType, user);

                            return (
                              <>
                                <button
                                  type="button"
                                  style={{flexShrink:0, padding:"0 12px", height:"32px", borderRadius:"8px", fontWeight:800, fontSize:"0.75rem", border:"1px solid rgba(255,255,255,0.1)", background:"rgba(0,0,0,0.35)", color:"white", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.6 : 1, fontFamily:"inherit"}}
                                  disabled={disabled}
                                  onClick={uploadCustom}
                                  title={t("friendsMenu.profile.uploadAvatar")}
                                >
                                  {t("friendsMenu.profile.uploadAvatar")}
                                </button>

                                <button
                                  type="button"
                                  style={{flexShrink:0, width:"32px", height:"32px", borderRadius:"8px", border:"1px solid rgba(255,255,255,0.1)", background:"rgba(0,0,0,0.35)", color:"white", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.6 : 1, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"inherit"}}
                                  disabled={disabled}
                                  onClick={removeAvatar}
                                  title={t("friendsMenu.profile.removeAvatar")}
                                  aria-label={t("friendsMenu.profile.removeAvatar")}
                                >
                                  <IconTrash size={16} />
                                </button>

                                <div
                                  style={{position:"relative", flexShrink:0, height:"32px", borderRadius:"8px", border:"1px solid rgba(255,255,255,0.1)", background:"rgba(0,0,0,0.35)", color:"white", padding:"0 12px", display:"flex", alignItems:"center", gap:"8px", opacity: disabled ? 0.6 : 1, cursor: disabled ? "not-allowed" : "pointer"}}
                                  title={t("friendsMenu.profile.avatarBackground")}
                                >
                                  <span
                                    style={{display:"inline-block", verticalAlign:"middle", width:"12px", height:"12px", borderRadius:"2px", border:"1px solid rgba(255,255,255,0.2)",
                                      backgroundColor:
                                        current && /^#?[0-9a-fA-F]{6}$/.test(current)
                                          ? current.startsWith("#")
                                            ? current
                                            : `#${current}`
                                          : "#2f3a4f",
                                    }}
                                  />
                                  <span style={{fontWeight:800, fontSize:"0.75rem"}}>
                                    {t("friendsMenu.profile.avatarBackground")}
                                  </span>
                                  <input
                                    type="color"
                                    disabled={disabled}
                                    style={{position:"absolute", inset:0, opacity:0, cursor:"pointer", width:"100%", height:"100%"}}
                                    value={
                                      current && /^#?[0-9a-fA-F]{6}$/.test(current)
                                        ? current.startsWith("#")
                                          ? current
                                          : `#${current}`
                                        : "#2f3a4f"
                                    }
                                    onChange={(e) => {
                                      const v = String(e.target.value || "").trim();
                                      if (!/^#[0-9a-fA-F]{6}$/.test(v)) return;
                                      StorageService.setAvatarBgColor(safeAccountType, user, v);
                                      useHytale();
                                    }}
                                  />
                                </div>

                                <button
                                  type="button"
                                  style={{flexShrink:0, width:"32px", height:"32px", borderRadius:"8px", border:"1px solid rgba(255,255,255,0.1)", background:"rgba(0,0,0,0.35)", color:"white", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.6 : 1, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"inherit"}}
                                  disabled={disabled}
                                  onClick={useHytale}
                                  title={
                                    avatarSyncWorking
                                      ? t("common.working")
                                      : t("common.refresh")
                                  }
                                  aria-label={
                                    avatarSyncWorking
                                      ? t("common.working")
                                      : t("common.refresh")
                                  }
                                >
                                  <IconRefresh size={16} />
                                </button>
                              </>
                            );
                          })()}
                        </Box>
                      </HStack>
                    </Box>

                    <Box rounded="xl" border="1px solid" borderColor="rgba(255,255,255,0.1)" bg="rgba(0,0,0,0.25)" px={3} py={2}>
                      <Text fontSize="10px" fontWeight="extrabold" letterSpacing="widest" color="rgba(255,255,255,0.6)" textTransform="uppercase">
                        {t("friendsMenu.profile.username")}
                      </Text>
                      <HStack mt={1} justify="space-between" gap={2}>
                        <Box minW={0} fontSize="sm" fontWeight="bold" color="rgba(255,255,255,0.9)" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {displayHandle(profileUser?.handle || me?.handle || "—")}
                        </Box>

                        <button
                          type="button"
                          style={{flexShrink:0, padding:"0 12px", height:"32px", borderRadius:"8px", fontWeight:800, fontSize:"0.75rem", border:"1px solid rgba(255,255,255,0.1)", background:"rgba(0,0,0,0.35)", color:"white", cursor:"pointer", fontFamily:"inherit"}}
                          onClick={() => {
                            const handle = String(
                              profileUser?.handle || me?.handle || "",
                            ).trim();
                            if (!handle || profileLoading) return;

                            void (async () => {
                              const ok = await copyToClipboard(handle);
                              if (!ok) return;

                              setProfileUsernameCopied(true);
                              if (profileUsernameCopiedTimerRef.current) {
                                clearTimeout(
                                  profileUsernameCopiedTimerRef.current,
                                );
                              }
                              profileUsernameCopiedTimerRef.current =
                                setTimeout(() => {
                                  setProfileUsernameCopied(false);
                                  profileUsernameCopiedTimerRef.current = null;
                                }, 2000);
                            })();
                          }}
                          disabled={
                            profileLoading ||
                            !String(
                              profileUser?.handle || me?.handle || "",
                            ).trim()
                          }
                          title={t("friendsMenu.copy")}
                        >
                          {profileUsernameCopied
                            ? t("common.copied")
                            : t("friendsMenu.copy")}
                        </button>
                      </HStack>
                    </Box>

                    <Box rounded="xl" border="1px solid" borderColor="rgba(255,255,255,0.1)" bg="rgba(0,0,0,0.25)" px={3} py={2}>
                      <Text fontSize="10px" fontWeight="extrabold" letterSpacing="widest" color="rgba(255,255,255,0.6)" textTransform="uppercase">
                        {t("friendsMenu.profile.createdAt")}
                      </Text>
                      <Box mt={1} fontSize="sm" fontWeight="bold" color="rgba(255,255,255,0.9)">
                        {(() => {
                          const raw = profileUser?.createdAt || me?.createdAt;
                          if (!raw) return "—";
                          const d = new Date(raw);
                          if (Number.isNaN(d.getTime())) return String(raw);
                          return d.toLocaleString();
                        })()}
                      </Box>
                    </Box>

                    <Box rounded="xl" border="1px solid" borderColor="rgba(255,255,255,0.1)" bg="rgba(0,0,0,0.25)" px={3} py={2}>
                      <Text fontSize="10px" fontWeight="extrabold" letterSpacing="widest" color="rgba(255,255,255,0.6)" textTransform="uppercase">
                        {t("friendsMenu.profile.totalMessages")}
                      </Text>
                      <Box mt={1} fontSize="sm" fontWeight="bold" color="rgba(255,255,255,0.9)">
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
                          return typeof n === "number"
                            ? n.toLocaleString()
                            : "—";
                        })()}
                      </Box>
                    </Box>

                    <Box rounded="xl" border="1px solid" borderColor="rgba(255,255,255,0.1)" bg="rgba(0,0,0,0.25)" px={3} py={2}>
                      <HStack justify="space-between" gap={3}>
                        <Box minW={0}>
                          <Text fontSize="10px" fontWeight="extrabold" letterSpacing="widest" color="rgba(255,255,255,0.6)" textTransform="uppercase">
                            {t("friendsMenu.profile.dndTitle")}
                          </Text>
                          <Box mt={1} fontSize="11px" color="rgba(255,255,255,0.7)">
                            {t("friendsMenu.profile.dndHint")}
                          </Box>
                        </Box>
                        <input
                          type="checkbox"
                          checked={doNotDisturb}
                          onChange={(e) => setDoNotDisturb(e.target.checked)}
                          style={{ height: "16px", width: "16px", accentColor: "#fde047", cursor: "pointer" }}
                        />
                      </HStack>
                    </Box>
                  </VStack>
                </Box>
              </Box>,
              document.body,
            )
          : null}

        {userProfileOpen && typeof document !== "undefined" && document.body
          ? createPortal(
              <Box
                position="fixed"
                inset={0}
                zIndex={50}
                display="flex"
                alignItems="center"
                justifyContent="center"
                className="glass-backdrop animate-fade-in"
                data-matcha-user-profile-modal="1"
                onMouseDown={(e: React.MouseEvent) => {
                  if (e.target !== e.currentTarget) return;
                  e.preventDefault();
                  e.stopPropagation();
                  setUserProfileOpen(false);
                }}
                onClick={(e: React.MouseEvent) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                role="dialog"
                aria-modal="true"
                aria-label={t("friendsMenu.userProfile.title")}
              >
                <Box
                  w="full"
                  maxW="460px"
                  rounded="3xl"
                  border="1px solid"
                  borderColor="rgba(255,255,255,0.1)"
                  bg="rgba(0,0,0,0.75)"
                  style={{ backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}
                  boxShadow="2xl"
                  overflow="hidden"
                  className="animate-popIn"
                  onClick={(e: React.MouseEvent) => e.stopPropagation()}
                  onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}
                >
                  <Box p={4}>
                    <HStack align="start" justify="space-between" gap={3}>
                      <Box minW={0}>
                        <Text fontSize="10px" fontWeight="extrabold" letterSpacing="widest" color="rgba(255,255,255,0.7)" textTransform="uppercase">
                          {t("friendsMenu.userProfile.title")}
                        </Text>

                        <Box mt={1} display="flex" flexWrap="wrap" alignItems="center" gap={2}>
                          <Box fontSize="md" fontWeight="extrabold" letterSpacing="wide" color="white" maxW="320px" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {displayHandle(userProfileUser?.handle || "—")}
                          </Box>

                          {(() => {
                            const role = String(userProfileUser?.role || "").toLowerCase();
                            if (role === "dev") {
                              return (
                                <Box as="span" px={2} py={1} rounded="lg" bg="rgba(220,38,38,0.8)" color="white" fontSize="10px" fontWeight="black" letterSpacing="widest" textTransform="uppercase">
                                  {t("friendsMenu.devs")}
                                </Box>
                              );
                            }
                            if (role === "mod") {
                              return (
                                <Box as="span" px={2} py={1} rounded="lg" border="1px solid rgba(125,211,252,0.25)" bg="rgba(14,165,233,0.15)" color="#bae6fd" fontSize="10px" fontWeight="black" letterSpacing="widest" textTransform="uppercase">
                                  MOD
                                </Box>
                              );
                            }
                            return null;
                          })()}
                        </Box>
                      </Box>
                    </HStack>

                    {userProfileErr ? (
                      <Box mt={3} fontSize="xs" color="red.200" border="1px solid rgba(248,113,113,0.2)" bg="rgba(239,68,68,0.1)" rounded="lg" px={2} py={2}>
                        {userProfileErr}
                      </Box>
                    ) : null}

                    <Box mt={4} display="grid" style={{ gridTemplateColumns: "92px 1fr", gap: "16px" }}>
                      <Box position="relative" h="92px" w="92px" rounded="2xl" border="1px solid" borderColor="rgba(255,255,255,0.1)" bg="rgba(0,0,0,0.3)" overflow="hidden" display="flex" alignItems="center" justifyContent="center">
                        {(() => {
                          const u = userProfileUser;
                          const userId = String(u?.id || "");
                          const h =
                            avatarHashByUserId[userId] ||
                            String(u?.avatarHash || "").trim();
                          const broken = !!avatarBrokenByUserId[userId];
                          const src = !broken ? avatarUrlFor(userId, h) : null;
                          if (!src) {
                            return (
                              <Text fontSize="sm" fontWeight="extrabold" color="rgba(255,255,255,0.8)">
                                {initials(displayHandle(String(u?.handle || "")))}
                              </Text>
                            );
                          }
                          return (
                            <img
                              src={src}
                              alt={displayHandle(String(u?.handle || ""))}
                              style={{ height: "100%", width: "100%", objectFit: "cover" }}
                              onError={() =>
                                setAvatarBrokenByUserId((prev) => ({
                                  ...prev,
                                  [userId]: true,
                                }))
                              }
                            />
                          );
                        })()}

                        {userProfileLoading ? (
                          <Box position="absolute" inset={0} display="flex" alignItems="center" justifyContent="center" bg="rgba(0,0,0,0.4)">
                            <Text fontSize="10px" fontWeight="extrabold" letterSpacing="widest" color="rgba(255,255,255,0.7)" textTransform="uppercase">
                              {t("common.loading")}
                            </Text>
                          </Box>
                        ) : null}
                      </Box>

                      <VStack minW={0} gap={2} align="stretch">
                        <Box rounded="2xl" border="1px solid" borderColor="rgba(255,255,255,0.1)" bg="rgba(0,0,0,0.25)" px={3} py={2}>
                          <Text fontSize="10px" fontWeight="extrabold" letterSpacing="widest" color="rgba(255,255,255,0.6)" textTransform="uppercase">
                            {t("friendsMenu.profile.createdAt")}
                          </Text>
                          <Box mt={1} fontSize="sm" fontWeight="bold" color="rgba(255,255,255,0.9)">
                            {(() => {
                              const raw = userProfileUser?.createdAt;
                              if (!raw) return "—";
                              const d = new Date(String(raw));
                              if (Number.isNaN(d.getTime())) return String(raw);
                              return d.toLocaleString();
                            })()}
                          </Box>
                        </Box>

                        <Box rounded="2xl" border="1px solid" borderColor="rgba(255,255,255,0.1)" bg="rgba(0,0,0,0.25)" px={3} py={2}>
                          <Text fontSize="10px" fontWeight="extrabold" letterSpacing="widest" color="rgba(255,255,255,0.6)" textTransform="uppercase">
                            {t("friendsMenu.profile.totalMessages")}
                          </Text>
                          <Box mt={1} fontSize="sm" fontWeight="bold" color="rgba(255,255,255,0.9)">
                            {typeof userProfileUser?.messagesSentTotal === "number"
                              ? userProfileUser.messagesSentTotal.toLocaleString()
                              : "—"}
                          </Box>
                        </Box>
                      </VStack>
                    </Box>

                    <HStack mt={4} justify="space-between" gap={2}>
                      {(() => {
                        const u = userProfileUser;
                        const meId = String(me?.id || "");
                        const uid = String(u?.id || "");
                        const rawHandle = String(u?.handle || "").trim();
                        const isSelf = !!meId && !!uid && meId === uid;
                        const isFriend = !!uid && friends.some((f) => String(f.id) === uid);

                        const pendingOut =
                          !!uid && outgoing.some((r) => String(r.toId || "") === uid);
                        const pendingIn =
                          !!uid && incoming.some((r) => String(r.fromId || "") === uid);
                        const pending = pendingOut || pendingIn;

                        if (!u || userProfileLoading) {
                          return (
                            <Text fontSize="xs" color="rgba(255,255,255,0.6)">
                              {t("common.loading")}
                            </Text>
                          );
                        }

                        if (isSelf) {
                          return (
                            <Text fontSize="xs" color="rgba(255,255,255,0.6)">
                              {t("friendsMenu.userProfile.thisIsYou")}
                            </Text>
                          );
                        }

                        const disabled =
                          userProfileRequestWorking ||
                          !token ||
                          !rawHandle ||
                          isFriend ||
                          pending;

                        const label = isFriend
                          ? t("friendsMenu.userProfile.alreadyFriends")
                          : pending
                            ? t("friendsMenu.userProfile.requestPending")
                            : userProfileRequestWorking
                              ? t("common.working")
                              : t("friendsMenu.userProfile.sendRequest");

                        return (
                          <button
                            type="button"
                            style={{ height: "40px", padding: "0 16px", borderRadius: "12px", fontWeight: 800, fontSize: "0.75rem", border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.1)", color: "white", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.6 : 1, fontFamily: "inherit" }}
                            disabled={disabled}
                            onClick={() => void sendFriendRequestToHandle(rawHandle)}
                          >
                            {label}
                          </button>
                        );
                      })()}

                      <button
                        type="button"
                        style={{ height: "40px", padding: "0 16px", borderRadius: "12px", fontWeight: 800, fontSize: "0.75rem", border: "1px solid rgba(255,255,255,0.1)", background: "rgba(0,0,0,0.35)", color: "white", cursor: "pointer", fontFamily: "inherit" }}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setUserProfileOpen(false);
                        }}
                      >
                        {t("common.close")}
                      </button>
                    </HStack>
                  </Box>
                </Box>
              </Box>,
              document.body,
            )
          : null}

        {mode === "proof" && proofId ? (
          proofStep === "show" ? (
            <Box mt={3} rounded="lg" border="1px solid" borderColor="rgba(96,165,250,0.2)" bg="rgba(59,130,246,0.1)" p={3}>
              <Box fontSize="xs" fontWeight="bold" color="#bfdbfe">
                {t("friendsMenu.proof.uniqueId")}
              </Box>
              <Box mt={1} fontSize="11px" fontWeight="extrabold" letterSpacing="widest" color="#fecaca" textTransform="uppercase">
                {t("friendsMenu.proof.dontLoseIt")}
              </Box>

              {registeredHandle || me?.handle ? (
                <Box mt={2}>
                  <Box fontSize="11px" fontWeight="extrabold" letterSpacing="widest" color="rgba(229,231,235,0.8)" textTransform="uppercase">
                    {t("friendsMenu.proof.yourHandle")}
                  </Box>
                  <HStack mt={1} align="stretch" gap={2}>
                    <Box flex={1} fontSize="xs" style={{wordBreak:"break-all"}} rounded="lg" border="1px solid" borderColor="rgba(255,255,255,0.1)" bg="rgba(0,0,0,0.35)" p={2}>
                      {registeredHandle || me?.handle}
                    </Box>
                    <button
                      type="button"
                      style={{flexShrink:0, padding:"0 12px", borderRadius:"8px", fontWeight:800, fontSize:"0.75rem", border:"1px solid rgba(255,255,255,0.1)", background:"rgba(0,0,0,0.35)", color:"white", cursor:"pointer", fontFamily:"inherit"}}
                      onClick={() => {
                        const text = String(registeredHandle || me?.handle || "").trim();
                        if (!text) return;
                        void (async () => {
                          const ok = await copyToClipboard(text);
                          if (!ok) return;

                          setProofHandleCopied(true);
                          if (proofHandleCopiedTimerRef.current) {
                            clearTimeout(proofHandleCopiedTimerRef.current);
                          }
                          proofHandleCopiedTimerRef.current = setTimeout(() => {
                            setProofHandleCopied(false);
                            proofHandleCopiedTimerRef.current = null;
                          }, 2000);
                        })();
                      }}
                      title={t("friendsMenu.copy")}
                    >
                      {proofHandleCopied ? t("common.copied") : t("friendsMenu.copy")}
                    </button>
                  </HStack>
                  <Box mt={1} fontSize="11px" color="rgba(229,231,235,0.7)" lineHeight="short">
                    {t("friendsMenu.proof.saveHandleHint")}
                  </Box>
                </Box>
              ) : null}

              <HStack mt={2} align="stretch" gap={2}>
                <Box flex={1} fontSize="xs" style={{wordBreak:"break-all"}} rounded="lg" border="1px solid" borderColor="rgba(255,255,255,0.1)" bg="rgba(0,0,0,0.35)" p={2}>
                  {proofId}
                </Box>
                <button
                  type="button"
                  style={{flexShrink:0, padding:"0 12px", borderRadius:"8px", fontWeight:800, fontSize:"0.75rem", border:"1px solid rgba(255,255,255,0.1)", background:"rgba(0,0,0,0.35)", color:"white", cursor:"pointer", fontFamily:"inherit"}}
                  onClick={() => {
                    const text = String(proofId || "").trim();
                    if (!text) return;
                    void (async () => {
                      const ok = await copyToClipboard(text);
                      if (!ok) return;

                      setProofKeyCopied(true);
                      if (proofKeyCopiedTimerRef.current) {
                        clearTimeout(proofKeyCopiedTimerRef.current);
                      }
                      proofKeyCopiedTimerRef.current = setTimeout(() => {
                        setProofKeyCopied(false);
                        proofKeyCopiedTimerRef.current = null;
                      }, 2000);
                    })();
                  }}
                  title={t("friendsMenu.copy")}
                >
                  {proofKeyCopied ? t("common.copied") : t("friendsMenu.copy")}
                </button>
              </HStack>
              <Box mt={2} fontSize="11px" color="rgba(229,231,235,0.8)" lineHeight="short">
                {t("friendsMenu.proof.uniqueIdHint")}
              </Box>

              <button
                type="button"
                style={{marginTop:"12px", width:"100%", padding:"8px 12px", borderRadius:"8px", fontWeight:700, border:"1px solid rgba(255,255,255,0.1)", background:"rgba(0,0,0,0.35)", color:"white", cursor:"pointer", fontFamily:"inherit"}}
                onClick={() => {
                  // Move to a separate screen so the key is no longer visible.
                  setProofStep("confirm");
                  setProofCheckInput("");
                  setProofCheckErr("");
                }}
              >
                {t("friendsMenu.continue")}
              </button>
            </Box>
          ) : (
            <Box mt={3} rounded="lg" border="1px solid" borderColor="rgba(255,255,255,0.1)" bg="rgba(0,0,0,0.3)" p={3}>
                <Box fontSize="xs" fontWeight="extrabold" letterSpacing="widest" color="rgba(255,255,255,0.7)" textTransform="uppercase">
                  {t("friendsMenu.proof.finalCheckTitle")}
                </Box>
                <Box mt={1} fontSize="11px" color="rgba(255,255,255,0.7)" lineHeight="short">
                  {t("friendsMenu.proof.finalCheckBody")}
                </Box>

                <input
                  style={{marginTop:"8px", width:"100%", padding:"8px 12px", borderRadius:"8px", border:"1px solid rgba(255,255,255,0.1)", background:"rgba(0,0,0,0.35)", fontSize:"0.75rem", color:"white", outline:"none", fontFamily:"inherit", boxSizing:"border-box"}}
                  placeholder={t("friendsMenu.proof.finalCheckPlaceholder")}
                  value={proofCheckInput}
                  onChange={(e) => {
                    setProofCheckInput(e.target.value);
                    if (proofCheckErr) setProofCheckErr("");
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    const expected = String(proofId || "").trim();
                    const got = String(proofCheckInput || "").trim();
                    if (!expected) return;
                    if (got !== expected) {
                      setProofCheckErr(t("friendsMenu.proof.finalCheckError"));
                      return;
                    }

                    void (async () => {
                      // New flow: confirm pending registration on the server.
                      const pid = String(pendingRegisterId || "").trim();
                      if (pid) {
                        const resp = await apiJson("/api/matcha/register/confirm", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ pendingId: pid, proofId: expected }),
                        });

                        if (!resp?.ok) {
                          setProofCheckErr(
                            String(resp?.error || t("friendsMenu.proof.finalCheckError")),
                          );
                          return;
                        }

                        const nextToken = String(resp.token || "");
                        const nextUser = resp.user as MatchaMe;

                        keepProofRef.current = false;
                        setProofStep("show");
                        setProofCheckInput("");
                        setProofCheckErr("");
                        setProofId(null);
                        setRegisteredHandle(null);
                        setPendingRegisterId(null);
                        setMe(nextUser);
                        saveToken(nextToken);
                        setPendingAuth(null);
                        setMode("app");
                        return;
                      }

                      // Legacy flow: server already created the account.
                      if (!pendingAuth) return;
                      keepProofRef.current = false;
                      setProofStep("show");
                      setProofCheckInput("");
                      setProofCheckErr("");
                      setProofId(null);
                      setRegisteredHandle(null);
                      setMe(pendingAuth.user);
                      saveToken(pendingAuth.token);
                      setPendingAuth(null);
                      setMode("app");
                    })();
                  }}
                />

                {proofCheckErr ? (
                  <Box mt={2} fontSize="xs" color="#fecaca" border="1px solid" borderColor="rgba(248,113,113,0.2)" bg="rgba(239,68,68,0.1)" rounded="lg" px={2} py={2}>
                    {proofCheckErr}
                  </Box>
                ) : null}

                <button
                  type="button"
                  style={{marginTop:"12px", width:"100%", padding:"8px 12px", borderRadius:"8px", fontWeight:700, border:"1px solid rgba(255,255,255,0.1)", background:"rgba(0,0,0,0.35)", color:"white", cursor:"pointer", fontFamily:"inherit"}}
                  onClick={() => {
                    const expected = String(proofId || "").trim();
                    const got = String(proofCheckInput || "").trim();
                    if (!expected) return;
                    if (got !== expected) {
                      setProofCheckErr(t("friendsMenu.proof.finalCheckError"));
                      return;
                    }

                    void (async () => {
                      const pid = String(pendingRegisterId || "").trim();
                      if (pid) {
                        const resp = await apiJson("/api/matcha/register/confirm", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ pendingId: pid, proofId: expected }),
                        });

                        if (!resp?.ok) {
                          setProofCheckErr(
                            String(resp?.error || t("friendsMenu.proof.finalCheckError")),
                          );
                          return;
                        }

                        const nextToken = String(resp.token || "");
                        const nextUser = resp.user as MatchaMe;

                        keepProofRef.current = false;
                        setProofStep("show");
                        setProofCheckInput("");
                        setProofCheckErr("");
                        setProofId(null);
                        setRegisteredHandle(null);
                        setPendingRegisterId(null);
                        setMe(nextUser);
                        saveToken(nextToken);
                        setPendingAuth(null);
                        setMode("app");
                        return;
                      }

                      if (!pendingAuth) return;
                      keepProofRef.current = false;
                      setProofStep("show");
                      setProofCheckInput("");
                      setProofCheckErr("");
                      setProofId(null);
                      setRegisteredHandle(null);
                      setMe(pendingAuth.user);
                      saveToken(pendingAuth.token);
                      setPendingAuth(null);
                      setMode("app");
                    })();
                  }}
                >
                  {t("friendsMenu.proof.verifyContinue")}
                </button>

                <button
                  type="button"
                  style={{marginTop:"8px", width:"100%", padding:"8px 12px", borderRadius:"8px", fontWeight:700, border:"1px solid rgba(255,255,255,0.1)", background:"rgba(0,0,0,0.2)", color:"rgba(255,255,255,0.8)", cursor:"pointer", fontFamily:"inherit"}}
                  onClick={() => {
                    setProofStep("show");
                    setProofCheckErr("");
                  }}
                >
                  {t("back")}
                </button>
            </Box>
          )
        ) : null}

        {mode === "intro" ? (
          <Box mt={1} flex="1" display="flex" flexDirection="column" overflow="auto" style={{ scrollbarWidth: "none" }}>
            <Box
              className={cn(introDocked ? "matcha-intro-text" : "")}
              style={{ opacity: introDocked ? 1 : 0 }}
              flex="1"
              display="flex"
              flexDirection="column"
              gap={4}
            >
              {/* Title centered — icon is absolute above */}
              <Text
                fontSize="2xl"
                fontWeight="extrabold"
                textTransform="none"
                letterSpacing="wide"
                lineHeight="none"
                textAlign="center"
                style={{ paddingTop: "90px" }}
              >
                {t("friendsMenu.brand")}
              </Text>

              {/* Subtitle */}
              <Box fontSize="sm" color="rgba(255,255,255,0.5)" lineHeight="1.7" textAlign="center">
                {t("friendsMenu.intro.subtitle")}
              </Box>

              {/* Feature rows — settings style */}
              <Box borderRadius="xl" border="1px solid" borderColor="rgba(255,255,255,0.07)" overflow="hidden">
                {[
                  { emoji: "💬", text: t("friendsMenu.intro.feature1") },
                  { emoji: "🤝", text: t("friendsMenu.intro.feature2") },
                  { emoji: "🎮", text: t("friendsMenu.intro.feature3") },
                ].map((f, i, arr) => (
                  <Box
                    key={i}
                    px={4} py={3}
                    display="flex" alignItems="center" gap={3}
                    borderBottom={i < arr.length - 1 ? "1px solid rgba(255,255,255,0.06)" : undefined}
                    bg="rgba(255,255,255,0.02)"
                  >
                    <Box fontSize="lg" flexShrink={0} lineHeight={1}>{f.emoji}</Box>
                    <Box fontSize="sm" fontWeight="500" color="rgba(255,255,255,0.85)">{f.text}</Box>
                  </Box>
                ))}
              </Box>

              {/* Spacer */}
              <Box flex="1" />

              {/* CTA */}
              <Box fontSize="xs" color="rgba(255,255,255,0.4)" textAlign="center" letterSpacing="wide">
                {t("friendsMenu.intro.cta")}
              </Box>

              {/* Terms */}
              <Box fontSize="11px" color="rgba(255,255,255,0.3)" lineHeight="1.5" textAlign="center">
                <span>{t("friendsMenu.intro.acceptTermsPrefix")} </span>
                <button
                  type="button"
                  style={{ color: "rgba(255,255,255,0.5)", textDecoration: "underline", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: "inherit" }}
                  onClick={onOpenTerms}
                >
                  {t("friendsMenu.intro.acceptTermsLink")}
                </button>
              </Box>

              {/* Continue — flat button matching app style */}
              <button
                type="button"
                style={{ width: "100%", padding: "10px 20px", borderRadius: "12px", fontWeight: 700, fontSize: "0.875rem", color: "white", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.14)", cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.01em" }}
                onClick={() => setMode("login")}
              >
                {t("friendsMenu.continue")}
              </button>
            </Box>
          </Box>
        ) : null}

        {mode === "login" ? (
          <Box mt={3}>
            <HStack gap={2}>
              <button
                type="button"
                style={{flex:1, padding:"8px 12px", borderRadius:"8px", fontSize:"0.75rem", fontWeight:700, border:"1px solid rgba(255,255,255,0.1)", background:"rgba(0,0,0,0.35)", color:"white", cursor:"pointer", fontFamily:"inherit"}}
                onClick={() => setMode("login")}
              >
                {t("friendsMenu.signIn")}
              </button>
              <button
                type="button"
                style={{flex:1, padding:"8px 12px", borderRadius:"8px", fontSize:"0.75rem", fontWeight:700, border:"1px solid rgba(255,255,255,0.1)", background:"rgba(0,0,0,0.35)", color:"white", cursor:"pointer", fontFamily:"inherit"}}
                onClick={() => setMode("register")}
              >
                {t("friendsMenu.create")}
              </button>
            </HStack>

            <VStack mt={3} gap={2} align="stretch">
              <input
                value={loginHandle}
                onChange={(e) => setLoginHandle(e.target.value)}
                placeholder={t("friendsMenu.placeholders.handle")}
                style={{width:"100%", background:"rgba(0,0,0,0.4)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:"8px", padding:"8px 12px", fontSize:"0.875rem", color:"white", outline:"none", fontFamily:"inherit", boxSizing:"border-box"}}
              />
              <input
                value={loginPass}
                onChange={(e) => setLoginPass(e.target.value)}
                placeholder={t("friendsMenu.placeholders.password")}
                type="password"
                style={{width:"100%", background:"rgba(0,0,0,0.4)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:"8px", padding:"8px 12px", fontSize:"0.875rem", color:"white", outline:"none", fontFamily:"inherit", boxSizing:"border-box"}}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void doLogin();
                }}
              />
              <button
                type="button"
                style={{width:"100%", padding:"8px 12px", borderRadius:"8px", fontWeight:700, border:"1px solid rgba(255,255,255,0.1)", background:"rgba(0,0,0,0.35)", color:"white", cursor:"pointer", fontFamily:"inherit"}}
                onClick={() => void doLogin()}
              >
                {t("friendsMenu.signIn")}
              </button>
            </VStack>
          </Box>
        ) : null}

        {mode === "register" ? (
          <Box mt={3}>
            <HStack gap={2}>
              <button
                type="button"
                style={{flex:1, padding:"8px 12px", borderRadius:"8px", fontSize:"0.75rem", fontWeight:700, border:"1px solid rgba(255,255,255,0.1)", background:"rgba(0,0,0,0.35)", color:"white", cursor:"pointer", fontFamily:"inherit"}}
                onClick={() => setMode("login")}
              >
                {t("friendsMenu.signIn")}
              </button>
              <button
                type="button"
                style={{flex:1, padding:"8px 12px", borderRadius:"8px", fontSize:"0.75rem", fontWeight:700, border:"1px solid rgba(255,255,255,0.1)", background:"rgba(0,0,0,0.35)", color:"white", cursor:"pointer", fontFamily:"inherit"}}
                onClick={() => setMode("register")}
              >
                {t("friendsMenu.create")}
              </button>
            </HStack>

            <VStack mt={3} gap={2} align="stretch">
              <input
                value={regUser}
                onChange={(e) => setRegUser(e.target.value)}
                placeholder={t("friendsMenu.placeholders.username")}
                style={{width:"100%", background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.15)", borderRadius:"8px", padding:"8px 12px", fontSize:"0.875rem", color:"white", outline:"none", fontFamily:"inherit", boxSizing:"border-box"}}
              />
              <Box fontSize="11px" color="rgba(255,255,255,0.6)">
                {t("friendsMenu.register.handleHint")}
              </Box>
              <input
                value={regPass}
                onChange={(e) => setRegPass(e.target.value)}
                placeholder={t("friendsMenu.placeholders.password")}
                type="password"
                style={{width:"100%", background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.15)", borderRadius:"8px", padding:"8px 12px", fontSize:"0.875rem", color:"white", outline:"none", fontFamily:"inherit", boxSizing:"border-box"}}
              />
              <input
                value={regPass2}
                onChange={(e) => setRegPass2(e.target.value)}
                placeholder={t("friendsMenu.placeholders.passwordRepeat")}
                type="password"
                style={{width:"100%", background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.15)", borderRadius:"8px", padding:"8px 12px", fontSize:"0.875rem", color:"white", outline:"none", fontFamily:"inherit", boxSizing:"border-box"}}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void doRegister();
                }}
              />
              <button
                type="button"
                style={{width:"100%", padding:"8px 12px", borderRadius:"8px", fontWeight:700, border:"1px solid rgba(255,255,255,0.1)", background:"rgba(0,0,0,0.35)", color:"white", cursor:"pointer", fontFamily:"inherit"}}
                onClick={() => void doRegister()}
              >
                {t("friendsMenu.createAccount")}
              </button>
            </VStack>
          </Box>
        ) : null}

        {mode === "app" && token && !me ? (
          <Box mt={3} fontSize="xs" color="rgba(255,255,255,0.7)">
            {t("common.loading")}
          </Box>
        ) : null}

        {mode === "app" && me ? (
          <Box
          mt={3}
          display="flex"
          flexDirection="column"
          h={inline ? undefined : "640px"}
          maxH={inline ? undefined : "75vh"}
          flex={inline ? "1" : undefined}
          minH={0}
        >
            {appView === "friends" ? (
              <>
                <input
                  value={friendSearch}
                  onChange={(e) => setFriendSearch(e.target.value)}
                  placeholder={t("friendsMenu.searchFriends")}
                  style={{width:"100%", background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:"8px", padding:"8px 12px", fontSize:"0.75rem", color:"white", outline:"none", fontFamily:"inherit", boxSizing:"border-box"}}
                />

                <Box mt={2}>
                  <Box position="relative">
                    <button
                      type="button"
                      style={{
                        width:"100%", display:"flex", alignItems:"center", justifyContent:"space-between", gap:"8px",
                        borderRadius:"8px", border: incoming.length > 0 ? "1px solid rgba(250,204,21,0.3)" : "1px solid rgba(255,255,255,0.1)",
                        background: incoming.length > 0 ? "rgba(250,204,21,0.1)" : "rgba(255,255,255,0.05)",
                        padding:"8px 12px", color:"white", cursor:"pointer", fontFamily:"inherit",
                        animation: incoming.length > 0 ? "pulse 2s cubic-bezier(0.4,0,0.6,1) infinite" : undefined
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setRequestsOpen((v) => !v);
                      }}
                    >
                      <Box minW={0} style={{textAlign:"left"}}>
                        <Box fontSize="10px" fontWeight="extrabold" letterSpacing="widest" color="rgba(255,255,255,0.7)" textTransform="uppercase">
                          {t("friendsMenu.requests")}
                        </Box>
                        <Box fontSize="xs" fontWeight="bold" style={{overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>
                          {requestsKind === "incoming"
                            ? t("friendsMenu.requestsIncoming", { count: incoming.length })
                            : t("friendsMenu.requestsOutgoing", { count: outgoing.length })}
                        </Box>
                      </Box>

                      {incoming.length > 0 ? (
                        <Box flexShrink={0}>
                          <Box
                            style={{minWidth:"22px", height:"18px", padding:"0 6px", borderRadius:"9999px", background:"#facc15", color:"black", fontSize:"11px", fontWeight:800, display:"flex", alignItems:"center", justifyContent:"center"}}
                            title={t("friendsMenu.unread.badgeTitle")}
                          >
                            {incoming.length}
                          </Box>
                        </Box>
                      ) : null}

                      <IconChevronDown
                        size={16}
                        style={{flexShrink:0, color:"rgba(255,255,255,0.7)", transition:"transform 0.2s", transform: requestsOpen ? "rotate(180deg)" : "rotate(0deg)"}}
                      />
                    </button>

                    {requestsOpen ? (
                      <Box
                        position="absolute" zIndex={20} mt={2} w="full" rounded="lg" border="1px solid" borderColor="rgba(255,255,255,0.1)" bg="rgba(0,0,0,0.45)" style={{backdropFilter:"blur(12px)"}}
                        p={2} boxShadow="xl"
                        onClick={(e: React.MouseEvent) => e.stopPropagation()}
                      >
                        <HStack gap={2}>
                          <button
                            type="button"
                            style={{flex:1, padding:"8px", borderRadius:"8px", border:"1px solid rgba(255,255,255,0.1)", fontSize:"0.75rem", fontWeight:800, background: requestsKind === "incoming" ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.05)", color:"white", cursor:"pointer", fontFamily:"inherit"}}
                            onClick={() => setRequestsKind("incoming")}
                          >
                            {t("friendsMenu.received")}
                          </button>
                          <button
                            type="button"
                            style={{flex:1, padding:"8px", borderRadius:"8px", border:"1px solid rgba(255,255,255,0.1)", fontSize:"0.75rem", fontWeight:800, background: requestsKind === "outgoing" ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.05)", color:"white", cursor:"pointer", fontFamily:"inherit"}}
                            onClick={() => setRequestsKind("outgoing")}
                          >
                            {t("friendsMenu.sent")}
                          </button>
                        </HStack>

                        <Box mt={2} maxH="176px" overflowY="auto" className="dark-scrollbar">
                          {requestsKind === "incoming" ? (
                            incoming.length === 0 ? (
                              <Box fontSize="xs" color="rgba(255,255,255,0.6)" px={2} py={2}>
                                {t("friendsMenu.none")}
                              </Box>
                            ) : (
                              <VStack gap={1} align="stretch">
                                {incoming.map((r) => (
                                  <HStack
                                    key={r.id}
                                    justify="space-between" gap={2} px={2} py={2} rounded="lg" border="1px solid" borderColor="rgba(255,255,255,0.1)" bg="rgba(255,255,255,0.05)"
                                  >
                                    <Box style={{overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}} fontSize="xs" fontWeight="bold">
                                      {displayHandle(r.fromHandle)}
                                    </Box>
                                    <HStack gap={2} flexShrink={0}>
                                      <button
                                        type="button"
                                        style={{padding:"2px 8px", fontSize:"10px", borderRadius:"8px", border:"1px solid rgba(255,255,255,0.1)", background:"rgba(255,255,255,0.05)", color:"white", cursor:"pointer", fontFamily:"inherit"}}
                                        onClick={() => void acceptIncoming(r.id)}
                                      >
                                        {t("friendsMenu.accept")}
                                      </button>
                                      <button
                                        type="button"
                                        style={{padding:"2px 8px", fontSize:"10px", borderRadius:"8px", border:"1px solid rgba(248,113,113,0.2)", background:"rgba(239,68,68,0.1)", color:"#fecaca", cursor:"pointer", fontFamily:"inherit"}}
                                        onClick={() => void rejectIncoming(r.id)}
                                      >
                                        {t("friendsMenu.reject")}
                                      </button>
                                    </HStack>
                                  </HStack>
                                ))}
                              </VStack>
                            )
                          ) : outgoing.length === 0 ? (
                            <Box fontSize="xs" color="rgba(255,255,255,0.6)" px={2} py={2}>
                              {t("friendsMenu.none")}
                            </Box>
                          ) : (
                            <VStack gap={1} align="stretch">
                              {outgoing.map((r) => (
                                <HStack
                                  key={r.id}
                                  justify="space-between" gap={2} px={2} py={2} rounded="lg" border="1px solid" borderColor="rgba(255,255,255,0.1)" bg="rgba(255,255,255,0.05)"
                                >
                                  <Box style={{overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}} fontSize="xs" fontWeight="bold">
                                    {displayHandle(r.toHandle)}
                                  </Box>
                                  <button
                                    type="button"
                                    style={{padding:"2px 8px", fontSize:"10px", borderRadius:"8px", border:"1px solid rgba(255,255,255,0.1)", background:"rgba(255,255,255,0.05)", color:"white", cursor:"pointer", fontFamily:"inherit"}}
                                    onClick={() => void cancelOutgoing(r.id)}
                                  >
                                    {t("friendsMenu.cancel")}
                                  </button>
                                </HStack>
                              ))}
                            </VStack>
                          )}
                        </Box>
                      </Box>
                    ) : null}
                  </Box>
                </Box>

                <HStack mt={3} justify="space-between" gap={2}>
                  <Box fontSize="11px" fontWeight="normal" letterSpacing="widest" color="rgba(255,255,255,0.7)" textTransform="uppercase">
                    {t("friendsMenu.friendsListCounts", {
                      online: friendsOnlineCount,
                      total: friends.length,
                    })}
                  </Box>
                  <Box position="relative">
                    <button
                      type="button"
                      style={{padding:"8px", borderRadius:"8px", border:"1px solid rgba(255,255,255,0.1)", background:"rgba(255,255,255,0.05)", color:"white", cursor:"pointer", lineHeight:0}}
                      title={t("friendsMenu.addFriend")}
                      onClick={(e) => {
                        e.stopPropagation();
                        setAddOpen((v) => !v);
                      }}
                    >
                      <IconUserPlus size={18} />
                    </button>

                    {addOpen ? (
                      <Box
                        position="absolute" zIndex={30} right={0} mt={2} w="260px" rounded="lg" border="1px solid" borderColor="rgba(255,255,255,0.1)"
                        bg="rgba(0,0,0,0.45)" style={{backdropFilter:"blur(12px)"}} boxShadow="xl" p={2}
                        onClick={(e: React.MouseEvent) => e.stopPropagation()}
                      >
                        <Box fontSize="10px" fontWeight="extrabold" letterSpacing="widest" color="rgba(255,255,255,0.7)" textTransform="uppercase">
                          {t("friendsMenu.addFriend")}
                        </Box>
                        <input
                          value={addHandle}
                          onChange={(e) => setAddHandle(e.target.value)}
                          placeholder={t("friendsMenu.placeholders.handle")}
                          style={{marginTop:"8px", width:"100%", background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:"8px", padding:"8px 12px", fontSize:"0.75rem", color:"white", outline:"none", fontFamily:"inherit", boxSizing:"border-box"}}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void sendFriendRequest();
                          }}
                        />
                        <button
                          type="button"
                          style={{marginTop:"8px", width:"100%", padding:"8px 12px", borderRadius:"8px", fontWeight:800, fontSize:"0.75rem", border:"1px solid rgba(255,255,255,0.1)", background:"rgba(255,255,255,0.05)", color:"white", cursor:"pointer", fontFamily:"inherit"}}
                          onClick={() => void sendFriendRequest()}
                        >
                          {t("friendsMenu.sendRequest")}
                        </button>
                      </Box>
                    ) : null}
                  </Box>
                </HStack>

                <Box mt={2} flex={1} minH={0} overflowY="auto" className="dark-scrollbar" style={{paddingRight:"4px"}}>
                  <VStack gap={1} align="stretch">
                    {filteredFriends.length === 0 ? (
                      <Box fontSize="xs" color="rgba(255,255,255,0.6)" px={2} py={3}>
                        {t("friendsMenu.noFriendsFound")}
                      </Box>
                    ) : (
                      filteredFriends.map((f) => {
                        const isOnline = f.state !== "offline";
                        const server = String(f.server || "").trim();
                        const canInvite = myPresence.state === "multiplayer";
                        const canJoin = f.state === "multiplayer" && !!server;
                        const canRequestJoin = f.state === "multiplayer" && !server;
                        const statusLabel =
                          f.state === "in_game"
                            ? t("friendsMenu.status.inGame")
                            : f.state === "singleplayer"
                              ? t("friendsMenu.status.singleplayer")
                              : f.state === "multiplayer"
                                ? server
                                  ? t("friendsMenu.status.playingIn", { server })
                                  : t("friendsMenu.status.multiplayer")
                                : isOnline
                                  ? t("friendsMenu.status.online")
                                  : t("friendsMenu.status.offline");

                        return (
                          <button
                            key={f.id}
                            type="button"
                            style={{width:"100%", textAlign:"left", borderRadius:"12px", padding:"8px 12px", background: selectedFriend?.id === f.id ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.05)", border: selectedFriend?.id === f.id ? "1px solid rgba(255,255,255,0.1)" : "1px solid transparent", color:"white", cursor:"pointer", fontFamily:"inherit", outline: selectedFriend?.id === f.id ? "2px solid rgba(255,255,255,0.1)" : "none"}}
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
                            <HStack gap={3} minW={0} w="full">
                              <Box position="relative" h="40px" w="40px" rounded="full" bg="rgba(255,255,255,0.1)" border="1px solid rgba(255,255,255,0.1)" display="flex" alignItems="center" justifyContent="center" flexShrink={0} overflow="hidden">
                                {(() => {
                                  const h = avatarHashByUserId[f.id] || String(f.avatarHash || "").trim();
                                  const broken = !!avatarBrokenByUserId[f.id];
                                  const src = !broken ? avatarUrlFor(f.id, h) : null;
                                  if (!src) {
                                    return (
                                      <span style={{fontSize:"0.75rem", fontWeight:800, color:"rgba(255,255,255,0.8)"}}>
                                        {initials(f.handle)}
                                      </span>
                                    );
                                  }

                                  return (
                                    <img
                                      src={src}
                                      alt={f.handle}
                                      style={{height:"100%", width:"100%", objectFit:"cover"}}
                                      onError={() =>
                                        setAvatarBrokenByUserId((prev) => ({
                                          ...prev,
                                          [f.id]: true,
                                        }))
                                      }
                                    />
                                  );
                                })()}
                                <span
                                  style={{position:"absolute", right:"-2px", bottom:"-2px", height:"12px", width:"12px", borderRadius:"9999px", border:"2px solid rgba(0,0,0,0.4)", background: isOnline ? "#4ade80" : "rgba(255,255,255,0.2)"}}
                                />
                              </Box>

                              <Box minW={0}>
                                <Box style={{overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}} fontSize="sm" fontWeight="extrabold" letterSpacing="wide">
                                  {displayHandle(f.handle)}
                                </Box>
                                <HStack mt="2px" gap={2} fontSize="xs" color={isOnline ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.4)"}>
                                  <span style={{height:"8px", width:"8px", borderRadius:"9999px", background: isOnline ? "#4ade80" : "rgba(255,255,255,0.2)", flexShrink:0, display:"inline-block"}} />
                                  <span style={{fontWeight:600}}>{statusLabel}</span>
                                </HStack>
                              </Box>

                              {unreadDmByFriendId[f.id] ? (
                                <Box ml="auto" flexShrink={0}>
                                  <Box
                                    style={{minWidth:"22px", height:"18px", padding:"0 6px", borderRadius:"9999px", background:"#facc15", color:"black", fontSize:"11px", fontWeight:800, display:"flex", alignItems:"center", justifyContent:"center"}}
                                    title={t("friendsMenu.unread.badgeTitle")}
                                  >
                                    {unreadDmByFriendId[f.id]}
                                  </Box>
                                </Box>
                              ) : null}
                            </HStack>
                          </button>
                        );
                      })
                    )}
                  </VStack>

                  <Box fontSize="10px" color="rgba(209,213,219,0.6)" mt={2}>
                    {loadingFriends ? t("friendsMenu.refreshing") : ""}
                  </Box>
                </Box>

                {ctxMenu ? (
                  <Box
                    position="absolute" zIndex={40} rounded="lg" border="1px solid" borderColor="rgba(255,255,255,0.1)" bg="rgba(0,0,0,0.7)"
                    w="190px" overflow="hidden"
                    style={{ left: ctxMenu.x, top: ctxMenu.y, backdropFilter:"blur(12px)", boxShadow:"0 25px 50px -12px rgba(0,0,0,0.5)"}}
                    onClick={(e: React.MouseEvent) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      style={{width:"100%", display:"flex", alignItems:"center", gap:"8px", padding:"8px 12px", fontSize:"0.75rem", fontWeight:700, background:"none", border:"none", color:"white", cursor:"pointer", fontFamily:"inherit"}}
                      onClick={() => {
                        const f = ctxMenu.friend;
                        setCtxMenu(null);
                        void openDmChat(f);
                      }}
                    >
                      <IconMessage size={16} style={{color:"rgba(255,255,255,0.8)"}} />
                      <span>{t("friendsMenu.ctx.sendMessage")}</span>
                    </button>
                    <button
                      type="button"
                      style={{width:"100%", display:"flex", alignItems:"center", gap:"8px", padding:"8px 12px", fontSize:"0.75rem", fontWeight:700, background:"none", border:"none", color:"#fecaca", cursor:"pointer", fontFamily:"inherit"}}
                      onClick={() => {
                        const f = ctxMenu.friend;
                        setCtxMenu(null);
                        void removeFriend(f.id);
                      }}
                    >
                      <IconTrash size={16} style={{color:"#fecaca"}} />
                      <span>{t("friendsMenu.ctx.removeFriend")}</span>
                    </button>
                  </Box>
                ) : null}
              </>
            ) : (
              <>
                <HStack justify="space-between" gap={2}>
                  <Box fontSize="11px" fontWeight="extrabold" letterSpacing="widest" color="rgba(255,255,255,0.7)" textTransform="uppercase">
                    {appView === "globalChat"
                      ? t("friendsMenu.globalChat")
                      : displayHandle(selectedFriend?.handle)}
                  </Box>
                  <button
                    type="button"
                    style={{padding:"2px 8px", fontSize:"0.75rem", borderRadius:"8px", border:"1px solid rgba(255,255,255,0.1)", background:"rgba(0,0,0,0.25)", color:"white", cursor:"pointer", fontFamily:"inherit"}}
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
                </HStack>

                <Box mt={2} flex={1} minH={0} position="relative">
                  <Box
                    ref={msgScrollRef}
                    h="full" overflowY="auto" overflowX="hidden" rounded="xl" border="1px solid" borderColor="rgba(255,255,255,0.1)" bg="rgba(0,0,0,0.25)" p={2} className="dark-scrollbar"
                  >
                    {loadingMsgs && messages.length === 0 ? (
                      <Box fontSize="xs" color="rgba(255,255,255,0.5)">
                        {t("common.loading")}
                      </Box>
                    ) : null}
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
                    const isSameAsPrev = m.fromId === messages[idx - 1]?.fromId;
                    const isSameAsNext = m.fromId === messages[idx + 1]?.fromId;
                    const baseDir: "left" | "right" = isMe ? "left" : "right";
                    const activeDir =
                      msgMenu?.id === m.id ? msgMenu.dir : baseDir;
                    return (
                      <div key={m.id} data-msg-id={m.id}>
                        {unreadInsertIndex === idx ? (
                          <HStack gap={2} py={1}>
                            <Box flex={1} h="1px" bg="rgba(255,255,255,0.1)" />
                            <Box fontSize="10px" fontWeight="extrabold" letterSpacing="widest" color="rgba(250,230,133,0.9)" textTransform="uppercase">
                              {t("friendsMenu.unread.separator")}
                            </Box>
                            <Box flex={1} h="1px" bg="rgba(255,255,255,0.1)" />
                          </HStack>
                        ) : null}

                        <Box
                          display="flex"
                          justifyContent={isMe ? "flex-end" : "flex-start"}
                          mt={isSameAsPrev ? "2px" : 3}
                        >
                          <Box
                            maxW="85%"
                            style={{textAlign: isMe ? "right" : "left"}}
                          >
                            <HStack gap={2} align="flex-start">
                              {!isMe ? (
                                appView === "globalChat" ? (
                                  <button
                                    type="button"
                                    style={{position:"relative", height:"32px", width:"32px", borderRadius:"9999px", background:"rgba(255,255,255,0.1)", border:"1px solid rgba(255,255,255,0.1)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, overflow:"hidden", cursor:"pointer"}}
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      void openUserProfile(String(m.fromId || ""));
                                    }}
                                    title={t("friendsMenu.userProfile.open")}
                                  >
                                    {(() => {
                                      const userId = String(m.fromId || "");
                                      const h =
                                        avatarHashByUserId[userId] ||
                                        String(m.fromAvatarHash || "").trim();
                                      const broken =
                                        !!avatarBrokenByUserId[userId];
                                      const src =
                                        !broken && userId !== "devs"
                                          ? avatarUrlFor(userId, h)
                                          : null;
                                      if (!src) {
                                        return (
                                          <span style={{fontSize:"10px", fontWeight:800, color:"rgba(255,255,255,0.8)"}}>
                                            {initials(
                                              displayHandle(m.fromHandle),
                                            )}
                                          </span>
                                        );
                                      }
                                      return (
                                        <img
                                          src={src}
                                          alt={displayHandle(m.fromHandle)}
                                          style={{height:"100%", width:"100%", objectFit:"cover"}}
                                          onError={() =>
                                            setAvatarBrokenByUserId((prev) => ({
                                              ...prev,
                                              [userId]: true,
                                            }))
                                          }
                                        />
                                      );
                                    })()}
                                  </button>
                                ) : (
                                  <div style={{position:"relative", height:"32px", width:"32px", borderRadius:"9999px", background:"rgba(255,255,255,0.1)", border:"1px solid rgba(255,255,255,0.1)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, overflow:"hidden"}}>
                                    {(() => {
                                      const userId = String(m.fromId || "");
                                      const h =
                                        avatarHashByUserId[userId] ||
                                        String(m.fromAvatarHash || "").trim();
                                      const broken =
                                        !!avatarBrokenByUserId[userId];
                                      const src =
                                        !broken && userId !== "devs"
                                          ? avatarUrlFor(userId, h)
                                          : null;
                                      if (!src) {
                                        return (
                                          <span style={{fontSize:"10px", fontWeight:800, color:"rgba(255,255,255,0.8)"}}>
                                            {initials(
                                              displayHandle(m.fromHandle),
                                            )}
                                          </span>
                                        );
                                      }
                                      return (
                                        <img
                                          src={src}
                                          alt={displayHandle(m.fromHandle)}
                                          style={{height:"100%", width:"100%", objectFit:"cover"}}
                                          onError={() =>
                                            setAvatarBrokenByUserId((prev) => ({
                                              ...prev,
                                              [userId]: true,
                                            }))
                                          }
                                        />
                                      );
                                    })()}
                                  </div>
                                )
                              ) : null}

                              {isMe ? (
                                <div
                                  style={{position:"relative", flexShrink:0, display:"flex", alignItems:"center", opacity:0}}
                                  className="group-hover:opacity-100 transition"
                                  data-msg-menu-root="1"
                                >
                                  <button
                                    type="button"
                                    style={{padding:"4px 6px", borderRadius:"8px", border:"1px solid rgba(255,255,255,0.1)", background:"rgba(0,0,0,0.35)", color:"white", cursor:"pointer", lineHeight:0}}
                                    onPointerDown={(e) => {
                                      // Open on pointer *down* to avoid accidental opens when the user
                                      // releases the mouse over the button (common with hover-revealed controls).
                                      if (e.button !== 0) return;
                                      e.preventDefault();
                                      e.stopPropagation();
                                      msgMenuAnchorRef.current =
                                        e.currentTarget as HTMLElement;
                                      setMsgMenu((prev) => {
                                        if (prev?.id === m.id) return null;
                                        const p = computeMenuPlacement(
                                          e.currentTarget as HTMLElement,
                                          baseDir,
                                        );
                                        return { id: m.id, baseDir, ...p };
                                      });
                                    }}
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key !== "Enter" && e.key !== " ") return;
                                      e.preventDefault();
                                      e.stopPropagation();
                                      msgMenuAnchorRef.current =
                                        e.currentTarget as HTMLElement;
                                      setMsgMenu((prev) => {
                                        if (prev?.id === m.id) return null;
                                        const p = computeMenuPlacement(
                                          e.currentTarget as HTMLElement,
                                          baseDir,
                                        );
                                        return { id: m.id, baseDir, ...p };
                                      });
                                    }}
                                  >
                                    {activeDir === "left" ? (
                                      <IconChevronLeft
                                        size={14}
                                        style={{color:"rgba(255,255,255,0.7)"}}
                                      />
                                    ) : (
                                      <IconChevronRight
                                        size={14}
                                        style={{color:"rgba(255,255,255,0.7)"}}
                                      />
                                    )}
                                  </button>

                                  {msgMenu?.id === m.id ? (
                                    <div
                                      ref={msgMenuBoxRef}
                                      style={{
                                        position:"absolute",
                                        width:"160px",
                                        borderRadius:"12px",
                                        border:"1px solid rgba(255,255,255,0.1)",
                                        background:"rgba(0,0,0,0.7)",
                                        backdropFilter:"blur(12px)",
                                        padding:"4px",
                                        fontSize:"0.75rem",
                                        bottom: msgMenu.v === "up" ? 0 : undefined,
                                        top: msgMenu.v === "up" ? undefined : 0,
                                        right: msgMenu.dir === "left" ? "100%" : undefined,
                                        marginRight: msgMenu.dir === "left" ? "8px" : undefined,
                                        left: msgMenu.dir === "left" ? undefined : "100%",
                                        marginLeft: msgMenu.dir === "left" ? undefined : "8px",
                                      }}
                                    >
                                      <div style={{padding:"4px 8px", fontSize:"10px", color:"rgba(255,255,255,0.6)"}}>
                                        {t("friendsMenu.msgMenu.sentAt")}:{" "}
                                        {new Date(m.createdAt).toLocaleString()}
                                      </div>

                                      <button
                                        type="button"
                                        style={{width:"100%", textAlign:"left", padding:"6px 8px", borderRadius:"8px", background:"none", border:"none", color:"white", cursor:"pointer", fontFamily:"inherit", fontSize:"inherit"}}
                                        onClick={() => {
                                          startReply(m, true);
                                          setMsgMenu(null);
                                        }}
                                      >
                                        {t("friendsMenu.msgMenu.reply")}
                                      </button>
                                      <button
                                        type="button"
                                        disabled={m.deleted}
                                        style={{width:"100%", textAlign:"left", padding:"6px 8px", borderRadius:"8px", background:"none", border:"none", color:"white", cursor: m.deleted ? "not-allowed" : "pointer", opacity: m.deleted ? 0.5 : 1, fontFamily:"inherit", fontSize:"inherit"}}
                                        onClick={() => {
                                          void copyMessage(m);
                                          setMsgMenu(null);
                                        }}
                                      >
                                        {t("friendsMenu.msgMenu.copy")}
                                      </button>

                                      <button
                                        type="button"
                                        disabled={m.deleted}
                                        style={{width:"100%", textAlign:"left", padding:"6px 8px", borderRadius:"8px", background:"none", border:"none", color:"#fecaca", cursor: m.deleted ? "not-allowed" : "pointer", opacity: m.deleted ? 0.5 : 1, fontFamily:"inherit", fontSize:"inherit"}}
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

                              <div style={{minWidth:0}}>
                                {!isSameAsPrev && (
                                  <div
                                    style={{fontSize:"10px", fontWeight:"bold", color: isMe ? "#93c5fd" : "rgba(209,213,219,0.7)"}}
                                  >
                                    {isMe ? (
                                      appView === "globalChat" ? (
                                        <button
                                          type="button"
                                          className="hover:underline underline-offset-2 text-left"
                                          onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            void openUserProfile(String(me.id || ""), {
                                              allowSelfPublic: true,
                                            });
                                          }}
                                          title={t("friendsMenu.userProfile.open")}
                                        >
                                          {t("friendsMenu.you")}
                                        </button>
                                      ) : (
                                        t("friendsMenu.you")
                                      )
                                    ) : (
                                      <span style={{display:"inline-flex", alignItems:"center", gap:"6px"}}>
                                        {appView === "globalChat" ? (
                                          <button
                                            type="button"
                                            style={{background:"none", border:"none", color:"inherit", cursor:"pointer", textAlign:"left", padding:0, font:"inherit"}}
                                            onClick={(e) => {
                                              e.preventDefault();
                                              e.stopPropagation();
                                              void openUserProfile(
                                                String(m.fromId || ""),
                                              );
                                            }}
                                            title={t("friendsMenu.userProfile.open")}
                                          >
                                            {displayHandle(m.fromHandle)}
                                          </button>
                                        ) : (
                                          <span>{displayHandle(m.fromHandle)}</span>
                                        )}
                                        {(() => {
                                          const badge = String(
                                            m.fromBadge || "",
                                          ).toLowerCase();
                                          const isDev =
                                            m.fromIsDev || badge === "dev";
                                          const isMod = badge === "mod";

                                          if (isDev) {
                                            return (
                                              <span style={{padding:"2px 6px", borderRadius:"4px", background:"rgba(220,38,38,0.8)", color:"white", fontSize:"9px", fontWeight:900, textTransform:"uppercase"}}>
                                                {t("friendsMenu.devs")}
                                              </span>
                                            );
                                          }
                                          if (isMod) {
                                            return (
                                              <span style={{padding:"2px 6px", borderRadius:"9999px", border:"1px solid rgba(125,211,252,0.25)", background:"rgba(14,165,233,0.15)", color:"#bae6fd", fontSize:"9px", fontWeight:900, textTransform:"uppercase"}}>
                                                MOD
                                              </span>
                                            );
                                          }
                                          return null;
                                        })()}
                                      </span>
                                    )}
                                  </div>
                                )}
                                <div
                                  style={(() => {
                                    const badge = String(m.fromBadge || "").toLowerCase();
                                    const isDev = m.fromIsDev || badge === "dev";
                                    const isMod = badge === "mod";
                                    const isSponsor = String(m.fromHandle || "").trim().toLowerCase() === "sponsor";
                                    const isHighlight = highlightMsgId === m.id;
                                    const borderColor = isHighlight
                                      ? "rgba(147,197,253,0.9)"
                                      : (!isSponsor && isDev)
                                        ? "rgba(248,113,113,0.25)"
                                        : (!isSponsor && isMod)
                                          ? "rgba(125,211,252,0.25)"
                                          : "rgba(255,255,255,0.1)";
                                    const background = !isSponsor && isDev
                                      ? (isMe ? "rgba(220,38,38,0.7)" : "rgba(239,68,68,0.1)")
                                      : !isSponsor && isMod
                                        ? (isMe ? "rgba(2,132,199,0.7)" : "rgba(14,165,233,0.1)")
                                        : (isMe ? "rgba(37,99,235,0.8)" : "rgba(255,255,255,0.05)");
                                    return {
                                      padding: "8px 12px",
                                      borderRadius: "16px",
                                      fontSize: "0.75rem",
                                      border: `1px solid ${borderColor}`,
                                      whiteSpace: "pre-wrap" as const,
                                      wordBreak: "break-word" as const,
                                      overflowWrap: "anywhere" as const,
                                      textAlign: "justify" as const,
                                      background,
                                      fontStyle: m.deleted ? "italic" : undefined,
                                      color: m.deleted ? "rgba(209,213,219,0.7)" : "white",
                                      borderTopRightRadius: isSameAsPrev && isMe ? 0 : undefined,
                                      borderTopLeftRadius: isSameAsPrev && !isMe ? 0 : undefined,
                                      borderBottomRightRadius: isSameAsNext && isMe ? 0 : undefined,
                                      borderBottomLeftRadius: isSameAsNext && !isMe ? 0 : undefined,
                                      outline: isHighlight ? "4px solid rgba(96,165,250,0.6)" : undefined,
                                      animation: isHighlight ? "pulse 2s cubic-bezier(0.4,0,0.6,1) infinite" : undefined,
                                    };
                                  })()}
                                >
                                  {m.replyToId ? (
                                    <button
                                      type="button"
                                      style={{width:"100%", marginBottom:"4px", padding:"4px 8px", borderRadius:"12px", border:"1px solid rgba(255,255,255,0.1)", background:"rgba(0,0,0,0.2)", fontSize:"10px", color:"rgba(255,255,255,0.7)", textAlign:"left", cursor:"pointer", fontFamily:"inherit"}}
                                      onMouseDown={(e) => {
                                        e.stopPropagation();
                                        try {
                                          (e.nativeEvent as any)?.stopImmediatePropagation?.();
                                        } catch {}
                                      }}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        try {
                                          (e.nativeEvent as any)?.stopImmediatePropagation?.();
                                        } catch {}
                                        if (m.replyToId) void jumpToMessage(m.replyToId);
                                      }}
                                    >
                                      <div style={{fontWeight:800, letterSpacing:"0.1em", textTransform:"uppercase", color:"rgba(255,255,255,0.5)"}}>
                                        {t("friendsMenu.reply.to")}{" "}
                                        {displayHandle(String(m.replyToFromHandle || "-"))}
                                      </div>
                                      <div style={{color:"rgba(255,255,255,0.8)"}}>
                                        {String(m.replyToSnippet || "")}
                                      </div>
                                    </button>
                                  ) : null}

                                  {m.deleted
                                    ? m.deletedByAdmin
                                      ? t("friendsMenu.deletedByAdmin")
                                      : t("friendsMenu.deleted")
                                    : (() => {
                                        const kind = String(
                                          (m as any)?.kind || "text",
                                        ).trim();
                                        const metaRaw = (m as any)?.meta;
                                        const meta: Record<string, any> =
                                          metaRaw && typeof metaRaw === "object"
                                            ? metaRaw
                                            : {};

                                        const server = String(meta.server || "").trim();
                                        const otherHandle = displayHandle(
                                          isMe
                                            ? selectedFriend?.handle
                                            : String(m.fromHandle || ""),
                                        );
                                        const showServer = !!server;
                                        const copied = copiedIpMsgId === m.id;

                                        const copyBtn = server ? (
                                          <button
                                            type="button"
                                            className={cn(
                                              "mt-1 inline-flex items-center gap-2",
                                              "px-2 py-1 rounded-lg text-[10px] font-extrabold tracking-widest uppercase",
                                              "border border-white/10 bg-black/25 hover:bg-white/5 transition",
                                            )}
                                            onMouseDown={(e) => {
                                              e.stopPropagation();
                                              try {
                                                (e.nativeEvent as any)?.stopImmediatePropagation?.();
                                              } catch {}
                                            }}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              try {
                                                (e.nativeEvent as any)?.stopImmediatePropagation?.();
                                              } catch {}
                                              void copyServerIp(m.id, server);
                                            }}
                                          >
                                            {copied ? (
                                              <>
                                                <IconCheck size={14} />
                                                <span>
                                                  {t(
                                                    "friendsMenu.game.ipCopied",
                                                    "IP copyied",
                                                  )}
                                                </span>
                                              </>
                                            ) : (
                                              <>
                                                <IconCopy size={14} />
                                                <span>
                                                  {t(
                                                    "friendsMenu.game.copyIp",
                                                    "Copy IP",
                                                  )}
                                                </span>
                                              </>
                                            )}
                                          </button>
                                        ) : null;

                                        if (kind === "game_invite") {
                                          return (
                                            <div className="space-y-1">
                                              <div className="text-[10px] font-extrabold tracking-widest uppercase text-white/70">
                                                {t(
                                                  "friendsMenu.game.invite",
                                                  "Invitación",
                                                )}
                                              </div>
                                              <div className="text-xs font-semibold text-white/90">
                                                {isMe
                                                  ? showServer
                                                    ? t(
                                                        "friendsMenu.game.inviteSentWithServer",
                                                        {
                                                          user: otherHandle,
                                                          server,
                                                        },
                                                      )
                                                    : t(
                                                        "friendsMenu.game.inviteSent",
                                                        {
                                                          user: otherHandle,
                                                        },
                                                      )
                                                  : showServer
                                                    ? t(
                                                        "friendsMenu.game.inviteReceivedWithServer",
                                                        {
                                                          user: otherHandle,
                                                          server,
                                                        },
                                                      )
                                                    : t(
                                                        "friendsMenu.game.inviteReceived",
                                                        {
                                                          user: otherHandle,
                                                        },
                                                      )}
                                              </div>
                                              {showServer ? (
                                                <div className="text-[11px] text-white/80">
                                                  <span className="font-extrabold tracking-widest uppercase text-white/50">
                                                    IP
                                                  </span>
                                                  <span className="ml-2 font-semibold break-all">
                                                    {server}
                                                  </span>
                                                </div>
                                              ) : null}
                                              {copyBtn}
                                            </div>
                                          );
                                        }

                                        if (kind === "join_request") {
                                          const working = joinReqWorkingById[m.id];
                                          const canRespond = !isMe;
                                          const status = String(
                                            meta.status || "pending",
                                          )
                                            .trim()
                                            .toLowerCase();
                                          const resolved =
                                            status === "accepted" ||
                                            status === "declined";
                                          return (
                                            <div className="space-y-2">
                                              <div className="text-[10px] font-extrabold tracking-widest uppercase text-white/70">
                                                {t(
                                                  "friendsMenu.game.joinRequest",
                                                  "Solicitud",
                                                )}
                                              </div>
                                              <div className="text-xs font-semibold text-white/90">
                                                {isMe
                                                  ? t(
                                                      "friendsMenu.game.joinRequestSent",
                                                      { user: otherHandle },
                                                    )
                                                  : t(
                                                      "friendsMenu.game.joinRequestReceived",
                                                      { user: otherHandle },
                                                    )}
                                              </div>

                                              {resolved ? (
                                                <div className="text-[10px] font-extrabold tracking-widest uppercase text-white/60">
                                                  {status === "accepted"
                                                    ? t(
                                                        "friendsMenu.game.requestAccepted",
                                                        "Aceptada",
                                                      )
                                                    : t(
                                                        "friendsMenu.game.requestDeclined",
                                                        "Rechazada",
                                                      )}
                                                </div>
                                              ) : canRespond ? (
                                                <div className="flex flex-wrap items-center gap-2">
                                                  <button
                                                    type="button"
                                                    className={cn(
                                                      "inline-flex items-center gap-2",
                                                      "whitespace-nowrap",
                                                      "px-2 py-1 rounded-lg text-[10px] font-extrabold tracking-widest uppercase",
                                                      "border border-white/10 bg-white/5 hover:bg-white/10 transition",
                                                      working && "opacity-70",
                                                    )}
                                                    disabled={!!working}
                                                    onMouseDown={(e) => {
                                                      e.stopPropagation();
                                                      try {
                                                        (e.nativeEvent as any)?.stopImmediatePropagation?.();
                                                      } catch {}
                                                    }}
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      try {
                                                        (e.nativeEvent as any)?.stopImmediatePropagation?.();
                                                      } catch {}
                                                      void acceptJoinRequest(m.id);
                                                    }}
                                                  >
                                                    <IconCheck size={14} />
                                                    {t(
                                                      "friendsMenu.game.accept",
                                                      "Aceptar",
                                                    )}
                                                  </button>
                                                  <button
                                                    type="button"
                                                    className={cn(
                                                      "inline-flex items-center gap-2",
                                                      "whitespace-nowrap",
                                                      "px-2 py-1 rounded-lg text-[10px] font-extrabold tracking-widest uppercase",
                                                      "border border-white/10 bg-black/25 hover:bg-white/5 transition",
                                                      working && "opacity-70",
                                                    )}
                                                    disabled={!!working}
                                                    onMouseDown={(e) => {
                                                      e.stopPropagation();
                                                      try {
                                                        (e.nativeEvent as any)?.stopImmediatePropagation?.();
                                                      } catch {}
                                                    }}
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      try {
                                                        (e.nativeEvent as any)?.stopImmediatePropagation?.();
                                                      } catch {}
                                                      void declineJoinRequest(m.id);
                                                    }}
                                                  >
                                                    <IconX size={14} />
                                                    {t(
                                                      "friendsMenu.game.decline",
                                                      "Rechazar",
                                                    )}
                                                  </button>
                                                </div>
                                              ) : null}
                                            </div>
                                          );
                                        }

                                        if (kind === "join_accept") {
                                          return (
                                            <div className="space-y-1">
                                              <div className="text-[10px] font-extrabold tracking-widest uppercase text-white/70">
                                                {t(
                                                  "friendsMenu.game.joinAccepted",
                                                  "Aceptado",
                                                )}
                                              </div>
                                              <div className="text-xs font-semibold text-white/90">
                                                {isMe
                                                  ? t(
                                                      "friendsMenu.game.joinAcceptedByYou",
                                                      { user: otherHandle },
                                                    )
                                                  : t(
                                                      "friendsMenu.game.joinAcceptedByOther",
                                                      { user: otherHandle },
                                                    )}
                                              </div>
                                              {showServer ? (
                                                <div className="text-[11px] text-white/80">
                                                  <span className="font-extrabold tracking-widest uppercase text-white/50">
                                                    IP
                                                  </span>
                                                  <span className="ml-2 font-semibold break-all">
                                                    {server}
                                                  </span>
                                                </div>
                                              ) : null}
                                              {copyBtn}
                                            </div>
                                          );
                                        }

                                        if (kind === "join_decline") {
                                          return (
                                            <div className="space-y-1">
                                              <div className="text-[10px] font-extrabold tracking-widest uppercase text-white/70">
                                                {t(
                                                  "friendsMenu.game.joinDeclined",
                                                  "Rechazado",
                                                )}
                                              </div>
                                              <div className="text-xs font-semibold text-white/90">
                                                {isMe
                                                  ? t(
                                                      "friendsMenu.game.joinDeclinedByYou",
                                                      { user: otherHandle },
                                                    )
                                                  : t(
                                                      "friendsMenu.game.joinDeclinedByOther",
                                                      { user: otherHandle },
                                                    )}
                                              </div>
                                            </div>
                                          );
                                        }

                                        return splitHttpLinks(
                                          String(m.body || ""),
                                        ).map((p, idx) =>
                                          p.type === "link" && p.href ? (
                                            <a
                                              key={idx}
                                              href={p.href}
                                              style={{color:"#93c5fd", textDecoration:"underline", textUnderlineOffset:"2px", wordBreak:"break-all"}}
                                              onClick={(e) => {
                                                e.preventDefault();
                                                void openExternalSafe(p.href!);
                                              }}
                                            >
                                              {p.value}
                                            </a>
                                          ) : (
                                            <span key={idx}>{p.value}</span>
                                          ),
                                        );
                                      })()}
                                </div>
                              </div>

                              {!isMe ? (
                                <div
                                  style={{position:"relative", flexShrink:0, display:"flex", alignItems:"center", opacity:0}}
                                  className="group-hover:opacity-100 transition"
                                  data-msg-menu-root="1"
                                >
                                  <button
                                    type="button"
                                    style={{padding:"4px 6px", borderRadius:"8px", border:"1px solid rgba(255,255,255,0.1)", background:"rgba(0,0,0,0.35)", color:"white", cursor:"pointer", lineHeight:0}}
                                    onPointerDown={(e) => {
                                      if (e.button !== 0) return;
                                      e.preventDefault();
                                      e.stopPropagation();
                                      msgMenuAnchorRef.current =
                                        e.currentTarget as HTMLElement;
                                      setMsgMenu((prev) => {
                                        if (prev?.id === m.id) return null;
                                        const p = computeMenuPlacement(
                                          e.currentTarget as HTMLElement,
                                          baseDir,
                                        );
                                        return { id: m.id, baseDir, ...p };
                                      });
                                    }}
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key !== "Enter" && e.key !== " ") return;
                                      e.preventDefault();
                                      e.stopPropagation();
                                      msgMenuAnchorRef.current =
                                        e.currentTarget as HTMLElement;
                                      setMsgMenu((prev) => {
                                        if (prev?.id === m.id) return null;
                                        const p = computeMenuPlacement(
                                          e.currentTarget as HTMLElement,
                                          baseDir,
                                        );
                                        return { id: m.id, baseDir, ...p };
                                      });
                                    }}
                                  >
                                    {activeDir === "left" ? (
                                      <IconChevronLeft
                                        size={14}
                                        style={{color:"rgba(255,255,255,0.7)"}}
                                      />
                                    ) : (
                                      <IconChevronRight
                                        size={14}
                                        style={{color:"rgba(255,255,255,0.7)"}}
                                      />
                                    )}
                                  </button>

                                  {msgMenu?.id === m.id ? (
                                    <div
                                      ref={msgMenuBoxRef}
                                      style={{
                                        position:"absolute",
                                        width:"160px",
                                        borderRadius:"12px",
                                        border:"1px solid rgba(255,255,255,0.1)",
                                        background:"rgba(0,0,0,0.7)",
                                        backdropFilter:"blur(12px)",
                                        padding:"4px",
                                        fontSize:"0.75rem",
                                        bottom: msgMenu.v === "up" ? 0 : undefined,
                                        top: msgMenu.v === "up" ? undefined : 0,
                                        right: msgMenu.dir === "left" ? "100%" : undefined,
                                        marginRight: msgMenu.dir === "left" ? "8px" : undefined,
                                        left: msgMenu.dir === "left" ? undefined : "100%",
                                        marginLeft: msgMenu.dir === "left" ? undefined : "8px",
                                      }}
                                    >
                                      <div style={{padding:"4px 8px", fontSize:"10px", color:"rgba(255,255,255,0.6)"}}>
                                        {t("friendsMenu.msgMenu.sentAt")}:{" "}
                                        {new Date(m.createdAt).toLocaleString()}
                                      </div>

                                      <button
                                        type="button"
                                        style={{width:"100%", textAlign:"left", padding:"6px 8px", borderRadius:"8px", background:"none", border:"none", color:"white", cursor:"pointer", fontFamily:"inherit", fontSize:"inherit"}}
                                        onClick={() => {
                                          startReply(m, false);
                                          setMsgMenu(null);
                                        }}
                                      >
                                        {t("friendsMenu.msgMenu.reply")}
                                      </button>
                                      <button
                                        type="button"
                                        disabled={m.deleted}
                                        style={{width:"100%", textAlign:"left", padding:"6px 8px", borderRadius:"8px", background:"none", border:"none", color:"white", cursor: m.deleted ? "not-allowed" : "pointer", opacity: m.deleted ? 0.5 : 1, fontFamily:"inherit", fontSize:"inherit"}}
                                        onClick={() => {
                                          void copyMessage(m);
                                          setMsgMenu(null);
                                        }}
                                      >
                                        {t("friendsMenu.msgMenu.copy")}
                                      </button>

                                      <button
                                        type="button"
                                        disabled={m.deleted}
                                        style={{width:"100%", textAlign:"left", padding:"6px 8px", borderRadius:"8px", background:"none", border:"none", color:"white", cursor: m.deleted ? "not-allowed" : "pointer", opacity: m.deleted ? 0.5 : 1, fontFamily:"inherit", fontSize:"inherit"}}
                                        onClick={() => openReport(m)}
                                      >
                                        {t("friendsMenu.msgMenu.report")}
                                      </button>

                                      {(() => {
                                        const role = String(
                                          (me as any)?.role || "",
                                        ).toLowerCase();
                                        return role === "dev" || role === "mod";
                                      })() ? (
                                        <button
                                          type="button"
                                          disabled={m.deleted}
                                          style={{width:"100%", textAlign:"left", padding:"6px 8px", borderRadius:"8px", background:"none", border:"none", color:"#fecaca", cursor: m.deleted ? "not-allowed" : "pointer", opacity: m.deleted ? 0.5 : 1, fontFamily:"inherit", fontSize:"inherit"}}
                                          onClick={() => {
                                            setMsgMenu(null);
                                            void deleteOwnMessage(m.id);
                                          }}
                                        >
                                          {t("friendsMenu.msgMenu.delete")}
                                        </button>
                                      ) : null}
                                    </div>
                                  ) : null}
                                </div>
                              ) : null}

                              {isMe ? (
                                <div style={{position:"relative", height:"32px", width:"32px", borderRadius:"9999px", background:"rgba(255,255,255,0.1)", border:"1px solid rgba(255,255,255,0.1)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, overflow:"hidden"}}>
                                  {(() => {
                                    const userId = String(me.id || "");
                                    const h =
                                      avatarHashByUserId[userId] ||
                                      String(me.avatarHash || "").trim();
                                    const broken = !!avatarBrokenByUserId[userId];
                                    const src = !broken
                                      ? avatarUrlFor(userId, h)
                                      : null;
                                    if (!src) {
                                      return (
                                        <span style={{fontSize:"10px", fontWeight:800, color:"rgba(255,255,255,0.8)"}}>
                                          {initials(me.handle)}
                                        </span>
                                      );
                                    }
                                    return (
                                      <img
                                        src={src}
                                        alt={me.handle}
                                        style={{height:"100%", width:"100%", objectFit:"cover"}}
                                        onError={() =>
                                          setAvatarBrokenByUserId((prev) => ({
                                            ...prev,
                                            [userId]: true,
                                          }))
                                        }
                                      />
                                    );
                                  })()}
                                </div>
                              ) : null}
                            </HStack>
                          </Box>
                        </Box>
                      </div>
                    );
                    })}
                  </Box>

                  {showScrollToBottom ? (
                    <button
                      type="button"
                      style={{position:"absolute", bottom:"12px", right:"12px", zIndex:10, height:"36px", width:"36px", borderRadius:"9999px", border:"1px solid rgba(255,255,255,0.1)", background:"rgba(0,0,0,0.4)", display:"inline-flex", alignItems:"center", justifyContent:"center", cursor:"pointer", color:"white"}}
                      onClick={() => {
                        const el = msgScrollRef.current;
                        if (!el) return;
                        try {
                          const prefersReduced =
                            typeof window !== "undefined" &&
                            typeof window.matchMedia === "function" &&
                            window.matchMedia(
                              "(prefers-reduced-motion: reduce)",
                            ).matches;
                          el.scrollTo({
                            top: el.scrollHeight,
                            behavior: prefersReduced ? "auto" : "smooth",
                          });
                        } catch {
                          el.scrollTop = el.scrollHeight;
                        }
                      }}
                      aria-label={t("common.back")}
                      title={t("common.back")}
                    >
                      <IconChevronDown size={18} style={{color:"rgba(255,255,255,0.8)"}} />
                    </button>
                  ) : null}
                </Box>

                <VStack mt={2} gap={2} align="stretch">
                  {replyDraft ? (
                    <HStack gap={2} px={3} py={2} rounded="xl" border="1px solid" borderColor="rgba(255,255,255,0.1)" bg="rgba(0,0,0,0.25)">
                      <Box fontSize="10px" fontWeight="extrabold" letterSpacing="widest" color="rgba(255,255,255,0.6)" textTransform="uppercase">
                        {t("friendsMenu.reply.replyingTo")}
                      </Box>
                      <Box flex={1} minW={0} fontSize="11px" color="rgba(255,255,255,0.8)" style={{overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>
                        {displayHandle(replyDraft.fromHandle)}: {replyDraft.snippet}
                      </Box>
                      <button
                        type="button"
                        style={{padding:"2px 8px", fontSize:"11px", borderRadius:"8px", border:"1px solid rgba(255,255,255,0.1)", background:"rgba(0,0,0,0.35)", color:"white", cursor:"pointer", fontFamily:"inherit"}}
                        onClick={() => setReplyDraft(null)}
                      >
                        {t("friendsMenu.reply.cancel")}
                      </button>
                    </HStack>
                  ) : null}

                  <HStack gap={2} align="stretch">
                    <textarea
                      ref={msgInputRef}
                      rows={1}
                      value={msgText}
                      onChange={(e) => {
                        const next = e.target.value;
                        if (countLineBreaks(next) > MAX_MSG_LINE_BREAKS) return;
                        setMsgText(next);
                      }}
                      placeholder={
                        appView === "globalChat"
                          ? t("friendsMenu.placeholders.globalMessage")
                          : t("friendsMenu.placeholders.dmMessage")
                      }
                      disabled={appView === "dm" && !selectedFriend}
                      style={{flex:1, background:"rgba(0,0,0,0.4)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:"8px", padding:"8px 12px", fontSize:"0.875rem", color:"white", outline:"none", fontFamily:"inherit", resize:"none", minHeight:"40px", maxHeight:"96px", overflowY:"auto", opacity: appView === "dm" && !selectedFriend ? 0.6 : 1, cursor: appView === "dm" && !selectedFriend ? "not-allowed" : "auto", boxSizing:"border-box"}}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter") return;
                        if (e.shiftKey) {
                          // Shift+Enter adds a line break (up to MAX).
                          if (countLineBreaks(msgText) >= MAX_MSG_LINE_BREAKS) {
                            e.preventDefault();
                          }
                          return;
                        }

                        // Enter sends.
                        e.preventDefault();
                        void sendMessage();
                      }}
                    />
                    <div
                      style={{position:"relative", flexShrink:0, display:"flex", alignItems:"stretch", gap:"8px"}}
                      data-kaomoji-root="1"
                    >
                      {countLineBreaks(msgText) > 0 ? (
                        <div style={{position:"absolute", top:"-16px", right:0, padding:"2px 6px", borderRadius:"6px", border:"1px solid rgba(255,255,255,0.1)", background:"rgba(0,0,0,0.35)", fontSize:"10px", color:"rgba(255,255,255,0.8)"}}>
                          {Math.min(
                            countLineBreaks(msgText),
                            MAX_MSG_LINE_BREAKS,
                          )}
                          /{MAX_MSG_LINE_BREAKS}
                        </div>
                      ) : null}

                      <button
                        ref={kaomojiBtnRef}
                        type="button"
                        disabled={appView === "dm" && !selectedFriend}
                        title={t("friendsMenu.kaomojis.title")}
                        aria-label={t("friendsMenu.kaomojis.title")}
                        style={{height:"40px", width:"56px", display:"inline-flex", alignItems:"center", justifyContent:"center", borderRadius:"8px", border:"1px solid rgba(255,255,255,0.1)", background:"rgba(0,0,0,0.35)", cursor: (appView === "dm" && !selectedFriend) ? "not-allowed" : "pointer", opacity: (appView === "dm" && !selectedFriend) ? 0.6 : 1, color:"white"}}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          try {
                            (e.nativeEvent as any)?.stopImmediatePropagation?.();
                          } catch {}
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          try {
                            (e.nativeEvent as any)?.stopImmediatePropagation?.();
                          } catch {}
                          setKaomojiOpen((v) => !v);
                        }}
                      >
                        <span style={{fontSize:"11px", lineHeight:1, fontWeight:800, letterSpacing:"-0.025em", color:"rgba(255,255,255,0.8)", whiteSpace:"nowrap"}}>
                          {t("friendsMenu.kaomojis.trigger")}
                        </span>
                      </button>

                      {kaomojiOpen
                        ? createPortal(
                            <div
                              ref={kaomojiBoxRef}
                              data-kaomoji-box="1"
                              style={{
                                position:"fixed",
                                zIndex:9999,
                                width:"520px",
                                maxWidth:"95vw",
                                borderRadius:"8px",
                                border:"1px solid rgba(255,255,255,0.1)",
                                background:"rgba(0,0,0,0.45)",
                                backdropFilter:"blur(12px)",
                                boxShadow:"0 25px 50px -12px rgba(0,0,0,0.5)",
                                padding:"8px",
                                left: kaomojiMenuPos?.left ?? 8,
                                top: kaomojiMenuPos?.top ?? 8,
                              }}
                              onMouseDown={(e) => {
                                e.stopPropagation();
                                try {
                                  (e.nativeEvent as any)?.stopImmediatePropagation?.();
                                } catch {}
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                try {
                                  (e.nativeEvent as any)?.stopImmediatePropagation?.();
                                } catch {}
                              }}
                            >
                              <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", gap:"8px"}}>
                                <div style={{fontSize:"10px", fontWeight:800, letterSpacing:"0.1em", color:"white", textTransform:"uppercase"}}>
                                  {t("friendsMenu.kaomojis.title")}
                                </div>
                              </div>

                              <div style={{marginTop:"8px", display:"flex", gap:"8px"}}>
                                <div style={{width:"210px", maxHeight:"280px", overflowY:"auto"}} className="dark-scrollbar">
                                  <div style={{display:"flex", flexDirection:"column", gap:"4px"}}>
                                    {KAOMOJI_CATEGORIES.map((c) => (
                                      <button
                                        key={c.id}
                                        type="button"
                                        style={{width:"100%", textAlign:"left", padding:"8px", borderRadius:"8px", border:"1px solid rgba(255,255,255,0.1)", fontSize:"11px", fontWeight:"bold", color:"white", background: c.id === kaomojiCatId ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.05)", cursor:"pointer", fontFamily:"inherit"}}
                                        onClick={() => setKaomojiCatId(c.id)}
                                      >
                                        <div style={{overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>
                                          {t(`friendsMenu.kaomojis.categories.${c.id}`)}
                                        </div>
                                      </button>
                                    ))}
                                  </div>
                                </div>

                                <div style={{flex:1, maxHeight:"280px", overflowY:"auto"}} className="dark-scrollbar">
                                  <div style={{display:"flex", flexDirection:"column", gap:"4px"}}>
                                    {(KAOMOJI_CATEGORIES.find(
                                      (c) => c.id === kaomojiCatId,
                                    )?.items ||
                                      KAOMOJI_CATEGORIES[0]?.items ||
                                      []).map((k, idx) => {
                                      const meaning = t(
                                        `friendsMenu.kaomojis.items.${kaomojiCatId}.${idx}`,
                                        { defaultValue: "" },
                                      );
                                      return (
                                        <button
                                          key={k.text}
                                          type="button"
                                          style={{width:"100%", padding:"8px", borderRadius:"8px", border:"1px solid rgba(255,255,255,0.1)", background:"rgba(255,255,255,0.05)", textAlign:"left", cursor:"pointer", fontFamily:"inherit"}}
                                          title={meaning}
                                          onClick={(e) =>
                                            insertKaomoji(k.text, e.shiftKey)
                                          }
                                        >
                                          <div style={{minWidth:0}}>
                                            <div style={{fontSize:"0.875rem", fontWeight:800, color:"rgba(255,255,255,0.9)", whiteSpace:"nowrap", overflowX:"auto"}} className="dark-scrollbar">
                                              {k.text}
                                            </div>
                                            <div style={{marginTop:"2px", fontSize:"10px", color:"rgba(255,255,255,0.6)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>
                                              {meaning}
                                            </div>
                                          </div>
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              </div>
                            </div>,
                            document.body,
                          )
                        : null}

                      <button
                        type="button"
                        disabled={appView === "dm" && !selectedFriend}
                        title={t("common.send")}
                        aria-label={t("common.send")}
                        style={{height:"40px", width:"40px", display:"inline-flex", alignItems:"center", justifyContent:"center", borderRadius:"8px", border:"1px solid rgba(255,255,255,0.1)", background:"rgba(0,0,0,0.35)", cursor: (appView === "dm" && !selectedFriend) ? "not-allowed" : "pointer", opacity: (appView === "dm" && !selectedFriend) ? 0.6 : 1, color:"white"}}
                        onClick={() => void sendMessage()}
                      >
                        <IconArrowUpRight size={18} style={{color:"rgba(255,255,255,0.8)"}} />
                      </button>
                    </div>
                  </HStack>
                </VStack>
              </>
            )}
          </Box>
        ) : null}

        {report.open ? (
          <Box position="absolute" inset={0} zIndex={40} display="flex" alignItems="center" justifyContent="center" bg="rgba(0,0,0,0.5)" p={3}>
            <Box w="full" maxW="360px" rounded="2xl" border="1px solid rgba(255,255,255,0.1)" bg="rgba(0,0,0,0.7)" style={{backdropFilter:"blur(12px)"}} p={3}>
              <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", gap:"8px"}}>
                <div style={{fontSize:"0.75rem", fontWeight:800, letterSpacing:"0.1em", color:"rgba(255,255,255,0.7)", textTransform:"uppercase"}}>
                  {t("friendsMenu.report.title")}
                </div>
                <button
                  type="button"
                  style={{padding:"4px 8px", fontSize:"0.75rem", borderRadius:"8px", border:"1px solid rgba(255,255,255,0.1)", background:"rgba(0,0,0,0.25)", color:"white", cursor:"pointer", fontFamily:"inherit"}}
                  onClick={() =>
                    setReport({
                      open: false,
                      msg: null,
                      category: "",
                      reason: "",
                      details: "",
                      sending: false,
                    })
                  }
                  disabled={report.sending}
                >
                  X
                </button>
              </div>

              <div style={{marginTop:"8px", fontSize:"11px", color:"rgba(255,255,255,0.7)"}}>
                {t("friendsMenu.report.reporting")}{" "}
                <span style={{fontWeight:"bold", color:"rgba(255,255,255,0.8)"}}>
                  {report.msg?.fromHandle || "-"}
                </span>
              </div>

              <div style={{marginTop:"12px", display:"flex", flexDirection:"column", gap:"8px", fontSize:"0.75rem"}}>
                <div style={{fontSize:"11px", fontWeight:"bold", color:"rgba(255,255,255,0.7)", textTransform:"uppercase"}}>
                  {t("friendsMenu.report.category")}
                </div>
                {(
                  [
                    {
                      k: "security_violence",
                      label: t("friendsMenu.report.cats.security_violence"),
                    },
                    {
                      k: "offensive",
                      label: t("friendsMenu.report.cats.offensive"),
                    },
                    {
                      k: "spam_quality",
                      label: t("friendsMenu.report.cats.spam_quality"),
                    },
                    { k: "other", label: t("friendsMenu.report.cats.other") },
                  ] as const
                ).map((c) => (
                  <label
                    key={c.k}
                    style={{display:"flex", alignItems:"center", gap:"8px", padding:"8px", borderRadius:"12px", border:"1px solid rgba(255,255,255,0.1)", background:"rgba(0,0,0,0.25)", cursor:"pointer"}}
                  >
                    <input
                      type="radio"
                      name="repCat"
                      checked={report.category === c.k}
                      onChange={() =>
                        setReport((p) => ({
                          ...p,
                          category: c.k,
                          reason: "",
                          details: "",
                        }))
                      }
                    />
                    <span>{c.label}</span>
                  </label>
                ))}

                {report.category && report.category !== "other" ? (
                  <>
                    <div style={{marginTop:"8px", fontSize:"11px", fontWeight:"bold", color:"rgba(255,255,255,0.7)", textTransform:"uppercase"}}>
                      {t("friendsMenu.report.reason")}
                    </div>
                    <div style={{display:"flex", flexDirection:"column", gap:"8px"}}>
                      {report.category === "security_violence" ? (
                        <>
                          {(
                            [
                              {
                                k: "threats_violence",
                                label: t(
                                  "friendsMenu.report.reasons.threats_violence",
                                ),
                              },
                              {
                                k: "bullying",
                                label: t("friendsMenu.report.reasons.bullying"),
                              },
                              {
                                k: "doxxing",
                                label: t("friendsMenu.report.reasons.doxxing"),
                              },
                            ] as const
                          ).map((r) => (
                            <label
                              key={r.k}
                              style={{display:"flex", alignItems:"center", gap:"8px", padding:"8px", borderRadius:"12px", border:"1px solid rgba(255,255,255,0.1)", background:"rgba(0,0,0,0.25)", cursor:"pointer"}}
                            >
                              <input
                                type="radio"
                                name="repReason"
                                checked={report.reason === r.k}
                                onChange={() =>
                                  setReport((p) => ({ ...p, reason: r.k }))
                                }
                              />
                              <span>{r.label}</span>
                            </label>
                          ))}
                        </>
                      ) : null}

                      {report.category === "offensive" ? (
                        <>
                          {(
                            [
                              {
                                k: "hate_speech",
                                label: t(
                                  "friendsMenu.report.reasons.hate_speech",
                                ),
                              },
                              {
                                k: "sexual_nsfw",
                                label: t(
                                  "friendsMenu.report.reasons.sexual_nsfw",
                                ),
                              },
                            ] as const
                          ).map((r) => (
                            <label
                              key={r.k}
                              style={{display:"flex", alignItems:"center", gap:"8px", padding:"8px", borderRadius:"12px", border:"1px solid rgba(255,255,255,0.1)", background:"rgba(0,0,0,0.25)", cursor:"pointer"}}
                            >
                              <input
                                type="radio"
                                name="repReason"
                                checked={report.reason === r.k}
                                onChange={() =>
                                  setReport((p) => ({ ...p, reason: r.k }))
                                }
                              />
                              <span>{r.label}</span>
                            </label>
                          ))}
                        </>
                      ) : null}

                      {report.category === "spam_quality" ? (
                        <>
                          {(
                            [
                              {
                                k: "spam_ads",
                                label: t("friendsMenu.report.reasons.spam_ads"),
                              },
                              {
                                k: "phishing",
                                label: t("friendsMenu.report.reasons.phishing"),
                              },
                            ] as const
                          ).map((r) => (
                            <label
                              key={r.k}
                              style={{display:"flex", alignItems:"center", gap:"8px", padding:"8px", borderRadius:"12px", border:"1px solid rgba(255,255,255,0.1)", background:"rgba(0,0,0,0.25)", cursor:"pointer"}}
                            >
                              <input
                                type="radio"
                                name="repReason"
                                checked={report.reason === r.k}
                                onChange={() =>
                                  setReport((p) => ({ ...p, reason: r.k }))
                                }
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
                    onChange={(e) =>
                      setReport((p) => ({ ...p, details: e.target.value }))
                    }
                    placeholder={t("friendsMenu.report.otherPlaceholder")}
                    style={{width:"100%", background:"rgba(0,0,0,0.4)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:"8px", padding:"8px 12px", fontSize:"0.75rem", minHeight:"90px", outline:"none", color:"white", fontFamily:"inherit", resize:"vertical", boxSizing:"border-box"}}
                  />
                ) : null}

                <div style={{marginTop:"12px", display:"flex", gap:"8px"}}>
                  <button
                    type="button"
                    style={{flex:1, padding:"8px 12px", borderRadius:"8px", fontWeight:"bold", border:"1px solid rgba(255,255,255,0.1)", background:"rgba(0,0,0,0.35)", color:"white", cursor: report.sending ? "not-allowed" : "pointer", opacity: report.sending ? 0.6 : 1, fontFamily:"inherit", fontSize:"inherit"}}
                    onClick={() =>
                      setReport({
                        open: false,
                        msg: null,
                        category: "",
                        reason: "",
                        details: "",
                        sending: false,
                      })
                    }
                    disabled={report.sending}
                  >
                    {t("common.cancel")}
                  </button>
                  <button
                    type="button"
                    style={{flex:1, padding:"8px 12px", borderRadius:"8px", fontWeight:"bold", border:"1px solid rgba(255,255,255,0.1)", background:"rgba(37,99,235,0.8)", color:"white", cursor: report.sending ? "not-allowed" : "pointer", opacity: report.sending ? 0.6 : 1, fontFamily:"inherit", fontSize:"inherit"}}
                    onClick={() => void submitReport()}
                    disabled={report.sending}
                  >
                    {t("friendsMenu.report.submit")}
                  </button>
                </div>
              </div>
            </Box>
          </Box>
        ) : null}
      </Box>
    </Box>
  );
}
