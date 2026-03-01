import path from "node:path";

export type ErrorContext = {
  op: string;
  url?: string;
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

export const formatErrorWithHints = (err: unknown, ctx: ErrorContext) => {
  const code = getErrorCode(err);
  const name = getErrorName(err);
  const rawMessage = getErrorMessage(err);

  const hints: string[] = [];
  const pieces: string[] = [];

  if (typeof ctx.status === "number" && ctx.status > 0) {
    pieces.push(`HTTP ${ctx.status}`);
    if (ctx.status === 403) {
      pushUnique(
        hints,
        "Request was blocked (possible firewall/proxy/ISP/CDN restriction).",
      );
    } else if (ctx.status === 404) {
      pushUnique(hints, "The file/URL may no longer exist (404). Try later.");
    } else if (ctx.status >= 500) {
      pushUnique(hints, "Remote server may be down. Try again later.");
    }
  }

  if (name === "AbortError" || code === "ABORT_ERR") {
    pushUnique(hints, "Download was cancelled.");
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
  }

  if (code === "EBUSY") {
    pieces.push("file is in use");
    pushUnique(hints, "Close the game/launcher and try again.");
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
