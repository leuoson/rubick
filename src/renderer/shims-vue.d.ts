/* eslint-disable */
declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

declare module 'main' {
  export function main(): any;
}

declare const __static: string;

declare module 'lodash.throttle';

interface Window {
  __static: string;
  rubick: any;
  // preload 暴露的 Node.js 功能
  electron: {
    nativeImage: any;
    clipboard: any;
    ipcRenderer: any;
    shell: any;
  };
  electronRemote: {
    getGlobal: (name: string) => any;
    app: any;
    BrowserWindow: any;
    nativeTheme: any;
    screen: any;
    Menu: any;
  };
  nodePath: any;
  nodeOs: any;
  childProcess: {
    exec: any;
  };
  PLUGIN_INSTALL_DIR: string;
  // 原有的属性
  setSubInput: ({ placeholder }: { placeholder: string }) => void;
  setSubInputValue: ({ value }: { value: string }) => void;
  removeSubInput: () => void;
  loadPlugin: (plugin: any) => void;
  updatePlugin: (plugin: any) => void;
  initRubick: () => void;
  addLocalStartPlugin: (plugin: any) => void;
  removeLocalStartPlugin: (plugin: any) => void;
  setCurrentPlugin: (plugin: any) => void;
  pluginLoaded: () => void;
  getMainInputInfo: () => any;
  searchFocus: (args: any, strict?: boolean) => any;
}
