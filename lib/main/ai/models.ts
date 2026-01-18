/**
 * AI Model Registry
 *
 * Definitions for all supported models across Anthropic, OpenAI, Gemini, and OpenRouter.
 */

import type { AIProvider } from './types'

export interface ModelDefinition {
  /** Model identifier used in API calls */
  id: string
  /** Human-readable name */
  name: string
  /** Provider that offers this model */
  provider: AIProvider
  /** Performance tier */
  tier: 'quick' | 'balanced' | 'powerful'
  /** Maximum context window (tokens) */
  contextWindow: number
  /** Maximum output tokens */
  maxOutputTokens: number
  /** Cost per million input tokens (USD) */
  inputCostPer1M: number
  /** Cost per million output tokens (USD) */
  outputCostPer1M: number
  /** Whether model supports vision/images */
  supportsVision: boolean
  /** Whether model supports JSON mode */
  supportsJsonMode: boolean
  /** Whether model supports streaming */
  supportsStreaming: boolean
  /** Description of model capabilities */
  description: string
}

/**
 * All supported models organized by provider
 */
export const MODEL_REGISTRY: Record<string, ModelDefinition> = {
  // Anthropic Models
  'claude-3-5-haiku-20241022': {
    id: 'claude-3-5-haiku-20241022',
    name: 'Claude 3.5 Haiku',
    provider: 'anthropic',
    tier: 'quick',
    contextWindow: 200000,
    maxOutputTokens: 8192,
    inputCostPer1M: 1.0,
    outputCostPer1M: 5.0,
    supportsVision: true,
    supportsJsonMode: true,
    supportsStreaming: true,
    description: 'Fast and efficient for simple tasks',
  },
  'claude-sonnet-4-20250514': {
    id: 'claude-sonnet-4-20250514',
    name: 'Claude Sonnet 4',
    provider: 'anthropic',
    tier: 'balanced',
    contextWindow: 200000,
    maxOutputTokens: 16384,
    inputCostPer1M: 3.0,
    outputCostPer1M: 15.0,
    supportsVision: true,
    supportsJsonMode: true,
    supportsStreaming: true,
    description: 'Balanced performance for general use',
  },
  'claude-opus-4-20250514': {
    id: 'claude-opus-4-20250514',
    name: 'Claude Opus 4',
    provider: 'anthropic',
    tier: 'powerful',
    contextWindow: 200000,
    maxOutputTokens: 32768,
    inputCostPer1M: 15.0,
    outputCostPer1M: 75.0,
    supportsVision: true,
    supportsJsonMode: true,
    supportsStreaming: true,
    description: 'Most capable for complex reasoning',
  },

  // OpenAI Models
  'gpt-4o-mini': {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: 'openai',
    tier: 'quick',
    contextWindow: 128000,
    maxOutputTokens: 16384,
    inputCostPer1M: 0.15,
    outputCostPer1M: 0.6,
    supportsVision: true,
    supportsJsonMode: true,
    supportsStreaming: true,
    description: 'Fast and affordable for simple tasks',
  },
  'gpt-4o': {
    id: 'gpt-4o',
    name: 'GPT-4o',
    provider: 'openai',
    tier: 'balanced',
    contextWindow: 128000,
    maxOutputTokens: 16384,
    inputCostPer1M: 2.5,
    outputCostPer1M: 10.0,
    supportsVision: true,
    supportsJsonMode: true,
    supportsStreaming: true,
    description: 'Balanced multimodal model',
  },
  'o1': {
    id: 'o1',
    name: 'o1',
    provider: 'openai',
    tier: 'powerful',
    contextWindow: 200000,
    maxOutputTokens: 100000,
    inputCostPer1M: 15.0,
    outputCostPer1M: 60.0,
    supportsVision: true,
    supportsJsonMode: true,
    supportsStreaming: true,
    description: 'Advanced reasoning model',
  },

  // Google Gemini Models
  'gemini-2.0-flash': {
    id: 'gemini-2.0-flash',
    name: 'Gemini 2.0 Flash',
    provider: 'gemini',
    tier: 'quick',
    contextWindow: 1000000,
    maxOutputTokens: 8192,
    inputCostPer1M: 0.075,
    outputCostPer1M: 0.3,
    supportsVision: true,
    supportsJsonMode: true,
    supportsStreaming: true,
    description: 'Fast and efficient with huge context',
  },
  'gemini-2.0-pro': {
    id: 'gemini-2.0-pro',
    name: 'Gemini 2.0 Pro',
    provider: 'gemini',
    tier: 'balanced',
    contextWindow: 2000000,
    maxOutputTokens: 8192,
    inputCostPer1M: 1.25,
    outputCostPer1M: 5.0,
    supportsVision: true,
    supportsJsonMode: true,
    supportsStreaming: true,
    description: 'Balanced with massive context window',
  },
  'gemini-2.5-pro': {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    provider: 'gemini',
    tier: 'powerful',
    contextWindow: 1000000,
    maxOutputTokens: 65536,
    inputCostPer1M: 1.25,
    outputCostPer1M: 10.0,
    supportsVision: true,
    supportsJsonMode: true,
    supportsStreaming: true,
    description: 'Most capable Gemini model',
  },

  // OpenCode Zen Free Models (anonymous access, no API key required)
  // Only models verified to work with "public" API key
  'big-pickle': {
    id: 'big-pickle',
    name: 'Big Pickle (Free)',
    provider: 'openrouter',
    tier: 'balanced',
    contextWindow: 200000,
    maxOutputTokens: 8192,
    inputCostPer1M: 0,
    outputCostPer1M: 0,
    supportsVision: false,
    supportsJsonMode: true,
    supportsStreaming: true,
    description: 'Fast balanced model via OpenCode Zen',
  },
  'grok-code': {
    id: 'grok-code',
    name: 'Grok Code (Free)',
    provider: 'openrouter',
    tier: 'powerful',
    contextWindow: 256000,
    maxOutputTokens: 8192,
    inputCostPer1M: 0,
    outputCostPer1M: 0,
    supportsVision: false,
    supportsJsonMode: true,
    supportsStreaming: true,
    description: 'Code-optimized model via OpenCode Zen',
  },
}

/**
 * Default model IDs by tier
 */
export const DEFAULT_MODELS = {
  anthropic: {
    quick: 'claude-3-5-haiku-20241022',
    balanced: 'claude-sonnet-4-20250514',
    powerful: 'claude-opus-4-20250514',
  },
  openai: {
    quick: 'gpt-4o-mini',
    balanced: 'gpt-4o',
    powerful: 'o1',
  },
  gemini: {
    quick: 'gemini-2.0-flash',
    balanced: 'gemini-2.0-pro',
    powerful: 'gemini-2.5-pro',
  },
  openrouter: {
    quick: 'big-pickle',
    balanced: 'big-pickle',
    powerful: 'grok-code',
  },
} as const

/**
 * Get model definition by ID
 */
export function getModel(modelId: string): ModelDefinition | undefined {
  return MODEL_REGISTRY[modelId]
}

/**
 * Get all models for a provider
 */
export function getModelsForProvider(provider: AIProvider): ModelDefinition[] {
  return Object.values(MODEL_REGISTRY).filter((m) => m.provider === provider)
}

/**
 * Get models by tier
 */
export function getModelsByTier(tier: 'quick' | 'balanced' | 'powerful'): ModelDefinition[] {
  return Object.values(MODEL_REGISTRY).filter((m) => m.tier === tier)
}

/**
 * Get the default model for a provider and tier
 */
export function getDefaultModel(
  provider: AIProvider,
  tier: 'quick' | 'balanced' | 'powerful'
): ModelDefinition | undefined {
  const modelId = DEFAULT_MODELS[provider][tier]
  return MODEL_REGISTRY[modelId]
}

/**
 * Calculate estimated cost for a completion
 */
export function estimateCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number
): number {
  const model = MODEL_REGISTRY[modelId]
  if (!model) return 0

  const inputCost = (inputTokens / 1_000_000) * model.inputCostPer1M
  const outputCost = (outputTokens / 1_000_000) * model.outputCostPer1M
  return inputCost + outputCost
}

/**
 * Get all available model IDs
 */
export function getAllModelIds(): string[] {
  return Object.keys(MODEL_REGISTRY)
}

/**
 * Check if a model ID is valid
 */
export function isValidModel(modelId: string): boolean {
  return modelId in MODEL_REGISTRY
}
