// renderer 进程专用常量
const PLUGIN_HISTORY = 'rubick-plugin-history';

// 动态获取 PLUGIN_INSTALL_DIR（仅在 renderer 进程中有效）
const getPluginInstallDir = () => {
  if (typeof window !== 'undefined' && window.PLUGIN_INSTALL_DIR) {
    return window.PLUGIN_INSTALL_DIR;
  }
  // main 进程中的备用路径
  const { app } = require('electron');
  const path = require('path');
  return path.join(app.getPath('userData'), './rubick-plugins-new');
};

export { getPluginInstallDir as PLUGIN_INSTALL_DIR, PLUGIN_HISTORY };
