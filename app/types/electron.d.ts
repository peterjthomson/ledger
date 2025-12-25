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

export interface Worktree {
  path: string;
  head: string;
  branch: string | null;
  bare: boolean;
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
}

export interface PullRequestsResult {
  prs: PullRequest[];
  error?: string;
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
  // Pull requests
  getPullRequests: () => Promise<PullRequestsResult>;
  openPullRequest: (url: string) => Promise<{ success: boolean; message: string }>;
  checkoutPRBranch: (branchName: string) => Promise<CheckoutResult>;
  // Remote operations
  openBranchInGitHub: (branchName: string) => Promise<{ success: boolean; message: string }>;
  pullBranch: (remoteBranch: string) => Promise<{ success: boolean; message: string }>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
