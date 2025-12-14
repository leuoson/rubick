const { ipcRenderer, shell } = require('electron');
const { BrowserWindow, nativeTheme, screen, app, Menu } = require('@electron/remote');
const os = require('os');
const path = require('path');

const appPath = app.getPath('userData');

const baseDir = path.join(appPath, './rubick-plugins-new');

const ipcSendSync = (type, data) => {
  const returnValue = ipcRenderer.sendSync('msg-trigger', {
    type,
    data,
  });
  if (returnValue instanceof Error) throw returnValue;
  return returnValue;
};

const ipcSend = (type, data) => {
  ipcRenderer.send('msg-trigger', {
    type,
    data,
  });
};

window.rubick = {
  hooks: {},
  __event__: {},
  // 事件
  onPluginEnter(cb) {
    typeof cb === 'function' && (window.rubick.hooks.onPluginEnter = cb);
  },
  onPluginReady(cb) {
    typeof cb === 'function' && (window.rubick.hooks.onPluginReady = cb);
  },
  onPluginOut(cb) {
    typeof cb === 'function' && (window.rubick.hooks.onPluginOut = cb);
  },
  openPlugin(plugin) {
    ipcSendSync('loadPlugin', plugin);
  },
  onShow(cb) {
    typeof cb === 'function' && (window.rubick.hooks.onShow = cb);
  },
  onHide(cb) {
    typeof cb === 'function' && (window.rubick.hooks.onHide = cb);
  },
  // 窗口交互
  hideMainWindow() {
    ipcSendSync('hideMainWindow');
  },
  showMainWindow() {
    ipcSendSync('showMainWindow');
  },
  showOpenDialog(options) {
    return ipcSendSync('showOpenDialog', options);
  },
  showSaveDialog(options) {
    return ipcSendSync('showSaveDialog', options);
  },

  setExpendHeight(height) {
    ipcSendSync('setExpendHeight', height);
  },
  setSubInput(onChange, placeholder = '', isFocus) {
    typeof onChange === 'function' &&
      (window.rubick.hooks.onSubInputChange = onChange);
    ipcSendSync('setSubInput', {
      placeholder,
      isFocus,
    });
  },
  removeSubInput() {
    delete window.rubick.hooks.onSubInputChange;
    ipcSendSync('removeSubInput');
  },
  setSubInputValue(text) {
    ipcSendSync('setSubInputValue', { text });
  },
  subInputBlur() {
    ipcSendSync('subInputBlur');
  },
  getPath(name) {
    return ipcSendSync('getPath', { name });
  },
  showNotification(body, clickFeatureCode) {
    ipcSend('showNotification', { body, clickFeatureCode });
  },
  copyImage(img) {
    return ipcSendSync('copyImage', { img });
  },
  copyText(text) {
    return ipcSendSync('copyText', { text });
  },
  copyFile: (file) => {
    return ipcSendSync('copyFile', { file });
  },
  db: {
    put: (data) => ipcSendSync('dbPut', { data }),
    get: (id) => ipcSendSync('dbGet', { id }),
    remove: (doc) => ipcSendSync('dbRemove', { doc }),
    bulkDocs: (docs) => ipcSendSync('dbBulkDocs', { docs }),
    allDocs: (key) => ipcSendSync('dbAllDocs', { key }),
    postAttachment: (docId, attachment, type) =>
      ipcSendSync('dbPostAttachment', { docId, attachment, type }),
    getAttachment: (docId) => ipcSendSync('dbGetAttachment', { docId }),
    getAttachmentType: (docId) => ipcSendSync('dbGetAttachmentType', { docId }),
  },
  dbStorage: {
    setItem: (key, value) => {
      const target = { _id: String(key) };
      const result = ipcSendSync('dbGet', { id: target._id });
      result && (target._rev = result._rev);
      target.value = value;
      const res = ipcSendSync('dbPut', { data: target });
      if (res.error) throw new Error(res.message);
    },
    getItem: (key) => {
      const res = ipcSendSync('dbGet', { id: key });
      return res && 'value' in res ? res.value : null;
    },
    removeItem: (key) => {
      const res = ipcSendSync('dbGet', { id: key });
      res && ipcSendSync('dbRemove', { doc: res });
    },
  },
  isDarkColors() {
    return false;
  },
  getFeatures() {
    return ipcSendSync('getFeatures');
  },
  setFeature(feature) {
    return ipcSendSync('setFeature', { feature });
  },
  screenCapture(cb) {
    typeof cb === 'function' &&
      (window.rubick.hooks.onScreenCapture = ({ data }) => {
        cb(data);
      });
    ipcSendSync('screenCapture');
  },
  removeFeature(code) {
    return ipcSendSync('removeFeature', { code });
  },

  // 系统
  shellOpenExternal(url) {
    shell.openExternal(url);
  },

  isMacOs() {
    return os.type() === 'Darwin';
  },

  isWindows() {
    return os.type() === 'Windows_NT';
  },

  isLinux() {
    return os.type() === 'Linux';
  },

  shellOpenPath(path) {
    shell.openPath(path);
  },

  getLocalId: () => ipcSendSync('getLocalId'),

  removePlugin() {
    ipcSend('removePlugin');
  },

  shellShowItemInFolder: (path) => {
    ipcSend('shellShowItemInFolder', { path });
  },

  redirect: (label, payload) => {
    // todo
  },

  shellBeep: () => {
    ipcSend('shellBeep');
  },

  getFileIcon: (path) => {
    return ipcSendSync('getFileIcon', { path });
  },

  getCopyedFiles: () => {
    return ipcSendSync('getCopyFiles');
  },

  simulateKeyboardTap: (key, ...modifier) => {
    ipcSend('simulateKeyboardTap', { key, modifier });
  },

  getCursorScreenPoint: () => {
    return screen.getCursorScreenPoint();
  },

  getDisplayNearestPoint: (point) => {
    return screen.getDisplayNearestPoint(point);
  },

  outPlugin: () => {
    return ipcSend('removePlugin');
  },

  // ==================== 文件系统 API ====================
  fs: {
    /**
     * 读取文件内容
     * @param {string} filePath - 文件路径
     * @param {string} [encoding='utf-8'] - 编码
     * @returns {{success: boolean, content?: string, error?: string}}
     */
    readFile: (filePath, encoding = 'utf-8') => ipcSendSync('fsReadFile', { path: filePath, encoding }),

    /**
     * 写入文件内容（自动创建目录）
     * @param {string} filePath - 文件路径
     * @param {string} content - 文件内容
     * @returns {{success: boolean, error?: string}}
     */
    writeFile: (filePath, content) => ipcSendSync('fsWriteFile', { path: filePath, content }),

    /**
     * 删除文件
     * @param {string} filePath - 文件路径
     * @returns {{success: boolean, error?: string}}
     */
    deleteFile: (filePath) => ipcSendSync('fsDeleteFile', { path: filePath }),

    /**
     * 重命名/移动文件
     * @param {string} oldPath - 原路径
     * @param {string} newPath - 新路径
     * @returns {{success: boolean, error?: string}}
     */
    renameFile: (oldPath, newPath) => ipcSendSync('fsRenameFile', { oldPath, newPath }),

    /**
     * 检查文件是否存在
     * @param {string} filePath - 文件路径
     * @returns {{success: boolean, exists?: boolean, error?: string}}
     */
    exists: (filePath) => ipcSendSync('fsExists', { path: filePath }),

    /**
     * 读取目录内容
     * @param {string} dirPath - 目录路径
     * @returns {{success: boolean, entries?: Array, error?: string}}
     */
    readDir: (dirPath) => ipcSendSync('fsReadDir', { path: dirPath }),

    /**
     * 递归读取目录树
     * @param {string} dirPath - 目录路径
     * @param {Object} [options] - 选项
     * @returns {{success: boolean, entries?: Array, error?: string}}
     */
    readDirRecursive: (dirPath, options = {}) => ipcSendSync('fsReadDirRecursive', { path: dirPath, ...options }),

    /**
     * 创建目录
     * @param {string} dirPath - 目录路径
     * @returns {{success: boolean, error?: string}}
     */
    mkdir: (dirPath) => ipcSendSync('fsMkdir', { path: dirPath }),

    /**
     * 删除目录（递归）
     * @param {string} dirPath - 目录路径
     * @returns {{success: boolean, error?: string}}
     */
    rmdir: (dirPath) => ipcSendSync('fsRmdir', { path: dirPath }),

    /**
     * 获取文件信息
     * @param {string} filePath - 文件路径
     * @returns {{success: boolean, stat?: Object, error?: string}}
     */
    stat: (filePath) => ipcSendSync('fsStat', { path: filePath }),

    /**
     * 复制文件
     * @param {string} srcPath - 源路径
     * @param {string} destPath - 目标路径
     * @returns {{success: boolean, error?: string}}
     */
    copyFile: (srcPath, destPath) => ipcSendSync('fsCopyFile', { srcPath, destPath }),
  },

  // ==================== 进程管理 API ====================
  process: {
    /**
     * 启动进程（如开发服务器）
     * @param {Object} options
     * @param {string} options.id - 进程唯一 ID
     * @param {string} options.command - 命令
     * @param {string[]} [options.args] - 参数
     * @param {string} options.cwd - 工作目录
     * @param {Object} [options.env] - 环境变量
     * @returns {{success: boolean, error?: string}}
     */
    spawn: (options) => ipcSendSync('processSpawn', options),

    /**
     * 停止进程
     * @param {string} id - 进程 ID
     * @returns {{success: boolean, error?: string}}
     */
    kill: (id) => ipcSendSync('processKill', { id }),

    /**
     * 获取进程状态
     * @param {string} id - 进程 ID
     * @returns {{exists: boolean, running?: boolean, pid?: number, output?: string[]}}
     */
    getStatus: (id) => ipcSendSync('processGetStatus', { id }),

    /**
     * 列出所有托管进程
     * @returns {Array<{id: string, running: boolean, command: string}>}
     */
    list: () => ipcSendSync('processList'),

    /**
     * 向进程发送输入
     * @param {string} id - 进程 ID
     * @param {string} input - 输入内容
     * @returns {{success: boolean, error?: string}}
     */
    write: (id, input) => ipcSendSync('processWrite', { id, input }),
  },

  // ==================== Esbuild API ====================
  esbuild: {
    /**
     * 编译项目
     * @param {Object} options
     * @param {string} options.projectPath - 项目路径
     * @param {string} [options.entryPoint] - 入口文件
     * @param {string} [options.outdir] - 输出目录
     * @returns {{success: boolean, outputFiles?: Array, error?: string}}
     */
    build: (options) => ipcSendSync('esbuildBuild', options),

    /**
     * 启动开发服务器
     * @param {Object} options
     * @param {string} options.projectPath - 项目路径
     * @param {number} [options.port] - 端口号
     * @returns {{success: boolean, url?: string, port?: number, error?: string}}
     */
    serve: (options) => ipcSendSync('esbuildServe', options),

    /**
     * 停止开发服务器
     * @param {string} projectPath - 项目路径
     * @returns {{success: boolean, error?: string}}
     */
    stopServer: (projectPath) => ipcSendSync('esbuildStopServer', { projectPath }),

    /**
     * 获取所有运行中的服务器
     * @returns {Array<{projectPath: string, port: number}>}
     */
    listServers: () => ipcSendSync('esbuildListServers'),
  },

  // ==================== AI API ====================
  ai: {
    /**
     * 获取可用的 AI 提供商列表（不含 API Key）
     * @returns {Array<{id: string, name: string, type: string, models: string[], enabled: boolean}>}
     */
    getProviders: () => ipcSendSync('getAIProviders'),

    /**
     * 获取默认的 AI 提供商和模型配置
     * @returns {{providerId: string, model: string}}
     */
    getDefaultConfig: () => ipcSendSync('getAIDefaultConfig'),

    /**
     * 发起 AI 聊天请求（同步，非流式）
     * @param {Object} options
     * @param {string} options.providerId - AI 提供商 ID
     * @param {string} options.model - 模型名称
     * @param {Array<{role: 'system'|'user'|'assistant', content: string}>} options.messages - 消息列表
     * @param {number} [options.temperature] - 温度参数
     * @param {number} [options.maxTokens] - 最大 token 数
     * @returns {{success: boolean, content?: string, error?: string, usage?: Object}}
     */
    chat: (options) => ipcSendSync('aiChat', options),

    /**
     * 发起 AI 流式聊天请求
     * @param {Object} options - 同 chat 方法参数
     * @param {Function} onEvent - 事件回调函数 ({type, content?, error?}) => void
     *   type: 'start' | 'delta' | 'done' | 'error'
     * @returns {Function} 取消订阅函数
     */
    chatStream: (options, onEvent) => {
      const result = ipcSendSync('aiChatStream', options);
      const requestId = result.requestId;

      const handler = (event, data) => {
        if (data.requestId === requestId) {
          onEvent({
            type: data.type,
            content: data.content,
            error: data.error,
          });

          // 完成或错误时自动清理监听器
          if (data.type === 'done' || data.type === 'error') {
            ipcRenderer.removeListener('ai-stream-event', handler);
          }
        }
      };

      ipcRenderer.on('ai-stream-event', handler);

      // 返回取消订阅函数
      return () => {
        ipcRenderer.removeListener('ai-stream-event', handler);
      };
    },
  },

  createBrowserWindow: (url, options, callback) => {
    const winUrl = path.resolve(baseDir, 'node_modules', options.name);
    const winIndex = `file://${path.join(winUrl, './', url || '')}`;
    const preloadPath = path.join(
      winUrl,
      './',
      options.webPreferences.preload || ''
    );
    let win = new BrowserWindow({
      useContentSize: true,
      resizable: true,
      title: '拉比克',
      show: false,
      backgroundColor: nativeTheme.shouldUseDarkColors ? '#1c1c28' : '#fff',
      ...options,
      webPreferences: {
        webSecurity: false,
        backgroundThrottling: false,
        contextIsolation: false,
        webviewTag: true,
        nodeIntegration: true,
        spellcheck: false,
        partition: null,
        ...(options.webPreferences || {}),
        preload: preloadPath,
      },
    });
    win.loadURL(winIndex);

    win.on('closed', () => {
      win = undefined;
    });
    win.once('ready-to-show', () => {
      win.show();
    });
    win.webContents.on('dom-ready', () => {
      callback && callback();
    });
    return win;
  },

  /**
   * 打开预览窗口 - 用于预览任意本地项目
   * @param {string} projectPath - 项目路径（绝对路径）
   * @param {Object} options - 窗口选项
   * @param {string} options.entry - 入口文件，默认 'index.html'
   * @param {string} options.title - 窗口标题
   * @param {number} options.width - 窗口宽度
   * @param {number} options.height - 窗口高度
   * @param {Function} callback - 加载完成回调
   * @returns {BrowserWindow}
   */
  openPreviewWindow: (projectPath, options = {}, callback) => {
    const {
      entry = 'index.html',
      title = '预览',
      width = 1024,
      height = 768,
    } = options;

    // 规范化路径
    const normalizedPath = projectPath.replace(/\\/g, '/');
    const indexPath = `file:///${normalizedPath}/${entry}`.replace(/\/+/g, '/').replace('file:/', 'file:///');

    let previewWin = new BrowserWindow({
      width,
      height,
      useContentSize: true,
      resizable: true,
      title,
      show: false,
      backgroundColor: nativeTheme.shouldUseDarkColors ? '#1c1c28' : '#fff',
      webPreferences: {
        webSecurity: false,
        backgroundThrottling: false,
        contextIsolation: false,
        webviewTag: true,
        nodeIntegration: true,
        spellcheck: false,
        partition: null,
        preload: path.join(__dirname, 'preload.js'),
      },
    });

    previewWin.loadURL(indexPath);

    previewWin.on('closed', () => {
      previewWin = undefined;
    });

    previewWin.once('ready-to-show', () => {
      previewWin.show();
    });

    previewWin.webContents.on('dom-ready', () => {
      callback && callback();
    });

    // 打开开发者工具（方便调试）
    // previewWin.webContents.openDevTools();

    return previewWin;
  },
};

// ==================== 为 renderer 暴露额外的 Node.js 功能 ====================
// 这些功能供 renderer 通过 window.xxx 访问，避免 Vite 构建问题

const { nativeImage, clipboard } = require('electron');
const { getGlobal } = require('@electron/remote');
const { exec } = require('child_process');

// 暴露 __static 路径
window.__static = app.isPackaged
  ? path.join(process.resourcesPath, 'static')
  : path.join(process.cwd(), 'public');

// 暴露常用模块和函数到 window
window.electron = { nativeImage, clipboard, ipcRenderer, shell };
window.electronRemote = { getGlobal, app, BrowserWindow, nativeTheme, screen, Menu };
window.nodePath = path;
window.nodeOs = os;
window.childProcess = { exec };

// 暴露插件相关常量
window.PLUGIN_INSTALL_DIR = baseDir;
