import {
  BrowserWindow,
  ipcMain,
  dialog,
  app,
  Notification,
  nativeImage,
  clipboard,
  screen,
  shell,
} from 'electron';
import fs from 'fs';
import { screenCapture } from '@/core';
import plist from 'plist';
import ks from 'node-key-sender';

import {
  DECODE_KEY,
  PLUGIN_INSTALL_DIR as baseDir,
} from '@/common/constans/main';
import { putFileToRubick } from './getSearchFiles';
import { resolveStatic, isDev } from '@/main/common/static';
import getCopyFiles from '@/common/utils/getCopyFiles';
import common from '@/common/utils/commonConst';

import windowManager from './windowManager';
import { runner, detach } from '../browsers';
import DBInstance from './db';
import { aiService, AIChatRequest, AIProviderInfo } from './ai';
import fsService from './fs';
import processService from './process';
import esbuildService from './esbuild/service';
import getWinPosition from './getWinPosition';
import path from 'path';
import commonConst from '@/common/utils/commonConst';
import { copyFilesToWindowsClipboard } from './windowsClipboard';

/**
 *  sanitize input files 剪贴板文件合法性校验
 * @param input
 * @returns
 */
const sanitizeInputFiles = (input: unknown): string[] => {
  const candidates = Array.isArray(input)
    ? input
    : typeof input === 'string'
    ? [input]
    : [];
  return candidates
    .map((filePath) => (typeof filePath === 'string' ? filePath.trim() : ''))
    .filter((filePath) => {
      if (!filePath) return false;
      try {
        return fs.existsSync(filePath);
      } catch {
        return false;
      }
    });
};

const runnerInstance = runner();
const detachInstance = detach();

class API extends DBInstance {
  init(mainWindow: BrowserWindow) {
    // 响应 preload.js 事件
    ipcMain.on('msg-trigger', async (event, arg) => {
      const window = arg.winId ? BrowserWindow.fromId(arg.winId) : mainWindow;
      const data = await this[arg.type](arg, window, event);
      event.returnValue = data;
      // event.sender.send(`msg-back-${arg.type}`, data);
    });
    // 按 ESC 退出插件
    mainWindow.webContents.on('before-input-event', (event, input) =>
      this.__EscapeKeyDown(event, input, mainWindow)
    );
    // 设置主窗口的 show/hide 事件监听
    this.setupMainWindowHooks(mainWindow);
  }

  private setupMainWindowHooks(mainWindow: BrowserWindow) {
    mainWindow.on('show', () => {
      // 触发插件的 onShow hook
      runnerInstance.executeHooks('Show', null);
    });

    mainWindow.on('hide', () => {
      // 触发插件的 onHide hook
      runnerInstance.executeHooks('Hide', null);
    });
  }

  public getCurrentWindow = (window, e) => {
    let originWindow = BrowserWindow.fromWebContents(e.sender);
    if (originWindow !== window) originWindow = detachInstance.getWindow();
    return originWindow;
  };

  public __EscapeKeyDown = (event, input, window) => {
    if (input.type !== 'keyDown') return;
    if (!(input.meta || input.control || input.shift || input.alt)) {
      if (input.key === 'Escape') {
        if (this.currentPlugin) {
          this.removePlugin(null, window);
        } else {
          windowManager.hideMainWindow();
        }
      }

      return;
    }
  };

  public windowMoving({ data: { mouseX, mouseY, width, height } }, window, e) {
    const { x, y } = screen.getCursorScreenPoint();
    const originWindow = this.getCurrentWindow(window, e);
    if (!originWindow) return;
    originWindow.setBounds({ x: x - mouseX, y: y - mouseY, width, height });
    getWinPosition.setPosition(x - mouseX, y - mouseY);
  }

  public loadPlugin({ data: plugin }, window) {
    window.webContents.executeJavaScript(
      `window.loadPlugin(${JSON.stringify(plugin)})`
    );
    this.openPlugin({ data: plugin }, window);
  }

  public openPlugin({ data: plugin }, window) {
    if (plugin.platform && !plugin.platform.includes(process.platform)) {
      return new Notification({
        title: `插件不支持当前 ${process.platform} 系统`,
        body: `插件仅支持 ${plugin.platform.join(',')}`,
        icon: plugin.logo,
      }).show();
    }
    window.setSize(window.getSize()[0], 60);
    this.removePlugin(null, window);
    // 模板文件 - 使用静态文件
    if (!plugin.main) {
      plugin.tplPath = `file://${resolveStatic('tpl/index.html')}`;
    }
    if (plugin.name === 'rubick-system-feature') {
      plugin.logo =
        plugin.logo || `file://${resolveStatic('logo.png')}`;
      plugin.indexPath = `file://${resolveStatic('feature/index.html')}`;
    } else if (!plugin.indexPath) {
      const pluginPath = path.resolve(baseDir, 'node_modules', plugin.name);
      plugin.indexPath = `file://${path.join(
        pluginPath,
        './',
        plugin.main || ''
      )}`;
    }
    runnerInstance.init(plugin, window);
    this.currentPlugin = plugin;
    window.webContents.executeJavaScript(
      `window.setCurrentPlugin(${JSON.stringify({
        currentPlugin: this.currentPlugin,
      })})`
    );
    window.show();
    const view = runnerInstance.getView();
    if (!view.inited) {
      view.webContents.on('before-input-event', (event, input) =>
        this.__EscapeKeyDown(event, input, window)
      );
    }
  }

  public removePlugin(e, window) {
    runnerInstance.removeView(window);
    this.currentPlugin = null;
  }

  public openPluginDevTools() {
    runnerInstance.getView().webContents.openDevTools({ mode: 'detach' });
  }

  public hideMainWindow(arg, window) {
    window.hide();
  }

  public showMainWindow(arg, window) {
    window.show();
  }

  public showOpenDialog({ data }, window) {
    return dialog.showOpenDialogSync(window, data);
  }

  public showSaveDialog({ data }, window) {
    return dialog.showSaveDialogSync(window, data);
  }

  public setExpendHeight({ data: height }, window: BrowserWindow, e) {
    const originWindow = this.getCurrentWindow(window, e);
    if (!originWindow) return;
    const targetHeight = height;
    originWindow.setSize(originWindow.getSize()[0], targetHeight);
    const screenPoint = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(screenPoint);
    const position =
      originWindow.getPosition()[1] + targetHeight > display.bounds.height
        ? height - 60
        : 0;
    originWindow.webContents.executeJavaScript(
      `window.setPosition && typeof window.setPosition === "function" && window.setPosition(${position})`
    );
  }

  public setSubInput({ data }, window, e) {
    const originWindow = this.getCurrentWindow(window, e);
    if (!originWindow) return;
    originWindow.webContents.executeJavaScript(
      `window.setSubInput(${JSON.stringify({
        placeholder: data.placeholder,
      })})`
    );
  }

  public subInputBlur() {
    runnerInstance.getView().webContents.focus();
  }

  public sendSubInputChangeEvent({ data }) {
    runnerInstance.executeHooks('SubInputChange', data);
  }

  public removeSubInput(data, window, e) {
    const originWindow = this.getCurrentWindow(window, e);
    if (!originWindow) return;
    originWindow.webContents.executeJavaScript(`window.removeSubInput()`);
  }

  public setSubInputValue({ data }, window, e) {
    const originWindow = this.getCurrentWindow(window, e);
    if (!originWindow) return;
    originWindow.webContents.executeJavaScript(
      `window.setSubInputValue(${JSON.stringify({
        value: data.text,
      })})`
    );
    this.sendSubInputChangeEvent({ data });
  }

  public getPath({ data }) {
    return app.getPath(data.name);
  }

  public showNotification({ data: { body } }) {
    if (!Notification.isSupported()) return;
    'string' != typeof body && (body = String(body));
    const plugin = this.currentPlugin;
    const notify = new Notification({
      title: plugin ? plugin.pluginName : null,
      body,
      icon: plugin ? plugin.logo : null,
    });
    notify.show();
  }

  public copyImage = ({ data }) => {
    const image = nativeImage.createFromDataURL(data.img);
    clipboard.writeImage(image);
  };

  public copyText({ data }) {
    clipboard.writeText(String(data.text));
    return true;
  }

  public copyFile({ data }) {
    const targetFiles = sanitizeInputFiles(data?.file);

    if (!targetFiles.length) {
      return false;
    }

    if (process.platform === 'darwin') {
      try {
        clipboard.writeBuffer(
          'NSFilenamesPboardType',
          Buffer.from(plist.build(targetFiles))
        );
        return true;
      } catch {
        return false;
      }
    }

    if (process.platform === 'win32') {
      return copyFilesToWindowsClipboard(targetFiles);
    }

    return false;
  }

  public getFeatures() {
    return this.currentPlugin?.features;
  }

  public setFeature({ data }, window) {
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
      })(),
    };
    window.webContents.executeJavaScript(
      `window.updatePlugin(${JSON.stringify({
        currentPlugin: this.currentPlugin,
      })})`
    );
    return true;
  }

  public removeFeature({ data }, window) {
    this.currentPlugin = {
      ...this.currentPlugin,
      features: this.currentPlugin.features.filter((feature) => {
        if (data.code.type) {
          return feature.code.type !== data.code.type;
        }
        return feature.code !== data.code;
      }),
    };
    window.webContents.executeJavaScript(
      `window.updatePlugin(${JSON.stringify({
        currentPlugin: this.currentPlugin,
      })})`
    );
    return true;
  }

  public sendPluginSomeKeyDownEvent({ data: { modifiers, keyCode } }) {
    const code = DECODE_KEY[keyCode];
    if (!code || !runnerInstance.getView()) return;
    if (modifiers.length > 0) {
      runnerInstance.getView().webContents.sendInputEvent({
        type: 'keyDown',
        modifiers,
        keyCode: code,
      });
    } else {
      runnerInstance.getView().webContents.sendInputEvent({
        type: 'keyDown',
        keyCode: code,
      });
    }
  }

  public detachPlugin(e, window) {
    if (!this.currentPlugin) return;
    const view = window.getBrowserView();
    window.setBrowserView(null);
    window.webContents
      .executeJavaScript(`window.getMainInputInfo()`)
      .then((res) => {
        detachInstance.init(
          {
            ...this.currentPlugin,
            subInput: res,
          },
          window.getBounds(),
          view
        );
        window.webContents.executeJavaScript(`window.initRubick()`);
        window.setSize(window.getSize()[0], 60);
        this.currentPlugin = null;
      });
  }

  public detachInputChange({ data }) {
    this.sendSubInputChangeEvent({ data });
  }

  public getLocalId() {
    return encodeURIComponent(app.getPath('home'));
  }

  public shellShowItemInFolder({ data }) {
    shell.showItemInFolder(data.path);
    return true;
  }

  public async getFileIcon({ data }) {
    const nativeImage = await app.getFileIcon(data.path, { size: 'normal' });
    return nativeImage.toDataURL();
  }

  public shellBeep() {
    shell.beep();
    return true;
  }

  public screenCapture(arg, window) {
    screenCapture(window, (img) => {
      runnerInstance.executeHooks('ScreenCapture', {
        data: img,
      });
    });
  }

  public getCopyFiles() {
    return getCopyFiles();
  }

  public simulateKeyboardTap({ data: { key, modifier } }) {
    let keys = [key.toLowerCase()];
    if (modifier && Array.isArray(modifier) && modifier.length > 0) {
      keys = modifier.concat(keys);
      ks.sendCombination(keys);
    } else {
      ks.sendKeys(keys);
    }
  }

  public addLocalStartPlugin({ data: { plugin } }, window) {
    window.webContents.executeJavaScript(
      `window.addLocalStartPlugin(${JSON.stringify({
        plugin,
      })})`
    );
  }

  public removeLocalStartPlugin({ data: { plugin } }, window) {
    window.webContents.executeJavaScript(
      `window.removeLocalStartPlugin(${JSON.stringify({
        plugin,
      })})`
    );
  }

  // ==================== AI 相关 IPC 方法 ====================

  /**
   * 获取 AI 提供商列表（不含 API Key，安全暴露给插件）
   */
  public async getAIProviders(): Promise<AIProviderInfo[]> {
    return await aiService.getProviders();
  }

  /**
   * 获取默认 AI 提供商和模型配置
   */
  public async getAIDefaultConfig(): Promise<{
    providerId: string;
    model: string;
  }> {
    return await aiService.getDefaultConfig();
  }

  /**
   * AI 聊天调用（同步，非流式）
   * 插件传入提供商ID、模型、消息，由 rubick 代理调用
   */
  public async aiChat({ data }: { data: AIChatRequest }) {
    return await aiService.chat(data);
  }

  /**
   * AI 流式聊天调用
   * 通过事件推送流式响应给插件
   */
  public async aiChatStream(
    { data }: { data: AIChatRequest },
    window,
    event
  ) {
    const requestId = Date.now().toString(36) + Math.random().toString(36);

    // 异步处理流式响应，传入 requestId 以支持取消
    (async () => {
      try {
        for await (const chunk of aiService.chatStream(data, requestId)) {
          // 通过事件推送给渲染进程
          event.sender.send('ai-stream-event', {
            requestId,
            ...chunk,
          });
        }
      } catch (error) {
        event.sender.send('ai-stream-event', {
          requestId,
          type: 'error',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    })();

    return { requestId };
  }

  /**
   * 取消 AI 流式聊天请求
   */
  public aiChatCancel({ data }: { data: { requestId: string } }) {
    return aiService.cancelStream(data.requestId);
  }

  // ==================== 文件系统 IPC 方法 ====================

  /**
   * 读取文件内容
   */
  public async fsReadFile({ data }: { data: { path: string; encoding?: string } }) {
    try {
      const content = await fsService.readFile(data.path, (data.encoding as BufferEncoding) || 'utf-8');
      return { success: true, content };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * 写入文件内容
   */
  public async fsWriteFile({ data }: { data: { path: string; content: string } }) {
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
  public async fsDeleteFile({ data }: { data: { path: string } }) {
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
  public async fsRenameFile({ data }: { data: { oldPath: string; newPath: string } }) {
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
  public async fsExists({ data }: { data: { path: string } }) {
    try {
      const exists = await fsService.exists(data.path);
      return { success: true, exists };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * 读取目录内容
   */
  public async fsReadDir({ data }: { data: { path: string } }) {
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
  public async fsReadDirRecursive({ data }: { data: { path: string; maxDepth?: number; excludePatterns?: string[] } }) {
    try {
      const entries = await fsService.readDirRecursive(data.path, {
        maxDepth: data.maxDepth,
        excludePatterns: data.excludePatterns,
      });
      return { success: true, entries };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * 创建目录
   */
  public async fsMkdir({ data }: { data: { path: string } }) {
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
  public async fsRmdir({ data }: { data: { path: string } }) {
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
  public async fsStat({ data }: { data: { path: string } }) {
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
  public async fsCopyFile({ data }: { data: { srcPath: string; destPath: string } }) {
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
  public processSpawn({ data }: { data: {
    id: string;
    command: string;
    args?: string[];
    cwd: string;
    env?: Record<string, string>;
  } }) {
    return processService.spawn(data);
  }

  /**
   * 停止进程
   */
  public processKill({ data }: { data: { id: string } }) {
    return processService.kill(data.id);
  }

  /**
   * 获取进程状态
   */
  public processStatus({ data }: { data: { id: string } }) {
    return processService.getStatus(data.id);
  }

  /**
   * 列出所有进程
   */
  public processList() {
    return processService.list();
  }

  /**
   * 向进程发送输入
   */
  public processWrite({ data }: { data: { id: string; input: string } }) {
    return processService.write(data.id, data.input);
  }

  // ==================== Esbuild IPC 方法 ====================

  /**
   * 编译项目
   */
  public async esbuildBuild({ data }: { data: { projectPath: string; entryPoint?: string; outdir?: string } }) {
    return esbuildService.build(data);
  }

  /**
   * 启动开发服务器
   */
  public async esbuildServe({ data }: { data: { projectPath: string; port?: number } }) {
    return esbuildService.serve(data);
  }

  /**
   * 停止开发服务器
   */
  public async esbuildStopServer({ data }: { data: { projectPath: string } }) {
    return esbuildService.stopServer(data.projectPath);
  }

  /**
   * 获取所有运行中的服务器
   */
  public esbuildListServers() {
    return esbuildService.listServers();
  }
}

export default new API();
