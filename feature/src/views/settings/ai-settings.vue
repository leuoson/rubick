<template>
  <div class="ai-settings">
    <!-- 添加供应商按钮 -->
    <a-button type="primary" class="add-btn-top" @click="showAddModal">
      <PlusOutlined />
      {{ $t('feature.settings.ai.addProvider') }}
    </a-button>

    <!-- 已配置的供应商列表 -->
    <div class="setting-item">
      <div class="title">{{ $t('feature.settings.ai.providers') }}</div>
      <div class="provider-list" v-if="providers.length > 0">
        <div
          v-for="(provider, index) in providers"
          :key="provider.id"
          class="provider-item"
          :class="{ 'is-default': defaultProviderId === provider.id }"
          @click="selectProvider(provider)"
        >
          <div class="provider-main">
            <div class="provider-left">
              <a-checkbox
                :checked="defaultProviderId === provider.id"
                @click.stop
                @change="setDefaultProvider(provider.id)"
              />
              <span class="provider-name">{{ provider.name }}</span>
              <a-tag :color="getTypeColor(provider.type)" size="small">{{ provider.type }}</a-tag>
              <a-tag v-if="!provider.enabled" color="default" size="small">{{ $t('feature.settings.ai.disabled') }}</a-tag>
            </div>
            <div class="provider-actions">
              <a-button type="text" size="small" @click.stop="editProvider(index)">
                <EditOutlined />
              </a-button>
              <a-button type="text" size="small" danger @click.stop="confirmDelete(index)">
                <DeleteOutlined />
              </a-button>
            </div>
          </div>
          <!-- 模型选择（当选中为默认时显示） -->
          <div class="model-selector" v-if="defaultProviderId === provider.id">
            <span class="model-label">{{ $t('feature.settings.ai.defaultModel') }}:</span>
            <a-select
              v-model:value="defaultModel"
              size="small"
              style="width: 200px"
              :options="provider.models.map(m => ({ value: m, label: m }))"
              @change="saveConfig"
              @click.stop
            />
          </div>
        </div>
      </div>
      <a-empty v-else :description="$t('feature.settings.ai.noProviders')" />
    </div>

    <!-- Add/Edit Provider Modal -->
    <a-modal
      v-model:visible="modalVisible"
      :title="editingIndex >= 0 ? $t('feature.settings.ai.editProvider') : $t('feature.settings.ai.addProvider')"
      @ok="handleModalOk"
      @cancel="handleModalCancel"
      :width="600"
    >
      <a-form :model="formState" layout="vertical">
        <a-form-item :label="$t('feature.settings.ai.providerName')" required>
          <a-input v-model:value="formState.name" :placeholder="$t('feature.settings.ai.providerNamePlaceholder')" />
        </a-form-item>

        <a-form-item :label="$t('feature.settings.ai.providerType')" required>
          <a-select v-model:value="formState.type" @change="onTypeChange">
            <a-select-option value="openai">OpenAI</a-select-option>
            <a-select-option value="anthropic">Anthropic</a-select-option>
            <a-select-option value="google">Google AI</a-select-option>
            <a-select-option value="azure">Azure OpenAI</a-select-option>
            <a-select-option value="deepseek">DeepSeek</a-select-option>
            <a-select-option value="openrouter">OpenRouter</a-select-option>
            <a-select-option value="xai">xAI (Grok)</a-select-option>
            <a-select-option value="ollama">Ollama (本地)</a-select-option>
            <a-select-option value="lmstudio">LM Studio (本地)</a-select-option>
            <a-select-option value="custom">自定义</a-select-option>
          </a-select>
        </a-form-item>

        <a-form-item label="Base URL" required>
          <a-input v-model:value="formState.baseUrl" placeholder="https://api.openai.com/v1" />
          <template #extra v-if="selectedPreset?.websiteUrl">
            <a :href="selectedPreset.websiteUrl" target="_blank" rel="noopener">
              {{ $t('feature.settings.ai.getApiKey') }} →
            </a>
          </template>
        </a-form-item>

        <!-- Azure 特殊配置 -->
        <a-form-item v-if="formState.type === 'azure'" :label="$t('feature.settings.ai.azureResourceName')" required>
          <a-input v-model:value="formState.resourceName" placeholder="your-resource-name" />
          <template #extra>
            {{ $t('feature.settings.ai.azureResourceNameTip') }}
          </template>
        </a-form-item>

        <a-form-item label="API Key" :required="!isLocalProvider">
          <a-input-password v-model:value="formState.apiKey" :placeholder="isLocalProvider ? $t('feature.settings.ai.localNoApiKey') : 'sk-...'" />
        </a-form-item>

        <a-form-item :label="$t('feature.settings.ai.models')">
          <a-select
            v-model:value="formState.models"
            mode="tags"
            :placeholder="$t('feature.settings.ai.modelsPlaceholder')"
          />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue';
import { EditOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons-vue';
import { message } from 'ant-design-vue';
import { useI18n } from 'vue-i18n';
import localConfig from '@/confOp';
import debounce from 'lodash.debounce';
import { ALL_PROVIDERS, getProviderPreset } from '@/assets/ai-providers';

const { t } = useI18n();

// State
const providers = ref([]);
const defaultProviderId = ref('');
const defaultModel = ref('');
const modalVisible = ref(false);
const editingIndex = ref(-1);

const formState = reactive({
  id: '',
  name: '',
  type: 'openai',
  apiKey: '',
  baseUrl: 'https://api.openai.com/v1',
  models: [],
  enabled: true,
  resourceName: '', // Azure
});

// 计算可用的预设供应商（排除已添加的）
const availablePresets = computed(() => {
  const addedIds = providers.value.map(p => p.id);
  return ALL_PROVIDERS.filter(p => !addedIds.includes(p.id));
});

// 当前选中的预设供应商
const selectedPreset = computed(() => {
  return getProviderPreset(formState.type) || ALL_PROVIDERS.find(p => p.type === formState.type);
});

// 是否是本地供应商
const isLocalProvider = computed(() => {
  return formState.type === 'ollama' || formState.type === 'lmstudio';
});

// 初始化加载配置
const loadConfig = () => {
  console.log('[AI Settings] loadConfig called');
  const config = localConfig.getConfig();
  console.log('[AI Settings] loadConfig - raw config:', config);
  console.log('[AI Settings] loadConfig - config.perf:', config?.perf);
  console.log('[AI Settings] loadConfig - config.perf.ai:', config?.perf?.ai);
  const aiConfig = config?.perf?.ai || {
    providers: [],
    defaultProviderId: '',
    defaultModel: '',
  };
  console.log('[AI Settings] loadConfig - aiConfig:', aiConfig);
  providers.value = aiConfig.providers || [];
  defaultProviderId.value = aiConfig.defaultProviderId || '';
  defaultModel.value = aiConfig.defaultModel || '';
  console.log('[AI Settings] loadConfig - loaded providers:', providers.value);
};

loadConfig();

// 保存配置
const saveConfig = debounce(() => {
  const { perf } = localConfig.getConfig();
  console.log('[AI Settings] Before save - perf:', perf);
  console.log('[AI Settings] Saving providers:', JSON.stringify(providers.value));
  
  // 使用与其他设置页面相同的保存模式
  localConfig.setConfig(
    JSON.parse(
      JSON.stringify({
        perf: {
          ...perf,
          ai: {
            providers: providers.value,
            defaultProviderId: defaultProviderId.value,
            defaultModel: defaultModel.value,
          },
        },
      })
    )
  );
  
}, 500);

// Computed
const providerOptions = computed(() => {
  return providers.value
    .filter(p => p.enabled)
    .map(p => ({
      value: p.id,
      label: p.name,
    }));
});

const modelOptions = computed(() => {
  const provider = providers.value.find(p => p.id === defaultProviderId.value);
  if (!provider) return [];
  return provider.models.map(m => ({
    value: m,
    label: m,
  }));
});

// Methods
const getTypeColor = (type) => {
  const colors = {
    openai: 'green',
    anthropic: 'orange',
    google: 'blue',
    azure: 'cyan',
    openrouter: 'purple',
    xai: 'magenta',
    ollama: 'geekblue',
    lmstudio: 'geekblue',
    custom: 'default',
  };
  return colors[type] || 'default';
};

const maskApiKey = (apiKey) => {
  if (!apiKey) return '未设置';
  if (apiKey.length <= 8) return '********';
  return apiKey.slice(0, 4) + '...' + apiKey.slice(-4);
};

const onTypeChange = (type) => {
  // 自定义类型不填充默认值
  if (type === 'custom') {
    formState.baseUrl = '';
    formState.models = [];
    formState.name = '';
    return;
  }
  
  const preset = getProviderPreset(type) || ALL_PROVIDERS.find(p => p.type === type);
  if (preset) {
    formState.baseUrl = preset.baseUrl;
    formState.models = [...preset.models];
    if (!formState.name) {
      formState.name = preset.name;
    }
  } else {
    formState.baseUrl = '';
    formState.models = [];
  }
};

const resetForm = () => {
  formState.id = '';
  formState.name = '';
  formState.type = 'openai';
  formState.apiKey = '';
  formState.baseUrl = 'https://api.openai.com/v1';
  formState.models = ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'];
  formState.enabled = true;
  formState.resourceName = '';
};

// 快速添加预设供应商
const quickAddProvider = (preset) => {
  console.log('[AI Settings] quickAddProvider called with:', preset.id, preset.name);
  editingIndex.value = -1;
  formState.id = preset.id;
  formState.name = preset.name;
  formState.type = preset.type;
  formState.baseUrl = preset.baseUrl;
  formState.models = [...preset.models];
  formState.apiKey = '';
  formState.enabled = true;
  formState.resourceName = '';
  console.log('[AI Settings] Setting modalVisible to true');
  modalVisible.value = true;
  console.log('[AI Settings] modalVisible is now:', modalVisible.value);
};

const showAddModal = () => {
  console.log('[AI Settings] showAddModal called');
  editingIndex.value = -1;
  resetForm();
  console.log('[AI Settings] Setting modalVisible to true');
  modalVisible.value = true;
  console.log('[AI Settings] modalVisible is now:', modalVisible.value);
};

const editProvider = (index) => {
  editingIndex.value = index;
  const provider = providers.value[index];
  formState.id = provider.id;
  formState.name = provider.name;
  formState.type = provider.type;
  formState.apiKey = provider.apiKey;
  formState.baseUrl = provider.baseUrl;
  formState.models = [...provider.models];
  formState.enabled = provider.enabled;
  modalVisible.value = true;
};

const deleteProvider = (index) => {
  console.log('[AI Settings] deleteProvider called with index:', index);
  const provider = providers.value[index];
  console.log('[AI Settings] Deleting provider:', provider?.name);
  providers.value.splice(index, 1);
  // 如果删除的是默认提供商，清空默认设置
  if (defaultProviderId.value === provider.id) {
    defaultProviderId.value = '';
    defaultModel.value = '';
  }
  saveConfig();
  console.log('[AI Settings] Provider deleted, remaining:', providers.value.length);
};

// 确认删除
const confirmDelete = (index) => {
  const provider = providers.value[index];
  if (confirm(t('feature.settings.ai.deleteConfirmMsg', { name: provider.name }))) {
    deleteProvider(index);
  }
};

const handleModalOk = () => {
  // 验证（本地供应商不需要 API Key）
  if (!formState.name || !formState.baseUrl) {
    message.error(t('feature.settings.ai.fillRequired'));
    return;
  }
  if (!isLocalProvider.value && !formState.apiKey) {
    message.error(t('feature.settings.ai.fillRequired'));
    return;
  }
  // Azure 需要 resourceName
  if (formState.type === 'azure' && !formState.resourceName) {
    message.error('Azure 需要填写 Resource Name');
    return;
  }

  // 自动生成唯一标识：类型_时间戳_随机数
  const generateId = () => `${formState.type}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  const providerData = {
    id: formState.id || generateId(),
    name: formState.name,
    type: formState.type,
    apiKey: formState.apiKey,
    baseUrl: formState.type === 'azure' 
      ? `https://${formState.resourceName}.openai.azure.com`
      : formState.baseUrl,
    models: formState.models,
    enabled: formState.enabled,
    resourceName: formState.resourceName || undefined,
  };

  if (editingIndex.value >= 0) {
    // 编辑
    providers.value[editingIndex.value] = providerData;
  } else {
    // 新增
    providers.value.push(providerData);
  }

  saveConfig();
  modalVisible.value = false;
};

const handleModalCancel = () => {
  modalVisible.value = false;
};

// 设置默认供应商
const setDefaultProvider = (providerId) => {
  defaultProviderId.value = providerId;
  // 自动选择第一个模型
  const provider = providers.value.find(p => p.id === providerId);
  if (provider && provider.models.length > 0) {
    defaultModel.value = provider.models[0];
  }
  saveConfig();
};

// 点击供应商行
const selectProvider = (provider) => {
  // 点击行时设为默认
  setDefaultProvider(provider.id);
};

// 监听默认提供商变化，自动选择第一个模型
watch(defaultProviderId, (newId) => {
  const provider = providers.value.find(p => p.id === newId);
  if (provider && provider.models.length > 0) {
    if (!provider.models.includes(defaultModel.value)) {
      defaultModel.value = provider.models[0];
    }
  } else {
    defaultModel.value = '';
  }
});
</script>

<style lang="less" scoped>
.ai-settings {
  .add-btn-top {
    margin-bottom: 16px;
  }

  .provider-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 12px;
  }

  .provider-item {
    padding: 12px 16px;
    border: 1px solid #e8e8e8;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;

    &:hover {
      border-color: #1890ff;
      background: #fafafa;
    }

    &.is-default {
      border-color: #1890ff;
      background: #e6f7ff;
    }

    .provider-main {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .provider-left {
      display: flex;
      align-items: center;
      gap: 12px;

      .provider-name {
        font-weight: 500;
        font-size: 14px;
      }
    }

    .provider-actions {
      display: flex;
      gap: 4px;
    }

    .model-selector {
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px dashed #e8e8e8;
      display: flex;
      align-items: center;
      gap: 12px;

      .model-label {
        color: #666;
        font-size: 13px;
      }
    }
  }

  .setting-item {
    margin-bottom: 24px;

    .title {
      font-size: 16px;
      font-weight: 500;
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 1px solid #eee;
    }
  }
}
</style>
