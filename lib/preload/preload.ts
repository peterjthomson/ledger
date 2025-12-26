import { contextBridge, ipcRenderer } from 'electron'
import { conveyor } from '@/lib/conveyor/api'

// Git API for Ledger
const electronAPI = {
  selectRepo: () => ipcRenderer.invoke('select-repo'),
  getRepoPath: () => ipcRenderer.invoke('get-repo-path'),
  getSavedRepoPath: () => ipcRenderer.invoke('get-saved-repo-path'),
  loadSavedRepo: () => ipcRenderer.invoke('load-saved-repo'),
  getBranches: () => ipcRenderer.invoke('get-branches'),
  getBranchesWithMetadata: () => ipcRenderer.invoke('get-branches-with-metadata'),
  getWorktrees: () => ipcRenderer.invoke('get-worktrees'),
  // Checkout operations
  checkoutBranch: (branchName: string) => ipcRenderer.invoke('checkout-branch', branchName),
  checkoutRemoteBranch: (remoteBranch: string) => ipcRenderer.invoke('checkout-remote-branch', remoteBranch),
  openWorktree: (worktreePath: string) => ipcRenderer.invoke('open-worktree', worktreePath),
  applyWorktree: (worktreePath: string, worktreeBranch: string) => ipcRenderer.invoke('apply-worktree', worktreePath, worktreeBranch),
  removeWorktree: (worktreePath: string, force?: boolean) => ipcRenderer.invoke('remove-worktree', worktreePath, force ?? false),
  // Pull requests
  getPullRequests: () => ipcRenderer.invoke('get-pull-requests'),
  openPullRequest: (url: string) => ipcRenderer.invoke('open-pull-request', url),
  checkoutPRBranch: (branchName: string) => ipcRenderer.invoke('checkout-pr-branch', branchName),
  // Remote operations
  getGitHubUrl: () => ipcRenderer.invoke('get-github-url'),
  openBranchInGitHub: (branchName: string) => ipcRenderer.invoke('open-branch-in-github', branchName),
  pullBranch: (remoteBranch: string) => ipcRenderer.invoke('pull-branch', remoteBranch),
  // Commit history and working status
  getCommitHistory: (limit?: number) => ipcRenderer.invoke('get-commit-history', limit),
  getWorkingStatus: () => ipcRenderer.invoke('get-working-status'),
  // Reset operations
  resetToCommit: (commitHash: string, mode: 'soft' | 'mixed' | 'hard') => ipcRenderer.invoke('reset-to-commit', commitHash, mode),
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
