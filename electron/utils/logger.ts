import fs from "node:fs";
import path from "node:path";
import { LOGS_DIRECTORY } from "./const";

if (!fs.existsSync(LOGS_DIRECTORY)) {
  fs.mkdirSync(LOGS_DIRECTORY, { recursive: true });
}

/**
 * Generates a unique log filename based on current date, time, and session index.
 */
function getUniqueLogPath(): string {
  const now = new Date();
  const dateStr = now.toISOString().split("T")[0]; // YYYY-MM-DD
  const timeStr = now.toTimeString().split(" ")[0].replace(/:/g, "-"); // HH-MM-SS

  const baseName = `${dateStr}_${timeStr}`;
  let session = 1;

  let logPath = path.join(LOGS_DIRECTORY, `${baseName}_session-${session}.log`);

  // If a file with the same timestamp exists, increment the session index
  while (fs.existsSync(logPath)) {
    session++;
    logPath = path.join(LOGS_DIRECTORY, `${baseName}_session-${session}.log`);
  }

  return logPath;
}

const logFile = getUniqueLogPath();

/**
 * Utility to log messages to both console and a log file.
 */
function formatMessage(level: string, ...args: any[]) {
  const timestamp = new Date().toISOString();

  const redactUrlQueryForLogs = (input: string): string => {
    // Redact query-string parts of http(s) URLs so we don't persist signed tokens in log files.
    // Only affects logs; callers still use the original URLs for requests.
    const urlRegex = /https?:\/\/[^\s]+/g;
    return input.replace(urlRegex, (raw) => {
      // Some log strings may include trailing punctuation after the URL.
      // Peel off common trailing chars until we can safely operate.
      let candidate = raw;
      let suffix = "";
      while (candidate.length) {
        const last = candidate[candidate.length - 1];
        if (last && ")]}>,.;\"'".includes(last)) {
          suffix = last + suffix;
          candidate = candidate.slice(0, -1);
          continue;
        }
        break;
      }

      const q = candidate.indexOf("?");
      if (q === -1) return raw;
      return candidate.slice(0, q) + suffix;
    });
  };

  const redactSensitiveTextForLogs = (input: string): string => {
    let out = String(input ?? "");

    // Redact CLI flags (plain text).
    out = out.replace(/(\-\-(?:session-token|identity-token))\s+(\S+)/gi, "$1 ****");
    out = out.replace(/(\-\-(?:session-token|identity-token))=([^\s]+)/gi, "$1=****");

    // Redact CLI flags when logged as JSON arrays: ["--session-token","VALUE"].
    out = out.replace(/("\-\-(?:session-token|identity-token)"\s*,\s*")([^"]*)(")/gi, "$1****$3");

    // Redact JSON fields that commonly contain the tokens.
    out = out.replace(/("(?:identityToken|sessionToken)"\s*:\s*")([^"]*)(")/g, "$1****$3");

    return out;
  };

  const redactSensitiveStructuredForLogs = (value: any, seen: WeakSet<object>): any => {
    if (typeof value === "string") return redactSensitiveTextForLogs(value);
    if (typeof value !== "object" || value === null) return value;

    if (seen.has(value)) return "[Circular]";
    seen.add(value);

    if (Array.isArray(value)) {
      const out = value.slice();
      for (let i = 0; i < out.length; i++) {
        const v = out[i];
        if (typeof v === "string") {
          const lower = v.toLowerCase();
          if ((lower === "--session-token" || lower === "--identity-token") && typeof out[i + 1] === "string") {
            out[i + 1] = "****";
            i++;
            continue;
          }

          // Also handle --flag=value form inside arrays.
          out[i] = redactSensitiveTextForLogs(v);
        } else {
          out[i] = redactSensitiveStructuredForLogs(v, seen);
        }
      }
      return out;
    }

    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      if (k === "identityToken" || k === "sessionToken") {
        out[k] = "****";
        continue;
      }
      out[k] = redactSensitiveStructuredForLogs(v, seen);
    }
    return out;
  };

  const render = (arg: any): string => {
    if (arg instanceof Error) {
      const base = `${arg.name}: ${arg.message}`;
      const stack = arg.stack ? `\n${arg.stack}` : "";
      const cause = (arg as any).cause;
      if (cause) {
        const causeStr =
          cause instanceof Error
            ? `${cause.name}: ${cause.message}`
            : typeof cause === "object"
              ? JSON.stringify(cause, null, 2)
              : String(cause);
        return `${base}${stack}\nCause: ${causeStr}`;
      }
      return `${base}${stack}`;
    }

    if (typeof arg === "object" && arg !== null) {
      try {
        const redacted = redactSensitiveStructuredForLogs(arg, new WeakSet());
        return JSON.stringify(redacted, null, 2);
      } catch {
        return Object.prototype.toString.call(arg);
      }
    }

    return redactSensitiveTextForLogs(String(arg));
  };

  const message = args.map(render).join(" ");
  const redacted = redactSensitiveTextForLogs(redactUrlQueryForLogs(message));
  return `[${timestamp}] [${level.toUpperCase()}] ${redacted}`;
}

const writeToLog = (msg: string) => {
  try {
    fs.appendFileSync(logFile, msg + "\n");
  } catch (err) {
    // If logging fails, we only have console left
    console.error("Failed to write to log file:", err);
  }
};

export const logger = {
  info: (...args: any[]) => {
    const msg = formatMessage("info", ...args);
    console.log(`\x1b[34m${msg}\x1b[0m`);
    writeToLog(msg);
  },
  warn: (...args: any[]) => {
    const msg = formatMessage("warn", ...args);
    console.warn(`\x1b[33m${msg}\x1b[0m`);
    writeToLog(msg);
  },
  error: (...args: any[]) => {
    const msg = formatMessage("error", ...args);
    console.error(`\x1b[31m${msg}\x1b[0m`);
    writeToLog(msg);
  },
  getLogPath: () => logFile,
};
