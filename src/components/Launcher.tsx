import React, { useEffect, useState } from "react";
import { useGameContext } from "../hooks/gameContext";
import { useUserContext } from "../hooks/userContext";
import butterBg from "../assets/butter-bg.png";
import butterLogo from "../assets/butter-logo.png";
import SettingsModal from "./SettingsModal";
import settingsIcon from "../assets/settings.svg";
import DragBar from "./DragBar";
import ProgressBar from "./ProgressBar";
import { IconChevronDown } from "@tabler/icons-react";

type NewsItem = {
  title: string;
  content: string;
  url?: string;
  date?: string;
};

type NewsFeed = {
  version: number;
  items: NewsItem[];
};

const NEWS_URL =
  (import.meta as any).env?.VITE_NEWS_URL ||
  "https://updates.butterlauncher.tech/news.json";

const Launcher: React.FC<{ onLogout?: () => void }> = ({ onLogout }) => {
  const {
    gameDir,
    versionType,
    setVersionType,
    availableVersions,
    selectedVersion,
    setSelectedVersion,
    updateAvailable,
    updateDismissed,
    dismissUpdateForNow,
    restoreUpdatePrompt,
    installing,
    installProgress,
    patchingOnline,
    patchProgress,
    installGame,
    launchGame,
    launching,
    gameLaunched,
  } = useGameContext();
  const { username } = useUserContext();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newsItems, setNewsItems] = useState<NewsItem[]>([]);
  const [openNews, setOpenNews] = useState<NewsItem | null>(null);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [patchConfirmOpen, setPatchConfirmOpen] = useState(false);
  const [onlinePatchEnabled, setOnlinePatchEnabled] = useState(false);
  const [needsFixClient, setNeedsFixClient] = useState(false);
  const [patchOutdated, setPatchOutdated] = useState(false);

  const currentInstalledSorted = availableVersions
    .filter((v) => v.installed)
    .sort((a, b) => a.build_index - b.build_index);
  const currentInstalledVersion =
    currentInstalledSorted.length > 0
      ? currentInstalledSorted[currentInstalledSorted.length - 1]
      : undefined;

  const latestVersion = availableVersions.length > 0 ? availableVersions[0] : null;
  const latestLabel = latestVersion
    ? (latestVersion.build_name?.trim() || `Build-${latestVersion.build_index}`)
    : "Checking...";

  const latestRelease =
    versionType === "release"
      ? (availableVersions.find((v) => v.isLatest) ?? availableVersions[0] ?? null)
      : null;

  const selected = availableVersions[selectedVersion];
  const selectedLabel = selected
    ? (selected.build_name?.trim() || `Build-${selected.build_index}`)
    : "";

  const patchAvailable =
    window.config.OS === "win32" &&
    !!selected &&
    !!selected.installed &&
    !!selected.patch_url &&
    !!selected.patch_hash;

  const showUpdate =
    versionType === "release" &&
    updateAvailable &&
    !updateDismissed &&
    availableVersions.some((v) => v.installed) &&
    !!latestRelease &&
    !latestRelease.installed;

  useEffect(() => {
    let cancelled = false;

    const normalize = (feed: any): NewsItem[] => {
      const items = Array.isArray(feed?.items) ? feed.items : [];
      return items
        .filter((x: any) => x && typeof x.title === "string" && typeof x.content === "string")
        .map((x: any) => ({
          title: String(x.title),
          content: String(x.content),
          url: typeof x.url === "string" ? x.url : undefined,
          date: typeof x.date === "string" ? x.date : undefined,
        }));
    };

    const load = async () => {
      // Remote first (avoids CORS issues by using Electron main fetch).
      try {
        const remote = (await window.ipcRenderer.invoke("fetch:json", NEWS_URL)) as NewsFeed;
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
        if (!cancelled && normalized.length) setNewsItems(normalized.slice(0, 3));
      } catch {
        if (!cancelled) {
          setNewsItems([
            {
              title: "News unavailable",
              content: "Unable to load updates feed. Check your connection or try again later.",
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
    let cancelled = false;
    const run = async () => {
      if (!patchAvailable || !gameDir || !selected) {
        if (!cancelled) setOnlinePatchEnabled(false);
        if (!cancelled) setNeedsFixClient(false);
        if (!cancelled) setPatchOutdated(false);
        return;
      }

      try {
        const health = (await window.ipcRenderer.invoke(
          "online-patch:health",
          gameDir,
          selected,
        )) as { enabled?: boolean; needsFixClient?: boolean; patchOutdated?: boolean };
        if (!cancelled) {
          setOnlinePatchEnabled(!!health?.enabled);
          setNeedsFixClient(!!health?.needsFixClient);
          setPatchOutdated(!!health?.patchOutdated);
        }
      } catch {
        if (!cancelled) {
          setOnlinePatchEnabled(false);
          setNeedsFixClient(false);
          setPatchOutdated(false);
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [gameDir, patchAvailable, selected?.build_index, selected?.type]);

  useEffect(() => {
    if (!gameDir) return;

    const refresh = async () => {
      if (!patchAvailable || !selected) return;
      try {
        const health = (await window.ipcRenderer.invoke(
          "online-patch:health",
          gameDir,
          selected,
        )) as { enabled?: boolean; needsFixClient?: boolean; patchOutdated?: boolean };
        setOnlinePatchEnabled(!!health?.enabled);
        setNeedsFixClient(!!health?.needsFixClient);
        setPatchOutdated(!!health?.patchOutdated);
      } catch {
        setOnlinePatchEnabled(false);
        setNeedsFixClient(false);
        setPatchOutdated(false);
      }
    };

    const onPatched = () => void refresh();
    const onUnpatched = () => void refresh();
    window.ipcRenderer.on("online-patch-finished", onPatched);
    window.ipcRenderer.on("online-unpatch-finished", onUnpatched);

    return () => {
      window.ipcRenderer.off("online-patch-finished", onPatched);
      window.ipcRenderer.off("online-unpatch-finished", onUnpatched);
    };
  }, [gameDir, patchAvailable, selected?.build_index, selected?.type]);

  const handleLaunch = () => {
    if (selectedVersion == null || !availableVersions[selectedVersion]) return;
    if (!username) return;

    if (showUpdate && latestRelease) {
      const latestIdx = availableVersions.findIndex(
        (v) => v.type === "release" && v.build_index === latestRelease.build_index,
      );
      if (latestIdx !== -1) setSelectedVersion(latestIdx);
      installGame(latestRelease);
      return;
    }

    if (availableVersions[selectedVersion].installed) {
      launchGame(availableVersions[selectedVersion], username);
      return;
    }

    installGame(availableVersions[selectedVersion]);
  };

  const startOnlinePatch = () => {
    if (!gameDir || !selected) return;
    window.ipcRenderer.send("online-patch:enable", gameDir, selected);
  };

  const disableOnlinePatch = () => {
    if (!gameDir || !selected) return;
    window.ipcRenderer.send("online-patch:disable", gameDir, selected);
  };

  const fixClient = () => {
    if (!gameDir || !selected) return;
    window.ipcRenderer.send("online-patch:fix-client", gameDir, selected);
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
      <DragBar />

      <div className="absolute top-10 left-3 z-30 w-64">
        <button
          type="button"
          className="w-full bg-black/45 hover:bg-black/55 backdrop-blur-md rounded-xl shadow-xl border border-white/10 px-3 py-2 flex items-center justify-between transition"
          onClick={() => setVersionsOpen((v) => !v)}
          title={versionsOpen ? "Hide versions" : "Show versions"}
        >
          <div className="flex flex-col text-left">
            <div className="text-sm font-extrabold tracking-wide text-white">Versions</div>
            <div className="text-[10px] text-gray-200/80 font-mono">
              {versionType === "release" ? "Release" : "Pre-release"}
              {selected ? ` • ${selectedLabel}` : ""}
            </div>
          </div>
          <IconChevronDown
            size={18}
            className={`text-white/80 transition-transform duration-300 ${
              versionsOpen ? "rotate-180" : "rotate-0"
            }`}
          />
        </button>

        <div
          className={`mt-2 rounded-xl border border-white/10 bg-black/45 backdrop-blur-md shadow-xl overflow-hidden transition-all duration-300 ${
            versionsOpen
              ? "max-h-[220px] opacity-100 translate-y-0"
              : "max-h-0 opacity-0 -translate-y-1 pointer-events-none"
          } ${versionsOpen ? "animate-popIn animate-softGlow" : ""}`}
        >
          <div className="p-3">
            <div className="flex gap-1 mb-3 bg-white/5 rounded-lg p-1">
              <button
                type="button"
                className={`flex-1 text-xs px-2 py-1 rounded-md transition ${
                  versionType === "release"
                    ? "bg-gradient-to-r from-[#3b82f6] to-[#60a5fa] text-white shadow"
                    : "text-gray-200 hover:bg-white/10"
                }`}
                onClick={() => {
                  restoreUpdatePrompt();
                  setVersionType("release");
                }}
              >
                Release
              </button>
              <button
                type="button"
                className={`flex-1 text-xs px-2 py-1 rounded-md transition ${
                  versionType === "pre-release"
                    ? "bg-gradient-to-r from-[#3b82f6] to-[#60a5fa] text-white shadow"
                    : "text-gray-200 hover:bg-white/10"
                }`}
                onClick={() => {
                  restoreUpdatePrompt();
                  setVersionType("pre-release");
                }}
              >
                Pre-release
              </button>
            </div>

            <label className="block text-[11px] text-gray-200/80 mb-1">Select build</label>
            <div className="relative">
              <select
                className="w-full text-xs bg-[#23293a]/80 text-white rounded-lg px-2 py-2 pr-8 outline-none border border-white/10 focus:border-blue-300/60 transition appearance-none cursor-pointer"
                value={availableVersions.length ? String(selectedVersion) : ""}
                onChange={(e) => {
                  restoreUpdatePrompt();
                  setSelectedVersion(parseInt(e.target.value, 10));
                }}
              >
                {!availableVersions.length ? (
                  <option value="" disabled>
                    Loading...
                  </option>
                ) : null}

                {availableVersions.map((v, idx) => {
                  const name = v.build_name?.trim() || `Build-${v.build_index}`;
                  const suffix = `${v.installed ? " • installed" : ""}${
                    v.isLatest && v.type === "release" ? " • latest" : ""
                  }`;
                  return (
                    <option key={`${v.type}:${v.build_index}`} value={String(idx)}>
                      {name}{suffix}
                    </option>
                  );
                })}
              </select>
              <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-white/70">
                <IconChevronDown size={16} />
              </div>
            </div>

            {updateAvailable && !updateDismissed && versionType === "release" ? (
              <div className="mt-2 text-[11px] text-blue-200/90">
                New update available.
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="absolute top-10 right-3 z-30 flex flex-col gap-2">
        <button
          type="button"
          className="bg-[#23293a]/80 hover:bg-[#3b82f6] transition p-2 rounded-full shadow-lg flex items-center justify-center"
          title="Settings"
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

        <button
          type="button"
          className="bg-[#23293a]/80 hover:bg-[#5865F2] transition p-2 rounded-full shadow-lg flex items-center justify-center"
          title="Discord"
          onClick={() => {
            void window.config.openExternal("https://discord.com/invite/fZgjHwv5pA");
          }}
          style={{ width: 40, height: 40 }}
        >
        <img
          src="src/assets/discord.svg"
          alt="Discord"
          className="w-5 h-5"
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
        onLogout={onLogout}
      />
      <div className="w-full bg-black/60 backdrop-blur-md p-6 flex flex-row items-end justify-between gap-6">
        <div className="flex flex-col gap-3">
          {installing || patchingOnline ? (
            <div className="w-52 h-16 p-4 bg-white/10 rounded-lg shadow-inner flex items-center">
              <ProgressBar progress={installing ? installProgress : patchProgress} />
            </div>
          ) : (
            <div className="flex flex-row items-center gap-2">
              <button
                className="min-w-52 bg-linear-to-r from-[#3b82f6] to-[#60a5fa] text-white text-xl font-bold px-12 py-3 rounded-lg shadow-lg hover:scale-105 transition disabled:opacity-50"
                onClick={needsFixClient ? fixClient : handleLaunch}
                disabled={launching || gameLaunched}
                title={needsFixClient ? "Restore the unpatched client" : undefined}
              >
                {needsFixClient
                  ? "Fix Client"
                  : availableVersions[selectedVersion]?.installed
                    ? gameLaunched
                      ? "Running Game"
                      : "Play"
                    : showUpdate
                      ? "Update"
                      : "Install"}
              </button>

              {showUpdate && (
                <button
                  type="button"
                  className="w-10 h-10 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
                  title="Do not update for now"
                  onClick={() => dismissUpdateForNow()}
                >
                  X
                </button>
              )}

              {patchAvailable && !needsFixClient ? (
                <button
                  type="button"
                  className={`min-w-[140px] h-[52px] rounded-lg px-4 text-sm font-bold shadow-lg transition disabled:opacity-50 ${
                    onlinePatchEnabled
                      ? "bg-white/10 hover:bg-white/20 text-white"
                      : "bg-linear-to-r from-[#2563eb] to-[#60a5fa] text-white hover:scale-105"
                  }`}
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
                        ? "Update online patch"
                        : "Disable online patch"
                      : "Online Patch"
                  }
                >
                  {onlinePatchEnabled ? (patchOutdated ? "Update Patch" : "Disable Patch") : "Online Patch"}
                </button>
              ) : null}
            </div>
          )}
          <div className="text-xs text-gray-200 font-mono opacity-80 flex flex-col">
            <span>
              Latest Version: {latestLabel}
            </span>
            <span>Current Version: {currentInstalledVersion?.build_name || "None"}</span>
            {selectedLabel ? <span>Selected: {selectedLabel}</span> : null}
          </div>
        </div>
        <div className="flex flex-row gap-4">
          {(newsItems.length ? newsItems : [{ title: "Loading...", content: "" }]).slice(0, 3).map((item, idx) => (
            <div
              key={`${idx}-${item.title}`}
              className="w-40 h-20 bg-white/10 rounded-lg shadow-inner flex flex-col items-center text-center p-2"
            >
              <div className="flex-1 w-full flex items-center justify-center">
                <div className="text-xs text-white font-semibold leading-tight line-clamp-3">
                  {item.title}
                </div>
              </div>
              {item.content?.trim() ? (
                <button
                  type="button"
                  className="text-[10px] text-blue-300 hover:text-blue-200 underline underline-offset-2"
                  onClick={() => setOpenNews(item)}
                >
                  Show more
                </button>
              ) : (
                <div className="h-[14px]" />
              )}
            </div>
          ))}
        </div>
      </div>

      {openNews && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fadeIn"
          onClick={() => setOpenNews(null)}
        >
          <div
            className="w-[520px] max-w-[90vw] max-h-[80vh] rounded-2xl shadow-2xl bg-[#181c24f2] border border-[#23293a] p-5 animate-slideUp"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="text-white font-extrabold text-lg leading-tight">
                {openNews.title}
              </div>
              <button
                type="button"
                className="text-gray-300 hover:text-white text-xl font-bold leading-none"
                onClick={() => setOpenNews(null)}
                title="Close"
              >
                ×
              </button>
            </div>

            {openNews.date && (
              <div className="mt-1 text-[11px] text-gray-400 font-mono">
                {openNews.date}
              </div>
            )}

            <div className="mt-4 text-sm text-gray-200 whitespace-pre-wrap overflow-auto max-h-[55vh]">
              {openNews.content}
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                className="px-4 py-2 rounded-lg bg-[#23293a] text-white hover:bg-[#2b3347] transition"
                onClick={() => setOpenNews(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {patchConfirmOpen && selected ? (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fadeIn"
          onClick={() => setPatchConfirmOpen(false)}
        >
          <div
            className="w-[520px] max-w-[90vw] max-h-[80vh] rounded-2xl shadow-2xl bg-[#181c24f2] border border-[#23293a] p-5 animate-slideUp"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="text-white font-extrabold text-lg leading-tight">
                Online Patch
              </div>
              <button
                type="button"
                className="text-gray-300 hover:text-white text-xl font-bold leading-none"
                onClick={() => setPatchConfirmOpen(false)}
                title="Close"
              >
                ×
              </button>
            </div>

            <div className="mt-3 text-sm text-gray-200 whitespace-pre-wrap">
              {selected.patch_note?.trim()
                ? selected.patch_note
                : "No patch notes available for this build."}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="px-4 py-2 rounded-lg bg-[#23293a] text-white hover:bg-[#2b3347] transition"
                onClick={() => setPatchConfirmOpen(false)}
              >
                Do not patch
              </button>
              <button
                type="button"
                className="px-4 py-2 rounded-lg bg-linear-to-r from-[#2563eb] to-[#60a5fa] text-white font-bold hover:scale-[1.02] transition"
                onClick={() => {
                  setPatchConfirmOpen(false);
                  startOnlinePatch();
                }}
              >
                Patch
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default Launcher;
