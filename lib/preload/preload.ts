import { contextBridge, ipcRenderer } from 'electron'
import { conveyor } from '@/lib/conveyor/api'
import { LEDGER_EVENT_CHANNEL, type LedgerEvent, type LedgerEventType } from '@/lib/events/event-types'

// Event subscription management
type EventCallback = (event: LedgerEvent) => void
const eventListeners = new Map<string, Set<EventCallback>>()
let ipcListenerRegistered = false

function ensureIpcListener() {
  if (ipcListenerRegistered) return
  ipcListenerRegistered = true

  ipcRenderer.on(LEDGER_EVENT_CHANNEL, (_ipcEvent, event: LedgerEvent) => {
    // Notify type-specific listeners
    const typeListeners = eventListeners.get(event.type)
    if (typeListeners) {
      for (const callback of typeListeners) {
        try {
          callback(event)
        } catch (err) {
          console.error(`[Events] Error in listener for ${event.type}:`, err)
        }
      }
    }

    // Notify wildcard listeners
    const wildcardListeners = eventListeners.get('*')
    if (wildcardListeners) {
      for (const callback of wildcardListeners) {
        try {
          callback(event)
        } catch (err) {
          console.error('[Events] Error in wildcard listener:', err)
        }
      }
    }
  })
}

// Events API for renderer
const events = {
  /**
   * Subscribe to events of a specific type
   * @param type Event type or '*' for all events
   * @param callback Function to call when event occurs
   * @returns Unsubscribe function
   */
  on(type: LedgerEventType | '*', callback: EventCallback): () => void {
    ensureIpcListener()

    if (!eventListeners.has(type)) {
      eventListeners.set(type, new Set())
    }
    eventListeners.get(type)!.add(callback)

    // Return unsubscribe function
    return () => {
      const listeners = eventListeners.get(type)
      if (listeners) {
        listeners.delete(callback)
        if (listeners.size === 0) {
          eventListeners.delete(type)
        }
      }
    }
  },

  /**
   * Subscribe to an event once
   */
  once(type: LedgerEventType | '*', callback: EventCallback): () => void {
    const unsubscribe = this.on(type, (event) => {
      unsubscribe()
      callback(event)
    })
    return unsubscribe
  },
}

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
  deleteBranch: (branchName: string, force?: boolean) => ipcRenderer.invoke('delete-branch', branchName, force),
  deleteRemoteBranch: (branchName: string) => ipcRenderer.invoke('delete-remote-branch', branchName),
  pushBranch: (branchName?: string, setUpstream?: boolean) =>
    ipcRenderer.invoke('push-branch', branchName, setUpstream),
  checkoutRemoteBranch: (remoteBranch: string) => ipcRenderer.invoke('checkout-remote-branch', remoteBranch),
  openWorktree: (worktreePath: string) => ipcRenderer.invoke('open-worktree', worktreePath),
  // Pull requests
  getPullRequests: () => ipcRenderer.invoke('get-pull-requests'),
  openPullRequest: (url: string) => ipcRenderer.invoke('open-pull-request', url),
  createPullRequest: (options: { title: string; body?: string; headBranch?: string; baseBranch?: string; draft?: boolean; web?: boolean }) =>
    ipcRenderer.invoke('create-pull-request', options),
  checkoutPRBranch: (prNumber: number) => ipcRenderer.invoke('checkout-pr-branch', prNumber),
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
  getContributorStats: (topN?: number, bucketSize?: 'day' | 'week' | 'month') =>
    ipcRenderer.invoke('get-contributor-stats', topN, bucketSize),
  // Mailmap management
  getMailmap: () => ipcRenderer.invoke('get-mailmap'),
  getAuthorIdentities: () => ipcRenderer.invoke('get-author-identities'),
  suggestMailmapEntries: () => ipcRenderer.invoke('suggest-mailmap-entries'),
  addMailmapEntries: (entries: Array<{ canonicalName: string; canonicalEmail: string; aliasName?: string; aliasEmail: string }>) =>
    ipcRenderer.invoke('add-mailmap-entries', entries),
  removeMailmapEntry: (entry: { canonicalName: string; canonicalEmail: string; aliasName?: string; aliasEmail: string }) =>
    ipcRenderer.invoke('remove-mailmap-entry', entry),
  getCommitDiff: (commitHash: string) => ipcRenderer.invoke('get-commit-diff', commitHash),
  getBranchDiff: (branchName: string, diffType?: 'diff' | 'changes' | 'preview') => ipcRenderer.invoke('get-branch-diff', branchName, diffType),
  getStashes: () => ipcRenderer.invoke('get-stashes'),
  getStashFiles: (stashIndex: number) => ipcRenderer.invoke('get-stash-files', stashIndex),
  getStashFileDiff: (stashIndex: number, filePath: string) =>
    ipcRenderer.invoke('get-stash-file-diff', stashIndex, filePath),
  getStashFileDiffParsed: (stashIndex: number, filePath: string) =>
    ipcRenderer.invoke('get-stash-file-diff-parsed', stashIndex, filePath),
  getStashDiff: (stashIndex: number) => ipcRenderer.invoke('get-stash-diff', stashIndex),
  applyStash: (stashIndex: number) => ipcRenderer.invoke('apply-stash', stashIndex),
  popStash: (stashIndex: number) => ipcRenderer.invoke('pop-stash', stashIndex),
  dropStash: (stashIndex: number) => ipcRenderer.invoke('drop-stash', stashIndex),
  stashToBranch: (stashIndex: number, branchName: string) =>
    ipcRenderer.invoke('stash-to-branch', stashIndex, branchName),
  applyStashToBranch: (stashIndex: number, targetBranch: string, stashMessage: string, keepWorktree?: boolean) =>
    ipcRenderer.invoke('apply-stash-to-branch', stashIndex, targetBranch, stashMessage, keepWorktree ?? false),
  // Worktree operations
  convertWorktreeToBranch: (worktreePath: string) => ipcRenderer.invoke('convert-worktree-to-branch', worktreePath),
  applyWorktreeChanges: (worktreePath: string) => ipcRenderer.invoke('apply-worktree-changes', worktreePath),
  removeWorktree: (worktreePath: string, force?: boolean) =>
    ipcRenderer.invoke('remove-worktree', worktreePath, force ?? false),
  createWorktree: (options: { branchName?: string; commitHash?: string; isNewBranch: boolean; folderPath: string }) =>
    ipcRenderer.invoke('create-worktree', options),
  selectWorktreeFolder: () => ipcRenderer.invoke('select-worktree-folder'),
  // Herd preview operations
  checkHerdAvailable: (worktreePath: string) => ipcRenderer.invoke('check-herd-available', worktreePath),
  openWorktreeInBrowser: (worktreePath: string, mainRepoPath: string) =>
    ipcRenderer.invoke('open-worktree-in-browser', worktreePath, mainRepoPath),
  previewBranchInBrowser: (branchName: string, mainRepoPath: string) =>
    ipcRenderer.invoke('preview-branch-in-browser', branchName, mainRepoPath),
  previewPRInBrowser: (prNumber: number, prBranchName: string, mainRepoPath: string) =>
    ipcRenderer.invoke('preview-pr-in-browser', prNumber, prBranchName, mainRepoPath),
  previewCommitInBrowser: (commitHash: string, mainRepoPath: string) =>
    ipcRenderer.invoke('preview-commit-in-browser', commitHash, mainRepoPath),
  // Worktree-specific staging & commit operations
  getWorktreeWorkingStatus: (worktreePath: string) => ipcRenderer.invoke('get-worktree-working-status', worktreePath),
  stageFileInWorktree: (worktreePath: string, filePath: string) =>
    ipcRenderer.invoke('stage-file-in-worktree', worktreePath, filePath),
  unstageFileInWorktree: (worktreePath: string, filePath: string) =>
    ipcRenderer.invoke('unstage-file-in-worktree', worktreePath, filePath),
  stageAllInWorktree: (worktreePath: string) => ipcRenderer.invoke('stage-all-in-worktree', worktreePath),
  unstageAllInWorktree: (worktreePath: string) => ipcRenderer.invoke('unstage-all-in-worktree', worktreePath),
  getFileDiffInWorktree: (worktreePath: string, filePath: string, staged: boolean) =>
    ipcRenderer.invoke('get-file-diff-in-worktree', worktreePath, filePath, staged),
  commitInWorktree: (worktreePath: string, message: string, description?: string) =>
    ipcRenderer.invoke('commit-in-worktree', worktreePath, message, description),
  pushWorktreeBranch: (worktreePath: string) => ipcRenderer.invoke('push-worktree-branch', worktreePath),
  // Staging & commit operations
  stageFile: (filePath: string) => ipcRenderer.invoke('stage-file', filePath),
  unstageFile: (filePath: string) => ipcRenderer.invoke('unstage-file', filePath),
  stageAll: () => ipcRenderer.invoke('stage-all'),
  unstageAll: () => ipcRenderer.invoke('unstage-all'),
  discardFileChanges: (filePath: string) => ipcRenderer.invoke('discard-file-changes', filePath),
  discardAllChanges: () => ipcRenderer.invoke('discard-all-changes'),
  getFileDiff: (filePath: string, staged: boolean) => ipcRenderer.invoke('get-file-diff', filePath, staged),
  commitChanges: (message: string, description?: string, force?: boolean) =>
    ipcRenderer.invoke('commit-changes', message, description, force),
  pullCurrentBranch: () => ipcRenderer.invoke('pull-current-branch'),
  // PR Review operations
  getPRDetail: (prNumber: number) => ipcRenderer.invoke('get-pr-detail', prNumber),
  getPRReviewComments: (prNumber: number) => ipcRenderer.invoke('get-pr-review-comments', prNumber),
  getPRFileDiff: (prNumber: number, filePath: string) => ipcRenderer.invoke('get-pr-file-diff', prNumber, filePath),
  commentOnPR: (prNumber: number, body: string) => ipcRenderer.invoke('comment-on-pr', prNumber, body),
  mergePR: (prNumber: number, mergeMethod?: 'merge' | 'squash' | 'rebase') => ipcRenderer.invoke('merge-pr', prNumber, mergeMethod),
  // Tech tree operations
  getMergedBranchTree: (limit?: number) => ipcRenderer.invoke('get-merged-branch-tree', limit),
  // Theme operations
  getThemeMode: () => ipcRenderer.invoke('get-theme-mode'),
  getSelectedThemeId: () => ipcRenderer.invoke('get-selected-theme-id'),
  setThemeMode: (mode: 'light' | 'dark' | 'system' | 'custom', themeId?: string) => ipcRenderer.invoke('set-theme-mode', mode, themeId),
  getSystemTheme: () => ipcRenderer.invoke('get-system-theme'),
  getCustomTheme: () => ipcRenderer.invoke('get-custom-theme'),
  loadVSCodeTheme: () => ipcRenderer.invoke('load-vscode-theme'),
  loadBuiltInTheme: (themeFileName: string, themeId?: string) => ipcRenderer.invoke('load-built-in-theme', themeFileName, themeId),
  clearCustomTheme: () => ipcRenderer.invoke('clear-custom-theme'),
  // Canvas operations
  getCanvases: () => ipcRenderer.invoke('get-canvases'),
  saveCanvases: (canvases: unknown[]) => ipcRenderer.invoke('save-canvases', canvases),
  getActiveCanvasId: () => ipcRenderer.invoke('get-active-canvas-id'),
  saveActiveCanvasId: (canvasId: string) => ipcRenderer.invoke('save-active-canvas-id', canvasId),
  addCanvas: (canvas: unknown) => ipcRenderer.invoke('add-canvas', canvas),
  removeCanvas: (canvasId: string) => ipcRenderer.invoke('remove-canvas', canvasId),
  updateCanvas: (canvasId: string, updates: unknown) => ipcRenderer.invoke('update-canvas', canvasId, updates),
  // Repo operations
  getSiblingRepos: () => ipcRenderer.invoke('get-sibling-repos'),
}

// Security verification (from kaurifund's bug fix)
if (!process.contextIsolated) {
  console.error(
    '[SECURITY] Context isolation is DISABLED! This is a critical security risk.\n' +
    'Ensure webPreferences.contextIsolation is set to true in lib/main/app.ts'
  )
}

// Expose APIs to renderer via contextBridge
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('conveyor', conveyor)
    contextBridge.exposeInMainWorld('ledgerEvents', events)
    contextBridge.exposeInMainWorld('electronAPI', electronAPI)
  } catch (error) {
    console.error('[Preload] Failed to expose APIs:', error)
  }
} else {
  // Fallback for testing without context isolation
  ;(window as unknown as { conveyor: typeof conveyor }).conveyor = conveyor
  ;(window as unknown as { ledgerEvents: typeof events }).ledgerEvents = events
  ;(window as unknown as { electronAPI: typeof electronAPI }).electronAPI = electronAPI
}
