import React, { useEffect, useMemo, useRef, useState } from "react";
import { IconFolderOpen, IconX } from "@tabler/icons-react";
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
  SimpleGrid,
  Switch,
  Text,
  VStack,
} from "@chakra-ui/react";

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
  const [creditsOpen, setCreditsOpen] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);
  const [closing, setClosing] = useState(false);

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
    if (!open) return;
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
    const raw = StorageService.getAccountType();
    if (raw === "premium") setAccountType("premium");
    else if (raw === "custom") setAccountType("custom");
    else setAccountType(null);
  }, [open]);

  useEffect(() => { if (!open) return; setCreditsOpen(false); }, [open]);

  useEffect(() => {
    if (!open) return;
    const raw = customUUID.trim();
    if (!raw) { StorageService.remove("customUUID"); return; }
    if (normalizedUUID && normalizedUUID !== "__invalid__") {
      StorageService.set("customUUID", normalizedUUID);
    }
  }, [customUUID, normalizedUUID, open]);

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
  }, [open, gameDir, selected]);

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

  if (!open && !closing) return null;

  const labelStyle = {
    fontSize: "10px",
    textTransform: "uppercase" as const,
    letterSpacing: "0.08em",
    color: "var(--chakra-colors-whiteAlpha-500)",
    fontWeight: "bold",
  };

  return (
    <Box
      className="glass-backdrop animate-fade-in"
      position="fixed"
      inset={0}
      zIndex={50}
      display="flex"
      alignItems="center"
      justifyContent="center"
      dir={isRTL ? "rtl" : "ltr"}
    >
      <Box
        className={closing ? "animate-settings-out" : "animate-settings-in"}
        position="relative"
        w="92vw"
        maxW="1800px"
        h="88vh"
        mx="auto"
        rounded="xl"
        bg="linear-gradient(to bottom, rgba(27,32,48,0.97), rgba(20,24,36,0.97))"
        border="1px solid"
        borderColor="whiteAlpha.100"
        shadow="2xl"
        px={10}
        py={6}
        display="flex"
        flexDir="column"
      >
        <IconButton
          aria-label={t("common.close")}
          position="absolute"
          top={3}
          {...(isRTL ? { left: 3 } : { right: 3 })}
          size="sm"
          variant="ghost"
          color="whiteAlpha.600"
          _hover={{ color: "white", bg: "whiteAlpha.100" }}
          rounded="full"
          onClick={() => {
            setClosing(true);
            setTimeout(() => { setClosing(false); onClose(); }, 160);
          }}
        >
          <IconX size={18} />
        </IconButton>

        <Text fontSize="lg" fontWeight="semibold" color="white" letterSpacing="wide" mb={4}>
          {t("settings.title")}
        </Text>

        <Box flex={1} minH={0} overflowY="auto" pr={2} className="dark-scrollbar">
          <SimpleGrid columns={2} gap={6}>

            <VStack align="stretch" gap={2}>
              <Text style={labelStyle}>{t("settings.gameDirectory.label")}</Text>
              <Button
                w="full"
                justifyContent="space-between"
                bg="rgba(31,37,56,1)"
                _hover={{ bg: "rgba(38,45,68,1)" }}
                border="1px solid"
                borderColor="whiteAlpha.100"
                color="white"
                onClick={handleOpenGameDir}
              >
                <Text fontSize="sm">{t("settings.gameDirectory.openFolder")}</Text>
                <IconFolderOpen size={18} />
              </Button>
            </VStack>

            <VStack align="stretch" gap={2}>
              <Text style={labelStyle}>{t("settings.downloadDirectory.label")}</Text>
              <Button
                w="full"
                justifyContent="space-between"
                bg="rgba(31,37,56,1)"
                _hover={{ bg: "rgba(38,45,68,1)" }}
                border="1px solid"
                borderColor="whiteAlpha.100"
                color="white"
                disabled={changingDir}
                onClick={handleChangeDownloadDir}
              >
                <Text fontSize="sm">
                  {changingDir ? t("settings.downloadDirectory.selecting") : t("settings.downloadDirectory.change")}
                </Text>
                <IconFolderOpen size={18} />
              </Button>
              <Text fontSize="10px" color="whiteAlpha.500" fontFamily="mono" wordBreak="break-all">
                {gameDir || t("settings.downloadDirectory.loading")}
              </Text>
            </VStack>

            {accountType === "custom" && (
              <Box gridColumn="span 2">
                <VStack align="stretch" gap={2}>
                  <Text style={labelStyle}>{t("settings.customUUID.label")}</Text>
                  <Input
                    value={customUUID}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCustomUUID(e.target.value)}
                    placeholder={t("settings.customUUID.placeholder")}
                    bg="rgba(31,37,56,1)"
                    border="1px solid"
                    borderColor="whiteAlpha.100"
                    color="white"
                    _focus={{ borderColor: "blue.500" }}
                    spellCheck={false}
                  />
                  <HStack justify="space-between">
                    <Text fontSize="10px" color="whiteAlpha.500">
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
                </VStack>
              </Box>
            )}

            <HStack gap={3} align="center">
              <Text style={labelStyle}>{t("settings.discordRPC")}:</Text>
              <Switch.Root
                checked={enableRPC}
                onCheckedChange={(d) => setEnableRPC(!!d.checked)}
                colorPalette="blue"
              >
                <Switch.HiddenInput />
                <Switch.Control />
                <Switch.Label fontSize="xs" color="whiteAlpha.700">
                  {enableRPC ? t("common.enabled") : t("common.disabled")}
                </Switch.Label>
              </Switch.Root>
            </HStack>

            <HStack gap={3} align="center">
              <Text style={labelStyle}>{t("settings.startupSound")}:</Text>
              <Switch.Root
                checked={startupSoundEnabled}
                onCheckedChange={(d) => handleStartupSoundChange(!!d.checked)}
                colorPalette="blue"
              >
                <Switch.HiddenInput />
                <Switch.Control />
                <Switch.Label fontSize="xs" color="whiteAlpha.700">
                  {startupSoundEnabled ? t("common.enabled") : t("common.disabled")}
                </Switch.Label>
              </Switch.Root>
            </HStack>

            <Box gridColumn="span 2">
              <HStack gap={3} align="center">
                <Text style={labelStyle}>{t("settings.steamDeck.label")}:</Text>
                <Switch.Root
                  checked={steamDeckMode}
                  disabled={!isLinux || steamDeckWorking}
                  onCheckedChange={(d) => void handleToggleSteamDeckMode(!!d.checked)}
                  colorPalette="blue"
                  title={isLinux ? t("settings.steamDeck.tooltipLinux") : t("settings.steamDeck.hintNonLinux")}
                >
                  <Switch.HiddenInput />
                  <Switch.Control />
                  <Switch.Label fontSize="xs" color="whiteAlpha.700">
                    {steamDeckWorking ? t("common.working") : steamDeckMode ? t("common.enabled") : t("common.disabled")}
                  </Switch.Label>
                </Switch.Root>
              </HStack>
              <Text mt={2} fontSize="11px" color="whiteAlpha.500">
                {isLinux ? t("settings.steamDeck.hintLinux") : t("settings.steamDeck.linuxOnly")}
              </Text>
              {steamDeckStatus ? (
                <Text mt={2} fontSize="11px" color="whiteAlpha.500" fontFamily="mono" wordBreak="break-words">
                  {steamDeckStatus}
                </Text>
              ) : null}
            </Box>

            <Box gridColumn="span 2">
              <VStack align="stretch" gap={2}>
                <Text style={labelStyle}>{t("settings.onlinePatch.label")}</Text>
                <Button
                  w="full"
                  justifyContent="space-between"
                  bg="rgba(31,37,56,1)"
                  _hover={{ bg: "rgba(239,68,68,0.08)" }}
                  border="1px solid"
                  borderColor="rgba(239,68,68,0.3)"
                  color="red.300"
                  disabled={!canRemoveOnlinePatch}
                  onClick={() => setRemoveOnlinePatchOpen(true)}
                >
                  <Text fontSize="sm">
                    {patchingOnline ? t("common.working") : t("settings.onlinePatch.removeButton")}
                  </Text>
                  <Text fontSize="xs" opacity={0.8}>{selected ? selectedLabel : ""}</Text>
                </Button>
                {gameDir && selected && selected.installed && !patchingOnline && !checkingOnlinePatchState && !onlinePatchEnabledForSelected ? (
                  <Text fontSize="11px" color="whiteAlpha.500">{t("settings.onlinePatch.hintEnableToRemove")}</Text>
                ) : null}
                {selectedIsRunning ? (
                  <Text fontSize="11px" color="whiteAlpha.500">{t("settings.onlinePatch.hintCloseGame")}</Text>
                ) : null}
                <Text fontSize="11px" color="whiteAlpha.500">{t("settings.onlinePatch.description")}</Text>
              </VStack>
            </Box>

            <Box gridColumn="span 2">
              <VStack align="stretch" gap={2}>
                <Text style={labelStyle}>{t("settings.cache.label")}</Text>
                <Button
                  w="full"
                  justifyContent="flex-start"
                  bg="rgba(31,37,56,1)"
                  _hover={{ bg: "rgba(38,45,68,1)" }}
                  border="1px solid"
                  borderColor="whiteAlpha.100"
                  color="white"
                  disabled={clearingCache}
                  onClick={() => void handleClearInstallCache()}
                >
                  <Text fontSize="sm">
                    {clearingCache ? t("settings.cache.clearing") : t("settings.cache.clearButton")}
                  </Text>
                </Button>
                <Text fontSize="11px" color="whiteAlpha.500">{t("settings.cache.description")}</Text>
              </VStack>
            </Box>

          </SimpleGrid>
        </Box>

        <HStack
          pt={4}
          mt={4}
          borderTop="1px solid"
          borderColor="whiteAlpha.100"
          justify="space-between"
          gap={4}
          flexWrap="wrap"
        >
          <VStack align="flex-start" gap={2}>
            <Text fontSize="xs" color="whiteAlpha.500">
              {t("settings.madeBy")}:{" "}
              <Text
                as="span"
                fontWeight="extrabold"
                letterSpacing="wide"
                className="bg-chroma-animated animate-chroma-shift"
                style={{
                  background: "linear-gradient(90deg,#3b82f6,#22d3ee,#3b82f6)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundSize: "200% 100%",
                }}
              >
                {t("settings.teamName")}
              </Text>
            </Text>
            <Button
              variant="outline"
              size="sm"
              borderColor="rgba(59,130,246,0.4)"
              color="blue.400"
              _hover={{ bg: "rgba(59,130,246,0.1)" }}
              onClick={() => setCreditsOpen(true)}
            >
              {t("settings.credits.label")}
            </Button>
          </VStack>

          <VStack gap={1} align="center">
            <Text style={{ ...labelStyle, color: "var(--chakra-colors-whiteAlpha-400)" }}>
              {t("settings.language.label")} {LANGUAGES[lang].flag}
            </Text>
            <select
              value={lang}
              onChange={(e) => changeLanguage(e.target.value as keyof typeof LANGUAGES)}
              style={{
                background: "rgba(26,31,46,1)",
                border: "1px solid rgba(255,255,255,0.1)",
                color: "white",
                borderRadius: "8px",
                padding: "8px",
                outline: "none",
                fontSize: "0.875rem",
              }}
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
          </VStack>

          <VStack gap={3} align="flex-end">
            <Text fontSize="11px" fontFamily="mono" color="whiteAlpha.500">
              {`${window.config.BUILD_DATE} V${window.config.VERSION}`}
            </Text>
            <Button
              variant="outline"
              size="sm"
              borderColor="rgba(59,130,246,0.4)"
              color="blue.400"
              _hover={{ bg: "rgba(59,130,246,0.1)" }}
              disabled={checkingUpdates}
              onClick={() => checkForUpdates("manual")}
            >
              {checkingUpdates ? t("settings.updates.checking") : t("settings.updates.check")}
            </Button>
            {onLogout && (
              <Button
                size="sm"
                color="white"
                fontWeight="bold"
                shadow="lg"
                style={{ background: "linear-gradient(90deg,#3b82f6,#22d3ee)" }}
                _hover={{ opacity: 0.9 }}
                onClick={onLogout}
              >
                {t("settings.logout")}
              </Button>
            )}
          </VStack>
        </HStack>

        {creditsOpen ? (
          <Box
            position="absolute"
            inset={0}
            rounded="xl"
            className="glass-backdrop"
            display="flex"
            alignItems="center"
            justifyContent="center"
            p={6}
          >
            <Box
              position="relative"
              w="full"
              maxW="xl"
              rounded="xl"
              border="1px solid"
              borderColor="whiteAlpha.100"
              bg="linear-gradient(to bottom, rgba(27,32,48,0.97), rgba(20,24,36,0.97))"
              shadow="2xl"
              px={6}
              py={5}
            >
              <IconButton
                aria-label={t("common.close")}
                position="absolute"
                top={3}
                {...(isRTL ? { left: 3 } : { right: 3 })}
                size="sm"
                variant="ghost"
                color="whiteAlpha.600"
                _hover={{ color: "white", bg: "whiteAlpha.100" }}
                rounded="full"
                onClick={() => setCreditsOpen(false)}
              >
                <IconX size={18} />
              </IconButton>

              <Text fontSize="lg" fontWeight="semibold" color="white" letterSpacing="wide">
                {t("settings.credits.label")}
              </Text>

              <Box mt={4} maxH="320px" overflowY="auto" pr={1} className="dark-scrollbar">
                <Box rounded="lg" border="1px solid" borderColor="whiteAlpha.100" bg="rgba(31,37,56,0.7)" px={4} py={3}>
                  {[
                    ["Project Lead & Lead Developer", [["vZyle", "Project Concept, Launcher Development, Online Client Patching System"]]],
                    ["Launcher Developer", [["Fitzxel", "Launcher Programming"]]],
                    ["Lead Graphic Designer", [["primeisonline", "Graphic Design and Matcha! system"]]],
                    ["Operations Manager & Localization Lead", [["KaiZorakDEV", "Discord Management, Server Organization, Translation Systems"]]],
                    ["Server Patching & Deployment Specialist", [["Nexusatko", "Online Server Patching, Dedicated Server Setup, Czech & Slovak Translation"]]],
                    ["Technical Advisor", [["IkyMax", "Game Server Architecture Consultant"]]],
                    ["Web Designer", [["Lunar Katsu", "Website Design"]]],
                  ].map(([role, members]) => (
                    <Box key={role as string} mt={4} _first={{ mt: 0 }}>
                      <Text fontSize="11px" color="whiteAlpha.400" fontWeight="bold" textTransform="uppercase">
                        {role as string}
                      </Text>
                      {(members as [string, string][]).map(([name, desc]) => (
                        <Text key={name} mt={1} fontSize="sm" color="whiteAlpha.800">
                          <Text as="span" color="blue.400">{name}</Text> ({desc})
                        </Text>
                      ))}
                    </Box>
                  ))}

                  <Box mt={4}>
                    <Text fontSize="11px" color="whiteAlpha.400" fontWeight="bold" textTransform="uppercase">
                      Localization Team
                    </Text>
                    {[
                      ["Kapugoat", "Spanish"], ["SaYrZ", "Arabic"], ["multyfora", "Russian"],
                      ["bimbimbamreal", "German"], ["mobun", "Vietnamese"], ["polished_mercury", "Polish"],
                      ["farrdev", "Indonesian"], ["fine_xd_", "Persian/Farsi"], ["Astinix", "Ukrainian"],
                    ].map(([name, lang]) => (
                      <Text key={name} mt={1} fontSize="sm" color="whiteAlpha.800">
                        <Text as="span" color="blue.400">{name}</Text> ({lang})
                      </Text>
                    ))}
                  </Box>

                  <Box mt={4}>
                    <Text fontSize="11px" color="whiteAlpha.400" fontWeight="bold" textTransform="uppercase">
                      Special Thanks
                    </Text>
                    <Text mt={1} fontSize="sm" color="whiteAlpha.800">
                      <Text as="span" color="blue.400">Magd &amp; Kyo</Text> (Honorable Mentions)
                    </Text>
                  </Box>

                  <Text mt={4} fontSize="sm" color="whiteAlpha.800">
                    Thank you to everyone who made this project possible &lt;3
                  </Text>
                </Box>
              </Box>
            </Box>
          </Box>
        ) : null}
      </Box>

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
    </Box>
  );
};

export default SettingsModal;
