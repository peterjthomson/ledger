/**
 * OpenRouter Provider
 *
 * Implementation of AIProviderInterface for OpenRouter/OpenCode Zen.
 *
 * This provider supports two modes:
 * 1. FREE TIER (no API key): Uses OpenCode Zen API with anonymous access
 *    - Endpoint: https://opencode.ai/zen/v1
 *    - API Key: "public"
 *    - Free models: gpt-5-nano, big-pickle, glm-4.7-free, grok-code, minimax-m2.1-free
 *
 * 2. PAID TIER (with API key): Uses OpenRouter API for 300+ models
 *    - Endpoint: https://openrouter.ai/api/v1
 *    - Get API key at: https://openrouter.ai/keys
 */

import OpenAI from 'openai'
import type {
  AIProviderInterface,
  AIMessage,
  AIResponse,
  AIUsage,
  CompletionOptions,
  StreamCallbacks,
  AIContentBlock,
} from '../types'

// Default free models by tier (OpenCode Zen)
// Model definitions are in lib/main/ai/models.ts (MODEL_REGISTRY)
// Using big-pickle for quick/balanced since it's fast and reliable
export const OPENROUTER_DEFAULTS = {
  quick: 'big-pickle',
  balanced: 'big-pickle',
  powerful: 'grok-code',
}

// OpenCode Zen API endpoint (free, anonymous access)
const OPENCODE_ZEN_API = 'https://opencode.ai/zen/v1'
const OPENCODE_ZEN_PUBLIC_KEY = 'public'

// OpenRouter API endpoint (requires API key)
const OPENROUTER_API = 'https://openrouter.ai/api/v1'

const SHOULD_MOCK_OPENROUTER =
  process.env.LEDGER_MOCK_OPENROUTER === '1' ||
  process.env.LEDGER_MOCK_OPENROUTER === 'true'

export class OpenRouterProvider implements AIProviderInterface {
  readonly provider = 'openrouter' as const
  private client: OpenAI | null = null
  private apiKey: string | null = null
  private isUsingFreeTier: boolean = false

  /**
   * Configure the provider
   * - With API key: Uses OpenRouter API (300+ models)
   * - Without API key: Uses OpenCode Zen free tier (anonymous)
   */
  configure(apiKey?: string): void {
    this.apiKey = apiKey || ''
    this.isUsingFreeTier = !apiKey || apiKey === ''

    if (this.isUsingFreeTier) {
      // Free tier: Use OpenCode Zen with public key
      this.client = new OpenAI({
        apiKey: OPENCODE_ZEN_PUBLIC_KEY,
        baseURL: OPENCODE_ZEN_API,
        defaultHeaders: {
          'User-Agent': 'Ledger/1.0',
        },
      })
    } else {
      // Paid tier: Use OpenRouter with user's API key
      this.client = new OpenAI({
        apiKey,
        baseURL: OPENROUTER_API,
        defaultHeaders: {
          'HTTP-Referer': 'https://github.com/AnomalyLabs/ledger',
          'X-Title': 'Ledger Git Client',
        },
      })
    }
  }

  /**
   * Check if the provider is configured
   */
  isConfigured(): boolean {
    return this.client !== null
  }

  /**
   * Reset the provider, clearing credentials and client state
   */
  reset(): void {
    this.client = null
    this.apiKey = ''
    this.isUsingFreeTier = false
  }

  /**
   * Check if using free tier
   */
  isFreeTier(): boolean {
    return this.isUsingFreeTier
  }

  /**
   * Convert our message format to OpenAI's format
   */
  private convertMessages(
    messages: AIMessage[],
    options: CompletionOptions
  ): OpenAI.ChatCompletionMessageParam[] {
    const result: OpenAI.ChatCompletionMessageParam[] = []

    // Add system prompt if provided
    if (options.systemPrompt) {
      result.push({ role: 'system', content: options.systemPrompt })
    }

    for (const msg of messages) {
      if (msg.role === 'system' && options.systemPrompt) {
        continue // Skip if we already added system prompt from options
      }

      result.push({
        role: msg.role,
        content: this.convertContent(msg.content),
      } as OpenAI.ChatCompletionMessageParam)
    }

    return result
  }

  /**
   * Convert content to OpenAI format
   */
  private convertContent(
    content: string | AIContentBlock[]
  ): string | OpenAI.ChatCompletionContentPart[] {
    if (typeof content === 'string') {
      return content
    }

    return content.map((block) => {
      if (block.type === 'text') {
        return { type: 'text' as const, text: block.text || '' }
      }
      if (block.type === 'image') {
        if (block.imageBase64 && block.mimeType) {
          return {
            type: 'image_url' as const,
            image_url: {
              url: `data:${block.mimeType};base64,${block.imageBase64}`,
            },
          }
        }
        if (block.imageUrl) {
          return {
            type: 'image_url' as const,
            image_url: { url: block.imageUrl },
          }
        }
      }
      return { type: 'text' as const, text: '' }
    })
  }

  /**
   * Map finish reason to our format
   */
  private mapFinishReason(
    finishReason: string | null
  ): AIResponse['finishReason'] {
    switch (finishReason) {
      case 'stop':
        return 'complete'
      case 'length':
        return 'length'
      case 'content_filter':
        return 'stop'
      default:
        return 'complete'
    }
  }

  /**
   * Send a completion request
   */
  async complete(
    messages: AIMessage[],
    options: CompletionOptions = {}
  ): Promise<AIResponse> {
    const modelId = options.model || OPENROUTER_DEFAULTS.balanced
    if (SHOULD_MOCK_OPENROUTER) {
      return {
        content: 'Hello',
        model: modelId,
        provider: 'openrouter' as const,
        usage: { inputTokens: 3, outputTokens: 1, estimatedCost: 0 },
        finishReason: 'complete',
      }
    }

    if (!this.client) {
      // Auto-configure for free tier if not configured
      this.configure()
    }
    const convertedMessages = this.convertMessages(messages, options)

    try {
      const response = await this.client!.chat.completions.create({
        model: modelId,
        messages: convertedMessages,
        ...(options.maxTokens && { max_tokens: options.maxTokens }),
        ...(options.temperature !== undefined && { temperature: options.temperature }),
        ...(options.stopSequences && { stop: options.stopSequences }),
      })

      const choice = response.choices?.[0]
      const content = choice?.message?.content || ''

      // Handle usage - may be undefined or have different field names
      const usage: AIUsage = {
        inputTokens: response.usage?.prompt_tokens ?? response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? response.usage?.output_tokens ?? 0,
        estimatedCost: 0, // Free models
      }

      return {
        content,
        model: response.model || modelId,
        provider: 'openrouter' as const,
        usage,
        finishReason: this.mapFinishReason(choice?.finish_reason || null),
      }
    } catch (error) {
      // Handle specific network and API errors with user-friendly messages
      const err = error as { code?: string; status?: number; message?: string }
      if (err.code === 'ENOTFOUND' || err.code === 'ETIMEDOUT' || err.code === 'ECONNREFUSED') {
        throw new Error('OpenRouter/OpenCode Zen is currently unavailable. Please check your internet connection and try again.')
      }
      if (err.status === 429) {
        throw new Error('Rate limit exceeded. Please wait a moment and try again.')
      }
      if (err.status === 401) {
        throw new Error('Invalid API key. Please check your OpenRouter API key in settings.')
      }
      if (err.status === 503 || err.status === 502) {
        throw new Error('OpenRouter/OpenCode Zen service is temporarily unavailable. Please try again later.')
      }
      throw error
    }
  }

  /**
   * Stream a completion request
   */
  async stream(
    messages: AIMessage[],
    callbacks: StreamCallbacks,
    options: CompletionOptions = {}
  ): Promise<void> {
    const modelId = options.model || OPENROUTER_DEFAULTS.balanced
    if (SHOULD_MOCK_OPENROUTER) {
      callbacks.onChunk('Hello')
      callbacks.onComplete?.('Hello')
      return
    }

    if (!this.client) {
      this.configure()
    }
    const convertedMessages = this.convertMessages(messages, options)

    let fullText = ''

    try {
      const stream = await this.client!.chat.completions.create({
        model: modelId,
        messages: convertedMessages,
        stream: true,
        ...(options.maxTokens && { max_tokens: options.maxTokens }),
        ...(options.temperature !== undefined && { temperature: options.temperature }),
        ...(options.stopSequences && { stop: options.stopSequences }),
      })

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content
        if (delta) {
          fullText += delta
          callbacks.onChunk(delta)
        }
      }

      callbacks.onComplete?.(fullText)
    } catch (error) {
      callbacks.onError?.(error instanceof Error ? error : new Error(String(error)))
      throw error
    }
  }
}

/**
 * Singleton instance
 */
export const openrouterProvider = new OpenRouterProvider()
