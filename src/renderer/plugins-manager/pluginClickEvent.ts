import { toRaw } from 'vue';
import commonConst from '@/common/utils/commonConst';

// 使用 preload 暴露的 window 对象
const path = window.nodePath;
const baseDir = window.PLUGIN_INSTALL_DIR;

export default function pluginClickEvent({
  plugin,
  fe,
  cmd,
  ext,
  openPlugin,
  option,
}) {
  const pluginPath = path.resolve(baseDir, 'node_modules', plugin.name);
  const pluginDist = {
    ...toRaw(plugin),
    indexPath: `file://${path.join(pluginPath, './', plugin.main || '')}`,
    cmd: cmd.label || cmd,
    feature: fe,
    ext,
  };
  // 模板文件
  if (!plugin.main) {
    pluginDist.tplPath = commonConst.dev()
      ? 'http://localhost:8083/#/'
      : `file://${window.__static}/tpl/index.html`;
  }
  // 插件市场
  if (plugin.name === 'rubick-system-feature') {
    pluginDist.indexPath = commonConst.dev()
      ? 'http://localhost:8081/#/'
      : `file://${window.__static}/feature/index.html`;
  }
  openPlugin(pluginDist, option);
}
