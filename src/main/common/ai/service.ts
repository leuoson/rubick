import { streamText, generateText, LanguageModel } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import {
  AIProvider,
  AIProviderInfo,
  AIChatRequest,
  AIChatResponse,
  AIConfig,
  AIStreamEvent,
  AIChatMessage,
  AIMessagePart,
} from './types';
import localConfig from '@/main/common/initLocalConfig';

// 存储活跃的流式请求，用于取消
const activeStreams = new Map<string, AbortController>();

/**
 * AI 服务 - 负责管理 AI 提供商配置和代理 AI 调用
 * 使用 Vercel AI SDK 支持多供应商
 */
class AIService {
  /**
   * 获取 AI 配置（完整，含 API Key）
   */
  async getAIConfig(): Promise<AIConfig> {
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
   * 根据提供商配置创建 AI SDK 模型客户端
   */
  private createModelClient(provider: AIProvider, model: string): LanguageModel {
    switch (provider.type) {
      case 'openai': {
        const openai = createOpenAI({
          apiKey: provider.apiKey,
          baseURL: provider.baseUrl || undefined,
        });
        return openai(model);
      }
      case 'anthropic': {
        const anthropic = createAnthropic({
          apiKey: provider.apiKey,
          baseURL: provider.baseUrl || undefined,
        });
        return anthropic(model);
      }
      case 'google': {
        const google = createGoogleGenerativeAI({
          apiKey: provider.apiKey,
          baseURL: provider.baseUrl || undefined,
        });
        return google(model);
      }
      case 'azure':
      case 'openai-compatible':
      default: {
        if (!provider.baseUrl) {
          throw new Error(`提供商 ${provider.name} 需要配置 baseUrl`);
        }
        const compatible = createOpenAICompatible({
          name: provider.name,
          apiKey: provider.apiKey,
          baseURL: provider.baseUrl,
        });
        return compatible(model);
      }
    }
  }

  /**
   * 转换消息格式为 AI SDK 格式
   */
  private convertMessages(messages: AIChatMessage[]): any[] {
    return messages.map((msg) => {
      if (typeof msg.content === 'string') {
        return {
          role: msg.role,
          content: msg.content,
        };
      }
      // 多模态消息
      const parts = (msg.content as AIMessagePart[]).map((part) => {
        if (part.type === 'text') {
          return { type: 'text', text: part.text };
        }
        if (part.type === 'image') {
          return {
            type: 'image',
            image: part.image,
            mimeType: part.mimeType,
          };
        }
        return part;
      });
      return {
        role: msg.role,
        content: parts,
      };
    });
  }

  /**
   * 代理 AI 聊天调用（非流式）
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

    try {
      const modelClient = this.createModelClient(provider, request.model);
      const messages = this.convertMessages(request.messages);

      const result = await generateText({
        model: modelClient,
        messages,
        temperature: request.temperature ?? 0.7,
        maxOutputTokens: request.maxTokens,
      });

      // AI SDK v5 使用 inputTokens/outputTokens
      const usage = result.usage as any;
      return {
        success: true,
        content: result.text,
        usage: usage
          ? {
              promptTokens: usage.inputTokens ?? usage.promptTokens ?? 0,
              completionTokens: usage.outputTokens ?? usage.completionTokens ?? 0,
              totalTokens: (usage.inputTokens ?? usage.promptTokens ?? 0) + (usage.outputTokens ?? usage.completionTokens ?? 0),
            }
          : undefined,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 流式 AI 聊天调用
   * 返回一个异步生成器，支持取消
   */
  async *chatStream(
    request: AIChatRequest,
    requestId?: string
  ): AsyncGenerator<AIStreamEvent> {
    const provider = await this.getProviderById(request.providerId);

    if (!provider) {
      yield { type: 'error', error: `未找到 AI 提供商: ${request.providerId}` };
      return;
    }

    if (!provider.enabled) {
      yield { type: 'error', error: `AI 提供商 ${provider.name} 已禁用` };
      return;
    }

    // 创建 AbortController 用于取消请求
    const abortController = new AbortController();
    if (requestId) {
      activeStreams.set(requestId, abortController);
    }

    try {
      yield { type: 'start' };

      const modelClient = this.createModelClient(provider, request.model);
      const messages = this.convertMessages(request.messages);

      const result = streamText({
        model: modelClient,
        messages,
        temperature: request.temperature ?? 0.7,
        maxOutputTokens: request.maxTokens,
        abortSignal: abortController.signal,
      });

      // 流式输出文本
      for await (const textPart of result.textStream) {
        if (abortController.signal.aborted) {
          yield { type: 'error', error: '请求已取消' };
          return;
        }
        if (textPart) {
          yield { type: 'delta', content: textPart };
        }
      }

      // 获取 usage 信息 (AI SDK v5 使用 inputTokens/outputTokens)
      const usage = await result.usage as any;
      if (usage) {
        yield {
          type: 'usage',
          usage: {
            promptTokens: usage.inputTokens ?? usage.promptTokens ?? 0,
            completionTokens: usage.outputTokens ?? usage.completionTokens ?? 0,
            totalTokens: (usage.inputTokens ?? usage.promptTokens ?? 0) + (usage.outputTokens ?? usage.completionTokens ?? 0),
          },
        };
      }

      yield { type: 'done' };
    } catch (error) {
      if (abortController.signal.aborted) {
        yield { type: 'error', error: '请求已取消' };
      } else {
        yield {
          type: 'error',
          error: error instanceof Error ? error.message : String(error),
        };
      }
    } finally {
      if (requestId) {
        activeStreams.delete(requestId);
      }
    }
  }

  /**
   * 取消流式请求
   */
  cancelStream(requestId: string): boolean {
    const controller = activeStreams.get(requestId);
    if (controller) {
      controller.abort();
      activeStreams.delete(requestId);
      return true;
    }
    return false;
  }
}

export default new AIService();
