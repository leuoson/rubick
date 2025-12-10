<template>
  <div class="ai-settings">
    <div class="setting-item">
      <div class="title">{{ $t('feature.settings.ai.providers') }}</div>
      <div class="provider-list">
        <a-card
          v-for="(provider, index) in providers"
          :key="provider.id"
          class="provider-card"
          size="small"
        >
          <template #title>
            <div class="provider-header">
              <a-switch
                v-model:checked="provider.enabled"
                size="small"
                @change="saveConfig"
              />
              <span class="provider-name">{{ provider.name }}</span>
              <a-tag :color="getTypeColor(provider.type)">{{ provider.type }}</a-tag>
            </div>
          </template>
          <template #extra>
            <a-space>
              <a-button type="text" size="small" @click="editProvider(index)">
                <EditOutlined />
              </a-button>
              <a-popconfirm
                :title="$t('feature.settings.ai.deleteConfirm')"
                @confirm="deleteProvider(index)"
              >
                <a-button type="text" size="small" danger>
                  <DeleteOutlined />
                </a-button>
              </a-popconfirm>
            </a-space>
          </template>
          <div class="provider-info">
            <div class="info-row">
              <span class="label">Base URL:</span>
              <span class="value">{{ provider.baseUrl }}</span>
            </div>
            <div class="info-row">
              <span class="label">API Key:</span>
              <span class="value">{{ maskApiKey(provider.apiKey) }}</span>
            </div>
            <div class="info-row">
              <span class="label">{{ $t('feature.settings.ai.models') }}:</span>
              <div class="models-list">
                <a-tag v-for="model in provider.models" :key="model" size="small">
                  {{ model }}
                </a-tag>
              </div>
            </div>
          </div>
        </a-card>

        <a-button type="dashed" class="add-btn" block @click="showAddModal">
          <PlusOutlined />
          {{ $t('feature.settings.ai.addProvider') }}
        </a-button>
      </div>
    </div>

    <div class="setting-item">
      <div class="title">{{ $t('feature.settings.ai.defaultSettings') }}</div>
      <div class="settings-item-li">
        <div class="label">{{ $t('feature.settings.ai.defaultProvider') }}</div>
        <a-select
          v-model:value="defaultProviderId"
          style="width: 240px"
          :options="providerOptions"
          @change="saveConfig"
        />
      </div>
      <div class="settings-item-li">
        <div class="label">{{ $t('feature.settings.ai.defaultModel') }}</div>
        <a-select
          v-model:value="defaultModel"
          style="width: 240px"
          :options="modelOptions"
          @change="saveConfig"
        />
      </div>
    </div>

    <!-- Add/Edit Provider Modal -->
    <a-modal
      v-model:open="modalVisible"
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
            <a-select-option value="azure">Azure OpenAI</a-select-option>
            <a-select-option value="custom">Custom</a-select-option>
          </a-select>
        </a-form-item>

        <a-form-item label="Base URL" required>
          <a-input v-model:value="formState.baseUrl" placeholder="https://api.openai.com/v1" />
        </a-form-item>

        <a-form-item label="API Key" required>
          <a-input-password v-model:value="formState.apiKey" placeholder="sk-..." />
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
});

// 初始化加载配置
const loadConfig = () => {
  const config = localConfig.getConfig();
  const aiConfig = config?.perf?.ai || {
    providers: [],
    defaultProviderId: '',
    defaultModel: '',
  };
  providers.value = aiConfig.providers || [];
  defaultProviderId.value = aiConfig.defaultProviderId || '';
  defaultModel.value = aiConfig.defaultModel || '';
};

loadConfig();

// 保存配置
const saveConfig = debounce(() => {
  const config = localConfig.getConfig();
  localConfig.setConfig({
    perf: {
      ...config.perf,
      ai: {
        providers: providers.value,
        defaultProviderId: defaultProviderId.value,
        defaultModel: defaultModel.value,
      },
    },
  });
  message.success(t('feature.settings.ai.saved'));
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
    azure: 'blue',
    custom: 'purple',
  };
  return colors[type] || 'default';
};

const maskApiKey = (apiKey) => {
  if (!apiKey) return '';
  if (apiKey.length <= 8) return '********';
  return apiKey.slice(0, 4) + '...' + apiKey.slice(-4);
};

const onTypeChange = (type) => {
  const baseUrls = {
    openai: 'https://api.openai.com/v1',
    anthropic: 'https://api.anthropic.com/v1',
    azure: 'https://YOUR_RESOURCE.openai.azure.com',
    custom: '',
  };
  const defaultModels = {
    openai: ['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    anthropic: ['claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku'],
    azure: ['gpt-4', 'gpt-35-turbo'],
    custom: [],
  };
  formState.baseUrl = baseUrls[type] || '';
  formState.models = defaultModels[type] || [];
};

const resetForm = () => {
  formState.id = '';
  formState.name = '';
  formState.type = 'openai';
  formState.apiKey = '';
  formState.baseUrl = 'https://api.openai.com/v1';
  formState.models = ['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo'];
  formState.enabled = true;
};

const showAddModal = () => {
  editingIndex.value = -1;
  resetForm();
  modalVisible.value = true;
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
  const provider = providers.value[index];
  providers.value.splice(index, 1);
  // 如果删除的是默认提供商，清空默认设置
  if (defaultProviderId.value === provider.id) {
    defaultProviderId.value = '';
    defaultModel.value = '';
  }
  saveConfig();
};

const handleModalOk = () => {
  // 验证
  if (!formState.name || !formState.apiKey || !formState.baseUrl) {
    message.error(t('feature.settings.ai.fillRequired'));
    return;
  }

  const providerData = {
    id: formState.id || `provider_${Date.now()}`,
    name: formState.name,
    type: formState.type,
    apiKey: formState.apiKey,
    baseUrl: formState.baseUrl,
    models: formState.models,
    enabled: formState.enabled,
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
  .provider-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-top: 12px;
  }

  .provider-card {
    .provider-header {
      display: flex;
      align-items: center;
      gap: 8px;

      .provider-name {
        font-weight: 500;
      }
    }

    .provider-info {
      .info-row {
        display: flex;
        margin-bottom: 8px;

        .label {
          width: 80px;
          color: #666;
          flex-shrink: 0;
        }

        .value {
          color: #333;
          word-break: break-all;
        }

        .models-list {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
        }
      }
    }
  }

  .add-btn {
    margin-top: 8px;
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

  .settings-item-li {
    display: flex;
    align-items: center;
    padding: 8px 0;

    .label {
      width: 120px;
      color: #666;
    }
  }
}
</style>
