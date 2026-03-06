import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  IconDownload,
  IconFolderOpen,
  IconArrowLeft,
  IconRefresh,
  IconSearch,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { Badge, Box, Button, HStack, IconButton, Input, Portal, SegmentGroup, Select, Textarea, VStack, Text, createListCollection } from "@chakra-ui/react";
import { useGameContext } from "../hooks/gameContext";
import { sanitizeHtmlAllowImages } from "../utils/sanitize";
import { useTranslation } from "react-i18next";
import ConfirmModal from "./ConfirmModal";
import { decodeModPack, encodeModPack, type ModPackV1 } from "../utils/modPack";
import type {
  DiscoverMod,
  BrowseSort,
  ModDetails,
  ModFileInfo,
  ModRegistryEntry,
  InstalledModFile,
  InstalledSort,
  ModProfile,
} from "../features/mods/modsTypes";
import { sortDiscoverInstalledFirst, formatModsError } from "../features/mods/modsTypes";

// Types imported from features/mods/modsTypes.ts

const ModsPanel: React.FC = () => {
  const { gameDir, availableVersions, selectedVersion, versionType } =
    useGameContext();
  const { t } = useTranslation();

  const scrollRootRef = useRef<HTMLDivElement | null>(null);
  const discoverLoadMoreSentinelRef = useRef<HTMLDivElement | null>(null);
  const discoverAutoLoadInFlightRef = useRef(false);

  const [tab, setTab] = useState<"discover" | "installed" | "profiles">(
    "discover",
  );
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<BrowseSort>("popularity");

  const sortCollection = useMemo(() => createListCollection({
    items: [
      { label: t("modsModal.sort.installedFirst"), value: "installedFirst" },
      { label: t("modsModal.sort.relevance"), value: "relevance" },
      { label: t("modsModal.sort.popularity"), value: "popularity" },
      { label: t("modsModal.sort.latestUpdate"), value: "latestUpdate" },
      { label: t("modsModal.sort.creationDate"), value: "creationDate" },
      { label: t("modsModal.sort.totalDownloads"), value: "totalDownloads" },
      { label: t("modsModal.sort.az"), value: "az" },
    ],
  }), [t]);

  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize] = useState(24);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [discoverLoading, setDiscoverLoading] = useState(false);
  const [discoverError, setDiscoverError] = useState<string>("");
  const [discoverMods, setDiscoverMods] = useState<DiscoverMod[]>([]);

  const [detailsId, setDetailsId] = useState<number | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string>("");
  const [detailsMod, setDetailsMod] = useState<ModDetails | null>(null);
  const [detailsHtml, setDetailsHtml] = useState<string>("");
  const [detailsFiles, setDetailsFiles] = useState<ModFileInfo[]>([]);

  // Because opening images in 2026 is apparently still a DIY activity.
  const [imageViewer, setImageViewer] = useState<{
    open: boolean;
    src: string;
    alt?: string;
    zoomed: boolean;
  }>({ open: false, src: "", alt: "", zoomed: false });

  const imageViewerImgRef = useRef<HTMLImageElement | null>(null);
  const [imageViewerZoomDims, setImageViewerZoomDims] = useState<{
    w: number;
    h: number;
  } | null>(null);

  const [installingId, setInstallingId] = useState<number | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<
    Record<number, { received: number; total?: number }>
  >({});

  const [installedLoading, setInstalledLoading] = useState(false);
  const [installedError, setInstalledError] = useState<string>("");
  const [modsDir, setModsDir] = useState<string>("");
  const [installedItems, setInstalledItems] = useState<InstalledModFile[]>([]);

  const [installedSort, setInstalledSort] = useState<InstalledSort>(
    "connectedToLauncher",
  );
  const [installedSortAsc, setInstalledSortAsc] = useState(true);

  const [attachPrompt, setAttachPrompt] = useState<{
    open: boolean;
    fileName: string;
  }>({ open: false, fileName: "" });
  const [attachLinkInput, setAttachLinkInput] = useState<string>("");
  const [attachLinkError, setAttachLinkError] = useState<string>("");

  const [deleteModPrompt, setDeleteModPrompt] = useState<{
    open: boolean;
    fileName: string;
  }>({ open: false, fileName: "" });

  const [updatesWorking, setUpdatesWorking] = useState(false);

  const [checkedUpdatesByModId, setCheckedUpdatesByModId] = useState<
    Record<
      number,
      { updateAvailable: boolean; latestFileId: number | null; latestName: string }
    >
  >({});
  const [checkedAllOnce, setCheckedAllOnce] = useState(false);

  const [registryError, setRegistryError] = useState<string>("");
  const [registryByModId, setRegistryByModId] = useState<
    Record<number, ModRegistryEntry>
  >({});

  // sortDiscoverInstalledFirst now imported from features/mods/modsTypes.ts
  const sortLocal = (mods: DiscoverMod[]) =>
    sortDiscoverInstalledFirst(mods, registryByModId);

  const [profilesLoading, setProfilesLoading] = useState(false);
  const [profilesError, setProfilesError] = useState<string>("");
  const [profiles, setProfiles] = useState<ModProfile[]>([]);
  const [selectedProfileName, setSelectedProfileName] = useState<string>("");
  const [profileNameInput, setProfileNameInput] = useState<string>("");
  const [profileSelectedMods, setProfileSelectedMods] = useState<Set<string>>(
    () => new Set(),
  );
  const [profileModsOrder, setProfileModsOrder] = useState<string[]>([]);

  const [profileCtxMenu, setProfileCtxMenu] = useState<{
    open: boolean;
    x: number;
    y: number;
    name: string;
  }>({ open: false, x: 0, y: 0, name: "" });

  const [renameProfilePrompt, setRenameProfilePrompt] = useState<{
    open: boolean;
    oldName: string;
  }>({ open: false, oldName: "" });
  const [renameProfileInput, setRenameProfileInput] = useState<string>("");
  const [renameProfileError, setRenameProfileError] = useState<string>("");

  const [shareWorking, setShareWorking] = useState(false);
  const [shareError, setShareError] = useState<string>("");
  const [shareNotice, setShareNotice] = useState<string>("");
  const [exportCode, setExportCode] = useState<string>("");
  const [exportOpen, setExportOpen] = useState(false);

  const [importing, setImporting] = useState(false);
  const [importNotice, setImportNotice] = useState<string>("");
  const [importError, setImportError] = useState<string>("");
  const [importPromptOpen, setImportPromptOpen] = useState(false);
  const [importPromptText, setImportPromptText] = useState<string>("");
  const [importPromptError, setImportPromptError] = useState<string>("");
  const [importCurrent, setImportCurrent] = useState<{
    idx: number;
    total: number;
    modId?: number;
    name: string;
  } | null>(null);

  const [importPreviewOpen, setImportPreviewOpen] = useState(false);
  const [importPreviewPack, setImportPreviewPack] = useState<ModPackV1 | null>(
    null,
  );

  const [integrityPrompt, setIntegrityPrompt] = useState<{
    open: boolean;
    title: string;
    message: React.ReactNode;
    resolve?: (v: boolean) => void;
  }>({ open: false, title: "", message: "" });


  const openImageViewer = (src: string, alt?: string) => {
    const s = typeof src === "string" ? src.trim() : "";
    if (!s) return;
    // Reset zoom on open so we don't carry chaos between images.
    setImageViewer({ open: true, src: s, alt, zoomed: false });
    setImageViewerZoomDims(null);
  };

  const closeImageViewer = () => {
    setImageViewer({ open: false, src: "", alt: "", zoomed: false });
    setImageViewerZoomDims(null);
  };

  const effectiveGameDir = useRef<string | null>(null);
  const ensureGameDir = async () => {
    if (effectiveGameDir.current) return effectiveGameDir.current;
    const dir = gameDir ?? (await window.config.getDefaultGameDirectory());
    effectiveGameDir.current = dir;
    return dir;
  };

  // formatModsError imported from features/mods — local wrapper binds `t`
  const fmtErr = (res: any, fallbackKey: string, fallbackArgs?: Record<string, any>) =>
    formatModsError(res, fallbackKey, t, fallbackArgs);

  const loadDiscover = async (opts?: {
    reset?: boolean;
    q?: string;
    sort?: BrowseSort;
  }) => {
    setDiscoverLoading(true);
    setDiscoverError("");
    try {
      const reset = opts?.reset !== false;
      const q = typeof opts?.q === "string" ? opts.q : query;
      const s = opts?.sort ?? sort;
      const nextIndex = reset ? 0 : pageIndex + pageSize;

      const backendSort: BrowseSort =
        s === "installedFirst" ? "popularity" : s;

      const res = await window.config.modsBrowse({
        query: q ?? "",
        sort: backendSort,
        index: nextIndex,
        pageSize,
      });

      if (!res?.ok)
        throw new Error(fmtErr(res, "modsModal.errors.loadModsFailed"));
      const mods = Array.isArray(res.mods) ? (res.mods as DiscoverMod[]) : [];
      const pagination = res.pagination ?? null;
      const total =
        typeof pagination?.totalCount === "number"
          ? pagination.totalCount
          : null;

      setTotalCount(total);
      setPageIndex(nextIndex);
      setDiscoverMods((prev) => {
        const combined = reset ? mods : [...prev, ...mods];
        return s === "installedFirst"
          ? sortLocal(combined)
          : combined;
      });

      const got = mods.length;
      const computedHasMore =
        total != null ? nextIndex + got < total : got >= pageSize;
      setHasMore(computedHasMore);
    } catch (e) {
      const message =
        e instanceof Error ? e.message : t("modsModal.errors.unknown");
      setDiscoverError(message);
      setDiscoverMods([]);
      setHasMore(false);
      setTotalCount(null);
    } finally {
      setDiscoverLoading(false);
    }
  };

  // Infinite scroll for Discover: auto-load more when reaching the bottom.
  useEffect(() => {
    if (tab !== "discover") return;
    if (detailsId != null) return;
    if (!hasMore) return;

    const root = scrollRootRef.current;
    const target = discoverLoadMoreSentinelRef.current;
    if (!root || !target) return;

    let disposed = false;
    const obs = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        if (disposed) return;
        if (discoverLoading) return;
        if (discoverAutoLoadInFlightRef.current) return;

        discoverAutoLoadInFlightRef.current = true;
        void (async () => {
          try {
            await loadDiscover({ reset: false });
          } finally {
            discoverAutoLoadInFlightRef.current = false;
          }
        })();
      },
      {
        root,
        // Start loading a bit before the end so it feels seamless.
        rootMargin: "240px 0px",
        threshold: 0.01,
      },
    );

    obs.observe(target);
    return () => {
      disposed = true;
      try {
        obs.disconnect();
      } catch {
        // ignore
      }
    };
  }, [tab, detailsId, hasMore, discoverLoading, query, sort]);

  useEffect(() => {
    if (sort !== "installedFirst") return;
    setDiscoverMods((prev) => sortLocal(prev));
  }, [sort, registryByModId]);

  const loadDetails = async (modId: number) => {
    setDetailsLoading(true);
    setDetailsError("");
    setDetailsMod(null);
    setDetailsFiles([]);
    setDetailsHtml("");
    try {
      const res = await window.config.modsGetDetails(modId);
      if (!res?.ok)
        throw new Error(
          fmtErr(res, "modsModal.errors.loadModDetailsFailed"),
        );

      setDetailsMod(res.mod as ModDetails);
      setDetailsFiles(
        Array.isArray(res.files) ? (res.files as ModFileInfo[]) : [],
      );
      setDetailsHtml(sanitizeHtmlAllowImages(res.html, { maxLength: 200_000 }));
    } catch (e) {
      const message =
        e instanceof Error ? e.message : t("modsModal.errors.unknown");
      setDetailsError(message);
    } finally {
      setDetailsLoading(false);
    }
  };

  const loadInstalled = async (showLoading = true) => {
    setInstalledLoading(showLoading);
    setInstalledError("");
    try {
      const dir = await ensureGameDir();
      const res = await window.config.modsInstalledList(dir);
      if (!res?.ok)
        throw new Error(
          fmtErr(res, "modsModal.errors.loadInstalledModsFailed"),
        );
      setModsDir(res.modsDir);
      setInstalledItems(res.items ?? []);

      // Keep registry best-effort consistent with actual files.
      void loadRegistry(
        dir,
        (res.items ?? [])
          .map((x: any) => String(x?.fileName ?? ""))
          .filter(Boolean),
      );
    } catch (e) {
      const message =
        e instanceof Error ? e.message : t("modsModal.errors.unknown");
      setInstalledError(message);
      setInstalledItems([]);
      setModsDir("");
    } finally {
      setInstalledLoading(false);
    }
  };

  const loadRegistry = async (
    dir?: string,
    knownInstalledFileNames?: string[],
  ) => {
    setRegistryError("");
    try {
      const gameDir = dir ?? (await ensureGameDir());
      const res = await window.config.modsRegistry(gameDir);
      if (!res?.ok)
        throw new Error(
          fmtErr(res, "modsModal.errors.loadModsRegistryFailed"),
        );

      const list = Array.isArray(res.items)
        ? (res.items as ModRegistryEntry[])
        : [];
      const fileSet = new Set(
        (
          knownInstalledFileNames ?? installedItems.map((x) => x.fileName)
        ).filter(Boolean),
      );

      const filtered = list.filter((x) => {
        if (!x?.modId) return false;
        if (!x.fileName) return true;
        if (fileSet.size === 0) return true;
        // installed list contains both enabled and disabled file names; registry stores the exact name we wrote.
        return (
          fileSet.has(x.fileName) ||
          fileSet.has(`${x.fileName}.disabled`) ||
          fileSet.has(x.fileName.replace(/\.disabled$/i, ""))
        );
      });

      const map: Record<number, ModRegistryEntry> = {};
      for (const it of filtered) {
        const id = Number(it.modId);
        if (!Number.isFinite(id) || id <= 0) continue;
        map[id] = it;
      }
      setRegistryByModId(map);
    } catch (e) {
      const message =
        e instanceof Error ? e.message : t("modsModal.errors.unknown");
      setRegistryError(message);
      setRegistryByModId({});
    }
  };

  const loadProfiles = async () => {
    setProfilesLoading(true);
    setProfilesError("");
    try {
      const dir = await ensureGameDir();
      const res = await window.config.modsProfilesList(dir);
      if (!res?.ok)
        throw new Error(
          fmtErr(res, "modsModal.errors.loadProfilesFailed"),
        );
      const list = Array.isArray(res.profiles)
        ? (res.profiles as ModProfile[])
        : [];
      setProfiles(list);

      const keepSelected =
        selectedProfileName && list.some((p) => p.name === selectedProfileName)
          ? selectedProfileName
          : list[0]?.name ?? "";
      setSelectedProfileName(keepSelected);
      setProfileNameInput((prev) => (prev.trim() ? prev : keepSelected));
    } catch (e) {
      const message =
        e instanceof Error ? e.message : t("modsModal.errors.unknown");
      setProfilesError(message);
      setProfiles([]);
      setSelectedProfileName("");
      setProfileNameInput("");
    } finally {
      setProfilesLoading(false);
    }
  };

  const baseName = (fileName: string) =>
    fileName.endsWith(".disabled")
      ? fileName.slice(0, -".disabled".length)
      : fileName;

  const copyToClipboard = async (text: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // fallback
    }
    const el = document.createElement("textarea");
    el.value = text;
    el.style.position = "fixed";
    el.style.top = "-9999px";
    document.body.appendChild(el);
    el.focus();
    el.select();
    try {
      document.execCommand("copy");
    } finally {
      document.body.removeChild(el);
    }
  };

  const readClipboardText = async (): Promise<string> => {
    return await navigator.clipboard.readText();
  };

  const getSelectedGameVersionLabel = () => {
    const selected = availableVersions?.[selectedVersion];
    if (!selected)
      return {
        type: versionType,
        buildIndex: undefined as number | undefined,
        label: "",
      };
    const label = (selected.build_name?.trim() ||
      `Build-${selected.build_index}`) as string;
    return { type: selected.type, buildIndex: selected.build_index, label };
  };

  const sanitizeProfileName = (name: string) => {
    const s = (name || "").trim().replace(/[/\\\u0000]/g, " ");
    const collapsed = s.replace(/\s+/g, " ").trim();
    return collapsed.slice(0, 48);
  };

  const makeUniqueProfileName = (base: string) => {
    const root = sanitizeProfileName(base) || "Imported";
    const existing = new Set(profiles.map((p) => p.name.toLowerCase()));
    if (!existing.has(root.toLowerCase())) return root;
    for (let n = 2; n < 1000; n++) {
      const candidate = sanitizeProfileName(`${root} (${n})`);
      if (candidate && !existing.has(candidate.toLowerCase())) return candidate;
    }
    return sanitizeProfileName(`${root} (${Date.now() % 1000})`) || "Imported";
  };

  const getPreferredInstalledFileNameForBase = (
    base: string,
  ): string | null => {
    const enabled = installedItems.find(
      (x) => baseName(x.fileName) === base && x.enabled,
    );
    if (enabled?.fileName) return enabled.fileName;
    const any = installedItems.find((x) => baseName(x.fileName) === base);
    return any?.fileName ?? null;
  };

  const awaitIntegrityDecision = (
    title: string,
    message: React.ReactNode,
  ): Promise<boolean> => {
    return new Promise((resolve) => {
      setIntegrityPrompt({ open: true, title, message, resolve });
    });
  };

  useEffect(() => {

    const onProgress = (_: any, payload: any) => {
      const id = Number(payload?.modId);
      if (!Number.isFinite(id) || id <= 0) return;
      const received = Number(payload?.received ?? 0);
      const total = payload?.total != null ? Number(payload.total) : undefined;
      setDownloadProgress((prev) => ({
        ...prev,
        [id]: {
          received: Math.max(0, received),
          total: total && total > 0 ? total : undefined,
        },
      }));
    };

    const onFinished = (_: any, payload: any) => {
      const id = Number(payload?.modId);
      if (Number.isFinite(id) && id > 0) {
        setInstallingId((cur) => (cur === id ? null : cur));
      } else {
        setInstallingId(null);
      }
      // Refresh installed list if user is viewing it.
      if (tab === "installed" || tab === "profiles") void loadInstalled();
      // Refresh registry so Discover can show Installed/Update.
      void loadRegistry();
    };

    const onError = (_: any) => {
      setInstallingId(null);
    };

    window.ipcRenderer.on("mods:download-progress", onProgress);
    window.ipcRenderer.on("mods:download-finished", onFinished);
    window.ipcRenderer.on("mods:download-error", onError);

    return () => {
      window.ipcRenderer.off("mods:download-progress", onProgress);
      window.ipcRenderer.off("mods:download-finished", onFinished);
      window.ipcRenderer.off("mods:download-error", onError);
    };
  }, [tab]);

  useEffect(() => {
    if (!imageViewer.open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeImageViewer();
    };
    // Escape to close: the universal "get me out of this UI" key.
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [imageViewer.open]);

  useEffect(() => {
    // Initial load
    setDetailsId(null);
    setDetailsError("");
    setDetailsMod(null);
    setDetailsHtml("");
    setDetailsFiles([]);
    setSort("popularity");
    setQuery("");
    setPageIndex(0);
    setHasMore(false);
    setTotalCount(null);
    void loadDiscover({ reset: true, q: "", sort: "popularity" });
    // Also pre-load installed list so it is instant when tab changes
    void loadInstalled();
    void loadProfiles();
    void loadRegistry();

    setShareWorking(false);
    setShareError("");
    setShareNotice("");
    setExportCode("");
    setExportOpen(false);
    setImporting(false);
    setImportNotice("");
    setImportError("");
    setImportCurrent(null);
    setImportPreviewOpen(false);
    setImportPreviewPack(null);
    setIntegrityPrompt({ open: false, title: "", message: "" });

    setInstalledSort("connectedToLauncher");
    setInstalledSortAsc(true);

    setProfileCtxMenu({ open: false, x: 0, y: 0, name: "" });
    setRenameProfilePrompt({ open: false, oldName: "" });
    setRenameProfileInput("");
    setRenameProfileError("");
  }, []);

  useEffect(() => {
    if (tab === "profiles") {
      void loadProfiles();
    }
  }, [tab]);

  const installedByBase = useMemo(() => {
    const map = new Map<string, { enabled: boolean; fileNames: string[] }>();
    for (const it of installedItems) {
      const b = baseName(it.fileName);
      const cur = map.get(b) ?? { enabled: false, fileNames: [] };
      cur.enabled = cur.enabled || !!it.enabled;
      cur.fileNames.push(it.fileName);
      map.set(b, cur);
    }
    return map;
  }, [installedItems]);

  const installedBaseNames = useMemo(() => {
    return Array.from(installedByBase.keys()).sort((a, b) =>
      a.localeCompare(b),
    );
  }, [installedByBase]);

  const registryByBaseName = useMemo(() => {
    const map = new Map<string, ModRegistryEntry>();
    for (const it of Object.values(registryByModId)) {
      if (!it?.fileName) continue;
      // Windows filesystems are case-insensitive. Java modders are not.
      // So we normalize, because reality doesn't.
      map.set(baseName(it.fileName).trim().toLowerCase(), it);
    }
    return map;
  }, [registryByModId]);

  const sortedInstalledItems = useMemo(() => {
    const decorated = installedItems.map((it, idx) => {
      const base = baseName(it.fileName).trim();
      const reg = base
        ? registryByBaseName.get(base.toLowerCase()) ?? null
        : null;
      const isManual = !reg;
      const managedModId = reg?.modId;
      const checked =
        typeof managedModId === "number"
          ? checkedUpdatesByModId[managedModId]
          : undefined;
      const updateAvailable = !!checked?.updateAvailable;
      return {
        it,
        idx,
        base,
        isManual,
        connected: !isManual,
        updateAvailable,
      };
    });

    const dir = installedSortAsc ? 1 : -1;
    const cmpStr = (a: string, b: string) => a.localeCompare(b) * dir;
    const cmpGroup = (aFirst: boolean, bFirst: boolean) => {
      const av = aFirst ? 0 : 1;
      const bv = bFirst ? 0 : 1;
      if (av !== bv) return (av - bv) * dir;
      return 0;
    };

    decorated.sort((a, b) => {
      if (installedSort === "connectedToLauncher") {
        const g = cmpGroup(a.connected, b.connected);
        if (g) return g;
      } else if (installedSort === "installedManually") {
        const g = cmpGroup(a.isManual, b.isManual);
        if (g) return g;
      } else if (installedSort === "needsUpdate") {
        const g = cmpGroup(a.updateAvailable, b.updateAvailable);
        if (g) return g;
      }

      const s = cmpStr(a.base, b.base);
      if (s) return s;
      return a.idx - b.idx;
    });

    return decorated.map((x) => x.it);
  }, [
    installedItems,
    registryByBaseName,
    checkedUpdatesByModId,
    installedSort,
    installedSortAsc,
  ]);

  const ATTACH_LINK_EXAMPLE = "https://www.curseforge.com/hytale/mods/example";
  const isValidAttachLink = (url: string) => {
    const s = typeof url === "string" ? url.trim() : "";
    if (!s) return false;
    return /^https:\/\/www\.curseforge\.com\/hytale\/mods\/[a-z0-9][a-z0-9-]*\/?$/i.test(
      s,
    );
  };

  const openAttachPrompt = (fileName: string) => {
    setAttachLinkInput("");
    setAttachLinkError("");
    setAttachPrompt({ open: true, fileName });
  };

  const profileModsUnionNames = useMemo(() => {
    const names = new Set<string>(installedBaseNames);
    for (const n of profileSelectedMods) {
      const s = typeof n === "string" ? n.trim() : "";
      if (s) names.add(s);
    }
    // Base union list: alphabetical only. Any selected-first ordering is applied once on profile click.
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [installedBaseNames, profileSelectedMods]);

  useEffect(() => {
    // Keep order stable while the user toggles checkboxes.
    // Only reconcile additions/removals so the list doesn't jump around.
    const union = new Set(profileModsUnionNames);
    setProfileModsOrder((prev) => {
      const filtered = prev.filter((x) => union.has(x));
      const missing = profileModsUnionNames.filter(
        (x) => !new Set(filtered).has(x),
      );
      if (!filtered.length && !prev.length) {
        // If we have no prior order (first render), just use the union list.
        return profileModsUnionNames;
      }
      return missing.length ? [...filtered, ...missing] : filtered;
    });
  }, [profileModsUnionNames]);

  const selectedProfile = useMemo(() => {
    if (!selectedProfileName) return null;
    // One "source of truth" per click — what could possibly go wrong?
    return profiles.find((p) => p.name === selectedProfileName) ?? null;
  }, [profiles, selectedProfileName]);

  useEffect(() => {
    if (!selectedProfileName) {
      setProfileSelectedMods(new Set());
      return;
    }
    const p = profiles.find((x) => x.name === selectedProfileName);
    if (!p) {
      setProfileSelectedMods(new Set());
      return;
    }
    setProfileSelectedMods(new Set((p.mods ?? []).filter(Boolean)));
  }, [open, selectedProfileName, profiles]);

  const formatNumber = (n?: number) => {
    if (typeof n !== "number" || !Number.isFinite(n)) return "";
    try {
      return new Intl.NumberFormat(undefined).format(n);
    } catch {
      return String(n);
    }
  };

  const formatDate = (iso?: string) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return "";
    try {
      return d.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "2-digit",
      });
    } catch {
      return iso;
    }
  };

  const getInstallStatus = (modId: number, latestFileId?: number) => {
    const entry = registryByModId[modId];
    if (!entry) return { state: "install" as const };
    const installedFileId =
      typeof entry.fileId === "number" ? entry.fileId : undefined;
    if (installedFileId && latestFileId && installedFileId !== latestFileId) {
      return { state: "update" as const };
    }
    return { state: "installed" as const };
  };

  const handleOpenModsFolder = async () => {
    try {
      const dir = await ensureGameDir();
      await window.config.openFolder(`${dir}/UserData/Mods`);
    } catch (e) {
      console.error("Failed to open mods folder", e);
      alert("Error #1000");
    }
  };


  return (
    <Box
      position="relative"
      w="full"
      h="full"
      overflow="hidden"
    >
      {imageViewer.open
        ? createPortal(
            <Box
              position="fixed"
              inset={0}
              zIndex={10060}
              bg="rgba(10,14,26,0.92)"
              backdropFilter="blur(12px)"
              display="flex"
              alignItems="center"
              justifyContent="center"
              p={6}
              onClick={() => closeImageViewer()}
              role="dialog"
              aria-modal="true"
              aria-label="Image viewer"
            >
              <Box
                as="button"
                position="absolute"
                top={4}
                right={4}
                w={9}
                h={9}
                rounded="full"
                border="1px solid"
                borderColor="whiteAlpha.100"
                bg="rgba(255,255,255,0.08)"
                color="gray.200"
                display="flex"
                alignItems="center"
                justifyContent="center"
                cursor="pointer"
                _hover={{ color: "white", bg: "rgba(255,255,255,0.14)" }}
                transition="all 0.15s"
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  closeImageViewer();
                }}
                title={t("common.close")}
              >
                <IconX size={18} />
              </Box>

              <Box
                maxW="92vw"
                maxH="88vh"
                overflow="auto"
                onClick={(e: React.MouseEvent) => e.stopPropagation()}
              >
                <Box
                  as="img"
                  src={imageViewer.src}
                  alt={imageViewer.alt || "Image"}
                  ref={imageViewerImgRef}
                  display="block"
                  rounded="lg"
                  border="1px solid"
                  borderColor="whiteAlpha.100"
                  bg="whiteAlpha.50"
                  shadow="2xl"
                  objectFit="contain"
                  cursor={imageViewer.zoomed ? "zoom-out" : "zoom-in"}
                  transition="width 120ms ease, height 120ms ease"
                  {...(imageViewer.zoomed
                    ? {
                        w: imageViewerZoomDims ? `${imageViewerZoomDims.w}px` : "184vw",
                        h: imageViewerZoomDims ? `${imageViewerZoomDims.h}px` : "auto",
                        maxW: "none",
                        maxH: "none",
                      }
                    : {
                        maxW: "92vw",
                        maxH: "88vh",
                      })}
                  onClick={() => {
                    setImageViewer((v) => {
                      if (!v.zoomed) {
                        const rect = imageViewerImgRef.current?.getBoundingClientRect();
                        if (rect && rect.width > 0 && rect.height > 0) {
                          setImageViewerZoomDims({
                            w: Math.round(rect.width * 2),
                            h: Math.round(rect.height * 2),
                          });
                        } else {
                          setImageViewerZoomDims(null);
                        }
                      } else {
                        setImageViewerZoomDims(null);
                      }
                      return { ...v, zoomed: !v.zoomed };
                    });
                  }}
                />
              </Box>
            </Box>,
            document.body,
          )
        : null}

      <Box
        position="relative"
        w="full"
        h="full"
        px={8}
        py={6}
        display="flex"
        flexDir="column"
      >
        <HStack justify="space-between" gap={3} mb={4} pr={12}>
          <Text fontSize="28px" fontWeight="700" letterSpacing="-0.02em" color="white" fontFamily="'Montserrat', 'Inter', sans-serif">
            {t("modsModal.title")}
          </Text>

          <SegmentGroup.Root
            size="sm"
            value={tab}
            onValueChange={(e) => {
              const next = e.value as "discover" | "installed" | "profiles";
              setTab(next);
              if (next === "installed") { void loadInstalled(); void loadRegistry(); }
              if (next === "profiles") { void loadProfiles(); void loadInstalled(); void loadRegistry(); }
            }}
          >
            <SegmentGroup.Indicator />
            <SegmentGroup.Items items={[
              { value: "discover", label: t("modsModal.tabs.discover") },
              { value: "installed", label: t("modsModal.tabs.installed") },
              { value: "profiles", label: t("modsModal.tabs.profiles") },
            ]} />
          </SegmentGroup.Root>
        </HStack>

        <Box
          flex={1}
          minH={0}
          pr={2}
          overflowY={tab !== "profiles" ? "auto" : undefined}
          ref={scrollRootRef}
        >
          {tab === "discover" ? (
            <Box p={3}>
              <HStack gap={2} mb={3}>
                {/* Back button */}
                {detailsId != null && (
                  <IconButton
                    aria-label={t("common.back")}
                    size="sm"
                    variant="ghost"
                    borderRadius="full"
                    bg="rgba(255,255,255,0.06)"
                    color="white"
                    flexShrink={0}
                    _hover={{ bg: "rgba(255,255,255,0.12)" }}
                    onClick={() => {
                      setDetailsId(null);
                      setDetailsError("");
                      setDetailsMod(null);
                      setDetailsHtml("");
                      setDetailsFiles([]);
                    }}
                  >
                    <IconArrowLeft size={18} />
                  </IconButton>
                )}

                {/* Search */}
                <Box flex={1} position="relative">
                  <Box
                    position="absolute"
                    left={3}
                    top="50%"
                    transform="translateY(-50%)"
                    color="rgba(255,255,255,0.3)"
                    pointerEvents="none"
                    zIndex={1}
                  >
                    <IconSearch size={15} />
                  </Box>
                  <Input
                    value={query}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
                    onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                      if (e.key === "Enter") {
                        void loadDiscover({ reset: true, q: query.trim(), sort });
                        setDetailsId(null);
                      }
                    }}
                    placeholder={t("modsModal.searchPlaceholder")}
                    disabled={discoverLoading}
                    pl="36px"
                    size="sm"
                    bg="rgba(255,255,255,0.05)"
                    border="1px solid"
                    borderColor="rgba(255,255,255,0.1)"
                    color="white"
                    borderRadius="md"
                    _placeholder={{ color: "rgba(255,255,255,0.28)" }}
                    _focus={{ borderColor: "rgba(59,130,246,0.5)", boxShadow: "0 0 0 1px rgba(59,130,246,0.25)" }}
                    _disabled={{ opacity: 0.5 }}
                  />
                </Box>

                {/* Sort */}
                <Select.Root
                  collection={sortCollection}
                  value={[sort]}
                  onValueChange={(e) => {
                    const next = e.value[0] as BrowseSort;
                    setSort(next);
                    setDetailsId(null);
                    void loadDiscover({ reset: true, q: query.trim(), sort: next });
                  }}
                  size="sm"
                  width="auto"
                  flexShrink={0}
                >
                  <Select.HiddenSelect />
                  <Select.Control>
                    <Select.Trigger
                      bg="rgba(255,255,255,0.05)"
                      border="1px solid"
                      borderColor="rgba(255,255,255,0.1)"
                      color="rgba(255,255,255,0.8)"
                      borderRadius="md"
                      minW="130px"
                      _hover={{ bg: "rgba(255,255,255,0.08)" }}
                    >
                      <Select.ValueText />
                    </Select.Trigger>
                    <Select.IndicatorGroup>
                      <Select.Indicator color="rgba(255,255,255,0.5)" />
                    </Select.IndicatorGroup>
                  </Select.Control>
                  <Portal>
                    <Select.Positioner>
                      <Select.Content
                        bg="rgba(13,17,32,0.97)"
                        border="1px solid rgba(255,255,255,0.1)"
                        backdropFilter="blur(12px)"
                      >
                        {sortCollection.items.map((item) => (
                          <Select.Item
                            item={item}
                            key={item.value}
                            color="rgba(255,255,255,0.75)"
                            _hover={{ bg: "rgba(255,255,255,0.08)", color: "white" }}
                            _highlighted={{ bg: "rgba(59,130,246,0.2)", color: "white" }}
                          >
                            {item.label}
                            <Select.ItemIndicator />
                          </Select.Item>
                        ))}
                      </Select.Content>
                    </Select.Positioner>
                  </Portal>
                </Select.Root>

                {/* Refresh */}
                <IconButton
                  aria-label={t("common.search")}
                  size="sm"
                  variant="ghost"
                  bg="rgba(255,255,255,0.06)"
                  color="rgba(255,255,255,0.7)"
                  borderRadius="md"
                  opacity={discoverLoading ? 0.5 : 1}
                  _hover={{ bg: "rgba(255,255,255,0.1)", color: "white" }}
                  onClick={() => { setDetailsId(null); void loadDiscover({ reset: true, q: query.trim(), sort }); }}
                >
                  <IconRefresh size={16} />
                </IconButton>

                {/* Open folder */}
                <Button
                  size="sm"
                  variant="ghost"
                  bg="rgba(255,255,255,0.06)"
                  color="rgba(255,255,255,0.65)"
                  borderRadius="md"
                  _hover={{ bg: "rgba(255,255,255,0.1)", color: "white" }}
                  onClick={() => void handleOpenModsFolder()}
                >
                  <IconFolderOpen size={15} />
                  <Box as="span" ml={1.5}>{t("common.folder")}</Box>
                </Button>
              </HStack>

              {discoverError ? (
                <Text fontSize="xs" color="red.300" mb={2}>{discoverError}</Text>
              ) : null}

              {registryError ? (
                <Text fontSize="xs" color="red.300" mb={2}>{registryError}</Text>
              ) : null}

              {detailsId != null ? (
                <Box rounded="lg" border="1px solid" borderColor="rgba(255,255,255,0.08)" bg="rgba(255,255,255,0.02)" p={3}>
                  {detailsError ? (
                    <Text fontSize="xs" color="red.300" mb={2}>{detailsError}</Text>
                  ) : null}

                  {detailsLoading && !detailsMod ? (
                    <Text fontSize="xs" color="gray.300">{t("modsModal.details.loadingDetails")}</Text>
                  ) : detailsMod ? (
                    <VStack gap={3} align="stretch">
                      {/* Compact header: logo + meta + install */}
                      <HStack gap={3} align="flex-start">
                        {detailsMod.logoUrl ? (
                          <Box
                            w="72px"
                            h="72px"
                            flexShrink={0}
                            borderRadius="12px"
                            overflow="hidden"
                            bg="rgba(255,255,255,0.06)"
                            border="1px solid rgba(255,255,255,0.08)"
                            cursor="zoom-in"
                            onClick={() => openImageViewer(detailsMod.logoUrl!, detailsMod.name)}
                          >
                            <Box
                              as="img"
                              src={detailsMod.logoUrl}
                              alt={detailsMod.name}
                              w="full"
                              h="full"
                              objectFit="cover"
                              loading="lazy"
                            />
                          </Box>
                        ) : null}

                        <Box flex={1} minW={0}>
                          <Text fontSize="17px" fontWeight="700" color="white" lineHeight="1.2">
                            {detailsMod.name}
                          </Text>
                          <Text fontSize="12px" color="rgba(255,255,255,0.45)" mt={0.5}>
                            {(detailsMod.author ?? "") || ""}
                          </Text>
                          <HStack mt={1.5} flexWrap="wrap" gap={1.5}>
                            {detailsMod.downloadCount != null ? (
                              <Badge colorPalette="gray" variant="subtle" fontSize="10px">
                                {t("modsModal.details.downloads", { value: formatNumber(detailsMod.downloadCount) })}
                              </Badge>
                            ) : null}
                            {detailsMod.dateCreated ? (
                              <Badge colorPalette="gray" variant="subtle" fontSize="10px">
                                {t("modsModal.details.created", { date: formatDate(detailsMod.dateCreated) })}
                              </Badge>
                            ) : null}
                            {detailsMod.dateModified ? (
                              <Badge colorPalette="gray" variant="subtle" fontSize="10px">
                                {t("modsModal.details.updated", { date: formatDate(detailsMod.dateModified) })}
                              </Badge>
                            ) : null}
                          </HStack>
                        </Box>

                        <VStack align="flex-end" gap={1.5} flexShrink={0}>
                          {(() => {
                            const stableId = detailsFiles.find((f) => Number(f?.releaseType) === 1)?.id ?? detailsFiles?.[0]?.id;
                            const status = getInstallStatus(detailsMod.id, stableId).state;
                            return (
                              <Button
                                size="sm"
                                bg="rgba(37,99,235,0.25)"
                                border="1px solid"
                                borderColor="rgba(59,130,246,0.3)"
                                color="rgba(147,197,253,1)"
                                _hover={!(installingId === detailsMod.id || status === "installed") ? { bg: "rgba(37,99,235,0.4)", borderColor: "rgba(96,165,250,0.5)" } : {}}
                                opacity={(installingId === detailsMod.id || status === "installed") ? 0.7 : 1}
                                cursor={status === "installed" ? "default" : "pointer"}
                                onClick={() => {
                                  if (status === "installed") return;
                                  void (async () => {
                                    try {
                                      const dir = await ensureGameDir();
                                      setInstallingId(detailsMod.id);
                                      await window.config.modsInstall(detailsMod.id, dir);
                                    } catch {
                                      setInstallingId(null);
                                    }
                                  })();
                                }}
                              >
                                <IconDownload size={15} />
                                <Box as="span" ml={1}>
                                  {installingId === detailsMod.id
                                    ? t("modsModal.status.installing")
                                    : status === "installed"
                                      ? t("modsModal.actions.installed")
                                      : status === "update"
                                        ? t("modsModal.actions.update")
                                        : t("modsModal.actions.install")}
                                </Box>
                              </Button>
                            );
                          })()}
                          {installingId === detailsMod.id ? (
                            <Text fontSize="11px" color="rgba(255,255,255,0.45)">
                              {(() => {
                                const p = downloadProgress[detailsMod.id];
                                if (!p) return t("modsModal.status.downloading");
                                const pct = p.total ? Math.floor((p.received / p.total) * 100) : null;
                                return pct != null
                                  ? t("modsModal.status.downloadingPct", { pct })
                                  : t("modsModal.status.downloadingKb", { kb: Math.floor(p.received / 1024) });
                              })()}
                            </Text>
                          ) : null}
                        </VStack>
                      </HStack>

                      {/* Horizontal screenshot strip */}
                      {Array.isArray(detailsMod.screenshots) && detailsMod.screenshots.length ? (
                        <Box overflowX="auto" mx={-3} px={3} scrollbarWidth="thin">
                          <HStack gap={2} w="max-content" pb={1}>
                            {detailsMod.screenshots.map((s, idx) => {
                              const src = s.thumbnailUrl || s.url;
                              if (!src) return null;
                              return (
                                <Box
                                  key={`${detailsMod.id}-shot-${idx}`}
                                  h="110px"
                                  w="180px"
                                  flexShrink={0}
                                  borderRadius="8px"
                                  overflow="hidden"
                                  border="1px solid rgba(255,255,255,0.08)"
                                  bg="rgba(255,255,255,0.05)"
                                  cursor="zoom-in"
                                  onClick={() => openImageViewer(s.url || src, s.title || `Screenshot ${idx + 1}`)}
                                >
                                  <Box
                                    as="img"
                                    src={src}
                                    alt={s.title || `Screenshot ${idx + 1}`}
                                    w="full"
                                    h="full"
                                    objectFit="cover"
                                    loading="lazy"
                                  />
                                </Box>
                              );
                            })}
                          </HStack>
                        </Box>
                      ) : null}

                      <Box rounded="lg" border="1px solid" borderColor="rgba(255,255,255,0.08)" bg="rgba(255,255,255,0.02)" p={3}>
                        <Text fontSize="sm" color="white" fontWeight="semibold" mb={2}>{t("modsModal.details.description")}</Text>
                        {detailsLoading && !detailsHtml ? (
                          <Text fontSize="xs" color="gray.100">{t("modsModal.details.loadingDescription")}</Text>
                        ) : detailsHtml ? (
                          <Box
                            color="white"
                            fontSize="sm"
                            lineHeight={1.7}
                            overflowWrap="break-word"
                            onClick={(e: React.MouseEvent) => {
                              const target = e.target as HTMLElement | null;
                              if (!target) return;
                              if (target.tagName !== "IMG") return;
                              const img = target as HTMLImageElement;
                              const src = img.currentSrc || img.src;
                              if (!src) return;
                              openImageViewer(src, img.alt || undefined);
                            }}
                            dangerouslySetInnerHTML={{ __html: detailsHtml }}
                          />
                        ) : (
                          <Text fontSize="xs" color="gray.200">{t("modsModal.details.noDescription")}</Text>
                        )}
                      </Box>

                      <Box rounded="lg" border="1px solid" borderColor="rgba(255,255,255,0.08)" bg="rgba(255,255,255,0.02)" p={3}>
                        <Text fontSize="sm" color="white" fontWeight="semibold" mb={2}>{t("modsModal.details.files")}</Text>
                        {detailsLoading && !detailsFiles.length ? (
                          <Text fontSize="xs" color="gray.300">{t("modsModal.details.loadingFiles")}</Text>
                        ) : detailsFiles.length ? (
                          <VStack gap={2} align="stretch">
                            {detailsFiles.slice(0, 20).map((f) => (
                              <HStack key={f.id} align="flex-start" justify="space-between" gap={3} rounded="lg" border="1px solid" borderColor="whiteAlpha.100" bg="whiteAlpha.50" px={3} py={2}>
                                <Box minW={0}>
                                  <Text fontSize="xs" color="white" fontWeight="semibold" truncate>
                                    {f.displayName || f.fileName || `File #${f.id}`}
                                  </Text>
                                  <Text fontSize="11px" color="gray.400" mt={0.5}>
                                    {f.fileDate ? t("modsModal.details.updatedShort", { date: formatDate(f.fileDate) }) : ""}
                                    {typeof f.downloadCount === "number" ? ` • ${t("modsModal.details.downloads", { value: formatNumber(f.downloadCount) })}` : ""}
                                  </Text>
                                  <HStack mt={1} flexWrap="wrap" align="center" gap={2} fontSize="10px">
                                    {typeof f.releaseType === "number" ? (
                                      <Box px={2} py={0.5} rounded="md" border="1px solid" borderColor="whiteAlpha.100" bg="whiteAlpha.50"
                                        color={Number(f.releaseType) === 1 ? "green.200" : Number(f.releaseType) === 2 ? "yellow.200" : "red.200"}>
                                        {Number(f.releaseType) === 1 ? t("modsModal.releaseType.stable") : Number(f.releaseType) === 2 ? t("modsModal.releaseType.beta") : t("modsModal.releaseType.alpha")}
                                      </Box>
                                    ) : null}
                                    {Array.isArray(f.gameVersions) && f.gameVersions.length ? (
                                      <Text color="gray.200" lineClamp={1}>
                                        {f.gameVersions.slice(0, 6).join(", ")}
                                      </Text>
                                    ) : null}
                                  </HStack>
                                </Box>

                                <Box flexShrink={0} display="flex" flexDir="column" alignItems="flex-end" gap={2}>
                                  {(() => {
                                    const entry = registryByModId[detailsMod.id];
                                    const installedFileId = typeof entry?.fileId === "number" ? entry.fileId : undefined;
                                    const isInstalledThisFile = installedFileId != null && installedFileId === f.id;
                                    return (
                                      <Button
                                        size="xs"
                                        bg="rgba(37,99,235,0.25)"
                                        border="1px solid"
                                        borderColor="rgba(59,130,246,0.3)"
                                        color="rgba(147,197,253,1)"
                                        _hover={!(installingId === detailsMod.id || isInstalledThisFile) ? { bg: "rgba(37,99,235,0.4)", borderColor: "rgba(96,165,250,0.5)" } : {}}
                                        opacity={(installingId === detailsMod.id || isInstalledThisFile) ? 0.7 : 1}
                                        cursor={isInstalledThisFile ? "default" : "pointer"}
                                        onClick={() => {
                                          if (isInstalledThisFile) return;
                                          void (async () => {
                                            try {
                                              const dir = await ensureGameDir();
                                              setInstallingId(detailsMod.id);
                                              await window.config.modsInstallFile(detailsMod.id, f.id, dir);
                                            } catch {
                                              setInstallingId(null);
                                            }
                                          })();
                                        }}
                                      >
                                        {isInstalledThisFile ? t("modsModal.actions.installed") : t("modsModal.actions.install")}
                                      </Button>
                                    );
                                  })()}
                                </Box>
                              </HStack>
                            ))}
                          </VStack>
                        ) : (
                          <Text fontSize="xs" color="gray.400">{t("modsModal.details.noFilesReturned")}</Text>
                        )}
                      </Box>
                    </VStack>
                  ) : (
                    <Text fontSize="xs" color="gray.300">{t("modsModal.details.selectModForDetails")}</Text>
                  )}
                </Box>
              ) : (
                <>
                  <Text fontSize="11px" color="gray.400" mb={2}>
                    {totalCount != null ? t("modsModal.details.results", { value: formatNumber(totalCount) }) : ""}
                  </Text>

                  <VStack align="stretch" gap={0}>
                    {discoverLoading && !discoverMods.length ? (
                      <Text fontSize="xs" color="rgba(255,255,255,0.38)" px={1} py={3}>{t("common.loading")}</Text>
                    ) : discoverMods.length ? (
                      discoverMods.map((m) => {
                        const installing = installingId === m.id;
                        const p = downloadProgress[m.id];
                        const pct = p?.total ? Math.floor((p.received / p.total) * 100) : null;
                        const status = getInstallStatus(m.id, m.latestFileId).state;
                        const actionLabel =
                          status === "installed"
                            ? t("modsModal.actions.installed")
                            : status === "update"
                              ? t("modsModal.actions.update")
                              : t("modsModal.actions.install");

                        return (
                          <HStack
                            key={m.id}
                            px={2}
                            py={2}
                            gap={3}
                            borderRadius="lg"
                            cursor="pointer"
                            transition="background 0.12s"
                            _hover={{ bg: "rgba(255,255,255,0.04)" }}
                            borderBottom="1px solid rgba(255,255,255,0.04)"
                            onClick={() => {
                              setDetailsId(m.id);
                              void loadDetails(m.id);
                            }}
                          >
                            {/* Thumbnail */}
                            <Box
                              w="60px"
                              h="60px"
                              flexShrink={0}
                              borderRadius="10px"
                              overflow="hidden"
                              bg="rgba(255,255,255,0.06)"
                              border="1px solid rgba(255,255,255,0.08)"
                            >
                              {m.logoThumbnailUrl ? (
                                <Box
                                  as="img"
                                  src={m.logoThumbnailUrl}
                                  alt={m.name}
                                  w="full"
                                  h="full"
                                  objectFit="cover"
                                  loading="lazy"
                                  onError={(e: React.SyntheticEvent<HTMLImageElement>) => { e.currentTarget.style.display = "none"; }}
                                />
                              ) : null}
                            </Box>

                            {/* Text */}
                            <Box flex={1} minW={0}>
                              <Text
                                fontSize="14px"
                                fontWeight="600"
                                color="rgba(255,255,255,0.92)"
                                lineHeight="1.3"
                                lineClamp={1}
                              >
                                {m.name}
                              </Text>
                              <Text
                                fontSize="12px"
                                color="rgba(255,255,255,0.42)"
                                mt="2px"
                                lineClamp={1}
                              >
                                {m.summary}
                              </Text>
                              <Text fontSize="11px" color="rgba(255,255,255,0.25)" mt="2px">
                                {m.author}
                                {typeof m.downloadCount === "number" ? ` · ${formatNumber(m.downloadCount)} ↓` : ""}
                                {m.dateModified ? ` · ${t("modsModal.details.updatedShort", { date: formatDate(m.dateModified) })}` : ""}
                              </Text>
                            </Box>

                            {/* Actions */}
                            <VStack gap={1} flexShrink={0} align="flex-end" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                              {status === "installed" && !installing && (
                                <Badge colorPalette="green" variant="subtle" fontSize="10px" px={1.5}>
                                  {t("modsModal.actions.installed")}
                                </Badge>
                              )}
                              {status === "update" && !installing && (
                                <Badge colorPalette="blue" variant="subtle" fontSize="10px" px={1.5}>
                                  {t("modsModal.actions.update")}
                                </Badge>
                              )}
                              <Button
                                size="xs"
                                bg="rgba(37,99,235,0.25)"
                                border="1px solid"
                                borderColor="rgba(59,130,246,0.3)"
                                color="rgba(147,197,253,1)"
                                _hover={!installing && status !== "installed" ? { bg: "rgba(37,99,235,0.4)", borderColor: "rgba(96,165,250,0.5)" } : {}}
                                opacity={(installing || status === "installed") ? 0.6 : 1}
                                cursor={status === "installed" ? "default" : "pointer"}
                                onClick={() => {
                                  if (status === "installed") return;
                                  void (async () => {
                                    try {
                                      const dir = await ensureGameDir();
                                      setInstallingId(m.id);
                                      await window.config.modsInstall(m.id, dir);
                                    } catch {
                                      setInstallingId(null);
                                    }
                                  })();
                                }}
                              >
                                {installing
                                  ? (pct != null ? `${pct}%` : t("modsModal.status.installing"))
                                  : actionLabel}
                              </Button>
                            </VStack>
                          </HStack>
                        );
                      })
                    ) : (
                      <Text fontSize="xs" color="rgba(255,255,255,0.38)" px={1} py={3}>{t("modsModal.noModsFound")}</Text>
                    )}
                  </VStack>

                  <HStack mt={3} justify="space-between" gap={2}>
                    <Text fontSize="11px" color="gray.400">
                      {totalCount != null
                        ? t("modsModal.details.loadedOf", { loaded: formatNumber(Math.min(discoverMods.length, totalCount)), total: formatNumber(totalCount) })
                        : discoverMods.length
                          ? t("modsModal.details.loaded", { loaded: formatNumber(discoverMods.length) })
                          : ""}
                    </Text>
                    <Text fontSize="11px" color="gray.400">
                      {discoverLoading && hasMore && discoverMods.length ? t("common.loading") : ""}
                    </Text>
                  </HStack>

                  <Box ref={discoverLoadMoreSentinelRef} h={1} w="full" />
                </>
              )}
            </Box>
          ) : tab === "installed" ? (
            <Box p={4}>
              <HStack gap={2} mb={2} flexWrap="wrap">
                <Button
                  size="sm"
                  variant="ghost"
                  bg="rgba(255,255,255,0.06)"
                  color="rgba(255,255,255,0.7)"
                  borderRadius="md"
                  opacity={(installedLoading || updatesWorking) ? 0.5 : 1}
                  _hover={{ bg: "rgba(255,255,255,0.1)", color: "white" }}
                  onClick={() => {
                    void (async () => {
                      try {
                        setUpdatesWorking(true);
                        setInstalledError("");
                        const dir = await ensureGameDir();
                        if (checkedAllOnce) {
                          const res = await window.config.modsUpdateAll(dir);
                          if (res && (res as any).ok === false) {
                            setInstalledError(fmtErr(res, "modsModal.installed.updateFailed"));
                          }
                          setCheckedUpdatesByModId({});
                          await loadInstalled(false);
                        } else {
                          const res = await window.config.modsCheckUpdatesAll(dir);
                          if (res && (res as any).ok === false) {
                            setInstalledError(fmtErr(res, "modsModal.installed.checkFailed"));
                            return;
                          }
                          const results = Array.isArray((res as any).results) ? ((res as any).results as Array<any>) : [];
                          const next: Record<number, { updateAvailable: boolean; latestFileId: number | null; latestName: string }> = {};
                          for (const r of results) {
                            const id = Number(r?.modId);
                            if (!Number.isFinite(id) || id <= 0) continue;
                            next[id] = {
                              updateAvailable: !!r?.updateAvailable,
                              latestFileId: typeof r?.latestFileId === "number" ? r.latestFileId : null,
                              latestName: typeof r?.latestName === "string" ? r.latestName : "",
                            };
                          }
                          setCheckedUpdatesByModId(next);
                          setCheckedAllOnce(true);
                        }
                      } catch {
                        // ignore
                      } finally {
                        setUpdatesWorking(false);
                      }
                    })();
                  }}
                >
                  {checkedAllOnce ? t("modsModal.installed.updateAll") : t("modsModal.installed.checkUpdates")}
                </Button>

                <Button
                  size="sm"
                  variant="ghost"
                  bg="rgba(255,255,255,0.06)"
                  color="rgba(255,255,255,0.7)"
                  borderRadius="md"
                  opacity={installedLoading ? 0.5 : 1}
                  _hover={{ bg: "rgba(255,255,255,0.1)", color: "white" }}
                  onClick={() => {
                    void (async () => {
                      try {
                        const dir = await ensureGameDir();
                        const res = await window.config.modsInstalledSetAll(dir, true);
                        if (res && (res as any).ok === false) { setInstalledError(fmtErr(res, "modsModal.errors.unknown")); return; }
                        await loadInstalled();
                      } catch { /* ignore */ }
                    })();
                  }}
                >
                  {t("modsModal.installed.enableAll")}
                </Button>

                <Button
                  size="sm"
                  variant="ghost"
                  bg="rgba(255,255,255,0.06)"
                  color="rgba(255,255,255,0.7)"
                  borderRadius="md"
                  opacity={installedLoading ? 0.5 : 1}
                  _hover={{ bg: "rgba(255,255,255,0.1)", color: "white" }}
                  onClick={() => {
                    void (async () => {
                      try {
                        const dir = await ensureGameDir();
                        const res = await window.config.modsInstalledSetAll(dir, false);
                        if (res && (res as any).ok === false) { setInstalledError(fmtErr(res, "modsModal.errors.unknown")); return; }
                        await loadInstalled();
                      } catch { /* ignore */ }
                    })();
                  }}
                >
                  {t("modsModal.installed.disableAll")}
                </Button>

                <IconButton
                  aria-label={t("common.refresh")}
                  size="sm"
                  variant="ghost"
                  bg="rgba(255,255,255,0.06)"
                  color="rgba(255,255,255,0.7)"
                  borderRadius="md"
                  opacity={installedLoading ? 0.5 : 1}
                  _hover={{ bg: "rgba(255,255,255,0.1)", color: "white" }}
                  onClick={() => void loadInstalled()}
                >
                  <IconRefresh size={16} />
                </IconButton>

                <Button
                  size="sm"
                  variant="ghost"
                  bg="rgba(255,255,255,0.06)"
                  color="rgba(255,255,255,0.65)"
                  borderRadius="md"
                  _hover={{ bg: "rgba(255,255,255,0.1)", color: "white" }}
                  onClick={() => void handleOpenModsFolder()}
                >
                  <IconFolderOpen size={15} />
                  <Box as="span" ml={1.5}>{t("modsModal.installed.openFolder")}</Box>
                </Button>
              </HStack>

              <Text fontSize="11px" color="gray.400" overflowX="auto" whiteSpace="nowrap" mt={2}>
                {t("modsModal.installed.counts", {
                  downloaded: formatNumber(installedItems.length),
                  active: formatNumber(installedItems.reduce((n, it) => n + (it?.enabled ? 1 : 0), 0)),
                })}
              </Text>

              <Text fontSize="11px" color="gray.400" overflowX="auto" whiteSpace="nowrap" userSelect="text" title={modsDir || ""}>
                {modsDir || ""}
              </Text>

              {installedError ? (
                <Text fontSize="xs" color="red.300" mb={2}>{installedError}</Text>
              ) : null}

              <HStack gap={3} px={1} mt={4} mb={2} fontSize="sm" borderBottom="1px solid" borderColor="whiteAlpha.50" pb={2}>
                <Text color="rgba(255,255,255,0.38)" fontWeight="medium" flexShrink={0}>{t("common.sortBy")}:</Text>
                <HStack gap={1} overflowX="auto" whiteSpace="nowrap" flex={1}>
                  {[
                    { id: "connectedToLauncher", label: t("modsModal.installed.sort.connectedToLauncher") },
                    { id: "installedManually", label: t("modsModal.installed.sort.installedManually") },
                    { id: "alphabetical", label: t("modsModal.installed.sort.alphabetical") },
                    { id: "needsUpdate", label: t("modsModal.installed.sort.needsUpdate") },
                  ].map((opt) => (
                    <Button
                      key={opt.id}
                      size="xs"
                      variant="ghost"
                      color={installedSort === opt.id ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.35)"}
                      fontWeight={installedSort === opt.id ? "semibold" : "normal"}
                      bg={installedSort === opt.id ? "rgba(255,255,255,0.08)" : "transparent"}
                      borderRadius="md"
                      _hover={installedSort !== opt.id ? { color: "rgba(255,255,255,0.7)", bg: "rgba(255,255,255,0.04)" } : {}}
                      onClick={() => setInstalledSort(opt.id as InstalledSort)}
                    >
                      {opt.label}
                    </Button>
                  ))}
                </HStack>
                <IconButton
                  aria-label={installedSortAsc ? t("common.ascending") : t("common.descending")}
                  size="xs"
                  variant="ghost"
                  color="rgba(255,255,255,0.7)"
                  borderRadius="md"
                  _hover={{ color: "rgba(255,255,255,0.95)", bg: "rgba(255,255,255,0.06)" }}
                  onClick={() => setInstalledSortAsc((v) => !v)}
                >
                  <Box as="span" fontSize="md">{installedSortAsc ? "↑" : "↓"}</Box>
                </IconButton>
              </HStack>

              <Box pr={1} rounded="lg" border="1px solid" borderColor="rgba(255,255,255,0.08)" bg="rgba(255,255,255,0.02)">
                {installedLoading ? (
                  <Text p={3} fontSize="xs" color="gray.100">{t("common.loading")}</Text>
                ) : sortedInstalledItems.length ? (
                  sortedInstalledItems.map((it) =>
                    (() => {
                      const base = baseName(it.fileName).trim();
                      const reg = base ? registryByBaseName.get(base.toLowerCase()) ?? null : null;
                      const managedModId = reg?.modId;
                      const isManual = !reg;
                      const canCheckUpdate = typeof managedModId === "number" && Number.isFinite(managedModId) && managedModId > 0;
                      const checked = typeof managedModId === "number" ? checkedUpdatesByModId[managedModId] : undefined;

                      return (
                        <HStack key={it.fileName} justify="space-between" gap={3} px={3} py={2} borderBottom="1px solid" borderColor="whiteAlpha.50">
                          <Box minW={0}>
                            <Text fontSize="xs" color="white" truncate>{it.fileName}</Text>
                            <HStack mt={0.5} gap={2}>
                              <Badge
                                size="sm"
                                variant="subtle"
                                colorPalette={it.enabled ? "green" : "gray"}
                                borderRadius="full"
                                fontSize="10px"
                                px={2}
                              >
                                {it.enabled ? t("common.enabled") : t("common.disabled")}
                              </Badge>
                              {isManual ? (
                                <Badge size="sm" variant="subtle" colorPalette="yellow" borderRadius="full" fontSize="10px" px={2}>
                                  {t("modsModal.installed.installedManually")}
                                </Badge>
                              ) : null}
                            </HStack>
                            {!isManual && checked?.updateAvailable ? (
                              <Text fontSize="10px" color="gray.400" mt={0.5} truncate>
                                {t("modsModal.installed.latestVersion")}: {checked.latestName || ""}
                              </Text>
                            ) : null}
                          </Box>

                          <HStack gap={2}>
                            {isManual ? (
                              <Button
                                size="xs"
                                variant="outline"
                                borderColor="rgba(255,255,255,0.12)"
                                color="yellow.200"
                                borderRadius="lg"
                                _hover={{ bg: "rgba(234,179,8,0.1)", borderColor: "rgba(234,179,8,0.3)" }}
                                onClick={() => openAttachPrompt(it.fileName)}
                                title={t("modsModal.installed.attachToLauncher")}
                              >
                                {t("modsModal.installed.attachToLauncher")}
                              </Button>
                            ) : canCheckUpdate ? (
                              <Button
                                size="xs"
                                variant="ghost"
                                bg="rgba(255,255,255,0.04)"
                                color="rgba(255,255,255,0.7)"
                                borderRadius="lg"
                                border="1px solid rgba(255,255,255,0.08)"
                                opacity={(updatesWorking || installingId === managedModId) ? 0.6 : 1}
                                _hover={{ bg: "rgba(255,255,255,0.1)", color: "white" }}
                                onClick={() => {
                                  void (async () => {
                                    try {
                                      setUpdatesWorking(true);
                                      setInstalledError("");
                                      const dir = await ensureGameDir();
                                      if (checked?.updateAvailable) {
                                        setInstallingId(managedModId!);
                                        const res = await window.config.modsUpdateOne(dir, managedModId!);
                                        if (res && (res as any).ok === false) { setInstalledError(fmtErr(res, "modsModal.installed.updateFailed")); }
                                        setCheckedUpdatesByModId((prev) => { const copy = { ...prev }; delete copy[managedModId!]; return copy; });
                                        await loadInstalled(false);
                                      } else {
                                        const res = await window.config.modsCheckUpdateOne(dir, managedModId!);
                                        if (res && (res as any).ok === false) { setInstalledError(fmtErr(res, "modsModal.installed.checkFailed")); return; }
                                        setCheckedUpdatesByModId((prev) => ({
                                          ...prev,
                                          [managedModId!]: {
                                            updateAvailable: !!(res as any)?.updateAvailable,
                                            latestFileId: typeof (res as any)?.latestFileId === "number" ? (res as any).latestFileId : null,
                                            latestName: typeof (res as any)?.latestName === "string" ? (res as any).latestName : "",
                                          },
                                        }));
                                      }
                                    } catch {
                                      // ignore
                                    } finally {
                                      setInstallingId(null);
                                      setUpdatesWorking(false);
                                    }
                                  })();
                                }}
                                title={t("modsModal.installed.checkUpdate")}
                              >
                                {checked?.updateAvailable ? t("modsModal.installed.update") : t("modsModal.installed.checkUpdate")}
                              </Button>
                            ) : null}

                            <Button
                              size="xs"
                              variant="ghost"
                              bg={it.enabled ? "transparent" : "rgba(255,255,255,0.06)"}
                              border="1px solid rgba(255,255,255,0.08)"
                              color={it.enabled ? "rgba(255,255,255,0.6)" : "white"}
                              borderRadius="lg"
                              _hover={{ bg: it.enabled ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.1)", color: "white" }}
                              onClick={() => {
                                void (async () => {
                                  try {
                                    const dir = await ensureGameDir();
                                    const res = await window.config.modsInstalledToggle(dir, it.fileName);
                                    if (res && (res as any).ok === false) { setInstalledError(fmtErr(res, "modsModal.errors.unknown")); return; }
                                    await loadInstalled(false);
                                  } catch { /* ignore */ }
                                })();
                              }}
                              title={t("common.toggle")}
                            >
                              {it.enabled ? t("common.disable") : t("common.enable")}
                            </Button>

                            <IconButton
                              aria-label={t("common.delete")}
                              size="xs"
                              variant="ghost"
                              color="red.300"
                              borderRadius="lg"
                              border="1px solid rgba(255,255,255,0.06)"
                              _hover={{ bg: "rgba(239,68,68,0.15)", color: "red.200", borderColor: "rgba(239,68,68,0.3)" }}
                              onClick={() => setDeleteModPrompt({ open: true, fileName: it.fileName })}
                              title={t("common.delete")}
                            >
                              <IconTrash size={15} />
                            </IconButton>
                          </HStack>
                        </HStack>
                      );
                    })()
                  )
                ) : (
                  <Text p={3} fontSize="xs" color="gray.300">{t("modsModal.noInstalledModsFound")}</Text>
                )}
              </Box>
            </Box>
          ) : (
            <Box display="grid" gridTemplateColumns="260px 1fr" gap={4} minH={0} h="full">
              <Box rounded="lg" border="1px solid" borderColor="rgba(255,255,255,0.08)" bg="rgba(255,255,255,0.02)" p={3} display="flex" flexDir="column" minH={0}>
                <Text fontSize="sm" color="white" fontWeight="semibold" mb={2}>{t("modsModal.profiles.title")}</Text>

                <HStack gap={2} mb={3}>
                  <Input
                    value={profileNameInput}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setProfileNameInput(e.target.value)}
                    placeholder={t("modsModal.profiles.namePlaceholder")}
                    size="sm"
                    flex={1}
                    bg="rgba(255,255,255,0.05)"
                    border="1px solid"
                    borderColor="rgba(255,255,255,0.1)"
                    color="white"
                    borderRadius="md"
                    _placeholder={{ color: "rgba(255,255,255,0.28)" }}
                    _focus={{ borderColor: "rgba(59,130,246,0.5)", boxShadow: "0 0 0 1px rgba(59,130,246,0.25)" }}
                  />
                  <Button
                    size="sm"
                    bg="rgba(37,99,235,0.25)"
                    border="1px solid"
                    borderColor="rgba(59,130,246,0.3)"
                    color="white"
                    fontWeight="bold"
                    borderRadius="md"
                    _hover={{ bg: "rgba(37,99,235,0.4)", borderColor: "rgba(96,165,250,0.5)" }}
                    onClick={() => {
                      void (async () => {
                        try {
                          const dir = await ensureGameDir();
                          const name = sanitizeProfileName(profileNameInput || selectedProfileName);
                          if (!name) return;
                          const fallbackMods = profiles.find((p) => p.name === selectedProfileName)?.mods ?? [];
                          const modsToSave = profileSelectedMods.size > 0
                            ? Array.from(profileSelectedMods)
                            : Array.from(new Set((fallbackMods ?? []).filter(Boolean)));
                          const cf: Record<string, { modId: number; fileId?: number }> = {};
                          for (const base of modsToSave) {
                            const key = typeof base === "string" ? base.trim().toLowerCase() : "";
                            if (!key) continue;
                            const reg = registryByBaseName.get(key) ?? null;
                            if (!reg || typeof reg.modId !== "number" || reg.modId <= 0) continue;
                            const entry: { modId: number; fileId?: number } = { modId: reg.modId };
                            if (typeof reg.fileId === "number" && reg.fileId > 0) entry.fileId = reg.fileId;
                            cf[key] = entry;
                          }
                          const res = await window.config.modsProfilesSave(dir, { name, mods: modsToSave, cf });
                          if (res && (res as any).ok === false) { setProfilesError(fmtErr(res, "modsModal.errors.unknown")); return; }
                          setProfileNameInput(name);
                          await loadProfiles();
                          setSelectedProfileName(name);
                        } catch (e) {
                          setProfilesError(e instanceof Error ? e.message : t("modsModal.errors.unknown"));
                        }
                      })();
                    }}
                    title={t("common.save")}
                  >
                    {t("common.save")}
                  </Button>
                </HStack>

                {profilesError ? <Text fontSize="xs" color="red.300" mb={2}>{profilesError}</Text> : null}

                <Box flex={1} minH={0} overflowY="auto" style={{ overscrollBehavior: "contain" }} pr={1} rounded="lg" border="1px solid" borderColor="rgba(255,255,255,0.08)" bg="rgba(255,255,255,0.02)">
                  {profilesLoading ? (
                    <Text p={3} fontSize="xs" color="gray.300">{t("common.loading")}</Text>
                  ) : profiles.length ? (
                    profiles.map((p) => {
                      const active = p.name === selectedProfileName;
                      const isVanilla = p.name.toLowerCase() === "vanilla";
                      return (
                        <Box
                          key={p.name}
                          w="full"
                          px={3}
                          py={2}
                          borderBottom="1px solid"
                          borderColor="whiteAlpha.50"
                          cursor="pointer"
                          bg={active ? "rgba(255,255,255,0.08)" : "transparent"}
                          _hover={{ bg: "rgba(255,255,255,0.08)" }}
                          transition="all 0.15s"
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            setSelectedProfileName(p.name);
                            setProfileNameInput(p.name);
                            const selected = new Set((p.mods ?? []).filter(Boolean));
                            setProfileSelectedMods(selected);
                            const union = new Set<string>(installedBaseNames);
                            for (const m of selected) union.add(m);
                            const names = Array.from(union);
                            names.sort((a, b) => {
                              const aSelected = selected.has(a);
                              const bSelected = selected.has(b);
                              if (aSelected !== bSelected) return aSelected ? -1 : 1;
                              return a.localeCompare(b);
                            });
                            setProfileModsOrder(names);
                          }}
                          onContextMenu={(e: React.MouseEvent) => {
                            e.preventDefault();
                            if (isVanilla) return;
                            setProfileCtxMenu({ open: true, x: e.clientX, y: e.clientY, name: p.name });
                          }}
                        >
                          <Text fontSize="xs" color="white" truncate>{p.name}</Text>
                          <HStack gap={1} mt={0.5}>
                            <Badge size="xs" variant="subtle" colorPalette={active ? "blue" : "gray"} borderRadius="full" fontSize="10px">
                              {t("modsModal.countMods", { count: p.mods?.length ?? 0 })}
                            </Badge>
                          </HStack>
                        </Box>
                      );
                    })
                  ) : (
                    <Text p={3} fontSize="xs" color="gray.300">{t("modsModal.profiles.noProfilesYet")}</Text>
                  )}
                </Box>

                <HStack mt={3} gap={2}>
                  <Button
                    size="sm"
                    variant="ghost"
                    bg="rgba(255,255,255,0.06)"
                    border="1px solid rgba(255,255,255,0.08)"
                    color="white"
                    borderRadius="md"
                    opacity={(!selectedProfileName || profilesLoading) ? 0.6 : 1}
                    _hover={{ bg: "rgba(255,255,255,0.1)" }}
                    title={t("common.apply")}
                    onClick={() => {
                      void (async () => {
                        try {
                          const dir = await ensureGameDir();
                          if (!selectedProfileName) return;
                          const res = await window.config.modsProfilesApply(dir, selectedProfileName);
                          if (res && (res as any).ok === false) { setProfilesError(fmtErr(res, "modsModal.errors.unknown")); return; }
                          await loadInstalled();
                        } catch (e) {
                          setProfilesError(e instanceof Error ? e.message : t("modsModal.errors.unknown"));
                        }
                      })();
                    }}
                  >
                    {t("common.apply")}
                  </Button>

                  <Button
                    size="sm"
                    variant="ghost"
                    bg="transparent"
                    border="1px solid rgba(255,255,255,0.08)"
                    color="red.300"
                    borderRadius="md"
                    opacity={(!selectedProfileName || profilesLoading || selectedProfileName === "Vanilla") ? 0.6 : 1}
                    _hover={{ bg: "rgba(239,68,68,0.15)", color: "red.200" }}
                    title={t("common.delete")}
                    onClick={() => {
                      void (async () => {
                        try {
                          const dir = await ensureGameDir();
                          if (!selectedProfileName) return;
                          const res = await window.config.modsProfilesDelete(dir, selectedProfileName);
                          if (res && (res as any).ok === false) { setProfilesError(fmtErr(res, "modsModal.errors.unknown")); return; }
                          setSelectedProfileName("");
                          setProfileNameInput("");
                          await loadProfiles();
                        } catch (e) {
                          setProfilesError(e instanceof Error ? e.message : t("modsModal.errors.unknown"));
                        }
                      })();
                    }}
                  >
                    {t("common.delete")}
                  </Button>
                </HStack>

                {importError ? <Text fontSize="xs" color="red.300" mt={2}>{importError}</Text> : null}
                {importNotice ? <Text fontSize="xs" color="gray.200" mt={2}>{importNotice}</Text> : null}

                {importing && importCurrent ? (
                  <Text fontSize="11px" color="gray.300" mt={2}>
                    {(() => {
                      const p = importCurrent.modId ? downloadProgress[importCurrent.modId] : null;
                      const pct = p?.total ? Math.floor((p.received / p.total) * 100) : null;
                      return pct != null
                        ? t("modsModal.profiles.share.importingPct", { current: importCurrent.idx, total: importCurrent.total, name: importCurrent.name, pct })
                        : t("modsModal.profiles.share.importing", { current: importCurrent.idx, total: importCurrent.total, name: importCurrent.name });
                    })()}
                  </Text>
                ) : null}

                <Box mt={2} display="flex" alignItems="center" gap={2} position="relative">
                  <Button
                    size="sm"
                    bg="rgba(37,99,235,0.25)"
                    border="1px solid"
                    borderColor="rgba(59,130,246,0.3)"
                    color="white"
                    fontWeight="bold"
                    borderRadius="md"
                    opacity={(importing || shareWorking) ? 0.6 : 1}
                    _hover={{ bg: "rgba(37,99,235,0.4)", borderColor: "rgba(96,165,250,0.5)" }}
                    onClick={() => {
                      setShareError(""); setShareNotice(""); setImportError(""); setImportNotice(""); setImportPromptError(""); setImportPromptText(""); setImportPromptOpen(true);
                    }}
                    title={t("modsModal.profiles.share.import")}
                  >
                    {t("modsModal.profiles.share.import")}
                  </Button>

                  {importPromptOpen ? (
                    <>
                      <Box position="fixed" inset={0} zIndex={9999} onMouseDown={() => { setImportPromptOpen(false); setImportPromptError(""); }} />
                      <Box
                        position="absolute"
                        left={0}
                        bottom="full"
                        mb={2}
                        zIndex={10000}
                        w="560px"
                        maxW="92vw"
                        rounded="lg"
                        border="1px solid"
                        borderColor="rgba(255,255,255,0.1)"
                        bg="rgba(13,17,32,0.97)"
                        backdropFilter="blur(12px)"
                        p={3}
                        onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}
                      >
                        <HStack justify="space-between" gap={3} mb={2}>
                          <Text fontSize="xs" color="white" fontWeight="semibold">{t("modsModal.profiles.share.importPromptTitle")}</Text>
                          <IconButton
                            aria-label={t("common.close")}
                            size="xs"
                            variant="ghost"
                            color="rgba(255,255,255,0.45)"
                            borderRadius="md"
                            _hover={{ color: "white", bg: "rgba(255,255,255,0.08)" }}
                            onClick={() => { setImportPromptOpen(false); setImportPromptError(""); }}
                          >
                            ×
                          </IconButton>
                        </HStack>
                        <Text fontSize="11px" color="gray.300" mb={2}>{t("modsModal.profiles.share.importPromptHint")}</Text>
                        {importPromptError ? <Text fontSize="xs" color="red.300" mb={2}>{importPromptError}</Text> : null}
                        <Textarea
                          value={importPromptText}
                          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => { setImportPromptText(e.target.value); if (importPromptError) setImportPromptError(""); }}
                          placeholder={t("modsModal.profiles.share.importPromptPlaceholder")}
                          rows={4}
                          resize="none"
                          bg="rgba(255,255,255,0.05)"
                          border="1px solid"
                          borderColor="rgba(255,255,255,0.1)"
                          color="white"
                          fontSize="11px"
                          fontFamily="monospace"
                          _placeholder={{ color: "rgba(255,255,255,0.28)" }}
                          _focus={{ borderColor: "rgba(59,130,246,0.5)", boxShadow: "0 0 0 1px rgba(59,130,246,0.25)" }}
                        />
                        <HStack mt={2} justify="flex-end" gap={2}>
                          <Button
                            size="sm"
                            variant="ghost"
                            bg="rgba(255,255,255,0.04)"
                            border="1px solid rgba(255,255,255,0.08)"
                            color="rgba(255,255,255,0.7)"
                            borderRadius="md"
                            opacity={(importing || shareWorking) ? 0.6 : 1}
                            _hover={{ bg: "rgba(255,255,255,0.1)", color: "white" }}
                            onClick={() => {
                              void (async () => {
                                setImportPromptError("");
                                try {
                                  const text = await readClipboardText();
                                  setImportPromptText(text);
                                  const pack = await decodeModPack(text);
                                  setImportPreviewPack(pack);
                                  setImportPreviewOpen(true);
                                  setImportPromptOpen(false);
                                } catch (e) {
                                  const code = e instanceof Error ? e.message : "unknown";
                                  setImportPromptError(code === "invalid_prefix" ? t("modsModal.profiles.share.invalidFormat") : t("modsModal.profiles.share.importFailed"));
                                }
                              })();
                            }}
                            title={t("modsModal.profiles.share.importFromClipboard")}
                          >
                            {t("modsModal.profiles.share.importFromClipboard")}
                          </Button>
                          <Button
                            size="sm"
                            bg="rgba(37,99,235,0.25)"
                            border="1px solid"
                            borderColor="rgba(59,130,246,0.3)"
                            color="white"
                            fontWeight="bold"
                            borderRadius="md"
                            opacity={(!importPromptText.trim() || importing || shareWorking) ? 0.6 : 1}
                            _hover={{ bg: "rgba(37,99,235,0.4)", borderColor: "rgba(96,165,250,0.5)" }}
                            onClick={() => {
                              void (async () => {
                                setImportPromptError("");
                                try {
                                  const pack = await decodeModPack(importPromptText);
                                  setImportPreviewPack(pack);
                                  setImportPreviewOpen(true);
                                  setImportPromptOpen(false);
                                } catch (e) {
                                  const code = e instanceof Error ? e.message : "unknown";
                                  setImportPromptError(code === "invalid_prefix" ? t("modsModal.profiles.share.invalidFormatText") : t("modsModal.profiles.share.importFailed"));
                                }
                              })();
                            }}
                            title={t("modsModal.profiles.share.importNow")}
                          >
                            {t("modsModal.profiles.share.importNow")}
                          </Button>
                        </HStack>
                      </Box>
                    </>
                  ) : null}
                </Box>
              </Box>

              <Box rounded="lg" border="1px solid" borderColor="rgba(255,255,255,0.08)" bg="rgba(255,255,255,0.02)" p={3} display="flex" flexDir="column" minH={0}>
                <HStack justify="space-between" gap={3} mb={2}>
                  <Box>
                    <Text fontSize="sm" color="white" fontWeight="semibold">{t("modsModal.profileMods")}</Text>
                    <Text fontSize="11px" color="gray.400">{t("modsModal.profiles.selectedCount", { count: profileSelectedMods.size })}</Text>
                  </Box>
                  <HStack gap={2}>
                    <Button size="xs" variant="ghost" bg="rgba(255,255,255,0.06)" border="1px solid rgba(255,255,255,0.08)" color="white" borderRadius="md" opacity={installedLoading ? 0.6 : 1} _hover={{ bg: "rgba(255,255,255,0.1)" }} onClick={() => setProfileSelectedMods(new Set(installedBaseNames))} title={t("common.selectAll") as string}>{t("common.selectAll")}</Button>
                    <Button size="xs" variant="ghost" bg="transparent" border="1px solid rgba(255,255,255,0.08)" color="rgba(209,213,219,1)" borderRadius="md" opacity={installedLoading ? 0.6 : 1} _hover={{ bg: "rgba(255,255,255,0.06)", color: "white" }} onClick={() => setProfileSelectedMods(new Set())} title={t("common.selectNone") as string}>{t("common.selectNone")}</Button>
                    <Button size="xs" variant="ghost" bg="rgba(255,255,255,0.06)" border="1px solid rgba(255,255,255,0.08)" color="white" borderRadius="md" opacity={installedLoading ? 0.6 : 1} _hover={{ bg: "rgba(255,255,255,0.1)" }} onClick={() => void loadInstalled()} title={t("common.refresh") as string}><IconRefresh size={14} /><Box as="span" ml={1}>{t("common.refresh")}</Box></Button>
                    <Button size="xs" variant="ghost" bg="transparent" border="1px solid rgba(255,255,255,0.08)" color="rgba(255,255,255,0.7)" borderRadius="md" _hover={{ bg: "rgba(255,255,255,0.06)", color: "white" }} onClick={() => void handleOpenModsFolder()} title={t("modsModal.installed.openFolder")}><IconFolderOpen size={14} /><Box as="span" ml={1}>{t("modsModal.installed.openFolder")}</Box></Button>
                  </HStack>
                </HStack>

                <Box flex={1} minH={0} overflowY="auto" overscrollBehavior="contain" pr={1} rounded="lg" border="1px solid" borderColor="rgba(255,255,255,0.08)" bg="rgba(255,255,255,0.02)">
                  {installedLoading ? (
                    <Text p={3} fontSize="xs" color="gray.300">{t("common.loading")}</Text>
                  ) : profileModsUnionNames.length ? (
                    (profileModsOrder.length ? profileModsOrder : profileModsUnionNames).map((name) => {
                      const info = installedByBase.get(name);
                      const isInstalled = !!info;
                      const checked = profileSelectedMods.has(name);
                      const key = name.trim().toLowerCase();
                      const cfEntry = selectedProfile?.cf?.[key] ?? null;
                      const reg = registryByBaseName.get(key) ?? null;
                      const source =
                        cfEntry && typeof cfEntry.modId === "number" && cfEntry.modId > 0
                          ? { modId: cfEntry.modId, fileId: cfEntry.fileId }
                          : reg && typeof reg.modId === "number" && reg.modId > 0
                            ? { modId: reg.modId, fileId: reg.fileId }
                            : null;
                      const canAutoInstall = !isInstalled && !!source && typeof source.modId === "number" && source.modId > 0;

                      return (
                        <Box
                          as="label"
                          key={name}
                          display="flex"
                          alignItems="center"
                          justifyContent="space-between"
                          gap={3}
                          px={3}
                          py={2}
                          borderBottom="1px solid"
                          borderColor="whiteAlpha.50"
                          cursor="pointer"
                          _hover={{ bg: "whiteAlpha.50" }}
                          transition="all 0.15s"
                        >
                          <Box minW={0} flex={1}>
                            <Text fontSize="xs" color="white" truncate>{name}</Text>
                            {isInstalled ? (
                              <Text fontSize="10px" color={info?.enabled ? "green.300" : "gray.400"}>
                                {info?.enabled ? t("modsModal.profiles.currentlyEnabled") : t("modsModal.profiles.currentlyDisabled")}
                              </Text>
                            ) : (
                              <Text fontSize="10px" color="orange.300">{t("modsModal.profiles.notInstalled")}</Text>
                            )}
                          </Box>

                          {!isInstalled ? (
                            <Button
                              size="xs"
                              bg="rgba(255,255,255,0.06)"
                              border="1px solid rgba(255,255,255,0.08)"
                              color="white"
                              borderRadius="md"
                              opacity={(!canAutoInstall || shareWorking || importing || installingId != null) ? 0.6 : 1}
                              _hover={{ bg: "rgba(255,255,255,0.1)" }}
                              onClick={(e: React.MouseEvent) => {
                                e.preventDefault();
                                e.stopPropagation();
                                void (async () => {
                                  if (!source) return;
                                  const modId = source.modId;
                                  if (typeof modId !== "number" || modId <= 0) return;
                                  try {
                                    setInstalledError("");
                                    setInstalledLoading(true);
                                    setInstallingId(modId);
                                    const dir = await ensureGameDir();
                                    if (typeof source.fileId === "number" && source.fileId > 0) {
                                      await window.config.modsInstallFile(modId, source.fileId, dir);
                                    } else {
                                      await window.config.modsInstall(modId, dir);
                                    }
                                    await loadInstalled();
                                    await loadRegistry();
                                  } catch (err) {
                                    setInstalledError(err instanceof Error ? err.message : t("modsModal.errors.unknown"));
                                  } finally {
                                    setInstalledLoading(false);
                                    setInstallingId(null);
                                  }
                                })();
                              }}
                              title={t("modsModal.profiles.install")}
                            >
                              {t("modsModal.profiles.install")}
                            </Button>
                          ) : null}

                          <Box
                            as="input"
                            type="checkbox"
                            checked={checked}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                              const next = new Set(profileSelectedMods);
                              if (e.target.checked) next.add(name);
                              else next.delete(name);
                              setProfileSelectedMods(next);
                            }}
                            w="16px"
                            h="16px"
                            accentColor="#0ea5ff"
                          />
                        </Box>
                      );
                    })
                  ) : (
                    <Text p={3} fontSize="xs" color="gray.300">{t("modsModal.noInstalledModsToSelect")}</Text>
                  )}
                </Box>

                <HStack mt={3} justify="space-between" gap={2} position="relative">
                  <Text fontSize="11px" color="gray.400">{t("modsModal.profiles.tip")}</Text>

                  <Button
                    size="sm"
                    variant="ghost"
                    bg="rgba(255,255,255,0.04)"
                    border="1px solid rgba(255,255,255,0.08)"
                    color="rgba(255,255,255,0.7)"
                    borderRadius="md"
                    opacity={(!selectedProfileName || shareWorking || importing) ? 0.6 : 1}
                    _hover={{ bg: "rgba(255,255,255,0.08)", color: "white" }}
                    onClick={() => {
                      setShareError(""); setShareNotice(""); setExportCode(""); setExportOpen(true);
                      void (async () => {
                        setShareWorking(true);
                        try {
                          const dir = await ensureGameDir();
                          const profile = profiles.find((p) => p.name === selectedProfileName);
                          if (!profile) throw new Error(t("modsModal.errors.profileNotFound"));
                          const registryItems = Object.values(registryByModId);
                          const registryByBase = new Map<string, ModRegistryEntry>();
                          for (const it of registryItems) {
                            if (!it?.fileName) continue;
                            registryByBase.set(baseName(it.fileName).trim().toLowerCase(), it);
                          }
                          const profileCf = profile.cf ?? {};
                          const gv = getSelectedGameVersionLabel();
                          const mods: ModPackV1["mods"] = [];
                          const unattached: string[] = [];
                          for (const base of (profile.mods ?? []).filter(Boolean)) {
                            const baseKey = String(base).trim().toLowerCase();
                            const fileName = getPreferredInstalledFileNameForBase(base);
                            const reg = registryByBase.get(baseKey) ?? null;
                            const cfEntry = profileCf?.[baseKey] ?? null;
                            const modId = reg?.modId ?? cfEntry?.modId;
                            const fileId = typeof reg?.fileId === "number" ? reg.fileId : cfEntry?.fileId;
                            const canIntegrityCheckCurseforge = typeof modId === "number" && modId > 0 && typeof fileId === "number" && fileId > 0;
                            let sha256: string | undefined;
                            if (fileName && canIntegrityCheckCurseforge) {
                              try {
                                const h = await window.config.modsFileHash(dir, fileName);
                                if (h?.ok && typeof h.sha256 === "string" && h.sha256) sha256 = h.sha256;
                              } catch { /* ignore */ }
                            }
                            if (reg || (cfEntry && typeof cfEntry.modId === "number" && cfEntry.modId > 0)) {
                              const fileNameFromReg = typeof reg?.fileName === "string" ? reg.fileName : undefined;
                              mods.push({ source: "curseforge", name: base, modId: modId as number, fileId, fileName: fileNameFromReg, sha256 });
                            } else {
                              unattached.push(String(base));
                              mods.push({ source: fileName ? "local" : "unknown", name: base, fileName: fileName ?? undefined, sha256, requiredManual: true });
                            }
                          }
                          const pack: ModPackV1 = {
                            v: 1,
                            profile: { name: selectedProfileName, gameVersion: { type: gv.type, buildIndex: gv.buildIndex, label: gv.label }, createdAt: new Date().toISOString() },
                            mods,
                          };
                          const code = await encodeModPack(pack);
                          setExportCode(code);
                          setShareNotice(
                            unattached.length
                              ? `${t("modsModal.profiles.share.exportReady")} ${t("modsModal.profiles.share.exportWarnUnattached", { count: unattached.length })}`
                              : t("modsModal.profiles.share.exportReady"),
                          );
                        } catch (e) {
                          setShareError(e instanceof Error ? e.message : t("modsModal.status.unknownError"));
                        } finally {
                          setShareWorking(false);
                        }
                      })();
                    }}
                    title={t("modsModal.profiles.share.export")}
                  >
                    {shareWorking ? t("common.working") : t("modsModal.profiles.share.export")}
                  </Button>

                  {exportOpen ? (
                    <>
                      <Box position="fixed" inset={0} zIndex={9999} onMouseDown={() => setExportOpen(false)} />
                      <Box
                        position="absolute"
                        right={0}
                        bottom="full"
                        mb={2}
                        zIndex={10000}
                        w="560px"
                        maxW="92vw"
                        rounded="lg"
                        border="1px solid"
                        borderColor="rgba(255,255,255,0.1)"
                        bg="rgba(13,17,32,0.97)"
                        backdropFilter="blur(12px)"
                        p={3}
                        onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}
                      >
                        <HStack justify="space-between" gap={3} mb={2}>
                          <Text fontSize="xs" color="white" fontWeight="semibold">{t("modsModal.profiles.share.title")}</Text>
                          <IconButton
                            aria-label={t("common.close")}
                            size="xs"
                            variant="ghost"
                            color="rgba(255,255,255,0.45)"
                            borderRadius="md"
                            _hover={{ color: "white", bg: "rgba(255,255,255,0.08)" }}
                            onClick={() => setExportOpen(false)}
                          >
                            ×
                          </IconButton>
                        </HStack>
                        {shareError ? <Text fontSize="xs" color="red.300" mb={2}>{shareError}</Text> : null}
                        {shareNotice ? <Text fontSize="xs" color="gray.200" mb={2}>{shareNotice}</Text> : null}
                        <HStack justify="flex-end" gap={2} mb={2}>
                          <Button
                            size="sm"
                            variant="ghost"
                            bg="rgba(255,255,255,0.04)"
                            border="1px solid rgba(255,255,255,0.08)"
                            color="rgba(255,255,255,0.7)"
                            borderRadius="md"
                            opacity={(!exportCode || shareWorking) ? 0.6 : 1}
                            _hover={{ bg: "rgba(255,255,255,0.1)", color: "white" }}
                            onClick={() => { void (async () => { try { await copyToClipboard(exportCode); setShareNotice(t("modsModal.profiles.share.copied")); } catch { /* ignore */ } })(); }}
                            title={t("modsModal.profiles.share.copy")}
                          >
                            {t("modsModal.profiles.share.copy")}
                          </Button>
                        </HStack>
                        <Textarea
                          value={exportCode}
                          readOnly
                          placeholder={t("modsModal.profiles.share.codePlaceholder")}
                          rows={3}
                          resize="none"
                          bg="rgba(255,255,255,0.05)"
                          border="1px solid"
                          borderColor="rgba(255,255,255,0.1)"
                          color="white"
                          fontSize="11px"
                          fontFamily="monospace"
                          _placeholder={{ color: "rgba(255,255,255,0.28)" }}
                        />
                      </Box>
                    </>
                  ) : null}
                </HStack>
              </Box>
            </Box>
          )}
        </Box>
      </Box>

      <ConfirmModal
        open={renameProfilePrompt.open}
        title={t("modsModal.profiles.rename.title")}
        message={
          <Box>
            <Text fontSize="xs" color="gray.300" mb={2}>
              {t("modsModal.profiles.rename.hint", { name: renameProfilePrompt.oldName })}
            </Text>
            <Input
              value={renameProfileInput}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setRenameProfileInput(e.target.value); if (renameProfileError) setRenameProfileError(""); }}
              placeholder={t("modsModal.profiles.rename.placeholder")}
              w="full"
              bg="whiteAlpha.50"
              border="1px solid"
              borderColor="whiteAlpha.100"
              color="white"
              fontSize="sm"
              autoFocus
            />
            {renameProfileError ? <Text fontSize="11px" color="red.300" mt={2}>{renameProfileError}</Text> : null}
          </Box>
        }
        confirmText={t("common.confirm")}
        cancelText={t("common.cancel")}
        onCancel={() => { setRenameProfilePrompt({ open: false, oldName: "" }); setRenameProfileInput(""); setRenameProfileError(""); }}
        onConfirm={() => {
          void (async () => {
            try {
              const oldName = renameProfilePrompt.oldName;
              const nextName = sanitizeProfileName(renameProfileInput);
              if (!nextName) { setRenameProfileError(t("modsModal.profiles.rename.invalid")); return; }
              const existingName = profiles.find((p) => p.name.toLowerCase() === nextName.toLowerCase())?.name;
              if (existingName && existingName.toLowerCase() !== oldName.toLowerCase()) { setRenameProfileError(t("modsModal.profiles.rename.taken")); return; }
              const profile = profiles.find((p) => p.name === oldName);
              if (!profile) { setRenameProfileError(t("modsModal.errors.profileNotFound")); return; }
              const dir = await ensureGameDir();
              const saveRes = await window.config.modsProfilesSave(dir, { name: nextName, mods: Array.isArray(profile.mods) ? profile.mods : [], cf: profile.cf ?? {} } as any);
              if (saveRes && (saveRes as any).ok === false) { setRenameProfileError(fmtErr(saveRes, "modsModal.errors.unknown")); return; }
              if (oldName.toLowerCase() !== nextName.toLowerCase()) {
                await window.config.modsProfilesDelete(dir, oldName);
              }
              setRenameProfilePrompt({ open: false, oldName: "" });
              setRenameProfileInput("");
              setRenameProfileError("");
              await loadProfiles();
              setSelectedProfileName(nextName);
              setProfileNameInput(nextName);
            } catch (e) {
              setRenameProfileError(e instanceof Error ? e.message : t("modsModal.errors.unknown"));
            }
          })();
        }}
      />

      <ConfirmModal
        open={importPreviewOpen}
        title={t("modsModal.profiles.share.previewTitle")}
        message={(() => {
          const pack = importPreviewPack;
          if (!pack) return "";
          const mods = Array.isArray(pack.mods) ? pack.mods : [];
          const names = mods.map((m) => (m?.name || m?.fileName || (m?.modId ? `#${m.modId}` : "")) as string).filter(Boolean);
          const gvLabel = (pack.profile?.gameVersion?.label as string) || "";
          return (
            <Box>
              <Text fontSize="sm" color="gray.200">
                {t("modsModal.profiles.share.previewSummary", { name: String(pack.profile?.name || ""), count: names.length, gameVersion: gvLabel || "-" })}
              </Text>
              <Text mt={3} fontSize="xs" color="gray.400">{t("modsModal.profiles.share.previewMods", { count: names.length })}</Text>
              <Box mt={2} maxH="180px" overflowY="auto" pr={1} rounded="lg" border="1px solid" borderColor="whiteAlpha.100" bg="whiteAlpha.50">
                {names.length ? (
                  names.map((n, idx) => (
                    <Box key={`${idx}-${n}`} px={3} py={2} borderBottom="1px solid" borderColor="whiteAlpha.50" fontSize="11px" color="gray.200">{n}</Box>
                  ))
                ) : (
                  <Text px={3} py={2} fontSize="11px" color="gray.500">{t("modsModal.profiles.share.previewNoMods")}</Text>
                )}
              </Box>
            </Box>
          );
        })()}
        confirmText={t("modsModal.profiles.share.continue")}
        cancelText={t("common.cancel")}
        onCancel={() => { setImportPreviewOpen(false); setImportPreviewPack(null); }}
        onConfirm={() => {
          setImportPreviewOpen(false);
          const pack = importPreviewPack;
          setImportPreviewPack(null);
          if (!pack) return;
          void (async () => {
            setImporting(true);
            setImportError("");
            setImportNotice("");
            setImportCurrent(null);
            try {
              const dir = await ensureGameDir();
              const profileName = makeUniqueProfileName(String(pack.profile?.name || "Imported"));
              const mods = (Array.isArray(pack.mods) ? pack.mods : []).filter(Boolean);
              const downloadable = mods.filter((m) => m.source === "curseforge" && typeof m.modId === "number" && m.modId > 0);
              const installedBases: string[] = [];
              const errors: string[] = [];
              const manualMissing: string[] = mods.filter((m) => m.requiredManual).map((m) => (m?.name || m?.fileName || (m?.modId ? `#${m.modId}` : "")) as string).filter(Boolean);

              for (let i = 0; i < downloadable.length; i++) {
                const m = downloadable[i];
                const modId = Number(m.modId);
                const name = (m?.name || m?.fileName || `#${modId}`) as string;
                setImportCurrent({ idx: i + 1, total: downloadable.length, modId, name });
                setInstallingId(modId);
                const res = typeof m.fileId === "number" && m.fileId > 0
                  ? await window.config.modsInstallFile(modId, m.fileId, dir)
                  : await window.config.modsInstall(modId, dir);
                if (!res?.ok) { errors.push(`${name}: ${fmtErr(res, "modsModal.errors.downloadFailed")}`); continue; }
                const fileName = typeof res.fileName === "string" ? res.fileName : "";
                if (fileName) installedBases.push(baseName(fileName));
                if (m.sha256 && fileName) {
                  try {
                    const h = await window.config.modsFileHash(dir, fileName);
                    const got = h?.ok ? String(h.sha256 || "") : "";
                    const expected = String(m.sha256 || "").toLowerCase();
                    if (got && expected && got.toLowerCase() !== expected) {
                      const ok = await awaitIntegrityDecision(
                        t("modsModal.profiles.share.integrityTitle"),
                        <Box>
                          <Text fontSize="sm" color="gray.200">{t("modsModal.profiles.share.integrityMismatch", { name })}</Text>
                          <Text mt={2} fontSize="11px" color="gray.400" fontFamily="mono" wordBreak="break-all">{t("modsModal.profiles.share.integrityExpected", { hash: expected })}</Text>
                          <Text mt={1} fontSize="11px" color="gray.400" fontFamily="mono" wordBreak="break-all">{t("modsModal.profiles.share.integrityGot", { hash: got })}</Text>
                        </Box>,
                      );
                      if (!ok) { errors.push(`${name}: hash mismatch`); break; }
                    }
                  } catch { /* ignore hash errors */ }
                }
              }

              const uniqueBases = Array.from(new Set(installedBases)).filter(Boolean);
              const cf: Record<string, { modId: number; fileId?: number }> = {};
              for (const m of downloadable) {
                const modId = Number(m.modId);
                if (!Number.isFinite(modId) || modId <= 0) continue;
                const base = String(m?.name || "").trim();
                if (!base) continue;
                const key = base.toLowerCase();
                const entry: { modId: number; fileId?: number } = { modId };
                const fileId = Number((m as any)?.fileId);
                if (Number.isFinite(fileId) && fileId > 0) entry.fileId = fileId;
                cf[key] = entry;
              }

              const saveRes = await window.config.modsProfilesSave(dir, { name: profileName, mods: uniqueBases, cf });
              if (saveRes && (saveRes as any).ok === false) { throw new Error(fmtErr(saveRes, "modsModal.profiles.share.importFailed")); }
              await loadProfiles();
              setSelectedProfileName(profileName);
              setProfileSelectedMods(new Set(uniqueBases));
              setImportNotice(
                manualMissing.length
                  ? t("modsModal.profiles.share.importDoneManual", { profile: profileName, count: uniqueBases.length, manual: manualMissing.length })
                  : t("modsModal.profiles.share.importDone", { profile: profileName, count: uniqueBases.length }),
              );
              if (errors.length) { setImportError(t("modsModal.profiles.share.importSomeFailed", { count: errors.length })); }
              await loadInstalled();
              await loadRegistry(dir);
            } catch (e) {
              setImportError(e instanceof Error ? e.message : t("modsModal.profiles.share.importFailed"));
            } finally {
              setInstallingId(null);
              setImportCurrent(null);
              setImporting(false);
            }
          })();
        }}
      />

      <ConfirmModal
        open={deleteModPrompt.open}
        title={t("modsModal.installed.deleteConfirmTitle")}
        message={
          <Box>
            <Text fontSize="sm" color="gray.200">{t("modsModal.installed.deleteConfirmMsg", { name: deleteModPrompt.fileName })}</Text>
          </Box>
        }
        confirmText={t("common.delete")}
        cancelText={t("common.cancel")}
        onCancel={() => setDeleteModPrompt({ open: false, fileName: "" })}
        onConfirm={() => {
          void (async () => {
            if (!deleteModPrompt.fileName) return;
            try {
              setInstalledError("");
              setUpdatesWorking(true);
              const dir = await ensureGameDir();
              const res = await window.config.modsInstalledDelete(dir, deleteModPrompt.fileName);
              if (res && (res as any).ok === false) { setInstalledError(fmtErr(res, "modsModal.errors.unknown")); return; }
              setDeleteModPrompt({ open: false, fileName: "" });
              await loadInstalled(false);
            } catch (e) {
              setInstalledError(e instanceof Error ? e.message : t("modsModal.errors.unknown"));
            } finally {
              setUpdatesWorking(false);
            }
          })();
        }}
      />

      <ConfirmModal
        open={attachPrompt.open}
        title={t("modsModal.installed.attachToLauncher")}
        message={
          <Box>
            <Text fontSize="xs" color="gray.200" mb={2}>{t("modsModal.installed.attachLinkLabel")}</Text>
            <Input
              value={attachLinkInput}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => { const next = e.target.value; setAttachLinkInput(next); if (attachLinkError && isValidAttachLink(next)) setAttachLinkError(""); }}
              placeholder={t("modsModal.installed.attachLinkPlaceholder")}
              w="full"
              bg="whiteAlpha.50"
              border="1px solid"
              borderColor="whiteAlpha.100"
              color="white"
              fontSize="sm"
            />
            {attachLinkError ? <Text fontSize="11px" color="red.300" mt={2}>{attachLinkError}</Text> : null}
            <Text fontSize="11px" color="gray.500" mt={2}>{t("modsModal.installed.attachLinkExample")}: {ATTACH_LINK_EXAMPLE}</Text>
          </Box>
        }
        confirmText={t("common.confirm")}
        cancelText={t("common.cancel")}
        onCancel={() => { setAttachPrompt({ open: false, fileName: "" }); setAttachLinkInput(""); setAttachLinkError(""); }}
        onConfirm={() => {
          void (async () => {
            try {
              const dir = await ensureGameDir();
              const link = attachLinkInput.trim();
              if (!link) return;
              if (!isValidAttachLink(link)) { setAttachLinkError(t("modsModal.installed.attachLinkInvalid", { example: ATTACH_LINK_EXAMPLE })); return; }
              setInstalledError("");
              setUpdatesWorking(true);
              const res = await window.config.modsAttachManual(dir, attachPrompt.fileName, link);
              if (!res?.ok) {
                if ((res as any)?.errorKey) { setInstalledError(fmtErr(res, "modsModal.installed.attachFailed")); return; }
                const code = String((res as any)?.errorCode || "");
                if (code === "ATTACH_INVALID_LINK") setInstalledError(t("modsModal.installed.attachErrorInvalidLink", { example: ATTACH_LINK_EXAMPLE }));
                else if (code === "ATTACH_FILE_NOT_FOUND") setInstalledError(t("modsModal.installed.attachErrorFileNotFound"));
                else if (code === "ATTACH_MOD_NOT_FOUND") setInstalledError(t("modsModal.installed.attachErrorModNotFound", { example: ATTACH_LINK_EXAMPLE }));
                else if (code === "MODS_SERVICE_UNREACHABLE") setInstalledError(t("modsModal.installed.attachErrorService"));
                else setInstalledError((res as any)?.error || t("modsModal.installed.attachFailed"));
                return;
              }
              setAttachPrompt({ open: false, fileName: "" });
              setAttachLinkInput("");
              setAttachLinkError("");
              await loadInstalled(false);
            } catch (e) {
              setInstalledError(e instanceof Error ? e.message : t("modsModal.errors.unknown"));
            } finally {
              setUpdatesWorking(false);
            }
          })();
        }}
      />

      <ConfirmModal
        open={integrityPrompt.open}
        title={integrityPrompt.title}
        message={integrityPrompt.message}
        confirmText={t("modsModal.profiles.share.continue")}
        cancelText={t("common.cancel")}
        onCancel={() => { const resolve = integrityPrompt.resolve; setIntegrityPrompt({ open: false, title: "", message: "" }); resolve?.(false); }}
        onConfirm={() => { const resolve = integrityPrompt.resolve; setIntegrityPrompt({ open: false, title: "", message: "" }); resolve?.(true); }}
      />

      {tab === "profiles" && profileCtxMenu.open ? createPortal(
        <>
          <Box position="fixed" inset={0} zIndex={9999} onMouseDown={() => setProfileCtxMenu({ open: false, x: 0, y: 0, name: "" })} />
          <Box
            position="fixed"
            zIndex={10000}
            minW="180px"
            rounded="lg"
            border="1px solid"
            borderColor="rgba(255,255,255,0.08)"
            bg="rgba(13,17,32,0.97)"
            shadow="2xl"
            left={`${profileCtxMenu.x}px`}
            top={`${profileCtxMenu.y}px`}
            backdropFilter="blur(12px)"
            onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}
          >
            <Box
              as="button"
              w="full"
              textAlign="left"
              px={3}
              py={2}
              fontSize="xs"
              color="gray.200"
              cursor="pointer"
              rounded="lg"
              _hover={{ bg: "whiteAlpha.50" }}
              transition="all 0.15s"
              onClick={() => {
                const name = profileCtxMenu.name;
                setProfileCtxMenu({ open: false, x: 0, y: 0, name: "" });
                setRenameProfileError("");
                setRenameProfileInput(name);
                setRenameProfilePrompt({ open: true, oldName: name });
              }}
            >
              {t("modsModal.profiles.rename.menu")}
            </Box>
          </Box>
        </>,
        document.body
      ) : null}
    </Box>
  );
};

export default ModsPanel;
