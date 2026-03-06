/**
 * Mods feature — shared types and helpers extracted from ModsPanel.tsx.
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

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

export type BrowseSort =
  | "relevance"
  | "installedFirst"
  | "popularity"
  | "latestUpdate"
  | "creationDate"
  | "totalDownloads"
  | "az";

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

export type InstalledSort =
  | "connectedToLauncher"
  | "installedManually"
  | "alphabetical"
  | "needsUpdate";

export type ModProfile = {
  name: string;
  mods: string[];
  cf?: Record<string, { modId: number; fileId?: number }>;
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Sorts discover mods so installed ones come first.
 */
export const sortDiscoverInstalledFirst = (
  mods: DiscoverMod[],
  registryByModId: Record<number, ModRegistryEntry>,
): DiscoverMod[] => {
  const decorated = mods.map((mod, idx) => ({
    mod,
    idx,
    installed: !!registryByModId[Number(mod?.id)],
  }));
  decorated.sort((a, b) => {
    const ai = a.installed ? 1 : 0;
    const bi = b.installed ? 1 : 0;
    if (ai !== bi) return bi - ai;
    return a.idx - b.idx;
  });
  return decorated.map((x) => x.mod);
};

/**
 * Format error from a mods IPC response.
 */
export const formatModsError = (
  res: any,
  fallbackKey: string,
  t: (key: string, args?: Record<string, any>) => string,
  fallbackArgs?: Record<string, any>,
): string => {
  if (res?.errorKey) return t(String(res.errorKey), res.errorArgs ?? {});
  const raw = typeof res?.error === "string" ? res.error.trim() : "";
  if (raw) return raw;
  return t(fallbackKey, fallbackArgs ?? {});
};
