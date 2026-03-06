import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactCountryFlag from "react-country-flag";
import { IconFolderOpen, IconChevronRight, IconChevronLeft, IconPhoto, IconVideo, IconX } from "@tabler/icons-react";
import { useGameContext } from "../hooks/gameContext";
import ConfirmModal from "./ConfirmModal";
import { useTranslation } from "react-i18next";
import { setStoredLanguage } from "../i18n";
import { StorageService } from "../services/StorageService";
import {
  Box,
  Button,
  HStack,
  IconButton,
  Input,
  Switch,
  Text,
  VStack,
} from "@chakra-ui/react";
import { SectionRow, PanelContainer, PageHeader } from "./ui";

type BackgroundType = "none" | "image" | "video";

const LANGUAGES = {
  en: { name: "English", countryCode: "US" },
  es: { name: "Español", countryCode: "ES" },
  cs: { name: "Čeština", countryCode: "CZ" },
  ar: { name: "العربية", countryCode: "SA" },
  ru: { name: "Русский", countryCode: "RU" },
  de: { name: "Deutsch", countryCode: "DE" },
} as const;

const RTL_LANGUAGES = ["ar"] as const;

// SettingRow is now the shared SectionRow component.
const SettingRow = SectionRow;

const SettingsPanel: React.FC<{
  onLogout?: () => void;
  onBack?: () => void;
}> = ({ onLogout, onBack }) => {
  const { t, i18n } = useTranslation();

  const readEnableRpcPref = (): boolean => StorageService.isRPCEnabled();

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

  const [accountType, setAccountType] = useState<AccountType | null>();
  const [customUUID, setCustomUUID] = useState<string>("");
  const [enableRPC, setEnableRPC] = useState<boolean>(() => readEnableRpcPref());
  const [startupSoundEnabled, setStartupSoundEnabled] = useState<boolean>(false);
  const [changingDir, setChangingDir] = useState(false);
  const [removeOnlinePatchOpen, setRemoveOnlinePatchOpen] = useState(false);
  const [onlinePatchEnabledForSelected, setOnlinePatchEnabledForSelected] = useState(false);
  const [checkingOnlinePatchState, setCheckingOnlinePatchState] = useState(false);
  const onlinePatchStateSeq = useRef(0);
  const [steamDeckMode, setSteamDeckMode] = useState(false);
  const [steamDeckWorking, setSteamDeckWorking] = useState(false);
  const [steamDeckStatus, setSteamDeckStatus] = useState<string>("");
  const [creditsSubPage, setCreditsSubPage] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);
  const [defaultGameDir, setDefaultGameDir] = useState<string>("");

  const [bgType, setBgType] = useState<BackgroundType>("none");
  const [bgPath, setBgPath] = useState("");
  const [bgSaving, setBgSaving] = useState(false);

  const normalizedUUID = useMemo(() => {
    const raw = customUUID.trim();
    if (!raw) return "";
    const compact = raw.replace(/-/g, "");
    if (/^[0-9a-fA-F]{32}$/.test(compact)) {
      const lower = compact.toLowerCase();
      return `${lower.slice(0, 8)}-${lower.slice(8, 12)}-${lower.slice(12, 16)}-${lower.slice(16, 20)}-${lower.slice(20)}`;
    }
    if (/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(raw)) {
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
      if (!res.ok) { alert("Error #1000"); return; }
      if (res.path) setGameDir(res.path);
    } catch (e) {
      console.error("Failed to select download directory", e);
      alert("Error #1000");
    } finally {
      setChangingDir(false);
    }
  };

  useEffect(() => {
    setCustomUUID(StorageService.getString("customUUID"));
    setEnableRPC(readEnableRpcPref());
    void (async () => {
      try {
        const res = await window.config.startupSoundGet();
        if (res.ok) setStartupSoundEnabled(!!res.playstartupsound);
      } catch {}
    })();
    (async () => {
      try { const enabled = await window.config.getSteamDeckMode(); setSteamDeckMode(enabled); setSteamDeckStatus(""); } catch {}
    })();
    void (async () => {
      try { const d = await window.config.getDefaultGameDirectory(); setDefaultGameDir(d || ""); } catch {}
    })();
    const raw = StorageService.getAccountType();
    if (raw === "premium") setAccountType("premium");
    else if (raw === "custom") setAccountType("custom");
    else setAccountType(null);

    (async () => {
      try {
        const res = await window.config.backgroundGet();
        if (res.ok) {
          setBgType(res.backgroundType || "none");
          setBgPath(res.backgroundPath || "");
        }
      } catch {
        // ignore
      }
    })();
  }, [open]);

  useEffect(() => {
    const raw = customUUID.trim();
    if (!raw) { StorageService.remove("customUUID"); return; }
    if (normalizedUUID && normalizedUUID !== "__invalid__") {
      StorageService.set("customUUID", normalizedUUID);
    }
  }, [customUUID, normalizedUUID]);

  useEffect(() => {
    StorageService.setRPCEnabled(enableRPC);
    window.ipcRenderer.send("rpc:enable", !!enableRPC);
  }, [enableRPC]);

  const handleStartupSoundChange = (checked: boolean) => {
    setStartupSoundEnabled(checked);
    void (async () => {
      try {
        const res = await window.config.startupSoundSet(checked);
        if (!res.ok) throw new Error(res.error || "Failed to save");
      } catch (e) {
        console.error("Failed to save startup sound setting", e);
        alert("Error #1000");
      }
    })();
  };

  const isLinux = window.config.OS === "linux";
  const currentLangCode = (i18n.language || "en").split("-")[0].toLowerCase();
  const isRTL = (RTL_LANGUAGES as readonly string[]).includes(currentLangCode);
  const lang = (Object.prototype.hasOwnProperty.call(LANGUAGES, currentLangCode) ? currentLangCode : "en") as keyof typeof LANGUAGES;
  const changeLanguage = (next: keyof typeof LANGUAGES) => {
    void i18n.changeLanguage(next);
    setStoredLanguage(next);
  };

  const selected = availableVersions[selectedVersion];
  const selectedLabel = selected
    ? selected.build_name?.trim() || `Build-${selected.build_index}`
    : "";
  const selectedIsRunning = !!selected && !!runningVersion && gameLaunched &&
    runningVersion.type === selected.type && runningVersion.build_index === selected.build_index;

  useEffect(() => {
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
          "online-patch:state", gameDir, selected,
        )) as { supported: boolean; available: boolean; enabled: boolean; downloaded: boolean };
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
  }, [gameDir, selected]);

  const canRemoveOnlinePatch = !!gameDir && !!selected && !!selected.installed &&
    !patchingOnline && !checkingOnlinePatchState && onlinePatchEnabledForSelected &&
    !selectedIsRunning && !launching;

  const doRemoveOnlinePatch = () => {
    if (!gameDir || !selected) return;
    window.ipcRenderer.send("online-patch:remove", gameDir, selected);
  };

  const handleToggleSteamDeckMode = async (next: boolean) => {
    if (!isLinux) return;
    const prev = steamDeckMode;
    setSteamDeckMode(next);
    setSteamDeckWorking(true);
    setSteamDeckStatus(next ? t("settings.steamDeck.applying") : t("settings.steamDeck.restoring"));
    try {
      const dir = gameDir ?? (await window.config.getDefaultGameDirectory());
      const res = await window.config.setSteamDeckMode(next, dir);
      const msg = res && typeof res === "object"
        ? res.message || (typeof res.changed === "number" || typeof res.failed === "number"
          ? `Done (changed=${res.changed ?? "?"}, failed=${res.failed ?? "?"}).` : "Done.")
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

  const handleClearInstallCache = async () => {
    if (clearingCache) return;
    setClearingCache(true);
    try {
      const dir = gameDir ?? (await window.config.getDefaultGameDirectory());
      const res = await window.config.clearInstallCache(dir);
      if (!res || typeof res !== "object" || res.ok !== true) throw new Error("Failed");
      if ((res.deleted ?? 0) > 0) alert(t("settings.cache.cleared", { count: res.deleted }));
      else alert(t("settings.cache.noneFound"));
    } catch (e) {
      console.error("Failed to clear install cache", e);
      alert("Error #1000");
    } finally {
      setClearingCache(false);
    }
  };

  const dirPath = gameDir || defaultGameDir || t("settings.downloadDirectory.loading");

  const handlePickBackground = async (type: "image" | "video") => {
    if (bgSaving) return;
    const extensions =
      type === "image"
        ? ["png", "jpg", "jpeg", "gif", "webp", "bmp"]
        : ["mp4", "webm", "ogg", "mov"];
    try {
      const res = await window.config.pickFile({
        title: t("settings.background.pickTitle"),
        extensions,
      });
      if (!res.ok || !res.path) return;
      setBgSaving(true);
      const saveRes = await window.config.backgroundSet(type, res.path);
      if (!saveRes.ok) throw new Error(saveRes.error || "Failed");
      setBgType(type);
      setBgPath(res.path);
      window.dispatchEvent(new Event("background:changed"));
    } catch (e) {
      console.error("Failed to set background", e);
      alert("Error #1000");
    } finally {
      setBgSaving(false);
    }
  };

  const handleClearBackground = async () => {
    if (bgSaving) return;
    setBgSaving(true);
    try {
      const res = await window.config.backgroundSet("none", "");
      if (!res.ok) throw new Error(res.error || "Failed");
      setBgType("none");
      setBgPath("");
      window.dispatchEvent(new Event("background:changed"));
    } catch (e) {
      console.error("Failed to clear background", e);
      alert("Error #1000");
    } finally {
      setBgSaving(false);
    }
  };

  return (
    <PanelContainer dir={isRTL ? "rtl" : "ltr"}>
      {/* Title row with back button / breadcrumb */}
      <PageHeader
        title={t("settings.title")}
        onBack={onBack}
        backLabel={t("common.back")}
        breadcrumb={creditsSubPage ? t("settings.credits.label") : null}
        onBreadcrumbBack={() => setCreditsSubPage(false)}
      />

      {/* Scrollable body */}
      {creditsSubPage ? (
        /* ── Credits subpage ── */
        <Box flex={1} minH={0} overflowY="auto" pr={1} className="dark-scrollbar">
            {[
              ["Project Lead & Lead Developer", [["vZyle", "Project Concept, Launcher Development, Online Client Patching System"]]],
              ["Launcher Developer", [["Fitzxel", "Launcher Programming"]]],
              ["Lead Graphic Designer", [["primeisonline", "Graphic Design and Matcha! system"]]],
              ["Operations Manager & Localization Lead", [["KaiZorakDEV", "Discord Management, Server Organization, Translation Systems"]]],
              ["Server Patching & Deployment Specialist", [["Nexusatko", "Online Server Patching, Dedicated Server Setup, Czech & Slovak Translation"]]],
              ["Technical Advisor", [["IkyMax", "Game Server Architecture Consultant"]]],
              ["Web Designer", [["Lunar Katsu", "Website Design"]]],
            ].map(([role, members]) => (
              <Box key={role as string} mt={6} _first={{ mt: 0 }}>
                <Text fontSize="11px" color="rgba(255,255,255,0.3)" fontWeight="bold" textTransform="uppercase" letterSpacing="0.06em">
                  {role as string}
                </Text>
                {(members as [string, string][]).map(([name, desc]) => (
                  <Text key={name} mt={1} fontSize="sm" color="rgba(255,255,255,0.75)">
                    <Text as="span" color="#67b7f7">{name}</Text> — {desc}
                  </Text>
                ))}
              </Box>
            ))}

            <Box mt={6}>
              <Text fontSize="11px" color="rgba(255,255,255,0.3)" fontWeight="bold" textTransform="uppercase" letterSpacing="0.06em">
                Localization Team
              </Text>
              {[
                ["Kapugoat", "Spanish"], ["SaYrZ", "Arabic"], ["multyfora", "Russian"],
                ["bimbimbamreal", "German"], ["mobun", "Vietnamese"], ["polished_mercury", "Polish"],
                ["farrdev", "Indonesian"], ["fine_xd_", "Persian/Farsi"], ["Astinix", "Ukrainian"],
              ].map(([name, lang]) => (
                <Text key={name} mt={1} fontSize="sm" color="rgba(255,255,255,0.75)">
                  <Text as="span" color="#67b7f7">{name}</Text> — {lang}
                </Text>
              ))}
            </Box>

            <Box mt={6}>
              <Text fontSize="11px" color="rgba(255,255,255,0.3)" fontWeight="bold" textTransform="uppercase" letterSpacing="0.06em">
                Special Thanks
              </Text>
              <Text mt={1} fontSize="sm" color="rgba(255,255,255,0.75)">
                <Text as="span" color="#67b7f7">Magd &amp; Kyo</Text> — Honorable Mentions
              </Text>
            </Box>

            <Text mt={6} mb={4} fontSize="sm" color="rgba(255,255,255,0.35)" fontStyle="italic">
              Thank you to everyone who made this project possible ♥
            </Text>
        </Box>
      ) : (
      /* ── Main settings list ── */
      <Box flex={1} minH={0} overflowY="auto" pr={1} className="dark-scrollbar">
        <VStack align="stretch" gap={0}>

          {/* Game directory */}
          <SettingRow
            label={t("settings.gameDirectory.label")}
            hint={dirPath}
            onClick={() => void handleOpenGameDir()}
            right={<IconFolderOpen size={18} color="#686868" />}
          />

          {/* Download directory */}
          <SettingRow
            label={changingDir ? t("settings.downloadDirectory.selecting") : t("settings.downloadDirectory.label")}
            hint={dirPath}
            onClick={changingDir ? undefined : () => void handleChangeDownloadDir()}
            right={<IconFolderOpen size={18} color="#686868" />}
            disabled={changingDir}
          />

          {/* Discord RPC */}
          <SettingRow
            label={t("settings.discordRPC")}
            hint={t("settings.discordRPCHint")}
            right={
              <Switch.Root
                checked={enableRPC}
                onCheckedChange={(d) => setEnableRPC(!!d.checked)}
                colorPalette="blue"
              >
                <Switch.HiddenInput />
                <Switch.Control />
              </Switch.Root>
            }
          />

          {/* Startup sound */}
          <SettingRow
            label={t("settings.startupSound")}
            hint={t("settings.startupSoundHint")}
            right={
              <Switch.Root
                checked={startupSoundEnabled}
                onCheckedChange={(d) => handleStartupSoundChange(!!d.checked)}
                colorPalette="blue"
              >
                <Switch.HiddenInput />
                <Switch.Control />
              </Switch.Root>
            }
          />

          {/* SteamDeck mode */}
          <SettingRow
            label={t("settings.steamDeck.label")}
            hint={steamDeckStatus || (isLinux ? t("settings.steamDeck.hintLinux") : t("settings.steamDeck.linuxOnly"))}
            right={
              <Switch.Root
                checked={steamDeckMode}
                disabled={!isLinux || steamDeckWorking}
                onCheckedChange={(d) => void handleToggleSteamDeckMode(!!d.checked)}
                colorPalette="blue"
                title={isLinux ? t("settings.steamDeck.tooltipLinux") : t("settings.steamDeck.hintNonLinux")}
              >
                <Switch.HiddenInput />
                <Switch.Control />
              </Switch.Root>
            }
          />

          {/* Online patch */}
          <SettingRow
            label={patchingOnline ? t("common.working") : t("settings.onlinePatch.removeButton")}
            hint={
              selectedIsRunning
                ? t("settings.onlinePatch.hintCloseGame")
                : gameDir && selected && selected.installed && !patchingOnline && !checkingOnlinePatchState && !onlinePatchEnabledForSelected
                  ? t("settings.onlinePatch.hintEnableToRemove")
                  : t("settings.onlinePatch.description")
            }
            onClick={canRemoveOnlinePatch ? () => setRemoveOnlinePatchOpen(true) : undefined}
            right={
              selected ? (
                <Text fontSize="xs" color="#686868">{selectedLabel}</Text>
              ) : undefined
            }
            danger
            disabled={!canRemoveOnlinePatch}
          />

          {/* Clear cache */}
          <SettingRow
            label={clearingCache ? t("settings.cache.clearing") : t("settings.cache.clearButton")}
            hint={t("settings.cache.description")}
            onClick={clearingCache ? undefined : () => void handleClearInstallCache()}
            disabled={clearingCache}
            right={<IconChevronRight size={16} color="#686868" />}
          />

          {/* Custom UUID (conditional) */}
          {accountType === "custom" && (
            <Box py={4} px={3} borderBottom="1px solid" borderColor="rgba(255,255,255,0.06)">
              <Text fontSize="15px" fontWeight="500" color="rgba(255,255,255,0.92)" mb={2}>
                {t("settings.customUUID.label")}
              </Text>
              <Input
                value={customUUID}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCustomUUID(e.target.value)}
                placeholder={t("settings.customUUID.placeholder")}
                bg="rgba(255,255,255,0.05)"
                border="1px solid rgba(255,255,255,0.1)"
                color="white"
                _focus={{ borderColor: "blue.500" }}
                spellCheck={false}
              />
              <HStack justify="space-between" mt={1}>
                <Text fontSize="xs" color="rgba(255,255,255,0.35)">
                  {customUUID.trim().length === 0
                    ? t("settings.customUUID.usesAuto")
                    : normalizedUUID === "__invalid__"
                      ? t("settings.customUUID.invalid")
                      : t("settings.customUUID.saved", { uuid: normalizedUUID })}
                </Text>
                <Button
                  size="xs"
                  variant="ghost"
                  color="red.400"
                  _hover={{ color: "red.300" }}
                  onClick={() => { setCustomUUID(""); StorageService.remove("customUUID"); }}
                >
                  {t("common.clear")}
                </Button>
              </HStack>
            </Box>
          )}

          {/* ── App section ── */}

          {/* Language */}
          <Box py={4} px={3} borderBottom="1px solid" borderColor="rgba(255,255,255,0.06)">
            <Text fontSize="15px" fontWeight="500" color="rgba(255,255,255,0.92)" mb={3}>
              {t("settings.language.label")}
            </Text>
            <HStack gap={2} flexWrap="wrap">
              {Object.entries(LANGUAGES).map(([code, info]) => {
                const isActive = lang === code;
                return (
                  <Box
                    key={code}
                    as="button"
                    px={3}
                    py="6px"
                    borderRadius="full"
                    fontSize="13px"
                    fontWeight={isActive ? "600" : "400"}
                    bg={isActive ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.05)"}
                    color={isActive ? "white" : "rgba(255,255,255,0.5)"}
                    border={`1px solid ${isActive ? "rgba(255,255,255,0.22)" : "transparent"}`}
                    cursor="pointer"
                    transition="all 0.15s"
                    onClick={() => changeLanguage(code as keyof typeof LANGUAGES)}
                    dir={(RTL_LANGUAGES as readonly string[]).includes(code) ? "rtl" : "ltr"}
                    display="inline-flex"
                    alignItems="center"
                    gap="6px"
                  >
                    <ReactCountryFlag
                      countryCode={info.countryCode}
                      svg
                      style={{ width: "16px", height: "12px", borderRadius: "2px" }}
                    />
                    {info.name}
                  </Box>
                );
              })}
            </HStack>
          </Box>

          {/* Check for updates */}
          <SettingRow
            label={checkingUpdates ? t("settings.updates.checking") : t("settings.updates.check")}
            hint={`${window.config.BUILD_DATE}  ·  v${window.config.VERSION}`}
            onClick={checkingUpdates ? undefined : () => checkForUpdates("manual")}
            disabled={checkingUpdates}
            right={<IconChevronRight size={16} color="#686868" />}
          />

          {/* Credits */}
          <SettingRow
            label={t("settings.credits.label")}
            hint={`${t("settings.madeBy")}: Butter Launcher Team`}
            onClick={() => setCreditsSubPage(true)}
            right={<IconChevronRight size={16} color="#686868" />}
          />

          {/* Logout */}
          {onLogout && (
            <SettingRow
              label={t("settings.logout")}
              onClick={onLogout}
              danger
              noBorder
              right={<IconChevronRight size={16} color="#f87171" />}
            />
          )}

        </VStack>
      </Box>
      )}{/* end main settings list */}

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
        onConfirm={() => { setRemoveOnlinePatchOpen(false); doRemoveOnlinePatch(); }}
      />
    </PanelContainer>
  );
};

export default SettingsPanel;
