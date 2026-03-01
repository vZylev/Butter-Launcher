import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  IconArrowUpRight,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconMessage,
  IconRefresh,
  IconTrash,
  IconUserCircle,
  IconUserPlus,
} from "@tabler/icons-react";
import cn from "../utils/cn";
import matchaIcon from "../assets/matcha-icon.png";
import matchaStartSfx from "../assets/matchastart.ogg";
import notiSfx from "../assets/noti.ogg";

const MAX_MSG_LINE_BREAKS = 3;

const countLineBreaks = (raw: string) => {
  const s = String(raw || "");
  // Count \n only (textarea on web/electron uses \n).
  return (s.match(/\n/g) || []).length;
};

type KaomojiItem = { text: string };
type KaomojiCategory = {
  id: string;
  items: KaomojiItem[];
};

const KAOMOJI_CATEGORIES: KaomojiCategory[] = [
  {
    id: "joy",
    items: [
      { text: "(≧▽≦)" },
      { text: "(⌒▽⌒)☆" },
      { text: "(*^▽^*)" },
      { text: "(o^▽^o)" },
      { text: "＼(＾▽＾)／" },
      { text: "(✧ω✧)" },
      { text: "(๑˃ᴗ˂)ﻭ" },
      { text: "╰(*´︶*)╯" },
      { text: "(✯◡✯)" },
      { text: "ヽ(・∀・)ﾉ" },
      { text: "٩(◕‿◕)۶" },
      { text: "(☆ω☆)" },
    ],
  },
  {
    id: "love",
    items: [
      { text: "(♡μ_μ)" },
      { text: "(*♡∀♡)" },
      { text: "(´ ω ♡)" },
      { text: "(≧◡≦) ♡" },
      { text: "(´• ω •) ♡" },
      { text: "( ´ ▽  ).｡ｏ♡" },
      { text: "(*¯ ³¯*)♡" },
      { text: "(っ˘з(˘⌣˘ ) ♡" },
      { text: "( ˘⌣˘)♡(˘⌣˘ )" },
      { text: "(♡-_-♡)" },
      { text: "(✿ ♥‿♥)" },
      { text: "(/^-^(^ ^*)/ ♡" },
    ],
  },
  {
    id: "sad",
    items: [
      { text: "(╥﹏╥)" },
      { text: "(ಥ﹏ಥ)" },
      { text: "(T_T)" },
      { text: "(ㄒoㄒ)" },
      { text: "(｡•́︿•̀｡)" },
      { text: "(っ- ‸ - ς)" },
      { text: "(；⌣̀_⌣́)" },
      { text: "(oT-T)尸" },
      { text: "(ノ_<。)" },
      { text: "(个_个)" },
      { text: "(╥_╥)" },
      { text: "(-_-)" },
    ],
  },
  {
    id: "angry",
    items: [
      { text: "(╬ Ò﹏Ó)" },
      { text: "(｀Д´)" },
      { text: "(＃\\Д´)" },
      { text: "(ꐦ ಠ皿ಠ )" },
      { text: "(ಠ_ಠ)" },
      { text: "(눈_눈)" },
      { text: "(ง •̀_•́)ง" },
      { text: "(╬益´)" },
      { text: "ヽ(д´*)ノ" },
      { text: "(凸ಠ益ಠ)凸" },
      { text: "(　ﾟДﾟ)＜!!" },
    ],
  },
  {
    id: "shock",
    items: [
      { text: "(O_O)" },
      { text: "(ﾟДﾟ;)" },
      { text: "(o_O)" },
      { text: "ヽ(°〇°)ﾉ" },
      { text: "(⊙_⊙)" },
      { text: "(□_□)" },
      { text: "(;;;*_*)" },
      { text: "(＞﹏＜)" },
      { text: "(〇_ｏ)" },
    ],
  },
  {
    id: "think",
    items: [
      { text: "(￣ω￣;)" },
      { text: "(´･_･`)" },
      { text: "(・_・;)" },
      { text: "(＠_＠)" },
      { text: "(・・;)ゞ" },
      { text: "┐('～`; )┌" },
      { text: "(￣～￣;)" },
      { text: "(ーー;)" },
      { text: "(⇀_⇀)" },
    ],
  },
  {
    id: "shy",
    items: [
      { text: "(⁄ ⁄•⁄ω⁄•⁄ ⁄)" },
      { text: "(*^.^*)" },
      { text: "(//▽//)" },
      { text: "(⁄ ⁄>⁄ ▽ ⁄<⁄ ⁄)" },
      { text: "(*μ_μ)" },
      { text: "(o-_-o)" },
      { text: "(,,>﹏<,,)" },
    ],
  },
  {
    id: "lenny",
    items: [
      { text: "( ͡° ͜ʖ ͡°)" },
      { text: "( ಠ ͜ʖಠ)" },
      { text: "( ͡~ ͜ʖ ͡°)" },
      { text: "¯\\_(ツ)_/¯" },
      { text: "(¬‿¬ )" },
      { text: "(￣▽￣)" },
      { text: "( 　ﾟ,_ゝﾟ)" },
      { text: "( ˘ ɜ˘) ♬♪♫" },
    ],
  },
  {
    id: "music",
    items: [
      { text: "ヾ(´〇`)ﾉ♪♪♪" },
      { text: "ヽ(o´∀`)ﾉ♪♬" },
      { text: "(〜￣▽￣)〜" },
      {
        text: "(ﾉ>ω<)ﾉ :｡･:*:･ﾟ’★",
      },
      { text: "(∩^o^)⊃━☆゜.*" },
      { text: "✧*。ヾ(｡>﹏<｡)ﾉﾞ✧*。" },
    ],
  },
  {
    id: "animals",
    items: [
      { text: "(=^･ｪ･^=)" },
      { text: "(=①ω①=)" },
      { text: "(＾• ω •＾)" },
      { text: "ʕ •ᴥ• ʔ" },
      { text: "ʕ •̀ ω •́ ʔ" },
      { text: "V●ᴥ●V" },
      { text: "∪･ω･∪" },
      { text: "(・θ・)" },
      { text: "＞°）m（°＜" },
      { text: ">゜))))彡" },
    ],
  },
  {
    id: "daily",
    items: [
      { text: "( ˘▽˘)っ♨" },
      { text: "(*´▽`)_旦~" },
      { text: "(っ˘ڡ˘ς)" },
      { text: "(￣o￣) zzZZ" },
      { text: "(－_－) zzZ" },
      { text: "(x . x) ~~zzZ" },
    ],
  },
  {
    id: "action",
    items: [
      { text: "( ﾒ ﾛ ´)︻デ═一" },
      { text: "O=(_´)q" },
      { text: "(ง'̀-'́)ง" },
      { text: "ᕕ( ᐛ )ᕗ" },
      { text: "ε=ε=┌( >_<)┘" },
    ],
  },
  {
    id: "tables",
    items: [
      { text: "(╯°□°）╯︵ ┻━┻" },
      { text: "(ノಠ益ಠ)ノ彡┻━┻" },
      { text: "(╯ರ ~ ರ)╯︵ ┻━┻" },
      {
        text: "┻━┻ ︵ヽ(\\Д´)ﾉ︵ ┻━┻",
      },
      { text: "┬─┬ノ( º _ ºノ)" },
      { text: "(ヘ･_･)ヘ┳━┳" },
    ],
  },
];

type HttpLinkPart = { type: "text" | "link"; value: string; href?: string };

const splitHttpLinks = (content: string): HttpLinkPart[] => {
  const text = String(content || "");
  const parts: HttpLinkPart[] = [];
  const urlRegex = /(https?:\/\/[^\s]+)/g;

  let lastIndex = 0;
  for (const match of text.matchAll(urlRegex)) {
    const raw = String(match[0] || "");
    const start = match.index ?? -1;
    if (start < 0) continue;

    if (start > lastIndex) {
      parts.push({ type: "text", value: text.slice(lastIndex, start) });
    }

    // Trim common trailing punctuation that should not be part of the URL.
    const trimmed = raw.replace(/[),.;\]]+$/g, "");
    const href = trimmed;
    parts.push({ type: "link", value: trimmed, href });
    lastIndex = start + raw.length;
  }

  if (lastIndex < text.length) {
    parts.push({ type: "text", value: text.slice(lastIndex) });
  }

  return parts.length ? parts : [{ type: "text", value: text }];
};

const openExternalSafe = async (url: string) => {
  const u = String(url || "").trim();
  if (!/^https?:\/\//i.test(u)) return;
  try {
    const opener = (window as any)?.config?.openExternal;
    if (typeof opener === "function") {
      await opener(u);
      return;
    }
  } catch {
    // ignore
  }
  try {
    window.open(u, "_blank", "noopener,noreferrer");
  } catch {
    // ignore
  }
};

const API_BASE = "https://butter.lat";
const WS_BASE = API_BASE.replace(/^http/, "ws");
const WS_URL = `${WS_BASE}/api/matcha/ws`;
const LS_TOKEN = "matcha:token";
const LS_UNREAD_PREFIX = "matcha:unread:";
const LS_DND_PREFIX = "matcha:dnd:";
const LS_LAST_INTERACTION_PREFIX = "matcha:lastInteraction:";

type MatchaMe = {
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
};

type MatchaPublicProfile = {
  id: string;
  handle: string;
  role?: string;
  createdAt?: string | null;
  messagesSentTotal?: number;
  avatarHash?: string;
  avatarMode?: "hytale" | "custom" | string;
  avatarDisabled?: boolean;
};

type FriendRow = {
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
};

type MsgMenuState = {
  id: string;
  dir: "left" | "right";
  v: "up" | "down";
  baseDir: "left" | "right";
};

type ReportCategory =
  | "security_violence"
  | "offensive"
  | "spam_quality"
  | "other";

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
  return await window.ipcRenderer.invoke(
    "fetch:json",
    `${API_BASE}${path}`,
    init ?? {},
  );
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

const unreadKeyFor = (meId: string) =>
  `${LS_UNREAD_PREFIX}${String(meId || "").trim()}`;

const dndKeyFor = (meId: string) =>
  `${LS_DND_PREFIX}${String(meId || "").trim()}`;

const lastInteractionKeyFor = (meId: string) =>
  `${LS_LAST_INTERACTION_PREFIX}${String(meId || "").trim()}`;

const readUnreadMap = (meId: string): Record<string, number> => {
  try {
    const key = unreadKeyFor(meId);
    if (!key) return {};
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return {};
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

const emitUnreadChanged = (meId: string, map: Record<string, number>) => {
  try {
    const total = Object.values(map || {}).reduce(
      (acc, v) => acc + (typeof v === "number" && Number.isFinite(v) ? v : 0),
      0,
    );
    window.dispatchEvent(
      new CustomEvent("matcha:unread-changed", { detail: { meId, total } }),
    );
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

const sanitizeLastInteractionMap = (raw: any): Record<string, number> => {
  try {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(raw as Record<string, any>)) {
      const id = String(k || "").trim();
      const n = typeof v === "number" ? v : Number(v);
      if (!id) continue;
      if (!Number.isFinite(n) || n <= 0) continue;
      out[id] = Math.floor(n);
    }

    // Avoid unbounded growth if many friend IDs accumulate over time.
    const entries = Object.entries(out);
    if (entries.length <= 500) return out;
    entries.sort((a, b) => (b[1] || 0) - (a[1] || 0));
    const trimmed: Record<string, number> = {};
    for (const [id, ms] of entries.slice(0, 500)) trimmed[id] = ms;
    return trimmed;
  } catch {
    return {};
  }
};

const readLastInteractionMap = (meId: string): Record<string, number> => {
  try {
    const key = lastInteractionKeyFor(meId);
    if (!key) return {};
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    return sanitizeLastInteractionMap(JSON.parse(raw));
  } catch {
    return {};
  }
};

const writeLastInteractionMap = (meId: string, map: Record<string, number>) => {
  try {
    const key = lastInteractionKeyFor(meId);
    if (!key) return;
    localStorage.setItem(key, JSON.stringify(sanitizeLastInteractionMap(map)));
  } catch {
    // ignore
  }
};

const isMongoObjectId = (raw: string): boolean => {
  const s = String(raw || "").trim();
  return /^[0-9a-f]{24}$/i.test(s);
};

export default function FriendsMenu({
  onClose,
  open,
  onOpenTerms,
  openTo,
  openToNonce,
  launcherUsername,
  gameDir,
}: {
  onClose: () => void;
  open: boolean;
  onOpenTerms: () => void;
  openTo?: "friends" | "globalChat";
  openToNonce?: number;
  launcherUsername?: string | null;
  gameDir?: string | null;
}) {
  const { t } = useTranslation();

  const [token, setToken] = useState<string | null>(() => readSavedToken());

  const [me, setMe] = useState<MatchaMe | null>(null);
  const [mode, setMode] = useState<
    "intro" | "login" | "register" | "app" | "proof"
  >(() => (readSavedToken() ? "app" : "intro"));
  const [error, setError] = useState<string>("");
  const [introSeq, setIntroSeq] = useState(0);
  const [introDocked, setIntroDocked] = useState(false);
  const introSfxRef = useRef<HTMLAudioElement | null>(null);

  const [profileOpen, setProfileOpen] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileLoadingUi, setProfileLoadingUi] = useState(false);
  const [profileErr, setProfileErr] = useState<string>("");
  const [profileUser, setProfileUser] = useState<MatchaMe | null>(null);
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
    return `${API_BASE}/api/matcha/avatar/${encodeURIComponent(userId)}?v=${encodeURIComponent(h)}`;
  };

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
      if (!t) localStorage.removeItem(LS_TOKEN);
      else localStorage.setItem(LS_TOKEN, t);
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

  const openUserProfile = async (userIdRaw: string) => {
    if (!token) return;
    if (!me?.id) return;

    const userId = String(userIdRaw || "").trim();
    if (!isMongoObjectId(userId)) return;

    // If the user clicks themselves, open the self-profile UI.
    if (String(me.id) === userId) {
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

  useEffect(() => {
    if (!token) {
      setMe(null);
      setUnreadDmByFriendId({});
      setLastInteractionByFriendId({});
      keepProofRef.current = false;
      setMode("intro");
      setIntroSeq((v) => v + 1);
      setIntroDocked(false);

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
        return (localStorage.getItem("accountType") || "").trim();
      } catch {
        return "";
      }
    })();

    const modeKey = `matcha:avatar:mode:${safeAccountType || "unknown"}:${user}`;
    const storedMode = (() => {
      try {
        return (localStorage.getItem(modeKey) || "").trim().toLowerCase();
      } catch {
        return "";
      }
    })();

    // If the user explicitly chose a custom avatar, don't run the Hytale sync.
    // The backend may ignore the upload, but our local hash update would still
    // override the visible avatar after reopening Friends.
    const effectiveMode = String(me?.avatarMode || storedMode || "")
      .trim()
      .toLowerCase();
    if (effectiveMode === "custom") return;

    const readBgColor = () => {
      try {
        return (
          localStorage.getItem(
            `matcha:avatar:bgColor:${safeAccountType || "unknown"}:${user}`,
          ) || ""
        ).trim();
      } catch {
        return "";
      }
    };

    let stopped = false;

    const lastUuidKey = `matcha:avatar:lastUuid:${safeAccountType || "unknown"}:${user}`;
    const disabledKey = `matcha:avatar:disabled:${safeAccountType || "unknown"}:${user}`;
    const doSync = async (force: boolean) => {
      if (avatarSyncWorking && !force) return;
      try {
        if (!force) {
          const isDisabled = (() => {
            try {
              return (localStorage.getItem(disabledKey) || "").trim() === "1";
            } catch {
              return false;
            }
          })();
          if (isDisabled || !!me?.avatarDisabled) return;
        }

        setAvatarSyncWorking(true);
        const lastUuid = (() => {
          try {
            return (localStorage.getItem(lastUuidKey) || "").trim();
          } catch {
            return "";
          }
        })();
        const lastHash = (() => {
          try {
            return lastUuid
              ? (localStorage.getItem(`matcha:avatar:lastHash:${lastUuid}`) || "").trim()
              : "";
          } catch {
            return "";
          }
        })();

        const customUUID = (() => {
          try {
            const raw = (localStorage.getItem("customUUID") || "").trim();
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
          try {
            localStorage.setItem(lastUuidKey, res.uuid);
            localStorage.setItem(`matcha:avatar:lastHash:${res.uuid}`, res.hash);
            localStorage.removeItem(disabledKey);
          } catch {
            // ignore
          }

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
            try {
              localStorage.setItem(disabledKey, "1");
            } catch {
              // ignore
            }
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
    <div
      ref={containerRef}
      className="no-drag relative rounded-xl border border-white/10 bg-black/45 backdrop-blur-md shadow-xl text-white overflow-hidden"
    >
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
          <div
            key={`matcha-intro-spark-${introSeq}`}
            aria-hidden="true"
            className="matcha-intro-spark z-30"
          />
        )
      ) : null}

      <div className="relative p-4">
        {error ? (
          <div className="absolute left-4 right-4 top-16 z-50">
            <div
              className={cn(
                "flex items-start justify-between gap-3",
                "text-xs text-red-100",
                "rounded-xl border border-red-300/40 bg-red-500/20 backdrop-blur",
                "px-3 py-2",
                "ring-4 ring-red-500/25 shadow-2xl shadow-red-500/25",
              )}
              role="alert"
            >
              <div className="min-w-0 break-words">
                {error}
              </div>
              <button
                type="button"
                className={cn(
                  "shrink-0 -mt-0.5 w-7 h-7 rounded-lg",
                  "border border-red-300/30 bg-black/20 hover:bg-black/30",
                  "text-red-100 font-extrabold",
                  "flex items-center justify-center",
                )}
                title={t("common.close")}
                aria-label={t("common.close")}
                onClick={() => setError("")}
              >
                ×
              </button>
            </div>
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-normal tracking-wide">
            {mode === "intro" ? (
              <div
                className={cn(
                  "flex items-center gap-2",
                  !introDocked && "opacity-0",
                )}
              >
                <img
                  src={matchaIcon}
                  alt={t("friendsMenu.brand")}
                  className="h-8 w-8 shrink-0"
                />
                <span className="text-xl font-bold normal-case tracking-wide leading-none">
                  {t("friendsMenu.brand")}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <img
                  src={matchaIcon}
                  alt={t("friendsMenu.brand")}
                  className="h-7 w-7 shrink-0"
                />
                <span className="text-base normal-case tracking-wide">
                  {t("friendsMenu.brand")}
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {mode === "app" && me ? (
              <>
                <button
                  type="button"
                  className={cn(
                    "relative h-9 w-9 rounded-full border border-white/10 bg-black/35 hover:bg-white/5 hover:border-white/20 transition",
                    "flex items-center justify-center overflow-hidden",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20",
                  )}
                  title={t("friendsMenu.profile.open")}
                  aria-label={t("friendsMenu.profile.open")}
                  onClick={() => void openProfile()}
                >
                  <IconUserCircle
                    className="absolute inset-0 h-full w-full text-white/35 pointer-events-none"
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
                        <div className="relative h-7 w-7 rounded-full overflow-hidden border border-white/10 bg-black/35">
                          <img
                            src={src}
                            alt={String(me.handle || "")}
                            className="h-full w-full object-cover"
                            onError={() =>
                              setAvatarBrokenByUserId((prev) => ({
                                ...prev,
                                [userId]: true,
                              }))
                            }
                          />
                        </div>
                      );
                    }
                    return (
                      <div className="relative h-7 w-7 rounded-full overflow-hidden border border-white/10 bg-black/35 flex items-center justify-center">
                        <span className="text-[10px] font-extrabold text-white/80">
                          {initials(String(me.handle || ""))}
                        </span>
                      </div>
                    );
                  })()}
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
                  {appView === "globalChat"
                    ? t("friendsMenu.friends")
                    : t("friendsMenu.globalChat")}
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
                onMouseDown={(e) => {
                  if (e.target !== e.currentTarget) return;
                  e.preventDefault();
                  e.stopPropagation();
                  setProfileOpen(false);
                }}
                onClick={(e) => {
                  // Swallow clicks so they don't hit the underlying Friends backdrop.
                  e.preventDefault();
                  e.stopPropagation();
                }}
                role="dialog"
                aria-modal="true"
                aria-label={t("friendsMenu.profile.title")}
              >
                <div
                  className={cn(
                    "w-full max-w-[420px] rounded-2xl border border-white/10",
                    "bg-black/70 backdrop-blur shadow-2xl p-4",
                    "animate-popIn",
                  )}
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-extrabold tracking-widest text-white/70 uppercase">
                      {t("friendsMenu.profile.title")}
                    </div>
                    <button
                      type="button"
                      className="px-2 py-1 text-xs rounded-lg border border-white/10 bg-black/25 hover:bg-white/5 transition text-white"
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
                  </div>

                  <div
                    className={cn(
                      "mt-1 text-[10px] font-bold tracking-widest uppercase text-white/50 transition-opacity duration-200",
                      profileLoadingUi ? "opacity-100" : "opacity-0",
                    )}
                    aria-live="polite"
                  >
                    {t("common.loading")}
                  </div>

                  {profileErr ? (
                    <div className="mt-3 text-xs text-red-200 border border-red-400/20 bg-red-500/10 rounded-lg px-2 py-2">
                      {profileErr}
                    </div>
                  ) : null}

                  <div
                    className={cn(
                      "mt-3 space-y-2 text-xs transition-opacity duration-200",
                      profileLoadingUi ? "opacity-70" : "opacity-100",
                    )}
                  >
                    <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
                      <div className="text-[10px] font-extrabold tracking-widest text-white/60 uppercase">
                        {t("friendsMenu.profile.avatar")}
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <div className="relative h-14 w-14 rounded-full bg-white/10 border border-white/10 flex items-center justify-center shrink-0 overflow-hidden">
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
                                <span className="text-xs font-extrabold text-white/80">
                                  {initials(String(u?.handle || ""))}
                                </span>
                              );
                            }

                            return (
                              <img
                                src={src}
                                alt={String(u?.handle || "")}
                                className="h-full w-full object-cover"
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

                        <div className="flex flex-wrap items-center justify-end gap-2 min-w-0">
                          {(() => {
                            const u = profileUser || me;
                            const isSelf = !!me && String(u?.id || "") === String(me.id || "");
                            const avatarMode = String(u?.avatarMode || "hytale").trim() === "custom" ? "custom" : "hytale";
                            const isCustom = avatarMode === "custom";

                            const safeAccountType = (() => {
                              try {
                                return (localStorage.getItem("accountType") || "").trim();
                              } catch {
                                return "";
                              }
                            })();

                            const user = String(launcherUsername || "").trim();
                            const dir = String(gameDir || "").trim();
                            const bgKey = `matcha:avatar:bgColor:${safeAccountType || "unknown"}:${user}`;
                            const modeKey = `matcha:avatar:mode:${safeAccountType || "unknown"}:${user}`;

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

                                  try {
                                    localStorage.removeItem(
                                      `matcha:avatar:disabled:${safeAccountType || "unknown"}:${user}`,
                                    );
                                    if (user) localStorage.setItem(modeKey, "custom");
                                  } catch {
                                    // ignore
                                  }
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

                                  try {
                                    localStorage.setItem(
                                      `matcha:avatar:disabled:${safeAccountType || "unknown"}:${user}`,
                                      "1",
                                    );
                                    if (user) localStorage.setItem(modeKey, "disabled");
                                  } catch {
                                    // ignore
                                  }
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

                              const lastUuidKey = `matcha:avatar:lastUuid:${safeAccountType || "unknown"}:${user}`;
                              const lastUuid = (() => {
                                try {
                                  return (localStorage.getItem(lastUuidKey) || "").trim();
                                } catch {
                                  return "";
                                }
                              })();

                              const lastHash = (() => {
                                try {
                                  return lastUuid
                                    ? (localStorage.getItem(`matcha:avatar:lastHash:${lastUuid}`) || "").trim()
                                    : "";
                                } catch {
                                  return "";
                                }
                              })();

                              const customUUID = (() => {
                                try {
                                  const raw = (localStorage.getItem("customUUID") || "").trim();
                                  return raw.length ? raw : null;
                                } catch {
                                  return null;
                                }
                              })();

                              const bgColor = (() => {
                                try {
                                  return (localStorage.getItem(bgKey) || "").trim();
                                } catch {
                                  return "";
                                }
                              })();

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
                                    try {
                                      localStorage.setItem(lastUuidKey, res.uuid);
                                      localStorage.setItem(
                                        `matcha:avatar:lastHash:${res.uuid}`,
                                        res.hash,
                                      );
                                    } catch {
                                      // ignore
                                    }

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

                                    try {
                                      localStorage.removeItem(
                                        `matcha:avatar:disabled:${safeAccountType || "unknown"}:${user}`,
                                      );
                                      if (user) localStorage.setItem(modeKey, "hytale");
                                    } catch {
                                      // ignore
                                    }
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
                                    className={cn(
                                      "shrink-0 px-3 h-8 rounded-lg font-extrabold text-xs border border-white/10",
                                      "bg-black/35 hover:bg-white/5 transition text-white",
                                      disabled &&
                                        "opacity-60 cursor-not-allowed hover:bg-black/35",
                                    )}
                                    disabled={disabled}
                                    onClick={uploadCustom}
                                    title={t("friendsMenu.profile.changeAvatar")}
                                  >
                                    {t("friendsMenu.profile.changeAvatar")}
                                  </button>

                                  <button
                                    type="button"
                                    className={cn(
                                      "shrink-0 px-3 h-8 rounded-lg font-extrabold text-xs border border-white/10",
                                      "bg-black/35 hover:bg-white/5 transition text-white",
                                      disabled &&
                                        "opacity-60 cursor-not-allowed hover:bg-black/35",
                                    )}
                                    disabled={disabled}
                                    onClick={useHytale}
                                    title={t("friendsMenu.profile.useHytaleAvatar")}
                                  >
                                    {t("friendsMenu.profile.useHytaleAvatar")}
                                  </button>

                                  <button
                                    type="button"
                                    className={cn(
                                      "shrink-0 w-8 h-8 rounded-lg border border-white/10",
                                      "bg-black/35 hover:bg-white/5 transition text-white",
                                      disabled &&
                                        "opacity-60 cursor-not-allowed hover:bg-black/35",
                                      "flex items-center justify-center",
                                    )}
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

                            const current = (() => {
                              try {
                                return (localStorage.getItem(bgKey) || "").trim();
                              } catch {
                                return "";
                              }
                            })();

                            return (
                              <>
                                <button
                                  type="button"
                                  className={cn(
                                    "shrink-0 px-3 h-8 rounded-lg font-extrabold text-xs border border-white/10",
                                    "bg-black/35 hover:bg-white/5 transition text-white",
                                    disabled &&
                                      "opacity-60 cursor-not-allowed hover:bg-black/35",
                                  )}
                                  disabled={disabled}
                                  onClick={uploadCustom}
                                  title={t("friendsMenu.profile.uploadAvatar")}
                                >
                                  {t("friendsMenu.profile.uploadAvatar")}
                                </button>

                                <button
                                  type="button"
                                  className={cn(
                                    "shrink-0 w-8 h-8 rounded-lg border border-white/10",
                                    "bg-black/35 hover:bg-white/5 transition text-white",
                                    disabled &&
                                      "opacity-60 cursor-not-allowed hover:bg-black/35",
                                    "flex items-center justify-center",
                                  )}
                                  disabled={disabled}
                                  onClick={removeAvatar}
                                  title={t("friendsMenu.profile.removeAvatar")}
                                  aria-label={t("friendsMenu.profile.removeAvatar")}
                                >
                                  <IconTrash size={16} />
                                </button>

                                <div
                                  className={cn(
                                    "relative shrink-0 h-8 rounded-lg border border-white/10",
                                    "bg-black/35 hover:bg-white/5 transition text-white",
                                    "px-3 flex items-center gap-2",
                                    disabled &&
                                      "opacity-60 cursor-not-allowed hover:bg-black/35",
                                  )}
                                  title={t("friendsMenu.profile.avatarBackground")}
                                >
                                  <span
                                    className="inline-block align-middle w-3 h-3 rounded-sm border border-white/20"
                                    style={{
                                      backgroundColor:
                                        current && /^#?[0-9a-fA-F]{6}$/.test(current)
                                          ? current.startsWith("#")
                                            ? current
                                            : `#${current}`
                                          : "#2f3a4f",
                                    }}
                                  />
                                  <span className="font-extrabold text-xs">
                                    {t("friendsMenu.profile.avatarBackground")}
                                  </span>
                                  <input
                                    type="color"
                                    disabled={disabled}
                                    className="absolute inset-0 opacity-0 cursor-pointer"
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
                                      try {
                                        localStorage.setItem(bgKey, v);
                                      } catch {
                                        // ignore
                                      }
                                      useHytale();
                                    }}
                                  />
                                </div>

                                <button
                                  type="button"
                                  className={cn(
                                    "shrink-0 w-8 h-8 rounded-lg border border-white/10",
                                    "bg-black/35 hover:bg-white/5 transition text-white",
                                    disabled &&
                                      "opacity-60 cursor-not-allowed hover:bg-black/35",
                                    "flex items-center justify-center",
                                  )}
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
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
                      <div className="text-[10px] font-extrabold tracking-widest text-white/60 uppercase">
                        {t("friendsMenu.profile.username")}
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <div className="min-w-0 text-sm font-bold text-white/90 truncate">
                          {displayHandle(profileUser?.handle || me?.handle || "—")}
                        </div>

                        <button
                          type="button"
                          className={cn(
                            "shrink-0 px-3 h-8 rounded-lg font-extrabold text-xs border border-white/10",
                            "bg-black/35 hover:bg-white/5 transition text-white",
                          )}
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
                      </div>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
                      <div className="text-[10px] font-extrabold tracking-widest text-white/60 uppercase">
                        {t("friendsMenu.profile.createdAt")}
                      </div>
                      <div className="mt-1 text-sm font-bold text-white/90">
                        {(() => {
                          const raw = profileUser?.createdAt || me?.createdAt;
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
                          return typeof n === "number"
                            ? n.toLocaleString()
                            : "—";
                        })()}
                      </div>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[10px] font-extrabold tracking-widest text-white/60 uppercase">
                            {t("friendsMenu.profile.dndTitle")}
                          </div>
                          <div className="mt-1 text-[11px] text-white/70">
                            {t("friendsMenu.profile.dndHint")}
                          </div>
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

        {userProfileOpen && typeof document !== "undefined" && document.body
          ? createPortal(
              <div
                className="fixed inset-0 z-50 flex items-center justify-center glass-backdrop animate-fade-in"
                data-matcha-user-profile-modal="1"
                onMouseDown={(e) => {
                  if (e.target !== e.currentTarget) return;
                  e.preventDefault();
                  e.stopPropagation();
                  setUserProfileOpen(false);
                }}
                onClick={(e) => {
                  // Swallow clicks so they don't hit the underlying Friends backdrop.
                  e.preventDefault();
                  e.stopPropagation();
                }}
                role="dialog"
                aria-modal="true"
                aria-label={t("friendsMenu.userProfile.title")}
              >
                <div
                  className={cn(
                    "w-full max-w-[460px] rounded-3xl border border-white/10",
                    "bg-black/75 backdrop-blur shadow-2xl overflow-hidden",
                    "animate-popIn",
                  )}
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[10px] font-extrabold tracking-widest text-white/70 uppercase">
                          {t("friendsMenu.userProfile.title")}
                        </div>

                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <div className="text-base font-extrabold tracking-wide text-white truncate max-w-[320px]">
                            {displayHandle(userProfileUser?.handle || "—")}
                          </div>

                          {(() => {
                            const role = String(userProfileUser?.role || "").toLowerCase();
                            if (role === "dev") {
                              return (
                                <span className="px-2 py-1 rounded-lg bg-red-600/80 text-white text-[10px] font-black tracking-widest uppercase">
                                  {t("friendsMenu.devs")}
                                </span>
                              );
                            }
                            if (role === "mod") {
                              return (
                                <span className="px-2 py-1 rounded-lg border border-sky-300/25 bg-sky-500/15 text-sky-200 text-[10px] font-black tracking-widest uppercase">
                                  MOD
                                </span>
                              );
                            }
                            return null;
                          })()}
                        </div>
                      </div>
                    </div>

                    {userProfileErr ? (
                      <div className="mt-3 text-xs text-red-200 border border-red-400/20 bg-red-500/10 rounded-lg px-2 py-2">
                        {userProfileErr}
                      </div>
                    ) : null}

                    <div className="mt-4 grid grid-cols-[92px_1fr] gap-4">
                      <div className="relative h-[92px] w-[92px] rounded-2xl border border-white/10 bg-black/30 overflow-hidden flex items-center justify-center">
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
                              <span className="text-sm font-extrabold text-white/80">
                                {initials(displayHandle(String(u?.handle || "")))}
                              </span>
                            );
                          }
                          return (
                            <img
                              src={src}
                              alt={displayHandle(String(u?.handle || ""))}
                              className="h-full w-full object-cover"
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
                          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                            <div className="text-[10px] font-extrabold tracking-widest text-white/70 uppercase">
                              {t("common.loading")}
                            </div>
                          </div>
                        ) : null}
                      </div>

                      <div className="min-w-0 space-y-2">
                        <div className="rounded-2xl border border-white/10 bg-black/25 px-3 py-2">
                          <div className="text-[10px] font-extrabold tracking-widest text-white/60 uppercase">
                            {t("friendsMenu.profile.createdAt")}
                          </div>
                          <div className="mt-1 text-sm font-bold text-white/90">
                            {(() => {
                              const raw = userProfileUser?.createdAt;
                              if (!raw) return "—";
                              const d = new Date(String(raw));
                              if (Number.isNaN(d.getTime())) return String(raw);
                              return d.toLocaleString();
                            })()}
                          </div>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-black/25 px-3 py-2">
                          <div className="text-[10px] font-extrabold tracking-widest text-white/60 uppercase">
                            {t("friendsMenu.profile.totalMessages")}
                          </div>
                          <div className="mt-1 text-sm font-bold text-white/90">
                            {typeof userProfileUser?.messagesSentTotal === "number"
                              ? userProfileUser.messagesSentTotal.toLocaleString()
                              : "—"}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-2">
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
                            <div className="text-xs text-white/60">
                              {t("common.loading")}
                            </div>
                          );
                        }

                        if (isSelf) {
                          return (
                            <div className="text-xs text-white/60">
                              {t("friendsMenu.userProfile.thisIsYou")}
                            </div>
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
                            className={cn(
                              "h-10 px-4 rounded-xl font-extrabold text-xs border border-white/10",
                              "bg-white/10 hover:bg-white/15 transition text-white",
                              disabled &&
                                "opacity-60 cursor-not-allowed hover:bg-white/10",
                            )}
                            disabled={disabled}
                            onClick={() => void sendFriendRequestToHandle(rawHandle)}
                          >
                            {label}
                          </button>
                        );
                      })()}

                      <button
                        type="button"
                        className="h-10 px-4 rounded-xl font-extrabold text-xs border border-white/10 bg-black/35 hover:bg-white/5 transition text-white"
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
                    </div>
                  </div>
                </div>
              </div>,
              document.body,
            )
          : null}

        {mode === "proof" && proofId ? (
          proofStep === "show" ? (
            <div className="mt-3 rounded-lg border border-blue-400/20 bg-blue-500/10 p-3">
              <div className="text-xs font-bold text-blue-200">
                {t("friendsMenu.proof.uniqueId")}
              </div>
              <div className="mt-1 text-[11px] font-extrabold tracking-widest text-red-200 uppercase">
                {t("friendsMenu.proof.dontLoseIt")}
              </div>

              {registeredHandle || me?.handle ? (
                <div className="mt-2">
                  <div className="text-[11px] font-extrabold tracking-widest text-gray-200/80 uppercase">
                    {t("friendsMenu.proof.yourHandle")}
                  </div>
                  <div className="mt-1 flex items-stretch gap-2">
                    <div className="flex-1 text-xs break-all rounded-lg border border-white/10 bg-black/35 p-2">
                      {registeredHandle || me?.handle}
                    </div>
                    <button
                      type="button"
                      className="shrink-0 px-3 rounded-lg font-extrabold text-xs border border-white/10 bg-black/35 hover:bg-white/5 transition"
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
                  </div>
                  <div className="mt-1 text-[11px] text-gray-200/70 leading-snug">
                    {t("friendsMenu.proof.saveHandleHint")}
                  </div>
                </div>
              ) : null}

              <div className="mt-2 flex items-stretch gap-2">
                <div className="flex-1 text-xs break-all rounded-lg border border-white/10 bg-black/35 p-2">
                  {proofId}
                </div>
                <button
                  type="button"
                  className="shrink-0 px-3 rounded-lg font-extrabold text-xs border border-white/10 bg-black/35 hover:bg-white/5 transition"
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
              </div>
              <div className="mt-2 text-[11px] text-gray-200/80 leading-snug">
                {t("friendsMenu.proof.uniqueIdHint")}
              </div>

              <button
                type="button"
                className="mt-3 w-full px-3 py-2 rounded-lg font-bold border border-white/10 bg-black/35 hover:bg-white/5 transition"
                onClick={() => {
                  // Move to a separate screen so the key is no longer visible.
                  setProofStep("confirm");
                  setProofCheckInput("");
                  setProofCheckErr("");
                }}
              >
                {t("friendsMenu.continue")}
              </button>
            </div>
          ) : (
            <div className="mt-3 rounded-lg border border-white/10 bg-black/30 p-3">
                <div className="text-xs font-extrabold tracking-widest text-white/70 uppercase">
                  {t("friendsMenu.proof.finalCheckTitle")}
                </div>
                <div className="mt-1 text-[11px] text-white/70 leading-snug">
                  {t("friendsMenu.proof.finalCheckBody")}
                </div>

                <input
                  className="mt-2 w-full px-3 py-2 rounded-lg border border-white/10 bg-black/35 text-xs text-white outline-none"
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
                  <div className="mt-2 text-xs text-red-200 border border-red-400/20 bg-red-500/10 rounded-lg px-2 py-2">
                    {proofCheckErr}
                  </div>
                ) : null}

                <button
                  type="button"
                  className="mt-3 w-full px-3 py-2 rounded-lg font-bold border border-white/10 bg-black/35 hover:bg-white/5 transition"
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
                  className="mt-2 w-full px-3 py-2 rounded-lg font-bold border border-white/10 bg-black/20 hover:bg-white/5 transition text-white/80"
                  onClick={() => {
                    setProofStep("show");
                    setProofCheckErr("");
                  }}
                >
                  {t("back")}
                </button>
            </div>
          )
        ) : null}

        {mode === "intro" ? (
          <div className="mt-3">
            <div
              className={cn(
                "space-y-4",
                introDocked ? "matcha-intro-text" : "opacity-0",
              )}
            >
              <div className="text-sm text-white/75 leading-snug">
                {t("friendsMenu.intro.subtitle")}
              </div>

              <div className="space-y-2 text-sm">
                <div className="rounded-lg border border-white/10 bg-black/25 px-3 py-2">
                  {t("friendsMenu.intro.feature1")}
                </div>
                <div className="rounded-lg border border-white/10 bg-black/25 px-3 py-2">
                  {t("friendsMenu.intro.feature2")}
                </div>
                <div className="rounded-lg border border-white/10 bg-black/25 px-3 py-2">
                  {t("friendsMenu.intro.feature3")}
                </div>
              </div>

              <div className="text-sm text-white/80 leading-snug">
                <div>{t("friendsMenu.intro.cta")}</div>
                <div className="mt-1 text-white/65">
                  {t("friendsMenu.intro.powered")}
                </div>
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
                        incoming.length > 0 &&
                          "border-yellow-400/30 bg-yellow-400/10 hover:bg-yellow-400/15 motion-safe:animate-pulse",
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
                            ? t("friendsMenu.requestsIncoming", {
                                count: incoming.length,
                              })
                            : t("friendsMenu.requestsOutgoing", {
                                count: outgoing.length,
                              })}
                        </div>
                      </div>

                      {incoming.length > 0 ? (
                        <div className="shrink-0">
                          <div
                            className={cn(
                              "min-w-[22px] h-[18px] px-1.5",
                              "rounded-full",
                              "bg-yellow-400 text-black",
                              "text-[11px] font-extrabold",
                              "flex items-center justify-center",
                              "motion-safe:animate-pulse",
                            )}
                            title={t("friendsMenu.unread.badgeTitle")}
                          >
                            {incoming.length}
                          </div>
                        </div>
                      ) : null}

                      <IconChevronDown
                        size={16}
                        className={cn(
                          "shrink-0 text-white/70 transition",
                          requestsOpen && "rotate-180",
                        )}
                      />
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
                              requestsKind === "incoming"
                                ? "bg-white/10"
                                : "bg-white/5 hover:bg-white/10",
                            )}
                            onClick={() => setRequestsKind("incoming")}
                          >
                            {t("friendsMenu.received")}
                          </button>
                          <button
                            type="button"
                            className={cn(
                              "flex-1 px-2 py-2 rounded-lg border border-white/10 text-xs font-extrabold",
                              requestsKind === "outgoing"
                                ? "bg-white/10"
                                : "bg-white/5 hover:bg-white/10",
                            )}
                            onClick={() => setRequestsKind("outgoing")}
                          >
                            {t("friendsMenu.sent")}
                          </button>
                        </div>

                        <div className="mt-2 max-h-44 overflow-y-auto dark-scrollbar">
                          {requestsKind === "incoming" ? (
                            incoming.length === 0 ? (
                              <div className="text-xs text-white/60 px-2 py-2">
                                {t("friendsMenu.none")}
                              </div>
                            ) : (
                              <div className="space-y-1">
                                {incoming.map((r) => (
                                  <div
                                    key={r.id}
                                    className="flex items-center justify-between gap-2 px-2 py-2 rounded-lg border border-white/10 bg-white/5"
                                  >
                                    <div className="truncate text-xs font-bold">
                                      {displayHandle(r.fromHandle)}
                                    </div>
                                    <div className="flex gap-2 shrink-0">
                                      <button
                                        type="button"
                                        className="px-2 py-1 text-[10px] rounded-lg border border-white/10 bg-white/5 hover:bg-white/10"
                                        onClick={() =>
                                          void acceptIncoming(r.id)
                                        }
                                      >
                                        {t("friendsMenu.accept")}
                                      </button>
                                      <button
                                        type="button"
                                        className="px-2 py-1 text-[10px] rounded-lg border border-red-400/20 bg-red-500/10 hover:bg-red-500/20 text-red-200"
                                        onClick={() =>
                                          void rejectIncoming(r.id)
                                        }
                                      >
                                        {t("friendsMenu.reject")}
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )
                          ) : outgoing.length === 0 ? (
                            <div className="text-xs text-white/60 px-2 py-2">
                              {t("friendsMenu.none")}
                            </div>
                          ) : (
                            <div className="space-y-1">
                              {outgoing.map((r) => (
                                <div
                                  key={r.id}
                                  className="flex items-center justify-between gap-2 px-2 py-2 rounded-lg border border-white/10 bg-white/5"
                                >
                                  <div className="truncate text-xs font-bold">
                                    {displayHandle(r.toHandle)}
                                  </div>
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
                    {t("friendsMenu.friendsListCounts", {
                      online: friendsOnlineCount,
                      total: friends.length,
                    })}
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
                      <div className="text-xs text-white/60 px-2 py-3">
                        {t("friendsMenu.noFriendsFound")}
                      </div>
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
                              selectedFriend?.id === f.id &&
                                "border-white/10 ring-2 ring-white/10",
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
                              const x0 = rect
                                ? e.clientX - rect.left
                                : e.clientX;
                              const y0 = rect
                                ? e.clientY - rect.top
                                : e.clientY;

                              const x = Math.max(
                                8,
                                Math.min(x0, (rect?.width ?? 520) - 200),
                              );
                              const y = Math.max(
                                8,
                                Math.min(y0, (rect?.height ?? 700) - 120),
                              );
                              setCtxMenu({ x, y, friend: f });
                            }}
                          >
                            <div className="flex items-center gap-3 min-w-0 w-full">
                              <div className="relative h-10 w-10 rounded-full bg-white/10 border border-white/10 flex items-center justify-center shrink-0 overflow-hidden">
                                {(() => {
                                  const h =
                                    avatarHashByUserId[f.id] ||
                                    String(f.avatarHash || "").trim();
                                  const broken = !!avatarBrokenByUserId[f.id];
                                  const src = !broken
                                    ? avatarUrlFor(f.id, h)
                                    : null;
                                  if (!src) {
                                    return (
                                      <span className="text-xs font-extrabold text-white/80">
                                        {initials(f.handle)}
                                      </span>
                                    );
                                  }

                                  return (
                                    <img
                                      src={src}
                                      alt={f.handle}
                                      className="h-full w-full object-cover"
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
                                  className={cn(
                                    "absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full border-2 border-black/40",
                                    isOnline ? "bg-green-400" : "bg-white/20",
                                  )}
                                />
                              </div>

                              <div className="min-w-0">
                                <div className="truncate text-sm font-extrabold tracking-wide">
                                  {displayHandle(f.handle)}
                                </div>
                                <div
                                  className={cn(
                                    "mt-0.5 flex items-center gap-2 text-xs",
                                    isOnline
                                      ? "text-white/75"
                                      : "text-white/40",
                                  )}
                                >
                                  <span
                                    className={cn(
                                      "h-2 w-2 rounded-full",
                                      isOnline ? "bg-green-400" : "bg-white/20",
                                    )}
                                  />
                                  <span className="font-semibold">
                                    {statusLabel}
                                  </span>
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

                  <div className="text-[10px] text-gray-300/60 mt-2">
                    {loadingFriends ? t("friendsMenu.refreshing") : ""}
                  </div>
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
                    {appView === "globalChat"
                      ? t("friendsMenu.globalChat")
                      : displayHandle(selectedFriend?.handle)}
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

                <div className="mt-2 flex-1 min-h-0 relative">
                  <div
                    ref={msgScrollRef}
                    className="h-full overflow-y-auto overflow-x-hidden rounded-xl border border-white/10 bg-black/25 p-2 dark-scrollbar"
                  >
                    {loadingMsgs && messages.length === 0 ? (
                      <div className="text-xs text-white/50">
                        {t("common.loading")}
                      </div>
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
                          <div className="flex items-center gap-2 py-1">
                            <div className="flex-1 h-px bg-white/10" />
                            <div className="text-[10px] font-extrabold tracking-widest text-yellow-200/90 uppercase">
                              {t("friendsMenu.unread.separator")}
                            </div>
                            <div className="flex-1 h-px bg-white/10" />
                          </div>
                        ) : null}

                        <div
                          className={cn(
                            "flex group",
                            isMe ? "justify-end" : "justify-start",
                            isSameAsPrev ? "mt-0.5" : "mt-3",
                          )}
                        >
                          <div
                            className={cn(
                              "max-w-[85%]",
                              isMe ? "text-right" : "text-left",
                            )}
                          >
                            <div className={cn("flex gap-2")}>
                              {!isMe ? (
                                appView === "globalChat" ? (
                                  <button
                                    type="button"
                                    className={cn(
                                      "relative h-8 w-8 rounded-full bg-white/10 border border-white/10",
                                      "flex items-center justify-center shrink-0 overflow-hidden",
                                      "hover:border-white/20 transition",
                                    )}
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
                                          <span className="text-[10px] font-extrabold text-white/80">
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
                                          className="h-full w-full object-cover"
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
                                  <div className="relative h-8 w-8 rounded-full bg-white/10 border border-white/10 flex items-center justify-center shrink-0 overflow-hidden">
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
                                          <span className="text-[10px] font-extrabold text-white/80">
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
                                          className="h-full w-full object-cover"
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
                                  className={cn(
                                    "relative shrink-0 flex items-center",
                                    "opacity-0 group-hover:opacity-100 transition",
                                  )}
                                  data-msg-menu-root="1"
                                >
                                  <button
                                    type="button"
                                    className="px-1.5 py-1 rounded-lg border border-white/10 bg-black/35 hover:bg-white/5"
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
                                        className="text-white/70"
                                      />
                                    ) : (
                                      <IconChevronRight
                                        size={14}
                                        className="text-white/70"
                                      />
                                    )}
                                  </button>

                                  {msgMenu?.id === m.id ? (
                                    <div
                                      ref={msgMenuBoxRef}
                                      className={cn(
                                        "absolute w-40 rounded-xl border border-white/10 bg-black/70 backdrop-blur p-1 text-xs",
                                        msgMenu.v === "up"
                                          ? "bottom-0"
                                          : "top-0",
                                        msgMenu.dir === "left"
                                          ? "right-full mr-2"
                                          : "left-full ml-2",
                                      )}
                                    >
                                      <div className="px-2 py-1 text-[10px] text-white/60">
                                        {t("friendsMenu.msgMenu.sentAt")}:{" "}
                                        {new Date(m.createdAt).toLocaleString()}
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
                                          m.deleted &&
                                            "opacity-50 cursor-not-allowed hover:bg-transparent",
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
                                          m.deleted &&
                                            "opacity-50 cursor-not-allowed hover:bg-transparent",
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
                                {!isSameAsPrev && (
                                  <div
                                    className={cn(
                                      "text-[10px] font-bold",
                                      isMe
                                        ? "text-blue-300"
                                        : "text-gray-300/70",
                                    )}
                                  >
                                    {isMe ? (
                                      t("friendsMenu.you")
                                    ) : (
                                      <span className="inline-flex items-center gap-1.5">
                                        {appView === "globalChat" ? (
                                          <button
                                            type="button"
                                            className="hover:underline underline-offset-2 text-left"
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
                                              <span className="px-1.5 py-0.5 rounded bg-red-600/80 text-white text-[9px] font-black uppercase">
                                                {t("friendsMenu.devs")}
                                              </span>
                                            );
                                          }
                                          if (isMod) {
                                            return (
                                              <span className="px-1.5 py-0.5 rounded-full border border-sky-300/25 bg-sky-500/15 text-sky-200 text-[9px] font-black uppercase">
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
                                  className={cn(
                                    "px-3 py-2 rounded-2xl text-xs border whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-justify",
                                    (() => {
                                      const badge = String(
                                        m.fromBadge || "",
                                      ).toLowerCase();
                                      const isDev = m.fromIsDev || badge === "dev";
                                      const isMod = badge === "mod";
                                      const isSponsor =
                                        String(m.fromHandle || "")
                                          .trim()
                                          .toLowerCase() === "sponsor";

                                      if (isSponsor) return "border-white/10";
                                      if (isDev) return "border-red-400/25";
                                      if (isMod) return "border-sky-300/25";
                                      return "border-white/10";
                                    })(),
                                    (() => {
                                      const badge = String(
                                        m.fromBadge || "",
                                      ).toLowerCase();
                                      const isDev = m.fromIsDev || badge === "dev";
                                      const isMod = badge === "mod";
                                      const isSponsor =
                                        String(m.fromHandle || "")
                                          .trim()
                                          .toLowerCase() === "sponsor";

                                      if (!isSponsor) {
                                        if (isDev) {
                                          return isMe
                                            ? "bg-red-600/70"
                                            : "bg-red-500/10";
                                        }
                                        if (isMod) {
                                          return isMe
                                            ? "bg-sky-600/70"
                                            : "bg-sky-500/10";
                                        }
                                      }
                                      return isMe ? "bg-blue-600/80" : "bg-white/5";
                                    })(),
                                    m.deleted && "italic text-gray-300/70",
                                    isSameAsPrev && (isMe ? "rounded-tr-none" : "rounded-tl-none"),
                                    isSameAsNext && (isMe ? "rounded-br-none" : "rounded-bl-none"),
                                    highlightMsgId === m.id &&
                                      "border-blue-300/90 ring-4 ring-blue-400/60 shadow-xl shadow-blue-500/30 motion-safe:animate-pulse",
                                  )}
                                >
                                  {m.replyToId ? (
                                    <button
                                      type="button"
                                      className={cn(
                                        "w-full mb-1 px-2 py-1 rounded-xl border border-white/10 bg-black/20 text-[10px] text-white/70 text-left",
                                        "hover:bg-black/30 transition",
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
                                        if (m.replyToId) void jumpToMessage(m.replyToId);
                                      }}
                                    >
                                      <div className="font-extrabold tracking-widest uppercase text-white/50">
                                        {t("friendsMenu.reply.to")}{" "}
                                        {displayHandle(String(m.replyToFromHandle || "-"))}
                                      </div>
                                      <div className="text-white/80">
                                        {String(m.replyToSnippet || "")}
                                      </div>
                                    </button>
                                  ) : null}

                                  {m.deleted
                                    ? m.deletedByAdmin
                                      ? t("friendsMenu.deletedByAdmin")
                                      : t("friendsMenu.deleted")
                                    : splitHttpLinks(String(m.body || "")).map(
                                        (p, idx) =>
                                          p.type === "link" && p.href ? (
                                            <a
                                              key={idx}
                                              href={p.href}
                                              className="text-blue-300 hover:text-blue-200 underline underline-offset-2 break-all"
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
                                      )}
                                </div>
                              </div>

                              {!isMe ? (
                                <div
                                  className={cn(
                                    "relative shrink-0 flex items-center",
                                    "opacity-0 group-hover:opacity-100 transition",
                                  )}
                                  data-msg-menu-root="1"
                                >
                                  <button
                                    type="button"
                                    className="px-1.5 py-1 rounded-lg border border-white/10 bg-black/35 hover:bg-white/5"
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
                                        className="text-white/70"
                                      />
                                    ) : (
                                      <IconChevronRight
                                        size={14}
                                        className="text-white/70"
                                      />
                                    )}
                                  </button>

                                  {msgMenu?.id === m.id ? (
                                    <div
                                      ref={msgMenuBoxRef}
                                      className={cn(
                                        "absolute w-40 rounded-xl border border-white/10 bg-black/70 backdrop-blur p-1 text-xs",
                                        msgMenu.v === "up"
                                          ? "bottom-0"
                                          : "top-0",
                                        msgMenu.dir === "left"
                                          ? "right-full mr-2"
                                          : "left-full ml-2",
                                      )}
                                    >
                                      <div className="px-2 py-1 text-[10px] text-white/60">
                                        {t("friendsMenu.msgMenu.sentAt")}:{" "}
                                        {new Date(m.createdAt).toLocaleString()}
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
                                          m.deleted &&
                                            "opacity-50 cursor-not-allowed hover:bg-transparent",
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
                                          m.deleted &&
                                            "opacity-50 cursor-not-allowed hover:bg-transparent",
                                        )}
                                        disabled={m.deleted}
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
                                          className={cn(
                                            "w-full text-left px-2 py-1.5 rounded-lg hover:bg-white/5 transition text-red-200",
                                            m.deleted &&
                                              "opacity-50 cursor-not-allowed hover:bg-transparent",
                                          )}
                                          disabled={m.deleted}
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
                                <div className="relative h-8 w-8 rounded-full bg-white/10 border border-white/10 flex items-center justify-center shrink-0 overflow-hidden">
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
                                        <span className="text-[10px] font-extrabold text-white/80">
                                          {initials(me.handle)}
                                        </span>
                                      );
                                    }
                                    return (
                                      <img
                                        src={src}
                                        alt={me.handle}
                                        className="h-full w-full object-cover"
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
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                    })}
                  </div>

                  {showScrollToBottom ? (
                    <button
                      type="button"
                      className={cn(
                        "absolute bottom-3 right-3 z-10",
                        "h-[36px] w-[36px] rounded-full",
                        "border border-white/10 bg-black/40 hover:bg-white/5 transition",
                        "inline-flex items-center justify-center",
                      )}
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
                      <IconChevronDown size={18} className="text-white/80" />
                    </button>
                  ) : null}
                </div>

                <div className="mt-2 space-y-2">
                  {replyDraft ? (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-white/10 bg-black/25">
                      <div className="text-[10px] font-extrabold tracking-widest text-white/60 uppercase">
                        {t("friendsMenu.reply.replyingTo")}
                      </div>
                      <div className="flex-1 min-w-0 text-[11px] text-white/80 truncate">
                        {displayHandle(replyDraft.fromHandle)}: {replyDraft.snippet}
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

                  <div className="flex gap-2 items-stretch">
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
                      className={cn(
                        "flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500",
                        "resize-none min-h-[40px] max-h-24 overflow-y-auto",
                        appView === "dm" &&
                          !selectedFriend &&
                          "opacity-60 cursor-not-allowed",
                      )}
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
                      className="relative shrink-0 flex items-stretch gap-2"
                      data-kaomoji-root="1"
                    >
                      {countLineBreaks(msgText) > 0 ? (
                        <div className="absolute -top-4 right-0 px-1.5 py-0.5 rounded-md border border-white/10 bg-black/35 text-[10px] text-white/80">
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
                        className={cn(
                          "h-[40px] w-[56px] inline-flex items-center justify-center rounded-lg border border-white/10 bg-black/35 hover:bg-white/5 transition",
                          appView === "dm" &&
                            !selectedFriend &&
                            "opacity-60 cursor-not-allowed hover:bg-black/35",
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
                          setKaomojiOpen((v) => !v);
                        }}
                      >
                        <span className="text-[11px] leading-none font-extrabold tracking-tight text-white/80 whitespace-nowrap">
                          {t("friendsMenu.kaomojis.trigger")}
                        </span>
                      </button>

                      {kaomojiOpen
                        ? createPortal(
                            <div
                              ref={kaomojiBoxRef}
                              data-kaomoji-box="1"
                              className={cn(
                                "fixed z-[9999]",
                                "w-[520px] max-w-[95vw] rounded-lg border border-white/10",
                                "bg-black/45 backdrop-blur-md shadow-xl p-2",
                              )}
                              style={{
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
                              <div className="flex items-center justify-between gap-2">
                                <div className="text-[10px] font-extrabold tracking-widest text-white uppercase">
                                  {t("friendsMenu.kaomojis.title")}
                                </div>
                              </div>

                              <div className="mt-2 flex gap-2">
                                <div className="w-[210px] max-h-[280px] overflow-y-auto dark-scrollbar pr-1">
                                  <div className="space-y-1">
                                    {KAOMOJI_CATEGORIES.map((c) => (
                                      <button
                                        key={c.id}
                                        type="button"
                                        className={cn(
                                          "w-full text-left px-2 py-2 rounded-lg border border-white/10",
                                          "text-[11px] font-bold text-white",
                                          c.id === kaomojiCatId
                                            ? "bg-white/10"
                                            : "bg-white/5 hover:bg-white/10",
                                        )}
                                        onClick={() => setKaomojiCatId(c.id)}
                                      >
                                        <div className="truncate">
                                          {t(`friendsMenu.kaomojis.categories.${c.id}`)}
                                        </div>
                                      </button>
                                    ))}
                                  </div>
                                </div>

                                <div className="flex-1 max-h-[280px] overflow-y-auto dark-scrollbar">
                                  <div className="space-y-1">
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
                                          className={cn(
                                            "w-full px-2 py-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition",
                                            "text-left",
                                          )}
                                          title={meaning}
                                          onClick={(e) =>
                                            insertKaomoji(k.text, e.shiftKey)
                                          }
                                        >
                                          <div className="min-w-0">
                                            <div className="text-sm font-extrabold text-white/90 whitespace-nowrap overflow-x-auto dark-scrollbar">
                                              {k.text}
                                            </div>
                                            <div className="mt-0.5 text-[10px] text-white/60 truncate">
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
                        className={cn(
                          "h-[40px] w-[40px] inline-flex items-center justify-center rounded-lg border border-white/10 bg-black/35 hover:bg-white/5 transition",
                          appView === "dm" &&
                            !selectedFriend &&
                            "opacity-60 cursor-not-allowed hover:bg-black/35",
                        )}
                        onClick={() => void sendMessage()}
                      >
                        <IconArrowUpRight size={18} className="text-white/80" />
                      </button>
                    </div>
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
                <div className="text-xs font-extrabold tracking-widest text-white/70 uppercase">
                  {t("friendsMenu.report.title")}
                </div>
                <button
                  type="button"
                  className="px-2 py-1 text-xs rounded-lg border border-white/10 bg-black/25 hover:bg-white/5 transition"
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

              <div className="mt-2 text-[11px] text-white/70">
                {t("friendsMenu.report.reporting")}{" "}
                <span className="font-bold text-white/80">
                  {report.msg?.fromHandle || "-"}
                </span>
              </div>

              <div className="mt-3 space-y-2 text-xs">
                <div className="text-[11px] font-bold text-white/70 uppercase">
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
                    className="flex items-center gap-2 p-2 rounded-xl border border-white/10 bg-black/25"
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
                    <div className="mt-2 text-[11px] font-bold text-white/70 uppercase">
                      {t("friendsMenu.report.reason")}
                    </div>
                    <div className="space-y-2">
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
                              className="flex items-center gap-2 p-2 rounded-xl border border-white/10 bg-black/25"
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
                              className="flex items-center gap-2 p-2 rounded-xl border border-white/10 bg-black/25"
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
                              className="flex items-center gap-2 p-2 rounded-xl border border-white/10 bg-black/25"
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
