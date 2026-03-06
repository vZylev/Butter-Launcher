import React, { useCallback, useEffect, useRef, useState } from "react";
import { Box, Button, IconButton, Grid, GridItem, Flex, Image, Text, HStack, VStack, Spacer } from "@chakra-ui/react";
import { useGameContext } from "../hooks/gameContext";
import { useUserContext } from "../hooks/userContext";
import butterBg from "../assets/images/butter-bg.jpeg";
import butterLogo from "../assets/images/butter-logo.png";
import testAvatar from "../assets/images/test.png";
import SettingsModal from "./SettingsModal";
import ModsModal from "./ModsModal";
import ServersModal from "./ServersModal";
import WikiModal from "./WikiModal";
import MatchaTermsModal from "./MatchaTermsModal";
import FriendsMenu from "./FriendsMenu";
import DiscordLogo from "../assets/icons/discord.svg";
import MatchaIcon from "../assets/icons/matcha_bold.svg";
import PatreonLogo from "../assets/images/patreon.png";
import PatchNotesModal from "./PatchNotesModal";
import DragBar from "./DragBar";
import ProgressBar from "./ProgressBar";
import {
  IconChevronDown,
  IconX,
  IconTrash,
  IconWorld,
  IconPuzzle,
  IconServer,
  IconServerCog,
  IconPlayerPlay,
  IconDownload,
IconMessageCircle,
IconBrandInstagram,
IconBrandX,
IconSettings,
IconEye,
IconEyeOff,
} from "@tabler/icons-react";
import { stripHtmlToText } from "../utils/sanitize";
import ConfirmModal from "./ConfirmModal";
import HostServerPanel from "./launcher/HostServerPanel";
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

// Reusable nav button — flat Yandex-Music-style: gray inactive, white active, subtle hover.
const NavBtn: React.FC<{
  children: React.ReactNode;
  onClick?: () => void;
  title?: string;
  running?: boolean;
  unread?: boolean;
  active?: boolean;
  className?: string; [key: string]: any;
}> = ({ running, unread, active, children, className, ...props }) => (
  <Button
    variant="ghost"
    px={3}
    gap={2.5}
    h="38px"
    bg="transparent"
    borderRadius="lg"
    color={
      running || unread ? "#86efac"
      : active ? "#ffffff"
      : "#686868"
    }
    fontWeight={active ? "600" : "400"}
    fontSize="sm"
    letterSpacing="0"
    boxShadow="none"
    transition="color 0.15s"
    className={(running || unread ? "animate-nav-pulse " : "") + (className ?? "")}
    _hover={{
      bg: "transparent",
      color: running || unread ? "#86efac"
        : active ? "#ffffff"
        : "#b0b0b0",
    }}
    _active={{ bg: "rgba(255,255,255,0.05)" }}
    {...props}
  >
    {children}
  </Button>
);

// Launcher: a single component boldly pretending it isn't a small app.

// Types moved to features/game/gameHooks.ts

const HYTALE_FEED_URL =
  "https://launcher.hytale.com/launcher-feed/release/feed.json";

const HYTALE_FEED_IMAGE_BASE =
  "https://launcher.hytale.com/launcher-feed/release/";

const normalizeExternalUrl = (raw: unknown): string | null => {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return null;
  if (s.startsWith("http://")) return s.replace(/^http:\/\//i, "https://");
  if (s.startsWith("https://")) return s;
  if (s.startsWith("//")) return `https:${s}`;
  return null;
};

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

const Launcher: React.FC<{ onLogout?: () => void; hasCustomBg?: boolean }> = ({ onLogout, hasCustomBg }) => {
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
  const [hideUsername, setHideUsername] = useState(() => StorageService.getDynamic("hideUsername") === "true");
  const [closeDownloadConfirmOpen, setCloseDownloadConfirmOpen] = useState(false);
  // activeView drives the central panel content (replaces individual modal flags)
  const [activeView, setActiveView] = useState<"home" | "settings" | "mods" | "servers" | "wiki" | "matcha">("home");
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

  const [hostServerStage, setHostServerStage] = useState<"root" | "local">("root");

  const openMatchaGlobalChat = () => {
    if (!StorageService.getMatchaToken()) return;
    setFriendsMenuOpenTo("globalChat");
    setFriendsMenuOpenNonce((n) => n + 1);
    setActiveView("matcha");
  };

  // hostServerRunning & hostServerLogs are now from useHostServerIpc hook
  const [newsItems, setNewsItems] = useState<NewsItem[]>([]);
  const [openNews, setOpenNews] = useState<NewsItem | null>(null);
  const [hytaleFeedOpen, setHytaleFeedOpen] = useState(false);
  const [hytaleFeedLoading, setHytaleFeedLoading] = useState(false);
  const [hytaleFeedError, setHytaleFeedError] = useState<string>("");
  const [hytaleFeedItems, setHytaleFeedItems] = useState<HytaleFeedItem[]>([]);
  const hytaleFeedScrollRef = useRef<HTMLDivElement | null>(null);
  const [patchNotesUrls, setPatchNotesUrls] = useState<
    Partial<Record<VersionType, string>>
  >({});
  const [patchNotesOpen, setPatchNotesOpen] = useState(false);
  const [patchNotesUrl, setPatchNotesUrl] = useState<string | null>(null);
  const [patchNotesChannel, setPatchNotesChannel] = useState<VersionType | null>(null);
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

  const hasInstalledBaseBelow = (targetBuildIndex: number): boolean => {
    const target = Number(targetBuildIndex);
    if (!Number.isFinite(target) || target <= 1) return false;
    return availableVersions.some(
      (v) =>
        !!v.installed &&
        Number.isFinite(v.build_index) &&
        v.build_index > 0 &&
        v.build_index < target,
    );
  };

  const isVersionLocked = (v: GameVersion): boolean => {
    if (!restrictVersionsUntilBuild1) return false;
    if (v.installed) return false;
    if (v.build_index === 1) return false;
    if (v.isLatest) return false;
    if (hasInstalledBaseBelow(v.build_index)) return false;
    return true;
  };

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
    let cancelled = false;

    (async () => {
      try {
        // Patch notes URLs are controlled by the backend Version Manager.
        // Fetch via main process to avoid CORS issues.
        const manifestUrl = `${import.meta.env.VITE_REQUEST_VERSIONS_DETAILS_URL}`;
        if (!manifestUrl) throw new Error("Missing versions manifest URL");

        const status = await window.ipcRenderer.invoke("fetch:head", manifestUrl);
        if (status !== 200) throw new Error(`Manifest unavailable (HTTP ${status})`);

        const raw = await window.ipcRenderer.invoke("fetch:json", manifestUrl);

        const releaseUrl = normalizeExternalUrl(
          raw?.patch_notes?.release?.url ?? raw?.patchNotes?.release?.url,
        );
        const preReleaseUrl = normalizeExternalUrl(
          raw?.patch_notes?.["pre-release"]?.url ??
            raw?.patchNotes?.["pre-release"]?.url,
        );

        if (!cancelled) {
          setPatchNotesUrls({
            release: releaseUrl ?? undefined,
            "pre-release": preReleaseUrl ?? undefined,
          });
        }
      } catch {
        if (!cancelled) setPatchNotesUrls({});
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!offlineMode) return;
    // If we're offline, pretend the internet features never existed.
    setActiveView((v) => (v === "servers" || v === "wiki" || v === "matcha") ? "home" : v);
    setHostServerMenuOpen(false);
    setHostServerStage("root");
  }, [offlineMode]);

  useEffect(() => {
    if (!friendsMenuOpen) return;

    const onMouseDown = (e: MouseEvent) => {
      // Avoid collapsing while other modals/menus are in charge.
      if (
        hostServerMenuOpen ||
        activeView !== "home" ||
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
      if (hostServerMenuOpen || activeView === "wiki")
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
    activeView,
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
      if (activeView === "wiki") return;
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
        if (activeView === "wiki") return;
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
  }, [hostServerMenuOpen, activeView, hostServerRunning]);

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

  const selectedPatchNotesUrl =
    selected && selected.isLatest ? patchNotesUrls[selected.type] : undefined;

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

    if (isVersionLocked(v)) {
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
        try {
          const lock = await window.config?.getRuntimeGameLock?.();
          if (lock && (lock as any).ok === true && (lock as any).active === true) {
            const accountType =
              (lock as any).accountType === "premium"
                ? t("runtimeLock.accountType.premium")
                : t("runtimeLock.accountType.custom");
            const games = typeof (lock as any).games === "number" ? (lock as any).games : 1;
            alert(
              t("runtimeLock.logoutBlocked", {
                accountType,
                count: games,
              }),
            );
            return;
          }
        } catch {
          // ignore
        }

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
    <Grid
      h="100vh"
      w="100vw"
      bg={hasCustomBg ? "transparent" : "#121212"}
      color="white"
      templateColumns="260px 1fr"
      templateRows="1fr 100px"
      overflow="hidden"
      position="relative"
    >
      <Box position="absolute" top={0} left={0} right={0} zIndex={50}>
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
                >
                  {t("common.reconnect")}
                </button>
              </Box>
            ) : null
          }
          onOpenMatchaGlobalChat={openMatchaGlobalChat}
        />
      </Box>

      {/* 1. LEFT SIDEBAR */}
      <GridItem
        colSpan={1}
        rowSpan={1}
        bg="transparent" p={5} pt={5}
        display="flex"
        flexDirection="column"
        justifyContent="space-between"
      >
        <VStack align="stretch" gap={3}>
          <Text
            style={{ fontFamily: "'Montserrat', 'Inter', sans-serif" }}
            fontSize="15px"
            fontWeight="700"
            letterSpacing="-0.01em"
            color="white"
            mb={2}
            px={1}
          >
            Butter Launcher
          </Text>
          

          <NavBtn justifyContent="flex-start" w="full" active={activeView === "wiki"} onClick={() => setActiveView("wiki")}>
            <IconWorld size={18} /> {t("launcher.buttons.wiki")}
          </NavBtn>
          {!offlineMode ? (
            <NavBtn justifyContent="flex-start" w="full" active={activeView === "servers"} onClick={() => setActiveView("servers")}>
              <IconServer size={18} /> {t("launcher.buttons.servers")}
            </NavBtn>
          ) : null}

          <Box position="relative" ref={hostServerMenuRef}>
            <NavBtn
              justifyContent="flex-start" w="full"
              running={hostServerRunning}
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
              <IconServerCog size={20} /> {t("launcher.buttons.hostServer")}
            </NavBtn>

            {hostServerMenuOpen ? (
              <Box position="absolute" left="100%" top={0} ml={2} zIndex={50}>
                <HostServerPanel
                  hostServerStage={hostServerStage}
                  setHostServerStage={setHostServerStage}
                  setHostServerMenuOpen={setHostServerMenuOpen}
                  hostServerRunning={hostServerRunning}
                  hostServerLogs={hostServerLogs}
                  pushHostLog={pushHostLog}
                  availableVersions={availableVersions}
                  selectedVersion={selectedVersion}
                  gameDir={gameDir}
                  selected={selected}
                  isSelectedBuildInstalled={isSelectedBuildInstalled}
                  showSelectedBuildNotInstalledError={showSelectedBuildNotInstalledError}
                />
              </Box>
            ) : null}
          </Box>

          <NavBtn justifyContent="flex-start" w="full" active={activeView === "mods"} onClick={() => setActiveView("mods")}>
            <IconPuzzle size={18} /> {t("launcher.buttons.mods")}
          </NavBtn>

          {!offlineMode ? (
            <NavBtn
              justifyContent="flex-start" w="full"
              unread={friendsHasUnread}
              active={activeView === "matcha"}
              onClick={() => setActiveView(activeView === "matcha" ? "home" : "matcha")}
            >
              <img
                src={MatchaIcon} alt="" aria-hidden="true"
                style={{
                  width: 18, height: 18, flexShrink: 0,
                  opacity: (activeView === "matcha" || friendsHasUnread) ? 1 : 0.38,
                  transition: "opacity 0.15s",
                }}
              />
              Matcha!
            </NavBtn>
          ) : null}
        </VStack>

        <VStack gap={4}>
                    {/* Socials */}
          <HStack gap={2} flexWrap="wrap">
            <button
              type="button" title="Global Chat"
              onClick={() => openMatchaGlobalChat?.()}
              style={{ padding: "8px", borderRadius: "50%", background: "rgba(255,255,255,0.05)" }}
            >
              <IconMessageCircle size={18} />
            </button>
            <button
              type="button" title="Discord"
              onClick={() => void window.config.openExternal("https://discord.com/invite/fZgjHwv5pA")}
              style={{ padding: "8px", borderRadius: "50%", background: "rgba(255,255,255,0.05)" }}
            >
              <img src={DiscordLogo} alt="Discord" width={18} height={18} />
            </button>
            <button
              type="button" title="Web"
              onClick={() => void window.config.openExternal("https://butterlauncher.tech/")}
              style={{ padding: "8px", borderRadius: "50%", background: "rgba(255,255,255,0.05)" }}
            >
              <IconWorld size={18} color="white" />
            </button>
            <button
              type="button" title="Patreon"
              onClick={() => void window.config.openExternal("https://www.patreon.com/c/ButterLauncher")}
              style={{ padding: "8px", borderRadius: "50%", background: "rgba(255,255,255,0.05)" }}
            >
              <img src={PatreonLogo} alt="Patreon" style={{ width: 18, height: 18 }} />
            </button>
            <button
              title="Instagram"
              type="button"
              onClick={() => window.config.openExternal("https://www.instagram.com/butterlauncher_official")}
              style={{ padding: "8px", borderRadius: "50%", background: "rgba(255,255,255,0.05)" }}
            >
              <IconBrandInstagram size={18} color="white" />
            </button>
            <button
              title="X"
              type="button"
              onClick={() => window.config.openExternal("https://x.com/Butter_Launcher/")}
              style={{ padding: "8px", borderRadius: "50%", background: "rgba(255,255,255,0.05)" }}
            >
              <IconBrandX size={18} color="white" />
            </button>
          </HStack>

          {/* Profile */}
          <HStack
            w="full"
            p={2}
            borderRadius="xl"
            bg="rgba(255,255,255,0.02)"
            _hover={{ bg: "rgba(255,255,255,0.06)" }}
            transition="all 0.2s"
            cursor="pointer"
            onClick={() => setActiveView("settings")}
          >
            <Box w="32px" h="32px" borderRadius="full" overflow="hidden" bg="gray.700">
               <img src={testAvatar} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </Box>
            <Box flex="1" overflow="hidden">
              <Box display="flex" alignItems="center" gap="4px">
                <Box
                  as="button"
                  onClick={(e: React.MouseEvent) => {
                    e.stopPropagation();
                    setHideUsername(v => {
                      StorageService.setDynamic("hideUsername", String(!v));
                      return !v;
                    });
                  }}
                  display="flex"
                  alignItems="center"
                  flexShrink={0}
                  color="rgba(255,255,255,0.35)"
                  _hover={{ color: "rgba(255,255,255,0.7)" }}
                  transition="color 0.15s"
                >
                  {hideUsername ? <IconEyeOff size={13} /> : <IconEye size={13} />}
                </Box>
                <Text fontSize="sm" fontWeight="bold" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {hideUsername ? "••••••" : (username || "User")}
                </Text>
              </Box>
              <Text fontSize="xs" color={isPremium ? "yellow.400" : "gray.400"}>{isPremium ? "Premium" : "Standard"} Account</Text>
            </Box>
            <IconSettings size={18} color="gray.400" />
          </HStack>
        </VStack>
      </GridItem>

      {/* 2. MAIN AREA */}
      <GridItem
        colSpan={1}
        rowSpan={1}
        p={3}
        pl={0}
        pt={12}
        pb={3}
        position="relative"
        overflow="hidden"
        minW={0}
        minH={0}
      >
        {/* Single card container — provides rounded bg visible for all views */}
        <Box w="full" h="full" borderRadius="2xl" overflow="hidden" position="relative" bg="#1c1c1c">

        {/* Settings view */}
        {activeView === "settings" && (
          <Box position="absolute" inset={0} overflow="hidden">
            <SettingsModal onLogout={handleLogout} onBack={() => setActiveView("home")} />
          </Box>
        )}

        {/* Mods view */}
        {activeView === "mods" && (
          <Box position="absolute" inset={0} overflow="hidden">
            <ModsModal />
          </Box>
        )}

        {/* Servers view */}
        {activeView === "servers" && (
          <Box position="absolute" inset={0} overflow="hidden">
            <ServersModal />
          </Box>
        )}

        {/* Wiki view */}
        {activeView === "wiki" && (
          <Box position="absolute" inset={0} overflow="hidden">
            <WikiModal
              initialUrl={wikiLastUrl}
              onClose={(lastUrl) => {
                if (typeof lastUrl === "string") setWikiLastUrl(lastUrl);
                setActiveView("home");
              }}
            />
          </Box>
        )}

        {/* Matcha (Friends) view */}
        {activeView === "matcha" && (
          <Box position="absolute" inset={0} overflow="hidden">
            <FriendsMenu
              open={true}
              inline={true}
              onClose={() => setActiveView("home")}
              onOpenTerms={() => setMatchaTermsOpen(true)}
              openTo={friendsMenuOpenTo}
              openToNonce={friendsMenuOpenNonce}
              launcherUsername={username}
              gameDir={gameDir}
            />
          </Box>
        )}

        {/* Home view (always in DOM — must come last so it's beneath modal-style views) */}
        <Box
          position="absolute"
          inset={0}
          backgroundImage={`url(${butterBg})`}
          backgroundSize="cover"
          backgroundPosition="center"
          style={{ display: activeView === "home" ? "block" : "none" }}
        >
          <Box position="absolute" inset={0} bg="rgba(0,0,0,0.3)" zIndex={0} />
          <Box position="absolute" bottom={0} left={0} right={0} h="65%" bgGradient="linear(to-t, #121212 0%, #121212 8%, transparent 100%)" zIndex={1} />

          <Flex position="relative" zIndex={2} direction="column" align="center" justify="center" h="full" mt="-5%">
            <Image
              src={butterLogo}
              w={{ base: "180px", sm: "240px", md: "320px", lg: "400px" }}
              maxW="55%"
              filter="drop-shadow(0px 10px 20px rgba(0,0,0,0.8))"
            />
            
            {showUpdateActions && latestRelease ? (
              <Button
                mt={8}
                borderRadius="full"
                bg="whiteAlpha.200"
                backdropFilter="blur(10px)"
                color="white"
                px={8}
                _hover={{ bg: "whiteAlpha.300", transform: "scale(1.05)" }}
                transition="all 0.2s"
                onClick={() => {
                  if (canSmartUpdateFromSelected) { smartInstallGame(latestRelease, selected.build_index); return; }
                  if (smartUpdate) { smartInstallGame(latestRelease, smartUpdate.fromBuildIndex); return; }
                  installGame(latestRelease);
                }}
              >
                <IconSettings size={18} style={{ marginRight: '8px' }}/> {t("launcher.updates.update")}
              </Button>
            ) : null}
          </Flex>

          <HStack position="absolute" bottom={6} left={6} right={6} zIndex={3} justify="center" overflowX="auto" gap={4} css={{ "&::-webkit-scrollbar": { display: "none" }}}>
            {(newsItems.length ? newsItems : [{ title: t("launcher.news.loading"), content: "" }]).slice(0, 4).map((item, idx) => {
              const hasContent = !!item.content?.trim();
              return (
                <Box
                  key={`${idx}-${item.title}`}
                  onClick={hasContent ? () => setOpenNews(item) : undefined}
                  cursor={hasContent ? "pointer" : "default"}
                  minW="220px"
                  h="120px"
                  rounded="xl"
                  overflow="hidden"
                  position="relative"
                  border="1px solid"
                  borderColor="whiteAlpha.100"
                  boxShadow="md"
                  transition="all 0.2s"
                  _hover={hasContent ? { transform: "translateY(-3px)", borderColor: "whiteAlpha.300" } : {}}
                >
                  {item.image && (
                    <Box
                      position="absolute"
                      inset={0}
                      style={{ backgroundImage: `url(${item.image})`, backgroundSize: "cover", backgroundPosition: "center" }}
                    />
                  )}
                  <Box position="absolute" inset={0} bg="linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.2) 100%)" />
                  <Box position="absolute" bottom={0} left={0} p={3}>
                    <Text fontSize="xs" fontWeight="bold" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{item.title}</Text>
                    {hasContent && <Text fontSize="10px" color="cyan.400" mt={1}>{t("launcher.news.showMore")}</Text>}
                  </Box>
                </Box>
              )
            })}
          </HStack>
        </Box>
        </Box>{/* end card container */}
      </GridItem>

      {/* 3. BOTTOM BAR */}
      <GridItem colSpan={2} rowSpan={1} pl={5} pr={3} pb={3}>
        <Flex h="100%" bg="#181818" borderRadius="2xl" align="center" px={6} gap={6}>
          
          {/* Left: Version Selector */}
          <HStack flex="1" gap={4} position="relative">
            <Box w="50px" h="50px" borderRadius="md" bg="gray.800" overflow="hidden" flexShrink={0} display="flex" alignItems="center" justifyContent="center">
               <Image src="/src/assets/images/hytale_logo.jpg" w="full" h="full" objectFit="contain" />
            </Box>
            <Box>
              <Text fontSize="sm" fontWeight="bold">Hytale</Text>
              <Box cursor="pointer" position="relative" onClick={() => setVersionsOpen(!versionsOpen)}>
                <Text fontSize="xs" color="gray.400" _hover={{ color: "white" }}>
                  {t("launcher.version.label")}: {selectedLabel || "None"} {versionsOpen ? "▲" : "▼"}
                </Text>
              </Box>

              {/* Version dropdown */}
              {versionsOpen && (
                <Box
                  position="absolute"
                  bottom="100%"
                  left={0}
                  mb={4}
                  w="260px"
                  bg="rgba(20,20,20,0.95)"
                  backdropFilter="blur(10px)"
                  border="1px solid rgba(255,255,255,0.1)"
                  borderRadius="xl"
                  boxShadow="xl"
                  p={3}
                  zIndex={100}
                >
                  <HStack mb={2} bg="rgba(255,255,255,0.05)" p={1} borderRadius="md">
                    <Button flex={1} size="xs" variant="ghost" bg={versionType === "release" ? "whiteAlpha.200" : "transparent"} onClick={() => setVersionType("release")}>Release</Button>
                    <Button flex={1} size="xs" variant="ghost" bg={versionType === "pre-release" ? "whiteAlpha.200" : "transparent"} onClick={() => setVersionType("pre-release")}>Pre</Button>
                  </HStack>

                  <Box maxH="200px" overflowY="auto" className="dark-scrollbar" pr={1}>
                    {availableVersions.map((v, idx) => {
                      const name = v.build_name?.trim() || `Build-${v.build_index}`;
                      const isSelected = selectedVersion === idx;
                      return (
                        <Box
                          key={`${v.type}:${v.build_index}`}
                          p={2}
                          borderRadius="md"
                          cursor="pointer"
                          bg={isSelected ? "rgba(34,211,238,0.1)" : "transparent"}
                          _hover={{ bg: "rgba(255,255,255,0.1)" }}
                          onClick={() => { setSelectedVersion(idx); setVersionsOpen(false); }}
                        >
                          <Text fontSize="xs" color={isSelected ? "cyan.400" : "white"}>{name}</Text>
                        </Box>
                      );
                    })}
                  </Box>
                </Box>
              )}
            </Box>
          </HStack>

          {/* Right: Play / Install / Progress Button */}
          <Box flexShrink={0}>
            {installing || patchingOnline ? (
               <Box w="208px" h="50px" bg="rgba(255,255,255,0.1)" rounded="full" p={3} display="flex" alignItems="center">
                 <ProgressBar progress={installing ? installProgress : patchProgress} />
               </Box>
            ) : availableVersions[selectedVersion]?.build_index === 1 && !availableVersions[selectedVersion]?.installed && !isCustom ? (
               <Button
                 size="lg"
                 borderRadius="full"
                 bg="whiteAlpha.100"
                 color="white"
                 px={8}
                 h="56px"
                 _hover={{ bg: "whiteAlpha.200", transform: "scale(1.02)" }}
                 onClick={() => { alert("Use manual import as before."); }}
               >
                 {t("launcher.version.manualInstallRequired")}
               </Button>
            ) : (
               <Button
                 size="lg"
                 borderRadius="full"
                 bg="cyan.400"
                 color="black"
                 fontWeight="extrabold"
                 px={12}
                 h="56px"
                 _hover={{ bg: "cyan.300", transform: "scale(1.02)" }}
                 shadow="0 0 20px rgba(34,211,238,0.4)"
                 disabled={launching || gameLaunched}
                 onClick={handleLaunch}
               >
                 {!(launching || gameLaunched) && (
                    availableVersions[selectedVersion]?.installed
                      ? <IconPlayerPlay size={20} style={{ marginRight: 8 }} />
                      : <IconDownload size={20} style={{ marginRight: 8 }} />
                 )}
                 {availableVersions[selectedVersion]?.installed
                    ? (gameLaunched ? t("launcher.updates.running") : t("launcher.updates.play"))
                    : t("launcher.updates.install")}
               </Button>
            )}
          </Box>
        </Flex>
      </GridItem>

      {/* MODALS */}
      {/* Settings view rendered inline in Main Area */}
      {/* Mods view rendered inline in Main Area */}
      {/* Servers view rendered inline in Main Area */}
      {/* Wiki view rendered inline in Main Area */}
      <MatchaTermsModal open={matchaTermsOpen} onClose={() => setMatchaTermsOpen(false)} />
      
      {versionToDelete && (
        <ConfirmModal
          open={deleteConfirmOpen}
          title={t("launcher.version.deleteTitle")}
          message={t("launcher.version.deleteConfirm", { name: versionToDelete.build_name ?? `Build-${versionToDelete.build_index}` })}
          confirmText={t("common.delete")}
          cancelText={t("common.cancel")}
          onCancel={() => setDeleteConfirmOpen(false)}
          onConfirm={async () => {
            if (!versionToDelete) return;
            setDeleteConfirmOpen(false);
            const v = versionToDelete;
            setVersionToDelete(null);
            const result = await window.ipcRenderer.invoke("delete-installed-version", gameDir, v);
            if (result?.success) {
              const updatedVersions = availableVersions.map((ver) =>
                ver.build_index === v.build_index && ver.type === v.type ? { ...ver, installed: false } : ver
              );
              setAvailableVersions(updatedVersions);
            }
          }}
        />
      )}

      {openNews && (
        <Box position="fixed" inset={0} zIndex={9999} display="flex" alignItems="center" justifyContent="center" bg="blackAlpha.700" onClick={() => setOpenNews(null)}>
          <Box p={5} bg="gray.900" border="1px solid" borderColor="whiteAlpha.200" borderRadius="xl" maxW="500px" onClick={(e) => e.stopPropagation()}>
            <Text fontWeight="bold" fontSize="lg" color="white">{openNews.title}</Text>
            <Text fontSize="sm" color="gray.300" mt={2} whiteSpace="pre-wrap">{openNews.content}</Text>
            <Button mt={4} onClick={() => setOpenNews(null)}>Close</Button>
          </Box>
        </Box>
      )}

    </Grid>
  );
};

export default Launcher;
