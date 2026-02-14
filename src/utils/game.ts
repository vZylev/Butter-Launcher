// (Unused BASE_URL removed)

const VERSION_DETAILS_CACHE_KEY = "versionDetailsCache:v1";
const VERSION_DETAILS_META_KEY = "versionDetailsMeta:v1";

const useSystemOS = () => {
  if (window.config.OS === "win32") return "windows";
  if (window.config.OS === "darwin") return "mac";
  if (window.config.OS === "linux") return "linux";
  // fallback: treat unknown as linux
  return "linux";
};

// (Unused legacy helpers removed)


// Use the new manifest URL from .env or fallback
const VERSIONS_NEW_URL = (window?.config?.VITE_REQUEST_VERSIONS_DETAILS_URL ||
  (import.meta as any).env?.VITE_REQUEST_VERSIONS_DETAILS_URL ||
  "https://updates.butterlauncher.tech/versions_new.json");


// (Unused saveCachedVersionDetails removed)


// Fetch the new versions manifest (versions_new.json)
const fetchVersionsNewManifest = async () => {
  try {
    const data = await window.ipcRenderer.invoke("fetch:json", VERSIONS_NEW_URL);
    return data;
  } catch {
    return null;
  }
};


// Get game versions from versions_new.json manifest
export const getGameVersions = async (versionType: VersionType = "release") => {
  const manifest = await fetchVersionsNewManifest();
  if (!manifest || (!manifest.versions && !manifest.pre_releases)) return [];

  const os = useSystemOS();
  const isRelease = versionType === "release";
  const builds = isRelease ? manifest.versions : manifest.pre_releases;
  if (!builds) return [];

  const versions: GameVersion[] = [];
  for (const [buildIdx, buildObj] of Object.entries(builds)) {
    if (typeof buildObj !== "object" || buildObj === null) continue;
    const osObj = (buildObj as any)[os];
    if (!osObj || typeof osObj !== "object") continue;
    const build_index = parseInt(buildIdx, 10);
    const build_name = osObj.name || `Build-${build_index}`;
    const url = osObj.url || undefined;
    const patch_url = osObj.url || undefined;
    const patch_note = osObj.patch_note || undefined;
    const patch_hash = osObj.hash || undefined;
    const original_url = osObj.original || undefined;
    const proper_patch = typeof osObj.proper_patch === "boolean" ? osObj.proper_patch : false;
    const server_url = (buildObj as any).server || undefined;
    const unserver_url = (buildObj as any).unserver || undefined;

    versions.push({
      url,
      type: versionType,
      build_index,
      build_name,
      isLatest: false,
      patch_url,
      patch_note,
      patch_hash,
      original_url,
      proper_patch,
      server_url,
      unserver_url,
    });
  }

  if (versions.length) {
    const actualLatest = Math.max(...versions.map((v) => v.build_index));
    for (const v of versions) v.isLatest = v.build_index === actualLatest;
  }
  versions.sort((a, b) => b.build_index - a.build_index);
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
