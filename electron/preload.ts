import { ipcRenderer, contextBridge } from "electron";
import { version, build_date } from "../package.json";

// --------- Expose some API to the Renderer process ---------
contextBridge.exposeInMainWorld("ipcRenderer", {
  on(...args: Parameters<typeof ipcRenderer.on>) {
    const [channel, listener] = args;
    return ipcRenderer.on(channel, (event, ...args) =>
      listener(event, ...args),
    );
  },
  off(...args: Parameters<typeof ipcRenderer.off>) {
    const [channel, ...omit] = args;
    return ipcRenderer.off(channel, ...omit);
  },
  send(...args: Parameters<typeof ipcRenderer.send>) {
    const [channel, ...omit] = args;
    return ipcRenderer.send(channel, ...omit);
  },
  invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
    const [channel, ...omit] = args;
    return ipcRenderer.invoke(channel, ...omit);
  },
  once(...args: Parameters<typeof ipcRenderer.once>) {
    const [channel, listener] = args;
    return ipcRenderer.once(channel, (event, ...args) =>
      listener(event, ...args),
    );
  },
  removeListener(...args: Parameters<typeof ipcRenderer.removeListener>) {
    const [channel, listener] = args;
    return ipcRenderer.removeListener(channel, listener);
  },
});

contextBridge.exposeInMainWorld("config", {
  getDefaultGameDirectory: () =>
    ipcRenderer.invoke("get-default-game-directory"),
  openFolder: (folderPath: string) =>
    ipcRenderer.invoke("open-folder", folderPath),
  openExternal: (url: string) => ipcRenderer.invoke("open-external", url),
  OS: process.platform,
  ARCH: process.arch,
  VERSION: version,
  BUILD_DATE: build_date,
});
