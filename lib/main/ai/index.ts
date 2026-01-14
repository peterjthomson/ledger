/**
 * AI Module Index
 *
 * Exports all AI-related types, services, and utilities.
 */

// Core types
export type {
  AIProvider,
  AIMessage,
  AIContentBlock,
  CompletionOptions,
  StreamCallbacks,
  AIResponse,
  AIUsage,
  AIProviderInterface,
  AnalysisType,
  TriageDimension,
  TriageQuestion,
  AIProviderSettings,
  AISettings,
  AIUsageRecord,
} from './types'

// Model registry
export {
  MODEL_REGISTRY,
  DEFAULT_MODELS,
  getModel,
  getModelsForProvider,
  getModelsByTier,
  getDefaultModel,
  estimateCost,
  getAllModelIds,
  isValidModel,
} from './models'
export type { ModelDefinition } from './models'

// AI Service
export { aiService, DEFAULT_AI_SETTINGS } from './ai-service'

// Providers (for advanced use cases)
export {
  anthropicProvider,
  openaiProvider,
  geminiProvider,
  openrouterProvider,
  AnthropicProvider,
  OpenAIProvider,
  GeminiProvider,
  OpenRouterProvider,
  OPENROUTER_MODELS,
  OPENROUTER_DEFAULTS,
} from './providers'
