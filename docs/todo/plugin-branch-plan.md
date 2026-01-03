# Plugin Architecture: Post-Merge Plan

> **Branch**: `merge/architecture-foundation`  
> **Status**: Merged, ready for incremental activation  
> **Date**: January 2, 2026

## Executive Summary

The merge has successfully integrated infrastructure for plugins, caching, and state management without breaking any existing functionality. This document outlines the plan to incrementally activate these capabilities.

### Current Status (Jan 2, 2026)
- Conveyor handlers are **registered and active** in `lib/main/main.ts`. The renderer still calls the electronAPI surface; both stacks run, with channel de-dupe preventing conflicts.
- Lint now passes with relaxed rules (exhaustive-deps disabled, no-console allowed, unused-var warnings disabled in plugin/example code).
- Tests: `npm test` (Playwright) ✅. Packaging build not re-run in this pass.
- UI: no separate app-level nav rail; view toggle remains in the header (Radar/Focus/Graph).

---

## What's Now Possible

### 1. SQLite Caching (Database Active ✅)

The database is already running. We can immediately use it to cache expensive operations.

**Potential Impact:**
- Branch metadata loading: 3-5s → <500ms
- Commit graph rendering: 2-3s → instant (cached)
- PR list fetching: 1-2s → instant (stale-while-revalidate)

### 2. Zustand State Management (Files Present 🟡)

Stores are ready but not imported. Benefits:
- Cleaner `app.tsx` (currently 1,543 lines)
- UI preferences persist across restarts
- Selective re-rendering (performance)
- Cross-component state without prop drilling

### 3. Plugin System (Handler Active 🟡)

The plugin infrastructure is in place:
- Plugin manager for lifecycle
- Hook system for git operations
- Storage for plugin data
- Example plugins for reference

### 4. Multi-Repository Support (Available 🟡)

Repository manager can track multiple repos:
- Quick switching between repos
- Recent repos list with metadata
- Epoch-based stale detection for async safety

### 5. Event System (Exposed 🟡)

Git lifecycle events available via `window.ledgerEvents`:
- Subscribe to checkout, commit, push, pull
- Build reactive UI features
- Enable plugin hooks

---

## Implementation Roadmap

### Phase 1: Quick Wins (1-2 hours each)

#### 1.1 Branch Metadata Caching

**Goal**: Make "Loading branches..." near-instant on repeat views.

**Current Pain**: `getBranches()` runs 3 git commands per branch:
```typescript
git.log([branch, '-1'])           // last commit
git.raw(['log', '--reverse', '-1'])  // first commit  
git.raw(['rev-list', '--count'])     // commit count
```

For 50 branches = 150 git calls = 3-5 seconds.

**Solution**: Use CacheManager with 5-minute TTL.

```typescript
// lib/main/branch-cache.ts
import { CacheManager } from '@/lib/data/cache-manager'

const branchCache = new CacheManager({ 
  namespace: 'branch-metadata',
  ttl: 5 * 60 * 1000  // 5 minutes
})

export async function getBranchMetadataCached(
  branchName: string
): Promise<BranchMetadata> {
  const cached = branchCache.get(branchName)
  if (cached) return JSON.parse(cached)
  
  const metadata = await getBranchMetadataFromGit(branchName)
  branchCache.set(branchName, JSON.stringify(metadata))
  return metadata
}
```

**Cache Invalidation**: Clear on checkout, push, or pull.

---

#### 1.2 UI State Persistence

**Goal**: Theme, sidebar width, filter preferences survive app restart.

**Current Pain**: Preferences reset on every launch.

**Solution**: Enable `useUIStore` with localStorage persistence.

```typescript
// app/app.tsx - Replace useState calls
import { useUIStore } from './stores/ui-store'

// Before (30+ useState calls):
const [themeMode, setThemeMode] = useState<ThemeMode>('light')
const [sidebarWidth, setSidebarWidth] = useState(280)
// ...

// After (single store):
const {
  themeMode, setThemeMode,
  sidebarWidth, setSidebarWidth,
  // ... all 20+ UI preferences
} = useUIStore()
```

The store already has persistence built in via `createAppStore`.

---

#### 1.3 PR Data Caching (Stale-While-Revalidate)

**Goal**: Show cached PRs immediately, refresh in background.

```typescript
// Show stale data immediately
const cached = prCache.get(repoPath)
if (cached) {
  setPullRequests(JSON.parse(cached))
}

// Refresh in background
fetchPRs().then(fresh => {
  prCache.set(repoPath, JSON.stringify(fresh))
  setPullRequests(fresh)
})
```

**Result**: PR panel appears instantly, updates silently.

---

### Phase 2: Architecture Improvements (Half-day each)

#### 2.1 Repository State Store

**Goal**: Move git data from app.tsx to Zustand store.

**Scope**: Replace these useState calls:
```typescript
const [branches, setBranches] = useState<Branch[]>([])
const [worktrees, setWorktrees] = useState<Worktree[]>([])
const [pullRequests, setPullRequests] = useState<PullRequest[]>([])
const [commits, setCommits] = useState<Commit[]>([])
const [stashes, setStashes] = useState<StashEntry[]>([])
// ... etc
```

**With**:
```typescript
const { 
  branches, setBranches,
  worktrees, setWorktrees,
  // ... all git data
} = useRepositoryStore()
```

**Benefit**: Components can access state directly without prop drilling through Canvas → Column → EditorSlot → Panel.

---

#### 2.2 Commit Graph Caching

**Goal**: Cache commit graph data for instant re-render.

The `getCommitGraphHistory()` call is expensive (parses git log with stats).

```typescript
const graphCache = new CacheManager({
  namespace: `commits:${repoPath}`,
  ttl: 60 * 1000  // 1 minute
})
```

**Invalidation**: Clear on any commit, checkout, or pull.

---

### Phase 3: New Features (1-2 days each)

#### 3.1 Multi-Repository Support

**Goal**: Quick-switch between recently opened repos.

**Infrastructure Ready**:
- `RepositoryManager` tracks multiple contexts
- `repositories` table stores recent repos with metadata
- `RepoSwitcher` component exists in both branches

**Implementation**:
1. Initialize RepositoryManager in main.ts
2. Store repo switches in database
3. Build "Recent Repos" dropdown in titlebar
4. Show repo stats (branches, uncommitted changes)

---

#### 3.2 First Plugin: Auto-Fetch

**Goal**: Background git fetch every 5 minutes.

```typescript
// lib/plugins/examples/auto-fetch-service.ts
const autoFetchPlugin: ServicePlugin = {
  id: 'ledger.auto-fetch',
  name: 'Auto Fetch',
  type: 'service',
  
  async activate(context) {
    const interval = setInterval(async () => {
      await context.git.fetch()
      context.logger.info('Background fetch completed')
    }, 5 * 60 * 1000)
    
    context.subscriptions.add(() => clearInterval(interval))
  }
}
```

This demonstrates the plugin system works and provides immediate value.

---

#### 3.3 Git Lifecycle Hooks

**Goal**: Enable plugins to hook into git operations.

```typescript
// Before checkout
const canProceed = await beforeCheckout(branchName)
if (!canProceed) return

// Perform checkout
await git.checkout(branchName)

// After checkout
await afterCheckout(branchName)
```

**Use Cases**:
- Auto npm install when package.json changes
- Conventional commit enforcement
- Pre-push test runner
- Slack notifications

---

### Phase 4: Conveyor Migration (High Effort, Pending Decision)

**Goal**: Move renderer IPC to conveyor for typed, validated calls.

**Current state**:
- Conveyor handlers are active; renderer still uses electronAPI calls.
- Dual stacks run; safe due to channel de-dupe, but adds surface area.

**Prereqs**:
1. Parity audit: ensure conveyor covers branches, worktrees, PRs, staging, mailmap, canvas/settings.
2. Fill any gaps in conveyor handlers first.

**Migration steps**:
1. Update preload/types to expose conveyor to the renderer.
2. Refactor `app/app.tsx` and panels to call conveyor APIs.
3. Remove/disable the electronAPI handler registrations in `lib/main/main.ts` for migrated domains.
4. Re-run lint/test/build.

**Risk/effort**: High; expect a large diff. Keep dual stacks only if we accept the overhead; otherwise migrate fully or disable conveyor registration.

---

## Dependencies Between Features

```
┌─────────────────────────────────────────────────────────┐
│                     FOUNDATION                          │
│  SQLite Database ✅  │  Zustand Available  │  Events   │
└─────────────────────────────────────────────────────────┘
           │                    │                  │
           ▼                    ▼                  ▼
┌──────────────────┐  ┌────────────────┐  ┌──────────────┐
│  Branch Cache    │  │  UI Store      │  │  Git Hooks   │
│  PR Cache        │  │  Repo Store    │  │              │
│  Commit Cache    │  │                │  │              │
└──────────────────┘  └────────────────┘  └──────────────┘
           │                    │                  │
           ▼                    ▼                  ▼
┌──────────────────┐  ┌────────────────┐  ┌──────────────┐
│  Instant Loads   │  │  Clean Code    │  │  Plugins     │
│  Offline View    │  │  Persistence   │  │  Extensions  │
└──────────────────┘  └────────────────┘  └──────────────┘
           │                    │                  │
           └────────────────────┼──────────────────┘
                                ▼
                   ┌────────────────────────┐
                   │   Multi-Repo Support   │
                   └────────────────────────┘
```

---

## Effort Estimates

| Task | Effort | Risk | Impact |
|------|--------|------|--------|
| Branch metadata cache | 2 hours | Low | High |
| UI state persistence | 2 hours | Low | Medium |
| PR data cache | 2 hours | Low | Medium |
| Repository state store | 4 hours | Medium | Medium |
| Commit graph cache | 2 hours | Low | Medium |
| Multi-repo support | 8 hours | Medium | High |
| Auto-fetch plugin | 4 hours | Low | Medium |
| Git lifecycle hooks | 4 hours | Medium | Medium |
| Conveyor migration | 16+ hours | High | Low |

---

## Success Metrics

### Performance
- [ ] Branch list loads in <500ms (cached)
- [ ] PR panel appears instantly (stale-while-revalidate)
- [ ] Commit graph re-renders instantly (cached)

### User Experience
- [ ] UI preferences persist across restarts
- [ ] Recent repos accessible from titlebar
- [ ] Background fetch keeps data fresh

### Code Quality
- [ ] app.tsx reduced to <800 lines
- [ ] No prop drilling through 4+ component levels
- [ ] Type-safe IPC via conveyor (optional)

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Cache serves stale data | Aggressive invalidation on git operations |
| Store migration breaks features | Incremental migration, one store at a time |
| Plugin system security | Permission model already designed |
| Multi-repo complexity | Start with read-only repo list |

---

## Recommended First Steps

1. **Merge the branch** to master (or keep as feature branch)
2. **Implement branch caching** — biggest user-visible improvement
3. **Enable UI persistence** — small change, immediate benefit
4. **Gather feedback** before larger refactors

---

## Appendix: Store Schemas

### Repository Store
```typescript
interface RepositoryState {
  repoPath: string | null
  currentBranch: string
  branches: Branch[]
  worktrees: Worktree[]
  pullRequests: PullRequest[]
  commits: Commit[]
  graphCommits: GraphCommit[]
  stashes: StashEntry[]
  workingStatus: WorkingStatus | null
  selectedCommit: GraphCommit | null
  commitDiff: CommitDiff | null
  loading: boolean
  error: string | null
}
```

### UI Store
```typescript
interface UIState {
  themeMode: ThemeMode
  viewMode: ViewMode
  sidebarWidth: number
  detailWidth: number
  sidebarVisible: boolean
  sidebarSections: SidebarSections
  localFilter: BranchFilter
  prFilter: PRFilter
  radarColumnOrder: string[]
  // ... 20+ more preferences
}
```

### Database Schema
```sql
-- Cache table
CREATE TABLE cache (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  expires_at INTEGER,
  created_at INTEGER,
  updated_at INTEGER
);

-- Recent repos
CREATE TABLE repositories (
  id INTEGER PRIMARY KEY,
  path TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  last_opened_at INTEGER,
  open_count INTEGER
);

-- Plugin storage
CREATE TABLE plugin_data (
  plugin_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  expires_at INTEGER,
  UNIQUE(plugin_id, key)
);
```

