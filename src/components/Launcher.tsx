import React, { useCallback, useEffect, useRef, useState } from "react";
import { useGameContext } from "../hooks/gameContext";
import { useUserContext } from "../hooks/userContext";
import butterBg from "../assets/butter-bg.png";
import butterLogo from "../assets/butter-logo.png";
import SettingsModal from "./SettingsModal";
import ModsModal from "./ModsModal";
import ServersModal from "./ServersModal";
import WikiModal from "./WikiModal";
import MatchaTermsModal from "./MatchaTermsModal";
import FriendsMenu from "./FriendsMenu";
import settingsIcon from "../assets/settings.svg";
import DiscordLogo from "../assets/discord.svg";
import PatreonLogo from "../assets/patreon.png";
import DragBar from "./DragBar";
import ProgressBar from "./ProgressBar";
import {
  IconChevronDown,
  IconX,
  IconTrash,
  IconWorld,
  IconBook,
  IconUsers,
  IconPuzzle,
  IconServer,
  IconServerCog,
} from "@tabler/icons-react";
import cn from "../utils/cn";
import { stripHtmlToText } from "../utils/sanitize";
import ConfirmModal from "./ConfirmModal";
import HostServerConsoleModal from "./HostServerConsoleModal";
import { useTranslation } from "react-i18next";

// Launcher: a single component boldly pretending it isn't a small app.

type NewsItem = {
  title: string;
  content: string;
  url?: string;
  date?: string;
  image?: string;
};

type NewsFeed = {
  version: number;
  items: NewsItem[];
};

type HytaleFeedItem = {
  title: string;
  description: string;
  url: string;
  image?: string;
  date?: string;
};

const HYTALE_FEED_URL =
  "https://launcher.hytale.com/launcher-feed/release/feed.json";

const HYTALE_FEED_IMAGE_BASE =
  "https://launcher.hytale.com/launcher-feed/release/";

const normalizeHytaleUrl = (raw: unknown): string | null => {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return null;
  if (s.startsWith("http://")) return s.replace(/^http:\/\//i, "https://");
  if (s.startsWith("https://")) return s;
  if (s.startsWith("//")) return `https:${s}`;
  if (s.startsWith("/")) return `https://launcher.hytale.com${s}`;
  return null;
};

const normalizeHytaleImage = (raw: unknown): string | undefined => {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return undefined;
  if (/^https?:\/\//i.test(s)) return s.replace(/^http:\/\//i, "https://");
  return `${HYTALE_FEED_IMAGE_BASE}${s.replace(/^\.\//, "")}`;
};

const normalizeHytaleFeed = (feed: any): HytaleFeedItem[] => {
  const items =
    Array.isArray(feed?.articles)
      ? feed.articles
      : Array.isArray(feed?.items)
        ? feed.items
        : Array.isArray(feed)
          ? feed
          : [];

  return items
    .map((x: any) => {
      const title = stripHtmlToText(x?.title, { maxLength: 160 });
      const description = stripHtmlToText(x?.description ?? x?.content, {
        maxLength: 480,
      });

      const url =
        // The feed can't decide between snake_case and camelCase, so we support both like enablers.
        normalizeHytaleUrl(x?.dest_url) ||
        normalizeHytaleUrl(x?.destUrl) ||
        normalizeHytaleUrl(x?.url) ||
        normalizeHytaleUrl(x?.link);

      if (!title || !url) return null;

      const image =
        normalizeHytaleImage(x?.image_url) ||
        normalizeHytaleImage(x?.imageUrl) ||
        normalizeHytaleImage(x?.image);
      const date =
        typeof x?.publish_date === "string"
          ? x.publish_date
          : typeof x?.publishDate === "string"
            ? x.publishDate
            : undefined;

      return {
        title,
        description,
        url,
        image,
        date,
      } satisfies HytaleFeedItem;
    })
    .filter(Boolean) as HytaleFeedItem[];
};

type NewsContentPart =
  | { type: "text"; value: string }
  | { type: "link"; value: string; href: string };

const parseNewsContent = (content: string): NewsContentPart[] => {
  // Find URLs in plain text, because users will paste links with zero formatting and maximum confidence.
  const parts: NewsContentPart[] = [];
  const re = /(https?:\/\/[^\s<>]+|www\.[^\s<>]+)/gi;

  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(content)) !== null) {
    const start = match.index;
    const raw = match[0];

    if (start > lastIndex) {
      parts.push({ type: "text", value: content.slice(lastIndex, start) });
    }

    // Trim trailing punctuation, because humans love ending sentences with ")" and blaming us for broken links.
    const trimmed = raw.replace(/[),.;\]]+$/g, "");
    const href = trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
    parts.push({ type: "link", value: trimmed, href });

    lastIndex = start + raw.length;
  }

  if (lastIndex < content.length) {
    parts.push({ type: "text", value: content.slice(lastIndex) });
  }

  return parts.length ? parts : [{ type: "text", value: content }];
};

const NEWS_URL =
  (import.meta as any).env?.VITE_NEWS_URL ||
  "https://updates.butterlauncher.tech/news.json";

const Launcher: React.FC<{ onLogout?: () => void }> = ({ onLogout }) => {
  const { t } = useTranslation();
  const {
    gameDir,
    offlineMode,
    versionType,
    setVersionType,
    availableVersions,
    selectedVersion,
    setAvailableVersions,
    setSelectedVersion,
    checkingUpdates,
    reconnect,
    updateAvailable,
    updateDismissed,
    dismissUpdateForNow,
    installing,
    installProgress,
    cancelBuildDownload,
    cancelingBuildDownload,
    patchingOnline,
    patchProgress,
    installGame,
    launchGame,
    smartUpdate,
    checkingSmartUpdate,
    smartInstallGame,
    checkForUpdates,
    emergencyMode,
    launching,
    gameLaunched,
    runningVersion,
    hasBuild1Installed,
  } = useGameContext();
  const { username } = useUserContext();
  const [closeDownloadConfirmOpen, setCloseDownloadConfirmOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [modsOpen, setModsOpen] = useState(false);
  const [serversOpen, setServersOpen] = useState(false);
  const [wikiOpen, setWikiOpen] = useState(false);
  const [wikiLastUrl, setWikiLastUrl] = useState<string | null>(null);
  const [matchaTermsOpen, setMatchaTermsOpen] = useState(false);
  const hostServerMenuRef = useRef<HTMLDivElement | null>(null);
  const [hostServerMenuOpen, setHostServerMenuOpen] = useState(false);
  const friendsMenuRef = useRef<HTMLDivElement | null>(null);
  const [friendsMenuOpen, setFriendsMenuOpen] = useState(false);
  const [friendsMenuOpenTo, setFriendsMenuOpenTo] = useState<"friends" | "globalChat">("friends");
  const [friendsMenuOpenNonce, setFriendsMenuOpenNonce] = useState(0);
  const [friendsHasUnread, setFriendsHasUnread] = useState(false);

  useEffect(() => {
    const ipc = (window as any)?.ipcRenderer;
    if (!ipc || typeof ipc.on !== "function") return;

    const onConfirmCloseDownload = () => {
      setCloseDownloadConfirmOpen(true);
    };

    ipc.on("app:confirm-close-download", onConfirmCloseDownload);
    return () => {
      try {
        ipc.removeListener("app:confirm-close-download", onConfirmCloseDownload);
      } catch {
        // ignore
      }
    };
  }, []);

  const computeFriendsHasUnread = () => {
    try {
      const prefix = "matcha:unread:";
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith(prefix)) continue;
        const raw = localStorage.getItem(k);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) continue;
        for (const v of Object.values(parsed as Record<string, any>)) {
          const n = typeof v === "number" ? v : Number(v);
          if (Number.isFinite(n) && n > 0) return true;
        }
      }
      return false;
    } catch {
      return false;
    }
  };

  useEffect(() => {
    const update = () => setFriendsHasUnread(computeFriendsHasUnread());
    update();

    const onUnreadChanged = () => update();
    window.addEventListener("matcha:unread-changed" as any, onUnreadChanged as any);
    window.addEventListener("focus", update);
    return () => {
      window.removeEventListener("matcha:unread-changed" as any, onUnreadChanged as any);
      window.removeEventListener("focus", update);
    };
  }, []);

  // Matcha avatar sync: on launcher open + every 10 minutes (hash-gated).
  useEffect(() => {
    if (!username) return;
    if (!gameDir) return;
    if (offlineMode) return;

    const token = (() => {
      try {
        return (localStorage.getItem("matcha:token") || "").trim();
      } catch {
        return "";
      }
    })();

    if (!token) return;

    let stopped = false;

    const safeAccountType = (() => {
      try {
        return (localStorage.getItem("accountType") || "").trim();
      } catch {
        return "";
      }
    })();

    const lastUuidKey = `matcha:avatar:lastUuid:${safeAccountType || "unknown"}:${username}`;
    const disabledKey = `matcha:avatar:disabled:${safeAccountType || "unknown"}:${username}`;
    const modeKey = `matcha:avatar:mode:${safeAccountType || "unknown"}:${username}`;

    const sync = async () => {
      if (stopped) return;
      try {
        const isCustomMode = (() => {
          try {
            return (localStorage.getItem(modeKey) || "")
              .trim()
              .toLowerCase() === "custom";
          } catch {
            return false;
          }
        })();
        if (isCustomMode) return;

        const isDisabled = (() => {
          try {
            return (localStorage.getItem(disabledKey) || "").trim() === "1";
          } catch {
            return false;
          }
        })();
        if (isDisabled) return;

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
            return (
              localStorage.getItem(
                `matcha:avatar:bgColor:${safeAccountType || "unknown"}:${username}`,
              ) || ""
            ).trim();
          } catch {
            return "";
          }
        })();

        const res = await window.config.matchaAvatarSync({
          gameDir,
          username,
          token,
          accountType: safeAccountType,
          customUUID,
          bgColor: bgColor || null,
          lastHash,
          force: false,
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
        } else {
          const err = typeof (res as any)?.error === "string" ? (res as any).error : "";
          if (err.trim().toLowerCase() === "avatar disabled") {
            try {
              localStorage.setItem(disabledKey, "1");
            } catch {
              // ignore
            }
          }
        }
      } catch {
        // ignore
      }
    };

    void sync();
    const timer = window.setInterval(sync, 10 * 60_000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [username, gameDir, offlineMode]);
  const [hostServerWarningOpen, setHostServerWarningOpen] = useState(false);
  const [hostServerWarningShownThisSession, setHostServerWarningShownThisSession] = useState(false);
  const [hostServerStage, setHostServerStage] = useState<"root" | "local">("root");

  const openMatchaGlobalChat = () => {
    try {
      const hasToken = !!(localStorage.getItem("matcha:token") || "").trim();
      if (!hasToken) return;
    } catch {
      return;
    }

    setFriendsMenuOpenTo("globalChat");
    setFriendsMenuOpenNonce((n) => n + 1);
    setFriendsMenuOpen(true);
  };

  const [hostServerAuthMode, setHostServerAuthMode] = useState<
    "offline" | "authenticated" | "insecure"
  >("offline");
  const [hostServerAdvancedOpen, setHostServerAdvancedOpen] = useState(false);
  const [hostServerConsoleOpen, setHostServerConsoleOpen] = useState(false);
  const [hostServerRunning, setHostServerRunning] = useState(false);
  const [hostServerLogs, setHostServerLogs] = useState<string[]>(() => []);
  const hostServerLastLogRef = useRef<{ key: string; ts: number } | null>(null);

  const [advRamEnabled, setAdvRamEnabled] = useState(false);
  const [advRamMin, setAdvRamMin] = useState("");
  const [advRamMax, setAdvRamMax] = useState("");
  const [advNoAotEnabled, setAdvNoAotEnabled] = useState(false);
  const [advCustomJvmArgs, setAdvCustomJvmArgs] = useState("");

  const [advAssetsEnabled, setAdvAssetsEnabled] = useState(false);
  const [advAssetsPath, setAdvAssetsPath] = useState("");
  const [advUniverseEnabled, setAdvUniverseEnabled] = useState(false);
  const [advUniversePath, setAdvUniversePath] = useState("");
  const [advModsEnabled, setAdvModsEnabled] = useState(false);
  const [advModsPath, setAdvModsPath] = useState("");
  const [advEarlyPluginsEnabled, setAdvEarlyPluginsEnabled] = useState(false);
  const [advEarlyPluginsPath, setAdvEarlyPluginsPath] = useState("");

  const [folderSyncWarningOpen, setFolderSyncWarningOpen] = useState(false);
  const [pendingFolderSync, setPendingFolderSync] = useState<
    | null
    | { kind: "universe" | "mods" | "earlyplugins"; sourceDir: string }
  >(null);
  const [newsItems, setNewsItems] = useState<NewsItem[]>([]);
  const [openNews, setOpenNews] = useState<NewsItem | null>(null);
  const [hytaleFeedOpen, setHytaleFeedOpen] = useState(false);
  const [hytaleFeedLoading, setHytaleFeedLoading] = useState(false);
  const [hytaleFeedError, setHytaleFeedError] = useState<string>("");
  const [hytaleFeedItems, setHytaleFeedItems] = useState<HytaleFeedItem[]>([]);
  const hytaleFeedScrollRef = useRef<HTMLDivElement | null>(null);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [patchConfirmOpen, setPatchConfirmOpen] = useState(false);
  const [onlinePatchEnabled, setOnlinePatchEnabled] = useState(false);
  const [needsFixClient, setNeedsFixClient] = useState(false);
  const [patchOutdated, setPatchOutdated] = useState(false);
  const logoutWorkingRef = useRef(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [versionToDelete, setVersionToDelete] = useState<GameVersion | null>(
    null,
  );

  const accountType = (() => {
    try {
      const raw = (localStorage.getItem("accountType") || "").trim();
      // Normalize any non-empty legacy value to the non-official mode.
      return raw === "premium" ? "premium" : raw ? "custom" : raw;
    } catch {
      return "";
    }
  })();

  const isCustom = accountType === "custom";
  const isPremium = accountType === "premium";
  const restrictVersionsUntilBuild1 = isCustom || isPremium;

  const latestVersion =
    availableVersions.length > 0 ? availableVersions[0] : null;

  // If the user is in a logged-in mode, only allow selecting
  // Latest + Build-1 until Build-1 is installed.
  // This also prevents a persisted selection from re-selecting a locked build.
  useEffect(() => {
    if (!restrictVersionsUntilBuild1) return;
    if (hasBuild1Installed) return;
    const current = availableVersions?.[selectedVersion] ?? null;
    if (!current) return;
    // If it's already installed, allow it to stay selected.
    if (current.installed) return;
    if (current.build_index === 1 || current.isLatest) return;

    const latestIdx = availableVersions.findIndex((v) => !!v.isLatest);
    const fallbackIdx = latestIdx !== -1 ? latestIdx : 0;
    if (fallbackIdx !== selectedVersion) setSelectedVersion(fallbackIdx);
  }, [restrictVersionsUntilBuild1, hasBuild1Installed, availableVersions, selectedVersion, setSelectedVersion]);

  useEffect(() => {
    if (!offlineMode) return;
    // If we're offline, pretend the internet features never existed.
    setServersOpen(false);
    setWikiOpen(false);
    setFriendsMenuOpen(false);
    setHostServerMenuOpen(false);
    setHostServerWarningOpen(false);
    setHostServerStage("root");
  }, [offlineMode]);

  useEffect(() => {
    if (!friendsMenuOpen) return;

    const onMouseDown = (e: MouseEvent) => {
      // Avoid collapsing while other modals/menus are in charge.
      if (
        hostServerMenuOpen ||
        hostServerWarningOpen ||
        folderSyncWarningOpen ||
        wikiOpen ||
        settingsOpen ||
        modsOpen ||
        serversOpen ||
        matchaTermsOpen
      )
        return;

      const target = e.target as Node | null;
      if (!target) return;

      // The Matcha profile modal is portaled to <body>, so clicks inside it would
      // otherwise look like "outside" and collapse the friends menu.
      const el = (target as any) as Element | null;
      if (el?.closest?.("[data-matcha-profile-modal='1']")) return;

      const root = friendsMenuRef.current;
      if (root && !root.contains(target)) setFriendsMenuOpen(false);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (
        hostServerMenuOpen ||
        hostServerWarningOpen ||
        folderSyncWarningOpen ||
        wikiOpen
      )
        return;
      setFriendsMenuOpen(false);
    };

    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [
    friendsMenuOpen,
    hostServerMenuOpen,
    hostServerWarningOpen,
    folderSyncWarningOpen,
    wikiOpen,
    settingsOpen,
    modsOpen,
    serversOpen,
    matchaTermsOpen,
  ]);

  useEffect(() => {
    if (!hostServerMenuOpen) return;

    const onMouseDown = (e: MouseEvent) => {
      // When a modal is open, ignore outside clicks so the host menu doesn't close.
      if (hostServerWarningOpen || folderSyncWarningOpen || wikiOpen) return;
      const target = e.target as Node | null;
      if (!target) return;
      const root = hostServerMenuRef.current;
      if (root && !root.contains(target)) {
        setHostServerMenuOpen(false);
        setHostServerStage((s) => (s === "local" && hostServerRunning ? "local" : "root"));
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Let the modal handle Escape without collapsing the host menu.
        if (hostServerWarningOpen || folderSyncWarningOpen || wikiOpen) return;
        setHostServerMenuOpen(false);
        setHostServerStage((s) => (s === "local" && hostServerRunning ? "local" : "root"));
      }
    };

    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [hostServerMenuOpen, hostServerWarningOpen, folderSyncWarningOpen, wikiOpen, hostServerRunning]);

  const getSelectedVersionLabel = () => {
    const v = availableVersions?.[selectedVersion] ?? null;
    if (!v) return "(unknown)";
    const base = (v.build_name || "").trim() || `Build ${v.build_index}`;
    return base;
  };

  const isSelectedBuildInstalled = () => {
    const v = availableVersions?.[selectedVersion] ?? null;
    return !!v?.installed;
  };

  const showSelectedBuildNotInstalledError = () => {
    alert(
      t("hostServerModal.errors.buildNotInstalled", {
        version: getSelectedVersionLabel(),
      }),
    );
  };

  const pushHostLog = useCallback((line: string) => {
    const s = String(line ?? "");
    if (!s.trim()) return;
    setHostServerLogs((prev) => {
      const next = [...prev, s];
      // keep it bounded so it doesn't eat RAM in dev
      if (next.length > 2000) return next.slice(next.length - 2000);
      return next;
    });
  }, []);

  useEffect(() => {
    const onLog = (_: any, payload: any) => {
      const line = typeof payload?.line === "string" ? payload.line : "";
      if (!line) return;

      // Some servers emit identical logs to both stdout and stderr.
      // De-dupe consecutive identical lines arriving close together.
      const key = line.replace(/\r/g, "");
      const now = Date.now();
      const prev = hostServerLastLogRef.current;
      if (prev && prev.key === key && now - prev.ts < 250) return;
      hostServerLastLogRef.current = { key, ts: now };

      pushHostLog(line);
    };

    const onStarted = (_: any, payload: any) => {
      setHostServerRunning(true);
      const pid = payload?.pid;
      const serverDir = payload?.serverDir;
      pushHostLog(`[Launcher] Server started${typeof pid === "number" ? ` (pid ${pid})` : ""}`);
      if (typeof serverDir === "string" && serverDir.trim()) {
        pushHostLog(`[Launcher] CWD: ${serverDir}`);
      }
    };

    const onExited = (_: any, payload: any) => {
      setHostServerRunning(false);
      const code = payload?.code;
      const signal = payload?.signal;
      pushHostLog(
        `[Launcher] Server exited${typeof code === "number" ? ` (code ${code})` : ""}${signal ? ` (signal ${signal})` : ""}`,
      );
    };

    const onError = (_: any, payload: any) => {
      setHostServerRunning(false);
      const code = typeof payload?.code === "string" ? payload.code : "UNKNOWN";
      const message = typeof payload?.message === "string" ? payload.message : "";
      pushHostLog(`[Launcher] Server error: ${code}${message ? ` - ${message}` : ""}`);
    };

    window.ipcRenderer.on("host-server:log", onLog);
    window.ipcRenderer.on("host-server:started", onStarted);
    window.ipcRenderer.on("host-server:exited", onExited);
    window.ipcRenderer.on("host-server:error", onError);

    return () => {
      window.ipcRenderer.off("host-server:log", onLog);
      window.ipcRenderer.off("host-server:started", onStarted);
      window.ipcRenderer.off("host-server:exited", onExited);
      window.ipcRenderer.off("host-server:error", onError);
    };
  }, [pushHostLog]);

  const latestRelease =
    versionType === "release"
      ? (availableVersions.find((v) => v.isLatest) ??
        availableVersions[0] ??
        null)
      : null;

  const selected = availableVersions[selectedVersion];
  const selectedLabel = selected
    ? selected.build_name?.trim() || `Build-${selected.build_index}`
    : "";

  const patchAvailable =
    !!selected &&
    !!selected.installed &&
    !!selected.patch_url &&
    !!selected.patch_hash;

  // async state updates are fun until they are not
  // we only trust the most recent health check because time is not a deterministic function
  const onlinePatchHealthSeq = useRef(0);

  const refreshOnlinePatchHealth = useCallback(async () => {
    const seq = ++onlinePatchHealthSeq.current;

    if (!patchAvailable || !gameDir || !selected) {
      if (seq !== onlinePatchHealthSeq.current) return;
      setOnlinePatchEnabled(false);
      setNeedsFixClient(false);
      setPatchOutdated(false);
      return;
    }
    try {
      const health = (await window.ipcRenderer.invoke(
        "online-patch:health",
        gameDir,
        selected,
      )) as {
        enabled?: boolean;
        needsFixClient?: boolean;
        patchOutdated?: boolean;
      };

      if (seq !== onlinePatchHealthSeq.current) return;

      setOnlinePatchEnabled(!!health?.enabled);
      setNeedsFixClient(!!health?.needsFixClient);
      setPatchOutdated(!!health?.patchOutdated);
    } catch {
      if (seq !== onlinePatchHealthSeq.current) return;
      setOnlinePatchEnabled(false);
      setNeedsFixClient(false);
      setPatchOutdated(false);
    }
  }, [gameDir, patchAvailable, selected]);

  const updateAvailableForLatestRelease =
    versionType === "release" &&
    updateAvailable &&
    availableVersions.some((v) => v.installed) &&
    !!latestRelease &&
    !latestRelease.installed;

  const showUpdatePrompt =
    updateAvailableForLatestRelease &&
    !updateDismissed;

  const canSmartInstallLatest =
    !!latestRelease &&
    updateAvailableForLatestRelease &&
    !!smartUpdate &&
    smartUpdate.toBuildIndex === latestRelease.build_index;

  const isSelectedLatestRelease =
    !!selected &&
    !!latestRelease &&
    selected.type === "release" &&
    selected.build_index === latestRelease.build_index;

  const canSmartUpdateFromSelected =
    !!selected &&
    updateAvailableForLatestRelease &&
    selected.type === "release" &&
    !!selected.installed &&
    !!latestRelease &&
    selected.build_index < latestRelease.build_index;

  const showUpdateActions =
    !!latestRelease &&
    updateAvailableForLatestRelease &&
    (showUpdatePrompt || (isSelectedLatestRelease && canSmartInstallLatest));

  useEffect(() => {
    let cancelled = false;

    const normalize = (feed: any): NewsItem[] => {
      const items = Array.isArray(feed?.items) ? feed.items : [];
      return items
        .filter((x: any) => x && typeof x.title === "string")
        .map((x: any) => {
          const title = stripHtmlToText(x.title, { maxLength: 160 });
          const content = stripHtmlToText(x.content, { maxLength: 8000 });
          if (!title) return null;

          return {
            title,
            content,
            url: typeof x.url === "string" ? x.url : undefined,
            date: typeof x.date === "string" ? x.date : undefined,
            image: typeof x.image === "string" ? x.image : undefined,
          } satisfies NewsItem;
        })
        .filter(Boolean) as NewsItem[];
    };

    const load = async () => {
      // Remote first (avoids CORS issues by using Electron main fetch).
      try {
        const remote = (await window.ipcRenderer.invoke(
          "fetch:json",
          NEWS_URL,
        )) as NewsFeed;
        const normalized = normalize(remote);
        if (!cancelled && normalized.length) {
          setNewsItems(normalized.slice(0, 3));
          return;
        }
      } catch {
        // ignore
      }

      // Local fallback (served by Vite / packaged app).
      try {
        const res = await fetch("/news.json", { cache: "no-store" });
        if (!res.ok) throw new Error("Failed to load local news.json");
        const local = (await res.json()) as NewsFeed;
        const normalized = normalize(local);
        if (!cancelled && normalized.length) {
          setNewsItems(normalized.slice(0, 3));
        }
      } catch {
        if (!cancelled) {
          setNewsItems([
            {
              title: "News unavailable",
              content:
                "Unable to load updates feed. Check your connection or try again later.",
            },
          ]);
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hytaleFeedOpen) return;
    if (hytaleFeedItems.length) return;

    let cancelled = false;
    setHytaleFeedLoading(true);
    setHytaleFeedError("");

    (async () => {
      try {
        // Fetch via main process to avoid CORS issues.
        const raw = await window.ipcRenderer.invoke(
          "fetch:json",
          HYTALE_FEED_URL,
          {
            headers: {
              // Some servers behave better with a browser-like UA.
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
              Accept: "application/json,text/plain,*/*",
            },
          },
        );

        const normalized = normalizeHytaleFeed(raw);
        if (!cancelled) {
          setHytaleFeedItems(normalized.slice(0, 10));
          if (!normalized.length) {
            setHytaleFeedError("No Hytale news found.");
          }
        }
      } catch (e) {
        if (!cancelled) {
          setHytaleFeedError("Failed to load Hytale news.");
        }
      } finally {
        if (!cancelled) setHytaleFeedLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hytaleFeedOpen, hytaleFeedItems.length]);

  useEffect(() => {
    void refreshOnlinePatchHealth();
  }, [refreshOnlinePatchHealth]);

  useEffect(() => {
    if (!gameDir) return;

    const onPatched = () => void refreshOnlinePatchHealth();
    const onUnpatched = () => void refreshOnlinePatchHealth();

    window.ipcRenderer.on("online-patch-finished", onPatched);
    window.ipcRenderer.on("online-unpatch-finished", onUnpatched);

    return () => {
      window.ipcRenderer.off("online-patch-finished", onPatched);
      window.ipcRenderer.off("online-unpatch-finished", onUnpatched);
    };
  }, [gameDir, refreshOnlinePatchHealth]);

  const handleLaunch = () => {
    if (selectedVersion == null || !availableVersions[selectedVersion]) return;
    if (!username) return;

    const v = availableVersions[selectedVersion];

    // Emergency mode: no new downloads/installs.
    // Allow playing installed builds; manual Build-1 import is handled via a separate button.
    if (emergencyMode && !v.installed) {
      alert(t("launcher.errors.emergencyMode"));
      return;
    }

    // Build-1 can be installed from servers only for the non-official mode.
    // Other account types still use the manual import flow.
    if (!v.installed && v.build_index === 1 && !isCustom) {
      alert(t("launcher.version.manualInstallRequired"));
      return;
    }

    const allowLatestWithoutBuild1 = !!v.isLatest;
    const locked =
      restrictVersionsUntilBuild1 &&
      !hasBuild1Installed &&
      !v.installed &&
      v.build_index !== 1 &&
      !allowLatestWithoutBuild1;
    if (locked) {
      alert(t("launcher.version.requiresBuild1"));
      return;
    }

    if (v.installed) {
      launchGame(v, username);
      return;
    }

    installGame(v);
  };

  const startOnlinePatch = () => {
    if (!gameDir || !selected) return;
    window.ipcRenderer.send("online-patch:enable", gameDir, selected);
  };

  const disableOnlinePatch = () => {
    if (!gameDir || !selected) return;
    window.ipcRenderer.send("online-patch:disable", gameDir, selected);
  };

  const disableOnlinePatchAndWait = async (): Promise<boolean> => {
    if (!gameDir || !selected) return true;
    if (!onlinePatchEnabled) return true;

    return await new Promise<boolean>((resolve) => {
      let done = false;
      const timeoutMs = 120_000;
      const t = setTimeout(() => {
        if (done) return;
        done = true;
        resolve(false);
      }, timeoutMs);

      const cleanup = () => {
        try {
          clearTimeout(t);
        } catch {
          // ignore
        }
      };

      window.ipcRenderer.once("online-unpatch-finished", () => {
        if (done) return;
        done = true;
        cleanup();
        resolve(true);
      });

      window.ipcRenderer.once("online-unpatch-error", () => {
        if (done) return;
        done = true;
        cleanup();
        resolve(false);
      });

      // Kick off unpatch.
      window.ipcRenderer.send("online-patch:disable", gameDir, selected);
    });
  };

  const handleLogout = () => {
    if (!onLogout) return;
    if (logoutWorkingRef.current) return;
    logoutWorkingRef.current = true;

    void (async () => {
      try {
        const ok = await disableOnlinePatchAndWait();
        if (!ok) return;
        onLogout();
      } finally {
        logoutWorkingRef.current = false;
      }
    })();
  };

  const fixClient = () => {
    if (!gameDir || !selected) return;
    window.ipcRenderer.send("online-patch:fix-client", gameDir, selected);
  };

  const deleteVersion = async (v: GameVersion) => {
    setVersionToDelete(v);
    setDeleteConfirmOpen(true);
  };

  return (
    <div
      className="w-full h-full min-h-screen flex flex-col justify-between relative"
      style={{
        backgroundImage: `url(${butterBg})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      <DragBar
        left={
          offlineMode ? (
            <div className="no-drag flex items-center gap-2">
              <span className="text-xs font-semibold tracking-wide text-amber-200 bg-black/40 border border-amber-200/20 rounded-md px-2 py-1">
                {t("launcher.offlineMode")}
              </span>
              <button
                type="button"
                className={cn(
                  "no-drag text-xs px-2 py-1 rounded-md border border-white/10 bg-white/5 text-gray-200 hover:bg-white/10 transition",
                  checkingUpdates && "opacity-60 cursor-not-allowed",
                )}
                onClick={() => reconnect()}
                disabled={checkingUpdates}
                title={t("common.retryConnection")}
              >
                {t("common.reconnect")}
              </button>
            </div>
          ) : null
        }
        onOpenMatchaGlobalChat={openMatchaGlobalChat}
      />

      <div className="absolute top-10 left-3 z-30 w-64">
        <button
          type="button"
          className="w-full bg-black/45 hover:bg-black/55 backdrop-blur-md rounded-xl shadow-xl border border-white/10 px-3 py-2 flex items-center justify-between transition"
          onClick={() => setVersionsOpen((v) => !v)}
          title={
            versionsOpen ? t("launcher.version.hide") : t("launcher.version.show")
          }
        >
          <div className="flex flex-col text-left">
            <div className="text-sm font-semibold tracking-wide text-white">
              {t("launcher.version.label")}:&nbsp;
              {selected ? selectedLabel : t("launcher.version.select")}
            </div>
            <div className="text-[10px] text-gray-100 font-mono">
              {versionType === "release"
                ? t("launcher.version.release")
                : t("launcher.version.preRelease")}
              {selected &&
                selected.build_index === latestVersion?.build_index &&
                ` (${t("launcher.version.latest")})`}
            </div>
          </div>
          <IconChevronDown
            size={18}
            className={cn(
              "text-white/80 transition-transform duration-300",
              versionsOpen && "rotate-180",
            )}
          />
        </button>

        <div
          className={cn(
            "mt-2 opacity-0 -translate-y-1 pointer-events-none rounded-xl border border-white/10 bg-black/45 backdrop-blur-md shadow-xl overflow-hidden transition-all",
            versionsOpen && "pointer-events-auto opacity-100 translate-y-0",
          )}
        >
          <div className="h-56 p-3 flex flex-col">
            <div className="flex gap-1 mb-3 bg-white/5 rounded-lg p-1">
              <button
                type="button"
                className={cn(
                  "flex-1 text-xs px-2 py-1 rounded-md transition text-gray-200 hover:bg-white/10",
                  versionType === "release" &&
                    "bg-linear-to-r from-[#0268D4] to-[#02D4D4] text-white shadow",
                )}
                onClick={() => {
                  setVersionType("release");
                }}
              >
                {t("launcher.version.release")}
              </button>
              <button
                type="button"
                className={cn(
                  "flex-1 text-xs px-2 py-1 rounded-md transition text-gray-200 hover:bg-white/10",
                  versionType === "pre-release" &&
                    "bg-linear-to-r from-[#0268D4] to-[#02D4D4] text-white shadow",
                )}
                onClick={() => {
                  setVersionType("pre-release");
                }}
              >
                {t("launcher.version.preRelease")}
              </button>
            </div>

            <label className="text-[11px] text-gray-200/80 mb-1">
              {t("launcher.version.selectBuild")}
            </label>
            <div className="flex-1 overflow-y-auto pr-2">
              {availableVersions.length === 0 ? (
                <div className="text-gray-400 text-xs p-2">
                  {offlineMode
                    ? t("launcher.version.noInstalledBuilds")
                    : t("common.loading")}
                </div>
              ) : (
                availableVersions.map((v, idx) => {
                  const name = v.build_name?.trim() || `Build-${v.build_index}`;
                  const suffix =
                    v.isLatest
                      ? ` • ${t("launcher.version.latest")}`
                      : "";
                  const isSelected = selectedVersion === idx;
                  const allowLatestWithoutBuild1 = !!v.isLatest;
                  const isLocked =
                    restrictVersionsUntilBuild1 &&
                    !hasBuild1Installed &&
                    !v.installed &&
                    v.build_index !== 1 &&
                    !allowLatestWithoutBuild1;
                  const isRunningBuild =
                    !!runningVersion &&
                    gameLaunched &&
                    runningVersion.type === v.type &&
                    runningVersion.build_index === v.build_index;

                  return (
                    <div
                      key={`${v.type}:${v.build_index}`}
                      className={cn(
                        "flex items-center justify-between p-2 rounded-md mb-1 cursor-pointer text-gray-200 hover:text-white hover:bg-white/10 transition",
                        isSelected && "bg-blue-600/40 text-white",
                        isLocked && "opacity-40 cursor-not-allowed hover:bg-transparent hover:text-gray-200",
                      )}
                      onClick={() => {
                        if (isLocked) {
                          alert(t("launcher.version.requiresBuild1"));
                          return;
                        }

                        setSelectedVersion(idx);
                        setVersionsOpen(false);
                      }}
                    >
                      <div className="flex flex-col">
                        <span className="text-xs">
                          {name}
                          {suffix ? (
                            <span className="text-gray-300/70">{suffix}</span>
                          ) : null}
                        </span>

                        {v.build_index === 1 && !v.installed && !isCustom ? (
                          <span className="text-[10px] text-gray-300/70">
                            {t("launcher.version.manualInstallRequired")}
                          </span>
                        ) : null}
                      </div>

                      {v.installed && (
                        <button
                          type="button"
                          className={cn(
                            "ml-2 text-xs text-gray-200 hover:text-red-400 cursor-pointer",
                            isRunningBuild && "opacity-60 cursor-not-allowed hover:text-gray-200",
                          )}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isRunningBuild) return;
                            void deleteVersion(v);
                          }}
                          disabled={isRunningBuild}
                          title={
                            isRunningBuild
                              ? t("launcher.version.cannotDeleteRunning")
                              : t("launcher.version.delete", { name })
                          }
                        >
                          <IconTrash size={16} />
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {updateAvailable &&
            !updateDismissed &&
            versionType === "release" ? (
              <div className="mt-2 text-[11px] text-blue-200/90">
                {t("launcher.updates.available")}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="absolute top-11 right-3 z-30 flex flex-col items-end gap-2">
        <div className="flex items-center justify-end gap-2">
          {!offlineMode ? (
            <button
              type="button"
              className={cn(
                "px-4 py-2 rounded-lg shadow-lg border border-white/10",
                "bg-black/35 hover:bg-linear-to-r hover:from-[#0268D4] hover:to-[#02D4D4]",
                "backdrop-blur-md text-white text-sm font-bold",
                "flex items-center gap-2",
                "transition duration-200",
                "hover:border-blue-400/70 hover:ring-2 hover:ring-blue-400/35",
                "hover:shadow-[0_0_18px_rgba(2,104,212,0.85)]",
              )}
              title={t("launcher.buttons.wiki")}
              onClick={() => {
                setWikiOpen(true);
              }}
            >
              <IconBook size={18} className="text-white" />
              {t("launcher.buttons.wiki")}
            </button>
          ) : null}

          {!offlineMode ? (
            <button
              type="button"
              className={cn(
                "px-4 py-2 rounded-lg shadow-lg border border-white/10",
                "bg-black/35 hover:bg-linear-to-r hover:from-[#0268D4] hover:to-[#02D4D4]",
                "backdrop-blur-md text-white text-sm font-bold",
                "flex items-center gap-2",
                "transition duration-200",
                "hover:border-blue-400/70 hover:ring-2 hover:ring-blue-400/35",
                "hover:shadow-[0_0_18px_rgba(2,104,212,0.85)]",
              )}
              title={t("launcher.buttons.servers")}
              onClick={() => setServersOpen(true)}
            >
              <IconServer size={18} className="text-white" />
              {t("launcher.buttons.servers")}
            </button>
          ) : null}

          <div className="relative" ref={hostServerMenuRef}>
            <button
              type="button"
              className={cn(
                "px-4 py-2 rounded-lg shadow-lg border border-white/10",
                "bg-black/35 hover:bg-linear-to-r hover:from-[#0268D4] hover:to-[#02D4D4]",
                "backdrop-blur-md text-white text-sm font-bold",
                "flex items-center gap-2",
                "transition duration-200",
                "hover:border-blue-400/70 hover:ring-2 hover:ring-blue-400/35",
                "hover:shadow-[0_0_18px_rgba(2,104,212,0.85)]",
                hostServerRunning &&
                  "border-green-300/40 ring-2 ring-green-400/25 shadow-[0_0_18px_rgba(34,197,94,0.65)] animate-pulse",
              )}
              title={t("launcher.buttons.hostServer")}
              onClick={() => {
                setHostServerMenuOpen((v) => {
                  const next = !v;
                  if (next) {
                    setHostServerStage((s) => (hostServerRunning ? s : "root"));
                  } else {
                    setHostServerStage((s) => (s === "local" && hostServerRunning ? "local" : "root"));
                  }
                  return next;
                });
              }}
            >
              <IconServerCog size={18} className="text-white" />
              {t("launcher.buttons.hostServer")}
            </button>

            {hostServerMenuOpen ? (
              <div className="absolute top-full right-0 mt-2 w-[420px] rounded-xl border border-white/10 bg-black/55 backdrop-blur-md shadow-2xl p-3">
                {hostServerStage === "root" ? (
                  <>
                    <div className="rounded-lg border border-[#2a3146] bg-[#1f2538]/70 p-3">
                      <button
                        type="button"
                        className="mx-auto block px-4 py-2 rounded-lg font-semibold border border-[#2a3146] text-gray-200 hover:bg-white/5 transition"
                        onClick={() => {
                          if (!hostServerWarningShownThisSession) {
                            setHostServerWarningShownThisSession(true);
                            setHostServerWarningOpen(true);
                            return;
                          }

                          if (!isSelectedBuildInstalled()) {
                            showSelectedBuildNotInstalledError();
                            return;
                          }

                          setHostServerStage("local");
                          setHostServerMenuOpen(true);
                        }}
                      >
                        {t("hostServerModal.localHost.button")}
                      </button>
                    </div>

                    <div className="mt-3 relative overflow-hidden rounded-lg border border-blue-400/30 bg-[#1f2538]/70 p-3 animate-softGlowStrong">
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 bg-linear-to-r from-blue-500/18 via-cyan-400/10 to-blue-500/18 bg-chroma-animated animate-chroma-shift animate-hue-slow"
                      />

                      <div className="relative z-10">
                        <div
                          className={cn(
                            "text-sm font-extrabold tracking-wider uppercase text-center",
                            "bg-linear-to-r from-blue-500 via-cyan-400 to-blue-500 bg-clip-text text-transparent",
                            "bg-chroma-animated animate-chroma-shift",
                          )}
                        >
                          {t("hostServerModal.proHosting.section")} (24/7)
                        </div>

                        <button
                          type="button"
                          className="mt-3 mx-auto block px-5 py-2 rounded-lg font-bold text-white bg-linear-to-r from-blue-500 to-cyan-400 hover:from-blue-600 hover:to-cyan-500 transition shadow-lg"
                          onClick={() => {
                            void window.config.openExternal(
                              "https://www.hycloudhosting.com/gameservers/hytale?ref=butterlauncher",
                            );
                          }}
                        >
                          {t("hostServerModal.proHosting.button")}
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="rounded-lg border border-[#2a3146] bg-[#1f2538]/70 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs font-semibold text-gray-200">
                        {t("hostServerModal.panel.authMode.label")}
                      </div>

                      <select
                        value={hostServerAuthMode}
                        onChange={(e) =>
                          setHostServerAuthMode(
                            e.target.value as "offline" | "authenticated" | "insecure",
                          )
                        }
                        className="px-3 py-2 rounded-lg bg-[#141824]/80 border border-[#2a3146] text-white text-sm outline-none focus:border-blue-400/60"
                      >
                        <option value="offline">{t("hostServerModal.panel.authMode.offline")}</option>
                        <option value="authenticated">{t("hostServerModal.panel.authMode.authenticated")}</option>
                        <option value="insecure">{t("hostServerModal.panel.authMode.insecure")}</option>
                      </select>
                    </div>

                    <button
                      type="button"
                      className={cn(
                        "mt-3 w-full px-3 py-2 rounded-lg border transition",
                        hostServerAdvancedOpen
                          ? "border-blue-400/60 bg-blue-500/15 text-blue-100 hover:bg-blue-500/20"
                          : "border-[#2a3146] bg-[#23293a] hover:bg-[#2f3650] text-white",
                        "text-sm font-semibold",
                      )}
                      onClick={() => setHostServerAdvancedOpen((v) => !v)}
                    >
                      {t("hostServerModal.panel.advanced.toggle")}
                    </button>

                    {hostServerAdvancedOpen ? (
                      <div className="mt-3 space-y-2">
                        <button
                          type="button"
                          className={cn(
                            "w-full px-3 py-2 rounded-lg border border-[#2a3146]",
                            "bg-transparent hover:bg-white/5 text-gray-200 transition text-sm font-semibold",
                          )}
                          onClick={async () => {
                            if (!isSelectedBuildInstalled()) {
                              showSelectedBuildNotInstalledError();
                              return;
                            }

                            if (!gameDir || !selected) return;
                            try {
                              await window.ipcRenderer.invoke(
                                "host-server:open-current-folder",
                                gameDir,
                                selected,
                              );
                            } catch {
                              // ignore
                            }
                          }}
                          title={t("hostServerModal.panel.advanced.openServerFolder")}
                        >
                          {t("hostServerModal.panel.advanced.openServerFolder")}
                        </button>

                        {/* RAM */}
                        <div className="flex items-center gap-2 min-w-0">
                          <input
                            type="checkbox"
                            className="w-4 h-4"
                            checked={advRamEnabled}
                            onChange={(e) => setAdvRamEnabled(e.target.checked)}
                          />
                          <div className="w-28 shrink-0 text-xs font-semibold text-gray-200">
                            {t("hostServerModal.panel.advanced.ram")}
                          </div>

                          <div className="flex-1 min-w-0 flex items-center gap-1">
                            <input
                              value={advRamMin}
                              onChange={(e) => {
                                const digits = String(e.target.value ?? "").replace(/[^0-9]/g, "");
                                setAdvRamMin(digits);
                              }}
                              inputMode="numeric"
                              placeholder={t("hostServerModal.panel.advanced.min")}
                              disabled={!advRamEnabled}
                              className={cn(
                                "w-full min-w-0 px-3 py-2 rounded-lg bg-[#141824]/80 border border-[#2a3146]",
                                "text-white text-sm outline-none focus:border-blue-400/60",
                                !advRamEnabled && "opacity-60",
                              )}
                            />
                            <div className={cn("text-sm font-bold text-gray-200", !advRamEnabled && "opacity-60")}>G</div>
                          </div>

                          <div className="flex-1 min-w-0 flex items-center gap-1">
                            <input
                              value={advRamMax}
                              onChange={(e) => {
                                const digits = String(e.target.value ?? "").replace(/[^0-9]/g, "");
                                setAdvRamMax(digits);
                              }}
                              inputMode="numeric"
                              placeholder={t("hostServerModal.panel.advanced.max")}
                              disabled={!advRamEnabled}
                              className={cn(
                                "w-full min-w-0 px-3 py-2 rounded-lg bg-[#141824]/80 border border-[#2a3146]",
                                "text-white text-sm outline-none focus:border-blue-400/60",
                                !advRamEnabled && "opacity-60",
                              )}
                            />
                            <div className={cn("text-sm font-bold text-gray-200", !advRamEnabled && "opacity-60")}>G</div>
                          </div>
                        </div>

                        {/* No AOT */}
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            className="w-4 h-4"
                            checked={advNoAotEnabled}
                            onChange={(e) => setAdvNoAotEnabled(e.target.checked)}
                          />
                          <div className="text-xs font-semibold text-gray-200">
                            {t("hostServerModal.panel.advanced.noAot")}
                          </div>
                        </div>

                        {/* Custom JVM Args */}
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-28 shrink-0 text-xs font-semibold text-gray-200">
                            {t("hostServerModal.panel.advanced.customJvmArgs")}
                          </div>
                          <input
                            value={advCustomJvmArgs}
                            onChange={(e) => setAdvCustomJvmArgs(e.target.value)}
                            placeholder={t("hostServerModal.panel.advanced.customJvmArgsExample")}
                            className={cn(
                              "flex-1 min-w-0 px-3 py-2 rounded-lg bg-[#141824]/80 border border-[#2a3146]",
                              "text-white text-sm outline-none focus:border-blue-400/60",
                            )}
                          />
                        </div>

                        {/* Custom Assets */}
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            className="w-4 h-4"
                            checked={advAssetsEnabled}
                            onChange={(e) => setAdvAssetsEnabled(e.target.checked)}
                          />
                          <div className="w-28 text-xs font-semibold text-gray-200">
                            {t("hostServerModal.panel.advanced.customAssets")}
                          </div>
                          <input
                            value={advAssetsPath}
                            onChange={(e) => setAdvAssetsPath(e.target.value)}
                            disabled={!advAssetsEnabled}
                            className={cn(
                              "flex-1 px-3 py-2 rounded-lg bg-[#141824]/80 border border-[#2a3146]",
                              "text-white text-sm outline-none focus:border-blue-400/60",
                              !advAssetsEnabled && "opacity-60",
                            )}
                          />
                          <button
                            type="button"
                            className={cn(
                              "px-3 py-2 rounded-lg border border-[#2a3146]",
                              "bg-transparent hover:bg-white/5 text-gray-200 transition text-sm",
                              !advAssetsEnabled && "opacity-60 cursor-not-allowed",
                            )}
                            disabled={!advAssetsEnabled}
                            onClick={async () => {
                              if (!advAssetsEnabled) return;
                              try {
                                const res = await window.config.pickFile({
                                  title: "Select .zip",
                                  extensions: ["zip"],
                                });
                                if (res?.ok && res.path) setAdvAssetsPath(res.path);
                              } catch {
                                // ignore
                              }
                            }}
                          >
                            {t("hostServerModal.panel.advanced.chooseFile")}
                          </button>
                        </div>

                        {/* Universe */}
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            className="w-4 h-4"
                            checked={advUniverseEnabled}
                            onChange={(e) => setAdvUniverseEnabled(e.target.checked)}
                          />
                          <div className="w-28 text-xs font-semibold text-gray-200">
                            {t("hostServerModal.panel.advanced.universe")}
                          </div>
                          <input
                            value={advUniversePath}
                            onChange={(e) => setAdvUniversePath(e.target.value)}
                            disabled={!advUniverseEnabled}
                            className={cn(
                              "flex-1 px-3 py-2 rounded-lg bg-[#141824]/80 border border-[#2a3146]",
                              "text-white text-sm outline-none focus:border-blue-400/60",
                              !advUniverseEnabled && "opacity-60",
                            )}
                          />
                          <button
                            type="button"
                            className={cn(
                              "px-3 py-2 rounded-lg border border-[#2a3146]",
                              "bg-transparent hover:bg-white/5 text-gray-200 transition text-sm",
                              !advUniverseEnabled && "opacity-60 cursor-not-allowed",
                            )}
                            disabled={!advUniverseEnabled}
                            onClick={async () => {
                              if (!advUniverseEnabled) return;
                              try {
                                const res = await window.config.pickFolder({ title: "Select folder" });
                                if (res?.ok && res.path) {
                                  setAdvUniversePath(res.path);
                                  setPendingFolderSync({ kind: "universe", sourceDir: res.path });
                                  setFolderSyncWarningOpen(true);
                                }
                              } catch {
                                // ignore
                              }
                            }}
                          >
                            {t("hostServerModal.panel.advanced.chooseFolder")}
                          </button>
                        </div>

                        {/* Mods */}
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            className="w-4 h-4"
                            checked={advModsEnabled}
                            onChange={(e) => setAdvModsEnabled(e.target.checked)}
                          />
                          <div className="w-28 text-xs font-semibold text-gray-200">
                            {t("hostServerModal.panel.advanced.mods")}
                          </div>
                          <input
                            value={advModsPath}
                            onChange={(e) => setAdvModsPath(e.target.value)}
                            disabled={!advModsEnabled}
                            className={cn(
                              "flex-1 px-3 py-2 rounded-lg bg-[#141824]/80 border border-[#2a3146]",
                              "text-white text-sm outline-none focus:border-blue-400/60",
                              !advModsEnabled && "opacity-60",
                            )}
                          />
                          <button
                            type="button"
                            className={cn(
                              "px-3 py-2 rounded-lg border border-[#2a3146]",
                              "bg-transparent hover:bg-white/5 text-gray-200 transition text-sm",
                              !advModsEnabled && "opacity-60 cursor-not-allowed",
                            )}
                            disabled={!advModsEnabled}
                            onClick={async () => {
                              if (!advModsEnabled) return;
                              try {
                                const res = await window.config.pickFolder({ title: "Select folder" });
                                if (res?.ok && res.path) {
                                  setAdvModsPath(res.path);
                                  setPendingFolderSync({ kind: "mods", sourceDir: res.path });
                                  setFolderSyncWarningOpen(true);
                                }
                              } catch {
                                // ignore
                              }
                            }}
                          >
                            {t("hostServerModal.panel.advanced.chooseFolder")}
                          </button>
                        </div>

                        {/* Early Plugins */}
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            className="w-4 h-4"
                            checked={advEarlyPluginsEnabled}
                            onChange={(e) => setAdvEarlyPluginsEnabled(e.target.checked)}
                          />
                          <div className="w-28 text-xs font-semibold text-gray-200">
                            {t("hostServerModal.panel.advanced.earlyPlugins")}
                          </div>
                          <input
                            value={advEarlyPluginsPath}
                            onChange={(e) => setAdvEarlyPluginsPath(e.target.value)}
                            disabled={!advEarlyPluginsEnabled}
                            className={cn(
                              "flex-1 px-3 py-2 rounded-lg bg-[#141824]/80 border border-[#2a3146]",
                              "text-white text-sm outline-none focus:border-blue-400/60",
                              !advEarlyPluginsEnabled && "opacity-60",
                            )}
                          />
                          <button
                            type="button"
                            className={cn(
                              "px-3 py-2 rounded-lg border border-[#2a3146]",
                              "bg-transparent hover:bg-white/5 text-gray-200 transition text-sm",
                              !advEarlyPluginsEnabled && "opacity-60 cursor-not-allowed",
                            )}
                            disabled={!advEarlyPluginsEnabled}
                            onClick={async () => {
                              if (!advEarlyPluginsEnabled) return;
                              try {
                                const res = await window.config.pickFolder({ title: "Select folder" });
                                if (res?.ok && res.path) {
                                  setAdvEarlyPluginsPath(res.path);
                                  setPendingFolderSync({ kind: "earlyplugins", sourceDir: res.path });
                                  setFolderSyncWarningOpen(true);
                                }
                              } catch {
                                // ignore
                              }
                            }}
                          >
                            {t("hostServerModal.panel.advanced.chooseFolder")}
                          </button>
                        </div>
                      </div>
                    ) : null}

                    <div className="mt-3 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        className={cn(
                          "px-3 py-2 rounded-lg border border-[#2a3146]",
                          "bg-transparent hover:bg-white/5 text-gray-200 transition",
                          "text-sm font-semibold",
                        )}
                        onClick={() => setHostServerConsoleOpen(true)}
                      >
                        {t("hostServerModal.panel.actions.showConsole")}
                      </button>

                      <button
                        type="button"
                        className={cn(
                          "px-4 py-2 rounded-lg text-white font-extrabold transition",
                          "shadow-lg border border-white/10",
                          hostServerRunning
                            ? "bg-red-600 hover:bg-red-700"
                            : "bg-green-600 hover:bg-green-700",
                        )}
                        onClick={() => {
                          if (!hostServerRunning) {
                            if (!isSelectedBuildInstalled()) {
                              showSelectedBuildNotInstalledError();
                              return;
                            }

                            const version = availableVersions?.[selectedVersion] ?? null;
                            if (!version || !gameDir) {
                              alert(t("hostServerModal.errors.serverStartFailed"));
                              return;
                            }

                            const assetsZipPath = (() => {
                              if (!advAssetsEnabled) return null;
                              const p = advAssetsPath.trim();
                              if (!p) {
                                alert(t("hostServerModal.errors.customAssetsMissing"));
                                return null;
                              }
                              return p;
                            })();

                            if (advAssetsEnabled && !assetsZipPath) {
                              return;
                            }

                            let ramMinGb: number | null = null;
                            let ramMaxGb: number | null = null;
                            if (advRamEnabled) {
                              const min = Number.parseInt(advRamMin, 10);
                              const max = Number.parseInt(advRamMax, 10);
                              if (!Number.isFinite(min) || !Number.isFinite(max)) {
                                alert(t("hostServerModal.errors.ramMissing"));
                                return;
                              }
                              if (min <= 0 || max <= 0) {
                                alert(t("hostServerModal.errors.ramInvalid"));
                                return;
                              }
                              if (max < min) {
                                alert(t("hostServerModal.errors.ramRange"));
                                return;
                              }
                              ramMinGb = min;
                              ramMaxGb = max;
                            }

                            pushHostLog(`[Launcher] Starting server...`);

                            void window.config
                              .hostServerStart(gameDir, version, {
                                assetsZipPath,
                                authMode: hostServerAuthMode,
                                noAot: advNoAotEnabled,
                                ramMinGb,
                                ramMaxGb,
                                customJvmArgs: advCustomJvmArgs.trim() || null,
                              })
                              .then((res) => {
                                if (res?.ok) {
                                  // state/logs will also be reinforced by IPC events
                                  setHostServerRunning(true);
                                  return;
                                }

                                const code = res?.error?.code;
                                if (
                                  code === "JAVA_NOT_FOUND" ||
                                  code === "JAVA_TOO_OLD" ||
                                  code === "JAVA_CHECK_FAILED"
                                ) {
                                  if (code === "JAVA_TOO_OLD") {
                                    const found =
                                      (res as any)?.error?.details?.major ??
                                      (res as any)?.error?.details?.found ??
                                      "?";
                                    alert(
                                      t("hostServerModal.errors.javaTooOld", {
                                        found,
                                      }),
                                    );
                                  } else {
                                    alert(
                                      t("hostServerModal.errors.java25Required"),
                                    );
                                  }

                                  const raw = (res as any)?.error?.details?.raw;
                                  const execPath = (res as any)?.error?.details?.execPath;
                                  if (typeof execPath === "string" && execPath.trim()) {
                                    pushHostLog(`[Launcher] Java exec: ${execPath}`);
                                  }
                                  if (typeof raw === "string" && raw.trim()) {
                                    pushHostLog(`[Launcher] java -version: ${raw}`);
                                  }
                                  return;
                                }

                                if (code === "ASSETS_ZIP_MISSING") {
                                  const p = (res as any)?.error?.details?.assetsPath;
                                  alert(
                                    t("hostServerModal.errors.assetsZipMissing", {
                                      path: typeof p === "string" ? p : "",
                                    }),
                                  );
                                  return;
                                }

                                alert(
                                  t("hostServerModal.errors.serverStartFailed"),
                                );
                                const msg = res?.error?.message;
                                if (typeof msg === "string" && msg.trim()) {
                                  pushHostLog(`[Launcher] Start failed: ${msg}`);
                                }
                              })
                              .catch(() => {
                                alert(t("hostServerModal.errors.serverStartFailed"));
                              });
                          } else {
                            void window.config.hostServerStop().then((r) => {
                              if (!r?.ok) {
                                alert(t("hostServerModal.errors.serverStopFailed"));
                                return;
                              }
                              pushHostLog(`[Launcher] Stopping server...`);
                              // UI will flip to stopped when the process actually exits
                            });
                          }
                        }}
                      >
                        {hostServerRunning
                          ? t("hostServerModal.panel.actions.stopServer")
                          : t("hostServerModal.panel.actions.startServer")}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>

          <button
            type="button"
            className={cn(
              "px-4 py-2 rounded-lg shadow-lg border border-white/10",
              "bg-black/35 hover:bg-linear-to-r hover:from-[#0268D4] hover:to-[#02D4D4]",
              "backdrop-blur-md text-white text-sm font-bold",
              "flex items-center gap-2",
              "transition duration-200",
              "hover:border-blue-400/70 hover:ring-2 hover:ring-blue-400/35",
              "hover:shadow-[0_0_18px_rgba(2,104,212,0.85)]",
            )}
            title={t("launcher.buttons.mods")}
            onClick={() => setModsOpen(true)}
          >
            <IconPuzzle size={18} className="text-white" />
            {t("launcher.buttons.mods")}
          </button>

          {!offlineMode ? (
            <div className="relative" ref={friendsMenuRef}>
              <button
                type="button"
                className={cn(
                  "px-4 py-2 rounded-lg shadow-lg border border-white/10",
                  "bg-black/35 hover:bg-linear-to-r hover:from-[#0268D4] hover:to-[#02D4D4]",
                  "backdrop-blur-md text-white text-sm font-bold",
                  "flex items-center gap-2",
                  "transition duration-200",
                  friendsHasUnread
                    ? "hover:border-green-400/70 hover:ring-2 hover:ring-green-400/35"
                    : "hover:border-blue-400/70 hover:ring-2 hover:ring-blue-400/35",
                  friendsHasUnread
                    ? "hover:shadow-[0_0_18px_rgba(34,197,94,0.65)]"
                    : "hover:shadow-[0_0_18px_rgba(2,104,212,0.85)]",
                  friendsHasUnread && !friendsMenuOpen && "border-green-300/40 ring-2 ring-green-400/25 shadow-[0_0_18px_rgba(34,197,94,0.65)] animate-pulse",
                )}
                title={t("launcher.buttons.friends")}
                onClick={() => setFriendsMenuOpen((v) => !v)}
              >
                <IconUsers size={18} className="text-white" />
                {t("launcher.buttons.friends")}
              </button>

              <div
                className={cn(
                  "absolute top-full right-0 mt-2 w-[30vw] max-w-[560px]",
                  friendsMenuOpen
                    ? "pointer-events-auto visible animate-friendsMenuIn"
                    : "pointer-events-none invisible",
                )}
                style={{ minWidth: "min(360px, calc(100vw - 24px))", maxWidth: "calc(100vw - 24px)" }}
              >
                <FriendsMenu
                  open={friendsMenuOpen}
                  onClose={() => setFriendsMenuOpen(false)}
                  onOpenTerms={() => setMatchaTermsOpen(true)}
                  openTo={friendsMenuOpenTo}
                  openToNonce={friendsMenuOpenNonce}
                  launcherUsername={username}
                  gameDir={gameDir}
                />
              </div>
            </div>
          ) : null}

          <button
            type="button"
            className="bg-[#23293a]/80 hover:bg-[#3b82f6] transition p-2 rounded-full shadow-lg flex items-center justify-center"
            title={t("launcher.buttons.settings")}
            onClick={() => setSettingsOpen(true)}
            style={{ width: 40, height: 40 }}
          >
            <img
              src={settingsIcon}
              alt="Settings"
              width={22}
              height={22}
              style={{ filter: "invert(1)" }}
            />
          </button>
        </div>

        <button
          type="button"
          className={cn(
            "relative overflow-hidden group",
            "p-2 rounded-full shadow-lg flex items-center justify-center",
            "border border-white/10 bg-black/35 backdrop-blur-md",
            "transition duration-200 ease-out",
            "transform-gpu",
            "shadow-[0_0_16px_rgba(88,101,242,0.35)]",
            "animate-softGlowStrong",
            "hover:border-white/20 hover:ring-2 hover:ring-[#5865F2]/55 hover:shadow-[0_0_26px_rgba(88,101,242,0.95)]",
            "hover:-translate-y-0.5",
            "hover:brightness-110 hover:saturate-150",
            "active:translate-y-0 active:brightness-95 active:shadow-[0_0_14px_rgba(88,101,242,0.70)]",
          )}
          title="Discord"
          onClick={() => {
            void window.config.openExternal(
              "https://discord.com/invite/fZgjHwv5pA",
            );
          }}
          style={{ width: 40, height: 40 }}
        >
          <span
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute inset-0",
              "bg-linear-to-r from-[#5865F2]/65 via-blue-500/40 to-[#5865F2]/65",
              "bg-chroma-animated animate-chroma-shift animate-hue-slow",
              "opacity-70 group-hover:opacity-100 transition-opacity duration-200",
            )}
          />
          <img
            src={DiscordLogo}
            alt="Discord"
            className="relative z-10 w-5 h-5 drop-shadow-[0_0_10px_rgba(88,101,242,0.75)]"
          />
        </button>

        <button
          type="button"
          className={cn(
            "relative overflow-hidden group",
            "p-2 rounded-full shadow-lg flex items-center justify-center",
            "border border-white/10 bg-black/35 backdrop-blur-md",
            "transition duration-200",
            "hover:border-blue-400/70 hover:ring-2 hover:ring-blue-400/35 hover:shadow-[0_0_18px_rgba(2,104,212,0.85)]",
            "shadow-[0_0_14px_rgba(2,212,212,0.22)]",
            "animate-softGlowStrong",
            "hover:shadow-[0_0_26px_rgba(2,212,212,0.90)] hover:ring-cyan-400/35",
          )}
          title="Web"
          onClick={() => {
            void window.config.openExternal("https://butterlauncher.tech/");
          }}
          style={{ width: 40, height: 40 }}
        >
          <span
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute inset-0",
              "bg-linear-to-r from-blue-500/55 via-cyan-400/45 to-blue-500/55",
              "bg-chroma-animated animate-chroma-shift animate-hue-slow",
              "opacity-75 group-hover:opacity-100 transition-opacity duration-200",
            )}
          />
          <IconWorld size={20} className="relative z-10 text-white" />
        </button>

        <button
          type="button"
          className={cn(
            "relative overflow-hidden group",
            "rounded-full shadow-lg flex items-center justify-center",
            "border border-transparent bg-black/35 backdrop-blur-md",
            "transition duration-200 ease-out",
            "transform-gpu",
            "animate-softGlowStrong",
            "hover:border-white/70 hover:ring-2 hover:ring-white/45",
            "hover:shadow-xl",
            "hover:-translate-y-0.5",
            "hover:brightness-110",
            "active:translate-y-0",
            "active:brightness-95",
          )}
          aria-label="Patreon"
          title={t("launcher.buttons.supportProject")}
          onClick={() => {
            void window.config.openExternal(
              "https://www.patreon.com/c/ButterLauncher",
            );
          }}
          style={{ width: 40, height: 40 }}
        >
          <img
            src={PatreonLogo}
            alt="Patreon"
            className="relative z-10 w-full h-full object-cover"
            draggable={false}
          />
        </button>
      </div>
      <div className="flex items-start justify-between p-6">
        <img
          src={butterLogo}
          alt="butter Logo"
          className="w-auto h-full max-h-96 drop-shadow-lg select-none"
          draggable={false}
        />
      </div>
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onLogout={handleLogout}
      />

      <ModsModal
        open={modsOpen}
        onClose={() => setModsOpen(false)}
      />

      <ServersModal
        open={serversOpen}
        onClose={() => setServersOpen(false)}
      />

      <WikiModal
        open={wikiOpen}
        initialUrl={wikiLastUrl}
        onClose={(lastUrl) => {
          if (typeof lastUrl === "string" && lastUrl.trim()) {
            setWikiLastUrl(lastUrl);
          }
          setWikiOpen(false);
        }}
      />

      <MatchaTermsModal
        open={matchaTermsOpen}
        onClose={() => setMatchaTermsOpen(false)}
      />

      <ConfirmModal
        open={closeDownloadConfirmOpen}
        title={t("common.close")}
        message={t("common.closeDownloadWarning")}
        cancelText={t("common.cancel")}
        confirmText={t("common.confirm")}
        onCancel={() => {
          setCloseDownloadConfirmOpen(false);
          try {
            window.ipcRenderer.send("app:close-download:cancel");
          } catch {
            // ignore
          }
        }}
        onConfirm={() => {
          setCloseDownloadConfirmOpen(false);
          try {
            window.ipcRenderer.send("app:cancel-downloads-and-quit");
          } catch {
            // ignore
          }
        }}
      />

      <ConfirmModal
        open={hostServerWarningOpen}
        title={t("hostServerModal.warning.title")}
        message={`${t("hostServerModal.localHost.note")}\n\n${t("hostServerModal.warning.versionLine", {
          version: getSelectedVersionLabel(),
        })}`}
        cancelText={t("hostServerModal.warning.dedicated")}
        confirmText={t("hostServerModal.warning.confirm")}
        onCancel={() => {
          setHostServerWarningOpen(false);
          void window.config.openExternal(
            "https://www.hycloudhosting.com/gameservers/hytale?ref=butterlauncher",
          );
        }}
        onConfirm={() => {
          setHostServerWarningOpen(false);

          if (!isSelectedBuildInstalled()) {
            showSelectedBuildNotInstalledError();
            return;
          }

          setHostServerStage("local");
          setHostServerMenuOpen(true);
        }}
      />

      <ConfirmModal
        open={folderSyncWarningOpen}
        title={t("hostServerModal.warning.folderSyncTitle")}
        message={t("hostServerModal.warning.folderSyncMessage", {
          target: pendingFolderSync?.kind ?? "",
        })}
        cancelText={t("common.cancel")}
        confirmText={t("common.confirm")}
        onCancel={() => {
          setFolderSyncWarningOpen(false);
          setPendingFolderSync(null);
        }}
        onConfirm={() => {
          setFolderSyncWarningOpen(false);

          const pending = pendingFolderSync;
          setPendingFolderSync(null);
          if (!pending) return;

          if (hostServerRunning) {
            alert(t("hostServerModal.errors.folderSyncRunning"));
            return;
          }

          if (!isSelectedBuildInstalled()) {
            showSelectedBuildNotInstalledError();
            return;
          }

          const version = availableVersions?.[selectedVersion] ?? null;
          if (!version || !gameDir) {
            alert(t("hostServerModal.errors.folderSyncFailed"));
            return;
          }

          void window.config
            .hostServerSyncFolder(gameDir, version, pending.kind, pending.sourceDir)
            .then((r) => {
              if (r?.ok) {
                pushHostLog(`[Launcher] Synced ${pending.kind} into Server/${pending.kind}`);
                return;
              }

              const code = (r as any)?.error?.code;
              if (code === "RUNNING") {
                alert(t("hostServerModal.errors.folderSyncRunning"));
                return;
              }
              if (code === "SOURCE_MISSING") {
                const p = (r as any)?.error?.details?.sourceDir ?? "";
                alert(t("hostServerModal.errors.folderSourceMissing", { path: String(p) }));
                return;
              }

              alert(t("hostServerModal.errors.folderSyncFailed"));
              const msg = (r as any)?.error?.message;
              if (typeof msg === "string" && msg.trim()) {
                pushHostLog(`[Launcher] Folder sync failed: ${msg}`);
              }
            })
            .catch(() => {
              alert(t("hostServerModal.errors.folderSyncFailed"));
            });
        }}
      />

      <HostServerConsoleModal
        open={hostServerConsoleOpen}
        onClose={() => setHostServerConsoleOpen(false)}
        logs={hostServerLogs}
        onCommand={(cmd) => {
          void window.config.hostServerCommand(cmd).then((r) => {
            if (r?.ok) return;

            if (r?.error?.code === "NOT_RUNNING") {
              alert(t("hostServerModal.errors.serverNotRunning"));
              return;
            }

            alert(t("hostServerModal.errors.commandFailed"));
          });
        }}
      />
      <div className="w-full px-6 py-4 bg-black/60 backdrop-blur-md flex flex-row items-center justify-between gap-6">
        {installing || patchingOnline ? (
          <div className="w-52 h-16 p-4 bg-white/10 rounded-lg shadow-inner flex items-center gap-2">
            <ProgressBar progress={installing ? installProgress : patchProgress} />

            {installing &&
            !patchingOnline &&
            installProgress?.phase === "pwr-download" ? (
              <button
                type="button"
                className="w-5 h-5 flex items-center justify-center text-white/90 hover:text-white bg-white/0 hover:bg-white/10 rounded disabled:opacity-50"
                title="Cancel download"
                disabled={cancelingBuildDownload}
                onClick={() => {
                  // because sometimes you realize you did not want build 472 at all
                  cancelBuildDownload();
                }}
              >
                <IconX size={14} />
              </button>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-row items-center gap-2">
            {needsFixClient ? (
              <button
                className="min-w-52 bg-linear-to-r from-[#0268D4] to-[#02D4D4] text-white text-xl font-bold px-12 py-3 rounded-lg shadow-lg hover:scale-105 transition disabled:opacity-50"
                onClick={fixClient}
                disabled={launching || gameLaunched}
                title={t("launcher.updates.fixClientTooltip")}
              >
                {t("launcher.updates.fixClient")}
              </button>
            ) : showUpdateActions && latestRelease ? (
              <>
                {canSmartInstallLatest && isSelectedLatestRelease ? (
                  <button
                    className="min-w-52 bg-linear-to-r from-[#0268D4] to-[#02D4D4] text-white text-xl font-bold px-8 py-3 rounded-lg shadow-lg hover:scale-105 transition disabled:opacity-50 animate-tinyGlow"
                    onClick={() => {
                      const latestIdx = availableVersions.findIndex(
                        (v) =>
                          v.type === "release" &&
                          v.build_index === latestRelease.build_index,
                      );
                      if (latestIdx !== -1) setSelectedVersion(latestIdx);

                      if (emergencyMode && !latestRelease.installed) {
                        alert(t("launcher.errors.emergencyMode"));
                        return;
                      }
                      smartInstallGame(
                        latestRelease,
                        smartUpdate!.fromBuildIndex,
                      );
                    }}
                    disabled={launching || gameLaunched || checkingSmartUpdate}
                    title={
                      checkingSmartUpdate
                        ? t("launcher.updates.smartInstallChecking")
                        : t("launcher.updates.smartInstallTooltip")
                    }
                  >
                    {t("launcher.updates.smartInstall")}
                  </button>
                ) : (
                  <button
                    className="min-w-52 bg-linear-to-r from-[#0268D4] to-[#02D4D4] text-white text-xl font-bold px-12 py-3 rounded-lg shadow-lg hover:scale-105 transition disabled:opacity-50 animate-tinyGlow"
                    onClick={() => {
                      const latestIdx = availableVersions.findIndex(
                        (v) =>
                          v.type === "release" &&
                          v.build_index === latestRelease.build_index,
                      );
                      if (latestIdx !== -1) setSelectedVersion(latestIdx);

                      // If the selected build is an older installed release, do a smart update from it.
                      if (canSmartUpdateFromSelected) {
                        smartInstallGame(latestRelease, selected.build_index);
                        return;
                      }

                      // Otherwise, if we know a smart path exists from newest installed -> latest, use it.
                      if (smartUpdate) {
                        smartInstallGame(latestRelease, smartUpdate.fromBuildIndex);
                        return;
                      }

                      // Fallback: full install.
                      installGame(latestRelease);
                    }}
                    disabled={launching || gameLaunched}
                    title={t("launcher.updates.update")}
                  >
                    {t("launcher.updates.update")}
                  </button>
                )}

                {canSmartInstallLatest && isSelectedLatestRelease ? (
                  <button
                    type="button"
                    className="min-w-[160px] bg-white/10 hover:bg-white/20 text-white text-sm font-bold px-6 py-3 rounded-lg shadow-lg transition disabled:opacity-50"
                    onClick={() => {
                      const latestIdx = availableVersions.findIndex(
                        (v) =>
                          v.type === "release" &&
                          v.build_index === latestRelease.build_index,
                      );
                      if (latestIdx !== -1) setSelectedVersion(latestIdx);
                      if (emergencyMode && !latestRelease.installed) {
                        alert(t("launcher.errors.emergencyMode"));
                        return;
                      }
                      installGame(latestRelease);
                    }}
                    disabled={launching || gameLaunched}
                    title={t("launcher.updates.installFullTooltip")}
                  >
                    {t("launcher.updates.installFull")}
                  </button>
                ) : null}
              </>
            ) : (
              availableVersions[selectedVersion]?.build_index === 1 &&
              !availableVersions[selectedVersion]?.installed ? (
                isCustom ? (
                  <button
                    className={cn(
                      "min-w-52 bg-linear-to-r from-[#0268D4] to-[#02D4D4] text-white text-xl font-bold px-12 py-3 rounded-lg shadow-lg hover:scale-105 transition disabled:opacity-50",
                      "animate-tinyGlow",
                    )}
                    onClick={handleLaunch}
                    disabled={launching || gameLaunched}
                  >
                    {t("launcher.updates.install")}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="min-w-52 bg-white/10 hover:bg-white/20 text-white/90 text-sm font-semibold px-6 py-3 rounded-lg shadow-lg text-center transition"
                    onClick={async () => {
                      try {
                        if (!gameDir) {
                          alert("Game directory not set.");
                          return;
                        }

                        const picked = await window.config.pickFolder({
                          title:
                            availableVersions[selectedVersion]?.type === "pre-release"
                              ? "Select Pre-release Build-1 Folder"
                              : "Select Build-1 Folder",
                          defaultPath: gameDir,
                        });

                        if (!picked || picked.ok === false) {
                          const msg = (picked as any)?.error;
                          if (typeof msg === "string" && msg.trim()) alert(msg);
                          return;
                        }

                        const src = (picked as any)?.path;
                        if (typeof src !== "string" || !src.trim()) {
                          // cancelled
                          return;
                        }

                        const channel = availableVersions[selectedVersion]?.type;
                        window.ipcRenderer.send(
                          "install-build1-manual",
                          gameDir,
                          src,
                          channel,
                        );

                        // Best-effort refresh; main process will also trigger install-finished.
                        void checkForUpdates("manual");
                      } catch {
                        alert(t("launcher.version.manualInstallRequired"));
                      }
                    }}
                  >
                    {t("launcher.version.manualInstallRequired")}
                  </button>
                )
              ) : (
                <button
                  className={cn(
                    "min-w-52 bg-linear-to-r from-[#0268D4] to-[#02D4D4] text-white text-xl font-bold px-12 py-3 rounded-lg shadow-lg hover:scale-105 transition disabled:opacity-50",
                    !availableVersions[selectedVersion]?.installed &&
                      "animate-tinyGlow",
                  )}
                  onClick={handleLaunch}
                  disabled={launching || gameLaunched}
                >
                  {availableVersions[selectedVersion]?.installed
                    ? gameLaunched
                      ? t("launcher.updates.running")
                      : t("launcher.updates.play")
                    : t("launcher.updates.install")}
                </button>
              )
            )}

            {showUpdatePrompt && (
              <button
                type="button"
                className="w-10 h-10 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
                title={t("launcher.updates.dismissForNow")}
                onClick={() => dismissUpdateForNow()}
              >
                X
              </button>
            )}

            {patchAvailable && !needsFixClient && !isPremium ? (
              <button
                type="button"
                className={cn(
                  "min-w-[140px] h-[52px] rounded-lg px-4 text-sm font-bold shadow-lg transition disabled:opacity-50 bg-linear-to-r from-[#0268D4] to-[#02D4D4] text-white hover:scale-105",
                  onlinePatchEnabled &&
                    "bg-white/10 hover:bg-white/20 text-white",
                )}
                disabled={launching || gameLaunched}
                onClick={() => {
                  // If enabled but outdated, re-run enable to download/apply the new patch.
                  if (onlinePatchEnabled && patchOutdated) {
                    startOnlinePatch();
                    return;
                  }

                  if (onlinePatchEnabled) {
                    disableOnlinePatch();
                    return;
                  }

                  setPatchConfirmOpen(true);
                }}
                title={
                  onlinePatchEnabled
                    ? patchOutdated
                      ? t("launcher.onlinePatch.titleUpdate")
                      : t("launcher.onlinePatch.titleDisable")
                    : t("launcher.onlinePatch.titleEnable")
                }
              >
                {onlinePatchEnabled
                  ? patchOutdated
                    ? t("launcher.onlinePatch.btnUpdate")
                    : t("launcher.onlinePatch.btnDisable")
                  : t("launcher.onlinePatch.btnEnable")}
              </button>
            ) : null}
          </div>
        )}
        <div className="relative flex flex-col items-end gap-2">
          <div className="relative flex flex-row gap-4">
            {(newsItems.length
      			  ? newsItems
      			  : [{ title: t("launcher.news.loading"), content: "" }])
      			  .slice(0, 3)
      			  .map((item, idx) => {
      				const hasContent = !!item.content?.trim();
      				return (
      				  <div
      					key={`${idx}-${item.title}`}
                tabIndex={hasContent ? 0 : -1}
      					onClick={hasContent ? () => setOpenNews(item) : undefined}
                onKeyDown={(e) => hasContent && (e.key === "Enter" || e.key === " ") && setOpenNews(item)}
      					className={`
      					  w-40 h-20 rounded-lg flex flex-col items-center text-center p-2
      					  transition-all duration-200 ease-in-out select-none shadow-inner
      					  ${hasContent 
      						? "bg-white/10 group hover:bg-linear-to-r hover:from-[#0268D4] hover:to-[#02D4D4] hover:shadow-[0_0_18px_rgba(2,104,212,0.85)] hover:-translate-y-0.5" 
      						: "bg-white/5"}
      					`}
      				  >
      					<div className="flex-1 w-full flex items-center justify-center pointer-events-none">
      					  <div className="text-xs text-white font-semibold leading-tight line-clamp-3">
      						{item.title}
      					  </div>
      					</div>
      					{hasContent ? (
      					  <span className="text-[10px] text-blue-200 font-semibold group-hover:text-white transition-colors duration-200">
      						{t("launcher.news.showMore")}
      					  </span>
      					) : (
      					  <div className="h-[14px]" />
      					)}
      				  </div>
      				);
      			})}

            {/* Toggle button centered over the 3 news cards */}
            <button
              type="button"
              className={cn(
                "absolute left-1/2 -translate-x-1/2 -top-15 z-20",
                "w-9 h-9 rounded-full",
                "border border-white/10",
                "bg-linear-to-b from-black/60 to-black/40",
                "backdrop-blur-xl",
                "shadow-[0_10px_30px_rgba(0,0,0,0.35)]",
                "text-white/90 hover:text-white",
                "flex items-center justify-center",
                "transition-all duration-300 ease-out",
                "hover:-translate-y-0.5",
                "hover:shadow-[0_15px_35px_rgba(0,0,0,0.5)]",
                "transition",
                "hover:border-blue-400/50 hover:ring-4 hover:ring-blue-400/10",
              )}
              title={
                hytaleFeedOpen
                  ? t("launcher.hytaleFeed.toggleHide")
                  : t("launcher.hytaleFeed.toggleShow")
              }
              onClick={() => setHytaleFeedOpen((v) => !v)}
            >
              <IconChevronDown
                size={18}
                className={cn(
                  "transition-transform duration-200",
                  // CLOSED: arrow up. OPEN: arrow down.
                  !hytaleFeedOpen && "rotate-180",
                )}
              />
            </button>
          </div>

          {/* Floating panel above the launcher news (darker for readability) */}
          {hytaleFeedOpen ? (
            <div
              className={cn(
                "absolute left-1/2 -translate-x-1/2 -top-[255px] z-10",
                "w-[540px] max-w-[70vw]",
                "rounded-2xl",
                "border border-white/20",
                "bg-linear-to-b from-black/70 to-black/45",
                "backdrop-blur-xl",
                "shadow-[0_20px_60px_rgba(0,0,0,0.45)]",
                "p-3",
              )}
            >
              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="text-[11px] uppercase tracking-widest text-white/85">
                  {t("launcher.hytaleFeed.title")}
                </div>
                <div className="text-[10px] text-white/65">
                  {hytaleFeedLoading
                    ? t("launcher.hytaleFeed.statusLoading")
                    : hytaleFeedError
                      ? t("launcher.hytaleFeed.statusError")
                      : t("launcher.hytaleFeed.statusScroll")}
                </div>
              </div>

              {hytaleFeedLoading ? (
                <div className="text-xs text-white/75">
                  {t("launcher.hytaleFeed.statusLoading")}
                </div>
              ) : hytaleFeedError ? (
                <div className="text-xs text-white/75">{hytaleFeedError}</div>
              ) : (
                <div
                  ref={hytaleFeedScrollRef}
                  className={cn(
                    "dark-scrollbar",
                    "flex gap-2 overflow-x-auto overflow-y-hidden",
                    "pb-2",
                    "[scrollbar-width:thin]",
                  )}
                  onWheel={(e) => {
                    const el = hytaleFeedScrollRef.current;
                    if (!el) return;
                    // Map vertical wheel to horizontal scroll for a carousel feel.
                    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
                      el.scrollLeft += e.deltaY;
                      e.preventDefault();
                    }
                  }}
                >
                  {hytaleFeedItems.slice(0, 12).map((n) => (
                    <button
                      key={n.url}
                      type="button"
                      className={cn(
                        "w-[260px] shrink-0",
                        "text-left p-2 rounded-xl",
                        "border border-white/14",
                        "bg-black/35 hover:bg-black/25",
                        "shadow-[0_8px_24px_rgba(0,0,0,0.22)]",
                        "transition",
                        "flex gap-2",
                        "hover:border-blue-300/45 hover:ring-1 hover:ring-blue-400/20",
                      )}
                      onClick={() => void window.config.openExternal(n.url)}
                      title={n.url}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-white font-semibold leading-tight line-clamp-2">
                          {n.title}
                        </div>
                        <div className="mt-1 text-[11px] text-white/75 line-clamp-3">
                          {n.description}
                        </div>
                        <div className="mt-1 text-[10px] text-blue-200 underline underline-offset-2">
                          {t("launcher.hytaleFeed.open")}
                        </div>
                      </div>

                      {n.image ? (
                        <img
                          src={n.image}
                          alt={n.title}
                          className="w-14 h-14 rounded-lg object-cover border border-white/15 bg-white/5 shrink-0"
                          loading="lazy"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.display = "none";
                          }}
                        />
                      ) : null}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {versionToDelete && (
        <ConfirmModal
          open={deleteConfirmOpen}
          title={t("launcher.version.deleteTitle")}
          message={t("launcher.version.deleteConfirm", {
            name:
              versionToDelete.build_name ??
              `Build-${versionToDelete.build_index}`,
          })}
          confirmText={t("common.delete")}
          cancelText={t("common.cancel")}
          onCancel={() => setDeleteConfirmOpen(false)}
          onConfirm={async () => {
            if (!versionToDelete) return;

            if (
              runningVersion &&
              gameLaunched &&
              runningVersion.type === versionToDelete.type &&
              runningVersion.build_index === versionToDelete.build_index
            ) {
              alert(t("launcher.version.cannotDeleteRunning"));
              return;
            }

            setDeleteConfirmOpen(false);
            const v = versionToDelete;
            setVersionToDelete(null);

            const result = await window.ipcRenderer.invoke(
              "delete-installed-version",
              gameDir,
              v,
            );

            if (!result?.success) {
              alert("Error #1000");
              return;
            }

            const updatedVersions = availableVersions.map((ver) =>
              ver.build_index === v.build_index && ver.type === v.type
                ? { ...ver, installed: false }
                : ver,
            );
            setAvailableVersions(updatedVersions);
          }}
        />
      )}

      {openNews && (
        <div
          className="fixed inset-0 z-9999 flex items-center justify-center glass-backdrop animate-fadeIn"
          onClick={() => setOpenNews(null)}
        >
          <div
            className="w-[520px] max-w-[90vw] max-h-[80vh] rounded-2xl shadow-2xl bg-[#181c24f2] border border-[#23293a] p-5 animate-slideUp"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-4">
              <div className="text-white font-extrabold text-lg leading-tight">
                {openNews.title}
              </div>
            </div>

            {openNews.date && (
              <div className="mt-1 text-[11px] text-gray-400 font-mono">
                {openNews.date}
              </div>
            )}

            <div className="mt-4 text-sm text-gray-200 whitespace-pre-wrap overflow-auto max-h-[55vh]">
              {parseNewsContent(openNews.content).map((p, i) => {
                if (p.type === "text") {
                  return <span key={`t-${i}`}>{p.value}</span>;
                }

                return (
                  <a
                    key={`l-${i}`}
                    href={p.href}
                    className="text-blue-300 hover:text-blue-200 underline underline-offset-2"
                    onClick={(e) => {
                      e.preventDefault();
                      void window.config.openExternal(p.href);
                    }}
                  >
                    {p.value}
                  </a>
                );
              })}
            </div>

            {openNews.url ? (
              <div className="mt-3">
                <button
                  type="button"
                  className="text-xs text-blue-300 hover:text-blue-200 underline underline-offset-2"
                  onClick={() => void window.config.openExternal(openNews.url!)}
                >
                  {t("launcher.news.openLink")}
                </button>
              </div>
            ) : null}

            {openNews.image ? (
              <div className="mt-4">
                <img
                  src={openNews.image}
                  alt={openNews.title}
                  className="w-full max-h-[260px] object-contain rounded-lg border border-[#23293a] bg-black/20 cursor-pointer"
                  loading="lazy"
                  onClick={() => void window.config.openExternal(openNews.image!)}
                  onError={(e) => {
                    // Hide broken images without breaking layout.
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                  title={t("launcher.news.openImage")}
                />
              </div>
            ) : null}

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                className="px-4 py-2 rounded-lg bg-[#23293a] text-white hover:bg-[#2b3347] transition"
                onClick={() => setOpenNews(null)}
              >
                {t("common.close")}
              </button>
            </div>
          </div>
        </div>
      )}

      {patchConfirmOpen && selected ? (
        <div
          className="fixed inset-0 z-9999 flex items-center justify-center glass-backdrop animate-fadeIn"
          onClick={() => setPatchConfirmOpen(false)}
        >
          <div
            className="w-[520px] max-w-[90vw] max-h-[80vh] rounded-2xl shadow-2xl bg-[#181c24f2] border border-[#23293a] p-5 animate-slideUp"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="text-white font-extrabold text-lg leading-tight">
                {t("launcher.onlinePatch.confirmTitle")}
              </div>
              <button
                type="button"
                className="text-gray-300 hover:text-white text-xl font-bold leading-none"
                onClick={() => setPatchConfirmOpen(false)}
                title={t("common.close")}
              >
                ×
              </button>
            </div>

            <div className="mt-3 text-sm text-gray-200 whitespace-pre-wrap">
              {selected.patch_note?.trim()
                ? selected.patch_note
                : t("launcher.onlinePatch.notesNone")}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="px-4 py-2 rounded-lg bg-[#23293a] text-white hover:bg-[#2b3347] transition"
                onClick={() => setPatchConfirmOpen(false)}
              >
                {t("launcher.onlinePatch.confirmCancel")}
              </button>
              <button
                type="button"
                className="px-4 py-2 rounded-lg bg-linear-to-r from-[#0268D4] to-[#02D4D4] text-white font-bold hover:scale-[1.02] transition"
                onClick={() => {
                  setPatchConfirmOpen(false);
                  startOnlinePatch();
                }}
              >
                {t("launcher.onlinePatch.confirmApply")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default Launcher;
