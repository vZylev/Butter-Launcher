import type { BrowserWindow } from "electron";

export type AggregateProgress = {
  total?: number;
  current: number;
};

export type OnlinePatchState = {
  supported: boolean;
  available: boolean;
  enabled: boolean;
  downloaded: boolean;
};

export type OnlinePatchHealth = {
  supported: boolean;
  available: boolean;
  enabled: boolean;
  clientIsPatched: boolean;
  serverIsPatched: boolean;
  needsFixClient: boolean;
  needsFixServer: boolean;
  needsFix: boolean;
  patchOutdated: boolean;
};

export type CustomOnlinePatchProvider = {
  isAvailable: boolean;

  getClientPatchState: (gameDir: string, version: GameVersion) => {
    supported: boolean;
    available: boolean;
    enabled: boolean;
    downloaded: boolean;
  };
  getClientPatchHealth: (
    gameDir: string,
    version: GameVersion,
  ) => Promise<{
    supported: boolean;
    available: boolean;
    enabled: boolean;
    clientIsPatched: boolean;
    needsFixClient: boolean;
    patchOutdated: boolean;
  }>;
  fixClientToUnpatched: (
    gameDir: string,
    version: GameVersion,
    win: BrowserWindow,
    progressChannel?: "install-progress" | "online-unpatch-progress",
  ) => Promise<"fixed" | "not-needed" | "skipped">;
  enableClientPatch: (
    gameDir: string,
    version: GameVersion,
    win: BrowserWindow,
    progressChannel?: "install-progress" | "online-patch-progress",
    aggregate?: AggregateProgress,
  ) => Promise<"enabled" | "already-enabled" | "skipped">;
  disableClientPatch: (
    gameDir: string,
    version: GameVersion,
    win: BrowserWindow,
    progressChannel?: "online-unpatch-progress",
  ) => Promise<"disabled" | "already-disabled" | "skipped">;
  checkClientPatchNeeded: (
    gameDir: string,
    version: GameVersion,
  ) => Promise<"needs" | "up-to-date" | "skipped">;

  getServerPatchState: (gameDir: string, version: GameVersion) => {
    supported: boolean;
    available: boolean;
    enabled: boolean;
    downloaded: boolean;
  };
  getServerPatchHealth: (
    gameDir: string,
    version: GameVersion,
  ) => Promise<{
    supported: boolean;
    available: boolean;
    enabled: boolean;
    serverIsPatched: boolean;
    needsFixServer: boolean;
  }>;
  fixServerToUnpatched: (
    gameDir: string,
    version: GameVersion,
    win: BrowserWindow,
    progressChannel?: "online-unpatch-progress",
  ) => Promise<"fixed" | "not-needed" | "skipped">;
  enableServerPatch: (
    gameDir: string,
    version: GameVersion,
    win: BrowserWindow,
    progressChannel?: "install-progress" | "online-patch-progress",
    aggregate?: AggregateProgress,
  ) => Promise<void>;
  disableServerPatch: (
    gameDir: string,
    version: GameVersion,
    win: BrowserWindow,
    progressChannel?: "online-unpatch-progress",
  ) => Promise<void>;
  checkServerPatchNeeded: (
    gameDir: string,
    version: GameVersion,
  ) => Promise<"needs" | "up-to-date" | "skipped">;

  enableOnlinePatch: (
    gameDir: string,
    version: GameVersion,
    win: BrowserWindow,
    progressChannel?: "install-progress" | "online-patch-progress",
  ) => Promise<"enabled" | "already-enabled" | "skipped">;
  disableOnlinePatch: (
    gameDir: string,
    version: GameVersion,
    win: BrowserWindow,
    progressChannel?: "online-unpatch-progress",
  ) => Promise<"disabled" | "already-disabled" | "skipped">;
  removeOnlinePatch: (
    gameDir: string,
    version: GameVersion,
    win: BrowserWindow,
    progressChannel?: "online-unpatch-progress",
  ) => Promise<"disabled" | "already-disabled" | "skipped">;
  getOnlinePatchState: (gameDir: string, version: GameVersion) => OnlinePatchState;
  getOnlinePatchHealth: (gameDir: string, version: GameVersion) => Promise<OnlinePatchHealth>;
  checkOnlinePatchNeeded: (
    gameDir: string,
    version: GameVersion,
  ) => Promise<"needs" | "up-to-date" | "skipped">;
  fixOnlinePatch: (
    gameDir: string,
    version: GameVersion,
    win: BrowserWindow,
    progressChannel?: "online-unpatch-progress",
  ) => Promise<"fixed" | "not-needed" | "skipped">;
};

const stubProvider: CustomOnlinePatchProvider = {
  isAvailable: false,
  getClientPatchState: () => ({
    supported: false,
    available: false,
    enabled: false,
    downloaded: false,
  }),
  getClientPatchHealth: async () => ({
    supported: false,
    available: false,
    enabled: false,
    clientIsPatched: false,
    needsFixClient: false,
    patchOutdated: false,
  }),
  fixClientToUnpatched: async () => {
    throw new Error("CustomOnlinePatchProvider not installed (dynamic_modules missing)");
  },
  enableClientPatch: async () => {
    throw new Error("CustomOnlinePatchProvider not installed (dynamic_modules missing)");
  },
  disableClientPatch: async () => {
    throw new Error("CustomOnlinePatchProvider not installed (dynamic_modules missing)");
  },
  checkClientPatchNeeded: async () => "skipped",

  getServerPatchState: () => ({
    supported: false,
    available: false,
    enabled: false,
    downloaded: false,
  }),
  getServerPatchHealth: async () => ({
    supported: false,
    available: false,
    enabled: false,
    serverIsPatched: false,
    needsFixServer: false,
  }),
  fixServerToUnpatched: async () => {
    throw new Error("CustomOnlinePatchProvider not installed (dynamic_modules missing)");
  },
  enableServerPatch: async () => {
    throw new Error("CustomOnlinePatchProvider not installed (dynamic_modules missing)");
  },
  disableServerPatch: async () => {
    throw new Error("CustomOnlinePatchProvider not installed (dynamic_modules missing)");
  },
  checkServerPatchNeeded: async () => "skipped",

  enableOnlinePatch: async () => {
    throw new Error("CustomOnlinePatchProvider not installed (dynamic_modules missing)");
  },
  disableOnlinePatch: async () => {
    throw new Error("CustomOnlinePatchProvider not installed (dynamic_modules missing)");
  },
  removeOnlinePatch: async () => {
    throw new Error("CustomOnlinePatchProvider not installed (dynamic_modules missing)");
  },
  getOnlinePatchState: () => ({
    supported: false,
    available: false,
    enabled: false,
    downloaded: false,
  }),
  getOnlinePatchHealth: async () => ({
    supported: false,
    available: false,
    enabled: false,
    clientIsPatched: false,
    serverIsPatched: false,
    needsFixClient: false,
    needsFixServer: false,
    needsFix: false,
    patchOutdated: false,
  }),
  checkOnlinePatchNeeded: async () => "skipped",
  fixOnlinePatch: async () => {
    throw new Error("CustomOnlinePatchProvider not installed (dynamic_modules missing)");
  },
};

// Optional dynamic module hook.
// - If `dynamic_modules` doesn't exist, this glob resolves to an empty object.
// - If it exists, we expect it to export `customOnlinePatchProvider`.
const customOnlinePatchProviderGlob = import.meta.glob<{
  customOnlinePatchProvider?: CustomOnlinePatchProvider;
}>("../../../dynamic_modules/electron/customOnlinePatchProvider.{ts,js,mjs}", {
  eager: true,
});

const resolveCustomOnlinePatchProvider = (): CustomOnlinePatchProvider => {
  try {
    const mods = Object.values(customOnlinePatchProviderGlob);
    const maybe =
      mods && mods.length ? (mods[0] as any)?.customOnlinePatchProvider : null;
    if (
      maybe &&
      typeof maybe === "object" &&
      typeof maybe.enableOnlinePatch === "function" &&
      typeof maybe.getOnlinePatchState === "function"
    ) {
      return maybe as CustomOnlinePatchProvider;
    }
  } catch {
    // ignore
  }
  return stubProvider;
};

export const customOnlinePatchProvider: CustomOnlinePatchProvider =
  resolveCustomOnlinePatchProvider();
