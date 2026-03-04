/**
 * Game store — Zustand replacement for the monolithic GameContext.
 *
 * Holds all game-related state (versions, install progress, launch
 * state, online-patch status).  IPC listeners are set up once via
 * the `initGameListeners()` function called from the provider.
 */

import { create } from "zustand";
import {
  IPC_FETCH_HEAD,
  IPC_INSTALL_PROGRESS,
  IPC_INSTALL_STARTED,
  IPC_INSTALL_FINISHED,
  IPC_INSTALL_ERROR,
  IPC_INSTALL_CANCELLED,
  IPC_INSTALL_CANCEL_NOT_POSSIBLE,
  IPC_ONLINE_PATCH_PROGRESS,
  IPC_ONLINE_PATCH_FINISHED,
  IPC_ONLINE_PATCH_ERROR,
  IPC_ONLINE_UNPATCH_PROGRESS,
  IPC_ONLINE_UNPATCH_FINISHED,
  IPC_ONLINE_UNPATCH_ERROR,
  IPC_LAUNCHED,
  IPC_LAUNCH_FINISHED,
  IPC_LAUNCH_ERROR,
} from "../ipc/channels";
import { GameService, type InstalledVersionInfo } from "../services/GameService";
import { StorageService } from "../services/StorageService";
import {
  buildDifferentialPwrUrl,
  getEmergencyMode,
  getGameVersions,
  getManifestInfoForBuild,
} from "../utils/game";

// ── Types ──────────────────────────────────────────────────────

type SmartUpdateInfo = {
  fromBuildIndex: number;
  toBuildIndex: number;
  patchUrl: string;
};

interface GameState {
  gameDir: string | null;
  offlineMode: boolean;
  versionType: VersionType;
  releaseVersions: GameVersion[];
  preReleaseVersions: GameVersion[];
  selectedIndexByType: Record<VersionType, number>;
  updateAvailable: boolean;
  updateDismissed: boolean;
  smartUpdate: SmartUpdateInfo | null;
  checkingSmartUpdate: boolean;
  installing: boolean;
  installingVersion: GameVersion | null;
  cancelingBuildDownload: boolean;
  installProgress: InstallProgress;
  patchingOnline: boolean;
  patchProgress: InstallProgress;
  pendingOnlinePatch: boolean;
  checkingUpdates: boolean;
  emergencyMode: boolean;
  launching: boolean;
  gameLaunched: boolean;
  runningVersion: GameVersion | null;
}

interface GameActions {
  setGameDir: (dir: string | null) => void;
  setVersionType: (t: VersionType) => void;
  setSelectedVersion: (idx: number) => void;
  setAvailableVersions: (versions: GameVersion[]) => void;
  dismissUpdateForNow: () => void;
  restoreUpdatePrompt: () => void;
  installGame: (version: GameVersion) => void;
  smartInstallGame: (version: GameVersion, fromBuildIndex: number) => void;
  cancelBuildDownload: () => void;
  launchGame: (version: GameVersion, username: string) => void;
  checkForUpdates: (reason?: "startup" | "manual") => Promise<void>;
  startPendingOnlinePatch: () => void;
  reconnect: () => void;
}

// ── Derived selectors ──────────────────────────────────────────

const selectAvailableVersions = (s: GameState): GameVersion[] =>
  s.versionType === "release" ? s.releaseVersions : s.preReleaseVersions;

const selectSelectedVersion = (s: GameState): number =>
  s.selectedIndexByType[s.versionType] ?? 0;

const selectHasBuild1Installed = (s: GameState): boolean => {
  const versions =
    s.versionType === "release"
      ? s.releaseVersions
      : s.preReleaseVersions;
  return versions.some((v) => v.installed && v.build_index === 1);
};

// ── Store ──────────────────────────────────────────────────────

export const useGameStore = create<GameState & GameActions>()((set, get) => ({
  // State
  gameDir: null,
  offlineMode: false,
  versionType: "release",
  releaseVersions: [],
  preReleaseVersions: [],
  selectedIndexByType: { release: 0, "pre-release": 0 },
  updateAvailable: false,
  updateDismissed: false,
  smartUpdate: null,
  checkingSmartUpdate: false,
  installing: false,
  installingVersion: null,
  cancelingBuildDownload: false,
  installProgress: { phase: "download", percent: 0, total: 0, current: 0 },
  patchingOnline: false,
  patchProgress: { phase: "online-patch", percent: -1 },
  pendingOnlinePatch: false,
  checkingUpdates: false,
  emergencyMode: false,
  launching: false,
  gameLaunched: false,
  runningVersion: null,

  // Actions

  setGameDir: (dir) => set({ gameDir: dir }),

  setVersionType: (t) => set({ versionType: t }),

  setSelectedVersion: (idx) => {
    const { versionType } = get();
    set((s) => ({
      selectedIndexByType: { ...s.selectedIndexByType, [versionType]: idx },
    }));
  },

  setAvailableVersions: (versions) => {
    const { versionType } = get();
    if (versionType === "release") {
      set({ releaseVersions: versions });
    } else {
      set({ preReleaseVersions: versions });
    }
  },

  dismissUpdateForNow: () => {
    const { releaseVersions, versionType } = get();
    set({ updateDismissed: true });
    if (versionType !== "release") set({ versionType: "release" });

    const installed = releaseVersions
      .filter((v) => v.installed)
      .sort((a, b) => b.build_index - a.build_index);
    const newest = installed[0];
    if (!newest) return;
    const idx = releaseVersions.findIndex(
      (v) => v.build_index === newest.build_index && v.type === "release",
    );
    if (idx !== -1) {
      set((s) => ({
        selectedIndexByType: { ...s.selectedIndexByType, release: idx },
      }));
    }
  },

  restoreUpdatePrompt: () => set({ updateDismissed: false }),

  installGame: (version) => {
    const { gameDir } = get();
    if (!gameDir) return;
    set({ installingVersion: version, cancelingBuildDownload: false });
    GameService.installGame(gameDir, version);
  },

  smartInstallGame: (version, fromBuildIndex) => {
    const { gameDir } = get();
    if (!gameDir || !Number.isFinite(fromBuildIndex) || fromBuildIndex <= 0) return;
    set({ installingVersion: version, cancelingBuildDownload: false });
    GameService.installGameSmart(gameDir, version, fromBuildIndex);
  },

  cancelBuildDownload: () => {
    const { gameDir, installingVersion } = get();
    if (!gameDir || !installingVersion) return;
    set({ cancelingBuildDownload: true });
    GameService.cancelBuildDownload(gameDir, installingVersion);
  },

  launchGame: (version, username) => {
    const { gameDir, offlineMode } = get();
    if (!gameDir || !version.installed) return;
    set({ launching: true, runningVersion: version });

    try {
      StorageService.setDynamic(
        `selectedVersion:${version.type}`,
        version.build_index.toString(),
      );
    } catch { /* ignore */ }

    // Register one-shot listeners.
    window.ipcRenderer.once(IPC_LAUNCHED, () => {
      set({ launching: false, gameLaunched: true });
    });
    window.ipcRenderer.once(IPC_LAUNCH_FINISHED, () => {
      set({ launching: false, gameLaunched: false, runningVersion: null });
    });
    window.ipcRenderer.once(IPC_LAUNCH_ERROR, (_, error?: unknown) => {
      set({ launching: false, gameLaunched: false, runningVersion: null });
      const payload: any = error;
      const code =
        payload && typeof payload === "object" && typeof payload.code === "number"
          ? payload.code
          : typeof payload === "number" ? payload : 1000;
      console.error("Launch error code:", code);
      alert(`Error #${code}`);
    });

    GameService.launchGame(gameDir, version, username, offlineMode);
  },

  checkForUpdates: async (_reason = "startup") => {
    const { gameDir } = get();
    if (!gameDir) return;
    set({ checkingUpdates: true });

    try {
      const installed = await GameService.listInstalledVersions(gameDir);
      const isOnline = await GameService.checkConnectivity();

      if (!isOnline) {
        const buildList = (t: VersionType): GameVersion[] =>
          installed
            .filter((x) => x.type === t)
            .map((x) => ({
              type: t,
              build_index: x.build_index,
              build_name: x.build_name || `Build-${x.build_index}`,
              isLatest: !!x.isLatest,
              installed: true,
              url: "",
            }))
            .sort((a, b) => b.build_index - a.build_index);

        const nextRelease = buildList("release");
        const nextPre = buildList("pre-release");

        const pickIndex = (list: GameVersion[], t: VersionType) => {
          const raw = StorageService.getDynamic(`selectedVersion:${t}`);
          const savedBuild = raw ? Number(raw) : NaN;
          if (Number.isFinite(savedBuild)) {
            const idx = list.findIndex((v) => v.build_index === savedBuild);
            if (idx !== -1) return idx;
          }
          return 0;
        };

        set({
          offlineMode: true,
          smartUpdate: null,
          checkingSmartUpdate: false,
          emergencyMode: false,
          releaseVersions: nextRelease,
          preReleaseVersions: nextPre,
          updateAvailable: false,
          selectedIndexByType: {
            release: pickIndex(nextRelease, "release"),
            "pre-release": pickIndex(nextPre, "pre-release"),
          },
          versionType: nextRelease.length ? "release" : nextPre.length ? "pre-release" : "release",
        });
        return;
      }

      if (get().offlineMode) set({ offlineMode: false });

      const releaseInstalledSet = new Set<number>();
      const preReleaseInstalledSet = new Set<number>();
      for (const item of installed) {
        if (item.type === "release") releaseInstalledSet.add(item.build_index);
        else preReleaseInstalledSet.add(item.build_index);
      }

      const isInstalled = (t: VersionType, idx: number) =>
        t === "release" ? releaseInstalledSet.has(idx) : preReleaseInstalledSet.has(idx);

      const [remoteRelease, remotePre] = await Promise.all([
        getGameVersions("release"),
        getGameVersions("pre-release"),
      ]);

      set({ emergencyMode: getEmergencyMode() });

      const mergeWithInstalled = (
        remote: GameVersion[],
        installed: InstalledVersionInfo[],
        t: VersionType,
      ): GameVersion[] => {
        const byIndex = new Map<number, GameVersion>();
        for (const v of remote) {
          if (!v || !Number.isFinite(v.build_index)) continue;
          byIndex.set(v.build_index, { ...v, installed: isInstalled(t, v.build_index) });
        }
        for (const item of installed) {
          if (item.type !== t) continue;
          const idx = Number(item.build_index);
          if (!Number.isFinite(idx) || idx <= 0 || byIndex.has(idx)) continue;
          const fromManifest = getManifestInfoForBuild(t, idx) ?? {};
          byIndex.set(idx, {
            type: t,
            build_index: idx,
            build_name: (typeof fromManifest.build_name === "string" && fromManifest.build_name.trim())
              ? fromManifest.build_name as string
              : item.build_name || `Build-${idx}`,
            isLatest: !!item.isLatest,
            installed: true,
            url: "",
            ...(fromManifest as any),
          });
        }
        return Array.from(byIndex.values()).sort((a, b) => b.build_index - a.build_index);
      };

      const releaseBase = remoteRelease.length ? remoteRelease : get().releaseVersions;
      const preBase = remotePre.length ? remotePre : get().preReleaseVersions;

      const mergedRelease = mergeWithInstalled(releaseBase.map(v => ({ ...v, installed: isInstalled("release", v.build_index) })), installed, "release");
      const mergedPre = mergeWithInstalled(preBase.map(v => ({ ...v, installed: isInstalled("pre-release", v.build_index) })), installed, "pre-release");

      const newestInstalled = mergedRelease
        .filter((v) => v.installed)
        .reduce<GameVersion | undefined>((best, v) =>
          !best || v.build_index > best.build_index ? v : best, undefined);

      const latestRelease = mergedRelease.find((v) => v.isLatest) ?? mergedRelease[0];
      const hasUpdate =
        !!newestInstalled && !!latestRelease &&
        latestRelease.build_index > newestInstalled.build_index;

      // Smart update detection.
      let smartUpdateInfo: SmartUpdateInfo | null = null;
      if (hasUpdate && newestInstalled && latestRelease) {
        set({ checkingSmartUpdate: true });
        try {
          const url = buildDifferentialPwrUrl(
            "release",
            newestInstalled.build_index,
            latestRelease.build_index,
          );
          const status = await window.ipcRenderer.invoke(IPC_FETCH_HEAD, url);
          if (status === 200) {
            smartUpdateInfo = {
              fromBuildIndex: newestInstalled.build_index,
              toBuildIndex: latestRelease.build_index,
              patchUrl: url,
            };
          }
        } catch { /* ignore */ }
        set({ checkingSmartUpdate: false });
      }

      const pickIndex = (list: GameVersion[], t: VersionType) => {
        const raw = StorageService.getDynamic(`selectedVersion:${t}`);
        const savedBuild = raw ? Number(raw) : NaN;
        if (Number.isFinite(savedBuild)) {
          const idx = list.findIndex((v) => v.build_index === savedBuild);
          if (idx !== -1) return idx;
        }
        return 0;
      };

      set({
        releaseVersions: mergedRelease,
        preReleaseVersions: mergedPre,
        updateAvailable: hasUpdate,
        smartUpdate: smartUpdateInfo,
        selectedIndexByType: {
          release: pickIndex(mergedRelease, "release"),
          "pre-release": pickIndex(mergedPre, "pre-release"),
        },
      });
    } finally {
      set({ checkingUpdates: false });
    }
  },

  startPendingOnlinePatch: () => {
    set({ pendingOnlinePatch: true });
  },

  reconnect: () => {
    const { checkForUpdates } = get();
    void checkForUpdates("manual");
  },
}));

// ── Selectors (exported for components) ────────────────────────

export { selectAvailableVersions, selectSelectedVersion, selectHasBuild1Installed };

// ── IPC listener init (call once from provider) ────────────────

let listenersInitialized = false;

export function initGameListeners(): void {
  if (listenersInitialized) return;
  listenersInitialized = true;

  const ipc = window.ipcRenderer;
  if (!ipc) return;

  ipc.on(IPC_INSTALL_PROGRESS, (_: unknown, progress: InstallProgress) => {
    useGameStore.setState({ installing: true, installProgress: progress });
  });

  ipc.on(IPC_INSTALL_STARTED, () => {
    useGameStore.setState({ installing: true });
  });

  ipc.on(IPC_INSTALL_FINISHED, (_: unknown, _gameDir: string, version: GameVersion) => {
    useGameStore.setState((s) => {
      const updateVersions = (list: GameVersion[]): GameVersion[] =>
        list.map((v) =>
          v.build_index === version.build_index && v.type === version.type
            ? { ...v, installed: true }
            : v,
        );
      return {
        installing: false,
        installingVersion: null,
        cancelingBuildDownload: false,
        installProgress: { phase: "download", percent: 0, total: 0, current: 0 },
        releaseVersions: updateVersions(s.releaseVersions),
        preReleaseVersions: updateVersions(s.preReleaseVersions),
      };
    });
  });

  ipc.on(IPC_INSTALL_ERROR, (_: unknown, error?: unknown) => {
    useGameStore.setState({
      installing: false,
      installingVersion: null,
      cancelingBuildDownload: false,
    });
    const payload: any = error;
    const code =
      payload && typeof payload === "object" && typeof payload.code === "number"
        ? payload.code
        : typeof payload === "number" ? payload : 1000;
    console.error("Install error code:", code);
    alert(`Error #${code}`);
  });

  ipc.on(IPC_INSTALL_CANCELLED, () => {
    useGameStore.setState({
      installing: false,
      installingVersion: null,
      cancelingBuildDownload: false,
      installProgress: { phase: "download", percent: 0, total: 0, current: 0 },
    });
  });

  ipc.on(IPC_INSTALL_CANCEL_NOT_POSSIBLE, () => {
    useGameStore.setState({ cancelingBuildDownload: false });
  });

  ipc.on(IPC_ONLINE_PATCH_PROGRESS, (_: unknown, progress: InstallProgress) => {
    useGameStore.setState({ patchingOnline: true, patchProgress: progress });
  });

  ipc.on(IPC_ONLINE_PATCH_FINISHED, () => {
    useGameStore.setState({
      patchingOnline: false,
      pendingOnlinePatch: false,
      patchProgress: { phase: "online-patch", percent: -1 },
    });
  });

  ipc.on(IPC_ONLINE_PATCH_ERROR, () => {
    useGameStore.setState({
      patchingOnline: false,
      patchProgress: { phase: "online-patch", percent: -1 },
    });
  });

  ipc.on(IPC_ONLINE_UNPATCH_PROGRESS, (_: unknown, progress: InstallProgress) => {
    useGameStore.setState({ patchingOnline: true, patchProgress: progress });
  });

  ipc.on(IPC_ONLINE_UNPATCH_FINISHED, () => {
    useGameStore.setState({
      patchingOnline: false,
      patchProgress: { phase: "online-patch", percent: -1 },
    });
  });

  ipc.on(IPC_ONLINE_UNPATCH_ERROR, () => {
    useGameStore.setState({
      patchingOnline: false,
      patchProgress: { phase: "online-patch", percent: -1 },
    });
  });
}
