/**
 * ERD Handler
 *
 * IPC handlers for Entity Relationship Diagram parsing.
 */

import { handle } from '@/lib/main/shared'
import { getRepositoryManager } from '@/lib/repositories'
import { parseSchema, detectFramework, parseMermaidERD } from '@/lib/services/erd'

export const registerERDHandlers = () => {
  /**
   * Get ERD schema for the current repository
   */
  handle('get-erd-schema', async (repoPath?: string) => {
    try {
      // Use provided path or current repo path
      const path = repoPath || getRepositoryManager().requireActive().path
      const schema = await parseSchema(path)
      return { success: true, data: schema }
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to parse schema',
      }
    }
  })

  /**
   * Detect framework type for a repository
   */
  handle('detect-erd-framework', async (repoPath?: string) => {
    try {
      const path = repoPath || getRepositoryManager().requireActive().path
      const framework = await detectFramework(path)
      return { success: true, data: framework }
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to detect framework',
      }
    }
  })

  /**
   * Parse Mermaid ERD content directly
   */
  handle('parse-mermaid-erd', async (content: string) => {
    try {
      const schema = parseMermaidERD(content)
      return { success: true, data: schema }
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to parse Mermaid ERD',
      }
    }
  })
}
