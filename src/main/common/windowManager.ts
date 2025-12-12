/**
 * 窗口管理器 - 用于在模块间共享主窗口引用
 * 避免循环依赖问题
 */
import { BrowserWindow } from 'electron';

let mainWindow: BrowserWindow | null = null;

export const windowManager = {
  setMainWindow(win: BrowserWindow) {
    mainWindow = win;
  },
  
  getMainWindow(): BrowserWindow | null {
    return mainWindow;
  },
  
  hideMainWindow() {
    mainWindow?.hide();
  },
  
  showMainWindow() {
    mainWindow?.show();
  },
};

export default windowManager;
