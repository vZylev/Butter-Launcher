import { Client, type SetActivity } from "@kostya-main/discord-rpc";
import { logger } from "./logger";

// Discord RPC: because nothing says "serious launcher" like presence updates.

const dateElapsed = Date.now();

const clientId = "1461691220454543484";
const client = new Client({ clientId });

let rpcActivity: SetActivity = {
  startTimestamp: dateElapsed,
  details: "Choosing Version",
  largeImageKey: "butterlauncher",
  largeImageText: "Butter Launcher",
  buttons: [
    {
      label: "Play Free Hytale",
      url: "https://butterlauncher.tech",
    },
  ],
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
    details: "Playing Hytale No-Premium",
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

  client.user?.setActivity(rpcActivity).catch((err: any) => {
    logger.error("Discord RPC error:", err);
  });
};

export const connectRPC = async () => {
  client
    .login()
    .then(() => {
      logger.info("Discord RPC connected");
      setChoosingVersionActivity();
    })
    .catch((err: any) => {
      logger.error("Discord RPC error:", err);
    });
};

export const clearActivity = async () => {
  logger.info("Clearing Discord RPC activity");

  try {
    // Depending on timing, client.user may be undefined even if the IPC pipe is open.
    // Try both surfaces (library versions differ).
    await Promise.resolve((client.user as any)?.clearActivity?.());
    await Promise.resolve((client as any)?.clearActivity?.());
  } catch (err: any) {
    logger.error("An error occurred while clearing Discord RPC activity", err);
  }
};

export const disconnectRPC = async () => {
  logger.info("Disconnecting Discord RPC");
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
  setChoosingVersionActivity();
});
