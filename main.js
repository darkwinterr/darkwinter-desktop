/**
 * Darkwinter for Windows and Mac: darkwinter.lol in its own window.
 *
 * - One window (opening the app again focuses it), remembering its size and position.
 * - Sign in with Google or Discord works inside the app; any other site opens in the normal browser.
 * - A purple "You're offline" page with Try again when there's no connection.
 * - Updates itself on Windows from the latest release on GitHub.
 */
const { app, BrowserWindow, Menu, ipcMain, nativeTheme, shell, session } = require("electron");
const fs = require("fs");
const path = require("path");

const SITE = process.env.DW_SITE || "https://darkwinter.lol";
const SITE_HOST = new URL(SITE).hostname;
const BG = "#12082a";

/** Hosts that stay inside the app: the site, and sign-in and checkout pages it sends people to. */
const IN_APP = [SITE_HOST, `www.${SITE_HOST}`, "accounts.google.com", "discord.com", "supabase.co", "checkout.stripe.com", "js.stripe.com", "hooks.stripe.com"];
const inApp = (raw) => {
  try {
    const u = new URL(raw);
    if (u.protocol === "about:" || u.protocol === "file:") return true;
    if (u.protocol !== "https:" && !(u.protocol === "http:" && u.hostname === "localhost")) return false;
    if (u.hostname === "localhost") return true;
    return IN_APP.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`));
  } catch {
    return false;
  }
};

app.setName("Darkwinter");
nativeTheme.themeSource = "dark";
// Profile music can start on its own like in a browser tab the person clicked into.
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

/* ---------- one window at a time ---------- */
if (!app.requestSingleInstanceLock()) app.quit();
let win = null;
app.on("second-instance", () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
});

/* ---------- remembered window size ---------- */
const stateFile = () => path.join(app.getPath("userData"), "window.json");
const loadState = () => {
  try {
    return JSON.parse(fs.readFileSync(stateFile(), "utf8"));
  } catch {
    return {};
  }
};
const saveState = () => {
  if (!win || win.isDestroyed()) return;
  try {
    fs.writeFileSync(stateFile(), JSON.stringify({ ...win.getNormalBounds(), maximized: win.isMaximized() }));
  } catch {}
};

/* ---------- the window ---------- */
let lastUrl = SITE;
function createWindow() {
  const st = loadState();
  win = new BrowserWindow({
    width: st.width || 1320,
    height: st.height || 860,
    x: st.x,
    y: st.y,
    minWidth: 940,
    minHeight: 620,
    show: false,
    title: "Darkwinter",
    backgroundColor: BG,
    autoHideMenuBar: true,
    icon: path.join(__dirname, "build", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });
  if (st.maximized) win.maximize();
  win.once("ready-to-show", () => win.show());
  win.on("close", saveState);
  win.on("closed", () => (win = null));

  const wc = win.webContents;
  // Sites like Google refuse sign-in from "embedded" browsers, so the app looks like plain Chrome plus a Darkwinter tag.
  wc.setUserAgent(`${wc.getUserAgent().replace(/\s(Electron|darkwinter-desktop|Darkwinter)\/\S+/gi, "")} DarkwinterDesktop/${app.getVersion()}`);

  wc.setWindowOpenHandler(({ url }) => {
    if (inApp(url)) return { action: "allow", overrideBrowserWindowOptions: { backgroundColor: BG, autoHideMenuBar: true, width: 520, height: 720, parent: win } };
    shell.openExternal(url);
    return { action: "deny" };
  });
  wc.on("will-navigate", (e, url) => {
    if (!inApp(url)) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });
  // A slim purple scrollbar instead of the system's light one.
  wc.on("dom-ready", () => {
    wc.insertCSS("::-webkit-scrollbar{width:10px;height:10px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:rgb(162 75 255 / .35);border-radius:10px;border:2px solid transparent;background-clip:padding-box}::-webkit-scrollbar-thumb:hover{background-color:rgb(199 125 255 / .55)}").catch(() => {});
  });
  wc.on("did-navigate", (_e, url) => {
    if (url.startsWith("http")) lastUrl = url;
  });
  // No connection (or the site is down): the offline page, which retries when the connection comes back.
  wc.on("did-fail-load", (_e, code, _desc, url, isMain) => {
    if (!isMain || code === -3) return; // -3 is a cancelled load (e.g. a redirect), not an error
    if (url && url.startsWith("http")) lastUrl = url;
    win.loadFile(path.join(__dirname, "offline.html"));
  });

  win.loadURL(SITE);
}

ipcMain.on("dw:version", (e) => (e.returnValue = app.getVersion()));
ipcMain.on("dw:retry", () => win && win.loadURL(lastUrl || SITE));

/* ---------- menu (Mac needs Edit for copy and paste; Windows hides it) ---------- */
function setMenu() {
  const isMac = process.platform === "darwin";
  const tpl = [
    ...(isMac ? [{ role: "appMenu" }] : []),
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        { label: "Home", accelerator: "CmdOrCtrl+Shift+H", click: () => win && win.loadURL(SITE) },
        { label: "Back", accelerator: isMac ? "Cmd+[" : "Alt+Left", click: () => win && win.webContents.navigationHistory.canGoBack() && win.webContents.navigationHistory.goBack() },
        { label: "Forward", accelerator: isMac ? "Cmd+]" : "Alt+Right", click: () => win && win.webContents.navigationHistory.canGoForward() && win.webContents.navigationHistory.goForward() },
        { type: "separator" },
        { role: "reload" },
        { role: "forceReload" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
        ...(app.isPackaged ? [] : [{ role: "toggleDevTools" }]),
      ],
    },
    { role: "windowMenu" },
    { role: "help", submenu: [{ label: "Darkwinter website", click: () => shell.openExternal(SITE) }] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(tpl));
}

/* ---------- updates (Windows; the Mac app needs a Developer ID to update itself) ---------- */
function checkForUpdates() {
  if (!app.isPackaged || process.platform !== "win32") return;
  try {
    const { autoUpdater } = require("electron-updater");
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on("error", () => {});
    autoUpdater.checkForUpdatesAndNotify().catch(() => {});
  } catch {}
}

app.whenReady().then(() => {
  // Notifications and the like only for Darkwinter itself.
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb, details) => {
    let host = "";
    try {
      host = new URL(details.requestingUrl || wc.getURL()).hostname;
    } catch {}
    cb((host === SITE_HOST || host === `www.${SITE_HOST}`) && ["notifications", "clipboard-sanitized-write", "fullscreen", "media"].includes(perm));
  });
  setMenu();
  createWindow();
  checkForUpdates();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else if (win) win.show();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
