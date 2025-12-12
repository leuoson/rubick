import defaultConfig from '@/common/constans/defaultConfig';
import DBInstance from './db';
const LOCAL_CONFIG_KEY = 'rubick-local-config';

const db = new DBInstance();

const localConfig = {
  async init(): Promise<any> {
    const localConfig: any = await db.dbGet({ data: { id: LOCAL_CONFIG_KEY } });
    if (
      !localConfig ||
      !localConfig.data ||
      localConfig.data.version !== defaultConfig.version
    ) {
      const doc: any = {
        _id: LOCAL_CONFIG_KEY,
        data: defaultConfig,
      };
      if (localConfig && localConfig._rev) {
        doc._rev = localConfig._rev;
      }
      // dbPut 期望 { data: { data: docWithId } } 结构
      await db.dbPut({
        data: { data: doc },
      });
    }
  },
  async getConfig(): Promise<any> {
    const data: any = await db.dbGet({ data: { id: LOCAL_CONFIG_KEY } });
    // 返回存储的配置，如果不存在则返回默认配置
    return data?.data || defaultConfig;
  },

  async setConfig(data) {
    const localConfig: any =
      (await db.dbGet({ data: { id: LOCAL_CONFIG_KEY } })) || {};
    await db.dbPut({
      data: {
        data: {
          _id: LOCAL_CONFIG_KEY,
          _rev: localConfig._rev,
          data: {
            ...localConfig.data,
            ...data,
          },
        },
      },
    });
  },
};

export default localConfig;
