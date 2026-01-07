import { handle } from '@/lib/main/shared'
import {
  getCommitHistory,
  getCommitHistoryForRef,
  getCommitDetails,
  getWorkingStatus,
  resetToCommit,
  getCommitGraphHistory,
  getCommitDiff,
  getBranchDiff,
  commitChanges,
  pullCurrentBranch,
  getRepoPath,
} from '@/lib/main/git-service'
import { emitGitCommit, emitGitPull } from '@/lib/events'
import { serializeError } from '@/lib/utils/error-helpers'

export const registerCommitHandlers = () => {
  handle('get-commit-history', async (limit?: number) => {
    try {
      return await getCommitHistory(limit)
    } catch (_error) {
      return []
    }
  })

  handle('get-commit-history-for-ref', async (ref: string, limit?: number) => {
    try {
      return await getCommitHistoryForRef(ref, limit)
    } catch (_error) {
      return []
    }
  })

  handle('get-commit-details', async (commitHash: string) => {
    try {
      return await getCommitDetails(commitHash)
    } catch (_error) {
      return null
    }
  })

  handle('get-working-status', async () => {
    try {
      return await getWorkingStatus()
    } catch (_error) {
      return { hasChanges: false, files: [], stagedCount: 0, unstagedCount: 0, additions: 0, deletions: 0 }
    }
  })

  handle('reset-to-commit', async (commitHash: string, mode: 'soft' | 'mixed' | 'hard') => {
    try {
      return await resetToCommit(commitHash, mode)
    } catch (error) {
      return { success: false, message: serializeError(error) }
    }
  })

  handle('get-commit-graph-history', async (limit?: number, skipStats?: boolean, showCheckpoints?: boolean) => {
    try {
      return await getCommitGraphHistory(limit, skipStats, showCheckpoints)
    } catch (_error) {
      return []
    }
  })

  handle('get-commit-diff', async (commitHash: string) => {
    try {
      return await getCommitDiff(commitHash)
    } catch (_error) {
      return null
    }
  })

  handle('get-branch-diff', async (branchName: string) => {
    try {
      return await getBranchDiff(branchName)
    } catch (_error) {
      return null
    }
  })

  handle('commit-changes', async (message: string, description?: string, force?: boolean) => {
    try {
      const result = await commitChanges(message, description, force)
      if (result.success && result.hash) {
        const path = getRepoPath()
        if (path) emitGitCommit(path, result.hash, message)
      }
      return result
    } catch (error) {
      return { success: false, message: serializeError(error) }
    }
  })

  handle('pull-current-branch', async () => {
    try {
      const result = await pullCurrentBranch()
      if (result.success) {
        const path = getRepoPath()
        // Note: The actual branch name is handled internally by pullCurrentBranch
        // We emit 'current' as a placeholder - the event is mainly for triggering refresh
        if (path) emitGitPull(path, 'current')
      }
      return result
    } catch (error) {
      return { success: false, message: serializeError(error) }
    }
  })
}
