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

import 'ant-design-vue/dist/antd.css';

// 启动初始化并挂载应用
const bootstrap = async () => {
  // 等待主进程准备完成（配置初始化完毕）
  if (window.waitForMainProcessReady) {
    await window.waitForMainProcessReady();
  }

  // 初始化主题配置
  const config: any = localConfig.getConfig();
  if (config?.perf?.custom) {
    ConfigProvider.config({
      theme: config.perf.custom,
    });
  }

  if (window.rubick) {
    window.rubick.changeTheme = () => {
      const cfg: any = localConfig.getConfig();
      if (cfg?.perf?.custom) {
        ConfigProvider.config({
          theme: cfg.perf.custom,
        });
      }
    };
  }

  // 挂载 Vue 应用（主进程已准备好，配置可用）
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
};

bootstrap();
