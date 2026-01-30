import { useUserContext } from "./hooks/userContext";
import Launcher from "./components/Launcher";
import Login from "./components/Login";
import Loader from "./components/Loader";
import { useState, useEffect } from "react";
import LauncherUpdateModal, {
  LauncherUpdateInfo,
} from "./components/LauncherUpdateModal";
import { compareSemver } from "./utils/semver";

type RemoteLauncherVersion = {
  version: string;
  publishedAt?: string;
  url?: string;
  changelog?: string | string[];
};

const LAUNCHER_VERSION_URL =
  (import.meta as any).env?.VITE_LAUNCHER_VERSION_URL ||
  "https://updates.butterlauncher.tech/version.json";

const SUPPRESS_KEY = "suppressLauncherUpdateVersion";

export default function App() {
  const { ready, username, setUsername } = useUserContext();
  const [showLoader, setShowLoader] = useState(true);
  const [fade, setFade] = useState(false);

  const [launcherUpdateOpen, setLauncherUpdateOpen] = useState(false);
  const [launcherUpdateInfo, setLauncherUpdateInfo] = useState<
    LauncherUpdateInfo | null
  >(null);

  useEffect(() => {
    let enableRPC = false;
    try {
      enableRPC = !!window.localStorage.getItem("enableRPC");
    } catch {
      enableRPC = false;
    }
    window.ipcRenderer.send("ready", {
      enableRPC,
    });

    if (ready) {
      setFade(true);
      const timeout = setTimeout(() => setShowLoader(false), 1000);
      return () => clearTimeout(timeout);
    }
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    if (showLoader) return;

    let cancelled = false;

    const safeString = (v: unknown) => (typeof v === "string" ? v.trim() : "");

    const load = async () => {
      try {
        const currentVersion = safeString((window.config as any)?.VERSION);
        if (!currentVersion) return;

        const remote = (await window.ipcRenderer.invoke(
          "fetch:json",
          LAUNCHER_VERSION_URL,
        )) as RemoteLauncherVersion;

        const latestVersion = safeString(remote?.version);
        if (!latestVersion) return;

        // If the user opted out of this specific latest version, don't prompt again.
        try {
          const suppressed = safeString(localStorage.getItem(SUPPRESS_KEY));
          if (suppressed && suppressed === latestVersion) return;
        } catch {
          // ignore
        }

        // Show prompt only when current < latest.
        if (compareSemver(currentVersion, latestVersion) >= 0) return;

        const info: LauncherUpdateInfo = {
          currentVersion,
          latestVersion,
          publishedAt: safeString(remote?.publishedAt) || undefined,
          url: safeString(remote?.url) || undefined,
          changelog:
            typeof remote?.changelog === "string" || Array.isArray(remote?.changelog)
              ? remote.changelog
              : undefined,
        };

        if (cancelled) return;
        setLauncherUpdateInfo(info);
        setLauncherUpdateOpen(true);
      } catch {
        // ignore (no update prompt if feed fails)
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [ready, showLoader]);

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {launcherUpdateInfo && (
        <LauncherUpdateModal
          open={launcherUpdateOpen}
          info={launcherUpdateInfo}
          onClose={(dontRemindAgain) => {
            if (dontRemindAgain) {
              try {
                localStorage.setItem(SUPPRESS_KEY, launcherUpdateInfo.latestVersion);
              } catch {
                // ignore
              }
            }
            setLauncherUpdateOpen(false);
          }}
          onUpdate={async (dontRemindAgain) => {
            if (dontRemindAgain) {
              try {
                localStorage.setItem(SUPPRESS_KEY, launcherUpdateInfo.latestVersion);
              } catch {
                // ignore
              }
            }

            const url = "https://butterlauncher.tech";
            try {
              await (window.config as any).openExternal?.(url);
            } catch {
              // ignore
            }
            setLauncherUpdateOpen(false);
          }}
        />
      )}
      <div
        className="w-full h-full min-h-screen flex flex-col"
        style={{ position: "relative" }}
      >
        {showLoader && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 10000,
              pointerEvents: "all",
              opacity: fade ? 0 : 1,
              transition: "opacity 1s",
            }}
          >
            <Loader />
          </div>
        )}
        {!showLoader &&
          (ready ? (
            username ? (
              <Launcher onLogout={() => setUsername(null)} />
            ) : (
              <Login onLogin={(username) => setUsername(username)} />
            )
          ) : null)}
      </div>
    </div>
  );
}
