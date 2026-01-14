/**
 * Anthropic Provider
 *
 * Implementation of AIProviderInterface for Claude models.
 */

import Anthropic from '@anthropic-ai/sdk'
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

export class AnthropicProvider implements AIProviderInterface {
  readonly provider = 'anthropic' as const
  private client: Anthropic | null = null
  private apiKey: string | null = null

  /**
   * Configure the provider with an API key
   */
  configure(apiKey: string): void {
    this.apiKey = apiKey
    this.client = new Anthropic({ apiKey })
  }

  /**
   * Check if the provider is configured with valid credentials
   */
  isConfigured(): boolean {
    return this.client !== null && this.apiKey !== null
  }

  /**
   * Convert our message format to Anthropic's format
   */
  private convertMessages(
    messages: AIMessage[]
  ): Anthropic.MessageCreateParams['messages'] {
    return messages
      .filter((m) => m.role !== 'system')
      .map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content: this.convertContent(msg.content),
      }))
  }

  /**
   * Convert content to Anthropic format
   */
  private convertContent(
    content: string | AIContentBlock[]
  ): Anthropic.ContentBlockParam[] | string {
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
            type: 'image' as const,
            source: {
              type: 'base64' as const,
              media_type: block.mimeType as
                | 'image/jpeg'
                | 'image/png'
                | 'image/gif'
                | 'image/webp',
              data: block.imageBase64,
            },
          }
        }
        if (block.imageUrl) {
          return {
            type: 'image' as const,
            source: {
              type: 'url' as const,
              url: block.imageUrl,
            },
          }
        }
      }
      return { type: 'text' as const, text: '' }
    })
  }

  /**
   * Extract system prompt from messages
   */
  private extractSystemPrompt(
    messages: AIMessage[],
    options: CompletionOptions
  ): string | undefined {
    // Use explicit system prompt if provided
    if (options.systemPrompt) {
      return options.systemPrompt
    }

    // Otherwise look for system message in the messages array
    const systemMessage = messages.find((m) => m.role === 'system')
    if (systemMessage) {
      return typeof systemMessage.content === 'string'
        ? systemMessage.content
        : systemMessage.content
            .filter((b) => b.type === 'text')
            .map((b) => b.text)
            .join('\n')
    }

    return undefined
  }

  /**
   * Map Anthropic stop reason to our format
   */
  private mapStopReason(
    stopReason: string | null
  ): AIResponse['finishReason'] {
    switch (stopReason) {
      case 'end_turn':
        return 'complete'
      case 'max_tokens':
        return 'length'
      case 'stop_sequence':
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
      throw new Error('Anthropic provider not configured. Call configure() first.')
    }

    const modelId = options.model || DEFAULT_MODELS.anthropic.balanced
    const model = getModel(modelId)
    if (!model || model.provider !== 'anthropic') {
      throw new Error(`Invalid Anthropic model: ${modelId}`)
    }

    const systemPrompt = this.extractSystemPrompt(messages, options)
    const convertedMessages = this.convertMessages(messages)

    const response = await this.client.messages.create({
      model: modelId,
      max_tokens: options.maxTokens || model.maxOutputTokens,
      messages: convertedMessages,
      ...(systemPrompt && { system: systemPrompt }),
      ...(options.temperature !== undefined && { temperature: options.temperature }),
      ...(options.stopSequences && { stop_sequences: options.stopSequences }),
    })

    const content = response.content
      .filter((block) => block.type === 'text')
      .map((block) => (block as Anthropic.TextBlock).text)
      .join('')

    const usage: AIUsage = {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      estimatedCost: estimateCost(
        modelId,
        response.usage.input_tokens,
        response.usage.output_tokens
      ),
    }

    return {
      content,
      model: modelId,
      provider: 'anthropic',
      usage,
      finishReason: this.mapStopReason(response.stop_reason),
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
      throw new Error('Anthropic provider not configured. Call configure() first.')
    }

    const modelId = options.model || DEFAULT_MODELS.anthropic.balanced
    const model = getModel(modelId)
    if (!model || model.provider !== 'anthropic') {
      throw new Error(`Invalid Anthropic model: ${modelId}`)
    }

    const systemPrompt = this.extractSystemPrompt(messages, options)
    const convertedMessages = this.convertMessages(messages)

    let fullText = ''
    // Track tokens for potential future usage reporting
    let _inputTokens = 0
    let _outputTokens = 0

    try {
      const stream = await this.client.messages.stream({
        model: modelId,
        max_tokens: options.maxTokens || model.maxOutputTokens,
        messages: convertedMessages,
        ...(systemPrompt && { system: systemPrompt }),
        ...(options.temperature !== undefined && { temperature: options.temperature }),
        ...(options.stopSequences && { stop_sequences: options.stopSequences }),
      })

      for await (const event of stream) {
        if (event.type === 'content_block_delta') {
          const delta = event.delta
          if ('text' in delta) {
            fullText += delta.text
            callbacks.onChunk(delta.text)
          }
        }
        if (event.type === 'message_delta') {
          if (event.usage) {
            _outputTokens = event.usage.output_tokens
          }
        }
        if (event.type === 'message_start') {
          if (event.message.usage) {
            _inputTokens = event.message.usage.input_tokens
          }
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
export const anthropicProvider = new AnthropicProvider()
