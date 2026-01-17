/**
 * AI Handler
 *
 * IPC handlers for AI service operations.
 */

import { handle } from '@/lib/main/shared'
import { serializeError, logHandlerError } from '@/lib/utils/error-helpers'
import { aiService } from '@/lib/main/ai'
import {
  getAISettings,
  saveAISettings,
  setAIProviderKey,
  removeAIProviderKey,
  setDefaultAIProvider,
  getEncryptionStatus,
} from '@/lib/main/settings-service'
import type { AIProvider, AIMessage, CompletionOptions, AISettings } from '@/lib/main/ai/types'

export const registerAIHandlers = () => {
  // Initialize AI service with saved settings
  const savedSettings = getAISettings()
  if (savedSettings) {
    aiService.initialize(savedSettings, (updatedSettings) => {
      saveAISettings(updatedSettings)
    })
  }

  // Settings handlers
  handle('ai:get-settings', async () => {
    try {
      return getAISettings()
    } catch (error) {
      logHandlerError('ai:get-settings', error)
      return null
    }
  })

  handle('ai:save-settings', async (settings: AISettings) => {
    try {
      saveAISettings(settings)
      aiService.updateSettings(settings)
      return { success: true }
    } catch (error) {
      logHandlerError('ai:save-settings', error)
      return { success: false, message: serializeError(error) }
    }
  })

  handle(
    'ai:set-provider-key',
    async (
      provider: AIProvider,
      apiKey: string,
      enabled?: boolean,
      organization?: string
    ) => {
      try {
        setAIProviderKey(provider, apiKey, enabled ?? true, organization)
        // Reinitialize service with updated settings
        const settings = getAISettings()
        if (settings) {
          aiService.initialize(settings, (updatedSettings) => {
            saveAISettings(updatedSettings)
          })
        }
        return { success: true }
      } catch (error) {
        logHandlerError('ai:set-provider-key', error)
        return { success: false, message: serializeError(error) }
      }
    }
  )

  handle('ai:remove-provider-key', async (provider: AIProvider) => {
    try {
      removeAIProviderKey(provider)
      // Reinitialize service with updated settings
      const settings = getAISettings()
      if (settings) {
        aiService.initialize(settings, (updatedSettings) => {
          saveAISettings(updatedSettings)
        })
      }
      return { success: true }
    } catch (error) {
      logHandlerError('ai:remove-provider-key', error)
      return { success: false, message: serializeError(error) }
    }
  })

  handle('ai:set-default-provider', async (provider: AIProvider) => {
    try {
      setDefaultAIProvider(provider)
      // Reinitialize service with updated settings
      const settings = getAISettings()
      if (settings) {
        aiService.initialize(settings, (updatedSettings) => {
          saveAISettings(updatedSettings)
        })
      }
      return { success: true }
    } catch (error) {
      logHandlerError('ai:set-default-provider', error)
      return { success: false, message: serializeError(error) }
    }
  })

  // Provider status handlers
  handle('ai:get-configured-providers', async () => {
    try {
      return aiService.getConfiguredProviders()
    } catch (error) {
      logHandlerError('ai:get-configured-providers', error)
      return []
    }
  })

  handle('ai:is-provider-available', async (provider: AIProvider) => {
    try {
      return aiService.isProviderAvailable(provider)
    } catch (error) {
      logHandlerError('ai:is-provider-available', error)
      return false
    }
  })

  // Model handlers
  handle('ai:get-models', async () => {
    try {
      return aiService.getAvailableModels()
    } catch (error) {
      logHandlerError('ai:get-models', error)
      return {}
    }
  })

  handle('ai:get-models-for-provider', async (provider: AIProvider) => {
    try {
      return aiService.getModelsForProvider(provider)
    } catch (error) {
      logHandlerError('ai:get-models-for-provider', error)
      return []
    }
  })

  // Completion handlers
  handle(
    'ai:complete',
    async (messages: AIMessage[], options?: CompletionOptions) => {
      try {
        return await aiService.complete(messages, options)
      } catch (error) {
        logHandlerError('ai:complete', error)
        throw error
      }
    }
  )

  handle(
    'ai:quick',
    async (messages: AIMessage[], options?: CompletionOptions) => {
      try {
        return await aiService.quick(messages, options)
      } catch (error) {
        logHandlerError('ai:quick', error)
        throw error
      }
    }
  )

  handle(
    'ai:balanced',
    async (messages: AIMessage[], options?: CompletionOptions) => {
      try {
        return await aiService.balanced(messages, options)
      } catch (error) {
        logHandlerError('ai:balanced', error)
        throw error
      }
    }
  )

  handle(
    'ai:powerful',
    async (messages: AIMessage[], options?: CompletionOptions) => {
      try {
        return await aiService.powerful(messages, options)
      } catch (error) {
        logHandlerError('ai:powerful', error)
        throw error
      }
    }
  )

  // Usage handlers
  handle('ai:get-usage-stats', async () => {
    try {
      return aiService.getUsageStats()
    } catch (error) {
      logHandlerError('ai:get-usage-stats', error)
      return {
        totalCost: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        requestCount: 0,
        byProvider: {
          anthropic: { cost: 0, requests: 0 },
          openai: { cost: 0, requests: 0 },
          gemini: { cost: 0, requests: 0 },
          openrouter: { cost: 0, requests: 0 },
        },
      }
    }
  })

  handle('ai:clear-usage-history', async () => {
    try {
      aiService.clearUsageHistory()
      return { success: true }
    } catch (error) {
      logHandlerError('ai:clear-usage-history', error)
      return { success: false, message: serializeError(error) }
    }
  })

  // Security handlers
  handle('ai:get-encryption-status', async () => {
    try {
      return getEncryptionStatus()
    } catch (error) {
      logHandlerError('ai:get-encryption-status', error)
      return {
        available: false,
        backend: 'unknown',
        isStrong: false,
      }
    }
  })
}
