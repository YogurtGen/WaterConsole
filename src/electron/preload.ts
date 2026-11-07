import { contextBridge, ipcRenderer } from "electron";
import type { HostBridge, HostCommand, HostState } from "../shared/types";
const bridge: HostBridge = {
  getState: () => ipcRenderer.invoke("wc:get-state"),
  library: command => ipcRenderer.invoke("wc:library",command),
  command: (command: HostCommand) => ipcRenderer.invoke("wc:command", command),
  onState: (listener: (state: HostState) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, state: HostState) =>
      listener(state);
    ipcRenderer.on("wc:state", handler);
    return () => {
      ipcRenderer.removeListener("wc:state", handler);
    };
  },
  toggleFullscreen: () => ipcRenderer.invoke("wc:fullscreen"),
  getFullscreen: () => ipcRenderer.invoke("wc:get-fullscreen"),
  minimize: () => ipcRenderer.send("wc:minimize"),
  quit: () => ipcRenderer.send("wc:quit"),
};
contextBridge.exposeInMainWorld("waterconsole", bridge);
