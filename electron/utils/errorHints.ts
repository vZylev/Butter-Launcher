import path from "node:path";

export type ErrorContext = {
  op: string;
  url?: string;
  urlMeta?: {
    host?: string;
    timestampMs?: number;
    nowMs?: number;
  };
  filePath?: string;
  dirPath?: string;
  status?: number;
};

type AnyError = {
  name?: string;
  message?: string;
  stack?: string;
  code?: string;
  errno?: number;
  syscall?: string;
  path?: string;
  cause?: any;
};

const getErrObject = (err: unknown): AnyError | null => {
  if (!err) return null;
  if (typeof err === "object") return err as AnyError;
  return null;
};

export const getErrorCode = (err: unknown): string | undefined => {
  const e = getErrObject(err);
  const direct = e?.code;
  if (typeof direct === "string" && direct) return direct;
  const cause = e?.cause;
  if (cause && typeof cause === "object" && typeof cause.code === "string") {
    return cause.code;
  }
  return undefined;
};

const getErrorName = (err: unknown): string | undefined => {
  const e = getErrObject(err);
  if (typeof e?.name === "string" && e.name) return e.name;
  return undefined;
};

const getErrorMessage = (err: unknown): string => {
  if (err instanceof Error) return err.message || String(err);
  if (typeof err === "string") return err;
  const e = getErrObject(err);
  if (typeof e?.message === "string") return e.message;
  return String(err);
};

const winDriveHint = (filePath?: string) => {
  if (!filePath) return null;
  try {
    const root = path.parse(filePath).root; // e.g. C:\
    return root ? root.replace(/\\$/, "") : null;
  } catch {
    return null;
  }
};

const pushUnique = (arr: string[], item: string) => {
  if (!item) return;
  if (!arr.includes(item)) arr.push(item);
};

const parseUrlMetaFromUrl = (rawUrl?: string): ErrorContext["urlMeta"] | undefined => {
  if (!rawUrl) return undefined;
  try {
    const u = new URL(rawUrl);
    const host = u.hostname;
    const tsRaw = u.searchParams.get("timestamp");
    const ts = tsRaw ? Number(tsRaw) : NaN;
    const timestampMs = Number.isFinite(ts) && ts > 0 ? ts : undefined;
    return { host, timestampMs, nowMs: Date.now() };
  } catch {
    return undefined;
  }
};

const fmtAge = (ageMs: number): string => {
  const s = Math.max(0, Math.floor(ageMs / 1000));
  if (s < 120) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 180) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h`;
};

export const formatErrorWithHints = (err: unknown, ctx: ErrorContext) => {
  const code = getErrorCode(err);
  const name = getErrorName(err);
  const rawMessage = getErrorMessage(err);

  const hints: string[] = [];
  const pieces: string[] = [];

  const urlMeta = ctx.urlMeta ?? parseUrlMetaFromUrl(ctx.url);
  const urlAgeMs =
    typeof urlMeta?.timestampMs === "number" && Number.isFinite(urlMeta.timestampMs)
      ? (urlMeta.nowMs ?? Date.now()) - urlMeta.timestampMs
      : undefined;
  const urlLooksSigned =
    typeof urlMeta?.timestampMs === "number" && Number.isFinite(urlMeta.timestampMs);

  if (typeof ctx.status === "number" && ctx.status > 0) {
    pieces.push(`HTTP ${ctx.status}`);
    if (ctx.status === 401) {
      pushUnique(
        hints,
        "Request was unauthorized (401). If this download link is time-limited, it may have expired — retry to refresh it.",
      );
    } else if (ctx.status === 403) {
      pushUnique(
        hints,
        "Request was blocked (possible firewall/proxy/ISP/CDN restriction).",
      );
      pushUnique(
        hints,
        "Forbidden (403). If this is a signed/time-limited link, it may have expired — retry to refresh it.",
      );
    } else if (ctx.status === 404) {
      pushUnique(
        hints,
        "Not found (404). The requested file/build may not exist anymore, or the link may be stale.",
      );
    } else if (ctx.status === 410) {
      pushUnique(
        hints,
        "Gone (410). This usually indicates an expired or removed link — retry to refresh it.",
      );
    } else if (ctx.status === 429) {
      pushUnique(hints, "Rate limited (429). Wait a bit and retry.");
    } else if (ctx.status >= 500) {
      pushUnique(hints, "Remote server may be down. Try again later.");
    }

    if ((ctx.status === 401 || ctx.status === 403 || ctx.status === 410) && urlLooksSigned) {
      const age = typeof urlAgeMs === "number" && urlAgeMs > 0 ? fmtAge(urlAgeMs) : null;
      pushUnique(
        hints,
        `Signed URL timestamp detected${age ? ` (age: ${age})` : ""}. This strongly suggests an expired link; retry should refresh it.`,
      );
    }
  }

  if (
    (ctx.status === 401 || ctx.status === 403 || ctx.status === 410) &&
    /expired|timestamp|signature|token/i.test(rawMessage)
  ) {
    pushUnique(
      hints,
      "Server response mentions expiration/signature. This is likely an expired signed link; retry should refresh it.",
    );
  }

  if (name === "AbortError" || code === "ABORT_ERR") {
    pushUnique(hints, "Download was cancelled.");
  }

  if (code === "UND_ERR_SOCKET" || /\bterminated\b/i.test(rawMessage)) {
    pieces.push("connection interrupted");
    pushUnique(
      hints,
      "The download connection was interrupted (server closed the socket). Retry — it usually succeeds on the next attempt.",
    );
    pushUnique(
      hints,
      "If it keeps failing: disable VPN/proxy, check firewall/antivirus (Controlled Folder Access), or try another network.",
    );
  }

  if (code === "ENOSPC") {
    const drive = winDriveHint(ctx.filePath || ctx.dirPath);
    pieces.push("not enough disk space");
    pushUnique(
      hints,
      `Free up space${drive ? ` on ${drive}` : ""} or change Download Directory.`,
    );
  }

  if (code === "EACCES" || code === "EPERM") {
    pieces.push("permission denied");
    pushUnique(
      hints,
      "Try a different folder, run as admin, or check antivirus/controlled-folder-access.",
    );

    const loc = String(ctx.dirPath || ctx.filePath || "").toLowerCase();
    if (loc.includes("hytale\\game") || loc.includes("hytale/game")) {
      pushUnique(
        hints,
        "The game folder may be in use or running in the background. Open Task Manager and close HytaleClient.exe and the singleplayer server (java.exe / HytaleServer.jar), then retry.",
      );
    }
  }

  if (code === "EBUSY") {
    pieces.push("file is in use");
    pushUnique(hints, "Close the game/launcher and try again.");

    const loc = String(ctx.dirPath || ctx.filePath || "").toLowerCase();
    if (loc.includes("hytale\\game") || loc.includes("hytale/game")) {
      pushUnique(
        hints,
        "Open Task Manager and close HytaleClient.exe and the singleplayer server (java.exe / HytaleServer.jar), then retry.",
      );
    }
  }

  if (
    code === "ENOTFOUND" ||
    code === "EAI_AGAIN" ||
    code === "ECONNREFUSED" ||
    code === "ETIMEDOUT" ||
    code === "ECONNRESET" ||
    code === "ENETUNREACH" ||
    code === "EHOSTUNREACH"
  ) {
    pieces.push("network error");
    pushUnique(hints, "Check your internet connection.");
    pushUnique(hints, "Check firewall/proxy/VPN settings.");
    pushUnique(hints, "If you are behind a corporate/school network, it may block downloads.");
  }

  if (/certificate|tls|SSL|CERT/i.test(rawMessage)) {
    pushUnique(hints, "TLS/certificate error. Check system date/time and HTTPS inspection software.");
  }

  if (/zip|end of central directory|invalid/i.test(rawMessage)) {
    pushUnique(hints, "Archive may be corrupted. Try re-downloading.");
    pushUnique(hints, "Antivirus can corrupt/quarantine extracted files; try temporarily disabling it.");
  }

  if (
    /butler\s+apply\s+failed/i.test(rawMessage) &&
    /The system cannot find the (?:path|file) specified\./i.test(rawMessage)
  ) {
    pushUnique(
      hints,
      "A previous/seeded game install may be incomplete. Try deleting the install folder and reinstalling from scratch.",
    );
    pushUnique(
      hints,
      "Antivirus/Controlled Folder Access can block creation of some folders/files; try temporarily disabling it or using a different install directory.",
    );
  }

  const locationBits: string[] = [];
  if (ctx.url) locationBits.push(`URL: ${ctx.url}`);
  if (urlMeta?.host) locationBits.push(`Host: ${urlMeta.host}`);
  if (typeof urlMeta?.timestampMs === "number" && Number.isFinite(urlMeta.timestampMs)) {
    locationBits.push(`URL timestamp: ${urlMeta.timestampMs}`);
  }
  if (ctx.filePath) locationBits.push(`File: ${ctx.filePath}`);
  if (ctx.dirPath) locationBits.push(`Dir: ${ctx.dirPath}`);

  const reasonBits = [
    code ? `code=${code}` : null,
    name ? `name=${name}` : null,
    pieces.length ? pieces.join(", ") : null,
  ].filter(Boolean);

  const base = `${ctx.op} failed`;
  const reason = reasonBits.length ? ` (${reasonBits.join(", ")})` : "";

  const detailsLine = rawMessage ? `\nDetails: ${rawMessage}` : "";
  const locationLine = locationBits.length ? `\n${locationBits.join("\n")}` : "";
  const hintsLine = hints.length ? `\nHints: ${hints.join(" ")}` : "";

  const userMessage = `${base}${reason}.${detailsLine}${locationLine}${hintsLine}`.trim();

  return {
    userMessage,
    meta: {
      ctx,
      code,
      name,
      rawMessage,
      hints,
    },
  };
};
