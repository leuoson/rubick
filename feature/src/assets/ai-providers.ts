/**
 * AI 供应商预设配置
 * 参考 dyad 项目的供应商配置
 */

export interface AIProviderPreset {
  id: string;
  name: string;
  type: 'openai' | 'anthropic' | 'google' | 'azure' | 'deepseek' | 'openrouter' | 'xai' | 'ollama' | 'lmstudio' | 'custom';
  baseUrl: string;
  models: string[];
  envVarName?: string;
  websiteUrl?: string;
  hasFreeTier?: boolean;
  description?: string;
  // 特殊配置字段
  requiresResourceName?: boolean; // Azure
  requiresProjectId?: boolean; // Vertex
  isLocal?: boolean; // Ollama, LM Studio
}

/**
 * 云端 AI 供应商预设
 */
export const CLOUD_PROVIDERS: AIProviderPreset[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    type: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    models: [
      'gpt-4o',
      'gpt-4o-mini',
      'gpt-4-turbo',
      'gpt-4',
      'gpt-3.5-turbo',
      'o1',
      'o1-mini',
      'o1-preview',
    ],
    envVarName: 'OPENAI_API_KEY',
    websiteUrl: 'https://platform.openai.com/api-keys',
    hasFreeTier: false,
    description: 'OpenAI 官方 API，支持 GPT-4、GPT-3.5 等模型',
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    type: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    models: [
      'claude-sonnet-4-20250514',
      'claude-3-5-sonnet-20241022',
      'claude-3-5-haiku-20241022',
      'claude-3-opus-20240229',
      'claude-3-sonnet-20240229',
      'claude-3-haiku-20240307',
    ],
    envVarName: 'ANTHROPIC_API_KEY',
    websiteUrl: 'https://console.anthropic.com/settings/keys',
    hasFreeTier: false,
    description: 'Anthropic Claude 系列模型，擅长代码和推理',
  },
  {
    id: 'google',
    name: 'Google AI',
    type: 'google',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    models: [
      'gemini-2.5-flash',
      'gemini-2.5-pro',
      'gemini-2.0-flash',
      'gemini-1.5-pro',
      'gemini-1.5-flash',
    ],
    envVarName: 'GOOGLE_GENERATIVE_AI_API_KEY',
    websiteUrl: 'https://aistudio.google.com/app/apikey',
    hasFreeTier: true,
    description: 'Google Gemini 系列模型，有免费额度',
  },
  {
    id: 'azure',
    name: 'Azure OpenAI',
    type: 'azure',
    baseUrl: 'https://{resourceName}.openai.azure.com',
    models: [
      'gpt-4o',
      'gpt-4',
      'gpt-35-turbo',
    ],
    envVarName: 'AZURE_API_KEY',
    websiteUrl: 'https://portal.azure.com/',
    hasFreeTier: false,
    description: 'Azure 托管的 OpenAI 服务，企业级安全',
    requiresResourceName: true,
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    type: 'openrouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    models: [
      'openai/gpt-4o',
      'anthropic/claude-3.5-sonnet',
      'google/gemini-pro-1.5',
      'meta-llama/llama-3.1-70b-instruct',
      'qwen/qwen-2.5-coder-32b-instruct',
    ],
    envVarName: 'OPENROUTER_API_KEY',
    websiteUrl: 'https://openrouter.ai/settings/keys',
    hasFreeTier: true,
    description: '统一接口访问多种模型，有免费模型可用',
  },
  {
    id: 'xai',
    name: 'xAI (Grok)',
    type: 'xai',
    baseUrl: 'https://api.x.ai/v1',
    models: [
      'grok-2',
      'grok-2-mini',
      'grok-beta',
    ],
    envVarName: 'XAI_API_KEY',
    websiteUrl: 'https://console.x.ai/',
    hasFreeTier: false,
    description: 'xAI Grok 系列模型',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    type: 'deepseek',
    baseUrl: 'https://api.deepseek.com/v1',
    models: [
      'deepseek-chat',
      'deepseek-coder',
      'deepseek-reasoner',
    ],
    envVarName: 'DEEPSEEK_API_KEY',
    websiteUrl: 'https://platform.deepseek.com/',
    hasFreeTier: false,
    description: 'DeepSeek 模型，性价比高',
  },
  {
    id: 'moonshot',
    name: 'Moonshot (Kimi)',
    type: 'custom',
    baseUrl: 'https://api.moonshot.cn/v1',
    models: [
      'moonshot-v1-8k',
      'moonshot-v1-32k',
      'moonshot-v1-128k',
    ],
    envVarName: 'MOONSHOT_API_KEY',
    websiteUrl: 'https://platform.moonshot.cn/',
    hasFreeTier: false,
    description: 'Moonshot Kimi 模型，支持超长上下文',
  },
  {
    id: 'zhipu',
    name: '智谱 AI (GLM)',
    type: 'custom',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    models: [
      'glm-4-plus',
      'glm-4',
      'glm-4-flash',
      'glm-4-air',
    ],
    envVarName: 'ZHIPU_API_KEY',
    websiteUrl: 'https://open.bigmodel.cn/',
    hasFreeTier: true,
    description: '智谱 GLM 系列模型，国产大模型',
  },
  {
    id: 'qwen',
    name: '通义千问 (Qwen)',
    type: 'custom',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: [
      'qwen-turbo',
      'qwen-plus',
      'qwen-max',
      'qwen-coder-plus',
    ],
    envVarName: 'DASHSCOPE_API_KEY',
    websiteUrl: 'https://dashscope.console.aliyun.com/',
    hasFreeTier: true,
    description: '阿里通义千问模型',
  },
  {
    id: 'doubao',
    name: '豆包 (Doubao)',
    type: 'custom',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    models: [
      'doubao-pro-32k',
      'doubao-lite-32k',
    ],
    envVarName: 'ARK_API_KEY',
    websiteUrl: 'https://console.volcengine.com/ark',
    hasFreeTier: true,
    description: '字节跳动豆包模型',
  },
];

/**
 * 本地 AI 供应商预设
 */
export const LOCAL_PROVIDERS: AIProviderPreset[] = [
  {
    id: 'ollama',
    name: 'Ollama',
    type: 'ollama',
    baseUrl: 'http://localhost:11434/v1',
    models: [
      'llama3.2',
      'llama3.1',
      'qwen2.5-coder',
      'deepseek-coder-v2',
      'codellama',
      'mistral',
    ],
    websiteUrl: 'https://ollama.com/',
    hasFreeTier: true,
    isLocal: true,
    description: '本地运行开源模型，无需 API Key',
  },
  {
    id: 'lmstudio',
    name: 'LM Studio',
    type: 'lmstudio',
    baseUrl: 'http://localhost:1234/v1',
    models: [],
    websiteUrl: 'https://lmstudio.ai/',
    hasFreeTier: true,
    isLocal: true,
    description: '本地模型管理工具，兼容 OpenAI API',
  },
];

/**
 * 所有预设供应商
 */
export const ALL_PROVIDERS: AIProviderPreset[] = [...CLOUD_PROVIDERS, ...LOCAL_PROVIDERS];

/**
 * 根据 ID 获取供应商预设
 */
export function getProviderPreset(id: string): AIProviderPreset | undefined {
  return ALL_PROVIDERS.find(p => p.id === id);
}

/**
 * 根据类型获取默认 Base URL
 */
export function getDefaultBaseUrl(type: string): string {
  const preset = ALL_PROVIDERS.find(p => p.type === type);
  return preset?.baseUrl || '';
}

/**
 * 根据类型获取默认模型列表
 */
export function getDefaultModels(type: string): string[] {
  const preset = ALL_PROVIDERS.find(p => p.type === type);
  return preset?.models || [];
}
