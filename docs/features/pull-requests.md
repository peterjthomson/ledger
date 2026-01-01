# 🔀 Pull Requests

> GitHub PR integration via the `gh` CLI with filtering, review status, and instant checkout.

## Overview

Ledger integrates with GitHub Pull Requests through the official GitHub CLI (`gh`). View all open PRs for your repository with rich metadata including review decisions, diff stats, and comments.

## Prerequisites

```bash
# Install GitHub CLI
brew install gh

# Authenticate
gh auth login
```

## Features

### PR Information

| Field | Description |
|-------|-------------|
| **Number** | PR number (#123) |
| **Title** | PR title |
| **Author** | GitHub username |
| **Branch** | Head branch → Base branch |
| **Status** | Draft / Open |
| **Review** | Approved / Changes Requested / Review Required |
| **Changes** | +additions / -deletions |
| **Comments** | Comment count |
| **Updated** | Relative time (2d ago) |

### Filtering Options

```
┌─────────────────────────────────────┐
│ Filter:  [Open + Not Draft ▾]       │
│          • All Open                 │
│          • Open + Not Draft         │
│          • Open + Draft             │
└─────────────────────────────────────┘
```

- **All Open**: Show all open PRs
- **Open + Not Draft**: Ready for review PRs only
- **Open + Draft**: Work in progress PRs only

### Sorting Options

```
┌─────────────────────────────────────┐
│ Sort:    [Last Updated ▾]           │
│          • Last Updated             │
│          • Comments                 │
│          • First Commit             │
│          • Last Commit              │
└─────────────────────────────────────┘
```

## Data Model

Canonical types live in `app/types/electron.d.ts` (renderer-facing API contract):

- `PullRequest`
- `PullRequestsResult`

## Actions

### View Remote (Double-click)

Opens the PR on GitHub in your default browser.

### Check Out PR (Right-click → Check Out)

Checks out the PR branch using GitHub CLI:

```
User right-clicks PR #123 → "Check Out"
    │
    ├─► Auto-stash current changes (if any)
    │
    ├─► gh pr checkout 123
    │       (handles forks/remotes + creates a local tracking branch)
    │
    └─► Show success toast
```

### View Remote (Right-click → View Remote)

Opens the PR page on GitHub.

## Review Status Badges

| Badge | Meaning | Color |
|-------|---------|-------|
| `Approved` | PR has been approved | Green |
| `Changes` | Changes requested | Orange |
| `Review` | Review required | Blue |
| `draft` | PR is a draft | Gray |

## GitHub CLI Command

```bash
gh pr list --state open --json number,title,author,headRefName,baseRefName,url,createdAt,updatedAt,additions,deletions,reviewDecision,labels,isDraft,comments
```

## Error Handling

| Error | Message | Solution |
|-------|---------|----------|
| CLI not found | "GitHub CLI (gh) not installed" | Install from cli.github.com |
| Not authenticated | "Not logged in to GitHub CLI" | Run `gh auth login` |
| Not a GitHub repo | "Not a GitHub repository" | Check git remote |

## UI Locations

### Radar Mode
- **Pull Requests** column (1st column)
- Full PR list with all metadata

### Focus Mode
- **Pull Requests** section in sidebar (collapsible)
- Single-click → Shows PR info in detail panel
- Double-click → Opens PR in browser

## Visual Layout

```
┌─────────────────────────────────────────────────────┐
│ ⬡ Pull Requests                               [12] │
├─────────────────────────────────────────────────────┤
│ Add user authentication                             │
│                                      [Approved]     │
│ feature/auth → main                                 │
│ #123 · @octocat · 2d ago · 💬 5 · +142 -38          │
│                                                     │
│ Fix login redirect                    [draft]       │
│                                      [Changes]      │
│ fix/login → main                                    │
│ #124 · @dev · 1d ago · 💬 2 · +23 -8                │
│                                                     │
│ Update documentation                                │
│                                       [Review]      │
│ docs/readme → main                                  │
│ #125 · @writer · 3h ago · +45 -12                   │
└─────────────────────────────────────────────────────┘
```

## Focus Mode Detail Panel

When a PR is selected:

```
┌─────────────────────────────────────────────────────┐
│ [Pull Request]                                      │
│                                                     │
│ Add user authentication                             │
│                                                     │
│ NUMBER          AUTHOR                              │
│ #123            @octocat                            │
│                                                     │
│ BRANCH          BASE                                │
│ feature/auth    main                                │
│                                                     │
│ STATUS          UPDATED                             │
│ Open · approved 2 days ago                          │
│                                                     │
│ CHANGES         COMMENTS                            │
│ +142 -38        5                                   │
│                                                     │
│ ─────────────────────────────────────────────────── │
│ Double-click to open in browser                     │
└─────────────────────────────────────────────────────┘
```

## Context Menu

```
┌─────────────────────────┐
│ Check Out               │
│ View Remote             │
└─────────────────────────┘
```

## Performance Notes

- PRs are fetched via `gh` CLI (network dependent)
- Typical fetch time: 1-3 seconds
- Results are cached until manual refresh
- Large PR lists (50+) may take slightly longer

## Limitations

- Requires GitHub CLI (`gh`) to be installed
- Only works with GitHub repositories
- Only shows open PRs (closed/merged not displayed)
- Requires authentication via `gh auth login`

## Future Enhancements

- [ ] Show PR checks status
- [ ] GitLab/Bitbucket support

