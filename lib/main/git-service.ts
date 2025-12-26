import { simpleGit, SimpleGit } from 'simple-git';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);
const statAsync = promisify(fs.stat);

let git: SimpleGit | null = null;
let repoPath: string | null = null;

export function setRepoPath(path: string) {
  repoPath = path;
  git = simpleGit(path);
}

export function getRepoPath(): string | null {
  return repoPath;
}

export interface BranchInfo {
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

export async function getBranches() {
  if (!git) throw new Error('No repository selected');
  
  const result = await git.branch(['-a', '-v']);
  
  // Get list of remote branch names for local-only detection
  const remoteBranches = new Set<string>();
  Object.keys(result.branches).forEach(name => {
    if (name.startsWith('remotes/')) {
      // Extract branch name without remote prefix (e.g., "remotes/origin/main" -> "main")
      const parts = name.replace('remotes/', '').split('/');
      parts.shift(); // remove origin or other remote name
      remoteBranches.add(parts.join('/'));
    }
  });

  const branches: BranchInfo[] = Object.entries(result.branches).map(([name, data]) => ({
    name,
    current: data.current,
    commit: data.commit,
    label: data.label,
    isRemote: name.startsWith('remotes/'),
    isLocalOnly: !name.startsWith('remotes/') && !remoteBranches.has(name),
  }));

  return {
    current: result.current,
    branches,
  };
}

export async function getBranchMetadata(branchName: string): Promise<{
  lastCommitDate: string;
  firstCommitDate: string;
  commitCount: number;
}> {
  if (!git) throw new Error('No repository selected');

  // Get last commit date
  const lastCommit = await git.log([branchName, '-1', '--format=%ci']);
  const lastCommitDate = lastCommit.latest?.date || '';

  // Get first commit date (oldest commit on this branch)
  const firstCommitRaw = await git.raw(['log', branchName, '--reverse', '--format=%ci', '-1']);
  const firstCommitDate = firstCommitRaw.trim();

  // Get commit count
  const countRaw = await git.raw(['rev-list', '--count', branchName]);
  const commitCount = parseInt(countRaw.trim(), 10) || 0;

  return {
    lastCommitDate,
    firstCommitDate,
    commitCount,
  };
}

export async function getUnmergedBranches(baseBranch: string = 'origin/master'): Promise<string[]> {
  if (!git) throw new Error('No repository selected');

  try {
    // Try origin/master first, fall back to origin/main
    let targetBranch = baseBranch;
    try {
      await git.raw(['rev-parse', '--verify', baseBranch]);
    } catch {
      targetBranch = 'origin/main';
      try {
        await git.raw(['rev-parse', '--verify', targetBranch]);
      } catch {
        // Neither exists, return empty
        return [];
      }
    }

    // Get branches not merged into the target
    const result = await git.raw(['branch', '-a', '--no-merged', targetBranch]);
    return result
      .split('\n')
      .map(b => b.trim().replace(/^\* /, ''))
      .filter(b => b && !b.includes('HEAD'));
  } catch {
    return [];
  }
}

export async function getBranchesWithMetadata() {
  if (!git) throw new Error('No repository selected');

  const { current, branches } = await getBranches();
  const unmergedBranches = await getUnmergedBranches();
  const unmergedSet = new Set(unmergedBranches);

  // Get metadata for all branches in parallel (batched to avoid overwhelming git)
  const batchSize = 10;
  const branchesWithMeta: BranchInfo[] = [];

  for (let i = 0; i < branches.length; i += batchSize) {
    const batch = branches.slice(i, i + batchSize);
    const metadataPromises = batch.map(async (branch) => {
      try {
        const meta = await getBranchMetadata(branch.name);
        return {
          ...branch,
          lastCommitDate: meta.lastCommitDate,
          firstCommitDate: meta.firstCommitDate,
          commitCount: meta.commitCount,
          isMerged: !unmergedSet.has(branch.name),
        };
      } catch {
        return {
          ...branch,
          isMerged: !unmergedSet.has(branch.name),
        };
      }
    });

    const results = await Promise.all(metadataPromises);
    branchesWithMeta.push(...results);
  }

  return {
    current,
    branches: branchesWithMeta,
  };
}

export async function getWorktrees() {
  if (!git) throw new Error('No repository selected');
  
  // git worktree list --porcelain gives machine-readable output
  const result = await git.raw(['worktree', 'list', '--porcelain']);
  
  const worktrees: Array<{
    path: string;
    head: string;
    branch: string | null;
    bare: boolean;
  }> = [];
  
  let current: any = {};
  
  for (const line of result.split('\n')) {
    if (line.startsWith('worktree ')) {
      if (current.path) worktrees.push(current);
      current = { path: line.replace('worktree ', ''), bare: false };
    } else if (line.startsWith('HEAD ')) {
      current.head = line.replace('HEAD ', '');
    } else if (line.startsWith('branch ')) {
      current.branch = line.replace('branch ', '').replace('refs/heads/', '');
    } else if (line === 'bare') {
      current.bare = true;
    } else if (line === 'detached') {
      current.branch = null;
    }
  }
  
  if (current.path) worktrees.push(current);
  
  return worktrees;
}

// Agent workspace types
export type WorktreeAgent = 'cursor' | 'claude' | 'gemini' | 'junie' | 'unknown';

export interface EnhancedWorktree {
  path: string;
  head: string;
  branch: string | null;
  bare: boolean;
  // Agent workspace metadata
  agent: WorktreeAgent;
  agentIndex: number;
  contextHint: string;
  displayName: string;
  // Diff stats
  changedFileCount: number;
  additions: number;
  deletions: number;
  // For ordering
  lastModified: string;
}

// Detect which agent created this worktree based on its path
function detectAgent(worktreePath: string): WorktreeAgent {
  // Cursor stores worktrees in ~/.cursor/worktrees/
  if (worktreePath.includes('/.cursor/worktrees/')) {
    return 'cursor';
  }
  
  // Claude Code might use ~/.claude/worktrees/ or similar
  if (worktreePath.includes('/.claude/worktrees/') || worktreePath.includes('/claude-worktrees/')) {
    return 'claude';
  }
  
  // Add other agent patterns as we discover them
  // For now, if it's not in a known agent path, mark as unknown
  return 'unknown';
}

// Get diff stats for a worktree
async function getWorktreeDiffStats(worktreePath: string): Promise<{
  changedFileCount: number;
  additions: number;
  deletions: number;
  changedFiles: string[];
}> {
  try {
    // Get changed files count and names
    const { stdout: statusOutput } = await execAsync('git status --porcelain', { cwd: worktreePath });
    const changedFiles = statusOutput.split('\n').filter(Boolean).map(line => line.slice(3));
    
    // Get diff stats (additions/deletions)
    const { stdout: diffOutput } = await execAsync('git diff --shortstat', { cwd: worktreePath });
    
    let additions = 0;
    let deletions = 0;
    
    // Parse "2 files changed, 6 insertions(+), 1 deletion(-)"
    const insertMatch = diffOutput.match(/(\d+) insertion/);
    const deleteMatch = diffOutput.match(/(\d+) deletion/);
    
    if (insertMatch) additions = parseInt(insertMatch[1], 10);
    if (deleteMatch) deletions = parseInt(deleteMatch[1], 10);

    return {
      changedFileCount: changedFiles.length,
      additions,
      deletions,
      changedFiles,
    };
  } catch {
    return { changedFileCount: 0, additions: 0, deletions: 0, changedFiles: [] };
  }
}

// Get the context hint (primary modified file or branch name)
function getContextHint(
  branch: string | null,
  changedFiles: string[],
  commitMessage: string
): string {
  // Priority 1: Primary modified file (if any changes)
  if (changedFiles.length > 0) {
    const primaryFile = changedFiles[0];
    const basename = path.basename(primaryFile);
    // Remove extension for cleaner display
    const name = basename.replace(/\.[^.]+$/, '');
    return name;
  }

  // Priority 2: Branch name (if not detached)
  if (branch) {
    // Clean up branch name - take last segment if it's a path
    const segments = branch.split('/');
    return segments[segments.length - 1];
  }

  // Priority 3: Commit message (truncated)
  if (commitMessage) {
    return commitMessage.slice(0, 20) + (commitMessage.length > 20 ? '…' : '');
  }

  return 'workspace';
}

// Get last commit message for a worktree
async function getWorktreeCommitMessage(worktreePath: string): Promise<string> {
  try {
    const { stdout } = await execAsync('git log -1 --format=%s', { cwd: worktreePath });
    return stdout.trim();
  } catch {
    return '';
  }
}

// Get directory modification time
async function getDirectoryMtime(dirPath: string): Promise<string> {
  try {
    const stat = await statAsync(dirPath);
    return stat.mtime.toISOString();
  } catch {
    return new Date().toISOString();
  }
}

// Get enhanced worktrees with agent detection and metadata
export async function getEnhancedWorktrees(): Promise<EnhancedWorktree[]> {
  if (!git) throw new Error('No repository selected');

  // Get basic worktree list
  const basicWorktrees = await getWorktrees();

  // Enhance each worktree with metadata (in parallel)
  const enhancedPromises = basicWorktrees.map(async (wt) => {
    const [diffStats, commitMessage, lastModified] = await Promise.all([
      getWorktreeDiffStats(wt.path),
      getWorktreeCommitMessage(wt.path),
      getDirectoryMtime(wt.path),
    ]);

    const agent = detectAgent(wt.path);
    const contextHint = getContextHint(wt.branch, diffStats.changedFiles, commitMessage);

    return {
      ...wt,
      agent,
      agentIndex: 0, // Will be assigned after sorting
      contextHint,
      displayName: '', // Will be set after agentIndex is assigned
      changedFileCount: diffStats.changedFileCount,
      additions: diffStats.additions,
      deletions: diffStats.deletions,
      lastModified,
    };
  });

  const enhanced = await Promise.all(enhancedPromises);

  // Sort by lastModified to assign agent indices in creation order
  enhanced.sort((a, b) => new Date(a.lastModified).getTime() - new Date(b.lastModified).getTime());

  // Assign agent indices per agent type
  const agentCounters: Record<WorktreeAgent, number> = {
    cursor: 0,
    claude: 0,
    gemini: 0,
    junie: 0,
    unknown: 0,
  };

  for (const wt of enhanced) {
    agentCounters[wt.agent]++;
    wt.agentIndex = agentCounters[wt.agent];
    
    // Format displayName as "Agent N: contextHint"
    const agentName = wt.agent.charAt(0).toUpperCase() + wt.agent.slice(1);
    wt.displayName = `${agentName} ${wt.agentIndex}: ${wt.contextHint}`;
  }

  return enhanced;
}

// Check if there are uncommitted changes
export async function hasUncommittedChanges(): Promise<boolean> {
  if (!git) throw new Error('No repository selected');
  
  const status = await git.status();
  return !status.isClean();
}

// Stash uncommitted changes
export async function stashChanges(): Promise<{ stashed: boolean; message: string }> {
  if (!git) throw new Error('No repository selected');
  
  const hasChanges = await hasUncommittedChanges();
  if (!hasChanges) {
    return { stashed: false, message: 'No changes to stash' };
  }
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const stashMessage = `Ledger auto-stash ${timestamp}`;
  
  await git.stash(['push', '-m', stashMessage, '--include-untracked']);
  return { stashed: true, message: stashMessage };
}

// Switch to a local branch
export async function checkoutBranch(branchName: string): Promise<{ success: boolean; message: string; stashed?: string }> {
  if (!git) throw new Error('No repository selected');
  
  try {
    // Stash any uncommitted changes first
    const stashResult = await stashChanges();
    
    // Checkout the branch
    await git.checkout(branchName);
    
    return {
      success: true,
      message: `Switched to branch '${branchName}'`,
      stashed: stashResult.stashed ? stashResult.message : undefined,
    };
  } catch (error) {
    return {
      success: false,
      message: (error as Error).message,
    };
  }
}

// Checkout a remote branch (creates local tracking branch)
export async function checkoutRemoteBranch(remoteBranch: string): Promise<{ success: boolean; message: string; stashed?: string }> {
  if (!git) throw new Error('No repository selected');
  
  try {
    // Stash any uncommitted changes first
    const stashResult = await stashChanges();
    
    // Extract the local branch name from remote (e.g., "remotes/origin/feature" -> "feature")
    const parts = remoteBranch.replace('remotes/', '').split('/');
    parts.shift(); // remove "origin" or other remote name
    const localBranchName = parts.join('/');
    
    // Check if local branch already exists
    const branches = await git.branchLocal();
    if (branches.all.includes(localBranchName)) {
      // Just checkout existing local branch
      await git.checkout(localBranchName);
      return {
        success: true,
        message: `Switched to existing branch '${localBranchName}'`,
        stashed: stashResult.stashed ? stashResult.message : undefined,
      };
    }
    
    // Create and checkout tracking branch
    await git.checkout(['-b', localBranchName, '--track', remoteBranch.replace('remotes/', '')]);
    
    return {
      success: true,
      message: `Created and switched to branch '${localBranchName}' tracking '${remoteBranch}'`,
      stashed: stashResult.stashed ? stashResult.message : undefined,
    };
  } catch (error) {
    return {
      success: false,
      message: (error as Error).message,
    };
  }
}

// Get the path of a worktree to open
export function getWorktreePath(worktreePath: string): string {
  return worktreePath;
}

// Pull Request types
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

// Fetch open, non-draft pull requests using GitHub CLI
export async function getPullRequests(): Promise<{ prs: PullRequest[]; error?: string }> {
  if (!repoPath) {
    return { prs: [], error: 'No repository selected' };
  }

  try {
    // Use gh CLI to list PRs in JSON format
    // Fetch all open PRs (filtering will happen in UI)
    const { stdout } = await execAsync(
      `gh pr list --state open --json number,title,author,headRefName,baseRefName,url,createdAt,updatedAt,additions,deletions,reviewDecision,labels,isDraft,comments`,
      { cwd: repoPath }
    );

    const rawPRs = JSON.parse(stdout);
    
    // Map to our interface (include all, filtering done in UI)
    const prs: PullRequest[] = rawPRs
      .map((pr: any) => ({
        number: pr.number,
        title: pr.title,
        author: pr.author?.login || 'unknown',
        branch: pr.headRefName,
        baseBranch: pr.baseRefName,
        url: pr.url,
        createdAt: pr.createdAt,
        updatedAt: pr.updatedAt,
        additions: pr.additions || 0,
        deletions: pr.deletions || 0,
        reviewDecision: pr.reviewDecision,
        labels: (pr.labels || []).map((l: any) => l.name),
        isDraft: pr.isDraft || false,
        comments: pr.comments?.totalCount || 0,
      }));

    return { prs };
  } catch (error) {
    const errorMessage = (error as Error).message;
    
    // Check for common errors
    if (errorMessage.includes('gh: command not found') || errorMessage.includes('not recognized')) {
      return { prs: [], error: 'GitHub CLI (gh) not installed. Install from https://cli.github.com' };
    }
    if (errorMessage.includes('not logged in') || errorMessage.includes('authentication')) {
      return { prs: [], error: 'Not logged in to GitHub CLI. Run: gh auth login' };
    }
    if (errorMessage.includes('not a git repository') || errorMessage.includes('no git remotes')) {
      return { prs: [], error: 'Not a GitHub repository' };
    }
    
    return { prs: [], error: errorMessage };
  }
}

// Open a PR in the browser
export async function openPullRequest(url: string): Promise<{ success: boolean; message: string }> {
  try {
    await execAsync(`open "${url}"`);
    return { success: true, message: 'Opened PR in browser' };
  } catch (error) {
    return { success: false, message: (error as Error).message };
  }
}

// Get the GitHub remote URL for the repository
export async function getGitHubUrl(): Promise<string | null> {
  if (!git) return null;
  
  try {
    const remotes = await git.getRemotes(true);
    const origin = remotes.find(r => r.name === 'origin');
    if (!origin?.refs?.fetch) return null;
    
    let url = origin.refs.fetch;
    // Convert SSH URL to HTTPS
    if (url.startsWith('git@github.com:')) {
      url = url.replace('git@github.com:', 'https://github.com/').replace(/\.git$/, '');
    } else if (url.startsWith('https://github.com/')) {
      url = url.replace(/\.git$/, '');
    } else {
      return null;
    }
    
    return url;
  } catch {
    return null;
  }
}

// Open a branch in GitHub
export async function openBranchInGitHub(branchName: string): Promise<{ success: boolean; message: string }> {
  try {
    const baseUrl = await getGitHubUrl();
    if (!baseUrl) {
      return { success: false, message: 'Could not determine GitHub URL' };
    }
    
    // Clean up branch name (remove remotes/origin/ prefix if present)
    const cleanBranch = branchName.replace(/^remotes\/origin\//, '').replace(/^origin\//, '');
    const url = `${baseUrl}/tree/${cleanBranch}`;
    
    await execAsync(`open "${url}"`);
    return { success: true, message: `Opened ${cleanBranch} in browser` };
  } catch (error) {
    return { success: false, message: (error as Error).message };
  }
}

// Pull/fetch a remote branch
export async function pullBranch(remoteBranch: string): Promise<{ success: boolean; message: string }> {
  if (!git) throw new Error('No repository selected');
  
  try {
    // Extract remote and branch name
    const cleanBranch = remoteBranch.replace(/^remotes\//, '');
    const parts = cleanBranch.split('/');
    const remote = parts[0]; // e.g., "origin"
    const branch = parts.slice(1).join('/'); // e.g., "feature/something"
    
    // Fetch the specific branch
    await git.fetch(remote, branch);
    
    return { success: true, message: `Fetched ${branch} from ${remote}` };
  } catch (error) {
    return { success: false, message: (error as Error).message };
  }
}

// Commit info for timeline
export interface CommitInfo {
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

// Get recent commit history for the current branch
export async function getCommitHistory(limit: number = 20): Promise<CommitInfo[]> {
  if (!git) throw new Error('No repository selected');

  try {
    // Get basic log info
    const log = await git.log(['-n', limit.toString()]);
    
    // Get stat info for each commit
    const commits: CommitInfo[] = [];
    for (const commit of log.all) {
      // Get file stats for this commit
      let filesChanged = 0;
      let additions = 0;
      let deletions = 0;
      
      try {
        const statOutput = await git.raw(['show', '--stat', '--format=', commit.hash]);
        const lines = statOutput.trim().split('\n');
        const summaryLine = lines[lines.length - 1];
        // Parse: "3 files changed, 10 insertions(+), 5 deletions(-)"
        const filesMatch = summaryLine.match(/(\d+) files? changed/);
        const addMatch = summaryLine.match(/(\d+) insertions?\(\+\)/);
        const delMatch = summaryLine.match(/(\d+) deletions?\(-\)/);
        filesChanged = filesMatch ? parseInt(filesMatch[1]) : 0;
        additions = addMatch ? parseInt(addMatch[1]) : 0;
        deletions = delMatch ? parseInt(delMatch[1]) : 0;
      } catch {
        // Ignore stat errors
      }
      
      // Check if it's a merge commit
      const isMerge = commit.body?.includes('Merge') || (commit.refs || '').includes('Merge');
      
      commits.push({
        hash: commit.hash,
        shortHash: commit.hash.slice(0, 7),
        message: commit.message,
        author: commit.author_name,
        date: commit.date,
        isMerge,
        filesChanged,
        additions,
        deletions,
      });
    }
    
    return commits;
  } catch {
    return [];
  }
}

// Get list of uncommitted files (staged + unstaged + untracked)
export interface UncommittedFile {
  path: string;
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked';
  staged: boolean;
}

export async function getUncommittedFiles(): Promise<UncommittedFile[]> {
  if (!git) throw new Error('No repository selected');

  try {
    const status = await git.status();
    const files: UncommittedFile[] = [];

    // Staged files
    for (const file of status.staged) {
      files.push({ path: file, status: 'added', staged: true });
    }
    
    // Modified files
    for (const file of status.modified) {
      const isStaged = status.staged.includes(file);
      files.push({ path: file, status: 'modified', staged: isStaged });
    }

    // Deleted files
    for (const file of status.deleted) {
      files.push({ path: file, status: 'deleted', staged: false });
    }

    // Renamed files
    for (const file of status.renamed) {
      files.push({ path: file.to, status: 'renamed', staged: true });
    }

    // Untracked (new) files
    for (const file of status.not_added) {
      files.push({ path: file, status: 'untracked', staged: false });
    }

    // Also check created files
    for (const file of status.created) {
      if (!files.some(f => f.path === file)) {
        files.push({ path: file, status: 'added', staged: true });
      }
    }

    return files;
  } catch {
    return [];
  }
}

// Get working directory status summary
export interface WorkingStatus {
  hasChanges: boolean;
  files: UncommittedFile[];
  stagedCount: number;
  unstagedCount: number;
  additions: number;
  deletions: number;
}

export async function getWorkingStatus(): Promise<WorkingStatus> {
  if (!git) throw new Error('No repository selected');

  const files = await getUncommittedFiles();
  const stagedCount = files.filter(f => f.staged).length;
  const unstagedCount = files.filter(f => !f.staged).length;

  // Get line change stats (both staged and unstaged)
  let additions = 0;
  let deletions = 0;
  try {
    // Get unstaged changes
    const unstagedDiff = await git.diff(['--stat']);
    if (unstagedDiff.trim()) {
      const lines = unstagedDiff.trim().split('\n');
      const summaryLine = lines[lines.length - 1];
      const addMatch = summaryLine.match(/(\d+) insertions?\(\+\)/);
      const delMatch = summaryLine.match(/(\d+) deletions?\(-\)/);
      additions += addMatch ? parseInt(addMatch[1]) : 0;
      deletions += delMatch ? parseInt(delMatch[1]) : 0;
    }
    
    // Get staged changes
    const stagedDiff = await git.diff(['--cached', '--stat']);
    if (stagedDiff.trim()) {
      const lines = stagedDiff.trim().split('\n');
      const summaryLine = lines[lines.length - 1];
      const addMatch = summaryLine.match(/(\d+) insertions?\(\+\)/);
      const delMatch = summaryLine.match(/(\d+) deletions?\(-\)/);
      additions += addMatch ? parseInt(addMatch[1]) : 0;
      deletions += delMatch ? parseInt(delMatch[1]) : 0;
    }
  } catch {
    // Ignore diff errors
  }

  return {
    hasChanges: files.length > 0,
    files,
    stagedCount,
    unstagedCount,
    additions,
    deletions,
  };
}

// Reset to a specific commit
export async function resetToCommit(commitHash: string, mode: 'soft' | 'mixed' | 'hard' = 'hard'): Promise<{ success: boolean; message: string; stashed?: string }> {
  if (!git) throw new Error('No repository selected');
  
  try {
    // Stash any uncommitted changes first (only for hard reset)
    let stashResult = { stashed: false, message: '' };
    if (mode === 'hard') {
      stashResult = await stashChanges();
    }
    
    // Perform the reset
    await git.reset([`--${mode}`, commitHash]);
    
    const shortHash = commitHash.slice(0, 7);
    return {
      success: true,
      message: `Reset to ${shortHash} (${mode})`,
      stashed: stashResult.stashed ? stashResult.message : undefined,
    };
  } catch (error) {
    return { success: false, message: (error as Error).message };
  }
}

// Get detailed information about a specific commit
export interface CommitFileChange {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'copied';
  additions: number;
  deletions: number;
  oldPath?: string; // For renames
}

export interface CommitDetails {
  hash: string;
  shortHash: string;
  message: string;
  body: string;
  author: string;
  authorEmail: string;
  date: string;
  parentHashes: string[];
  files: CommitFileChange[];
  totalAdditions: number;
  totalDeletions: number;
}

export async function getCommitDetails(commitHash: string): Promise<CommitDetails | null> {
  if (!git) throw new Error('No repository selected');

  try {
    // Get commit info
    const log = await git.log(['-1', commitHash]);
    const commit = log.latest;
    if (!commit) return null;

    // Get parent hashes
    const parentRaw = await git.raw(['rev-parse', `${commitHash}^@`]).catch(() => '');
    const parentHashes = parentRaw.trim().split('\n').filter(Boolean);

    // Get file changes with stats
    const diffOutput = await git.raw(['diff-tree', '--no-commit-id', '--name-status', '-r', '--numstat', commitHash]);
    
    // Parse numstat for additions/deletions
    const numstatOutput = await git.raw(['diff-tree', '--no-commit-id', '-r', '--numstat', commitHash]);
    const numstatLines = numstatOutput.trim().split('\n').filter(Boolean);
    const statMap = new Map<string, { additions: number; deletions: number }>();
    
    for (const line of numstatLines) {
      const parts = line.split('\t');
      if (parts.length >= 3) {
        const additions = parts[0] === '-' ? 0 : parseInt(parts[0], 10) || 0;
        const deletions = parts[1] === '-' ? 0 : parseInt(parts[1], 10) || 0;
        const filePath = parts[parts.length - 1]; // Last part is file path (handles renames)
        statMap.set(filePath, { additions, deletions });
      }
    }

    // Parse name-status for file status
    const nameStatusOutput = await git.raw(['diff-tree', '--no-commit-id', '-r', '--name-status', commitHash]);
    const statusLines = nameStatusOutput.trim().split('\n').filter(Boolean);
    
    const files: CommitFileChange[] = [];
    let totalAdditions = 0;
    let totalDeletions = 0;

    for (const line of statusLines) {
      const parts = line.split('\t');
      if (parts.length < 2) continue;

      const statusChar = parts[0][0];
      let status: CommitFileChange['status'] = 'modified';
      let filePath = parts[1];
      let oldPath: string | undefined;

      switch (statusChar) {
        case 'A':
          status = 'added';
          break;
        case 'D':
          status = 'deleted';
          break;
        case 'M':
          status = 'modified';
          break;
        case 'R':
          status = 'renamed';
          oldPath = parts[1];
          filePath = parts[2] || parts[1];
          break;
        case 'C':
          status = 'copied';
          oldPath = parts[1];
          filePath = parts[2] || parts[1];
          break;
      }

      const stats = statMap.get(filePath) || { additions: 0, deletions: 0 };
      totalAdditions += stats.additions;
      totalDeletions += stats.deletions;

      files.push({
        path: filePath,
        status,
        additions: stats.additions,
        deletions: stats.deletions,
        oldPath,
      });
    }

    // Get full commit message (subject + body)
    const fullMessage = await git.raw(['log', '-1', '--format=%B', commitHash]);
    const messageLines = fullMessage.trim().split('\n');
    const subject = messageLines[0] || '';
    const body = messageLines.slice(1).join('\n').trim();

    // Get author email
    const authorEmail = await git.raw(['log', '-1', '--format=%ae', commitHash]);

    return {
      hash: commit.hash,
      shortHash: commit.hash.slice(0, 7),
      message: subject,
      body,
      author: commit.author_name,
      authorEmail: authorEmail.trim(),
      date: commit.date,
      parentHashes,
      files,
      totalAdditions,
      totalDeletions,
    };
  } catch (error) {
    console.error('Error getting commit details:', error);
    return null;
  }
}

// Get commit history for a specific branch/ref
export async function getCommitHistoryForRef(ref: string, limit: number = 50): Promise<CommitInfo[]> {
  if (!git) throw new Error('No repository selected');

  try {
    const log = await git.log([ref, '-n', limit.toString()]);
    
    const commits: CommitInfo[] = [];
    for (const commit of log.all) {
      // Check if it's a merge commit
      const isMerge = commit.body?.includes('Merge') || (commit.refs || '').includes('Merge');
      
      commits.push({
        hash: commit.hash,
        shortHash: commit.hash.slice(0, 7),
        message: commit.message,
        author: commit.author_name,
        date: commit.date,
        isMerge,
      });
    }
    
    return commits;
  } catch {
    return [];
  }
}

// Convert a worktree to a branch
// Takes changes from a worktree, creates a new branch from master/main with the folder name, and applies the changes
export async function convertWorktreeToBranch(worktreePath: string): Promise<{ success: boolean; message: string; branchName?: string }> {
  if (!git) throw new Error('No repository selected');

  try {
    // Get the folder name from the worktree path to use as branch name
    const folderName = path.basename(worktreePath);
    
    // Sanitize folder name for use as branch name (replace spaces and special chars)
    const branchName = folderName
      .replace(/[^a-zA-Z0-9_-]/g, '-')
      .replace(/--+/g, '-')
      .replace(/^-|-$/g, '');

    if (!branchName) {
      return { success: false, message: 'Could not derive a valid branch name from the folder' };
    }

    // Check if branch already exists
    const branches = await git.branchLocal();
    if (branches.all.includes(branchName)) {
      return { success: false, message: `Branch '${branchName}' already exists` };
    }

    // Find the base branch (master or main)
    let baseBranch = 'master';
    try {
      await git.raw(['rev-parse', '--verify', 'origin/master']);
    } catch {
      try {
        await git.raw(['rev-parse', '--verify', 'origin/main']);
        baseBranch = 'main';
      } catch {
        // Try local master/main
        if (branches.all.includes('main')) {
          baseBranch = 'main';
        } else if (!branches.all.includes('master')) {
          return { success: false, message: 'Could not find master or main branch' };
        }
      }
    }

    // Get the diff from the worktree as a patch
    const { stdout: patchOutput } = await execAsync('git diff HEAD', { cwd: worktreePath });
    
    // Also get untracked files
    const { stdout: untrackedOutput } = await execAsync('git ls-files --others --exclude-standard', { cwd: worktreePath });
    const untrackedFiles = untrackedOutput.split('\n').filter(Boolean);

    // Check if there are any changes
    if (!patchOutput.trim() && untrackedFiles.length === 0) {
      return { success: false, message: 'No changes to convert - worktree is clean' };
    }

    // Stash any changes in the main repo first
    const stashResult = await stashChanges();

    // Create a new branch from the base branch
    const baseRef = branches.all.includes(baseBranch) ? baseBranch : `origin/${baseBranch}`;
    await git.checkout(['-b', branchName, baseRef]);

    // Apply the patch if there are tracked file changes
    if (patchOutput.trim()) {
      // Write patch to a temp file
      const tempPatchFile = path.join(repoPath!, '.ledger-temp-patch');
      try {
        await fs.promises.writeFile(tempPatchFile, patchOutput);
        await execAsync(`git apply --3way "${tempPatchFile}"`, { cwd: repoPath! });
      } catch (applyError) {
        // If apply fails, try to apply with less strict options
        try {
          await execAsync(`git apply --reject --whitespace=fix "${tempPatchFile}"`, { cwd: repoPath! });
        } catch {
          // Clean up and revert to the base branch
          try {
            await fs.promises.unlink(tempPatchFile);
          } catch { /* ignore */ }
          await git.checkout(stashResult.stashed ? '-' : baseBranch);
          await git.branch(['-D', branchName]);
          if (stashResult.stashed) {
            await git.stash(['pop']);
          }
          return { success: false, message: `Failed to apply changes: ${(applyError as Error).message}` };
        }
      } finally {
        // Clean up temp file
        try {
          await fs.promises.unlink(tempPatchFile);
        } catch { /* ignore */ }
      }
    }

    // Copy untracked files from worktree to main repo
    for (const file of untrackedFiles) {
      const srcPath = path.join(worktreePath, file);
      const destPath = path.join(repoPath!, file);
      
      // Ensure destination directory exists
      const destDir = path.dirname(destPath);
      await fs.promises.mkdir(destDir, { recursive: true });
      
      // Copy the file
      await fs.promises.copyFile(srcPath, destPath);
    }

    // Stage all changes
    await git.add(['-A']);

    // Commit the changes
    const commitMessage = `Changes from worktree: ${folderName}`;
    await git.commit(commitMessage);

    return {
      success: true,
      message: `Created branch '${branchName}' with changes from worktree`,
      branchName,
    };
  } catch (error) {
    return { success: false, message: (error as Error).message };
  }
}

// Checkout a PR branch (by branch name)
export async function checkoutPRBranch(branchName: string): Promise<{ success: boolean; message: string; stashed?: string }> {
  if (!git) throw new Error('No repository selected');
  
  try {
    // First fetch to ensure we have the latest
    await git.fetch('origin', branchName);
    
    // Stash any uncommitted changes
    const stashResult = await stashChanges();
    
    // Check if local branch exists
    const branches = await git.branchLocal();
    if (branches.all.includes(branchName)) {
      // Checkout and pull
      await git.checkout(branchName);
      await git.pull('origin', branchName);
    } else {
      // Create tracking branch
      await git.checkout(['-b', branchName, '--track', `origin/${branchName}`]);
    }
    
    return {
      success: true,
      message: `Checked out '${branchName}'`,
      stashed: stashResult.stashed ? stashResult.message : undefined,
    };
  } catch (error) {
    return { success: false, message: (error as Error).message };
  }
}

// ========================================
// Work Mode APIs
// ========================================

// Commit with graph data (parent hashes for graph rendering)
export interface GraphCommit {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  date: string;
  parents: string[];  // Parent commit hashes
  refs: string[];     // Branch/tag refs pointing to this commit
  isMerge: boolean;
  filesChanged?: number;
  additions?: number;
  deletions?: number;
}

// Get commit history with parent info for git graph
export async function getCommitGraphHistory(limit: number = 100): Promise<GraphCommit[]> {
  if (!git) throw new Error('No repository selected');

  try {
    // Use raw git log with custom format to get parent hashes
    const format = '%H|%h|%s|%an|%ci|%P|%D';
    const output = await git.raw([
      'log',
      `--format=${format}`,
      '-n', limit.toString(),
      '--all'  // Include all branches
    ]);

    const lines = output.trim().split('\n').filter(Boolean);
    const commits: GraphCommit[] = [];

    for (const line of lines) {
      const [hash, shortHash, message, author, date, parentStr, refsStr] = line.split('|');
      const parents = parentStr ? parentStr.split(' ').filter(Boolean) : [];
      const refs = refsStr ? refsStr.split(', ').filter(Boolean).map(r => r.trim()) : [];
      
      // Get stats for each commit (could be optimized with --stat in a batch)
      let filesChanged = 0;
      let additions = 0;
      let deletions = 0;
      
      try {
        const statOutput = await git.raw(['show', '--stat', '--format=', hash]);
        const statLines = statOutput.trim().split('\n');
        const summaryLine = statLines[statLines.length - 1];
        const filesMatch = summaryLine.match(/(\d+) files? changed/);
        const addMatch = summaryLine.match(/(\d+) insertions?\(\+\)/);
        const delMatch = summaryLine.match(/(\d+) deletions?\(-\)/);
        filesChanged = filesMatch ? parseInt(filesMatch[1]) : 0;
        additions = addMatch ? parseInt(addMatch[1]) : 0;
        deletions = delMatch ? parseInt(delMatch[1]) : 0;
      } catch {
        // Ignore stat errors
      }

      commits.push({
        hash,
        shortHash,
        message,
        author,
        date,
        parents,
        refs,
        isMerge: parents.length > 1,
        filesChanged,
        additions,
        deletions,
      });
    }

    return commits;
  } catch {
    return [];
  }
}

// Diff file info
export interface DiffFile {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  additions: number;
  deletions: number;
  oldPath?: string;  // For renames
}

// Diff hunk (a section of changes)
export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

// A single line in a diff
export interface DiffLine {
  type: 'context' | 'add' | 'delete' | 'header';
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

// Full diff for a file
export interface FileDiff {
  file: DiffFile;
  hunks: DiffHunk[];
  isBinary: boolean;
}

// Commit diff result
export interface CommitDiff {
  hash: string;
  message: string;
  author: string;
  date: string;
  files: FileDiff[];
  totalAdditions: number;
  totalDeletions: number;
}

// Get diff for a specific commit
export async function getCommitDiff(commitHash: string): Promise<CommitDiff | null> {
  if (!git) throw new Error('No repository selected');

  try {
    // Get commit info
    const logOutput = await git.raw(['show', '--format=%H|%s|%an|%ci', '-s', commitHash]);
    const [hash, message, author, date] = logOutput.trim().split('|');

    // Get diff with file stats
    const diffOutput = await git.raw([
      'show',
      '--format=',
      '--patch',
      '--stat',
      commitHash
    ]);

    // Parse the diff output
    const files: FileDiff[] = [];
    let totalAdditions = 0;
    let totalDeletions = 0;

    // Split by file diffs
    const diffParts = diffOutput.split(/^diff --git /m).filter(Boolean);
    
    for (const part of diffParts) {
      const lines = part.split('\n');
      
      // Parse file header
      const headerMatch = lines[0].match(/a\/(.+) b\/(.+)/);
      if (!headerMatch) continue;
      
      const oldPath = headerMatch[1];
      const newPath = headerMatch[2];
      
      // Determine status
      let status: 'added' | 'modified' | 'deleted' | 'renamed' = 'modified';
      if (part.includes('new file mode')) status = 'added';
      else if (part.includes('deleted file mode')) status = 'deleted';
      else if (oldPath !== newPath) status = 'renamed';
      
      // Check for binary
      const isBinary = part.includes('Binary files');
      
      // Parse hunks
      const hunks: DiffHunk[] = [];
      let fileAdditions = 0;
      let fileDeletions = 0;
      
      if (!isBinary) {
        const hunkMatches = part.matchAll(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)/g);
        
        for (const match of hunkMatches) {
          const oldStart = parseInt(match[1]);
          const oldLinesCount = match[2] ? parseInt(match[2]) : 1;
          const newStart = parseInt(match[3]);
          const newLinesCount = match[4] ? parseInt(match[4]) : 1;
          
          // Find the lines after this hunk header
          const hunkStartIndex = part.indexOf(match[0]);
          const hunkContent = part.slice(hunkStartIndex + match[0].length);
          const hunkLines: DiffLine[] = [];
          
          let oldLine = oldStart;
          let newLine = newStart;
          
          for (const line of hunkContent.split('\n')) {
            if (line.startsWith('@@') || line.startsWith('diff --git')) break;
            
            if (line.startsWith('+') && !line.startsWith('+++')) {
              hunkLines.push({ type: 'add', content: line.slice(1), newLineNumber: newLine });
              newLine++;
              fileAdditions++;
            } else if (line.startsWith('-') && !line.startsWith('---')) {
              hunkLines.push({ type: 'delete', content: line.slice(1), oldLineNumber: oldLine });
              oldLine++;
              fileDeletions++;
            } else if (line.startsWith(' ')) {
              hunkLines.push({ type: 'context', content: line.slice(1), oldLineNumber: oldLine, newLineNumber: newLine });
              oldLine++;
              newLine++;
            }
          }
          
          hunks.push({
            oldStart,
            oldLines: oldLinesCount,
            newStart,
            newLines: newLinesCount,
            lines: hunkLines,
          });
        }
      }

      totalAdditions += fileAdditions;
      totalDeletions += fileDeletions;

      files.push({
        file: {
          path: newPath,
          status,
          additions: fileAdditions,
          deletions: fileDeletions,
          oldPath: status === 'renamed' ? oldPath : undefined,
        },
        hunks,
        isBinary,
      });
    }

    return {
      hash,
      message,
      author,
      date,
      files,
      totalAdditions,
      totalDeletions,
    };
  } catch {
    return null;
  }
}

// Stash entry
export interface StashEntry {
  index: number;
  message: string;
  branch: string;
  date: string;
}

// Get list of stashes
export async function getStashes(): Promise<StashEntry[]> {
  if (!git) throw new Error('No repository selected');

  try {
    const output = await git.raw(['stash', 'list', '--format=%gd|%gs|%ci']);
    
    if (!output.trim()) {
      return [];
    }

    const stashes: StashEntry[] = [];
    const lines = output.trim().split('\n');

    for (const line of lines) {
      const [indexStr, message, date] = line.split('|');
      // Parse stash@{0} to get index
      const indexMatch = indexStr.match(/stash@\{(\d+)\}/);
      const index = indexMatch ? parseInt(indexMatch[1]) : 0;
      
      // Extract branch from message if present (format: "WIP on branch: message" or "On branch: message")
      const branchMatch = message.match(/(?:WIP )?[Oo]n ([^:]+):/);
      const branch = branchMatch ? branchMatch[1] : '';

      stashes.push({
        index,
        message: message.replace(/^(?:WIP )?[Oo]n [^:]+: /, ''),
        branch,
        date,
      });
    }

    return stashes;
  } catch {
    return [];
  }
}
