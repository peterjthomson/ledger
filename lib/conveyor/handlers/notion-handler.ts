/**
 * Notion Handler
 *
 * IPC handlers for Notion service operations.
 */

import { handle } from '@/lib/main/shared'
import { serializeError, logHandlerError } from '@/lib/utils/error-helpers'
import { notionService } from '@/lib/main/notion'
import {
  getNotionSettings,
  saveNotionSettings,
  setNotionApiKey,
  removeNotionApiKey,
} from '@/lib/main/settings-service'
import type { NotionSettings, NotionQueryOptions } from '@/lib/main/notion/types'

export const registerNotionHandlers = () => {
  // Initialize Notion service with saved settings
  const savedSettings = getNotionSettings()
  if (savedSettings) {
    notionService.initialize(savedSettings, (updatedSettings) => {
      saveNotionSettings(updatedSettings)
    })
  }

  // Settings handlers
  handle('notion:get-settings', async () => {
    try {
      return getNotionSettings()
    } catch (error) {
      logHandlerError('notion:get-settings', error)
      return null
    }
  })

  handle('notion:save-settings', async (settings: NotionSettings) => {
    try {
      saveNotionSettings(settings)
      notionService.updateSettings(settings)
      return { success: true }
    } catch (error) {
      logHandlerError('notion:save-settings', error)
      return { success: false, message: serializeError(error) }
    }
  })

  handle('notion:set-api-key', async (apiKey: string) => {
    try {
      setNotionApiKey(apiKey)
      notionService.setApiKey(apiKey)
      return { success: true }
    } catch (error) {
      logHandlerError('notion:set-api-key', error)
      return { success: false, message: serializeError(error) }
    }
  })

  handle('notion:remove-api-key', async () => {
    try {
      removeNotionApiKey()
      notionService.clearApiKey()
      return { success: true }
    } catch (error) {
      logHandlerError('notion:remove-api-key', error)
      return { success: false, message: serializeError(error) }
    }
  })

  // Connection handlers
  handle('notion:is-configured', async () => {
    try {
      return notionService.isConfigured()
    } catch (error) {
      logHandlerError('notion:is-configured', error)
      return false
    }
  })

  handle('notion:test-connection', async () => {
    try {
      const result = await notionService.testConnection()
      if (result.success && result.data) {
        return { success: true, workspaceName: result.data.workspaceName }
      }
      return { success: false, error: result.error }
    } catch (error) {
      logHandlerError('notion:test-connection', error)
      return { success: false, error: serializeError(error) }
    }
  })

  // Database handlers
  handle('notion:list-databases', async () => {
    try {
      const result = await notionService.listDatabases()
      if (result.success && result.data) {
        return { success: true, databases: result.data }
      }
      return { success: false, error: result.error }
    } catch (error) {
      logHandlerError('notion:list-databases', error)
      return { success: false, error: serializeError(error) }
    }
  })

  handle('notion:get-database', async (databaseId: string) => {
    try {
      const result = await notionService.getDatabase(databaseId)
      if (result.success && result.data) {
        return { success: true, database: result.data }
      }
      return { success: false, error: result.error }
    } catch (error) {
      logHandlerError('notion:get-database', error)
      return { success: false, error: serializeError(error) }
    }
  })

  // Card handlers
  handle('notion:query-cards', async (databaseId: string, options?: NotionQueryOptions) => {
    try {
      const result = await notionService.queryCards(databaseId, options)
      if (result.success && result.data) {
        return { success: true, result: result.data }
      }
      return { success: false, error: result.error }
    } catch (error) {
      logHandlerError('notion:query-cards', error)
      return { success: false, error: serializeError(error) }
    }
  })

  handle('notion:get-card', async (pageId: string) => {
    try {
      const result = await notionService.getCard(pageId)
      if (result.success && result.data) {
        return { success: true, card: result.data }
      }
      return { success: false, error: result.error }
    } catch (error) {
      logHandlerError('notion:get-card', error)
      return { success: false, error: serializeError(error) }
    }
  })

  // Content handlers
  handle('notion:get-page-content', async (pageId: string) => {
    try {
      const result = await notionService.getPageContent(pageId)
      if (result.success && result.data) {
        return { success: true, content: result.data }
      }
      return { success: false, error: result.error }
    } catch (error) {
      logHandlerError('notion:get-page-content', error)
      return { success: false, error: serializeError(error) }
    }
  })

  // Mutation handlers
  handle('notion:update-card-property', async (pageId: string, propertyName: string, value: unknown) => {
    try {
      const result = await notionService.updateCardProperty(pageId, propertyName, value)
      if (result.success) {
        return { success: true }
      }
      return { success: false, message: result.error }
    } catch (error) {
      logHandlerError('notion:update-card-property', error)
      return { success: false, message: serializeError(error) }
    }
  })

  handle('notion:append-to-page', async (pageId: string, markdown: string) => {
    try {
      const result = await notionService.appendToPage(pageId, markdown)
      if (result.success) {
        return { success: true }
      }
      return { success: false, message: result.error }
    } catch (error) {
      logHandlerError('notion:append-to-page', error)
      return { success: false, message: serializeError(error) }
    }
  })

  handle('notion:add-comment', async (pageId: string, content: string) => {
    try {
      const result = await notionService.addComment(pageId, content)
      if (result.success) {
        return { success: true }
      }
      return { success: false, message: result.error }
    } catch (error) {
      logHandlerError('notion:add-comment', error)
      return { success: false, message: serializeError(error) }
    }
  })
}
