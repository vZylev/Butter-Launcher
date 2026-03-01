import fs from "fs";
import path from "path";

export const INSTALLED_MANIFEST_FILENAME = ".butter-installed.json";

export type InstalledManifest = {
  build_index: number;
  type: GameVersion["type"];
  build_name?: string;
  updated_at: string;
};

export const readInstallManifest = (installDir: string): InstalledManifest | null => {
  try {
    const manifestPath = path.join(installDir, INSTALLED_MANIFEST_FILENAME);
    if (!fs.existsSync(manifestPath)) return null;
    const raw = fs.readFileSync(manifestPath, "utf-8");
    const json = JSON.parse(raw) as InstalledManifest;
    if (!json || typeof json.build_index !== "number") return null;
    return json;
  } catch {
    return null;
  }
};

export const writeInstallManifest = (
  installDir: string,
  version: Pick<GameVersion, "build_index" | "type"> & { build_name?: string },
): boolean => {
  try {
    if (!fs.existsSync(installDir)) fs.mkdirSync(installDir, { recursive: true });

    const manifestPath = path.join(installDir, INSTALLED_MANIFEST_FILENAME);
    const payload: InstalledManifest = {
      build_index: version.build_index,
      type: version.type,
      build_name: version.build_name,
      updated_at: new Date().toISOString(),
    };
    fs.writeFileSync(manifestPath, JSON.stringify(payload, null, 2), "utf-8");
    return true;
  } catch {
    return false;
  }
};
