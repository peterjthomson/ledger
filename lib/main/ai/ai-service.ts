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
import {
  anthropicProvider,
  openaiProvider,
  geminiProvider,
  openrouterProvider,
} from './providers'
import { getModel, MODEL_REGISTRY, DEFAULT_MODELS } from './models'

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
   * Normalize settings to preserve invariants.
   * Invariant: defaults.models must belong to defaults.provider.
   */
  private normalizeSettings(settings: AISettings): AISettings {
    const provider = settings.defaults.provider
    const models = { ...settings.defaults.models }

    ;(['quick', 'balanced', 'powerful'] as const).forEach((tier) => {
      const modelId = models[tier]
      const model = modelId ? getModel(modelId) : undefined
      if (!model || model.provider !== provider) {
        models[tier] = DEFAULT_MODELS[provider][tier]
      }
    })

    return {
      ...settings,
      defaults: {
        ...settings.defaults,
        models,
      },
    }
  }

  /**
   * Initialize the service with settings and optional change callback
   */
  initialize(settings: AISettings, onSettingsChange?: (settings: AISettings) => void): void {
    this.settings = this.normalizeSettings({ ...DEFAULT_AI_SETTINGS, ...settings })
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

    if (providers.openrouter?.apiKey && providers.openrouter.enabled) {
      openrouterProvider.configure(providers.openrouter.apiKey)
    } else {
      // Always configure OpenRouter for free tier (OpenCode Zen)
      openrouterProvider.configure() // No API key = free tier
    }
  }

  /**
   * Update settings
   */
  updateSettings(settings: Partial<AISettings>): void {
    this.settings = this.normalizeSettings({ ...this.settings, ...settings })
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
   * Check if a provider is available and ready to handle requests.
   * Note: OpenRouter is always available via free tier (OpenCode Zen).
   * For checking user-configured providers only, use getConfiguredProviders().
   */
  isProviderAvailable(provider: AIProvider): boolean {
    switch (provider) {
      case 'anthropic':
        return anthropicProvider.isConfigured()
      case 'openai':
        return openaiProvider.isConfigured()
      case 'gemini':
        return geminiProvider.isConfigured()
      case 'openrouter':
        return openrouterProvider.isConfigured()
      default:
        return false
    }
  }

  /**
   * Get all configured providers (excludes OpenRouter free tier from this list)
   */
  getConfiguredProviders(): AIProvider[] {
    const providers: AIProvider[] = []
    if (anthropicProvider.isConfigured()) providers.push('anthropic')
    if (openaiProvider.isConfigured()) providers.push('openai')
    if (geminiProvider.isConfigured()) providers.push('gemini')
    // Only include OpenRouter if user has added their own API key
    if (this.settings.providers.openrouter?.apiKey) providers.push('openrouter')
    return providers
  }

  /**
   * Check if any provider is available
   */
  hasAnyProvider(): boolean {
    return this.getConfiguredProviders().length > 0 || openrouterProvider.isConfigured()
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
      case 'openrouter':
        return openrouterProvider
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
    // If explicit model is provided, require its provider to be configured
    if (options.model) {
      const model = getModel(options.model)
      if (!model) {
        throw new Error(`Unknown model: ${options.model}`)
      }
      if (!this.isProviderAvailable(model.provider)) {
        throw new Error(
          `Provider '${model.provider}' is not configured. Please add an API key for ${model.provider} to use ${options.model}.`
        )
      }
      return { modelId: options.model, provider: model.provider }
    }

    // No explicit model - pick the balanced-tier model respecting provider override
    return this.getModelForTier('balanced', options.provider)
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

    // OpenRouter is always available (free tier via OpenCode Zen)
    if (provider !== 'openrouter' && !this.isProviderAvailable(provider)) {
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

    // OpenRouter is always available (free tier via OpenCode Zen)
    if (provider !== 'openrouter' && !this.isProviderAvailable(provider)) {
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
   * Get the model for a tier, respecting provider override and configuration status
   */
  private getModelForTier(tier: 'quick' | 'balanced' | 'powerful', provider?: AIProvider): { modelId: string; provider: AIProvider } {
    // If provider is explicitly specified, require it to be configured
    if (provider) {
      if (provider === 'openrouter' || this.isProviderAvailable(provider)) {
        return {
          modelId: DEFAULT_MODELS[provider][tier],
          provider,
        }
      }
      throw new Error(
        `Provider '${provider}' is not configured. Please add an API key for ${provider}.`
      )
    }

    // No explicit provider specified - use defaults in priority order:
    // 1. User's configured default provider
    const defaultProvider = this.settings.defaults.provider
    if (this.isProviderAvailable(defaultProvider)) {
      return {
        modelId: this.settings.defaults.models[tier],
        provider: defaultProvider,
      }
    }

    // 2. Any configured provider
    const configuredProviders = this.getConfiguredProviders()
    if (configuredProviders.length > 0) {
      const availableProvider = configuredProviders[0]
      return {
        modelId: DEFAULT_MODELS[availableProvider][tier],
        provider: availableProvider,
      }
    }

    // 3. OpenRouter free tier (always available)
    return {
      modelId: DEFAULT_MODELS.openrouter[tier],
      provider: 'openrouter',
    }
  }

  /**
   * Quick completion using the fast tier model
   */
  async quick(
    messages: AIMessage[],
    options: Omit<CompletionOptions, 'model'> = {}
  ): Promise<AIResponse> {
    const { modelId, provider } = this.getModelForTier('quick', options.provider)
    return this.complete(messages, { ...options, model: modelId, provider })
  }

  /**
   * Balanced completion using the balanced tier model
   */
  async balanced(
    messages: AIMessage[],
    options: Omit<CompletionOptions, 'model'> = {}
  ): Promise<AIResponse> {
    const { modelId, provider } = this.getModelForTier('balanced', options.provider)
    return this.complete(messages, { ...options, model: modelId, provider })
  }

  /**
   * Powerful completion using the powerful tier model
   */
  async powerful(
    messages: AIMessage[],
    options: Omit<CompletionOptions, 'model'> = {}
  ): Promise<AIResponse> {
    const { modelId, provider } = this.getModelForTier('powerful', options.provider)
    return this.complete(messages, { ...options, model: modelId, provider })
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
      openrouter: { cost: 0, requests: 0 },
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
