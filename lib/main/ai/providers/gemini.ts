/**
 * Gemini Provider
 *
 * Implementation of AIProviderInterface for Google Gemini models.
 */

import { GoogleGenerativeAI, GenerativeModel, Content, Part } from '@google/generative-ai'
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

export class GeminiProvider implements AIProviderInterface {
  readonly provider = 'gemini' as const
  private client: GoogleGenerativeAI | null = null
  private apiKey: string | null = null

  /**
   * Configure the provider with an API key
   */
  configure(apiKey: string): void {
    this.apiKey = apiKey
    this.client = new GoogleGenerativeAI(apiKey)
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
   * Get a generative model instance
   */
  private getGenerativeModel(modelId: string, options: CompletionOptions): GenerativeModel {
    if (!this.client) {
      throw new Error('Gemini provider not configured')
    }

    return this.client.getGenerativeModel({
      model: modelId,
      generationConfig: {
        ...(options.maxTokens && { maxOutputTokens: options.maxTokens }),
        ...(options.temperature !== undefined && { temperature: options.temperature }),
        ...(options.stopSequences && { stopSequences: options.stopSequences }),
        ...(options.jsonMode && { responseMimeType: 'application/json' }),
      },
      ...(options.systemPrompt && { systemInstruction: options.systemPrompt }),
    })
  }

  /**
   * Convert our message format to Gemini's format
   */
  private convertMessages(messages: AIMessage[], _options: CompletionOptions): Content[] {
    const contents: Content[] = []

    for (const msg of messages) {
      if (msg.role === 'system') {
        // System messages handled via systemInstruction in model config
        continue
      }

      contents.push({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: this.convertContent(msg.content),
      })
    }

    return contents
  }

  /**
   * Convert content to Gemini format
   */
  private convertContent(content: string | AIContentBlock[]): Part[] {
    if (typeof content === 'string') {
      return [{ text: content }]
    }

    return content.map((block) => {
      if (block.type === 'text') {
        return { text: block.text || '' }
      }
      if (block.type === 'image') {
        if (block.imageBase64 && block.mimeType) {
          return {
            inlineData: {
              mimeType: block.mimeType,
              data: block.imageBase64,
            },
          }
        }
        // Gemini doesn't support URL-based images directly in the same way
        // Would need to fetch and convert to base64
        return { text: '[Image URL not supported, convert to base64]' }
      }
      return { text: '' }
    })
  }

  /**
   * Extract system prompt from messages if not in options
   */
  private extractSystemPrompt(
    messages: AIMessage[],
    options: CompletionOptions
  ): string | undefined {
    if (options.systemPrompt) {
      return options.systemPrompt
    }

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
   * Map Gemini finish reason to our format
   */
  private mapFinishReason(
    finishReason: string | undefined
  ): AIResponse['finishReason'] {
    switch (finishReason) {
      case 'STOP':
        return 'complete'
      case 'MAX_TOKENS':
        return 'length'
      case 'SAFETY':
      case 'RECITATION':
      case 'OTHER':
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
      throw new Error('Gemini provider not configured. Call configure() first.')
    }

    const modelId = options.model || DEFAULT_MODELS.gemini.balanced
    const model = getModel(modelId)
    if (!model || model.provider !== 'gemini') {
      throw new Error(`Invalid Gemini model: ${modelId}`)
    }

    // Extract system prompt and include it in options
    const systemPrompt = this.extractSystemPrompt(messages, options)
    const optionsWithSystem = { ...options, systemPrompt }

    const generativeModel = this.getGenerativeModel(modelId, optionsWithSystem)
    const contents = this.convertMessages(messages, optionsWithSystem)

    const result = await generativeModel.generateContent({ contents })
    const response = result.response
    const text = response.text()

    // Gemini's usage metadata
    const usageMetadata = response.usageMetadata
    const inputTokens = usageMetadata?.promptTokenCount || 0
    const outputTokens = usageMetadata?.candidatesTokenCount || 0

    const usage: AIUsage = {
      inputTokens,
      outputTokens,
      estimatedCost: estimateCost(modelId, inputTokens, outputTokens),
    }

    const candidate = response.candidates?.[0]
    const finishReason = candidate?.finishReason

    return {
      content: text,
      model: modelId,
      provider: 'gemini',
      usage,
      finishReason: this.mapFinishReason(finishReason),
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
      throw new Error('Gemini provider not configured. Call configure() first.')
    }

    const modelId = options.model || DEFAULT_MODELS.gemini.balanced
    const model = getModel(modelId)
    if (!model || model.provider !== 'gemini') {
      throw new Error(`Invalid Gemini model: ${modelId}`)
    }

    // Extract system prompt and include it in options
    const systemPrompt = this.extractSystemPrompt(messages, options)
    const optionsWithSystem = { ...options, systemPrompt }

    const generativeModel = this.getGenerativeModel(modelId, optionsWithSystem)
    const contents = this.convertMessages(messages, optionsWithSystem)

    let fullText = ''

    try {
      const result = await generativeModel.generateContentStream({ contents })

      for await (const chunk of result.stream) {
        const chunkText = chunk.text()
        if (chunkText) {
          fullText += chunkText
          callbacks.onChunk(chunkText)
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
export const geminiProvider = new GeminiProvider()
