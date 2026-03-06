import fs from "node:fs";
import path from "node:path";
import { logger } from "../logger";

const DIRECT_CONNECT_PHRASE = "Direct connecting to multiplayer server at";
const CONNECTING_PHRASE = "Connecting to server";
const OPENING_QUIC_PHRASE = "Opening Quic Connection to";
const SINGLEPLAYER_CONNECT_PHRASE = "Connecting to singleplayer world";
const SINGLEPLAYER_SERVER_CONNECT_PHRASE = "Connecting to singleplayer server on port";

const pickLatestFile = async (dir: string): Promise<string | null> => {
  let dirents: fs.Dirent[] = [];
  try {
    dirents = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return null;
  }

  const files = dirents
    .filter((d) => d.isFile())
    .map((d) => path.join(dir, d.name));

  if (!files.length) return null;

  let best: { file: string; mtimeMs: number } | null = null;
  for (const f of files) {
    try {
      const st = await fs.promises.stat(f);
      const mtimeMs = typeof st.mtimeMs === "number" ? st.mtimeMs : 0;
      if (!best || mtimeMs > best.mtimeMs) best = { file: f, mtimeMs };
    } catch {
      // ignore
    }
  }

  return best?.file ?? null;
};

const parseTargetAfterPhrase = (line: string, phrase: string): string | null => {
  const idx = line.indexOf(phrase);
  if (idx === -1) return null;

  let rest = line.slice(idx + phrase.length).trim();
  if (!rest) return null;

  const token = rest.split(/\s+/)[0] ?? "";
  const cleaned = token
    .replace(/^[\[\(\{\<\"']+/g, "")
    .replace(/[\]\)\}\>\,.;\"']+$/g, "")
    .trim();
  return cleaned || null;
};

const isConnectionFailureLine = (line: string): boolean => {
  return (
    line.includes("Disconnected during loading") ||
    line.includes("Failed to connect to ") ||
    line.includes("Changing from Stage GameLoading to Disconnection") ||
    line.includes("Changing from loading stage Loading to Aborted")
  );
};

const isConnectionSuccessLine = (line: string): boolean => {
  // Observed in logs: this happens once the game fully joined the world.
  return line.includes("Changing from Stage GameLoading to InGame");
};

const parseInGameExit = (line: string): string | null => {
  const m = line.match(/\bChanging from Stage\s+InGame\s+to\s+([A-Za-z0-9_]+)\b/);
  if (!m) return null;
  return m[1] ?? null;
};

export const startClientLogTail = (opts: {
  logsDir: string;
  label?: string;
  onMultiplayerConnected?: (server: string) => void;
  onSingleplayerEntered?: () => void;
  onSessionLeft?: (payload: { mode: "multiplayer" | "singleplayer"; server?: string; toStage?: string }) => void;
}): { stop: () => void } => {
  const logsDir = opts.logsDir;
  const label = opts.label ?? "client-log";

  // Used to avoid replaying a previous session's log when the new one hasn't been created yet.
  // If we attach to a file that clearly predates this timestamp, we start at EOF.
  const startMs = Date.now();

  let stopped = false;
  let currentFile: string | null = null;
  let offset = 0;
  let carry = "";

  type PendingSession =
    | { mode: "multiplayer"; server: string }
    | { mode: "singleplayer" };

  type ConnectedSession =
    | { mode: "multiplayer"; server: string }
    | { mode: "singleplayer" };

  // Session tracking (so we only emit multiplayer server on confirmed success).
  let pendingSession: PendingSession | null = null;
  let connectedSession: ConnectedSession | null = null;

  let pendingAttachDecision = false;
  let pendingAttachDecisionFile: string | null = null;

  let dirWatcher: fs.FSWatcher | null = null;
  let pollTimer: NodeJS.Timeout | null = null;
  let scanTimer: NodeJS.Timeout | null = null;
  let pendingTimer: NodeJS.Timeout | null = null;

  const scheduleRead = (reason: string) => {
    if (stopped) return;
    if (pendingTimer) return;

    // Debounce bursts from fs.watch.
    pendingTimer = setTimeout(() => {
      pendingTimer = null;
      void readNewBytes(reason);
    }, 50);
  };

  const switchToFile = (nextFile: string) => {
    if (currentFile === nextFile) return;

    // Decide where to start reading this file.
    // - Old/pre-existing log => start at EOF (skip historical lines)
    // - Fresh log for this session => start at BOF (capture early lines)
    let nextOffset = 0;
    pendingAttachDecision = false;
    pendingAttachDecisionFile = null;
    try {
      const st = fs.statSync(nextFile);
      const size = typeof st.size === "number" ? st.size : 0;

      const birth = typeof st.birthtimeMs === "number" ? st.birthtimeMs : 0;
      const ctime = typeof st.ctimeMs === "number" ? st.ctimeMs : 0;
      const mtime = typeof st.mtimeMs === "number" ? st.mtimeMs : 0;
      const createdApprox = birth || ctime || mtime;

      // Allow a small grace window for clock/timestamp quirks.
      const isFresh = createdApprox >= startMs - 1000;
      nextOffset = isFresh ? 0 : size;
    } catch {
      // If we can't stat right now, decide on the first successful stat in readNewBytes.
      pendingAttachDecision = true;
      pendingAttachDecisionFile = nextFile;
      nextOffset = 0;
    }

    currentFile = nextFile;
    offset = nextOffset;
    carry = "";

    logger.info(`[${label}] Tailing game log`, { file: currentFile, offset });
    scheduleRead("switch");
  };

  const ensureCurrentFile = async () => {
    if (stopped) return;

    // If current file missing, pick latest.
    if (currentFile) {
      try {
        await fs.promises.access(currentFile, fs.constants.F_OK);
        return;
      } catch {
        currentFile = null;
        offset = 0;
        carry = "";
      }
    }

    const latest = await pickLatestFile(logsDir);
    if (latest) switchToFile(latest);
  };

  const scanForNewerFile = async () => {
    if (stopped) return;

    const latest = await pickLatestFile(logsDir);
    if (!latest) return;

    if (!currentFile) {
      switchToFile(latest);
      return;
    }

    try {
      const [a, b] = await Promise.all([
        fs.promises.stat(currentFile),
        fs.promises.stat(latest),
      ]);
      const aM = typeof a.mtimeMs === "number" ? a.mtimeMs : 0;
      const bM = typeof b.mtimeMs === "number" ? b.mtimeMs : 0;
      if (bM > aM) switchToFile(latest);
    } catch {
      // ignore
    }
  };

  const handleLine = (line: string) => {
    if (!line) return;

    // Singleplayer attempt (no server ip/host).
    if (
      line.includes(SINGLEPLAYER_CONNECT_PHRASE) ||
      line.includes(SINGLEPLAYER_SERVER_CONNECT_PHRASE)
    ) {
      pendingSession = { mode: "singleplayer" };
    }

    // Update pending target from any of the known "attempt" lines.
    const t1 = parseTargetAfterPhrase(line, DIRECT_CONNECT_PHRASE);
    if (t1) pendingSession = { mode: "multiplayer", server: t1 };

    const t2 = parseTargetAfterPhrase(line, CONNECTING_PHRASE);
    if (t2 && pendingSession?.mode !== "singleplayer") {
      pendingSession = { mode: "multiplayer", server: t2 };
    }

    const t3 = parseTargetAfterPhrase(line, OPENING_QUIC_PHRASE);
    if (t3 && pendingSession?.mode !== "singleplayer") {
      pendingSession = { mode: "multiplayer", server: t3 };
    }

    // Clear pending on failures (do not log anything).
    if (isConnectionFailureLine(line)) {
      pendingSession = null;
      return;
    }

    // Log only on confirmed success.
    if (isConnectionSuccessLine(line)) {
      if (!connectedSession && pendingSession) {
        connectedSession = pendingSession.mode === "multiplayer"
          ? { mode: "multiplayer", server: pendingSession.server }
          : { mode: "singleplayer" };
        pendingSession = null;

        if (connectedSession.mode === "multiplayer") {
          logger.info(`connection to multiplayer server ${connectedSession.server}`);
          try {
            opts.onMultiplayerConnected?.(connectedSession.server);
          } catch {
            // ignore
          }
        } else {
          logger.info("entered singleplayer");
          try {
            opts.onSingleplayerEntered?.();
          } catch {
            // ignore
          }
        }
      }
      return;
    }

    // Leaving the server (only after we were actually connected).
    const exitTo = parseInGameExit(line);
    if (exitTo && connectedSession) {
      // MainMenu is the common "left" path; Disconnection/Exited also happen.
      if (connectedSession.mode === "multiplayer") {
        logger.info(`left multiplayer server ${connectedSession.server}`);
      } else {
        logger.info("left singleplayer");
      }
      try {
        opts.onSessionLeft?.({
          mode: connectedSession.mode,
          server: connectedSession.mode === "multiplayer" ? connectedSession.server : undefined,
          toStage: exitTo,
        });
      } catch {
        // ignore
      }
      connectedSession = null;
      pendingSession = null;
    }
  };

  const processChunkAsLines = (chunk: string) => {
    const text = carry + chunk;
    const parts = text.split(/\r?\n/);
    carry = parts.pop() ?? "";

    for (const line of parts) {
      handleLine(line);
    }
  };

  const readNewBytes = async (reason: string) => {
    if (stopped) return;

    // Directory might not exist yet; wait.
    try {
      const stDir = await fs.promises.stat(logsDir);
      if (!stDir.isDirectory()) return;
    } catch {
      return;
    }

    await ensureCurrentFile();
    if (!currentFile) return;

    let st: fs.Stats;
    try {
      st = await fs.promises.stat(currentFile);
    } catch {
      return;
    }

    const size = typeof st.size === "number" ? st.size : 0;

    // If we couldn't stat on switch, decide now whether this file is fresh.
    if (pendingAttachDecision && pendingAttachDecisionFile === currentFile) {
      const birth = typeof st.birthtimeMs === "number" ? st.birthtimeMs : 0;
      const ctime = typeof st.ctimeMs === "number" ? st.ctimeMs : 0;
      const mtime = typeof st.mtimeMs === "number" ? st.mtimeMs : 0;
      const createdApprox = birth || ctime || mtime;
      const isFresh = createdApprox >= startMs - 1000;

      if (!isFresh) {
        offset = size;
        carry = "";
      }

      pendingAttachDecision = false;
      pendingAttachDecisionFile = null;

      if (!isFresh) return;
    }

    // If rotated/truncated, restart.
    if (size < offset) {
      offset = 0;
      carry = "";
    }

    if (size === offset) return;

    const len = size - offset;
    // Safety: avoid reading absurd amounts in one tick.
    const maxRead = 1024 * 1024; // 1MB
    const toRead = Math.min(len, maxRead);

    let handle: fs.promises.FileHandle | null = null;
    try {
      handle = await fs.promises.open(currentFile, "r");
      const buf = Buffer.alloc(toRead);
      const { bytesRead } = await handle.read(buf, 0, toRead, offset);
      if (bytesRead > 0) {
        offset += bytesRead;
        processChunkAsLines(buf.subarray(0, bytesRead).toString("utf8"));
      }

      // If we hit the maxRead cap, schedule another immediate pass.
      if (len > maxRead) scheduleRead(`catch-up:${reason}`);
    } catch {
      // ignore
    } finally {
      try {
        await handle?.close();
      } catch {
        // ignore
      }
    }
  };

  const start = () => {
    logger.info(`[${label}] Starting client log tail`, { logsDir });

    // Watch directory for changes (best-effort; fs.watch can be flaky on some setups).
    try {
      dirWatcher = fs.watch(logsDir, { persistent: false }, (eventType) => {
        if (stopped) return;
        if (eventType === "rename") void scanForNewerFile();
        scheduleRead(`watch:${eventType}`);
      });
    } catch {
      dirWatcher = null;
    }

    // Poll for appended bytes.
    pollTimer = setInterval(() => scheduleRead("poll"), 250);

    // Periodically look for a newly-created log file.
    scanTimer = setInterval(() => {
      void scanForNewerFile();
    }, 2000);

    // Kickstart.
    scheduleRead("start");
  };

  const stop = () => {
    if (stopped) return;
    stopped = true;

    try {
      dirWatcher?.close();
    } catch {
      // ignore
    }
    dirWatcher = null;

    if (pollTimer) clearInterval(pollTimer);
    if (scanTimer) clearInterval(scanTimer);
    if (pendingTimer) clearTimeout(pendingTimer);

    pollTimer = null;
    scanTimer = null;
    pendingTimer = null;

    currentFile = null;
    offset = 0;
    carry = "";

    pendingSession = null;
    connectedSession = null;

    logger.info(`[${label}] Stopped client log tail`);
  };

  start();
  return { stop };
};
