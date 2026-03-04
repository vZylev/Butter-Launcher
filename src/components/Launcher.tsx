import React, { useCallback, useEffect, useRef, useState } from "react";
import { Box } from "@chakra-ui/react";
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
import { stripHtmlToText } from "../utils/sanitize";
import ConfirmModal from "./ConfirmModal";
import HostServerConsoleModal from "./HostServerConsoleModal";
import { useTranslation } from "react-i18next";
import { StorageService } from "../services/StorageService";
import { useAvatarSync } from "../features/chat/useAvatarSync";
import {
  useOnlinePatchHealth,
  useHostServerIpc,
  useVersionGating,
  parseNewsContent,
} from "../features/game";
import type { NewsItem, NewsFeed, HytaleFeedItem } from "../features/game";

// Launcher: a single component boldly pretending it isn't a small app.

// Types moved to features/game/gameHooks.ts

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

// parseNewsContent moved to features/game/gameHooks.ts

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

  useEffect(() => {
    const update = () => setFriendsHasUnread(StorageService.hasAnyUnread());
    update();

    const onUnreadChanged = () => update();
    window.addEventListener("matcha:unread-changed" as any, onUnreadChanged as any);
    window.addEventListener("focus", update);
    return () => {
      window.removeEventListener("matcha:unread-changed" as any, onUnreadChanged as any);
      window.removeEventListener("focus", update);
    };
  }, []);

  // Matcha avatar sync: deduplicated via useAvatarSync hook.
  const matchaToken = StorageService.getMatchaToken();
  useAvatarSync({
    enabled: !!username && !!gameDir && !offlineMode && !!matchaToken,
    username,
    gameDir,
    token: matchaToken,
  });

  const [hostServerWarningOpen, setHostServerWarningOpen] = useState(false);
  const [hostServerWarningShownThisSession, setHostServerWarningShownThisSession] = useState(false);
  const [hostServerStage, setHostServerStage] = useState<"root" | "local">("root");

  const openMatchaGlobalChat = () => {
    if (!StorageService.getMatchaToken()) return;
    setFriendsMenuOpenTo("globalChat");
    setFriendsMenuOpenNonce((n) => n + 1);
    setFriendsMenuOpen(true);
  };

  const [hostServerAuthMode, setHostServerAuthMode] = useState<
    "offline" | "authenticated" | "insecure"
  >("offline");
  const [hostServerAdvancedOpen, setHostServerAdvancedOpen] = useState(false);
  const [hostServerConsoleOpen, setHostServerConsoleOpen] = useState(false);
  // hostServerRunning & hostServerLogs are now from useHostServerIpc hook

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
  // onlinePatchEnabled, needsFixClient, patchOutdated now from useOnlinePatchHealth hook
  const logoutWorkingRef = useRef(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [versionToDelete, setVersionToDelete] = useState<GameVersion | null>(
    null,
  );

  const accountType = StorageService.getAccountType();

  const isCustom = accountType === "custom";
  const isPremium = accountType === "premium";
  const restrictVersionsUntilBuild1 = isCustom || isPremium;

  const latestVersion =
    availableVersions.length > 0 ? availableVersions[0] : null;

  // Version gating: use extracted hook.
  useVersionGating(
    availableVersions,
    selectedVersion,
    setSelectedVersion,
    hasBuild1Installed,
    restrictVersionsUntilBuild1,
  );

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

  // Host server IPC events handled by extracted hook.
  const hostServerIpc = useHostServerIpc();
  const hostServerRunning = hostServerIpc.running;
  const hostServerLogs = hostServerIpc.logs;

  const pushHostLog = useCallback((line: string) => {
    hostServerIpc.pushLog(line);
  }, [hostServerIpc]);

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

  // Online patch health managed by extracted hook.
  const onlinePatch = useOnlinePatchHealth(gameDir, selected, patchAvailable);
  const onlinePatchEnabled = onlinePatch.onlinePatchEnabled;
  const needsFixClient = onlinePatch.needsFixClient;
  const patchOutdated = onlinePatch.patchOutdated;
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

  // Online patch health refresh is handled by useOnlinePatchHealth hook.

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

  // Online patch actions from hook.
  const startOnlinePatch = onlinePatch.startPatch;
  const disableOnlinePatch = onlinePatch.disablePatch;
  const fixClient = onlinePatch.fixClient;

  const handleLogout = () => {
    if (!onLogout) return;
    if (logoutWorkingRef.current) return;
    logoutWorkingRef.current = true;

    void (async () => {
      try {
        const ok = await onlinePatch.disablePatchAndWait();
        if (!ok) return;
        onLogout();
      } finally {
        logoutWorkingRef.current = false;
      }
    })();
  };

  const deleteVersion = async (v: GameVersion) => {
    setVersionToDelete(v);
    setDeleteConfirmOpen(true);
  };

  return (
    <Box
      w="full"
      h="full"
      minH="100vh"
      display="flex"
      flexDir="column"
      justifyContent="space-between"
      position="relative"
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
            <Box className="no-drag" display="flex" alignItems="center" gap={2}>
              <Box
                as="span"
                fontSize="xs"
                fontWeight="semibold"
                letterSpacing="wider"
                color="amber.200"
                bg="rgba(0,0,0,0.4)"
                border="1px solid rgba(251,191,36,0.2)"
                rounded="md"
                px={2}
                py={1}
              >
                {t("launcher.offlineMode")}
              </Box>
              <button
                type="button"
                className="no-drag"
                onClick={() => reconnect()}
                disabled={checkingUpdates}
                title={t("common.retryConnection") as string}
                style={{
                  fontSize: "0.75rem",
                  padding: "4px 8px",
                  borderRadius: "6px",
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: "rgba(255,255,255,0.05)",
                  color: "#e5e7eb",
                  cursor: checkingUpdates ? "not-allowed" : "pointer",
                  opacity: checkingUpdates ? 0.6 : 1,
                  fontFamily: "inherit",
                  transition: "background 0.15s",
                }}
              >
                {t("common.reconnect")}
              </button>
            </Box>
          ) : null
        }
        onOpenMatchaGlobalChat={openMatchaGlobalChat}
      />

      {/* Version selector */}
      <Box position="absolute" top="40px" left="12px" zIndex={30} w="256px">
        <button
          type="button"
          onClick={() => setVersionsOpen((v) => !v)}
          title={(versionsOpen ? t("launcher.version.hide") : t("launcher.version.show")) as string}
          style={{
            width: "100%",
            background: "rgba(0,0,0,0.45)",
            backdropFilter: "blur(8px)",
            borderRadius: "12px",
            boxShadow: "0 10px 15px rgba(0,0,0,0.3)",
            border: "1px solid rgba(255,255,255,0.1)",
            padding: "8px 12px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            transition: "background 0.15s",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(0,0,0,0.55)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(0,0,0,0.45)"; }}
        >
          <Box display="flex" flexDir="column" textAlign="left">
            <Box fontSize="sm" fontWeight="semibold" letterSpacing="wide" color="white">
              {t("launcher.version.label")}:&nbsp;
              {selected ? selectedLabel : t("launcher.version.select")}
            </Box>
            <Box fontSize="10px" color="gray.100" fontFamily="mono">
              {versionType === "release"
                ? t("launcher.version.release")
                : t("launcher.version.preRelease")}
              {selected &&
                selected.build_index === latestVersion?.build_index &&
                ` (${t("launcher.version.latest")})`}
            </Box>
          </Box>
          <IconChevronDown
            size={18}
            style={{
              color: "rgba(255,255,255,0.8)",
              transition: "transform 0.3s",
              transform: versionsOpen ? "rotate(180deg)" : "rotate(0deg)",
            }}
          />
        </button>

        <Box
          mt={2}
          rounded="xl"
          border="1px solid rgba(255,255,255,0.1)"
          bg="rgba(0,0,0,0.45)"
          backdropFilter="blur(8px)"
          boxShadow="xl"
          overflow="hidden"
          transition="all 0.2s"
          style={{
            opacity: versionsOpen ? 1 : 0,
            transform: versionsOpen ? "translateY(0)" : "translateY(-4px)",
            pointerEvents: versionsOpen ? "auto" : "none",
          }}
        >
          <Box h="224px" p={3} display="flex" flexDir="column">
            <Box display="flex" gap={1} mb={3} bg="rgba(255,255,255,0.05)" rounded="lg" p={1}>
              <button
                type="button"
                onClick={() => setVersionType("release")}
                style={{
                  flex: 1,
                  fontSize: "0.75rem",
                  padding: "4px 8px",
                  borderRadius: "6px",
                  transition: "all 0.15s",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  border: "none",
                  background: versionType === "release"
                    ? "linear-gradient(to right, #0268D4, #02D4D4)"
                    : "transparent",
                  color: versionType === "release" ? "white" : "#d1d5db",
                  fontWeight: versionType === "release" ? 700 : 400,
                  boxShadow: versionType === "release" ? "0 1px 3px rgba(0,0,0,0.3)" : "none",
                }}
              >
                {t("launcher.version.release")}
              </button>
              <button
                type="button"
                onClick={() => setVersionType("pre-release")}
                style={{
                  flex: 1,
                  fontSize: "0.75rem",
                  padding: "4px 8px",
                  borderRadius: "6px",
                  transition: "all 0.15s",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  border: "none",
                  background: versionType === "pre-release"
                    ? "linear-gradient(to right, #0268D4, #02D4D4)"
                    : "transparent",
                  color: versionType === "pre-release" ? "white" : "#d1d5db",
                  fontWeight: versionType === "pre-release" ? 700 : 400,
                  boxShadow: versionType === "pre-release" ? "0 1px 3px rgba(0,0,0,0.3)" : "none",
                }}
              >
                {t("launcher.version.preRelease")}
              </button>
            </Box>

            <Box as="label" fontSize="11px" color="rgba(209,213,219,0.8)" mb={1}>
              {t("launcher.version.selectBuild")}
            </Box>
            <Box flex={1} overflowY="auto" pr={2}>
              {availableVersions.length === 0 ? (
                <Box color="gray.400" fontSize="xs" p={2}>
                  {offlineMode
                    ? t("launcher.version.noInstalledBuilds")
                    : t("common.loading")}
                </Box>
              ) : (
                availableVersions.map((v, idx) => {
                  const name = v.build_name?.trim() || `Build-${v.build_index}`;
                  const suffix = v.isLatest ? ` • ${t("launcher.version.latest")}` : "";
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
                    <Box
                      key={`${v.type}:${v.build_index}`}
                      display="flex"
                      alignItems="center"
                      justifyContent="space-between"
                      p={2}
                      rounded="md"
                      mb={1}
                      cursor={isLocked ? "not-allowed" : "pointer"}
                      color={isSelected ? "white" : "gray.200"}
                      bg={isSelected ? "rgba(37,99,235,0.4)" : "transparent"}
                      opacity={isLocked ? 0.4 : 1}
                      transition="all 0.15s"
                      _hover={isLocked ? {} : { color: "white", bg: "rgba(255,255,255,0.1)" }}
                      onClick={() => {
                        if (isLocked) {
                          alert(t("launcher.version.requiresBuild1"));
                          return;
                        }
                        setSelectedVersion(idx);
                        setVersionsOpen(false);
                      }}
                    >
                      <Box display="flex" flexDir="column">
                        <Box as="span" fontSize="xs">
                          {name}
                          {suffix ? (
                            <Box as="span" color="rgba(209,213,219,0.7)">{suffix}</Box>
                          ) : null}
                        </Box>
                        {v.build_index === 1 && !v.installed && !isCustom ? (
                          <Box as="span" fontSize="10px" color="rgba(209,213,219,0.7)">
                            {t("launcher.version.manualInstallRequired")}
                          </Box>
                        ) : null}
                      </Box>

                      {v.installed && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isRunningBuild) return;
                            void deleteVersion(v);
                          }}
                          disabled={isRunningBuild}
                          title={
                            (isRunningBuild
                              ? t("launcher.version.cannotDeleteRunning")
                              : t("launcher.version.delete", { name })) as string
                          }
                          style={{
                            marginLeft: "8px",
                            background: "none",
                            border: "none",
                            cursor: isRunningBuild ? "not-allowed" : "pointer",
                            opacity: isRunningBuild ? 0.6 : 1,
                            padding: 0,
                            color: "#d1d5db",
                            lineHeight: 1,
                          }}
                          onMouseEnter={(e) => { if (!isRunningBuild) (e.currentTarget as HTMLButtonElement).style.color = "#f87171"; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#d1d5db"; }}
                        >
                          <IconTrash size={16} />
                        </button>
                      )}
                    </Box>
                  );
                })
              )}
            </Box>

            {updateAvailable && !updateDismissed && versionType === "release" ? (
              <Box mt={2} fontSize="11px" color="blue.200" opacity={0.9}>
                {t("launcher.updates.available")}
              </Box>
            ) : null}
          </Box>
        </Box>
      </Box>

      {/* Top right area */}
      <Box position="absolute" top="44px" right="12px" zIndex={30} display="flex" flexDir="column" alignItems="flex-end" gap={2}>
        <Box display="flex" alignItems="center" justifyContent="flex-end" gap={2}>
          {!offlineMode ? (
            <button
              type="button"
              className="btn-launcher-nav"
              title={t("launcher.buttons.wiki") as string}
              onClick={() => setWikiOpen(true)}
            >
              <IconBook size={18} style={{ color: "white" }} />
              {t("launcher.buttons.wiki")}
            </button>
          ) : null}

          {!offlineMode ? (
            <button
              type="button"
              className="btn-launcher-nav"
              title={t("launcher.buttons.servers") as string}
              onClick={() => setServersOpen(true)}
            >
              <IconServer size={18} style={{ color: "white" }} />
              {t("launcher.buttons.servers")}
            </button>
          ) : null}

          <Box position="relative" ref={hostServerMenuRef}>
            <button
              type="button"
              className={`btn-launcher-nav${hostServerRunning ? " btn-launcher-nav--running" : ""}`}
              title={t("launcher.buttons.hostServer") as string}
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
              <IconServerCog size={18} style={{ color: "white" }} />
              {t("launcher.buttons.hostServer")}
            </button>

            {hostServerMenuOpen ? (
              <Box
                position="absolute"
                top="100%"
                right={0}
                mt={2}
                w="420px"
                rounded="xl"
                border="1px solid rgba(255,255,255,0.1)"
                bg="rgba(0,0,0,0.55)"
                backdropFilter="blur(8px)"
                boxShadow="2xl"
                p={3}
              >
                {hostServerStage === "root" ? (
                  <>
                    <Box rounded="lg" border="1px solid #2a3146" bg="rgba(31,37,56,0.7)" p={3}>
                      <button
                        type="button"
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
                        style={{
                          display: "block",
                          margin: "0 auto",
                          padding: "8px 16px",
                          borderRadius: "8px",
                          fontWeight: 600,
                          border: "1px solid #2a3146",
                          color: "#d1d5db",
                          background: "transparent",
                          cursor: "pointer",
                          transition: "background 0.15s",
                          fontFamily: "inherit",
                        }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.05)"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
                      >
                        {t("hostServerModal.localHost.button")}
                      </button>
                    </Box>

                    <Box mt={3} position="relative" overflow="hidden" rounded="lg" border="1px solid rgba(96,165,250,0.3)" bg="rgba(31,37,56,0.7)" p={3} className="animate-softGlowStrong">
                      <Box
                        aria-hidden="true"
                        pointerEvents="none"
                        position="absolute"
                        inset={0}
                        className="bg-chroma-animated animate-chroma-shift animate-hue-slow"
                        style={{ background: "linear-gradient(to right, rgba(59,130,246,0.18), rgba(34,211,238,0.1), rgba(59,130,246,0.18))" }}
                      />
                      <Box position="relative" zIndex={1}>
                        <Box
                          fontSize="sm"
                          fontWeight="extrabold"
                          letterSpacing="wider"
                          textTransform="uppercase"
                          textAlign="center"
                          className="animate-chroma-shift bg-chroma-animated"
                          style={{ background: "linear-gradient(to right, #3b82f6, #22d3ee, #3b82f6)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}
                        >
                          {t("hostServerModal.proHosting.section")} (24/7)
                        </Box>
                        <button
                          type="button"
                          onClick={() => void window.config.openExternal("https://www.hycloudhosting.com/gameservers/hytale?ref=butterlauncher")}
                          style={{
                            display: "block",
                            margin: "12px auto 0",
                            padding: "8px 20px",
                            borderRadius: "8px",
                            fontWeight: 700,
                            color: "white",
                            background: "linear-gradient(to right, #3b82f6, #22d3ee)",
                            border: "none",
                            cursor: "pointer",
                            boxShadow: "0 4px 6px rgba(0,0,0,0.3)",
                            transition: "all 0.15s",
                            fontFamily: "inherit",
                          }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "linear-gradient(to right, #2563eb, #06b6d4)"; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "linear-gradient(to right, #3b82f6, #22d3ee)"; }}
                        >
                          {t("hostServerModal.proHosting.button")}
                        </button>
                      </Box>
                    </Box>
                  </>
                ) : (
                  <Box rounded="lg" border="1px solid #2a3146" bg="rgba(31,37,56,0.7)" p={3}>
                    <Box display="flex" alignItems="center" justifyContent="space-between" gap={3}>
                      <Box fontSize="xs" fontWeight="semibold" color="gray.200">
                        {t("hostServerModal.panel.authMode.label")}
                      </Box>
                      <select
                        value={hostServerAuthMode}
                        onChange={(e) => setHostServerAuthMode(e.target.value as "offline" | "authenticated" | "insecure")}
                        style={{
                          padding: "8px 12px",
                          borderRadius: "8px",
                          background: "rgba(20,24,36,0.8)",
                          border: "1px solid #2a3146",
                          color: "white",
                          fontSize: "0.875rem",
                          outline: "none",
                          fontFamily: "inherit",
                          cursor: "pointer",
                        }}
                      >
                        <option value="offline">{t("hostServerModal.panel.authMode.offline")}</option>
                        <option value="authenticated">{t("hostServerModal.panel.authMode.authenticated")}</option>
                        <option value="insecure">{t("hostServerModal.panel.authMode.insecure")}</option>
                      </select>
                    </Box>

                    <button
                      type="button"
                      onClick={() => setHostServerAdvancedOpen((v) => !v)}
                      style={{
                        marginTop: "12px",
                        width: "100%",
                        padding: "8px 12px",
                        borderRadius: "8px",
                        border: hostServerAdvancedOpen ? "1px solid rgba(96,165,250,0.6)" : "1px solid #2a3146",
                        background: hostServerAdvancedOpen ? "rgba(59,130,246,0.15)" : "#23293a",
                        color: hostServerAdvancedOpen ? "#bfdbfe" : "white",
                        cursor: "pointer",
                        fontSize: "0.875rem",
                        fontWeight: 600,
                        transition: "all 0.15s",
                        fontFamily: "inherit",
                      }}
                      onMouseEnter={(e) => { if (!hostServerAdvancedOpen) (e.currentTarget as HTMLButtonElement).style.background = "#2f3650"; }}
                      onMouseLeave={(e) => { if (!hostServerAdvancedOpen) (e.currentTarget as HTMLButtonElement).style.background = "#23293a"; }}
                    >
                      {t("hostServerModal.panel.advanced.toggle")}
                    </button>

                    {hostServerAdvancedOpen ? (
                      <Box mt={3} display="flex" flexDir="column" gap={2}>
                        <button
                          type="button"
                          onClick={async () => {
                            if (!isSelectedBuildInstalled()) { showSelectedBuildNotInstalledError(); return; }
                            if (!gameDir || !selected) return;
                            try { await window.ipcRenderer.invoke("host-server:open-current-folder", gameDir, selected); } catch {}
                          }}
                          title={t("hostServerModal.panel.advanced.openServerFolder") as string}
                          style={{
                            width: "100%",
                            padding: "8px 12px",
                            borderRadius: "8px",
                            border: "1px solid #2a3146",
                            background: "transparent",
                            color: "#d1d5db",
                            cursor: "pointer",
                            fontSize: "0.875rem",
                            fontWeight: 600,
                            transition: "background 0.15s",
                            fontFamily: "inherit",
                          }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.05)"; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
                        >
                          {t("hostServerModal.panel.advanced.openServerFolder")}
                        </button>

                        {/* RAM */}
                        <Box display="flex" alignItems="center" gap={2} minW={0}>
                          <input type="checkbox" style={{ width: 16, height: 16 }} checked={advRamEnabled} onChange={(e) => setAdvRamEnabled(e.target.checked)} />
                          <Box w="112px" flexShrink={0} fontSize="xs" fontWeight="semibold" color="gray.200">
                            {t("hostServerModal.panel.advanced.ram")}
                          </Box>
                          <Box flex={1} minW={0} display="flex" alignItems="center" gap={1}>
                            <input
                              value={advRamMin}
                              onChange={(e) => setAdvRamMin(String(e.target.value ?? "").replace(/[^0-9]/g, ""))}
                              inputMode="numeric"
                              placeholder={t("hostServerModal.panel.advanced.min") as string}
                              disabled={!advRamEnabled}
                              style={{
                                width: "100%", minWidth: 0, padding: "8px 12px", borderRadius: "8px",
                                background: "rgba(20,24,36,0.8)", border: "1px solid #2a3146",
                                color: "white", fontSize: "0.875rem", outline: "none",
                                opacity: advRamEnabled ? 1 : 0.6, fontFamily: "inherit",
                              }}
                            />
                            <Box fontSize="sm" fontWeight="bold" color="gray.200" opacity={advRamEnabled ? 1 : 0.6}>G</Box>
                          </Box>
                          <Box flex={1} minW={0} display="flex" alignItems="center" gap={1}>
                            <input
                              value={advRamMax}
                              onChange={(e) => setAdvRamMax(String(e.target.value ?? "").replace(/[^0-9]/g, ""))}
                              inputMode="numeric"
                              placeholder={t("hostServerModal.panel.advanced.max") as string}
                              disabled={!advRamEnabled}
                              style={{
                                width: "100%", minWidth: 0, padding: "8px 12px", borderRadius: "8px",
                                background: "rgba(20,24,36,0.8)", border: "1px solid #2a3146",
                                color: "white", fontSize: "0.875rem", outline: "none",
                                opacity: advRamEnabled ? 1 : 0.6, fontFamily: "inherit",
                              }}
                            />
                            <Box fontSize="sm" fontWeight="bold" color="gray.200" opacity={advRamEnabled ? 1 : 0.6}>G</Box>
                          </Box>
                        </Box>

                        {/* No AOT */}
                        <Box display="flex" alignItems="center" gap={2}>
                          <input type="checkbox" style={{ width: 16, height: 16 }} checked={advNoAotEnabled} onChange={(e) => setAdvNoAotEnabled(e.target.checked)} />
                          <Box fontSize="xs" fontWeight="semibold" color="gray.200">
                            {t("hostServerModal.panel.advanced.noAot")}
                          </Box>
                        </Box>

                        {/* Custom JVM Args */}
                        <Box display="flex" alignItems="center" gap={2} minW={0}>
                          <Box w="112px" flexShrink={0} fontSize="xs" fontWeight="semibold" color="gray.200">
                            {t("hostServerModal.panel.advanced.customJvmArgs")}
                          </Box>
                          <input
                            value={advCustomJvmArgs}
                            onChange={(e) => setAdvCustomJvmArgs(e.target.value)}
                            placeholder={t("hostServerModal.panel.advanced.customJvmArgsExample") as string}
                            style={{
                              flex: 1, minWidth: 0, padding: "8px 12px", borderRadius: "8px",
                              background: "rgba(20,24,36,0.8)", border: "1px solid #2a3146",
                              color: "white", fontSize: "0.875rem", outline: "none", fontFamily: "inherit",
                            }}
                          />
                        </Box>

                        {/* Custom Assets */}
                        <Box display="flex" alignItems="center" gap={2}>
                          <input type="checkbox" style={{ width: 16, height: 16 }} checked={advAssetsEnabled} onChange={(e) => setAdvAssetsEnabled(e.target.checked)} />
                          <Box w="112px" fontSize="xs" fontWeight="semibold" color="gray.200">
                            {t("hostServerModal.panel.advanced.customAssets")}
                          </Box>
                          <input
                            value={advAssetsPath}
                            onChange={(e) => setAdvAssetsPath(e.target.value)}
                            disabled={!advAssetsEnabled}
                            style={{
                              flex: 1, padding: "8px 12px", borderRadius: "8px",
                              background: "rgba(20,24,36,0.8)", border: "1px solid #2a3146",
                              color: "white", fontSize: "0.875rem", outline: "none",
                              opacity: advAssetsEnabled ? 1 : 0.6, fontFamily: "inherit",
                            }}
                          />
                          <button
                            type="button"
                            disabled={!advAssetsEnabled}
                            onClick={async () => {
                              if (!advAssetsEnabled) return;
                              try {
                                const res = await window.config.pickFile({ title: "Select .zip", extensions: ["zip"] });
                                if (res?.ok && res.path) setAdvAssetsPath(res.path);
                              } catch {}
                            }}
                            style={{
                              padding: "8px 12px", borderRadius: "8px", border: "1px solid #2a3146",
                              background: "transparent", color: "#d1d5db", cursor: advAssetsEnabled ? "pointer" : "not-allowed",
                              opacity: advAssetsEnabled ? 1 : 0.6, fontSize: "0.875rem", transition: "background 0.15s", fontFamily: "inherit",
                            }}
                          >
                            {t("hostServerModal.panel.advanced.chooseFile")}
                          </button>
                        </Box>

                        {/* Universe */}
                        <Box display="flex" alignItems="center" gap={2}>
                          <input type="checkbox" style={{ width: 16, height: 16 }} checked={advUniverseEnabled} onChange={(e) => setAdvUniverseEnabled(e.target.checked)} />
                          <Box w="112px" fontSize="xs" fontWeight="semibold" color="gray.200">
                            {t("hostServerModal.panel.advanced.universe")}
                          </Box>
                          <input
                            value={advUniversePath}
                            onChange={(e) => setAdvUniversePath(e.target.value)}
                            disabled={!advUniverseEnabled}
                            style={{
                              flex: 1, padding: "8px 12px", borderRadius: "8px",
                              background: "rgba(20,24,36,0.8)", border: "1px solid #2a3146",
                              color: "white", fontSize: "0.875rem", outline: "none",
                              opacity: advUniverseEnabled ? 1 : 0.6, fontFamily: "inherit",
                            }}
                          />
                          <button
                            type="button"
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
                              } catch {}
                            }}
                            style={{
                              padding: "8px 12px", borderRadius: "8px", border: "1px solid #2a3146",
                              background: "transparent", color: "#d1d5db", cursor: advUniverseEnabled ? "pointer" : "not-allowed",
                              opacity: advUniverseEnabled ? 1 : 0.6, fontSize: "0.875rem", transition: "background 0.15s", fontFamily: "inherit",
                            }}
                          >
                            {t("hostServerModal.panel.advanced.chooseFolder")}
                          </button>
                        </Box>

                        {/* Mods */}
                        <Box display="flex" alignItems="center" gap={2}>
                          <input type="checkbox" style={{ width: 16, height: 16 }} checked={advModsEnabled} onChange={(e) => setAdvModsEnabled(e.target.checked)} />
                          <Box w="112px" fontSize="xs" fontWeight="semibold" color="gray.200">
                            {t("hostServerModal.panel.advanced.mods")}
                          </Box>
                          <input
                            value={advModsPath}
                            onChange={(e) => setAdvModsPath(e.target.value)}
                            disabled={!advModsEnabled}
                            style={{
                              flex: 1, padding: "8px 12px", borderRadius: "8px",
                              background: "rgba(20,24,36,0.8)", border: "1px solid #2a3146",
                              color: "white", fontSize: "0.875rem", outline: "none",
                              opacity: advModsEnabled ? 1 : 0.6, fontFamily: "inherit",
                            }}
                          />
                          <button
                            type="button"
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
                              } catch {}
                            }}
                            style={{
                              padding: "8px 12px", borderRadius: "8px", border: "1px solid #2a3146",
                              background: "transparent", color: "#d1d5db", cursor: advModsEnabled ? "pointer" : "not-allowed",
                              opacity: advModsEnabled ? 1 : 0.6, fontSize: "0.875rem", transition: "background 0.15s", fontFamily: "inherit",
                            }}
                          >
                            {t("hostServerModal.panel.advanced.chooseFolder")}
                          </button>
                        </Box>

                        {/* Early Plugins */}
                        <Box display="flex" alignItems="center" gap={2}>
                          <input type="checkbox" style={{ width: 16, height: 16 }} checked={advEarlyPluginsEnabled} onChange={(e) => setAdvEarlyPluginsEnabled(e.target.checked)} />
                          <Box w="112px" fontSize="xs" fontWeight="semibold" color="gray.200">
                            {t("hostServerModal.panel.advanced.earlyPlugins")}
                          </Box>
                          <input
                            value={advEarlyPluginsPath}
                            onChange={(e) => setAdvEarlyPluginsPath(e.target.value)}
                            disabled={!advEarlyPluginsEnabled}
                            style={{
                              flex: 1, padding: "8px 12px", borderRadius: "8px",
                              background: "rgba(20,24,36,0.8)", border: "1px solid #2a3146",
                              color: "white", fontSize: "0.875rem", outline: "none",
                              opacity: advEarlyPluginsEnabled ? 1 : 0.6, fontFamily: "inherit",
                            }}
                          />
                          <button
                            type="button"
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
                              } catch {}
                            }}
                            style={{
                              padding: "8px 12px", borderRadius: "8px", border: "1px solid #2a3146",
                              background: "transparent", color: "#d1d5db", cursor: advEarlyPluginsEnabled ? "pointer" : "not-allowed",
                              opacity: advEarlyPluginsEnabled ? 1 : 0.6, fontSize: "0.875rem", transition: "background 0.15s", fontFamily: "inherit",
                            }}
                          >
                            {t("hostServerModal.panel.advanced.chooseFolder")}
                          </button>
                        </Box>
                      </Box>
                    ) : null}

                    <Box mt={3} display="flex" alignItems="center" justifyContent="space-between" gap={2}>
                      <button
                        type="button"
                        onClick={() => setHostServerConsoleOpen(true)}
                        style={{
                          padding: "8px 12px", borderRadius: "8px", border: "1px solid #2a3146",
                          background: "transparent", color: "#d1d5db", cursor: "pointer",
                          fontSize: "0.875rem", fontWeight: 600, transition: "background 0.15s", fontFamily: "inherit",
                        }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.05)"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
                      >
                        {t("hostServerModal.panel.actions.showConsole")}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          if (!hostServerRunning) {
                            if (!isSelectedBuildInstalled()) { showSelectedBuildNotInstalledError(); return; }
                            const version = availableVersions?.[selectedVersion] ?? null;
                            if (!version || !gameDir) { alert(t("hostServerModal.errors.serverStartFailed")); return; }

                            const assetsZipPath = (() => {
                              if (!advAssetsEnabled) return null;
                              const p = advAssetsPath.trim();
                              if (!p) { alert(t("hostServerModal.errors.customAssetsMissing")); return null; }
                              return p;
                            })();
                            if (advAssetsEnabled && !assetsZipPath) return;

                            let ramMinGb: number | null = null;
                            let ramMaxGb: number | null = null;
                            if (advRamEnabled) {
                              const min = Number.parseInt(advRamMin, 10);
                              const max = Number.parseInt(advRamMax, 10);
                              if (!Number.isFinite(min) || !Number.isFinite(max)) { alert(t("hostServerModal.errors.ramMissing")); return; }
                              if (min <= 0 || max <= 0) { alert(t("hostServerModal.errors.ramInvalid")); return; }
                              if (max < min) { alert(t("hostServerModal.errors.ramRange")); return; }
                              ramMinGb = min; ramMaxGb = max;
                            }

                            pushHostLog(`[Launcher] Starting server...`);
                            void window.config
                              .hostServerStart(gameDir, version, {
                                assetsZipPath, authMode: hostServerAuthMode, noAot: advNoAotEnabled,
                                ramMinGb, ramMaxGb, customJvmArgs: advCustomJvmArgs.trim() || null,
                              })
                              .then((res) => {
                                if (res?.ok) return;
                                const code = res?.error?.code;
                                if (code === "JAVA_NOT_FOUND" || code === "JAVA_TOO_OLD" || code === "JAVA_CHECK_FAILED") {
                                  if (code === "JAVA_TOO_OLD") {
                                    const found = (res as any)?.error?.details?.major ?? (res as any)?.error?.details?.found ?? "?";
                                    alert(t("hostServerModal.errors.javaTooOld", { found }));
                                  } else {
                                    alert(t("hostServerModal.errors.java25Required"));
                                  }
                                  const raw = (res as any)?.error?.details?.raw;
                                  const execPath = (res as any)?.error?.details?.execPath;
                                  if (typeof execPath === "string" && execPath.trim()) pushHostLog(`[Launcher] Java exec: ${execPath}`);
                                  if (typeof raw === "string" && raw.trim()) pushHostLog(`[Launcher] java -version: ${raw}`);
                                  return;
                                }
                                if (code === "ASSETS_ZIP_MISSING") {
                                  const p = (res as any)?.error?.details?.assetsPath;
                                  alert(t("hostServerModal.errors.assetsZipMissing", { path: typeof p === "string" ? p : "" }));
                                  return;
                                }
                                alert(t("hostServerModal.errors.serverStartFailed"));
                                const msg = res?.error?.message;
                                if (typeof msg === "string" && msg.trim()) pushHostLog(`[Launcher] Start failed: ${msg}`);
                              })
                              .catch(() => alert(t("hostServerModal.errors.serverStartFailed")));
                          } else {
                            void window.config.hostServerStop().then((r) => {
                              if (!r?.ok) { alert(t("hostServerModal.errors.serverStopFailed")); return; }
                              pushHostLog(`[Launcher] Stopping server...`);
                            });
                          }
                        }}
                        style={{
                          padding: "8px 16px", borderRadius: "8px",
                          color: "white", fontWeight: 800, transition: "all 0.15s",
                          boxShadow: "0 4px 6px rgba(0,0,0,0.3)",
                          border: "1px solid rgba(255,255,255,0.1)",
                          background: hostServerRunning ? "#dc2626" : "#16a34a",
                          cursor: "pointer",
                          fontFamily: "inherit",
                        }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = hostServerRunning ? "#b91c1c" : "#15803d"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = hostServerRunning ? "#dc2626" : "#16a34a"; }}
                      >
                        {hostServerRunning
                          ? t("hostServerModal.panel.actions.stopServer")
                          : t("hostServerModal.panel.actions.startServer")}
                      </button>
                    </Box>
                  </Box>
                )}
              </Box>
            ) : null}
          </Box>

          <button
            type="button"
            className="btn-launcher-nav"
            title={t("launcher.buttons.mods") as string}
            onClick={() => setModsOpen(true)}
          >
            <IconPuzzle size={18} style={{ color: "white" }} />
            {t("launcher.buttons.mods")}
          </button>

          {!offlineMode ? (
            <Box position="relative" ref={friendsMenuRef}>
              <button
                type="button"
                className={`btn-launcher-nav${friendsHasUnread && !friendsMenuOpen ? " btn-launcher-nav--unread" : ""}${friendsHasUnread ? " btn-launcher-nav--friends-unread" : ""}`}
                title={t("launcher.buttons.friends") as string}
                onClick={() => setFriendsMenuOpen((v) => !v)}
              >
                <IconUsers size={18} style={{ color: "white" }} />
                {t("launcher.buttons.friends")}
              </button>

              <Box
                position="absolute"
                top="100%"
                right={0}
                mt={2}
                w="30vw"
                maxW="560px"
                style={{
                  minWidth: "min(360px, calc(100vw - 24px))",
                  maxWidth: "calc(100vw - 24px)",
                  pointerEvents: friendsMenuOpen ? "auto" : "none",
                  visibility: friendsMenuOpen ? "visible" : "hidden",
                }}
                className={friendsMenuOpen ? "animate-friendsMenuIn" : ""}
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
              </Box>
            </Box>
          ) : null}

          <button
            type="button"
            title={t("launcher.buttons.settings") as string}
            onClick={() => setSettingsOpen(true)}
            style={{
              background: "rgba(35,41,58,0.8)",
              transition: "background 0.15s",
              padding: "8px",
              borderRadius: "50%",
              boxShadow: "0 4px 6px rgba(0,0,0,0.3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 40,
              height: 40,
              border: "none",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#3b82f6"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(35,41,58,0.8)"; }}
          >
            <img src={settingsIcon} alt="Settings" width={22} height={22} style={{ filter: "invert(1)" }} />
          </button>
        </Box>

        {/* Discord button */}
        <button
          type="button"
          className="animate-softGlowStrong"
          title="Discord"
          onClick={() => void window.config.openExternal("https://discord.com/invite/fZgjHwv5pA")}
          style={{
            position: "relative",
            overflow: "hidden",
            padding: "8px",
            borderRadius: "50%",
            boxShadow: "0 0 16px rgba(88,101,242,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "1px solid rgba(255,255,255,0.1)",
            background: "rgba(0,0,0,0.35)",
            backdropFilter: "blur(8px)",
            transition: "all 0.2s ease-out",
            width: 40,
            height: 40,
            cursor: "pointer",
          }}
          onMouseEnter={(e) => {
            const btn = e.currentTarget as HTMLButtonElement;
            btn.style.border = "1px solid rgba(255,255,255,0.2)";
            btn.style.outline = "2px solid rgba(88,101,242,0.55)";
            btn.style.boxShadow = "0 0 26px rgba(88,101,242,0.95)";
            btn.style.transform = "translateY(-2px)";
            const overlay = btn.querySelector(".discord-glow") as HTMLElement | null;
            if (overlay) overlay.style.opacity = "1";
          }}
          onMouseLeave={(e) => {
            const btn = e.currentTarget as HTMLButtonElement;
            btn.style.border = "1px solid rgba(255,255,255,0.1)";
            btn.style.outline = "none";
            btn.style.boxShadow = "0 0 16px rgba(88,101,242,0.35)";
            btn.style.transform = "none";
            const overlay = btn.querySelector(".discord-glow") as HTMLElement | null;
            if (overlay) overlay.style.opacity = "0.7";
          }}
        >
          <span
            aria-hidden="true"
            className="discord-glow bg-chroma-animated animate-chroma-shift animate-hue-slow"
            style={{
              pointerEvents: "none",
              position: "absolute",
              inset: 0,
              background: "linear-gradient(to right, rgba(88,101,242,0.65), rgba(59,130,246,0.4), rgba(88,101,242,0.65))",
              opacity: 0.7,
              transition: "opacity 0.2s",
            }}
          />
          <img
            src={DiscordLogo}
            alt="Discord"
            style={{
              position: "relative",
              zIndex: 1,
              width: 20,
              height: 20,
              filter: "drop-shadow(0 0 10px rgba(88,101,242,0.75))",
            }}
          />
        </button>

        {/* Web button */}
        <button
          type="button"
          className="animate-softGlowStrong"
          title="Web"
          onClick={() => void window.config.openExternal("https://butterlauncher.tech/")}
          style={{
            position: "relative",
            overflow: "hidden",
            padding: "8px",
            borderRadius: "50%",
            boxShadow: "0 0 14px rgba(2,212,212,0.22)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "1px solid rgba(255,255,255,0.1)",
            background: "rgba(0,0,0,0.35)",
            backdropFilter: "blur(8px)",
            transition: "all 0.2s",
            width: 40,
            height: 40,
            cursor: "pointer",
          }}
          onMouseEnter={(e) => {
            const btn = e.currentTarget as HTMLButtonElement;
            btn.style.border = "1px solid rgba(96,165,250,0.7)";
            btn.style.outline = "2px solid rgba(34,211,238,0.35)";
            btn.style.boxShadow = "0 0 26px rgba(2,212,212,0.9)";
            const overlay = btn.querySelector(".web-glow") as HTMLElement | null;
            if (overlay) overlay.style.opacity = "1";
          }}
          onMouseLeave={(e) => {
            const btn = e.currentTarget as HTMLButtonElement;
            btn.style.border = "1px solid rgba(255,255,255,0.1)";
            btn.style.outline = "none";
            btn.style.boxShadow = "0 0 14px rgba(2,212,212,0.22)";
            const overlay = btn.querySelector(".web-glow") as HTMLElement | null;
            if (overlay) overlay.style.opacity = "0.75";
          }}
        >
          <span
            aria-hidden="true"
            className="web-glow bg-chroma-animated animate-chroma-shift animate-hue-slow"
            style={{
              pointerEvents: "none",
              position: "absolute",
              inset: 0,
              background: "linear-gradient(to right, rgba(59,130,246,0.55), rgba(34,211,238,0.45), rgba(59,130,246,0.55))",
              opacity: 0.75,
              transition: "opacity 0.2s",
            }}
          />
          <IconWorld size={20} style={{ position: "relative", zIndex: 1, color: "white" }} />
        </button>

        {/* Patreon button */}
        <button
          type="button"
          className="animate-softGlowStrong"
          aria-label="Patreon"
          title={t("launcher.buttons.supportProject") as string}
          onClick={() => void window.config.openExternal("https://www.patreon.com/c/ButterLauncher")}
          style={{
            position: "relative",
            overflow: "hidden",
            borderRadius: "50%",
            boxShadow: "var(--shadow-xl)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "1px solid transparent",
            background: "rgba(0,0,0,0.35)",
            backdropFilter: "blur(8px)",
            transition: "all 0.2s ease-out",
            width: 40,
            height: 40,
            cursor: "pointer",
          }}
          onMouseEnter={(e) => {
            const btn = e.currentTarget as HTMLButtonElement;
            btn.style.border = "1px solid rgba(255,255,255,0.7)";
            btn.style.outline = "2px solid rgba(255,255,255,0.45)";
            btn.style.boxShadow = "0 20px 25px rgba(0,0,0,0.3)";
            btn.style.transform = "translateY(-2px)";
          }}
          onMouseLeave={(e) => {
            const btn = e.currentTarget as HTMLButtonElement;
            btn.style.border = "1px solid transparent";
            btn.style.outline = "none";
            btn.style.boxShadow = "var(--shadow-xl)";
            btn.style.transform = "none";
          }}
        >
          <img
            src={PatreonLogo}
            alt="Patreon"
            draggable={false}
            style={{ position: "relative", zIndex: 1, width: "100%", height: "100%", objectFit: "cover" }}
          />
        </button>
      </Box>

      {/* Logo */}
      <Box display="flex" alignItems="flex-start" justifyContent="space-between" p={6}>
        <img
          src={butterLogo}
          alt="butter Logo"
          draggable={false}
          style={{ width: "auto", height: "100%", maxHeight: "384px", filter: "drop-shadow(0 4px 6px rgba(0,0,0,0.3))", userSelect: "none" }}
        />
      </Box>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} onLogout={handleLogout} />
      <ModsModal open={modsOpen} onClose={() => setModsOpen(false)} />
      <ServersModal open={serversOpen} onClose={() => setServersOpen(false)} />
      <WikiModal
        open={wikiOpen}
        initialUrl={wikiLastUrl}
        onClose={(lastUrl) => {
          if (typeof lastUrl === "string" && lastUrl.trim()) setWikiLastUrl(lastUrl);
          setWikiOpen(false);
        }}
      />
      <MatchaTermsModal open={matchaTermsOpen} onClose={() => setMatchaTermsOpen(false)} />
      <ConfirmModal
        open={closeDownloadConfirmOpen}
        title={t("common.close")}
        message={t("common.closeDownloadWarning")}
        cancelText={t("common.cancel")}
        confirmText={t("common.confirm")}
        onCancel={() => {
          setCloseDownloadConfirmOpen(false);
          try { window.ipcRenderer.send("app:close-download:cancel"); } catch {}
        }}
        onConfirm={() => {
          setCloseDownloadConfirmOpen(false);
          try { window.ipcRenderer.send("app:cancel-downloads-and-quit"); } catch {}
        }}
      />
      <ConfirmModal
        open={hostServerWarningOpen}
        title={t("hostServerModal.warning.title")}
        message={`${t("hostServerModal.localHost.note")}\n\n${t("hostServerModal.warning.versionLine", { version: getSelectedVersionLabel() })}`}
        cancelText={t("hostServerModal.warning.dedicated")}
        confirmText={t("hostServerModal.warning.confirm")}
        onCancel={() => {
          setHostServerWarningOpen(false);
          void window.config.openExternal("https://www.hycloudhosting.com/gameservers/hytale?ref=butterlauncher");
        }}
        onConfirm={() => {
          setHostServerWarningOpen(false);
          if (!isSelectedBuildInstalled()) { showSelectedBuildNotInstalledError(); return; }
          setHostServerStage("local");
          setHostServerMenuOpen(true);
        }}
      />
      <ConfirmModal
        open={folderSyncWarningOpen}
        title={t("hostServerModal.warning.folderSyncTitle")}
        message={t("hostServerModal.warning.folderSyncMessage", { target: pendingFolderSync?.kind ?? "" })}
        cancelText={t("common.cancel")}
        confirmText={t("common.confirm")}
        onCancel={() => { setFolderSyncWarningOpen(false); setPendingFolderSync(null); }}
        onConfirm={() => {
          setFolderSyncWarningOpen(false);
          const pending = pendingFolderSync;
          setPendingFolderSync(null);
          if (!pending) return;
          if (hostServerRunning) { alert(t("hostServerModal.errors.folderSyncRunning")); return; }
          if (!isSelectedBuildInstalled()) { showSelectedBuildNotInstalledError(); return; }
          const version = availableVersions?.[selectedVersion] ?? null;
          if (!version || !gameDir) { alert(t("hostServerModal.errors.folderSyncFailed")); return; }
          void window.config
            .hostServerSyncFolder(gameDir, version, pending.kind, pending.sourceDir)
            .then((r) => {
              if (r?.ok) { pushHostLog(`[Launcher] Synced ${pending.kind} into Server/${pending.kind}`); return; }
              const code = (r as any)?.error?.code;
              if (code === "RUNNING") { alert(t("hostServerModal.errors.folderSyncRunning")); return; }
              if (code === "SOURCE_MISSING") {
                const p = (r as any)?.error?.details?.sourceDir ?? "";
                alert(t("hostServerModal.errors.folderSourceMissing", { path: String(p) }));
                return;
              }
              alert(t("hostServerModal.errors.folderSyncFailed"));
              const msg = (r as any)?.error?.message;
              if (typeof msg === "string" && msg.trim()) pushHostLog(`[Launcher] Folder sync failed: ${msg}`);
            })
            .catch(() => alert(t("hostServerModal.errors.folderSyncFailed")));
        }}
      />
      <HostServerConsoleModal
        open={hostServerConsoleOpen}
        onClose={() => setHostServerConsoleOpen(false)}
        logs={hostServerLogs}
        onCommand={(cmd) => {
          void window.config.hostServerCommand(cmd).then((r) => {
            if (r?.ok) return;
            if (r?.error?.code === "NOT_RUNNING") { alert(t("hostServerModal.errors.serverNotRunning")); return; }
            alert(t("hostServerModal.errors.commandFailed"));
          });
        }}
      />

      {/* Bottom bar */}
      <Box
        w="full"
        px={6}
        py={4}
        bg="rgba(0,0,0,0.6)"
        backdropFilter="blur(8px)"
        display="flex"
        flexDir="row"
        alignItems="center"
        justifyContent="space-between"
        gap={6}
      >
        {installing || patchingOnline ? (
          <Box w="208px" h="64px" p={4} bg="rgba(255,255,255,0.1)" rounded="lg" boxShadow="inner" display="flex" alignItems="center" gap={2}>
            <ProgressBar progress={installing ? installProgress : patchProgress} />
            {installing && !patchingOnline && installProgress?.phase === "pwr-download" ? (
              <button
                type="button"
                title="Cancel download"
                disabled={cancelingBuildDownload}
                onClick={() => cancelBuildDownload()}
                style={{
                  width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center",
                  color: "rgba(255,255,255,0.9)", background: "transparent", border: "none",
                  borderRadius: "4px", cursor: cancelingBuildDownload ? "not-allowed" : "pointer",
                  opacity: cancelingBuildDownload ? 0.5 : 1,
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.1)"; (e.currentTarget as HTMLButtonElement).style.color = "white"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.9)"; }}
              >
                <IconX size={14} />
              </button>
            ) : null}
          </Box>
        ) : (
          <Box display="flex" flexDir="row" alignItems="center" gap={2}>
            {needsFixClient ? (
              <button
                onClick={fixClient}
                disabled={launching || gameLaunched}
                title={t("launcher.updates.fixClientTooltip") as string}
                style={{
                  minWidth: 208, background: "linear-gradient(to right, #0268D4, #02D4D4)",
                  color: "white", fontSize: "1.25rem", fontWeight: 700, padding: "12px 48px",
                  borderRadius: "8px", boxShadow: "0 4px 6px rgba(0,0,0,0.3)",
                  border: "none", cursor: launching || gameLaunched ? "not-allowed" : "pointer",
                  opacity: launching || gameLaunched ? 0.5 : 1,
                  transition: "transform 0.15s", fontFamily: "inherit",
                }}
                onMouseEnter={(e) => { if (!launching && !gameLaunched) (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.05)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)"; }}
              >
                {t("launcher.updates.fixClient")}
              </button>
            ) : showUpdateActions && latestRelease ? (
              <>
                {canSmartInstallLatest && isSelectedLatestRelease ? (
                  <button
                    className="animate-tinyGlow"
                    onClick={() => {
                      const latestIdx = availableVersions.findIndex((v) => v.type === "release" && v.build_index === latestRelease.build_index);
                      if (latestIdx !== -1) setSelectedVersion(latestIdx);
                      if (emergencyMode && !latestRelease.installed) { alert(t("launcher.errors.emergencyMode")); return; }
                      smartInstallGame(latestRelease, smartUpdate!.fromBuildIndex);
                    }}
                    disabled={launching || gameLaunched || checkingSmartUpdate}
                    title={(checkingSmartUpdate ? t("launcher.updates.smartInstallChecking") : t("launcher.updates.smartInstallTooltip")) as string}
                    style={{
                      minWidth: 208, background: "linear-gradient(to right, #0268D4, #02D4D4)",
                      color: "white", fontSize: "1.25rem", fontWeight: 700, padding: "12px 32px",
                      borderRadius: "8px", boxShadow: "0 4px 6px rgba(0,0,0,0.3)",
                      border: "none", cursor: launching || gameLaunched || checkingSmartUpdate ? "not-allowed" : "pointer",
                      opacity: launching || gameLaunched || checkingSmartUpdate ? 0.5 : 1,
                      transition: "transform 0.15s", fontFamily: "inherit",
                    }}
                    onMouseEnter={(e) => { if (!launching && !gameLaunched) (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.05)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)"; }}
                  >
                    {t("launcher.updates.smartInstall")}
                  </button>
                ) : (
                  <button
                    className="animate-tinyGlow"
                    onClick={() => {
                      const latestIdx = availableVersions.findIndex((v) => v.type === "release" && v.build_index === latestRelease.build_index);
                      if (latestIdx !== -1) setSelectedVersion(latestIdx);
                      if (canSmartUpdateFromSelected) { smartInstallGame(latestRelease, selected.build_index); return; }
                      if (smartUpdate) { smartInstallGame(latestRelease, smartUpdate.fromBuildIndex); return; }
                      installGame(latestRelease);
                    }}
                    disabled={launching || gameLaunched}
                    title={t("launcher.updates.update") as string}
                    style={{
                      minWidth: 208, background: "linear-gradient(to right, #0268D4, #02D4D4)",
                      color: "white", fontSize: "1.25rem", fontWeight: 700, padding: "12px 48px",
                      borderRadius: "8px", boxShadow: "0 4px 6px rgba(0,0,0,0.3)",
                      border: "none", cursor: launching || gameLaunched ? "not-allowed" : "pointer",
                      opacity: launching || gameLaunched ? 0.5 : 1,
                      transition: "transform 0.15s", fontFamily: "inherit",
                    }}
                    onMouseEnter={(e) => { if (!launching && !gameLaunched) (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.05)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)"; }}
                  >
                    {t("launcher.updates.update")}
                  </button>
                )}

                {canSmartInstallLatest && isSelectedLatestRelease ? (
                  <button
                    type="button"
                    onClick={() => {
                      const latestIdx = availableVersions.findIndex((v) => v.type === "release" && v.build_index === latestRelease.build_index);
                      if (latestIdx !== -1) setSelectedVersion(latestIdx);
                      if (emergencyMode && !latestRelease.installed) { alert(t("launcher.errors.emergencyMode")); return; }
                      installGame(latestRelease);
                    }}
                    disabled={launching || gameLaunched}
                    title={t("launcher.updates.installFullTooltip") as string}
                    style={{
                      minWidth: 160, background: "rgba(255,255,255,0.1)", color: "white",
                      fontSize: "0.875rem", fontWeight: 700, padding: "12px 24px",
                      borderRadius: "8px", boxShadow: "0 4px 6px rgba(0,0,0,0.3)",
                      border: "none", cursor: launching || gameLaunched ? "not-allowed" : "pointer",
                      opacity: launching || gameLaunched ? 0.5 : 1,
                      transition: "background 0.15s", fontFamily: "inherit",
                    }}
                    onMouseEnter={(e) => { if (!launching && !gameLaunched) (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.2)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.1)"; }}
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
                    className="animate-tinyGlow"
                    onClick={handleLaunch}
                    disabled={launching || gameLaunched}
                    style={{
                      minWidth: 208, background: "linear-gradient(to right, #0268D4, #02D4D4)",
                      color: "white", fontSize: "1.25rem", fontWeight: 700, padding: "12px 48px",
                      borderRadius: "8px", boxShadow: "0 4px 6px rgba(0,0,0,0.3)",
                      border: "none", cursor: launching || gameLaunched ? "not-allowed" : "pointer",
                      opacity: launching || gameLaunched ? 0.5 : 1,
                      transition: "transform 0.15s", fontFamily: "inherit",
                    }}
                    onMouseEnter={(e) => { if (!launching && !gameLaunched) (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.05)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)"; }}
                  >
                    {t("launcher.updates.install")}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        if (!gameDir) { alert("Game directory not set."); return; }
                        const picked = await window.config.pickFolder({
                          title: availableVersions[selectedVersion]?.type === "pre-release"
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
                        if (typeof src !== "string" || !src.trim()) return;
                        const channel = availableVersions[selectedVersion]?.type;
                        window.ipcRenderer.send("install-build1-manual", gameDir, src, channel);
                        void checkForUpdates("manual");
                      } catch {
                        alert(t("launcher.version.manualInstallRequired"));
                      }
                    }}
                    style={{
                      minWidth: 208, background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.9)",
                      fontSize: "0.875rem", fontWeight: 600, padding: "12px 24px",
                      borderRadius: "8px", boxShadow: "0 4px 6px rgba(0,0,0,0.3)",
                      border: "none", cursor: "pointer", textAlign: "center",
                      transition: "background 0.15s", fontFamily: "inherit",
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.2)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.1)"; }}
                  >
                    {t("launcher.version.manualInstallRequired")}
                  </button>
                )
              ) : (
                <button
                  className={!availableVersions[selectedVersion]?.installed ? "animate-tinyGlow" : ""}
                  onClick={handleLaunch}
                  disabled={launching || gameLaunched}
                  style={{
                    minWidth: 208, background: "linear-gradient(to right, #0268D4, #02D4D4)",
                    color: "white", fontSize: "1.25rem", fontWeight: 700, padding: "12px 48px",
                    borderRadius: "8px", boxShadow: "0 4px 6px rgba(0,0,0,0.3)",
                    border: "none", cursor: launching || gameLaunched ? "not-allowed" : "pointer",
                    opacity: launching || gameLaunched ? 0.5 : 1,
                    transition: "transform 0.15s", fontFamily: "inherit",
                  }}
                  onMouseEnter={(e) => { if (!launching && !gameLaunched) (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.05)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)"; }}
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
                title={t("launcher.updates.dismissForNow") as string}
                onClick={() => dismissUpdateForNow()}
                style={{
                  width: 40, height: 40, borderRadius: "8px", background: "rgba(255,255,255,0.1)",
                  color: "white", display: "flex", alignItems: "center", justifyContent: "center",
                  border: "none", cursor: "pointer", transition: "background 0.15s", fontFamily: "inherit",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.2)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.1)"; }}
              >
                X
              </button>
            )}

            {patchAvailable && !needsFixClient && !isPremium ? (
              <button
                type="button"
                disabled={launching || gameLaunched}
                onClick={() => {
                  if (onlinePatchEnabled && patchOutdated) { startOnlinePatch(); return; }
                  if (onlinePatchEnabled) { disableOnlinePatch(); return; }
                  setPatchConfirmOpen(true);
                }}
                title={(onlinePatchEnabled
                  ? patchOutdated ? t("launcher.onlinePatch.titleUpdate") : t("launcher.onlinePatch.titleDisable")
                  : t("launcher.onlinePatch.titleEnable")) as string}
                style={{
                  minWidth: 140, height: 52, borderRadius: "8px", padding: "0 16px",
                  fontSize: "0.875rem", fontWeight: 700,
                  boxShadow: "0 4px 6px rgba(0,0,0,0.3)",
                  border: "none", cursor: launching || gameLaunched ? "not-allowed" : "pointer",
                  opacity: launching || gameLaunched ? 0.5 : 1,
                  transition: "transform 0.15s",
                  background: onlinePatchEnabled ? "rgba(255,255,255,0.1)" : "linear-gradient(to right, #0268D4, #02D4D4)",
                  color: "white",
                  fontFamily: "inherit",
                }}
                onMouseEnter={(e) => { if (!launching && !gameLaunched) (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.05)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)"; }}
              >
                {onlinePatchEnabled
                  ? patchOutdated ? t("launcher.onlinePatch.btnUpdate") : t("launcher.onlinePatch.btnDisable")
                  : t("launcher.onlinePatch.btnEnable")}
              </button>
            ) : null}
          </Box>
        )}

        {/* News section */}
        <Box position="relative" display="flex" flexDir="column" alignItems="flex-end" gap={2}>
          <Box position="relative" display="flex" flexDir="row" gap={4}>
            {(newsItems.length ? newsItems : [{ title: t("launcher.news.loading"), content: "" }])
              .slice(0, 3)
              .map((item, idx) => {
                const hasContent = !!item.content?.trim();
                return (
                  <Box
                    key={`${idx}-${item.title}`}
                    tabIndex={hasContent ? 0 : -1}
                    onClick={hasContent ? () => setOpenNews(item) : undefined}
                    onKeyDown={(e) => hasContent && (e.key === "Enter" || e.key === " ") && setOpenNews(item)}
                    cursor={hasContent ? "pointer" : "default"}
                    w="160px"
                    h="80px"
                    rounded="lg"
                    display="flex"
                    flexDir="column"
                    alignItems="center"
                    textAlign="center"
                    p={2}
                    transition="all 0.2s ease-in-out"
                    userSelect="none"
                    boxShadow="inner"
                    bg={hasContent ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.05)"}
                    _hover={hasContent ? {
                      background: "linear-gradient(to right, #0268D4, #02D4D4)",
                      boxShadow: "0 0 18px rgba(2,104,212,0.85)",
                      transform: "translateY(-2px)",
                    } : {}}
                  >
                    <Box flex={1} w="full" display="flex" alignItems="center" justifyContent="center" pointerEvents="none">
                      <Box fontSize="xs" color="white" fontWeight="semibold" lineHeight="tight" style={{ overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" }}>
                        {item.title}
                      </Box>
                    </Box>
                    {hasContent ? (
                      <Box as="span" fontSize="10px" color="blue.200" fontWeight="semibold">
                        {t("launcher.news.showMore")}
                      </Box>
                    ) : (
                      <Box h="14px" />
                    )}
                  </Box>
                );
              })}

            {/* Hytale feed toggle */}
            <button
              type="button"
              title={(hytaleFeedOpen ? t("launcher.hytaleFeed.toggleHide") : t("launcher.hytaleFeed.toggleShow")) as string}
              onClick={() => setHytaleFeedOpen((v) => !v)}
              style={{
                position: "absolute",
                left: "50%",
                transform: "translateX(-50%)",
                top: "-60px",
                zIndex: 20,
                width: 36, height: 36, borderRadius: "50%",
                border: "1px solid rgba(255,255,255,0.1)",
                background: "linear-gradient(to bottom, rgba(0,0,0,0.6), rgba(0,0,0,0.4))",
                backdropFilter: "blur(20px)",
                boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
                color: "rgba(255,255,255,0.9)",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.3s ease-out",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => {
                const btn = e.currentTarget as HTMLButtonElement;
                btn.style.transform = "translateX(-50%) translateY(-2px)";
                btn.style.boxShadow = "0 15px 35px rgba(0,0,0,0.5)";
                btn.style.borderColor = "rgba(96,165,250,0.5)";
                btn.style.outline = "4px solid rgba(96,165,250,0.1)";
              }}
              onMouseLeave={(e) => {
                const btn = e.currentTarget as HTMLButtonElement;
                btn.style.transform = "translateX(-50%)";
                btn.style.boxShadow = "0 10px 30px rgba(0,0,0,0.35)";
                btn.style.borderColor = "rgba(255,255,255,0.1)";
                btn.style.outline = "none";
              }}
            >
              <IconChevronDown
                size={18}
                style={{
                  color: "inherit",
                  transition: "transform 0.2s",
                  transform: hytaleFeedOpen ? "rotate(0deg)" : "rotate(180deg)",
                }}
              />
            </button>
          </Box>

          {/* Hytale feed panel */}
          {hytaleFeedOpen ? (
            <Box
              position="absolute"
              left="50%"
              top="-255px"
              zIndex={10}
              w="540px"
              maxW="70vw"
              rounded="2xl"
              border="1px solid rgba(255,255,255,0.2)"
              backdropFilter="blur(20px)"
              boxShadow="0 20px 60px rgba(0,0,0,0.45)"
              p={3}
              style={{
                background: "linear-gradient(to bottom, rgba(0,0,0,0.7), rgba(0,0,0,0.45))",
                transform: "translateX(-50%)",
              }}
            >
              <Box display="flex" alignItems="center" justifyContent="space-between" gap={3} mb={2}>
                <Box fontSize="11px" textTransform="uppercase" letterSpacing="widest" color="rgba(255,255,255,0.85)">
                  {t("launcher.hytaleFeed.title")}
                </Box>
                <Box fontSize="10px" color="rgba(255,255,255,0.65)">
                  {hytaleFeedLoading
                    ? t("launcher.hytaleFeed.statusLoading")
                    : hytaleFeedError
                      ? t("launcher.hytaleFeed.statusError")
                      : t("launcher.hytaleFeed.statusScroll")}
                </Box>
              </Box>

              {hytaleFeedLoading ? (
                <Box fontSize="xs" color="rgba(255,255,255,0.75)">
                  {t("launcher.hytaleFeed.statusLoading")}
                </Box>
              ) : hytaleFeedError ? (
                <Box fontSize="xs" color="rgba(255,255,255,0.75)">{hytaleFeedError}</Box>
              ) : (
                <Box
                  ref={hytaleFeedScrollRef}
                  className="dark-scrollbar"
                  display="flex"
                  gap={2}
                  overflowX="auto"
                  overflowY="hidden"
                  pb={2}
                  style={{ scrollbarWidth: "thin" }}
                  onWheel={(e) => {
                    const el = hytaleFeedScrollRef.current;
                    if (!el) return;
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
                      onClick={() => void window.config.openExternal(n.url)}
                      title={n.url}
                      style={{
                        width: 260, flexShrink: 0, textAlign: "left", padding: "8px", borderRadius: "12px",
                        border: "1px solid rgba(255,255,255,0.14)", background: "rgba(0,0,0,0.35)",
                        boxShadow: "0 8px 24px rgba(0,0,0,0.22)", transition: "all 0.15s",
                        display: "flex", gap: "8px", cursor: "pointer",
                        fontFamily: "inherit",
                      }}
                      onMouseEnter={(e) => {
                        const btn = e.currentTarget as HTMLButtonElement;
                        btn.style.background = "rgba(0,0,0,0.25)";
                        btn.style.borderColor = "rgba(147,197,253,0.45)";
                        btn.style.outline = "1px solid rgba(96,165,250,0.2)";
                      }}
                      onMouseLeave={(e) => {
                        const btn = e.currentTarget as HTMLButtonElement;
                        btn.style.background = "rgba(0,0,0,0.35)";
                        btn.style.borderColor = "rgba(255,255,255,0.14)";
                        btn.style.outline = "none";
                      }}
                    >
                      <Box flex={1} minW={0}>
                        <Box fontSize="xs" color="white" fontWeight="semibold" lineHeight="tight" style={{ overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                          {n.title}
                        </Box>
                        <Box mt={1} fontSize="11px" color="rgba(255,255,255,0.75)" style={{ overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" }}>
                          {n.description}
                        </Box>
                        <Box mt={1} fontSize="10px" color="blue.200" style={{ textDecoration: "underline", textUnderlineOffset: "2px" }}>
                          {t("launcher.hytaleFeed.open")}
                        </Box>
                      </Box>
                      {n.image ? (
                        <img
                          src={n.image}
                          alt={n.title}
                          loading="lazy"
                          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                          style={{ width: 56, height: 56, borderRadius: "8px", objectFit: "cover", border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.05)", flexShrink: 0 }}
                        />
                      ) : null}
                    </button>
                  ))}
                </Box>
              )}
            </Box>
          ) : null}
        </Box>
      </Box>

      {versionToDelete && (
        <ConfirmModal
          open={deleteConfirmOpen}
          title={t("launcher.version.deleteTitle")}
          message={t("launcher.version.deleteConfirm", {
            name: versionToDelete.build_name ?? `Build-${versionToDelete.build_index}`,
          })}
          confirmText={t("common.delete")}
          cancelText={t("common.cancel")}
          onCancel={() => setDeleteConfirmOpen(false)}
          onConfirm={async () => {
            if (!versionToDelete) return;
            if (runningVersion && gameLaunched && runningVersion.type === versionToDelete.type && runningVersion.build_index === versionToDelete.build_index) {
              alert(t("launcher.version.cannotDeleteRunning"));
              return;
            }
            setDeleteConfirmOpen(false);
            const v = versionToDelete;
            setVersionToDelete(null);
            const result = await window.ipcRenderer.invoke("delete-installed-version", gameDir, v);
            if (!result?.success) { alert("Error #1000"); return; }
            const updatedVersions = availableVersions.map((ver) =>
              ver.build_index === v.build_index && ver.type === v.type ? { ...ver, installed: false } : ver,
            );
            setAvailableVersions(updatedVersions);
          }}
        />
      )}

      {openNews && (
        <Box
          position="fixed"
          inset={0}
          zIndex={9999}
          display="flex"
          alignItems="center"
          justifyContent="center"
          className="glass-backdrop animate-fadeIn"
          onClick={() => setOpenNews(null)}
        >
          <Box
            w="520px"
            maxW="90vw"
            maxH="80vh"
            rounded="2xl"
            boxShadow="2xl"
            bg="rgba(24,28,36,0.95)"
            border="1px solid #23293a"
            p={5}
            className="animate-slideUp"
            onClick={(e) => e.stopPropagation()}
          >
            <Box display="flex" alignItems="flex-start" gap={4}>
              <Box color="white" fontWeight="extrabold" fontSize="lg" lineHeight="tight">
                {openNews.title}
              </Box>
            </Box>
            {openNews.date && (
              <Box mt={1} fontSize="11px" color="gray.400" fontFamily="mono">
                {openNews.date}
              </Box>
            )}
            <Box mt={4} fontSize="sm" color="gray.200" style={{ whiteSpace: "pre-wrap", overflow: "auto", maxHeight: "55vh" }}>
              {parseNewsContent(openNews.content).map((p, i) => {
                if (p.type === "text") return <span key={`t-${i}`}>{p.value}</span>;
                return (
                  <a
                    key={`l-${i}`}
                    href={p.href}
                    style={{ color: "#93c5fd", textDecoration: "underline", textUnderlineOffset: "2px" }}
                    onClick={(e) => { e.preventDefault(); void window.config.openExternal(p.href); }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "#bfdbfe"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "#93c5fd"; }}
                  >
                    {p.value}
                  </a>
                );
              })}
            </Box>
            {openNews.url ? (
              <Box mt={3}>
                <button
                  type="button"
                  onClick={() => void window.config.openExternal(openNews.url!)}
                  style={{ fontSize: "0.75rem", color: "#93c5fd", textDecoration: "underline", textUnderlineOffset: "2px", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#bfdbfe"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#93c5fd"; }}
                >
                  {t("launcher.news.openLink")}
                </button>
              </Box>
            ) : null}
            {openNews.image ? (
              <Box mt={4}>
                <img
                  src={openNews.image}
                  alt={openNews.title}
                  loading="lazy"
                  onClick={() => void window.config.openExternal(openNews.image!)}
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                  title={t("launcher.news.openImage") as string}
                  style={{ width: "100%", maxHeight: 260, objectFit: "contain", borderRadius: "8px", border: "1px solid #23293a", background: "rgba(0,0,0,0.2)", cursor: "pointer" }}
                />
              </Box>
            ) : null}
            <Box mt={5} display="flex" justifyContent="flex-end">
              <button
                type="button"
                onClick={() => setOpenNews(null)}
                style={{ padding: "8px 16px", borderRadius: "8px", background: "#23293a", color: "white", border: "none", cursor: "pointer", transition: "background 0.15s", fontFamily: "inherit" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#2b3347"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#23293a"; }}
              >
                {t("common.close")}
              </button>
            </Box>
          </Box>
        </Box>
      )}

      {patchConfirmOpen && selected ? (
        <Box
          position="fixed"
          inset={0}
          zIndex={9999}
          display="flex"
          alignItems="center"
          justifyContent="center"
          className="glass-backdrop animate-fadeIn"
          onClick={() => setPatchConfirmOpen(false)}
        >
          <Box
            w="520px"
            maxW="90vw"
            maxH="80vh"
            rounded="2xl"
            boxShadow="2xl"
            bg="rgba(24,28,36,0.95)"
            border="1px solid #23293a"
            p={5}
            className="animate-slideUp"
            onClick={(e) => e.stopPropagation()}
          >
            <Box display="flex" alignItems="flex-start" justifyContent="space-between" gap={4}>
              <Box color="white" fontWeight="extrabold" fontSize="lg" lineHeight="tight">
                {t("launcher.onlinePatch.confirmTitle")}
              </Box>
              <button
                type="button"
                onClick={() => setPatchConfirmOpen(false)}
                title={t("common.close") as string}
                style={{ color: "#d1d5db", fontSize: "1.25rem", fontWeight: 700, lineHeight: 1, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "white"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#d1d5db"; }}
              >
                ×
              </button>
            </Box>
            <Box mt={3} fontSize="sm" color="gray.200" style={{ whiteSpace: "pre-wrap" }}>
              {selected.patch_note?.trim() ? selected.patch_note : t("launcher.onlinePatch.notesNone")}
            </Box>
            <Box mt={5} display="flex" justifyContent="flex-end" gap={2}>
              <button
                type="button"
                onClick={() => setPatchConfirmOpen(false)}
                style={{ padding: "8px 16px", borderRadius: "8px", background: "#23293a", color: "white", border: "none", cursor: "pointer", transition: "background 0.15s", fontFamily: "inherit" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#2b3347"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#23293a"; }}
              >
                {t("launcher.onlinePatch.confirmCancel")}
              </button>
              <button
                type="button"
                onClick={() => { setPatchConfirmOpen(false); startOnlinePatch(); }}
                style={{
                  padding: "8px 16px", borderRadius: "8px",
                  background: "linear-gradient(to right, #0268D4, #02D4D4)",
                  color: "white", fontWeight: 700, border: "none", cursor: "pointer",
                  transition: "transform 0.15s", fontFamily: "inherit",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.02)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)"; }}
              >
                {t("launcher.onlinePatch.confirmApply")}
              </button>
            </Box>
          </Box>
        </Box>
      ) : null}
    </Box>
  );
};

export default Launcher;
