import { Client, type SetActivity } from "@kostya-main/discord-rpc";

const dateElapsed = Date.now();

const clientId = "1461691220454543484";
const client = new Client({ clientId });

let rpcActivity: SetActivity = {
  startTimestamp: dateElapsed,
  state: "Butter Launcher: Play Hytale For Free",
  largeImageKey: "butterlauncher",
  largeImageText: "Butter Launcher",
  smallImageKey: "hytale",
  buttons: [
    {
      label: "Play Free Hytale",
      url: "https://butterlauncher.tech",
    },
  ],
};

export const setActivity = (activity?: SetActivity) => {
  rpcActivity = {
    ...rpcActivity,
    ...activity,
  };

  client.user?.setActivity(rpcActivity).catch((err: any) => {
    console.log("Discord RPC error:", err);
  });
};

export const connectRPC = async () => {
  client
    .login()
    .then(() => {
      console.log("Discord RPC connected");
    })
    .catch((err: any) => {
      console.log("Discord RPC error:", err);
    });
};

export const clearActivity = () => {
  client.user?.clearActivity();
};

// on RPC is ready
client.on("ready", () => {
  setActivity();
});
