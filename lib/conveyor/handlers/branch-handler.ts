import { handle } from '@/lib/main/shared'
import {
  getBranches,
  getBranchesBasic,
  getBranchesWithMetadata,
  checkoutBranch,
  createBranch,
  pushBranch,
  checkoutRemoteBranch,
  pullBranch,
  getRepoPath,
} from '@/lib/main/git-service'
import { emitGitCheckout, emitGitPush, emitGitPull } from '@/lib/events'
import { serializeError } from '@/lib/utils/error-helpers'

export const registerBranchHandlers = () => {
  handle('get-branches', async () => {
    try {
      return await getBranches()
    } catch (error) {
      // Return empty result for remote repos or on error
      // This prevents UI errors when .filter() is called on the result
      console.error('[branch-handler] get-branches error:', error)
      return { current: '', branches: [] }
    }
  })

  handle('get-branches-basic', async () => {
    try {
      return await getBranchesBasic()
    } catch (error) {
      // Return empty result for remote repos or on error
      console.error('[branch-handler] get-branches-basic error:', error)
      return { current: '', branches: [] }
    }
  })

  handle('get-branches-with-metadata', async () => {
    try {
      return await getBranchesWithMetadata()
    } catch (error) {
      // Return empty result for remote repos or on error
      console.error('[branch-handler] get-branches-with-metadata error:', error)
      return { current: '', branches: [] }
    }
  })

  handle('checkout-branch', async (branchName: string) => {
    try {
      const result = await checkoutBranch(branchName)
      if (result.success) {
        const path = getRepoPath()
        if (path) emitGitCheckout(path, branchName)
      }
      return result
    } catch (error) {
      return { success: false, message: serializeError(error) }
    }
  })

  handle('create-branch', async (branchName: string, checkout?: boolean) => {
    try {
      return await createBranch(branchName, checkout ?? true)
    } catch (error) {
      return { success: false, message: serializeError(error) }
    }
  })

  handle('push-branch', async (branchName?: string, setUpstream?: boolean) => {
    try {
      const result = await pushBranch(branchName, setUpstream ?? true)
      if (result.success) {
        const path = getRepoPath()
        if (path && branchName) emitGitPush(path, branchName)
      }
      return result
    } catch (error) {
      return { success: false, message: serializeError(error) }
    }
  })

  handle('checkout-remote-branch', async (remoteBranch: string) => {
    try {
      const result = await checkoutRemoteBranch(remoteBranch)
      if (result.success) {
        const path = getRepoPath()
        // Extract local branch name from remote (e.g., origin/main -> main)
        const localBranch = remoteBranch.split('/').slice(1).join('/')
        if (path) emitGitCheckout(path, localBranch)
      }
      return result
    } catch (error) {
      return { success: false, message: serializeError(error) }
    }
  })

  handle('pull-branch', async (remoteBranch: string) => {
    try {
      const result = await pullBranch(remoteBranch)
      if (result.success) {
        const path = getRepoPath()
        const localBranch = remoteBranch.split('/').slice(1).join('/')
        if (path) emitGitPull(path, localBranch)
      }
      return result
    } catch (error) {
      return { success: false, message: serializeError(error) }
    }
  })
}
