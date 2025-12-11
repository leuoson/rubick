// @ts-nocheck
/* eslint-disable @typescript-eslint/no-var-requires */
const { ipcRenderer, shell } = require('electron');
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
};
