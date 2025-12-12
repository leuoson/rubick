const LOCAL_CONFIG_KEY = 'rubick-local-config';

const localConfig = {
  getConfig(): any {
    console.log('[confOp] getConfig called');
    const rawData: any = window.rubick.db.get(LOCAL_CONFIG_KEY);
    console.log('[confOp] getConfig raw:', rawData);
    const result = rawData?.data || {};
    console.log('[confOp] getConfig result:', result);
    return result;
  },

  setConfig(newData: any) {
    console.log('[confOp] setConfig called with:', newData);
    const existing: any = window.rubick.db.get(LOCAL_CONFIG_KEY) || {};
    console.log('[confOp] setConfig existing:', existing);
    
    const doc = {
      _id: LOCAL_CONFIG_KEY,
      _rev: existing._rev,
      data: {
        ...(existing.data || {}),
        ...newData,
      },
    };
    console.log('[confOp] setConfig saving doc:', doc);
    
    const result = window.rubick.db.put(doc);
    console.log('[confOp] setConfig result:', result);
    return result;
  },
};

export default localConfig;
