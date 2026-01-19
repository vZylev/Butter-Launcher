// @ts-ignore: no default export
import semver from "semver";

type FixVersions = {
  [key: string]: {
    path: string;
    range: string;
  }[];
};

const BASE_URL = "https://game-patches.hytale.com/patches";

const VERSION_DETAILS_CACHE_KEY = "versionDetailsCache:v1";
const VERSION_DETAILS_META_KEY = "versionDetailsMeta:v1";

const useSystemOS = () => {
  if (window.config.OS === "win32") return "windows";
  if (window.config.OS === "linux") return "linux";
  return window.config.OS;
};

const useSystemArch = (os: string) => {
  // Hytale patch endpoints currently only provide darwin/arm64.
  if (os === "darwin") return "arm64";
  return "amd64";
};

export const getGameVersion = async (
  versionType: VersionType = "release",
  versionIndex: number = 1
) => {
  if (versionIndex < 1) versionIndex = 1;

  const os = useSystemOS();
  const arch = useSystemArch(os);
  const URL = `${BASE_URL}/${os}/${arch}/${versionType}/0/${versionIndex}.pwr`;

  let version: GameVersion | null = null;

  const pwrStatus = await window.ipcRenderer.invoke("fetch:head", URL);
  if (pwrStatus !== 200) return null;

  // get version details
  const details: VersionDetailsRoot = await window.ipcRenderer.invoke(
    "fetch:json",
    `${import.meta.env.VITE_REQUEST_VERSIONS_DETAILS_URL}`
  );

  version = {
    url: URL,
    type: versionType,
    build_index: versionIndex,
    build_name: details?.versions[versionIndex.toString()]?.name || "",
  };

  // get version fix
  const fix: FixVersions = await window.ipcRenderer.invoke(
    "fetch:json",
    `${import.meta.env.VITE_DOWNLOADS_API_URL}/online/versions.json`
  );

  if (fix[os]) {
    const versionFix = fix[os].find((v) =>
      semver.satisfies(versionIndex.toString(), v.range)
    );
    if (versionFix) {
      version.hasFix = true;
      version.fixURL = `${
        import.meta.env.VITE_DOWNLOADS_API_URL
      }/online/${os}/${versionFix.path}`;
    }
  }

  return version;
};

const buildPwrUrl = (
  os: string,
  arch: string,
  versionType: VersionType,
  buildIndex: number
) => `${BASE_URL}/${os}/${arch}/${versionType}/0/${buildIndex}.pwr`;

const formatYMD = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const parseISODateOnly = (raw?: string): Date | null => {
  if (!raw) return null;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!iso) return null;
  const y = Number(iso[1]);
  const m = Number(iso[2]);
  const d = Number(iso[3]);
  const dt = new Date(y, m - 1, d);
  return Number.isNaN(dt.getTime()) ? null : dt;
};

const startOfToday = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
};

const loadCachedVersionDetails = (): VersionDetailsRoot | null => {
  try {
    const raw = localStorage.getItem(VERSION_DETAILS_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const saveCachedVersionDetails = (details: VersionDetailsRoot, meta?: any) => {
  try {
    localStorage.setItem(VERSION_DETAILS_CACHE_KEY, JSON.stringify(details));
    if (meta) localStorage.setItem(VERSION_DETAILS_META_KEY, JSON.stringify(meta));
  } catch {
    // ignore
  }
};

const fetchVersionDetailsIfOnline = async (): Promise<VersionDetailsRoot | null> => {
  const url = `${import.meta.env.VITE_REQUEST_VERSIONS_DETAILS_URL}`;
  try {
    const status = await window.ipcRenderer.invoke("fetch:head", url);
    if (status !== 200) return null;
    return (await window.ipcRenderer.invoke("fetch:json", url)) as VersionDetailsRoot;
  } catch {
    return null;
  }
};

const headPwrExists = async (
  versionType: VersionType,
  buildIndex: number
): Promise<boolean> => {
  const os = useSystemOS();
  const arch = useSystemArch(os);
  const url = buildPwrUrl(os, arch, versionType, buildIndex);
  try {
    const status = await window.ipcRenderer.invoke("fetch:head", url);
    return status === 200;
  } catch {
    return false;
  }
};

const probeBeyondLatest = async (
  versionType: VersionType,
  startFrom: number,
  maxExtra: number
): Promise<number[]> => {
  const found: number[] = [];
  let current = startFrom;
  for (let i = 0; i < maxExtra; i++) {
    const ok = await headPwrExists(versionType, current);
    if (!ok) break;
    found.push(current);
    current++;
  }
  return found;
};

const probeFromBuild1 = async (
  versionType: VersionType,
  maxScan: number,
): Promise<number[]> => {
  const found: number[] = [];
  for (let buildIndex = 1; buildIndex <= maxScan; buildIndex++) {
    const ok = await headPwrExists(versionType, buildIndex);
    if (!ok) break;
    found.push(buildIndex);
  }
  return found;
};
export const getGameVersions = async (versionType: VersionType = "release") => {
  // 1) Fetch the official versions list (your provided API format). If offline, use cache.
  const today = startOfToday();
  const details = (await fetchVersionDetailsIfOnline()) ?? loadCachedVersionDetails();

  if (details) {
    saveCachedVersionDetails(details, { fetchedAt: formatYMD(today) });
  }

  // Fallback: if the versions list is unavailable/incompatible (maintenance, schema change, etc)
  // probe PWRs from build-1 upwards so new users still see installable builds.
  if (!details) {
    const os = useSystemOS();
    const arch = useSystemArch(os);

    const maxScan = 500; // safety cap
    const ids = await probeFromBuild1(versionType, maxScan);
    if (!ids.length) return [];

    const versions: GameVersion[] = ids.map((buildIndex) => ({
      url: buildPwrUrl(os, arch, versionType, buildIndex),
      type: versionType,
      build_index: buildIndex,
      build_name: `Build-${buildIndex}`,
      isLatest: false,
    }));

    const actualLatest = Math.max(...versions.map((v) => v.build_index));
    for (const v of versions) v.isLatest = v.build_index === actualLatest;

    versions.sort((a, b) => b.build_index - a.build_index);

    // Best-effort: apply fix metadata if available.
    try {
      const fix: FixVersions = await window.ipcRenderer.invoke(
        "fetch:json",
        `${import.meta.env.VITE_DOWNLOADS_API_URL}/online/versions.json`
      );

      if (fix[os]) {
        for (const v of versions) {
          const versionFix = fix[os].find((x) =>
            semver.satisfies(v.build_index.toString(), x.range)
          );
          if (versionFix) {
            v.hasFix = true;
            v.fixURL = `${import.meta.env.VITE_DOWNLOADS_API_URL}/online/${os}/${versionFix.path}`;
          }
        }
      }
    } catch {
      // ignore
    }

    return versions;
  }

  parseISODateOnly(details.last_updated);
  const latestId =
    versionType === "release"
      ? details.latest_release_id
      : details.latest_prerelease_id;

  const namesMap =
    versionType === "release" ? details.versions : details.pre_releases;

  // 2) Build candidate IDs from list.
  let ids = Object.keys(namesMap || {})
    .map((k) => parseInt(k, 10))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);

  // Ensure latestId is included even if not present in map.
  if (typeof latestId === "number" && latestId > 0 && !ids.includes(latestId)) {
    ids.push(latestId);
    ids.sort((a, b) => a - b);
  }

  // 3) HEAD-check each listed build to ensure it exists.
  const existingListed: number[] = [];
  for (const id of ids) {
    const ok = await headPwrExists(versionType, id);
    if (ok) existingListed.push(id);
  }

  // 4) Probe latest+1, latest+2, ... until it stops being 500.
  // This catches new builds even when the versions list hasn't updated yet.
  const shouldProbe = typeof latestId === "number" && latestId > 0;
  const maxExtra = 100; // safety cap
  const extras = shouldProbe
    ? await probeBeyondLatest(versionType, latestId + 1, maxExtra)
    : [];

  const finalIds = Array.from(new Set([...existingListed, ...extras])).sort(
    (a, b) => a - b
  );

  const os = useSystemOS();
  const arch = useSystemArch(os);

  const versions: GameVersion[] = finalIds.map((buildIndex) => {
    const detailsEntry = namesMap?.[buildIndex.toString()];
    const listedName = detailsEntry?.name;
    const build_name =
      typeof listedName === "string" && listedName.trim().length > 0
        ? listedName
        : `Build-${buildIndex}`;

    const patch_url =
      typeof (detailsEntry as any)?.url === "string" ? (detailsEntry as any).url : undefined;
    const original_url =
      typeof (detailsEntry as any)?.original === "string" ? (detailsEntry as any).original : undefined;
    const patch_hash =
      typeof (detailsEntry as any)?.hash === "string" ? (detailsEntry as any).hash : undefined;
    const patch_note =
      typeof (detailsEntry as any)?.patch_note === "string" ? (detailsEntry as any).patch_note : undefined;

    return {
      url: buildPwrUrl(os, arch, versionType, buildIndex),
      type: versionType,
      build_index: buildIndex,
      build_name,
      isLatest: false,
      patch_url: patch_url && patch_hash ? patch_url : undefined,
      patch_hash: patch_url && patch_hash ? patch_hash : undefined,
      original_url: patch_url && patch_hash ? original_url : undefined,
      patch_note: patch_url && patch_hash ? patch_note : undefined,
    };
  });

  // Mark the actual latest build based on what exists (includes probeBeyondLatest).
  if (versions.length) {
    const actualLatest = Math.max(...versions.map((v) => v.build_index));
    for (const v of versions) {
      v.isLatest = v.build_index === actualLatest;
    }
  }

  // Newest first in UI.
  versions.sort((a, b) => b.build_index - a.build_index);

  // get version fix (same behavior as before, but apply to all returned versions)
  const fix: FixVersions = await window.ipcRenderer.invoke(
    "fetch:json",
    `${import.meta.env.VITE_DOWNLOADS_API_URL}/online/versions.json`
  );
  if (fix[os]) {
    for (const v of versions) {
      const versionFix = fix[os].find((fx) =>
        semver.satisfies(v.build_index.toString(), fx.range)
      );
      if (versionFix) {
        v.hasFix = true;
        v.fixURL = `${import.meta.env.VITE_DOWNLOADS_API_URL}/online/${os}/${versionFix.path}`;
      }
    }
  }

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
    (v) => !(v.build_index === version.build_index && v.type === version.type)
  );
  next.push(version);
  localStorage.setItem("installedVersions", JSON.stringify(next));
};
