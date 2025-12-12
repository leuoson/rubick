"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const electron = require("electron");
const path = require("path");
const fs = require("fs-extra");
const os = require("os");
const commonConst = {
  linux() {
    return process.platform === "linux";
  },
  macOS() {
    return process.platform === "darwin";
  },
  windows() {
    return process.platform === "win32";
  },
  production() {
    return process.env.NODE_ENV !== "development";
  },
  dev() {
    return process.env.NODE_ENV === "development";
  }
};
const isDev = () => !electron.app.isPackaged;
const getStaticPath = () => isDev() ? path.join(process.cwd(), "public") : path.join(process.resourcesPath, "static");
const resolveStatic = (...args) => path.join(getStaticPath(), ...args);
global.__static = getStaticPath();
const getPreloadPath = () => {
  if (isDev()) {
    return path.join(process.cwd(), "out", "preload", "index.js");
  }
  return path.join(__dirname, "..", "preload", "index.js");
};
const _static = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  getPreloadPath,
  getStaticPath,
  isDev,
  resolveStatic
}, Symbol.toStringTag, { value: "Module" }));
const getSearchFiles = (argv = process.argv, cwd = process.cwd()) => {
  const files = argv.slice(2);
  let result = [];
  if (files.length > 0) {
    result = files.map((item) => {
      if (path.isAbsolute(item)) {
        return {
          path: item
        };
      } else {
        const tempPath = path.join(cwd, item);
        if (fs.existsSync(tempPath)) {
          return {
            path: tempPath
          };
        } else {
          return null;
        }
      }
    }).filter((item) => item !== null);
  }
  return result;
};
const putFileToRubick = (webContents, files) => {
  webContents.executeJavaScript(
    `window.searchFocus(${JSON.stringify(files)}, false)`
  );
};
const copyFileOutsideOfElectronAsar = function(sourceInAsarArchive, destOutsideAsarArchive) {
  if (fs.existsSync(sourceInAsarArchive)) {
    if (fs.statSync(sourceInAsarArchive).isFile()) {
      const file = destOutsideAsarArchive;
      const dir = path.dirname(file);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(file, fs.readFileSync(sourceInAsarArchive));
    } else if (fs.statSync(sourceInAsarArchive).isDirectory()) {
      fs.readdirSync(sourceInAsarArchive).forEach(function(fileOrFolderName) {
        copyFileOutsideOfElectronAsar(
          sourceInAsarArchive + "/" + fileOrFolderName,
          destOutsideAsarArchive + "/" + fileOrFolderName
        );
      });
    }
  }
};
const macBeforeOpen = () => {
  const dest = `${os.homedir}/Library/Services/rubick.workflow`;
  if (fs.existsSync(dest)) {
    return true;
  } else {
    try {
      copyFileOutsideOfElectronAsar(resolveStatic("rubick.workflow"), dest);
    } catch (e) {
    }
  }
};
const getSearchFiles$1 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  getSearchFiles,
  macBeforeOpen,
  putFileToRubick
}, Symbol.toStringTag, { value: "Module" }));
let mainProcessReady = false;
electron.ipcMain.handle("main-process-ready", () => mainProcessReady);
electron.protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { secure: true, standard: true } }
]);
const gotTheLock = electron.app.requestSingleInstanceLock();
if (!gotTheLock) {
  electron.app.quit();
} else {
  if (commonConst.macOS()) {
    macBeforeOpen();
    if (commonConst.production() && !electron.app.isInApplicationsFolder()) {
      electron.app.moveToApplicationsFolder();
    } else {
      electron.app.dock?.hide();
    }
  } else {
    electron.app.disableHardwareAcceleration();
  }
  electron.app.whenReady().then(async () => {
    await Promise.resolve().then(() => _static);
    const [
      { main, guide },
      { default: appSearch },
      { PluginHandler },
      { default: API },
      { default: createTray },
      { default: registerHotKey },
      { default: localConfig },
      { default: checkVersion },
      { default: registerSystemPlugin }
    ] = await Promise.all([
      Promise.resolve().then(() => require("./index-D87-wrCW.js")),
      Promise.resolve().then(() => require("./index-B9GEI31O.js")),
      Promise.resolve().then(() => require("./index-D0aSwNwF.js")),
      Promise.resolve().then(() => require("./api-6UbViDWD.js")),
      Promise.resolve().then(() => require("./tray-OkkjIVFz.js")),
      Promise.resolve().then(() => require("./registerHotKey-Dlurkrrr.js")),
      Promise.resolve().then(() => require("./initLocalConfig-MCd7_1-H.js")),
      Promise.resolve().then(() => require("./versionHandler-BXpzusQL.js")),
      Promise.resolve().then(() => require("./registerSystemPlugin-wbxU2AjQ.js"))
    ]);
    await Promise.resolve().then(() => require("./localPlugin-N_Qm7k6Z.js"));
    global.appSearch = appSearch;
    global.PluginHandler = PluginHandler;
    const systemPlugins = registerSystemPlugin();
    checkVersion();
    await localConfig.init();
    const config = await localConfig.getConfig();
    if (!config.perf.common.guide) {
      guide().init();
      config.perf.common.guide = true;
      localConfig.setConfig(config);
    }
    const { default: windowManager } = await Promise.resolve().then(() => require("./windowManager-BnT49sVQ.js"));
    const windowCreator = main();
    windowCreator.init();
    const mainWindow = windowCreator.getWindow();
    windowManager.setMainWindow(mainWindow);
    API.init(mainWindow);
    createTray(mainWindow);
    registerHotKey(mainWindow);
    systemPlugins.triggerReadyHooks(
      Object.assign(electron, {
        mainWindow,
        API
      })
    );
    mainProcessReady = true;
    const { getSearchFiles: getSearchFiles2, putFileToRubick: putFileToRubick2 } = await Promise.resolve().then(() => getSearchFiles$1);
    electron.app.on("second-instance", (event, commandLine, workingDirectory) => {
      const files = getSearchFiles2(commandLine, workingDirectory);
      const win = windowCreator.getWindow();
      if (win) {
        if (win.isMinimized()) {
          win.restore();
        }
        win.focus();
        if (files.length > 0) {
          win.show();
          putFileToRubick2(win.webContents, files);
        }
      }
    });
    electron.app.on("activate", () => {
      if (!windowCreator.getWindow()) {
        windowCreator.init();
      }
    });
  });
  electron.app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      electron.app.quit();
    }
  });
  electron.app.on("will-quit", () => {
    electron.globalShortcut.unregisterAll();
  });
  if (commonConst.dev()) {
    if (process.platform === "win32") {
      process.on("message", (data) => {
        if (data === "graceful-exit") {
          electron.app.quit();
        }
      });
    } else {
      process.on("SIGTERM", () => {
        electron.app.quit();
      });
    }
  }
}
exports.commonConst = commonConst;
exports.getPreloadPath = getPreloadPath;
exports.isDev = isDev;
exports.resolveStatic = resolveStatic;
//# sourceMappingURL=index.js.map
