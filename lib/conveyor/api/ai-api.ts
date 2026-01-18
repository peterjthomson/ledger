/**
 * AI API
 *
 * Renderer API for AI service operations.
 */

import { ConveyorApi } from '@/lib/preload/shared'
import type {
  AIProvider,
  AIMessage,
  CompletionOptions,
  AISettings,
} from '@/lib/conveyor/schemas/ai-schema'

export class AIApi extends ConveyorApi {
  // Settings
  getSettings = () => this.invoke('ai:get-settings')
  saveSettings = (settings: AISettings) => this.invoke('ai:save-settings', settings)
  setProviderKey = (
    provider: AIProvider,
    apiKey: string,
    enabled?: boolean,
    organization?: string
  ) => this.invoke('ai:set-provider-key', provider, apiKey, enabled, organization)
  removeProviderKey = (provider: AIProvider) => this.invoke('ai:remove-provider-key', provider)
  setDefaultProvider = (provider: AIProvider) => this.invoke('ai:set-default-provider', provider)

  // Provider status
  getConfiguredProviders = () => this.invoke('ai:get-configured-providers')
  isProviderAvailable = (provider: AIProvider) =>
    this.invoke('ai:is-provider-available', provider)

  // Models
  getModels = () => this.invoke('ai:get-models')
  getModelsForProvider = (provider: AIProvider) =>
    this.invoke('ai:get-models-for-provider', provider)

  // Completions
  complete = (messages: AIMessage[], options?: CompletionOptions) =>
    this.invoke('ai:complete', messages, options)
  quick = (messages: AIMessage[], options?: CompletionOptions) =>
    this.invoke('ai:quick', messages, options)
  balanced = (messages: AIMessage[], options?: CompletionOptions) =>
    this.invoke('ai:balanced', messages, options)
  powerful = (messages: AIMessage[], options?: CompletionOptions) =>
    this.invoke('ai:powerful', messages, options)

  // Usage
  getUsageStats = () => this.invoke('ai:get-usage-stats')
  clearUsageHistory = () => this.invoke('ai:clear-usage-history')

  // Security
  getEncryptionStatus = () => this.invoke('ai:get-encryption-status')
}
