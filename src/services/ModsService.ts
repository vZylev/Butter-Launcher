/**
 * ModsService — all IPC calls related to CurseForge mod browsing,
 * installation, profiles, and registry management.
 */

// ── Types ──────────────────────────────────────────────────────

export type BrowseSort =
  | "relevance"
  | "installedFirst"
  | "popularity"
  | "latestUpdate"
  | "creationDate"
  | "totalDownloads"
  | "az";

export type DiscoverMod = {
  id: number;
  name: string;
  summary: string;
  author: string;
  dateCreated?: string;
  dateModified?: string;
  downloadCount?: number;
  logoThumbnailUrl?: string;
  latestVersionName?: string;
  latestFileId?: number;
};

export type ModDetails = {
  id: number;
  name: string;
  summary: string;
  slug?: string;
  author?: string;
  dateCreated?: string;
  dateModified?: string;
  downloadCount?: number;
  logoUrl?: string;
  screenshots?: Array<{ title?: string; url?: string; thumbnailUrl?: string }>;
};

export type ModFileInfo = {
  id: number;
  displayName?: string;
  fileName?: string;
  fileDate?: string;
  releaseType?: number;
  downloadCount?: number;
  gameVersions?: string[];
};

export type ModRegistryEntry = {
  modId: number;
  fileId?: number;
  fileName?: string;
  installedAt?: string;
};

export type InstalledModFile = {
  fileName: string;
  enabled: boolean;
};

export type ModProfile = {
  name: string;
  mods: string[];
  cf?: Record<string, { modId: number; fileId?: number }>;
};

// ── Service ────────────────────────────────────────────────────

export const ModsService = {
  // -- Browse / Discover --

  async browse(opts: {
    query: string;
    sort: BrowseSort;
    index: number;
    pageSize: number;
  }): Promise<any> {
    const backendSort: BrowseSort =
      opts.sort === "installedFirst" ? "popularity" : opts.sort;
    return await window.config.modsBrowse({
      query: opts.query ?? "",
      sort: backendSort,
      index: opts.index,
      pageSize: opts.pageSize,
    });
  },

  async getDetails(modId: number): Promise<any> {
    return await window.config.modsGetDetails(modId);
  },

  // -- Install / Download --

  async install(modId: number, gameDir: string): Promise<any> {
    return await window.config.modsInstall(modId, gameDir);
  },

  async installFile(
    modId: number,
    fileId: number,
    gameDir: string,
  ): Promise<any> {
    return await window.config.modsInstallFile(modId, fileId, gameDir);
  },

  async attachManual(
    gameDir: string,
    fileName: string,
    url: string,
  ): Promise<any> {
    return await window.config.modsAttachManual(gameDir, fileName, url);
  },

  // -- Updates --

  async checkUpdateOne(gameDir: string, modId: number): Promise<any> {
    return await window.config.modsCheckUpdateOne(gameDir, modId);
  },

  async checkUpdatesAll(gameDir: string): Promise<any> {
    return await window.config.modsCheckUpdatesAll(gameDir);
  },

  async updateOne(gameDir: string, modId: number): Promise<any> {
    return await window.config.modsUpdateOne(gameDir, modId);
  },

  async updateAll(gameDir: string): Promise<any> {
    return await window.config.modsUpdateAll(gameDir);
  },

  // -- Registry --

  async getRegistry(gameDir: string): Promise<any> {
    return await window.config.modsRegistry(gameDir);
  },

  // -- Installed mods --

  async listInstalled(gameDir: string): Promise<any> {
    return await window.config.modsInstalledList(gameDir);
  },

  async toggleInstalled(gameDir: string, fileName: string): Promise<any> {
    return await window.config.modsInstalledToggle(gameDir, fileName);
  },

  async deleteInstalled(gameDir: string, fileName: string): Promise<any> {
    return await window.config.modsInstalledDelete(gameDir, fileName);
  },

  async fileHash(gameDir: string, fileName: string): Promise<any> {
    return await window.config.modsFileHash(gameDir, fileName);
  },

  async setAllEnabled(gameDir: string, enabled: boolean): Promise<any> {
    return await window.config.modsInstalledSetAll(gameDir, enabled);
  },

  // -- Profiles --

  async listProfiles(gameDir: string): Promise<any> {
    return await window.config.modsProfilesList(gameDir);
  },

  async saveProfile(gameDir: string, profile: ModProfile): Promise<any> {
    return await window.config.modsProfilesSave(gameDir, profile);
  },

  async deleteProfile(gameDir: string, name: string): Promise<any> {
    return await window.config.modsProfilesDelete(gameDir, name);
  },

  async applyProfile(gameDir: string, name: string): Promise<any> {
    return await window.config.modsProfilesApply(gameDir, name);
  },

  // -- Utility --

  async getDefaultGameDir(): Promise<string> {
    return await window.config.getDefaultGameDirectory();
  },

  async openModsFolder(path: string): Promise<void> {
    await window.config.openFolder(path);
  },
};
