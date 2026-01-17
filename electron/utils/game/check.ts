import fs from "fs";
import path from "path";

export function checkGameInstallation(gameDir: string, version: GameVersion) {
  const os = process.platform;

  const clientName = os === "win32" ? "HytaleClient.exe" : "HytaleClient";
  const jreName = os === "win32" ? "java.exe" : "java";

  const clientPath = path.join(
    gameDir,
    "game",
    version.type,
    "Client",
    clientName
  );
  const serverPath = path.join(
    gameDir,
    "game",
    version.type,
    "Server",
    "HytaleServer.jar"
  );
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
