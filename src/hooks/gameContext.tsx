import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { getGameVersions } from "../utils/game";

interface GameContextType {
  gameDir: string | null;
  setGameDir: (dir: string | null) => void;
  offlineMode: boolean;
  versionType: VersionType;
  setVersionType: (t: VersionType) => void;
  availableVersions: GameVersion[];
  setAvailableVersions: (versions: GameVersion[]) => void;
  selectedVersion: number;
  setSelectedVersion: (idx: number) => void;
  updateAvailable: boolean;
  updateDismissed: boolean;
  dismissUpdateForNow: () => void;
  restoreUpdatePrompt: () => void;
  installing: boolean;
  installProgress: InstallProgress;
  installingVersion: GameVersion | null;
  cancelBuildDownload: () => void;
  cancelingBuildDownload: boolean;
  patchingOnline: boolean;
  patchProgress: InstallProgress;
  pendingOnlinePatch: boolean;
  checkingUpdates: boolean;
  launching: boolean;
  gameLaunched: boolean;
  installGame: (version: GameVersion) => void;
  launchGame: (version: GameVersion, username: string) => void;
  checkForUpdates: (reason?: "startup" | "manual") => Promise<void>;
  startPendingOnlinePatch: () => void;
  reconnect: () => void;
}

export const GameContext = createContext<GameContextType | null>(null);

export const GameContextProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [gameDir, setGameDir] = useState<string | null>(null);

  const [offlineMode, setOfflineMode] = useState(false);

  const [versionType, setVersionType] = useState<VersionType>("release");
  const [releaseVersions, setReleaseVersions] = useState<GameVersion[]>([]);
  const [preReleaseVersions, setPreReleaseVersions] = useState<GameVersion[]>(
    [],
  );
  const releaseVersionsRef = useRef<GameVersion[]>([]);
  const preReleaseVersionsRef = useRef<GameVersion[]>([]);
  const [selectedIndexByType, setSelectedIndexByType] = useState<
    Record<VersionType, number>
  >({ release: 0, "pre-release": 0 });

  const [updateDismissed, setUpdateDismissed] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  const [installing, setInstalling] = useState(false);
  const [installingVersion, setInstallingVersion] = useState<GameVersion | null>(
    null,
  );
  const [cancelingBuildDownload, setCancelingBuildDownload] = useState(false);
  const [installProgress, setInstallProgress] = useState<InstallProgress>({
    phase: "download",
    percent: 0,
    total: 0,
    current: 0,
  });
  const [patchingOnline, setPatchingOnline] = useState(false);
  const [patchProgress, setPatchProgress] = useState<InstallProgress>({
    phase: "online-patch",
    percent: -1,
  });
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [gameLaunched, setGameLaunched] = useState(false);

  useEffect(() => {
    releaseVersionsRef.current = releaseVersions;
  }, [releaseVersions]);

  useEffect(() => {
    preReleaseVersionsRef.current = preReleaseVersions;
  }, [preReleaseVersions]);

  const availableVersions =
    versionType === "release" ? releaseVersions : preReleaseVersions;
  const selectedVersion = selectedIndexByType[versionType] ?? 0;

  const setSelectedVersion = useCallback(
    (idx: number) => {
      setSelectedIndexByType((prev) => ({ ...prev, [versionType]: idx }));
    },
    [versionType],
  );

  const setAvailableVersions = useCallback(
    (versions: GameVersion[]) => {
      if (versionType === "release") {
        setReleaseVersions(versions);
      } else {
        setPreReleaseVersions(versions);
      }
    },
    [versionType]
  );


  const dismissUpdateForNow = useCallback(() => {
    setUpdateDismissed(true);

    // When dismissing update, snap back to the newest *installed* release (so Play is available).
    if (versionType !== "release") setVersionType("release");

    const installed = releaseVersions
      .filter((v) => v.installed)
      .sort((a, b) => b.build_index - a.build_index);
    const newestInstalled = installed.length ? installed[0] : null;
    if (!newestInstalled) return;
    const idx = releaseVersions.findIndex(
      (v) =>
        v.build_index === newestInstalled.build_index && v.type === "release",
    );
    if (idx !== -1) {
      setSelectedIndexByType((prev) => ({ ...prev, release: idx }));
    }
  }, [releaseVersions, versionType]);

  const restoreUpdatePrompt = useCallback(() => {
    setUpdateDismissed(false);
  }, []);

  const installGame = useCallback(
    (version: GameVersion) => {
      if (!gameDir) return;
      // store the version so cancel can actually target something
      // because the universe hates stateless ui
      setInstallingVersion(version);
      setCancelingBuildDownload(false);
      window.ipcRenderer.send("install-game", gameDir, version);
    },
    [gameDir],
  );

  const cancelBuildDownload = useCallback(() => {
    if (!gameDir) return;
    if (!installingVersion) return;

    // we only show this button during pwr download but lets be paranoid
    setCancelingBuildDownload(true);
    window.ipcRenderer.send(
      "cancel-build-download",
      gameDir,
      installingVersion,
    );
  }, [gameDir, installingVersion]);

  const launchGame = useCallback(
    (version: GameVersion, username: string) => {
      if (!gameDir || !version.installed) return;
      setLaunching(true);

      // Persist last executed version so it becomes the default selection next launch.
      try {
        localStorage.setItem(
          `selectedVersion:${version.type}`,
          version.build_index.toString(),
        );
      } catch {
        // ignore
      }

      // Register listeners before sending the IPC message to avoid races.
      window.ipcRenderer.once("launched", () => {
        setLaunching(false);
        setGameLaunched(true);
      });
      window.ipcRenderer.once("launch-finished", () => {
        setLaunching(false);
        setGameLaunched(false);
      });
      window.ipcRenderer.once("launch-error", (_, error?: unknown) => {
        setLaunching(false);
        setGameLaunched(false);
        const payload: any = error;
        const code =
          payload && typeof payload === "object" && typeof payload.code === "number"
            ? payload.code
            : typeof payload === "number"
              ? payload
              : 1000;
        console.error("Launch error code:", code);
        alert(`Error #${code}`);
      });

      const customUUID = (localStorage.getItem("customUUID") || "").trim();
      const uuidArg = customUUID.length ? customUUID : null;

      window.ipcRenderer.send(
        "launch-game",
        gameDir,
        version,
        username,
        uuidArg,
        offlineMode,
      );
    },
    [gameDir, offlineMode],
  );

  const checkConnectivity = useCallback(async (): Promise<boolean> => {
    // navigator.onLine is fast but not perfectly reliable.
    // Because networking is easy and always works™.
    // So we also do a quick HEAD request as a reality check.
    if (typeof navigator !== "undefined" && navigator.onLine === false) return false;

    const url =
      (import.meta as any).env?.VITE_REQUEST_VERSIONS_DETAILS_URL ||
      (import.meta as any).env?.VITE_LAUNCHER_VERSION_URL ||
      "https://updates.butterlauncher.tech/version.json";

    try {
      const status = await window.ipcRenderer.invoke("fetch:head", url);
      return status === 200;
    } catch {
      // If the internet doesn't answer, we assume it's not feeling social today.
      return false;
    }
  }, []);

  const buildInstalledOnlyList = useCallback(
    (
      installed: Array<{
        type: VersionType;
        build_index: number;
        build_name?: string;
        isLatest?: boolean;
      }>,
      t: VersionType,
    ): GameVersion[] => {
      return installed
        .filter((x) => x.type === t)
        .map((x) => ({
          type: t,
          build_index: x.build_index,
          build_name: x.build_name || `Build-${x.build_index}`,
          isLatest: !!x.isLatest,
          installed: true,
          // url is not needed for launch when already installed; keep a best-effort placeholder.
          url: "",
        }))
        .sort((a, b) => b.build_index - a.build_index);
    },
    [],
  );

  const checkForUpdates = useCallback(
    async (_reason: "startup" | "manual" = "startup") => {
      if (!gameDir) return;
      setCheckingUpdates(true);

      try {
        const installed = (await window.ipcRenderer.invoke(
          "list-installed-versions",
          gameDir,
        )) as Array<{
          type: VersionType;
          build_index: number;
          build_name?: string;
          isLatest?: boolean;
        }>;

        const isOnline = await checkConnectivity();
        if (!isOnline) {
          setOfflineMode(true);

          // Offline Mode: we stop pretending we can reach the internet.
          // Installed builds only. No remote fetches. No drama.

          const nextRelease = buildInstalledOnlyList(installed, "release");
          const nextPre = buildInstalledOnlyList(installed, "pre-release");

          setReleaseVersions(nextRelease);
          setPreReleaseVersions(nextPre);
          setUpdateAvailable(false);

          const pickIndex = (list: GameVersion[], t: VersionType) => {
            const raw = localStorage.getItem(`selectedVersion:${t}`);
            const savedBuild = raw ? Number(raw) : NaN;
            if (Number.isFinite(savedBuild)) {
              const idx = list.findIndex((v) => v.build_index === savedBuild);
              if (idx !== -1) return idx;
            }
            return list.length ? 0 : 0;
          };

          setSelectedIndexByType((prev) => ({
            ...prev,
            release: pickIndex(nextRelease, "release"),
            "pre-release": pickIndex(nextPre, "pre-release"),
          }));

          // Prefer a channel that actually has installed builds.
          if (nextRelease.length) setVersionType("release");
          else if (nextPre.length) setVersionType("pre-release");

          return;
        }

        if (offlineMode) {
          // Welcome back to the world wide web.
          setOfflineMode(false);
        }

        const releaseInstalledSet = new Set<number>();
        const preReleaseInstalledSet = new Set<number>();
        for (const item of installed) {
          if (item.type === "release") {
            releaseInstalledSet.add(item.build_index);
          } else {
            preReleaseInstalledSet.add(item.build_index);
          }
        }

        const isInstalled = (t: VersionType, idx: number) =>
          t === "release"
            ? releaseInstalledSet.has(idx)
            : preReleaseInstalledSet.has(idx);

        const [remoteRelease, remotePre] = await Promise.all([
          getGameVersions("release"),
          getGameVersions("pre-release"),
        ]);

        // If remote fetch fails, do NOT wipe the list; just refresh installed flags.
        const releaseBase = remoteRelease.length
          ? remoteRelease
          : releaseVersionsRef.current;
        const preBase = remotePre.length
          ? remotePre
          : preReleaseVersionsRef.current;

        const nextRelease = releaseBase.map((v) => ({
          ...v,
          installed: isInstalled("release", v.build_index),
        }));
        const nextPre = preBase.map((v) => ({
          ...v,
          installed: isInstalled("pre-release", v.build_index),
        }));

        setReleaseVersions(nextRelease);
        setPreReleaseVersions(nextPre);

        const newestInstalledRelease = nextRelease
          .filter((v) => v.installed)
          .reduce<GameVersion | undefined>((best, v) => {
            if (!best) return v;
            return v.build_index > best.build_index ? v : best;
          }, undefined);

        const latestRelease =
          nextRelease.find((v) => v.isLatest) ?? nextRelease[0];
        const hasUpdate =
          !!newestInstalledRelease &&
          !!latestRelease &&
          latestRelease.build_index > newestInstalledRelease.build_index;
        setUpdateAvailable(hasUpdate);

        // Default selection behavior (priority):
        // 1) Last used (persisted) per channel
        // 2) Newest installed for that channel
        // 3) Latest (newest) available
        const pickIndex = (
          list: GameVersion[],
          t: VersionType,
          newestInstalled?: GameVersion,
        ) => {
          const raw = localStorage.getItem(`selectedVersion:${t}`);
          const savedBuild = raw ? Number(raw) : NaN;
          if (Number.isFinite(savedBuild)) {
            const idx = list.findIndex((v) => v.build_index === savedBuild);
            if (idx !== -1) return idx;
          }

          if (newestInstalled) {
            const idx = list.findIndex(
              (v) => v.build_index === newestInstalled.build_index,
            );
            if (idx !== -1) return idx;
          }

          return list.length ? 0 : 0;
        };

        const newestInstalledPre = nextPre
          .filter((v) => v.installed)
          .reduce<GameVersion | undefined>((best, v) => {
            if (!best) return v;
            return v.build_index > best.build_index ? v : best;
          }, undefined);

        const releaseIdx = pickIndex(
          nextRelease,
          "release",
          newestInstalledRelease,
        );
        const preIdx = pickIndex(nextPre, "pre-release", newestInstalledPre);

        setSelectedIndexByType((prev) => ({
          ...prev,
          release: releaseIdx,
          "pre-release": preIdx,
        }));

        // If user never picked anything, prefer release tab when available.
        if (nextRelease.length) setVersionType((prev) => prev || "release");
      } finally {
        setCheckingUpdates(false);
      }
    },
    [gameDir, offlineMode, checkConnectivity, buildInstalledOnlyList],
  );

  const reconnect = useCallback(() => {
    // Re-run update flow; it will re-check connectivity and switch modes.
    void checkForUpdates("manual");
  }, [checkForUpdates]);

  useEffect(() => {
    const onOnline = () => {
      if (!offlineMode) return;
      void checkForUpdates("manual");
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [offlineMode, checkForUpdates]);

  useEffect(() => {
    if (!window.config) return;

    const bounceTimeout = 200;
    let lastUpdateProgress: number;
    const lastProgressRef = { current: null as InstallProgress | null };

    window.ipcRenderer.on(
      "install-progress",
      (_, progress: InstallProgress) => {
        const now = Date.now();
        const last = lastProgressRef.current;

        // Never drop phase changes (this was causing the UI to get stuck on "Downloading...").
        const phaseChanged = !last || last.phase !== progress.phase;
        const allowThrough =
          phaseChanged ||
          progress.percent === -1 ||
          progress.percent === 100 ||
          !lastUpdateProgress ||
          now - lastUpdateProgress >= bounceTimeout;

        if (!allowThrough) return;

        lastUpdateProgress = now;
        lastProgressRef.current = progress;
        setInstallProgress(progress);
      },
    );

    // Online client patch (startup) progress
    // Only show patching UI when a download actually starts (progress events).
    window.ipcRenderer.on(
      "online-patch-progress",
      (_, progress: InstallProgress) => {
        setPatchingOnline(true);
        setPatchProgress(progress);
      },
    );
    window.ipcRenderer.on("online-patch-finished", () => {
      setPatchingOnline(false);
    });
    window.ipcRenderer.on(
      "online-unpatch-progress",
      (_, progress: InstallProgress) => {
        setPatchingOnline(true);
        setPatchProgress(progress);
      },
    );
    window.ipcRenderer.on("online-unpatch-finished", () => {
      setPatchingOnline(false);
    });
    window.ipcRenderer.on("online-unpatch-error", (_, error: unknown) => {
      setPatchingOnline(false);
      const payload: any = error;
      const code =
        payload && typeof payload === "object" && typeof payload.code === "number"
          ? payload.code
          : typeof payload === "number"
            ? payload
            : 1000;
      console.error("Online unpatch error code:", code);
      alert(`Error #${code}`);
    });
    window.ipcRenderer.on("online-patch-error", (_, error: unknown) => {
      setPatchingOnline(false);
      const payload: any = error;
      const code =
        payload && typeof payload === "object" && typeof payload.code === "number"
          ? payload.code
          : typeof payload === "number"
            ? payload
            : 1000;
      console.error("Online patch error code:", code);
      alert(`Error #${code}`);
    });
    window.ipcRenderer.on("install-started", () => {
      setInstalling(true);
      setCancelingBuildDownload(false);
    });
    window.ipcRenderer.on("install-finished", (_, version) => {
      setInstalling(false);
      setInstallingVersion(null);
      setCancelingBuildDownload(false);

      // Immediately reflect install completion in UI (Play should appear right away).
      try {
        localStorage.setItem(
          `selectedVersion:${version.type}`,
          String(version.build_index),
        );
      } catch {
        // ignore
      }

      const applyInstalled = (list: GameVersion[]) => {
        const next = list.map((v) =>
          v.type === version.type && v.build_index === version.build_index
            ? { ...v, installed: true }
            : v,
        );

        // If the version isn't present (rare/offline), append a minimal entry.
        if (
          !next.some(
            (v) =>
              v.type === version.type && v.build_index === version.build_index,
          )
        ) {
          next.unshift({
            ...version,
            installed: true,
          });
        }

        // Keep newest-first ordering.
        next.sort((a, b) => b.build_index - a.build_index);
        return next;
      };

      if (version.type === "release") {
        setReleaseVersions((prev) => {
          const next = applyInstalled(prev);
          const idx = next.findIndex(
            (v) => v.build_index === version.build_index,
          );
          if (idx !== -1) {
            setSelectedIndexByType((p) => ({ ...p, release: idx }));
          }
          return next;
        });
      } else {
        setPreReleaseVersions((prev) => {
          const next = applyInstalled(prev);
          const idx = next.findIndex(
            (v) => v.build_index === version.build_index,
          );
          if (idx !== -1) {
            setSelectedIndexByType((p) => ({ ...p, "pre-release": idx }));
          }
          return next;
        });
      }

      // Then refresh installed state from filesystem (and remote if available).
      void checkForUpdates("manual");
    });
    window.ipcRenderer.on("install-error", (_, error: unknown) => {
      setInstalling(false);
      setInstallingVersion(null);
      setCancelingBuildDownload(false);
      const payload: any = error;
      const code =
        payload && typeof payload === "object" && typeof payload.code === "number"
          ? payload.code
          : typeof payload === "number"
            ? payload
            : 1000;
      console.error("Install error code:", code);
      alert(`Error #${code}`);
    });

    window.ipcRenderer.on("install-cancelled", () => {
      // user cancelled the download so we gracefully stop pretending we were busy
      setInstalling(false);
      setInstallingVersion(null);
      setCancelingBuildDownload(false);
    });

    window.ipcRenderer.on("install-cancel-not-possible", () => {
      // nothing to cancel so we just reset the button state
      setCancelingBuildDownload(false);
    });

    (async () => {
      // Prefer the persisted download directory if present.
      try {
        const persisted = await (window.config as any).getDownloadDirectory?.();
        if (typeof persisted === "string" && persisted.trim()) {
          setGameDir(persisted);
          return;
        }
      } catch {
        // ignore
      }

      const fallback = await window.config.getDefaultGameDirectory();
      setGameDir(fallback);
    })();
  }, []);

  useEffect(() => {
    if (!gameDir) return;
    // Fetch list early (during launcher startup), but do not start patching until UI is visible.
    checkForUpdates("startup");
  }, [gameDir, checkForUpdates]);

  useEffect(() => {
    if (!availableVersions.length) return;
    const selected = availableVersions[selectedVersion];
    if (!selected) return;
    localStorage.setItem(
      `selectedVersion:${versionType}`,
      selected.build_index.toString(),
    );
  }, [selectedVersion, availableVersions]);

  return (
    <GameContext.Provider
      value={{
        gameDir,
        setGameDir,
        offlineMode,
        versionType,
        setVersionType,
        availableVersions,
        setAvailableVersions,
        selectedVersion,
        setSelectedVersion,
        updateAvailable,
        updateDismissed,
        dismissUpdateForNow,
        restoreUpdatePrompt,
        installing,
        installProgress,
        installingVersion,
        cancelBuildDownload,
        cancelingBuildDownload,
        patchingOnline,
        patchProgress,
        pendingOnlinePatch: false,
        checkingUpdates,
        launching,
        gameLaunched,
        installGame,
        launchGame,
        checkForUpdates,
        startPendingOnlinePatch: () => {},
        reconnect,
      }}
    >
      {children}
    </GameContext.Provider>
  );
};

export const useGameContext = () => {
  const context = useContext(GameContext);
  if (!context)
    throw new Error("useGameContext must be used within a GameContextProvider");
  return context;
};
