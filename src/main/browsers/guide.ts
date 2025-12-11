import { BrowserWindow, ipcMain, nativeTheme, screen } from 'electron';
import {
  GUIDE_WIDTH,
  WINDOW_MIN_HEIGHT,
  GUIDE_HEIGHT,
} from '@/common/constans/common';
import { resolveStatic } from '@/main/common/static';

const getWindowPos = (width, height) => {
  const screenPoint = screen.getCursorScreenPoint();
  const displayPoint = screen.getDisplayNearestPoint(screenPoint);
  return [
    displayPoint.bounds.x + Math.round((displayPoint.bounds.width - width) / 2),
    displayPoint.bounds.y +
      Math.round((displayPoint.bounds.height - height) / 2),
  ];
};

let win: any;

export default () => {
  const init = () => {
    if (win) return;
    ipcMain.on('guide:service', async (event, arg: { type: string }) => {
      const data = await operation[arg.type]();
      event.returnValue = data;
    });
    createWindow();
  };

  const createWindow = async () => {
    const [x, y] = getWindowPos(800, 600);
    win = new BrowserWindow({
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
        spellcheck: false,
      },
    });
    win.loadURL(`file://${resolveStatic('guide/index.html')}`);
    win.on('closed', () => {
      win = undefined;
    });

    win.once('ready-to-show', () => {
      // win.webContents.openDevTools();
      win.show();
    });
  };
  const getWindow = () => win;

  const operation = {
    close: () => {
      win.close();
      win = null;
    },
  };

  return {
    init,
    getWindow,
  };
};
