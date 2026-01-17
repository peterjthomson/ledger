import { z } from 'zod'

// AI Provider schema
export const AIProviderSchema = z.enum(['anthropic', 'openai', 'gemini', 'openrouter'])

// AI Content block schema
export const AIContentBlockSchema = z.object({
  type: z.enum(['text', 'image']),
  text: z.string().optional(),
  imageUrl: z.string().optional(),
  imageBase64: z.string().optional(),
  mimeType: z.string().optional(),
})

// AI Message schema
export const AIMessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.union([z.string(), z.array(AIContentBlockSchema)]),
})

// Completion options schema
export const CompletionOptionsSchema = z.object({
  model: z.string().optional(),
  provider: AIProviderSchema.optional(),
  maxTokens: z.number().optional(),
  temperature: z.number().optional(),
  stopSequences: z.array(z.string()).optional(),
  jsonMode: z.boolean().optional(),
  systemPrompt: z.string().optional(),
})

// AI Usage schema
export const AIUsageSchema = z.object({
  inputTokens: z.number(),
  outputTokens: z.number(),
  estimatedCost: z.number(),
})

// AI Response schema
export const AIResponseSchema = z.object({
  content: z.string(),
  model: z.string(),
  provider: AIProviderSchema,
  usage: AIUsageSchema,
  finishReason: z.enum(['complete', 'length', 'stop', 'error']),
})

// AI Provider settings schema
export const AIProviderSettingsSchema = z.object({
  apiKey: z.string(),
  enabled: z.boolean(),
  organization: z.string().optional(),
})

// AI Settings schema
export const AISettingsSchema = z.object({
  providers: z.object({
    anthropic: AIProviderSettingsSchema.optional(),
    openai: AIProviderSettingsSchema.optional(),
    gemini: AIProviderSettingsSchema.optional(),
    openrouter: AIProviderSettingsSchema.optional(),
  }),
  defaults: z.object({
    provider: AIProviderSchema,
    models: z.object({
      quick: z.string(),
      balanced: z.string(),
      powerful: z.string(),
    }),
  }),
  usage: z
    .object({
      trackCosts: z.boolean(),
      monthlyBudget: z.number().optional(),
      history: z.array(
        z.object({
          date: z.string(),
          provider: AIProviderSchema,
          model: z.string(),
          inputTokens: z.number(),
          outputTokens: z.number(),
          estimatedCost: z.number(),
        })
      ),
    })
    .optional(),
})

// Model definition schema
export const ModelDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  provider: AIProviderSchema,
  tier: z.enum(['quick', 'balanced', 'powerful']),
  contextWindow: z.number(),
  maxOutputTokens: z.number(),
  inputCostPer1M: z.number(),
  outputCostPer1M: z.number(),
  supportsVision: z.boolean(),
  supportsJsonMode: z.boolean(),
  supportsStreaming: z.boolean(),
  description: z.string(),
})

// Usage stats schema
export const UsageStatsSchema = z.object({
  totalCost: z.number(),
  totalInputTokens: z.number(),
  totalOutputTokens: z.number(),
  requestCount: z.number(),
  byProvider: z.record(
    AIProviderSchema,
    z.object({
      cost: z.number(),
      requests: z.number(),
    })
  ),
})

// Encryption status schema
export const EncryptionStatusSchema = z.object({
  /** Whether encryption is available at all */
  available: z.boolean(),
  /** The backend being used (keychain, dpapi, gnome_libsecret, kwallet, basic_text, etc.) */
  backend: z.string(),
  /** Whether the encryption is considered strong (not basic_text fallback) */
  isStrong: z.boolean(),
})

// Result schemas
const SuccessResultSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
})

// IPC schemas for AI service
export const aiIpcSchema = {
  // Settings
  'ai:get-settings': {
    args: z.tuple([]),
    return: AISettingsSchema.nullable(),
  },
  'ai:save-settings': {
    args: z.tuple([AISettingsSchema]),
    return: SuccessResultSchema,
  },
  'ai:set-provider-key': {
    args: z.tuple([
      AIProviderSchema,
      z.string(),
      z.boolean().optional(),
      z.string().optional(),
    ]),
    return: SuccessResultSchema,
  },
  'ai:remove-provider-key': {
    args: z.tuple([AIProviderSchema]),
    return: SuccessResultSchema,
  },
  'ai:set-default-provider': {
    args: z.tuple([AIProviderSchema]),
    return: SuccessResultSchema,
  },

  // Provider status
  'ai:get-configured-providers': {
    args: z.tuple([]),
    return: z.array(AIProviderSchema),
  },
  'ai:is-provider-available': {
    args: z.tuple([AIProviderSchema]),
    return: z.boolean(),
  },

  // Models
  'ai:get-models': {
    args: z.tuple([]),
    return: z.record(z.string(), ModelDefinitionSchema),
  },
  'ai:get-models-for-provider': {
    args: z.tuple([AIProviderSchema]),
    return: z.array(ModelDefinitionSchema),
  },

  // Completions
  'ai:complete': {
    args: z.tuple([z.array(AIMessageSchema), CompletionOptionsSchema.optional()]),
    return: AIResponseSchema,
  },
  'ai:quick': {
    args: z.tuple([z.array(AIMessageSchema), CompletionOptionsSchema.optional()]),
    return: AIResponseSchema,
  },
  'ai:balanced': {
    args: z.tuple([z.array(AIMessageSchema), CompletionOptionsSchema.optional()]),
    return: AIResponseSchema,
  },
  'ai:powerful': {
    args: z.tuple([z.array(AIMessageSchema), CompletionOptionsSchema.optional()]),
    return: AIResponseSchema,
  },

  // Usage
  'ai:get-usage-stats': {
    args: z.tuple([]),
    return: UsageStatsSchema,
  },
  'ai:clear-usage-history': {
    args: z.tuple([]),
    return: SuccessResultSchema,
  },

  // Security
  'ai:get-encryption-status': {
    args: z.tuple([]),
    return: EncryptionStatusSchema,
  },
}

// Type exports
export type AIProvider = z.infer<typeof AIProviderSchema>
export type AIMessage = z.infer<typeof AIMessageSchema>
export type CompletionOptions = z.infer<typeof CompletionOptionsSchema>
export type AIResponse = z.infer<typeof AIResponseSchema>
export type AISettings = z.infer<typeof AISettingsSchema>
export type ModelDefinition = z.infer<typeof ModelDefinitionSchema>
export type UsageStats = z.infer<typeof UsageStatsSchema>
export type EncryptionStatus = z.infer<typeof EncryptionStatusSchema>