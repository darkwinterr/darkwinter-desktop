// Lets darkwinter.lol know it's running inside the app (it hides "Download the app" there).
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("darkwinterDesktop", {
  platform: process.platform,
  version: ipcRenderer.sendSync("dw:version"),
  retry: () => ipcRenderer.send("dw:retry"),
});
