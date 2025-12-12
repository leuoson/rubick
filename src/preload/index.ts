// @ts-nocheck
/* eslint-disable @typescript-eslint/no-var-requires */
const { ipcRenderer, shell } = require('electron');

// 等待主进程准备完成
const waitForMainProcessReady = async (maxRetries = 50, interval = 100): Promise<boolean> => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const ready = await ipcRenderer.invoke('main-process-ready');
      if (ready) return true;
    } catch (e) {
      // IPC 错误，继续重试
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  console.error('[Preload] Main process not ready after max retries');
  return false;
};

// 暴露到 window
(window as any).waitForMainProcessReady = waitForMainProcessReady;
const os = require('os');
const path = require('path');

let remote;
let BrowserWindow, nativeTheme, screen, app;
try {
  remote = require('@electron/remote');
  BrowserWindow = remote.BrowserWindow;
  nativeTheme = remote.nativeTheme;
  screen = remote.screen;
  app = remote.app;
} catch (e) {
  console.error('[Preload] Failed to load @electron/remote:', e);
}

// 兼容 __static
let staticBase;
try {
  staticBase = app?.isPackaged
    ? path.join(process.resourcesPath, 'static')
    : path.join(process.cwd(), 'public');
} catch (e) {
  staticBase = path.join(process.cwd(), 'public');
  console.error('[Preload] Failed to determine static path:', e);
}
(global as any).__static = staticBase;
// 兼容 renderer 直接使用 __static
;(window as any).__static = staticBase;

let appPath, baseDir;
try {
  appPath = app?.getPath('userData') || path.join(os.homedir(), '.rubick');
  baseDir = path.join(appPath, './rubick-plugins-new');
} catch (e) {
  appPath = path.join(os.homedir(), '.rubick');
  baseDir = path.join(appPath, './rubick-plugins-new');
  console.error('[Preload] Failed to get userData path:', e);
}

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

// preload 暴露的全局 API
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

  shellOpenPath(pathStr) {
    shell.openPath(pathStr);
  },

  getLocalId: () => ipcSendSync('getLocalId'),

  removePlugin() {
    ipcSend('removePlugin');
  },

  shellShowItemInFolder: (pathStr) => {
    ipcSend('shellShowItemInFolder', { path: pathStr });
  },

  redirect: (label, payload) => {
    // todo
  },

  shellBeep: () => {
    ipcSend('shellBeep');
  },

  getFileIcon: (pathStr) => {
    return ipcSendSync('getFileIcon', { path: pathStr });
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
     * @param {Array<{role: 'system'|'user'|'assistant', content: string|Array}>} options.messages - 消息列表（支持多模态）
     * @param {number} [options.temperature] - 温度参数
     * @param {number} [options.maxTokens] - 最大 token 数
     * @returns {{success: boolean, content?: string, error?: string, usage?: Object}}
     */
    chat: (options) => ipcSendSync('aiChat', options),

    /**
     * 发起 AI 流式聊天请求
     * @param {Object} options - 同 chat 方法参数
     * @param {Function} onEvent - 事件回调函数 ({type, content?, error?, usage?}) => void
     *   type: 'start' | 'delta' | 'done' | 'error' | 'usage'
     * @returns {{requestId: string, cancel: Function, unsubscribe: Function}}
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
            usage: data.usage,
          });

          // 完成或错误时自动清理监听器
          if (data.type === 'done' || data.type === 'error') {
            ipcRenderer.removeListener('ai-stream-event', handler);
          }
        }
      };

      ipcRenderer.on('ai-stream-event', handler);

      // 取消请求函数
      const cancel = () => {
        ipcSendSync('aiChatCancel', { requestId });
        ipcRenderer.removeListener('ai-stream-event', handler);
      };

      // 仅取消订阅（不中断请求）
      const unsubscribe = () => {
        ipcRenderer.removeListener('ai-stream-event', handler);
      };

      return { requestId, cancel, unsubscribe };
    },

    /**
     * 取消指定的流式请求
     * @param {string} requestId - 请求 ID
     * @returns {boolean} 是否成功取消
     */
    cancelStream: (requestId) => ipcSendSync('aiChatCancel', { requestId }),
  },

  // ==================== 文件系统 API ====================
  fs: {
    /**
     * 读取文件内容
     * @param {string} path - 文件路径
     * @param {string} [encoding='utf-8'] - 编码
     * @returns {{success: boolean, content?: string, error?: string}}
     */
    readFile: (path, encoding = 'utf-8') => ipcSendSync('fsReadFile', { path, encoding }),

    /**
     * 写入文件内容（自动创建目录）
     * @param {string} path - 文件路径
     * @param {string} content - 文件内容
     * @returns {{success: boolean, error?: string}}
     */
    writeFile: (path, content) => ipcSendSync('fsWriteFile', { path, content }),

    /**
     * 删除文件
     * @param {string} path - 文件路径
     * @returns {{success: boolean, error?: string}}
     */
    deleteFile: (path) => ipcSendSync('fsDeleteFile', { path }),

    /**
     * 重命名/移动文件
     * @param {string} oldPath - 原路径
     * @param {string} newPath - 新路径
     * @returns {{success: boolean, error?: string}}
     */
    renameFile: (oldPath, newPath) => ipcSendSync('fsRenameFile', { oldPath, newPath }),

    /**
     * 检查文件是否存在
     * @param {string} path - 文件路径
     * @returns {{success: boolean, exists?: boolean, error?: string}}
     */
    exists: (path) => ipcSendSync('fsExists', { path }),

    /**
     * 读取目录内容
     * @param {string} path - 目录路径
     * @returns {{success: boolean, entries?: Array, error?: string}}
     */
    readDir: (path) => ipcSendSync('fsReadDir', { path }),

    /**
     * 递归读取目录树
     * @param {string} path - 目录路径
     * @param {Object} [options] - 选项
     * @param {number} [options.maxDepth=10] - 最大深度
     * @param {string[]} [options.excludePatterns] - 排除模式
     * @returns {{success: boolean, entries?: Array, error?: string}}
     */
    readDirRecursive: (path, options = {}) => ipcSendSync('fsReadDirRecursive', { path, ...options }),

    /**
     * 创建目录
     * @param {string} path - 目录路径
     * @returns {{success: boolean, error?: string}}
     */
    mkdir: (path) => ipcSendSync('fsMkdir', { path }),

    /**
     * 删除目录（递归）
     * @param {string} path - 目录路径
     * @returns {{success: boolean, error?: string}}
     */
    rmdir: (path) => ipcSendSync('fsRmdir', { path }),

    /**
     * 获取文件/目录信息
     * @param {string} path - 文件路径
     * @returns {{success: boolean, stat?: Object, error?: string}}
     */
    stat: (path) => ipcSendSync('fsStat', { path }),

    /**
     * 复制文件
     * @param {string} srcPath - 源文件路径
     * @param {string} destPath - 目标文件路径
     * @returns {{success: boolean, error?: string}}
     */
    copyFile: (srcPath, destPath) => ipcSendSync('fsCopyFile', { srcPath, destPath }),
  },

  // ==================== 进程管理 API ====================
  process: {
    /**
     * 启动进程
     * @param {Object} options - 选项
     * @param {string} options.id - 进程 ID
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
    getStatus: (id) => ipcSendSync('processStatus', { id }),

    /**
     * 列出所有进程
     * @returns {Array<{id: string, running: boolean, pid?: number, command: string}>}
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

  createBrowserWindow: (url, options, callback) => {
    if (!BrowserWindow) {
      console.error('[Preload] BrowserWindow not available');
      return null;
    }
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
};

// ==================== 为 renderer 暴露额外的 Node.js 功能 ====================
const { nativeImage, clipboard } = require('electron');
let getGlobal, Menu;
try {
  const remoteModule = require('@electron/remote');
  getGlobal = remoteModule.getGlobal;
  Menu = remoteModule.Menu;
} catch (e) {
  console.error('[Preload] Failed to get remote functions:', e);
}

// 暴露常用模块和函数到 window
(window as any).electron = { nativeImage, clipboard, ipcRenderer, shell };
(window as any).electronRemote = { getGlobal, app, BrowserWindow, nativeTheme, screen, Menu };
(window as any).nodePath = path;
(window as any).nodeOs = os;
(window as any).childProcess = { exec: require('child_process').exec };

// 暴露插件相关常量
(window as any).PLUGIN_INSTALL_DIR = baseDir;
