import { app } from "electron";
import fs from "node:fs";
import path from "node:path";

export type BackgroundType = "none" | "image" | "video";

export type LauncherSettings = {
  playstartupsound: boolean;
  firstRunStartupSoundPending?: boolean;
  backgroundType?: BackgroundType;
  backgroundPath?: string;
};

const DEFAULT_SETTINGS: LauncherSettings = {
  playstartupsound: false,
  firstRunStartupSoundPending: true,
};

const getSettingsDir = () => {
  return path.join(app.getPath("userData"), "butter-launcher");
};

const getSettingsPath = () => {
  return path.join(getSettingsDir(), "settings.json");
};

const VALID_BG_TYPES: BackgroundType[] = ["none", "image", "video"];

const safeParseSettings = (raw: string): LauncherSettings | null => {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const play = (parsed as any).playstartupsound;
    if (typeof play !== "boolean") return null;
    const pendingRaw = (parsed as any).firstRunStartupSoundPending;
    const pending = typeof pendingRaw === "boolean" ? pendingRaw : false;
    const bgTypeRaw = (parsed as any).backgroundType;
    const backgroundType: BackgroundType =
      typeof bgTypeRaw === "string" && VALID_BG_TYPES.includes(bgTypeRaw as BackgroundType)
        ? (bgTypeRaw as BackgroundType)
        : "none";
    const bgPathRaw = (parsed as any).backgroundPath;
    const backgroundPath = typeof bgPathRaw === "string" ? bgPathRaw : "";
    return { playstartupsound: play, firstRunStartupSoundPending: pending, backgroundType, backgroundPath };
  } catch {
    return null;
  }
};

const writeSettingsAtomic = (settingsPath: string, settings: LauncherSettings) => {
  const dir = path.dirname(settingsPath);
  fs.mkdirSync(dir, { recursive: true });

  const tmpPath = settingsPath + ".tmp";
  fs.writeFileSync(tmpPath, JSON.stringify(settings, null, 2), "utf-8");
  fs.renameSync(tmpPath, settingsPath);
};

export const readOrInitLauncherSettings = (): {
  settings: LauncherSettings;
  existed: boolean;
  settingsPath: string;
} => {
  const settingsPath = getSettingsPath();

  try {
    if (fs.existsSync(settingsPath)) {
      const raw = fs.readFileSync(settingsPath, "utf-8");
      const parsed = safeParseSettings(raw);
      if (parsed) {
        return { settings: parsed, existed: true, settingsPath };
      }

      // If it's corrupted/invalid, treat it like missing and re-init.
      writeSettingsAtomic(settingsPath, DEFAULT_SETTINGS);
      return { settings: DEFAULT_SETTINGS, existed: false, settingsPath };
    }

    writeSettingsAtomic(settingsPath, DEFAULT_SETTINGS);
    return { settings: DEFAULT_SETTINGS, existed: false, settingsPath };
  } catch {
    // If we can't read/write, fall back to defaults and mark as "missing".
    return { settings: DEFAULT_SETTINGS, existed: false, settingsPath };
  }
};

export const setPlayStartupSound = (enabled: boolean): { ok: boolean; settingsPath: string } => {
  const settingsPath = getSettingsPath();
  try {
    const current = readOrInitLauncherSettings().settings;
    const next: LauncherSettings = {
      ...current,
      playstartupsound: !!enabled,
      // Once the user touches the setting, first-run autoplay is no longer needed.
      firstRunStartupSoundPending: false,
    };
    writeSettingsAtomic(settingsPath, next);
    return { ok: true, settingsPath };
  } catch {
    return { ok: false, settingsPath };
  }
};

export const markFirstRunStartupSoundPlayed = (): { ok: boolean; settingsPath: string } => {
  const settingsPath = getSettingsPath();
  try {
    const current = readOrInitLauncherSettings().settings;
    if (!current.firstRunStartupSoundPending) {
      return { ok: true, settingsPath };
    }
    const next: LauncherSettings = {
      ...current,
      firstRunStartupSoundPending: false,
    };
    writeSettingsAtomic(settingsPath, next);
    return { ok: true, settingsPath };
  } catch {
    return { ok: false, settingsPath };
  }
};

export const getBackground = (): { ok: boolean; backgroundType: BackgroundType; backgroundPath: string } => {
  try {
    const { settings } = readOrInitLauncherSettings();
    return {
      ok: true,
      backgroundType: settings.backgroundType || "none",
      backgroundPath: settings.backgroundPath || "",
    };
  } catch {
    return { ok: false, backgroundType: "none", backgroundPath: "" };
  }
};

export const setBackground = (
  backgroundType: BackgroundType,
  backgroundPath: string,
): { ok: boolean; settingsPath: string } => {
  const settingsPath = getSettingsPath();
  try {
    const current = readOrInitLauncherSettings().settings;
    const next: LauncherSettings = {
      ...current,
      backgroundType,
      backgroundPath,
    };
    writeSettingsAtomic(settingsPath, next);
    return { ok: true, settingsPath };
  } catch {
    return { ok: false, settingsPath };
  }
};
