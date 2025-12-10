import {
  AIProvider,
  AIProviderInfo,
  AIChatRequest,
  AIChatResponse,
  AIConfig,
} from './types';

// 延迟导入 localConfig，避免模块加载顺序问题
const getLocalConfig = () => require('../initLocalConfig').default;

/**
 * AI 服务 - 负责管理 AI 提供商配置和代理 AI 调用
 */
class AIService {
  /**
   * 获取 AI 配置（完整，含 API Key）
   */
  async getAIConfig(): Promise<AIConfig> {
    const localConfig = getLocalConfig();
    const config = await localConfig.getConfig();
    return (
      config?.perf?.ai || {
        providers: [],
        defaultProviderId: '',
        defaultModel: '',
      }
    );
  }

  /**
   * 保存 AI 配置
   */
  async saveAIConfig(aiConfig: AIConfig): Promise<void> {
    const localConfig = getLocalConfig();
    const config = await localConfig.getConfig();
    await localConfig.setConfig({
      ...config,
      perf: {
        ...config.perf,
        ai: aiConfig,
      },
    });
  }

  /**
   * 获取提供商列表（安全，不含 API Key）
   * 用于暴露给插件
   */
  async getProviders(): Promise<AIProviderInfo[]> {
    const config = await this.getAIConfig();
    return config.providers.map((provider) => ({
      id: provider.id,
      name: provider.name,
      type: provider.type,
      models: provider.models,
      enabled: provider.enabled,
    }));
  }

  /**
   * 获取默认提供商和模型
   */
  async getDefaultConfig(): Promise<{
    providerId: string;
    model: string;
  }> {
    const config = await this.getAIConfig();
    return {
      providerId: config.defaultProviderId,
      model: config.defaultModel,
    };
  }

  /**
   * 根据 ID 获取完整的提供商配置（含 API Key）
   */
  private async getProviderById(
    providerId: string
  ): Promise<AIProvider | null> {
    const config = await this.getAIConfig();
    return config.providers.find((p) => p.id === providerId) || null;
  }

  /**
   * 代理 AI 聊天调用
   */
  async chat(request: AIChatRequest): Promise<AIChatResponse> {
    const provider = await this.getProviderById(request.providerId);

    if (!provider) {
      return {
        success: false,
        error: `未找到 AI 提供商: ${request.providerId}`,
      };
    }

    if (!provider.enabled) {
      return {
        success: false,
        error: `AI 提供商 ${provider.name} 已禁用`,
      };
    }

    if (!provider.models.includes(request.model)) {
      return {
        success: false,
        error: `模型 ${request.model} 不在提供商 ${provider.name} 的可用模型列表中`,
      };
    }

    try {
      const response = await this.callOpenAICompatible(provider, request);
      return response;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * OpenAI 兼容 API 调用
   */
  private async callOpenAICompatible(
    provider: AIProvider,
    request: AIChatRequest
  ): Promise<AIChatResponse> {
    const url = `${provider.baseUrl.replace(/\/$/, '')}/chat/completions`;

    const body = {
      model: request.model,
      messages: request.messages,
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens,
      stream: false,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API 请求失败 (${response.status}): ${errorText}`);
    }

    const data = await response.json();

    return {
      success: true,
      content: data.choices?.[0]?.message?.content || '',
      usage: data.usage
        ? {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
            totalTokens: data.usage.total_tokens,
          }
        : undefined,
    };
  }

  /**
   * 流式 AI 聊天调用
   * 返回一个异步生成器
   */
  async *chatStream(
    request: AIChatRequest
  ): AsyncGenerator<{ type: string; content?: string; error?: string }> {
    const provider = await this.getProviderById(request.providerId);

    if (!provider) {
      yield { type: 'error', error: `未找到 AI 提供商: ${request.providerId}` };
      return;
    }

    if (!provider.enabled) {
      yield { type: 'error', error: `AI 提供商 ${provider.name} 已禁用` };
      return;
    }

    try {
      yield { type: 'start' };

      const url = `${provider.baseUrl.replace(/\/$/, '')}/chat/completions`;

      const body = {
        model: request.model,
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens,
        stream: true,
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${provider.apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        yield {
          type: 'error',
          error: `API 请求失败 (${response.status}): ${errorText}`,
        };
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        yield { type: 'error', error: '无法获取响应流' };
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;

          const data = trimmed.slice(6);
          if (data === '[DONE]') {
            yield { type: 'done' };
            return;
          }

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              yield { type: 'delta', content };
            }
          } catch {
            // 忽略解析错误
          }
        }
      }

      yield { type: 'done' };
    } catch (error) {
      yield {
        type: 'error',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

export default new AIService();
