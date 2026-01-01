# 🌲 Worktrees

> First-class support for git worktrees with AI agent workspace detection.

## Overview

Git worktrees allow you to have multiple working directories from a single repository. Ledger enhances worktrees with automatic detection of AI agent workspaces (Cursor, Claude, Gemini), diff statistics, and smart display names.

## Features

### Agent Detection

Ledger automatically detects which AI agent created a worktree:

| Agent | Detection Path | Display |
|-------|---------------|---------|
| **Cursor** | `~/.cursor/worktrees/` | "Cursor 1: context" |
| **Claude** | `~/.claude/worktrees/` | "Claude 1: context" |
| **Conductor** | `~/conductor/workspaces/` | "Conductor 1: context" |
| **Gemini** | `~/.gemini/worktrees/` | "Gemini 1: context" |
| **Junie** | `~/.junie/worktrees/` | "Junie 1: context" |
| **Unknown** | Other paths | Folder name |

### Smart Display Names

```
Format: "{Agent} {Index}: {Context}"

Examples:
  • Cursor 1: AuthController
  • Claude 2: login-fix
  • Gemini 1: workspace
```

**Context Hint Priority:**
1. Primary modified file name (if changes exist)
2. Branch name (if checked out)
3. Last commit message (truncated)
4. Generic "workspace"

### Diff Statistics

Each worktree shows:
- **Changed file count**: Number of modified files
- **Additions**: Lines added (`+42`)
- **Deletions**: Lines removed (`-17`)
- **Clean indicator**: "clean" if no changes

## Data Model

Canonical types live in `app/types/electron.d.ts` (renderer-facing API contract):

- `Worktree`
- `WorktreeAgent`
- `WorktreeActivityStatus`

## Actions

### Checkout Worktree (Double-click)

Switches to the branch associated with the worktree:

```
User double-clicks "Cursor 1: AuthController"
    │
    ├─► Get worktree branch: "feature/auth"
    │
    ├─► Auto-stash current changes (if any)
    │
    ├─► git checkout feature/auth
    │
    └─► Show success toast
```

### Open in Finder (Right-click)

Opens the worktree directory in macOS Finder.

### Create Branch (Rescue for Detached Worktrees)

When a worktree has **no branch checked out** (detached HEAD), AI agents may have done work that's "orphaned"—uncommitted changes with no branch to commit to. The "Create Branch" action rescues this work.

**When it appears**: Only for worktrees with no branch (detached HEAD).

**What it does**:

```
Rescue detached worktree "Cursor 1: AuthController"
    │
    ├─► Stash any changes in your main repo
    │
    ├─► Detect base branch (main/master)
    │
    ├─► Create new branch from base
    │       Name: derived from worktree folder name
    │
    ├─► Extract changes from worktree as patch
    │       git diff HEAD (in worktree)
    │
    ├─► Apply patch to new branch
    │       git apply --3way
    │
    ├─► Copy any untracked files
    │
    ├─► Stage all changes
    │       git add -A
    │
    └─► Switch back to your original branch
```

**Result**: You now have a proper branch with all the worktree's changes staged and ready to commit.

**Use case**: AI agents (Cursor, Claude) often work in worktrees on detached HEADs. This lets you rescue their work into a proper branch for review and commit.

### Uncommitted Changes (Worktrees with a Branch)

When a worktree **has a branch checked out** and has uncommitted changes, these are surfaced as "work in progress" on that branch. You can:

- **Checkout** the worktree's branch to continue work there
- **Apply** the changes to your current branch instead

The "Create Branch" button is hidden for these worktrees since the work already belongs to a branch.

## Filtering

```
┌─────────────────────────────────────┐
│ Parent:  [All ▾]                    │
│          • All                      │
│          • .cursor                  │
│          • .claude                  │
│          • main                     │
└─────────────────────────────────────┘
```

Filter worktrees by their parent directory to see only specific agent workspaces.

## Git Commands Used

| Feature | Command |
|---------|---------|
| List worktrees | `git worktree list --porcelain` |
| Get status | `git status --porcelain` (in worktree) |
| Get diff stats | `git diff --shortstat` (in worktree) |
| Get commit msg | `git log -1 --format=%s` (in worktree) |
| Convert to branch | `git diff`, `git checkout -b`, `git apply` |

## UI Locations

### Radar Mode
- **Worktrees** column (2nd column)
- Shows all worktrees with diff stats

### Focus Mode
- **Worktrees** section in sidebar (collapsible)
- Single-click → Shows worktree info in detail panel
- Double-click → Checks out worktree branch

## Visual Indicators

| Indicator | Meaning |
|-----------|---------|
| `●` dot | Currently checked out |
| `+42 -17` | Additions/deletions |
| `3 files` | Changed file count |
| `clean` | No uncommitted changes |

## Example Display

```
┌─────────────────────────────────────────────────────┐
│ ⧉ Worktrees                                    [4] │
├─────────────────────────────────────────────────────┤
│ Cursor 1: AuthController                        ●  │
│ ~/.cursor/worktrees/abc123                         │
│ abc123 · +42 -17 · 3 files                         │
│                                                    │
│ Cursor 2: DocsUpdate                               │
│ ~/.cursor/worktrees/def456                         │
│ def456 · clean                                     │
│                                                    │
│ Claude 1: login-fix                                │
│ ~/.claude/worktrees/ghi789                         │
│ ghi789 · +8 -2 · 1 file                            │
└────────────────────────────────────────────────────┘
```

## Focus Mode Detail Panel

When a worktree is selected:

```
┌─────────────────────────────────────────────────────┐
│ [Worktree]                                          │
│                                                     │
│ Cursor 1: AuthController                            │
│                                                     │
│ PATH                                                │
│ /Users/me/.cursor/worktrees/abc123                  │
│                                                     │
│ BRANCH           STATUS                             │
│ feature/auth     Current                            │
│                                                     │
│ CHANGES                                             │
│ 3 files · +42 -17                                   │
│                                                     │
│ ─────────────────────────────────────────────────── │
│ Double-click to checkout this worktree              │
└─────────────────────────────────────────────────────┘
```

## Performance Notes

- Worktree metadata is fetched in parallel
- Diff stats require executing git in each worktree directory
- Many worktrees (10+) may cause slight delay
- Directory mtime used for sorting by recency

