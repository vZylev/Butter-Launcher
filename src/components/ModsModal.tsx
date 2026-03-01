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
import { useGameContext } from "../hooks/gameContext";
import cn from "../utils/cn";
import { sanitizeHtmlAllowImages } from "../utils/sanitize";
import { useTranslation } from "react-i18next";
import ConfirmModal from "./ConfirmModal";
import { decodeModPack, encodeModPack, type ModPackV1 } from "../utils/modPack";

type DiscoverMod = {
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

type BrowseSort =
  | "relevance"
  | "installedFirst"
  | "popularity"
  | "latestUpdate"
  | "creationDate"
  | "totalDownloads"
  | "az";

type ModDetails = {
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

type ModFileInfo = {
  id: number;
  displayName?: string;
  fileName?: string;
  fileDate?: string;
  releaseType?: number;
  downloadCount?: number;
  gameVersions?: string[];
};

type ModRegistryEntry = {
  modId: number;
  fileId?: number;
  fileName?: string;
  installedAt?: string;
};

type InstalledModFile = {
  fileName: string;
  enabled: boolean;
};

type InstalledSort =
  | "connectedToLauncher"
  | "installedManually"
  | "alphabetical"
  | "needsUpdate";

type ModProfile = {
  name: string;
  mods: string[]; // base names (no .disabled)
  cf?: Record<string, { modId: number; fileId?: number }>; // key: baseName.toLowerCase()
  // Yes, we store a tiny CF "memory" here so the UI can pretend it's smart.
};

const ModsModal: React.FC<{
  open: boolean;
  onClose: () => void;
}> = ({ open, onClose }) => {
  const { gameDir, availableVersions, selectedVersion, versionType } =
    useGameContext();
  const { t } = useTranslation();
  const [closing, setClosing] = useState(false);

  const scrollRootRef = useRef<HTMLDivElement | null>(null);
  const discoverLoadMoreSentinelRef = useRef<HTMLDivElement | null>(null);
  const discoverAutoLoadInFlightRef = useRef(false);

  const [tab, setTab] = useState<"discover" | "installed" | "profiles">(
    "discover",
  );
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<BrowseSort>("popularity");
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

  const sortDiscoverInstalledFirst = (mods: DiscoverMod[]) => {
    // Stable sort based on current order.
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

  const close = () => {
    setClosing(true);
    setTimeout(() => {
      setClosing(false);
      onClose();
    }, 160);
  };

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

  const formatModsError = (
    res: any,
    fallbackKey: string,
    fallbackArgs?: Record<string, any>,
  ) => {
    if (res?.errorKey) return t(String(res.errorKey), res.errorArgs ?? {});
    const raw = typeof res?.error === "string" ? res.error.trim() : "";
    if (raw) return raw;
    return t(fallbackKey, fallbackArgs ?? {});
  };

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
        throw new Error(formatModsError(res, "modsModal.errors.loadModsFailed"));
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
          ? sortDiscoverInstalledFirst(combined)
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
    if (!open) return;
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
  }, [open, tab, detailsId, hasMore, discoverLoading, query, sort]);

  useEffect(() => {
    if (sort !== "installedFirst") return;
    setDiscoverMods((prev) => sortDiscoverInstalledFirst(prev));
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
          formatModsError(res, "modsModal.errors.loadModDetailsFailed"),
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
          formatModsError(res, "modsModal.errors.loadInstalledModsFailed"),
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
          formatModsError(res, "modsModal.errors.loadModsRegistryFailed"),
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
          formatModsError(res, "modsModal.errors.loadProfilesFailed"),
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
    if (!open) return;

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
  }, [open, tab]);

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
    if (!open) return;
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
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (tab === "profiles") {
      void loadProfiles();
    }
  }, [open, tab]);

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
    if (!open) return;
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

  const tabButtonClass = (active: boolean) =>
    cn(
      "px-3 py-1.5 rounded-lg border text-xs font-semibold transition",
      "border-[#2a3146]",
      active
        ? "bg-[#0ea5ff]/20 text-[#b8f1ff] border-[#35c9ff]/60 shadow-[0_0_16px_rgba(14,165,255,0.55)]"
        : "bg-transparent text-gray-200 hover:bg-[#0ea5ff]/10 hover:text-white",
    );

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

  if (!open && !closing) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center glass-backdrop animate-fade-in">
      {imageViewer.open
        ? createPortal(
            <div
              className="fixed inset-0 z-[10060] glass-backdrop flex items-center justify-center p-6"
              onClick={() => closeImageViewer()}
              role="dialog"
              aria-modal="true"
              aria-label="Image viewer"
            >
              <button
                type="button"
                className="absolute top-4 right-4 w-9 h-9 rounded-full border border-white/10 bg-[#141824]/80 text-gray-200 hover:text-white hover:bg-[#23293a] transition flex items-center justify-center"
                onClick={(e) => {
                  e.stopPropagation();
                  closeImageViewer();
                }}
                title={t("common.close")}
              >
                <IconX size={18} />
              </button>

              <div
                className="max-w-[92vw] max-h-[88vh] overflow-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <img
                  src={imageViewer.src}
                  alt={imageViewer.alt || "Image"}
                  ref={imageViewerImgRef}
                  className={cn(
                    "block rounded-xl border border-white/10 bg-white/5 shadow-2xl",
                    imageViewer.zoomed ? "cursor-zoom-out" : "cursor-zoom-in",
                  )}
                  style={
                    imageViewer.zoomed
                      ? {
                          // Real zoom: increase the rendered dimensions so scroll can reach edges.
                          width: imageViewerZoomDims
                            ? `${imageViewerZoomDims.w}px`
                            : "184vw",
                          height: imageViewerZoomDims
                            ? `${imageViewerZoomDims.h}px`
                            : "auto",
                          maxWidth: "none",
                          maxHeight: "none",
                          objectFit: "contain",
                          transition: "width 120ms ease, height 120ms ease",
                        }
                      : {
                          maxWidth: "92vw",
                          maxHeight: "88vh",
                          objectFit: "contain",
                          transition: "width 120ms ease, height 120ms ease",
                        }
                  }
                  // Click to zoom. Click again to un-zoom. The UX equivalent of a light switch.
                  onClick={() => {
                    setImageViewer((v) => {
                      if (!v.zoomed) {
                        const rect =
                          imageViewerImgRef.current?.getBoundingClientRect();
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
              </div>
            </div>,
            document.body,
          )
        : null}

      <div
        className={cn(
          `
          relative w-[92vw] max-w-[2200px] h-[88vh] mx-auto
          rounded-xl
          bg-linear-to-b from-[#1b2030]/95 to-[#141824]/95
          border border-[#2a3146]
          shadow-2xl
          px-10 py-6
          flex flex-col animate-settings-in`,
          closing && "animate-settings-out",
        )}
      >
        <button
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-[#23293a] text-gray-400 hover:text-white hover:bg-[#2f3650] transition flex items-center justify-center"
          onClick={close}
          title={t("common.close")}
        >
          <IconX size={18} />
        </button>

        <div className="flex items-center justify-between gap-3 mb-4 pr-12">
          <h2 className="text-lg font-semibold text-white tracking-wide">
            {t("modsModal.title")}
          </h2>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className={tabButtonClass(tab === "discover")}
              onClick={() => setTab("discover")}
            >
              {t("modsModal.tabs.discover")}
            </button>
            <button
              type="button"
              className={tabButtonClass(tab === "installed")}
              onClick={() => {
                setTab("installed");
                void loadInstalled();
                void loadRegistry();
              }}
            >
              {t("modsModal.tabs.installed")}
            </button>

            <button
              type="button"
              className={tabButtonClass(tab === "profiles")}
              onClick={() => {
                setTab("profiles");
                void loadProfiles();
                void loadInstalled();
                void loadRegistry();
              }}
            >
              {t("modsModal.tabs.profiles")}
            </button>
          </div>
        </div>

        {/* Profiles gets its own inner scroll containers so Apply/Delete don't vanish into the void. */}
        <div
          className={cn(
            "flex-1 min-h-0 pr-2",
            tab !== "profiles" && "overflow-y-auto",
          )}
          ref={scrollRootRef}
        >
          {tab === "discover" ? (
            <div className="rounded-lg border border-[#2a3146] bg-[#1f2538]/70 p-3">
              <div className="flex items-center gap-2 mb-3">
                {detailsId != null ? (
                  <button
                    type="button"
                    className={cn(
                      "px-3 py-2 rounded-lg border border-[#2a3146]",
                      "bg-[#23293a] hover:bg-[#2f3650] text-white transition flex items-center gap-2",
                    )}
                    onClick={() => {
                      setDetailsId(null);
                      setDetailsError("");
                      setDetailsMod(null);
                      setDetailsHtml("");
                      setDetailsFiles([]);
                    }}
                    title={t("common.back")}
                  >
                    <IconArrowLeft size={18} />
                    {t("common.back")}
                  </button>
                ) : null}

                <div className="flex-1 relative">
                  <IconSearch
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                  />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        void loadDiscover({
                          reset: true,
                          q: query.trim(),
                          sort,
                        });
                        setDetailsId(null);
                      }
                    }}
                    placeholder={t("modsModal.searchPlaceholder")}
                    className="w-full pl-9 pr-3 py-2 rounded-lg bg-[#141824]/80 border border-[#2a3146] text-white text-sm outline-none focus:border-blue-400/60"
                    disabled={discoverLoading}
                  />
                </div>

                <select
                  value={sort}
                  onChange={(e) => {
                    const next = e.target.value as BrowseSort;
                    setSort(next);
                    setDetailsId(null);
                    void loadDiscover({
                      reset: true,
                      q: query.trim(),
                      sort: next,
                    });
                  }}
                  className="px-3 py-2 rounded-lg bg-[#141824]/80 border border-[#2a3146] text-white text-sm outline-none focus:border-blue-400/60"
                  title={t("common.sortBy")}
                >
                  <option value="installedFirst">
                    {t("modsModal.sort.installedFirst")}
                  </option>
                  <option value="relevance">
                    {t("modsModal.sort.relevance")}
                  </option>
                  <option value="popularity">
                    {t("modsModal.sort.popularity")}
                  </option>
                  <option value="latestUpdate">
                    {t("modsModal.sort.latestUpdate")}
                  </option>
                  <option value="creationDate">
                    {t("modsModal.sort.creationDate")}
                  </option>
                  <option value="totalDownloads">
                    {t("modsModal.sort.totalDownloads")}
                  </option>
                  <option value="az">{t("modsModal.sort.az")}</option>
                </select>

                <button
                  type="button"
                  className={cn(
                    "px-3 py-2 rounded-lg border border-[#2a3146]",
                    "bg-[#23293a] hover:bg-[#2f3650] text-white transition",
                    discoverLoading && "opacity-60 cursor-not-allowed",
                  )}
                  onClick={() => {
                    setDetailsId(null);
                    void loadDiscover({ reset: true, q: query.trim(), sort });
                  }}
                  disabled={discoverLoading}
                  title={t("common.search")}
                >
                  <IconRefresh size={18} />
                </button>

                <button
                  type="button"
                  className={cn(
                    "px-3 py-2 rounded-lg border border-[#2a3146]",
                    "bg-transparent hover:bg-white/5 text-gray-200 transition flex items-center gap-2",
                  )}
                  onClick={() => void handleOpenModsFolder()}
                  title={t("modsModal.openModsFolder")}
                >
                  <IconFolderOpen size={18} />
                  {t("common.folder")}
                </button>
              </div>

              {discoverError ? (
                <div className="text-xs text-red-300 mb-2">{discoverError}</div>
              ) : null}

              {registryError ? (
                <div className="text-xs text-red-300 mb-2">{registryError}</div>
              ) : null}

              {detailsId != null ? (
                <div className="rounded-lg border border-[#2a3146] bg-[#141824]/60 p-3">
                  {detailsError ? (
                    <div className="text-xs text-red-300 mb-2">
                      {detailsError}
                    </div>
                  ) : null}

                  {detailsLoading && !detailsMod ? (
                    <div className="text-xs text-gray-300">
                      {t("modsModal.details.loadingDetails")}
                    </div>
                  ) : detailsMod ? (
                    <div className="flex flex-col gap-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-lg font-semibold text-white leading-tight">
                            {detailsMod.name}
                          </div>
                          <div className="text-xs text-gray-100 mt-1">
                            {detailsMod.summary}
                          </div>
                          <div className="text-[11px] text-gray-200 mt-1">
                            {(detailsMod.author ?? "") || ""}
                          </div>

                          <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                            {detailsMod.downloadCount != null ? (
                              <span className="px-2 py-1 rounded-md border border-white/10 bg-white/5 text-gray-200">
                                {t("modsModal.details.downloads", {
                                  value: formatNumber(detailsMod.downloadCount),
                                })}
                              </span>
                            ) : null}
                            {detailsMod.dateCreated ? (
                              <span className="px-2 py-1 rounded-md border border-white/10 bg-white/5 text-gray-200">
                                {t("modsModal.details.created", {
                                  date: formatDate(detailsMod.dateCreated),
                                })}
                              </span>
                            ) : null}
                            {detailsMod.dateModified ? (
                              <span className="px-2 py-1 rounded-md border border-white/10 bg-white/5 text-gray-200">
                                {t("modsModal.details.updated", {
                                  date: formatDate(detailsMod.dateModified),
                                })}
                              </span>
                            ) : null}
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-2">
                          {(() => {
                            const stableId =
                              detailsFiles.find(
                                (f) => Number(f?.releaseType) === 1,
                              )?.id ?? detailsFiles?.[0]?.id;
                            const status = getInstallStatus(
                              detailsMod.id,
                              stableId,
                            ).state;
                            return (
                              <button
                                type="button"
                                className={cn(
                                  "px-3 py-2 rounded-lg border border-blue-400/30",
                                  "bg-[linear-gradient(90deg,#0268D4_0%,#02D4D4_100%)] bg-[length:100%_100%] bg-no-repeat bg-left",
                                  "text-white text-sm font-bold",
                                  "hover:shadow-[0_0_18px_rgba(2,104,212,0.85)] transition",
                                  (installingId === detailsMod.id ||
                                    status === "installed") &&
                                    "opacity-70 cursor-not-allowed",
                                )}
                                onClick={() => {
                                  if (status === "installed") return;
                                  void (async () => {
                                    try {
                                      const dir = await ensureGameDir();
                                      setInstallingId(detailsMod.id);
                                      // Default install always downloads latest stable.
                                      await window.config.modsInstall(
                                        detailsMod.id,
                                        dir,
                                      );
                                    } catch {
                                      setInstallingId(null);
                                    }
                                  })();
                                }}
                                disabled={
                                  installingId === detailsMod.id ||
                                  status === "installed"
                                }
                                title={t("modsModal.actions.install")}
                              >
                                <span className="inline-flex items-center gap-2">
                                  <IconDownload size={18} />
                                  {installingId === detailsMod.id
                                    ? t("modsModal.status.installing")
                                    : status === "installed"
                                      ? t("modsModal.actions.installed")
                                      : status === "update"
                                        ? t("modsModal.actions.update")
                                        : t("modsModal.actions.install")}
                                </span>
                              </button>
                            );
                          })()}
                          {installingId === detailsMod.id ? (
                            <div className="text-[11px] text-gray-300">
                              {(() => {
                                const p = downloadProgress[detailsMod.id];
                                if (!p)
                                  return t("modsModal.status.downloading");
                                const pct = p.total
                                  ? Math.floor((p.received / p.total) * 100)
                                  : null;
                                return pct != null
                                  ? t("modsModal.status.downloadingPct", {
                                      pct,
                                    })
                                  : t("modsModal.status.downloadingKb", {
                                      kb: Math.floor(p.received / 1024),
                                    });
                              })()}
                            </div>
                          ) : null}
                        </div>
                      </div>

                      {detailsMod.logoUrl ? (
                        <img
                          src={detailsMod.logoUrl}
                          alt={detailsMod.name}
                          className="w-full max-h-[220px] object-cover rounded-lg border border-white/10 bg-white/5 cursor-zoom-in"
                          loading="lazy"
                          // Clickable because users will click it anyway.
                          onClick={() =>
                            openImageViewer(
                              detailsMod.logoUrl!,
                              detailsMod.name,
                            )
                          }
                        />
                      ) : null}

                      {Array.isArray(detailsMod.screenshots) &&
                      detailsMod.screenshots.length ? (
                        <div className="grid grid-cols-3 gap-2">
                          {detailsMod.screenshots.slice(0, 6).map((s, idx) => {
                            const src = s.thumbnailUrl || s.url;
                            if (!src) return null;
                            return (
                              <img
                                key={`${detailsMod.id}-shot-${idx}`}
                                src={src}
                                alt={s.title || `Screenshot ${idx + 1}`}
                                className="w-full h-[90px] object-cover rounded-lg border border-white/10 bg-white/5 cursor-zoom-in"
                                loading="lazy"
                                // Thumbnail click opens the full image. Revolutionary.
                                onClick={() =>
                                  openImageViewer(
                                    s.url || src,
                                    s.title || `Screenshot ${idx + 1}`,
                                  )
                                }
                              />
                            );
                          })}
                        </div>
                      ) : null}

                      <div className="rounded-lg border border-[#2a3146] bg-[#0f1422]/70 p-3">
                        <div className="text-sm text-white font-semibold mb-2">
                          {t("modsModal.details.description")}
                        </div>
                        {detailsLoading && !detailsHtml ? (
                          <div className="text-xs text-gray-100">
                            {t("modsModal.details.loadingDescription")}
                          </div>
                        ) : detailsHtml ? (
                          <div
                            className={cn(
                              "prose prose-invert max-w-none",
                              "text-white",
                              "prose-headings:text-white prose-p:text-gray-100 prose-li:text-gray-100",
                              "prose-strong:text-white prose-em:text-gray-100",
                              "prose-a:no-underline prose-a:text-[#8ad8ff] prose-a:hover:text-white",
                              "prose-code:text-gray-100 prose-pre:bg-[#0b1020] prose-pre:border prose-pre:border-white/10",
                              "prose-img:rounded-lg prose-img:border prose-img:border-white/10",
                            )}
                            onClick={(e) => {
                              const target = e.target as HTMLElement | null;
                              if (!target) return;
                              if (target.tagName !== "IMG") return;
                              const img = target as HTMLImageElement;
                              const src = img.currentSrc || img.src;
                              if (!src) return;
                              // Yes, we're event-delegating inside dangerouslySetInnerHTML. It's fine. Probably.
                              openImageViewer(src, img.alt || undefined);
                            }}
                            dangerouslySetInnerHTML={{ __html: detailsHtml }}
                          />
                        ) : (
                          <div className="text-xs text-gray-200">
                            {t("modsModal.details.noDescription")}
                          </div>
                        )}
                      </div>

                      <div className="rounded-lg border border-[#2a3146] bg-[#0f1422]/70 p-3">
                        <div className="text-sm text-white font-semibold mb-2">
                          {t("modsModal.details.files")}
                        </div>
                        {detailsLoading && !detailsFiles.length ? (
                          <div className="text-xs text-gray-300">
                            {t("modsModal.details.loadingFiles")}
                          </div>
                        ) : detailsFiles.length ? (
                          <div className="space-y-2">
                            {detailsFiles.slice(0, 20).map((f) => (
                              <div
                                key={f.id}
                                className="flex items-start justify-between gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2"
                              >
                                <div className="min-w-0">
                                  <div className="text-xs text-white font-semibold truncate">
                                    {f.displayName ||
                                      f.fileName ||
                                      `File #${f.id}`}
                                  </div>
                                  <div className="text-[11px] text-gray-400 mt-0.5">
                                    {f.fileDate
                                      ? t("modsModal.details.updatedShort", {
                                          date: formatDate(f.fileDate),
                                        })
                                      : ""}
                                    {typeof f.downloadCount === "number"
                                      ? ` • ${t("modsModal.details.downloads", {
                                          value: formatNumber(f.downloadCount),
                                        })}`
                                      : ""}
                                  </div>
                                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px]">
                                    {typeof f.releaseType === "number" ? (
                                      <span
                                        className={cn(
                                          "px-2 py-0.5 rounded-md border border-white/10 bg-white/5",
                                          Number(f.releaseType) === 1
                                            ? "text-green-200"
                                            : Number(f.releaseType) === 2
                                              ? "text-yellow-200"
                                              : "text-red-200",
                                        )}
                                      >
                                        {Number(f.releaseType) === 1
                                          ? t("modsModal.releaseType.stable")
                                          : Number(f.releaseType) === 2
                                            ? t("modsModal.releaseType.beta")
                                            : t("modsModal.releaseType.alpha")}
                                      </span>
                                    ) : null}

                                    {Array.isArray(f.gameVersions) &&
                                    f.gameVersions.length ? (
                                      <span className="text-gray-200 line-clamp-1">
                                        {f.gameVersions.slice(0, 6).join(", ")}
                                      </span>
                                    ) : null}
                                  </div>
                                </div>

                                <div className="shrink-0 flex flex-col items-end gap-2">
                                  {(() => {
                                    const entry =
                                      registryByModId[detailsMod.id];
                                    const installedFileId =
                                      typeof entry?.fileId === "number"
                                        ? entry.fileId
                                        : undefined;
                                    const isInstalledThisFile =
                                      installedFileId != null &&
                                      installedFileId === f.id;
                                    return (
                                      <button
                                        type="button"
                                        className={cn(
                                          "px-3 py-1.5 rounded-lg border border-blue-400/30",
                                          "bg-[linear-gradient(90deg,#0268D4_0%,#02D4D4_100%)] bg-[length:100%_100%] bg-no-repeat bg-left",
                                          "text-white text-xs font-bold",
                                          "hover:shadow-[0_0_18px_rgba(2,104,212,0.85)] transition",
                                          (installingId === detailsMod.id ||
                                            isInstalledThisFile) &&
                                            "opacity-70 cursor-not-allowed",
                                        )}
                                        disabled={
                                          installingId === detailsMod.id ||
                                          isInstalledThisFile
                                        }
                                        onClick={() => {
                                          if (isInstalledThisFile) return;
                                          void (async () => {
                                            try {
                                              const dir = await ensureGameDir();
                                              setInstallingId(detailsMod.id);
                                              await window.config.modsInstallFile(
                                                detailsMod.id,
                                                f.id,
                                                dir,
                                              );
                                            } catch {
                                              setInstallingId(null);
                                            }
                                          })();
                                        }}
                                        title={t(
                                          "modsModal.details.installThisFile",
                                        )}
                                      >
                                        {isInstalledThisFile
                                          ? t("modsModal.actions.installed")
                                          : t("modsModal.actions.install")}
                                      </button>
                                    );
                                  })()}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-xs text-gray-400">
                            {t("modsModal.details.noFilesReturned")}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-gray-300">
                      {t("modsModal.details.selectModForDetails")}
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div className="text-[11px] text-gray-400 mb-2">
                    {totalCount != null
                      ? t("modsModal.details.results", {
                          value: formatNumber(totalCount),
                        })
                      : ""}
                  </div>

                  <div className="pr-1">
                    {discoverLoading && !discoverMods.length ? (
                      <div className="text-xs text-gray-100">
                        {t("common.loading")}
                      </div>
                    ) : discoverMods.length ? (
                      <div className="grid grid-cols-3 gap-3">
                        {discoverMods.map((m) => {
                          const installing = installingId === m.id;
                          const p = downloadProgress[m.id];
                          const pct = p?.total
                            ? Math.floor((p.received / p.total) * 100)
                            : null;
                          const status = getInstallStatus(
                            m.id,
                            m.latestFileId,
                          ).state;
                          const actionLabel =
                            status === "installed"
                              ? t("modsModal.actions.installed")
                              : status === "update"
                                ? t("modsModal.actions.update")
                                : t("modsModal.actions.install");

                          return (
                            <button
                              key={m.id}
                              type="button"
                              className={cn(
                                "text-left rounded-xl border border-[#2a3146] bg-[#141824]/60",
                                "hover:bg-[#141824]/80 hover:border-[#35c9ff]/30 transition",
                                "p-3 flex flex-col gap-2",
                              )}
                              onClick={() => {
                                setDetailsId(m.id);
                                void loadDetails(m.id);
                              }}
                            >
                              <div className="flex items-start gap-3">
                                {m.logoThumbnailUrl ? (
                                  <img
                                    src={m.logoThumbnailUrl}
                                    alt={m.name}
                                    className="w-12 h-12 rounded-lg object-cover border border-white/10 bg-white/5 shrink-0"
                                    loading="lazy"
                                    onError={(e) => {
                                      (
                                        e.currentTarget as HTMLImageElement
                                      ).style.display = "none";
                                    }}
                                  />
                                ) : (
                                  <div className="w-12 h-12 rounded-lg bg-[#23293a] border border-white/10 shrink-0" />
                                )}

                                <div className="min-w-0 flex-1">
                                  <div className="text-sm font-semibold text-white leading-tight line-clamp-1">
                                    {m.name}
                                  </div>
                                  <div className="text-[11px] text-gray-100 line-clamp-2 mt-0.5">
                                    {m.summary}
                                  </div>
                                  <div className="text-[10px] text-gray-200 mt-1 line-clamp-1">
                                    {m.author}
                                    {m.latestVersionName
                                      ? ` • ${m.latestVersionName}`
                                      : ""}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center justify-between gap-2 mt-1">
                                <div className="text-[10px] text-gray-400">
                                  {typeof m.downloadCount === "number"
                                    ? t("modsModal.details.downloads", {
                                        value: formatNumber(m.downloadCount),
                                      })
                                    : ""}
                                  {m.dateModified
                                    ? ` • ${t(
                                        "modsModal.details.updatedShort",
                                        {
                                          date: formatDate(m.dateModified),
                                        },
                                      )}`
                                    : ""}
                                </div>

                                <button
                                  type="button"
                                  className={cn(
                                    "px-3 py-1.5 rounded-lg border border-blue-400/30",
                                    "bg-[linear-gradient(90deg,#0268D4_0%,#02D4D4_100%)] bg-[length:100%_100%] bg-no-repeat bg-left",
                                    "text-white text-xs font-bold",
                                    "hover:shadow-[0_0_18px_rgba(2,104,212,0.85)] transition",
                                    (installing || status === "installed") &&
                                      "opacity-70 cursor-not-allowed",
                                  )}
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    if (status === "installed") return;
                                    void (async () => {
                                      try {
                                        const dir = await ensureGameDir();
                                        setInstallingId(m.id);
                                        await window.config.modsInstall(
                                          m.id,
                                          dir,
                                        );
                                      } catch {
                                        setInstallingId(null);
                                      }
                                    })();
                                  }}
                                  disabled={
                                    installing || status === "installed"
                                  }
                                  title={t("modsModal.actions.install")}
                                >
                                  {installing
                                    ? t("modsModal.status.installing")
                                    : actionLabel}
                                </button>
                              </div>

                              {installing ? (
                                <div className="text-[10px] text-gray-300">
                                  {pct != null
                                    ? t("modsModal.status.downloadingPct", {
                                        pct,
                                      })
                                    : t("modsModal.status.downloading")}
                                </div>
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-xs text-gray-100">
                        {t("modsModal.noModsFound")}
                      </div>
                    )}
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-2">
                    <div className="text-[11px] text-gray-400">
                      {totalCount != null
                        ? t("modsModal.details.loadedOf", {
                            loaded: formatNumber(
                              Math.min(discoverMods.length, totalCount),
                            ),
                            total: formatNumber(totalCount),
                          })
                        : discoverMods.length
                          ? t("modsModal.details.loaded", {
                              loaded: formatNumber(discoverMods.length),
                            })
                          : ""}
                    </div>
                    <div className="text-[11px] text-gray-400">
                      {discoverLoading && hasMore && discoverMods.length
                        ? t("common.loading")
                        : ""}
                    </div>
                  </div>

                  <div ref={discoverLoadMoreSentinelRef} className="h-1 w-full" />
                </>
              )}
            </div>
          ) :  tab === "installed" ? (
  <div className="rounded-lg border border-[#2a3146] bg-[#1f2538]/70 p-4">
    {/* Contenedor de botones principales centrado */}
    <div className="flex items-center justify-center gap-3 mb-2 w-full">
      <div className="flex items-center justify-center gap-2 flex-wrap">
        <button
          type="button"
          className={cn(
            "px-3 py-2 rounded-lg border border-[#2a3146]",
            "bg-transparent hover:bg-white/5 text-gray-200 transition",
            (installedLoading || updatesWorking) &&
              "opacity-60 cursor-not-allowed",
          )}
          onClick={() => {
            void (async () => {
              try {
                setUpdatesWorking(true);
                setInstalledError("");
                const dir = await ensureGameDir();
                if (checkedAllOnce) {
                  const res = await window.config.modsUpdateAll(dir);
                  if (res && (res as any).ok === false) {
                    setInstalledError(
                      formatModsError(
                        res,
                        "modsModal.installed.updateFailed",
                      ),
                    );
                  }
                  setCheckedUpdatesByModId({});
                  await loadInstalled(false);
                } else {
                  const res = await window.config.modsCheckUpdatesAll(
                    dir,
                  );
                  if (res && (res as any).ok === false) {
                    setInstalledError(
                      formatModsError(
                        res,
                        "modsModal.installed.checkFailed",
                      ),
                    );
                    return;
                  }

                  const results = Array.isArray(
                    (res as any).results,
                  )
                    ? ((res as any).results as Array<any>)
                    : [];

                  const next: Record<
                    number,
                    {
                      updateAvailable: boolean;
                      latestFileId: number | null;
                      latestName: string;
                    }
                  > = {};
                  for (const r of results) {
                    const id = Number(r?.modId);
                    if (!Number.isFinite(id) || id <= 0) continue;
                    next[id] = {
                      updateAvailable: !!r?.updateAvailable,
                      latestFileId:
                        typeof r?.latestFileId === "number"
                          ? r.latestFileId
                          : null,
                      latestName:
                        typeof r?.latestName === "string"
                          ? r.latestName
                          : "",
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
          disabled={installedLoading || updatesWorking}
          title={t("modsModal.installed.checkUpdates")}
        >
          {checkedAllOnce
            ? t("modsModal.installed.updateAll")
            : t("modsModal.installed.checkUpdates")}
        </button>

        <button
          type="button"
          className={cn(
            "px-3 py-2 rounded-lg border border-[#2a3146]",
            "bg-[#23293a] hover:bg-[#2f3650] text-white transition",
            installedLoading && "opacity-60 cursor-not-allowed",
          )}
          onClick={() => {
            void (async () => {
              try {
                const dir = await ensureGameDir();
                const res = await window.config.modsInstalledSetAll(
                  dir,
                  true,
                );
                if (res && (res as any).ok === false) {
                  setInstalledError(
                    formatModsError(
                      res,
                      "modsModal.errors.unknown",
                    ),
                  );
                  return;
                }
                await loadInstalled();
              } catch {
                // ignore
              }
            })();
          }}
          disabled={installedLoading}
          title={t("modsModal.installed.enableAll")}
        >
          {t("modsModal.installed.enableAll")}
        </button>

        <button
          type="button"
          className={cn(
            "px-3 py-2 rounded-lg border border-[#2a3146]",
            "bg-transparent hover:bg-white/5 text-gray-200 transition",
            installedLoading && "opacity-60 cursor-not-allowed",
          )}
          onClick={() => {
            void (async () => {
              try {
                const dir = await ensureGameDir();
                const res = await window.config.modsInstalledSetAll(
                  dir,
                  false,
                );
                if (res && (res as any).ok === false) {
                  setInstalledError(
                    formatModsError(
                      res,
                      "modsModal.errors.unknown",
                    ),
                  );
                  return;
                }
                await loadInstalled();
              } catch {
                // ignore
              }
            })();
          }}
          disabled={installedLoading}
          title={t("modsModal.installed.disableAll")}
        >
          {t("modsModal.installed.disableAll")}
        </button>

        <button
          type="button"
          className={cn(
            "px-3 py-2 rounded-lg border border-[#2a3146]",
            "bg-[#23293a] hover:bg-[#2f3650] text-white transition flex items-center gap-2",
            installedLoading && "opacity-60 cursor-not-allowed",
          )}
          onClick={() => void loadInstalled()}
          disabled={installedLoading}
          title={t("common.refresh")}
        >
          <IconRefresh size={18} />
          {t("common.refresh")}
        </button>
        <button
          type="button"
          className="px-3 py-2 rounded-lg border border-[#2a3146] bg-transparent hover:bg-white/5 text-gray-200 transition flex items-center gap-2"
          onClick={() => void handleOpenModsFolder()}
        >
          <IconFolderOpen size={18} />
          {t("modsModal.installed.openFolder")}
        </button>
      </div>
    </div>

    <div className="text-[11px] text-gray-400 overflow-x-auto whitespace-nowrap mt-2">
      {t("modsModal.installed.counts", {
        downloaded: formatNumber(installedItems.length),
        active: formatNumber(
          installedItems.reduce(
            (n, it) => n + (it?.enabled ? 1 : 0),
            0,
          ),
        ),
      })}
    </div>

    <div
      className="text-[11px] text-gray-400 overflow-x-auto whitespace-nowrap select-text"
      title={modsDir || ""}
    >
      {modsDir || ""}
    </div>

    {installedError ? (
      <div className="text-xs text-red-300 mb-2">
        {installedError}
      </div>
    ) : null}

    {/* Separador de Ordenamiento con Opciones */}
    <div className="flex items-center gap-4 px-2 mt-4 mb-2 text-sm border-b border-white/5 pb-2">
      <span className="text-gray-400 font-medium">{t("common.sortBy")}:</span>
      
      <div className="flex items-center gap-3 overflow-x-auto whitespace-nowrap">
        {[
          { id: "connectedToLauncher", label: t("modsModal.installed.sort.connectedToLauncher") },
          { id: "installedManually", label: t("modsModal.installed.sort.installedManually") },
          { id: "alphabetical", label: t("modsModal.installed.sort.alphabetical") },
          { id: "needsUpdate", label: t("modsModal.installed.sort.needsUpdate") },
        ].map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => setInstalledSort(opt.id as InstalledSort)}
            disabled={installedLoading}
            className={cn(
              "transition-colors outline-none",
              installedSort === opt.id 
                ? "text-blue-400 font-semibold" 
                : "text-gray-500 hover:text-gray-300"
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setInstalledSortAsc((v) => !v)}
        disabled={installedLoading}
        // AQUÍ ESTÁ EL CAMBIO: text-blue-400 y hover:text-blue-300
        className="ml-auto flex items-center justify-center rounded-md text-blue-400 hover:text-blue-300 hover:bg-white/5 transition outline-none text-xl px-2"
        title={installedSortAsc ? t("common.ascending") : t("common.descending")}
      >
        {installedSortAsc ? "↑" : "↓"}
      </button>
    </div>

    <div className="pr-1 rounded-lg border border-[#2a3146] bg-[#141824]/60">
      {installedLoading ? (
        <div className="p-3 text-xs text-gray-100">
          {t("common.loading")}
        </div>
      ) : sortedInstalledItems.length ? (
        sortedInstalledItems.map((it) => (
          (() => {
            const base = baseName(it.fileName).trim();
            const reg = base
              ? registryByBaseName.get(base.toLowerCase()) ?? null
              : null;
            const managedModId = reg?.modId;
            const isManual = !reg;

            const canCheckUpdate =
              typeof managedModId === "number" &&
              Number.isFinite(managedModId) &&
              managedModId > 0;

            const checked =
              typeof managedModId === "number"
                ? checkedUpdatesByModId[managedModId]
                : undefined;

            return (
              <div
                key={it.fileName}
                className="flex items-center justify-between gap-3 px-3 py-2 border-b border-white/5"
              >
                <div className="min-w-0">
                  <div className="text-xs text-white truncate">
                    {it.fileName}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2">
                    <div
                      className={cn(
                        "px-2 py-0.5 rounded-full border text-[10px] font-semibold",
                        it.enabled
                          ? "border-green-400/30 bg-green-500/10 text-green-200"
                          : "border-gray-500/30 bg-white/5 text-gray-300",
                      )}
                    >
                      {it.enabled ? t("common.enabled") : t("common.disabled")}
                    </div>

                    {isManual ? (
                      <div className="text-[10px] text-yellow-300">
                        {t("modsModal.installed.installedManually")}
                      </div>
                    ) : null}
                  </div>

                  {!isManual && checked?.updateAvailable ? (
                    <div className="text-[10px] text-gray-400 mt-0.5 truncate">
                      {t("modsModal.installed.latestVersion")}: {checked.latestName || ""}
                    </div>
                  ) : null}
                </div>

                <div className="flex items-center gap-2">
                  {isManual ? (
                    <button
                      type="button"
                      className={cn(
                        "px-3 py-1.5 rounded-lg border border-[#2a3146] text-xs",
                        "bg-transparent hover:bg-white/5 text-yellow-100 transition",
                      )}
                      onClick={() => openAttachPrompt(it.fileName)}
                      title={t("modsModal.installed.attachToLauncher")}
                    >
                      {t("modsModal.installed.attachToLauncher")}
                    </button>
                  ) : canCheckUpdate ? (
                    <button
                      type="button"
                      className={cn(
                        "px-3 py-1.5 rounded-lg border border-[#2a3146] text-xs",
                        "bg-transparent hover:bg-white/5 text-gray-200 transition",
                        (updatesWorking || installingId === managedModId) &&
                          "opacity-60 cursor-not-allowed",
                      )}
                      disabled={updatesWorking || installingId === managedModId}
                      onClick={() => {
                        void (async () => {
                          try {
                            setUpdatesWorking(true);
                            setInstalledError("");
                            const dir = await ensureGameDir();
                            if (checked?.updateAvailable) {
                              setInstallingId(managedModId);
                              const res = await window.config.modsUpdateOne(
                                dir,
                                managedModId,
                              );
                              if (res && (res as any).ok === false) {
                                setInstalledError(
                                  formatModsError(
                                    res,
                                    "modsModal.installed.updateFailed",
                                  ),
                                );
                              }
                              setCheckedUpdatesByModId((prev) => {
                                const copy = { ...prev };
                                delete copy[managedModId];
                                return copy;
                              });
                              await loadInstalled(false);
                            } else {
                              const res =
                                await window.config.modsCheckUpdateOne(
                                  dir,
                                  managedModId,
                                );
                              if (res && (res as any).ok === false) {
                                setInstalledError(
                                  formatModsError(
                                    res,
                                    "modsModal.installed.checkFailed",
                                  ),
                                );
                                return;
                              }

                              setCheckedUpdatesByModId((prev) => ({
                                ...prev,
                                [managedModId]: {
                                  updateAvailable: !!(res as any)
                                    ?.updateAvailable,
                                  latestFileId:
                                    typeof (res as any)?.latestFileId ===
                                    "number"
                                      ? (res as any).latestFileId
                                      : null,
                                  latestName:
                                    typeof (res as any)?.latestName ===
                                    "string"
                                      ? (res as any).latestName
                                      : "",
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
                      {checked?.updateAvailable
                        ? t("modsModal.installed.update")
                        : t("modsModal.installed.checkUpdate")}
                    </button>
                  ) : null}

                  <button
                    type="button"
                    className={cn(
                      "px-3 py-1.5 rounded-lg border border-[#2a3146] text-xs",
                      it.enabled
                        ? "bg-transparent hover:bg-white/5 text-gray-200"
                        : "bg-[#23293a] hover:bg-[#2f3650] text-white",
                      "transition",
                    )}
                    onClick={() => {
                      void (async () => {
                        try {
                          const dir = await ensureGameDir();
                          const res =
                            await window.config.modsInstalledToggle(
                            dir,
                            it.fileName,
                          );
                          if (res && (res as any).ok === false) {
                            setInstalledError(
                              formatModsError(
                                res,
                                "modsModal.errors.unknown",
                              ),
                            );
                            return;
                          }
                          await loadInstalled(false);
                        } catch {
                          // ignore
                        }
                      })();
                    }}
                    title={t("common.toggle")}
                  >
                    {it.enabled
                      ? t("common.disable")
                      : t("common.enable")}
                  </button>

                  <button
                    type="button"
                    className="w-9 h-9 rounded-lg border border-[#2a3146] bg-transparent hover:bg-red-500/15 text-red-300 hover:text-red-200 transition flex items-center justify-center"
                    onClick={() => {
                      setDeleteModPrompt({
                        open: true,
                        fileName: it.fileName,
                      });
                    }}
                    title={t("common.delete")}
                  >
                    <IconTrash size={18} />
                  </button>
                </div>
              </div>
            );
          })()
        ))
      ) : (
        <div className="p-3 text-xs text-gray-300">
          {t("modsModal.noInstalledModsFound")}
        </div>
      )}
    </div>
  </div>
          ) : (
            <div className="grid grid-cols-[260px_1fr] gap-4 min-h-0 h-full">
              <div className="rounded-lg border border-[#2a3146] bg-[#1f2538]/70 p-3 flex flex-col min-h-0">
                <div className="text-sm text-white font-semibold mb-2">
                  {t("modsModal.profiles.title")}
                </div>

                <div className="flex items-center gap-2 mb-3">
                  <input
                    value={profileNameInput}
                    onChange={(e) => setProfileNameInput(e.target.value)}
                    placeholder={t("modsModal.profiles.namePlaceholder")}
                    className="w-full px-3 py-2 rounded-lg bg-[#141824]/80 border border-[#2a3146] text-white text-sm outline-none focus:border-blue-400/60"
                  />
                  <button
                    type="button"
                    className={cn(
                      "px-3 py-2 rounded-lg border border-blue-400/30",
                      "bg-[linear-gradient(90deg,#0268D4_0%,#02D4D4_100%)] bg-[length:100%_100%] bg-no-repeat bg-left",
                      "text-white text-sm font-bold",
                      "hover:shadow-[0_0_18px_rgba(2,104,212,0.85)] transition",
                    )}
                    onClick={() => {
                      void (async () => {
                        try {
                          const dir = await ensureGameDir();
                          const name = sanitizeProfileName(
                            profileNameInput || selectedProfileName,
                          );
                          if (!name) return;
                          const fallbackMods =
                            profiles.find((p) => p.name === selectedProfileName)
                              ?.mods ?? [];
                          const modsToSave =
                            profileSelectedMods.size > 0
                              ? Array.from(profileSelectedMods)
                              : // If state is empty, we pretend it's intentional and copy from the selected profile.
                                Array.from(
                                  new Set((fallbackMods ?? []).filter(Boolean)),
                                );

                          const cf: Record<
                            string,
                            { modId: number; fileId?: number }
                          > = {};
                          for (const base of modsToSave) {
                            const key =
                              typeof base === "string"
                                ? base.trim().toLowerCase()
                                : "";
                            if (!key) continue;
                            // We only remember versions for things we can actually identify.
                            // Everything else gets the classic "good luck" treatment.
                            const reg = registryByBaseName.get(key) ?? null;
                            if (
                              !reg ||
                              typeof reg.modId !== "number" ||
                              reg.modId <= 0
                            )
                              continue;
                            const entry: { modId: number; fileId?: number } = {
                              modId: reg.modId,
                            };
                            if (
                              typeof reg.fileId === "number" &&
                              reg.fileId > 0
                            )
                              entry.fileId = reg.fileId;
                            cf[key] = entry;
                          }
                          const res = await window.config.modsProfilesSave(
                            dir,
                            {
                              name,
                              mods: modsToSave,
                              cf,
                            },
                          );
                          if (res && (res as any).ok === false) {
                            setProfilesError(
                              formatModsError(
                                res,
                                "modsModal.errors.unknown",
                              ),
                            );
                            return;
                          }
                          setProfileNameInput(name);
                          await loadProfiles();
                          setSelectedProfileName(name);
                        } catch (e) {
                          const message =
                            e instanceof Error
                              ? e.message
                              : t("modsModal.errors.unknown");
                          setProfilesError(message);
                        }
                      })();
                    }}
                    title={t("common.save")}
                  >
                    {t("common.save")}
                  </button>
                </div>

                {profilesError ? (
                  <div className="text-xs text-red-300 mb-2">
                    {profilesError}
                  </div>
                ) : null}

                <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain pr-1 rounded-lg border border-[#2a3146] bg-[#141824]/60">
                  {profilesLoading ? (
                    <div className="p-3 text-xs text-gray-300">
                      {t("common.loading")}
                    </div>
                  ) : profiles.length ? (
                    profiles.map((p) => {
                      const active = p.name === selectedProfileName;
                      const isVanilla = p.name.toLowerCase() === "vanilla";
                      return (
                        <button
                          key={p.name}
                          type="button"
                          className={cn(
                            "w-full text-left px-3 py-2 border-b border-white/5",
                            "hover:bg-white/5 transition",
                            active && "bg-[#0ea5ff]/15",
                          )}
                          onClick={() => {
                            // Load the profile mods immediately so the UI doesn't gaslight you with "0 mods".
                            setSelectedProfileName(p.name);
                            setProfileNameInput(p.name);
                            const selected = new Set(
                              (p.mods ?? []).filter(Boolean),
                            );
                            setProfileSelectedMods(selected);

                            // Only sort "selected-first" at the moment the profile is chosen.
                            // After that, toggling shouldn't make rows teleport.
                            const union = new Set<string>(installedBaseNames);
                            for (const m of selected) union.add(m);
                            const names = Array.from(union);
                            names.sort((a, b) => {
                              const aSelected = selected.has(a);
                              const bSelected = selected.has(b);
                              if (aSelected !== bSelected)
                                return aSelected ? -1 : 1;
                              return a.localeCompare(b);
                            });
                            setProfileModsOrder(names);
                          }}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            if (isVanilla) return;
                            setProfileCtxMenu({
                              open: true,
                              x: e.clientX,
                              y: e.clientY,
                              name: p.name,
                            });
                          }}
                        >
                          <div className="text-xs text-white truncate">
                            {p.name}
                          </div>
                          <div className="text-[10px] text-gray-400">
                            {t("modsModal.countMods", {
                              count: p.mods?.length ?? 0,
                            })}
                          </div>
                        </button>
                      );
                    })
                  ) : (
                    <div className="p-3 text-xs text-gray-300">
                      {t("modsModal.profiles.noProfilesYet")}
                    </div>
                  )}
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    title={t("common.apply")}
                    className={cn(
                      "px-3 py-2 rounded-lg border border-[#2a3146]",
                      "bg-[#23293a] hover:bg-[#2f3650] text-white transition",
                      (!selectedProfileName || profilesLoading) &&
                        "opacity-60 cursor-not-allowed",
                    )}
                    disabled={!selectedProfileName || profilesLoading}
                    onClick={() => {
                      void (async () => {
                        try {
                          const dir = await ensureGameDir();
                          if (!selectedProfileName) return;
                          const res = await window.config.modsProfilesApply(
                            dir,
                            selectedProfileName,
                          );
                          if (res && (res as any).ok === false) {
                            setProfilesError(
                              formatModsError(
                                res,
                                "modsModal.errors.unknown",
                              ),
                            );
                            return;
                          }
                          await loadInstalled();
                        } catch (e) {
                          const message =
                            e instanceof Error
                              ? e.message
                              : t("modsModal.errors.unknown");
                          setProfilesError(message);
                        }
                      })();
                    }}
                  >
                    {t("common.apply")}
                  </button>

                  <button
                    type="button"
                    title={t("common.delete")}
                    className={cn(
                      "px-3 py-2 rounded-lg border border-[#2a3146]",
                      "bg-transparent hover:bg-red-500/15 text-red-300 hover:text-red-200 transition",
                      (!selectedProfileName ||
                        profilesLoading ||
                        selectedProfileName === "Vanilla") &&
                        "opacity-60 cursor-not-allowed",
                    )}
                    disabled={
                      !selectedProfileName ||
                      profilesLoading ||
                      selectedProfileName === "Vanilla"
                    }
                    onClick={() => {
                      void (async () => {
                        try {
                          const dir = await ensureGameDir();
                          if (!selectedProfileName) return;
                          const res = await window.config.modsProfilesDelete(
                            dir,
                            selectedProfileName,
                          );
                          if (res && (res as any).ok === false) {
                            setProfilesError(
                              formatModsError(
                                res,
                                "modsModal.errors.unknown",
                              ),
                            );
                            return;
                          }
                          setSelectedProfileName("");
                          setProfileNameInput("");
                          await loadProfiles();
                        } catch (e) {
                          const message =
                            e instanceof Error
                              ? e.message
                              : t("modsModal.errors.unknown");
                          setProfilesError(message);
                        }
                      })();
                    }}
                  >
                    {t("common.delete")}
                  </button>
                </div>

                {importError ? (
                  <div className="text-xs text-red-300 mt-2">{importError}</div>
                ) : null}
                {importNotice ? (
                  <div className="text-xs text-gray-200 mt-2">
                    {importNotice}
                  </div>
                ) : null}

                {importing && importCurrent ? (
                  <div className="text-[11px] text-gray-300 mt-2">
                    {(() => {
                      const p = importCurrent.modId
                        ? downloadProgress[importCurrent.modId]
                        : null;
                      const pct = p?.total
                        ? Math.floor((p.received / p.total) * 100)
                        : null;
                      return pct != null
                        ? t("modsModal.profiles.share.importingPct", {
                            current: importCurrent.idx,
                            total: importCurrent.total,
                            name: importCurrent.name,
                            pct,
                          })
                        : t("modsModal.profiles.share.importing", {
                            current: importCurrent.idx,
                            total: importCurrent.total,
                            name: importCurrent.name,
                          });
                    })()}
                  </div>
                ) : null}

                <div className="mt-2 flex items-center gap-2 relative">
                  <button
                    type="button"
                    className={cn(
                      "px-3 py-2 rounded-lg border border-blue-400/30",
                      "bg-[linear-gradient(90deg,#0268D4_0%,#02D4D4_100%)] bg-[length:100%_100%] bg-no-repeat bg-left",
                      "text-white text-sm font-bold",
                      "hover:shadow-[0_0_18px_rgba(2,104,212,0.85)] transition",
                      (importing || shareWorking) &&
                        "opacity-60 cursor-not-allowed",
                    )}
                    disabled={importing || shareWorking}
                    onClick={() => {
                      setShareError("");
                      setShareNotice("");
                      setImportError("");
                      setImportNotice("");
                      setImportPromptError("");
                      setImportPromptText("");
                      setImportPromptOpen(true);
                    }}
                    title={t("modsModal.profiles.share.import")}
                  >
                    {t("modsModal.profiles.share.import")}
                  </button>

                  {importPromptOpen ? (
                    <>
                      <div
                        className="fixed inset-0 z-[9999]"
                        onMouseDown={() => {
                          setImportPromptOpen(false);
                          setImportPromptError("");
                        }}
                      />

                      <div
                        className={cn(
                          "absolute left-0 bottom-full mb-2 z-[10000]",
                          "w-[560px] max-w-[92vw]",
                          "rounded-lg border border-[#2a3146] bg-[#141824]/60 p-3",
                        )}
                        onMouseDown={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-between gap-3 mb-2">
                          <div className="text-xs text-white font-semibold">
                            {t("modsModal.profiles.share.importPromptTitle")}
                          </div>
                          <button
                            type="button"
                            className="text-gray-300 hover:text-white transition-colors text-lg leading-none"
                            onClick={() => {
                              setImportPromptOpen(false);
                              setImportPromptError("");
                            }}
                            title={t("common.close")}
                          >
                            ×
                          </button>
                        </div>

                        <div className="text-[11px] text-gray-300 mb-2">
                          {t("modsModal.profiles.share.importPromptHint")}
                        </div>

                        {importPromptError ? (
                          <div className="text-xs text-red-300 mb-2">
                            {importPromptError}
                          </div>
                        ) : null}

                        <textarea
                          value={importPromptText}
                          onChange={(e) => {
                            setImportPromptText(e.target.value);
                            if (importPromptError) setImportPromptError("");
                          }}
                          placeholder={t(
                            "modsModal.profiles.share.importPromptPlaceholder",
                          )}
                          className="w-full h-[92px] resize-none px-3 py-2 rounded-lg bg-[#0f1422]/70 border border-[#2a3146] text-white text-[11px] font-mono outline-none"
                        />

                        <div className="mt-2 flex items-center justify-end gap-2">
                          <button
                            type="button"
                            className={cn(
                              "px-3 py-2 rounded-lg border border-[#2a3146]",
                              "bg-transparent hover:bg-white/5 text-gray-200 transition",
                              (importing || shareWorking) &&
                                "opacity-60 cursor-not-allowed",
                            )}
                            disabled={importing || shareWorking}
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
                                  const code =
                                    e instanceof Error
                                      ? e.message
                                      : "unknown";
                                  if (code === "invalid_prefix") {
                                    setImportPromptError(
                                      t(
                                        "modsModal.profiles.share.invalidFormat",
                                      ),
                                    );
                                  } else {
                                    setImportPromptError(
                                      t(
                                        "modsModal.profiles.share.importFailed",
                                      ),
                                    );
                                  }
                                }
                              })();
                            }}
                            title={t(
                              "modsModal.profiles.share.importFromClipboard",
                            )}
                          >
                            {t("modsModal.profiles.share.importFromClipboard")}
                          </button>

                          <button
                            type="button"
                            className={cn(
                              "px-3 py-2 rounded-lg border border-blue-400/30",
                              "bg-[linear-gradient(90deg,#0268D4_0%,#02D4D4_100%)] bg-[length:100%_100%] bg-no-repeat bg-left",
                              "text-white text-sm font-bold",
                              "hover:shadow-[0_0_18px_rgba(2,104,212,0.85)] transition",
                              (!importPromptText.trim() ||
                                importing ||
                                shareWorking) &&
                                "opacity-60 cursor-not-allowed",
                            )}
                            disabled={
                              !importPromptText.trim() || importing || shareWorking
                            }
                            onClick={() => {
                              void (async () => {
                                setImportPromptError("");
                                try {
                                  const pack = await decodeModPack(
                                    importPromptText,
                                  );
                                  setImportPreviewPack(pack);
                                  setImportPreviewOpen(true);
                                  setImportPromptOpen(false);
                                } catch (e) {
                                  const code =
                                    e instanceof Error
                                      ? e.message
                                      : "unknown";
                                  if (code === "invalid_prefix") {
                                    setImportPromptError(
                                      t(
                                        "modsModal.profiles.share.invalidFormatText",
                                      ),
                                    );
                                  } else {
                                    setImportPromptError(
                                      t(
                                        "modsModal.profiles.share.importFailed",
                                      ),
                                    );
                                  }
                                }
                              })();
                            }}
                            title={t("modsModal.profiles.share.importNow")}
                          >
                            {t("modsModal.profiles.share.importNow")}
                          </button>
                        </div>
                      </div>
                    </>
                  ) : null}
                </div>
              </div>

              <div className="rounded-lg border border-[#2a3146] bg-[#1f2538]/70 p-3 flex flex-col min-h-0">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div>
                    <div className="text-sm text-white font-semibold">
                      {t("modsModal.profileMods")}
                    </div>
                    <div className="text-[11px] text-gray-400">
                      {t("modsModal.profiles.selectedCount", {
                        count: profileSelectedMods.size,
                      })}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className={cn(
                        "px-3 py-2 rounded-lg border border-[#2a3146]",
                        "bg-[#23293a] hover:bg-[#2f3650] text-white transition",
                        installedLoading && "opacity-60 cursor-not-allowed",
                      )}
                      onClick={() =>
                        setProfileSelectedMods(new Set(installedBaseNames))
                      }
                      disabled={installedLoading}
                      title={t("common.selectAll")}
                    >
                      {t("common.selectAll")}
                    </button>

                    <button
                      type="button"
                      className={cn(
                        "px-3 py-2 rounded-lg border border-[#2a3146]",
                        "bg-transparent hover:bg-white/5 text-gray-200 transition",
                        installedLoading && "opacity-60 cursor-not-allowed",
                      )}
                      onClick={() => setProfileSelectedMods(new Set())}
                      disabled={installedLoading}
                      title={t("common.selectNone")}
                    >
                      {t("common.selectNone")}
                    </button>

                    <button
                      type="button"
                      className={cn(
                        "px-3 py-2 rounded-lg border border-[#2a3146]",
                        "bg-[#23293a] hover:bg-[#2f3650] text-white transition flex items-center gap-2",
                        installedLoading && "opacity-60 cursor-not-allowed",
                      )}
                      onClick={() => void loadInstalled()}
                      disabled={installedLoading}
                      title={t("common.refresh")}
                    >
                      <IconRefresh size={18} />
                      {t("common.refresh")}
                    </button>

                    <button
                      type="button"
                      className={cn(
                        "px-3 py-2 rounded-lg border border-[#2a3146]",
                        "bg-transparent hover:bg-white/5 text-gray-200 transition flex items-center gap-2",
                      )}
                      onClick={() => void handleOpenModsFolder()}
                      title={t("modsModal.installed.openFolder")}
                    >
                      <IconFolderOpen size={18} />
                      {t("modsModal.installed.openFolder")}
                    </button>
                  </div>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain pr-1 rounded-lg border border-[#2a3146] bg-[#141824]/60">
                  {installedLoading ? (
                    <div className="p-3 text-xs text-gray-300">
                      {t("common.loading")}
                    </div>
                  ) : profileModsUnionNames.length ? (
                    (profileModsOrder.length
                      ? profileModsOrder
                      : profileModsUnionNames
                    ).map((name) => {
                      const info = installedByBase.get(name);
                      const isInstalled = !!info;
                      const checked = profileSelectedMods.has(name);
                      const key = name.trim().toLowerCase();
                      const cfEntry = selectedProfile?.cf?.[key] ?? null;
                      const reg = registryByBaseName.get(key) ?? null;

                      const source =
                        cfEntry &&
                        typeof cfEntry.modId === "number" &&
                        cfEntry.modId > 0
                          ? { modId: cfEntry.modId, fileId: cfEntry.fileId }
                          : reg &&
                              typeof reg.modId === "number" &&
                              reg.modId > 0
                            ? { modId: reg.modId, fileId: reg.fileId }
                            : null;

                      // We prefer the profile's pinned version, because reproducibility is a luxury.
                      // Registry fallback is "whatever was installed last time".

                      const canAutoInstall =
                        !isInstalled &&
                        !!source &&
                        typeof source.modId === "number" &&
                        source.modId > 0;

                      return (
                        <label
                          key={name}
                          className="flex items-center justify-between gap-3 px-3 py-2 border-b border-white/5 hover:bg-white/5 transition cursor-pointer"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="text-xs text-white truncate">
                              {name}
                            </div>

                            {isInstalled ? (
                              <div
                                className={cn(
                                  "text-[10px]",
                                  info?.enabled
                                    ? "text-green-300"
                                    : "text-gray-400",
                                )}
                              >
                                {info?.enabled
                                  ? t("modsModal.profiles.currentlyEnabled")
                                  : t("modsModal.profiles.currentlyDisabled")}
                              </div>
                            ) : (
                              <div className="text-[10px] text-amber-300">
                                {t("modsModal.profiles.notInstalled")}
                              </div>
                            )}
                          </div>

                          {!isInstalled ? (
                            <button
                              type="button"
                              className={cn(
                                "px-2.5 py-1.5 rounded-lg border border-[#2a3146]",
                                "bg-[#23293a] hover:bg-[#2f3650] text-white transition",
                                (!canAutoInstall ||
                                  shareWorking ||
                                  importing ||
                                  installingId != null) &&
                                  "opacity-60 cursor-not-allowed",
                              )}
                              disabled={
                                !canAutoInstall ||
                                shareWorking ||
                                importing ||
                                installingId != null
                              }
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                void (async () => {
                                  if (!source) return;
                                  const modId = source.modId;
                                  if (typeof modId !== "number" || modId <= 0)
                                    return;
                                  try {
                                    setInstalledError("");
                                    setInstalledLoading(true);
                                    setInstallingId(modId);
                                    const dir = await ensureGameDir();
                                    if (
                                      typeof source.fileId === "number" &&
                                      source.fileId > 0
                                    ) {
                                      // Pin the exact fileId when we can. Because "latest" is just chaos with branding.
                                      await window.config.modsInstallFile(
                                        modId,
                                        source.fileId,
                                        dir,
                                      );
                                    } else {
                                      await window.config.modsInstall(
                                        modId,
                                        dir,
                                      );
                                    }
                                    await loadInstalled();
                                    await loadRegistry();
                                  } catch (err) {
                                    const message =
                                      err instanceof Error
                                        ? err.message
                                        : t("modsModal.errors.unknown");
                                    setInstalledError(message);
                                  } finally {
                                    setInstalledLoading(false);
                                    setInstallingId(null);
                                  }
                                })();
                              }}
                              title={t("modsModal.profiles.install")}
                            >
                              {t("modsModal.profiles.install")}
                            </button>
                          ) : null}

                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              const next = new Set(profileSelectedMods);
                              if (e.target.checked) next.add(name);
                              else next.delete(name);
                              setProfileSelectedMods(next);
                            }}
                            className="w-4 h-4 accent-[#0ea5ff]"
                          />
                        </label>
                      );
                    })
                  ) : (
                    <div className="p-3 text-xs text-gray-300">
                      {t("modsModal.noInstalledModsToSelect")}
                    </div>
                  )}
                </div>

                <div className="mt-3 flex items-center justify-between gap-2 relative">
                  <div className="text-[11px] text-gray-400">
                    {t("modsModal.profiles.tip")}
                  </div>

                  <button
                    type="button"
                    className={cn(
                      "px-2.5 py-1.5 rounded-lg border border-[#2a3146]",
                      "bg-transparent hover:bg-white/5 text-gray-200 transition",
                      (!selectedProfileName || shareWorking || importing) &&
                        "opacity-60 cursor-not-allowed",
                    )}
                    disabled={!selectedProfileName || shareWorking || importing}
                    onClick={() => {
                      setShareError("");
                      setShareNotice("");
                      setExportCode("");
                      setExportOpen(true);

                      void (async () => {
                        setShareWorking(true);
                        try {
                          const dir = await ensureGameDir();

                          const profile = profiles.find(
                            (p) => p.name === selectedProfileName,
                          );
                          if (!profile)
                            throw new Error(t("modsModal.errors.profileNotFound"));

                          const registryItems = Object.values(registryByModId);
                          const registryByBase = new Map<
                            string,
                            ModRegistryEntry
                          >();
                          for (const it of registryItems) {
                            if (!it?.fileName) continue;
                            registryByBase.set(
                              baseName(it.fileName).trim().toLowerCase(),
                              it,
                            );
                          }

                          const profileCf = profile.cf ?? {};

                          const gv = getSelectedGameVersionLabel();

                          const mods: ModPackV1["mods"] = [];
                          const unattached: string[] = [];
                          for (const base of (profile.mods ?? []).filter(
                            Boolean,
                          )) {
                            const baseKey = String(base).trim().toLowerCase();
                            const fileName =
                              getPreferredInstalledFileNameForBase(base);
                            const reg = registryByBase.get(baseKey) ?? null;
                            const cfEntry = profileCf?.[baseKey] ?? null;

                            const modId = reg?.modId ?? cfEntry?.modId;
                            const fileId =
                              typeof reg?.fileId === "number"
                                ? reg.fileId
                                : cfEntry?.fileId;
                            const canIntegrityCheckCurseforge =
                              typeof modId === "number" &&
                              modId > 0 &&
                              typeof fileId === "number" &&
                              fileId > 0;

                            let sha256: string | undefined;
                            // Only include sha256 when we can guarantee the importer downloads the same file.
                            if (fileName && canIntegrityCheckCurseforge) {
                              try {
                                const h = await window.config.modsFileHash(
                                  dir,
                                  fileName,
                                );
                                if (
                                  h?.ok &&
                                  typeof h.sha256 === "string" &&
                                  h.sha256
                                )
                                  sha256 = h.sha256;
                              } catch {
                                // ignore
                              }
                            }

                            if (
                              reg ||
                              (cfEntry &&
                                typeof cfEntry.modId === "number" &&
                                cfEntry.modId > 0)
                            ) {
                              const fileNameFromReg =
                                typeof reg?.fileName === "string"
                                  ? reg.fileName
                                  : undefined;
                              mods.push({
                                source: "curseforge",
                                name: base,
                                modId: modId as number,
                                fileId,
                                fileName: fileNameFromReg,
                                sha256,
                              });
                            } else {
                              unattached.push(String(base));
                              mods.push({
                                source: fileName ? "local" : "unknown",
                                name: base,
                                fileName: fileName ?? undefined,
                                sha256,
                                requiredManual: true,
                              });
                            }
                          }

                          const pack: ModPackV1 = {
                            v: 1,
                            profile: {
                              name: selectedProfileName,
                              gameVersion: {
                                type: gv.type,
                                buildIndex: gv.buildIndex,
                                label: gv.label,
                              },
                              createdAt: new Date().toISOString(),
                            },
                            mods,
                          };

                          const code = await encodeModPack(pack);
                          setExportCode(code);
                          if (unattached.length) {
                            setShareNotice(
                              `${t("modsModal.profiles.share.exportReady")} ${t(
                                "modsModal.profiles.share.exportWarnUnattached",
                                { count: unattached.length },
                              )}`,
                            );
                          } else {
                            setShareNotice(
                              t("modsModal.profiles.share.exportReady"),
                            );
                          }
                        } catch (e) {
                          const message =
                            e instanceof Error
                              ? e.message
                              : t("modsModal.status.unknownError");
                          setShareError(message);
                        } finally {
                          setShareWorking(false);
                        }
                      })();
                    }}
                    title={t("modsModal.profiles.share.export")}
                  >
                    {shareWorking
                      ? t("common.working")
                      : t("modsModal.profiles.share.export")}
                  </button>

                  {exportOpen ? (
                    <>
                      <div
                        className="fixed inset-0 z-[9999]"
                        onMouseDown={() => setExportOpen(false)}
                      />

                      <div
                        className={cn(
                          "absolute right-0 bottom-full mb-2 z-[10000]",
                          "w-[560px] max-w-[92vw]",
                          "rounded-lg border border-[#2a3146] bg-[#141824]/60 p-3",
                        )}
                        onMouseDown={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-between gap-3 mb-2">
                          <div className="text-xs text-white font-semibold">
                            {t("modsModal.profiles.share.title")}
                          </div>
                          <button
                            type="button"
                            className="text-gray-300 hover:text-white transition-colors text-lg leading-none"
                            onClick={() => setExportOpen(false)}
                            title={t("common.close")}
                          >
                            ×
                          </button>
                        </div>

                        {shareError ? (
                          <div className="text-xs text-red-300 mb-2">
                            {shareError}
                          </div>
                        ) : null}
                        {shareNotice ? (
                          <div className="text-xs text-gray-200 mb-2">
                            {shareNotice}
                          </div>
                        ) : null}

                        <div className="flex items-center justify-end gap-2 mb-2">
                          <button
                            type="button"
                            className={cn(
                              "px-3 py-2 rounded-lg border border-[#2a3146]",
                              "bg-transparent hover:bg-white/5 text-gray-200 transition",
                              (!exportCode || shareWorking) &&
                                "opacity-60 cursor-not-allowed",
                            )}
                            disabled={!exportCode || shareWorking}
                            onClick={() => {
                              void (async () => {
                                try {
                                  await copyToClipboard(exportCode);
                                  setShareNotice(
                                    t("modsModal.profiles.share.copied"),
                                  );
                                } catch {
                                  // ignore
                                }
                              })();
                            }}
                            title={t("modsModal.profiles.share.copy")}
                          >
                            {t("modsModal.profiles.share.copy")}
                          </button>
                        </div>

                        <textarea
                          value={exportCode}
                          readOnly
                          placeholder={t(
                            "modsModal.profiles.share.codePlaceholder",
                          )}
                          className="w-full h-[74px] resize-none px-3 py-2 rounded-lg bg-[#0f1422]/70 border border-[#2a3146] text-white text-[11px] font-mono outline-none"
                        />
                      </div>
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <ConfirmModal
        open={renameProfilePrompt.open}
        title={t("modsModal.profiles.rename.title")}
        message={
          <div>
            <div className="text-xs text-gray-200 mb-2">
              {t("modsModal.profiles.rename.hint", {
                name: renameProfilePrompt.oldName,
              })}
            </div>

            <input
              value={renameProfileInput}
              onChange={(e) => {
                setRenameProfileInput(e.target.value);
                if (renameProfileError) setRenameProfileError("");
              }}
              placeholder={t("modsModal.profiles.rename.placeholder")}
              className="w-full px-3 py-2 rounded-lg bg-[#141824]/80 border border-[#2a3146] text-white text-sm outline-none focus:border-blue-400/60"
              autoFocus
            />

            {renameProfileError ? (
              <div className="text-[11px] text-red-300 mt-2">
                {renameProfileError}
              </div>
            ) : null}
          </div>
        }
        confirmText={t("common.confirm")}
        cancelText={t("common.cancel")}
        onCancel={() => {
          setRenameProfilePrompt({ open: false, oldName: "" });
          setRenameProfileInput("");
          setRenameProfileError("");
        }}
        onConfirm={() => {
          void (async () => {
            try {
              const oldName = renameProfilePrompt.oldName;
              const nextName = sanitizeProfileName(renameProfileInput);
              if (!nextName) {
                setRenameProfileError(t("modsModal.profiles.rename.invalid"));
                return;
              }

              const existingName = profiles.find(
                (p) => p.name.toLowerCase() === nextName.toLowerCase(),
              )?.name;
              if (
                existingName &&
                existingName.toLowerCase() !== oldName.toLowerCase()
              ) {
                setRenameProfileError(t("modsModal.profiles.rename.taken"));
                return;
              }

              const profile = profiles.find((p) => p.name === oldName);
              if (!profile) {
                setRenameProfileError(t("modsModal.errors.profileNotFound"));
                return;
              }

              const dir = await ensureGameDir();
              const saveRes = await window.config.modsProfilesSave(dir, {
                name: nextName,
                mods: Array.isArray(profile.mods) ? profile.mods : [],
                cf: profile.cf ?? {},
              } as any);

              if (saveRes && (saveRes as any).ok === false) {
                setRenameProfileError(
                  formatModsError(saveRes, "modsModal.errors.unknown"),
                );
                return;
              }

              // If it's only a case change, save already replaced it.
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
              const message =
                e instanceof Error ? e.message : t("modsModal.errors.unknown");
              setRenameProfileError(message);
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
          const names = mods
            .map(
              (m) =>
                (m?.name ||
                  m?.fileName ||
                  (m?.modId ? `#${m.modId}` : "")) as string,
            )
            .filter(Boolean);
          const gvLabel = (pack.profile?.gameVersion?.label as string) || "";
          return (
            <div>
              <div className="text-sm text-gray-200">
                {t("modsModal.profiles.share.previewSummary", {
                  name: String(pack.profile?.name || ""),
                  count: names.length,
                  gameVersion: gvLabel || "-",
                })}
              </div>
              <div className="mt-3 text-xs text-gray-300">
                {t("modsModal.profiles.share.previewMods", {
                  count: names.length,
                })}
              </div>
              <div className="mt-2 max-h-[180px] overflow-y-auto pr-1 rounded-lg border border-[#2a3146] bg-[#141824]/60">
                {names.length ? (
                  names.map((n, idx) => (
                    <div
                      key={`${idx}-${n}`}
                      className="px-3 py-2 border-b border-white/5 text-[11px] text-gray-200"
                    >
                      {n}
                    </div>
                  ))
                ) : (
                  <div className="px-3 py-2 text-[11px] text-gray-400">
                    {t("modsModal.profiles.share.previewNoMods")}
                  </div>
                )}
              </div>
            </div>
          );
        })()}
        confirmText={t("modsModal.profiles.share.continue")}
        cancelText={t("common.cancel")}
        onCancel={() => {
          setImportPreviewOpen(false);
          setImportPreviewPack(null);
        }}
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
              const profileName = makeUniqueProfileName(
                String(pack.profile?.name || "Imported"),
              );
              const mods = (Array.isArray(pack.mods) ? pack.mods : []).filter(
                Boolean,
              );
              const downloadable = mods.filter(
                (m) =>
                  m.source === "curseforge" &&
                  typeof m.modId === "number" &&
                  m.modId > 0,
              );

              const installedBases: string[] = [];
              const errors: string[] = [];
              const manualMissing: string[] = mods
                .filter((m) => m.requiredManual)
                .map(
                  (m) =>
                    (m?.name ||
                      m?.fileName ||
                      (m?.modId ? `#${m.modId}` : "")) as string,
                )
                .filter(Boolean);

              for (let i = 0; i < downloadable.length; i++) {
                const m = downloadable[i];
                const modId = Number(m.modId);
                const name = (m?.name || m?.fileName || `#${modId}`) as string;
                setImportCurrent({
                  idx: i + 1,
                  total: downloadable.length,
                  modId,
                  name,
                });

                setInstallingId(modId);
                const res =
                  typeof m.fileId === "number" && m.fileId > 0
                    ? await window.config.modsInstallFile(modId, m.fileId, dir)
                    : await window.config.modsInstall(modId, dir);

                if (!res?.ok) {
                  errors.push(
                    `${name}: ${formatModsError(res, "modsModal.errors.downloadFailed")}`,
                  );
                  continue;
                }

                const fileName =
                  typeof res.fileName === "string" ? res.fileName : "";
                if (fileName) installedBases.push(baseName(fileName));

                if (m.sha256 && fileName) {
                  try {
                    const h = await window.config.modsFileHash(dir, fileName);
                    const got = h?.ok ? String(h.sha256 || "") : "";
                    const expected = String(m.sha256 || "").toLowerCase();
                    if (got && expected && got.toLowerCase() !== expected) {
                      const ok = await awaitIntegrityDecision(
                        t("modsModal.profiles.share.integrityTitle"),
                        <div>
                          <div className="text-sm text-gray-200">
                            {t("modsModal.profiles.share.integrityMismatch", {
                              name,
                            })}
                          </div>
                          <div className="mt-2 text-[11px] text-gray-300 font-mono break-all">
                            {t("modsModal.profiles.share.integrityExpected", {
                              hash: expected,
                            })}
                          </div>
                          <div className="mt-1 text-[11px] text-gray-300 font-mono break-all">
                            {t("modsModal.profiles.share.integrityGot", {
                              hash: got,
                            })}
                          </div>
                        </div>,
                      );
                      if (!ok) {
                        errors.push(`${name}: hash mismatch`);
                        break;
                      }
                    }
                  } catch {
                    // ignore hash errors
                  }
                }
              }

              const uniqueBases = Array.from(new Set(installedBases)).filter(
                Boolean,
              );
              const cf: Record<string, { modId: number; fileId?: number }> = {};
              for (const m of downloadable) {
                const modId = Number(m.modId);
                if (!Number.isFinite(modId) || modId <= 0) continue;
                const base = String(m?.name || "").trim();
                if (!base) continue;
                const key = base.toLowerCase();
                const entry: { modId: number; fileId?: number } = { modId };
                const fileId = Number((m as any)?.fileId);
                if (Number.isFinite(fileId) && fileId > 0)
                  entry.fileId = fileId;
                cf[key] = entry;
              }

              const saveRes = await window.config.modsProfilesSave(dir, {
                name: profileName,
                mods: uniqueBases,
                cf,
              });
              if (saveRes && (saveRes as any).ok === false) {
                throw new Error(
                  formatModsError(
                    saveRes,
                    "modsModal.profiles.share.importFailed",
                  ),
                );
              }
              await loadProfiles();
              setSelectedProfileName(profileName);
              setProfileSelectedMods(new Set(uniqueBases));

              if (manualMissing.length) {
                setImportNotice(
                  t("modsModal.profiles.share.importDoneManual", {
                    profile: profileName,
                    count: uniqueBases.length,
                    manual: manualMissing.length,
                  }),
                );
              } else {
                setImportNotice(
                  t("modsModal.profiles.share.importDone", {
                    profile: profileName,
                    count: uniqueBases.length,
                  }),
                );
              }

              if (errors.length) {
                setImportError(
                  t("modsModal.profiles.share.importSomeFailed", {
                    count: errors.length,
                  }),
                );
              }

              await loadInstalled();
              await loadRegistry(dir);
            } catch (e) {
              const message =
                e instanceof Error
                  ? e.message
                  : t("modsModal.profiles.share.importFailed");
              setImportError(message);
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
          <div>
            <div className="text-sm text-gray-200">
              {t("modsModal.installed.deleteConfirmMsg", {
                name: deleteModPrompt.fileName,
              })}
            </div>
          </div>
        }
        confirmText={t("common.delete")}
        cancelText={t("common.cancel")}
        onCancel={() => {
          setDeleteModPrompt({ open: false, fileName: "" });
        }}
        onConfirm={() => {
          void (async () => {
            if (!deleteModPrompt.fileName) return;

            try {
              setInstalledError("");
              setUpdatesWorking(true);
              const dir = await ensureGameDir();
              const res = await window.config.modsInstalledDelete(
                dir,
                deleteModPrompt.fileName,
              );
              if (res && (res as any).ok === false) {
                setInstalledError(
                  formatModsError(res, "modsModal.errors.unknown"),
                );
                return;
              }
              setDeleteModPrompt({ open: false, fileName: "" });
              await loadInstalled(false);
            } catch (e) {
              const message =
                e instanceof Error ? e.message : t("modsModal.errors.unknown");
              setInstalledError(message);
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
          <div>
            <div className="text-xs text-gray-200 mb-2">
              {t("modsModal.installed.attachLinkLabel")}
            </div>
            <input
              value={attachLinkInput}
              onChange={(e) => {
                const next = e.target.value;
                setAttachLinkInput(next);
                if (attachLinkError && isValidAttachLink(next)) {
                  setAttachLinkError("");
                }
              }}
              placeholder={t("modsModal.installed.attachLinkPlaceholder")}
              className="w-full px-3 py-2 rounded-lg bg-[#141824]/80 border border-[#2a3146] text-white text-sm outline-none focus:border-blue-400/60"
            />

            {attachLinkError ? (
              <div className="text-[11px] text-red-300 mt-2">
                {attachLinkError}
              </div>
            ) : null}

            <div className="text-[11px] text-gray-400 mt-2">
              {t("modsModal.installed.attachLinkExample")}: {ATTACH_LINK_EXAMPLE}
            </div>
          </div>
        }
        confirmText={t("common.confirm")}
        cancelText={t("common.cancel")}
        onCancel={() => {
          setAttachPrompt({ open: false, fileName: "" });
          setAttachLinkInput("");
          setAttachLinkError("");
        }}
        onConfirm={() => {
          void (async () => {
            try {
              const dir = await ensureGameDir();
              const link = attachLinkInput.trim();
              if (!link) return;
              if (!isValidAttachLink(link)) {
                setAttachLinkError(
                  t("modsModal.installed.attachLinkInvalid", {
                    example: ATTACH_LINK_EXAMPLE,
                  }),
                );
                return;
              }
              setInstalledError("");
              setUpdatesWorking(true);
              const res = await window.config.modsAttachManual(
                dir,
                attachPrompt.fileName,
                link,
              );
              if (!res?.ok) {
                if ((res as any)?.errorKey) {
                  setInstalledError(
                    formatModsError(res, "modsModal.installed.attachFailed"),
                  );
                  return;
                }
                const code = String((res as any)?.errorCode || "");
                if (code === "ATTACH_INVALID_LINK") {
                  setInstalledError(
                    t("modsModal.installed.attachErrorInvalidLink", {
                      example: ATTACH_LINK_EXAMPLE,
                    }),
                  );
                } else if (code === "ATTACH_FILE_NOT_FOUND") {
                  setInstalledError(
                    t("modsModal.installed.attachErrorFileNotFound"),
                  );
                } else if (code === "ATTACH_MOD_NOT_FOUND") {
                  setInstalledError(
                    t("modsModal.installed.attachErrorModNotFound", {
                      example: ATTACH_LINK_EXAMPLE,
                    }),
                  );
                } else if (code === "MODS_SERVICE_UNREACHABLE") {
                  setInstalledError(
                    t("modsModal.installed.attachErrorService"),
                  );
                } else {
                  setInstalledError(
                    (res as any)?.error || t("modsModal.installed.attachFailed"),
                  );
                }
                return;
              }
              setAttachPrompt({ open: false, fileName: "" });
              setAttachLinkInput("");
              setAttachLinkError("");
              await loadInstalled(false);
            } catch (e) {
              const message =
                e instanceof Error ? e.message : t("modsModal.errors.unknown");
              setInstalledError(message);
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
        onCancel={() => {
          const resolve = integrityPrompt.resolve;
          setIntegrityPrompt({ open: false, title: "", message: "" });
          resolve?.(false);
        }}
        onConfirm={() => {
          const resolve = integrityPrompt.resolve;
          setIntegrityPrompt({ open: false, title: "", message: "" });
          resolve?.(true);
        }}
      />

      {tab === "profiles" && profileCtxMenu.open ? createPortal(
        <>
          <div
            className="fixed inset-0 z-[9999]"
            onMouseDown={() =>
              setProfileCtxMenu({ open: false, x: 0, y: 0, name: "" })
            }
          />
          <div
            className={cn(
              "fixed z-[10000] min-w-[180px]",
              "rounded-lg border border-[#2a3146] bg-[#141824]/90",
              "shadow-2xl",
            )}
            style={{ left: profileCtxMenu.x, top: profileCtxMenu.y }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className={cn(
                "w-full text-left px-3 py-2 text-xs text-gray-200",
                "hover:bg-white/5 transition rounded-lg",
              )}
              onClick={() => {
                const name = profileCtxMenu.name;
                setProfileCtxMenu({ open: false, x: 0, y: 0, name: "" });
                setRenameProfileError("");
                setRenameProfileInput(name);
                setRenameProfilePrompt({ open: true, oldName: name });
              }}
            >
              {t("modsModal.profiles.rename.menu")}
            </button>
          </div>
        </>,
        document.body
      ) : null}
    </div>
  );
};

export default ModsModal;
