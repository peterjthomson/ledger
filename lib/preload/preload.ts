import { contextBridge, ipcRenderer } from 'electron'
import { conveyor } from '@/lib/conveyor/api'

// Git API for Ledger
const electronAPI = {
  selectRepo: () => ipcRenderer.invoke('select-repo'),
  getRepoPath: () => ipcRenderer.invoke('get-repo-path'),
  getSavedRepoPath: () => ipcRenderer.invoke('get-saved-repo-path'),
  loadSavedRepo: () => ipcRenderer.invoke('load-saved-repo'),
  getBranches: () => ipcRenderer.invoke('get-branches'),
  getBranchesBasic: () => ipcRenderer.invoke('get-branches-basic'),
  getBranchesWithMetadata: () => ipcRenderer.invoke('get-branches-with-metadata'),
  getWorktrees: () => ipcRenderer.invoke('get-worktrees'),
  // Checkout operations
  checkoutBranch: (branchName: string) => ipcRenderer.invoke('checkout-branch', branchName),
  createBranch: (branchName: string, checkout?: boolean) => ipcRenderer.invoke('create-branch', branchName, checkout),
  pushBranch: (branchName?: string, setUpstream?: boolean) =>
    ipcRenderer.invoke('push-branch', branchName, setUpstream),
  checkoutRemoteBranch: (remoteBranch: string) => ipcRenderer.invoke('checkout-remote-branch', remoteBranch),
  openWorktree: (worktreePath: string) => ipcRenderer.invoke('open-worktree', worktreePath),
  // Pull requests
  getPullRequests: () => ipcRenderer.invoke('get-pull-requests'),
  openPullRequest: (url: string) => ipcRenderer.invoke('open-pull-request', url),
  createPullRequest: (options: { title: string; body?: string; baseBranch?: string; draft?: boolean; web?: boolean }) =>
    ipcRenderer.invoke('create-pull-request', options),
  checkoutPRBranch: (branchName: string) => ipcRenderer.invoke('checkout-pr-branch', branchName),
  // Remote operations
  getGitHubUrl: () => ipcRenderer.invoke('get-github-url'),
  openBranchInGitHub: (branchName: string) => ipcRenderer.invoke('open-branch-in-github', branchName),
  pullBranch: (remoteBranch: string) => ipcRenderer.invoke('pull-branch', remoteBranch),
  // Commit history and working status
  getCommitHistory: (limit?: number) => ipcRenderer.invoke('get-commit-history', limit),
  getCommitHistoryForRef: (ref: string, limit?: number) => ipcRenderer.invoke('get-commit-history-for-ref', ref, limit),
  getCommitDetails: (commitHash: string) => ipcRenderer.invoke('get-commit-details', commitHash),
  getWorkingStatus: () => ipcRenderer.invoke('get-working-status'),
  // Reset operations
  resetToCommit: (commitHash: string, mode: 'soft' | 'mixed' | 'hard') =>
    ipcRenderer.invoke('reset-to-commit', commitHash, mode),
  // Focus mode APIs
  getCommitGraphHistory: (limit?: number, skipStats?: boolean, showCheckpoints?: boolean) =>
    ipcRenderer.invoke('get-commit-graph-history', limit, skipStats, showCheckpoints),
  getCommitDiff: (commitHash: string) => ipcRenderer.invoke('get-commit-diff', commitHash),
  getBranchDiff: (branchName: string) => ipcRenderer.invoke('get-branch-diff', branchName),
  getStashes: () => ipcRenderer.invoke('get-stashes'),
  getStashFiles: (stashIndex: number) => ipcRenderer.invoke('get-stash-files', stashIndex),
  getStashFileDiff: (stashIndex: number, filePath: string) =>
    ipcRenderer.invoke('get-stash-file-diff', stashIndex, filePath),
  getStashDiff: (stashIndex: number) => ipcRenderer.invoke('get-stash-diff', stashIndex),
  applyStash: (stashIndex: number) => ipcRenderer.invoke('apply-stash', stashIndex),
  popStash: (stashIndex: number) => ipcRenderer.invoke('pop-stash', stashIndex),
  dropStash: (stashIndex: number) => ipcRenderer.invoke('drop-stash', stashIndex),
  stashToBranch: (stashIndex: number, branchName: string) =>
    ipcRenderer.invoke('stash-to-branch', stashIndex, branchName),
  // Worktree operations
  convertWorktreeToBranch: (worktreePath: string) => ipcRenderer.invoke('convert-worktree-to-branch', worktreePath),
  applyWorktreeChanges: (worktreePath: string) => ipcRenderer.invoke('apply-worktree-changes', worktreePath),
  removeWorktree: (worktreePath: string, force?: boolean) =>
    ipcRenderer.invoke('remove-worktree', worktreePath, force ?? false),
  // Staging & commit operations
  stageFile: (filePath: string) => ipcRenderer.invoke('stage-file', filePath),
  unstageFile: (filePath: string) => ipcRenderer.invoke('unstage-file', filePath),
  stageAll: () => ipcRenderer.invoke('stage-all'),
  unstageAll: () => ipcRenderer.invoke('unstage-all'),
  discardFileChanges: (filePath: string) => ipcRenderer.invoke('discard-file-changes', filePath),
  getFileDiff: (filePath: string, staged: boolean) => ipcRenderer.invoke('get-file-diff', filePath, staged),
  commitChanges: (message: string, description?: string, force?: boolean) =>
    ipcRenderer.invoke('commit-changes', message, description, force),
  pullCurrentBranch: () => ipcRenderer.invoke('pull-current-branch'),
  // PR Review operations
  getPRDetail: (prNumber: number) => ipcRenderer.invoke('get-pr-detail', prNumber),
  getPRReviewComments: (prNumber: number) => ipcRenderer.invoke('get-pr-review-comments', prNumber),
  getPRFileDiff: (prNumber: number, filePath: string) => ipcRenderer.invoke('get-pr-file-diff', prNumber, filePath),
  commentOnPR: (prNumber: number, body: string) => ipcRenderer.invoke('comment-on-pr', prNumber, body),
}

// Use `contextBridge` APIs to expose APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('conveyor', conveyor)
    contextBridge.exposeInMainWorld('electronAPI', electronAPI)
  } catch (error) {
    console.error(error)
  }
} else {
  window.conveyor = conveyor
  window.electronAPI = electronAPI
}
