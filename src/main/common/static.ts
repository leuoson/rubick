import path from 'path';
import { app } from 'electron';

export const isDev = () => !app.isPackaged;

export const getStaticPath = () =>
  isDev() ? path.join(process.cwd(), 'public') : path.join(process.resourcesPath, 'static');

export const resolveStatic = (...args: string[]) => path.join(getStaticPath(), ...args);

// 为兼容旧代码，暴露全局 __static
(global as any).__static = getStaticPath();

export const getPreloadPath = () =>
  resolveStatic('preload.js');
