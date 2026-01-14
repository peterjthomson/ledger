# 🎫 GitHub Issues

> GitHub Issues integration via the `gh` CLI with filtering, labels, milestones, and issue-branch linking.

## Overview

Ledger integrates with GitHub Issues through the official GitHub CLI (`gh`). View, create, and manage issues for your repository with rich metadata including labels, milestones, assignees, and linked branches.

## Prerequisites

```bash
# Install GitHub CLI
brew install gh

# Authenticate
gh auth login
```

---

## Research Summary: Available Affordances

### GitHub CLI (`gh issue`) Commands

| Command | Description | Use in Ledger |
|---------|-------------|---------------|
| `gh issue list` | List issues with filtering | Primary data fetch |
| `gh issue view` | View issue details | Detail panel data |
| `gh issue create` | Create new issue | Create action |
| `gh issue edit` | Edit issue metadata | Edit labels/assignees |
| `gh issue close` | Close issue | Close action |
| `gh issue reopen` | Reopen closed issue | Reopen action |
| `gh issue comment` | Add comment | Comment action |
| `gh issue develop` | Create linked branch | Branch-from-issue action |
| `gh issue status` | Personal issue status | Dashboard widget (future) |

### JSON Output Fields Available

```bash
gh issue list --json \
  number,title,state,stateReason,author,assignees,labels,milestone,\
  createdAt,updatedAt,closedAt,comments,url,body,isPinned,locked
```

| Field | Type | Description |
|-------|------|-------------|
| `number` | number | Issue number (#123) |
| `title` | string | Issue title |
| `state` | string | `OPEN` or `CLOSED` |
| `stateReason` | string | `completed`, `not_planned`, `reopened`, or null |
| `author` | object | `{ login, id, name }` |
| `assignees` | array | `[{ login, id, name }, ...]` |
| `labels` | array | `[{ name, color, description }, ...]` |
| `milestone` | object | `{ number, title, dueOn, state }` or null |
| `createdAt` | string | ISO timestamp |
| `updatedAt` | string | ISO timestamp |
| `closedAt` | string | ISO timestamp or null |
| `comments` | number | Comment count |
| `url` | string | GitHub web URL |
| `body` | string | Issue description (markdown) |
| `isPinned` | boolean | Pinned status |
| `locked` | boolean | Locked for conversation |

### Filtering & Search Capabilities

```bash
# By state
gh issue list --state open|closed|all

# By assignee
gh issue list --assignee @me
gh issue list --assignee username

# By label (can repeat)
gh issue list --label bug --label urgent

# By milestone
gh issue list --milestone "v1.0"

# By author
gh issue list --author username

# Full search syntax
gh issue list --search "is:open label:bug sort:updated-desc"
```

### simple-git Considerations

`simple-git` does not provide Issue operations—Issues are a GitHub/GitLab feature, not a Git feature. All Issue operations must go through the `gh` CLI.

### GitHub REST API (Alternative)

If needed for advanced features, the `gh api` command can access the full REST API:

```bash
# Get issue comments
gh api /repos/{owner}/{repo}/issues/{number}/comments

# Get issue events/timeline
gh api /repos/{owner}/{repo}/issues/{number}/events

# Get linked PRs
gh api /repos/{owner}/{repo}/issues/{number}/timeline
```

---

## Feature Specification

### Issue Information (List View)

| Field | Description |
|-------|-------------|
| **Number** | Issue number (#123) |
| **Title** | Issue title |
| **State** | Open / Closed (+ reason) |
| **Author** | GitHub username |
| **Assignees** | Assigned users (avatars/names) |
| **Labels** | Colored label badges |
| **Milestone** | Milestone name (if assigned) |
| **Comments** | Comment count |
| **Updated** | Relative time (2d ago) |

### Filtering Options

```
┌─────────────────────────────────────┐
│ State:     [Open ▾]                  │
│            • Open                    │
│            • Closed                  │
│            • All                     │
├─────────────────────────────────────┤
│ Assignee:  [All ▾]                   │
│            • All                     │
│            • Assigned to me          │
│            • Unassigned              │
├─────────────────────────────────────┤
│ Label:     [All ▾]                   │
│            • All                     │
│            • bug                     │
│            • enhancement             │
│            • documentation           │
│            • (dynamic from repo)     │
└─────────────────────────────────────┘
```

### Sorting Options

```
┌─────────────────────────────────────┐
│ Sort:      [Recently Updated ▾]      │
│            • Recently Updated        │
│            • Newest                  │
│            • Oldest                  │
│            • Most Comments           │
│            • Recently Closed         │
└─────────────────────────────────────┘
```

---

## Data Model

### TypeScript Interfaces

```typescript
// List-level Issue (for sidebar/lists)
interface Issue {
  number: number
  title: string
  state: 'OPEN' | 'CLOSED'
  stateReason: 'completed' | 'not_planned' | 'reopened' | null
  author: string
  assignees: string[]
  labels: IssueLabel[]
  milestone: string | null
  milestoneNumber: number | null
  comments: number
  createdAt: string
  updatedAt: string
  closedAt: string | null
  url: string
  isPinned: boolean
  locked: boolean
}

interface IssueLabel {
  name: string
  color: string  // hex without #
  description: string | null
}

// Detail-level Issue (for detail panel)
interface IssueDetail extends Issue {
  body: string  // markdown description
  commentsData: IssueComment[]
  linkedPRs: LinkedPR[]
  linkedBranches: string[]
}

interface IssueComment {
  id: number
  author: string
  body: string
  createdAt: string
  updatedAt: string
  isEdited: boolean
}

interface LinkedPR {
  number: number
  title: string
  state: 'OPEN' | 'CLOSED' | 'MERGED'
}

// Filter/Sort types
type IssueState = 'open' | 'closed' | 'all'
type IssueAssigneeFilter = 'all' | 'me' | 'unassigned'
type IssueSort = 'updated' | 'created' | 'created-asc' | 'comments'

// Result types
interface IssuesResult {
  issues: Issue[]
  error?: string
}

interface IssueOperationResult {
  success: boolean
  message: string
}
```

---

## IPC API Design

### Channels

| Channel | Parameters | Returns | Description |
|---------|------------|---------|-------------|
| `get-issues` | `state?, assignee?, label?, limit?` | `IssuesResult` | List issues with filters |
| `get-issue-detail` | `number: number` | `IssueDetail \| null` | Full issue details |
| `get-issue-comments` | `number: number` | `IssueComment[]` | Issue comments |
| `open-issue` | `number: number` | `{ success }` | Open in browser |
| `create-issue` | `title, body, labels?, assignees?` | `{ success, number, url }` | Create new issue |
| `edit-issue` | `number, title?, body?, labels?, assignees?, milestone?` | `IssueOperationResult` | Edit issue |
| `close-issue` | `number, reason?, comment?` | `IssueOperationResult` | Close issue |
| `reopen-issue` | `number, comment?` | `IssueOperationResult` | Reopen issue |
| `comment-on-issue` | `number, body` | `IssueOperationResult` | Add comment |
| `create-issue-branch` | `number, branchName?` | `{ success, branchName }` | Create linked branch |
| `get-repo-labels` | - | `IssueLabel[]` | Fetch available labels |
| `get-repo-milestones` | - | `Milestone[]` | Fetch milestones |

### Implementation Patterns

Following the PR service architecture:

```
lib/
├── services/
│   └── issue/
│       ├── issue-service.ts    # Pure functions for issue operations
│       ├── issue-types.ts      # Type definitions
│       └── index.ts            # Exports
├── conveyor/
│   ├── api/
│   │   └── issue-api.ts        # Typed API class
│   ├── handlers/
│   │   └── issue-handler.ts    # IPC handler registration
│   └── schemas/
│       └── issue-schema.ts     # Zod validation schemas
```

---

## Service Implementation

### Core Operations

```typescript
// issue-service.ts

import { safeExec } from '@/lib/utils'
import type { RepositoryContext } from '../types'

export async function getIssues(
  ctx: RepositoryContext,
  options: {
    state?: IssueState
    assignee?: string
    label?: string
    limit?: number
  } = {}
): Promise<IssuesResult> {
  const { state = 'open', assignee, label, limit = 50 } = options

  const args = [
    'issue', 'list',
    '--state', state,
    '--limit', String(limit),
    '--json', 'number,title,state,stateReason,author,assignees,labels,milestone,comments,createdAt,updatedAt,closedAt,url,isPinned,locked'
  ]

  if (assignee) args.push('--assignee', assignee)
  if (label) args.push('--label', label)

  const result = await safeExec('gh', args, { cwd: ctx.path })

  if (!result.success) {
    return { issues: [], error: mapGhError(result.stderr) }
  }

  const raw = JSON.parse(result.stdout)
  return { issues: raw.map(transformIssue) }
}

export async function getIssueDetail(
  ctx: RepositoryContext,
  issueNumber: number
): Promise<IssueDetail | null> {
  const result = await safeExec('gh', [
    'issue', 'view', String(issueNumber),
    '--json', 'number,title,body,state,stateReason,author,assignees,labels,milestone,comments,createdAt,updatedAt,closedAt,url,isPinned,locked'
  ], { cwd: ctx.path })

  if (!result.success) return null

  const issue = JSON.parse(result.stdout)

  // Fetch comments separately for full data
  const comments = await getIssueComments(ctx, issueNumber)

  return {
    ...transformIssue(issue),
    body: issue.body || '',
    commentsData: comments,
    linkedPRs: [],  // Could fetch via gh api timeline
    linkedBranches: []
  }
}

export async function createIssue(
  ctx: RepositoryContext,
  options: {
    title: string
    body?: string
    labels?: string[]
    assignees?: string[]
  }
): Promise<{ success: boolean; number?: number; url?: string; message: string }> {
  const args = ['issue', 'create', '--title', options.title]

  if (options.body) args.push('--body', options.body)
  if (options.labels?.length) {
    options.labels.forEach(l => args.push('--label', l))
  }
  if (options.assignees?.length) {
    options.assignees.forEach(a => args.push('--assignee', a))
  }

  const result = await safeExec('gh', args, { cwd: ctx.path })

  if (!result.success) {
    return { success: false, message: mapGhError(result.stderr) }
  }

  // Parse URL from stdout to extract issue number
  const url = result.stdout.trim()
  const number = parseInt(url.split('/').pop() || '0')

  return { success: true, number, url, message: 'Issue created' }
}

export async function closeIssue(
  ctx: RepositoryContext,
  issueNumber: number,
  options: { reason?: 'completed' | 'not_planned'; comment?: string } = {}
): Promise<IssueOperationResult> {
  const args = ['issue', 'close', String(issueNumber)]

  if (options.reason) args.push('--reason', options.reason)
  if (options.comment) args.push('--comment', options.comment)

  const result = await safeExec('gh', args, { cwd: ctx.path })

  return {
    success: result.success,
    message: result.success ? 'Issue closed' : mapGhError(result.stderr)
  }
}

export async function createIssueBranch(
  ctx: RepositoryContext,
  issueNumber: number,
  branchName?: string
): Promise<{ success: boolean; branchName?: string; message: string }> {
  const args = ['issue', 'develop', String(issueNumber), '--checkout']

  if (branchName) args.push('--name', branchName)

  const result = await safeExec('gh', args, { cwd: ctx.path })

  if (!result.success) {
    return { success: false, message: mapGhError(result.stderr) }
  }

  // Extract branch name from output
  const match = result.stdout.match(/Switched to.+branch '(.+)'/)
  return {
    success: true,
    branchName: match?.[1] || branchName,
    message: 'Branch created and checked out'
  }
}
```

---

## UI Components

### IssueList.tsx

```
┌─────────────────────────────────────────────────────┐
│ 🎫 Issues                                      [23] │
├─────────────────────────────────────────────────────┤
│ State: [Open ▾]  Label: [All ▾]  Sort: [Updated ▾] │
├─────────────────────────────────────────────────────┤
│ 📌 Don't prompt to save unchanged files              │
│ [bug] [good first issue]                            │
│ #4 · @peterjthomson · 2h ago · 💬 0                 │
│                                                     │
│ Add dark mode support                               │
│ [enhancement] [ui]                                  │
│ #3 · @contributor · 3d ago · 💬 12                  │
│ 👤 @maintainer                                      │
│                                                     │
│ ────────── Closed ──────────                        │
│ ✓ Fix memory leak in worker                         │
│ [bug] [completed]                                   │
│ #2 · @dev · 1w ago                                  │
└─────────────────────────────────────────────────────┘
```

### IssueDetailPanel.tsx

```
┌─────────────────────────────────────────────────────┐
│ [Issue]                              [Create Branch]│
│                                                     │
│ Don't prompt to save unchanged files                │
│                                                     │
│ NUMBER          AUTHOR            STATE             │
│ #4              @peterjthomson    Open              │
│                                                     │
│ LABELS                                              │
│ [bug] [good first issue]                            │
│                                                     │
│ MILESTONE       ASSIGNEES         CREATED           │
│ v1.0            None              2 hours ago       │
│                                                     │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│ [Description] [Comments (3)] [Linked PRs]           │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│                                                     │
│ When editing a file that hasn't been modified,      │
│ the app should not prompt to save on close.         │
│                                                     │
│ ## Steps to Reproduce                               │
│ 1. Open a file                                      │
│ 2. Don't make any changes                           │
│ 3. Close the file                                   │
│ 4. Observe: prompted to save                        │
│                                                     │
│ ─────────────────────────────────────────────────── │
│ [Close Issue ▾]  [Edit]  [View on GitHub]           │
└─────────────────────────────────────────────────────┘
```

### Visual Elements

**State Indicators:**
| State | Icon | Color |
|-------|------|-------|
| Open | `○` | Green |
| Closed (completed) | `✓` | Purple |
| Closed (not planned) | `⊘` | Gray |
| Pinned | `📌` | - |
| Locked | `🔒` | - |

**Label Badges:**
- Background: label color at 20% opacity
- Text: label color (or contrasting color)
- Border-radius: 12px
- Padding: 2px 8px

---

## Actions

### View on GitHub (Double-click)

Opens the issue in default browser.

### Create Branch (Context Menu / Button)

```
User clicks "Create Branch" on Issue #4
    │
    ├─► gh issue develop 4 --checkout
    │       (creates branch: 4-issue-title-slug)
    │
    ├─► Branch auto-linked to issue on GitHub
    │
    └─► Show success toast with branch name
```

### Close Issue (Context Menu / Button)

```
┌─────────────────────────┐
│ Close as completed      │
│ Close as not planned    │
│ ─────────────────────── │
│ Close with comment...   │
└─────────────────────────┘
```

### Edit Issue (Context Menu / Button)

Opens edit modal or navigates to GitHub.

### Add Comment (Detail Panel)

```
┌─────────────────────────────────────────────────────┐
│ Add a comment...                                    │
│                                                     │
│                                                     │
├─────────────────────────────────────────────────────┤
│                           [Cancel] [Comment ⌘↵]    │
└─────────────────────────────────────────────────────┘
```

---

## Context Menu

```
┌─────────────────────────┐
│ Create Branch           │
│ View on GitHub          │
│ ─────────────────────── │
│ Edit Issue              │
│ Add Labels...           │
│ Assign...               │
│ ─────────────────────── │
│ Close Issue           ▸ │
│ Reopen Issue            │  (if closed)
│ ─────────────────────── │
│ Copy Issue URL          │
│ Copy Issue Number       │
└─────────────────────────┘
```

---

## Integration Points

### With Branches

- Show linked issues on branch items
- "Create branch from issue" creates naming convention: `{number}-{slug}`
- Closing PR can auto-close linked issues (GitHub feature)

### With Pull Requests

- Show linked PRs in issue detail panel
- PR descriptions can reference issues: "Fixes #123"
- Cross-linking visible in both views

### With Commits

- Commits referencing issues show link
- "Fixes #123" in commit message creates linkage

### With Worktrees

- Could show "working on issue #X" if branch is linked
- Agent worktrees could display associated issues

---

## UI Locations

### Radar Mode

```
┌─────────┬─────────┬──────────┬──────────┬────────┐
│Branches │  PRs    │ Issues   │ Worktrees│ Commits│
│         │         │          │          │        │
│         │         │ #4 Bug   │          │        │
│         │         │ #3 Feat  │          │        │
│         │         │ #2 ✓     │          │        │
└─────────┴─────────┴──────────┴──────────┴────────┘
```

New draggable column alongside existing columns.

### Focus Mode

```
┌────────────────┬────────────────────────────────────┐
│ ▼ Branches (5) │                                    │
│ ▼ PRs (3)      │     [Issue Detail Panel]           │
│ ▼ Issues (23)  │                                    │
│   #4 Bug...    │     Title: Don't prompt to save... │
│   #3 Feature.. │     State: Open                    │
│   #2 ✓ Fixed.. │     Labels: [bug]                  │
│ ▼ Worktrees    │     ...                            │
│ ▼ Stashes      │                                    │
└────────────────┴────────────────────────────────────┘
```

New collapsible section in sidebar.

---

## Implementation Plan

### Phase 1: Core List & View

1. **Types & Schemas**
   - Create `issue-types.ts` with interfaces
   - Create `issue-schema.ts` with Zod schemas

2. **Service Layer**
   - Create `issue-service.ts` with `getIssues()`, `getIssueDetail()`
   - Create `issue-handler.ts` with IPC handlers

3. **UI Components**
   - Create `IssueList.tsx` component
   - Create `IssueDetailPanel.tsx` component

4. **Integration**
   - Add Issues to app.tsx state management
   - Add Issues column to Radar mode
   - Add Issues section to Focus mode sidebar

### Phase 2: Actions

5. **Basic Actions**
   - Open in browser
   - Close/Reopen issue
   - Add comment

6. **Branch Integration**
   - Create branch from issue (`gh issue develop`)
   - Show linked branches in detail

### Phase 3: Advanced Features

7. **Create & Edit**
   - Create new issue modal
   - Edit issue (labels, assignees, milestone)

8. **Filtering & Search**
   - Multi-label filtering
   - Milestone filtering
   - Full-text search

### Phase 4: Polish

9. **Cross-linking**
   - Show linked PRs
   - Show linked commits

10. **Performance**
    - Lazy-load closed issues
    - Cache labels/milestones

---

## Error Handling

| Error | Message | Solution |
|-------|---------|----------|
| CLI not found | "GitHub CLI (gh) not installed" | Install from cli.github.com |
| Not authenticated | "Not logged in to GitHub CLI" | Run `gh auth login` |
| Not a GitHub repo | "Not a GitHub repository" | Check git remote |
| Issue not found | "Issue #X not found" | Issue may have been deleted |
| Permission denied | "You don't have permission" | Check repo access |

---

## Performance Considerations

- **Initial fetch**: Limit to 50 open issues by default
- **Closed issues**: Fetch separately on demand (collapsed section)
- **Comments**: Fetch on detail panel open, not in list
- **Labels/Milestones**: Cache at repo level, refresh on explicit action
- **Polling**: No auto-refresh; user-triggered refresh only

---

## Limitations

- Requires GitHub CLI (`gh`) to be installed
- Only works with GitHub repositories (not GitLab/Bitbucket)
- Cannot assign users not in repository
- Label colors limited to GitHub's palette
- `gh issue develop` requires GitHub repository configuration

---

## Future Enhancements

- [ ] GitLab/Bitbucket support
- [ ] Issue templates integration
- [ ] Project board integration
- [ ] Issue timeline/activity view
- [ ] Batch operations (close multiple)
- [ ] Quick issue creation from context menu
- [ ] Keyboard shortcuts (n: new issue, c: close, etc.)
- [ ] Issue search with GitHub syntax

---

## Files to Create

```
lib/
├── services/
│   └── issue/
│       ├── issue-service.ts      # ~300 LOC
│       ├── issue-types.ts        # ~80 LOC
│       └── index.ts              # Exports
├── conveyor/
│   ├── api/
│   │   └── issue-api.ts          # ~50 LOC
│   ├── handlers/
│   │   └── issue-handler.ts      # ~100 LOC
│   └── schemas/
│       └── issue-schema.ts       # ~80 LOC

app/
├── components/
│   └── panels/
│       ├── list/
│       │   └── IssueList.tsx     # ~250 LOC
│       └── editor/
│           └── IssueDetailPanel.tsx  # ~400 LOC
├── types/
│   └── electron.d.ts             # Add Issue types
```

---

## References

- [GitHub CLI Issues Documentation](https://cli.github.com/manual/gh_issue)
- [GitHub REST API - Issues](https://docs.github.com/en/rest/issues)
- PR Implementation: `lib/services/pr/pr-service.ts`
- PR UI: `app/components/panels/editor/PRDetailPanel.tsx`
