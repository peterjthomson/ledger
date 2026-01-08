/**
 * AI Service
 *
 * Main orchestrator for AI operations. Manages provider configuration,
 * routing, and provides a unified interface for completions.
 */

import type {
  AIProvider,
  AIMessage,
  AIResponse,
  AISettings,
  AIUsageRecord,
  CompletionOptions,
  StreamCallbacks,
} from './types'
import { anthropicProvider, openaiProvider, geminiProvider } from './providers'
import { getModel, getDefaultModel, MODEL_REGISTRY } from './models'

/**
 * Default AI settings
 */
export const DEFAULT_AI_SETTINGS: AISettings = {
  providers: {},
  defaults: {
    provider: 'anthropic',
    models: {
      quick: 'claude-3-5-haiku-20241022',
      balanced: 'claude-sonnet-4-20250514',
      powerful: 'claude-opus-4-20250514',
    },
  },
  usage: {
    trackCosts: true,
    history: [],
  },
}

/**
 * AI Service class
 */
class AIService {
  private settings: AISettings = DEFAULT_AI_SETTINGS
  private onSettingsChange?: (settings: AISettings) => void

  /**
   * Initialize the service with settings and optional change callback
   */
  initialize(settings: AISettings, onSettingsChange?: (settings: AISettings) => void): void {
    this.settings = { ...DEFAULT_AI_SETTINGS, ...settings }
    this.onSettingsChange = onSettingsChange

    // Configure providers with stored API keys
    this.configureProviders()
  }

  /**
   * Configure all providers with their API keys from settings
   */
  private configureProviders(): void {
    const { providers } = this.settings

    if (providers.anthropic?.apiKey && providers.anthropic.enabled) {
      anthropicProvider.configure(providers.anthropic.apiKey)
    }

    if (providers.openai?.apiKey && providers.openai.enabled) {
      openaiProvider.configure(providers.openai.apiKey, providers.openai.organization)
    }

    if (providers.gemini?.apiKey && providers.gemini.enabled) {
      geminiProvider.configure(providers.gemini.apiKey)
    }
  }

  /**
   * Update settings
   */
  updateSettings(settings: Partial<AISettings>): void {
    this.settings = { ...this.settings, ...settings }
    this.configureProviders()
    this.onSettingsChange?.(this.settings)
  }

  /**
   * Get current settings
   */
  getSettings(): AISettings {
    return this.settings
  }

  /**
   * Check if a provider is configured and ready
   */
  isProviderConfigured(provider: AIProvider): boolean {
    switch (provider) {
      case 'anthropic':
        return anthropicProvider.isConfigured()
      case 'openai':
        return openaiProvider.isConfigured()
      case 'gemini':
        return geminiProvider.isConfigured()
      default:
        return false
    }
  }

  /**
   * Get all configured providers
   */
  getConfiguredProviders(): AIProvider[] {
    const providers: AIProvider[] = []
    if (anthropicProvider.isConfigured()) providers.push('anthropic')
    if (openaiProvider.isConfigured()) providers.push('openai')
    if (geminiProvider.isConfigured()) providers.push('gemini')
    return providers
  }

  /**
   * Get the provider instance for a given provider type
   */
  private getProvider(provider: AIProvider) {
    switch (provider) {
      case 'anthropic':
        return anthropicProvider
      case 'openai':
        return openaiProvider
      case 'gemini':
        return geminiProvider
      default:
        throw new Error(`Unknown provider: ${provider}`)
    }
  }

  /**
   * Resolve the model and provider to use based on options and defaults
   */
  private resolveModelAndProvider(
    options: CompletionOptions
  ): { modelId: string; provider: AIProvider } {
    // If explicit model is provided, use it
    if (options.model) {
      const model = getModel(options.model)
      if (!model) {
        throw new Error(`Unknown model: ${options.model}`)
      }
      return { modelId: options.model, provider: model.provider }
    }

    // If explicit provider is provided, use default model for that provider
    if (options.provider) {
      const modelId = this.settings.defaults.models.balanced
      return { modelId, provider: options.provider }
    }

    // Use defaults
    return {
      modelId: this.settings.defaults.models.balanced,
      provider: this.settings.defaults.provider,
    }
  }

  /**
   * Record usage for cost tracking
   */
  private recordUsage(response: AIResponse): void {
    if (!this.settings.usage?.trackCosts) return

    const record: AIUsageRecord = {
      date: new Date().toISOString(),
      provider: response.provider,
      model: response.model,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
      estimatedCost: response.usage.estimatedCost,
    }

    const history = this.settings.usage?.history || []
    history.push(record)

    // Keep only last 1000 records to prevent unbounded growth
    if (history.length > 1000) {
      history.shift()
    }

    this.settings.usage = {
      ...this.settings.usage,
      history,
    }

    this.onSettingsChange?.(this.settings)
  }

  /**
   * Send a completion request using the configured provider
   */
  async complete(
    messages: AIMessage[],
    options: CompletionOptions = {}
  ): Promise<AIResponse> {
    const { modelId, provider } = this.resolveModelAndProvider(options)

    if (!this.isProviderConfigured(provider)) {
      throw new Error(
        `Provider ${provider} is not configured. Please add an API key in settings.`
      )
    }

    const providerInstance = this.getProvider(provider)
    const response = await providerInstance.complete(messages, {
      ...options,
      model: modelId,
    })

    this.recordUsage(response)
    return response
  }

  /**
   * Stream a completion request
   */
  async stream(
    messages: AIMessage[],
    callbacks: StreamCallbacks,
    options: CompletionOptions = {}
  ): Promise<void> {
    const { modelId, provider } = this.resolveModelAndProvider(options)

    if (!this.isProviderConfigured(provider)) {
      throw new Error(
        `Provider ${provider} is not configured. Please add an API key in settings.`
      )
    }

    const providerInstance = this.getProvider(provider)
    await providerInstance.stream(messages, callbacks, {
      ...options,
      model: modelId,
    })
  }

  /**
   * Quick completion using the fast tier model
   */
  async quick(
    messages: AIMessage[],
    options: Omit<CompletionOptions, 'model'> = {}
  ): Promise<AIResponse> {
    const modelId = this.settings.defaults.models.quick
    return this.complete(messages, { ...options, model: modelId })
  }

  /**
   * Balanced completion using the balanced tier model
   */
  async balanced(
    messages: AIMessage[],
    options: Omit<CompletionOptions, 'model'> = {}
  ): Promise<AIResponse> {
    const modelId = this.settings.defaults.models.balanced
    return this.complete(messages, { ...options, model: modelId })
  }

  /**
   * Powerful completion using the powerful tier model
   */
  async powerful(
    messages: AIMessage[],
    options: Omit<CompletionOptions, 'model'> = {}
  ): Promise<AIResponse> {
    const modelId = this.settings.defaults.models.powerful
    return this.complete(messages, { ...options, model: modelId })
  }

  /**
   * Get usage statistics
   */
  getUsageStats(): {
    totalCost: number
    totalInputTokens: number
    totalOutputTokens: number
    requestCount: number
    byProvider: Record<AIProvider, { cost: number; requests: number }>
  } {
    const history = this.settings.usage?.history || []

    const byProvider: Record<AIProvider, { cost: number; requests: number }> = {
      anthropic: { cost: 0, requests: 0 },
      openai: { cost: 0, requests: 0 },
      gemini: { cost: 0, requests: 0 },
    }

    let totalCost = 0
    let totalInputTokens = 0
    let totalOutputTokens = 0

    for (const record of history) {
      totalCost += record.estimatedCost
      totalInputTokens += record.inputTokens
      totalOutputTokens += record.outputTokens
      byProvider[record.provider].cost += record.estimatedCost
      byProvider[record.provider].requests++
    }

    return {
      totalCost,
      totalInputTokens,
      totalOutputTokens,
      requestCount: history.length,
      byProvider,
    }
  }

  /**
   * Clear usage history
   */
  clearUsageHistory(): void {
    if (this.settings.usage) {
      this.settings.usage.history = []
      this.onSettingsChange?.(this.settings)
    }
  }

  /**
   * Get all available models
   */
  getAvailableModels() {
    return MODEL_REGISTRY
  }

  /**
   * Get models for a specific provider
   */
  getModelsForProvider(provider: AIProvider) {
    return Object.values(MODEL_REGISTRY).filter((m) => m.provider === provider)
  }
}

/**
 * Singleton instance
 */
export const aiService = new AIService()

/**
 * Export types
 */
export type { AIService }
