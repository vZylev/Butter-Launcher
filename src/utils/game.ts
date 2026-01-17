// @ts-ignore: no default export
import semver from "semver";

type FixVersions = {
  [key: string]: {
    path: string;
    range: string;
  }[];
};

const BASE_URL = "https://game-patches.hytale.com/patches";

const useSystemOS = () => {
  if (window.config.OS === "win32") return "windows";
  if (window.config.OS === "linux") return "linux";
  return window.config.OS;
};

const useSystemArch = (os: string) => {
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

export const getGameVersions = async (versionType: VersionType = "release") => {
  let versions: GameVersion[] = [];

  const bounceTimeout = 250;
  let lastTime = Date.now();
  do {
    const version = await getGameVersion(versionType, versions.length);
    if (!version) break;
    versions.push(version);
    lastTime = Date.now();
  } while (Date.now() - lastTime < bounceTimeout);

  return versions;
};

export const getInstalledGameVersions: () => GameVersion[] = () => {
  const versions = localStorage.getItem("installedVersions");
  if (!versions) return [];
  return JSON.parse(versions);
};

export const saveInstalledGameVersion = (version: GameVersion) => {
  const versions = getInstalledGameVersions();
  versions.push(version);
  localStorage.setItem("installedVersions", JSON.stringify(versions));
};
