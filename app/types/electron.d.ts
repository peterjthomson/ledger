export interface Branch {
  name: string;
  current: boolean;
  commit: string;
  label: string;
  isRemote: boolean;
  // Extended metadata
  lastCommitDate?: string;
  firstCommitDate?: string;
  commitCount?: number;
  isLocalOnly?: boolean;
  isMerged?: boolean;
}

export interface BranchesResult {
  current: string;
  branches: Branch[];
  error?: string;
}

export type WorktreeAgent = 'cursor' | 'claude' | 'gemini' | 'junie' | 'unknown';

export interface Worktree {
  path: string;
  head: string;
  branch: string | null;
  bare: boolean;
  // Agent workspace metadata
  agent: WorktreeAgent;
  agentIndex: number;            // 1, 2, 3... per agent type
  contextHint: string;           // Primary file or branch name
  displayName: string;           // "Cursor 1: DocsController"
  // Diff stats
  changedFileCount: number;
  additions: number;
  deletions: number;
  // For ordering
  lastModified: string;          // Directory mtime (ISO string)
}

export type BranchFilter = 'all' | 'local-only' | 'unmerged';
export type BranchSort = 'name' | 'last-commit' | 'first-commit' | 'most-commits';

export interface CheckoutResult {
  success: boolean;
  message: string;
  stashed?: string;
}

export interface PullRequest {
  number: number;
  title: string;
  author: string;
  branch: string;
  baseBranch: string;
  url: string;
  createdAt: string;
  updatedAt: string;
  additions: number;
  deletions: number;
  reviewDecision: string | null;
  labels: string[];
  isDraft: boolean;
  comments: number;
}

export type PRFilter = 'all' | 'open-not-draft' | 'open-draft';
export type PRSort = 'updated' | 'comments' | 'first-commit' | 'last-commit';

export interface PullRequestsResult {
  prs: PullRequest[];
  error?: string;
}

export interface Commit {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  date: string;
  isMerge: boolean;
  filesChanged?: number;
  additions?: number;
  deletions?: number;
}

export interface UncommittedFile {
  path: string;
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked';
  staged: boolean;
}

export interface WorkingStatus {
  hasChanges: boolean;
  files: UncommittedFile[];
  stagedCount: number;
  unstagedCount: number;
  additions: number;
  deletions: number;
}

export interface ElectronAPI {
  selectRepo: () => Promise<string | null>;
  getRepoPath: () => Promise<string | null>;
  getSavedRepoPath: () => Promise<string | null>;
  loadSavedRepo: () => Promise<string | null>;
  getBranches: () => Promise<BranchesResult>;
  getBranchesWithMetadata: () => Promise<BranchesResult>;
  getWorktrees: () => Promise<Worktree[] | { error: string }>;
  // Checkout operations
  checkoutBranch: (branchName: string) => Promise<CheckoutResult>;
  checkoutRemoteBranch: (remoteBranch: string) => Promise<CheckoutResult>;
  openWorktree: (worktreePath: string) => Promise<{ success: boolean; message: string }>;
  applyWorktree: (worktreePath: string, worktreeBranch: string) => Promise<CheckoutResult>;
  removeWorktree: (worktreePath: string, force?: boolean) => Promise<{ success: boolean; message: string }>;
  // Pull requests
  getPullRequests: () => Promise<PullRequestsResult>;
  openPullRequest: (url: string) => Promise<{ success: boolean; message: string }>;
  checkoutPRBranch: (branchName: string) => Promise<CheckoutResult>;
  // Remote operations
  getGitHubUrl: () => Promise<string | null>;
  openBranchInGitHub: (branchName: string) => Promise<{ success: boolean; message: string }>;
  pullBranch: (remoteBranch: string) => Promise<{ success: boolean; message: string }>;
  // Commit history and working status
  getCommitHistory: (limit?: number) => Promise<Commit[]>;
  getWorkingStatus: () => Promise<WorkingStatus>;
  // Reset operations
  resetToCommit: (commitHash: string, mode: 'soft' | 'mixed' | 'hard') => Promise<CheckoutResult>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
