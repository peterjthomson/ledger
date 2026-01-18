# Worktree Location Conventions

> Where should worktrees live? An evaluation of 5 conventions and Ledger's chosen approach.

## Background

Git worktrees are powerful but under-tooled. One reason is the lack of consensus on where worktrees should be created. Different tools use different conventions:

- **AI agents** (Cursor, Claude Code) use home directory paths like `~/.cursor/worktrees/`
- **Traditional tools** create sibling folders alongside the main repo
- **Ledger** needed to choose a convention for its worktree features (Create Worktree, Leapfrog Stash)

This document evaluates 5 conventions and explains Ledger's approach.

---

## Convention 1: Sibling Folder

```
/Users/me/code/ledger                    # Main repo
/Users/me/code/ledger--feature-auth      # Worktree
/Users/me/code/ledger--hotfix-123        # Worktree
```

**Pattern**: `{repoParentDir}/{repoName}--{branchName}`

| Pros | Cons |
|------|------|
| Visible in file manager alongside repo | Clutters parent directory |
| Easy to find and navigate | Names can get long |
| Works well with IDE "Open Folder" | Pollutes `~/code/` with many folders |
| No hidden folders | Hard to distinguish worktrees from unrelated projects |
| gtr (CodeRabbit) uses this pattern | No namespace isolation per repo |

**Best for**: Traditional developer workflow, manual worktree management.

---

## Convention 2: Home Directory Agent Namespace

```
~/.cursor/worktrees/{repoName}/{hash}/   # Cursor
~/.claude/worktrees/{repoName}/{hash}/   # Claude Code
~/.gemini/worktrees/{repoName}/{hash}/   # Gemini CLI (gemini-wt)
~/conductor/workspaces/{repoName}/{task}/# Conductor
```

**Pattern**: `~/.{agent}/worktrees/{repoName}/{context}/`

**Note**: Gemini CLI uses the `gemini-wt` tool for managing parallel worktrees. Branches are typically named `gemini-{timestamp}` or custom names.

| Pros | Cons |
|------|------|
| Agent attribution built-in | Hidden in home directory |
| Clean separation from manual work | Requires agent detection logic |
| Survives repo deletion/moves | Different agents use different roots |
| Centralized per-agent namespace | Can't easily browse in Finder |
| Ledger already detects these | Needs `~/` expansion |

**Best for**: AI agent-created worktrees (automatic, ephemeral).

---

## Convention 3: Inside `.git/` Directory

```
/Users/me/code/ledger/.git/worktrees/        # Git's internal metadata
/Users/me/code/ledger/.git/ledger-worktrees/ # Tool-managed worktrees
```

**Pattern**: `{repoPath}/.git/ledger-worktrees/{context}/`

| Pros | Cons |
|------|------|
| Self-contained within repo | Inside `.git/` is unconventional |
| Auto-deleted if repo is deleted | Hidden from normal file browsing |
| No pollution of parent directory | Can conflict with git's internal `/worktrees/` |
| Survives repo moves (paths relative) | May confuse users unfamiliar with `.git/` |
| No gitignore needed | IDEs may not index properly |

**Best for**: Truly temporary/internal worktrees.

---

## Convention 4: Repo-Local Hidden Folder (`.worktrees/`)

```
/Users/me/code/ledger/.worktrees/feature-auth/
/Users/me/code/ledger/.worktrees/hotfix-123/
```

**Pattern**: `{repoPath}/.worktrees/{branchName}/`

| Pros | Cons |
|------|------|
| Repo-scoped but not inside `.git/` | Still hidden (dot-prefix) |
| Survives repo moves | Appears in `ls -la` but not `ls` |
| Clean, predictable location | **Requires `.gitignore` entry** |
| Easy to prune/clean | Worktrees inside worktrees = inception risk |
| Similar to `.env`, `.vscode` pattern | Not a standard git convention |

**Best for**: App-managed worktrees that belong to the repo but shouldn't clutter.

---

## Convention 5: Dedicated Workspace Root

```
~/worktrees/ledger/feature-auth/
~/worktrees/ledger/hotfix-123/
~/worktrees/other-project/fix-bug/
```

**Pattern**: `~/worktrees/{repoName}/{branchName}/`

| Pros | Cons |
|------|------|
| Single location for ALL worktrees | Requires global config |
| Easy to find and manage | Disconnected from repo location |
| Clean namespace hierarchy | Survives repo deletion (orphan worktrees) |
| Works across all repos | Needs repo name disambiguation |
| Good for "worktree-first" workflows | Cross-device sync complications |

**Best for**: Power users who work heavily with worktrees across many projects.

---

## Ledger's Chosen Approach

Ledger uses **Convention 4 (`.worktrees/`)** as its primary convention, with **Convention 1 (Sibling)** as an alternative.

### Why `.worktrees/`?

1. **Repo-scoped**: Worktrees stay with their parent repo
2. **Survives moves**: Moving the repo moves the worktrees too
3. **Clean**: Dot-prefix keeps them out of normal `ls` output
4. **Predictable**: `{repo}/.worktrees/{branch}` is easy to remember
5. **Convention-setting**: Establishes a standard for other tools to follow

### Implementation

The Create Worktree panel offers three location presets:

| Preset | Path Pattern | Description |
|--------|--------------|-------------|
| **`.worktrees/`** | `{repo}/.worktrees/{branch}` | Ledger convention (default) |
| **Sibling** | `{parent}/{repo}--{branch}` | Traditional pattern |
| **Custom** | User-specified | Full flexibility |

---

## Known Limitation: Requires `.gitignore`

**The `.worktrees/` convention requires an explicit `.gitignore` entry.**

### Why?

When you create a worktree with `git worktree add`, the target directory gets:
- A full working tree (all your files)
- A `.git` **file** (not folder) containing: `gitdir: /path/to/main/repo/.git/worktrees/{name}`

We expected git to auto-detect this `.git` file and treat the directory as a nested repository (like it does with submodules). However, **git still reports `.worktrees/` as untracked**.

### Verification

```bash
# Create a worktree in .worktrees/
git worktree add .worktrees/test-wt main

# Check what's in .git
cat .worktrees/test-wt/.git
# Output: gitdir: /path/to/repo/.git/worktrees/test-wt

# Check git status
git status --porcelain
# Output: ?? .worktrees/    <-- Still shows as untracked!
```

### The Fix

Add to `.gitignore`:

```gitignore
# Ledger worktrees convention
.worktrees/
```

### Future Hope

We hope this limitation can be overcome in the future. Possible approaches:

1. **Git core change**: Git could recognize the `gitdir:` file and auto-exclude
2. **Worktree flag**: A `--hidden` flag for `git worktree add` that auto-gitignores
3. **Global gitignore**: Users could add `.worktrees/` to their global `~/.gitignore`
4. **Ledger auto-fix**: Ledger could automatically add the gitignore entry when creating worktrees

For now, Ledger adds `.worktrees/` to the project's `.gitignore` and documents this requirement.

---

## Recommendation Matrix

| Use Case | Recommended Convention |
|----------|------------------------|
| **User-created worktrees** | `.worktrees/` (Ledger) or Sibling |
| **AI agent worktrees** | Home Agent Namespace (auto-detected) |
| **Leapfrog stash worktrees** | `.worktrees/` |
| **Cross-project power users** | Workspace Root (`~/worktrees/`) |

---

## References

- [Git Worktree Documentation](https://git-scm.com/docs/git-worktree)
- [git-worktree-runner (gtr)](https://github.com/coderabbitai/git-worktree-runner) - Uses sibling folder convention
- [Ledger Worktrees Feature](./features/worktrees.md)
- [Ledger Opinionated Git](./opinionated-git.md) - Includes Leapfrog Stash
