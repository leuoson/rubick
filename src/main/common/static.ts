import path from 'path';
import { app } from 'electron';

export const isDev = () => !app.isPackaged;

export const getStaticPath = () =>
  isDev() ? path.join(process.cwd(), 'public') : path.join(process.resourcesPath, 'static');

export const resolveStatic = (...args: string[]) => path.join(getStaticPath(), ...args);

// 为兼容旧代码，暴露全局 __static
(global as any).__static = getStaticPath();

export const getPreloadPath = () => {
  // 开发模式和生产模式都使用 electron-vite 构建的 preload
  if (isDev()) {
    return path.join(process.cwd(), 'out', 'preload', 'index.js');
  }
  // 生产模式：preload 在 app.asar 内
  return path.join(__dirname, '..', 'preload', 'index.js');
};
