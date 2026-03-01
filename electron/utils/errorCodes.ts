import { getErrorCode } from "./errorHints";

export const ErrorCodes = {
  UNKNOWN: 1000,

  OP_IN_PROGRESS: 1601,

  // Common OS/filesystem
  DISK_FULL: 1101,
  PERMISSION: 1102,
  FILE_IN_USE: 1103,
  MAC_QUARANTINE: 1104,
  PATH_TOO_LONG: 1105,
  NOT_FOUND: 1106,
  IO_ERROR: 1107,

  // Network/HTTP
  NETWORK: 1201,
  HTTP_4XX: 1202,
  HTTP_5XX: 1203,
  TLS_CERT: 1204,
  RATE_LIMIT: 1205,

  // Archives / integrity
  HASH_MISMATCH: 1301,
  ARCHIVE_CORRUPT: 1302,

  // Butler / tooling
  BUTLER_FAILED: 1401,

  // Auth / launch
  AUTH_FAILED: 1501,
  LAUNCH_FAILED: 1502,
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

const getHttpStatusFromMessage = (msg: string): number | null => {
  const m = msg.match(/\bHTTP\s+(\d{3})\b/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
};

const messageContains = (msg: string, needles: string[]) => {
  const lower = msg.toLowerCase();
  return needles.some((n) => lower.includes(n.toLowerCase()));
};

const getCauseChain = (err: unknown): unknown[] => {
  const chain: unknown[] = [];
  let cur: any = err;
  for (let i = 0; i < 5; i++) {
    if (!cur) break;
    chain.push(cur);
    const next = typeof cur === "object" ? (cur as any).cause : undefined;
    if (!next || next === cur) break;
    cur = next;
  }
  return chain;
};

export const mapErrorToCode = (
  err: unknown,
  opts?: { area?: "install" | "online-patch" | "launch" | "auth" | "tools" },
): ErrorCode => {
  const chain = getCauseChain(err);

  // Prefer OS error codes from any cause.
  for (const e of chain) {
    const code = getErrorCode(e);
    if (code === "ENOSPC") return ErrorCodes.DISK_FULL;
    if (code === "EACCES" || code === "EPERM") return ErrorCodes.PERMISSION;
    if (code === "EBUSY") return ErrorCodes.FILE_IN_USE;
    if (code === "ENAMETOOLONG") return ErrorCodes.PATH_TOO_LONG;
    if (code === "ENOENT") return ErrorCodes.NOT_FOUND;
    if (code === "EIO") return ErrorCodes.IO_ERROR;

    if (
      code === "ENOTFOUND" ||
      code === "EAI_AGAIN" ||
      code === "ECONNREFUSED" ||
      code === "ETIMEDOUT" ||
      code === "ECONNRESET" ||
      code === "ENETUNREACH" ||
      code === "EHOSTUNREACH"
    ) {
      return ErrorCodes.NETWORK;
    }
  }

  const msg =
    err instanceof Error
      ? err.message || ""
      : typeof err === "string"
        ? err
        : ((err as any)?.message as string) || "";

  const status = getHttpStatusFromMessage(msg);
  if (typeof status === "number") {
    if (status === 429) return ErrorCodes.RATE_LIMIT;
    if (status >= 500) return ErrorCodes.HTTP_5XX;
    if (status >= 400) return ErrorCodes.HTTP_4XX;
  }

  if (messageContains(msg, ["hash mismatch", "sha256 mismatch"])) {
    return ErrorCodes.HASH_MISMATCH;
  }

  if (messageContains(msg, ["already in progress"])) return ErrorCodes.OP_IN_PROGRESS;

  if (
    messageContains(msg, [
      "certificate",
      "self signed",
      "unable to verify",
      "CERT_",
      "tls",
      "SSL",
    ])
  ) {
    return ErrorCodes.TLS_CERT;
  }

  // macOS Gatekeeper / quarantine symptom strings
  if (messageContains(msg, ["is damaged", "cannot be opened", "quarantine"])) {
    return ErrorCodes.MAC_QUARANTINE;
  }

  if (
    messageContains(msg, [
      "end of central directory",
      "invalid",
      "zip",
      "archive",
      "extract",
    ])
  ) {
    return ErrorCodes.ARCHIVE_CORRUPT;
  }

  if (opts?.area === "auth") return ErrorCodes.AUTH_FAILED;
  if (opts?.area === "launch") return ErrorCodes.LAUNCH_FAILED;
  if (opts?.area === "tools") return ErrorCodes.BUTLER_FAILED;

  // Catch common tool failures.
  if (messageContains(msg, ["butler", "exit code"])) return ErrorCodes.BUTLER_FAILED;

  return ErrorCodes.UNKNOWN;
};
