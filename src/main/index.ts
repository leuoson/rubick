'use strict';
/**
 * Electron 主进程入口
 * 
 * 架构说明：
 * - 所有依赖 app.getPath() 等 app API 的模块必须在 app.whenReady() 后才能加载
 * - 使用动态 import() 延迟加载这些模块，避免时序问题
 * - 只有不依赖 app API 的模块可以在顶层静态导入
 */
import electron, {
  app,
  globalShortcut,
  protocol,
  BrowserWindow,
  ipcMain,
} from 'electron';

// 主进程准备状态标志
let mainProcessReady = false;

// renderer 可以通过 IPC 查询主进程是否准备好
ipcMain.handle('main-process-ready', () => mainProcessReady);

// ============ 以下模块不依赖 app API，可以安全地静态导入 ============
import commonConst from '../common/utils/commonConst';
import { macBeforeOpen } from './common/getSearchFiles';

// ============ 以下模块依赖 app API，必须在 app ready 后动态导入 ============
// - ./common/static (使用 app.isPackaged)
// - ./browsers (间接依赖 db -> app.getPath)
// - ../core (可能依赖 app API)
// - ./common/api (依赖 db)
// - ./common/tray
// - ./common/registerHotKey
// - ./common/initLocalConfig (依赖 db -> app.getPath)
// - ./common/versionHandler
// - ./common/registerSystemPlugin
// - ../common/utils/localPlugin

// 必须在 app ready 之前注册 scheme
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { secure: true, standard: true } },
]);

// 请求单实例锁
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  // ============ beforeReady: 在 app ready 之前执行的操作 ============
  if (commonConst.macOS()) {
    macBeforeOpen();
    if (commonConst.production() && !app.isInApplicationsFolder()) {
      app.moveToApplicationsFolder();
    } else {
      app.dock?.hide();
    }
  } else {
    app.disableHardwareAcceleration();
  }

  // ============ app ready 后初始化 ============
  app.whenReady().then(async () => {
    // 动态导入依赖 app API 的模块
    // static 模块只需要副作用（设置 __static），单独导入
    await import('./common/static');
    
    const [
      { main, guide },
      { default: appSearch },
      { PluginHandler },
      { default: API },
      { default: createTray },
      { default: registerHotKey },
      { default: localConfig },
      { default: checkVersion },
      { default: registerSystemPlugin },
    ] = await Promise.all([
      import('./browsers'),
      import('../core/app-search'),
      import('../core'),
      import('./common/api'),
      import('./common/tray'),
      import('./common/registerHotKey'),
      import('./common/initLocalConfig'),
      import('./common/versionHandler'),
      import('./common/registerSystemPlugin'),
    ]);

    // 动态导入 localPlugin
    await import('../common/utils/localPlugin');

    // 注册全局变量供 renderer 通过 getGlobal 访问
    (global as any).appSearch = appSearch;
    (global as any).PluginHandler = PluginHandler;

    // 初始化系统插件
    const systemPlugins = registerSystemPlugin();

    // 初始化配置
    checkVersion();
    await localConfig.init();
    const config = await localConfig.getConfig();

    // 首次使用显示引导
    if (!config.perf.common.guide) {
      guide().init();
      config.perf.common.guide = true;
      localConfig.setConfig(config);
    }

    // 导入 windowManager
    const { default: windowManager } = await import('./common/windowManager');
    
    // 创建主窗口
    const windowCreator = main();
    windowCreator.init();
    const mainWindow = windowCreator.getWindow();
    
    // 设置主窗口引用到 windowManager
    windowManager.setMainWindow(mainWindow);

    // 初始化 API、托盘、快捷键
    API.init(mainWindow);
    createTray(mainWindow);
    registerHotKey(mainWindow);

    // 触发系统插件 ready hooks
    systemPlugins.triggerReadyHooks(
      Object.assign(electron, {
        mainWindow,
        API,
      })
    );

    // 标记主进程准备完成
    mainProcessReady = true;

    // ============ 运行时事件 ============
    const { getSearchFiles, putFileToRubick } = await import('./common/getSearchFiles');
    
    app.on('second-instance', (event, commandLine, workingDirectory) => {
      const files = getSearchFiles(commandLine, workingDirectory);
      const win = windowCreator.getWindow();
      if (win) {
        if (win.isMinimized()) {
          win.restore();
        }
        win.focus();
        if (files.length > 0) {
          win.show();
          putFileToRubick(win.webContents, files);
        }
      }
    });

    app.on('activate', () => {
      if (!windowCreator.getWindow()) {
        windowCreator.init();
      }
    });
  });

  // ============ 退出事件 ============
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
  });

  if (commonConst.dev()) {
    if (process.platform === 'win32') {
      process.on('message', (data) => {
        if (data === 'graceful-exit') {
          app.quit();
        }
      });
    } else {
      process.on('SIGTERM', () => {
        app.quit();
      });
    }
  }
}
