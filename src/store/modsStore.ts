/**
 * Mods store — Zustand store for mod browser state.
 */

import { create } from "zustand";
import type {
  DiscoverMod,
  ModDetails,
  ModFileInfo,
  ModRegistryEntry,
  InstalledModFile,
  ModProfile,
  BrowseSort,
} from "../services/ModsService";

// ── Types ──────────────────────────────────────────────────────

type InstalledSort =
  | "connectedToLauncher"
  | "installedManually"
  | "alphabetical"
  | "needsUpdate";

interface ModsState {
  // Browse
  tab: "discover" | "installed" | "profiles";
  query: string;
  sort: BrowseSort;
  pageIndex: number;
  pageSize: number;
  hasMore: boolean;
  totalCount: number | null;
  discoverLoading: boolean;
  discoverError: string;
  discoverMods: DiscoverMod[];

  // Details
  detailsId: number | null;
  detailsLoading: boolean;
  detailsError: string;
  detailsMod: ModDetails | null;
  detailsHtml: string;
  detailsFiles: ModFileInfo[];

  // Download
  installingId: number | null;
  downloadProgress: Record<number, { received: number; total?: number }>;

  // Installed
  installedLoading: boolean;
  installedError: string;
  modsDir: string;
  installedItems: InstalledModFile[];
  installedSort: InstalledSort;
  installedSortAsc: boolean;

  // Registry
  registryError: string;
  registryByModId: Record<number, ModRegistryEntry>;

  // Updates
  updatesWorking: boolean;
  checkedUpdatesByModId: Record<
    number,
    { updateAvailable: boolean; latestFileId: number | null; latestName: string }
  >;
  checkedAllOnce: boolean;

  // Profiles
  profilesLoading: boolean;
  profilesError: string;
  profiles: ModProfile[];
  selectedProfileName: string;
}

interface ModsActions {
  setTab: (tab: "discover" | "installed" | "profiles") => void;
  setQuery: (q: string) => void;
  setSort: (s: BrowseSort) => void;
  setPageIndex: (i: number) => void;
  setHasMore: (h: boolean) => void;
  setTotalCount: (c: number | null) => void;
  setDiscoverLoading: (l: boolean) => void;
  setDiscoverError: (e: string) => void;
  setDiscoverMods: (mods: DiscoverMod[]) => void;
  appendDiscoverMods: (mods: DiscoverMod[]) => void;
  setDetailsId: (id: number | null) => void;
  setDetailsLoading: (l: boolean) => void;
  setDetailsError: (e: string) => void;
  setDetailsMod: (m: ModDetails | null) => void;
  setDetailsHtml: (h: string) => void;
  setDetailsFiles: (f: ModFileInfo[]) => void;
  setInstallingId: (id: number | null) => void;
  setDownloadProgress: (id: number, p: { received: number; total?: number }) => void;
  clearDownloadProgress: (id: number) => void;
  setInstalledLoading: (l: boolean) => void;
  setInstalledError: (e: string) => void;
  setModsDir: (d: string) => void;
  setInstalledItems: (items: InstalledModFile[]) => void;
  setInstalledSort: (s: InstalledSort) => void;
  setInstalledSortAsc: (a: boolean) => void;
  setRegistryError: (e: string) => void;
  setRegistryByModId: (r: Record<number, ModRegistryEntry>) => void;
  setUpdatesWorking: (w: boolean) => void;
  setCheckedUpdatesByModId: (u: Record<number, { updateAvailable: boolean; latestFileId: number | null; latestName: string }>) => void;
  setCheckedAllOnce: (c: boolean) => void;
  setProfilesLoading: (l: boolean) => void;
  setProfilesError: (e: string) => void;
  setProfiles: (p: ModProfile[]) => void;
  setSelectedProfileName: (n: string) => void;
  reset: () => void;
}

// ── Initial state ──────────────────────────────────────────────

const initialState: ModsState = {
  tab: "discover",
  query: "",
  sort: "popularity",
  pageIndex: 0,
  pageSize: 24,
  hasMore: false,
  totalCount: null,
  discoverLoading: false,
  discoverError: "",
  discoverMods: [],
  detailsId: null,
  detailsLoading: false,
  detailsError: "",
  detailsMod: null,
  detailsHtml: "",
  detailsFiles: [],
  installingId: null,
  downloadProgress: {},
  installedLoading: false,
  installedError: "",
  modsDir: "",
  installedItems: [],
  installedSort: "connectedToLauncher",
  installedSortAsc: true,
  registryError: "",
  registryByModId: {},
  updatesWorking: false,
  checkedUpdatesByModId: {},
  checkedAllOnce: false,
  profilesLoading: false,
  profilesError: "",
  profiles: [],
  selectedProfileName: "",
};

// ── Store ──────────────────────────────────────────────────────

export const useModsStore = create<ModsState & ModsActions>()((set) => ({
  ...initialState,

  setTab: (tab) => set({ tab }),
  setQuery: (query) => set({ query }),
  setSort: (sort) => set({ sort }),
  setPageIndex: (pageIndex) => set({ pageIndex }),
  setHasMore: (hasMore) => set({ hasMore }),
  setTotalCount: (totalCount) => set({ totalCount }),
  setDiscoverLoading: (discoverLoading) => set({ discoverLoading }),
  setDiscoverError: (discoverError) => set({ discoverError }),
  setDiscoverMods: (discoverMods) => set({ discoverMods }),
  appendDiscoverMods: (mods) => set((s) => ({ discoverMods: [...s.discoverMods, ...mods] })),
  setDetailsId: (detailsId) => set({ detailsId }),
  setDetailsLoading: (detailsLoading) => set({ detailsLoading }),
  setDetailsError: (detailsError) => set({ detailsError }),
  setDetailsMod: (detailsMod) => set({ detailsMod }),
  setDetailsHtml: (detailsHtml) => set({ detailsHtml }),
  setDetailsFiles: (detailsFiles) => set({ detailsFiles }),
  setInstallingId: (installingId) => set({ installingId }),
  setDownloadProgress: (id, p) =>
    set((s) => ({ downloadProgress: { ...s.downloadProgress, [id]: p } })),
  clearDownloadProgress: (id) =>
    set((s) => {
      const { [id]: _, ...rest } = s.downloadProgress;
      return { downloadProgress: rest };
    }),
  setInstalledLoading: (installedLoading) => set({ installedLoading }),
  setInstalledError: (installedError) => set({ installedError }),
  setModsDir: (modsDir) => set({ modsDir }),
  setInstalledItems: (installedItems) => set({ installedItems }),
  setInstalledSort: (installedSort) => set({ installedSort }),
  setInstalledSortAsc: (installedSortAsc) => set({ installedSortAsc }),
  setRegistryError: (registryError) => set({ registryError }),
  setRegistryByModId: (registryByModId) => set({ registryByModId }),
  setUpdatesWorking: (updatesWorking) => set({ updatesWorking }),
  setCheckedUpdatesByModId: (checkedUpdatesByModId) => set({ checkedUpdatesByModId }),
  setCheckedAllOnce: (checkedAllOnce) => set({ checkedAllOnce }),
  setProfilesLoading: (profilesLoading) => set({ profilesLoading }),
  setProfilesError: (profilesError) => set({ profilesError }),
  setProfiles: (profiles) => set({ profiles }),
  setSelectedProfileName: (selectedProfileName) => set({ selectedProfileName }),
  reset: () => set(initialState),
}));
