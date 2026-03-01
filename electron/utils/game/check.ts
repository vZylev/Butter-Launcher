import fs from "fs";
import path from "path";
import { migrateLegacyChannelInstallIfNeeded, resolveClientPath, resolveExistingInstallDir, resolveServerPath } from "./paths";

export function checkGameInstallation(gameDir: string, version: GameVersion) {
  const os = process.platform;
  const jreName = os === "win32" ? "java.exe" : "java";

  // Best-effort migration for legacy installs that were written to game/<type>/Client.
  migrateLegacyChannelInstallIfNeeded(gameDir, version.type);

  const installDir = resolveExistingInstallDir(gameDir, version);
  const clientPath = resolveClientPath(installDir);
  const serverPath = resolveServerPath(installDir);
  const jrePath = path.join(gameDir, "jre", "bin", jreName);

  const client = fs.existsSync(clientPath);
  const server = fs.existsSync(serverPath);
  const jre = fs.existsSync(jrePath);

  return {
    client: client ? clientPath : undefined,
    server: server ? serverPath : undefined,
    jre: jre ? jrePath : undefined,
  };
}
