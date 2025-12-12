"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
const electron = require("electron");
const path = require("path");
const fs = require("fs-extra");
const got = require("got");
const spawn = require("cross-spawn");
const axios = require("axios");
const fs$1 = require("fs");
const PouchDB = require("pouchdb");
const MemoryStream = require("memorystream");
const webdav = require("webdav");
const child_process = require("child_process");
const os = require("os");
const originfs = require("original-fs");
const ks = require("node-key-sender");
const uiohookNapi = require("uiohook-napi");
const ai = require("ai");
const openai = require("@ai-sdk/openai");
const anthropic = require("@ai-sdk/anthropic");
const google = require("@ai-sdk/google");
const openaiCompatible = require("@ai-sdk/openai-compatible");
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
const defaultConfig = {
  version: 8,
  perf: {
    custom: {
      theme: "SPRING",
      primaryColor: "#ff4ea4",
      errorColor: "#ed6d46",
      warningColor: "#e5a84b",
      successColor: "#c0d695",
      infoColor: "#aa8eeB",
      logo: `file://${__static}/logo.png`,
      placeholder: "你好，Rubick！请输入插件关键词",
      username: "Rubick"
    },
    ai: {
      providers: [],
      defaultProviderId: "",
      defaultModel: ""
    },
    shortCut: {
      showAndHidden: "Option+R",
      separate: "Ctrl+D",
      quit: "Shift+Escape",
      capture: "Ctrl+Shift+A"
    },
    common: {
      start: true,
      space: true,
      hideOnBlur: true,
      autoPast: false,
      darkMode: false,
      guide: false,
      history: true,
      lang: "zh-CN"
    },
    local: {
      search: true
    }
  },
  global: []
};
(async () => {
  try {
    const fixPath = (await import("fix-path")).default;
    fixPath();
  } catch (e) {
  }
})();
class AdapterHandler {
  // 插件安装地址
  baseDir;
  // 插件源地址
  registry;
  pluginCaches = {};
  /**
   * Creates an instance of AdapterHandler.
   * @param {AdapterHandlerOptions} options
   * @memberof AdapterHandler
   */
  constructor(options) {
    if (!fs.existsSync(options.baseDir)) {
      fs.mkdirsSync(options.baseDir);
      fs.writeFileSync(
        `${options.baseDir}/package.json`,
        // '{"dependencies":{}}'
        // fix 插件安装时node版本问题
        JSON.stringify({
          dependencies: {},
          volta: {
            node: "16.19.1"
          }
        })
      );
    }
    this.baseDir = options.baseDir;
    let register = options.registry || "https://registry.npmmirror.com";
    try {
      const dbdata = electron.ipcRenderer.sendSync("msg-trigger", {
        type: "dbGet",
        data: { id: "rubick-localhost-config" }
      });
      register = dbdata.data.register;
    } catch (e) {
    }
    this.registry = register || "https://registry.npmmirror.com/";
  }
  async upgrade(name) {
    const packageJSON = JSON.parse(
      fs.readFileSync(`${this.baseDir}/package.json`, "utf-8")
    );
    const registryUrl = `https://registry.npmmirror.com/${name}`;
    try {
      const installedVersion = packageJSON.dependencies[name].replace("^", "");
      let latestVersion = this.pluginCaches[name];
      if (!latestVersion) {
        const { data } = await axios.get(registryUrl, { timeout: 2e3 });
        latestVersion = data["dist-tags"].latest;
        this.pluginCaches[name] = latestVersion;
      }
      if (latestVersion > installedVersion) {
        await this.install([name], { isDev: false });
      }
    } catch (e) {
    }
  }
  /**
   * 获取插件信息
   * @param {string} adapter 插件名称
   * @param {string} adapterPath 插件指定路径
   * @memberof PluginHandler
   */
  async getAdapterInfo(adapter, adapterPath) {
    let adapterInfo;
    const infoPath = adapterPath || path.resolve(this.baseDir, "node_modules", adapter, "plugin.json");
    if (await fs.pathExists(infoPath)) {
      adapterInfo = JSON.parse(
        fs.readFileSync(infoPath, "utf-8")
      );
    } else {
      const resp = await got.get(
        `https://cdn.jsdelivr.net/npm/${adapter}/plugin.json`
      );
      adapterInfo = JSON.parse(resp.body);
    }
    return adapterInfo;
  }
  // 安装并启动插件
  async install(adapters, options) {
    const installCmd = options.isDev ? "link" : "install";
    await this.execCommand(installCmd, adapters);
  }
  /**
   * 更新指定插件
   * @param {...string[]} adapters 插件名称
   * @memberof AdapterHandler
   */
  async update(...adapters) {
    await this.execCommand("update", adapters);
  }
  /**
   * 卸载指定插件
   * @param {...string[]} adapters 插件名称
   * @param options
   * @memberof AdapterHandler
   */
  async uninstall(adapters, options) {
    const installCmd = options.isDev ? "unlink" : "uninstall";
    await this.execCommand(installCmd, adapters);
  }
  /**
   * 列出所有已安装插件
   * @memberof AdapterHandler
   */
  async list() {
    const installInfo = JSON.parse(
      await fs.readFile(`${this.baseDir}/package.json`, "utf-8")
    );
    const adapters = [];
    for (const adapter in installInfo.dependencies) {
      adapters.push(adapter);
    }
    return adapters;
  }
  /**
   * 运行包管理器
   * @memberof AdapterHandler
   */
  async execCommand(cmd, modules) {
    return new Promise((resolve, reject) => {
      let args = [cmd].concat(
        cmd !== "uninstall" && cmd !== "link" ? modules.map((m) => `${m}@latest`) : modules
      );
      if (cmd !== "link") {
        args = args.concat("--color=always").concat("--save").concat(`--registry=${this.registry}`);
      }
      const npm = spawn("npm", args, {
        cwd: this.baseDir
      });
      console.log(args);
      let output = "";
      npm.stdout.on("data", (data) => {
        output += data;
      }).pipe(process.stdout);
      npm.stderr.on("data", (data) => {
        output += data;
      }).pipe(process.stderr);
      npm.on("close", (code2) => {
        if (!code2) {
          resolve({ code: 0, data: output });
        } else {
          reject({ code: code2, data: output });
        }
      });
    });
  }
}
class WebDav {
  client;
  cloudPath = "/rubick/db.txt";
  constructor({ username, password, url }) {
    this.client = webdav.createClient(url, {
      username,
      password
    });
    this.client.exists("/").then((result) => {
      !result && new electron.Notification({
        title: "导出失败",
        body: "webdav 连接失败"
      }).show();
    }).catch((r) => {
      new electron.Notification({
        title: "导出失败",
        body: "WebDav连接出错" + r
      }).show();
    });
  }
  async createWriteStream(dbInstance2) {
    try {
      const result = await this.client.exists("/rubick");
      if (!result) {
        await this.client.createDirectory("/rubick");
      }
    } catch (e) {
      new electron.Notification({
        title: "导出失败",
        body: "WebDav目录创建出错:" + e
      }).show();
    }
    const ws = new MemoryStream();
    dbInstance2.dump(ws, {
      filter: (doc) => {
        return !doc._attachments;
      }
    });
    ws.pipe(
      this.client.createWriteStream(this.cloudPath, {}, () => {
        new electron.Notification({
          title: "已导出到坚果云",
          body: `文件目录为：${this.cloudPath}`
        }).show();
      })
    );
  }
  async createReadStream(dbInstance2) {
    try {
      const result = await this.client.exists(this.cloudPath);
      if (!result) {
        return new electron.Notification({
          title: "导入失败",
          body: "请确认坚果云上已存在数据"
        }).show();
      }
      const str = await this.client.getFileContents(this.cloudPath, {
        format: "text"
      });
      await dbInstance2.loadIt(str);
      new electron.Notification({
        title: "导入成功",
        body: "数据已导入到 rubick，主应用数据需重启后生效"
      }).show();
    } catch (e) {
      new electron.Notification({
        title: "导入失败",
        body: "WebDav目录导入出错:" + e
      }).show();
    }
  }
}
const replicationStream = require("pouchdb-replication-stream/dist/pouchdb.replication-stream.min.js");
PouchDB.plugin(replicationStream.plugin);
const load = require("pouchdb-load");
PouchDB.plugin({ loadIt: load.load });
PouchDB.adapter("writableStream", replicationStream.adapters.writableStream);
class DB {
  docMaxByteLength;
  docAttachmentMaxByteLength;
  dbpath;
  defaultDbName;
  pouchDB;
  constructor(dbPath) {
    this.docMaxByteLength = 2 * 1024 * 1024;
    this.docAttachmentMaxByteLength = 20 * 1024 * 1024;
    this.dbpath = dbPath;
    this.defaultDbName = path.join(dbPath, "default");
  }
  init() {
    fs$1.existsSync(this.dbpath) || fs$1.mkdirSync(this.dbpath);
    this.pouchDB = new PouchDB(this.defaultDbName, { auto_compaction: true });
  }
  getDocId(name, id) {
    return name + "/" + id;
  }
  replaceDocId(name, id) {
    return id.replace(name + "/", "");
  }
  errorInfo(name, message) {
    return { error: true, name, message };
  }
  checkDocSize(doc) {
    if (Buffer.byteLength(JSON.stringify(doc)) > this.docMaxByteLength) {
      return this.errorInfo(
        "exception",
        `doc max size ${this.docMaxByteLength / 1024 / 1024} M`
      );
    }
    return false;
  }
  async put(name, doc, strict = true) {
    if (strict) {
      const err = this.checkDocSize(doc);
      if (err) return err;
    }
    doc._id = this.getDocId(name, doc._id);
    try {
      const result = await this.pouchDB.put(doc);
      doc._id = result.id = this.replaceDocId(name, result.id);
      return result;
    } catch (e) {
      doc._id = this.replaceDocId(name, doc._id);
      return { id: doc._id, name: e.name, error: true, message: e.message };
    }
  }
  async get(name, id) {
    try {
      const result = await this.pouchDB.get(this.getDocId(name, id));
      result._id = this.replaceDocId(name, result._id);
      return result;
    } catch (e) {
      return null;
    }
  }
  async remove(name, doc) {
    try {
      let target;
      if ("object" == typeof doc) {
        target = doc;
        if (!target._id || "string" !== typeof target._id) {
          return this.errorInfo("exception", "doc _id error");
        }
        target._id = this.getDocId(name, target._id);
      } else {
        if ("string" !== typeof doc) {
          return this.errorInfo("exception", "param error");
        }
        target = await this.pouchDB.get(this.getDocId(name, doc));
      }
      const result = await this.pouchDB.remove(target);
      target._id = result.id = this.replaceDocId(name, result.id);
      return result;
    } catch (e) {
      if ("object" === typeof doc) {
        doc._id = this.replaceDocId(name, doc._id);
      }
      return this.errorInfo(e.name, e.message);
    }
  }
  async bulkDocs(name, docs) {
    let result;
    try {
      if (!Array.isArray(docs)) return this.errorInfo("exception", "not array");
      if (docs.find((e) => !e._id))
        return this.errorInfo("exception", "doc not _id field");
      if (new Set(docs.map((e) => e._id)).size !== docs.length)
        return this.errorInfo("exception", "_id value exists as");
      for (const doc of docs) {
        const err = this.checkDocSize(doc);
        if (err) return err;
        doc._id = this.getDocId(name, doc._id);
      }
      result = await this.pouchDB.bulkDocs(docs);
      result = result.map((res) => {
        res.id = this.replaceDocId(name, res.id);
        return res.error ? {
          id: res.id,
          name: res.name,
          error: true,
          message: res.message
        } : res;
      });
      docs.forEach((doc) => {
        doc._id = this.replaceDocId(name, doc._id);
      });
    } catch (e) {
    }
    return result;
  }
  async allDocs(name, key) {
    const config = { include_docs: true };
    if (key) {
      if ("string" == typeof key) {
        config.startkey = this.getDocId(name, key);
        config.endkey = config.startkey + "￰";
      } else {
        if (!Array.isArray(key))
          return this.errorInfo(
            "exception",
            "param only key(string) or keys(Array[string])"
          );
        config.keys = key.map((key2) => this.getDocId(name, key2));
      }
    } else {
      config.startkey = this.getDocId(name, "");
      config.endkey = config.startkey + "￰";
    }
    const result = [];
    try {
      (await this.pouchDB.allDocs(config)).rows.forEach((res) => {
        if (!res.error && res.doc) {
          res.doc._id = this.replaceDocId(name, res.doc._id);
          result.push(res.doc);
        }
      });
    } catch (e) {
    }
    return result;
  }
  async dumpDb(config) {
    const webdavClient = new WebDav(config);
    webdavClient.createWriteStream(this.pouchDB);
  }
  async importDb(config) {
    const webdavClient = new WebDav(config);
    await this.pouchDB.destroy();
    const syncDb = new DB(this.dbpath);
    syncDb.init();
    this.pouchDB = syncDb.pouchDB;
    await webdavClient.createReadStream(this.pouchDB);
  }
  async postAttachment(name, docId, attachment, type2) {
    const buffer = Buffer.from(attachment);
    if (buffer.byteLength > this.docAttachmentMaxByteLength)
      return this.errorInfo(
        "exception",
        "attachment data up to " + this.docAttachmentMaxByteLength / 1024 / 1024 + "M"
      );
    try {
      const result = await this.pouchDB.put({
        _id: this.getDocId(name, docId),
        _attachments: { 0: { data: buffer, content_type: type2 } }
      });
      result.id = this.replaceDocId(name, result.id);
      return result;
    } catch (e) {
      return this.errorInfo(e.name, e.message);
    }
  }
  async getAttachment(name, docId, len = "0") {
    try {
      return await this.pouchDB.getAttachment(this.getDocId(name, docId), len);
    } catch (e) {
      return null;
    }
  }
}
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
const screenWindow = (cb) => {
  const url = resolveStatic("ScreenCapture.exe");
  const screen_window = child_process.execFile(url);
  screen_window.on("exit", (code2) => {
    if (code2) {
      const image = electron.clipboard.readImage();
      cb && cb(image.isEmpty() ? "" : image.toDataURL());
    }
  });
};
const handleScreenShots = (cb) => {
  child_process.exec("screencapture -i -r -c", () => {
    const image = electron.clipboard.readImage();
    cb && cb(image.isEmpty() ? "" : image.toDataURL());
  });
};
const screenCapture = (mainWindow, cb) => {
  electron.clipboard.writeText("");
  if (commonConst.macOS()) {
    handleScreenShots(cb);
  } else if (commonConst.windows()) {
    screenWindow(cb);
  } else {
    new electron.Notification({
      title: "兼容性支持度不够",
      body: "Linux 系统截图暂不支持，我们将会尽快更新！"
    }).show();
  }
};
let dbInstance = null;
const getDbInstance = () => {
  if (!dbInstance) {
    dbInstance = new DB(electron.app.getPath("userData"));
    dbInstance.init();
  }
  return dbInstance;
};
class DBInstance {
  currentPlugin = null;
  DBKEY = "RUBICK_DB_DEFAULT";
  DB_INFO_KET = "RUBICK_PLUGIN_INFO";
  async dbPut({ data }) {
    if (this.currentPlugin && this.currentPlugin.name) {
      let dbInfo = await getDbInstance().get(this.DBKEY, this.DB_INFO_KET);
      if (!dbInfo) {
        dbInfo = { data: [], _id: this.DB_INFO_KET };
      }
      const item = dbInfo.data.find(
        (it) => it.name === this.currentPlugin.name
      );
      if (item) {
        !item.keys.includes(data.data._id) && item.keys.push(data.data._id);
      } else {
        dbInfo.data.push({
          name: this.currentPlugin.name,
          keys: [data.data._id]
        });
      }
      getDbInstance().put(this.DBKEY, dbInfo);
    }
    return getDbInstance().put(this.DBKEY, data.data);
  }
  dbGet({ data }) {
    return getDbInstance().get(this.DBKEY, data.id);
  }
  dbRemove({ data }) {
    return getDbInstance().remove(this.DBKEY, data.doc);
  }
  dbBulkDocs({ data }) {
    return getDbInstance().bulkDocs(this.DBKEY, data.docs);
  }
  dbAllDocs({ data }) {
    return getDbInstance().allDocs(this.DBKEY, data.key);
  }
  dbDump({ data }) {
    return getDbInstance().dumpDb(data.target);
  }
  dbImport({ data }) {
    return getDbInstance().importDb(data.target);
  }
  dbPostAttachment({ data }) {
    const { docId, attachment, type: type2 } = data;
    return getDbInstance().postAttachment(this.DBKEY, docId, attachment, type2);
  }
  dbGetAttachment({ data }) {
    return getDbInstance().getAttachment(this.DBKEY, data.docId);
  }
  async dbGetAttachmentType({ data }) {
    const res = await this.dbGet(data.docId);
    if (!res || !res._attachments) return null;
    const result = res._attachments[0];
    return result ? result.content_type : null;
  }
}
const LOCAL_CONFIG_KEY = "rubick-local-config";
const db = new DBInstance();
const localConfig = {
  async init() {
    const localConfig2 = await db.dbGet({ data: { id: LOCAL_CONFIG_KEY } });
    if (!localConfig2 || !localConfig2.data || localConfig2.data.version !== defaultConfig.version) {
      const data = {
        _id: LOCAL_CONFIG_KEY,
        data: defaultConfig
      };
      if (localConfig2 && localConfig2) {
        data._rev = localConfig2._rev;
      }
      await db.dbPut({
        data: { data }
      });
    }
  },
  async getConfig() {
    const data = await db.dbGet({ data: { id: LOCAL_CONFIG_KEY } }) || {};
    return data.data;
  },
  async setConfig(data) {
    const localConfig2 = await db.dbGet({ data: { id: LOCAL_CONFIG_KEY } }) || {};
    await db.dbPut({
      data: {
        data: {
          _id: LOCAL_CONFIG_KEY,
          _rev: localConfig2._rev,
          data: {
            ...localConfig2.data,
            ...data
          }
        }
      }
    });
  }
};
const WINDOW_WIDTH = 800;
const WINDOW_HEIGHT = 60;
const WINDOW_PLUGIN_HEIGHT = 600;
const GUIDE_WIDTH = 800;
const GUIDE_HEIGHT = 600;
const WINDOW_MIN_HEIGHT = 60;
let remoteInitialized = false;
const main = () => {
  let win2;
  const init = () => {
    if (!remoteInitialized) {
      require("@electron/remote/main").initialize();
      remoteInitialized = true;
    }
    createWindow();
    require("@electron/remote/main").enable(win2.webContents);
  };
  const createWindow = async () => {
    win2 = new electron.BrowserWindow({
      height: WINDOW_HEIGHT,
      minHeight: WINDOW_MIN_HEIGHT,
      useContentSize: true,
      resizable: true,
      width: WINDOW_WIDTH,
      frame: false,
      title: "拉比克",
      show: false,
      skipTaskbar: true,
      backgroundColor: electron.nativeTheme.shouldUseDarkColors ? "#1c1c28" : "#fff",
      webPreferences: {
        webSecurity: false,
        backgroundThrottling: false,
        contextIsolation: false,
        webviewTag: true,
        nodeIntegration: true,
        preload: getPreloadPath(),
        spellcheck: false
      }
    });
    const devServerUrl = process.env.ELECTRON_RENDERER_URL;
    if (devServerUrl) {
      win2.loadURL(devServerUrl);
    } else {
      win2.loadFile(path.join(__dirname, "..", "..", "renderer", "index.html"));
    }
    electron.protocol.interceptFileProtocol("image", (req, callback) => {
      const url = req.url.substr(8);
      callback(decodeURI(url));
    });
    win2.on("closed", () => {
      win2 = void 0;
    });
    win2.on("show", () => {
      win2.webContents.executeJavaScript(
        `window.rubick && window.rubick.hooks && typeof window.rubick.hooks.onShow === "function" && window.rubick.hooks.onShow()`
      ).catch((e) => console.error("[Show Hook Error]", e));
    });
    win2.webContents.on("console-message", (event, level, message, line, sourceId) => {
      console.log(`[Renderer] ${message}`);
    });
    win2.webContents.on("preload-error", (event, preloadPath, error) => {
      console.error(`[Preload Error] ${preloadPath}:`, error);
    });
    win2.webContents.on("did-fail-load", (event, errorCode, errorDescription) => {
      console.error(`[Load Error] ${errorCode}: ${errorDescription}`);
    });
    if (process.env.ELECTRON_RENDERER_URL) {
      win2.once("ready-to-show", () => {
        win2.show();
        win2.webContents.openDevTools({ mode: "detach" });
      });
    }
    win2.on("hide", () => {
      win2.webContents.executeJavaScript(
        `window.rubick && window.rubick.hooks && typeof window.rubick.hooks.onHide === "function" && window.rubick.hooks.onHide()`
      ).catch((e) => console.error("[Hide Hook Error]", e));
    });
    win2.on("blur", async () => {
      const config = await localConfig.getConfig();
      if (config.perf.common.hideOnBlur) {
        win2.hide();
      }
    });
  };
  const getWindow = () => win2;
  return {
    init,
    getWindow
  };
};
const appPath = electron.app.getPath("userData");
const PLUGIN_INSTALL_DIR = path.join(appPath, "./rubick-plugins-new");
const DECODE_KEY = {
  Backspace: "Backspace",
  Tab: "Tab",
  Enter: "Enter",
  MediaPlayPause: "MediaPlayPause",
  Escape: "Escape",
  Space: "Space",
  PageUp: "PageUp",
  PageDown: "PageDown",
  End: "End",
  Home: "Home",
  ArrowLeft: "Left",
  ArrowUp: "Up",
  ArrowRight: "Right",
  ArrowDown: "Down",
  PrintScreen: "PrintScreen",
  Insert: "Insert",
  Delete: "Delete",
  Digit0: "0",
  Digit1: "1",
  Digit2: "2",
  Digit3: "3",
  Digit4: "4",
  Digit5: "5",
  Digit6: "6",
  Digit7: "7",
  Digit8: "8",
  Digit9: "9",
  KeyA: "A",
  KeyB: "B",
  KeyC: "C",
  KeyD: "D",
  KeyE: "E",
  KeyF: "F",
  KeyG: "G",
  KeyH: "H",
  KeyI: "I",
  KeyJ: "J",
  KeyK: "K",
  KeyL: "L",
  KeyM: "M",
  KeyN: "N",
  KeyO: "O",
  KeyP: "P",
  KeyQ: "Q",
  KeyR: "R",
  KeyS: "S",
  KeyT: "T",
  KeyU: "U",
  KeyV: "V",
  KeyW: "W",
  KeyX: "X",
  KeyY: "Y",
  KeyZ: "Z",
  F1: "F1",
  F2: "F2",
  F3: "F3",
  F4: "F4",
  F5: "F5",
  F6: "F6",
  F7: "F7",
  F8: "F8",
  F9: "F9",
  F10: "F10",
  F11: "F11",
  F12: "F12",
  Semicolon: ";",
  Equal: "=",
  Comma: ",",
  Minus: "-",
  Period: ".",
  Slash: "/",
  Backquote: "`",
  BracketLeft: "[",
  Backslash: "\\",
  BracketRight: "]",
  Quote: "'"
};
const getRelativePath = (indexPath) => {
  return commonConst.windows() ? indexPath.replace("file://", "") : indexPath.replace("file:", "");
};
const getPluginPreloadPath = (plugin, pluginIndexPath) => {
  const { name, preload, tplPath, indexPath } = plugin;
  if (!preload) return;
  if (isDev()) {
    if (name === "rubick-system-feature") {
      return resolveStatic("feature/public/preload.js");
    }
    if (tplPath) {
      return path.resolve(getRelativePath(indexPath), `./`, preload);
    }
    return path.resolve(getRelativePath(pluginIndexPath), `../`, preload);
  }
  if (tplPath) {
    return path.resolve(getRelativePath(indexPath), `./`, preload);
  }
  return path.resolve(getRelativePath(pluginIndexPath), `../`, preload);
};
const runner = () => {
  let view;
  const viewReadyFn = async (window2, { pluginSetting, ext }) => {
    if (!view) return;
    const height = pluginSetting && pluginSetting.height;
    window2.setSize(WINDOW_WIDTH, height || WINDOW_PLUGIN_HEIGHT);
    view.setBounds({
      x: 0,
      y: WINDOW_HEIGHT,
      width: WINDOW_WIDTH,
      height: height || WINDOW_PLUGIN_HEIGHT - WINDOW_HEIGHT
    });
    view.setAutoResize({ width: true, height: true });
    executeHooks("PluginEnter", ext);
    executeHooks("PluginReady", ext);
    const config = await localConfig.getConfig();
    const darkMode = config.perf.common.darkMode;
    darkMode && view.webContents.executeJavaScript(
      `document.body.classList.add("dark");window.rubick.theme="dark"`
    );
    window2.webContents.executeJavaScript(`window.pluginLoaded()`);
  };
  const init = (plugin, window2) => {
    if (view === null || view === void 0 || view.inDetach) {
      createView(plugin, window2);
      require("@electron/remote/main").enable(view.webContents);
    }
  };
  const createView = (plugin, window2) => {
    const {
      tplPath,
      indexPath,
      development,
      name,
      main: main2 = "index.html",
      pluginSetting,
      ext
    } = plugin;
    let pluginIndexPath = tplPath || indexPath;
    let preloadPath;
    if (isDev() && development) {
      pluginIndexPath = development;
      const pluginPath = path.resolve(PLUGIN_INSTALL_DIR, "node_modules", name);
      preloadPath = `file://${path.join(pluginPath, "./", main2)}`;
    }
    if (plugin.name === "rubick-system-feature" && !pluginIndexPath) {
      pluginIndexPath = `file://${resolveStatic("feature/index.html")}`;
    }
    if (!pluginIndexPath) {
      const pluginPath = path.resolve(PLUGIN_INSTALL_DIR, "node_modules", name);
      pluginIndexPath = `file://${path.join(pluginPath, "./", main2)}`;
    }
    const preload = getPluginPreloadPath(plugin, preloadPath || pluginIndexPath);
    const ses = electron.session.fromPartition("<" + name + ">");
    ses.setPreloads([getPreloadPath()]);
    view = new electron.BrowserView({
      webPreferences: {
        webSecurity: false,
        nodeIntegration: true,
        contextIsolation: false,
        devTools: true,
        webviewTag: true,
        preload,
        session: ses,
        defaultFontSize: 14,
        defaultFontFamily: {
          standard: "system-ui",
          serif: "system-ui"
        },
        spellcheck: false
      }
    });
    window2.setBrowserView(view);
    view.webContents.loadURL(pluginIndexPath);
    view.webContents.once("dom-ready", () => viewReadyFn(window2, plugin));
    view.webContents.session.webRequest.onBeforeSendHeaders(
      (details, callback) => {
        callback({
          requestHeaders: { referer: "*", ...details.requestHeaders }
        });
      }
    );
    view.webContents.session.webRequest.onHeadersReceived(
      (details, callback) => {
        callback({
          responseHeaders: {
            "Access-Control-Allow-Origin": ["*"],
            ...details.responseHeaders
          }
        });
      }
    );
  };
  const removeView = (window2) => {
    if (!view) return;
    executeHooks("PluginOut", null);
    const snapshotView = view;
    setTimeout(() => {
      const currentView = window2.getBrowserView?.();
      window2.removeBrowserView(snapshotView);
      if (!snapshotView.inDetach) {
        if (currentView === snapshotView) {
          window2.setBrowserView(null);
          if (view === snapshotView) {
            window2.webContents?.executeJavaScript(`window.initRubick()`);
            view = void 0;
          }
        }
        snapshotView.webContents?.destroy();
      } else if (view === snapshotView) {
        view = void 0;
      }
    }, 0);
  };
  const getView = () => view;
  const executeHooks = (hook, data) => {
    if (!view) return;
    const evalJs = `if(window.rubick && window.rubick.hooks && typeof window.rubick.hooks.on${hook} === 'function' ) {
          try {
            window.rubick.hooks.on${hook}(${data ? JSON.stringify(data) : ""});
          } catch(e) {}
        }
      `;
    view.webContents?.executeJavaScript(evalJs);
  };
  return {
    init,
    getView,
    removeView,
    executeHooks
  };
};
const detach = () => {
  let win2;
  const init = async (pluginInfo, viewInfo, view) => {
    electron.ipcMain.on("detach:service", async (event, arg) => {
      const data = await operation[arg.type]();
      event.returnValue = data;
    });
    const createWin = await createWindow(pluginInfo, viewInfo, view);
    require("@electron/remote/main").enable(createWin.webContents);
  };
  const createWindow = async (pluginInfo, viewInfo, view) => {
    const createWin = new electron.BrowserWindow({
      height: viewInfo.height,
      minHeight: WINDOW_MIN_HEIGHT,
      width: viewInfo.width,
      autoHideMenuBar: true,
      titleBarStyle: "hidden",
      trafficLightPosition: { x: 12, y: 21 },
      title: pluginInfo.pluginName,
      resizable: true,
      frame: true,
      show: false,
      enableLargerThanScreen: true,
      backgroundColor: electron.nativeTheme.shouldUseDarkColors ? "#1c1c28" : "#fff",
      x: viewInfo.x,
      y: viewInfo.y,
      webPreferences: {
        webSecurity: false,
        backgroundThrottling: false,
        contextIsolation: false,
        webviewTag: true,
        devTools: true,
        nodeIntegration: true,
        navigateOnDragDrop: true,
        spellcheck: false
      }
    });
    createWin.loadURL(`file://${resolveStatic("detach/index.html")}`);
    createWin.on("close", () => {
      executeHooks("PluginOut");
    });
    createWin.on("closed", () => {
      view.webContents?.destroy();
      win2 = void 0;
    });
    createWin.on("focus", () => {
      win2 = createWin;
      view && win2.webContents?.focus();
    });
    createWin.once("ready-to-show", async () => {
      const config = await localConfig.getConfig();
      const darkMode = config.perf.common.darkMode;
      darkMode && createWin.webContents.executeJavaScript(
        `document.body.classList.add("dark");window.rubick.theme="dark"`
      );
      view.setAutoResize({ width: true, height: true });
      createWin.setBrowserView(view);
      view.inDetach = true;
      createWin.webContents.executeJavaScript(
        `window.initDetach(${JSON.stringify(pluginInfo)})`
      );
      createWin.show();
    });
    createWin.on("maximize", () => {
      createWin.webContents.executeJavaScript("window.maximizeTrigger()");
      const view2 = createWin.getBrowserView();
      if (!view2) return;
      const display = electron.screen.getDisplayMatching(createWin.getBounds());
      view2.setBounds({
        x: 0,
        y: WINDOW_MIN_HEIGHT,
        width: display.workArea.width,
        height: display.workArea.height - WINDOW_MIN_HEIGHT
      });
    });
    createWin.on("unmaximize", () => {
      createWin.webContents.executeJavaScript("window.unmaximizeTrigger()");
      const view2 = createWin.getBrowserView();
      if (!view2) return;
      const bounds = createWin.getBounds();
      const display = electron.screen.getDisplayMatching(bounds);
      const width = display.scaleFactor * bounds.width % 1 == 0 ? bounds.width : bounds.width - 2;
      const height = display.scaleFactor * bounds.height % 1 == 0 ? bounds.height : bounds.height - 2;
      view2.setBounds({
        x: 0,
        y: WINDOW_MIN_HEIGHT,
        width,
        height: height - WINDOW_MIN_HEIGHT
      });
    });
    createWin.on("page-title-updated", (e) => {
      e.preventDefault();
    });
    createWin.webContents.once("render-process-gone", () => {
      createWin.close();
    });
    if (commonConst.macOS()) {
      createWin.on("enter-full-screen", () => {
        createWin.webContents.executeJavaScript(
          "window.enterFullScreenTrigger()"
        );
      });
      createWin.on("leave-full-screen", () => {
        createWin.webContents.executeJavaScript(
          "window.leaveFullScreenTrigger()"
        );
      });
    }
    view.webContents.on("before-input-event", (event, input) => {
      if (input.type !== "keyDown") return;
      if (!(input.meta || input.control || input.shift || input.alt)) {
        if (input.key === "Escape") {
          operation.endFullScreen();
        }
        return;
      }
    });
    const executeHooks = (hook, data) => {
      if (!view) return;
      const evalJs = `console.log(window.rubick);if(window.rubick && window.rubick.hooks && typeof window.rubick.hooks.on${hook} === 'function' ) {
          try {
            window.rubick.hooks.on${hook}(${""});
          } catch(e) {console.log(e)}
        }
      `;
      view.webContents.executeJavaScript(evalJs);
    };
    return createWin;
  };
  const getWindow = () => win2;
  const operation = {
    minimize: () => {
      win2.focus();
      win2.minimize();
    },
    maximize: () => {
      win2.isMaximized() ? win2.unmaximize() : win2.maximize();
    },
    close: () => {
      win2.close();
    },
    endFullScreen: () => {
      win2.isFullScreen() && win2.setFullScreen(false);
    }
  };
  return {
    init,
    getWindow
  };
};
const getWindowPos = (width, height) => {
  const screenPoint = electron.screen.getCursorScreenPoint();
  const displayPoint = electron.screen.getDisplayNearestPoint(screenPoint);
  return [
    displayPoint.bounds.x + Math.round((displayPoint.bounds.width - width) / 2),
    displayPoint.bounds.y + Math.round((displayPoint.bounds.height - height) / 2)
  ];
};
let win;
const guide = () => {
  const init = () => {
    if (win) return;
    electron.ipcMain.on("guide:service", async (event, arg) => {
      const data = await operation[arg.type]();
      event.returnValue = data;
    });
    createWindow();
  };
  const createWindow = async () => {
    const [x, y] = getWindowPos(800, 600);
    win = new electron.BrowserWindow({
      show: false,
      alwaysOnTop: true,
      resizable: false,
      fullscreenable: false,
      minimizable: false,
      maximizable: false,
      // closable: false,
      skipTaskbar: true,
      autoHideMenuBar: true,
      frame: false,
      enableLargerThanScreen: true,
      x,
      y,
      width: GUIDE_WIDTH,
      height: GUIDE_HEIGHT,
      minHeight: WINDOW_MIN_HEIGHT,
      webPreferences: {
        webSecurity: false,
        backgroundThrottling: false,
        contextIsolation: false,
        webviewTag: true,
        devTools: true,
        nodeIntegration: true,
        spellcheck: false
      }
    });
    win.loadURL(`file://${resolveStatic("guide/index.html")}`);
    win.on("closed", () => {
      win = void 0;
    });
    win.once("ready-to-show", () => {
      win.show();
    });
  };
  const getWindow = () => win;
  const operation = {
    close: () => {
      win.close();
      win = null;
    }
  };
  return {
    init,
    getWindow
  };
};
var commonjsGlobal = typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : {};
function getDefaultExportFromCjs(x) {
  return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, "default") ? x["default"] : x;
}
var plist$2 = {};
var parse$9 = {};
var lib$1 = {};
var dom$2 = {};
var conventions$2 = {};
function find$1(list, predicate, ac) {
  if (ac === void 0) {
    ac = Array.prototype;
  }
  if (list && typeof ac.find === "function") {
    return ac.find.call(list, predicate);
  }
  for (var i = 0; i < list.length; i++) {
    if (Object.prototype.hasOwnProperty.call(list, i)) {
      var item = list[i];
      if (predicate.call(void 0, item, i, list)) {
        return item;
      }
    }
  }
}
function freeze(object, oc) {
  if (oc === void 0) {
    oc = Object;
  }
  return oc && typeof oc.freeze === "function" ? oc.freeze(object) : object;
}
function assign(target, source) {
  if (target === null || typeof target !== "object") {
    throw new TypeError("target is not an object");
  }
  for (var key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      target[key] = source[key];
    }
  }
  return target;
}
var MIME_TYPE = freeze({
  /**
   * `text/html`, the only mime type that triggers treating an XML document as HTML.
   *
   * @see DOMParser.SupportedType.isHTML
   * @see https://www.iana.org/assignments/media-types/text/html IANA MimeType registration
   * @see https://en.wikipedia.org/wiki/HTML Wikipedia
   * @see https://developer.mozilla.org/en-US/docs/Web/API/DOMParser/parseFromString MDN
   * @see https://html.spec.whatwg.org/multipage/dynamic-markup-insertion.html#dom-domparser-parsefromstring WHATWG HTML Spec
   */
  HTML: "text/html",
  /**
   * Helper method to check a mime type if it indicates an HTML document
   *
   * @param {string} [value]
   * @returns {boolean}
   *
   * @see https://www.iana.org/assignments/media-types/text/html IANA MimeType registration
   * @see https://en.wikipedia.org/wiki/HTML Wikipedia
   * @see https://developer.mozilla.org/en-US/docs/Web/API/DOMParser/parseFromString MDN
   * @see https://html.spec.whatwg.org/multipage/dynamic-markup-insertion.html#dom-domparser-parsefromstring 	 */
  isHTML: function(value) {
    return value === MIME_TYPE.HTML;
  },
  /**
   * `application/xml`, the standard mime type for XML documents.
   *
   * @see https://www.iana.org/assignments/media-types/application/xml IANA MimeType registration
   * @see https://tools.ietf.org/html/rfc7303#section-9.1 RFC 7303
   * @see https://en.wikipedia.org/wiki/XML_and_MIME Wikipedia
   */
  XML_APPLICATION: "application/xml",
  /**
   * `text/html`, an alias for `application/xml`.
   *
   * @see https://tools.ietf.org/html/rfc7303#section-9.2 RFC 7303
   * @see https://www.iana.org/assignments/media-types/text/xml IANA MimeType registration
   * @see https://en.wikipedia.org/wiki/XML_and_MIME Wikipedia
   */
  XML_TEXT: "text/xml",
  /**
   * `application/xhtml+xml`, indicates an XML document that has the default HTML namespace,
   * but is parsed as an XML document.
   *
   * @see https://www.iana.org/assignments/media-types/application/xhtml+xml IANA MimeType registration
   * @see https://dom.spec.whatwg.org/#dom-domimplementation-createdocument WHATWG DOM Spec
   * @see https://en.wikipedia.org/wiki/XHTML Wikipedia
   */
  XML_XHTML_APPLICATION: "application/xhtml+xml",
  /**
   * `image/svg+xml`,
   *
   * @see https://www.iana.org/assignments/media-types/image/svg+xml IANA MimeType registration
   * @see https://www.w3.org/TR/SVG11/ W3C SVG 1.1
   * @see https://en.wikipedia.org/wiki/Scalable_Vector_Graphics Wikipedia
   */
  XML_SVG_IMAGE: "image/svg+xml"
});
var NAMESPACE$3 = freeze({
  /**
   * The XHTML namespace.
   *
   * @see http://www.w3.org/1999/xhtml
   */
  HTML: "http://www.w3.org/1999/xhtml",
  /**
   * Checks if `uri` equals `NAMESPACE.HTML`.
   *
   * @param {string} [uri]
   *
   * @see NAMESPACE.HTML
   */
  isHTML: function(uri) {
    return uri === NAMESPACE$3.HTML;
  },
  /**
   * The SVG namespace.
   *
   * @see http://www.w3.org/2000/svg
   */
  SVG: "http://www.w3.org/2000/svg",
  /**
   * The `xml:` namespace.
   *
   * @see http://www.w3.org/XML/1998/namespace
   */
  XML: "http://www.w3.org/XML/1998/namespace",
  /**
   * The `xmlns:` namespace
   *
   * @see https://www.w3.org/2000/xmlns/
   */
  XMLNS: "http://www.w3.org/2000/xmlns/"
});
conventions$2.assign = assign;
conventions$2.find = find$1;
conventions$2.freeze = freeze;
conventions$2.MIME_TYPE = MIME_TYPE;
conventions$2.NAMESPACE = NAMESPACE$3;
var conventions$1 = conventions$2;
var find = conventions$1.find;
var NAMESPACE$2 = conventions$1.NAMESPACE;
function notEmptyString(input) {
  return input !== "";
}
function splitOnASCIIWhitespace(input) {
  return input ? input.split(/[\t\n\f\r ]+/).filter(notEmptyString) : [];
}
function orderedSetReducer(current, element) {
  if (!current.hasOwnProperty(element)) {
    current[element] = true;
  }
  return current;
}
function toOrderedSet(input) {
  if (!input) return [];
  var list = splitOnASCIIWhitespace(input);
  return Object.keys(list.reduce(orderedSetReducer, {}));
}
function arrayIncludes(list) {
  return function(element) {
    return list && list.indexOf(element) !== -1;
  };
}
function copy(src, dest) {
  for (var p in src) {
    if (Object.prototype.hasOwnProperty.call(src, p)) {
      dest[p] = src[p];
    }
  }
}
function _extends(Class, Super) {
  var pt = Class.prototype;
  if (!(pt instanceof Super)) {
    let t2 = function() {
    };
    t2.prototype = Super.prototype;
    t2 = new t2();
    copy(pt, t2);
    Class.prototype = pt = t2;
  }
  if (pt.constructor != Class) {
    if (typeof Class != "function") {
      console.error("unknown Class:" + Class);
    }
    pt.constructor = Class;
  }
}
var NodeType$1 = {};
var ELEMENT_NODE = NodeType$1.ELEMENT_NODE = 1;
var ATTRIBUTE_NODE = NodeType$1.ATTRIBUTE_NODE = 2;
var TEXT_NODE$1 = NodeType$1.TEXT_NODE = 3;
var CDATA_SECTION_NODE = NodeType$1.CDATA_SECTION_NODE = 4;
var ENTITY_REFERENCE_NODE = NodeType$1.ENTITY_REFERENCE_NODE = 5;
var ENTITY_NODE = NodeType$1.ENTITY_NODE = 6;
var PROCESSING_INSTRUCTION_NODE = NodeType$1.PROCESSING_INSTRUCTION_NODE = 7;
var COMMENT_NODE$1 = NodeType$1.COMMENT_NODE = 8;
var DOCUMENT_NODE = NodeType$1.DOCUMENT_NODE = 9;
var DOCUMENT_TYPE_NODE = NodeType$1.DOCUMENT_TYPE_NODE = 10;
var DOCUMENT_FRAGMENT_NODE = NodeType$1.DOCUMENT_FRAGMENT_NODE = 11;
var NOTATION_NODE = NodeType$1.NOTATION_NODE = 12;
var ExceptionCode = {};
var ExceptionMessage = {};
ExceptionCode.INDEX_SIZE_ERR = (ExceptionMessage[1] = "Index size error", 1);
ExceptionCode.DOMSTRING_SIZE_ERR = (ExceptionMessage[2] = "DOMString size error", 2);
var HIERARCHY_REQUEST_ERR = ExceptionCode.HIERARCHY_REQUEST_ERR = (ExceptionMessage[3] = "Hierarchy request error", 3);
ExceptionCode.WRONG_DOCUMENT_ERR = (ExceptionMessage[4] = "Wrong document", 4);
ExceptionCode.INVALID_CHARACTER_ERR = (ExceptionMessage[5] = "Invalid character", 5);
ExceptionCode.NO_DATA_ALLOWED_ERR = (ExceptionMessage[6] = "No data allowed", 6);
ExceptionCode.NO_MODIFICATION_ALLOWED_ERR = (ExceptionMessage[7] = "No modification allowed", 7);
var NOT_FOUND_ERR = ExceptionCode.NOT_FOUND_ERR = (ExceptionMessage[8] = "Not found", 8);
ExceptionCode.NOT_SUPPORTED_ERR = (ExceptionMessage[9] = "Not supported", 9);
var INUSE_ATTRIBUTE_ERR = ExceptionCode.INUSE_ATTRIBUTE_ERR = (ExceptionMessage[10] = "Attribute in use", 10);
ExceptionCode.INVALID_STATE_ERR = (ExceptionMessage[11] = "Invalid state", 11);
ExceptionCode.SYNTAX_ERR = (ExceptionMessage[12] = "Syntax error", 12);
ExceptionCode.INVALID_MODIFICATION_ERR = (ExceptionMessage[13] = "Invalid modification", 13);
ExceptionCode.NAMESPACE_ERR = (ExceptionMessage[14] = "Invalid namespace", 14);
ExceptionCode.INVALID_ACCESS_ERR = (ExceptionMessage[15] = "Invalid access", 15);
function DOMException(code2, message) {
  if (message instanceof Error) {
    var error = message;
  } else {
    error = this;
    Error.call(this, ExceptionMessage[code2]);
    this.message = ExceptionMessage[code2];
    if (Error.captureStackTrace) Error.captureStackTrace(this, DOMException);
  }
  error.code = code2;
  if (message) this.message = this.message + ": " + message;
  return error;
}
DOMException.prototype = Error.prototype;
copy(ExceptionCode, DOMException);
function NodeList() {
}
NodeList.prototype = {
  /**
   * The number of nodes in the list. The range of valid child node indices is 0 to length-1 inclusive.
   * @standard level1
   */
  length: 0,
  /**
   * Returns the indexth item in the collection. If index is greater than or equal to the number of nodes in the list, this returns null.
   * @standard level1
   * @param index  unsigned long
   *   Index into the collection.
   * @return Node
   * 	The node at the indexth position in the NodeList, or null if that is not a valid index.
   */
  item: function(index2) {
    return index2 >= 0 && index2 < this.length ? this[index2] : null;
  },
  toString: function(isHTML, nodeFilter) {
    for (var buf = [], i = 0; i < this.length; i++) {
      serializeToString(this[i], buf, isHTML, nodeFilter);
    }
    return buf.join("");
  },
  /**
   * @private
   * @param {function (Node):boolean} predicate
   * @returns {Node[]}
   */
  filter: function(predicate) {
    return Array.prototype.filter.call(this, predicate);
  },
  /**
   * @private
   * @param {Node} item
   * @returns {number}
   */
  indexOf: function(item) {
    return Array.prototype.indexOf.call(this, item);
  }
};
function LiveNodeList(node, refresh) {
  this._node = node;
  this._refresh = refresh;
  _updateLiveList(this);
}
function _updateLiveList(list) {
  var inc2 = list._node._inc || list._node.ownerDocument._inc;
  if (list._inc !== inc2) {
    var ls = list._refresh(list._node);
    __set__(list, "length", ls.length);
    if (!list.$$length || ls.length < list.$$length) {
      for (var i = ls.length; i in list; i++) {
        if (Object.prototype.hasOwnProperty.call(list, i)) {
          delete list[i];
        }
      }
    }
    copy(ls, list);
    list._inc = inc2;
  }
}
LiveNodeList.prototype.item = function(i) {
  _updateLiveList(this);
  return this[i] || null;
};
_extends(LiveNodeList, NodeList);
function NamedNodeMap() {
}
function _findNodeIndex(list, node) {
  var i = list.length;
  while (i--) {
    if (list[i] === node) {
      return i;
    }
  }
}
function _addNamedNode(el, list, newAttr, oldAttr) {
  if (oldAttr) {
    list[_findNodeIndex(list, oldAttr)] = newAttr;
  } else {
    list[list.length++] = newAttr;
  }
  if (el) {
    newAttr.ownerElement = el;
    var doc = el.ownerDocument;
    if (doc) {
      oldAttr && _onRemoveAttribute(doc, el, oldAttr);
      _onAddAttribute(doc, el, newAttr);
    }
  }
}
function _removeNamedNode(el, list, attr) {
  var i = _findNodeIndex(list, attr);
  if (i >= 0) {
    var lastIndex = list.length - 1;
    while (i < lastIndex) {
      list[i] = list[++i];
    }
    list.length = lastIndex;
    if (el) {
      var doc = el.ownerDocument;
      if (doc) {
        _onRemoveAttribute(doc, el, attr);
        attr.ownerElement = null;
      }
    }
  } else {
    throw new DOMException(NOT_FOUND_ERR, new Error(el.tagName + "@" + attr));
  }
}
NamedNodeMap.prototype = {
  length: 0,
  item: NodeList.prototype.item,
  getNamedItem: function(key) {
    var i = this.length;
    while (i--) {
      var attr = this[i];
      if (attr.nodeName == key) {
        return attr;
      }
    }
  },
  setNamedItem: function(attr) {
    var el = attr.ownerElement;
    if (el && el != this._ownerElement) {
      throw new DOMException(INUSE_ATTRIBUTE_ERR);
    }
    var oldAttr = this.getNamedItem(attr.nodeName);
    _addNamedNode(this._ownerElement, this, attr, oldAttr);
    return oldAttr;
  },
  /* returns Node */
  setNamedItemNS: function(attr) {
    var el = attr.ownerElement, oldAttr;
    if (el && el != this._ownerElement) {
      throw new DOMException(INUSE_ATTRIBUTE_ERR);
    }
    oldAttr = this.getNamedItemNS(attr.namespaceURI, attr.localName);
    _addNamedNode(this._ownerElement, this, attr, oldAttr);
    return oldAttr;
  },
  /* returns Node */
  removeNamedItem: function(key) {
    var attr = this.getNamedItem(key);
    _removeNamedNode(this._ownerElement, this, attr);
    return attr;
  },
  // raises: NOT_FOUND_ERR,NO_MODIFICATION_ALLOWED_ERR
  //for level2
  removeNamedItemNS: function(namespaceURI, localName) {
    var attr = this.getNamedItemNS(namespaceURI, localName);
    _removeNamedNode(this._ownerElement, this, attr);
    return attr;
  },
  getNamedItemNS: function(namespaceURI, localName) {
    var i = this.length;
    while (i--) {
      var node = this[i];
      if (node.localName == localName && node.namespaceURI == namespaceURI) {
        return node;
      }
    }
    return null;
  }
};
function DOMImplementation$1() {
}
DOMImplementation$1.prototype = {
  /**
   * The DOMImplementation.hasFeature() method returns a Boolean flag indicating if a given feature is supported.
   * The different implementations fairly diverged in what kind of features were reported.
   * The latest version of the spec settled to force this method to always return true, where the functionality was accurate and in use.
   *
   * @deprecated It is deprecated and modern browsers return true in all cases.
   *
   * @param {string} feature
   * @param {string} [version]
   * @returns {boolean} always true
   *
   * @see https://developer.mozilla.org/en-US/docs/Web/API/DOMImplementation/hasFeature MDN
   * @see https://www.w3.org/TR/REC-DOM-Level-1/level-one-core.html#ID-5CED94D7 DOM Level 1 Core
   * @see https://dom.spec.whatwg.org/#dom-domimplementation-hasfeature DOM Living Standard
   */
  hasFeature: function(feature, version2) {
    return true;
  },
  /**
   * Creates an XML Document object of the specified type with its document element.
   *
   * __It behaves slightly different from the description in the living standard__:
   * - There is no interface/class `XMLDocument`, it returns a `Document` instance.
   * - `contentType`, `encoding`, `mode`, `origin`, `url` fields are currently not declared.
   * - this implementation is not validating names or qualified names
   *   (when parsing XML strings, the SAX parser takes care of that)
   *
   * @param {string|null} namespaceURI
   * @param {string} qualifiedName
   * @param {DocumentType=null} doctype
   * @returns {Document}
   *
   * @see https://developer.mozilla.org/en-US/docs/Web/API/DOMImplementation/createDocument MDN
   * @see https://www.w3.org/TR/DOM-Level-2-Core/core.html#Level-2-Core-DOM-createDocument DOM Level 2 Core (initial)
   * @see https://dom.spec.whatwg.org/#dom-domimplementation-createdocument  DOM Level 2 Core
   *
   * @see https://dom.spec.whatwg.org/#validate-and-extract DOM: Validate and extract
   * @see https://www.w3.org/TR/xml/#NT-NameStartChar XML Spec: Names
   * @see https://www.w3.org/TR/xml-names/#ns-qualnames XML Namespaces: Qualified names
   */
  createDocument: function(namespaceURI, qualifiedName, doctype) {
    var doc = new Document();
    doc.implementation = this;
    doc.childNodes = new NodeList();
    doc.doctype = doctype || null;
    if (doctype) {
      doc.appendChild(doctype);
    }
    if (qualifiedName) {
      var root = doc.createElementNS(namespaceURI, qualifiedName);
      doc.appendChild(root);
    }
    return doc;
  },
  /**
   * Returns a doctype, with the given `qualifiedName`, `publicId`, and `systemId`.
   *
   * __This behavior is slightly different from the in the specs__:
   * - this implementation is not validating names or qualified names
   *   (when parsing XML strings, the SAX parser takes care of that)
   *
   * @param {string} qualifiedName
   * @param {string} [publicId]
   * @param {string} [systemId]
   * @returns {DocumentType} which can either be used with `DOMImplementation.createDocument` upon document creation
   * 				  or can be put into the document via methods like `Node.insertBefore()` or `Node.replaceChild()`
   *
   * @see https://developer.mozilla.org/en-US/docs/Web/API/DOMImplementation/createDocumentType MDN
   * @see https://www.w3.org/TR/DOM-Level-2-Core/core.html#Level-2-Core-DOM-createDocType DOM Level 2 Core
   * @see https://dom.spec.whatwg.org/#dom-domimplementation-createdocumenttype DOM Living Standard
   *
   * @see https://dom.spec.whatwg.org/#validate-and-extract DOM: Validate and extract
   * @see https://www.w3.org/TR/xml/#NT-NameStartChar XML Spec: Names
   * @see https://www.w3.org/TR/xml-names/#ns-qualnames XML Namespaces: Qualified names
   */
  createDocumentType: function(qualifiedName, publicId, systemId) {
    var node = new DocumentType();
    node.name = qualifiedName;
    node.nodeName = qualifiedName;
    node.publicId = publicId || "";
    node.systemId = systemId || "";
    return node;
  }
};
function Node() {
}
Node.prototype = {
  firstChild: null,
  lastChild: null,
  previousSibling: null,
  nextSibling: null,
  attributes: null,
  parentNode: null,
  childNodes: null,
  ownerDocument: null,
  nodeValue: null,
  namespaceURI: null,
  prefix: null,
  localName: null,
  // Modified in DOM Level 2:
  insertBefore: function(newChild, refChild) {
    return _insertBefore(this, newChild, refChild);
  },
  replaceChild: function(newChild, oldChild) {
    _insertBefore(this, newChild, oldChild, assertPreReplacementValidityInDocument);
    if (oldChild) {
      this.removeChild(oldChild);
    }
  },
  removeChild: function(oldChild) {
    return _removeChild(this, oldChild);
  },
  appendChild: function(newChild) {
    return this.insertBefore(newChild, null);
  },
  hasChildNodes: function() {
    return this.firstChild != null;
  },
  cloneNode: function(deep) {
    return cloneNode(this.ownerDocument || this, this, deep);
  },
  // Modified in DOM Level 2:
  normalize: function() {
    var child = this.firstChild;
    while (child) {
      var next = child.nextSibling;
      if (next && next.nodeType == TEXT_NODE$1 && child.nodeType == TEXT_NODE$1) {
        this.removeChild(next);
        child.appendData(next.data);
      } else {
        child.normalize();
        child = next;
      }
    }
  },
  // Introduced in DOM Level 2:
  isSupported: function(feature, version2) {
    return this.ownerDocument.implementation.hasFeature(feature, version2);
  },
  // Introduced in DOM Level 2:
  hasAttributes: function() {
    return this.attributes.length > 0;
  },
  /**
   * Look up the prefix associated to the given namespace URI, starting from this node.
   * **The default namespace declarations are ignored by this method.**
   * See Namespace Prefix Lookup for details on the algorithm used by this method.
   *
   * _Note: The implementation seems to be incomplete when compared to the algorithm described in the specs._
   *
   * @param {string | null} namespaceURI
   * @returns {string | null}
   * @see https://www.w3.org/TR/DOM-Level-3-Core/core.html#Node3-lookupNamespacePrefix
   * @see https://www.w3.org/TR/DOM-Level-3-Core/namespaces-algorithms.html#lookupNamespacePrefixAlgo
   * @see https://dom.spec.whatwg.org/#dom-node-lookupprefix
   * @see https://github.com/xmldom/xmldom/issues/322
   */
  lookupPrefix: function(namespaceURI) {
    var el = this;
    while (el) {
      var map = el._nsMap;
      if (map) {
        for (var n in map) {
          if (Object.prototype.hasOwnProperty.call(map, n) && map[n] === namespaceURI) {
            return n;
          }
        }
      }
      el = el.nodeType == ATTRIBUTE_NODE ? el.ownerDocument : el.parentNode;
    }
    return null;
  },
  // Introduced in DOM Level 3:
  lookupNamespaceURI: function(prefix) {
    var el = this;
    while (el) {
      var map = el._nsMap;
      if (map) {
        if (Object.prototype.hasOwnProperty.call(map, prefix)) {
          return map[prefix];
        }
      }
      el = el.nodeType == ATTRIBUTE_NODE ? el.ownerDocument : el.parentNode;
    }
    return null;
  },
  // Introduced in DOM Level 3:
  isDefaultNamespace: function(namespaceURI) {
    var prefix = this.lookupPrefix(namespaceURI);
    return prefix == null;
  }
};
function _xmlEncoder(c) {
  return c == "<" && "&lt;" || c == ">" && "&gt;" || c == "&" && "&amp;" || c == '"' && "&quot;" || "&#" + c.charCodeAt() + ";";
}
copy(NodeType$1, Node);
copy(NodeType$1, Node.prototype);
function _visitNode(node, callback) {
  if (callback(node)) {
    return true;
  }
  if (node = node.firstChild) {
    do {
      if (_visitNode(node, callback)) {
        return true;
      }
    } while (node = node.nextSibling);
  }
}
function Document() {
  this.ownerDocument = this;
}
function _onAddAttribute(doc, el, newAttr) {
  doc && doc._inc++;
  var ns = newAttr.namespaceURI;
  if (ns === NAMESPACE$2.XMLNS) {
    el._nsMap[newAttr.prefix ? newAttr.localName : ""] = newAttr.value;
  }
}
function _onRemoveAttribute(doc, el, newAttr, remove) {
  doc && doc._inc++;
  var ns = newAttr.namespaceURI;
  if (ns === NAMESPACE$2.XMLNS) {
    delete el._nsMap[newAttr.prefix ? newAttr.localName : ""];
  }
}
function _onUpdateChild(doc, el, newChild) {
  if (doc && doc._inc) {
    doc._inc++;
    var cs = el.childNodes;
    if (newChild) {
      cs[cs.length++] = newChild;
    } else {
      var child = el.firstChild;
      var i = 0;
      while (child) {
        cs[i++] = child;
        child = child.nextSibling;
      }
      cs.length = i;
      delete cs[cs.length];
    }
  }
}
function _removeChild(parentNode, child) {
  var previous = child.previousSibling;
  var next = child.nextSibling;
  if (previous) {
    previous.nextSibling = next;
  } else {
    parentNode.firstChild = next;
  }
  if (next) {
    next.previousSibling = previous;
  } else {
    parentNode.lastChild = previous;
  }
  child.parentNode = null;
  child.previousSibling = null;
  child.nextSibling = null;
  _onUpdateChild(parentNode.ownerDocument, parentNode);
  return child;
}
function hasValidParentNodeType(node) {
  return node && (node.nodeType === Node.DOCUMENT_NODE || node.nodeType === Node.DOCUMENT_FRAGMENT_NODE || node.nodeType === Node.ELEMENT_NODE);
}
function hasInsertableNodeType(node) {
  return node && (isElementNode(node) || isTextNode(node) || isDocTypeNode(node) || node.nodeType === Node.DOCUMENT_FRAGMENT_NODE || node.nodeType === Node.COMMENT_NODE || node.nodeType === Node.PROCESSING_INSTRUCTION_NODE);
}
function isDocTypeNode(node) {
  return node && node.nodeType === Node.DOCUMENT_TYPE_NODE;
}
function isElementNode(node) {
  return node && node.nodeType === Node.ELEMENT_NODE;
}
function isTextNode(node) {
  return node && node.nodeType === Node.TEXT_NODE;
}
function isElementInsertionPossible(doc, child) {
  var parentChildNodes = doc.childNodes || [];
  if (find(parentChildNodes, isElementNode) || isDocTypeNode(child)) {
    return false;
  }
  var docTypeNode = find(parentChildNodes, isDocTypeNode);
  return !(child && docTypeNode && parentChildNodes.indexOf(docTypeNode) > parentChildNodes.indexOf(child));
}
function isElementReplacementPossible(doc, child) {
  var parentChildNodes = doc.childNodes || [];
  function hasElementChildThatIsNotChild(node) {
    return isElementNode(node) && node !== child;
  }
  if (find(parentChildNodes, hasElementChildThatIsNotChild)) {
    return false;
  }
  var docTypeNode = find(parentChildNodes, isDocTypeNode);
  return !(child && docTypeNode && parentChildNodes.indexOf(docTypeNode) > parentChildNodes.indexOf(child));
}
function assertPreInsertionValidity1to5(parent, node, child) {
  if (!hasValidParentNodeType(parent)) {
    throw new DOMException(HIERARCHY_REQUEST_ERR, "Unexpected parent node type " + parent.nodeType);
  }
  if (child && child.parentNode !== parent) {
    throw new DOMException(NOT_FOUND_ERR, "child not in parent");
  }
  if (
    // 4. If `node` is not a DocumentFragment, DocumentType, Element, or CharacterData node, then throw a "HierarchyRequestError" DOMException.
    !hasInsertableNodeType(node) || // 5. If either `node` is a Text node and `parent` is a document,
    // the sax parser currently adds top level text nodes, this will be fixed in 0.9.0
    // || (node.nodeType === Node.TEXT_NODE && parent.nodeType === Node.DOCUMENT_NODE)
    // or `node` is a doctype and `parent` is not a document, then throw a "HierarchyRequestError" DOMException.
    isDocTypeNode(node) && parent.nodeType !== Node.DOCUMENT_NODE
  ) {
    throw new DOMException(
      HIERARCHY_REQUEST_ERR,
      "Unexpected node type " + node.nodeType + " for parent node type " + parent.nodeType
    );
  }
}
function assertPreInsertionValidityInDocument(parent, node, child) {
  var parentChildNodes = parent.childNodes || [];
  var nodeChildNodes = node.childNodes || [];
  if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
    var nodeChildElements = nodeChildNodes.filter(isElementNode);
    if (nodeChildElements.length > 1 || find(nodeChildNodes, isTextNode)) {
      throw new DOMException(HIERARCHY_REQUEST_ERR, "More than one element or text in fragment");
    }
    if (nodeChildElements.length === 1 && !isElementInsertionPossible(parent, child)) {
      throw new DOMException(HIERARCHY_REQUEST_ERR, "Element in fragment can not be inserted before doctype");
    }
  }
  if (isElementNode(node)) {
    if (!isElementInsertionPossible(parent, child)) {
      throw new DOMException(HIERARCHY_REQUEST_ERR, "Only one element can be added and only after doctype");
    }
  }
  if (isDocTypeNode(node)) {
    if (find(parentChildNodes, isDocTypeNode)) {
      throw new DOMException(HIERARCHY_REQUEST_ERR, "Only one doctype is allowed");
    }
    var parentElementChild = find(parentChildNodes, isElementNode);
    if (child && parentChildNodes.indexOf(parentElementChild) < parentChildNodes.indexOf(child)) {
      throw new DOMException(HIERARCHY_REQUEST_ERR, "Doctype can only be inserted before an element");
    }
    if (!child && parentElementChild) {
      throw new DOMException(HIERARCHY_REQUEST_ERR, "Doctype can not be appended since element is present");
    }
  }
}
function assertPreReplacementValidityInDocument(parent, node, child) {
  var parentChildNodes = parent.childNodes || [];
  var nodeChildNodes = node.childNodes || [];
  if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
    var nodeChildElements = nodeChildNodes.filter(isElementNode);
    if (nodeChildElements.length > 1 || find(nodeChildNodes, isTextNode)) {
      throw new DOMException(HIERARCHY_REQUEST_ERR, "More than one element or text in fragment");
    }
    if (nodeChildElements.length === 1 && !isElementReplacementPossible(parent, child)) {
      throw new DOMException(HIERARCHY_REQUEST_ERR, "Element in fragment can not be inserted before doctype");
    }
  }
  if (isElementNode(node)) {
    if (!isElementReplacementPossible(parent, child)) {
      throw new DOMException(HIERARCHY_REQUEST_ERR, "Only one element can be added and only after doctype");
    }
  }
  if (isDocTypeNode(node)) {
    let hasDoctypeChildThatIsNotChild = function(node2) {
      return isDocTypeNode(node2) && node2 !== child;
    };
    if (find(parentChildNodes, hasDoctypeChildThatIsNotChild)) {
      throw new DOMException(HIERARCHY_REQUEST_ERR, "Only one doctype is allowed");
    }
    var parentElementChild = find(parentChildNodes, isElementNode);
    if (child && parentChildNodes.indexOf(parentElementChild) < parentChildNodes.indexOf(child)) {
      throw new DOMException(HIERARCHY_REQUEST_ERR, "Doctype can only be inserted before an element");
    }
  }
}
function _insertBefore(parent, node, child, _inDocumentAssertion) {
  assertPreInsertionValidity1to5(parent, node, child);
  if (parent.nodeType === Node.DOCUMENT_NODE) {
    (_inDocumentAssertion || assertPreInsertionValidityInDocument)(parent, node, child);
  }
  var cp = node.parentNode;
  if (cp) {
    cp.removeChild(node);
  }
  if (node.nodeType === DOCUMENT_FRAGMENT_NODE) {
    var newFirst = node.firstChild;
    if (newFirst == null) {
      return node;
    }
    var newLast = node.lastChild;
  } else {
    newFirst = newLast = node;
  }
  var pre = child ? child.previousSibling : parent.lastChild;
  newFirst.previousSibling = pre;
  newLast.nextSibling = child;
  if (pre) {
    pre.nextSibling = newFirst;
  } else {
    parent.firstChild = newFirst;
  }
  if (child == null) {
    parent.lastChild = newLast;
  } else {
    child.previousSibling = newLast;
  }
  do {
    newFirst.parentNode = parent;
    var targetDoc = parent.ownerDocument || parent;
    _updateOwnerDocument(newFirst, targetDoc);
  } while (newFirst !== newLast && (newFirst = newFirst.nextSibling));
  _onUpdateChild(parent.ownerDocument || parent, parent);
  if (node.nodeType == DOCUMENT_FRAGMENT_NODE) {
    node.firstChild = node.lastChild = null;
  }
  return node;
}
function _updateOwnerDocument(node, newOwnerDocument) {
  if (node.ownerDocument === newOwnerDocument) {
    return;
  }
  node.ownerDocument = newOwnerDocument;
  if (node.nodeType === ELEMENT_NODE && node.attributes) {
    for (var i = 0; i < node.attributes.length; i++) {
      var attr = node.attributes.item(i);
      if (attr) {
        attr.ownerDocument = newOwnerDocument;
      }
    }
  }
  var child = node.firstChild;
  while (child) {
    _updateOwnerDocument(child, newOwnerDocument);
    child = child.nextSibling;
  }
}
function _appendSingleChild(parentNode, newChild) {
  if (newChild.parentNode) {
    newChild.parentNode.removeChild(newChild);
  }
  newChild.parentNode = parentNode;
  newChild.previousSibling = parentNode.lastChild;
  newChild.nextSibling = null;
  if (newChild.previousSibling) {
    newChild.previousSibling.nextSibling = newChild;
  } else {
    parentNode.firstChild = newChild;
  }
  parentNode.lastChild = newChild;
  _onUpdateChild(parentNode.ownerDocument, parentNode, newChild);
  var targetDoc = parentNode.ownerDocument || parentNode;
  _updateOwnerDocument(newChild, targetDoc);
  return newChild;
}
Document.prototype = {
  //implementation : null,
  nodeName: "#document",
  nodeType: DOCUMENT_NODE,
  /**
   * The DocumentType node of the document.
   *
   * @readonly
   * @type DocumentType
   */
  doctype: null,
  documentElement: null,
  _inc: 1,
  insertBefore: function(newChild, refChild) {
    if (newChild.nodeType == DOCUMENT_FRAGMENT_NODE) {
      var child = newChild.firstChild;
      while (child) {
        var next = child.nextSibling;
        this.insertBefore(child, refChild);
        child = next;
      }
      return newChild;
    }
    _insertBefore(this, newChild, refChild);
    _updateOwnerDocument(newChild, this);
    if (this.documentElement === null && newChild.nodeType === ELEMENT_NODE) {
      this.documentElement = newChild;
    }
    return newChild;
  },
  removeChild: function(oldChild) {
    if (this.documentElement == oldChild) {
      this.documentElement = null;
    }
    return _removeChild(this, oldChild);
  },
  replaceChild: function(newChild, oldChild) {
    _insertBefore(this, newChild, oldChild, assertPreReplacementValidityInDocument);
    _updateOwnerDocument(newChild, this);
    if (oldChild) {
      this.removeChild(oldChild);
    }
    if (isElementNode(newChild)) {
      this.documentElement = newChild;
    }
  },
  // Introduced in DOM Level 2:
  importNode: function(importedNode, deep) {
    return importNode(this, importedNode, deep);
  },
  // Introduced in DOM Level 2:
  getElementById: function(id) {
    var rtv = null;
    _visitNode(this.documentElement, function(node) {
      if (node.nodeType == ELEMENT_NODE) {
        if (node.getAttribute("id") == id) {
          rtv = node;
          return true;
        }
      }
    });
    return rtv;
  },
  /**
   * The `getElementsByClassName` method of `Document` interface returns an array-like object
   * of all child elements which have **all** of the given class name(s).
   *
   * Returns an empty list if `classeNames` is an empty string or only contains HTML white space characters.
   *
   *
   * Warning: This is a live LiveNodeList.
   * Changes in the DOM will reflect in the array as the changes occur.
   * If an element selected by this array no longer qualifies for the selector,
   * it will automatically be removed. Be aware of this for iteration purposes.
   *
   * @param {string} classNames is a string representing the class name(s) to match; multiple class names are separated by (ASCII-)whitespace
   *
   * @see https://developer.mozilla.org/en-US/docs/Web/API/Document/getElementsByClassName
   * @see https://dom.spec.whatwg.org/#concept-getelementsbyclassname
   */
  getElementsByClassName: function(classNames) {
    var classNamesSet = toOrderedSet(classNames);
    return new LiveNodeList(this, function(base) {
      var ls = [];
      if (classNamesSet.length > 0) {
        _visitNode(base.documentElement, function(node) {
          if (node !== base && node.nodeType === ELEMENT_NODE) {
            var nodeClassNames = node.getAttribute("class");
            if (nodeClassNames) {
              var matches = classNames === nodeClassNames;
              if (!matches) {
                var nodeClassNamesSet = toOrderedSet(nodeClassNames);
                matches = classNamesSet.every(arrayIncludes(nodeClassNamesSet));
              }
              if (matches) {
                ls.push(node);
              }
            }
          }
        });
      }
      return ls;
    });
  },
  //document factory method:
  createElement: function(tagName) {
    var node = new Element();
    node.ownerDocument = this;
    node.nodeName = tagName;
    node.tagName = tagName;
    node.localName = tagName;
    node.childNodes = new NodeList();
    var attrs = node.attributes = new NamedNodeMap();
    attrs._ownerElement = node;
    return node;
  },
  createDocumentFragment: function() {
    var node = new DocumentFragment();
    node.ownerDocument = this;
    node.childNodes = new NodeList();
    return node;
  },
  createTextNode: function(data) {
    var node = new Text();
    node.ownerDocument = this;
    node.appendData(data);
    return node;
  },
  createComment: function(data) {
    var node = new Comment();
    node.ownerDocument = this;
    node.appendData(data);
    return node;
  },
  createCDATASection: function(data) {
    var node = new CDATASection();
    node.ownerDocument = this;
    node.appendData(data);
    return node;
  },
  createProcessingInstruction: function(target, data) {
    var node = new ProcessingInstruction();
    node.ownerDocument = this;
    node.tagName = node.nodeName = node.target = target;
    node.nodeValue = node.data = data;
    return node;
  },
  createAttribute: function(name) {
    var node = new Attr();
    node.ownerDocument = this;
    node.name = name;
    node.nodeName = name;
    node.localName = name;
    node.specified = true;
    return node;
  },
  createEntityReference: function(name) {
    var node = new EntityReference();
    node.ownerDocument = this;
    node.nodeName = name;
    return node;
  },
  // Introduced in DOM Level 2:
  createElementNS: function(namespaceURI, qualifiedName) {
    var node = new Element();
    var pl = qualifiedName.split(":");
    var attrs = node.attributes = new NamedNodeMap();
    node.childNodes = new NodeList();
    node.ownerDocument = this;
    node.nodeName = qualifiedName;
    node.tagName = qualifiedName;
    node.namespaceURI = namespaceURI;
    if (pl.length == 2) {
      node.prefix = pl[0];
      node.localName = pl[1];
    } else {
      node.localName = qualifiedName;
    }
    attrs._ownerElement = node;
    return node;
  },
  // Introduced in DOM Level 2:
  createAttributeNS: function(namespaceURI, qualifiedName) {
    var node = new Attr();
    var pl = qualifiedName.split(":");
    node.ownerDocument = this;
    node.nodeName = qualifiedName;
    node.name = qualifiedName;
    node.namespaceURI = namespaceURI;
    node.specified = true;
    if (pl.length == 2) {
      node.prefix = pl[0];
      node.localName = pl[1];
    } else {
      node.localName = qualifiedName;
    }
    return node;
  }
};
_extends(Document, Node);
function Element() {
  this._nsMap = {};
}
Element.prototype = {
  nodeType: ELEMENT_NODE,
  hasAttribute: function(name) {
    return this.getAttributeNode(name) != null;
  },
  getAttribute: function(name) {
    var attr = this.getAttributeNode(name);
    return attr && attr.value || "";
  },
  getAttributeNode: function(name) {
    return this.attributes.getNamedItem(name);
  },
  setAttribute: function(name, value) {
    var attr = this.ownerDocument.createAttribute(name);
    attr.value = attr.nodeValue = "" + value;
    this.setAttributeNode(attr);
  },
  removeAttribute: function(name) {
    var attr = this.getAttributeNode(name);
    attr && this.removeAttributeNode(attr);
  },
  //four real opeartion method
  appendChild: function(newChild) {
    if (newChild.nodeType === DOCUMENT_FRAGMENT_NODE) {
      return this.insertBefore(newChild, null);
    } else {
      return _appendSingleChild(this, newChild);
    }
  },
  setAttributeNode: function(newAttr) {
    return this.attributes.setNamedItem(newAttr);
  },
  setAttributeNodeNS: function(newAttr) {
    return this.attributes.setNamedItemNS(newAttr);
  },
  removeAttributeNode: function(oldAttr) {
    return this.attributes.removeNamedItem(oldAttr.nodeName);
  },
  //get real attribute name,and remove it by removeAttributeNode
  removeAttributeNS: function(namespaceURI, localName) {
    var old = this.getAttributeNodeNS(namespaceURI, localName);
    old && this.removeAttributeNode(old);
  },
  hasAttributeNS: function(namespaceURI, localName) {
    return this.getAttributeNodeNS(namespaceURI, localName) != null;
  },
  getAttributeNS: function(namespaceURI, localName) {
    var attr = this.getAttributeNodeNS(namespaceURI, localName);
    return attr && attr.value || "";
  },
  setAttributeNS: function(namespaceURI, qualifiedName, value) {
    var attr = this.ownerDocument.createAttributeNS(namespaceURI, qualifiedName);
    attr.value = attr.nodeValue = "" + value;
    this.setAttributeNode(attr);
  },
  getAttributeNodeNS: function(namespaceURI, localName) {
    return this.attributes.getNamedItemNS(namespaceURI, localName);
  },
  getElementsByTagName: function(tagName) {
    return new LiveNodeList(this, function(base) {
      var ls = [];
      _visitNode(base, function(node) {
        if (node !== base && node.nodeType == ELEMENT_NODE && (tagName === "*" || node.tagName == tagName)) {
          ls.push(node);
        }
      });
      return ls;
    });
  },
  getElementsByTagNameNS: function(namespaceURI, localName) {
    return new LiveNodeList(this, function(base) {
      var ls = [];
      _visitNode(base, function(node) {
        if (node !== base && node.nodeType === ELEMENT_NODE && (namespaceURI === "*" || node.namespaceURI === namespaceURI) && (localName === "*" || node.localName == localName)) {
          ls.push(node);
        }
      });
      return ls;
    });
  }
};
Document.prototype.getElementsByTagName = Element.prototype.getElementsByTagName;
Document.prototype.getElementsByTagNameNS = Element.prototype.getElementsByTagNameNS;
_extends(Element, Node);
function Attr() {
}
Attr.prototype.nodeType = ATTRIBUTE_NODE;
_extends(Attr, Node);
function CharacterData() {
}
CharacterData.prototype = {
  data: "",
  substringData: function(offset, count) {
    return this.data.substring(offset, offset + count);
  },
  appendData: function(text) {
    text = this.data + text;
    this.nodeValue = this.data = text;
    this.length = text.length;
  },
  insertData: function(offset, text) {
    this.replaceData(offset, 0, text);
  },
  appendChild: function(newChild) {
    throw new Error(ExceptionMessage[HIERARCHY_REQUEST_ERR]);
  },
  deleteData: function(offset, count) {
    this.replaceData(offset, count, "");
  },
  replaceData: function(offset, count, text) {
    var start = this.data.substring(0, offset);
    var end = this.data.substring(offset + count);
    text = start + text + end;
    this.nodeValue = this.data = text;
    this.length = text.length;
  }
};
_extends(CharacterData, Node);
function Text() {
}
Text.prototype = {
  nodeName: "#text",
  nodeType: TEXT_NODE$1,
  splitText: function(offset) {
    var text = this.data;
    var newText = text.substring(offset);
    text = text.substring(0, offset);
    this.data = this.nodeValue = text;
    this.length = text.length;
    var newNode = this.ownerDocument.createTextNode(newText);
    if (this.parentNode) {
      this.parentNode.insertBefore(newNode, this.nextSibling);
    }
    return newNode;
  }
};
_extends(Text, CharacterData);
function Comment() {
}
Comment.prototype = {
  nodeName: "#comment",
  nodeType: COMMENT_NODE$1
};
_extends(Comment, CharacterData);
function CDATASection() {
}
CDATASection.prototype = {
  nodeName: "#cdata-section",
  nodeType: CDATA_SECTION_NODE
};
_extends(CDATASection, CharacterData);
function DocumentType() {
}
DocumentType.prototype.nodeType = DOCUMENT_TYPE_NODE;
_extends(DocumentType, Node);
function Notation() {
}
Notation.prototype.nodeType = NOTATION_NODE;
_extends(Notation, Node);
function Entity() {
}
Entity.prototype.nodeType = ENTITY_NODE;
_extends(Entity, Node);
function EntityReference() {
}
EntityReference.prototype.nodeType = ENTITY_REFERENCE_NODE;
_extends(EntityReference, Node);
function DocumentFragment() {
}
DocumentFragment.prototype.nodeName = "#document-fragment";
DocumentFragment.prototype.nodeType = DOCUMENT_FRAGMENT_NODE;
_extends(DocumentFragment, Node);
function ProcessingInstruction() {
}
ProcessingInstruction.prototype.nodeType = PROCESSING_INSTRUCTION_NODE;
_extends(ProcessingInstruction, Node);
function XMLSerializer() {
}
XMLSerializer.prototype.serializeToString = function(node, isHtml, nodeFilter) {
  return nodeSerializeToString.call(node, isHtml, nodeFilter);
};
Node.prototype.toString = nodeSerializeToString;
function nodeSerializeToString(isHtml, nodeFilter) {
  var buf = [];
  var refNode = this.nodeType == 9 && this.documentElement || this;
  var prefix = refNode.prefix;
  var uri = refNode.namespaceURI;
  if (uri && prefix == null) {
    var prefix = refNode.lookupPrefix(uri);
    if (prefix == null) {
      var visibleNamespaces = [
        { namespace: uri, prefix: null }
        //{namespace:uri,prefix:''}
      ];
    }
  }
  serializeToString(this, buf, isHtml, nodeFilter, visibleNamespaces);
  return buf.join("");
}
function needNamespaceDefine(node, isHTML, visibleNamespaces) {
  var prefix = node.prefix || "";
  var uri = node.namespaceURI;
  if (!uri) {
    return false;
  }
  if (prefix === "xml" && uri === NAMESPACE$2.XML || uri === NAMESPACE$2.XMLNS) {
    return false;
  }
  var i = visibleNamespaces.length;
  while (i--) {
    var ns = visibleNamespaces[i];
    if (ns.prefix === prefix) {
      return ns.namespace !== uri;
    }
  }
  return true;
}
function addSerializedAttribute(buf, qualifiedName, value) {
  buf.push(" ", qualifiedName, '="', value.replace(/[<>&"\t\n\r]/g, _xmlEncoder), '"');
}
function serializeToString(node, buf, isHTML, nodeFilter, visibleNamespaces) {
  if (!visibleNamespaces) {
    visibleNamespaces = [];
  }
  if (nodeFilter) {
    node = nodeFilter(node);
    if (node) {
      if (typeof node == "string") {
        buf.push(node);
        return;
      }
    } else {
      return;
    }
  }
  switch (node.nodeType) {
    case ELEMENT_NODE:
      var attrs = node.attributes;
      var len = attrs.length;
      var child = node.firstChild;
      var nodeName = node.tagName;
      isHTML = NAMESPACE$2.isHTML(node.namespaceURI) || isHTML;
      var prefixedNodeName = nodeName;
      if (!isHTML && !node.prefix && node.namespaceURI) {
        var defaultNS;
        for (var ai2 = 0; ai2 < attrs.length; ai2++) {
          if (attrs.item(ai2).name === "xmlns") {
            defaultNS = attrs.item(ai2).value;
            break;
          }
        }
        if (!defaultNS) {
          for (var nsi = visibleNamespaces.length - 1; nsi >= 0; nsi--) {
            var namespace = visibleNamespaces[nsi];
            if (namespace.prefix === "" && namespace.namespace === node.namespaceURI) {
              defaultNS = namespace.namespace;
              break;
            }
          }
        }
        if (defaultNS !== node.namespaceURI) {
          for (var nsi = visibleNamespaces.length - 1; nsi >= 0; nsi--) {
            var namespace = visibleNamespaces[nsi];
            if (namespace.namespace === node.namespaceURI) {
              if (namespace.prefix) {
                prefixedNodeName = namespace.prefix + ":" + nodeName;
              }
              break;
            }
          }
        }
      }
      buf.push("<", prefixedNodeName);
      for (var i = 0; i < len; i++) {
        var attr = attrs.item(i);
        if (attr.prefix == "xmlns") {
          visibleNamespaces.push({ prefix: attr.localName, namespace: attr.value });
        } else if (attr.nodeName == "xmlns") {
          visibleNamespaces.push({ prefix: "", namespace: attr.value });
        }
      }
      for (var i = 0; i < len; i++) {
        var attr = attrs.item(i);
        if (needNamespaceDefine(attr, isHTML, visibleNamespaces)) {
          var prefix = attr.prefix || "";
          var uri = attr.namespaceURI;
          addSerializedAttribute(buf, prefix ? "xmlns:" + prefix : "xmlns", uri);
          visibleNamespaces.push({ prefix, namespace: uri });
        }
        serializeToString(attr, buf, isHTML, nodeFilter, visibleNamespaces);
      }
      if (nodeName === prefixedNodeName && needNamespaceDefine(node, isHTML, visibleNamespaces)) {
        var prefix = node.prefix || "";
        var uri = node.namespaceURI;
        addSerializedAttribute(buf, prefix ? "xmlns:" + prefix : "xmlns", uri);
        visibleNamespaces.push({ prefix, namespace: uri });
      }
      if (child || isHTML && !/^(?:meta|link|img|br|hr|input)$/i.test(nodeName)) {
        buf.push(">");
        if (isHTML && /^script$/i.test(nodeName)) {
          while (child) {
            if (child.data) {
              buf.push(child.data);
            } else {
              serializeToString(child, buf, isHTML, nodeFilter, visibleNamespaces.slice());
            }
            child = child.nextSibling;
          }
        } else {
          while (child) {
            serializeToString(child, buf, isHTML, nodeFilter, visibleNamespaces.slice());
            child = child.nextSibling;
          }
        }
        buf.push("</", prefixedNodeName, ">");
      } else {
        buf.push("/>");
      }
      return;
    case DOCUMENT_NODE:
    case DOCUMENT_FRAGMENT_NODE:
      var child = node.firstChild;
      while (child) {
        serializeToString(child, buf, isHTML, nodeFilter, visibleNamespaces.slice());
        child = child.nextSibling;
      }
      return;
    case ATTRIBUTE_NODE:
      return addSerializedAttribute(buf, node.name, node.value);
    case TEXT_NODE$1:
      return buf.push(
        node.data.replace(/[<&>]/g, _xmlEncoder)
      );
    case CDATA_SECTION_NODE:
      return buf.push("<![CDATA[", node.data, "]]>");
    case COMMENT_NODE$1:
      return buf.push("<!--", node.data, "-->");
    case DOCUMENT_TYPE_NODE:
      var pubid = node.publicId;
      var sysid = node.systemId;
      buf.push("<!DOCTYPE ", node.name);
      if (pubid) {
        buf.push(" PUBLIC ", pubid);
        if (sysid && sysid != ".") {
          buf.push(" ", sysid);
        }
        buf.push(">");
      } else if (sysid && sysid != ".") {
        buf.push(" SYSTEM ", sysid, ">");
      } else {
        var sub = node.internalSubset;
        if (sub) {
          buf.push(" [", sub, "]");
        }
        buf.push(">");
      }
      return;
    case PROCESSING_INSTRUCTION_NODE:
      return buf.push("<?", node.target, " ", node.data, "?>");
    case ENTITY_REFERENCE_NODE:
      return buf.push("&", node.nodeName, ";");
    default:
      buf.push("??", node.nodeName);
  }
}
function importNode(doc, node, deep) {
  var node2;
  switch (node.nodeType) {
    case ELEMENT_NODE:
      node2 = node.cloneNode(false);
      node2.ownerDocument = doc;
    case DOCUMENT_FRAGMENT_NODE:
      break;
    case ATTRIBUTE_NODE:
      deep = true;
      break;
  }
  if (!node2) {
    node2 = node.cloneNode(false);
  }
  node2.ownerDocument = doc;
  node2.parentNode = null;
  if (deep) {
    var child = node.firstChild;
    while (child) {
      node2.appendChild(importNode(doc, child, deep));
      child = child.nextSibling;
    }
  }
  return node2;
}
function cloneNode(doc, node, deep) {
  var node2 = new node.constructor();
  for (var n in node) {
    if (Object.prototype.hasOwnProperty.call(node, n)) {
      var v = node[n];
      if (typeof v != "object") {
        if (v != node2[n]) {
          node2[n] = v;
        }
      }
    }
  }
  if (node.childNodes) {
    node2.childNodes = new NodeList();
  }
  node2.ownerDocument = doc;
  switch (node2.nodeType) {
    case ELEMENT_NODE:
      var attrs = node.attributes;
      var attrs2 = node2.attributes = new NamedNodeMap();
      var len = attrs.length;
      attrs2._ownerElement = node2;
      for (var i = 0; i < len; i++) {
        node2.setAttributeNode(cloneNode(doc, attrs.item(i), true));
      }
      break;
    case ATTRIBUTE_NODE:
      deep = true;
  }
  if (deep) {
    var child = node.firstChild;
    while (child) {
      node2.appendChild(cloneNode(doc, child, deep));
      child = child.nextSibling;
    }
  }
  return node2;
}
function __set__(object, key, value) {
  object[key] = value;
}
try {
  if (Object.defineProperty) {
    let getTextContent = function(node) {
      switch (node.nodeType) {
        case ELEMENT_NODE:
        case DOCUMENT_FRAGMENT_NODE:
          var buf = [];
          node = node.firstChild;
          while (node) {
            if (node.nodeType !== 7 && node.nodeType !== 8) {
              buf.push(getTextContent(node));
            }
            node = node.nextSibling;
          }
          return buf.join("");
        default:
          return node.nodeValue;
      }
    };
    Object.defineProperty(LiveNodeList.prototype, "length", {
      get: function() {
        _updateLiveList(this);
        return this.$$length;
      }
    });
    Object.defineProperty(Node.prototype, "textContent", {
      get: function() {
        return getTextContent(this);
      },
      set: function(data) {
        switch (this.nodeType) {
          case ELEMENT_NODE:
          case DOCUMENT_FRAGMENT_NODE:
            while (this.firstChild) {
              this.removeChild(this.firstChild);
            }
            if (data || String(data)) {
              this.appendChild(this.ownerDocument.createTextNode(data));
            }
            break;
          default:
            this.data = data;
            this.value = data;
            this.nodeValue = data;
        }
      }
    });
    __set__ = function(object, key, value) {
      object["$$" + key] = value;
    };
  }
} catch (e) {
}
dom$2.DocumentType = DocumentType;
dom$2.DOMException = DOMException;
dom$2.DOMImplementation = DOMImplementation$1;
dom$2.Element = Element;
dom$2.Node = Node;
dom$2.NodeList = NodeList;
dom$2.XMLSerializer = XMLSerializer;
var domParser = {};
var entities$1 = {};
(function(exports$1) {
  var freeze2 = conventions$2.freeze;
  exports$1.XML_ENTITIES = freeze2({
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    quot: '"'
  });
  exports$1.HTML_ENTITIES = freeze2({
    Aacute: "Á",
    aacute: "á",
    Abreve: "Ă",
    abreve: "ă",
    ac: "∾",
    acd: "∿",
    acE: "∾̳",
    Acirc: "Â",
    acirc: "â",
    acute: "´",
    Acy: "А",
    acy: "а",
    AElig: "Æ",
    aelig: "æ",
    af: "⁡",
    Afr: "𝔄",
    afr: "𝔞",
    Agrave: "À",
    agrave: "à",
    alefsym: "ℵ",
    aleph: "ℵ",
    Alpha: "Α",
    alpha: "α",
    Amacr: "Ā",
    amacr: "ā",
    amalg: "⨿",
    AMP: "&",
    amp: "&",
    And: "⩓",
    and: "∧",
    andand: "⩕",
    andd: "⩜",
    andslope: "⩘",
    andv: "⩚",
    ang: "∠",
    ange: "⦤",
    angle: "∠",
    angmsd: "∡",
    angmsdaa: "⦨",
    angmsdab: "⦩",
    angmsdac: "⦪",
    angmsdad: "⦫",
    angmsdae: "⦬",
    angmsdaf: "⦭",
    angmsdag: "⦮",
    angmsdah: "⦯",
    angrt: "∟",
    angrtvb: "⊾",
    angrtvbd: "⦝",
    angsph: "∢",
    angst: "Å",
    angzarr: "⍼",
    Aogon: "Ą",
    aogon: "ą",
    Aopf: "𝔸",
    aopf: "𝕒",
    ap: "≈",
    apacir: "⩯",
    apE: "⩰",
    ape: "≊",
    apid: "≋",
    apos: "'",
    ApplyFunction: "⁡",
    approx: "≈",
    approxeq: "≊",
    Aring: "Å",
    aring: "å",
    Ascr: "𝒜",
    ascr: "𝒶",
    Assign: "≔",
    ast: "*",
    asymp: "≈",
    asympeq: "≍",
    Atilde: "Ã",
    atilde: "ã",
    Auml: "Ä",
    auml: "ä",
    awconint: "∳",
    awint: "⨑",
    backcong: "≌",
    backepsilon: "϶",
    backprime: "‵",
    backsim: "∽",
    backsimeq: "⋍",
    Backslash: "∖",
    Barv: "⫧",
    barvee: "⊽",
    Barwed: "⌆",
    barwed: "⌅",
    barwedge: "⌅",
    bbrk: "⎵",
    bbrktbrk: "⎶",
    bcong: "≌",
    Bcy: "Б",
    bcy: "б",
    bdquo: "„",
    becaus: "∵",
    Because: "∵",
    because: "∵",
    bemptyv: "⦰",
    bepsi: "϶",
    bernou: "ℬ",
    Bernoullis: "ℬ",
    Beta: "Β",
    beta: "β",
    beth: "ℶ",
    between: "≬",
    Bfr: "𝔅",
    bfr: "𝔟",
    bigcap: "⋂",
    bigcirc: "◯",
    bigcup: "⋃",
    bigodot: "⨀",
    bigoplus: "⨁",
    bigotimes: "⨂",
    bigsqcup: "⨆",
    bigstar: "★",
    bigtriangledown: "▽",
    bigtriangleup: "△",
    biguplus: "⨄",
    bigvee: "⋁",
    bigwedge: "⋀",
    bkarow: "⤍",
    blacklozenge: "⧫",
    blacksquare: "▪",
    blacktriangle: "▴",
    blacktriangledown: "▾",
    blacktriangleleft: "◂",
    blacktriangleright: "▸",
    blank: "␣",
    blk12: "▒",
    blk14: "░",
    blk34: "▓",
    block: "█",
    bne: "=⃥",
    bnequiv: "≡⃥",
    bNot: "⫭",
    bnot: "⌐",
    Bopf: "𝔹",
    bopf: "𝕓",
    bot: "⊥",
    bottom: "⊥",
    bowtie: "⋈",
    boxbox: "⧉",
    boxDL: "╗",
    boxDl: "╖",
    boxdL: "╕",
    boxdl: "┐",
    boxDR: "╔",
    boxDr: "╓",
    boxdR: "╒",
    boxdr: "┌",
    boxH: "═",
    boxh: "─",
    boxHD: "╦",
    boxHd: "╤",
    boxhD: "╥",
    boxhd: "┬",
    boxHU: "╩",
    boxHu: "╧",
    boxhU: "╨",
    boxhu: "┴",
    boxminus: "⊟",
    boxplus: "⊞",
    boxtimes: "⊠",
    boxUL: "╝",
    boxUl: "╜",
    boxuL: "╛",
    boxul: "┘",
    boxUR: "╚",
    boxUr: "╙",
    boxuR: "╘",
    boxur: "└",
    boxV: "║",
    boxv: "│",
    boxVH: "╬",
    boxVh: "╫",
    boxvH: "╪",
    boxvh: "┼",
    boxVL: "╣",
    boxVl: "╢",
    boxvL: "╡",
    boxvl: "┤",
    boxVR: "╠",
    boxVr: "╟",
    boxvR: "╞",
    boxvr: "├",
    bprime: "‵",
    Breve: "˘",
    breve: "˘",
    brvbar: "¦",
    Bscr: "ℬ",
    bscr: "𝒷",
    bsemi: "⁏",
    bsim: "∽",
    bsime: "⋍",
    bsol: "\\",
    bsolb: "⧅",
    bsolhsub: "⟈",
    bull: "•",
    bullet: "•",
    bump: "≎",
    bumpE: "⪮",
    bumpe: "≏",
    Bumpeq: "≎",
    bumpeq: "≏",
    Cacute: "Ć",
    cacute: "ć",
    Cap: "⋒",
    cap: "∩",
    capand: "⩄",
    capbrcup: "⩉",
    capcap: "⩋",
    capcup: "⩇",
    capdot: "⩀",
    CapitalDifferentialD: "ⅅ",
    caps: "∩︀",
    caret: "⁁",
    caron: "ˇ",
    Cayleys: "ℭ",
    ccaps: "⩍",
    Ccaron: "Č",
    ccaron: "č",
    Ccedil: "Ç",
    ccedil: "ç",
    Ccirc: "Ĉ",
    ccirc: "ĉ",
    Cconint: "∰",
    ccups: "⩌",
    ccupssm: "⩐",
    Cdot: "Ċ",
    cdot: "ċ",
    cedil: "¸",
    Cedilla: "¸",
    cemptyv: "⦲",
    cent: "¢",
    CenterDot: "·",
    centerdot: "·",
    Cfr: "ℭ",
    cfr: "𝔠",
    CHcy: "Ч",
    chcy: "ч",
    check: "✓",
    checkmark: "✓",
    Chi: "Χ",
    chi: "χ",
    cir: "○",
    circ: "ˆ",
    circeq: "≗",
    circlearrowleft: "↺",
    circlearrowright: "↻",
    circledast: "⊛",
    circledcirc: "⊚",
    circleddash: "⊝",
    CircleDot: "⊙",
    circledR: "®",
    circledS: "Ⓢ",
    CircleMinus: "⊖",
    CirclePlus: "⊕",
    CircleTimes: "⊗",
    cirE: "⧃",
    cire: "≗",
    cirfnint: "⨐",
    cirmid: "⫯",
    cirscir: "⧂",
    ClockwiseContourIntegral: "∲",
    CloseCurlyDoubleQuote: "”",
    CloseCurlyQuote: "’",
    clubs: "♣",
    clubsuit: "♣",
    Colon: "∷",
    colon: ":",
    Colone: "⩴",
    colone: "≔",
    coloneq: "≔",
    comma: ",",
    commat: "@",
    comp: "∁",
    compfn: "∘",
    complement: "∁",
    complexes: "ℂ",
    cong: "≅",
    congdot: "⩭",
    Congruent: "≡",
    Conint: "∯",
    conint: "∮",
    ContourIntegral: "∮",
    Copf: "ℂ",
    copf: "𝕔",
    coprod: "∐",
    Coproduct: "∐",
    COPY: "©",
    copy: "©",
    copysr: "℗",
    CounterClockwiseContourIntegral: "∳",
    crarr: "↵",
    Cross: "⨯",
    cross: "✗",
    Cscr: "𝒞",
    cscr: "𝒸",
    csub: "⫏",
    csube: "⫑",
    csup: "⫐",
    csupe: "⫒",
    ctdot: "⋯",
    cudarrl: "⤸",
    cudarrr: "⤵",
    cuepr: "⋞",
    cuesc: "⋟",
    cularr: "↶",
    cularrp: "⤽",
    Cup: "⋓",
    cup: "∪",
    cupbrcap: "⩈",
    CupCap: "≍",
    cupcap: "⩆",
    cupcup: "⩊",
    cupdot: "⊍",
    cupor: "⩅",
    cups: "∪︀",
    curarr: "↷",
    curarrm: "⤼",
    curlyeqprec: "⋞",
    curlyeqsucc: "⋟",
    curlyvee: "⋎",
    curlywedge: "⋏",
    curren: "¤",
    curvearrowleft: "↶",
    curvearrowright: "↷",
    cuvee: "⋎",
    cuwed: "⋏",
    cwconint: "∲",
    cwint: "∱",
    cylcty: "⌭",
    Dagger: "‡",
    dagger: "†",
    daleth: "ℸ",
    Darr: "↡",
    dArr: "⇓",
    darr: "↓",
    dash: "‐",
    Dashv: "⫤",
    dashv: "⊣",
    dbkarow: "⤏",
    dblac: "˝",
    Dcaron: "Ď",
    dcaron: "ď",
    Dcy: "Д",
    dcy: "д",
    DD: "ⅅ",
    dd: "ⅆ",
    ddagger: "‡",
    ddarr: "⇊",
    DDotrahd: "⤑",
    ddotseq: "⩷",
    deg: "°",
    Del: "∇",
    Delta: "Δ",
    delta: "δ",
    demptyv: "⦱",
    dfisht: "⥿",
    Dfr: "𝔇",
    dfr: "𝔡",
    dHar: "⥥",
    dharl: "⇃",
    dharr: "⇂",
    DiacriticalAcute: "´",
    DiacriticalDot: "˙",
    DiacriticalDoubleAcute: "˝",
    DiacriticalGrave: "`",
    DiacriticalTilde: "˜",
    diam: "⋄",
    Diamond: "⋄",
    diamond: "⋄",
    diamondsuit: "♦",
    diams: "♦",
    die: "¨",
    DifferentialD: "ⅆ",
    digamma: "ϝ",
    disin: "⋲",
    div: "÷",
    divide: "÷",
    divideontimes: "⋇",
    divonx: "⋇",
    DJcy: "Ђ",
    djcy: "ђ",
    dlcorn: "⌞",
    dlcrop: "⌍",
    dollar: "$",
    Dopf: "𝔻",
    dopf: "𝕕",
    Dot: "¨",
    dot: "˙",
    DotDot: "⃜",
    doteq: "≐",
    doteqdot: "≑",
    DotEqual: "≐",
    dotminus: "∸",
    dotplus: "∔",
    dotsquare: "⊡",
    doublebarwedge: "⌆",
    DoubleContourIntegral: "∯",
    DoubleDot: "¨",
    DoubleDownArrow: "⇓",
    DoubleLeftArrow: "⇐",
    DoubleLeftRightArrow: "⇔",
    DoubleLeftTee: "⫤",
    DoubleLongLeftArrow: "⟸",
    DoubleLongLeftRightArrow: "⟺",
    DoubleLongRightArrow: "⟹",
    DoubleRightArrow: "⇒",
    DoubleRightTee: "⊨",
    DoubleUpArrow: "⇑",
    DoubleUpDownArrow: "⇕",
    DoubleVerticalBar: "∥",
    DownArrow: "↓",
    Downarrow: "⇓",
    downarrow: "↓",
    DownArrowBar: "⤓",
    DownArrowUpArrow: "⇵",
    DownBreve: "̑",
    downdownarrows: "⇊",
    downharpoonleft: "⇃",
    downharpoonright: "⇂",
    DownLeftRightVector: "⥐",
    DownLeftTeeVector: "⥞",
    DownLeftVector: "↽",
    DownLeftVectorBar: "⥖",
    DownRightTeeVector: "⥟",
    DownRightVector: "⇁",
    DownRightVectorBar: "⥗",
    DownTee: "⊤",
    DownTeeArrow: "↧",
    drbkarow: "⤐",
    drcorn: "⌟",
    drcrop: "⌌",
    Dscr: "𝒟",
    dscr: "𝒹",
    DScy: "Ѕ",
    dscy: "ѕ",
    dsol: "⧶",
    Dstrok: "Đ",
    dstrok: "đ",
    dtdot: "⋱",
    dtri: "▿",
    dtrif: "▾",
    duarr: "⇵",
    duhar: "⥯",
    dwangle: "⦦",
    DZcy: "Џ",
    dzcy: "џ",
    dzigrarr: "⟿",
    Eacute: "É",
    eacute: "é",
    easter: "⩮",
    Ecaron: "Ě",
    ecaron: "ě",
    ecir: "≖",
    Ecirc: "Ê",
    ecirc: "ê",
    ecolon: "≕",
    Ecy: "Э",
    ecy: "э",
    eDDot: "⩷",
    Edot: "Ė",
    eDot: "≑",
    edot: "ė",
    ee: "ⅇ",
    efDot: "≒",
    Efr: "𝔈",
    efr: "𝔢",
    eg: "⪚",
    Egrave: "È",
    egrave: "è",
    egs: "⪖",
    egsdot: "⪘",
    el: "⪙",
    Element: "∈",
    elinters: "⏧",
    ell: "ℓ",
    els: "⪕",
    elsdot: "⪗",
    Emacr: "Ē",
    emacr: "ē",
    empty: "∅",
    emptyset: "∅",
    EmptySmallSquare: "◻",
    emptyv: "∅",
    EmptyVerySmallSquare: "▫",
    emsp: " ",
    emsp13: " ",
    emsp14: " ",
    ENG: "Ŋ",
    eng: "ŋ",
    ensp: " ",
    Eogon: "Ę",
    eogon: "ę",
    Eopf: "𝔼",
    eopf: "𝕖",
    epar: "⋕",
    eparsl: "⧣",
    eplus: "⩱",
    epsi: "ε",
    Epsilon: "Ε",
    epsilon: "ε",
    epsiv: "ϵ",
    eqcirc: "≖",
    eqcolon: "≕",
    eqsim: "≂",
    eqslantgtr: "⪖",
    eqslantless: "⪕",
    Equal: "⩵",
    equals: "=",
    EqualTilde: "≂",
    equest: "≟",
    Equilibrium: "⇌",
    equiv: "≡",
    equivDD: "⩸",
    eqvparsl: "⧥",
    erarr: "⥱",
    erDot: "≓",
    Escr: "ℰ",
    escr: "ℯ",
    esdot: "≐",
    Esim: "⩳",
    esim: "≂",
    Eta: "Η",
    eta: "η",
    ETH: "Ð",
    eth: "ð",
    Euml: "Ë",
    euml: "ë",
    euro: "€",
    excl: "!",
    exist: "∃",
    Exists: "∃",
    expectation: "ℰ",
    ExponentialE: "ⅇ",
    exponentiale: "ⅇ",
    fallingdotseq: "≒",
    Fcy: "Ф",
    fcy: "ф",
    female: "♀",
    ffilig: "ﬃ",
    fflig: "ﬀ",
    ffllig: "ﬄ",
    Ffr: "𝔉",
    ffr: "𝔣",
    filig: "ﬁ",
    FilledSmallSquare: "◼",
    FilledVerySmallSquare: "▪",
    fjlig: "fj",
    flat: "♭",
    fllig: "ﬂ",
    fltns: "▱",
    fnof: "ƒ",
    Fopf: "𝔽",
    fopf: "𝕗",
    ForAll: "∀",
    forall: "∀",
    fork: "⋔",
    forkv: "⫙",
    Fouriertrf: "ℱ",
    fpartint: "⨍",
    frac12: "½",
    frac13: "⅓",
    frac14: "¼",
    frac15: "⅕",
    frac16: "⅙",
    frac18: "⅛",
    frac23: "⅔",
    frac25: "⅖",
    frac34: "¾",
    frac35: "⅗",
    frac38: "⅜",
    frac45: "⅘",
    frac56: "⅚",
    frac58: "⅝",
    frac78: "⅞",
    frasl: "⁄",
    frown: "⌢",
    Fscr: "ℱ",
    fscr: "𝒻",
    gacute: "ǵ",
    Gamma: "Γ",
    gamma: "γ",
    Gammad: "Ϝ",
    gammad: "ϝ",
    gap: "⪆",
    Gbreve: "Ğ",
    gbreve: "ğ",
    Gcedil: "Ģ",
    Gcirc: "Ĝ",
    gcirc: "ĝ",
    Gcy: "Г",
    gcy: "г",
    Gdot: "Ġ",
    gdot: "ġ",
    gE: "≧",
    ge: "≥",
    gEl: "⪌",
    gel: "⋛",
    geq: "≥",
    geqq: "≧",
    geqslant: "⩾",
    ges: "⩾",
    gescc: "⪩",
    gesdot: "⪀",
    gesdoto: "⪂",
    gesdotol: "⪄",
    gesl: "⋛︀",
    gesles: "⪔",
    Gfr: "𝔊",
    gfr: "𝔤",
    Gg: "⋙",
    gg: "≫",
    ggg: "⋙",
    gimel: "ℷ",
    GJcy: "Ѓ",
    gjcy: "ѓ",
    gl: "≷",
    gla: "⪥",
    glE: "⪒",
    glj: "⪤",
    gnap: "⪊",
    gnapprox: "⪊",
    gnE: "≩",
    gne: "⪈",
    gneq: "⪈",
    gneqq: "≩",
    gnsim: "⋧",
    Gopf: "𝔾",
    gopf: "𝕘",
    grave: "`",
    GreaterEqual: "≥",
    GreaterEqualLess: "⋛",
    GreaterFullEqual: "≧",
    GreaterGreater: "⪢",
    GreaterLess: "≷",
    GreaterSlantEqual: "⩾",
    GreaterTilde: "≳",
    Gscr: "𝒢",
    gscr: "ℊ",
    gsim: "≳",
    gsime: "⪎",
    gsiml: "⪐",
    Gt: "≫",
    GT: ">",
    gt: ">",
    gtcc: "⪧",
    gtcir: "⩺",
    gtdot: "⋗",
    gtlPar: "⦕",
    gtquest: "⩼",
    gtrapprox: "⪆",
    gtrarr: "⥸",
    gtrdot: "⋗",
    gtreqless: "⋛",
    gtreqqless: "⪌",
    gtrless: "≷",
    gtrsim: "≳",
    gvertneqq: "≩︀",
    gvnE: "≩︀",
    Hacek: "ˇ",
    hairsp: " ",
    half: "½",
    hamilt: "ℋ",
    HARDcy: "Ъ",
    hardcy: "ъ",
    hArr: "⇔",
    harr: "↔",
    harrcir: "⥈",
    harrw: "↭",
    Hat: "^",
    hbar: "ℏ",
    Hcirc: "Ĥ",
    hcirc: "ĥ",
    hearts: "♥",
    heartsuit: "♥",
    hellip: "…",
    hercon: "⊹",
    Hfr: "ℌ",
    hfr: "𝔥",
    HilbertSpace: "ℋ",
    hksearow: "⤥",
    hkswarow: "⤦",
    hoarr: "⇿",
    homtht: "∻",
    hookleftarrow: "↩",
    hookrightarrow: "↪",
    Hopf: "ℍ",
    hopf: "𝕙",
    horbar: "―",
    HorizontalLine: "─",
    Hscr: "ℋ",
    hscr: "𝒽",
    hslash: "ℏ",
    Hstrok: "Ħ",
    hstrok: "ħ",
    HumpDownHump: "≎",
    HumpEqual: "≏",
    hybull: "⁃",
    hyphen: "‐",
    Iacute: "Í",
    iacute: "í",
    ic: "⁣",
    Icirc: "Î",
    icirc: "î",
    Icy: "И",
    icy: "и",
    Idot: "İ",
    IEcy: "Е",
    iecy: "е",
    iexcl: "¡",
    iff: "⇔",
    Ifr: "ℑ",
    ifr: "𝔦",
    Igrave: "Ì",
    igrave: "ì",
    ii: "ⅈ",
    iiiint: "⨌",
    iiint: "∭",
    iinfin: "⧜",
    iiota: "℩",
    IJlig: "Ĳ",
    ijlig: "ĳ",
    Im: "ℑ",
    Imacr: "Ī",
    imacr: "ī",
    image: "ℑ",
    ImaginaryI: "ⅈ",
    imagline: "ℐ",
    imagpart: "ℑ",
    imath: "ı",
    imof: "⊷",
    imped: "Ƶ",
    Implies: "⇒",
    in: "∈",
    incare: "℅",
    infin: "∞",
    infintie: "⧝",
    inodot: "ı",
    Int: "∬",
    int: "∫",
    intcal: "⊺",
    integers: "ℤ",
    Integral: "∫",
    intercal: "⊺",
    Intersection: "⋂",
    intlarhk: "⨗",
    intprod: "⨼",
    InvisibleComma: "⁣",
    InvisibleTimes: "⁢",
    IOcy: "Ё",
    iocy: "ё",
    Iogon: "Į",
    iogon: "į",
    Iopf: "𝕀",
    iopf: "𝕚",
    Iota: "Ι",
    iota: "ι",
    iprod: "⨼",
    iquest: "¿",
    Iscr: "ℐ",
    iscr: "𝒾",
    isin: "∈",
    isindot: "⋵",
    isinE: "⋹",
    isins: "⋴",
    isinsv: "⋳",
    isinv: "∈",
    it: "⁢",
    Itilde: "Ĩ",
    itilde: "ĩ",
    Iukcy: "І",
    iukcy: "і",
    Iuml: "Ï",
    iuml: "ï",
    Jcirc: "Ĵ",
    jcirc: "ĵ",
    Jcy: "Й",
    jcy: "й",
    Jfr: "𝔍",
    jfr: "𝔧",
    jmath: "ȷ",
    Jopf: "𝕁",
    jopf: "𝕛",
    Jscr: "𝒥",
    jscr: "𝒿",
    Jsercy: "Ј",
    jsercy: "ј",
    Jukcy: "Є",
    jukcy: "є",
    Kappa: "Κ",
    kappa: "κ",
    kappav: "ϰ",
    Kcedil: "Ķ",
    kcedil: "ķ",
    Kcy: "К",
    kcy: "к",
    Kfr: "𝔎",
    kfr: "𝔨",
    kgreen: "ĸ",
    KHcy: "Х",
    khcy: "х",
    KJcy: "Ќ",
    kjcy: "ќ",
    Kopf: "𝕂",
    kopf: "𝕜",
    Kscr: "𝒦",
    kscr: "𝓀",
    lAarr: "⇚",
    Lacute: "Ĺ",
    lacute: "ĺ",
    laemptyv: "⦴",
    lagran: "ℒ",
    Lambda: "Λ",
    lambda: "λ",
    Lang: "⟪",
    lang: "⟨",
    langd: "⦑",
    langle: "⟨",
    lap: "⪅",
    Laplacetrf: "ℒ",
    laquo: "«",
    Larr: "↞",
    lArr: "⇐",
    larr: "←",
    larrb: "⇤",
    larrbfs: "⤟",
    larrfs: "⤝",
    larrhk: "↩",
    larrlp: "↫",
    larrpl: "⤹",
    larrsim: "⥳",
    larrtl: "↢",
    lat: "⪫",
    lAtail: "⤛",
    latail: "⤙",
    late: "⪭",
    lates: "⪭︀",
    lBarr: "⤎",
    lbarr: "⤌",
    lbbrk: "❲",
    lbrace: "{",
    lbrack: "[",
    lbrke: "⦋",
    lbrksld: "⦏",
    lbrkslu: "⦍",
    Lcaron: "Ľ",
    lcaron: "ľ",
    Lcedil: "Ļ",
    lcedil: "ļ",
    lceil: "⌈",
    lcub: "{",
    Lcy: "Л",
    lcy: "л",
    ldca: "⤶",
    ldquo: "“",
    ldquor: "„",
    ldrdhar: "⥧",
    ldrushar: "⥋",
    ldsh: "↲",
    lE: "≦",
    le: "≤",
    LeftAngleBracket: "⟨",
    LeftArrow: "←",
    Leftarrow: "⇐",
    leftarrow: "←",
    LeftArrowBar: "⇤",
    LeftArrowRightArrow: "⇆",
    leftarrowtail: "↢",
    LeftCeiling: "⌈",
    LeftDoubleBracket: "⟦",
    LeftDownTeeVector: "⥡",
    LeftDownVector: "⇃",
    LeftDownVectorBar: "⥙",
    LeftFloor: "⌊",
    leftharpoondown: "↽",
    leftharpoonup: "↼",
    leftleftarrows: "⇇",
    LeftRightArrow: "↔",
    Leftrightarrow: "⇔",
    leftrightarrow: "↔",
    leftrightarrows: "⇆",
    leftrightharpoons: "⇋",
    leftrightsquigarrow: "↭",
    LeftRightVector: "⥎",
    LeftTee: "⊣",
    LeftTeeArrow: "↤",
    LeftTeeVector: "⥚",
    leftthreetimes: "⋋",
    LeftTriangle: "⊲",
    LeftTriangleBar: "⧏",
    LeftTriangleEqual: "⊴",
    LeftUpDownVector: "⥑",
    LeftUpTeeVector: "⥠",
    LeftUpVector: "↿",
    LeftUpVectorBar: "⥘",
    LeftVector: "↼",
    LeftVectorBar: "⥒",
    lEg: "⪋",
    leg: "⋚",
    leq: "≤",
    leqq: "≦",
    leqslant: "⩽",
    les: "⩽",
    lescc: "⪨",
    lesdot: "⩿",
    lesdoto: "⪁",
    lesdotor: "⪃",
    lesg: "⋚︀",
    lesges: "⪓",
    lessapprox: "⪅",
    lessdot: "⋖",
    lesseqgtr: "⋚",
    lesseqqgtr: "⪋",
    LessEqualGreater: "⋚",
    LessFullEqual: "≦",
    LessGreater: "≶",
    lessgtr: "≶",
    LessLess: "⪡",
    lesssim: "≲",
    LessSlantEqual: "⩽",
    LessTilde: "≲",
    lfisht: "⥼",
    lfloor: "⌊",
    Lfr: "𝔏",
    lfr: "𝔩",
    lg: "≶",
    lgE: "⪑",
    lHar: "⥢",
    lhard: "↽",
    lharu: "↼",
    lharul: "⥪",
    lhblk: "▄",
    LJcy: "Љ",
    ljcy: "љ",
    Ll: "⋘",
    ll: "≪",
    llarr: "⇇",
    llcorner: "⌞",
    Lleftarrow: "⇚",
    llhard: "⥫",
    lltri: "◺",
    Lmidot: "Ŀ",
    lmidot: "ŀ",
    lmoust: "⎰",
    lmoustache: "⎰",
    lnap: "⪉",
    lnapprox: "⪉",
    lnE: "≨",
    lne: "⪇",
    lneq: "⪇",
    lneqq: "≨",
    lnsim: "⋦",
    loang: "⟬",
    loarr: "⇽",
    lobrk: "⟦",
    LongLeftArrow: "⟵",
    Longleftarrow: "⟸",
    longleftarrow: "⟵",
    LongLeftRightArrow: "⟷",
    Longleftrightarrow: "⟺",
    longleftrightarrow: "⟷",
    longmapsto: "⟼",
    LongRightArrow: "⟶",
    Longrightarrow: "⟹",
    longrightarrow: "⟶",
    looparrowleft: "↫",
    looparrowright: "↬",
    lopar: "⦅",
    Lopf: "𝕃",
    lopf: "𝕝",
    loplus: "⨭",
    lotimes: "⨴",
    lowast: "∗",
    lowbar: "_",
    LowerLeftArrow: "↙",
    LowerRightArrow: "↘",
    loz: "◊",
    lozenge: "◊",
    lozf: "⧫",
    lpar: "(",
    lparlt: "⦓",
    lrarr: "⇆",
    lrcorner: "⌟",
    lrhar: "⇋",
    lrhard: "⥭",
    lrm: "‎",
    lrtri: "⊿",
    lsaquo: "‹",
    Lscr: "ℒ",
    lscr: "𝓁",
    Lsh: "↰",
    lsh: "↰",
    lsim: "≲",
    lsime: "⪍",
    lsimg: "⪏",
    lsqb: "[",
    lsquo: "‘",
    lsquor: "‚",
    Lstrok: "Ł",
    lstrok: "ł",
    Lt: "≪",
    LT: "<",
    lt: "<",
    ltcc: "⪦",
    ltcir: "⩹",
    ltdot: "⋖",
    lthree: "⋋",
    ltimes: "⋉",
    ltlarr: "⥶",
    ltquest: "⩻",
    ltri: "◃",
    ltrie: "⊴",
    ltrif: "◂",
    ltrPar: "⦖",
    lurdshar: "⥊",
    luruhar: "⥦",
    lvertneqq: "≨︀",
    lvnE: "≨︀",
    macr: "¯",
    male: "♂",
    malt: "✠",
    maltese: "✠",
    Map: "⤅",
    map: "↦",
    mapsto: "↦",
    mapstodown: "↧",
    mapstoleft: "↤",
    mapstoup: "↥",
    marker: "▮",
    mcomma: "⨩",
    Mcy: "М",
    mcy: "м",
    mdash: "—",
    mDDot: "∺",
    measuredangle: "∡",
    MediumSpace: " ",
    Mellintrf: "ℳ",
    Mfr: "𝔐",
    mfr: "𝔪",
    mho: "℧",
    micro: "µ",
    mid: "∣",
    midast: "*",
    midcir: "⫰",
    middot: "·",
    minus: "−",
    minusb: "⊟",
    minusd: "∸",
    minusdu: "⨪",
    MinusPlus: "∓",
    mlcp: "⫛",
    mldr: "…",
    mnplus: "∓",
    models: "⊧",
    Mopf: "𝕄",
    mopf: "𝕞",
    mp: "∓",
    Mscr: "ℳ",
    mscr: "𝓂",
    mstpos: "∾",
    Mu: "Μ",
    mu: "μ",
    multimap: "⊸",
    mumap: "⊸",
    nabla: "∇",
    Nacute: "Ń",
    nacute: "ń",
    nang: "∠⃒",
    nap: "≉",
    napE: "⩰̸",
    napid: "≋̸",
    napos: "ŉ",
    napprox: "≉",
    natur: "♮",
    natural: "♮",
    naturals: "ℕ",
    nbsp: " ",
    nbump: "≎̸",
    nbumpe: "≏̸",
    ncap: "⩃",
    Ncaron: "Ň",
    ncaron: "ň",
    Ncedil: "Ņ",
    ncedil: "ņ",
    ncong: "≇",
    ncongdot: "⩭̸",
    ncup: "⩂",
    Ncy: "Н",
    ncy: "н",
    ndash: "–",
    ne: "≠",
    nearhk: "⤤",
    neArr: "⇗",
    nearr: "↗",
    nearrow: "↗",
    nedot: "≐̸",
    NegativeMediumSpace: "​",
    NegativeThickSpace: "​",
    NegativeThinSpace: "​",
    NegativeVeryThinSpace: "​",
    nequiv: "≢",
    nesear: "⤨",
    nesim: "≂̸",
    NestedGreaterGreater: "≫",
    NestedLessLess: "≪",
    NewLine: "\n",
    nexist: "∄",
    nexists: "∄",
    Nfr: "𝔑",
    nfr: "𝔫",
    ngE: "≧̸",
    nge: "≱",
    ngeq: "≱",
    ngeqq: "≧̸",
    ngeqslant: "⩾̸",
    nges: "⩾̸",
    nGg: "⋙̸",
    ngsim: "≵",
    nGt: "≫⃒",
    ngt: "≯",
    ngtr: "≯",
    nGtv: "≫̸",
    nhArr: "⇎",
    nharr: "↮",
    nhpar: "⫲",
    ni: "∋",
    nis: "⋼",
    nisd: "⋺",
    niv: "∋",
    NJcy: "Њ",
    njcy: "њ",
    nlArr: "⇍",
    nlarr: "↚",
    nldr: "‥",
    nlE: "≦̸",
    nle: "≰",
    nLeftarrow: "⇍",
    nleftarrow: "↚",
    nLeftrightarrow: "⇎",
    nleftrightarrow: "↮",
    nleq: "≰",
    nleqq: "≦̸",
    nleqslant: "⩽̸",
    nles: "⩽̸",
    nless: "≮",
    nLl: "⋘̸",
    nlsim: "≴",
    nLt: "≪⃒",
    nlt: "≮",
    nltri: "⋪",
    nltrie: "⋬",
    nLtv: "≪̸",
    nmid: "∤",
    NoBreak: "⁠",
    NonBreakingSpace: " ",
    Nopf: "ℕ",
    nopf: "𝕟",
    Not: "⫬",
    not: "¬",
    NotCongruent: "≢",
    NotCupCap: "≭",
    NotDoubleVerticalBar: "∦",
    NotElement: "∉",
    NotEqual: "≠",
    NotEqualTilde: "≂̸",
    NotExists: "∄",
    NotGreater: "≯",
    NotGreaterEqual: "≱",
    NotGreaterFullEqual: "≧̸",
    NotGreaterGreater: "≫̸",
    NotGreaterLess: "≹",
    NotGreaterSlantEqual: "⩾̸",
    NotGreaterTilde: "≵",
    NotHumpDownHump: "≎̸",
    NotHumpEqual: "≏̸",
    notin: "∉",
    notindot: "⋵̸",
    notinE: "⋹̸",
    notinva: "∉",
    notinvb: "⋷",
    notinvc: "⋶",
    NotLeftTriangle: "⋪",
    NotLeftTriangleBar: "⧏̸",
    NotLeftTriangleEqual: "⋬",
    NotLess: "≮",
    NotLessEqual: "≰",
    NotLessGreater: "≸",
    NotLessLess: "≪̸",
    NotLessSlantEqual: "⩽̸",
    NotLessTilde: "≴",
    NotNestedGreaterGreater: "⪢̸",
    NotNestedLessLess: "⪡̸",
    notni: "∌",
    notniva: "∌",
    notnivb: "⋾",
    notnivc: "⋽",
    NotPrecedes: "⊀",
    NotPrecedesEqual: "⪯̸",
    NotPrecedesSlantEqual: "⋠",
    NotReverseElement: "∌",
    NotRightTriangle: "⋫",
    NotRightTriangleBar: "⧐̸",
    NotRightTriangleEqual: "⋭",
    NotSquareSubset: "⊏̸",
    NotSquareSubsetEqual: "⋢",
    NotSquareSuperset: "⊐̸",
    NotSquareSupersetEqual: "⋣",
    NotSubset: "⊂⃒",
    NotSubsetEqual: "⊈",
    NotSucceeds: "⊁",
    NotSucceedsEqual: "⪰̸",
    NotSucceedsSlantEqual: "⋡",
    NotSucceedsTilde: "≿̸",
    NotSuperset: "⊃⃒",
    NotSupersetEqual: "⊉",
    NotTilde: "≁",
    NotTildeEqual: "≄",
    NotTildeFullEqual: "≇",
    NotTildeTilde: "≉",
    NotVerticalBar: "∤",
    npar: "∦",
    nparallel: "∦",
    nparsl: "⫽⃥",
    npart: "∂̸",
    npolint: "⨔",
    npr: "⊀",
    nprcue: "⋠",
    npre: "⪯̸",
    nprec: "⊀",
    npreceq: "⪯̸",
    nrArr: "⇏",
    nrarr: "↛",
    nrarrc: "⤳̸",
    nrarrw: "↝̸",
    nRightarrow: "⇏",
    nrightarrow: "↛",
    nrtri: "⋫",
    nrtrie: "⋭",
    nsc: "⊁",
    nsccue: "⋡",
    nsce: "⪰̸",
    Nscr: "𝒩",
    nscr: "𝓃",
    nshortmid: "∤",
    nshortparallel: "∦",
    nsim: "≁",
    nsime: "≄",
    nsimeq: "≄",
    nsmid: "∤",
    nspar: "∦",
    nsqsube: "⋢",
    nsqsupe: "⋣",
    nsub: "⊄",
    nsubE: "⫅̸",
    nsube: "⊈",
    nsubset: "⊂⃒",
    nsubseteq: "⊈",
    nsubseteqq: "⫅̸",
    nsucc: "⊁",
    nsucceq: "⪰̸",
    nsup: "⊅",
    nsupE: "⫆̸",
    nsupe: "⊉",
    nsupset: "⊃⃒",
    nsupseteq: "⊉",
    nsupseteqq: "⫆̸",
    ntgl: "≹",
    Ntilde: "Ñ",
    ntilde: "ñ",
    ntlg: "≸",
    ntriangleleft: "⋪",
    ntrianglelefteq: "⋬",
    ntriangleright: "⋫",
    ntrianglerighteq: "⋭",
    Nu: "Ν",
    nu: "ν",
    num: "#",
    numero: "№",
    numsp: " ",
    nvap: "≍⃒",
    nVDash: "⊯",
    nVdash: "⊮",
    nvDash: "⊭",
    nvdash: "⊬",
    nvge: "≥⃒",
    nvgt: ">⃒",
    nvHarr: "⤄",
    nvinfin: "⧞",
    nvlArr: "⤂",
    nvle: "≤⃒",
    nvlt: "<⃒",
    nvltrie: "⊴⃒",
    nvrArr: "⤃",
    nvrtrie: "⊵⃒",
    nvsim: "∼⃒",
    nwarhk: "⤣",
    nwArr: "⇖",
    nwarr: "↖",
    nwarrow: "↖",
    nwnear: "⤧",
    Oacute: "Ó",
    oacute: "ó",
    oast: "⊛",
    ocir: "⊚",
    Ocirc: "Ô",
    ocirc: "ô",
    Ocy: "О",
    ocy: "о",
    odash: "⊝",
    Odblac: "Ő",
    odblac: "ő",
    odiv: "⨸",
    odot: "⊙",
    odsold: "⦼",
    OElig: "Œ",
    oelig: "œ",
    ofcir: "⦿",
    Ofr: "𝔒",
    ofr: "𝔬",
    ogon: "˛",
    Ograve: "Ò",
    ograve: "ò",
    ogt: "⧁",
    ohbar: "⦵",
    ohm: "Ω",
    oint: "∮",
    olarr: "↺",
    olcir: "⦾",
    olcross: "⦻",
    oline: "‾",
    olt: "⧀",
    Omacr: "Ō",
    omacr: "ō",
    Omega: "Ω",
    omega: "ω",
    Omicron: "Ο",
    omicron: "ο",
    omid: "⦶",
    ominus: "⊖",
    Oopf: "𝕆",
    oopf: "𝕠",
    opar: "⦷",
    OpenCurlyDoubleQuote: "“",
    OpenCurlyQuote: "‘",
    operp: "⦹",
    oplus: "⊕",
    Or: "⩔",
    or: "∨",
    orarr: "↻",
    ord: "⩝",
    order: "ℴ",
    orderof: "ℴ",
    ordf: "ª",
    ordm: "º",
    origof: "⊶",
    oror: "⩖",
    orslope: "⩗",
    orv: "⩛",
    oS: "Ⓢ",
    Oscr: "𝒪",
    oscr: "ℴ",
    Oslash: "Ø",
    oslash: "ø",
    osol: "⊘",
    Otilde: "Õ",
    otilde: "õ",
    Otimes: "⨷",
    otimes: "⊗",
    otimesas: "⨶",
    Ouml: "Ö",
    ouml: "ö",
    ovbar: "⌽",
    OverBar: "‾",
    OverBrace: "⏞",
    OverBracket: "⎴",
    OverParenthesis: "⏜",
    par: "∥",
    para: "¶",
    parallel: "∥",
    parsim: "⫳",
    parsl: "⫽",
    part: "∂",
    PartialD: "∂",
    Pcy: "П",
    pcy: "п",
    percnt: "%",
    period: ".",
    permil: "‰",
    perp: "⊥",
    pertenk: "‱",
    Pfr: "𝔓",
    pfr: "𝔭",
    Phi: "Φ",
    phi: "φ",
    phiv: "ϕ",
    phmmat: "ℳ",
    phone: "☎",
    Pi: "Π",
    pi: "π",
    pitchfork: "⋔",
    piv: "ϖ",
    planck: "ℏ",
    planckh: "ℎ",
    plankv: "ℏ",
    plus: "+",
    plusacir: "⨣",
    plusb: "⊞",
    pluscir: "⨢",
    plusdo: "∔",
    plusdu: "⨥",
    pluse: "⩲",
    PlusMinus: "±",
    plusmn: "±",
    plussim: "⨦",
    plustwo: "⨧",
    pm: "±",
    Poincareplane: "ℌ",
    pointint: "⨕",
    Popf: "ℙ",
    popf: "𝕡",
    pound: "£",
    Pr: "⪻",
    pr: "≺",
    prap: "⪷",
    prcue: "≼",
    prE: "⪳",
    pre: "⪯",
    prec: "≺",
    precapprox: "⪷",
    preccurlyeq: "≼",
    Precedes: "≺",
    PrecedesEqual: "⪯",
    PrecedesSlantEqual: "≼",
    PrecedesTilde: "≾",
    preceq: "⪯",
    precnapprox: "⪹",
    precneqq: "⪵",
    precnsim: "⋨",
    precsim: "≾",
    Prime: "″",
    prime: "′",
    primes: "ℙ",
    prnap: "⪹",
    prnE: "⪵",
    prnsim: "⋨",
    prod: "∏",
    Product: "∏",
    profalar: "⌮",
    profline: "⌒",
    profsurf: "⌓",
    prop: "∝",
    Proportion: "∷",
    Proportional: "∝",
    propto: "∝",
    prsim: "≾",
    prurel: "⊰",
    Pscr: "𝒫",
    pscr: "𝓅",
    Psi: "Ψ",
    psi: "ψ",
    puncsp: " ",
    Qfr: "𝔔",
    qfr: "𝔮",
    qint: "⨌",
    Qopf: "ℚ",
    qopf: "𝕢",
    qprime: "⁗",
    Qscr: "𝒬",
    qscr: "𝓆",
    quaternions: "ℍ",
    quatint: "⨖",
    quest: "?",
    questeq: "≟",
    QUOT: '"',
    quot: '"',
    rAarr: "⇛",
    race: "∽̱",
    Racute: "Ŕ",
    racute: "ŕ",
    radic: "√",
    raemptyv: "⦳",
    Rang: "⟫",
    rang: "⟩",
    rangd: "⦒",
    range: "⦥",
    rangle: "⟩",
    raquo: "»",
    Rarr: "↠",
    rArr: "⇒",
    rarr: "→",
    rarrap: "⥵",
    rarrb: "⇥",
    rarrbfs: "⤠",
    rarrc: "⤳",
    rarrfs: "⤞",
    rarrhk: "↪",
    rarrlp: "↬",
    rarrpl: "⥅",
    rarrsim: "⥴",
    Rarrtl: "⤖",
    rarrtl: "↣",
    rarrw: "↝",
    rAtail: "⤜",
    ratail: "⤚",
    ratio: "∶",
    rationals: "ℚ",
    RBarr: "⤐",
    rBarr: "⤏",
    rbarr: "⤍",
    rbbrk: "❳",
    rbrace: "}",
    rbrack: "]",
    rbrke: "⦌",
    rbrksld: "⦎",
    rbrkslu: "⦐",
    Rcaron: "Ř",
    rcaron: "ř",
    Rcedil: "Ŗ",
    rcedil: "ŗ",
    rceil: "⌉",
    rcub: "}",
    Rcy: "Р",
    rcy: "р",
    rdca: "⤷",
    rdldhar: "⥩",
    rdquo: "”",
    rdquor: "”",
    rdsh: "↳",
    Re: "ℜ",
    real: "ℜ",
    realine: "ℛ",
    realpart: "ℜ",
    reals: "ℝ",
    rect: "▭",
    REG: "®",
    reg: "®",
    ReverseElement: "∋",
    ReverseEquilibrium: "⇋",
    ReverseUpEquilibrium: "⥯",
    rfisht: "⥽",
    rfloor: "⌋",
    Rfr: "ℜ",
    rfr: "𝔯",
    rHar: "⥤",
    rhard: "⇁",
    rharu: "⇀",
    rharul: "⥬",
    Rho: "Ρ",
    rho: "ρ",
    rhov: "ϱ",
    RightAngleBracket: "⟩",
    RightArrow: "→",
    Rightarrow: "⇒",
    rightarrow: "→",
    RightArrowBar: "⇥",
    RightArrowLeftArrow: "⇄",
    rightarrowtail: "↣",
    RightCeiling: "⌉",
    RightDoubleBracket: "⟧",
    RightDownTeeVector: "⥝",
    RightDownVector: "⇂",
    RightDownVectorBar: "⥕",
    RightFloor: "⌋",
    rightharpoondown: "⇁",
    rightharpoonup: "⇀",
    rightleftarrows: "⇄",
    rightleftharpoons: "⇌",
    rightrightarrows: "⇉",
    rightsquigarrow: "↝",
    RightTee: "⊢",
    RightTeeArrow: "↦",
    RightTeeVector: "⥛",
    rightthreetimes: "⋌",
    RightTriangle: "⊳",
    RightTriangleBar: "⧐",
    RightTriangleEqual: "⊵",
    RightUpDownVector: "⥏",
    RightUpTeeVector: "⥜",
    RightUpVector: "↾",
    RightUpVectorBar: "⥔",
    RightVector: "⇀",
    RightVectorBar: "⥓",
    ring: "˚",
    risingdotseq: "≓",
    rlarr: "⇄",
    rlhar: "⇌",
    rlm: "‏",
    rmoust: "⎱",
    rmoustache: "⎱",
    rnmid: "⫮",
    roang: "⟭",
    roarr: "⇾",
    robrk: "⟧",
    ropar: "⦆",
    Ropf: "ℝ",
    ropf: "𝕣",
    roplus: "⨮",
    rotimes: "⨵",
    RoundImplies: "⥰",
    rpar: ")",
    rpargt: "⦔",
    rppolint: "⨒",
    rrarr: "⇉",
    Rrightarrow: "⇛",
    rsaquo: "›",
    Rscr: "ℛ",
    rscr: "𝓇",
    Rsh: "↱",
    rsh: "↱",
    rsqb: "]",
    rsquo: "’",
    rsquor: "’",
    rthree: "⋌",
    rtimes: "⋊",
    rtri: "▹",
    rtrie: "⊵",
    rtrif: "▸",
    rtriltri: "⧎",
    RuleDelayed: "⧴",
    ruluhar: "⥨",
    rx: "℞",
    Sacute: "Ś",
    sacute: "ś",
    sbquo: "‚",
    Sc: "⪼",
    sc: "≻",
    scap: "⪸",
    Scaron: "Š",
    scaron: "š",
    sccue: "≽",
    scE: "⪴",
    sce: "⪰",
    Scedil: "Ş",
    scedil: "ş",
    Scirc: "Ŝ",
    scirc: "ŝ",
    scnap: "⪺",
    scnE: "⪶",
    scnsim: "⋩",
    scpolint: "⨓",
    scsim: "≿",
    Scy: "С",
    scy: "с",
    sdot: "⋅",
    sdotb: "⊡",
    sdote: "⩦",
    searhk: "⤥",
    seArr: "⇘",
    searr: "↘",
    searrow: "↘",
    sect: "§",
    semi: ";",
    seswar: "⤩",
    setminus: "∖",
    setmn: "∖",
    sext: "✶",
    Sfr: "𝔖",
    sfr: "𝔰",
    sfrown: "⌢",
    sharp: "♯",
    SHCHcy: "Щ",
    shchcy: "щ",
    SHcy: "Ш",
    shcy: "ш",
    ShortDownArrow: "↓",
    ShortLeftArrow: "←",
    shortmid: "∣",
    shortparallel: "∥",
    ShortRightArrow: "→",
    ShortUpArrow: "↑",
    shy: "­",
    Sigma: "Σ",
    sigma: "σ",
    sigmaf: "ς",
    sigmav: "ς",
    sim: "∼",
    simdot: "⩪",
    sime: "≃",
    simeq: "≃",
    simg: "⪞",
    simgE: "⪠",
    siml: "⪝",
    simlE: "⪟",
    simne: "≆",
    simplus: "⨤",
    simrarr: "⥲",
    slarr: "←",
    SmallCircle: "∘",
    smallsetminus: "∖",
    smashp: "⨳",
    smeparsl: "⧤",
    smid: "∣",
    smile: "⌣",
    smt: "⪪",
    smte: "⪬",
    smtes: "⪬︀",
    SOFTcy: "Ь",
    softcy: "ь",
    sol: "/",
    solb: "⧄",
    solbar: "⌿",
    Sopf: "𝕊",
    sopf: "𝕤",
    spades: "♠",
    spadesuit: "♠",
    spar: "∥",
    sqcap: "⊓",
    sqcaps: "⊓︀",
    sqcup: "⊔",
    sqcups: "⊔︀",
    Sqrt: "√",
    sqsub: "⊏",
    sqsube: "⊑",
    sqsubset: "⊏",
    sqsubseteq: "⊑",
    sqsup: "⊐",
    sqsupe: "⊒",
    sqsupset: "⊐",
    sqsupseteq: "⊒",
    squ: "□",
    Square: "□",
    square: "□",
    SquareIntersection: "⊓",
    SquareSubset: "⊏",
    SquareSubsetEqual: "⊑",
    SquareSuperset: "⊐",
    SquareSupersetEqual: "⊒",
    SquareUnion: "⊔",
    squarf: "▪",
    squf: "▪",
    srarr: "→",
    Sscr: "𝒮",
    sscr: "𝓈",
    ssetmn: "∖",
    ssmile: "⌣",
    sstarf: "⋆",
    Star: "⋆",
    star: "☆",
    starf: "★",
    straightepsilon: "ϵ",
    straightphi: "ϕ",
    strns: "¯",
    Sub: "⋐",
    sub: "⊂",
    subdot: "⪽",
    subE: "⫅",
    sube: "⊆",
    subedot: "⫃",
    submult: "⫁",
    subnE: "⫋",
    subne: "⊊",
    subplus: "⪿",
    subrarr: "⥹",
    Subset: "⋐",
    subset: "⊂",
    subseteq: "⊆",
    subseteqq: "⫅",
    SubsetEqual: "⊆",
    subsetneq: "⊊",
    subsetneqq: "⫋",
    subsim: "⫇",
    subsub: "⫕",
    subsup: "⫓",
    succ: "≻",
    succapprox: "⪸",
    succcurlyeq: "≽",
    Succeeds: "≻",
    SucceedsEqual: "⪰",
    SucceedsSlantEqual: "≽",
    SucceedsTilde: "≿",
    succeq: "⪰",
    succnapprox: "⪺",
    succneqq: "⪶",
    succnsim: "⋩",
    succsim: "≿",
    SuchThat: "∋",
    Sum: "∑",
    sum: "∑",
    sung: "♪",
    Sup: "⋑",
    sup: "⊃",
    sup1: "¹",
    sup2: "²",
    sup3: "³",
    supdot: "⪾",
    supdsub: "⫘",
    supE: "⫆",
    supe: "⊇",
    supedot: "⫄",
    Superset: "⊃",
    SupersetEqual: "⊇",
    suphsol: "⟉",
    suphsub: "⫗",
    suplarr: "⥻",
    supmult: "⫂",
    supnE: "⫌",
    supne: "⊋",
    supplus: "⫀",
    Supset: "⋑",
    supset: "⊃",
    supseteq: "⊇",
    supseteqq: "⫆",
    supsetneq: "⊋",
    supsetneqq: "⫌",
    supsim: "⫈",
    supsub: "⫔",
    supsup: "⫖",
    swarhk: "⤦",
    swArr: "⇙",
    swarr: "↙",
    swarrow: "↙",
    swnwar: "⤪",
    szlig: "ß",
    Tab: "	",
    target: "⌖",
    Tau: "Τ",
    tau: "τ",
    tbrk: "⎴",
    Tcaron: "Ť",
    tcaron: "ť",
    Tcedil: "Ţ",
    tcedil: "ţ",
    Tcy: "Т",
    tcy: "т",
    tdot: "⃛",
    telrec: "⌕",
    Tfr: "𝔗",
    tfr: "𝔱",
    there4: "∴",
    Therefore: "∴",
    therefore: "∴",
    Theta: "Θ",
    theta: "θ",
    thetasym: "ϑ",
    thetav: "ϑ",
    thickapprox: "≈",
    thicksim: "∼",
    ThickSpace: "  ",
    thinsp: " ",
    ThinSpace: " ",
    thkap: "≈",
    thksim: "∼",
    THORN: "Þ",
    thorn: "þ",
    Tilde: "∼",
    tilde: "˜",
    TildeEqual: "≃",
    TildeFullEqual: "≅",
    TildeTilde: "≈",
    times: "×",
    timesb: "⊠",
    timesbar: "⨱",
    timesd: "⨰",
    tint: "∭",
    toea: "⤨",
    top: "⊤",
    topbot: "⌶",
    topcir: "⫱",
    Topf: "𝕋",
    topf: "𝕥",
    topfork: "⫚",
    tosa: "⤩",
    tprime: "‴",
    TRADE: "™",
    trade: "™",
    triangle: "▵",
    triangledown: "▿",
    triangleleft: "◃",
    trianglelefteq: "⊴",
    triangleq: "≜",
    triangleright: "▹",
    trianglerighteq: "⊵",
    tridot: "◬",
    trie: "≜",
    triminus: "⨺",
    TripleDot: "⃛",
    triplus: "⨹",
    trisb: "⧍",
    tritime: "⨻",
    trpezium: "⏢",
    Tscr: "𝒯",
    tscr: "𝓉",
    TScy: "Ц",
    tscy: "ц",
    TSHcy: "Ћ",
    tshcy: "ћ",
    Tstrok: "Ŧ",
    tstrok: "ŧ",
    twixt: "≬",
    twoheadleftarrow: "↞",
    twoheadrightarrow: "↠",
    Uacute: "Ú",
    uacute: "ú",
    Uarr: "↟",
    uArr: "⇑",
    uarr: "↑",
    Uarrocir: "⥉",
    Ubrcy: "Ў",
    ubrcy: "ў",
    Ubreve: "Ŭ",
    ubreve: "ŭ",
    Ucirc: "Û",
    ucirc: "û",
    Ucy: "У",
    ucy: "у",
    udarr: "⇅",
    Udblac: "Ű",
    udblac: "ű",
    udhar: "⥮",
    ufisht: "⥾",
    Ufr: "𝔘",
    ufr: "𝔲",
    Ugrave: "Ù",
    ugrave: "ù",
    uHar: "⥣",
    uharl: "↿",
    uharr: "↾",
    uhblk: "▀",
    ulcorn: "⌜",
    ulcorner: "⌜",
    ulcrop: "⌏",
    ultri: "◸",
    Umacr: "Ū",
    umacr: "ū",
    uml: "¨",
    UnderBar: "_",
    UnderBrace: "⏟",
    UnderBracket: "⎵",
    UnderParenthesis: "⏝",
    Union: "⋃",
    UnionPlus: "⊎",
    Uogon: "Ų",
    uogon: "ų",
    Uopf: "𝕌",
    uopf: "𝕦",
    UpArrow: "↑",
    Uparrow: "⇑",
    uparrow: "↑",
    UpArrowBar: "⤒",
    UpArrowDownArrow: "⇅",
    UpDownArrow: "↕",
    Updownarrow: "⇕",
    updownarrow: "↕",
    UpEquilibrium: "⥮",
    upharpoonleft: "↿",
    upharpoonright: "↾",
    uplus: "⊎",
    UpperLeftArrow: "↖",
    UpperRightArrow: "↗",
    Upsi: "ϒ",
    upsi: "υ",
    upsih: "ϒ",
    Upsilon: "Υ",
    upsilon: "υ",
    UpTee: "⊥",
    UpTeeArrow: "↥",
    upuparrows: "⇈",
    urcorn: "⌝",
    urcorner: "⌝",
    urcrop: "⌎",
    Uring: "Ů",
    uring: "ů",
    urtri: "◹",
    Uscr: "𝒰",
    uscr: "𝓊",
    utdot: "⋰",
    Utilde: "Ũ",
    utilde: "ũ",
    utri: "▵",
    utrif: "▴",
    uuarr: "⇈",
    Uuml: "Ü",
    uuml: "ü",
    uwangle: "⦧",
    vangrt: "⦜",
    varepsilon: "ϵ",
    varkappa: "ϰ",
    varnothing: "∅",
    varphi: "ϕ",
    varpi: "ϖ",
    varpropto: "∝",
    vArr: "⇕",
    varr: "↕",
    varrho: "ϱ",
    varsigma: "ς",
    varsubsetneq: "⊊︀",
    varsubsetneqq: "⫋︀",
    varsupsetneq: "⊋︀",
    varsupsetneqq: "⫌︀",
    vartheta: "ϑ",
    vartriangleleft: "⊲",
    vartriangleright: "⊳",
    Vbar: "⫫",
    vBar: "⫨",
    vBarv: "⫩",
    Vcy: "В",
    vcy: "в",
    VDash: "⊫",
    Vdash: "⊩",
    vDash: "⊨",
    vdash: "⊢",
    Vdashl: "⫦",
    Vee: "⋁",
    vee: "∨",
    veebar: "⊻",
    veeeq: "≚",
    vellip: "⋮",
    Verbar: "‖",
    verbar: "|",
    Vert: "‖",
    vert: "|",
    VerticalBar: "∣",
    VerticalLine: "|",
    VerticalSeparator: "❘",
    VerticalTilde: "≀",
    VeryThinSpace: " ",
    Vfr: "𝔙",
    vfr: "𝔳",
    vltri: "⊲",
    vnsub: "⊂⃒",
    vnsup: "⊃⃒",
    Vopf: "𝕍",
    vopf: "𝕧",
    vprop: "∝",
    vrtri: "⊳",
    Vscr: "𝒱",
    vscr: "𝓋",
    vsubnE: "⫋︀",
    vsubne: "⊊︀",
    vsupnE: "⫌︀",
    vsupne: "⊋︀",
    Vvdash: "⊪",
    vzigzag: "⦚",
    Wcirc: "Ŵ",
    wcirc: "ŵ",
    wedbar: "⩟",
    Wedge: "⋀",
    wedge: "∧",
    wedgeq: "≙",
    weierp: "℘",
    Wfr: "𝔚",
    wfr: "𝔴",
    Wopf: "𝕎",
    wopf: "𝕨",
    wp: "℘",
    wr: "≀",
    wreath: "≀",
    Wscr: "𝒲",
    wscr: "𝓌",
    xcap: "⋂",
    xcirc: "◯",
    xcup: "⋃",
    xdtri: "▽",
    Xfr: "𝔛",
    xfr: "𝔵",
    xhArr: "⟺",
    xharr: "⟷",
    Xi: "Ξ",
    xi: "ξ",
    xlArr: "⟸",
    xlarr: "⟵",
    xmap: "⟼",
    xnis: "⋻",
    xodot: "⨀",
    Xopf: "𝕏",
    xopf: "𝕩",
    xoplus: "⨁",
    xotime: "⨂",
    xrArr: "⟹",
    xrarr: "⟶",
    Xscr: "𝒳",
    xscr: "𝓍",
    xsqcup: "⨆",
    xuplus: "⨄",
    xutri: "△",
    xvee: "⋁",
    xwedge: "⋀",
    Yacute: "Ý",
    yacute: "ý",
    YAcy: "Я",
    yacy: "я",
    Ycirc: "Ŷ",
    ycirc: "ŷ",
    Ycy: "Ы",
    ycy: "ы",
    yen: "¥",
    Yfr: "𝔜",
    yfr: "𝔶",
    YIcy: "Ї",
    yicy: "ї",
    Yopf: "𝕐",
    yopf: "𝕪",
    Yscr: "𝒴",
    yscr: "𝓎",
    YUcy: "Ю",
    yucy: "ю",
    Yuml: "Ÿ",
    yuml: "ÿ",
    Zacute: "Ź",
    zacute: "ź",
    Zcaron: "Ž",
    zcaron: "ž",
    Zcy: "З",
    zcy: "з",
    Zdot: "Ż",
    zdot: "ż",
    zeetrf: "ℨ",
    ZeroWidthSpace: "​",
    Zeta: "Ζ",
    zeta: "ζ",
    Zfr: "ℨ",
    zfr: "𝔷",
    ZHcy: "Ж",
    zhcy: "ж",
    zigrarr: "⇝",
    Zopf: "ℤ",
    zopf: "𝕫",
    Zscr: "𝒵",
    zscr: "𝓏",
    zwj: "‍",
    zwnj: "‌"
  });
  exports$1.entityMap = exports$1.HTML_ENTITIES;
})(entities$1);
var sax$1 = {};
var NAMESPACE$1 = conventions$2.NAMESPACE;
var nameStartChar = /[A-Z_a-z\xC0-\xD6\xD8-\xF6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD]/;
var nameChar = new RegExp("[\\-\\.0-9" + nameStartChar.source.slice(1, -1) + "\\u00B7\\u0300-\\u036F\\u203F-\\u2040]");
var tagNamePattern = new RegExp("^" + nameStartChar.source + nameChar.source + "*(?::" + nameStartChar.source + nameChar.source + "*)?$");
var S_TAG = 0;
var S_ATTR = 1;
var S_ATTR_SPACE = 2;
var S_EQ = 3;
var S_ATTR_NOQUOT_VALUE = 4;
var S_ATTR_END = 5;
var S_TAG_SPACE = 6;
var S_TAG_CLOSE = 7;
function ParseError$1(message, locator) {
  this.message = message;
  this.locator = locator;
  if (Error.captureStackTrace) Error.captureStackTrace(this, ParseError$1);
}
ParseError$1.prototype = new Error();
ParseError$1.prototype.name = ParseError$1.name;
function XMLReader$1() {
}
XMLReader$1.prototype = {
  parse: function(source, defaultNSMap, entityMap) {
    var domBuilder = this.domBuilder;
    domBuilder.startDocument();
    _copy(defaultNSMap, defaultNSMap = {});
    parse$8(
      source,
      defaultNSMap,
      entityMap,
      domBuilder,
      this.errorHandler
    );
    domBuilder.endDocument();
  }
};
function parse$8(source, defaultNSMapCopy, entityMap, domBuilder, errorHandler) {
  function fixedFromCharCode(code2) {
    if (code2 > 65535) {
      code2 -= 65536;
      var surrogate1 = 55296 + (code2 >> 10), surrogate2 = 56320 + (code2 & 1023);
      return String.fromCharCode(surrogate1, surrogate2);
    } else {
      return String.fromCharCode(code2);
    }
  }
  function entityReplacer(a2) {
    var k = a2.slice(1, -1);
    if (Object.hasOwnProperty.call(entityMap, k)) {
      return entityMap[k];
    } else if (k.charAt(0) === "#") {
      return fixedFromCharCode(parseInt(k.substr(1).replace("x", "0x")));
    } else {
      errorHandler.error("entity not found:" + a2);
      return a2;
    }
  }
  function appendText(end2) {
    if (end2 > start) {
      var xt = source.substring(start, end2).replace(/&#?\w+;/g, entityReplacer);
      locator && position2(start);
      domBuilder.characters(xt, 0, end2 - start);
      start = end2;
    }
  }
  function position2(p, m) {
    while (p >= lineEnd && (m = linePattern.exec(source))) {
      lineStart = m.index;
      lineEnd = lineStart + m[0].length;
      locator.lineNumber++;
    }
    locator.columnNumber = p - lineStart + 1;
  }
  var lineStart = 0;
  var lineEnd = 0;
  var linePattern = /.*(?:\r\n?|\n)|.*$/g;
  var locator = domBuilder.locator;
  var parseStack = [{ currentNSMap: defaultNSMapCopy }];
  var closeMap = {};
  var start = 0;
  while (true) {
    try {
      var tagStart = source.indexOf("<", start);
      if (tagStart < 0) {
        if (!source.substr(start).match(/^\s*$/)) {
          var doc = domBuilder.doc;
          var text = doc.createTextNode(source.substr(start));
          doc.appendChild(text);
          domBuilder.currentElement = text;
        }
        return;
      }
      if (tagStart > start) {
        appendText(tagStart);
      }
      switch (source.charAt(tagStart + 1)) {
        case "/":
          var end = source.indexOf(">", tagStart + 3);
          var tagName = source.substring(tagStart + 2, end).replace(/[ \t\n\r]+$/g, "");
          var config = parseStack.pop();
          if (end < 0) {
            tagName = source.substring(tagStart + 2).replace(/[\s<].*/, "");
            errorHandler.error("end tag name: " + tagName + " is not complete:" + config.tagName);
            end = tagStart + 1 + tagName.length;
          } else if (tagName.match(/\s</)) {
            tagName = tagName.replace(/[\s<].*/, "");
            errorHandler.error("end tag name: " + tagName + " maybe not complete");
            end = tagStart + 1 + tagName.length;
          }
          var localNSMap = config.localNSMap;
          var endMatch = config.tagName == tagName;
          var endIgnoreCaseMach = endMatch || config.tagName && config.tagName.toLowerCase() == tagName.toLowerCase();
          if (endIgnoreCaseMach) {
            domBuilder.endElement(config.uri, config.localName, tagName);
            if (localNSMap) {
              for (var prefix in localNSMap) {
                if (Object.prototype.hasOwnProperty.call(localNSMap, prefix)) {
                  domBuilder.endPrefixMapping(prefix);
                }
              }
            }
            if (!endMatch) {
              errorHandler.fatalError("end tag name: " + tagName + " is not match the current start tagName:" + config.tagName);
            }
          } else {
            parseStack.push(config);
          }
          end++;
          break;
        case "?":
          locator && position2(tagStart);
          end = parseInstruction(source, tagStart, domBuilder);
          break;
        case "!":
          locator && position2(tagStart);
          end = parseDCC(source, tagStart, domBuilder, errorHandler);
          break;
        default:
          locator && position2(tagStart);
          var el = new ElementAttributes();
          var currentNSMap = parseStack[parseStack.length - 1].currentNSMap;
          var end = parseElementStartPart(source, tagStart, el, currentNSMap, entityReplacer, errorHandler);
          var len = el.length;
          if (!el.closed && fixSelfClosed(source, end, el.tagName, closeMap)) {
            el.closed = true;
            if (!entityMap.nbsp) {
              errorHandler.warning("unclosed xml attribute");
            }
          }
          if (locator && len) {
            var locator2 = copyLocator(locator, {});
            for (var i = 0; i < len; i++) {
              var a = el[i];
              position2(a.offset);
              a.locator = copyLocator(locator, {});
            }
            domBuilder.locator = locator2;
            if (appendElement$1(el, domBuilder, currentNSMap)) {
              parseStack.push(el);
            }
            domBuilder.locator = locator;
          } else {
            if (appendElement$1(el, domBuilder, currentNSMap)) {
              parseStack.push(el);
            }
          }
          if (NAMESPACE$1.isHTML(el.uri) && !el.closed) {
            end = parseHtmlSpecialContent(source, end, el.tagName, entityReplacer, domBuilder);
          } else {
            end++;
          }
      }
    } catch (e) {
      if (e instanceof ParseError$1) {
        throw e;
      }
      errorHandler.error("element parse error: " + e);
      end = -1;
    }
    if (end > start) {
      start = end;
    } else {
      appendText(Math.max(tagStart, start) + 1);
    }
  }
}
function copyLocator(f, t2) {
  t2.lineNumber = f.lineNumber;
  t2.columnNumber = f.columnNumber;
  return t2;
}
function parseElementStartPart(source, start, el, currentNSMap, entityReplacer, errorHandler) {
  function addAttribute(qname, value2, startIndex) {
    if (el.attributeNames.hasOwnProperty(qname)) {
      errorHandler.fatalError("Attribute " + qname + " redefined");
    }
    el.addValue(
      qname,
      // @see https://www.w3.org/TR/xml/#AVNormalize
      // since the xmldom sax parser does not "interpret" DTD the following is not implemented:
      // - recursive replacement of (DTD) entity references
      // - trimming and collapsing multiple spaces into a single one for attributes that are not of type CDATA
      value2.replace(/[\t\n\r]/g, " ").replace(/&#?\w+;/g, entityReplacer),
      startIndex
    );
  }
  var attrName;
  var value;
  var p = ++start;
  var s = S_TAG;
  while (true) {
    var c = source.charAt(p);
    switch (c) {
      case "=":
        if (s === S_ATTR) {
          attrName = source.slice(start, p);
          s = S_EQ;
        } else if (s === S_ATTR_SPACE) {
          s = S_EQ;
        } else {
          throw new Error("attribute equal must after attrName");
        }
        break;
      case "'":
      case '"':
        if (s === S_EQ || s === S_ATTR) {
          if (s === S_ATTR) {
            errorHandler.warning('attribute value must after "="');
            attrName = source.slice(start, p);
          }
          start = p + 1;
          p = source.indexOf(c, start);
          if (p > 0) {
            value = source.slice(start, p);
            addAttribute(attrName, value, start - 1);
            s = S_ATTR_END;
          } else {
            throw new Error("attribute value no end '" + c + "' match");
          }
        } else if (s == S_ATTR_NOQUOT_VALUE) {
          value = source.slice(start, p);
          addAttribute(attrName, value, start);
          errorHandler.warning('attribute "' + attrName + '" missed start quot(' + c + ")!!");
          start = p + 1;
          s = S_ATTR_END;
        } else {
          throw new Error('attribute value must after "="');
        }
        break;
      case "/":
        switch (s) {
          case S_TAG:
            el.setTagName(source.slice(start, p));
          case S_ATTR_END:
          case S_TAG_SPACE:
          case S_TAG_CLOSE:
            s = S_TAG_CLOSE;
            el.closed = true;
          case S_ATTR_NOQUOT_VALUE:
          case S_ATTR:
            break;
          case S_ATTR_SPACE:
            el.closed = true;
            break;
          default:
            throw new Error("attribute invalid close char('/')");
        }
        break;
      case "":
        errorHandler.error("unexpected end of input");
        if (s == S_TAG) {
          el.setTagName(source.slice(start, p));
        }
        return p;
      case ">":
        switch (s) {
          case S_TAG:
            el.setTagName(source.slice(start, p));
          case S_ATTR_END:
          case S_TAG_SPACE:
          case S_TAG_CLOSE:
            break;
          case S_ATTR_NOQUOT_VALUE:
          case S_ATTR:
            value = source.slice(start, p);
            if (value.slice(-1) === "/") {
              el.closed = true;
              value = value.slice(0, -1);
            }
          case S_ATTR_SPACE:
            if (s === S_ATTR_SPACE) {
              value = attrName;
            }
            if (s == S_ATTR_NOQUOT_VALUE) {
              errorHandler.warning('attribute "' + value + '" missed quot(")!');
              addAttribute(attrName, value, start);
            } else {
              if (!NAMESPACE$1.isHTML(currentNSMap[""]) || !value.match(/^(?:disabled|checked|selected)$/i)) {
                errorHandler.warning('attribute "' + value + '" missed value!! "' + value + '" instead!!');
              }
              addAttribute(value, value, start);
            }
            break;
          case S_EQ:
            throw new Error("attribute value missed!!");
        }
        return p;
      case "":
        c = " ";
      default:
        if (c <= " ") {
          switch (s) {
            case S_TAG:
              el.setTagName(source.slice(start, p));
              s = S_TAG_SPACE;
              break;
            case S_ATTR:
              attrName = source.slice(start, p);
              s = S_ATTR_SPACE;
              break;
            case S_ATTR_NOQUOT_VALUE:
              var value = source.slice(start, p);
              errorHandler.warning('attribute "' + value + '" missed quot(")!!');
              addAttribute(attrName, value, start);
            case S_ATTR_END:
              s = S_TAG_SPACE;
              break;
          }
        } else {
          switch (s) {
            case S_ATTR_SPACE:
              el.tagName;
              if (!NAMESPACE$1.isHTML(currentNSMap[""]) || !attrName.match(/^(?:disabled|checked|selected)$/i)) {
                errorHandler.warning('attribute "' + attrName + '" missed value!! "' + attrName + '" instead2!!');
              }
              addAttribute(attrName, attrName, start);
              start = p;
              s = S_ATTR;
              break;
            case S_ATTR_END:
              errorHandler.warning('attribute space is required"' + attrName + '"!!');
            case S_TAG_SPACE:
              s = S_ATTR;
              start = p;
              break;
            case S_EQ:
              s = S_ATTR_NOQUOT_VALUE;
              start = p;
              break;
            case S_TAG_CLOSE:
              throw new Error("elements closed character '/' and '>' must be connected to");
          }
        }
    }
    p++;
  }
}
function appendElement$1(el, domBuilder, currentNSMap) {
  var tagName = el.tagName;
  var localNSMap = null;
  var i = el.length;
  while (i--) {
    var a = el[i];
    var qName = a.qName;
    var value = a.value;
    var nsp = qName.indexOf(":");
    if (nsp > 0) {
      var prefix = a.prefix = qName.slice(0, nsp);
      var localName = qName.slice(nsp + 1);
      var nsPrefix = prefix === "xmlns" && localName;
    } else {
      localName = qName;
      prefix = null;
      nsPrefix = qName === "xmlns" && "";
    }
    a.localName = localName;
    if (nsPrefix !== false) {
      if (localNSMap == null) {
        localNSMap = {};
        _copy(currentNSMap, currentNSMap = {});
      }
      currentNSMap[nsPrefix] = localNSMap[nsPrefix] = value;
      a.uri = NAMESPACE$1.XMLNS;
      domBuilder.startPrefixMapping(nsPrefix, value);
    }
  }
  var i = el.length;
  while (i--) {
    a = el[i];
    var prefix = a.prefix;
    if (prefix) {
      if (prefix === "xml") {
        a.uri = NAMESPACE$1.XML;
      }
      if (prefix !== "xmlns") {
        a.uri = currentNSMap[prefix || ""];
      }
    }
  }
  var nsp = tagName.indexOf(":");
  if (nsp > 0) {
    prefix = el.prefix = tagName.slice(0, nsp);
    localName = el.localName = tagName.slice(nsp + 1);
  } else {
    prefix = null;
    localName = el.localName = tagName;
  }
  var ns = el.uri = currentNSMap[prefix || ""];
  domBuilder.startElement(ns, localName, tagName, el);
  if (el.closed) {
    domBuilder.endElement(ns, localName, tagName);
    if (localNSMap) {
      for (prefix in localNSMap) {
        if (Object.prototype.hasOwnProperty.call(localNSMap, prefix)) {
          domBuilder.endPrefixMapping(prefix);
        }
      }
    }
  } else {
    el.currentNSMap = currentNSMap;
    el.localNSMap = localNSMap;
    return true;
  }
}
function parseHtmlSpecialContent(source, elStartEnd, tagName, entityReplacer, domBuilder) {
  if (/^(?:script|textarea)$/i.test(tagName)) {
    var elEndStart = source.indexOf("</" + tagName + ">", elStartEnd);
    var text = source.substring(elStartEnd + 1, elEndStart);
    if (/[&<]/.test(text)) {
      if (/^script$/i.test(tagName)) {
        domBuilder.characters(text, 0, text.length);
        return elEndStart;
      }
      text = text.replace(/&#?\w+;/g, entityReplacer);
      domBuilder.characters(text, 0, text.length);
      return elEndStart;
    }
  }
  return elStartEnd + 1;
}
function fixSelfClosed(source, elStartEnd, tagName, closeMap) {
  var pos = closeMap[tagName];
  if (pos == null) {
    pos = source.lastIndexOf("</" + tagName + ">");
    if (pos < elStartEnd) {
      pos = source.lastIndexOf("</" + tagName);
    }
    closeMap[tagName] = pos;
  }
  return pos < elStartEnd;
}
function _copy(source, target) {
  for (var n in source) {
    if (Object.prototype.hasOwnProperty.call(source, n)) {
      target[n] = source[n];
    }
  }
}
function parseDCC(source, start, domBuilder, errorHandler) {
  var next = source.charAt(start + 2);
  switch (next) {
    case "-":
      if (source.charAt(start + 3) === "-") {
        var end = source.indexOf("-->", start + 4);
        if (end > start) {
          domBuilder.comment(source, start + 4, end - start - 4);
          return end + 3;
        } else {
          errorHandler.error("Unclosed comment");
          return -1;
        }
      } else {
        return -1;
      }
    default:
      if (source.substr(start + 3, 6) == "CDATA[") {
        var end = source.indexOf("]]>", start + 9);
        domBuilder.startCDATA();
        domBuilder.characters(source, start + 9, end - start - 9);
        domBuilder.endCDATA();
        return end + 3;
      }
      var matchs = split(source, start);
      var len = matchs.length;
      if (len > 1 && /!doctype/i.test(matchs[0][0])) {
        var name = matchs[1][0];
        var pubid = false;
        var sysid = false;
        if (len > 3) {
          if (/^public$/i.test(matchs[2][0])) {
            pubid = matchs[3][0];
            sysid = len > 4 && matchs[4][0];
          } else if (/^system$/i.test(matchs[2][0])) {
            sysid = matchs[3][0];
          }
        }
        var lastMatch = matchs[len - 1];
        domBuilder.startDTD(name, pubid, sysid);
        domBuilder.endDTD();
        return lastMatch.index + lastMatch[0].length;
      }
  }
  return -1;
}
function parseInstruction(source, start, domBuilder) {
  var end = source.indexOf("?>", start);
  if (end) {
    var match = source.substring(start, end).match(/^<\?(\S*)\s*([\s\S]*?)\s*$/);
    if (match) {
      match[0].length;
      domBuilder.processingInstruction(match[1], match[2]);
      return end + 2;
    } else {
      return -1;
    }
  }
  return -1;
}
function ElementAttributes() {
  this.attributeNames = {};
}
ElementAttributes.prototype = {
  setTagName: function(tagName) {
    if (!tagNamePattern.test(tagName)) {
      throw new Error("invalid tagName:" + tagName);
    }
    this.tagName = tagName;
  },
  addValue: function(qName, value, offset) {
    if (!tagNamePattern.test(qName)) {
      throw new Error("invalid attribute:" + qName);
    }
    this.attributeNames[qName] = this.length;
    this[this.length++] = { qName, value, offset };
  },
  length: 0,
  getLocalName: function(i) {
    return this[i].localName;
  },
  getLocator: function(i) {
    return this[i].locator;
  },
  getQName: function(i) {
    return this[i].qName;
  },
  getURI: function(i) {
    return this[i].uri;
  },
  getValue: function(i) {
    return this[i].value;
  }
  //	,getIndex:function(uri, localName)){
  //		if(localName){
  //
  //		}else{
  //			var qName = uri
  //		}
  //	},
  //	getValue:function(){return this.getValue(this.getIndex.apply(this,arguments))},
  //	getType:function(uri,localName){}
  //	getType:function(i){},
};
function split(source, start) {
  var match;
  var buf = [];
  var reg = /'[^']+'|"[^"]+"|[^\s<>\/=]+=?|(\/?\s*>|<)/g;
  reg.lastIndex = start;
  reg.exec(source);
  while (match = reg.exec(source)) {
    buf.push(match);
    if (match[1]) return buf;
  }
}
sax$1.XMLReader = XMLReader$1;
sax$1.ParseError = ParseError$1;
var conventions = conventions$2;
var dom$1 = dom$2;
var entities = entities$1;
var sax = sax$1;
var DOMImplementation = dom$1.DOMImplementation;
var NAMESPACE = conventions.NAMESPACE;
var ParseError = sax.ParseError;
var XMLReader = sax.XMLReader;
function normalizeLineEndings(input) {
  return input.replace(/\r[\n\u0085]/g, "\n").replace(/[\r\u0085\u2028]/g, "\n");
}
function DOMParser$1(options) {
  this.options = options || { locator: {} };
}
DOMParser$1.prototype.parseFromString = function(source, mimeType) {
  var options = this.options;
  var sax2 = new XMLReader();
  var domBuilder = options.domBuilder || new DOMHandler();
  var errorHandler = options.errorHandler;
  var locator = options.locator;
  var defaultNSMap = options.xmlns || {};
  var isHTML = /\/x?html?$/.test(mimeType);
  var entityMap = isHTML ? entities.HTML_ENTITIES : entities.XML_ENTITIES;
  if (locator) {
    domBuilder.setDocumentLocator(locator);
  }
  sax2.errorHandler = buildErrorHandler(errorHandler, domBuilder, locator);
  sax2.domBuilder = options.domBuilder || domBuilder;
  if (isHTML) {
    defaultNSMap[""] = NAMESPACE.HTML;
  }
  defaultNSMap.xml = defaultNSMap.xml || NAMESPACE.XML;
  var normalize = options.normalizeLineEndings || normalizeLineEndings;
  if (source && typeof source === "string") {
    sax2.parse(
      normalize(source),
      defaultNSMap,
      entityMap
    );
  } else {
    sax2.errorHandler.error("invalid doc source");
  }
  return domBuilder.doc;
};
function buildErrorHandler(errorImpl, domBuilder, locator) {
  if (!errorImpl) {
    if (domBuilder instanceof DOMHandler) {
      return domBuilder;
    }
    errorImpl = domBuilder;
  }
  var errorHandler = {};
  var isCallback = errorImpl instanceof Function;
  locator = locator || {};
  function build2(key) {
    var fn = errorImpl[key];
    if (!fn && isCallback) {
      fn = errorImpl.length == 2 ? function(msg) {
        errorImpl(key, msg);
      } : errorImpl;
    }
    errorHandler[key] = fn && function(msg) {
      fn("[xmldom " + key + "]	" + msg + _locator(locator));
    } || function() {
    };
  }
  build2("warning");
  build2("error");
  build2("fatalError");
  return errorHandler;
}
function DOMHandler() {
  this.cdata = false;
}
function position(locator, node) {
  node.lineNumber = locator.lineNumber;
  node.columnNumber = locator.columnNumber;
}
DOMHandler.prototype = {
  startDocument: function() {
    this.doc = new DOMImplementation().createDocument(null, null, null);
    if (this.locator) {
      this.doc.documentURI = this.locator.systemId;
    }
  },
  startElement: function(namespaceURI, localName, qName, attrs) {
    var doc = this.doc;
    var el = doc.createElementNS(namespaceURI, qName || localName);
    var len = attrs.length;
    appendElement(this, el);
    this.currentElement = el;
    this.locator && position(this.locator, el);
    for (var i = 0; i < len; i++) {
      var namespaceURI = attrs.getURI(i);
      var value = attrs.getValue(i);
      var qName = attrs.getQName(i);
      var attr = doc.createAttributeNS(namespaceURI, qName);
      this.locator && position(attrs.getLocator(i), attr);
      attr.value = attr.nodeValue = value;
      el.setAttributeNode(attr);
    }
  },
  endElement: function(namespaceURI, localName, qName) {
    var current = this.currentElement;
    current.tagName;
    this.currentElement = current.parentNode;
  },
  startPrefixMapping: function(prefix, uri) {
  },
  endPrefixMapping: function(prefix) {
  },
  processingInstruction: function(target, data) {
    var ins = this.doc.createProcessingInstruction(target, data);
    this.locator && position(this.locator, ins);
    appendElement(this, ins);
  },
  ignorableWhitespace: function(ch, start, length) {
  },
  characters: function(chars, start, length) {
    chars = _toString.apply(this, arguments);
    if (chars) {
      if (this.cdata) {
        var charNode = this.doc.createCDATASection(chars);
      } else {
        var charNode = this.doc.createTextNode(chars);
      }
      if (this.currentElement) {
        this.currentElement.appendChild(charNode);
      } else if (/^\s*$/.test(chars)) {
        this.doc.appendChild(charNode);
      }
      this.locator && position(this.locator, charNode);
    }
  },
  skippedEntity: function(name) {
  },
  endDocument: function() {
    this.doc.normalize();
  },
  setDocumentLocator: function(locator) {
    if (this.locator = locator) {
      locator.lineNumber = 0;
    }
  },
  //LexicalHandler
  comment: function(chars, start, length) {
    chars = _toString.apply(this, arguments);
    var comm = this.doc.createComment(chars);
    this.locator && position(this.locator, comm);
    appendElement(this, comm);
  },
  startCDATA: function() {
    this.cdata = true;
  },
  endCDATA: function() {
    this.cdata = false;
  },
  startDTD: function(name, publicId, systemId) {
    var impl = this.doc.implementation;
    if (impl && impl.createDocumentType) {
      var dt = impl.createDocumentType(name, publicId, systemId);
      this.locator && position(this.locator, dt);
      appendElement(this, dt);
      this.doc.doctype = dt;
    }
  },
  /**
   * @see org.xml.sax.ErrorHandler
   * @link http://www.saxproject.org/apidoc/org/xml/sax/ErrorHandler.html
   */
  warning: function(error) {
    console.warn("[xmldom warning]	" + error, _locator(this.locator));
  },
  error: function(error) {
    console.error("[xmldom error]	" + error, _locator(this.locator));
  },
  fatalError: function(error) {
    throw new ParseError(error, this.locator);
  }
};
function _locator(l) {
  if (l) {
    return "\n@" + (l.systemId || "") + "#[line:" + l.lineNumber + ",col:" + l.columnNumber + "]";
  }
}
function _toString(chars, start, length) {
  if (typeof chars == "string") {
    return chars.substr(start, length);
  } else {
    if (chars.length >= start + length || start) {
      return new java.lang.String(chars, start, length) + "";
    }
    return chars;
  }
}
"endDTD,startEntity,endEntity,attributeDecl,elementDecl,externalEntityDecl,internalEntityDecl,resolveEntity,getExternalSubset,notationDecl,unparsedEntityDecl".replace(/\w+/g, function(key) {
  DOMHandler.prototype[key] = function() {
    return null;
  };
});
function appendElement(hander, node) {
  if (!hander.currentElement) {
    hander.doc.appendChild(node);
  } else {
    hander.currentElement.appendChild(node);
  }
}
domParser.__DOMHandler = DOMHandler;
domParser.normalizeLineEndings = normalizeLineEndings;
domParser.DOMParser = DOMParser$1;
var dom = dom$2;
lib$1.DOMImplementation = dom.DOMImplementation;
lib$1.XMLSerializer = dom.XMLSerializer;
lib$1.DOMParser = domParser.DOMParser;
const { DOMParser } = lib$1;
parse$9.parse = parse$7;
var TEXT_NODE = 3;
var CDATA_NODE = 4;
var COMMENT_NODE = 8;
function shouldIgnoreNode(node) {
  return node.nodeType === TEXT_NODE || node.nodeType === COMMENT_NODE || node.nodeType === CDATA_NODE;
}
function isEmptyNode(node) {
  if (!node.childNodes || node.childNodes.length === 0) {
    return true;
  } else {
    return false;
  }
}
function invariant(test, message) {
  if (!test) {
    throw new Error(message);
  }
}
function parse$7(xml) {
  var doc = new DOMParser().parseFromString(xml);
  invariant(
    doc.documentElement.nodeName === "plist",
    "malformed document. First element should be <plist>"
  );
  var plist2 = parsePlistXML(doc.documentElement);
  if (plist2.length == 1) plist2 = plist2[0];
  return plist2;
}
function parsePlistXML(node) {
  var i, new_obj, key, new_arr, res, counter, type2;
  if (!node)
    return null;
  if (node.nodeName === "plist") {
    new_arr = [];
    if (isEmptyNode(node)) {
      return new_arr;
    }
    for (i = 0; i < node.childNodes.length; i++) {
      if (!shouldIgnoreNode(node.childNodes[i])) {
        new_arr.push(parsePlistXML(node.childNodes[i]));
      }
    }
    return new_arr;
  } else if (node.nodeName === "dict") {
    new_obj = {};
    key = null;
    counter = 0;
    if (isEmptyNode(node)) {
      return new_obj;
    }
    for (i = 0; i < node.childNodes.length; i++) {
      if (shouldIgnoreNode(node.childNodes[i])) continue;
      if (counter % 2 === 0) {
        invariant(
          node.childNodes[i].nodeName === "key",
          "Missing key while parsing <dict/>."
        );
        key = parsePlistXML(node.childNodes[i]);
      } else {
        invariant(
          node.childNodes[i].nodeName !== "key",
          'Unexpected key "' + parsePlistXML(node.childNodes[i]) + '" while parsing <dict/>.'
        );
        new_obj[key] = parsePlistXML(node.childNodes[i]);
      }
      counter += 1;
    }
    if (counter % 2 === 1) {
      new_obj[key] = "";
    }
    return new_obj;
  } else if (node.nodeName === "array") {
    new_arr = [];
    if (isEmptyNode(node)) {
      return new_arr;
    }
    for (i = 0; i < node.childNodes.length; i++) {
      if (!shouldIgnoreNode(node.childNodes[i])) {
        res = parsePlistXML(node.childNodes[i]);
        if (null != res) new_arr.push(res);
      }
    }
    return new_arr;
  } else if (node.nodeName === "#text") ;
  else if (node.nodeName === "key") {
    if (isEmptyNode(node)) {
      return "";
    }
    invariant(
      node.childNodes[0].nodeValue !== "__proto__",
      "__proto__ keys can lead to prototype pollution. More details on CVE-2022-22912"
    );
    return node.childNodes[0].nodeValue;
  } else if (node.nodeName === "string") {
    res = "";
    if (isEmptyNode(node)) {
      return res;
    }
    for (i = 0; i < node.childNodes.length; i++) {
      var type2 = node.childNodes[i].nodeType;
      if (type2 === TEXT_NODE || type2 === CDATA_NODE) {
        res += node.childNodes[i].nodeValue;
      }
    }
    return res;
  } else if (node.nodeName === "integer") {
    invariant(
      !isEmptyNode(node),
      'Cannot parse "" as integer.'
    );
    return parseInt(node.childNodes[0].nodeValue, 10);
  } else if (node.nodeName === "real") {
    invariant(
      !isEmptyNode(node),
      'Cannot parse "" as real.'
    );
    res = "";
    for (i = 0; i < node.childNodes.length; i++) {
      if (node.childNodes[i].nodeType === TEXT_NODE) {
        res += node.childNodes[i].nodeValue;
      }
    }
    return parseFloat(res);
  } else if (node.nodeName === "data") {
    res = "";
    if (isEmptyNode(node)) {
      return Buffer.from(res, "base64");
    }
    for (i = 0; i < node.childNodes.length; i++) {
      if (node.childNodes[i].nodeType === TEXT_NODE) {
        res += node.childNodes[i].nodeValue.replace(/\s+/g, "");
      }
    }
    return Buffer.from(res, "base64");
  } else if (node.nodeName === "date") {
    invariant(
      !isEmptyNode(node),
      'Cannot parse "" as Date.'
    );
    return new Date(node.childNodes[0].nodeValue);
  } else if (node.nodeName === "null") {
    return null;
  } else if (node.nodeName === "true") {
    return true;
  } else if (node.nodeName === "false") {
    return false;
  } else {
    throw new Error("Invalid PLIST tag " + node.nodeName);
  }
}
var build$1 = {};
var base64Js = {};
base64Js.byteLength = byteLength;
base64Js.toByteArray = toByteArray;
base64Js.fromByteArray = fromByteArray;
var lookup = [];
var revLookup = [];
var Arr = typeof Uint8Array !== "undefined" ? Uint8Array : Array;
var code = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
for (var i = 0, len = code.length; i < len; ++i) {
  lookup[i] = code[i];
  revLookup[code.charCodeAt(i)] = i;
}
revLookup["-".charCodeAt(0)] = 62;
revLookup["_".charCodeAt(0)] = 63;
function getLens(b64) {
  var len = b64.length;
  if (len % 4 > 0) {
    throw new Error("Invalid string. Length must be a multiple of 4");
  }
  var validLen = b64.indexOf("=");
  if (validLen === -1) validLen = len;
  var placeHoldersLen = validLen === len ? 0 : 4 - validLen % 4;
  return [validLen, placeHoldersLen];
}
function byteLength(b64) {
  var lens = getLens(b64);
  var validLen = lens[0];
  var placeHoldersLen = lens[1];
  return (validLen + placeHoldersLen) * 3 / 4 - placeHoldersLen;
}
function _byteLength(b64, validLen, placeHoldersLen) {
  return (validLen + placeHoldersLen) * 3 / 4 - placeHoldersLen;
}
function toByteArray(b64) {
  var tmp;
  var lens = getLens(b64);
  var validLen = lens[0];
  var placeHoldersLen = lens[1];
  var arr = new Arr(_byteLength(b64, validLen, placeHoldersLen));
  var curByte = 0;
  var len = placeHoldersLen > 0 ? validLen - 4 : validLen;
  var i;
  for (i = 0; i < len; i += 4) {
    tmp = revLookup[b64.charCodeAt(i)] << 18 | revLookup[b64.charCodeAt(i + 1)] << 12 | revLookup[b64.charCodeAt(i + 2)] << 6 | revLookup[b64.charCodeAt(i + 3)];
    arr[curByte++] = tmp >> 16 & 255;
    arr[curByte++] = tmp >> 8 & 255;
    arr[curByte++] = tmp & 255;
  }
  if (placeHoldersLen === 2) {
    tmp = revLookup[b64.charCodeAt(i)] << 2 | revLookup[b64.charCodeAt(i + 1)] >> 4;
    arr[curByte++] = tmp & 255;
  }
  if (placeHoldersLen === 1) {
    tmp = revLookup[b64.charCodeAt(i)] << 10 | revLookup[b64.charCodeAt(i + 1)] << 4 | revLookup[b64.charCodeAt(i + 2)] >> 2;
    arr[curByte++] = tmp >> 8 & 255;
    arr[curByte++] = tmp & 255;
  }
  return arr;
}
function tripletToBase64(num) {
  return lookup[num >> 18 & 63] + lookup[num >> 12 & 63] + lookup[num >> 6 & 63] + lookup[num & 63];
}
function encodeChunk(uint8, start, end) {
  var tmp;
  var output = [];
  for (var i = start; i < end; i += 3) {
    tmp = (uint8[i] << 16 & 16711680) + (uint8[i + 1] << 8 & 65280) + (uint8[i + 2] & 255);
    output.push(tripletToBase64(tmp));
  }
  return output.join("");
}
function fromByteArray(uint8) {
  var tmp;
  var len = uint8.length;
  var extraBytes = len % 3;
  var parts = [];
  var maxChunkLength = 16383;
  for (var i = 0, len2 = len - extraBytes; i < len2; i += maxChunkLength) {
    parts.push(encodeChunk(uint8, i, i + maxChunkLength > len2 ? len2 : i + maxChunkLength));
  }
  if (extraBytes === 1) {
    tmp = uint8[len - 1];
    parts.push(
      lookup[tmp >> 2] + lookup[tmp << 4 & 63] + "=="
    );
  } else if (extraBytes === 2) {
    tmp = (uint8[len - 2] << 8) + uint8[len - 1];
    parts.push(
      lookup[tmp >> 10] + lookup[tmp >> 4 & 63] + lookup[tmp << 2 & 63] + "="
    );
  }
  return parts.join("");
}
var lib = {};
var Utility = {};
var hasRequiredUtility;
function requireUtility() {
  if (hasRequiredUtility) return Utility;
  hasRequiredUtility = 1;
  (function() {
    var assign2, getValue, isArray, isEmpty, isFunction, isObject, isPlainObject, hasProp = {}.hasOwnProperty;
    assign2 = function(target, ...sources) {
      var i, key, len, source;
      if (isFunction(Object.assign)) {
        Object.assign.apply(null, arguments);
      } else {
        for (i = 0, len = sources.length; i < len; i++) {
          source = sources[i];
          if (source != null) {
            for (key in source) {
              if (!hasProp.call(source, key)) continue;
              target[key] = source[key];
            }
          }
        }
      }
      return target;
    };
    isFunction = function(val) {
      return !!val && Object.prototype.toString.call(val) === "[object Function]";
    };
    isObject = function(val) {
      var ref;
      return !!val && ((ref = typeof val) === "function" || ref === "object");
    };
    isArray = function(val) {
      if (isFunction(Array.isArray)) {
        return Array.isArray(val);
      } else {
        return Object.prototype.toString.call(val) === "[object Array]";
      }
    };
    isEmpty = function(val) {
      var key;
      if (isArray(val)) {
        return !val.length;
      } else {
        for (key in val) {
          if (!hasProp.call(val, key)) continue;
          return false;
        }
        return true;
      }
    };
    isPlainObject = function(val) {
      var ctor, proto;
      return isObject(val) && (proto = Object.getPrototypeOf(val)) && (ctor = proto.constructor) && typeof ctor === "function" && ctor instanceof ctor && Function.prototype.toString.call(ctor) === Function.prototype.toString.call(Object);
    };
    getValue = function(obj) {
      if (isFunction(obj.valueOf)) {
        return obj.valueOf();
      } else {
        return obj;
      }
    };
    Utility.assign = assign2;
    Utility.isFunction = isFunction;
    Utility.isObject = isObject;
    Utility.isArray = isArray;
    Utility.isEmpty = isEmpty;
    Utility.isPlainObject = isPlainObject;
    Utility.getValue = getValue;
  }).call(commonjsGlobal);
  return Utility;
}
var XMLDOMImplementation = { exports: {} };
var hasRequiredXMLDOMImplementation;
function requireXMLDOMImplementation() {
  if (hasRequiredXMLDOMImplementation) return XMLDOMImplementation.exports;
  hasRequiredXMLDOMImplementation = 1;
  (function() {
    XMLDOMImplementation.exports = class XMLDOMImplementation {
      // Tests if the DOM implementation implements a specific feature.
      // `feature` package name of the feature to test. In Level 1, the
      //           legal values are "HTML" and "XML" (case-insensitive).
      // `version` version number of the package name to test. 
      //           In Level 1, this is the string "1.0". If the version is 
      //           not specified, supporting any version of the feature will 
      //           cause the method to return true.
      hasFeature(feature, version2) {
        return true;
      }
      // Creates a new document type declaration.
      // `qualifiedName` qualified name of the document type to be created
      // `publicId` public identifier of the external subset
      // `systemId` system identifier of the external subset
      createDocumentType(qualifiedName, publicId, systemId) {
        throw new Error("This DOM method is not implemented.");
      }
      // Creates a new document.
      // `namespaceURI` namespace URI of the document element to create
      // `qualifiedName` the qualified name of the document to be created
      // `doctype` the type of document to be created or null
      createDocument(namespaceURI, qualifiedName, doctype) {
        throw new Error("This DOM method is not implemented.");
      }
      // Creates a new HTML document.
      // `title` document title
      createHTMLDocument(title) {
        throw new Error("This DOM method is not implemented.");
      }
      // Returns a specialized object which implements the specialized APIs 
      // of the specified feature and version.
      // `feature` name of the feature requested.
      // `version` version number of the feature to test
      getFeature(feature, version2) {
        throw new Error("This DOM method is not implemented.");
      }
    };
  }).call(commonjsGlobal);
  return XMLDOMImplementation.exports;
}
var XMLDocument = { exports: {} };
var XMLDOMConfiguration = { exports: {} };
var XMLDOMErrorHandler = { exports: {} };
var hasRequiredXMLDOMErrorHandler;
function requireXMLDOMErrorHandler() {
  if (hasRequiredXMLDOMErrorHandler) return XMLDOMErrorHandler.exports;
  hasRequiredXMLDOMErrorHandler = 1;
  (function() {
    XMLDOMErrorHandler.exports = class XMLDOMErrorHandler {
      // Initializes a new instance of `XMLDOMErrorHandler`
      constructor() {
      }
      // Called on the error handler when an error occurs.
      // `error` the error message as a string
      handleError(error) {
        throw new Error(error);
      }
    };
  }).call(commonjsGlobal);
  return XMLDOMErrorHandler.exports;
}
var XMLDOMStringList = { exports: {} };
var hasRequiredXMLDOMStringList;
function requireXMLDOMStringList() {
  if (hasRequiredXMLDOMStringList) return XMLDOMStringList.exports;
  hasRequiredXMLDOMStringList = 1;
  (function() {
    XMLDOMStringList.exports = function() {
      class XMLDOMStringList2 {
        // Initializes a new instance of `XMLDOMStringList`
        // This is just a wrapper around an ordinary
        // JS array.
        // `arr` the array of string values
        constructor(arr) {
          this.arr = arr || [];
        }
        // Returns the indexth item in the collection.
        // `index` index into the collection
        item(index2) {
          return this.arr[index2] || null;
        }
        // Test if a string is part of this DOMStringList.
        // `str` the string to look for
        contains(str) {
          return this.arr.indexOf(str) !== -1;
        }
      }
      Object.defineProperty(XMLDOMStringList2.prototype, "length", {
        get: function() {
          return this.arr.length;
        }
      });
      return XMLDOMStringList2;
    }.call(this);
  }).call(commonjsGlobal);
  return XMLDOMStringList.exports;
}
var hasRequiredXMLDOMConfiguration;
function requireXMLDOMConfiguration() {
  if (hasRequiredXMLDOMConfiguration) return XMLDOMConfiguration.exports;
  hasRequiredXMLDOMConfiguration = 1;
  (function() {
    var XMLDOMErrorHandler2, XMLDOMStringList2;
    XMLDOMErrorHandler2 = requireXMLDOMErrorHandler();
    XMLDOMStringList2 = requireXMLDOMStringList();
    XMLDOMConfiguration.exports = function() {
      class XMLDOMConfiguration2 {
        constructor() {
          this.defaultParams = {
            "canonical-form": false,
            "cdata-sections": false,
            "comments": false,
            "datatype-normalization": false,
            "element-content-whitespace": true,
            "entities": true,
            "error-handler": new XMLDOMErrorHandler2(),
            "infoset": true,
            "validate-if-schema": false,
            "namespaces": true,
            "namespace-declarations": true,
            "normalize-characters": false,
            "schema-location": "",
            "schema-type": "",
            "split-cdata-sections": true,
            "validate": false,
            "well-formed": true
          };
          this.params = Object.create(this.defaultParams);
        }
        // Gets the value of a parameter.
        // `name` name of the parameter
        getParameter(name) {
          if (this.params.hasOwnProperty(name)) {
            return this.params[name];
          } else {
            return null;
          }
        }
        // Checks if setting a parameter to a specific value is supported.
        // `name` name of the parameter
        // `value` parameter value
        canSetParameter(name, value) {
          return true;
        }
        // Sets the value of a parameter.
        // `name` name of the parameter
        // `value` new value or null if the user wishes to unset the parameter
        setParameter(name, value) {
          if (value != null) {
            return this.params[name] = value;
          } else {
            return delete this.params[name];
          }
        }
      }
      Object.defineProperty(XMLDOMConfiguration2.prototype, "parameterNames", {
        get: function() {
          return new XMLDOMStringList2(Object.keys(this.defaultParams));
        }
      });
      return XMLDOMConfiguration2;
    }.call(this);
  }).call(commonjsGlobal);
  return XMLDOMConfiguration.exports;
}
var XMLNode = { exports: {} };
var XMLElement = { exports: {} };
var NodeType = { exports: {} };
var hasRequiredNodeType;
function requireNodeType() {
  if (hasRequiredNodeType) return NodeType.exports;
  hasRequiredNodeType = 1;
  (function() {
    NodeType.exports = {
      Element: 1,
      Attribute: 2,
      Text: 3,
      CData: 4,
      EntityReference: 5,
      EntityDeclaration: 6,
      ProcessingInstruction: 7,
      Comment: 8,
      Document: 9,
      DocType: 10,
      DocumentFragment: 11,
      NotationDeclaration: 12,
      // Numeric codes up to 200 are reserved to W3C for possible future use.
      // Following are types internal to this library:
      Declaration: 201,
      Raw: 202,
      AttributeDeclaration: 203,
      ElementDeclaration: 204,
      Dummy: 205
    };
  }).call(commonjsGlobal);
  return NodeType.exports;
}
var XMLAttribute = { exports: {} };
var hasRequiredXMLAttribute;
function requireXMLAttribute() {
  if (hasRequiredXMLAttribute) return XMLAttribute.exports;
  hasRequiredXMLAttribute = 1;
  (function() {
    var NodeType2;
    NodeType2 = requireNodeType();
    requireXMLNode();
    XMLAttribute.exports = function() {
      class XMLAttribute2 {
        // Initializes a new instance of `XMLAttribute`
        // `parent` the parent node
        // `name` attribute target
        // `value` attribute value
        constructor(parent, name, value) {
          this.parent = parent;
          if (this.parent) {
            this.options = this.parent.options;
            this.stringify = this.parent.stringify;
          }
          if (name == null) {
            throw new Error("Missing attribute name. " + this.debugInfo(name));
          }
          this.name = this.stringify.name(name);
          this.value = this.stringify.attValue(value);
          this.type = NodeType2.Attribute;
          this.isId = false;
          this.schemaTypeInfo = null;
        }
        // Creates and returns a deep clone of `this`
        clone() {
          return Object.create(this);
        }
        // Converts the XML fragment to string
        // `options.pretty` pretty prints the result
        // `options.indent` indentation for pretty print
        // `options.offset` how many indentations to add to every line for pretty print
        // `options.newline` newline sequence for pretty print
        toString(options) {
          return this.options.writer.attribute(this, this.options.writer.filterOptions(options));
        }
        // Returns debug string for this node
        debugInfo(name) {
          name = name || this.name;
          if (name == null) {
            return "parent: <" + this.parent.name + ">";
          } else {
            return "attribute: {" + name + "}, parent: <" + this.parent.name + ">";
          }
        }
        isEqualNode(node) {
          if (node.namespaceURI !== this.namespaceURI) {
            return false;
          }
          if (node.prefix !== this.prefix) {
            return false;
          }
          if (node.localName !== this.localName) {
            return false;
          }
          if (node.value !== this.value) {
            return false;
          }
          return true;
        }
      }
      Object.defineProperty(XMLAttribute2.prototype, "nodeType", {
        get: function() {
          return this.type;
        }
      });
      Object.defineProperty(XMLAttribute2.prototype, "ownerElement", {
        get: function() {
          return this.parent;
        }
      });
      Object.defineProperty(XMLAttribute2.prototype, "textContent", {
        get: function() {
          return this.value;
        },
        set: function(value) {
          return this.value = value || "";
        }
      });
      Object.defineProperty(XMLAttribute2.prototype, "namespaceURI", {
        get: function() {
          return "";
        }
      });
      Object.defineProperty(XMLAttribute2.prototype, "prefix", {
        get: function() {
          return "";
        }
      });
      Object.defineProperty(XMLAttribute2.prototype, "localName", {
        get: function() {
          return this.name;
        }
      });
      Object.defineProperty(XMLAttribute2.prototype, "specified", {
        get: function() {
          return true;
        }
      });
      return XMLAttribute2;
    }.call(this);
  }).call(commonjsGlobal);
  return XMLAttribute.exports;
}
var XMLNamedNodeMap = { exports: {} };
var hasRequiredXMLNamedNodeMap;
function requireXMLNamedNodeMap() {
  if (hasRequiredXMLNamedNodeMap) return XMLNamedNodeMap.exports;
  hasRequiredXMLNamedNodeMap = 1;
  (function() {
    XMLNamedNodeMap.exports = function() {
      class XMLNamedNodeMap2 {
        // Initializes a new instance of `XMLNamedNodeMap`
        // This is just a wrapper around an ordinary
        // JS object.
        // `nodes` the object containing nodes.
        constructor(nodes) {
          this.nodes = nodes;
        }
        // Creates and returns a deep clone of `this`
        clone() {
          return this.nodes = null;
        }
        // DOM Level 1
        getNamedItem(name) {
          return this.nodes[name];
        }
        setNamedItem(node) {
          var oldNode;
          oldNode = this.nodes[node.nodeName];
          this.nodes[node.nodeName] = node;
          return oldNode || null;
        }
        removeNamedItem(name) {
          var oldNode;
          oldNode = this.nodes[name];
          delete this.nodes[name];
          return oldNode || null;
        }
        item(index2) {
          return this.nodes[Object.keys(this.nodes)[index2]] || null;
        }
        // DOM level 2 functions to be implemented later
        getNamedItemNS(namespaceURI, localName) {
          throw new Error("This DOM method is not implemented.");
        }
        setNamedItemNS(node) {
          throw new Error("This DOM method is not implemented.");
        }
        removeNamedItemNS(namespaceURI, localName) {
          throw new Error("This DOM method is not implemented.");
        }
      }
      Object.defineProperty(XMLNamedNodeMap2.prototype, "length", {
        get: function() {
          return Object.keys(this.nodes).length || 0;
        }
      });
      return XMLNamedNodeMap2;
    }.call(this);
  }).call(commonjsGlobal);
  return XMLNamedNodeMap.exports;
}
var hasRequiredXMLElement;
function requireXMLElement() {
  if (hasRequiredXMLElement) return XMLElement.exports;
  hasRequiredXMLElement = 1;
  (function() {
    var NodeType2, XMLAttribute2, XMLNamedNodeMap2, XMLNode2, getValue, isFunction, isObject, hasProp = {}.hasOwnProperty;
    ({ isObject, isFunction, getValue } = requireUtility());
    XMLNode2 = requireXMLNode();
    NodeType2 = requireNodeType();
    XMLAttribute2 = requireXMLAttribute();
    XMLNamedNodeMap2 = requireXMLNamedNodeMap();
    XMLElement.exports = function() {
      class XMLElement2 extends XMLNode2 {
        // Initializes a new instance of `XMLElement`
        // `parent` the parent node
        // `name` element name
        // `attributes` an object containing name/value pairs of attributes
        constructor(parent, name, attributes) {
          var child, j, len, ref;
          super(parent);
          if (name == null) {
            throw new Error("Missing element name. " + this.debugInfo());
          }
          this.name = this.stringify.name(name);
          this.type = NodeType2.Element;
          this.attribs = {};
          this.schemaTypeInfo = null;
          if (attributes != null) {
            this.attribute(attributes);
          }
          if (parent.type === NodeType2.Document) {
            this.isRoot = true;
            this.documentObject = parent;
            parent.rootObject = this;
            if (parent.children) {
              ref = parent.children;
              for (j = 0, len = ref.length; j < len; j++) {
                child = ref[j];
                if (child.type === NodeType2.DocType) {
                  child.name = this.name;
                  break;
                }
              }
            }
          }
        }
        // Creates and returns a deep clone of `this`
        clone() {
          var att, attName, clonedSelf, ref;
          clonedSelf = Object.create(this);
          if (clonedSelf.isRoot) {
            clonedSelf.documentObject = null;
          }
          clonedSelf.attribs = {};
          ref = this.attribs;
          for (attName in ref) {
            if (!hasProp.call(ref, attName)) continue;
            att = ref[attName];
            clonedSelf.attribs[attName] = att.clone();
          }
          clonedSelf.children = [];
          this.children.forEach(function(child) {
            var clonedChild;
            clonedChild = child.clone();
            clonedChild.parent = clonedSelf;
            return clonedSelf.children.push(clonedChild);
          });
          return clonedSelf;
        }
        // Adds or modifies an attribute
        // `name` attribute name
        // `value` attribute value
        attribute(name, value) {
          var attName, attValue;
          if (name != null) {
            name = getValue(name);
          }
          if (isObject(name)) {
            for (attName in name) {
              if (!hasProp.call(name, attName)) continue;
              attValue = name[attName];
              this.attribute(attName, attValue);
            }
          } else {
            if (isFunction(value)) {
              value = value.apply();
            }
            if (this.options.keepNullAttributes && value == null) {
              this.attribs[name] = new XMLAttribute2(this, name, "");
            } else if (value != null) {
              this.attribs[name] = new XMLAttribute2(this, name, value);
            }
          }
          return this;
        }
        // Removes an attribute
        // `name` attribute name
        removeAttribute(name) {
          var attName, j, len;
          if (name == null) {
            throw new Error("Missing attribute name. " + this.debugInfo());
          }
          name = getValue(name);
          if (Array.isArray(name)) {
            for (j = 0, len = name.length; j < len; j++) {
              attName = name[j];
              delete this.attribs[attName];
            }
          } else {
            delete this.attribs[name];
          }
          return this;
        }
        // Converts the XML fragment to string
        // `options.pretty` pretty prints the result
        // `options.indent` indentation for pretty print
        // `options.offset` how many indentations to add to every line for pretty print
        // `options.newline` newline sequence for pretty print
        // `options.allowEmpty` do not self close empty element tags
        toString(options) {
          return this.options.writer.element(this, this.options.writer.filterOptions(options));
        }
        // Aliases
        att(name, value) {
          return this.attribute(name, value);
        }
        a(name, value) {
          return this.attribute(name, value);
        }
        // DOM Level 1
        getAttribute(name) {
          if (this.attribs.hasOwnProperty(name)) {
            return this.attribs[name].value;
          } else {
            return null;
          }
        }
        setAttribute(name, value) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        }
        getAttributeNode(name) {
          if (this.attribs.hasOwnProperty(name)) {
            return this.attribs[name];
          } else {
            return null;
          }
        }
        setAttributeNode(newAttr) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        }
        removeAttributeNode(oldAttr) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        }
        getElementsByTagName(name) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        }
        // DOM Level 2
        getAttributeNS(namespaceURI, localName) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        }
        setAttributeNS(namespaceURI, qualifiedName, value) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        }
        removeAttributeNS(namespaceURI, localName) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        }
        getAttributeNodeNS(namespaceURI, localName) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        }
        setAttributeNodeNS(newAttr) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        }
        getElementsByTagNameNS(namespaceURI, localName) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        }
        hasAttribute(name) {
          return this.attribs.hasOwnProperty(name);
        }
        hasAttributeNS(namespaceURI, localName) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        }
        // DOM Level 3
        setIdAttribute(name, isId) {
          if (this.attribs.hasOwnProperty(name)) {
            return this.attribs[name].isId;
          } else {
            return isId;
          }
        }
        setIdAttributeNS(namespaceURI, localName, isId) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        }
        setIdAttributeNode(idAttr, isId) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        }
        // DOM Level 4
        getElementsByTagName(tagname) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        }
        getElementsByTagNameNS(namespaceURI, localName) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        }
        getElementsByClassName(classNames) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        }
        isEqualNode(node) {
          var i, j, ref;
          if (!super.isEqualNode(node)) {
            return false;
          }
          if (node.namespaceURI !== this.namespaceURI) {
            return false;
          }
          if (node.prefix !== this.prefix) {
            return false;
          }
          if (node.localName !== this.localName) {
            return false;
          }
          if (node.attribs.length !== this.attribs.length) {
            return false;
          }
          for (i = j = 0, ref = this.attribs.length - 1; 0 <= ref ? j <= ref : j >= ref; i = 0 <= ref ? ++j : --j) {
            if (!this.attribs[i].isEqualNode(node.attribs[i])) {
              return false;
            }
          }
          return true;
        }
      }
      Object.defineProperty(XMLElement2.prototype, "tagName", {
        get: function() {
          return this.name;
        }
      });
      Object.defineProperty(XMLElement2.prototype, "namespaceURI", {
        get: function() {
          return "";
        }
      });
      Object.defineProperty(XMLElement2.prototype, "prefix", {
        get: function() {
          return "";
        }
      });
      Object.defineProperty(XMLElement2.prototype, "localName", {
        get: function() {
          return this.name;
        }
      });
      Object.defineProperty(XMLElement2.prototype, "id", {
        get: function() {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        }
      });
      Object.defineProperty(XMLElement2.prototype, "className", {
        get: function() {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        }
      });
      Object.defineProperty(XMLElement2.prototype, "classList", {
        get: function() {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        }
      });
      Object.defineProperty(XMLElement2.prototype, "attributes", {
        get: function() {
          if (!this.attributeMap || !this.attributeMap.nodes) {
            this.attributeMap = new XMLNamedNodeMap2(this.attribs);
          }
          return this.attributeMap;
        }
      });
      return XMLElement2;
    }.call(this);
  }).call(commonjsGlobal);
  return XMLElement.exports;
}
var XMLCData = { exports: {} };
var XMLCharacterData = { exports: {} };
var hasRequiredXMLCharacterData;
function requireXMLCharacterData() {
  if (hasRequiredXMLCharacterData) return XMLCharacterData.exports;
  hasRequiredXMLCharacterData = 1;
  (function() {
    var XMLNode2;
    XMLNode2 = requireXMLNode();
    XMLCharacterData.exports = function() {
      class XMLCharacterData2 extends XMLNode2 {
        // Initializes a new instance of `XMLCharacterData`
        constructor(parent) {
          super(parent);
          this.value = "";
        }
        // Creates and returns a deep clone of `this`
        clone() {
          return Object.create(this);
        }
        // DOM level 1 functions to be implemented later
        substringData(offset, count) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        }
        appendData(arg) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        }
        insertData(offset, arg) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        }
        deleteData(offset, count) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        }
        replaceData(offset, count, arg) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        }
        isEqualNode(node) {
          if (!super.isEqualNode(node)) {
            return false;
          }
          if (node.data !== this.data) {
            return false;
          }
          return true;
        }
      }
      Object.defineProperty(XMLCharacterData2.prototype, "data", {
        get: function() {
          return this.value;
        },
        set: function(value) {
          return this.value = value || "";
        }
      });
      Object.defineProperty(XMLCharacterData2.prototype, "length", {
        get: function() {
          return this.value.length;
        }
      });
      Object.defineProperty(XMLCharacterData2.prototype, "textContent", {
        get: function() {
          return this.value;
        },
        set: function(value) {
          return this.value = value || "";
        }
      });
      return XMLCharacterData2;
    }.call(this);
  }).call(commonjsGlobal);
  return XMLCharacterData.exports;
}
var hasRequiredXMLCData;
function requireXMLCData() {
  if (hasRequiredXMLCData) return XMLCData.exports;
  hasRequiredXMLCData = 1;
  (function() {
    var NodeType2, XMLCharacterData2;
    NodeType2 = requireNodeType();
    XMLCharacterData2 = requireXMLCharacterData();
    XMLCData.exports = class XMLCData extends XMLCharacterData2 {
      // Initializes a new instance of `XMLCData`
      // `text` CDATA text
      constructor(parent, text) {
        super(parent);
        if (text == null) {
          throw new Error("Missing CDATA text. " + this.debugInfo());
        }
        this.name = "#cdata-section";
        this.type = NodeType2.CData;
        this.value = this.stringify.cdata(text);
      }
      // Creates and returns a deep clone of `this`
      clone() {
        return Object.create(this);
      }
      // Converts the XML fragment to string
      // `options.pretty` pretty prints the result
      // `options.indent` indentation for pretty print
      // `options.offset` how many indentations to add to every line for pretty print
      // `options.newline` newline sequence for pretty print
      toString(options) {
        return this.options.writer.cdata(this, this.options.writer.filterOptions(options));
      }
    };
  }).call(commonjsGlobal);
  return XMLCData.exports;
}
var XMLComment = { exports: {} };
var hasRequiredXMLComment;
function requireXMLComment() {
  if (hasRequiredXMLComment) return XMLComment.exports;
  hasRequiredXMLComment = 1;
  (function() {
    var NodeType2, XMLCharacterData2;
    NodeType2 = requireNodeType();
    XMLCharacterData2 = requireXMLCharacterData();
    XMLComment.exports = class XMLComment extends XMLCharacterData2 {
      // Initializes a new instance of `XMLComment`
      // `text` comment text
      constructor(parent, text) {
        super(parent);
        if (text == null) {
          throw new Error("Missing comment text. " + this.debugInfo());
        }
        this.name = "#comment";
        this.type = NodeType2.Comment;
        this.value = this.stringify.comment(text);
      }
      // Creates and returns a deep clone of `this`
      clone() {
        return Object.create(this);
      }
      // Converts the XML fragment to string
      // `options.pretty` pretty prints the result
      // `options.indent` indentation for pretty print
      // `options.offset` how many indentations to add to every line for pretty print
      // `options.newline` newline sequence for pretty print
      toString(options) {
        return this.options.writer.comment(this, this.options.writer.filterOptions(options));
      }
    };
  }).call(commonjsGlobal);
  return XMLComment.exports;
}
var XMLDeclaration = { exports: {} };
var hasRequiredXMLDeclaration;
function requireXMLDeclaration() {
  if (hasRequiredXMLDeclaration) return XMLDeclaration.exports;
  hasRequiredXMLDeclaration = 1;
  (function() {
    var NodeType2, XMLNode2, isObject;
    ({ isObject } = requireUtility());
    XMLNode2 = requireXMLNode();
    NodeType2 = requireNodeType();
    XMLDeclaration.exports = class XMLDeclaration extends XMLNode2 {
      // Initializes a new instance of `XMLDeclaration`
      // `parent` the document object
      // `version` A version number string, e.g. 1.0
      // `encoding` Encoding declaration, e.g. UTF-8
      // `standalone` standalone document declaration: true or false
      constructor(parent, version2, encoding, standalone) {
        super(parent);
        if (isObject(version2)) {
          ({ version: version2, encoding, standalone } = version2);
        }
        if (!version2) {
          version2 = "1.0";
        }
        this.type = NodeType2.Declaration;
        this.version = this.stringify.xmlVersion(version2);
        if (encoding != null) {
          this.encoding = this.stringify.xmlEncoding(encoding);
        }
        if (standalone != null) {
          this.standalone = this.stringify.xmlStandalone(standalone);
        }
      }
      // Converts to string
      // `options.pretty` pretty prints the result
      // `options.indent` indentation for pretty print
      // `options.offset` how many indentations to add to every line for pretty print
      // `options.newline` newline sequence for pretty print
      toString(options) {
        return this.options.writer.declaration(this, this.options.writer.filterOptions(options));
      }
    };
  }).call(commonjsGlobal);
  return XMLDeclaration.exports;
}
var XMLDocType = { exports: {} };
var XMLDTDAttList = { exports: {} };
var hasRequiredXMLDTDAttList;
function requireXMLDTDAttList() {
  if (hasRequiredXMLDTDAttList) return XMLDTDAttList.exports;
  hasRequiredXMLDTDAttList = 1;
  (function() {
    var NodeType2, XMLNode2;
    XMLNode2 = requireXMLNode();
    NodeType2 = requireNodeType();
    XMLDTDAttList.exports = class XMLDTDAttList extends XMLNode2 {
      // Initializes a new instance of `XMLDTDAttList`
      // `parent` the parent `XMLDocType` element
      // `elementName` the name of the element containing this attribute
      // `attributeName` attribute name
      // `attributeType` type of the attribute
      // `defaultValueType` default value type (either #REQUIRED, #IMPLIED,
      //                    #FIXED or #DEFAULT)
      // `defaultValue` default value of the attribute
      //                (only used for #FIXED or #DEFAULT)
      constructor(parent, elementName, attributeName, attributeType, defaultValueType, defaultValue) {
        super(parent);
        if (elementName == null) {
          throw new Error("Missing DTD element name. " + this.debugInfo());
        }
        if (attributeName == null) {
          throw new Error("Missing DTD attribute name. " + this.debugInfo(elementName));
        }
        if (!attributeType) {
          throw new Error("Missing DTD attribute type. " + this.debugInfo(elementName));
        }
        if (!defaultValueType) {
          throw new Error("Missing DTD attribute default. " + this.debugInfo(elementName));
        }
        if (defaultValueType.indexOf("#") !== 0) {
          defaultValueType = "#" + defaultValueType;
        }
        if (!defaultValueType.match(/^(#REQUIRED|#IMPLIED|#FIXED|#DEFAULT)$/)) {
          throw new Error("Invalid default value type; expected: #REQUIRED, #IMPLIED, #FIXED or #DEFAULT. " + this.debugInfo(elementName));
        }
        if (defaultValue && !defaultValueType.match(/^(#FIXED|#DEFAULT)$/)) {
          throw new Error("Default value only applies to #FIXED or #DEFAULT. " + this.debugInfo(elementName));
        }
        this.elementName = this.stringify.name(elementName);
        this.type = NodeType2.AttributeDeclaration;
        this.attributeName = this.stringify.name(attributeName);
        this.attributeType = this.stringify.dtdAttType(attributeType);
        if (defaultValue) {
          this.defaultValue = this.stringify.dtdAttDefault(defaultValue);
        }
        this.defaultValueType = defaultValueType;
      }
      // Converts the XML fragment to string
      // `options.pretty` pretty prints the result
      // `options.indent` indentation for pretty print
      // `options.offset` how many indentations to add to every line for pretty print
      // `options.newline` newline sequence for pretty print
      toString(options) {
        return this.options.writer.dtdAttList(this, this.options.writer.filterOptions(options));
      }
    };
  }).call(commonjsGlobal);
  return XMLDTDAttList.exports;
}
var XMLDTDEntity = { exports: {} };
var hasRequiredXMLDTDEntity;
function requireXMLDTDEntity() {
  if (hasRequiredXMLDTDEntity) return XMLDTDEntity.exports;
  hasRequiredXMLDTDEntity = 1;
  (function() {
    var NodeType2, XMLNode2, isObject;
    ({ isObject } = requireUtility());
    XMLNode2 = requireXMLNode();
    NodeType2 = requireNodeType();
    XMLDTDEntity.exports = function() {
      class XMLDTDEntity2 extends XMLNode2 {
        // Initializes a new instance of `XMLDTDEntity`
        // `parent` the parent `XMLDocType` element
        // `pe` whether this is a parameter entity or a general entity
        //      defaults to `false` (general entity)
        // `name` the name of the entity
        // `value` internal entity value or an object with external entity details
        // `value.pubID` public identifier
        // `value.sysID` system identifier
        // `value.nData` notation declaration
        constructor(parent, pe, name, value) {
          super(parent);
          if (name == null) {
            throw new Error("Missing DTD entity name. " + this.debugInfo(name));
          }
          if (value == null) {
            throw new Error("Missing DTD entity value. " + this.debugInfo(name));
          }
          this.pe = !!pe;
          this.name = this.stringify.name(name);
          this.type = NodeType2.EntityDeclaration;
          if (!isObject(value)) {
            this.value = this.stringify.dtdEntityValue(value);
            this.internal = true;
          } else {
            if (!value.pubID && !value.sysID) {
              throw new Error("Public and/or system identifiers are required for an external entity. " + this.debugInfo(name));
            }
            if (value.pubID && !value.sysID) {
              throw new Error("System identifier is required for a public external entity. " + this.debugInfo(name));
            }
            this.internal = false;
            if (value.pubID != null) {
              this.pubID = this.stringify.dtdPubID(value.pubID);
            }
            if (value.sysID != null) {
              this.sysID = this.stringify.dtdSysID(value.sysID);
            }
            if (value.nData != null) {
              this.nData = this.stringify.dtdNData(value.nData);
            }
            if (this.pe && this.nData) {
              throw new Error("Notation declaration is not allowed in a parameter entity. " + this.debugInfo(name));
            }
          }
        }
        // Converts the XML fragment to string
        // `options.pretty` pretty prints the result
        // `options.indent` indentation for pretty print
        // `options.offset` how many indentations to add to every line for pretty print
        // `options.newline` newline sequence for pretty print
        toString(options) {
          return this.options.writer.dtdEntity(this, this.options.writer.filterOptions(options));
        }
      }
      Object.defineProperty(XMLDTDEntity2.prototype, "publicId", {
        get: function() {
          return this.pubID;
        }
      });
      Object.defineProperty(XMLDTDEntity2.prototype, "systemId", {
        get: function() {
          return this.sysID;
        }
      });
      Object.defineProperty(XMLDTDEntity2.prototype, "notationName", {
        get: function() {
          return this.nData || null;
        }
      });
      Object.defineProperty(XMLDTDEntity2.prototype, "inputEncoding", {
        get: function() {
          return null;
        }
      });
      Object.defineProperty(XMLDTDEntity2.prototype, "xmlEncoding", {
        get: function() {
          return null;
        }
      });
      Object.defineProperty(XMLDTDEntity2.prototype, "xmlVersion", {
        get: function() {
          return null;
        }
      });
      return XMLDTDEntity2;
    }.call(this);
  }).call(commonjsGlobal);
  return XMLDTDEntity.exports;
}
var XMLDTDElement = { exports: {} };
var hasRequiredXMLDTDElement;
function requireXMLDTDElement() {
  if (hasRequiredXMLDTDElement) return XMLDTDElement.exports;
  hasRequiredXMLDTDElement = 1;
  (function() {
    var NodeType2, XMLNode2;
    XMLNode2 = requireXMLNode();
    NodeType2 = requireNodeType();
    XMLDTDElement.exports = class XMLDTDElement extends XMLNode2 {
      // Initializes a new instance of `XMLDTDElement`
      // `parent` the parent `XMLDocType` element
      // `name` element name
      // `value` element content (defaults to #PCDATA)
      constructor(parent, name, value) {
        super(parent);
        if (name == null) {
          throw new Error("Missing DTD element name. " + this.debugInfo());
        }
        if (!value) {
          value = "(#PCDATA)";
        }
        if (Array.isArray(value)) {
          value = "(" + value.join(",") + ")";
        }
        this.name = this.stringify.name(name);
        this.type = NodeType2.ElementDeclaration;
        this.value = this.stringify.dtdElementValue(value);
      }
      // Converts the XML fragment to string
      // `options.pretty` pretty prints the result
      // `options.indent` indentation for pretty print
      // `options.offset` how many indentations to add to every line for pretty print
      // `options.newline` newline sequence for pretty print
      toString(options) {
        return this.options.writer.dtdElement(this, this.options.writer.filterOptions(options));
      }
    };
  }).call(commonjsGlobal);
  return XMLDTDElement.exports;
}
var XMLDTDNotation = { exports: {} };
var hasRequiredXMLDTDNotation;
function requireXMLDTDNotation() {
  if (hasRequiredXMLDTDNotation) return XMLDTDNotation.exports;
  hasRequiredXMLDTDNotation = 1;
  (function() {
    var NodeType2, XMLNode2;
    XMLNode2 = requireXMLNode();
    NodeType2 = requireNodeType();
    XMLDTDNotation.exports = function() {
      class XMLDTDNotation2 extends XMLNode2 {
        // Initializes a new instance of `XMLDTDNotation`
        // `parent` the parent `XMLDocType` element
        // `name` the name of the notation
        // `value` an object with external entity details
        // `value.pubID` public identifier
        // `value.sysID` system identifier
        constructor(parent, name, value) {
          super(parent);
          if (name == null) {
            throw new Error("Missing DTD notation name. " + this.debugInfo(name));
          }
          if (!value.pubID && !value.sysID) {
            throw new Error("Public or system identifiers are required for an external entity. " + this.debugInfo(name));
          }
          this.name = this.stringify.name(name);
          this.type = NodeType2.NotationDeclaration;
          if (value.pubID != null) {
            this.pubID = this.stringify.dtdPubID(value.pubID);
          }
          if (value.sysID != null) {
            this.sysID = this.stringify.dtdSysID(value.sysID);
          }
        }
        // Converts the XML fragment to string
        // `options.pretty` pretty prints the result
        // `options.indent` indentation for pretty print
        // `options.offset` how many indentations to add to every line for pretty print
        // `options.newline` newline sequence for pretty print
        toString(options) {
          return this.options.writer.dtdNotation(this, this.options.writer.filterOptions(options));
        }
      }
      Object.defineProperty(XMLDTDNotation2.prototype, "publicId", {
        get: function() {
          return this.pubID;
        }
      });
      Object.defineProperty(XMLDTDNotation2.prototype, "systemId", {
        get: function() {
          return this.sysID;
        }
      });
      return XMLDTDNotation2;
    }.call(this);
  }).call(commonjsGlobal);
  return XMLDTDNotation.exports;
}
var hasRequiredXMLDocType;
function requireXMLDocType() {
  if (hasRequiredXMLDocType) return XMLDocType.exports;
  hasRequiredXMLDocType = 1;
  (function() {
    var NodeType2, XMLDTDAttList2, XMLDTDElement2, XMLDTDEntity2, XMLDTDNotation2, XMLNamedNodeMap2, XMLNode2, isObject;
    ({ isObject } = requireUtility());
    XMLNode2 = requireXMLNode();
    NodeType2 = requireNodeType();
    XMLDTDAttList2 = requireXMLDTDAttList();
    XMLDTDEntity2 = requireXMLDTDEntity();
    XMLDTDElement2 = requireXMLDTDElement();
    XMLDTDNotation2 = requireXMLDTDNotation();
    XMLNamedNodeMap2 = requireXMLNamedNodeMap();
    XMLDocType.exports = function() {
      class XMLDocType2 extends XMLNode2 {
        // Initializes a new instance of `XMLDocType`
        // `parent` the document object
        // `pubID` public identifier of the external subset
        // `sysID` system identifier of the external subset
        constructor(parent, pubID, sysID) {
          var child, i, len, ref;
          super(parent);
          this.type = NodeType2.DocType;
          if (parent.children) {
            ref = parent.children;
            for (i = 0, len = ref.length; i < len; i++) {
              child = ref[i];
              if (child.type === NodeType2.Element) {
                this.name = child.name;
                break;
              }
            }
          }
          this.documentObject = parent;
          if (isObject(pubID)) {
            ({ pubID, sysID } = pubID);
          }
          if (sysID == null) {
            [sysID, pubID] = [pubID, sysID];
          }
          if (pubID != null) {
            this.pubID = this.stringify.dtdPubID(pubID);
          }
          if (sysID != null) {
            this.sysID = this.stringify.dtdSysID(sysID);
          }
        }
        // Creates an element type declaration
        // `name` element name
        // `value` element content (defaults to #PCDATA)
        element(name, value) {
          var child;
          child = new XMLDTDElement2(this, name, value);
          this.children.push(child);
          return this;
        }
        // Creates an attribute declaration
        // `elementName` the name of the element containing this attribute
        // `attributeName` attribute name
        // `attributeType` type of the attribute (defaults to CDATA)
        // `defaultValueType` default value type (either #REQUIRED, #IMPLIED, #FIXED or
        //                    #DEFAULT) (defaults to #IMPLIED)
        // `defaultValue` default value of the attribute
        //                (only used for #FIXED or #DEFAULT)
        attList(elementName, attributeName, attributeType, defaultValueType, defaultValue) {
          var child;
          child = new XMLDTDAttList2(this, elementName, attributeName, attributeType, defaultValueType, defaultValue);
          this.children.push(child);
          return this;
        }
        // Creates a general entity declaration
        // `name` the name of the entity
        // `value` internal entity value or an object with external entity details
        // `value.pubID` public identifier
        // `value.sysID` system identifier
        // `value.nData` notation declaration
        entity(name, value) {
          var child;
          child = new XMLDTDEntity2(this, false, name, value);
          this.children.push(child);
          return this;
        }
        // Creates a parameter entity declaration
        // `name` the name of the entity
        // `value` internal entity value or an object with external entity details
        // `value.pubID` public identifier
        // `value.sysID` system identifier
        pEntity(name, value) {
          var child;
          child = new XMLDTDEntity2(this, true, name, value);
          this.children.push(child);
          return this;
        }
        // Creates a NOTATION declaration
        // `name` the name of the notation
        // `value` an object with external entity details
        // `value.pubID` public identifier
        // `value.sysID` system identifier
        notation(name, value) {
          var child;
          child = new XMLDTDNotation2(this, name, value);
          this.children.push(child);
          return this;
        }
        // Converts to string
        // `options.pretty` pretty prints the result
        // `options.indent` indentation for pretty print
        // `options.offset` how many indentations to add to every line for pretty print
        // `options.newline` newline sequence for pretty print
        toString(options) {
          return this.options.writer.docType(this, this.options.writer.filterOptions(options));
        }
        // Aliases
        ele(name, value) {
          return this.element(name, value);
        }
        att(elementName, attributeName, attributeType, defaultValueType, defaultValue) {
          return this.attList(elementName, attributeName, attributeType, defaultValueType, defaultValue);
        }
        ent(name, value) {
          return this.entity(name, value);
        }
        pent(name, value) {
          return this.pEntity(name, value);
        }
        not(name, value) {
          return this.notation(name, value);
        }
        up() {
          return this.root() || this.documentObject;
        }
        isEqualNode(node) {
          if (!super.isEqualNode(node)) {
            return false;
          }
          if (node.name !== this.name) {
            return false;
          }
          if (node.publicId !== this.publicId) {
            return false;
          }
          if (node.systemId !== this.systemId) {
            return false;
          }
          return true;
        }
      }
      Object.defineProperty(XMLDocType2.prototype, "entities", {
        get: function() {
          var child, i, len, nodes, ref;
          nodes = {};
          ref = this.children;
          for (i = 0, len = ref.length; i < len; i++) {
            child = ref[i];
            if (child.type === NodeType2.EntityDeclaration && !child.pe) {
              nodes[child.name] = child;
            }
          }
          return new XMLNamedNodeMap2(nodes);
        }
      });
      Object.defineProperty(XMLDocType2.prototype, "notations", {
        get: function() {
          var child, i, len, nodes, ref;
          nodes = {};
          ref = this.children;
          for (i = 0, len = ref.length; i < len; i++) {
            child = ref[i];
            if (child.type === NodeType2.NotationDeclaration) {
              nodes[child.name] = child;
            }
          }
          return new XMLNamedNodeMap2(nodes);
        }
      });
      Object.defineProperty(XMLDocType2.prototype, "publicId", {
        get: function() {
          return this.pubID;
        }
      });
      Object.defineProperty(XMLDocType2.prototype, "systemId", {
        get: function() {
          return this.sysID;
        }
      });
      Object.defineProperty(XMLDocType2.prototype, "internalSubset", {
        get: function() {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        }
      });
      return XMLDocType2;
    }.call(this);
  }).call(commonjsGlobal);
  return XMLDocType.exports;
}
var XMLRaw = { exports: {} };
var hasRequiredXMLRaw;
function requireXMLRaw() {
  if (hasRequiredXMLRaw) return XMLRaw.exports;
  hasRequiredXMLRaw = 1;
  (function() {
    var NodeType2, XMLNode2;
    NodeType2 = requireNodeType();
    XMLNode2 = requireXMLNode();
    XMLRaw.exports = class XMLRaw extends XMLNode2 {
      // Initializes a new instance of `XMLRaw`
      // `text` raw text
      constructor(parent, text) {
        super(parent);
        if (text == null) {
          throw new Error("Missing raw text. " + this.debugInfo());
        }
        this.type = NodeType2.Raw;
        this.value = this.stringify.raw(text);
      }
      // Creates and returns a deep clone of `this`
      clone() {
        return Object.create(this);
      }
      // Converts the XML fragment to string
      // `options.pretty` pretty prints the result
      // `options.indent` indentation for pretty print
      // `options.offset` how many indentations to add to every line for pretty print
      // `options.newline` newline sequence for pretty print
      toString(options) {
        return this.options.writer.raw(this, this.options.writer.filterOptions(options));
      }
    };
  }).call(commonjsGlobal);
  return XMLRaw.exports;
}
var XMLText = { exports: {} };
var hasRequiredXMLText;
function requireXMLText() {
  if (hasRequiredXMLText) return XMLText.exports;
  hasRequiredXMLText = 1;
  (function() {
    var NodeType2, XMLCharacterData2;
    NodeType2 = requireNodeType();
    XMLCharacterData2 = requireXMLCharacterData();
    XMLText.exports = function() {
      class XMLText2 extends XMLCharacterData2 {
        // Initializes a new instance of `XMLText`
        // `text` element text
        constructor(parent, text) {
          super(parent);
          if (text == null) {
            throw new Error("Missing element text. " + this.debugInfo());
          }
          this.name = "#text";
          this.type = NodeType2.Text;
          this.value = this.stringify.text(text);
        }
        // Creates and returns a deep clone of `this`
        clone() {
          return Object.create(this);
        }
        // Converts the XML fragment to string
        // `options.pretty` pretty prints the result
        // `options.indent` indentation for pretty print
        // `options.offset` how many indentations to add to every line for pretty print
        // `options.newline` newline sequence for pretty print
        toString(options) {
          return this.options.writer.text(this, this.options.writer.filterOptions(options));
        }
        // DOM level 1 functions to be implemented later
        splitText(offset) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        }
        // DOM level 3 functions to be implemented later
        replaceWholeText(content) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        }
      }
      Object.defineProperty(XMLText2.prototype, "isElementContentWhitespace", {
        get: function() {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        }
      });
      Object.defineProperty(XMLText2.prototype, "wholeText", {
        get: function() {
          var next, prev, str;
          str = "";
          prev = this.previousSibling;
          while (prev) {
            str = prev.data + str;
            prev = prev.previousSibling;
          }
          str += this.data;
          next = this.nextSibling;
          while (next) {
            str = str + next.data;
            next = next.nextSibling;
          }
          return str;
        }
      });
      return XMLText2;
    }.call(this);
  }).call(commonjsGlobal);
  return XMLText.exports;
}
var XMLProcessingInstruction = { exports: {} };
var hasRequiredXMLProcessingInstruction;
function requireXMLProcessingInstruction() {
  if (hasRequiredXMLProcessingInstruction) return XMLProcessingInstruction.exports;
  hasRequiredXMLProcessingInstruction = 1;
  (function() {
    var NodeType2, XMLCharacterData2;
    NodeType2 = requireNodeType();
    XMLCharacterData2 = requireXMLCharacterData();
    XMLProcessingInstruction.exports = class XMLProcessingInstruction extends XMLCharacterData2 {
      // Initializes a new instance of `XMLProcessingInstruction`
      // `parent` the parent node
      // `target` instruction target
      // `value` instruction value
      constructor(parent, target, value) {
        super(parent);
        if (target == null) {
          throw new Error("Missing instruction target. " + this.debugInfo());
        }
        this.type = NodeType2.ProcessingInstruction;
        this.target = this.stringify.insTarget(target);
        this.name = this.target;
        if (value) {
          this.value = this.stringify.insValue(value);
        }
      }
      // Creates and returns a deep clone of `this`
      clone() {
        return Object.create(this);
      }
      // Converts the XML fragment to string
      // `options.pretty` pretty prints the result
      // `options.indent` indentation for pretty print
      // `options.offset` how many indentations to add to every line for pretty print
      // `options.newline` newline sequence for pretty print
      toString(options) {
        return this.options.writer.processingInstruction(this, this.options.writer.filterOptions(options));
      }
      isEqualNode(node) {
        if (!super.isEqualNode(node)) {
          return false;
        }
        if (node.target !== this.target) {
          return false;
        }
        return true;
      }
    };
  }).call(commonjsGlobal);
  return XMLProcessingInstruction.exports;
}
var XMLDummy = { exports: {} };
var hasRequiredXMLDummy;
function requireXMLDummy() {
  if (hasRequiredXMLDummy) return XMLDummy.exports;
  hasRequiredXMLDummy = 1;
  (function() {
    var NodeType2, XMLNode2;
    XMLNode2 = requireXMLNode();
    NodeType2 = requireNodeType();
    XMLDummy.exports = class XMLDummy extends XMLNode2 {
      // Initializes a new instance of `XMLDummy`
      // `XMLDummy` is a special node representing a node with 
      // a null value. Dummy nodes are created while recursively
      // building the XML tree. Simply skipping null values doesn't
      // work because that would break the recursive chain.
      constructor(parent) {
        super(parent);
        this.type = NodeType2.Dummy;
      }
      // Creates and returns a deep clone of `this`
      clone() {
        return Object.create(this);
      }
      // Converts the XML fragment to string
      // `options.pretty` pretty prints the result
      // `options.indent` indentation for pretty print
      // `options.offset` how many indentations to add to every line for pretty print
      // `options.newline` newline sequence for pretty print
      toString(options) {
        return "";
      }
    };
  }).call(commonjsGlobal);
  return XMLDummy.exports;
}
var XMLNodeList = { exports: {} };
var hasRequiredXMLNodeList;
function requireXMLNodeList() {
  if (hasRequiredXMLNodeList) return XMLNodeList.exports;
  hasRequiredXMLNodeList = 1;
  (function() {
    XMLNodeList.exports = function() {
      class XMLNodeList2 {
        // Initializes a new instance of `XMLNodeList`
        // This is just a wrapper around an ordinary
        // JS array.
        // `nodes` the array containing nodes.
        constructor(nodes) {
          this.nodes = nodes;
        }
        // Creates and returns a deep clone of `this`
        clone() {
          return this.nodes = null;
        }
        // DOM Level 1
        item(index2) {
          return this.nodes[index2] || null;
        }
      }
      Object.defineProperty(XMLNodeList2.prototype, "length", {
        get: function() {
          return this.nodes.length || 0;
        }
      });
      return XMLNodeList2;
    }.call(this);
  }).call(commonjsGlobal);
  return XMLNodeList.exports;
}
var DocumentPosition = { exports: {} };
var hasRequiredDocumentPosition;
function requireDocumentPosition() {
  if (hasRequiredDocumentPosition) return DocumentPosition.exports;
  hasRequiredDocumentPosition = 1;
  (function() {
    DocumentPosition.exports = {
      Disconnected: 1,
      Preceding: 2,
      Following: 4,
      Contains: 8,
      ContainedBy: 16,
      ImplementationSpecific: 32
    };
  }).call(commonjsGlobal);
  return DocumentPosition.exports;
}
var hasRequiredXMLNode;
function requireXMLNode() {
  if (hasRequiredXMLNode) return XMLNode.exports;
  hasRequiredXMLNode = 1;
  (function() {
    var DocumentPosition2, NodeType2, XMLCData2, XMLComment2, XMLDeclaration2, XMLDocType2, XMLDummy2, XMLElement2, XMLNodeList2, XMLProcessingInstruction2, XMLRaw2, XMLText2, getValue, isEmpty, isFunction, isObject, hasProp = {}.hasOwnProperty, splice = [].splice;
    ({ isObject, isFunction, isEmpty, getValue } = requireUtility());
    XMLElement2 = null;
    XMLCData2 = null;
    XMLComment2 = null;
    XMLDeclaration2 = null;
    XMLDocType2 = null;
    XMLRaw2 = null;
    XMLText2 = null;
    XMLProcessingInstruction2 = null;
    XMLDummy2 = null;
    NodeType2 = null;
    XMLNodeList2 = null;
    DocumentPosition2 = null;
    XMLNode.exports = function() {
      class XMLNode2 {
        // Initializes a new instance of `XMLNode`
        // `parent` the parent node
        constructor(parent1) {
          this.parent = parent1;
          if (this.parent) {
            this.options = this.parent.options;
            this.stringify = this.parent.stringify;
          }
          this.value = null;
          this.children = [];
          this.baseURI = null;
          if (!XMLElement2) {
            XMLElement2 = requireXMLElement();
            XMLCData2 = requireXMLCData();
            XMLComment2 = requireXMLComment();
            XMLDeclaration2 = requireXMLDeclaration();
            XMLDocType2 = requireXMLDocType();
            XMLRaw2 = requireXMLRaw();
            XMLText2 = requireXMLText();
            XMLProcessingInstruction2 = requireXMLProcessingInstruction();
            XMLDummy2 = requireXMLDummy();
            NodeType2 = requireNodeType();
            XMLNodeList2 = requireXMLNodeList();
            requireXMLNamedNodeMap();
            DocumentPosition2 = requireDocumentPosition();
          }
        }
        // Sets the parent node of this node and its children recursively
        // `parent` the parent node
        setParent(parent) {
          var child, j, len, ref1, results;
          this.parent = parent;
          if (parent) {
            this.options = parent.options;
            this.stringify = parent.stringify;
          }
          ref1 = this.children;
          results = [];
          for (j = 0, len = ref1.length; j < len; j++) {
            child = ref1[j];
            results.push(child.setParent(this));
          }
          return results;
        }
        // Creates a child element node
        // `name` node name or an object describing the XML tree
        // `attributes` an object containing name/value pairs of attributes
        // `text` element text
        element(name, attributes, text) {
          var childNode, item, j, k, key, lastChild, len, len1, val;
          lastChild = null;
          if (attributes === null && text == null) {
            [attributes, text] = [{}, null];
          }
          if (attributes == null) {
            attributes = {};
          }
          attributes = getValue(attributes);
          if (!isObject(attributes)) {
            [text, attributes] = [attributes, text];
          }
          if (name != null) {
            name = getValue(name);
          }
          if (Array.isArray(name)) {
            for (j = 0, len = name.length; j < len; j++) {
              item = name[j];
              lastChild = this.element(item);
            }
          } else if (isFunction(name)) {
            lastChild = this.element(name.apply());
          } else if (isObject(name)) {
            for (key in name) {
              if (!hasProp.call(name, key)) continue;
              val = name[key];
              if (isFunction(val)) {
                val = val.apply();
              }
              if (!this.options.ignoreDecorators && this.stringify.convertAttKey && key.indexOf(this.stringify.convertAttKey) === 0) {
                lastChild = this.attribute(key.substr(this.stringify.convertAttKey.length), val);
              } else if (!this.options.separateArrayItems && Array.isArray(val) && isEmpty(val)) {
                lastChild = this.dummy();
              } else if (isObject(val) && isEmpty(val)) {
                lastChild = this.element(key);
              } else if (!this.options.keepNullNodes && val == null) {
                lastChild = this.dummy();
              } else if (!this.options.separateArrayItems && Array.isArray(val)) {
                for (k = 0, len1 = val.length; k < len1; k++) {
                  item = val[k];
                  childNode = {};
                  childNode[key] = item;
                  lastChild = this.element(childNode);
                }
              } else if (isObject(val)) {
                if (!this.options.ignoreDecorators && this.stringify.convertTextKey && key.indexOf(this.stringify.convertTextKey) === 0) {
                  lastChild = this.element(val);
                } else {
                  lastChild = this.element(key);
                  lastChild.element(val);
                }
              } else {
                lastChild = this.element(key, val);
              }
            }
          } else if (!this.options.keepNullNodes && text === null) {
            lastChild = this.dummy();
          } else {
            if (!this.options.ignoreDecorators && this.stringify.convertTextKey && name.indexOf(this.stringify.convertTextKey) === 0) {
              lastChild = this.text(text);
            } else if (!this.options.ignoreDecorators && this.stringify.convertCDataKey && name.indexOf(this.stringify.convertCDataKey) === 0) {
              lastChild = this.cdata(text);
            } else if (!this.options.ignoreDecorators && this.stringify.convertCommentKey && name.indexOf(this.stringify.convertCommentKey) === 0) {
              lastChild = this.comment(text);
            } else if (!this.options.ignoreDecorators && this.stringify.convertRawKey && name.indexOf(this.stringify.convertRawKey) === 0) {
              lastChild = this.raw(text);
            } else if (!this.options.ignoreDecorators && this.stringify.convertPIKey && name.indexOf(this.stringify.convertPIKey) === 0) {
              lastChild = this.instruction(name.substr(this.stringify.convertPIKey.length), text);
            } else {
              lastChild = this.node(name, attributes, text);
            }
          }
          if (lastChild == null) {
            throw new Error("Could not create any elements with: " + name + ". " + this.debugInfo());
          }
          return lastChild;
        }
        // Creates a child element node before the current node
        // `name` node name or an object describing the XML tree
        // `attributes` an object containing name/value pairs of attributes
        // `text` element text
        insertBefore(name, attributes, text) {
          var child, i, newChild, refChild, removed;
          if (name != null ? name.type : void 0) {
            newChild = name;
            refChild = attributes;
            newChild.setParent(this);
            if (refChild) {
              i = children.indexOf(refChild);
              removed = children.splice(i);
              children.push(newChild);
              Array.prototype.push.apply(children, removed);
            } else {
              children.push(newChild);
            }
            return newChild;
          } else {
            if (this.isRoot) {
              throw new Error("Cannot insert elements at root level. " + this.debugInfo(name));
            }
            i = this.parent.children.indexOf(this);
            removed = this.parent.children.splice(i);
            child = this.parent.element(name, attributes, text);
            Array.prototype.push.apply(this.parent.children, removed);
            return child;
          }
        }
        // Creates a child element node after the current node
        // `name` node name or an object describing the XML tree
        // `attributes` an object containing name/value pairs of attributes
        // `text` element text
        insertAfter(name, attributes, text) {
          var child, i, removed;
          if (this.isRoot) {
            throw new Error("Cannot insert elements at root level. " + this.debugInfo(name));
          }
          i = this.parent.children.indexOf(this);
          removed = this.parent.children.splice(i + 1);
          child = this.parent.element(name, attributes, text);
          Array.prototype.push.apply(this.parent.children, removed);
          return child;
        }
        // Deletes a child element node
        remove() {
          var i;
          if (this.isRoot) {
            throw new Error("Cannot remove the root element. " + this.debugInfo());
          }
          i = this.parent.children.indexOf(this);
          splice.apply(this.parent.children, [i, i - i + 1].concat([]));
          return this.parent;
        }
        // Creates a node
        // `name` name of the node
        // `attributes` an object containing name/value pairs of attributes
        // `text` element text
        node(name, attributes, text) {
          var child;
          if (name != null) {
            name = getValue(name);
          }
          attributes || (attributes = {});
          attributes = getValue(attributes);
          if (!isObject(attributes)) {
            [text, attributes] = [attributes, text];
          }
          child = new XMLElement2(this, name, attributes);
          if (text != null) {
            child.text(text);
          }
          this.children.push(child);
          return child;
        }
        // Creates a text node
        // `value` element text
        text(value) {
          var child;
          if (isObject(value)) {
            this.element(value);
          }
          child = new XMLText2(this, value);
          this.children.push(child);
          return this;
        }
        // Creates a CDATA node
        // `value` element text without CDATA delimiters
        cdata(value) {
          var child;
          child = new XMLCData2(this, value);
          this.children.push(child);
          return this;
        }
        // Creates a comment node
        // `value` comment text
        comment(value) {
          var child;
          child = new XMLComment2(this, value);
          this.children.push(child);
          return this;
        }
        // Creates a comment node before the current node
        // `value` comment text
        commentBefore(value) {
          var i, removed;
          i = this.parent.children.indexOf(this);
          removed = this.parent.children.splice(i);
          this.parent.comment(value);
          Array.prototype.push.apply(this.parent.children, removed);
          return this;
        }
        // Creates a comment node after the current node
        // `value` comment text
        commentAfter(value) {
          var i, removed;
          i = this.parent.children.indexOf(this);
          removed = this.parent.children.splice(i + 1);
          this.parent.comment(value);
          Array.prototype.push.apply(this.parent.children, removed);
          return this;
        }
        // Adds unescaped raw text
        // `value` text
        raw(value) {
          var child;
          child = new XMLRaw2(this, value);
          this.children.push(child);
          return this;
        }
        // Adds a dummy node
        dummy() {
          var child;
          child = new XMLDummy2(this);
          return child;
        }
        // Adds a processing instruction
        // `target` instruction target
        // `value` instruction value
        instruction(target, value) {
          var insTarget, insValue, instruction, j, len;
          if (target != null) {
            target = getValue(target);
          }
          if (value != null) {
            value = getValue(value);
          }
          if (Array.isArray(target)) {
            for (j = 0, len = target.length; j < len; j++) {
              insTarget = target[j];
              this.instruction(insTarget);
            }
          } else if (isObject(target)) {
            for (insTarget in target) {
              if (!hasProp.call(target, insTarget)) continue;
              insValue = target[insTarget];
              this.instruction(insTarget, insValue);
            }
          } else {
            if (isFunction(value)) {
              value = value.apply();
            }
            instruction = new XMLProcessingInstruction2(this, target, value);
            this.children.push(instruction);
          }
          return this;
        }
        // Creates a processing instruction node before the current node
        // `target` instruction target
        // `value` instruction value
        instructionBefore(target, value) {
          var i, removed;
          i = this.parent.children.indexOf(this);
          removed = this.parent.children.splice(i);
          this.parent.instruction(target, value);
          Array.prototype.push.apply(this.parent.children, removed);
          return this;
        }
        // Creates a processing instruction node after the current node
        // `target` instruction target
        // `value` instruction value
        instructionAfter(target, value) {
          var i, removed;
          i = this.parent.children.indexOf(this);
          removed = this.parent.children.splice(i + 1);
          this.parent.instruction(target, value);
          Array.prototype.push.apply(this.parent.children, removed);
          return this;
        }
        // Creates the xml declaration
        // `version` A version number string, e.g. 1.0
        // `encoding` Encoding declaration, e.g. UTF-8
        // `standalone` standalone document declaration: true or false
        declaration(version2, encoding, standalone) {
          var doc, xmldec;
          doc = this.document();
          xmldec = new XMLDeclaration2(doc, version2, encoding, standalone);
          if (doc.children.length === 0) {
            doc.children.unshift(xmldec);
          } else if (doc.children[0].type === NodeType2.Declaration) {
            doc.children[0] = xmldec;
          } else {
            doc.children.unshift(xmldec);
          }
          return doc.root() || doc;
        }
        // Creates the document type declaration
        // `pubID` the public identifier of the external subset
        // `sysID` the system identifier of the external subset
        dtd(pubID, sysID) {
          var child, doc, doctype, i, j, k, len, len1, ref1, ref2;
          doc = this.document();
          doctype = new XMLDocType2(doc, pubID, sysID);
          ref1 = doc.children;
          for (i = j = 0, len = ref1.length; j < len; i = ++j) {
            child = ref1[i];
            if (child.type === NodeType2.DocType) {
              doc.children[i] = doctype;
              return doctype;
            }
          }
          ref2 = doc.children;
          for (i = k = 0, len1 = ref2.length; k < len1; i = ++k) {
            child = ref2[i];
            if (child.isRoot) {
              doc.children.splice(i, 0, doctype);
              return doctype;
            }
          }
          doc.children.push(doctype);
          return doctype;
        }
        // Gets the parent node
        up() {
          if (this.isRoot) {
            throw new Error("The root node has no parent. Use doc() if you need to get the document object.");
          }
          return this.parent;
        }
        // Gets the root node
        root() {
          var node;
          node = this;
          while (node) {
            if (node.type === NodeType2.Document) {
              return node.rootObject;
            } else if (node.isRoot) {
              return node;
            } else {
              node = node.parent;
            }
          }
        }
        // Gets the node representing the XML document
        document() {
          var node;
          node = this;
          while (node) {
            if (node.type === NodeType2.Document) {
              return node;
            } else {
              node = node.parent;
            }
          }
        }
        // Ends the document and converts string
        end(options) {
          return this.document().end(options);
        }
        // Gets the previous node
        prev() {
          var i;
          i = this.parent.children.indexOf(this);
          if (i < 1) {
            throw new Error("Already at the first node. " + this.debugInfo());
          }
          return this.parent.children[i - 1];
        }
        // Gets the next node
        next() {
          var i;
          i = this.parent.children.indexOf(this);
          if (i === -1 || i === this.parent.children.length - 1) {
            throw new Error("Already at the last node. " + this.debugInfo());
          }
          return this.parent.children[i + 1];
        }
        // Imports cloned root from another XML document
        // `doc` the XML document to insert nodes from
        importDocument(doc) {
          var child, clonedRoot, j, len, ref1;
          clonedRoot = doc.root().clone();
          clonedRoot.parent = this;
          clonedRoot.isRoot = false;
          this.children.push(clonedRoot);
          if (this.type === NodeType2.Document) {
            clonedRoot.isRoot = true;
            clonedRoot.documentObject = this;
            this.rootObject = clonedRoot;
            if (this.children) {
              ref1 = this.children;
              for (j = 0, len = ref1.length; j < len; j++) {
                child = ref1[j];
                if (child.type === NodeType2.DocType) {
                  child.name = clonedRoot.name;
                  break;
                }
              }
            }
          }
          return this;
        }
        // Returns debug string for this node
        debugInfo(name) {
          var ref1, ref2;
          name = name || this.name;
          if (name == null && !((ref1 = this.parent) != null ? ref1.name : void 0)) {
            return "";
          } else if (name == null) {
            return "parent: <" + this.parent.name + ">";
          } else if (!((ref2 = this.parent) != null ? ref2.name : void 0)) {
            return "node: <" + name + ">";
          } else {
            return "node: <" + name + ">, parent: <" + this.parent.name + ">";
          }
        }
        // Aliases
        ele(name, attributes, text) {
          return this.element(name, attributes, text);
        }
        nod(name, attributes, text) {
          return this.node(name, attributes, text);
        }
        txt(value) {
          return this.text(value);
        }
        dat(value) {
          return this.cdata(value);
        }
        com(value) {
          return this.comment(value);
        }
        ins(target, value) {
          return this.instruction(target, value);
        }
        doc() {
          return this.document();
        }
        dec(version2, encoding, standalone) {
          return this.declaration(version2, encoding, standalone);
        }
        e(name, attributes, text) {
          return this.element(name, attributes, text);
        }
        n(name, attributes, text) {
          return this.node(name, attributes, text);
        }
        t(value) {
          return this.text(value);
        }
        d(value) {
          return this.cdata(value);
        }
        c(value) {
          return this.comment(value);
        }
        r(value) {
          return this.raw(value);
        }
        i(target, value) {
          return this.instruction(target, value);
        }
        u() {
          return this.up();
        }
        // can be deprecated in a future release
        importXMLBuilder(doc) {
          return this.importDocument(doc);
        }
        // Adds or modifies an attribute.
        // `name` attribute name
        // `value` attribute value
        attribute(name, value) {
          throw new Error("attribute() applies to element nodes only.");
        }
        att(name, value) {
          return this.attribute(name, value);
        }
        a(name, value) {
          return this.attribute(name, value);
        }
        // Removes an attribute
        // `name` attribute name
        removeAttribute(name) {
          throw new Error("attribute() applies to element nodes only.");
        }
        // DOM level 1 functions to be implemented later
        replaceChild(newChild, oldChild) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        }
        removeChild(oldChild) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        }
        appendChild(newChild) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        }
        hasChildNodes() {
          return this.children.length !== 0;
        }
        cloneNode(deep) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        }
        normalize() {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        }
        // DOM level 2
        isSupported(feature, version2) {
          return true;
        }
        hasAttributes() {
          return this.attribs.length !== 0;
        }
        // DOM level 3 functions to be implemented later
        compareDocumentPosition(other) {
          var ref, res;
          ref = this;
          if (ref === other) {
            return 0;
          } else if (this.document() !== other.document()) {
            res = DocumentPosition2.Disconnected | DocumentPosition2.ImplementationSpecific;
            if (Math.random() < 0.5) {
              res |= DocumentPosition2.Preceding;
            } else {
              res |= DocumentPosition2.Following;
            }
            return res;
          } else if (ref.isAncestor(other)) {
            return DocumentPosition2.Contains | DocumentPosition2.Preceding;
          } else if (ref.isDescendant(other)) {
            return DocumentPosition2.Contains | DocumentPosition2.Following;
          } else if (ref.isPreceding(other)) {
            return DocumentPosition2.Preceding;
          } else {
            return DocumentPosition2.Following;
          }
        }
        isSameNode(other) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        }
        lookupPrefix(namespaceURI) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        }
        isDefaultNamespace(namespaceURI) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        }
        lookupNamespaceURI(prefix) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        }
        isEqualNode(node) {
          var i, j, ref1;
          if (node.nodeType !== this.nodeType) {
            return false;
          }
          if (node.children.length !== this.children.length) {
            return false;
          }
          for (i = j = 0, ref1 = this.children.length - 1; 0 <= ref1 ? j <= ref1 : j >= ref1; i = 0 <= ref1 ? ++j : --j) {
            if (!this.children[i].isEqualNode(node.children[i])) {
              return false;
            }
          }
          return true;
        }
        getFeature(feature, version2) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        }
        setUserData(key, data, handler) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        }
        getUserData(key) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        }
        // Returns true if other is an inclusive descendant of node,
        // and false otherwise.
        contains(other) {
          if (!other) {
            return false;
          }
          return other === this || this.isDescendant(other);
        }
        // An object A is called a descendant of an object B, if either A is 
        // a child of B or A is a child of an object C that is a descendant of B.
        isDescendant(node) {
          var child, isDescendantChild, j, len, ref1;
          ref1 = this.children;
          for (j = 0, len = ref1.length; j < len; j++) {
            child = ref1[j];
            if (node === child) {
              return true;
            }
            isDescendantChild = child.isDescendant(node);
            if (isDescendantChild) {
              return true;
            }
          }
          return false;
        }
        // An object A is called an ancestor of an object B if and only if
        // B is a descendant of A.
        isAncestor(node) {
          return node.isDescendant(this);
        }
        // An object A is preceding an object B if A and B are in the 
        // same tree and A comes before B in tree order.
        isPreceding(node) {
          var nodePos, thisPos;
          nodePos = this.treePosition(node);
          thisPos = this.treePosition(this);
          if (nodePos === -1 || thisPos === -1) {
            return false;
          } else {
            return nodePos < thisPos;
          }
        }
        // An object A is folllowing an object B if A and B are in the 
        // same tree and A comes after B in tree order.
        isFollowing(node) {
          var nodePos, thisPos;
          nodePos = this.treePosition(node);
          thisPos = this.treePosition(this);
          if (nodePos === -1 || thisPos === -1) {
            return false;
          } else {
            return nodePos > thisPos;
          }
        }
        // Returns the preorder position of the given node in the tree, or -1
        // if the node is not in the tree.
        treePosition(node) {
          var found, pos;
          pos = 0;
          found = false;
          this.foreachTreeNode(this.document(), function(childNode) {
            pos++;
            if (!found && childNode === node) {
              return found = true;
            }
          });
          if (found) {
            return pos;
          } else {
            return -1;
          }
        }
        // Depth-first preorder traversal through the XML tree
        foreachTreeNode(node, func) {
          var child, j, len, ref1, res;
          node || (node = this.document());
          ref1 = node.children;
          for (j = 0, len = ref1.length; j < len; j++) {
            child = ref1[j];
            if (res = func(child)) {
              return res;
            } else {
              res = this.foreachTreeNode(child, func);
              if (res) {
                return res;
              }
            }
          }
        }
      }
      Object.defineProperty(XMLNode2.prototype, "nodeName", {
        get: function() {
          return this.name;
        }
      });
      Object.defineProperty(XMLNode2.prototype, "nodeType", {
        get: function() {
          return this.type;
        }
      });
      Object.defineProperty(XMLNode2.prototype, "nodeValue", {
        get: function() {
          return this.value;
        }
      });
      Object.defineProperty(XMLNode2.prototype, "parentNode", {
        get: function() {
          return this.parent;
        }
      });
      Object.defineProperty(XMLNode2.prototype, "childNodes", {
        get: function() {
          if (!this.childNodeList || !this.childNodeList.nodes) {
            this.childNodeList = new XMLNodeList2(this.children);
          }
          return this.childNodeList;
        }
      });
      Object.defineProperty(XMLNode2.prototype, "firstChild", {
        get: function() {
          return this.children[0] || null;
        }
      });
      Object.defineProperty(XMLNode2.prototype, "lastChild", {
        get: function() {
          return this.children[this.children.length - 1] || null;
        }
      });
      Object.defineProperty(XMLNode2.prototype, "previousSibling", {
        get: function() {
          var i;
          i = this.parent.children.indexOf(this);
          return this.parent.children[i - 1] || null;
        }
      });
      Object.defineProperty(XMLNode2.prototype, "nextSibling", {
        get: function() {
          var i;
          i = this.parent.children.indexOf(this);
          return this.parent.children[i + 1] || null;
        }
      });
      Object.defineProperty(XMLNode2.prototype, "ownerDocument", {
        get: function() {
          return this.document() || null;
        }
      });
      Object.defineProperty(XMLNode2.prototype, "textContent", {
        get: function() {
          var child, j, len, ref1, str;
          if (this.nodeType === NodeType2.Element || this.nodeType === NodeType2.DocumentFragment) {
            str = "";
            ref1 = this.children;
            for (j = 0, len = ref1.length; j < len; j++) {
              child = ref1[j];
              if (child.textContent) {
                str += child.textContent;
              }
            }
            return str;
          } else {
            return null;
          }
        },
        set: function(value) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        }
      });
      return XMLNode2;
    }.call(this);
  }).call(commonjsGlobal);
  return XMLNode.exports;
}
var XMLStringifier = { exports: {} };
var hasRequiredXMLStringifier;
function requireXMLStringifier() {
  if (hasRequiredXMLStringifier) return XMLStringifier.exports;
  hasRequiredXMLStringifier = 1;
  (function() {
    var hasProp = {}.hasOwnProperty;
    XMLStringifier.exports = function() {
      class XMLStringifier2 {
        // Initializes a new instance of `XMLStringifier`
        // `options.version` The version number string of the XML spec to validate against, e.g. 1.0
        // `options.noDoubleEncoding` whether existing html entities are encoded: true or false
        // `options.stringify` a set of functions to use for converting values to strings
        // `options.noValidation` whether values will be validated and escaped or returned as is
        // `options.invalidCharReplacement` a character to replace invalid characters and disable character validation
        constructor(options) {
          var key, ref, value;
          this.assertLegalChar = this.assertLegalChar.bind(this);
          this.assertLegalName = this.assertLegalName.bind(this);
          options || (options = {});
          this.options = options;
          if (!this.options.version) {
            this.options.version = "1.0";
          }
          ref = options.stringify || {};
          for (key in ref) {
            if (!hasProp.call(ref, key)) continue;
            value = ref[key];
            this[key] = value;
          }
        }
        // Defaults
        name(val) {
          if (this.options.noValidation) {
            return val;
          }
          return this.assertLegalName("" + val || "");
        }
        text(val) {
          if (this.options.noValidation) {
            return val;
          }
          return this.assertLegalChar(this.textEscape("" + val || ""));
        }
        cdata(val) {
          if (this.options.noValidation) {
            return val;
          }
          val = "" + val || "";
          val = val.replace("]]>", "]]]]><![CDATA[>");
          return this.assertLegalChar(val);
        }
        comment(val) {
          if (this.options.noValidation) {
            return val;
          }
          val = "" + val || "";
          if (val.match(/--/)) {
            throw new Error("Comment text cannot contain double-hypen: " + val);
          }
          return this.assertLegalChar(val);
        }
        raw(val) {
          if (this.options.noValidation) {
            return val;
          }
          return "" + val || "";
        }
        attValue(val) {
          if (this.options.noValidation) {
            return val;
          }
          return this.assertLegalChar(this.attEscape(val = "" + val || ""));
        }
        insTarget(val) {
          if (this.options.noValidation) {
            return val;
          }
          return this.assertLegalChar("" + val || "");
        }
        insValue(val) {
          if (this.options.noValidation) {
            return val;
          }
          val = "" + val || "";
          if (val.match(/\?>/)) {
            throw new Error("Invalid processing instruction value: " + val);
          }
          return this.assertLegalChar(val);
        }
        xmlVersion(val) {
          if (this.options.noValidation) {
            return val;
          }
          val = "" + val || "";
          if (!val.match(/1\.[0-9]+/)) {
            throw new Error("Invalid version number: " + val);
          }
          return val;
        }
        xmlEncoding(val) {
          if (this.options.noValidation) {
            return val;
          }
          val = "" + val || "";
          if (!val.match(/^[A-Za-z](?:[A-Za-z0-9._-])*$/)) {
            throw new Error("Invalid encoding: " + val);
          }
          return this.assertLegalChar(val);
        }
        xmlStandalone(val) {
          if (this.options.noValidation) {
            return val;
          }
          if (val) {
            return "yes";
          } else {
            return "no";
          }
        }
        dtdPubID(val) {
          if (this.options.noValidation) {
            return val;
          }
          return this.assertLegalChar("" + val || "");
        }
        dtdSysID(val) {
          if (this.options.noValidation) {
            return val;
          }
          return this.assertLegalChar("" + val || "");
        }
        dtdElementValue(val) {
          if (this.options.noValidation) {
            return val;
          }
          return this.assertLegalChar("" + val || "");
        }
        dtdAttType(val) {
          if (this.options.noValidation) {
            return val;
          }
          return this.assertLegalChar("" + val || "");
        }
        dtdAttDefault(val) {
          if (this.options.noValidation) {
            return val;
          }
          return this.assertLegalChar("" + val || "");
        }
        dtdEntityValue(val) {
          if (this.options.noValidation) {
            return val;
          }
          return this.assertLegalChar("" + val || "");
        }
        dtdNData(val) {
          if (this.options.noValidation) {
            return val;
          }
          return this.assertLegalChar("" + val || "");
        }
        assertLegalChar(str) {
          var regex, res;
          if (this.options.noValidation) {
            return str;
          }
          if (this.options.version === "1.0") {
            regex = /[\0-\x08\x0B\f\x0E-\x1F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/g;
            if (this.options.invalidCharReplacement !== void 0) {
              str = str.replace(regex, this.options.invalidCharReplacement);
            } else if (res = str.match(regex)) {
              throw new Error(`Invalid character in string: ${str} at index ${res.index}`);
            }
          } else if (this.options.version === "1.1") {
            regex = /[\0\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/g;
            if (this.options.invalidCharReplacement !== void 0) {
              str = str.replace(regex, this.options.invalidCharReplacement);
            } else if (res = str.match(regex)) {
              throw new Error(`Invalid character in string: ${str} at index ${res.index}`);
            }
          }
          return str;
        }
        assertLegalName(str) {
          var regex;
          if (this.options.noValidation) {
            return str;
          }
          str = this.assertLegalChar(str);
          regex = /^([:A-Z_a-z\xC0-\xD6\xD8-\xF6\xF8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD]|[\uD800-\uDB7F][\uDC00-\uDFFF])([\x2D\.0-:A-Z_a-z\xB7\xC0-\xD6\xD8-\xF6\xF8-\u037D\u037F-\u1FFF\u200C\u200D\u203F\u2040\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD]|[\uD800-\uDB7F][\uDC00-\uDFFF])*$/;
          if (!str.match(regex)) {
            throw new Error(`Invalid character in name: ${str}`);
          }
          return str;
        }
        // Escapes special characters in text
        // See http://www.w3.org/TR/2000/WD-xml-c14n-20000119.html#charescaping
        // `str` the string to escape
        textEscape(str) {
          var ampregex;
          if (this.options.noValidation) {
            return str;
          }
          ampregex = this.options.noDoubleEncoding ? /(?!&(lt|gt|amp|apos|quot);)&/g : /&/g;
          return str.replace(ampregex, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\r/g, "&#xD;");
        }
        // Escapes special characters in attribute values
        // See http://www.w3.org/TR/2000/WD-xml-c14n-20000119.html#charescaping
        // `str` the string to escape
        attEscape(str) {
          var ampregex;
          if (this.options.noValidation) {
            return str;
          }
          ampregex = this.options.noDoubleEncoding ? /(?!&(lt|gt|amp|apos|quot);)&/g : /&/g;
          return str.replace(ampregex, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;").replace(/\t/g, "&#x9;").replace(/\n/g, "&#xA;").replace(/\r/g, "&#xD;");
        }
      }
      XMLStringifier2.prototype.convertAttKey = "@";
      XMLStringifier2.prototype.convertPIKey = "?";
      XMLStringifier2.prototype.convertTextKey = "#text";
      XMLStringifier2.prototype.convertCDataKey = "#cdata";
      XMLStringifier2.prototype.convertCommentKey = "#comment";
      XMLStringifier2.prototype.convertRawKey = "#raw";
      return XMLStringifier2;
    }.call(this);
  }).call(commonjsGlobal);
  return XMLStringifier.exports;
}
var XMLStringWriter = { exports: {} };
var XMLWriterBase = { exports: {} };
var WriterState = { exports: {} };
var hasRequiredWriterState;
function requireWriterState() {
  if (hasRequiredWriterState) return WriterState.exports;
  hasRequiredWriterState = 1;
  (function() {
    WriterState.exports = {
      None: 0,
      OpenTag: 1,
      InsideTag: 2,
      CloseTag: 3
    };
  }).call(commonjsGlobal);
  return WriterState.exports;
}
var hasRequiredXMLWriterBase;
function requireXMLWriterBase() {
  if (hasRequiredXMLWriterBase) return XMLWriterBase.exports;
  hasRequiredXMLWriterBase = 1;
  (function() {
    var NodeType2, WriterState2, assign2, hasProp = {}.hasOwnProperty;
    ({ assign: assign2 } = requireUtility());
    NodeType2 = requireNodeType();
    requireXMLDeclaration();
    requireXMLDocType();
    requireXMLCData();
    requireXMLComment();
    requireXMLElement();
    requireXMLRaw();
    requireXMLText();
    requireXMLProcessingInstruction();
    requireXMLDummy();
    requireXMLDTDAttList();
    requireXMLDTDElement();
    requireXMLDTDEntity();
    requireXMLDTDNotation();
    WriterState2 = requireWriterState();
    XMLWriterBase.exports = class XMLWriterBase {
      // Initializes a new instance of `XMLWriterBase`
      // `options.pretty` pretty prints the result
      // `options.indent` indentation string
      // `options.newline` newline sequence
      // `options.offset` a fixed number of indentations to add to every line
      // `options.width` maximum column width
      // `options.allowEmpty` do not self close empty element tags
      // 'options.dontPrettyTextNodes' if any text is present in node, don't indent or LF
      // `options.spaceBeforeSlash` add a space before the closing slash of empty elements
      constructor(options) {
        var key, ref, value;
        options || (options = {});
        this.options = options;
        ref = options.writer || {};
        for (key in ref) {
          if (!hasProp.call(ref, key)) continue;
          value = ref[key];
          this["_" + key] = this[key];
          this[key] = value;
        }
      }
      // Filters writer options and provides defaults
      // `options` writer options
      filterOptions(options) {
        var filteredOptions, ref, ref1, ref2, ref3, ref4, ref5, ref6, ref7;
        options || (options = {});
        options = assign2({}, this.options, options);
        filteredOptions = {
          writer: this
        };
        filteredOptions.pretty = options.pretty || false;
        filteredOptions.allowEmpty = options.allowEmpty || false;
        filteredOptions.indent = (ref = options.indent) != null ? ref : "  ";
        filteredOptions.newline = (ref1 = options.newline) != null ? ref1 : "\n";
        filteredOptions.offset = (ref2 = options.offset) != null ? ref2 : 0;
        filteredOptions.width = (ref3 = options.width) != null ? ref3 : 0;
        filteredOptions.dontPrettyTextNodes = (ref4 = (ref5 = options.dontPrettyTextNodes) != null ? ref5 : options.dontprettytextnodes) != null ? ref4 : 0;
        filteredOptions.spaceBeforeSlash = (ref6 = (ref7 = options.spaceBeforeSlash) != null ? ref7 : options.spacebeforeslash) != null ? ref6 : "";
        if (filteredOptions.spaceBeforeSlash === true) {
          filteredOptions.spaceBeforeSlash = " ";
        }
        filteredOptions.suppressPrettyCount = 0;
        filteredOptions.user = {};
        filteredOptions.state = WriterState2.None;
        return filteredOptions;
      }
      // Returns the indentation string for the current level
      // `node` current node
      // `options` writer options
      // `level` current indentation level
      indent(node, options, level) {
        var indentLevel;
        if (!options.pretty || options.suppressPrettyCount) {
          return "";
        } else if (options.pretty) {
          indentLevel = (level || 0) + options.offset + 1;
          if (indentLevel > 0) {
            return new Array(indentLevel).join(options.indent);
          }
        }
        return "";
      }
      // Returns the newline string
      // `node` current node
      // `options` writer options
      // `level` current indentation level
      endline(node, options, level) {
        if (!options.pretty || options.suppressPrettyCount) {
          return "";
        } else {
          return options.newline;
        }
      }
      attribute(att, options, level) {
        var r;
        this.openAttribute(att, options, level);
        if (options.pretty && options.width > 0) {
          r = att.name + '="' + att.value + '"';
        } else {
          r = " " + att.name + '="' + att.value + '"';
        }
        this.closeAttribute(att, options, level);
        return r;
      }
      cdata(node, options, level) {
        var r;
        this.openNode(node, options, level);
        options.state = WriterState2.OpenTag;
        r = this.indent(node, options, level) + "<![CDATA[";
        options.state = WriterState2.InsideTag;
        r += node.value;
        options.state = WriterState2.CloseTag;
        r += "]]>" + this.endline(node, options, level);
        options.state = WriterState2.None;
        this.closeNode(node, options, level);
        return r;
      }
      comment(node, options, level) {
        var r;
        this.openNode(node, options, level);
        options.state = WriterState2.OpenTag;
        r = this.indent(node, options, level) + "<!-- ";
        options.state = WriterState2.InsideTag;
        r += node.value;
        options.state = WriterState2.CloseTag;
        r += " -->" + this.endline(node, options, level);
        options.state = WriterState2.None;
        this.closeNode(node, options, level);
        return r;
      }
      declaration(node, options, level) {
        var r;
        this.openNode(node, options, level);
        options.state = WriterState2.OpenTag;
        r = this.indent(node, options, level) + "<?xml";
        options.state = WriterState2.InsideTag;
        r += ' version="' + node.version + '"';
        if (node.encoding != null) {
          r += ' encoding="' + node.encoding + '"';
        }
        if (node.standalone != null) {
          r += ' standalone="' + node.standalone + '"';
        }
        options.state = WriterState2.CloseTag;
        r += options.spaceBeforeSlash + "?>";
        r += this.endline(node, options, level);
        options.state = WriterState2.None;
        this.closeNode(node, options, level);
        return r;
      }
      docType(node, options, level) {
        var child, i, len1, r, ref;
        level || (level = 0);
        this.openNode(node, options, level);
        options.state = WriterState2.OpenTag;
        r = this.indent(node, options, level);
        r += "<!DOCTYPE " + node.root().name;
        if (node.pubID && node.sysID) {
          r += ' PUBLIC "' + node.pubID + '" "' + node.sysID + '"';
        } else if (node.sysID) {
          r += ' SYSTEM "' + node.sysID + '"';
        }
        if (node.children.length > 0) {
          r += " [";
          r += this.endline(node, options, level);
          options.state = WriterState2.InsideTag;
          ref = node.children;
          for (i = 0, len1 = ref.length; i < len1; i++) {
            child = ref[i];
            r += this.writeChildNode(child, options, level + 1);
          }
          options.state = WriterState2.CloseTag;
          r += "]";
        }
        options.state = WriterState2.CloseTag;
        r += options.spaceBeforeSlash + ">";
        r += this.endline(node, options, level);
        options.state = WriterState2.None;
        this.closeNode(node, options, level);
        return r;
      }
      element(node, options, level) {
        var att, attLen, child, childNodeCount, firstChildNode, i, j, len, len1, len2, name, prettySuppressed, r, ratt, ref, ref1, ref2, ref3, rline;
        level || (level = 0);
        prettySuppressed = false;
        this.openNode(node, options, level);
        options.state = WriterState2.OpenTag;
        r = this.indent(node, options, level) + "<" + node.name;
        if (options.pretty && options.width > 0) {
          len = r.length;
          ref = node.attribs;
          for (name in ref) {
            if (!hasProp.call(ref, name)) continue;
            att = ref[name];
            ratt = this.attribute(att, options, level);
            attLen = ratt.length;
            if (len + attLen > options.width) {
              rline = this.indent(node, options, level + 1) + ratt;
              r += this.endline(node, options, level) + rline;
              len = rline.length;
            } else {
              rline = " " + ratt;
              r += rline;
              len += rline.length;
            }
          }
        } else {
          ref1 = node.attribs;
          for (name in ref1) {
            if (!hasProp.call(ref1, name)) continue;
            att = ref1[name];
            r += this.attribute(att, options, level);
          }
        }
        childNodeCount = node.children.length;
        firstChildNode = childNodeCount === 0 ? null : node.children[0];
        if (childNodeCount === 0 || node.children.every(function(e) {
          return (e.type === NodeType2.Text || e.type === NodeType2.Raw || e.type === NodeType2.CData) && e.value === "";
        })) {
          if (options.allowEmpty) {
            r += ">";
            options.state = WriterState2.CloseTag;
            r += "</" + node.name + ">" + this.endline(node, options, level);
          } else {
            options.state = WriterState2.CloseTag;
            r += options.spaceBeforeSlash + "/>" + this.endline(node, options, level);
          }
        } else if (options.pretty && childNodeCount === 1 && (firstChildNode.type === NodeType2.Text || firstChildNode.type === NodeType2.Raw || firstChildNode.type === NodeType2.CData) && firstChildNode.value != null) {
          r += ">";
          options.state = WriterState2.InsideTag;
          options.suppressPrettyCount++;
          prettySuppressed = true;
          r += this.writeChildNode(firstChildNode, options, level + 1);
          options.suppressPrettyCount--;
          prettySuppressed = false;
          options.state = WriterState2.CloseTag;
          r += "</" + node.name + ">" + this.endline(node, options, level);
        } else {
          if (options.dontPrettyTextNodes) {
            ref2 = node.children;
            for (i = 0, len1 = ref2.length; i < len1; i++) {
              child = ref2[i];
              if ((child.type === NodeType2.Text || child.type === NodeType2.Raw || child.type === NodeType2.CData) && child.value != null) {
                options.suppressPrettyCount++;
                prettySuppressed = true;
                break;
              }
            }
          }
          r += ">" + this.endline(node, options, level);
          options.state = WriterState2.InsideTag;
          ref3 = node.children;
          for (j = 0, len2 = ref3.length; j < len2; j++) {
            child = ref3[j];
            r += this.writeChildNode(child, options, level + 1);
          }
          options.state = WriterState2.CloseTag;
          r += this.indent(node, options, level) + "</" + node.name + ">";
          if (prettySuppressed) {
            options.suppressPrettyCount--;
          }
          r += this.endline(node, options, level);
          options.state = WriterState2.None;
        }
        this.closeNode(node, options, level);
        return r;
      }
      writeChildNode(node, options, level) {
        switch (node.type) {
          case NodeType2.CData:
            return this.cdata(node, options, level);
          case NodeType2.Comment:
            return this.comment(node, options, level);
          case NodeType2.Element:
            return this.element(node, options, level);
          case NodeType2.Raw:
            return this.raw(node, options, level);
          case NodeType2.Text:
            return this.text(node, options, level);
          case NodeType2.ProcessingInstruction:
            return this.processingInstruction(node, options, level);
          case NodeType2.Dummy:
            return "";
          case NodeType2.Declaration:
            return this.declaration(node, options, level);
          case NodeType2.DocType:
            return this.docType(node, options, level);
          case NodeType2.AttributeDeclaration:
            return this.dtdAttList(node, options, level);
          case NodeType2.ElementDeclaration:
            return this.dtdElement(node, options, level);
          case NodeType2.EntityDeclaration:
            return this.dtdEntity(node, options, level);
          case NodeType2.NotationDeclaration:
            return this.dtdNotation(node, options, level);
          default:
            throw new Error("Unknown XML node type: " + node.constructor.name);
        }
      }
      processingInstruction(node, options, level) {
        var r;
        this.openNode(node, options, level);
        options.state = WriterState2.OpenTag;
        r = this.indent(node, options, level) + "<?";
        options.state = WriterState2.InsideTag;
        r += node.target;
        if (node.value) {
          r += " " + node.value;
        }
        options.state = WriterState2.CloseTag;
        r += options.spaceBeforeSlash + "?>";
        r += this.endline(node, options, level);
        options.state = WriterState2.None;
        this.closeNode(node, options, level);
        return r;
      }
      raw(node, options, level) {
        var r;
        this.openNode(node, options, level);
        options.state = WriterState2.OpenTag;
        r = this.indent(node, options, level);
        options.state = WriterState2.InsideTag;
        r += node.value;
        options.state = WriterState2.CloseTag;
        r += this.endline(node, options, level);
        options.state = WriterState2.None;
        this.closeNode(node, options, level);
        return r;
      }
      text(node, options, level) {
        var r;
        this.openNode(node, options, level);
        options.state = WriterState2.OpenTag;
        r = this.indent(node, options, level);
        options.state = WriterState2.InsideTag;
        r += node.value;
        options.state = WriterState2.CloseTag;
        r += this.endline(node, options, level);
        options.state = WriterState2.None;
        this.closeNode(node, options, level);
        return r;
      }
      dtdAttList(node, options, level) {
        var r;
        this.openNode(node, options, level);
        options.state = WriterState2.OpenTag;
        r = this.indent(node, options, level) + "<!ATTLIST";
        options.state = WriterState2.InsideTag;
        r += " " + node.elementName + " " + node.attributeName + " " + node.attributeType;
        if (node.defaultValueType !== "#DEFAULT") {
          r += " " + node.defaultValueType;
        }
        if (node.defaultValue) {
          r += ' "' + node.defaultValue + '"';
        }
        options.state = WriterState2.CloseTag;
        r += options.spaceBeforeSlash + ">" + this.endline(node, options, level);
        options.state = WriterState2.None;
        this.closeNode(node, options, level);
        return r;
      }
      dtdElement(node, options, level) {
        var r;
        this.openNode(node, options, level);
        options.state = WriterState2.OpenTag;
        r = this.indent(node, options, level) + "<!ELEMENT";
        options.state = WriterState2.InsideTag;
        r += " " + node.name + " " + node.value;
        options.state = WriterState2.CloseTag;
        r += options.spaceBeforeSlash + ">" + this.endline(node, options, level);
        options.state = WriterState2.None;
        this.closeNode(node, options, level);
        return r;
      }
      dtdEntity(node, options, level) {
        var r;
        this.openNode(node, options, level);
        options.state = WriterState2.OpenTag;
        r = this.indent(node, options, level) + "<!ENTITY";
        options.state = WriterState2.InsideTag;
        if (node.pe) {
          r += " %";
        }
        r += " " + node.name;
        if (node.value) {
          r += ' "' + node.value + '"';
        } else {
          if (node.pubID && node.sysID) {
            r += ' PUBLIC "' + node.pubID + '" "' + node.sysID + '"';
          } else if (node.sysID) {
            r += ' SYSTEM "' + node.sysID + '"';
          }
          if (node.nData) {
            r += " NDATA " + node.nData;
          }
        }
        options.state = WriterState2.CloseTag;
        r += options.spaceBeforeSlash + ">" + this.endline(node, options, level);
        options.state = WriterState2.None;
        this.closeNode(node, options, level);
        return r;
      }
      dtdNotation(node, options, level) {
        var r;
        this.openNode(node, options, level);
        options.state = WriterState2.OpenTag;
        r = this.indent(node, options, level) + "<!NOTATION";
        options.state = WriterState2.InsideTag;
        r += " " + node.name;
        if (node.pubID && node.sysID) {
          r += ' PUBLIC "' + node.pubID + '" "' + node.sysID + '"';
        } else if (node.pubID) {
          r += ' PUBLIC "' + node.pubID + '"';
        } else if (node.sysID) {
          r += ' SYSTEM "' + node.sysID + '"';
        }
        options.state = WriterState2.CloseTag;
        r += options.spaceBeforeSlash + ">" + this.endline(node, options, level);
        options.state = WriterState2.None;
        this.closeNode(node, options, level);
        return r;
      }
      openNode(node, options, level) {
      }
      closeNode(node, options, level) {
      }
      openAttribute(att, options, level) {
      }
      closeAttribute(att, options, level) {
      }
    };
  }).call(commonjsGlobal);
  return XMLWriterBase.exports;
}
var hasRequiredXMLStringWriter;
function requireXMLStringWriter() {
  if (hasRequiredXMLStringWriter) return XMLStringWriter.exports;
  hasRequiredXMLStringWriter = 1;
  (function() {
    var XMLWriterBase2;
    XMLWriterBase2 = requireXMLWriterBase();
    XMLStringWriter.exports = class XMLStringWriter extends XMLWriterBase2 {
      // Initializes a new instance of `XMLStringWriter`
      // `options.pretty` pretty prints the result
      // `options.indent` indentation string
      // `options.newline` newline sequence
      // `options.offset` a fixed number of indentations to add to every line
      // `options.allowEmpty` do not self close empty element tags
      // 'options.dontPrettyTextNodes' if any text is present in node, don't indent or LF
      // `options.spaceBeforeSlash` add a space before the closing slash of empty elements
      constructor(options) {
        super(options);
      }
      document(doc, options) {
        var child, i, len, r, ref;
        options = this.filterOptions(options);
        r = "";
        ref = doc.children;
        for (i = 0, len = ref.length; i < len; i++) {
          child = ref[i];
          r += this.writeChildNode(child, options, 0);
        }
        if (options.pretty && r.slice(-options.newline.length) === options.newline) {
          r = r.slice(0, -options.newline.length);
        }
        return r;
      }
    };
  }).call(commonjsGlobal);
  return XMLStringWriter.exports;
}
var hasRequiredXMLDocument;
function requireXMLDocument() {
  if (hasRequiredXMLDocument) return XMLDocument.exports;
  hasRequiredXMLDocument = 1;
  (function() {
    var NodeType2, XMLDOMConfiguration2, XMLDOMImplementation2, XMLNode2, XMLStringWriter2, XMLStringifier2, isPlainObject;
    ({ isPlainObject } = requireUtility());
    XMLDOMImplementation2 = requireXMLDOMImplementation();
    XMLDOMConfiguration2 = requireXMLDOMConfiguration();
    XMLNode2 = requireXMLNode();
    NodeType2 = requireNodeType();
    XMLStringifier2 = requireXMLStringifier();
    XMLStringWriter2 = requireXMLStringWriter();
    XMLDocument.exports = function() {
      class XMLDocument2 extends XMLNode2 {
        // Initializes a new instance of `XMLDocument`
        // `options.keepNullNodes` whether nodes with null values will be kept
        //     or ignored: true or false
        // `options.keepNullAttributes` whether attributes with null values will be
        //     kept or ignored: true or false
        // `options.ignoreDecorators` whether decorator strings will be ignored when
        //     converting JS objects: true or false
        // `options.separateArrayItems` whether array items are created as separate
        //     nodes when passed as an object value: true or false
        // `options.noDoubleEncoding` whether existing html entities are encoded:
        //     true or false
        // `options.stringify` a set of functions to use for converting values to
        //     strings
        // `options.writer` the default XML writer to use for converting nodes to
        //     string. If the default writer is not set, the built-in XMLStringWriter
        //     will be used instead.
        constructor(options) {
          super(null);
          this.name = "#document";
          this.type = NodeType2.Document;
          this.documentURI = null;
          this.domConfig = new XMLDOMConfiguration2();
          options || (options = {});
          if (!options.writer) {
            options.writer = new XMLStringWriter2();
          }
          this.options = options;
          this.stringify = new XMLStringifier2(options);
        }
        // Ends the document and passes it to the given XML writer
        // `writer` is either an XML writer or a plain object to pass to the
        // constructor of the default XML writer. The default writer is assigned when
        // creating the XML document. Following flags are recognized by the
        // built-in XMLStringWriter:
        //   `writer.pretty` pretty prints the result
        //   `writer.indent` indentation for pretty print
        //   `writer.offset` how many indentations to add to every line for pretty print
        //   `writer.newline` newline sequence for pretty print
        end(writer) {
          var writerOptions;
          writerOptions = {};
          if (!writer) {
            writer = this.options.writer;
          } else if (isPlainObject(writer)) {
            writerOptions = writer;
            writer = this.options.writer;
          }
          return writer.document(this, writer.filterOptions(writerOptions));
        }
        // Converts the XML document to string
        // `options.pretty` pretty prints the result
        // `options.indent` indentation for pretty print
        // `options.offset` how many indentations to add to every line for pretty print
        // `options.newline` newline sequence for pretty print
        toString(options) {
          return this.options.writer.document(this, this.options.writer.filterOptions(options));
        }
        // DOM level 1 functions to be implemented later
        createElement(tagName) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        }
        createDocumentFragment() {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        }
        createTextNode(data) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        }
        createComment(data) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        }
        createCDATASection(data) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        }
        createProcessingInstruction(target, data) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        }
        createAttribute(name) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        }
        createEntityReference(name) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        }
        getElementsByTagName(tagname) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        }
        // DOM level 2 functions to be implemented later
        importNode(importedNode, deep) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        }
        createElementNS(namespaceURI, qualifiedName) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        }
        createAttributeNS(namespaceURI, qualifiedName) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        }
        getElementsByTagNameNS(namespaceURI, localName) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        }
        getElementById(elementId) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        }
        // DOM level 3 functions to be implemented later
        adoptNode(source) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        }
        normalizeDocument() {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        }
        renameNode(node, namespaceURI, qualifiedName) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        }
        // DOM level 4 functions to be implemented later
        getElementsByClassName(classNames) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        }
        createEvent(eventInterface) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        }
        createRange() {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        }
        createNodeIterator(root, whatToShow, filter) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        }
        createTreeWalker(root, whatToShow, filter) {
          throw new Error("This DOM method is not implemented." + this.debugInfo());
        }
      }
      Object.defineProperty(XMLDocument2.prototype, "implementation", {
        value: new XMLDOMImplementation2()
      });
      Object.defineProperty(XMLDocument2.prototype, "doctype", {
        get: function() {
          var child, i, len, ref;
          ref = this.children;
          for (i = 0, len = ref.length; i < len; i++) {
            child = ref[i];
            if (child.type === NodeType2.DocType) {
              return child;
            }
          }
          return null;
        }
      });
      Object.defineProperty(XMLDocument2.prototype, "documentElement", {
        get: function() {
          return this.rootObject || null;
        }
      });
      Object.defineProperty(XMLDocument2.prototype, "inputEncoding", {
        get: function() {
          return null;
        }
      });
      Object.defineProperty(XMLDocument2.prototype, "strictErrorChecking", {
        get: function() {
          return false;
        }
      });
      Object.defineProperty(XMLDocument2.prototype, "xmlEncoding", {
        get: function() {
          if (this.children.length !== 0 && this.children[0].type === NodeType2.Declaration) {
            return this.children[0].encoding;
          } else {
            return null;
          }
        }
      });
      Object.defineProperty(XMLDocument2.prototype, "xmlStandalone", {
        get: function() {
          if (this.children.length !== 0 && this.children[0].type === NodeType2.Declaration) {
            return this.children[0].standalone === "yes";
          } else {
            return false;
          }
        }
      });
      Object.defineProperty(XMLDocument2.prototype, "xmlVersion", {
        get: function() {
          if (this.children.length !== 0 && this.children[0].type === NodeType2.Declaration) {
            return this.children[0].version;
          } else {
            return "1.0";
          }
        }
      });
      Object.defineProperty(XMLDocument2.prototype, "URL", {
        get: function() {
          return this.documentURI;
        }
      });
      Object.defineProperty(XMLDocument2.prototype, "origin", {
        get: function() {
          return null;
        }
      });
      Object.defineProperty(XMLDocument2.prototype, "compatMode", {
        get: function() {
          return null;
        }
      });
      Object.defineProperty(XMLDocument2.prototype, "characterSet", {
        get: function() {
          return null;
        }
      });
      Object.defineProperty(XMLDocument2.prototype, "contentType", {
        get: function() {
          return null;
        }
      });
      return XMLDocument2;
    }.call(this);
  }).call(commonjsGlobal);
  return XMLDocument.exports;
}
var XMLDocumentCB = { exports: {} };
var hasRequiredXMLDocumentCB;
function requireXMLDocumentCB() {
  if (hasRequiredXMLDocumentCB) return XMLDocumentCB.exports;
  hasRequiredXMLDocumentCB = 1;
  (function() {
    var NodeType2, WriterState2, XMLAttribute2, XMLCData2, XMLComment2, XMLDTDAttList2, XMLDTDElement2, XMLDTDEntity2, XMLDTDNotation2, XMLDeclaration2, XMLDocType2, XMLDocument2, XMLElement2, XMLProcessingInstruction2, XMLRaw2, XMLStringWriter2, XMLStringifier2, XMLText2, getValue, isFunction, isObject, isPlainObject, hasProp = {}.hasOwnProperty;
    ({ isObject, isFunction, isPlainObject, getValue } = requireUtility());
    NodeType2 = requireNodeType();
    XMLDocument2 = requireXMLDocument();
    XMLElement2 = requireXMLElement();
    XMLCData2 = requireXMLCData();
    XMLComment2 = requireXMLComment();
    XMLRaw2 = requireXMLRaw();
    XMLText2 = requireXMLText();
    XMLProcessingInstruction2 = requireXMLProcessingInstruction();
    XMLDeclaration2 = requireXMLDeclaration();
    XMLDocType2 = requireXMLDocType();
    XMLDTDAttList2 = requireXMLDTDAttList();
    XMLDTDEntity2 = requireXMLDTDEntity();
    XMLDTDElement2 = requireXMLDTDElement();
    XMLDTDNotation2 = requireXMLDTDNotation();
    XMLAttribute2 = requireXMLAttribute();
    XMLStringifier2 = requireXMLStringifier();
    XMLStringWriter2 = requireXMLStringWriter();
    WriterState2 = requireWriterState();
    XMLDocumentCB.exports = class XMLDocumentCB {
      // Initializes a new instance of `XMLDocumentCB`
      // `options.keepNullNodes` whether nodes with null values will be kept
      //     or ignored: true or false
      // `options.keepNullAttributes` whether attributes with null values will be
      //     kept or ignored: true or false
      // `options.ignoreDecorators` whether decorator strings will be ignored when
      //     converting JS objects: true or false
      // `options.separateArrayItems` whether array items are created as separate
      //     nodes when passed as an object value: true or false
      // `options.noDoubleEncoding` whether existing html entities are encoded:
      //     true or false
      // `options.stringify` a set of functions to use for converting values to
      //     strings
      // `options.writer` the default XML writer to use for converting nodes to
      //     string. If the default writer is not set, the built-in XMLStringWriter
      //     will be used instead.
      // `onData` the function to be called when a new chunk of XML is output. The
      //          string containing the XML chunk is passed to `onData` as its first
      //          argument, and the current indentation level as its second argument.
      // `onEnd`  the function to be called when the XML document is completed with
      //          `end`. `onEnd` does not receive any arguments.
      constructor(options, onData, onEnd) {
        var writerOptions;
        this.name = "?xml";
        this.type = NodeType2.Document;
        options || (options = {});
        writerOptions = {};
        if (!options.writer) {
          options.writer = new XMLStringWriter2();
        } else if (isPlainObject(options.writer)) {
          writerOptions = options.writer;
          options.writer = new XMLStringWriter2();
        }
        this.options = options;
        this.writer = options.writer;
        this.writerOptions = this.writer.filterOptions(writerOptions);
        this.stringify = new XMLStringifier2(options);
        this.onDataCallback = onData || function() {
        };
        this.onEndCallback = onEnd || function() {
        };
        this.currentNode = null;
        this.currentLevel = -1;
        this.openTags = {};
        this.documentStarted = false;
        this.documentCompleted = false;
        this.root = null;
      }
      // Creates a child element node from the given XMLNode
      // `node` the child node
      createChildNode(node) {
        var att, attName, attributes, child, i, len, ref, ref1;
        switch (node.type) {
          case NodeType2.CData:
            this.cdata(node.value);
            break;
          case NodeType2.Comment:
            this.comment(node.value);
            break;
          case NodeType2.Element:
            attributes = {};
            ref = node.attribs;
            for (attName in ref) {
              if (!hasProp.call(ref, attName)) continue;
              att = ref[attName];
              attributes[attName] = att.value;
            }
            this.node(node.name, attributes);
            break;
          case NodeType2.Dummy:
            this.dummy();
            break;
          case NodeType2.Raw:
            this.raw(node.value);
            break;
          case NodeType2.Text:
            this.text(node.value);
            break;
          case NodeType2.ProcessingInstruction:
            this.instruction(node.target, node.value);
            break;
          default:
            throw new Error("This XML node type is not supported in a JS object: " + node.constructor.name);
        }
        ref1 = node.children;
        for (i = 0, len = ref1.length; i < len; i++) {
          child = ref1[i];
          this.createChildNode(child);
          if (child.type === NodeType2.Element) {
            this.up();
          }
        }
        return this;
      }
      // Creates a dummy node
      dummy() {
        return this;
      }
      // Creates a node
      // `name` name of the node
      // `attributes` an object containing name/value pairs of attributes
      // `text` element text
      node(name, attributes, text) {
        if (name == null) {
          throw new Error("Missing node name.");
        }
        if (this.root && this.currentLevel === -1) {
          throw new Error("Document can only have one root node. " + this.debugInfo(name));
        }
        this.openCurrent();
        name = getValue(name);
        if (attributes == null) {
          attributes = {};
        }
        attributes = getValue(attributes);
        if (!isObject(attributes)) {
          [text, attributes] = [attributes, text];
        }
        this.currentNode = new XMLElement2(this, name, attributes);
        this.currentNode.children = false;
        this.currentLevel++;
        this.openTags[this.currentLevel] = this.currentNode;
        if (text != null) {
          this.text(text);
        }
        return this;
      }
      // Creates a child element node or an element type declaration when called
      // inside the DTD
      // `name` name of the node
      // `attributes` an object containing name/value pairs of attributes
      // `text` element text
      element(name, attributes, text) {
        var child, i, len, oldValidationFlag, ref, root;
        if (this.currentNode && this.currentNode.type === NodeType2.DocType) {
          this.dtdElement(...arguments);
        } else {
          if (Array.isArray(name) || isObject(name) || isFunction(name)) {
            oldValidationFlag = this.options.noValidation;
            this.options.noValidation = true;
            root = new XMLDocument2(this.options).element("TEMP_ROOT");
            root.element(name);
            this.options.noValidation = oldValidationFlag;
            ref = root.children;
            for (i = 0, len = ref.length; i < len; i++) {
              child = ref[i];
              this.createChildNode(child);
              if (child.type === NodeType2.Element) {
                this.up();
              }
            }
          } else {
            this.node(name, attributes, text);
          }
        }
        return this;
      }
      // Adds or modifies an attribute
      // `name` attribute name
      // `value` attribute value
      attribute(name, value) {
        var attName, attValue;
        if (!this.currentNode || this.currentNode.children) {
          throw new Error("att() can only be used immediately after an ele() call in callback mode. " + this.debugInfo(name));
        }
        if (name != null) {
          name = getValue(name);
        }
        if (isObject(name)) {
          for (attName in name) {
            if (!hasProp.call(name, attName)) continue;
            attValue = name[attName];
            this.attribute(attName, attValue);
          }
        } else {
          if (isFunction(value)) {
            value = value.apply();
          }
          if (this.options.keepNullAttributes && value == null) {
            this.currentNode.attribs[name] = new XMLAttribute2(this, name, "");
          } else if (value != null) {
            this.currentNode.attribs[name] = new XMLAttribute2(this, name, value);
          }
        }
        return this;
      }
      // Creates a text node
      // `value` element text
      text(value) {
        var node;
        this.openCurrent();
        node = new XMLText2(this, value);
        this.onData(this.writer.text(node, this.writerOptions, this.currentLevel + 1), this.currentLevel + 1);
        return this;
      }
      // Creates a CDATA node
      // `value` element text without CDATA delimiters
      cdata(value) {
        var node;
        this.openCurrent();
        node = new XMLCData2(this, value);
        this.onData(this.writer.cdata(node, this.writerOptions, this.currentLevel + 1), this.currentLevel + 1);
        return this;
      }
      // Creates a comment node
      // `value` comment text
      comment(value) {
        var node;
        this.openCurrent();
        node = new XMLComment2(this, value);
        this.onData(this.writer.comment(node, this.writerOptions, this.currentLevel + 1), this.currentLevel + 1);
        return this;
      }
      // Adds unescaped raw text
      // `value` text
      raw(value) {
        var node;
        this.openCurrent();
        node = new XMLRaw2(this, value);
        this.onData(this.writer.raw(node, this.writerOptions, this.currentLevel + 1), this.currentLevel + 1);
        return this;
      }
      // Adds a processing instruction
      // `target` instruction target
      // `value` instruction value
      instruction(target, value) {
        var i, insTarget, insValue, len, node;
        this.openCurrent();
        if (target != null) {
          target = getValue(target);
        }
        if (value != null) {
          value = getValue(value);
        }
        if (Array.isArray(target)) {
          for (i = 0, len = target.length; i < len; i++) {
            insTarget = target[i];
            this.instruction(insTarget);
          }
        } else if (isObject(target)) {
          for (insTarget in target) {
            if (!hasProp.call(target, insTarget)) continue;
            insValue = target[insTarget];
            this.instruction(insTarget, insValue);
          }
        } else {
          if (isFunction(value)) {
            value = value.apply();
          }
          node = new XMLProcessingInstruction2(this, target, value);
          this.onData(this.writer.processingInstruction(node, this.writerOptions, this.currentLevel + 1), this.currentLevel + 1);
        }
        return this;
      }
      // Creates the xml declaration
      // `version` A version number string, e.g. 1.0
      // `encoding` Encoding declaration, e.g. UTF-8
      // `standalone` standalone document declaration: true or false
      declaration(version2, encoding, standalone) {
        var node;
        this.openCurrent();
        if (this.documentStarted) {
          throw new Error("declaration() must be the first node.");
        }
        node = new XMLDeclaration2(this, version2, encoding, standalone);
        this.onData(this.writer.declaration(node, this.writerOptions, this.currentLevel + 1), this.currentLevel + 1);
        return this;
      }
      // Creates the document type declaration
      // `root`  the name of the root node
      // `pubID` the public identifier of the external subset
      // `sysID` the system identifier of the external subset
      doctype(root, pubID, sysID) {
        this.openCurrent();
        if (root == null) {
          throw new Error("Missing root node name.");
        }
        if (this.root) {
          throw new Error("dtd() must come before the root node.");
        }
        this.currentNode = new XMLDocType2(this, pubID, sysID);
        this.currentNode.rootNodeName = root;
        this.currentNode.children = false;
        this.currentLevel++;
        this.openTags[this.currentLevel] = this.currentNode;
        return this;
      }
      // Creates an element type declaration
      // `name` element name
      // `value` element content (defaults to #PCDATA)
      dtdElement(name, value) {
        var node;
        this.openCurrent();
        node = new XMLDTDElement2(this, name, value);
        this.onData(this.writer.dtdElement(node, this.writerOptions, this.currentLevel + 1), this.currentLevel + 1);
        return this;
      }
      // Creates an attribute declaration
      // `elementName` the name of the element containing this attribute
      // `attributeName` attribute name
      // `attributeType` type of the attribute (defaults to CDATA)
      // `defaultValueType` default value type (either #REQUIRED, #IMPLIED, #FIXED or
      //                    #DEFAULT) (defaults to #IMPLIED)
      // `defaultValue` default value of the attribute
      //                (only used for #FIXED or #DEFAULT)
      attList(elementName, attributeName, attributeType, defaultValueType, defaultValue) {
        var node;
        this.openCurrent();
        node = new XMLDTDAttList2(this, elementName, attributeName, attributeType, defaultValueType, defaultValue);
        this.onData(this.writer.dtdAttList(node, this.writerOptions, this.currentLevel + 1), this.currentLevel + 1);
        return this;
      }
      // Creates a general entity declaration
      // `name` the name of the entity
      // `value` internal entity value or an object with external entity details
      // `value.pubID` public identifier
      // `value.sysID` system identifier
      // `value.nData` notation declaration
      entity(name, value) {
        var node;
        this.openCurrent();
        node = new XMLDTDEntity2(this, false, name, value);
        this.onData(this.writer.dtdEntity(node, this.writerOptions, this.currentLevel + 1), this.currentLevel + 1);
        return this;
      }
      // Creates a parameter entity declaration
      // `name` the name of the entity
      // `value` internal entity value or an object with external entity details
      // `value.pubID` public identifier
      // `value.sysID` system identifier
      pEntity(name, value) {
        var node;
        this.openCurrent();
        node = new XMLDTDEntity2(this, true, name, value);
        this.onData(this.writer.dtdEntity(node, this.writerOptions, this.currentLevel + 1), this.currentLevel + 1);
        return this;
      }
      // Creates a NOTATION declaration
      // `name` the name of the notation
      // `value` an object with external entity details
      // `value.pubID` public identifier
      // `value.sysID` system identifier
      notation(name, value) {
        var node;
        this.openCurrent();
        node = new XMLDTDNotation2(this, name, value);
        this.onData(this.writer.dtdNotation(node, this.writerOptions, this.currentLevel + 1), this.currentLevel + 1);
        return this;
      }
      // Gets the parent node
      up() {
        if (this.currentLevel < 0) {
          throw new Error("The document node has no parent.");
        }
        if (this.currentNode) {
          if (this.currentNode.children) {
            this.closeNode(this.currentNode);
          } else {
            this.openNode(this.currentNode);
          }
          this.currentNode = null;
        } else {
          this.closeNode(this.openTags[this.currentLevel]);
        }
        delete this.openTags[this.currentLevel];
        this.currentLevel--;
        return this;
      }
      // Ends the document
      end() {
        while (this.currentLevel >= 0) {
          this.up();
        }
        return this.onEnd();
      }
      // Opens the current parent node
      openCurrent() {
        if (this.currentNode) {
          this.currentNode.children = true;
          return this.openNode(this.currentNode);
        }
      }
      // Writes the opening tag of the current node or the entire node if it has
      // no child nodes
      openNode(node) {
        var att, chunk, name, ref;
        if (!node.isOpen) {
          if (!this.root && this.currentLevel === 0 && node.type === NodeType2.Element) {
            this.root = node;
          }
          chunk = "";
          if (node.type === NodeType2.Element) {
            this.writerOptions.state = WriterState2.OpenTag;
            chunk = this.writer.indent(node, this.writerOptions, this.currentLevel) + "<" + node.name;
            ref = node.attribs;
            for (name in ref) {
              if (!hasProp.call(ref, name)) continue;
              att = ref[name];
              chunk += this.writer.attribute(att, this.writerOptions, this.currentLevel);
            }
            chunk += (node.children ? ">" : "/>") + this.writer.endline(node, this.writerOptions, this.currentLevel);
            this.writerOptions.state = WriterState2.InsideTag;
          } else {
            this.writerOptions.state = WriterState2.OpenTag;
            chunk = this.writer.indent(node, this.writerOptions, this.currentLevel) + "<!DOCTYPE " + node.rootNodeName;
            if (node.pubID && node.sysID) {
              chunk += ' PUBLIC "' + node.pubID + '" "' + node.sysID + '"';
            } else if (node.sysID) {
              chunk += ' SYSTEM "' + node.sysID + '"';
            }
            if (node.children) {
              chunk += " [";
              this.writerOptions.state = WriterState2.InsideTag;
            } else {
              this.writerOptions.state = WriterState2.CloseTag;
              chunk += ">";
            }
            chunk += this.writer.endline(node, this.writerOptions, this.currentLevel);
          }
          this.onData(chunk, this.currentLevel);
          return node.isOpen = true;
        }
      }
      // Writes the closing tag of the current node
      closeNode(node) {
        var chunk;
        if (!node.isClosed) {
          chunk = "";
          this.writerOptions.state = WriterState2.CloseTag;
          if (node.type === NodeType2.Element) {
            chunk = this.writer.indent(node, this.writerOptions, this.currentLevel) + "</" + node.name + ">" + this.writer.endline(node, this.writerOptions, this.currentLevel);
          } else {
            chunk = this.writer.indent(node, this.writerOptions, this.currentLevel) + "]>" + this.writer.endline(node, this.writerOptions, this.currentLevel);
          }
          this.writerOptions.state = WriterState2.None;
          this.onData(chunk, this.currentLevel);
          return node.isClosed = true;
        }
      }
      // Called when a new chunk of XML is output
      // `chunk` a string containing the XML chunk
      // `level` current indentation level
      onData(chunk, level) {
        this.documentStarted = true;
        return this.onDataCallback(chunk, level + 1);
      }
      // Called when the XML document is completed
      onEnd() {
        this.documentCompleted = true;
        return this.onEndCallback();
      }
      // Returns debug string
      debugInfo(name) {
        if (name == null) {
          return "";
        } else {
          return "node: <" + name + ">";
        }
      }
      // Node aliases
      ele() {
        return this.element(...arguments);
      }
      nod(name, attributes, text) {
        return this.node(name, attributes, text);
      }
      txt(value) {
        return this.text(value);
      }
      dat(value) {
        return this.cdata(value);
      }
      com(value) {
        return this.comment(value);
      }
      ins(target, value) {
        return this.instruction(target, value);
      }
      dec(version2, encoding, standalone) {
        return this.declaration(version2, encoding, standalone);
      }
      dtd(root, pubID, sysID) {
        return this.doctype(root, pubID, sysID);
      }
      e(name, attributes, text) {
        return this.element(name, attributes, text);
      }
      n(name, attributes, text) {
        return this.node(name, attributes, text);
      }
      t(value) {
        return this.text(value);
      }
      d(value) {
        return this.cdata(value);
      }
      c(value) {
        return this.comment(value);
      }
      r(value) {
        return this.raw(value);
      }
      i(target, value) {
        return this.instruction(target, value);
      }
      // Attribute aliases
      att() {
        if (this.currentNode && this.currentNode.type === NodeType2.DocType) {
          return this.attList(...arguments);
        } else {
          return this.attribute(...arguments);
        }
      }
      a() {
        if (this.currentNode && this.currentNode.type === NodeType2.DocType) {
          return this.attList(...arguments);
        } else {
          return this.attribute(...arguments);
        }
      }
      // DTD aliases
      // att() and ele() are defined above
      ent(name, value) {
        return this.entity(name, value);
      }
      pent(name, value) {
        return this.pEntity(name, value);
      }
      not(name, value) {
        return this.notation(name, value);
      }
    };
  }).call(commonjsGlobal);
  return XMLDocumentCB.exports;
}
var XMLStreamWriter = { exports: {} };
var hasRequiredXMLStreamWriter;
function requireXMLStreamWriter() {
  if (hasRequiredXMLStreamWriter) return XMLStreamWriter.exports;
  hasRequiredXMLStreamWriter = 1;
  (function() {
    var NodeType2, WriterState2, XMLWriterBase2, hasProp = {}.hasOwnProperty;
    NodeType2 = requireNodeType();
    XMLWriterBase2 = requireXMLWriterBase();
    WriterState2 = requireWriterState();
    XMLStreamWriter.exports = class XMLStreamWriter extends XMLWriterBase2 {
      // Initializes a new instance of `XMLStreamWriter`
      // `stream` output stream
      // `options.pretty` pretty prints the result
      // `options.indent` indentation string
      // `options.newline` newline sequence
      // `options.offset` a fixed number of indentations to add to every line
      // `options.allowEmpty` do not self close empty element tags
      // 'options.dontPrettyTextNodes' if any text is present in node, don't indent or LF
      // `options.spaceBeforeSlash` add a space before the closing slash of empty elements
      constructor(stream, options) {
        super(options);
        this.stream = stream;
      }
      endline(node, options, level) {
        if (node.isLastRootNode && options.state === WriterState2.CloseTag) {
          return "";
        } else {
          return super.endline(node, options, level);
        }
      }
      document(doc, options) {
        var child, i, j, k, len1, len2, ref, ref1, results;
        ref = doc.children;
        for (i = j = 0, len1 = ref.length; j < len1; i = ++j) {
          child = ref[i];
          child.isLastRootNode = i === doc.children.length - 1;
        }
        options = this.filterOptions(options);
        ref1 = doc.children;
        results = [];
        for (k = 0, len2 = ref1.length; k < len2; k++) {
          child = ref1[k];
          results.push(this.writeChildNode(child, options, 0));
        }
        return results;
      }
      cdata(node, options, level) {
        return this.stream.write(super.cdata(node, options, level));
      }
      comment(node, options, level) {
        return this.stream.write(super.comment(node, options, level));
      }
      declaration(node, options, level) {
        return this.stream.write(super.declaration(node, options, level));
      }
      docType(node, options, level) {
        var child, j, len1, ref;
        level || (level = 0);
        this.openNode(node, options, level);
        options.state = WriterState2.OpenTag;
        this.stream.write(this.indent(node, options, level));
        this.stream.write("<!DOCTYPE " + node.root().name);
        if (node.pubID && node.sysID) {
          this.stream.write(' PUBLIC "' + node.pubID + '" "' + node.sysID + '"');
        } else if (node.sysID) {
          this.stream.write(' SYSTEM "' + node.sysID + '"');
        }
        if (node.children.length > 0) {
          this.stream.write(" [");
          this.stream.write(this.endline(node, options, level));
          options.state = WriterState2.InsideTag;
          ref = node.children;
          for (j = 0, len1 = ref.length; j < len1; j++) {
            child = ref[j];
            this.writeChildNode(child, options, level + 1);
          }
          options.state = WriterState2.CloseTag;
          this.stream.write("]");
        }
        options.state = WriterState2.CloseTag;
        this.stream.write(options.spaceBeforeSlash + ">");
        this.stream.write(this.endline(node, options, level));
        options.state = WriterState2.None;
        return this.closeNode(node, options, level);
      }
      element(node, options, level) {
        var att, attLen, child, childNodeCount, firstChildNode, j, len, len1, name, r, ratt, ref, ref1, ref2, rline;
        level || (level = 0);
        this.openNode(node, options, level);
        options.state = WriterState2.OpenTag;
        r = this.indent(node, options, level) + "<" + node.name;
        if (options.pretty && options.width > 0) {
          len = r.length;
          ref = node.attribs;
          for (name in ref) {
            if (!hasProp.call(ref, name)) continue;
            att = ref[name];
            ratt = this.attribute(att, options, level);
            attLen = ratt.length;
            if (len + attLen > options.width) {
              rline = this.indent(node, options, level + 1) + ratt;
              r += this.endline(node, options, level) + rline;
              len = rline.length;
            } else {
              rline = " " + ratt;
              r += rline;
              len += rline.length;
            }
          }
        } else {
          ref1 = node.attribs;
          for (name in ref1) {
            if (!hasProp.call(ref1, name)) continue;
            att = ref1[name];
            r += this.attribute(att, options, level);
          }
        }
        this.stream.write(r);
        childNodeCount = node.children.length;
        firstChildNode = childNodeCount === 0 ? null : node.children[0];
        if (childNodeCount === 0 || node.children.every(function(e) {
          return (e.type === NodeType2.Text || e.type === NodeType2.Raw || e.type === NodeType2.CData) && e.value === "";
        })) {
          if (options.allowEmpty) {
            this.stream.write(">");
            options.state = WriterState2.CloseTag;
            this.stream.write("</" + node.name + ">");
          } else {
            options.state = WriterState2.CloseTag;
            this.stream.write(options.spaceBeforeSlash + "/>");
          }
        } else if (options.pretty && childNodeCount === 1 && (firstChildNode.type === NodeType2.Text || firstChildNode.type === NodeType2.Raw || firstChildNode.type === NodeType2.CData) && firstChildNode.value != null) {
          this.stream.write(">");
          options.state = WriterState2.InsideTag;
          options.suppressPrettyCount++;
          this.writeChildNode(firstChildNode, options, level + 1);
          options.suppressPrettyCount--;
          options.state = WriterState2.CloseTag;
          this.stream.write("</" + node.name + ">");
        } else {
          this.stream.write(">" + this.endline(node, options, level));
          options.state = WriterState2.InsideTag;
          ref2 = node.children;
          for (j = 0, len1 = ref2.length; j < len1; j++) {
            child = ref2[j];
            this.writeChildNode(child, options, level + 1);
          }
          options.state = WriterState2.CloseTag;
          this.stream.write(this.indent(node, options, level) + "</" + node.name + ">");
        }
        this.stream.write(this.endline(node, options, level));
        options.state = WriterState2.None;
        return this.closeNode(node, options, level);
      }
      processingInstruction(node, options, level) {
        return this.stream.write(super.processingInstruction(node, options, level));
      }
      raw(node, options, level) {
        return this.stream.write(super.raw(node, options, level));
      }
      text(node, options, level) {
        return this.stream.write(super.text(node, options, level));
      }
      dtdAttList(node, options, level) {
        return this.stream.write(super.dtdAttList(node, options, level));
      }
      dtdElement(node, options, level) {
        return this.stream.write(super.dtdElement(node, options, level));
      }
      dtdEntity(node, options, level) {
        return this.stream.write(super.dtdEntity(node, options, level));
      }
      dtdNotation(node, options, level) {
        return this.stream.write(super.dtdNotation(node, options, level));
      }
    };
  }).call(commonjsGlobal);
  return XMLStreamWriter.exports;
}
(function() {
  var NodeType2, WriterState2, XMLDOMImplementation2, XMLDocument2, XMLDocumentCB2, XMLStreamWriter2, XMLStringWriter2, assign2, isFunction;
  ({ assign: assign2, isFunction } = requireUtility());
  XMLDOMImplementation2 = requireXMLDOMImplementation();
  XMLDocument2 = requireXMLDocument();
  XMLDocumentCB2 = requireXMLDocumentCB();
  XMLStringWriter2 = requireXMLStringWriter();
  XMLStreamWriter2 = requireXMLStreamWriter();
  NodeType2 = requireNodeType();
  WriterState2 = requireWriterState();
  lib.create = function(name, xmldec, doctype, options) {
    var doc, root;
    if (name == null) {
      throw new Error("Root element needs a name.");
    }
    options = assign2({}, xmldec, doctype, options);
    doc = new XMLDocument2(options);
    root = doc.element(name);
    if (!options.headless) {
      doc.declaration(options);
      if (options.pubID != null || options.sysID != null) {
        doc.dtd(options);
      }
    }
    return root;
  };
  lib.begin = function(options, onData, onEnd) {
    if (isFunction(options)) {
      [onData, onEnd] = [options, onData];
      options = {};
    }
    if (onData) {
      return new XMLDocumentCB2(options, onData, onEnd);
    } else {
      return new XMLDocument2(options);
    }
  };
  lib.stringWriter = function(options) {
    return new XMLStringWriter2(options);
  };
  lib.streamWriter = function(stream, options) {
    return new XMLStreamWriter2(stream, options);
  };
  lib.implementation = new XMLDOMImplementation2();
  lib.nodeType = NodeType2;
  lib.writerState = WriterState2;
}).call(commonjsGlobal);
var base64 = base64Js;
var xmlbuilder = lib;
build$1.build = build;
function ISODateString(d) {
  function pad(n) {
    return n < 10 ? "0" + n : n;
  }
  return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate()) + "T" + pad(d.getUTCHours()) + ":" + pad(d.getUTCMinutes()) + ":" + pad(d.getUTCSeconds()) + "Z";
}
var toString = Object.prototype.toString;
function type(obj) {
  var m = toString.call(obj).match(/\[object (.*)\]/);
  return m ? m[1] : m;
}
function build(obj, opts) {
  var XMLHDR = {
    version: "1.0",
    encoding: "UTF-8"
  };
  var XMLDTD = {
    pubid: "-//Apple//DTD PLIST 1.0//EN",
    sysid: "http://www.apple.com/DTDs/PropertyList-1.0.dtd"
  };
  var doc = xmlbuilder.create("plist");
  doc.dec(XMLHDR.version, XMLHDR.encoding, XMLHDR.standalone);
  doc.dtd(XMLDTD.pubid, XMLDTD.sysid);
  doc.att("version", "1.0");
  walk_obj(obj, doc);
  if (!opts) opts = {};
  opts.pretty = opts.pretty !== false;
  return doc.end(opts);
}
function walk_obj(next, next_child) {
  var tag_type, i, prop;
  var name = type(next);
  if ("Undefined" == name) {
    return;
  } else if (Array.isArray(next)) {
    next_child = next_child.ele("array");
    for (i = 0; i < next.length; i++) {
      walk_obj(next[i], next_child);
    }
  } else if (Buffer.isBuffer(next)) {
    next_child.ele("data").raw(next.toString("base64"));
  } else if ("Object" == name) {
    next_child = next_child.ele("dict");
    for (prop in next) {
      if (next.hasOwnProperty(prop)) {
        next_child.ele("key").txt(prop);
        walk_obj(next[prop], next_child);
      }
    }
  } else if ("Number" == name) {
    tag_type = next % 1 === 0 ? "integer" : "real";
    next_child.ele(tag_type).txt(next.toString());
  } else if ("BigInt" == name) {
    next_child.ele("integer").txt(next);
  } else if ("Date" == name) {
    next_child.ele("date").txt(ISODateString(new Date(next)));
  } else if ("Boolean" == name) {
    next_child.ele(next ? "true" : "false");
  } else if ("String" == name) {
    next_child.ele("string").txt(next);
  } else if ("ArrayBuffer" == name) {
    next_child.ele("data").raw(base64.fromByteArray(next));
  } else if (next && next.buffer && "ArrayBuffer" == type(next.buffer)) {
    next_child.ele("data").raw(base64.fromByteArray(new Uint8Array(next.buffer), next_child));
  } else if ("Null" === name) {
    next_child.ele("null").txt("");
  }
}
(function(exports$1) {
  var parserFunctions = parse$9;
  Object.keys(parserFunctions).forEach(function(k) {
    exports$1[k] = parserFunctions[k];
  });
  var builderFunctions = build$1;
  Object.keys(builderFunctions).forEach(function(k) {
    exports$1[k] = builderFunctions[k];
  });
})(plist$2);
const plist$1 = /* @__PURE__ */ getDefaultExportFromCjs(plist$2);
function getApps(resolve, reject, filterByAppName = false) {
  let resultBuffer = new Buffer.from([]);
  const profileInstalledApps = child_process.spawn("/usr/sbin/system_profiler", [
    "-xml",
    "-detailLevel",
    "mini",
    "SPApplicationsDataType"
  ]);
  profileInstalledApps.stdout.on("data", (chunckBuffer) => {
    resultBuffer = Buffer.concat([resultBuffer, chunckBuffer]);
  });
  profileInstalledApps.on("exit", (exitCode) => {
    if (exitCode !== 0) {
      reject([]);
      return;
    }
    try {
      const [installedApps] = plist$1.parse(resultBuffer.toString());
      if (!filterByAppName) return resolve(installedApps._items);
      return resolve(
        installedApps._items.filter((apps) => apps._name === filterByAppName).length !== 0
      );
    } catch (err) {
      reject(err);
    }
  });
  profileInstalledApps.on("error", (err) => {
    reject(err);
  });
}
const plist = require("simple-plist");
const getIconFile = (appFileInput) => {
  return new Promise((resolve, reject) => {
    const plistPath = path.join(appFileInput, "Contents", "Info.plist");
    plist.readFile(plistPath, (err, data) => {
      if (err || !data.CFBundleIconFile) {
        return resolve(
          "/System/Library/CoreServices/CoreTypes.bundle/Contents/Resources/GenericApplicationIcon.icns"
        );
      }
      const iconFile = path.join(
        appFileInput,
        "Contents",
        "Resources",
        data.CFBundleIconFile
      );
      const iconFiles = [iconFile, iconFile + ".icns", iconFile + ".tiff"];
      const existedIcon = iconFiles.find((iconFile2) => {
        return fs$1.existsSync(iconFile2);
      });
      resolve(
        existedIcon || "/System/Library/CoreServices/CoreTypes.bundle/Contents/Resources/GenericApplicationIcon.icns"
      );
    });
  });
};
const tiffToPng = (iconFile, pngFileOutput) => {
  return new Promise((resolve, reject) => {
    child_process.exec(
      `sips -s format png '${iconFile}' --out '${pngFileOutput}' --resampleHeightWidth 64 64`,
      (error) => {
        error ? reject(error) : resolve(null);
      }
    );
  });
};
const app2png = (appFileInput, pngFileOutput) => {
  return getIconFile(appFileInput).then((iconFile) => {
    return tiffToPng(iconFile, pngFileOutput);
  });
};
const getMacApps = {
  getApps: () => {
    return new Promise((resolve, reject) => getApps(resolve, reject));
  },
  isInstalled: (appName) => {
    return new Promise((resolve, reject) => getApps(resolve, reject, appName));
  },
  app2png
};
const icondir$1 = path.join(os.tmpdir(), "ProcessIcon");
const exists$1 = fs$1.existsSync(icondir$1);
if (!exists$1) {
  fs$1.mkdirSync(icondir$1);
}
const isZhRegex$1 = /[\u4e00-\u9fa5]/;
async function getAppIcon(appPath2, nativeImage, name) {
  try {
    const iconpath = path.join(icondir$1, `${name}.png`);
    const iconnone = path.join(icondir$1, `${name}.none`);
    const exists2 = fs$1.existsSync(iconpath);
    const existsnone = fs$1.existsSync(iconnone);
    if (exists2) return true;
    if (existsnone) return false;
    await getMacApps.app2png(appPath2, iconpath);
    return true;
  } catch (e) {
    return false;
  }
}
const darwinSearch = async (nativeImage) => {
  let apps = await getMacApps.getApps();
  apps = apps.filter((app) => {
    const extname = path.extname(app.path);
    return extname === ".app" || extname === ".prefPane";
  });
  for (const app of apps) {
    if (await getAppIcon(app.path, nativeImage, app._name)) {
      app.icon = "image://" + path.join(
        os.tmpdir(),
        "ProcessIcon",
        `${encodeURIComponent(app._name)}.png`
      );
    }
  }
  apps = apps.filter((app) => !!app.icon);
  apps = apps.map((app) => {
    const appName = app.path.split("/").pop();
    const extname = path.extname(appName);
    const appSubStr = appName.split(extname)[0];
    let fileOptions = {
      ...app,
      value: "plugin",
      desc: app.path,
      pluginType: "app",
      action: `open ${app.path.replace(/ /g, "\\ ")}`,
      keyWords: [appSubStr]
    };
    if (app._name && isZhRegex$1.test(app._name)) {
      fileOptions.keyWords.push(app._name);
    }
    fileOptions = {
      ...fileOptions,
      name: app._name,
      names: JSON.parse(JSON.stringify(fileOptions.keyWords))
    };
    return fileOptions;
  });
  return apps;
};
const filePath = path.resolve(
  "C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs"
);
const appData = path.join(os.homedir(), "./AppData/Roaming");
const startMenu = path.join(
  appData,
  "Microsoft\\Windows\\Start Menu\\Programs"
);
const fileLists = [];
const isZhRegex = /[\u4e00-\u9fa5]/;
const icondir = path.join(os.tmpdir(), "ProcessIcon");
const exists = fs$1.existsSync(icondir);
if (!exists) {
  fs$1.mkdirSync(icondir);
}
const getico = (app) => {
  try {
    const fileIcon = require("extract-file-icon");
    const buffer = fileIcon(app.desc, 32);
    const iconpath = path.join(icondir, `${app.name}.png`);
    fs$1.exists(iconpath, (exists2) => {
      if (!exists2) {
        fs$1.writeFile(iconpath, buffer, "base64", () => {
        });
      }
    });
  } catch (e) {
    console.log(e, app.desc);
  }
};
function fileDisplay(filePath2) {
  fs$1.readdir(filePath2, function(err, files) {
    if (err) {
      console.warn(err);
    } else {
      files.forEach(function(filename) {
        const filedir = path.join(filePath2, filename);
        fs$1.stat(filedir, function(eror, stats) {
          if (eror) {
            console.warn("获取文件stats失败");
          } else {
            const isFile = stats.isFile();
            const isDir = stats.isDirectory();
            if (isFile) {
              const appName = filename.split(".")[0];
              const keyWords = [appName];
              let appDetail = {};
              try {
                appDetail = electron.shell.readShortcutLink(filedir);
              } catch (e) {
              }
              if (!appDetail.target || appDetail.target.toLowerCase().indexOf("unin") >= 0)
                return;
              keyWords.push(path.basename(appDetail.target, ".exe"));
              if (isZhRegex.test(appName)) ;
              else {
                const firstLatter = appName.split(" ").map((name) => name[0]).join("");
                keyWords.push(firstLatter);
              }
              const icon = path.join(
                os.tmpdir(),
                "ProcessIcon",
                `${encodeURIComponent(appName)}.png`
              );
              const appInfo = {
                value: "plugin",
                desc: appDetail.target,
                type: "app",
                icon,
                pluginType: "app",
                action: `start "dummyclient" "${appDetail.target}"`,
                keyWords,
                name: appName,
                names: JSON.parse(JSON.stringify(keyWords))
              };
              fileLists.push(appInfo);
              getico(appInfo);
            }
            if (isDir) {
              fileDisplay(filedir);
            }
          }
        });
      });
    }
  });
}
const winSearch = () => {
  fileDisplay(filePath);
  fileDisplay(startMenu);
  return fileLists;
};
const app_paths = [
  "/usr/share/applications",
  "/var/lib/snapd/desktop/applications",
  `${process.env.HOME}/.local/share/applications`
];
const emptyIcon = "";
function dirAppRead(dir, target) {
  let files = null;
  try {
    if (!originfs.existsSync(dir)) return;
    files = originfs.readdirSync(dir);
  } catch (e) {
    return;
  }
  if (files.length !== 0) {
    for (const file of files) {
      const app = path.join(dir, file);
      path.extname(app) === ".desktop" && target.push(app);
    }
  }
}
function convertEntryFile2Feature(appPath2) {
  let appInfo = null;
  try {
    appInfo = originfs.readFileSync(appPath2, "utf8");
  } catch (e) {
    return null;
  }
  if (!appInfo.includes("[Desktop Entry]")) {
    return null;
  }
  appInfo = appInfo.substr(appInfo.indexOf("[Desktop Entry]")).replace("[Desktop Entry]", "").trim();
  const splitIndex = appInfo.indexOf("\n[");
  if (splitIndex > 0) {
    appInfo = appInfo.substr(0, splitIndex).trim();
  }
  const targetAppInfo = {};
  appInfo.match(/^[\w\-[\]]+ ?=.*$/gm).forEach((e) => {
    const index2 = e.indexOf("=");
    targetAppInfo[e.substr(0, index2).trim()] = e.substr(index2 + 1).trim();
  });
  if (targetAppInfo.Type !== "Application") {
    return null;
  }
  if (!targetAppInfo.Exec) {
    return null;
  }
  if (targetAppInfo.NoDisplay === "true" && !targetAppInfo.Exec.startsWith("gnome-control-center")) {
    return null;
  }
  let os2 = String(window.process.env.DESKTOP_SESSION).toLowerCase();
  if (os2 === "ubuntu") {
    os2 = "gnome";
    if (targetAppInfo.OnlyShowIn && !targetAppInfo.OnlyShowIn.toLowerCase().includes(os2)) {
      return null;
    }
  }
  if (targetAppInfo.NotShowIn && targetAppInfo.NotShowIn.toLowerCase().includes(os2)) {
    return null;
  }
  let icon = targetAppInfo.Icon;
  if (!icon) return null;
  if (icon.startsWith("/")) {
    if (!originfs.existsSync(icon)) return null;
  } else if (appPath2.startsWith("/usr/share/applications") || appPath2.startsWith("/var/lib/snapd/desktop/applications")) {
    icon = getIcon(icon);
  } else {
    if (!appPath2.startsWith(
      window.process.env.HOME + "/.local/share/applications"
    ))
      return null;
    appPath2 = path.join(
      window.process.env.HOME,
      ".local/share/icons",
      appPath2 + ".png"
    );
    originfs.existsSync(appPath2) || (appPath2 = emptyIcon);
  }
  let desc = "";
  const LANG = window.process.env.LANG.split(".")[0];
  if (`Comment[${LANG}]` in targetAppInfo) {
    desc = targetAppInfo[`Comment[${LANG}]`];
  } else if (targetAppInfo.Comment) {
    desc = targetAppInfo.Comment;
  } else {
    desc = appPath2;
  }
  let execPath = targetAppInfo.Exec.replace(/ %[A-Za-z]/g, "").replace(/"/g, "").trim();
  targetAppInfo.Terminal === "true" && (execPath = "gnome-terminal -x " + execPath);
  const info = {
    value: "plugin",
    pluginType: "app",
    desc,
    icon: "file://" + icon,
    keyWords: [targetAppInfo.Name],
    action: execPath
  };
  if ("X-Ubuntu-Gettext-Domain" in targetAppInfo) {
    const cmd = targetAppInfo["X-Ubuntu-Gettext-Domain"];
    cmd && cmd !== targetAppInfo.Name && info.keyWords.push(cmd);
  }
  return info;
}
function getIcon(filePath2) {
  const themes = [
    "ubuntu-mono-dark",
    "ubuntu-mono-light",
    "Yaru",
    "hicolor",
    "Adwaita",
    "Humanity"
  ];
  const sizes = ["48x48", "48", "scalable", "256x256", "512x512", "256", "512"];
  const types = [
    "apps",
    "categories",
    "devices",
    "mimetypes",
    "legacy",
    "actions",
    "places",
    "status",
    "mimes"
  ];
  const exts = [".png", ".svg"];
  for (const theme of themes) {
    for (const size of sizes) {
      for (const type2 of types) {
        for (const ext of exts) {
          let iconPath = path.join(
            "/usr/share/icons",
            theme,
            size,
            type2,
            filePath2 + ext
          );
          if (originfs.existsSync(iconPath)) return iconPath;
          iconPath = path.join(
            "/usr/share/icons",
            theme,
            type2,
            size,
            filePath2 + ext
          );
          if (originfs.existsSync(iconPath)) return iconPath;
        }
      }
    }
  }
  return originfs.existsSync(path.join("/usr/share/pixmaps", filePath2 + ".png")) ? path.join("/usr/share/pixmaps", filePath2 + ".png") : emptyIcon;
}
const linuxSearch = () => {
  const apps = [];
  const fileList = [];
  app_paths.forEach((dir) => {
    dirAppRead(dir, fileList);
  });
  fileList.forEach((e) => {
    apps.push(convertEntryFile2Feature(e));
  });
  return apps.filter((app) => !!app);
};
let appSearch;
if (commonConst.macOS()) {
  appSearch = darwinSearch;
} else if (commonConst.windows()) {
  appSearch = winSearch;
} else if (commonConst.linux()) {
  appSearch = linuxSearch;
}
const appSearch$1 = appSearch;
function getCopyFiles() {
  let fileInfo;
  if (commonConst.macOS()) {
    if (!electron.clipboard.has("NSFilenamesPboardType")) return null;
    const result = electron.clipboard.read("NSFilenamesPboardType");
    if (!result) return null;
    try {
      fileInfo = plist$1.parse(result);
    } catch (e) {
      return null;
    }
  } else if (process.platform === "win32") {
    try {
      const clipboardEx = require("electron-clipboard-ex");
      fileInfo = clipboardEx.readFilePaths();
    } catch (e) {
    }
  } else {
    if (!commonConst.linux()) return null;
    if (!electron.clipboard.has("text/uri-list")) return null;
    const result = electron.clipboard.read("text/uri-list").match(/^file:\/\/\/.*/gm);
    if (!result || !result.length) return null;
    fileInfo = result.map(
      (e) => decodeURIComponent(e).replace(/^file:\/\//, "")
    );
  }
  if (!Array.isArray(fileInfo)) return null;
  const target = fileInfo.map((p) => {
    if (!fs$1.existsSync(p)) return false;
    let info;
    try {
      info = originfs.lstatSync(p);
    } catch (e) {
      return false;
    }
    return {
      isFile: info.isFile(),
      isDirectory: info.isDirectory(),
      name: path.basename(p) || p,
      path: p
    };
  }).filter(Boolean);
  return target.length ? target : null;
}
const getLocalConfig = () => require("../initLocalConfig").default;
const activeStreams = /* @__PURE__ */ new Map();
class AIService {
  /**
   * 获取 AI 配置（完整，含 API Key）
   */
  async getAIConfig() {
    const localConfig2 = getLocalConfig();
    const config = await localConfig2.getConfig();
    return config?.perf?.ai || {
      providers: [],
      defaultProviderId: "",
      defaultModel: ""
    };
  }
  /**
   * 保存 AI 配置
   */
  async saveAIConfig(aiConfig) {
    const localConfig2 = getLocalConfig();
    const config = await localConfig2.getConfig();
    await localConfig2.setConfig({
      ...config,
      perf: {
        ...config.perf,
        ai: aiConfig
      }
    });
  }
  /**
   * 获取提供商列表（安全，不含 API Key）
   * 用于暴露给插件
   */
  async getProviders() {
    const config = await this.getAIConfig();
    return config.providers.map((provider) => ({
      id: provider.id,
      name: provider.name,
      type: provider.type,
      models: provider.models,
      enabled: provider.enabled
    }));
  }
  /**
   * 获取默认提供商和模型
   */
  async getDefaultConfig() {
    const config = await this.getAIConfig();
    return {
      providerId: config.defaultProviderId,
      model: config.defaultModel
    };
  }
  /**
   * 根据 ID 获取完整的提供商配置（含 API Key）
   */
  async getProviderById(providerId) {
    const config = await this.getAIConfig();
    return config.providers.find((p) => p.id === providerId) || null;
  }
  /**
   * 根据提供商配置创建 AI SDK 模型客户端
   */
  createModelClient(provider, model) {
    switch (provider.type) {
      case "openai": {
        const openai$1 = openai.createOpenAI({
          apiKey: provider.apiKey,
          baseURL: provider.baseUrl || void 0
        });
        return openai$1(model);
      }
      case "anthropic": {
        const anthropic$1 = anthropic.createAnthropic({
          apiKey: provider.apiKey,
          baseURL: provider.baseUrl || void 0
        });
        return anthropic$1(model);
      }
      case "google": {
        const google$1 = google.createGoogleGenerativeAI({
          apiKey: provider.apiKey,
          baseURL: provider.baseUrl || void 0
        });
        return google$1(model);
      }
      case "azure":
      case "openai-compatible":
      default: {
        if (!provider.baseUrl) {
          throw new Error(`提供商 ${provider.name} 需要配置 baseUrl`);
        }
        const compatible = openaiCompatible.createOpenAICompatible({
          name: provider.name,
          apiKey: provider.apiKey,
          baseURL: provider.baseUrl
        });
        return compatible(model);
      }
    }
  }
  /**
   * 转换消息格式为 AI SDK 格式
   */
  convertMessages(messages) {
    return messages.map((msg) => {
      if (typeof msg.content === "string") {
        return {
          role: msg.role,
          content: msg.content
        };
      }
      const parts = msg.content.map((part) => {
        if (part.type === "text") {
          return { type: "text", text: part.text };
        }
        if (part.type === "image") {
          return {
            type: "image",
            image: part.image,
            mimeType: part.mimeType
          };
        }
        return part;
      });
      return {
        role: msg.role,
        content: parts
      };
    });
  }
  /**
   * 代理 AI 聊天调用（非流式）
   */
  async chat(request) {
    const provider = await this.getProviderById(request.providerId);
    if (!provider) {
      return {
        success: false,
        error: `未找到 AI 提供商: ${request.providerId}`
      };
    }
    if (!provider.enabled) {
      return {
        success: false,
        error: `AI 提供商 ${provider.name} 已禁用`
      };
    }
    try {
      const modelClient = this.createModelClient(provider, request.model);
      const messages = this.convertMessages(request.messages);
      const result = await ai.generateText({
        model: modelClient,
        messages,
        temperature: request.temperature ?? 0.7,
        maxOutputTokens: request.maxTokens
      });
      const usage = result.usage;
      return {
        success: true,
        content: result.text,
        usage: usage ? {
          promptTokens: usage.inputTokens ?? usage.promptTokens ?? 0,
          completionTokens: usage.outputTokens ?? usage.completionTokens ?? 0,
          totalTokens: (usage.inputTokens ?? usage.promptTokens ?? 0) + (usage.outputTokens ?? usage.completionTokens ?? 0)
        } : void 0
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
  /**
   * 流式 AI 聊天调用
   * 返回一个异步生成器，支持取消
   */
  async *chatStream(request, requestId) {
    const provider = await this.getProviderById(request.providerId);
    if (!provider) {
      yield { type: "error", error: `未找到 AI 提供商: ${request.providerId}` };
      return;
    }
    if (!provider.enabled) {
      yield { type: "error", error: `AI 提供商 ${provider.name} 已禁用` };
      return;
    }
    const abortController = new AbortController();
    if (requestId) {
      activeStreams.set(requestId, abortController);
    }
    try {
      yield { type: "start" };
      const modelClient = this.createModelClient(provider, request.model);
      const messages = this.convertMessages(request.messages);
      const result = ai.streamText({
        model: modelClient,
        messages,
        temperature: request.temperature ?? 0.7,
        maxOutputTokens: request.maxTokens,
        abortSignal: abortController.signal
      });
      for await (const textPart of result.textStream) {
        if (abortController.signal.aborted) {
          yield { type: "error", error: "请求已取消" };
          return;
        }
        if (textPart) {
          yield { type: "delta", content: textPart };
        }
      }
      const usage = await result.usage;
      if (usage) {
        yield {
          type: "usage",
          usage: {
            promptTokens: usage.inputTokens ?? usage.promptTokens ?? 0,
            completionTokens: usage.outputTokens ?? usage.completionTokens ?? 0,
            totalTokens: (usage.inputTokens ?? usage.promptTokens ?? 0) + (usage.outputTokens ?? usage.completionTokens ?? 0)
          }
        };
      }
      yield { type: "done" };
    } catch (error) {
      if (abortController.signal.aborted) {
        yield { type: "error", error: "请求已取消" };
      } else {
        yield {
          type: "error",
          error: error instanceof Error ? error.message : String(error)
        };
      }
    } finally {
      if (requestId) {
        activeStreams.delete(requestId);
      }
    }
  }
  /**
   * 取消流式请求
   */
  cancelStream(requestId) {
    const controller = activeStreams.get(requestId);
    if (controller) {
      controller.abort();
      activeStreams.delete(requestId);
      return true;
    }
    return false;
  }
}
const aiService = new AIService();
class FileSystemService {
  /**
   * 读取文件内容
   */
  async readFile(filePath2, encoding = "utf-8") {
    const absolutePath = path.resolve(filePath2);
    return fs$1.promises.readFile(absolutePath, { encoding });
  }
  /**
   * 写入文件内容（自动创建目录）
   */
  async writeFile(filePath2, content) {
    const absolutePath = path.resolve(filePath2);
    const dir = path.dirname(absolutePath);
    await fs$1.promises.mkdir(dir, { recursive: true });
    await fs$1.promises.writeFile(absolutePath, content, "utf-8");
  }
  /**
   * 删除文件
   */
  async deleteFile(filePath2) {
    const absolutePath = path.resolve(filePath2);
    await fs$1.promises.unlink(absolutePath);
  }
  /**
   * 重命名/移动文件
   */
  async renameFile(oldPath, newPath) {
    const absoluteOldPath = path.resolve(oldPath);
    const absoluteNewPath = path.resolve(newPath);
    const dir = path.dirname(absoluteNewPath);
    await fs$1.promises.mkdir(dir, { recursive: true });
    await fs$1.promises.rename(absoluteOldPath, absoluteNewPath);
  }
  /**
   * 检查文件是否存在
   */
  async exists(filePath2) {
    const absolutePath = path.resolve(filePath2);
    try {
      await fs$1.promises.access(absolutePath);
      return true;
    } catch {
      return false;
    }
  }
  /**
   * 读取目录内容
   */
  async readDir(dirPath) {
    const absolutePath = path.resolve(dirPath);
    const entries = await fs$1.promises.readdir(absolutePath, { withFileTypes: true });
    const result = [];
    for (const entry of entries) {
      const entryPath = path.join(absolutePath, entry.name);
      try {
        const stats = await fs$1.promises.stat(entryPath);
        result.push({
          name: entry.name,
          path: entryPath,
          isDirectory: entry.isDirectory(),
          size: stats.size,
          modifiedAt: stats.mtime.toISOString()
        });
      } catch {
      }
    }
    return result;
  }
  /**
   * 递归读取目录树
   */
  async readDirRecursive(dirPath, options = {}) {
    const { maxDepth = 10, excludePatterns = ["node_modules", ".git", "dist", "build"] } = options;
    const absolutePath = path.resolve(dirPath);
    const result = [];
    const walk = async (currentPath, depth) => {
      if (depth > maxDepth) return;
      try {
        const entries = await fs$1.promises.readdir(currentPath, { withFileTypes: true });
        for (const entry of entries) {
          if (excludePatterns.some((pattern) => entry.name === pattern || entry.name.startsWith("."))) {
            continue;
          }
          const entryPath = path.join(currentPath, entry.name);
          const relativePath = path.relative(absolutePath, entryPath);
          try {
            const stats = await fs$1.promises.stat(entryPath);
            result.push({
              name: entry.name,
              path: entryPath,
              relativePath,
              isDirectory: entry.isDirectory(),
              size: stats.size
            });
            if (entry.isDirectory()) {
              await walk(entryPath, depth + 1);
            }
          } catch {
          }
        }
      } catch {
      }
    };
    await walk(absolutePath, 0);
    return result;
  }
  /**
   * 创建目录
   */
  async mkdir(dirPath) {
    const absolutePath = path.resolve(dirPath);
    await fs$1.promises.mkdir(absolutePath, { recursive: true });
  }
  /**
   * 删除目录（递归）
   */
  async rmdir(dirPath) {
    const absolutePath = path.resolve(dirPath);
    await fs$1.promises.rm(absolutePath, { recursive: true, force: true });
  }
  /**
   * 获取文件信息
   */
  async stat(filePath2) {
    const absolutePath = path.resolve(filePath2);
    const stats = await fs$1.promises.stat(absolutePath);
    return {
      size: stats.size,
      isDirectory: stats.isDirectory(),
      isFile: stats.isFile(),
      createdAt: stats.birthtime.toISOString(),
      modifiedAt: stats.mtime.toISOString()
    };
  }
  /**
   * 复制文件
   */
  async copyFile(srcPath, destPath) {
    const absoluteSrc = path.resolve(srcPath);
    const absoluteDest = path.resolve(destPath);
    const dir = path.dirname(absoluteDest);
    await fs$1.promises.mkdir(dir, { recursive: true });
    await fs$1.promises.copyFile(absoluteSrc, absoluteDest);
  }
}
const fsService = new FileSystemService();
class ProcessService {
  processes = /* @__PURE__ */ new Map();
  /**
   * 启动进程
   */
  spawn(options) {
    const { id, command, args = [], cwd, env, maxOutputLines = 100 } = options;
    if (this.processes.has(id)) {
      return { success: false, error: `进程 ${id} 已存在` };
    }
    try {
      const childProcess = child_process.spawn(command, args, {
        cwd: path.resolve(cwd),
        env: { ...process.env, ...env },
        shell: true,
        stdio: ["pipe", "pipe", "pipe"]
      });
      const managed = {
        id,
        process: childProcess,
        cwd,
        command,
        args,
        startedAt: (/* @__PURE__ */ new Date()).toISOString(),
        output: [],
        maxOutputLines
      };
      childProcess.stdout?.on("data", (data) => {
        const lines = data.toString().split("\n").filter((l) => l.trim());
        for (const line of lines) {
          managed.output.push(`[stdout] ${line}`);
          if (managed.output.length > managed.maxOutputLines) {
            managed.output.shift();
          }
        }
      });
      childProcess.stderr?.on("data", (data) => {
        const lines = data.toString().split("\n").filter((l) => l.trim());
        for (const line of lines) {
          managed.output.push(`[stderr] ${line}`);
          if (managed.output.length > managed.maxOutputLines) {
            managed.output.shift();
          }
        }
      });
      childProcess.on("exit", (code2) => {
        managed.output.push(`[exit] 进程退出，代码: ${code2}`);
      });
      childProcess.on("error", (err) => {
        managed.output.push(`[error] ${err.message}`);
      });
      this.processes.set(id, managed);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
  /**
   * 停止进程
   */
  kill(id) {
    const managed = this.processes.get(id);
    if (!managed) {
      return { success: false, error: `进程 ${id} 不存在` };
    }
    try {
      if (process.platform === "win32") {
        child_process.exec(`taskkill /pid ${managed.process.pid} /T /F`);
      } else {
        managed.process.kill("SIGTERM");
        setTimeout(() => {
          if (!managed.process.killed) {
            managed.process.kill("SIGKILL");
          }
        }, 3e3);
      }
      this.processes.delete(id);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
  /**
   * 获取进程状态
   */
  getStatus(id) {
    const managed = this.processes.get(id);
    if (!managed) {
      return { exists: false };
    }
    return {
      exists: true,
      running: !managed.process.killed && managed.process.exitCode === null,
      pid: managed.process.pid,
      cwd: managed.cwd,
      command: `${managed.command} ${managed.args.join(" ")}`,
      startedAt: managed.startedAt,
      output: managed.output.slice(-50)
      // 返回最后 50 行
    };
  }
  /**
   * 列出所有进程
   */
  list() {
    const result = [];
    for (const [id, managed] of this.processes) {
      result.push({
        id,
        running: !managed.process.killed && managed.process.exitCode === null,
        pid: managed.process.pid,
        command: `${managed.command} ${managed.args.join(" ")}`,
        startedAt: managed.startedAt
      });
    }
    return result;
  }
  /**
   * 停止所有进程
   */
  killAll() {
    for (const id of this.processes.keys()) {
      this.kill(id);
    }
  }
  /**
   * 向进程发送输入
   */
  write(id, input) {
    const managed = this.processes.get(id);
    if (!managed) {
      return { success: false, error: `进程 ${id} 不存在` };
    }
    try {
      managed.process.stdin?.write(input);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
}
const processService = new ProcessService();
const winPosition = {
  x: 0,
  y: 0,
  id: -1,
  getPosition() {
    const { x, y } = electron.screen.getCursorScreenPoint();
    const currentDisplay = electron.screen.getDisplayNearestPoint({ x, y });
    if (winPosition.id !== currentDisplay.id) {
      winPosition.id = currentDisplay.id;
      winPosition.x = parseInt(
        String(
          currentDisplay.workArea.x + currentDisplay.workArea.width / 2 - 400
        )
      );
      winPosition.y = parseInt(
        String(
          currentDisplay.workArea.y + currentDisplay.workArea.height / 2 - 200
        )
      );
    }
    return {
      x: winPosition.x,
      y: winPosition.y
    };
  },
  setPosition(x, y) {
    winPosition.x = x;
    winPosition.y = y;
  }
};
const DROPFILES_HEADER_SIZE = 20;
let clipboardExModule = null;
const ensureClipboardEx = () => {
  if (process.platform !== "win32") return null;
  if (clipboardExModule) return clipboardExModule;
  try {
    clipboardExModule = require("electron-clipboard-ex");
  } catch {
    clipboardExModule = null;
  }
  return clipboardExModule;
};
const buildWindowsFileListPayload = (files) => Buffer.from(`${files.join("\0")}\0\0`, "utf16le");
const buildWindowsFileDropBuffer = (files) => {
  const payload = buildWindowsFileListPayload(files);
  const header = Buffer.alloc(DROPFILES_HEADER_SIZE);
  header.writeUInt32LE(DROPFILES_HEADER_SIZE, 0);
  header.writeInt32LE(0, 4);
  header.writeInt32LE(0, 8);
  header.writeUInt32LE(0, 12);
  header.writeUInt32LE(1, 16);
  const result = Buffer.alloc(header.length + payload.length);
  for (let i = 0; i < header.length; i += 1) {
    result[i] = header[i];
  }
  for (let i = 0; i < payload.length; i += 1) {
    result[header.length + i] = payload[i];
  }
  return result;
};
const buildDropEffectBuffer = (effect = "copy") => {
  const effectMap = {
    copy: 1,
    move: 2,
    link: 4
  };
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(effectMap[effect], 0);
  return buffer;
};
const writeWindowsBuffers = (files) => {
  try {
    electron.clipboard.writeBuffer("CF_HDROP", buildWindowsFileDropBuffer(files));
    electron.clipboard.writeBuffer("FileNameW", buildWindowsFileListPayload(files));
    electron.clipboard.writeBuffer("Preferred DropEffect", buildDropEffectBuffer("copy"));
    return electron.clipboard.readBuffer("CF_HDROP").length > 0;
  } catch {
    return false;
  }
};
const writeWithClipboardEx = (files) => {
  const clipboardEx = ensureClipboardEx();
  if (!clipboardEx) return false;
  try {
    clipboardEx.writeFilePaths(files);
    if (typeof clipboardEx.readFilePaths === "function") {
      const result = clipboardEx.readFilePaths();
      return Array.isArray(result) && result.length === files.length;
    }
    return true;
  } catch {
    return false;
  }
};
const copyFilesToWindowsClipboard = (files) => {
  const normalizedFiles = files.map((filePath2) => path.normalize(filePath2)).filter(Boolean);
  if (!normalizedFiles.length) return false;
  if (writeWithClipboardEx(normalizedFiles)) {
    return true;
  }
  return writeWindowsBuffers(normalizedFiles);
};
const sanitizeInputFiles = (input) => {
  const candidates = Array.isArray(input) ? input : typeof input === "string" ? [input] : [];
  return candidates.map((filePath2) => typeof filePath2 === "string" ? filePath2.trim() : "").filter((filePath2) => {
    if (!filePath2) return false;
    try {
      return fs$1.existsSync(filePath2);
    } catch {
      return false;
    }
  });
};
const runnerInstance = runner();
const detachInstance = detach();
class API extends DBInstance {
  init(mainWindow) {
    electron.ipcMain.on("msg-trigger", async (event, arg) => {
      const window2 = arg.winId ? electron.BrowserWindow.fromId(arg.winId) : mainWindow;
      const data = await this[arg.type](arg, window2, event);
      event.returnValue = data;
    });
    mainWindow.webContents.on(
      "before-input-event",
      (event, input) => this.__EscapeKeyDown(event, input, mainWindow)
    );
    this.setupMainWindowHooks(mainWindow);
  }
  setupMainWindowHooks(mainWindow) {
    mainWindow.on("show", () => {
      runnerInstance.executeHooks("Show", null);
    });
    mainWindow.on("hide", () => {
      runnerInstance.executeHooks("Hide", null);
    });
  }
  getCurrentWindow = (window2, e) => {
    let originWindow = electron.BrowserWindow.fromWebContents(e.sender);
    if (originWindow !== window2) originWindow = detachInstance.getWindow();
    return originWindow;
  };
  __EscapeKeyDown = (event, input, window2) => {
    if (input.type !== "keyDown") return;
    if (!(input.meta || input.control || input.shift || input.alt)) {
      if (input.key === "Escape") {
        if (this.currentPlugin) {
          this.removePlugin(null, window2);
        } else {
          index.windowCreator.getWindow().hide();
        }
      }
      return;
    }
  };
  windowMoving({ data: { mouseX, mouseY, width, height } }, window2, e) {
    const { x, y } = electron.screen.getCursorScreenPoint();
    const originWindow = this.getCurrentWindow(window2, e);
    if (!originWindow) return;
    originWindow.setBounds({ x: x - mouseX, y: y - mouseY, width, height });
    winPosition.setPosition(x - mouseX, y - mouseY);
  }
  loadPlugin({ data: plugin }, window2) {
    window2.webContents.executeJavaScript(
      `window.loadPlugin(${JSON.stringify(plugin)})`
    );
    this.openPlugin({ data: plugin }, window2);
  }
  openPlugin({ data: plugin }, window2) {
    if (plugin.platform && !plugin.platform.includes(process.platform)) {
      return new electron.Notification({
        title: `插件不支持当前 ${process.platform} 系统`,
        body: `插件仅支持 ${plugin.platform.join(",")}`,
        icon: plugin.logo
      }).show();
    }
    window2.setSize(window2.getSize()[0], 60);
    this.removePlugin(null, window2);
    if (!plugin.main) {
      plugin.tplPath = `file://${resolveStatic("tpl/index.html")}`;
    }
    if (plugin.name === "rubick-system-feature") {
      plugin.logo = plugin.logo || `file://${resolveStatic("logo.png")}`;
      plugin.indexPath = `file://${resolveStatic("feature/index.html")}`;
    } else if (!plugin.indexPath) {
      const pluginPath = path.resolve(PLUGIN_INSTALL_DIR, "node_modules", plugin.name);
      plugin.indexPath = `file://${path.join(
        pluginPath,
        "./",
        plugin.main || ""
      )}`;
    }
    runnerInstance.init(plugin, window2);
    this.currentPlugin = plugin;
    window2.webContents.executeJavaScript(
      `window.setCurrentPlugin(${JSON.stringify({
        currentPlugin: this.currentPlugin
      })})`
    );
    window2.show();
    const view = runnerInstance.getView();
    if (!view.inited) {
      view.webContents.on(
        "before-input-event",
        (event, input) => this.__EscapeKeyDown(event, input, window2)
      );
    }
  }
  removePlugin(e, window2) {
    runnerInstance.removeView(window2);
    this.currentPlugin = null;
  }
  openPluginDevTools() {
    runnerInstance.getView().webContents.openDevTools({ mode: "detach" });
  }
  hideMainWindow(arg, window2) {
    window2.hide();
  }
  showMainWindow(arg, window2) {
    window2.show();
  }
  showOpenDialog({ data }, window2) {
    return electron.dialog.showOpenDialogSync(window2, data);
  }
  showSaveDialog({ data }, window2) {
    return electron.dialog.showSaveDialogSync(window2, data);
  }
  setExpendHeight({ data: height }, window2, e) {
    const originWindow = this.getCurrentWindow(window2, e);
    if (!originWindow) return;
    const targetHeight = height;
    originWindow.setSize(originWindow.getSize()[0], targetHeight);
    const screenPoint = electron.screen.getCursorScreenPoint();
    const display = electron.screen.getDisplayNearestPoint(screenPoint);
    const position2 = originWindow.getPosition()[1] + targetHeight > display.bounds.height ? height - 60 : 0;
    originWindow.webContents.executeJavaScript(
      `window.setPosition && typeof window.setPosition === "function" && window.setPosition(${position2})`
    );
  }
  setSubInput({ data }, window2, e) {
    const originWindow = this.getCurrentWindow(window2, e);
    if (!originWindow) return;
    originWindow.webContents.executeJavaScript(
      `window.setSubInput(${JSON.stringify({
        placeholder: data.placeholder
      })})`
    );
  }
  subInputBlur() {
    runnerInstance.getView().webContents.focus();
  }
  sendSubInputChangeEvent({ data }) {
    runnerInstance.executeHooks("SubInputChange", data);
  }
  removeSubInput(data, window2, e) {
    const originWindow = this.getCurrentWindow(window2, e);
    if (!originWindow) return;
    originWindow.webContents.executeJavaScript(`window.removeSubInput()`);
  }
  setSubInputValue({ data }, window2, e) {
    const originWindow = this.getCurrentWindow(window2, e);
    if (!originWindow) return;
    originWindow.webContents.executeJavaScript(
      `window.setSubInputValue(${JSON.stringify({
        value: data.text
      })})`
    );
    this.sendSubInputChangeEvent({ data });
  }
  getPath({ data }) {
    return electron.app.getPath(data.name);
  }
  showNotification({ data: { body } }) {
    if (!electron.Notification.isSupported()) return;
    "string" != typeof body && (body = String(body));
    const plugin = this.currentPlugin;
    const notify = new electron.Notification({
      title: plugin ? plugin.pluginName : null,
      body,
      icon: plugin ? plugin.logo : null
    });
    notify.show();
  }
  copyImage = ({ data }) => {
    const image = electron.nativeImage.createFromDataURL(data.img);
    electron.clipboard.writeImage(image);
  };
  copyText({ data }) {
    electron.clipboard.writeText(String(data.text));
    return true;
  }
  copyFile({ data }) {
    const targetFiles = sanitizeInputFiles(data?.file);
    if (!targetFiles.length) {
      return false;
    }
    if (process.platform === "darwin") {
      try {
        electron.clipboard.writeBuffer(
          "NSFilenamesPboardType",
          Buffer.from(plist$1.build(targetFiles))
        );
        return true;
      } catch {
        return false;
      }
    }
    if (process.platform === "win32") {
      return copyFilesToWindowsClipboard(targetFiles);
    }
    return false;
  }
  getFeatures() {
    return this.currentPlugin?.features;
  }
  setFeature({ data }, window2) {
    this.currentPlugin = {
      ...this.currentPlugin,
      features: (() => {
        let has = false;
        this.currentPlugin.features.some((feature) => {
          has = feature.code === data.feature.code;
          return has;
        });
        if (!has) {
          return [...this.currentPlugin.features, data.feature];
        }
        return this.currentPlugin.features;
      })()
    };
    window2.webContents.executeJavaScript(
      `window.updatePlugin(${JSON.stringify({
        currentPlugin: this.currentPlugin
      })})`
    );
    return true;
  }
  removeFeature({ data }, window2) {
    this.currentPlugin = {
      ...this.currentPlugin,
      features: this.currentPlugin.features.filter((feature) => {
        if (data.code.type) {
          return feature.code.type !== data.code.type;
        }
        return feature.code !== data.code;
      })
    };
    window2.webContents.executeJavaScript(
      `window.updatePlugin(${JSON.stringify({
        currentPlugin: this.currentPlugin
      })})`
    );
    return true;
  }
  sendPluginSomeKeyDownEvent({ data: { modifiers, keyCode } }) {
    const code2 = DECODE_KEY[keyCode];
    if (!code2 || !runnerInstance.getView()) return;
    if (modifiers.length > 0) {
      runnerInstance.getView().webContents.sendInputEvent({
        type: "keyDown",
        modifiers,
        keyCode: code2
      });
    } else {
      runnerInstance.getView().webContents.sendInputEvent({
        type: "keyDown",
        keyCode: code2
      });
    }
  }
  detachPlugin(e, window2) {
    if (!this.currentPlugin) return;
    const view = window2.getBrowserView();
    window2.setBrowserView(null);
    window2.webContents.executeJavaScript(`window.getMainInputInfo()`).then((res) => {
      detachInstance.init(
        {
          ...this.currentPlugin,
          subInput: res
        },
        window2.getBounds(),
        view
      );
      window2.webContents.executeJavaScript(`window.initRubick()`);
      window2.setSize(window2.getSize()[0], 60);
      this.currentPlugin = null;
    });
  }
  detachInputChange({ data }) {
    this.sendSubInputChangeEvent({ data });
  }
  getLocalId() {
    return encodeURIComponent(electron.app.getPath("home"));
  }
  shellShowItemInFolder({ data }) {
    electron.shell.showItemInFolder(data.path);
    return true;
  }
  async getFileIcon({ data }) {
    const nativeImage2 = await electron.app.getFileIcon(data.path, { size: "normal" });
    return nativeImage2.toDataURL();
  }
  shellBeep() {
    electron.shell.beep();
    return true;
  }
  screenCapture(arg, window2) {
    screenCapture(window2, (img) => {
      runnerInstance.executeHooks("ScreenCapture", {
        data: img
      });
    });
  }
  getCopyFiles() {
    return getCopyFiles();
  }
  simulateKeyboardTap({ data: { key, modifier } }) {
    let keys = [key.toLowerCase()];
    if (modifier && Array.isArray(modifier) && modifier.length > 0) {
      keys = modifier.concat(keys);
      ks.sendCombination(keys);
    } else {
      ks.sendKeys(keys);
    }
  }
  addLocalStartPlugin({ data: { plugin } }, window2) {
    window2.webContents.executeJavaScript(
      `window.addLocalStartPlugin(${JSON.stringify({
        plugin
      })})`
    );
  }
  removeLocalStartPlugin({ data: { plugin } }, window2) {
    window2.webContents.executeJavaScript(
      `window.removeLocalStartPlugin(${JSON.stringify({
        plugin
      })})`
    );
  }
  // ==================== AI 相关 IPC 方法 ====================
  /**
   * 获取 AI 提供商列表（不含 API Key，安全暴露给插件）
   */
  async getAIProviders() {
    return await aiService.getProviders();
  }
  /**
   * 获取默认 AI 提供商和模型配置
   */
  async getAIDefaultConfig() {
    return await aiService.getDefaultConfig();
  }
  /**
   * AI 聊天调用（同步，非流式）
   * 插件传入提供商ID、模型、消息，由 rubick 代理调用
   */
  async aiChat({ data }) {
    return await aiService.chat(data);
  }
  /**
   * AI 流式聊天调用
   * 通过事件推送流式响应给插件
   */
  async aiChatStream({ data }, window2, event) {
    const requestId = Date.now().toString(36) + Math.random().toString(36);
    (async () => {
      try {
        for await (const chunk of aiService.chatStream(data, requestId)) {
          event.sender.send("ai-stream-event", {
            requestId,
            ...chunk
          });
        }
      } catch (error) {
        event.sender.send("ai-stream-event", {
          requestId,
          type: "error",
          error: error instanceof Error ? error.message : String(error)
        });
      }
    })();
    return { requestId };
  }
  /**
   * 取消 AI 流式聊天请求
   */
  aiChatCancel({ data }) {
    return aiService.cancelStream(data.requestId);
  }
  // ==================== 文件系统 IPC 方法 ====================
  /**
   * 读取文件内容
   */
  async fsReadFile({ data }) {
    try {
      const content = await fsService.readFile(data.path, data.encoding || "utf-8");
      return { success: true, content };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
  /**
   * 写入文件内容
   */
  async fsWriteFile({ data }) {
    try {
      await fsService.writeFile(data.path, data.content);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
  /**
   * 删除文件
   */
  async fsDeleteFile({ data }) {
    try {
      await fsService.deleteFile(data.path);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
  /**
   * 重命名/移动文件
   */
  async fsRenameFile({ data }) {
    try {
      await fsService.renameFile(data.oldPath, data.newPath);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
  /**
   * 检查文件是否存在
   */
  async fsExists({ data }) {
    try {
      const exists2 = await fsService.exists(data.path);
      return { success: true, exists: exists2 };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
  /**
   * 读取目录内容
   */
  async fsReadDir({ data }) {
    try {
      const entries = await fsService.readDir(data.path);
      return { success: true, entries };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
  /**
   * 递归读取目录树
   */
  async fsReadDirRecursive({ data }) {
    try {
      const entries = await fsService.readDirRecursive(data.path, {
        maxDepth: data.maxDepth,
        excludePatterns: data.excludePatterns
      });
      return { success: true, entries };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
  /**
   * 创建目录
   */
  async fsMkdir({ data }) {
    try {
      await fsService.mkdir(data.path);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
  /**
   * 删除目录
   */
  async fsRmdir({ data }) {
    try {
      await fsService.rmdir(data.path);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
  /**
   * 获取文件信息
   */
  async fsStat({ data }) {
    try {
      const stat = await fsService.stat(data.path);
      return { success: true, stat };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
  /**
   * 复制文件
   */
  async fsCopyFile({ data }) {
    try {
      await fsService.copyFile(data.srcPath, data.destPath);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
  // ==================== 进程管理 IPC 方法 ====================
  /**
   * 启动进程
   */
  processSpawn({ data }) {
    return processService.spawn(data);
  }
  /**
   * 停止进程
   */
  processKill({ data }) {
    return processService.kill(data.id);
  }
  /**
   * 获取进程状态
   */
  processStatus({ data }) {
    return processService.getStatus(data.id);
  }
  /**
   * 列出所有进程
   */
  processList() {
    return processService.list();
  }
  /**
   * 向进程发送输入
   */
  processWrite({ data }) {
    return processService.write(data.id, data.input);
  }
}
const API$1 = new API();
const version$1 = "4.3.7";
const pkg = {
  version: version$1
};
function createTray(window2) {
  return new Promise((resolve) => {
    let icon;
    if (commonConst.macOS()) {
      icon = "./icons/iconTemplate@2x.png";
    } else if (commonConst.windows()) {
      icon = parseInt(os.release()) < 10 ? "./icons/icon@2x.png" : "./icons/icon.ico";
    } else {
      icon = "./icons/icon@2x.png";
    }
    const appIcon = new electron.Tray(resolveStatic(icon));
    const openSettings = () => {
      window2.webContents.executeJavaScript(
        `window.rubick && window.rubick.openMenu && window.rubick.openMenu({ code: "settings" })`
      );
      window2.show();
    };
    const createContextMenu = () => electron.Menu.buildFromTemplate([
      {
        label: "帮助文档",
        click: () => {
          process.nextTick(() => {
            electron.shell.openExternal("https://github.com/clouDr-f2e/rubick");
          });
        }
      },
      {
        label: "引导教学",
        click: () => {
          guide().init();
        }
      },
      {
        label: "意见反馈",
        click: () => {
          process.nextTick(() => {
            electron.shell.openExternal("https://github.com/clouDr-f2e/rubick/issues");
          });
        }
      },
      { type: "separator" },
      {
        label: "显示",
        click() {
          window2.show();
        }
      },
      {
        label: "系统设置",
        click() {
          openSettings();
        }
      },
      { type: "separator" },
      {
        role: "quit",
        label: "退出"
      },
      {
        label: "重启",
        click() {
          electron.app.relaunch();
          electron.app.quit();
        }
      },
      { type: "separator" },
      {
        label: "关于",
        click() {
          electron.dialog.showMessageBox({
            title: "拉比克",
            message: "极简、插件化的现代桌面软件",
            detail: `Version: ${pkg.version}
Author: muwoo`
          });
        }
      }
    ]);
    appIcon.on("click", () => {
      appIcon.setContextMenu(createContextMenu());
      appIcon.popUpContextMenu();
    });
    appIcon.setContextMenu(createContextMenu());
    resolve(appIcon);
  });
}
const registerHotKey = (mainWindow) => {
  const setAutoLogin = async () => {
    const config = await localConfig.getConfig();
    if (electron.app.getLoginItemSettings().openAtLogin !== config.perf.common.start) {
      electron.app.setLoginItemSettings({
        openAtLogin: config.perf.common.start,
        openAsHidden: true
      });
    }
  };
  const setTheme = async () => {
    mainWindow.webContents.executeJavaScript(`window.rubick.changeTheme()`);
    mainWindow.getBrowserViews().forEach((view) => {
      view.webContents.executeJavaScript(`window.rubick.changeTheme()`);
    });
  };
  const setDarkMode = async () => {
    const config = await localConfig.getConfig();
    const isDark = config.perf.common.darkMode;
    if (isDark) {
      electron.nativeTheme.themeSource = "dark";
      mainWindow.webContents.executeJavaScript(
        `document.body.classList.add("dark");window.rubick.theme="dark"`
      );
      mainWindow.getBrowserViews().forEach((view) => {
        view.webContents.executeJavaScript(
          `document.body.classList.add("dark");window.rubick.theme="dark"`
        );
      });
    } else {
      electron.nativeTheme.themeSource = "light";
      mainWindow.webContents.executeJavaScript(
        `document.body.classList.remove("dark");window.rubick.theme="light"`
      );
      mainWindow.getBrowserViews().forEach((view) => {
        view.webContents.executeJavaScript(
          `document.body.classList.remove("dark");window.rubick.theme="light"`
        );
      });
    }
  };
  function mainWindowPopUp() {
    const currentShow = mainWindow.isVisible() && mainWindow.isFocused();
    if (currentShow) return mainWindow.hide();
    const { x: wx, y: wy } = winPosition.getPosition();
    mainWindow.setAlwaysOnTop(false);
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    mainWindow.focus();
    mainWindow.setVisibleOnAllWorkspaces(false, {
      visibleOnFullScreen: true
    });
    mainWindow.setPosition(wx, wy);
    mainWindow.show();
  }
  const init = async () => {
    await setAutoLogin();
    await setDarkMode();
    await setTheme();
    const config = await localConfig.getConfig();
    electron.globalShortcut.unregisterAll();
    const doublePressShortcuts = ["Ctrl+Ctrl", "Option+Option", "Shift+Shift", "Command+Command"];
    const isDoublePressShortcut = doublePressShortcuts.includes(config.perf.shortCut.showAndHidden);
    if (isDoublePressShortcut) ;
    else {
      electron.globalShortcut.register(config.perf.shortCut.showAndHidden, () => {
        mainWindowPopUp();
      });
    }
    electron.globalShortcut.register(config.perf.shortCut.capture, () => {
      screenCapture(mainWindow, (data) => {
        data && new electron.Notification({
          title: "截图完成",
          body: "截图已存储到系统剪贴板中"
        }).show();
      });
    });
    electron.globalShortcut.register(config.perf.shortCut.quit, () => {
    });
    mainWindow.webContents.on("before-input-event", (event, input) => {
      if (input.key.toLowerCase() === "w" && (input.control || input.meta) && !input.alt && !input.shift) {
        event.preventDefault();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.hide();
        }
      }
    });
    config.global.forEach((sc) => {
      if (!sc.key || !sc.value) return;
      electron.globalShortcut.register(sc.key, () => {
        mainWindow.webContents.send("global-short-key", sc.value);
      });
    });
  };
  uIOhookRegister(mainWindowPopUp);
  init();
  electron.ipcMain.on("re-register", () => {
    init();
  });
};
function uIOhookRegister(callback) {
  let lastModifierPress = Date.now();
  uiohookNapi.uIOhook.on("keydown", async (uio_event) => {
    const config = await localConfig.getConfig();
    if (![
      "Ctrl+Ctrl",
      "Option+Option",
      "Shift+Shift",
      "Command+Command"
    ].includes(config.perf.shortCut.showAndHidden)) {
      return;
    }
    const modifers = config.perf.shortCut.showAndHidden.split("+");
    const showAndHiddenKeyStr = modifers.pop();
    const keyStr2uioKeyCode = {
      Ctrl: uiohookNapi.UiohookKey.Ctrl,
      Shift: uiohookNapi.UiohookKey.Shift,
      Option: uiohookNapi.UiohookKey.Alt,
      Command: uiohookNapi.UiohookKey.Comma
    };
    if (uio_event.keycode === keyStr2uioKeyCode[showAndHiddenKeyStr]) {
      const currentTime = Date.now();
      if (currentTime - lastModifierPress < 300) {
        callback();
      }
      lastModifierPress = currentTime;
    }
  });
  uiohookNapi.uIOhook.start();
}
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
const configPath = path.join(PLUGIN_INSTALL_DIR, "./rubick-local-plugin.json");
let registry;
let pluginInstance;
(async () => {
  try {
    const res = await API$1.dbGet({
      data: {
        id: "rubick-localhost-config"
      }
    });
    registry = res && res.data.register;
    pluginInstance = new AdapterHandler({
      baseDir: PLUGIN_INSTALL_DIR,
      registry
    });
  } catch (e) {
    pluginInstance = new AdapterHandler({
      baseDir: PLUGIN_INSTALL_DIR,
      registry
    });
  }
})();
global.LOCAL_PLUGINS = {
  PLUGINS: [],
  async downloadPlugin(plugin) {
    await pluginInstance.install([plugin.name], { isDev: plugin.isDev });
    if (plugin.isDev) {
      const pluginPath = path.resolve(PLUGIN_INSTALL_DIR, "node_modules", plugin.name);
      const pluginInfo = JSON.parse(
        fs$1.readFileSync(path.join(pluginPath, "./package.json"), "utf8")
      );
      plugin = {
        ...plugin,
        ...pluginInfo
      };
    }
    global.LOCAL_PLUGINS.addPlugin(plugin);
    return global.LOCAL_PLUGINS.PLUGINS;
  },
  refreshPlugin(plugin) {
    const pluginPath = path.resolve(PLUGIN_INSTALL_DIR, "node_modules", plugin.name);
    const pluginInfo = JSON.parse(
      fs$1.readFileSync(path.join(pluginPath, "./package.json"), "utf8")
    );
    plugin = {
      ...plugin,
      ...pluginInfo
    };
    let currentPlugins = global.LOCAL_PLUGINS.getLocalPlugins();
    currentPlugins = currentPlugins.map((p) => {
      if (p.name === plugin.name) {
        return plugin;
      }
      return p;
    });
    global.LOCAL_PLUGINS.PLUGINS = currentPlugins;
    fs$1.writeFileSync(configPath, JSON.stringify(currentPlugins));
    return global.LOCAL_PLUGINS.PLUGINS;
  },
  getLocalPlugins() {
    try {
      if (!global.LOCAL_PLUGINS.PLUGINS.length) {
        global.LOCAL_PLUGINS.PLUGINS = JSON.parse(
          fs$1.readFileSync(configPath, "utf-8")
        );
      }
      return global.LOCAL_PLUGINS.PLUGINS;
    } catch (e) {
      global.LOCAL_PLUGINS.PLUGINS = [];
      return global.LOCAL_PLUGINS.PLUGINS;
    }
  },
  addPlugin(plugin) {
    const currentPlugins = global.LOCAL_PLUGINS.getLocalPlugins();
    const filteredPlugins = currentPlugins.filter((p) => p.name !== plugin.name);
    filteredPlugins.unshift(plugin);
    global.LOCAL_PLUGINS.PLUGINS = filteredPlugins;
    fs$1.writeFileSync(configPath, JSON.stringify(filteredPlugins));
  },
  updatePlugin(plugin) {
    global.LOCAL_PLUGINS.PLUGINS = global.LOCAL_PLUGINS.PLUGINS.map(
      (origin) => {
        if (origin.name === plugin.name) {
          return plugin;
        }
        return origin;
      }
    );
    fs$1.writeFileSync(configPath, JSON.stringify(global.LOCAL_PLUGINS.PLUGINS));
  },
  async deletePlugin(plugin) {
    await pluginInstance.uninstall([plugin.name], { isDev: plugin.isDev });
    global.LOCAL_PLUGINS.PLUGINS = global.LOCAL_PLUGINS.PLUGINS.filter(
      (p) => plugin.name !== p.name
    );
    fs$1.writeFileSync(configPath, JSON.stringify(global.LOCAL_PLUGINS.PLUGINS));
    return global.LOCAL_PLUGINS.PLUGINS;
  }
};
var re$2 = { exports: {} };
const SEMVER_SPEC_VERSION = "2.0.0";
const MAX_LENGTH$1 = 256;
const MAX_SAFE_INTEGER$1 = Number.MAX_SAFE_INTEGER || /* istanbul ignore next */
9007199254740991;
const MAX_SAFE_COMPONENT_LENGTH = 16;
const MAX_SAFE_BUILD_LENGTH = MAX_LENGTH$1 - 6;
const RELEASE_TYPES = [
  "major",
  "premajor",
  "minor",
  "preminor",
  "patch",
  "prepatch",
  "prerelease"
];
var constants$1 = {
  MAX_LENGTH: MAX_LENGTH$1,
  MAX_SAFE_COMPONENT_LENGTH,
  MAX_SAFE_BUILD_LENGTH,
  MAX_SAFE_INTEGER: MAX_SAFE_INTEGER$1,
  RELEASE_TYPES,
  SEMVER_SPEC_VERSION,
  FLAG_INCLUDE_PRERELEASE: 1,
  FLAG_LOOSE: 2
};
const debug$1 = typeof process === "object" && process.env && process.env.NODE_DEBUG && /\bsemver\b/i.test(process.env.NODE_DEBUG) ? (...args) => console.error("SEMVER", ...args) : () => {
};
var debug_1 = debug$1;
(function(module2, exports$1) {
  const {
    MAX_SAFE_COMPONENT_LENGTH: MAX_SAFE_COMPONENT_LENGTH2,
    MAX_SAFE_BUILD_LENGTH: MAX_SAFE_BUILD_LENGTH2,
    MAX_LENGTH: MAX_LENGTH2
  } = constants$1;
  const debug2 = debug_1;
  exports$1 = module2.exports = {};
  const re2 = exports$1.re = [];
  const safeRe = exports$1.safeRe = [];
  const src = exports$1.src = [];
  const safeSrc = exports$1.safeSrc = [];
  const t2 = exports$1.t = {};
  let R = 0;
  const LETTERDASHNUMBER = "[a-zA-Z0-9-]";
  const safeRegexReplacements = [
    ["\\s", 1],
    ["\\d", MAX_LENGTH2],
    [LETTERDASHNUMBER, MAX_SAFE_BUILD_LENGTH2]
  ];
  const makeSafeRegex = (value) => {
    for (const [token, max] of safeRegexReplacements) {
      value = value.split(`${token}*`).join(`${token}{0,${max}}`).split(`${token}+`).join(`${token}{1,${max}}`);
    }
    return value;
  };
  const createToken = (name, value, isGlobal) => {
    const safe = makeSafeRegex(value);
    const index2 = R++;
    debug2(name, index2, value);
    t2[name] = index2;
    src[index2] = value;
    safeSrc[index2] = safe;
    re2[index2] = new RegExp(value, isGlobal ? "g" : void 0);
    safeRe[index2] = new RegExp(safe, isGlobal ? "g" : void 0);
  };
  createToken("NUMERICIDENTIFIER", "0|[1-9]\\d*");
  createToken("NUMERICIDENTIFIERLOOSE", "\\d+");
  createToken("NONNUMERICIDENTIFIER", `\\d*[a-zA-Z-]${LETTERDASHNUMBER}*`);
  createToken("MAINVERSION", `(${src[t2.NUMERICIDENTIFIER]})\\.(${src[t2.NUMERICIDENTIFIER]})\\.(${src[t2.NUMERICIDENTIFIER]})`);
  createToken("MAINVERSIONLOOSE", `(${src[t2.NUMERICIDENTIFIERLOOSE]})\\.(${src[t2.NUMERICIDENTIFIERLOOSE]})\\.(${src[t2.NUMERICIDENTIFIERLOOSE]})`);
  createToken("PRERELEASEIDENTIFIER", `(?:${src[t2.NONNUMERICIDENTIFIER]}|${src[t2.NUMERICIDENTIFIER]})`);
  createToken("PRERELEASEIDENTIFIERLOOSE", `(?:${src[t2.NONNUMERICIDENTIFIER]}|${src[t2.NUMERICIDENTIFIERLOOSE]})`);
  createToken("PRERELEASE", `(?:-(${src[t2.PRERELEASEIDENTIFIER]}(?:\\.${src[t2.PRERELEASEIDENTIFIER]})*))`);
  createToken("PRERELEASELOOSE", `(?:-?(${src[t2.PRERELEASEIDENTIFIERLOOSE]}(?:\\.${src[t2.PRERELEASEIDENTIFIERLOOSE]})*))`);
  createToken("BUILDIDENTIFIER", `${LETTERDASHNUMBER}+`);
  createToken("BUILD", `(?:\\+(${src[t2.BUILDIDENTIFIER]}(?:\\.${src[t2.BUILDIDENTIFIER]})*))`);
  createToken("FULLPLAIN", `v?${src[t2.MAINVERSION]}${src[t2.PRERELEASE]}?${src[t2.BUILD]}?`);
  createToken("FULL", `^${src[t2.FULLPLAIN]}$`);
  createToken("LOOSEPLAIN", `[v=\\s]*${src[t2.MAINVERSIONLOOSE]}${src[t2.PRERELEASELOOSE]}?${src[t2.BUILD]}?`);
  createToken("LOOSE", `^${src[t2.LOOSEPLAIN]}$`);
  createToken("GTLT", "((?:<|>)?=?)");
  createToken("XRANGEIDENTIFIERLOOSE", `${src[t2.NUMERICIDENTIFIERLOOSE]}|x|X|\\*`);
  createToken("XRANGEIDENTIFIER", `${src[t2.NUMERICIDENTIFIER]}|x|X|\\*`);
  createToken("XRANGEPLAIN", `[v=\\s]*(${src[t2.XRANGEIDENTIFIER]})(?:\\.(${src[t2.XRANGEIDENTIFIER]})(?:\\.(${src[t2.XRANGEIDENTIFIER]})(?:${src[t2.PRERELEASE]})?${src[t2.BUILD]}?)?)?`);
  createToken("XRANGEPLAINLOOSE", `[v=\\s]*(${src[t2.XRANGEIDENTIFIERLOOSE]})(?:\\.(${src[t2.XRANGEIDENTIFIERLOOSE]})(?:\\.(${src[t2.XRANGEIDENTIFIERLOOSE]})(?:${src[t2.PRERELEASELOOSE]})?${src[t2.BUILD]}?)?)?`);
  createToken("XRANGE", `^${src[t2.GTLT]}\\s*${src[t2.XRANGEPLAIN]}$`);
  createToken("XRANGELOOSE", `^${src[t2.GTLT]}\\s*${src[t2.XRANGEPLAINLOOSE]}$`);
  createToken("COERCEPLAIN", `${"(^|[^\\d])(\\d{1,"}${MAX_SAFE_COMPONENT_LENGTH2}})(?:\\.(\\d{1,${MAX_SAFE_COMPONENT_LENGTH2}}))?(?:\\.(\\d{1,${MAX_SAFE_COMPONENT_LENGTH2}}))?`);
  createToken("COERCE", `${src[t2.COERCEPLAIN]}(?:$|[^\\d])`);
  createToken("COERCEFULL", src[t2.COERCEPLAIN] + `(?:${src[t2.PRERELEASE]})?(?:${src[t2.BUILD]})?(?:$|[^\\d])`);
  createToken("COERCERTL", src[t2.COERCE], true);
  createToken("COERCERTLFULL", src[t2.COERCEFULL], true);
  createToken("LONETILDE", "(?:~>?)");
  createToken("TILDETRIM", `(\\s*)${src[t2.LONETILDE]}\\s+`, true);
  exports$1.tildeTrimReplace = "$1~";
  createToken("TILDE", `^${src[t2.LONETILDE]}${src[t2.XRANGEPLAIN]}$`);
  createToken("TILDELOOSE", `^${src[t2.LONETILDE]}${src[t2.XRANGEPLAINLOOSE]}$`);
  createToken("LONECARET", "(?:\\^)");
  createToken("CARETTRIM", `(\\s*)${src[t2.LONECARET]}\\s+`, true);
  exports$1.caretTrimReplace = "$1^";
  createToken("CARET", `^${src[t2.LONECARET]}${src[t2.XRANGEPLAIN]}$`);
  createToken("CARETLOOSE", `^${src[t2.LONECARET]}${src[t2.XRANGEPLAINLOOSE]}$`);
  createToken("COMPARATORLOOSE", `^${src[t2.GTLT]}\\s*(${src[t2.LOOSEPLAIN]})$|^$`);
  createToken("COMPARATOR", `^${src[t2.GTLT]}\\s*(${src[t2.FULLPLAIN]})$|^$`);
  createToken("COMPARATORTRIM", `(\\s*)${src[t2.GTLT]}\\s*(${src[t2.LOOSEPLAIN]}|${src[t2.XRANGEPLAIN]})`, true);
  exports$1.comparatorTrimReplace = "$1$2$3";
  createToken("HYPHENRANGE", `^\\s*(${src[t2.XRANGEPLAIN]})\\s+-\\s+(${src[t2.XRANGEPLAIN]})\\s*$`);
  createToken("HYPHENRANGELOOSE", `^\\s*(${src[t2.XRANGEPLAINLOOSE]})\\s+-\\s+(${src[t2.XRANGEPLAINLOOSE]})\\s*$`);
  createToken("STAR", "(<|>)?=?\\s*\\*");
  createToken("GTE0", "^\\s*>=\\s*0\\.0\\.0\\s*$");
  createToken("GTE0PRE", "^\\s*>=\\s*0\\.0\\.0-0\\s*$");
})(re$2, re$2.exports);
var reExports = re$2.exports;
const looseOption = Object.freeze({ loose: true });
const emptyOpts = Object.freeze({});
const parseOptions$1 = (options) => {
  if (!options) {
    return emptyOpts;
  }
  if (typeof options !== "object") {
    return looseOption;
  }
  return options;
};
var parseOptions_1 = parseOptions$1;
const numeric = /^[0-9]+$/;
const compareIdentifiers$1 = (a, b) => {
  if (typeof a === "number" && typeof b === "number") {
    return a === b ? 0 : a < b ? -1 : 1;
  }
  const anum = numeric.test(a);
  const bnum = numeric.test(b);
  if (anum && bnum) {
    a = +a;
    b = +b;
  }
  return a === b ? 0 : anum && !bnum ? -1 : bnum && !anum ? 1 : a < b ? -1 : 1;
};
const rcompareIdentifiers = (a, b) => compareIdentifiers$1(b, a);
var identifiers$1 = {
  compareIdentifiers: compareIdentifiers$1,
  rcompareIdentifiers
};
const debug = debug_1;
const { MAX_LENGTH, MAX_SAFE_INTEGER } = constants$1;
const { safeRe: re$1, t: t$1 } = reExports;
const parseOptions = parseOptions_1;
const { compareIdentifiers } = identifiers$1;
let SemVer$d = class SemVer {
  constructor(version2, options) {
    options = parseOptions(options);
    if (version2 instanceof SemVer) {
      if (version2.loose === !!options.loose && version2.includePrerelease === !!options.includePrerelease) {
        return version2;
      } else {
        version2 = version2.version;
      }
    } else if (typeof version2 !== "string") {
      throw new TypeError(`Invalid version. Must be a string. Got type "${typeof version2}".`);
    }
    if (version2.length > MAX_LENGTH) {
      throw new TypeError(
        `version is longer than ${MAX_LENGTH} characters`
      );
    }
    debug("SemVer", version2, options);
    this.options = options;
    this.loose = !!options.loose;
    this.includePrerelease = !!options.includePrerelease;
    const m = version2.trim().match(options.loose ? re$1[t$1.LOOSE] : re$1[t$1.FULL]);
    if (!m) {
      throw new TypeError(`Invalid Version: ${version2}`);
    }
    this.raw = version2;
    this.major = +m[1];
    this.minor = +m[2];
    this.patch = +m[3];
    if (this.major > MAX_SAFE_INTEGER || this.major < 0) {
      throw new TypeError("Invalid major version");
    }
    if (this.minor > MAX_SAFE_INTEGER || this.minor < 0) {
      throw new TypeError("Invalid minor version");
    }
    if (this.patch > MAX_SAFE_INTEGER || this.patch < 0) {
      throw new TypeError("Invalid patch version");
    }
    if (!m[4]) {
      this.prerelease = [];
    } else {
      this.prerelease = m[4].split(".").map((id) => {
        if (/^[0-9]+$/.test(id)) {
          const num = +id;
          if (num >= 0 && num < MAX_SAFE_INTEGER) {
            return num;
          }
        }
        return id;
      });
    }
    this.build = m[5] ? m[5].split(".") : [];
    this.format();
  }
  format() {
    this.version = `${this.major}.${this.minor}.${this.patch}`;
    if (this.prerelease.length) {
      this.version += `-${this.prerelease.join(".")}`;
    }
    return this.version;
  }
  toString() {
    return this.version;
  }
  compare(other) {
    debug("SemVer.compare", this.version, this.options, other);
    if (!(other instanceof SemVer)) {
      if (typeof other === "string" && other === this.version) {
        return 0;
      }
      other = new SemVer(other, this.options);
    }
    if (other.version === this.version) {
      return 0;
    }
    return this.compareMain(other) || this.comparePre(other);
  }
  compareMain(other) {
    if (!(other instanceof SemVer)) {
      other = new SemVer(other, this.options);
    }
    if (this.major < other.major) {
      return -1;
    }
    if (this.major > other.major) {
      return 1;
    }
    if (this.minor < other.minor) {
      return -1;
    }
    if (this.minor > other.minor) {
      return 1;
    }
    if (this.patch < other.patch) {
      return -1;
    }
    if (this.patch > other.patch) {
      return 1;
    }
    return 0;
  }
  comparePre(other) {
    if (!(other instanceof SemVer)) {
      other = new SemVer(other, this.options);
    }
    if (this.prerelease.length && !other.prerelease.length) {
      return -1;
    } else if (!this.prerelease.length && other.prerelease.length) {
      return 1;
    } else if (!this.prerelease.length && !other.prerelease.length) {
      return 0;
    }
    let i = 0;
    do {
      const a = this.prerelease[i];
      const b = other.prerelease[i];
      debug("prerelease compare", i, a, b);
      if (a === void 0 && b === void 0) {
        return 0;
      } else if (b === void 0) {
        return 1;
      } else if (a === void 0) {
        return -1;
      } else if (a === b) {
        continue;
      } else {
        return compareIdentifiers(a, b);
      }
    } while (++i);
  }
  compareBuild(other) {
    if (!(other instanceof SemVer)) {
      other = new SemVer(other, this.options);
    }
    let i = 0;
    do {
      const a = this.build[i];
      const b = other.build[i];
      debug("build compare", i, a, b);
      if (a === void 0 && b === void 0) {
        return 0;
      } else if (b === void 0) {
        return 1;
      } else if (a === void 0) {
        return -1;
      } else if (a === b) {
        continue;
      } else {
        return compareIdentifiers(a, b);
      }
    } while (++i);
  }
  // preminor will bump the version up to the next minor release, and immediately
  // down to pre-release. premajor and prepatch work the same way.
  inc(release, identifier, identifierBase) {
    if (release.startsWith("pre")) {
      if (!identifier && identifierBase === false) {
        throw new Error("invalid increment argument: identifier is empty");
      }
      if (identifier) {
        const match = `-${identifier}`.match(this.options.loose ? re$1[t$1.PRERELEASELOOSE] : re$1[t$1.PRERELEASE]);
        if (!match || match[1] !== identifier) {
          throw new Error(`invalid identifier: ${identifier}`);
        }
      }
    }
    switch (release) {
      case "premajor":
        this.prerelease.length = 0;
        this.patch = 0;
        this.minor = 0;
        this.major++;
        this.inc("pre", identifier, identifierBase);
        break;
      case "preminor":
        this.prerelease.length = 0;
        this.patch = 0;
        this.minor++;
        this.inc("pre", identifier, identifierBase);
        break;
      case "prepatch":
        this.prerelease.length = 0;
        this.inc("patch", identifier, identifierBase);
        this.inc("pre", identifier, identifierBase);
        break;
      case "prerelease":
        if (this.prerelease.length === 0) {
          this.inc("patch", identifier, identifierBase);
        }
        this.inc("pre", identifier, identifierBase);
        break;
      case "release":
        if (this.prerelease.length === 0) {
          throw new Error(`version ${this.raw} is not a prerelease`);
        }
        this.prerelease.length = 0;
        break;
      case "major":
        if (this.minor !== 0 || this.patch !== 0 || this.prerelease.length === 0) {
          this.major++;
        }
        this.minor = 0;
        this.patch = 0;
        this.prerelease = [];
        break;
      case "minor":
        if (this.patch !== 0 || this.prerelease.length === 0) {
          this.minor++;
        }
        this.patch = 0;
        this.prerelease = [];
        break;
      case "patch":
        if (this.prerelease.length === 0) {
          this.patch++;
        }
        this.prerelease = [];
        break;
      case "pre": {
        const base = Number(identifierBase) ? 1 : 0;
        if (this.prerelease.length === 0) {
          this.prerelease = [base];
        } else {
          let i = this.prerelease.length;
          while (--i >= 0) {
            if (typeof this.prerelease[i] === "number") {
              this.prerelease[i]++;
              i = -2;
            }
          }
          if (i === -1) {
            if (identifier === this.prerelease.join(".") && identifierBase === false) {
              throw new Error("invalid increment argument: identifier already exists");
            }
            this.prerelease.push(base);
          }
        }
        if (identifier) {
          let prerelease2 = [identifier, base];
          if (identifierBase === false) {
            prerelease2 = [identifier];
          }
          if (compareIdentifiers(this.prerelease[0], identifier) === 0) {
            if (isNaN(this.prerelease[1])) {
              this.prerelease = prerelease2;
            }
          } else {
            this.prerelease = prerelease2;
          }
        }
        break;
      }
      default:
        throw new Error(`invalid increment argument: ${release}`);
    }
    this.raw = this.format();
    if (this.build.length) {
      this.raw += `+${this.build.join(".")}`;
    }
    return this;
  }
};
var semver$1 = SemVer$d;
const SemVer$c = semver$1;
const parse$6 = (version2, options, throwErrors = false) => {
  if (version2 instanceof SemVer$c) {
    return version2;
  }
  try {
    return new SemVer$c(version2, options);
  } catch (er) {
    if (!throwErrors) {
      return null;
    }
    throw er;
  }
};
var parse_1 = parse$6;
const parse$5 = parse_1;
const valid$2 = (version2, options) => {
  const v = parse$5(version2, options);
  return v ? v.version : null;
};
var valid_1 = valid$2;
const parse$4 = parse_1;
const clean$1 = (version2, options) => {
  const s = parse$4(version2.trim().replace(/^[=v]+/, ""), options);
  return s ? s.version : null;
};
var clean_1 = clean$1;
const SemVer$b = semver$1;
const inc$1 = (version2, release, options, identifier, identifierBase) => {
  if (typeof options === "string") {
    identifierBase = identifier;
    identifier = options;
    options = void 0;
  }
  try {
    return new SemVer$b(
      version2 instanceof SemVer$b ? version2.version : version2,
      options
    ).inc(release, identifier, identifierBase).version;
  } catch (er) {
    return null;
  }
};
var inc_1 = inc$1;
const parse$3 = parse_1;
const diff$1 = (version1, version2) => {
  const v1 = parse$3(version1, null, true);
  const v2 = parse$3(version2, null, true);
  const comparison = v1.compare(v2);
  if (comparison === 0) {
    return null;
  }
  const v1Higher = comparison > 0;
  const highVersion = v1Higher ? v1 : v2;
  const lowVersion = v1Higher ? v2 : v1;
  const highHasPre = !!highVersion.prerelease.length;
  const lowHasPre = !!lowVersion.prerelease.length;
  if (lowHasPre && !highHasPre) {
    if (!lowVersion.patch && !lowVersion.minor) {
      return "major";
    }
    if (lowVersion.compareMain(highVersion) === 0) {
      if (lowVersion.minor && !lowVersion.patch) {
        return "minor";
      }
      return "patch";
    }
  }
  const prefix = highHasPre ? "pre" : "";
  if (v1.major !== v2.major) {
    return prefix + "major";
  }
  if (v1.minor !== v2.minor) {
    return prefix + "minor";
  }
  if (v1.patch !== v2.patch) {
    return prefix + "patch";
  }
  return "prerelease";
};
var diff_1 = diff$1;
const SemVer$a = semver$1;
const major$1 = (a, loose) => new SemVer$a(a, loose).major;
var major_1 = major$1;
const SemVer$9 = semver$1;
const minor$1 = (a, loose) => new SemVer$9(a, loose).minor;
var minor_1 = minor$1;
const SemVer$8 = semver$1;
const patch$1 = (a, loose) => new SemVer$8(a, loose).patch;
var patch_1 = patch$1;
const parse$2 = parse_1;
const prerelease$1 = (version2, options) => {
  const parsed = parse$2(version2, options);
  return parsed && parsed.prerelease.length ? parsed.prerelease : null;
};
var prerelease_1 = prerelease$1;
const SemVer$7 = semver$1;
const compare$b = (a, b, loose) => new SemVer$7(a, loose).compare(new SemVer$7(b, loose));
var compare_1 = compare$b;
const compare$a = compare_1;
const rcompare$1 = (a, b, loose) => compare$a(b, a, loose);
var rcompare_1 = rcompare$1;
const compare$9 = compare_1;
const compareLoose$1 = (a, b) => compare$9(a, b, true);
var compareLoose_1 = compareLoose$1;
const SemVer$6 = semver$1;
const compareBuild$3 = (a, b, loose) => {
  const versionA = new SemVer$6(a, loose);
  const versionB = new SemVer$6(b, loose);
  return versionA.compare(versionB) || versionA.compareBuild(versionB);
};
var compareBuild_1 = compareBuild$3;
const compareBuild$2 = compareBuild_1;
const sort$1 = (list, loose) => list.sort((a, b) => compareBuild$2(a, b, loose));
var sort_1 = sort$1;
const compareBuild$1 = compareBuild_1;
const rsort$1 = (list, loose) => list.sort((a, b) => compareBuild$1(b, a, loose));
var rsort_1 = rsort$1;
const compare$8 = compare_1;
const gt$4 = (a, b, loose) => compare$8(a, b, loose) > 0;
var gt_1 = gt$4;
const compare$7 = compare_1;
const lt$3 = (a, b, loose) => compare$7(a, b, loose) < 0;
var lt_1 = lt$3;
const compare$6 = compare_1;
const eq$2 = (a, b, loose) => compare$6(a, b, loose) === 0;
var eq_1 = eq$2;
const compare$5 = compare_1;
const neq$2 = (a, b, loose) => compare$5(a, b, loose) !== 0;
var neq_1 = neq$2;
const compare$4 = compare_1;
const gte$3 = (a, b, loose) => compare$4(a, b, loose) >= 0;
var gte_1 = gte$3;
const compare$3 = compare_1;
const lte$3 = (a, b, loose) => compare$3(a, b, loose) <= 0;
var lte_1 = lte$3;
const eq$1 = eq_1;
const neq$1 = neq_1;
const gt$3 = gt_1;
const gte$2 = gte_1;
const lt$2 = lt_1;
const lte$2 = lte_1;
const cmp$1 = (a, op, b, loose) => {
  switch (op) {
    case "===":
      if (typeof a === "object") {
        a = a.version;
      }
      if (typeof b === "object") {
        b = b.version;
      }
      return a === b;
    case "!==":
      if (typeof a === "object") {
        a = a.version;
      }
      if (typeof b === "object") {
        b = b.version;
      }
      return a !== b;
    case "":
    case "=":
    case "==":
      return eq$1(a, b, loose);
    case "!=":
      return neq$1(a, b, loose);
    case ">":
      return gt$3(a, b, loose);
    case ">=":
      return gte$2(a, b, loose);
    case "<":
      return lt$2(a, b, loose);
    case "<=":
      return lte$2(a, b, loose);
    default:
      throw new TypeError(`Invalid operator: ${op}`);
  }
};
var cmp_1 = cmp$1;
const SemVer$5 = semver$1;
const parse$1 = parse_1;
const { safeRe: re, t } = reExports;
const coerce$1 = (version2, options) => {
  if (version2 instanceof SemVer$5) {
    return version2;
  }
  if (typeof version2 === "number") {
    version2 = String(version2);
  }
  if (typeof version2 !== "string") {
    return null;
  }
  options = options || {};
  let match = null;
  if (!options.rtl) {
    match = version2.match(options.includePrerelease ? re[t.COERCEFULL] : re[t.COERCE]);
  } else {
    const coerceRtlRegex = options.includePrerelease ? re[t.COERCERTLFULL] : re[t.COERCERTL];
    let next;
    while ((next = coerceRtlRegex.exec(version2)) && (!match || match.index + match[0].length !== version2.length)) {
      if (!match || next.index + next[0].length !== match.index + match[0].length) {
        match = next;
      }
      coerceRtlRegex.lastIndex = next.index + next[1].length + next[2].length;
    }
    coerceRtlRegex.lastIndex = -1;
  }
  if (match === null) {
    return null;
  }
  const major2 = match[2];
  const minor2 = match[3] || "0";
  const patch2 = match[4] || "0";
  const prerelease2 = options.includePrerelease && match[5] ? `-${match[5]}` : "";
  const build2 = options.includePrerelease && match[6] ? `+${match[6]}` : "";
  return parse$1(`${major2}.${minor2}.${patch2}${prerelease2}${build2}`, options);
};
var coerce_1 = coerce$1;
class LRUCache {
  constructor() {
    this.max = 1e3;
    this.map = /* @__PURE__ */ new Map();
  }
  get(key) {
    const value = this.map.get(key);
    if (value === void 0) {
      return void 0;
    } else {
      this.map.delete(key);
      this.map.set(key, value);
      return value;
    }
  }
  delete(key) {
    return this.map.delete(key);
  }
  set(key, value) {
    const deleted = this.delete(key);
    if (!deleted && value !== void 0) {
      if (this.map.size >= this.max) {
        const firstKey = this.map.keys().next().value;
        this.delete(firstKey);
      }
      this.map.set(key, value);
    }
    return this;
  }
}
var lrucache = LRUCache;
var range;
var hasRequiredRange;
function requireRange() {
  if (hasRequiredRange) return range;
  hasRequiredRange = 1;
  const SPACE_CHARACTERS = /\s+/g;
  class Range2 {
    constructor(range2, options) {
      options = parseOptions2(options);
      if (range2 instanceof Range2) {
        if (range2.loose === !!options.loose && range2.includePrerelease === !!options.includePrerelease) {
          return range2;
        } else {
          return new Range2(range2.raw, options);
        }
      }
      if (range2 instanceof Comparator2) {
        this.raw = range2.value;
        this.set = [[range2]];
        this.formatted = void 0;
        return this;
      }
      this.options = options;
      this.loose = !!options.loose;
      this.includePrerelease = !!options.includePrerelease;
      this.raw = range2.trim().replace(SPACE_CHARACTERS, " ");
      this.set = this.raw.split("||").map((r) => this.parseRange(r.trim())).filter((c) => c.length);
      if (!this.set.length) {
        throw new TypeError(`Invalid SemVer Range: ${this.raw}`);
      }
      if (this.set.length > 1) {
        const first = this.set[0];
        this.set = this.set.filter((c) => !isNullSet(c[0]));
        if (this.set.length === 0) {
          this.set = [first];
        } else if (this.set.length > 1) {
          for (const c of this.set) {
            if (c.length === 1 && isAny(c[0])) {
              this.set = [c];
              break;
            }
          }
        }
      }
      this.formatted = void 0;
    }
    get range() {
      if (this.formatted === void 0) {
        this.formatted = "";
        for (let i = 0; i < this.set.length; i++) {
          if (i > 0) {
            this.formatted += "||";
          }
          const comps = this.set[i];
          for (let k = 0; k < comps.length; k++) {
            if (k > 0) {
              this.formatted += " ";
            }
            this.formatted += comps[k].toString().trim();
          }
        }
      }
      return this.formatted;
    }
    format() {
      return this.range;
    }
    toString() {
      return this.range;
    }
    parseRange(range2) {
      const memoOpts = (this.options.includePrerelease && FLAG_INCLUDE_PRERELEASE) | (this.options.loose && FLAG_LOOSE);
      const memoKey = memoOpts + ":" + range2;
      const cached = cache.get(memoKey);
      if (cached) {
        return cached;
      }
      const loose = this.options.loose;
      const hr = loose ? re2[t2.HYPHENRANGELOOSE] : re2[t2.HYPHENRANGE];
      range2 = range2.replace(hr, hyphenReplace(this.options.includePrerelease));
      debug2("hyphen replace", range2);
      range2 = range2.replace(re2[t2.COMPARATORTRIM], comparatorTrimReplace);
      debug2("comparator trim", range2);
      range2 = range2.replace(re2[t2.TILDETRIM], tildeTrimReplace);
      debug2("tilde trim", range2);
      range2 = range2.replace(re2[t2.CARETTRIM], caretTrimReplace);
      debug2("caret trim", range2);
      let rangeList = range2.split(" ").map((comp) => parseComparator(comp, this.options)).join(" ").split(/\s+/).map((comp) => replaceGTE0(comp, this.options));
      if (loose) {
        rangeList = rangeList.filter((comp) => {
          debug2("loose invalid filter", comp, this.options);
          return !!comp.match(re2[t2.COMPARATORLOOSE]);
        });
      }
      debug2("range list", rangeList);
      const rangeMap = /* @__PURE__ */ new Map();
      const comparators = rangeList.map((comp) => new Comparator2(comp, this.options));
      for (const comp of comparators) {
        if (isNullSet(comp)) {
          return [comp];
        }
        rangeMap.set(comp.value, comp);
      }
      if (rangeMap.size > 1 && rangeMap.has("")) {
        rangeMap.delete("");
      }
      const result = [...rangeMap.values()];
      cache.set(memoKey, result);
      return result;
    }
    intersects(range2, options) {
      if (!(range2 instanceof Range2)) {
        throw new TypeError("a Range is required");
      }
      return this.set.some((thisComparators) => {
        return isSatisfiable(thisComparators, options) && range2.set.some((rangeComparators) => {
          return isSatisfiable(rangeComparators, options) && thisComparators.every((thisComparator) => {
            return rangeComparators.every((rangeComparator) => {
              return thisComparator.intersects(rangeComparator, options);
            });
          });
        });
      });
    }
    // if ANY of the sets match ALL of its comparators, then pass
    test(version2) {
      if (!version2) {
        return false;
      }
      if (typeof version2 === "string") {
        try {
          version2 = new SemVer3(version2, this.options);
        } catch (er) {
          return false;
        }
      }
      for (let i = 0; i < this.set.length; i++) {
        if (testSet(this.set[i], version2, this.options)) {
          return true;
        }
      }
      return false;
    }
  }
  range = Range2;
  const LRU = lrucache;
  const cache = new LRU();
  const parseOptions2 = parseOptions_1;
  const Comparator2 = requireComparator();
  const debug2 = debug_1;
  const SemVer3 = semver$1;
  const {
    safeRe: re2,
    t: t2,
    comparatorTrimReplace,
    tildeTrimReplace,
    caretTrimReplace
  } = reExports;
  const { FLAG_INCLUDE_PRERELEASE, FLAG_LOOSE } = constants$1;
  const isNullSet = (c) => c.value === "<0.0.0-0";
  const isAny = (c) => c.value === "";
  const isSatisfiable = (comparators, options) => {
    let result = true;
    const remainingComparators = comparators.slice();
    let testComparator = remainingComparators.pop();
    while (result && remainingComparators.length) {
      result = remainingComparators.every((otherComparator) => {
        return testComparator.intersects(otherComparator, options);
      });
      testComparator = remainingComparators.pop();
    }
    return result;
  };
  const parseComparator = (comp, options) => {
    comp = comp.replace(re2[t2.BUILD], "");
    debug2("comp", comp, options);
    comp = replaceCarets(comp, options);
    debug2("caret", comp);
    comp = replaceTildes(comp, options);
    debug2("tildes", comp);
    comp = replaceXRanges(comp, options);
    debug2("xrange", comp);
    comp = replaceStars(comp, options);
    debug2("stars", comp);
    return comp;
  };
  const isX = (id) => !id || id.toLowerCase() === "x" || id === "*";
  const replaceTildes = (comp, options) => {
    return comp.trim().split(/\s+/).map((c) => replaceTilde(c, options)).join(" ");
  };
  const replaceTilde = (comp, options) => {
    const r = options.loose ? re2[t2.TILDELOOSE] : re2[t2.TILDE];
    return comp.replace(r, (_, M, m, p, pr) => {
      debug2("tilde", comp, _, M, m, p, pr);
      let ret;
      if (isX(M)) {
        ret = "";
      } else if (isX(m)) {
        ret = `>=${M}.0.0 <${+M + 1}.0.0-0`;
      } else if (isX(p)) {
        ret = `>=${M}.${m}.0 <${M}.${+m + 1}.0-0`;
      } else if (pr) {
        debug2("replaceTilde pr", pr);
        ret = `>=${M}.${m}.${p}-${pr} <${M}.${+m + 1}.0-0`;
      } else {
        ret = `>=${M}.${m}.${p} <${M}.${+m + 1}.0-0`;
      }
      debug2("tilde return", ret);
      return ret;
    });
  };
  const replaceCarets = (comp, options) => {
    return comp.trim().split(/\s+/).map((c) => replaceCaret(c, options)).join(" ");
  };
  const replaceCaret = (comp, options) => {
    debug2("caret", comp, options);
    const r = options.loose ? re2[t2.CARETLOOSE] : re2[t2.CARET];
    const z = options.includePrerelease ? "-0" : "";
    return comp.replace(r, (_, M, m, p, pr) => {
      debug2("caret", comp, _, M, m, p, pr);
      let ret;
      if (isX(M)) {
        ret = "";
      } else if (isX(m)) {
        ret = `>=${M}.0.0${z} <${+M + 1}.0.0-0`;
      } else if (isX(p)) {
        if (M === "0") {
          ret = `>=${M}.${m}.0${z} <${M}.${+m + 1}.0-0`;
        } else {
          ret = `>=${M}.${m}.0${z} <${+M + 1}.0.0-0`;
        }
      } else if (pr) {
        debug2("replaceCaret pr", pr);
        if (M === "0") {
          if (m === "0") {
            ret = `>=${M}.${m}.${p}-${pr} <${M}.${m}.${+p + 1}-0`;
          } else {
            ret = `>=${M}.${m}.${p}-${pr} <${M}.${+m + 1}.0-0`;
          }
        } else {
          ret = `>=${M}.${m}.${p}-${pr} <${+M + 1}.0.0-0`;
        }
      } else {
        debug2("no pr");
        if (M === "0") {
          if (m === "0") {
            ret = `>=${M}.${m}.${p}${z} <${M}.${m}.${+p + 1}-0`;
          } else {
            ret = `>=${M}.${m}.${p}${z} <${M}.${+m + 1}.0-0`;
          }
        } else {
          ret = `>=${M}.${m}.${p} <${+M + 1}.0.0-0`;
        }
      }
      debug2("caret return", ret);
      return ret;
    });
  };
  const replaceXRanges = (comp, options) => {
    debug2("replaceXRanges", comp, options);
    return comp.split(/\s+/).map((c) => replaceXRange(c, options)).join(" ");
  };
  const replaceXRange = (comp, options) => {
    comp = comp.trim();
    const r = options.loose ? re2[t2.XRANGELOOSE] : re2[t2.XRANGE];
    return comp.replace(r, (ret, gtlt, M, m, p, pr) => {
      debug2("xRange", comp, ret, gtlt, M, m, p, pr);
      const xM = isX(M);
      const xm = xM || isX(m);
      const xp = xm || isX(p);
      const anyX = xp;
      if (gtlt === "=" && anyX) {
        gtlt = "";
      }
      pr = options.includePrerelease ? "-0" : "";
      if (xM) {
        if (gtlt === ">" || gtlt === "<") {
          ret = "<0.0.0-0";
        } else {
          ret = "*";
        }
      } else if (gtlt && anyX) {
        if (xm) {
          m = 0;
        }
        p = 0;
        if (gtlt === ">") {
          gtlt = ">=";
          if (xm) {
            M = +M + 1;
            m = 0;
            p = 0;
          } else {
            m = +m + 1;
            p = 0;
          }
        } else if (gtlt === "<=") {
          gtlt = "<";
          if (xm) {
            M = +M + 1;
          } else {
            m = +m + 1;
          }
        }
        if (gtlt === "<") {
          pr = "-0";
        }
        ret = `${gtlt + M}.${m}.${p}${pr}`;
      } else if (xm) {
        ret = `>=${M}.0.0${pr} <${+M + 1}.0.0-0`;
      } else if (xp) {
        ret = `>=${M}.${m}.0${pr} <${M}.${+m + 1}.0-0`;
      }
      debug2("xRange return", ret);
      return ret;
    });
  };
  const replaceStars = (comp, options) => {
    debug2("replaceStars", comp, options);
    return comp.trim().replace(re2[t2.STAR], "");
  };
  const replaceGTE0 = (comp, options) => {
    debug2("replaceGTE0", comp, options);
    return comp.trim().replace(re2[options.includePrerelease ? t2.GTE0PRE : t2.GTE0], "");
  };
  const hyphenReplace = (incPr) => ($0, from, fM, fm, fp, fpr, fb, to, tM, tm, tp, tpr) => {
    if (isX(fM)) {
      from = "";
    } else if (isX(fm)) {
      from = `>=${fM}.0.0${incPr ? "-0" : ""}`;
    } else if (isX(fp)) {
      from = `>=${fM}.${fm}.0${incPr ? "-0" : ""}`;
    } else if (fpr) {
      from = `>=${from}`;
    } else {
      from = `>=${from}${incPr ? "-0" : ""}`;
    }
    if (isX(tM)) {
      to = "";
    } else if (isX(tm)) {
      to = `<${+tM + 1}.0.0-0`;
    } else if (isX(tp)) {
      to = `<${tM}.${+tm + 1}.0-0`;
    } else if (tpr) {
      to = `<=${tM}.${tm}.${tp}-${tpr}`;
    } else if (incPr) {
      to = `<${tM}.${tm}.${+tp + 1}-0`;
    } else {
      to = `<=${to}`;
    }
    return `${from} ${to}`.trim();
  };
  const testSet = (set, version2, options) => {
    for (let i = 0; i < set.length; i++) {
      if (!set[i].test(version2)) {
        return false;
      }
    }
    if (version2.prerelease.length && !options.includePrerelease) {
      for (let i = 0; i < set.length; i++) {
        debug2(set[i].semver);
        if (set[i].semver === Comparator2.ANY) {
          continue;
        }
        if (set[i].semver.prerelease.length > 0) {
          const allowed = set[i].semver;
          if (allowed.major === version2.major && allowed.minor === version2.minor && allowed.patch === version2.patch) {
            return true;
          }
        }
      }
      return false;
    }
    return true;
  };
  return range;
}
var comparator;
var hasRequiredComparator;
function requireComparator() {
  if (hasRequiredComparator) return comparator;
  hasRequiredComparator = 1;
  const ANY2 = Symbol("SemVer ANY");
  class Comparator2 {
    static get ANY() {
      return ANY2;
    }
    constructor(comp, options) {
      options = parseOptions2(options);
      if (comp instanceof Comparator2) {
        if (comp.loose === !!options.loose) {
          return comp;
        } else {
          comp = comp.value;
        }
      }
      comp = comp.trim().split(/\s+/).join(" ");
      debug2("comparator", comp, options);
      this.options = options;
      this.loose = !!options.loose;
      this.parse(comp);
      if (this.semver === ANY2) {
        this.value = "";
      } else {
        this.value = this.operator + this.semver.version;
      }
      debug2("comp", this);
    }
    parse(comp) {
      const r = this.options.loose ? re2[t2.COMPARATORLOOSE] : re2[t2.COMPARATOR];
      const m = comp.match(r);
      if (!m) {
        throw new TypeError(`Invalid comparator: ${comp}`);
      }
      this.operator = m[1] !== void 0 ? m[1] : "";
      if (this.operator === "=") {
        this.operator = "";
      }
      if (!m[2]) {
        this.semver = ANY2;
      } else {
        this.semver = new SemVer3(m[2], this.options.loose);
      }
    }
    toString() {
      return this.value;
    }
    test(version2) {
      debug2("Comparator.test", version2, this.options.loose);
      if (this.semver === ANY2 || version2 === ANY2) {
        return true;
      }
      if (typeof version2 === "string") {
        try {
          version2 = new SemVer3(version2, this.options);
        } catch (er) {
          return false;
        }
      }
      return cmp2(version2, this.operator, this.semver, this.options);
    }
    intersects(comp, options) {
      if (!(comp instanceof Comparator2)) {
        throw new TypeError("a Comparator is required");
      }
      if (this.operator === "") {
        if (this.value === "") {
          return true;
        }
        return new Range2(comp.value, options).test(this.value);
      } else if (comp.operator === "") {
        if (comp.value === "") {
          return true;
        }
        return new Range2(this.value, options).test(comp.semver);
      }
      options = parseOptions2(options);
      if (options.includePrerelease && (this.value === "<0.0.0-0" || comp.value === "<0.0.0-0")) {
        return false;
      }
      if (!options.includePrerelease && (this.value.startsWith("<0.0.0") || comp.value.startsWith("<0.0.0"))) {
        return false;
      }
      if (this.operator.startsWith(">") && comp.operator.startsWith(">")) {
        return true;
      }
      if (this.operator.startsWith("<") && comp.operator.startsWith("<")) {
        return true;
      }
      if (this.semver.version === comp.semver.version && this.operator.includes("=") && comp.operator.includes("=")) {
        return true;
      }
      if (cmp2(this.semver, "<", comp.semver, options) && this.operator.startsWith(">") && comp.operator.startsWith("<")) {
        return true;
      }
      if (cmp2(this.semver, ">", comp.semver, options) && this.operator.startsWith("<") && comp.operator.startsWith(">")) {
        return true;
      }
      return false;
    }
  }
  comparator = Comparator2;
  const parseOptions2 = parseOptions_1;
  const { safeRe: re2, t: t2 } = reExports;
  const cmp2 = cmp_1;
  const debug2 = debug_1;
  const SemVer3 = semver$1;
  const Range2 = requireRange();
  return comparator;
}
const Range$9 = requireRange();
const satisfies$4 = (version2, range2, options) => {
  try {
    range2 = new Range$9(range2, options);
  } catch (er) {
    return false;
  }
  return range2.test(version2);
};
var satisfies_1 = satisfies$4;
const Range$8 = requireRange();
const toComparators$1 = (range2, options) => new Range$8(range2, options).set.map((comp) => comp.map((c) => c.value).join(" ").trim().split(" "));
var toComparators_1 = toComparators$1;
const SemVer$4 = semver$1;
const Range$7 = requireRange();
const maxSatisfying$1 = (versions, range2, options) => {
  let max = null;
  let maxSV = null;
  let rangeObj = null;
  try {
    rangeObj = new Range$7(range2, options);
  } catch (er) {
    return null;
  }
  versions.forEach((v) => {
    if (rangeObj.test(v)) {
      if (!max || maxSV.compare(v) === -1) {
        max = v;
        maxSV = new SemVer$4(max, options);
      }
    }
  });
  return max;
};
var maxSatisfying_1 = maxSatisfying$1;
const SemVer$3 = semver$1;
const Range$6 = requireRange();
const minSatisfying$1 = (versions, range2, options) => {
  let min = null;
  let minSV = null;
  let rangeObj = null;
  try {
    rangeObj = new Range$6(range2, options);
  } catch (er) {
    return null;
  }
  versions.forEach((v) => {
    if (rangeObj.test(v)) {
      if (!min || minSV.compare(v) === 1) {
        min = v;
        minSV = new SemVer$3(min, options);
      }
    }
  });
  return min;
};
var minSatisfying_1 = minSatisfying$1;
const SemVer$2 = semver$1;
const Range$5 = requireRange();
const gt$2 = gt_1;
const minVersion$1 = (range2, loose) => {
  range2 = new Range$5(range2, loose);
  let minver = new SemVer$2("0.0.0");
  if (range2.test(minver)) {
    return minver;
  }
  minver = new SemVer$2("0.0.0-0");
  if (range2.test(minver)) {
    return minver;
  }
  minver = null;
  for (let i = 0; i < range2.set.length; ++i) {
    const comparators = range2.set[i];
    let setMin = null;
    comparators.forEach((comparator2) => {
      const compver = new SemVer$2(comparator2.semver.version);
      switch (comparator2.operator) {
        case ">":
          if (compver.prerelease.length === 0) {
            compver.patch++;
          } else {
            compver.prerelease.push(0);
          }
          compver.raw = compver.format();
        case "":
        case ">=":
          if (!setMin || gt$2(compver, setMin)) {
            setMin = compver;
          }
          break;
        case "<":
        case "<=":
          break;
        default:
          throw new Error(`Unexpected operation: ${comparator2.operator}`);
      }
    });
    if (setMin && (!minver || gt$2(minver, setMin))) {
      minver = setMin;
    }
  }
  if (minver && range2.test(minver)) {
    return minver;
  }
  return null;
};
var minVersion_1 = minVersion$1;
const Range$4 = requireRange();
const validRange$1 = (range2, options) => {
  try {
    return new Range$4(range2, options).range || "*";
  } catch (er) {
    return null;
  }
};
var valid$1 = validRange$1;
const SemVer$1 = semver$1;
const Comparator$2 = requireComparator();
const { ANY: ANY$1 } = Comparator$2;
const Range$3 = requireRange();
const satisfies$3 = satisfies_1;
const gt$1 = gt_1;
const lt$1 = lt_1;
const lte$1 = lte_1;
const gte$1 = gte_1;
const outside$3 = (version2, range2, hilo, options) => {
  version2 = new SemVer$1(version2, options);
  range2 = new Range$3(range2, options);
  let gtfn, ltefn, ltfn, comp, ecomp;
  switch (hilo) {
    case ">":
      gtfn = gt$1;
      ltefn = lte$1;
      ltfn = lt$1;
      comp = ">";
      ecomp = ">=";
      break;
    case "<":
      gtfn = lt$1;
      ltefn = gte$1;
      ltfn = gt$1;
      comp = "<";
      ecomp = "<=";
      break;
    default:
      throw new TypeError('Must provide a hilo val of "<" or ">"');
  }
  if (satisfies$3(version2, range2, options)) {
    return false;
  }
  for (let i = 0; i < range2.set.length; ++i) {
    const comparators = range2.set[i];
    let high = null;
    let low = null;
    comparators.forEach((comparator2) => {
      if (comparator2.semver === ANY$1) {
        comparator2 = new Comparator$2(">=0.0.0");
      }
      high = high || comparator2;
      low = low || comparator2;
      if (gtfn(comparator2.semver, high.semver, options)) {
        high = comparator2;
      } else if (ltfn(comparator2.semver, low.semver, options)) {
        low = comparator2;
      }
    });
    if (high.operator === comp || high.operator === ecomp) {
      return false;
    }
    if ((!low.operator || low.operator === comp) && ltefn(version2, low.semver)) {
      return false;
    } else if (low.operator === ecomp && ltfn(version2, low.semver)) {
      return false;
    }
  }
  return true;
};
var outside_1 = outside$3;
const outside$2 = outside_1;
const gtr$1 = (version2, range2, options) => outside$2(version2, range2, ">", options);
var gtr_1 = gtr$1;
const outside$1 = outside_1;
const ltr$1 = (version2, range2, options) => outside$1(version2, range2, "<", options);
var ltr_1 = ltr$1;
const Range$2 = requireRange();
const intersects$1 = (r1, r2, options) => {
  r1 = new Range$2(r1, options);
  r2 = new Range$2(r2, options);
  return r1.intersects(r2, options);
};
var intersects_1 = intersects$1;
const satisfies$2 = satisfies_1;
const compare$2 = compare_1;
var simplify = (versions, range2, options) => {
  const set = [];
  let first = null;
  let prev = null;
  const v = versions.sort((a, b) => compare$2(a, b, options));
  for (const version2 of v) {
    const included = satisfies$2(version2, range2, options);
    if (included) {
      prev = version2;
      if (!first) {
        first = version2;
      }
    } else {
      if (prev) {
        set.push([first, prev]);
      }
      prev = null;
      first = null;
    }
  }
  if (first) {
    set.push([first, null]);
  }
  const ranges = [];
  for (const [min, max] of set) {
    if (min === max) {
      ranges.push(min);
    } else if (!max && min === v[0]) {
      ranges.push("*");
    } else if (!max) {
      ranges.push(`>=${min}`);
    } else if (min === v[0]) {
      ranges.push(`<=${max}`);
    } else {
      ranges.push(`${min} - ${max}`);
    }
  }
  const simplified = ranges.join(" || ");
  const original = typeof range2.raw === "string" ? range2.raw : String(range2);
  return simplified.length < original.length ? simplified : range2;
};
const Range$1 = requireRange();
const Comparator$1 = requireComparator();
const { ANY } = Comparator$1;
const satisfies$1 = satisfies_1;
const compare$1 = compare_1;
const subset$1 = (sub, dom2, options = {}) => {
  if (sub === dom2) {
    return true;
  }
  sub = new Range$1(sub, options);
  dom2 = new Range$1(dom2, options);
  let sawNonNull = false;
  OUTER: for (const simpleSub of sub.set) {
    for (const simpleDom of dom2.set) {
      const isSub = simpleSubset(simpleSub, simpleDom, options);
      sawNonNull = sawNonNull || isSub !== null;
      if (isSub) {
        continue OUTER;
      }
    }
    if (sawNonNull) {
      return false;
    }
  }
  return true;
};
const minimumVersionWithPreRelease = [new Comparator$1(">=0.0.0-0")];
const minimumVersion = [new Comparator$1(">=0.0.0")];
const simpleSubset = (sub, dom2, options) => {
  if (sub === dom2) {
    return true;
  }
  if (sub.length === 1 && sub[0].semver === ANY) {
    if (dom2.length === 1 && dom2[0].semver === ANY) {
      return true;
    } else if (options.includePrerelease) {
      sub = minimumVersionWithPreRelease;
    } else {
      sub = minimumVersion;
    }
  }
  if (dom2.length === 1 && dom2[0].semver === ANY) {
    if (options.includePrerelease) {
      return true;
    } else {
      dom2 = minimumVersion;
    }
  }
  const eqSet = /* @__PURE__ */ new Set();
  let gt2, lt2;
  for (const c of sub) {
    if (c.operator === ">" || c.operator === ">=") {
      gt2 = higherGT(gt2, c, options);
    } else if (c.operator === "<" || c.operator === "<=") {
      lt2 = lowerLT(lt2, c, options);
    } else {
      eqSet.add(c.semver);
    }
  }
  if (eqSet.size > 1) {
    return null;
  }
  let gtltComp;
  if (gt2 && lt2) {
    gtltComp = compare$1(gt2.semver, lt2.semver, options);
    if (gtltComp > 0) {
      return null;
    } else if (gtltComp === 0 && (gt2.operator !== ">=" || lt2.operator !== "<=")) {
      return null;
    }
  }
  for (const eq2 of eqSet) {
    if (gt2 && !satisfies$1(eq2, String(gt2), options)) {
      return null;
    }
    if (lt2 && !satisfies$1(eq2, String(lt2), options)) {
      return null;
    }
    for (const c of dom2) {
      if (!satisfies$1(eq2, String(c), options)) {
        return false;
      }
    }
    return true;
  }
  let higher, lower;
  let hasDomLT, hasDomGT;
  let needDomLTPre = lt2 && !options.includePrerelease && lt2.semver.prerelease.length ? lt2.semver : false;
  let needDomGTPre = gt2 && !options.includePrerelease && gt2.semver.prerelease.length ? gt2.semver : false;
  if (needDomLTPre && needDomLTPre.prerelease.length === 1 && lt2.operator === "<" && needDomLTPre.prerelease[0] === 0) {
    needDomLTPre = false;
  }
  for (const c of dom2) {
    hasDomGT = hasDomGT || c.operator === ">" || c.operator === ">=";
    hasDomLT = hasDomLT || c.operator === "<" || c.operator === "<=";
    if (gt2) {
      if (needDomGTPre) {
        if (c.semver.prerelease && c.semver.prerelease.length && c.semver.major === needDomGTPre.major && c.semver.minor === needDomGTPre.minor && c.semver.patch === needDomGTPre.patch) {
          needDomGTPre = false;
        }
      }
      if (c.operator === ">" || c.operator === ">=") {
        higher = higherGT(gt2, c, options);
        if (higher === c && higher !== gt2) {
          return false;
        }
      } else if (gt2.operator === ">=" && !satisfies$1(gt2.semver, String(c), options)) {
        return false;
      }
    }
    if (lt2) {
      if (needDomLTPre) {
        if (c.semver.prerelease && c.semver.prerelease.length && c.semver.major === needDomLTPre.major && c.semver.minor === needDomLTPre.minor && c.semver.patch === needDomLTPre.patch) {
          needDomLTPre = false;
        }
      }
      if (c.operator === "<" || c.operator === "<=") {
        lower = lowerLT(lt2, c, options);
        if (lower === c && lower !== lt2) {
          return false;
        }
      } else if (lt2.operator === "<=" && !satisfies$1(lt2.semver, String(c), options)) {
        return false;
      }
    }
    if (!c.operator && (lt2 || gt2) && gtltComp !== 0) {
      return false;
    }
  }
  if (gt2 && hasDomLT && !lt2 && gtltComp !== 0) {
    return false;
  }
  if (lt2 && hasDomGT && !gt2 && gtltComp !== 0) {
    return false;
  }
  if (needDomGTPre || needDomLTPre) {
    return false;
  }
  return true;
};
const higherGT = (a, b, options) => {
  if (!a) {
    return b;
  }
  const comp = compare$1(a.semver, b.semver, options);
  return comp > 0 ? a : comp < 0 ? b : b.operator === ">" && a.operator === ">=" ? b : a;
};
const lowerLT = (a, b, options) => {
  if (!a) {
    return b;
  }
  const comp = compare$1(a.semver, b.semver, options);
  return comp < 0 ? a : comp > 0 ? b : b.operator === "<" && a.operator === "<=" ? b : a;
};
var subset_1 = subset$1;
const internalRe = reExports;
const constants = constants$1;
const SemVer2 = semver$1;
const identifiers = identifiers$1;
const parse = parse_1;
const valid = valid_1;
const clean = clean_1;
const inc = inc_1;
const diff = diff_1;
const major = major_1;
const minor = minor_1;
const patch = patch_1;
const prerelease = prerelease_1;
const compare = compare_1;
const rcompare = rcompare_1;
const compareLoose = compareLoose_1;
const compareBuild = compareBuild_1;
const sort = sort_1;
const rsort = rsort_1;
const gt = gt_1;
const lt = lt_1;
const eq = eq_1;
const neq = neq_1;
const gte = gte_1;
const lte = lte_1;
const cmp = cmp_1;
const coerce = coerce_1;
const Comparator = requireComparator();
const Range = requireRange();
const satisfies = satisfies_1;
const toComparators = toComparators_1;
const maxSatisfying = maxSatisfying_1;
const minSatisfying = minSatisfying_1;
const minVersion = minVersion_1;
const validRange = valid$1;
const outside = outside_1;
const gtr = gtr_1;
const ltr = ltr_1;
const intersects = intersects_1;
const simplifyRange = simplify;
const subset = subset_1;
var semver = {
  parse,
  valid,
  clean,
  inc,
  diff,
  major,
  minor,
  patch,
  prerelease,
  compare,
  rcompare,
  compareLoose,
  compareBuild,
  sort,
  rsort,
  gt,
  lt,
  eq,
  neq,
  gte,
  lte,
  cmp,
  coerce,
  Comparator,
  Range,
  satisfies,
  toComparators,
  maxSatisfying,
  minSatisfying,
  minVersion,
  validRange,
  outside,
  gtr,
  ltr,
  intersects,
  simplifyRange,
  subset,
  SemVer: SemVer2,
  re: internalRe.re,
  src: internalRe.src,
  tokens: internalRe.t,
  SEMVER_SPEC_VERSION: constants.SEMVER_SPEC_VERSION,
  RELEASE_TYPES: constants.RELEASE_TYPES,
  compareIdentifiers: identifiers.compareIdentifiers,
  rcompareIdentifiers: identifiers.rcompareIdentifiers
};
const RELEASE_URL = "https://api.github.com/repos/rubickCenter/rubick/releases";
const getLatestVersion = async (isCheckBetaUpdate = false) => {
  let res = "";
  try {
    res = await axios.get(RELEASE_URL, {
      headers: {
        Referer: "https://github.com"
      }
    }).then((r) => {
      const list = r.data;
      if (isCheckBetaUpdate) {
        const betaList = list.filter((item) => item.name.includes("beta"));
        return betaList[0].name;
      }
      const normalList = list.filter((item) => !item.name.includes("beta"));
      return normalList[0].name;
    });
  } catch (err) {
    console.log(err);
  }
  return res;
};
const version = pkg.version;
const downloadUrl = "https://github.com/rubickCenter/rubick/releases/latest";
const checkVersion = async () => {
  const res = await getLatestVersion();
  if (res !== "") {
    const latest = res;
    const result = compareVersion2Update(version, latest);
    if (result) {
      electron.dialog.showMessageBox({
        type: "info",
        title: "Rubick 更新提示",
        buttons: ["Yes", "No"],
        message: `发现新版本 v${latest}，是否更新？`
      }).then((res2) => {
        if (res2.response === 0) {
          electron.shell.openExternal(downloadUrl);
        }
      });
    }
  } else {
    return false;
  }
};
const compareVersion2Update = (current, latest) => {
  try {
    if (latest.includes("beta")) {
      return false;
    }
    return semver.lt(current, latest);
  } catch (e) {
    return false;
  }
};
const registerSystemPlugin = () => {
  const totalPlugins = global.LOCAL_PLUGINS.getLocalPlugins();
  let systemPlugins = totalPlugins.filter(
    (plugin) => plugin.pluginType === "system"
  );
  systemPlugins = systemPlugins.map((plugin) => {
    try {
      const pluginPath = path.resolve(
        PLUGIN_INSTALL_DIR,
        "node_modules",
        plugin.name
      );
      return {
        ...plugin,
        indexPath: path.join(pluginPath, "./", plugin.entry)
      };
    } catch (e) {
      return false;
    }
  }).filter(Boolean);
  const hooks = {
    onReady: []
  };
  systemPlugins.forEach((plugin) => {
    if (fs$1.existsSync(plugin.indexPath)) {
      const pluginModule = __non_webpack_require__(plugin.indexPath)();
      hooks.onReady.push(pluginModule.onReady);
    }
  });
  const triggerReadyHooks = (ctx) => {
    hooks.onReady.forEach((hook) => {
      try {
        hook && hook(ctx);
      } catch (e) {
        console.log(e);
      }
    });
  };
  return {
    triggerReadyHooks
  };
};
global.appSearch = appSearch$1;
global.PluginHandler = AdapterHandler;
class App {
  windowCreator;
  systemPlugins;
  constructor() {
    electron.protocol.registerSchemesAsPrivileged([
      { scheme: "app", privileges: { secure: true, standard: true } }
    ]);
    this.windowCreator = main();
    const gotTheLock = electron.app.requestSingleInstanceLock();
    if (!gotTheLock) {
      electron.app.quit();
    } else {
      this.systemPlugins = registerSystemPlugin();
      this.beforeReady();
      this.onReady();
      this.onRunning();
      this.onQuit();
    }
  }
  beforeReady() {
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
  }
  createWindow() {
    this.windowCreator.init();
  }
  onReady() {
    const readyFunction = async () => {
      checkVersion();
      await localConfig.init();
      const config = await localConfig.getConfig();
      if (!config.perf.common.guide) {
        guide().init();
        config.perf.common.guide = true;
        localConfig.setConfig(config);
      }
      this.createWindow();
      const mainWindow = this.windowCreator.getWindow();
      API$1.init(mainWindow);
      createTray(this.windowCreator.getWindow());
      registerHotKey(this.windowCreator.getWindow());
      this.systemPlugins.triggerReadyHooks(
        Object.assign(electron, {
          mainWindow: this.windowCreator.getWindow(),
          API: API$1
        })
      );
    };
    if (!electron.app.isReady()) {
      electron.app.on("ready", readyFunction);
    } else {
      readyFunction();
    }
  }
  onRunning() {
    electron.app.on("second-instance", (event, commandLine, workingDirectory) => {
      const files = getSearchFiles(commandLine, workingDirectory);
      const win2 = this.windowCreator.getWindow();
      if (win2) {
        if (win2.isMinimized()) {
          win2.restore();
        }
        win2.focus();
        if (files.length > 0) {
          win2.show();
          putFileToRubick(win2.webContents, files);
        }
      }
    });
    electron.app.on("activate", () => {
      if (!this.windowCreator.getWindow()) {
        this.createWindow();
      }
    });
    if (commonConst.windows()) ;
  }
  onQuit() {
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
}
const index = new App();
module.exports = index;
//# sourceMappingURL=index.js.map
