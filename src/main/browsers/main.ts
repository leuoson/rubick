import { app, BrowserWindow, protocol, nativeTheme } from 'electron';
import path from 'path';
import localConfig from '@/main/common/initLocalConfig';
import {
  WINDOW_HEIGHT,
  WINDOW_MIN_HEIGHT,
  WINDOW_WIDTH,
} from '@/common/constans/common';
import { getPreloadPath } from '@/main/common/static';

let remoteInitialized = false;

export default () => {
  let win: any;

  const init = () => {
    // 确保 @electron/remote 在 app ready 后初始化
    if (!remoteInitialized) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@electron/remote/main').initialize();
      remoteInitialized = true;
    }
    createWindow();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('@electron/remote/main').enable(win.webContents);
  };

  const createWindow = async () => {
    win = new BrowserWindow({
      height: WINDOW_HEIGHT,
      minHeight: WINDOW_MIN_HEIGHT,
      useContentSize: true,
      resizable: true,
      width: WINDOW_WIDTH,
      frame: false,
      title: '拉比克',
      show: false,
      skipTaskbar: true,
      backgroundColor: nativeTheme.shouldUseDarkColors ? '#1c1c28' : '#fff',
      webPreferences: {
        webSecurity: false,
        backgroundThrottling: false,
        contextIsolation: false,
        webviewTag: true,
        nodeIntegration: true,
        preload: getPreloadPath(),
        spellcheck: false,
      },
    });
    const devServerUrl = process.env.ELECTRON_RENDERER_URL;
    if (devServerUrl) {
      win.loadURL(devServerUrl);
    } else {
      win.loadFile(path.join(__dirname, '..', '..', 'renderer', 'index.html'));
    }
    protocol.interceptFileProtocol('image', (req, callback) => {
      const url = req.url.substr(8);
      callback(decodeURI(url));
    });
    win.on('closed', () => {
      win = undefined;
    });

    win.on('show', () => {
      // 触发主窗口的 onShow hook
      win.webContents.executeJavaScript(
        `window.rubick && window.rubick.hooks && typeof window.rubick.hooks.onShow === "function" && window.rubick.hooks.onShow()`
      ).catch(e => console.error('[Show Hook Error]', e));
    });

    // 捕获 renderer 错误并输出到终端
    win.webContents.on('console-message', (event, level, message, line, sourceId) => {
      console.log(`[Renderer] ${message}`);
    });
    win.webContents.on('preload-error', (event, preloadPath, error) => {
      console.error(`[Preload Error] ${preloadPath}:`, error);
    });
    win.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
      console.error(`[Load Error] ${errorCode}: ${errorDescription}`);
    });

    // 开发模式下自动打开 DevTools
    if (process.env.ELECTRON_RENDERER_URL) {
      win.once('ready-to-show', () => {
        win.show();
        win.webContents.openDevTools({ mode: 'detach' });
      });
    }

    win.on('hide', () => {
      // 触发主窗口的 onHide hook
      win.webContents.executeJavaScript(
        `window.rubick && window.rubick.hooks && typeof window.rubick.hooks.onHide === "function" && window.rubick.hooks.onHide()`
      ).catch(e => console.error('[Hide Hook Error]', e));
    });

    // 判断失焦是否隐藏
    win.on('blur', async () => {
      const config = await localConfig.getConfig();
      if (config.perf.common.hideOnBlur) {
        win.hide();
      }
    });
  };

  const getWindow = () => win;

  return {
    init,
    getWindow,
  };
};
