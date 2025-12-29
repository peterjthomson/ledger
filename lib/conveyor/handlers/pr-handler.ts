import { handle } from '@/lib/main/shared'
import {
  getPullRequests,
  openPullRequest,
  createPullRequest,
  checkoutPRBranch,
  getGitHubUrl,
  openBranchInGitHub,
  getPRDetail,
  getPRReviewComments,
  getPRFileDiff,
  commentOnPR,
  mergePR,
} from '@/lib/main/git-service'

export const registerPRHandlers = () => {
  handle('get-pull-requests', async () => {
    return await getPullRequests()
  })

  handle('open-pull-request', async (url: string) => {
    return await openPullRequest(url)
  })

  handle(
    'create-pull-request',
    async (options: {
      title: string
      body?: string
      baseBranch?: string
      draft?: boolean
      web?: boolean
    }) => {
      try {
        return await createPullRequest(options)
      } catch (error) {
        return { success: false, message: (error as Error).message }
      }
    }
  )

  handle('checkout-pr-branch', async (branchName: string) => {
    return await checkoutPRBranch(branchName)
  })

  handle('get-github-url', async () => {
    return await getGitHubUrl()
  })

  handle('open-branch-in-github', async (branchName: string) => {
    return await openBranchInGitHub(branchName)
  })

  handle('get-pr-detail', async (prNumber: number) => {
    try {
      return await getPRDetail(prNumber)
    } catch (_error) {
      return null
    }
  })

  handle('get-pr-review-comments', async (prNumber: number) => {
    try {
      return await getPRReviewComments(prNumber)
    } catch (_error) {
      return []
    }
  })

  handle('get-pr-file-diff', async (prNumber: number, filePath: string) => {
    try {
      return await getPRFileDiff(prNumber, filePath)
    } catch (_error) {
      return null
    }
  })

  handle('comment-on-pr', async (prNumber: number, body: string) => {
    try {
      return await commentOnPR(prNumber, body)
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })

  handle('merge-pr', async (prNumber: number, mergeMethod?: 'merge' | 'squash' | 'rebase') => {
    try {
      return await mergePR(prNumber, mergeMethod ?? 'merge')
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })
}
