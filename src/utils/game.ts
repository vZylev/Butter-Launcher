import { customVersionsManifestProvider } from "./dynamicModules/customVersionsManifestProvider";

const BASE_URL = "https://game-patches.hytale.com/patches";

// Game version plumbing: mostly string concatenation, occasionally tears.

const parseBoolLike = (raw: unknown): boolean | undefined => {
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "string") {
    const v = raw.trim().toLowerCase();
    if (v === "true" || v === "1" || v === "yes") return true;
    if (v === "false" || v === "0" || v === "no") return false;
  }
  if (typeof raw === "number") {
    if (raw === 1) return true;
    if (raw === 0) return false;
  }
  return undefined;
};

const VERSION_DETAILS_CACHE_KEY = "versionDetailsCache:v1";
const VERSION_DETAILS_META_KEY = "versionDetailsMeta:v1";

let lastEmergencyMode = false;
export const getEmergencyMode = () => lastEmergencyMode;

let lastVersionDetails: VersionsManifestRoot | null = null;

export const getManifestInfoForBuild = (
  versionType: VersionType,
  buildIndex: number,
): Partial<GameVersion> | null => {
  const details = lastVersionDetails ?? loadCachedVersionDetails();
  if (!details) return null;

  const namesMap = versionType === "release" ? details.versions : details.pre_releases;
  const entry = (namesMap as any)?.[buildIndex];
  if (!entry) return null;

  const os = useSystemOS();
  const detailsEntry = entry?.[os];

  const listedName = detailsEntry?.name;
  const build_name =
    typeof listedName === "string" && listedName.trim().length > 0
      ? listedName
      : `Build-${buildIndex}`;

  const patch_url = typeof (detailsEntry as any)?.url === "string" ? (detailsEntry as any).url : undefined;
  const patch_hash = typeof (detailsEntry as any)?.hash === "string" ? (detailsEntry as any).hash : undefined;
  const original_url = typeof (detailsEntry as any)?.original === "string" ? (detailsEntry as any).original : undefined;
  const proper_patch = parseBoolLike((detailsEntry as any)?.proper_patch);
  const patch_note = typeof (detailsEntry as any)?.patch_note === "string" ? (detailsEntry as any).patch_note : undefined;

  const server_url =
    typeof (entry as any)?.server_url === "string"
      ? (entry as any).server_url
      : typeof (entry as any)?.server === "string"
        ? (entry as any).server
        : undefined;
  const unserver_url =
    typeof (entry as any)?.unserver_url === "string"
      ? (entry as any).unserver_url
      : typeof (entry as any)?.unserver === "string"
        ? (entry as any).unserver
        : undefined;

  return {
    build_name,
    patch_url: patch_url && patch_hash ? patch_url : undefined,
    patch_hash: patch_url && patch_hash ? patch_hash : undefined,
    original_url: patch_url && patch_hash ? original_url : undefined,
    patch_note: patch_url && patch_hash ? patch_note : undefined,
    proper_patch: patch_url && patch_hash ? proper_patch : undefined,
    server_url,
    unserver_url,
  };
};

const useSystemOS = () => {
  if (window.config.OS === "win32") return "windows";
  if (window.config.OS !== "darwin") return "linux";
  return window.config.OS;
};

const useSystemArch = (os: string) => {
  if (os === "darwin") return "arm64";
  return "amd64";
};

const buildPwrUrl = (
  os: string,
  arch: string,
  versionType: VersionType,
  buildIndex: number,
) => `${BASE_URL}/${os}/${arch}/${versionType}/0/${buildIndex}.pwr`;

export const buildDifferentialPwrUrl = (
  versionType: VersionType,
  fromBuildIndex: number,
  toBuildIndex: number,
): string => {
  const os = useSystemOS();
  const arch = useSystemArch(os);
  return `${BASE_URL}/${os}/${arch}/${versionType}/${fromBuildIndex}/${toBuildIndex}.pwr`;
};

const formatYMD = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const startOfToday = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
};

const loadCachedVersionDetails = (): VersionsManifestRoot | null => {
  try {
    const raw = localStorage.getItem(VERSION_DETAILS_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const saveCachedVersionDetails = (
  details: VersionsManifestRoot,
  meta?: any,
) => {
  try {
    localStorage.setItem(VERSION_DETAILS_CACHE_KEY, JSON.stringify(details));
    if (meta)
      localStorage.setItem(VERSION_DETAILS_META_KEY, JSON.stringify(meta));
  } catch {
    // ignore
  }
};

const mergeManifestRoots = (
  base: VersionsManifestRoot,
  overlay: VersionsManifestRoot,
): VersionsManifestRoot => {
  const mergeChannelMap = (a: any, b: any) => {
    const out: any = { ...(a ?? {}) };
    for (const k of Object.keys(b ?? {})) {
      const aEntry = (a ?? {})[k];
      const bEntry = (b ?? {})[k];
      out[k] = { ...(aEntry ?? {}), ...(bEntry ?? {}) };
      for (const os of ["windows", "linux", "darwin"] as const) {
        if ((aEntry ?? {})[os] || (bEntry ?? {})[os]) {
          out[k][os] = { ...((aEntry ?? {})[os] ?? {}), ...((bEntry ?? {})[os] ?? {}) };
        }
      }
    }
    return out;
  };

  return {
    ...(base as any),
    ...(overlay as any),
    // Keep base manifest bookkeeping; overlay should only augment per-build details.
    last_updated: (base as any)?.last_updated ?? (overlay as any)?.last_updated,
    latest_release_id:
      (base as any)?.latest_release_id ?? (overlay as any)?.latest_release_id,
    latest_prerelease_id:
      (base as any)?.latest_prerelease_id ??
      (overlay as any)?.latest_prerelease_id,
    emergency_mode: (base as any)?.emergency_mode ?? (overlay as any)?.emergency_mode,
    versions: mergeChannelMap((base as any)?.versions, (overlay as any)?.versions),
    pre_releases: mergeChannelMap(
      (base as any)?.pre_releases,
      (overlay as any)?.pre_releases,
    ),
  } as VersionsManifestRoot;
};

const stripDownloadLinksFromManifest = (details: VersionsManifestRoot): VersionsManifestRoot => {
  const stripChannelMap = (m: any) => {
    const out: any = { ...(m ?? {}) };
    for (const k of Object.keys(out)) {
      const entry = out[k];
      if (!entry || typeof entry !== "object") continue;
      for (const os of ["windows", "linux", "darwin"] as const) {
        const d = (entry as any)[os];
        if (!d || typeof d !== "object") continue;
        delete d.url;
        delete d.hash;
        delete d.original;
        delete d.patch_note;
        delete d.proper_patch;
      }
    }
    return out;
  };
  return {
    ...(details as any),
    versions: stripChannelMap((details as any)?.versions),
    pre_releases: stripChannelMap((details as any)?.pre_releases),
  } as VersionsManifestRoot;
};

const fetchVersionDetailsIfOnline =
  async (): Promise<VersionsManifestRoot | null> => {
    const url = `${import.meta.env.VITE_REQUEST_VERSIONS_DETAILS_URL}`;
    try {
      const status = await window.ipcRenderer.invoke("fetch:head", url);
      if (status !== 200) return null;
      const base = (await window.ipcRenderer.invoke(
        "fetch:json",
        url,
      )) as VersionsManifestRoot;

      // Backend change: base manifest can omit download links.
      // If an optional NP manifest provider exists, overlay it.
      if (customVersionsManifestProvider.isAvailable) {
        const np = await customVersionsManifestProvider.fetchNpManifest();
        if (np) return mergeManifestRoots(base, np);
      }

      return base;
    } catch {
      return null;
    }
  };


const normalizeLatestId = (manifestLatestId: unknown): number | null => {
  const latestId =
    typeof manifestLatestId === "number" && Number.isFinite(manifestLatestId)
      ? manifestLatestId
      : NaN;
  return Number.isFinite(latestId) && latestId > 0 ? latestId : null;
};
export const getGameVersions = async (versionType: VersionType = "release") => {
  // Step 1: ask the manifest nicely. If it ghosts us, we use cache and call it “resilience”.
  const today = startOfToday();
  const fetched = await fetchVersionDetailsIfOnline();
  let details = fetched ?? loadCachedVersionDetails();

  // If the NP provider is not installed, make sure we don't keep stale download links
  // (e.g. from a previous run where the provider was installed).
  if (details && !customVersionsManifestProvider.isAvailable) {
    try {
      const stripped = stripDownloadLinksFromManifest(details);
      // Keep runtime + cache aligned so UI doesn't show patch controls it can't fulfill.
      details = stripped;
      if (!fetched) saveCachedVersionDetails(stripped, { fetchedAt: formatYMD(today) });
    } catch {
      // ignore
    }
  }

  if (details) {
    saveCachedVersionDetails(details, { fetchedAt: formatYMD(today) });
  }

  // No manifest, no versions. We stopped poking game-patches with sticks on purpose.
  if (!details) return [];

  // Manifest global gate.
  lastEmergencyMode = !!(details as any)?.emergency_mode;
  lastVersionDetails = details;

  const latestId =
    versionType === "release"
      ? details.latest_release_id
      : details.latest_prerelease_id;

  const namesMap =
    versionType === "release" ? details.versions : details.pre_releases;

  // Step 2: turn map keys into numbers and pretend this is a stable API contract.
  const ids = Object.keys(namesMap || {})
    .map((k) => parseInt(k, 10))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);

  // Ensure “latest” exists even if it doesn't have a name. We'll slap on Build-<id> and move on.
  const normalizedLatestId = normalizeLatestId(latestId);
  if (normalizedLatestId && !ids.includes(normalizedLatestId)) {
    ids.push(normalizedLatestId);
    ids.sort((a, b) => a - b);
  }

  const os = useSystemOS();
  const arch = useSystemArch(os);

  const effectiveLatestId = normalizedLatestId ?? (ids.length ? Math.max(...ids) : null);

  const versions: GameVersion[] = ids
    .slice()
    .sort((a, b) => b - a)
    .map((buildIndex) => {
    const versionEntry = namesMap?.[buildIndex];
    const detailsEntry = versionEntry?.[os];

    // Account-mode gating:
    // - Official: respect manifest `available:false` (hide build)
    // - Non-official: still show the build even if `available:false`
    const accountType = (() => {
      try {
        return String(localStorage.getItem("accountType") || "").trim();
      } catch {
        return "";
      }
    })();
    const at = accountType.toLowerCase();
    const isCustom = at !== "" && at !== "premium";

    // Optional gating: if the manifest provides `available: false`, do not show the build.
    // If the field is missing, keep the build for backwards compatibility.
    const availableRaw =
      (detailsEntry as any)?.available ?? (versionEntry as any)?.available;
    if (!isCustom && typeof availableRaw === "boolean" && availableRaw === false) {
      return null;
    }

    const listedName = detailsEntry?.name;
    const build_name =
      typeof listedName === "string" && listedName.trim().length > 0
        ? listedName
        : `Build-${buildIndex}`;

    const patch_url =
      typeof (detailsEntry as any)?.url === "string"
        ? (detailsEntry as any).url
        : undefined;
    const original_url =
      typeof (detailsEntry as any)?.original === "string"
        ? (detailsEntry as any).original
        : undefined;
    const patch_hash =
      typeof (detailsEntry as any)?.hash === "string"
        ? (detailsEntry as any).hash
        : undefined;
    const proper_patch = parseBoolLike((detailsEntry as any)?.proper_patch);
    const patch_note =
      typeof (detailsEntry as any)?.patch_note === "string"
        ? (detailsEntry as any).patch_note
        : undefined;
    // because schema stability is a myth
    const server_url =
      typeof (versionEntry as any)?.server_url === "string"
        ? (versionEntry as any).server_url
        : typeof (versionEntry as any)?.server === "string"
          ? (versionEntry as any).server
          : undefined;
    // surely nobody will rename fields again
    const unserver_url =
      typeof (versionEntry as any)?.unserver_url === "string"
        ? (versionEntry as any).unserver_url
        : typeof (versionEntry as any)?.unserver === "string"
          ? (versionEntry as any).unserver
          : undefined;

    const version: GameVersion = {
      url: buildPwrUrl(os, arch, versionType, buildIndex),
      type: versionType,
      build_index: buildIndex,
      build_name,
      isLatest: !!effectiveLatestId && buildIndex === effectiveLatestId,
      patch_url: patch_url && patch_hash ? patch_url : undefined,
      patch_hash: patch_url && patch_hash ? patch_hash : undefined,
      original_url: patch_url && patch_hash ? original_url : undefined,
      patch_note: patch_url && patch_hash ? patch_note : undefined,
      proper_patch: patch_url && patch_hash ? proper_patch : undefined,
      server_url: server_url,
      unserver_url: unserver_url,
    };
    return version;
    })
    .filter((v): v is GameVersion => !!v);

  return versions;
};

export const getInstalledGameVersions: () => GameVersion[] = () => {
  const versions = localStorage.getItem("installedVersions");
  if (!versions) return [];
  return JSON.parse(versions);
};

export const saveInstalledGameVersion = (version: GameVersion) => {
  const versions = getInstalledGameVersions();
  const next = versions.filter(
    (v) => !(v.build_index === version.build_index && v.type === version.type),
  );
  next.push(version);
  localStorage.setItem("installedVersions", JSON.stringify(next));
};
