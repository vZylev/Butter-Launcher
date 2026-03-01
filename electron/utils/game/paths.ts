import fs from "fs";
import path from "path";
import { INSTALLED_MANIFEST_FILENAME, readInstallManifest, writeInstallManifest } from "./manifest";

const BUILD_DIR_PREFIX = "build-";

export const getGameRootDir = (baseDir: string) => path.join(baseDir, "game");

export const getLatestDir = (baseDir: string) => path.join(getGameRootDir(baseDir), "latest");

export const getReleaseChannelDir = (baseDir: string) =>
  path.join(getGameRootDir(baseDir), "release");

export const getPreReleaseChannelDir = (baseDir: string) =>
  path.join(getGameRootDir(baseDir), "pre-release");

export const getReleaseBuildDir = (baseDir: string, buildIndex: number) =>
  path.join(getReleaseChannelDir(baseDir), `${BUILD_DIR_PREFIX}${buildIndex}`);

export const getPreReleaseBuildDir = (baseDir: string, buildIndex: number) =>
  path.join(getPreReleaseChannelDir(baseDir), `${BUILD_DIR_PREFIX}${buildIndex}`);

const isLegacyChannelInstall = (channelDir: string) => {
  // Old layout installed directly into game/<type>/Client + Server.
  return fs.existsSync(path.join(channelDir, "Client")) || fs.existsSync(path.join(channelDir, "Server"));
};

export const migrateLegacyChannelInstallIfNeeded = (baseDir: string, versionType: GameVersion["type"]) => {
  try {
    const channelDir =
      versionType === "release" ? getReleaseChannelDir(baseDir) : getPreReleaseChannelDir(baseDir);

    if (!fs.existsSync(channelDir)) return;
    if (!isLegacyChannelInstall(channelDir)) return;

    // Old manifest lived at game/<type>/.butter-installed.json
    const legacyManifestPath = path.join(channelDir, INSTALLED_MANIFEST_FILENAME);
    if (!fs.existsSync(legacyManifestPath)) return;

    const legacy = readInstallManifest(channelDir);
    if (!legacy) return;

    const buildDir =
      versionType === "release"
        ? getReleaseBuildDir(baseDir, legacy.build_index)
        : getPreReleaseBuildDir(baseDir, legacy.build_index);

    if (!fs.existsSync(buildDir)) fs.mkdirSync(buildDir, { recursive: true });

    // Move everything except existing build-* folders into buildDir.
    const entries = fs.readdirSync(channelDir);
    for (const name of entries) {
      if (name.startsWith(BUILD_DIR_PREFIX)) continue;
      const from = path.join(channelDir, name);
      const to = path.join(buildDir, name);

      if (fs.existsSync(to)) continue;

      try {
        fs.renameSync(from, to);
      } catch {
        // Fallback to copy for cross-device or locked cases
        try {
          fs.cpSync(from, to, { recursive: true });
          fs.rmSync(from, { recursive: true, force: true });
        } catch {
          // ignore
        }
      }
    }

    // Ensure manifest exists inside the build dir (new layout).
    writeInstallManifest(buildDir, {
      build_index: legacy.build_index,
      type: legacy.type,
      build_name: legacy.build_name,
    });

    // Clean up leftover legacy manifest if still present.
    try {
      const leftover = path.join(channelDir, INSTALLED_MANIFEST_FILENAME);
      if (fs.existsSync(leftover)) fs.unlinkSync(leftover);
    } catch {
      // ignore
    }
  } catch {
    // ignore best-effort migration
  }
};

export const resolveInstallDir = (baseDir: string, version: GameVersion): string => {
  if (version.type === "pre-release") {
    return getPreReleaseBuildDir(baseDir, version.build_index);
  }

  // Latest alias is only used for latest RELEASE.
  if (version.type === "release" && version.isLatest) {
    return getLatestDir(baseDir);
  }

  return getReleaseBuildDir(baseDir, version.build_index);
};

// For launching/patching: prefer the existing latest alias if it matches the build.
// This keeps older "latest" installs launchable even after newer builds appear.
export const resolveExistingInstallDir = (baseDir: string, version: GameVersion): string => {
  const directDir = resolveInstallDir(baseDir, version);

  // Prefer the explicit build directory when it exists and looks usable.
  // This prevents launching the wrong binaries if `game/latest` has a stale/incorrect manifest.
  try {
    if (fs.existsSync(directDir)) {
      const clientDir = path.join(directDir, "Client");
      const serverDir = path.join(directDir, "Server");
      const hasClient = fs.existsSync(clientDir);
      const hasServer = fs.existsSync(serverDir);
      const manifest = readInstallManifest(directDir);
      if (hasClient && hasServer && manifest?.build_index === version.build_index) {
        return directDir;
      }
    }
  } catch {
    // ignore
  }

  // For launching/patching: fall back to the existing latest alias if it matches the build.
  // This keeps older "latest" installs launchable even after newer builds appear.
  if (version.type === "release") {
    try {
      const latestDir = getLatestDir(baseDir);
      const manifest = readInstallManifest(latestDir);

      // Only accept latestDir if it also contains expected folders.
      if (
        manifest?.build_index === version.build_index &&
        fs.existsSync(path.join(latestDir, "Client")) &&
        fs.existsSync(path.join(latestDir, "Server"))
      ) {
        return latestDir;
      }
    } catch {
      // ignore
    }
  }

  return directDir;
};

const findFirstFileNamed = (
  rootDir: string,
  fileName: string,
  opts?: { maxDepth?: number; maxEntries?: number },
): string | null => {
  const maxDepth = opts?.maxDepth ?? 6;
  const maxEntries = opts?.maxEntries ?? 5000;
  const q: Array<{ dir: string; depth: number }> = [{ dir: rootDir, depth: 0 }];
  let seen = 0;

  while (q.length) {
    const cur = q.shift()!;
    if (cur.depth > maxDepth) continue;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(cur.dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const e of entries) {
      seen++;
      if (seen > maxEntries) return null;

      const p = path.join(cur.dir, e.name);
      if (e.isFile() && e.name === fileName) return p;
      if (e.isDirectory()) q.push({ dir: p, depth: cur.depth + 1 });
    }
  }

  return null;
};

const resolveMacAppClientBinary = (clientDir: string): string | null => {
  // Common expected bundle name
  const direct = path.join(clientDir, "HytaleClient.app");
  const candidates: string[] = [];
  try {
    if (fs.existsSync(direct)) candidates.push(direct);
  } catch {
    // ignore
  }

  // Fallback: any *.app in Client
  try {
    const entries = fs.readdirSync(clientDir, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (!e.name.toLowerCase().endsWith(".app")) continue;
      if (/hytaleclient/i.test(e.name)) candidates.push(path.join(clientDir, e.name));
    }
    // If nothing matched by name, accept the first .app
    if (!candidates.length) {
      for (const e of entries) {
        if (e.isDirectory() && e.name.toLowerCase().endsWith(".app")) {
          candidates.push(path.join(clientDir, e.name));
          break;
        }
      }
    }
  } catch {
    // ignore
  }

  for (const appPath of candidates) {
    const macOsDir = path.join(appPath, "Contents", "MacOS");
    const directBin = path.join(macOsDir, "HytaleClient");
    try {
      if (fs.existsSync(directBin)) return directBin;
    } catch {
      // ignore
    }

    // Fallback: first file in Contents/MacOS
    try {
      const macEntries = fs.readdirSync(macOsDir, { withFileTypes: true });
      for (const e of macEntries) {
        if (e.isFile()) return path.join(macOsDir, e.name);
      }
    } catch {
      // ignore
    }
  }

  return null;
};

export const resolveClientPath = (installDir: string) => {
  const clientDir = path.join(installDir, "Client");
  const isWin = process.platform === "win32";

  // macOS builds ship as an .app bundle
  if (process.platform === "darwin") {
    const macBin = resolveMacAppClientBinary(clientDir);
    if (macBin) return macBin;
  }

  const candidates = isWin
    ? ["HytaleClient.exe", "HytaleClient"]
    : ["HytaleClient", "HytaleClient.x86_64", "HytaleClient.bin", "hytaleclient"];

  for (const name of candidates) {
    const p = path.join(clientDir, name);
    try {
      if (fs.existsSync(p)) return p;
    } catch {
    }
  }

  try {
    const entries = fs.readdirSync(clientDir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isFile() && /^HytaleClient/i.test(e.name)) {
        return path.join(clientDir, e.name);
      }
    }
  } catch {
  }

  return path.join(clientDir, isWin ? "HytaleClient.exe" : "HytaleClient");
};

export const resolveServerPath = (installDir: string) => {
  const primary = path.join(installDir, "Server", "HytaleServer.jar");
  try {
    if (fs.existsSync(primary)) return primary;
  } catch {
    // ignore
  }

  // Windows/Linux sometimes ship the server jar under a slightly different name or location.
  // Prefer staying inside installDir/Server to avoid expensive deep scans.
  try {
    const serverDir = path.join(installDir, "Server");
    if (fs.existsSync(serverDir)) {
      const entries = fs.readdirSync(serverDir, { withFileTypes: true });

      // First: anything that looks like HytaleServer*.jar
      for (const e of entries) {
        if (!e.isFile()) continue;
        if (!/\.jar$/i.test(e.name)) continue;
        if (/^hytaleserver/i.test(e.name)) return path.join(serverDir, e.name);
      }

      // Fallback: if there's exactly one jar in Server/, use it.
      const jars = entries
        .filter((e) => e.isFile() && /\.jar$/i.test(e.name))
        .map((e) => path.join(serverDir, e.name));
      if (jars.length === 1) return jars[0]!;
    }
  } catch {
    // ignore
  }

  // Last resort: look for a server jar in the install root.
  // Keep this shallow so it doesn't become a perf trap.
  try {
    const rootEntries = fs.readdirSync(installDir, { withFileTypes: true });
    for (const e of rootEntries) {
      if (!e.isFile()) continue;
      if (!/\.jar$/i.test(e.name)) continue;
      if (/hytaleserver/i.test(e.name)) return path.join(installDir, e.name);
    }
  } catch {
    // ignore
  }

  // Some macOS bundles ship the server jar inside the app resources
  if (process.platform === "darwin") {
    const clientDir = path.join(installDir, "Client");
    const appDir = path.join(clientDir, "HytaleClient.app");
    const candidates = [
      path.join(clientDir, "Server", "HytaleServer.jar"),
      path.join(clientDir, "HytaleServer.jar"),
      path.join(appDir, "Contents", "Resources", "Server", "HytaleServer.jar"),
      path.join(appDir, "Contents", "Resources", "HytaleServer.jar"),
    ];

    for (const p of candidates) {
      try {
        if (fs.existsSync(p)) return p;
      } catch {
        // ignore
      }
    }

    const found = findFirstFileNamed(installDir, "HytaleServer.jar", {
      maxDepth: 7,
      maxEntries: 8000,
    });
    if (found) return found;
  }

  return primary;
};
