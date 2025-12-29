# CLAUDE.md - Ledger Project Reference

## Project Overview

**Ledger** is a macOS Electron desktop application for managing Git repositories with first-class support for AI agent worktrees, Pull Requests, and Branches. It provides real-time visibility into multiple parallel coding agents (Cursor, Claude, Conductor, Gemini, Junie) working in Git worktrees.

**Core Value Proposition**: Traditional Git interfaces don't surface multi-worktree activity from AI agents. Ledger solves this by detecting agent workspaces, showing live diff stats, and providing unified branch/PR/worktree management.

**Tech Stack**: Electron 37 + React 19 + TypeScript 5 + Vite + simple-git

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Main Process (Node.js)                   │
│  lib/main/main.ts          - IPC handler registration       │
│  lib/main/git-service.ts   - All Git operations (3030 LOC)  │
│  lib/main/settings-service.ts - JSON persistence            │
│  lib/main/app.ts           - Window creation                │
└──────────────────────────┬──────────────────────────────────┘
                           │ ipcMain.handle() / ipcRenderer.invoke()
┌──────────────────────────┴──────────────────────────────────┐
│                   Preload Script (Bridge)                   │
│  lib/preload/preload.ts - contextBridge.exposeInMainWorld   │
└──────────────────────────┬──────────────────────────────────┘
                           │ window.electronAPI
┌──────────────────────────┴──────────────────────────────────┐
│                 Renderer Process (React)                    │
│  app/app.tsx              - Main component (~4000 LOC)      │
│  app/renderer.tsx         - React mount point               │
│  app/components/          - UI components                   │
│  app/styles/app.css       - Styling with CSS variables      │
└─────────────────────────────────────────────────────────────┘
```

**IPC Pattern**: All async via `ipcMain.handle()` ↔ `ipcRenderer.invoke()`. Kebab-case channels. Standard response: `{ success: boolean, message: string }`.

---

## File Structure

```
ledger/
├── app/                              # Renderer (React UI)
│   ├── app.tsx                       # Main React component (state, UI logic)
│   ├── renderer.tsx                  # React entry, mounts to #app
│   ├── components/
│   │   ├── panels/editor/            # Detail panels (Branch, PR, Worktree, Commit, Stash)
│   │   ├── panels/viz/               # GitGraphPanel.tsx (commit visualization)
│   │   ├── window/                   # TitleBar.tsx, WindowControls.tsx
│   │   └── ui/                       # Basic primitives (button, input, scroll-area)
│   ├── styles/app.css                # All CSS (~1800 LOC, CSS variables for theming)
│   ├── hooks/use-conveyor.ts         # Advanced IPC hook
│   └── types/electron.d.ts           # Window.electronAPI type declarations
│
├── lib/                              # Main Process
│   ├── main/
│   │   ├── main.ts                   # IPC handlers (70+ channels)
│   │   ├── git-service.ts            # Git operations via simple-git
│   │   ├── settings-service.ts       # Read/write ~/Library/App Support/ledger/
│   │   ├── app.ts                    # BrowserWindow config
│   │   └── protocols.ts              # Custom URL protocols
│   ├── preload/preload.ts            # contextBridge exposure
│   ├── conveyor/                     # Advanced typed IPC (Zod schemas)
│   │   ├── api/                      # API definitions
│   │   ├── handlers/                 # Handler implementations
│   │   └── schemas/                  # Zod validation schemas
│   └── utils.ts                      # Shell command utilities
│
├── docs/
│   ├── architecture.md               # Detailed architecture docs
│   ├── dependencies.md               # Dependency explanations
│   ├── roadmap.md                    # Future plans
│   └── features/                     # Feature docs (worktrees, PRs, branches)
│
├── tests/                            # Playwright E2E tests
├── resources/themes/                 # Built-in VS Code themes
├── electron.vite.config.ts           # Vite build config
├── electron-builder.yml              # Packaging (macOS arm64/x64)
└── package.json                      # Scripts, dependencies
```

---

## Core Interfaces

### Branch
```typescript
interface Branch {
  name: string
  current: boolean
  commit: string           // SHA
  label: string            // Display name
  isRemote: boolean
  lastCommitDate?: string
  firstCommitDate?: string
  commitCount?: number
  isLocalOnly?: boolean
  isMerged?: boolean
}
```

### Worktree
```typescript
interface Worktree {
  path: string
  head: string             // Commit SHA
  branch: string | null
  bare: boolean
  agent: 'cursor' | 'claude' | 'conductor' | 'gemini' | 'junie' | 'unknown'
  agentIndex: number
  contextHint: string      // Inferred context from path
  displayName: string
  changedFileCount: number
  additions: number
  deletions: number
  lastModified: string     // ISO date
  activityStatus: 'active' | 'recent' | 'stale' | 'unknown'
  agentTaskHint: string | null
}
```

### PullRequest
```typescript
interface PullRequest {
  number: number
  title: string
  author: string
  branch: string
  baseBranch: string
  url: string
  createdAt: string
  updatedAt: string
  additions: number
  deletions: number
  reviewDecision: 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | null
  labels: string[]
  isDraft: boolean
  comments: number
}
```

### Commit / GraphCommit
```typescript
interface Commit {
  hash: string
  shortHash: string
  message: string
  author: string
  date: string
  isMerge: boolean
  filesChanged?: number
  additions?: number
  deletions?: number
}

interface GraphCommit extends Commit {
  parents: string[]
  refs: string[]
}
```

### Diff Types
```typescript
interface StagingFileDiff {
  filePath: string
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'untracked'
  hunks: StagingDiffHunk[]
  isBinary: boolean
  additions: number
  deletions: number
}

interface StagingDiffHunk {
  header: string
  lines: StagingDiffLine[]
}

interface StagingDiffLine {
  type: 'add' | 'remove' | 'context'
  content: string
  oldLineNumber?: number
  newLineNumber?: number
}
```

---

## IPC API Reference (70+ Channels)

### Repository
| Channel | Parameters | Returns | Description |
|---------|------------|---------|-------------|
| `select-repo` | - | `{ path, branches }` | Open folder dialog, select repo |
| `get-repo-path` | - | `string \| null` | Current repo path |
| `load-saved-repo` | - | `{ path, branches }` | Load last opened repo |

### Branches
| Channel | Parameters | Returns | Description |
|---------|------------|---------|-------------|
| `get-branches` | - | `Branch[]` | All branches with full metadata |
| `get-branches-basic` | - | `Branch[]` | Branches without expensive stats |
| `get-branches-with-metadata` | `branches: string[]` | `Branch[]` | Add metadata to specific branches |
| `checkout-branch` | `branch: string` | `{ success, message }` | Checkout local branch |
| `checkout-remote-branch` | `remoteBranch: string` | `{ success, message }` | Checkout + track remote |
| `create-branch` | `name: string` | `{ success, message }` | Create new branch |
| `push-branch` | `branch: string` | `{ success, message }` | Push to remote |
| `delete-branch` | `branch: string` | `{ success, message }` | Delete local branch |

### Worktrees
| Channel | Parameters | Returns | Description |
|---------|------------|---------|-------------|
| `get-worktrees` | - | `Worktree[]` | All worktrees with agent detection |
| `open-worktree` | `path: string, app: string` | `{ success }` | Open in Cursor/VSCode |
| `create-worktree` | `branch, path` | `{ success, message }` | Create new worktree |
| `remove-worktree` | `path: string` | `{ success, message }` | Remove worktree |
| `convert-worktree-to-branch` | `path, branchName` | `{ success, message }` | Detached → branch |
| `apply-worktree-changes` | `path: string` | `{ success, message }` | Copy changes to main |

### Pull Requests (requires `gh` CLI)
| Channel | Parameters | Returns | Description |
|---------|------------|---------|-------------|
| `get-pull-requests` | - | `PullRequest[]` | List all PRs |
| `open-pull-request` | `number: number` | `{ success }` | Open PR in browser |
| `create-pull-request` | `title, body, base, head, draft` | `{ success, url }` | Create PR |
| `checkout-pr-branch` | `number: number` | `{ success, message }` | Checkout PR locally |
| `get-pr-detail` | `number: number` | `PRDetail` | Full PR info |
| `get-pr-review-comments` | `number: number` | `Comment[]` | Review comments |
| `get-pr-file-diff` | `number, filename` | `Diff` | File diff in PR |
| `merge-pr` | `number, method` | `{ success, message }` | Merge with method |
| `comment-on-pr` | `number, body` | `{ success, message }` | Add comment |
| `approve-pr` | `number: number` | `{ success, message }` | Approve PR |

### Commits
| Channel | Parameters | Returns | Description |
|---------|------------|---------|-------------|
| `get-commit-history` | `branch?, limit?` | `Commit[]` | Commit log |
| `get-commit-graph-history` | `limit?` | `GraphCommit[]` | For git graph viz |
| `get-commit-diff` | `hash: string` | `FileDiff[]` | Commit changes |
| `get-branch-diff` | `branch: string` | `FileDiff[]` | Branch vs main diff |
| `reset-to-commit` | `hash, mode` | `{ success, message }` | Reset HEAD |
| `commit-changes` | `message, description?` | `{ success, message }` | Create commit |
| `pull-current-branch` | - | `{ success, message }` | Pull with auto-stash |

### Staging
| Channel | Parameters | Returns | Description |
|---------|------------|---------|-------------|
| `get-staging-status` | - | `StagingStatus` | Staged/unstaged files |
| `get-file-diff` | `file, staged?` | `StagingFileDiff` | File diff |
| `stage-file` | `file: string` | `{ success }` | Stage file |
| `unstage-file` | `file: string` | `{ success }` | Unstage file |
| `stage-all` | - | `{ success }` | Stage all |
| `unstage-all` | - | `{ success }` | Unstage all |
| `discard-file-changes` | `file: string` | `{ success }` | Discard changes |

### Stashes
| Channel | Parameters | Returns | Description |
|---------|------------|---------|-------------|
| `get-stashes` | - | `Stash[]` | List stashes |
| `get-stash-files` | `index: number` | `string[]` | Files in stash |
| `get-stash-file-diff` | `index, file` | `Diff` | Stash file diff |
| `apply-stash` | `index: number` | `{ success, message }` | Apply stash |
| `pop-stash` | `index: number` | `{ success, message }` | Pop stash |
| `drop-stash` | `index: number` | `{ success, message }` | Drop stash |
| `stash-to-branch` | `index, branchName` | `{ success, message }` | Stash → branch |

### Themes
| Channel | Parameters | Returns | Description |
|---------|------------|---------|-------------|
| `get-theme-mode` | - | `string` | Current theme mode |
| `set-theme-mode` | `mode: string` | `{ success }` | Set theme |
| `get-system-theme` | - | `'light' \| 'dark'` | OS preference |
| `load-vscode-theme` | - | `Theme` | Load custom .json |
| `load-built-in-theme` | `name: string` | `Theme` | Load bundled theme |

---

## Key Methods (git-service.ts)

### Branch Operations
```typescript
getBranches(): Promise<Branch[]>              // Full metadata (slow)
getBranchesBasic(): Promise<Branch[]>         // Names only (fast)
getBranchMetadata(name): Promise<BranchMeta>  // Stats for one branch
checkoutBranch(name): Promise<Result>         // Auto-stash if dirty
```

### Worktree Operations
```typescript
getWorktrees(): Promise<Worktree[]>           // With agent detection
detectAgent(path): AgentInfo                  // Parse path for agent type
getWorktreeDiffStats(path): DiffStats         // additions/deletions
```

### PR Operations (via `gh` CLI)
```typescript
getPullRequests(): Promise<PullRequest[]>     // gh pr list --json
getPRDetail(number): Promise<PRDetail>        // gh pr view --json
mergePR(number, method): Promise<Result>      // gh pr merge
createPullRequest(opts): Promise<{url}>       // gh pr create
```

### Commit Operations
```typescript
getCommitHistory(branch?, limit?): Promise<Commit[]>
getCommitGraphHistory(limit?): Promise<GraphCommit[]>  // For visualization
commitChanges(msg, desc?): Promise<Result>
resetToCommit(hash, mode): Promise<Result>    // soft/mixed/hard
```

---

## Build & Development

### Commands
```bash
npm run dev                    # Development with HMR
npm run lint                   # ESLint
npm run format                 # Prettier
npm test                       # Playwright E2E (builds first)
npm run test:headed            # E2E with visible browser
npm run build:mac:arm64        # Build Apple Silicon
npm run build:mac:x64          # Build Intel
npm run build:mac:universal    # Build both
npm run release                # Build + Sign + Notarize + Publish
```

### Configuration Files
- `electron.vite.config.ts` - Vite config for main/preload/renderer
- `electron-builder.yml` - macOS packaging, code signing
- `tsconfig.json` - TypeScript strict mode
- `playwright.config.ts` - E2E test setup

### Path Aliases
```typescript
@/app/*     → app/*
@/lib/*     → lib/*
@/resources → resources/
```

---

## Design Patterns

### State Management
- React hooks only (useState, useMemo, useCallback, useEffect)
- No Redux/Zustand - local state in app.tsx
- Derived state via useMemo for filtering/sorting

### IPC Error Handling
```typescript
// Main process handler pattern
ipcMain.handle('channel-name', async (_event, args) => {
  try {
    const result = await gitService.operation(args)
    return { success: true, data: result }
  } catch (error) {
    return { success: false, message: error.message }
  }
})
```

### Agent Detection
```typescript
// Path patterns for AI agent worktrees
const agentPatterns = {
  cursor: /cursor[-_]?(\d+)?/i,
  claude: /claude[-_]?(\d+)?/i,
  conductor: /conductor[-_]?(\d+)?/i,
  gemini: /gemini[-_]?(\d+)?/i,
  junie: /junie[-_]?(\d+)?/i
}
```

### Theming
- CSS custom properties (--bg-primary, --text-primary, etc.)
- VS Code theme JSON → CSS variable mapping
- Modes: light, dark, system, custom

---

## Data Persistence

**Settings Location**: `~/Library/Application Support/ledger/ledger-settings.json`

```json
{
  "lastRepoPath": "/path/to/repo",
  "themeMode": "light|dark|system|custom",
  "customTheme": { /* VS Code theme object */ }
}
```

**No Database**: All Git data is ephemeral, loaded on refresh via git commands.

---

## External Dependencies

### Required
- `git` - Core Git operations
- `gh` (GitHub CLI) - PR integration (optional but needed for PRs)

### Key Runtime
- `electron` (37.x) - Desktop framework
- `simple-git` (3.x) - Git command wrapper
- `react` (19.x) - UI
- `zod` (4.x) - Schema validation

### Key Dev
- `electron-vite` (4.x) - Build tool
- `electron-builder` (26.x) - Packaging
- `@playwright/test` (1.x) - E2E testing

---

## Known Issues & Improvement Areas

1. **Large files**: `app.tsx` (~4000 LOC) and `git-service.ts` (~3030 LOC) could be split
2. **No loading skeletons**: Just "Loading..." text
3. **No keyboard shortcuts**: Planned but not implemented
4. **macOS only**: No Windows/Linux support
5. **PR requires gh**: No fallback for GitHub API
6. **ESLint exhaustive-deps**: Some intentionally disabled

---

## UI Modes

### Radar Mode
- Multi-column layout (Branches, PRs, Worktrees, Commits, Stashes)
- Drag-and-drop column reordering
- Each column independently scrollable

### Focus Mode
- Sidebar + detail panel layout
- Resizable sidebar (drag handle)
- Single-panel focus workflow

---

## Quick Reference

| Task | Location |
|------|----------|
| Add IPC handler | `lib/main/main.ts` |
| Add Git operation | `lib/main/git-service.ts` |
| Add UI component | `app/components/` |
| Add panel | `app/components/panels/editor/` |
| Add styles | `app/styles/app.css` |
| Add type declaration | `app/types/electron.d.ts` |
| Configure build | `electron.vite.config.ts` |
| Add E2E test | `tests/` |

---

## Testing

```bash
# Run all tests
npm test

# Run with visible browser
npm run test:headed

# Run specific test file
npx playwright test tests/app.spec.ts
```

Test files: `tests/*.spec.ts`
Config: `playwright.config.ts`
