import { createApp } from 'vue';
import {
  Button,
  List,
  Spin,
  Input,
  Avatar,
  Tag,
  ConfigProvider,
  Row,
  Col,
  Divider,
} from 'ant-design-vue';
import App from './App.vue';
import localConfig from './confOp';

import 'ant-design-vue/dist/reset.css';

// 等待 preload 完成后再初始化
const initApp = () => {
  const config: any = localConfig.getConfig();
  if (config?.perf?.custom) {
    ConfigProvider.config({
      theme: config.perf.custom,
    });
  }

  if (window.rubick) {
    window.rubick.changeTheme = () => {
      const config: any = localConfig.getConfig();
      if (config?.perf?.custom) {
        ConfigProvider.config({
          theme: config.perf.custom,
        });
      }
    };
  }
};

// 确保 window.rubick 已加载
if (window.rubick) {
  initApp();
} else {
  // 如果 preload 还没完成，等待一下
  setTimeout(initApp, 100);
}

createApp(App)
  .use(Button)
  .use(List)
  .use(Spin)
  .use(Input)
  .use(Avatar)
  .use(Tag)
  .use(Row)
  .use(Col)
  .use(Divider)
  .mount('#app');
