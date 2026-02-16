/// <reference types="vite-plugin-electron/electron-env" />

// Types: the polite fiction that everything is under control.

declare namespace NodeJS {
  interface ProcessEnv {
    /**
     * The built directory structure
     *
     * ```tree
     * ├─┬─┬ dist
     * │ │ └── index.html
     * │ │
     * │ ├─┬ dist-electron
     * │ │ ├── main.js
     * │ │ └── preload.js
     * │
     * ```
     */
    APP_ROOT: string;
    /** /dist/ or /public/ */
    VITE_PUBLIC: string;
  }
}

// Used in Renderer process, expose in `preload.ts`
interface Window {
  ipcRenderer: import("electron").IpcRenderer;
  config: {
    OS: NodeJS.Platform;
    ARCH: NodeJS.Architecture;
    getDefaultGameDirectory: () => Promise<string>;
    getDownloadDirectory: () => Promise<string>;
    selectDownloadDirectory: () => Promise<{ ok: boolean; path: string | null; error: string | null }>;
    pickFolder: (payload?: { title?: string; defaultPath?: string }) => Promise<{ ok: boolean; path: string | null; error: string | null }>;
    pickFile: (payload?: { title?: string; defaultPath?: string; extensions?: string[] }) => Promise<{ ok: boolean; path: string | null; error: string | null }>;
    getSteamDeckMode: () => Promise<boolean>;
    setSteamDeckMode: (enabled: boolean, gameDir?: string | null) => Promise<any>;
    openFolder: (
      folderPath: string,
    ) => Promise<{ ok: boolean; error: string | null }>;
    openExternal: (
      url: string,
    ) => Promise<{ ok: boolean; error: string | null }>;

    supportTicketCollect: (
      username: string,
      customUUID?: string | null,
    ) => Promise<
      | {
          ok: true;
          username: string;
          uuid: string;
          logs: Array<{
            group: "launcher" | "client" | "server";
            relPath: string;
            fileName: string;
            mtimeMs: number;
            size: number;
            truncated: boolean;
            content: string;
          }>;
        }
      | { ok: false; error: string }
    >;

    startupSoundGet: () => Promise<
      | {
          ok: true;
          existed: boolean;
          playstartupsound: boolean;
          firstRunStartupSoundPending: boolean;
          settingsPath: string;
          error: null;
        }
      | {
          ok: false;
          existed: false;
          playstartupsound: false;
          firstRunStartupSoundPending: false;
          settingsPath: string;
          error: string;
        }
    >;
    startupSoundSet: (enabled: boolean) => Promise<{ ok: boolean; settingsPath: string; error: string | null }>;
    startupSoundMarkFirstRunPlayed: () => Promise<{ ok: boolean; settingsPath: string; error: string | null }>;

    premiumStatus: () => Promise<
      | { ok: true; loggedIn: boolean; profile: { displayName: string; sub?: string } | null; error: null }
      | { ok: false; loggedIn: false; profile: null; error: string }
    >;
    premiumOauthStart: () => Promise<
      | { ok: true; displayName: string; error: null }
      | { ok: false; displayName: ""; error: string }
    >;
    premiumOauthCancel: () => Promise<{ ok: boolean; error: string | null }>;
    premiumLogout: () => Promise<{ ok: boolean; error: string | null }>;

    hostServerStart: (
      gameDir: string,
      version: GameVersion,
      opts?: {
        assetsZipPath?: string | null;
        authMode?: "offline" | "authenticated" | "insecure";
        noAot?: boolean;
        ramMinGb?: number | null;
        ramMaxGb?: number | null;
      },
    ) => Promise<
      | { ok: true; pid: number; serverDir: string; cmd: string; args: string[] }
      | { ok: false; error: { code: string; message: string; details?: any } }
    >;
    hostServerStop: () => Promise<{ ok: boolean; error?: { code: string; message: string } }>;
    hostServerCommand: (
      command: string,
    ) => Promise<{ ok: boolean; error?: { code: string; message: string } }>;

    hostServerSyncFolder: (
      gameDir: string,
      version: GameVersion,
      kind: "universe" | "mods" | "earlyplugins",
      sourceDir: string,
    ) => Promise<{ ok: boolean; error?: { code: string; message: string; details?: any } }>;

    modsSearch: (query?: string) => Promise<{ ok: boolean; mods: any[]; error?: string | null }>;
    modsBrowse: (payload?: { query?: string; sort?: string; index?: number; pageSize?: number }) => Promise<{ ok: boolean; mods: any[]; pagination?: any; error?: string | null }>;
    modsGetDescription: (modId: number) => Promise<{ ok: boolean; html: string; error?: string }>;
    modsGetDetails: (modId: number) => Promise<{ ok: boolean; mod: any; html: string; files: any[]; error?: string | null }>;
    modsInstall: (modId: number, gameDir: string) => Promise<{ ok: boolean; fileId?: number; fileName?: string; error?: string }>;
    modsInstallFile: (modId: number, fileId: number, gameDir: string) => Promise<{ ok: boolean; fileId?: number; fileName?: string; error?: string }>;
    modsRegistry: (gameDir: string) => Promise<{ ok: boolean; items: Array<{ modId: number; fileId?: number; fileName?: string; installedAt?: string }>; error: string | null }>;
    modsInstalledList: (gameDir: string) => Promise<{ ok: boolean; modsDir: string; items: Array<{ fileName: string; enabled: boolean }>; error: string | null }>;
    modsInstalledToggle: (gameDir: string, fileName: string) => Promise<{ ok: boolean; error?: string }>;
    modsInstalledDelete: (gameDir: string, fileName: string) => Promise<{ ok: boolean; error?: string }>;
    modsFileHash: (gameDir: string, fileName: string) => Promise<{ ok: boolean; sha256: string; error: string | null }>;
    modsInstalledSetAll: (gameDir: string, enabled: boolean) => Promise<{ ok: boolean; changed?: number; error?: string }>;

    modsProfilesList: (gameDir: string) => Promise<{ ok: boolean; profiles: Array<{ name: string; mods: string[]; cf?: Record<string, { modId: number; fileId?: number }> }>; error?: string }>;
        // TypeScript: the only thing standing between us and complete IPC anarchy.
        modsProfilesSave: (
          gameDir: string,
          profile: { name: string; mods: string[]; cf?: Record<string, { modId: number; fileId?: number }> },
        ) => Promise<{ ok: boolean; error?: string }>;
    modsProfilesDelete: (gameDir: string, name: string) => Promise<{ ok: boolean; error?: string }>;
    modsProfilesApply: (gameDir: string, name: string) => Promise<{ ok: boolean; enabledCount?: number; disabledCount?: number; error?: string }>;

    VERSION: string;
    BUILD_DATE: string;
  };
}
