import { META_DIRECTORY } from "../const";
import path from "node:path";
import fs from "node:fs";
import extract from "extract-zip";

export const installButler = async () => {
  console.log("Installing Butler...");
  const butlerPath = path.join(META_DIRECTORY, "tools", "butler");
  const zipPath = path.join(butlerPath, "butler.zip");
  const binPath = path.join(
    butlerPath,
    process.platform === "win32" ? "butler.exe" : "butler"
  );

  try {
    if (!fs.existsSync(butlerPath)) {
      fs.mkdirSync(butlerPath, { recursive: true });
    }

    // check if butler is already installed
    if (fs.existsSync(binPath)) {
      return binPath;
    }

    // download butler
    const url: Record<string, string> = {
      win32:
        "https://broth.itch.zone/butler/windows-amd64/LATEST/archive/default",
      linux:
        "https://broth.itch.zone/butler/linux-amd64/LATEST/archive/default",
      darwin:
        "https://broth.itch.zone/butler/darwin-amd64/LATEST/archive/default",
    };
    if (!url[process.platform]) {
      throw new Error("Unsupported platform");
    }

    console.log("Downloading Butler...");
    const response = await fetch(url[process.platform]);
    if (!response.ok) {
      throw new Error(`Failed to download Butler: ${response.statusText}`);
    }
    const zipData = await response.arrayBuffer();
    fs.writeFileSync(zipPath, Buffer.from(zipData));

    console.log("Extracting Butler...");
    await extract(zipPath, { dir: butlerPath });

    // make butler executable on unix
    if (process.platform !== "win32") {
      fs.chmodSync(binPath, 0o755);
    }

    fs.unlinkSync(zipPath);
  } catch (error) {
    console.error("Failed to download Butler:", error);
    return null;
  }

  return binPath;
};
