import { handle } from '@/lib/main/shared'
import {
  getCommitHistory,
  getWorkingStatus,
  resetToCommit,
  getCommitGraphHistory,
  getCommitDiff,
  getBranchDiff,
  commitChanges,
  pullCurrentBranch,
} from '@/lib/main/git-service'

export const registerCommitHandlers = () => {
  handle('get-commit-history', async (limit?: number) => {
    try {
      return await getCommitHistory(limit)
    } catch (_error) {
      return []
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
      return { success: false, message: (error as Error).message }
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
      return await commitChanges(message, description, force)
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })

  handle('pull-current-branch', async () => {
    try {
      return await pullCurrentBranch()
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })
}
