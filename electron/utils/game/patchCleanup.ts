import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { logger } from "../logger";
import { listInstalledVersions } from "./installed";
import {
  migrateLegacyChannelInstallIfNeeded,
  resolveClientPath,
  resolveExistingInstallDir,
  resolveServerPath,
} from "./paths";

const ONLINE_PATCH_ROOT_DIRNAME = ".butter-online-patch";

const unlinkIfExists = (p: string) => {
  try {
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch {
    // ignore
  }
};

const removeDirIfExists = (dirPath: string) => {
  try {
    if (!fs.existsSync(dirPath)) return;
    fs.rmSync(dirPath, { recursive: true, force: true });
  } catch {
    try {
      // @ts-ignore best-effort fallback
      fs.rmdirSync(dirPath, { recursive: true });
    } catch {
      // ignore
    }
  }
};

const getAppBundlePathIfInBundle = (targetPath: string): string | null => {
  if (process.platform !== "darwin") return null;
  try {
    let cur = path.dirname(targetPath);
    const root = path.parse(cur).root;
    while (cur && cur !== root) {
      if (cur.toLowerCase().endsWith(".app")) return cur;
      cur = path.dirname(cur);
    }
  } catch {
    // ignore
  }
  return null;
};

const getOnlinePatchBaseDirForTargetPath = (targetPath: string): string => {
  const exeName = path.basename(targetPath);
  const appBundle = getAppBundlePathIfInBundle(targetPath);
  if (process.platform === "darwin" && appBundle) {
    return path.join(path.dirname(appBundle), ONLINE_PATCH_ROOT_DIRNAME, exeName);
  }
  return path.join(path.dirname(targetPath), ONLINE_PATCH_ROOT_DIRNAME);
};

const findOnlinePatchOriginalBackupPath = (targetPath: string): string | null => {
  const exeName = path.basename(targetPath);
  const base = getOnlinePatchBaseDirForTargetPath(targetPath);

  const direct = path.join(base, "original", exeName);
  try {
    if (fs.existsSync(direct)) return direct;
  } catch {
    // ignore
  }

  if (process.platform === "darwin") {
    const appBundle = getAppBundlePathIfInBundle(targetPath);
    if (appBundle) {
      const legacyBase = path.join(path.dirname(appBundle), ONLINE_PATCH_ROOT_DIRNAME);
      const legacy = path.join(legacyBase, "original", exeName);
      try {
        if (fs.existsSync(legacy)) return legacy;
      } catch {
        // ignore
      }
    }

    const nested = path.join(path.dirname(base), exeName, "original", exeName);
    try {
      if (fs.existsSync(nested)) return nested;
    } catch {
      // ignore
    }
  }

  return null;
};

const postMacBundleFixups = (targetPath: string) => {
  if (process.platform !== "darwin") return;

  const bundle = getAppBundlePathIfInBundle(targetPath);
  if (!bundle) return;

  try {
    spawnSync("xattr", ["-dr", "com.apple.quarantine", bundle], {
      windowsHide: true,
      encoding: "utf8",
    });
  } catch {
    // ignore
  }

  try {
    spawnSync("codesign", ["--force", "--deep", "--sign", "-", bundle], {
      windowsHide: true,
      encoding: "utf8",
    });
  } catch {
    // ignore
  }
};

const restoreOriginalAndRemoveArtifactsBestEffort = (targetPath: string): boolean => {
  const base = getOnlinePatchBaseDirForTargetPath(targetPath);
  const original = findOnlinePatchOriginalBackupPath(targetPath);

  let restored = false;
  try {
    if (original && fs.existsSync(original)) {
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.copyFileSync(original, targetPath);
      postMacBundleFixups(targetPath);
      restored = true;
    }
  } catch {
    restored = false;
  }

  // If we managed to restore, remove patch artifacts.
  // If we couldn't restore, leave artifacts intact (so a future build can still restore).
  if (restored) {
    removeDirIfExists(base);

    // Best-effort: if we used a legacy un-namespaced macOS base, clean that too.
    if (process.platform === "darwin") {
      const appBundle = getAppBundlePathIfInBundle(targetPath);
      if (appBundle) {
        const legacyBase = path.join(path.dirname(appBundle), ONLINE_PATCH_ROOT_DIRNAME);
        // Only remove the legacy base if it clearly contains this target's backup.
        const legacyOriginal = path.join(legacyBase, "original", path.basename(targetPath));
        try {
          if (fs.existsSync(legacyOriginal)) {
            unlinkIfExists(legacyOriginal);
          }

          // Remove empty legacy dirs if possible (best-effort).
          // We avoid removing the entire legacyBase to not accidentally delete other targets.
          const legacyOriginalDir = path.dirname(legacyOriginal);
          try {
            const entries = fs.readdirSync(legacyOriginalDir);
            if (entries.length === 0) removeDirIfExists(legacyOriginalDir);
          } catch {
            // ignore
          }
        } catch {
          // ignore
        }
      }
    }
  }

  return restored;
};

export const cleanupUnsupportedPatchArtifactsBestEffort = async (
  gameDir: string,
): Promise<{ ok: boolean; restored: number; failed: number; skipped: number }> => {
  let restored = 0;
  let failed = 0;
  let skipped = 0;

  let installed: Array<{ type: any; build_index: number; build_name?: string; isLatest?: boolean }> = [];
  try {
    installed = listInstalledVersions(gameDir);
  } catch {
    return { ok: true, restored: 0, failed: 0, skipped: 0 };
  }

  for (const info of installed) {
    const v: GameVersion = {
      url: "",
      type: info.type as any,
      build_index: info.build_index,
      build_name: info.build_name || `Build-${info.build_index}`,
      isLatest: !!info.isLatest,
    };

    try {
      migrateLegacyChannelInstallIfNeeded(gameDir, v.type);
      const installDir = resolveExistingInstallDir(gameDir, v);

      const clientPath = resolveClientPath(installDir);
      const serverPath = resolveServerPath(installDir);

      const didClient = restoreOriginalAndRemoveArtifactsBestEffort(clientPath);
      const didServer = restoreOriginalAndRemoveArtifactsBestEffort(serverPath);

      if (didClient) restored++;
      else skipped++;

      if (didServer) restored++;
      else skipped++;
    } catch (e) {
      failed++;
      try {
        logger.warn("Patch cleanup failed", {
          gameDir,
          build_index: info.build_index,
          type: info.type,
        }, e);
      } catch {
        // ignore
      }
    }
  }

  return { ok: failed === 0, restored, failed, skipped };
};
