/**
 * AI 提供商配置（完整，含 API Key）
 */
export interface AIProvider {
  id: string;
  name: string;
  type: 'openai' | 'anthropic' | 'azure' | 'custom';
  apiKey: string;
  baseUrl: string;
  models: string[];
  enabled: boolean;
}

/**
 * AI 提供商信息（安全，不含 API Key，暴露给插件）
 */
export interface AIProviderInfo {
  id: string;
  name: string;
  type: string;
  models: string[];
  enabled: boolean;
}

/**
 * AI 聊天消息
 */
export interface AIChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * AI 聊天请求参数
 */
export interface AIChatRequest {
  providerId: string;
  model: string;
  messages: AIChatMessage[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

/**
 * AI 聊天响应
 */
export interface AIChatResponse {
  success: boolean;
  content?: string;
  error?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * AI 流式响应事件
 */
export interface AIStreamEvent {
  type: 'start' | 'delta' | 'done' | 'error';
  content?: string;
  error?: string;
}

/**
 * AI 配置
 */
export interface AIConfig {
  providers: AIProvider[];
  defaultProviderId: string;
  defaultModel: string;
}
