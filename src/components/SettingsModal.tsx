import React, { useEffect, useMemo, useRef, useState } from "react";
import { IconFolderOpen } from "@tabler/icons-react";
import { useGameContext } from "../hooks/gameContext";
import cn from "../utils/cn";
import ConfirmModal from "./ConfirmModal";
import { useTranslation } from "react-i18next";
import { setStoredLanguage } from "../i18n";

const LANGUAGES = {
  en: { name: "English", flag: "🇺🇸" },
  es: { name: "Español", flag: "🇪🇸" },
  cs: { name: "Čeština", flag: "🇨🇿" },
  ar: { name: "العربية", flag: "🇸🇦" },
  ru: { name: "Русский", flag: "🇷🇺" },
  de: { name: "Deutsch", flag: "🇩🇪" },
} as const;

const RTL_LANGUAGES = ["ar"] as const;

const SettingsModal: React.FC<{
  open: boolean;
  onClose: () => void;
  onLogout?: () => void;
}> = ({ open, onClose, onLogout }) => {
  const { t, i18n } = useTranslation();
  const {
    gameDir,
    setGameDir,
    availableVersions,
    selectedVersion,
    patchingOnline,
    launching,
    gameLaunched,
    runningVersion,
    checkForUpdates,
    checkingUpdates,
  } = useGameContext();
  const [customUUID, setCustomUUID] = useState<string>("");
  const [enableRPC, setEnableRPC] = useState<boolean>(false);
  const [startupSoundEnabled, setStartupSoundEnabled] = useState<boolean>(false);
  const [changingDir, setChangingDir] = useState(false);

  const [removeOnlinePatchOpen, setRemoveOnlinePatchOpen] = useState(false);

  const [onlinePatchEnabledForSelected, setOnlinePatchEnabledForSelected] =
    useState(false);
  const [checkingOnlinePatchState, setCheckingOnlinePatchState] = useState(false);
  const onlinePatchStateSeq = useRef(0);

  const [steamDeckMode, setSteamDeckMode] = useState(false);
  const [steamDeckWorking, setSteamDeckWorking] = useState(false);
  const [steamDeckStatus, setSteamDeckStatus] = useState<string>("");

  const [creditsOpen, setCreditsOpen] = useState(false);

  const [closing, setClosing] = useState(false);

  const normalizedUUID = useMemo(() => {
    const raw = customUUID.trim();
    if (!raw) return "";

    const compact = raw.replace(/-/g, "");
    if (/^[0-9a-fA-F]{32}$/.test(compact)) {
      const lower = compact.toLowerCase();
      return `${lower.slice(0, 8)}-${lower.slice(8, 12)}-${lower.slice(12, 16)}-${lower.slice(16, 20)}-${lower.slice(20)}`;
    }

    if (
      /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
        raw,
      )
    ) {
      return raw.toLowerCase();
    }

    return "__invalid__";
  }, [customUUID]);

  const handleOpenGameDir = async () => {
    try {
      const dir = gameDir ?? (await window.config.getDefaultGameDirectory());
      await window.config.openFolder(dir);
    } catch (e) {
      console.error("Failed to open game directory", e);
      alert("Error #1000");
    }
  };

  const handleChangeDownloadDir = async () => {
    setChangingDir(true);
    try {
      const res = await window.config.selectDownloadDirectory();
      if (!res.ok) {
        alert("Error #1000");
        return;
      }
      if (res.path) {
        setGameDir(res.path);
      }
    } catch (e) {
      console.error("Failed to select download directory", e);
      alert("Error #1000");
    } finally {
      setChangingDir(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    const storedUUID = localStorage.getItem("customUUID") || "";
    setCustomUUID(storedUUID);
    const storedRPC = localStorage.getItem("enableRPC") || "false";
    setEnableRPC(storedRPC === "true");
    void (async () => {
      try {
        const res = await window.config.startupSoundGet();
        if (res.ok) {
          setStartupSoundEnabled(!!res.playstartupsound);
        }
      } catch {
        // ignore
      }
    })();

    (async () => {
      try {
        const enabled = await window.config.getSteamDeckMode();
        setSteamDeckMode(enabled);
        setSteamDeckStatus("");
      } catch {
        // ignore
      }
    })();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setCreditsOpen(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const raw = customUUID.trim();
    if (!raw) {
      localStorage.removeItem("customUUID");
      return;
    }

    if (normalizedUUID && normalizedUUID !== "__invalid__") {
      localStorage.setItem("customUUID", normalizedUUID);
    }
  }, [customUUID, normalizedUUID, open]);

  useEffect(() => {
    if (enableRPC) {
      localStorage.setItem("enableRPC", "true");
      window.ipcRenderer.send("rpc:enable", true);
    } else {
      localStorage.removeItem("enableRPC");
      window.ipcRenderer.send("rpc:enable", false);
    }
  }, [enableRPC]);

  const handleStartupSoundChange = (checked: boolean) => {
    setStartupSoundEnabled(checked);
    void (async () => {
      try {
        const res = await window.config.startupSoundSet(checked);
        if (!res.ok) {
          throw new Error(res.error || "Failed to save");
        }
      } catch (e) {
        console.error("Failed to save startup sound setting", e);
        alert("Error #1000");
      }
    })();
  };

  const isLinux = window.config.OS === "linux";

  const currentLangCode = (i18n.language || "en").split("-")[0].toLowerCase();
  const isRTL = (RTL_LANGUAGES as readonly string[]).includes(currentLangCode);
  const lang = (Object.prototype.hasOwnProperty.call(LANGUAGES, currentLangCode)
    ? currentLangCode
    : "en") as keyof typeof LANGUAGES;

  const changeLanguage = (next: keyof typeof LANGUAGES) => {
    void i18n.changeLanguage(next);
    setStoredLanguage(next);
  };

  const selected = availableVersions[selectedVersion];
  const selectedLabel = selected
    ? selected.build_name?.trim() || `Build-${selected.build_index}`
    : "";

  const selectedIsRunning =
    !!selected &&
    !!runningVersion &&
    gameLaunched &&
    runningVersion.type === selected.type &&
    runningVersion.build_index === selected.build_index;

  useEffect(() => {
    if (!open) return;

    const seq = ++onlinePatchStateSeq.current;

    if (!gameDir || !selected || !selected.installed) {
      setOnlinePatchEnabledForSelected(false);
      setCheckingOnlinePatchState(false);
      return;
    }

    setCheckingOnlinePatchState(true);
    void (async () => {
      try {
        const state = (await window.ipcRenderer.invoke(
          "online-patch:state",
          gameDir,
          selected,
        )) as {
          supported: boolean;
          available: boolean;
          enabled: boolean;
          downloaded: boolean;
        };

        if (seq !== onlinePatchStateSeq.current) return;
        setOnlinePatchEnabledForSelected(!!state?.enabled);
      } catch {
        if (seq !== onlinePatchStateSeq.current) return;
        setOnlinePatchEnabledForSelected(false);
      } finally {
        if (seq !== onlinePatchStateSeq.current) return;
        setCheckingOnlinePatchState(false);
      }
    })();
  }, [open, gameDir, selected]);

  const canRemoveOnlinePatch =
    !!gameDir &&
    !!selected &&
    !!selected.installed &&
    !patchingOnline &&
    !checkingOnlinePatchState &&
    onlinePatchEnabledForSelected &&
    !selectedIsRunning &&
    !launching;

  const doRemoveOnlinePatch = () => {
    if (!gameDir || !selected) return;
    // Yes, we need an IPC call to delete a folder. No, I don't like it either.
    // But at least the dangerous stuff happens in main where the filesystem monster lives.
    window.ipcRenderer.send("online-patch:remove", gameDir, selected);
  };

  const handleToggleSteamDeckMode = async (next: boolean) => {
    if (!isLinux) return;
    const prev = steamDeckMode;
    setSteamDeckMode(next);
    setSteamDeckWorking(true);
    setSteamDeckStatus(
      next ? t("settings.steamDeck.applying") : t("settings.steamDeck.restoring"),
    );
    try {
      const dir = gameDir ?? (await window.config.getDefaultGameDirectory());
      const res = await window.config.setSteamDeckMode(next, dir);

      const msg =
        res && typeof res === "object"
          ? res.message ||
            (typeof res.changed === "number" || typeof res.failed === "number"
              ? `Done (changed=${res.changed ?? "?"}, failed=${res.failed ?? "?"}).`
              : "Done.")
          : "Done.";
      setSteamDeckStatus(msg);
    } catch (e) {
      console.error("Failed to toggle SteamDeck mode", e);
      setSteamDeckStatus(t("settings.steamDeck.failed"));
      setSteamDeckMode(prev);
      alert("Error #1000");
    } finally {
      setSteamDeckWorking(false);
    }
  };

  if (!open && !closing) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center glass-backdrop animate-fade-in"
      dir={isRTL ? "rtl" : "ltr"}
    >
      <div
        className={cn(
          `
          relative w-full max-w-4xl h-[450px] mx-auto
          rounded-xl
          bg-linear-to-b from-[#1b2030]/95 to-[#141824]/95
          border border-[#2a3146]
          shadow-2xl
          px-10 py-6
          flex flex-col animate-settings-in`,
          closing && "animate-settings-out",
        )}
      >
        <button
          className={cn(
            "absolute top-3 w-8 h-8 rounded-full bg-[#23293a] text-gray-400 hover:text-white hover:bg-[#2f3650] transition flex items-center justify-center",
            isRTL ? "left-3" : "right-3",
          )}
          onClick={() => {
            setClosing(true);
            setTimeout(() => {
              setClosing(false);
              onClose();
            }, 160);
          }}
          title={t("common.close")}
        >
          ×
        </button>

        <h2 className="text-lg font-semibold text-white tracking-wide mb-4">
          {t("settings.title")}
        </h2>

        {/* CONTENT */}
        <div className="flex-1 overflow-y-auto pr-2">
          <div className="grid grid-cols-2 gap-6">
            {/* <div>
              <label className="text-gray-200 text-sm font-semibold mb-1 block">
                Patchline
              </label>
              <select className="w-full mt-1 p-2 rounded bg-[#23293a] text-white border border-[#3b82f6] focus:outline-none">
                <option>release</option>
                <option>snapshot</option>
              </select>
            </div> */}

            <div className="space-y-2">
              <label className="text-xs uppercase tracking-widest text-gray-400">
                {t("settings.gameDirectory.label")}
              </label>
              <button
                className="w-full flex items-center justify-between bg-[#1f2538] hover:bg-[#262d44] border border-[#2a3146] rounded-lg px-4 py-2 text-white transition"
                onClick={handleOpenGameDir}
              >
                <span className="text-sm">{t("settings.gameDirectory.openFolder")}</span>
                <IconFolderOpen size={18} />
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-xs uppercase tracking-widest text-gray-400">
                {t("settings.downloadDirectory.label")}
              </label>
              <button
                className="w-full flex items-center justify-between bg-[#1f2538] hover:bg-[#262d44] border border-[#2a3146] rounded-lg px-4 py-2 text-white transition disabled:opacity-60"
                onClick={handleChangeDownloadDir}
                disabled={changingDir}
              >
                <span className="text-sm">
                  {changingDir
                    ? t("settings.downloadDirectory.selecting")
                    : t("settings.downloadDirectory.change")}
                </span>
                <IconFolderOpen size={18} />
              </button>
              <div className="text-[10px] text-gray-400 font-mono break-all">
                {gameDir || t("settings.downloadDirectory.loading")}
              </div>
            </div>


            <div className="col-span-2 space-y-2">
              <label className="text-xs uppercase tracking-widest text-gray-400">
                {t("settings.customUUID.label")}
              </label>
              <input
                value={customUUID}
                onChange={(e) => setCustomUUID(e.target.value)}
                placeholder={t("settings.customUUID.placeholder")}
                className="w-full px-3 py-2 rounded-lg bg-[#1f2538] text-white border border-[#2a3146] focus:outline-none focus:border-blue-500 transition"
                spellCheck={false}
                autoCapitalize="none"
                autoCorrect="off"
                inputMode="text"
              />
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-400">
                  {customUUID.trim().length === 0
                    ? t("settings.customUUID.usesAuto")
                    : normalizedUUID === "__invalid__"
                      ? t("settings.customUUID.invalid")
                      : t("settings.customUUID.saved", { uuid: normalizedUUID })}
                </span>
                <button
                  type="button"
                  className="text-[10px] text-red-400 hover:text-red-300 transition"
                  onClick={() => {
                    setCustomUUID("");
                    localStorage.removeItem("customUUID");
                  }}
                >
                  {t("common.clear")}
                </button>
              </div>
            </div>

            <label className="w-fit flex gap-2 items-center text-xs uppercase tracking-widest text-gray-400">
              <p>{t("settings.discordRPC")}:</p>
              <input
                type="checkbox"
                checked={enableRPC}
                onChange={(e) => setEnableRPC(e.target.checked)}
                className="hidden sr-only peer"
              />
              <div
                className={cn(
                  "px-4 py-2 flex items-center gap-2 bg-[#1f2538] hover:bg-[#262d44] border border-[#2a3146] rounded-lg text-white transition",
                  enableRPC && "border-blue-500/60 bg-blue-600/15",
                )}
              >
                <span
                  className={cn(
                    "w-4 h-4 rounded-sm border border-[#2a3146] bg-transparent",
                    enableRPC && "border-blue-300 bg-blue-500",
                  )}
                />
                {enableRPC ? t("common.enabled") : t("common.disabled")}
              </div>
            </label>

            <label className="w-fit flex gap-2 items-center text-xs uppercase tracking-widest text-gray-400">
              <p>{t("settings.startupSound")}:</p>
              <input
                type="checkbox"
                checked={startupSoundEnabled}
                onChange={(e) => handleStartupSoundChange(e.target.checked)}
                className="hidden sr-only peer"
              />
              <div
                className={cn(
                  "px-4 py-2 flex items-center gap-2 bg-[#1f2538] hover:bg-[#262d44] border border-[#2a3146] rounded-lg text-white transition",
                  startupSoundEnabled && "border-blue-500/60 bg-blue-600/15",
                )}
              >
                <span
                  className={cn(
                    "w-4 h-4 rounded-sm border border-[#2a3146] bg-transparent",
                    startupSoundEnabled && "border-blue-300 bg-blue-500",
                  )}
                />
                {startupSoundEnabled ? t("common.enabled") : t("common.disabled")}
              </div>
            </label>

            <div className="col-span-2">
              <label className="w-fit flex gap-2 items-center text-xs uppercase tracking-widest text-gray-400">
                <p>{t("settings.steamDeck.label")}:</p>
                <input
                  type="checkbox"
                  checked={steamDeckMode}
                  disabled={!isLinux || steamDeckWorking}
                  onChange={(e) => void handleToggleSteamDeckMode(e.target.checked)}
                  className="hidden sr-only peer"
                />
                <div
                  className={cn(
                    "px-4 py-2 flex items-center gap-2 bg-[#1f2538] hover:bg-[#262d44] border border-[#2a3146] rounded-lg text-white transition disabled:opacity-60",
                    steamDeckMode && "border-blue-500/60 bg-blue-600/15",
                    (!isLinux || steamDeckWorking) && "opacity-60",
                  )}
                  title={
                    isLinux
                      ? t("settings.steamDeck.tooltipLinux")
                      : t("settings.steamDeck.hintNonLinux")
                  }
                >
                  <span
                    className={cn(
                      "w-4 h-4 rounded-sm border border-[#2a3146] bg-transparent",
                      steamDeckMode && "border-blue-300 bg-blue-500",
                    )}
                  />
                  {steamDeckWorking
                    ? t("common.working")
                    : steamDeckMode
                      ? t("common.enabled")
                      : t("common.disabled")}
                </div>
              </label>

              <div className="mt-2 text-[11px] text-gray-400">
                {isLinux
                  ? t("settings.steamDeck.hintLinux")
                  : t("settings.steamDeck.linuxOnly")}
              </div>

              {steamDeckStatus ? (
                <div className="mt-2 text-[11px] text-gray-400 font-mono break-words">
                  {steamDeckStatus}
                </div>
              ) : null}
            </div>

            <div className="col-span-2 space-y-2">
              <label className="text-xs uppercase tracking-widest text-gray-400">
                {t("settings.onlinePatch.label")}
              </label>
              <button
                type="button"
                className={cn(
                  "w-full flex items-center justify-between bg-[#1f2538] hover:bg-[#262d44] border border-[#2a3146] rounded-lg px-4 py-2 text-white transition disabled:opacity-60",
                  "border-red-500/30 text-red-300 hover:bg-red-500/10",
                )}
                disabled={!canRemoveOnlinePatch}
                onClick={() => setRemoveOnlinePatchOpen(true)}
                title={
                  !gameDir
                    ? t("settings.onlinePatch.requireGameDir")
                    : !selected
                      ? t("settings.onlinePatch.requireVersion")
                      : !selected.installed
                        ? t("settings.onlinePatch.requireInstalled")
                        : selectedIsRunning
                          ? t("settings.onlinePatch.requireGameClosed")
                        : checkingOnlinePatchState
                          ? t("settings.onlinePatch.checkingState")
                          : !onlinePatchEnabledForSelected
                            ? t("settings.onlinePatch.requireEnabled")
                        : patchingOnline
                          ? t("settings.onlinePatch.inProgress")
                          : ""
                }
              >
                <span className="text-sm">
                  {patchingOnline
                    ? t("common.working")
                    : t("settings.onlinePatch.removeButton")}
                </span>
                <span className="text-xs opacity-80">
                  {selected ? selectedLabel : ""}
                </span>
              </button>

              {gameDir &&
              selected &&
              selected.installed &&
              !patchingOnline &&
              !checkingOnlinePatchState &&
              !onlinePatchEnabledForSelected ? (
                <div className="mt-1 text-[11px] text-gray-400">
                  {t("settings.onlinePatch.hintEnableToRemove")}
                </div>
              ) : null}

              {selectedIsRunning ? (
                <div className="mt-1 text-[11px] text-gray-400">
                  {t("settings.onlinePatch.hintCloseGame")}
                </div>
              ) : null}

              <div className="text-[11px] text-gray-400">
                {t("settings.onlinePatch.description")}
              </div>
            </div>

            {/* <div>
              <label className="text-gray-200 text-sm font-semibold mb-1 block">
                Previous Version{" "}
                <span className="text-xs text-gray-400 font-normal">
                  (Not available)
                </span>
              </label>
              <button className="w-full bg-[#23293a] text-gray-400 px-4 py-2 rounded mt-1 cursor-not-allowed" disabled>
                LAUNCH
              </button>
            </div> */}
          </div>
        </div>

        {/* FOOTER */}
        <div className="pt-4 mt-4 border-t border-[#2a3146] flex items-center justify-between gap-4">
          <div className="text-left">
            <div className="text-xs text-gray-400">
              {t("settings.madeBy")}: <span className="font-extrabold tracking-wide bg-linear-to-r from-blue-500 via-cyan-400 to-blue-500 bg-clip-text text-transparent bg-chroma-animated animate-chroma-shift">{t("settings.teamName")}</span>
            </div>

            <button
              type="button"
              className="mt-2 px-4 py-2 rounded-lg font-semibold border border-blue-500/40 text-blue-400 hover:bg-blue-500/10 transition"
              onClick={() => setCreditsOpen(true)}
            >
              {t("settings.credits.label")}
            </button>
          </div>

          <div className="flex flex-col gap-2 items-center">
            <label className="text-[10px] text-gray-400 font-bold uppercase">
              {t("settings.language.label")} {LANGUAGES[lang].flag}
            </label>
            <select
              value={lang}
              onChange={(e) => changeLanguage(e.target.value as keyof typeof LANGUAGES)}
              className="bg-[#1a1f2e] border border-[#2a3146] text-white rounded-lg p-2 outline-none"
            >
              {Object.entries(LANGUAGES).map(([code, info]) => (
                <option
                  key={code}
                  value={code}
                  dir={(RTL_LANGUAGES as readonly string[]).includes(code) ? "rtl" : "ltr"}
                >
                  {info.flag} {info.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-3">
            <div className="text-[11px] font-mono text-gray-400">
              {`${window.config.BUILD_DATE} V${window.config.VERSION}`}
            </div>
            <button
              className="px-4 py-2 rounded-lg font-semibold border border-blue-500/40 text-blue-400 hover:bg-blue-500/10 transition disabled:opacity-50"
              disabled={checkingUpdates}
              onClick={() => checkForUpdates("manual")}
            >
              {checkingUpdates
                ? t("settings.updates.checking")
                : t("settings.updates.check")}
            </button>

            {onLogout && (
              <button
                className="px-5 py-2 rounded-lg font-bold text-white bg-linear-to-r from-blue-500 to-cyan-400 hover:from-blue-600 hover:to-cyan-500 transition shadow-lg"
                onClick={onLogout}
              >
                {t("settings.logout")}
              </button>
            )}
          </div>
        </div>

        {creditsOpen ? (
          <div className="absolute inset-0 rounded-xl glass-backdrop flex items-center justify-center p-6">
            <div className="relative w-full max-w-xl rounded-xl border border-[#2a3146] bg-linear-to-b from-[#1b2030]/95 to-[#141824]/95 shadow-2xl px-6 py-5">
              <button
                type="button"
                className={cn(
                  "absolute top-3 w-8 h-8 rounded-full bg-[#23293a] text-gray-400 hover:text-white hover:bg-[#2f3650] transition flex items-center justify-center",
                  isRTL ? "left-3" : "right-3",
                )}
                onClick={() => setCreditsOpen(false)}
                title={t("common.close")}
              >
                ×
              </button>

              <h3 className="text-lg font-semibold text-white tracking-wide">
                {t("settings.credits.label")}
              </h3>

              <div className="mt-4 max-h-[320px] overflow-y-auto pr-1 space-y-2">
                <div className="rounded-lg border border-[#2a3146] bg-[#1f2538]/70 px-4 py-3">
                  <div className="text-[11px] text-gray-400 font-bold uppercase">
                    Project Lead &amp; Lead Developer
                  </div>
                  <div className="mt-1 text-sm text-gray-200">
                    <span className="text-blue-400">vZyle</span> (Project Concept, Launcher Development, Online Client Patching System)
                  </div>

                  <div className="mt-4 text-[11px] text-gray-400 font-bold uppercase">
                    Launcher Developer
                  </div>
                  <div className="mt-1 text-sm text-gray-200">
                    <span className="text-blue-400">Fitzxel</span> (Launcher Programming)
                  </div>

                  <div className="mt-4 text-[11px] text-gray-400 font-bold uppercase">
                    Lead Graphic Designer
                  </div>
                  <div className="mt-1 text-sm text-gray-200">
                    <span className="text-blue-400">primeisonline</span> (Graphic Design and Matcha! system)
                  </div>

                  <div className="mt-4 text-[11px] text-gray-400 font-bold uppercase">
                    Operations Manager &amp; Localization Lead
                  </div>
                  <div className="mt-1 text-sm text-gray-200">
                    <span className="text-blue-400">KaiZorakDEV</span> (Discord Management, Server Organization, Translation Systems)
                  </div>

                  <div className="mt-4 text-[11px] text-gray-400 font-bold uppercase">
                    Server Patching &amp; Deployment Specialist
                  </div>
                  <div className="mt-1 text-sm text-gray-200">
                    <span className="text-blue-400">Nexusatko</span> (Online Server Patching, Dedicated Server Setup Support, Czech &amp; Slovak Translation)
                  </div>

                  <div className="mt-4 text-[11px] text-gray-400 font-bold uppercase">
                    Technical Advisor
                  </div>
                  <div className="mt-1 text-sm text-gray-200">
                    <span className="text-blue-400">IkyMax</span> (Game Server Architecture Consultant)
                  </div>

                  <div className="mt-4 text-[11px] text-gray-400 font-bold uppercase">
                    Web Designer
                  </div>
                  <div className="mt-1 text-sm text-gray-200">
                    <span className="text-blue-400">Lunar Katsu</span> (Website Design)
                  </div>

                  <div className="mt-4 text-[11px] text-gray-400 font-bold uppercase">
                    Localization Team
                  </div>
                  <div className="mt-2 space-y-1 text-sm text-gray-200">
                    <div><span className="text-blue-400">Kapugoat</span> (Spanish)</div>
                    <div><span className="text-blue-400">SaYrZ</span> (Arabic)</div>
                    <div><span className="text-blue-400">multyfora</span> (Russian)</div>
                    <div><span className="text-blue-400">bimbimbamreal</span> (German)</div>
                    <div><span className="text-blue-400">mobun</span> (Vietnamese)</div>
                    <div><span className="text-blue-400">polished_mercury</span> (Polish)</div>
                    <div><span className="text-blue-400">farrdev</span> (Indonesian)</div>
                    <div><span className="text-blue-400">fine_xd_</span> (Persian/Farsi)</div>
                    <div><span className="text-blue-400">Astinix</span> (Ukrainian)</div>
                  </div>

                  <div className="mt-4 text-[11px] text-gray-400 font-bold uppercase">
                    Special Thanks
                  </div>
                  <div className="mt-1 text-sm text-gray-200">
                    <span className="text-blue-400">Magd &amp; Kyo</span> (Honorable Mentions)
                  </div>

                  <div className="mt-4 text-sm text-gray-200">
                    Thank you to everyone who made this project possible &lt;3
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <ConfirmModal
        open={removeOnlinePatchOpen}
        title={t("settings.onlinePatch.title")}
        message={
          selected
            ? t("settings.onlinePatch.confirm", { version: selectedLabel })
            : t("settings.onlinePatch.confirmFallback")
        }
        confirmText={t("common.remove")}
        cancelText={t("common.cancel")}
        onCancel={() => setRemoveOnlinePatchOpen(false)}
        onConfirm={() => {
          // One click to undo chaos. Another click to commit to it. Perfect.
          setRemoveOnlinePatchOpen(false);
          doRemoveOnlinePatch();
        }}
      />
    </div>
  );
};

export default SettingsModal;
