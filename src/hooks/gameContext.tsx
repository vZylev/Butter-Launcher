import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import {
  getGameVersions,
  getInstalledGameVersions,
  saveInstalledGameVersion,
} from "../utils/game";

interface GameContextType {
  gameDir: string | null;
  availableVersions: GameVersion[];
  selectedVersion: number;
  installing: boolean;
  installProgress: InstallProgress;
  launching: boolean;
  gameLaunched: boolean;
  installGame: (version: GameVersion) => void;
  launchGame: (version: GameVersion, username: string) => void;
}

export const GameContext = createContext<GameContextType | null>(null);

export const GameContextProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [gameDir, setGameDir] = useState<string | null>(null);
  const [availableVersions, setAvailableVersions] = useState<GameVersion[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<number>(0);

  const [installing, setInstalling] = useState(false);
  const [installProgress, setInstallProgress] = useState<InstallProgress>({
    phase: "download",
    percent: 0,
    total: 0,
    current: 0,
  });
  const [launching, setLaunching] = useState(false);
  const [gameLaunched, setGameLaunched] = useState(false);

  const installGame = useCallback(
    (version: GameVersion) => {
      if (!gameDir) return;

      window.ipcRenderer.send("install-game", gameDir, version);
    },
    [gameDir]
  );

  const launchGame = useCallback(
    (version: GameVersion, username: string) => {
      if (!gameDir || !version.installed) return;
      setLaunching(true);

      window.ipcRenderer.send("launch-game", gameDir, version, username);
      window.ipcRenderer.once("launched", () => {
        setLaunching(false);
        setGameLaunched(true);
      });
      window.ipcRenderer.once("launch-finished", () => {
        setLaunching(false);
        setGameLaunched(false);
      });
      window.ipcRenderer.once("launch-error", () => {
        setLaunching(false);
        setGameLaunched(false);
      });
    },
    [gameDir]
  );

  const getAvailableVersions = async () => {
    const local = getInstalledGameVersions();
    setAvailableVersions(local); // set available from installed while loading remote

    let remote = await getGameVersions();
    if (remote.length === 0) return;

    remote = remote.map((version) => {
      const installed = local.find(
        (v) => v.build_index === version.build_index
      );
      return {
        ...version,
        installed: !!installed,
      };
    });

    setAvailableVersions(remote);
  };

  useEffect(() => {
    if (!window.config) return;

    const bounceTimeout = 200;
    let lastUpdateProgress: number;
    window.ipcRenderer.on("install-progress", (_, progress) => {
      if (lastUpdateProgress && Date.now() - lastUpdateProgress < bounceTimeout)
        return;
      lastUpdateProgress = Date.now();

      setInstallProgress(progress);
    });
    window.ipcRenderer.on("install-started", () => {
      setInstalling(true);
    });
    window.ipcRenderer.on("install-finished", (_, version) => {
      setInstalling(false);
      saveInstalledGameVersion(version);
    });
    window.ipcRenderer.on("install-error", (_, error) => {
      setInstalling(false);
      alert(`Installation failed: ${error}`);
    });

    (async () => {
      const defaultGameDirectory =
        await window.config.getDefaultGameDirectory();

      setGameDir(defaultGameDirectory);
    })();

    getAvailableVersions();
  }, []);

  useEffect(() => {
    if (!availableVersions.length) return;
    console.log("availableVersions", availableVersions);

    try {
      const buildIndex = localStorage.getItem("selectedVersionBuildIndex");
      if (!buildIndex) throw new Error("No build index found");

      const version = parseInt(buildIndex);
      const found = availableVersions.findIndex(
        (v) => v.build_index === version
      );
      if (found) setSelectedVersion(found);
    } catch (e) {
      setSelectedVersion(
        availableVersions[availableVersions.length - 1].build_index
      );
    }
  }, [availableVersions]);

  useEffect(() => {
    if (!selectedVersion) return;
    localStorage.setItem(
      "selectedVersionBuildIndex",
      availableVersions[selectedVersion].build_index.toString()
    );
  }, [selectedVersion, availableVersions]);

  return (
    <GameContext.Provider
      value={{
        gameDir,
        availableVersions,
        selectedVersion,
        installing,
        installProgress,
        launching,
        gameLaunched,
        installGame,
        launchGame,
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
