/**
 * Notion API
 *
 * Renderer API for Notion service operations.
 */

import { ConveyorApi } from '@/lib/preload/shared'
import type {
  NotionSettings,
  NotionQueryOptions,
} from '@/lib/conveyor/schemas/notion-schema'

export class NotionApi extends ConveyorApi {
  // Settings
  getSettings = () => this.invoke('notion:get-settings')
  saveSettings = (settings: NotionSettings) => this.invoke('notion:save-settings', settings)
  setApiKey = (apiKey: string) => this.invoke('notion:set-api-key', apiKey)
  removeApiKey = () => this.invoke('notion:remove-api-key')

  // Connection
  isConfigured = () => this.invoke('notion:is-configured')
  testConnection = () => this.invoke('notion:test-connection')

  // Databases
  listDatabases = () => this.invoke('notion:list-databases')
  getDatabase = (databaseId: string) => this.invoke('notion:get-database', databaseId)

  // Cards
  queryCards = (databaseId: string, options?: NotionQueryOptions) =>
    this.invoke('notion:query-cards', databaseId, options)
  getCard = (pageId: string) => this.invoke('notion:get-card', pageId)

  // Content
  getPageContent = (pageId: string) => this.invoke('notion:get-page-content', pageId)

  // Mutations
  updateCardProperty = (pageId: string, propertyName: string, value: unknown) =>
    this.invoke('notion:update-card-property', pageId, propertyName, value)
  appendToPage = (pageId: string, markdown: string) =>
    this.invoke('notion:append-to-page', pageId, markdown)
  addComment = (pageId: string, content: string) =>
    this.invoke('notion:add-comment', pageId, content)
}
