/**
 * OpenAI Provider
 *
 * Implementation of AIProviderInterface for GPT models.
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
import { getModel, estimateCost, DEFAULT_MODELS } from '../models'

export class OpenAIProvider implements AIProviderInterface {
  readonly provider = 'openai' as const
  private client: OpenAI | null = null
  private apiKey: string | null = null

  /**
   * Configure the provider with an API key
   */
  configure(apiKey: string, organization?: string): void {
    this.apiKey = apiKey
    this.client = new OpenAI({
      apiKey,
      ...(organization && { organization }),
    })
  }

  /**
   * Check if the provider is configured with valid credentials
   */
  isConfigured(): boolean {
    return this.client !== null && this.apiKey !== null
  }

  /**
   * Reset the provider, clearing credentials and client state
   */
  reset(): void {
    this.client = null
    this.apiKey = null
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
        // Skip if we already added system prompt from options
        continue
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
   * Map OpenAI finish reason to our format
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
    if (!this.client) {
      throw new Error('OpenAI provider not configured. Call configure() first.')
    }

    const modelId = options.model || DEFAULT_MODELS.openai.balanced
    const model = getModel(modelId)
    if (!model || model.provider !== 'openai') {
      throw new Error(`Invalid OpenAI model: ${modelId}`)
    }

    const convertedMessages = this.convertMessages(messages, options)

    const response = await this.client.chat.completions.create({
      model: modelId,
      messages: convertedMessages,
      ...(options.maxTokens && { max_tokens: options.maxTokens }),
      ...(options.temperature !== undefined && { temperature: options.temperature }),
      ...(options.stopSequences && { stop: options.stopSequences }),
      ...(options.jsonMode && { response_format: { type: 'json_object' } }),
    })

    const choice = response.choices[0]
    const content = choice?.message?.content || ''

    const usage: AIUsage = {
      inputTokens: response.usage?.prompt_tokens || 0,
      outputTokens: response.usage?.completion_tokens || 0,
      estimatedCost: estimateCost(
        modelId,
        response.usage?.prompt_tokens || 0,
        response.usage?.completion_tokens || 0
      ),
    }

    return {
      content,
      model: modelId,
      provider: 'openai',
      usage,
      finishReason: this.mapFinishReason(choice?.finish_reason || null),
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
    if (!this.client) {
      throw new Error('OpenAI provider not configured. Call configure() first.')
    }

    const modelId = options.model || DEFAULT_MODELS.openai.balanced
    const model = getModel(modelId)
    if (!model || model.provider !== 'openai') {
      throw new Error(`Invalid OpenAI model: ${modelId}`)
    }

    const convertedMessages = this.convertMessages(messages, options)

    let fullText = ''

    try {
      const stream = await this.client.chat.completions.create({
        model: modelId,
        messages: convertedMessages,
        stream: true,
        ...(options.maxTokens && { max_tokens: options.maxTokens }),
        ...(options.temperature !== undefined && { temperature: options.temperature }),
        ...(options.stopSequences && { stop: options.stopSequences }),
        ...(options.jsonMode && { response_format: { type: 'json_object' } }),
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
export const openaiProvider = new OpenAIProvider()
