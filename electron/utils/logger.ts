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
        return JSON.stringify(arg, null, 2);
      } catch {
        return Object.prototype.toString.call(arg);
      }
    }

    return String(arg);
  };

  const message = args.map(render).join(" ");
  const redacted = redactUrlQueryForLogs(message);
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
