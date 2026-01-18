# PR Review System

> Elevating Pull Request review to first-class citizen status in the AI age.

## The Vision

### The Problem

1. **GitHub's web interface** is stuck due to organizational inertia - must account for every use case
2. **Third-party Git GUIs** treat PRs as second-class citizens or focus on non-GitHub platforms
3. **The AI age creates new needs**:
   - Distinguishing human vs AI reviews/comments
   - Consolidating similar AI comments across lines
   - Better to-do list for addressing review feedback

### The Hypothesis

PR review should be a **first-class feature** in a Git GUI, specifically designed for:
- Quick triage of review comments
- Separation of human insight from AI noise
- Actionable task lists from review feedback
- Inline code review without leaving the app

## MVP Scope

Mirror GitHub's PR review interface as closely as possible:

```
┌─────────────────────────────────────────────────────────────────────┐
│ PR #123: Add user authentication                                    │
│ feature/auth → main · @octocat · 2 days ago                        │
├──────────────┬──────────────────────────────────────────────────────┤
│ Conversation │ Files Changed (3)  │ Commits (5)                    │
├──────────────┴──────────────────────────────────────────────────────┤
│                                                                     │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ 💬 CONVERSATION                                                 │ │
│ │                                                                 │ │
│ │ ┌───────────────────────────────────────────────────────────┐   │ │
│ │ │ @reviewer · 2 hours ago                        [APPROVED] │   │ │
│ │ │ LGTM! Just one minor suggestion on line 42.               │   │ │
│ │ └───────────────────────────────────────────────────────────┘   │ │
│ │                                                                 │ │
│ │ ┌───────────────────────────────────────────────────────────┐   │ │
│ │ │ @copilot-bot · 1 hour ago                                 │   │ │
│ │ │ Consider adding error handling for the auth callback.     │   │ │
│ │ └───────────────────────────────────────────────────────────┘   │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ 📄 FILES CHANGED                                                │ │
│ │                                                                 │ │
│ │ src/auth/handler.ts                              +42 -8   💬 2  │ │
│ │ src/auth/types.ts                                +15 -0         │ │
│ │ tests/auth.test.ts                               +38 -0         │ │
│ └─────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

## Data Sources

### GitHub CLI (`gh`)

```bash
# Get PR details with all review data
gh pr view <number> --json \
  number,title,body,author,state,reviewDecision,\
  comments,reviews,files,commits,additions,deletions,\
  createdAt,updatedAt,baseRefName,headRefName,url

# Get line-specific review comments (requires API)
gh api /repos/{owner}/{repo}/pulls/{number}/comments
```

### Data Types

Canonical types live in `app/types/electron.d.ts`:

- `PRDetail` - Full PR data including reviews, comments, files, commits
- `PRReviewComment` - Line-specific review comment
- `PRFile` - Changed file with stats

## MVP Implementation Plan

### Phase 1: PR Detail View

1. **Select PR** from existing PR list
2. **Fetch full PR data** via `gh pr view --json`
3. **Display tabs**:
   - Conversation (comments + reviews)
   - Files Changed
   - Commits

### Phase 2: File Diff with Comments

1. **Fetch file diff** for selected file
2. **Fetch review comments** via `gh api`
3. **Render inline comments** on diff lines
4. **Show comment threads** with replies

### Phase 3: Add Comments (Future)

1. Click line to add comment
2. Submit review (Approve/Request Changes/Comment)
3. Reply to existing comments

## UI Components

### PRDetailPanel (Main Container)

```
┌─────────────────────────────────────────────────────────────────────┐
│ ← Back to PRs                                                       │
├─────────────────────────────────────────────────────────────────────┤
│ PR #123: Add user authentication                         [APPROVED] │
│ feature/auth → main                                                 │
│ @octocat · 2 days ago · +95 -8 · 3 files                           │
├──────────────┬──────────────────┬───────────────────────────────────┤
│ Conversation │ Files Changed(3) │ Commits(5)                        │
└──────────────┴──────────────────┴───────────────────────────────────┘
```

### ConversationTab

- List of comments and reviews in chronological order
- Review state badges (Approved, Changes Requested)
- Expandable comment bodies

### FilesTab

- File list with stats
- Click file → shows diff with inline comments
- Comment count per file

### DiffWithComments

- Unified diff view
- Inline comment threads
- "View on GitHub" link

## API

Canonical API surface is in `app/types/electron.d.ts` (renderer-facing `ElectronAPI`).

Implemented:
- `getPRDetail(prNumber)` - Full PR data
- `getPRReviewComments(prNumber)` - Line-specific comments
- `getPRFileDiff(prNumber, filePath)` - Raw diff
- `getPRFileDiffParsed(prNumber, filePath)` - Parsed diff with hunks
- `commentOnPR(prNumber, body)` - Add general comment
- `mergePR(prNumber, mergeMethod)` - Merge PR

Future:
- Add line-specific review comments
- Submit review (Approve/Request Changes)

## Future: AI-Age Features

### Comment Consolidation

Group similar AI comments:
```
┌─────────────────────────────────────────────────────────────────────┐
│ 🤖 AI Suggestions (3 similar)                              [Expand] │
│ "Consider adding error handling" on lines 42, 67, 89               │
└─────────────────────────────────────────────────────────────────────┘
```

### Review To-Do List

Extract actionable items from comments:
```
┌─────────────────────────────────────────────────────────────────────┐
│ 📋 Review Tasks                                                     │
│ ☐ Add error handling (line 42) - @reviewer                         │
│ ☐ Update types (line 15) - @copilot                                │
│ ☑ Fix typo (line 8) - @reviewer                                    │
└─────────────────────────────────────────────────────────────────────┘
```

## Implementation Order

1. ✅ Design doc (this document)
2. ✅ Add `getPRDetail()` to git-service
3. ✅ Add `getPRReviewComments()` to git-service  
4. ✅ Create `PRDetailPanel` component
5. ✅ Create `ConversationTab` component
6. ✅ Create `FilesTab` with diff view
7. ✅ Add inline comment rendering
8. 🔲 Test with real PRs

## What's Working (MVP)

- **Conversation tab**: Shows PR body, reviews, and comments chronologically
- **AI detection**: Identifies bots (copilot, vercel, dependabot, etc.) with 🤖 badge
- **AI filter**: Toggle to show/hide AI comments
- **Files tab**: Lists changed files with +/- stats and comment counts
- **File diff**: Shows raw diff for selected file
- **Inline comments**: Displays review comments on specific file lines
- **Commits tab**: Lists commits with hash, message, author, time
- **Review badges**: APPROVED, CHANGES_REQUESTED, COMMENTED with colors
- **GitHub link**: "Open on GitHub" button in footer

