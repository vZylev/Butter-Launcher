import fs from "fs";
import https from "https";
import path from "path";
import { BrowserWindow } from "electron";
import AdmZip from "adm-zip";
import {
  migrateLegacyChannelInstallIfNeeded,
  resolveClientPath,
  resolveExistingInstallDir,
  resolveServerPath,
} from "./paths";
import { GameVersion } from "./types";

// Domain configuration for Patch
const ORIGINAL_DOMAIN = "hytale.com";
const DEFAULT_AUTH_DOMAIN = "auth.sanasol.ws";
const MIN_DOMAIN_LENGTH = 4;
const MAX_DOMAIN_LENGTH = 16;

// Backup extension for original files
export const BACKUP_EXTENSION = ".original";
const PATCH_FLAG_FILENAME = ".butter_patched_v2";

// --- Sanasol Patcher Logic (adapted to TypeScript) ---

type DomainStrategy = {
  mode: "direct" | "split";
  mainDomain: string;
  subdomainPrefix: string;
  description: string;
};

type PatchResult = {
  success: boolean;
  patchCount: number;
  alreadyPatched?: boolean;
  warning?: string;
  error?: string;
};

type PatchProgress = (message: string, percent: number | null) => void;

/**
 * Calculate the domain patching strategy based on length.
 */
const getDomainStrategy = (domain: string): DomainStrategy => {
  if (domain.length <= 10) {
    return {
      mode: "direct",
      mainDomain: domain,
      subdomainPrefix: "",
      description: `Direct replacement: hytale.com -> ${domain}`,
    };
  } else {
    const prefix = domain.slice(0, 6);
    const suffix = domain.slice(6);
    return {
      mode: "split",
      mainDomain: suffix,
      subdomainPrefix: prefix,
      description: `Split mode: subdomain prefix="${prefix}", main domain="${suffix}"`,
    };
  }
};

/**
 * Convert a string to the length-prefixed byte format used by the client.
 */
const stringToLengthPrefixed = (str: string): Buffer => {
  const length = str.length;
  // Format: [length byte] [00 00 00 padding] [char1] [00] [char2] [00] ...
  const result = Buffer.alloc(4 + length + (length > 0 ? length - 1 : 0));

  result[0] = length;
  result[1] = 0x00;
  result[2] = 0x00;
  result[3] = 0x00;

  let pos = 4;
  for (let i = 0; i < length; i++) {
    result[pos++] = str.charCodeAt(i);
    if (i < length - 1) {
      result[pos++] = 0x00;
    }
  }
  return result;
};

/**
 * Convert a string to UTF-8 bytes.
 */
const stringToUtf8 = (str: string): Buffer => {
  return Buffer.from(str, "utf8");
};

/**
 * Find all occurrences of a pattern in a buffer.
 */
const findAllOccurrences = (buffer: Buffer, pattern: Buffer): number[] => {
  const positions: number[] = [];
  let pos = 0;
  while (pos < buffer.length) {
    const index = buffer.indexOf(pattern, pos);
    if (index === -1) break;
    positions.push(index);
    pos = index + 1;
  }
  return positions;
};

/**
 * Replace bytes in buffer; only overwrites the length of new bytes.
 */
const replaceBytes = (
  buffer: Buffer,
  oldBytes: Buffer,
  newBytes: Buffer,
): { buffer: Buffer; count: number } => {
  let count = 0;
  const result = Buffer.from(buffer);

  if (newBytes.length > oldBytes.length) {
    console.warn(
      `[Patcher] New pattern (len ${newBytes.length}) longer than old (len ${oldBytes.length}), skipping replacement.`
    );
    return { buffer: result, count: 0 };
  }

  const positions = findAllOccurrences(result, oldBytes);
  for (const pos of positions) {
    newBytes.copy(result, pos);
    count++;
  }

  return { buffer: result, count };
};

/**
 * The main patching method for the client binary.
 */
const applyClientPatches = (
  data: Buffer,
  domain: string,
  protocol = "https://",
): { buffer: Buffer; count: number } => {
  let result = Buffer.from(data);
  let totalCount = 0;
  const strategy = getDomainStrategy(domain);

  console.log(`[Patcher] Client Strategy: ${strategy.description}`);

  // 1. Patch Sentry/telemetry URL
  const oldSentry =
    "https://ca900df42fcf57d4dd8401a86ddd7da2@sentry.hytale.com/2";
  const newSentry = `${protocol}t@${domain}/2`;
  const sentryResult = replaceBytes(
    result,
    stringToLengthPrefixed(oldSentry),
    stringToLengthPrefixed(newSentry),
  );
  result = sentryResult.buffer;
  if (sentryResult.count > 0) totalCount += sentryResult.count;

  // 2. Patch main domain (hytale.com -> mainDomain)
  const domainResult = replaceBytes(
    result,
    stringToLengthPrefixed(ORIGINAL_DOMAIN),
    stringToLengthPrefixed(strategy.mainDomain),
  );
  result = domainResult.buffer;
  if (domainResult.count > 0) totalCount += domainResult.count;

  // 3. Patch subdomain prefixes
  const subdomains = [
    "https://tools.",
    "https://sessions.",
    "https://account-data.",
    "https://telemetry.",
  ];
  const newSubdomainPrefix = protocol + strategy.subdomainPrefix;

  for (const sub of subdomains) {
    const subResult = replaceBytes(
      result,
      stringToLengthPrefixed(sub),
      stringToLengthPrefixed(newSubdomainPrefix),
    );
    result = subResult.buffer;
    if (subResult.count > 0) totalCount += subResult.count;
  }

  // 4. Patch Discord URL
  const oldDiscord = ".gg/hytale";
  const newDiscord = ".gg/MHkEjepMQ7";
  const discordResult = replaceBytes(
    result,
    stringToLengthPrefixed(oldDiscord),
    stringToLengthPrefixed(newDiscord),
  );
  result = discordResult.buffer;
  if (discordResult.count > 0) totalCount += discordResult.count;

  return { buffer: result, count: totalCount };
};

/**
 * Create a backup of the original file if it doesn't exist.
 */
const createBackup = (filePath: string): boolean => {
  const backupPath = filePath + BACKUP_EXTENSION;
  if (!fs.existsSync(backupPath)) {
    try {
      fs.copyFileSync(filePath, backupPath);
      console.log(`[Patcher] Created backup: ${backupPath}`);
      return true;
    } catch (error) {
      console.error(`[Patcher] Failed to create backup: ${error}`);
      return false;
    }
  }
  return true;
};

/**
 * Restore original file from backup.
 */
const restoreFromBackup = (filePath: string): boolean => {
  const backupPath = filePath + BACKUP_EXTENSION;
  if (fs.existsSync(backupPath)) {
    try {
      fs.copyFileSync(backupPath, filePath);
      fs.unlinkSync(filePath + PATCH_FLAG_FILENAME); // Also remove patch flag
      console.log(`[Patcher] Restored from backup: ${filePath}`);
      return true;
    } catch (error) {
      console.error(`[Patcher] Failed to restore from backup: ${error}`);
      return false;
    }
  }
  return false;
};

/**
 * Mark a file as patched.
 */
const markAsPatched = (filePath: string, targetDomain: string) => {
  const flagFile = filePath + PATCH_FLAG_FILENAME;
  const flagData = {
    patchedAt: new Date().toISOString(),
    targetDomain,
  };
  fs.writeFileSync(flagFile, JSON.stringify(flagData, null, 2));
};

/**
 * Check if a file is already patched for the target domain.
 */
export const isFilePatched = (filePath: string, targetDomain: string): boolean => {
  const flagFile = filePath + PATCH_FLAG_FILENAME;
  if (fs.existsSync(flagFile)) {
    try {
      const flagData = JSON.parse(fs.readFileSync(flagFile, "utf8"));
      if (flagData.targetDomain === targetDomain) {
        return true;
      }
    } catch {
      // Corrupt flag file, will re-patch.
    }
  }
  return false;
};

/**
 * Patches the client binary (HytaleClient.exe)
 */
const patchClientFile = (
  filePath: string,
  targetDomain: string,
): PatchResult => {
  try {
    console.log("[Patcher] Reading client binary...");
    const data = fs.readFileSync(filePath);

    console.log("[Patcher] Applying client domain patches...");
    const { buffer: patchedData, count } = applyClientPatches(data, targetDomain);

    if (count === 0) {
      return {
        success: true,
        patchCount: 0,
        warning: "No occurrences found to patch in client.",
      };
    }

    console.log("[Patcher] Writing patched client binary...");
    fs.writeFileSync(filePath, patchedData);
    markAsPatched(filePath, targetDomain);

    return { success: true, patchCount: count };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[Patcher] Error patching client: ${errorMessage}`);
    return { success: false, patchCount: 0, error: errorMessage };
  }
};

/**
 * Patches the server JAR by downloading a pre-patched version.
 */
const patchServer = async (
  filePath: string,
  targetDomain: string,
  progressCallback?: PatchProgress,
): Promise<PatchResult> => {
  console.log("[Patcher] Server Patcher: Using pre-patched JAR download method.");

  const PRE_PATCHED_URL = "https://pub-027b315ece074e2e891002ca38384792.r2.dev/HytaleServer.jar";

  try {
    progressCallback?.("Downloading patched server...", 70);
    await new Promise<void>((resolve, reject) => {
      const request = https.get(PRE_PATCHED_URL, (response) => {
        if (response.statusCode === 301 || response.statusCode === 302) {
          // Follow redirect
          https.get(response.headers.location!, (redirectResponse) => {
            if (redirectResponse.statusCode !== 200) {
              reject(new Error(`Failed to download: HTTP ${redirectResponse.statusCode}`));
              return;
            }
            const file = fs.createWriteStream(filePath);
            redirectResponse.pipe(file);
            file.on("finish", () => {
              file.close();
              resolve();
            });
          }).on("error", reject);
        } else if (response.statusCode === 200) {
          const file = fs.createWriteStream(filePath);
          response.pipe(file);
          file.on("finish", () => {
            file.close();
            resolve();
          });
        } else {
          reject(new Error(`Failed to download: HTTP ${response.statusCode}`));
        }
      });
      request.on("error", (err) => {
        fs.unlink(filePath, () => {}); // Best-effort cleanup
        reject(err);
      });
    });

    console.log("[Patcher] Pre-patched server downloaded successfully.");
    markAsPatched(filePath, targetDomain);
    progressCallback?.("Server patched.", 95);
    return { success: true, patchCount: 1 };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[Patcher] Error downloading pre-patched server: ${errorMessage}`);
    // Restore backup on failure
    restoreFromBackup(filePath);
    return { success: false, patchCount: 0, error: errorMessage };
  }
};

// --- Butter-Launcher Integration ---

const getClientPath = (gameDir: string, version: GameVersion): string | null => {
  migrateLegacyChannelInstallIfNeeded(gameDir, version.type);
  const installDir = resolveExistingInstallDir(gameDir, version);
  return installDir ? resolveClientPath(installDir) : null;
};

const getServerPath = (gameDir: string, version: GameVersion): string | null => {
  migrateLegacyChannelInstallIfNeeded(gameDir, version.type);
  const installDir = resolveExistingInstallDir(gameDir, version);
  return installDir ? resolveServerPath(installDir) : null;
};

/**
 * Validates the target domain length.
 */
const getValidDomain = (domain: string): string => {
    if (domain.length < MIN_DOMAIN_LENGTH || domain.length > MAX_DOMAIN_LENGTH) {
        throw new Error(`[Patcher] Domain "${domain}" is not between ${MIN_DOMAIN_LENGTH} and ${MAX_DOMAIN_LENGTH} chars.`);
    }
    return domain;
};

export const ensureClientPatched = async (
  gameDir: string,
  version: GameVersion,
  progressCallback?: PatchProgress,
  targetDomain?: string,
): Promise<{
  success: boolean;
  patchCount: number;
  client?: PatchResult;
  server?: PatchResult;
  error?: string;
}> => {
  const domain = getValidDomain(targetDomain || DEFAULT_AUTH_DOMAIN);
  const results = { success: false, patchCount: 0, client: undefined, server: undefined };

  // 1. Patch Client
  const clientPath = getClientPath(gameDir, version);
  if (clientPath && fs.existsSync(clientPath)) {
    progressCallback?.("Patching client...", 10);
    if (isFilePatched(clientPath, domain)) {
      console.log(`[Patcher] Client already patched for ${domain}`);
      results.client = { success: true, patchCount: 0, alreadyPatched: true };
    } else {
      createBackup(clientPath);
      results.client = patchClientFile(clientPath, domain);
    }
  } else {
    results.client = {
      success: false,
      patchCount: 0,
      error: "Client not found",
    };
  }

  // 2. Patch Server
  const serverPath = getServerPath(gameDir, version);
  if (serverPath && fs.existsSync(serverPath)) {
    progressCallback?.("Patching server...", 60);
    if (isFilePatched(serverPath, domain)) {
      console.log(`[Patcher] Server already patched for ${domain}`);
      results.server = { success: true, patchCount: 0, alreadyPatched: true };
    } else {
      createBackup(serverPath);
      results.server = await patchServer(serverPath, domain, progressCallback);
    }
  } else {
    results.server = {
      success: false,
      patchCount: 0,
      error: "Server not found",
    };
  }

  // 3. Finalize
  const clientOk = results.client?.success ?? false;
  const serverOk = results.server?.success ?? false;
  results.success = clientOk || serverOk; // Success if at least one patched
  results.patchCount =
    (results.client?.patchCount ?? 0) + (results.server?.patchCount ?? 0);

  if (!results.success) {
    results.error = [
      results.client?.error ? `Client: ${results.client.error}` : null,
      results.server?.error ? `Server: ${results.server.error}` : null,
    ]
      .filter(Boolean)
      .join("; ");
  }

  progressCallback?.("Patching complete", 100);
  return results;
};

export const restoreOriginals = async (
  gameDir: string,
  version: GameVersion,
  progressCallback?: PatchProgress
): Promise<{ success: boolean; clientRestored: boolean; serverRestored: boolean }> => {
  let clientRestored = false;
  let serverRestored = false;

  const clientPath = getClientPath(gameDir, version);
  if (clientPath) {
    progressCallback?.("Restoring original client...", 25);
    clientRestored = restoreFromBackup(clientPath);
  }

  const serverPath = getServerPath(gameDir, version);
  if (serverPath) {
    progressCallback?.("Restoring original server...", 75);
    serverRestored = restoreFromBackup(serverPath);
  }

  progressCallback?.("Restore complete", 100);
  return {
    success: clientRestored || serverRestored,
    clientRestored,
    serverRestored,
  };
};

export const getPatchState = (
  gameDir: string,
  version: GameVersion,
  targetDomain?: string,
): {
  supported: boolean;
  clientPatched: boolean;
  serverPatched: boolean;
  clientHasBackup: boolean;
  serverHasBackup: boolean;
} => {
  const supported =
    process.platform === "win32" ||
    process.platform === "linux" ||
    process.platform === "darwin";

  const clientPath = getClientPath(gameDir, version);
  const serverPath = getServerPath(gameDir, version);
  const domain = getValidDomain(targetDomain || DEFAULT_AUTH_DOMAIN);

  return {
    supported,
    clientPatched: clientPath ? isFilePatched(clientPath, domain) : false,
    serverPatched: serverPath ? isFilePatched(serverPath, domain) : false,
    clientHasBackup: clientPath
      ? fs.existsSync(clientPath + BACKUP_EXTENSION)
      : false,
    serverHasBackup: serverPath
      ? fs.existsSync(serverPath + BACKUP_EXTENSION)
      : false,
  };
};

export const patchGameWithProgress = async (
  gameDir: string,
  version: GameVersion,
  win: BrowserWindow,
  progressChannel = "patch-progress",
  targetDomain?: string,
): Promise<{ success: boolean; patchCount: number; error?: string }> => {
  const progressCallback: PatchProgress = (message, percent) => {
    win.webContents.send(progressChannel, {
      phase: "patching",
      message,
      percent: percent ?? -1,
    });
  };

  return ensureClientPatched(gameDir, version, progressCallback, targetDomain);
};

export default {
  ensureClientPatched,
  restoreOriginals,
  getPatchState,
  patchGameWithProgress,
  isFilePatched,
  BACKUP_EXTENSION,
  ORIGINAL_DOMAIN,
};
