import type { BrowserWindow } from "electron";

import {
  installGame as installGameOfficial,
  installGameSmart as installGameSmartOfficial,
} from "../game/install";

export type InstallAccountKind = "official" | "alternative";

export type CustomInstallProvider = {
  isAvailable: boolean;

  installGame: (
    gameDir: string,
    version: GameVersion,
    win: BrowserWindow,
    accountKind: InstallAccountKind,
  ) => Promise<boolean>;

  installGameSmart: (
    gameDir: string,
    version: GameVersion,
    fromBuildIndex: number,
    win: BrowserWindow,
    accountKind: InstallAccountKind,
  ) => Promise<boolean>;

  installGameForLaunch: (
    gameDir: string,
    version: GameVersion,
    win: BrowserWindow,
    accountKind: InstallAccountKind,
  ) => Promise<boolean>;
};

const stubProvider: CustomInstallProvider = {
  isAvailable: false,

  installGame: async (gameDir, version, win, accountKind) => {
    if (accountKind !== "official") {
      throw new Error(
        "CustomInstallProvider not installed (alternative install requires dynamic_modules)",
      );
    }
    return await installGameOfficial(gameDir, version, win);
  },

  installGameSmart: async (gameDir, version, fromBuildIndex, win, accountKind) => {
    if (accountKind !== "official") {
      throw new Error(
        "CustomInstallProvider not installed (alternative install requires dynamic_modules)",
      );
    }
    return await installGameSmartOfficial(gameDir, version, fromBuildIndex, win);
  },

  installGameForLaunch: async (gameDir, version, win, accountKind) => {
    if (accountKind !== "official") {
      throw new Error(
        "CustomInstallProvider not installed (alternative install requires dynamic_modules)",
      );
    }
    return await installGameOfficial(gameDir, version, win);
  },
};

// Optional dynamic module hook.
// - If `dynamic_modules` doesn't exist, this glob resolves to an empty object.
// - If it exists, we expect it to export `customInstallProvider`.
const customInstallProviderGlob = import.meta.glob<{
  customInstallProvider?: CustomInstallProvider;
}>("../../../dynamic_modules/electron/customInstallProvider.{ts,js,mjs}", {
  eager: true,
});

const resolveCustomInstallProvider = (): CustomInstallProvider => {
  try {
    const mods = Object.values(customInstallProviderGlob);
    const maybe =
      mods && mods.length ? (mods[0] as any)?.customInstallProvider : null;
    if (
      maybe &&
      typeof maybe === "object" &&
      typeof maybe.installGame === "function" &&
      typeof maybe.installGameSmart === "function" &&
      typeof maybe.installGameForLaunch === "function"
    ) {
      return maybe as CustomInstallProvider;
    }
  } catch {
    // ignore
  }
  return stubProvider;
};

export const customInstallProvider: CustomInstallProvider =
  resolveCustomInstallProvider();
