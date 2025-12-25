import { simpleGit, SimpleGit } from 'simple-git';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

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
}

// Fetch open, non-draft pull requests using GitHub CLI
export async function getPullRequests(): Promise<{ prs: PullRequest[]; error?: string }> {
  if (!repoPath) {
    return { prs: [], error: 'No repository selected' };
  }

  try {
    // Use gh CLI to list PRs in JSON format
    // Filter: open state, not draft
    const { stdout } = await execAsync(
      `gh pr list --state open --json number,title,author,headRefName,baseRefName,url,createdAt,updatedAt,additions,deletions,reviewDecision,labels,isDraft`,
      { cwd: repoPath }
    );

    const rawPRs = JSON.parse(stdout);
    
    // Filter out drafts and map to our interface
    const prs: PullRequest[] = rawPRs
      .filter((pr: any) => !pr.isDraft)
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
}

// Get recent commit history for the current branch
export async function getCommitHistory(limit: number = 20): Promise<CommitInfo[]> {
  if (!git) throw new Error('No repository selected');

  try {
    const log = await git.log(['-n', limit.toString(), '--format=%H|%h|%s|%an|%ci|%P']);
    
    return log.all.map(commit => {
      // Check if it's a merge commit by looking at parent count
      const parentCount = (commit.body || '').split(' ').filter(Boolean).length;
      return {
        hash: commit.hash,
        shortHash: commit.hash.slice(0, 7),
        message: commit.message,
        author: commit.author_name,
        date: commit.date,
        isMerge: parentCount > 1,
      };
    });
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
}

export async function getWorkingStatus(): Promise<WorkingStatus> {
  if (!git) throw new Error('No repository selected');

  const files = await getUncommittedFiles();
  const stagedCount = files.filter(f => f.staged).length;
  const unstagedCount = files.filter(f => !f.staged).length;

  return {
    hasChanges: files.length > 0,
    files,
    stagedCount,
    unstagedCount,
  };
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
