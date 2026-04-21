/**
 * Code Graph Handler
 *
 * IPC handlers for code dependency graph parsing.
 */

import { handle } from '@/lib/main/shared'
import { getRepositoryManager } from '@/lib/repositories'
import { parseCodeGraph, detectLanguage, type CodeGraphParseOptions } from '@/lib/services/codegraph'
import simpleGit from 'simple-git'

export const registerCodeGraphHandlers = () => {
  /**
   * Get code graph schema for the current repository
   */
  handle('get-codegraph-schema', async (repoPath?: string, options?: CodeGraphParseOptions) => {
    try {
      // Use provided path or current repo path
      const path = repoPath || getRepositoryManager().requireActive().path
      const schema = await parseCodeGraph(path, options || {})
      return { success: true, data: schema }
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to parse code graph',
      }
    }
  })

  /**
   * Detect primary language for a repository
   */
  handle('detect-codegraph-language', async (repoPath?: string) => {
    try {
      const path = repoPath || getRepositoryManager().requireActive().path
      const language = await detectLanguage(path)
      return { success: true, data: language }
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to detect language',
      }
    }
  })

  /**
   * Get git diff status for files in the repository
   * Returns a map of file paths to their change status
   */
  handle('get-codegraph-diff-status', async (repoPath?: string) => {
    try {
      const path = repoPath || getRepositoryManager().requireActive().path
      const git = simpleGit(path)
      const status = await git.status()

      // Build a map of file paths to change status
      const diffStatus: Record<string, 'added' | 'modified' | 'deleted'> = {}

      // Process all file changes
      for (const file of status.files) {
        const filePath = file.path
        const indexStatus = file.index
        const workingStatus = file.working_dir

        // Determine the most significant status
        // Priority: deleted > added > modified
        if (indexStatus === 'D' || workingStatus === 'D') {
          diffStatus[filePath] = 'deleted'
        } else if (indexStatus === 'A' || workingStatus === '?' || indexStatus === '?' || workingStatus === 'A') {
          diffStatus[filePath] = 'added'
        } else if (indexStatus === 'M' || workingStatus === 'M' || indexStatus === 'R' || workingStatus === 'R') {
          diffStatus[filePath] = 'modified'
        }
      }

      return { success: true, data: diffStatus }
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to get git diff status',
      }
    }
  })
}
