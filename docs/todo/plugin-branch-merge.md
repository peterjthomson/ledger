# Plugin Architecture Branch Merge

> **Branch**: `merge/architecture-foundation`  
> **Source**: `kaurifund/ledger` `refactor/architecture-foundation`  
> **Target**: `master`  
> **Date**: January 2, 2026  
> **Last Verified**: January 2, 2026 (commit pending)

## Overview

This document captures the analysis and merge work for integrating the architectural refactor from the `kaurifund/ledger` fork into the main Ledger codebase. The refactor introduced plugin infrastructure, SQLite database, Zustand state management, and modular services.

---

## Branch Analysis

### Divergence Assessment

| Metric | Master | Refactor |
|--------|--------|----------|
| Commits since fork | 86 | 19 |
| `lib/` files | 20 | 100 |
| `git-service.ts` lines | 4,663 | 1,224 |
| `main.ts` approach | Inline IPC handlers | Conveyor registration |
| State management | React useState | Zustand stores |
| New dependencies | — | zustand, better-sqlite3, uuid, zod |

### Common Ancestor

```
Merge base: 43810d6faf82e916a0e1101799ab55dd38bbd49e
```

---

## Merge Strategy

**Approach**: Hybrid merge — refactor infrastructure as base, master features as content.

Created a new branch from refactor, then merged master into it. For conflicts:
- **Infrastructure** (lib/data, lib/plugins, lib/services, app/stores): Retained from refactor
- **Features** (git-service, panels, app.tsx, CSS): Preferred master versions
- **IPC handlers**: Master's legacy handlers active, conveyor handlers mostly disabled

This was chosen because:
1. Master had significantly more feature commits (86 vs 19)
2. Master's changes were mostly additive features
3. Refactor's changes were structural (easier to port features onto new structure)

**Post-merge fix**: Restored master's versions of `WorktreeDetailPanel.tsx` and `WorktreeCreatePanel.tsx` which had been auto-merged with incompatible conveyor calls.

### Conflict Resolution Phases

| Phase | Files | Resolution |
|-------|-------|------------|
| 1. Simple | `.gitignore`, `CLAUDE.md`, `scripts/build/*.sh` | Keep both entries, take master's build scripts |
| 2. Dependencies | `package.json`, `package-lock.json` | Merge deps (add zustand, sqlite3, uuid to master's base) |
| 3. Types/Preload | `electron.d.ts`, `preload.ts` | Expose ALL three APIs: `electronAPI` + `conveyor` + `ledgerEvents` |
| 4. Backend | `main.ts`, `git-service.ts`, `settings-service.ts` | Take master's handlers, add refactor's DB init |
| 5. Editor Panels | 6 panel components | Take master's versions (use electronAPI) |
| 6. App/CSS | `app.tsx`, `app.css` | Take master's versions (Canvas, features) |

### Key Decisions

1. **Dual API Exposure**: Both `window.electronAPI` (legacy) and `window.conveyor` (new) are exposed in preload, enabling gradual migration.

2. **Conveyor Handlers Disabled**: To avoid duplicate IPC channel registration, conveyor handlers are commented out except `registerPluginHandlers()`. Legacy handlers take precedence.

3. **Database Active**: SQLite database initializes on startup, runs migrations, ready for use.

4. **Stub Functions Added**: Added `initializeLegacySync()` to git-service.ts and recent repo functions to settings-service.ts to satisfy conveyor handler imports.

---

## Conflict Details

### Total Conflicts: 22 files

```
.gitignore
CLAUDE.md
app/app.tsx
app/components/panels/editor/BranchDetailPanel.tsx
app/components/panels/editor/CommitCreatePanel.tsx
app/components/panels/editor/EditorRouter.tsx
app/components/panels/editor/PRDetailPanel.tsx
app/components/panels/editor/StashDetailPanel.tsx
app/styles/app.css
app/theme.ts
app/types/electron.d.ts
lib/main/git-service.ts
lib/main/main.ts
lib/main/settings-service.ts
lib/preload/preload.ts
package-lock.json
package.json
scripts/build/build-all.sh
scripts/build/build-common.sh
scripts/build/build-linux.sh
scripts/build/build-mac.sh
scripts/build/build-windows.sh
scripts/build/cleanup.sh
```

### Resolution Summary

All conflicts resolved by:
- Taking master's version for feature-complete files (git-service, app.tsx, panels)
- Merging infrastructure from refactor (database init, API exposure)
- Adding compatibility stubs where needed

---

## Functionality Comparison

### Functions Only in Master (23) — ALL PRESERVED ✅

| Category | Functions |
|----------|-----------|
| **Mailmap** | `getMailmap`, `addMailmapEntries`, `removeMailmapEntry`, `suggestMailmapEntries`, `getAuthorIdentities` |
| **Tech Tree** | `getMergedBranchTree` |
| **Contributors** | `getContributorStats` |
| **Worktree Staging** | `commitInWorktree`, `stageFileInWorktree`, `unstageFileInWorktree`, `stageAllInWorktree`, `unstageAllInWorktree`, `getFileDiffInWorktree`, `getWorktreeWorkingStatus`, `pushWorktreeBranch` |
| **Branch Ops** | `deleteBranch`, `deleteRemoteBranch` |
| **Stash** | `applyStashToBranch`, `getStashFileDiffParsed` |
| **Utilities** | `discardAllChanges`, `openPullRequest`, `getSiblingRepos`, `getWorktreePath` |

### Functions Only in Refactor (1) — NOT NEEDED

| Function | Purpose | Status |
|----------|---------|--------|
| `clearLegacyState` | Clear repo manager state | Unnecessary (repo manager inactive) |

### Components Only in Master — ALL PRESERVED ✅

- `app/components/canvas/*` — Canvas infrastructure
- `app/components/panels/list/*` — List panel components
- `app/components/panels/viz/ContributorChart.tsx`
- `app/components/panels/viz/TechTreeChart.tsx`
- `app/components/panels/editor/MailmapDetailsPanel.tsx`
- `app/components/panels/editor/RepoDetailPanel.tsx`

---

## Present State

### Branch: `merge/architecture-foundation`

**Status**: All conflicts resolved, build passes, app runs successfully.

### What's Active

| Component | Status | Notes |
|-----------|--------|-------|
| All master features | ✅ Active | Canvas, Tech Tree, Mailmap, Contributors |
| SQLite Database | ✅ Active | Migrations run on startup |
| Plugin handler registration | ✅ Active | `registerPluginHandlers()` only |
| Legacy IPC handlers | ✅ Active | All 80+ handlers working |

### What's Available but Inactive

| Component | Location | Activation Required |
|-----------|----------|---------------------|
| Zustand stores | `app/stores/*.ts` | Import in app.tsx |
| Cache Manager | `lib/data/cache-manager.ts` | Call from git-service |
| Repository Manager | `lib/repositories/*.ts` | Initialize in main.ts |
| Modular Services | `lib/services/*/*.ts` | Used by conveyor handlers |
| Conveyor Handlers | `lib/conveyor/handlers/*.ts` | Uncomment in main.ts |
| Event System | `lib/events/*.ts` | Exposed as `window.ledgerEvents` |
| Plugin examples | `lib/plugins/examples/*.ts` | Register via plugin system |

### Files Changed

```
90 files changed in merge commit
```

Including:
- New directories: `lib/data/`, `lib/events/`, `lib/plugins/`, `lib/repositories/`, `lib/services/`, `app/stores/`
- Modified: `main.ts`, `preload.ts`, `package.json`
- Preserved: All master UI components and features

---

## Build Verification

```bash
npm run vite:build:app  # ✅ Success

# Output:
# out/main/main.js     415.45 kB
# out/preload/preload.js  23.31 kB
# out/renderer/assets/index.js  1,044.43 kB
```

```bash
npm run dev  # ✅ App launches successfully

# Logs:
# [Migrations] Database is up to date
# [Database] Connected to ~/Library/Application Support/ledger/ledger.db
```

---

## QA Review (January 2, 2026)

### Validation Results

| Check | Result | Notes |
|-------|--------|-------|
| `npm run lint` | ⚠️ 7 errors, 148 warnings | React hooks, duplicate imports |
| `npm test` (Playwright) | ✅ 17 passed | All E2E tests pass |
| `npm run build:mac:arm64` | ✅ 210MB | Build + signing successful |

### Critical Issue Found & Fixed

**Problem**: Auto-merge took refactor versions of some files that use `window.conveyor.*` calls, but those handlers were disabled.

**Affected Files**:
- `WorktreeDetailPanel.tsx` — ✅ Fixed: restored master version
- `WorktreeCreatePanel.tsx` — ✅ Fixed: restored master version

**Not Affected** (orphaned components, not imported):
- `RepoSwitcher.tsx` — Future feature, not currently used
- `PluginAppContainer.tsx` — Plugin demo, not currently used
- `RepositoryManagerPanel.tsx` — Plugin example, not currently used

**Safe** (handler IS registered in app.ts):
- `WindowContext.tsx` — Uses `window.conveyor.window.*` which IS active

### API Surface Clarification

| API | Status | Used By |
|-----|--------|---------|
| `window.electronAPI` | ✅ Active (80+ handlers) | Main app (app.tsx, panels) |
| `window.conveyor.window.*` | ✅ Active | WindowContext.tsx |
| `window.conveyor.{branch,repo,worktree,...}` | ❌ Disabled | Orphaned plugin components only |
| `window.ledgerEvents` | ✅ Exposed | Not yet used |

### Data/Settings Coexistence

- **JSON settings** (`ledger-settings.json`): Primary, unchanged
- **SQLite settings table**: Exists but NOT used
- **No migration conflict**: Parallel systems, not competing

## Remaining Work

1. **Fix lint errors** — 7 errors need resolution before commit
2. **Commit the merge** — Currently staged, needs commit message
3. **Enable features incrementally** — See `plugin-branch-plan.md`
4. **Clean up** — Consider removing orphaned plugin components or enabling their handlers

---

## Appendix: Key File Locations

### New Infrastructure (from refactor)

```
lib/
├── data/
│   ├── cache-manager.ts    # TTL-based key-value cache
│   ├── database.ts         # SQLite connection management
│   ├── migrations.ts       # Schema migrations
│   ├── plugin-database.ts  # Plugin data storage
│   └── schema.ts           # Table definitions
├── events/
│   ├── event-types.ts      # LedgerEvent type definitions
│   └── main-events.ts      # Event emission from main process
├── plugins/
│   ├── plugin-manager.ts   # Plugin lifecycle management
│   ├── plugin-loader.ts    # Load plugins from disk
│   ├── plugin-hooks.ts     # Git lifecycle hooks
│   ├── plugin-types.ts     # Plugin type definitions
│   └── examples/           # Example plugin implementations
├── repositories/
│   ├── repository-context.ts   # Single repo context
│   └── repository-manager.ts   # Multi-repo management
├── services/
│   ├── branch/             # Branch operations (modular)
│   ├── commit/             # Commit operations
│   ├── pr/                 # PR operations
│   ├── staging/            # Staging operations
│   ├── stash/              # Stash operations
│   └── worktree/           # Worktree operations
└── conveyor/
    ├── api/                # Renderer-side typed API
    ├── handlers/           # Main-process handlers
    └── schemas/            # Zod validation schemas

app/
└── stores/
    ├── create-store.ts     # Zustand store factory
    ├── repository-store.ts # Git data state
    ├── ui-store.ts         # UI preferences state
    └── plugin-store.ts     # Plugin state
```

### Modified Files

```
lib/main/main.ts           # Added DB init, conveyor imports (handlers disabled)
lib/main/git-service.ts    # Added initializeLegacySync stub
lib/main/settings-service.ts  # Added recent repo functions
lib/preload/preload.ts     # Expose all three APIs
```

