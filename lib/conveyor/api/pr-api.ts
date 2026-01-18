import { ConveyorApi } from '@/lib/preload/shared'
import type { CreatePROptions, MergeMethod } from '@/lib/conveyor/schemas/shared-types'

export class PRApi extends ConveyorApi {
  getPullRequests = () => this.invoke('get-pull-requests')
  openPullRequest = (url: string) => this.invoke('open-pull-request', url)
  createPullRequest = (options: CreatePROptions) => this.invoke('create-pull-request', options)
  checkoutPRBranch = (branchName: string) => this.invoke('checkout-pr-branch', branchName)
  getGitHubUrl = () => this.invoke('get-github-url')
  openBranchInGitHub = (branchName: string) => this.invoke('open-branch-in-github', branchName)
  getPRDetail = (prNumber: number) => this.invoke('get-pr-detail', prNumber)
  getPRReviewComments = (prNumber: number) => this.invoke('get-pr-review-comments', prNumber)
  getPRFileDiff = (prNumber: number, filePath: string) => this.invoke('get-pr-file-diff', prNumber, filePath)
  getPRFileDiffParsed = (prNumber: number, filePath: string) => this.invoke('get-pr-file-diff-parsed', prNumber, filePath)
  commentOnPR = (prNumber: number, body: string) => this.invoke('comment-on-pr', prNumber, body)
  mergePR = (prNumber: number, mergeMethod?: MergeMethod) => this.invoke('merge-pr', prNumber, mergeMethod)
}
