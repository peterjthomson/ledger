# 🌿 Branches

> Complete branch management with rich metadata, filtering, and instant switching.

## Overview

Ledger provides a comprehensive view of all local and remote branches with extended metadata that standard git commands don't show at a glance. Switch branches instantly with automatic stashing of uncommitted changes.

## Features

### Branch Listing

| Property | Description |
|----------|-------------|
| **Name** | Full branch name |
| **Current** | Visual indicator for checked-out branch |
| **Commit** | Latest commit hash |
| **Last Commit Date** | When the branch was last updated |
| **First Commit Date** | When the branch was created |
| **Commit Count** | Total commits on the branch |
| **Local Only** | Branch exists only locally (not pushed) |
| **Merged** | Whether branch is merged into main/master |

### Filtering Options

```
┌─────────────────────────────────────┐
│ Filter:  [All ▾]                    │
│          • All                      │
│          • Local Only (unpushed)    │
│          • Unmerged                 │
└─────────────────────────────────────┘
```

- **All**: Show all branches
- **Local Only**: Branches that haven't been pushed to remote
- **Unmerged**: Branches not yet merged into main/master

### Sorting Options

```
┌─────────────────────────────────────┐
│ Sort:    [Name ▾]                   │
│          • Name (alphabetical)      │
│          • Last Commit              │
│          • First Commit             │
│          • Most Commits             │
└─────────────────────────────────────┘
```

## Actions

### Switch Branch (Double-click)

```
User double-clicks branch "feature/new-ui"
    │
    ├─► Check for uncommitted changes
    │       │
    │       ├─► Changes found → Auto-stash
    │       │                     │
    │       │                     └─► git stash push -m "Auto-stash..."
    │       │
    │       └─► No changes → Continue
    │
    ├─► git checkout feature/new-ui
    │
    └─► Show success toast with stash info
```

**Auto-stash**: Ledger automatically stashes uncommitted changes before switching, so you never lose work.

### Checkout Remote Branch (Double-click)

For remote branches, creates a local tracking branch:

```bash
# What Ledger does:
git checkout -b feature-x origin/feature-x
```

### View Remote (Right-click → View Remote)

Opens the branch on GitHub in your default browser.

### Pull/Fetch (Right-click → Pull)

Fetches latest changes from remote:

```bash
git fetch origin branch-name
```

## Branch Detail Panel

When you select a branch in Focus mode, the detail panel shows branch metadata and diff views.

### Diff View Tabs

| Tab | Description |
|-----|-------------|
| **PR Preview** | What the branch would contribute if merged (simulated merge) |
| **Branch Diff** | Current difference between master HEAD and branch HEAD |
| **Branch Changes** | All changes made since branch was forked from master |

**PR Preview** is the default and most useful view — it answers "does this branch have anything unique to contribute?" by simulating a merge without actually merging. See [Opinionated Git](../opinionated-git.md#pr-preview-virtual-merge) for details.

### Conflict Indicator

If PR Preview detects merge conflicts, it shows:
- ⚠️ badge with count of conflicting files
- Tooltip with file names
- Non-conflicting changes are still displayed

### Actions

| Action | Description |
|--------|-------------|
| **Checkout** | Switch to this branch (with auto-stash) |
| **Push to Origin** | Push current branch to remote |
| **Create Pull Request** | Open PR creation form |
| **View on GitHub** | Open branch on GitHub |

## Data Model

Canonical types live in `app/types/electron.d.ts` (renderer-facing API contract):

- `Branch`
- `BranchesResult`

## Git Commands Used

| Feature | Command |
|---------|---------|
| List branches | `git branch -a -v` |
| Get metadata | `git log --format=%ci -n 1 <branch>` |
| Get commit count | `git rev-list --count <branch>` |
| Check merged | `git branch --merged origin/main` |
| Checkout local | `git checkout <branch>` |
| Checkout remote | `git checkout -b <local> <remote>` |
| Stash changes | `git stash push -m "message"` |
| PR Preview (merge sim) | `git merge-tree --write-tree master branch` |
| Branch Diff | `git diff master..branch` |
| Branch Changes | `git diff master...branch` |

## UI Locations

### Radar Mode
- **Local Branches** column (4th column)
- **Remote Branches** column (5th column)

### Focus Mode
- **Branches** section in sidebar (collapsible)
- **Remotes** section in sidebar (collapsible)
- Single-click → Shows branch info in detail panel
- Double-click → Switches to branch

## Visual Indicators

| Indicator | Meaning |
|-----------|---------|
| `→` arrow | Currently checked out |
| `●` dot | Current branch |
| `local` badge | Not on remote |
| `unmerged` badge | Not merged into main |

## Example Display

```
┌─────────────────────────────────────────────────┐
│ ⎇ Local Branches                          [42] │
├─────────────────────────────────────────────────┤
│ → main                                    ●     │
│   a1b2c3d · Dec 26                              │
│                                                 │
│   feature/auth                     [local]      │
│   b2c3d4e · Dec 25 · 8 commits                  │
│                                                 │
│   bugfix/login                     [unmerged]   │
│   c3d4e5f · Dec 24 · 3 commits                  │
└─────────────────────────────────────────────────┘
```

## Performance Notes

- Branch metadata is computed in parallel for speed
- Merged status check uses `--merged` flag (fast)
- Commit counts are cached per branch
- Large repos (100+ branches) may take 2-3 seconds on first load

