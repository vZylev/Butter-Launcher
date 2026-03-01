import { Client, type SetActivity } from "@kostya-main/discord-rpc";
import { logger } from "./logger";

// Discord RPC: because nothing says "serious launcher" like presence updates.

const dateElapsed = Date.now();

const clientId = "1461691220454543484";
const client = new Client({ clientId });

let rpcEnabled = false;
let rpcReady = false;
let rpcConnecting = false;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectDelayMs = 1500;
const RECONNECT_DELAY_MAX_MS = 30_000;

let rpcActivity: SetActivity = {
  startTimestamp: dateElapsed,
  details: "Choosing Version",
  largeImageKey: "butterlauncher",
  largeImageText: "Butter Launcher",
  buttons: [
    {
      label: "Play Hytale the right way",
      url: "https://butterlauncher.tech",
    },
  ],
};

const normalizeErr = (err: any): { message: string; name?: string; code?: string } => {
  try {
    if (!err) return { message: "(unknown)" };
    const message =
      typeof err?.message === "string"
        ? err.message
        : typeof err === "string"
          ? err
          : JSON.stringify(err);
    const name = typeof err?.name === "string" ? err.name : undefined;
    const code = typeof err?.code === "string" ? err.code : undefined;
    return { message, name, code };
  } catch {
    return { message: String(err) };
  }
};

const clearReconnectTimer = () => {
  if (!reconnectTimer) return;
  clearTimeout(reconnectTimer);
  reconnectTimer = null;
};

const scheduleReconnect = () => {
  if (!rpcEnabled) return;
  if (reconnectTimer) return;

  const delay = reconnectDelayMs;
  reconnectDelayMs = Math.min(
    RECONNECT_DELAY_MAX_MS,
    Math.max(1500, Math.round(reconnectDelayMs * 1.6)),
  );

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void ensureConnected();
  }, delay);
};

const flushActivityBestEffort = () => {
  if (!rpcEnabled) return;
  if (!rpcReady) return;

  // Push whatever the latest desired activity is.
  // If Discord had a brief nap (timeout), this is our gentle "hey, you're awake".
  client.user?.setActivity(rpcActivity).catch((err: any) => {
    const e = normalizeErr(err);
    logger.error("Discord RPC setActivity failed", e);
    rpcReady = false;
    scheduleReconnect();
  });
};

const ensureConnected = async () => {
  if (!rpcEnabled) return;
  if (rpcReady) return;
  if (rpcConnecting) return;

  rpcConnecting = true;
  try {
    await client.login();
    // 'ready' event will flip rpcReady and flush activity.
  } catch (err: any) {
    const e = normalizeErr(err);
    logger.error("Discord RPC login failed", e);
    rpcReady = false;
    scheduleReconnect();
  } finally {
    rpcConnecting = false;
  }
};

export const setChoosingVersionActivity = () => {
  setActivity({
    startTimestamp: dateElapsed,
    details: "Choosing Version",
    state: undefined,
    // No small image while in launcher UI.
    smallImageKey: undefined,
    smallImageText: undefined,
  });
};

export const setPlayingActivity = (version: GameVersion) => {
  const build =
    version.build_name || `Build-${version.build_index} ${version.type}`;
  setActivity({
    startTimestamp: Date.now(),
    details: "Playing Hytale",
    state: build,
    // Show small bubble with Hytale icon while playing.
    smallImageKey: "hytale",
    smallImageText: "Hytale",
  });
};

export const setActivity = (activity?: SetActivity) => {
  rpcActivity = {
    ...rpcActivity,
    ...activity,
  };

  if (!rpcEnabled) return;
  if (!rpcReady) {
    void ensureConnected();
    return;
  }

  flushActivityBestEffort();
};

export const connectRPC = async () => {
  rpcEnabled = true;
  reconnectDelayMs = 1500;
  clearReconnectTimer();

  // Set the desired initial state immediately; we'll deliver it when Discord is reachable.
  setChoosingVersionActivity();
  void ensureConnected();
};

export const clearActivity = async () => {
  logger.info("Clearing Discord RPC activity");

  try {
    // Depending on timing, client.user may be undefined even if the IPC pipe is open.
    // Try both surfaces (library versions differ).
    await Promise.resolve((client.user as any)?.clearActivity?.());
    await Promise.resolve((client as any)?.clearActivity?.());
  } catch (err: any) {
    const e = normalizeErr(err);
    const msg = `${e.code || e.name || "ERR"}: ${e.message}`;
    // If Discord already closed the pipe, there's nothing left to clear.
    // Treat it as a normal shutdown race, not as a crime scene.
    if (
      String(e.code || "") === "CONNECTION_ENDED" ||
      /closed by discord/i.test(e.message) ||
      /connection_ended/i.test(e.message)
    ) {
      logger.info("Discord RPC clearActivity skipped (connection already closed)", { msg });
      return;
    }

    logger.warn("Discord RPC clearActivity failed", { msg });
  }
};

export const disconnectRPC = async () => {
  logger.info("Disconnecting Discord RPC");

  rpcEnabled = false;
  rpcReady = false;
  reconnectDelayMs = 1500;
  clearReconnectTimer();

  await clearActivity();

  // Destroy/close the IPC connection to Discord so presence doesn't linger.
  try {
    await Promise.resolve((client as any).destroy?.());

    // Extra belt-and-suspenders: close underlying transport if exposed.
    try {
      (client as any).transport?.close?.();
    } catch {
      // ignore
    }

    // Give Discord a beat to receive the clear message.
    await new Promise((r) => setTimeout(r, 150));
  } catch (err: any) {
    logger.error("An error occurred while disconnecting Discord RPC", err);
  }
};

// on RPC is ready
client.on("ready", () => {
  rpcReady = true;
  reconnectDelayMs = 1500;
  logger.info("Discord RPC connected");
  flushActivityBestEffort();
});

client.on("disconnected", () => {
  rpcReady = false;
  scheduleReconnect();
});

client.on("error", (err: any) => {
  const e = normalizeErr(err);
  logger.error("Discord RPC error", e);
  rpcReady = false;
  scheduleReconnect();
});
