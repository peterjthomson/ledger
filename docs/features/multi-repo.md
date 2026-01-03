# Multi-Repository Architecture

Ledger supports working with multiple repositories simultaneously. This document describes the architecture and how repository management works.

## Overview

Ledger manages repositories through a central `RepositoryManager` class that tracks all open repositories, handles switching between them, and maintains metadata about each.

```
┌─────────────────────────────────────────────────────────────────┐
│                     Repository Management                        │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              RepositoryManager (Singleton)                │   │
│  │  - contexts: Map<id, RepositoryContext>                  │   │
│  │  - pathIndex: Map<path, id>                              │   │
│  │  - activeId: string | null                               │   │
│  │  - MAX_REPOSITORIES: 12 (LRU eviction)                   │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                   │
│              ┌───────────────┼───────────────┐                  │
│              ▼               ▼               ▼                  │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐   │
│  │ RepositoryContext│ │ RepositoryContext│ │ RepositoryContext│   │
│  │ - id: uuid       │ │ - id: uuid       │ │ - id: uuid       │   │
│  │ - path: string   │ │ - path: string   │ │ - path: null     │   │
│  │ - type: 'local'  │ │ - type: 'local'  │ │ - type: 'remote' │   │
│  │ - git: SimpleGit │ │ - git: SimpleGit │ │ - remote: {...}  │   │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Key Components

### RepositoryManager (`lib/repositories/repository-manager.ts`)

The singleton manager that tracks all open repositories:

- **`open(path)`** - Opens a repository, creates context, makes it active
- **`close(id)`** - Closes a repository, selects new active if needed
- **`setActive(id)`** - Switches the active repository
- **`getActive()`** - Returns the currently active repository context
- **`getSummary()`** - Returns list of all open repos (for UI display)
- **`addRemote(context)`** - Adds a remote-only repo (API access, no local clone)

### RepositoryContext (`lib/repositories/repository-context.ts`)

Represents a single repository with:

- **id** - Unique identifier (UUID)
- **type** - `'local'` (cloned) or `'remote'` (API-only)
- **path** - Filesystem path (null for remote repos)
- **name** - Repository name (from path or remote)
- **git** - SimpleGit instance for git operations
- **metadata** - Provider, default branch, remote URL, etc.
- **remote** - GitHub owner/repo info (if applicable)
- **lastAccessed** - For LRU eviction

## IPC Architecture

Repository operations are exposed via two IPC pathways that work together:

### Primary IPC Handlers (`lib/main/main.ts`)

These handlers update both module-level state AND the RepositoryManager:

| Channel | Purpose |
|---------|---------|
| `select-repo` | Opens folder picker, adds to manager, sets as active |
| `get-repo-path` | Returns current active repo path |
| `load-saved-repo` | Loads last repo on app start, adds to manager |

### Extended API (`lib/conveyor/handlers/repo-handler.ts`)

Additional handlers for multi-repo management:

| Channel | Purpose |
|---------|---------|
| `list-repositories` | Returns all open repos from manager |
| `switch-repository` | Changes active repo by ID |
| `close-repository` | Removes repo from manager |
| `open-repository` | Opens repo by path (no dialog) |
| `connect-remote-repository` | Adds remote-only repo via GitHub API |
| `clone-repository` | Clones and opens a remote repo |
| `get-recent-repositories` | Returns recently opened paths |

## State Synchronization

The architecture maintains two state systems in sync:

1. **Module-level state** (`git-service.ts`)
   - `repoPath` variable used by all git operations
   - Updated via `setRepoPath()` / `getRepoPath()`

2. **RepositoryManager state**
   - Tracks multiple repos with metadata
   - Updated via `manager.open()` / `manager.setActive()`

Sync is maintained by:
- `initializeGlobalStateSync()` in repo-handler.ts subscribes to manager changes
- Primary IPC handlers in main.ts update both systems together

## UI Integration

### Repo Switcher (Header Chip)

The repo name chip in the header opens the Repository Manager panel:
- Shows all open repositories
- Quick switch between repos
- Open/close repos
- Connect to remote repos

### Change Button (Single Repo)

The "Change" button in the toolbar:
- Opens folder picker
- Adds repo to manager
- Sets as active

Both UI paths use the same underlying infrastructure.

## Repository Types

### Local Repositories

Standard cloned repos with full git access:
- Has filesystem path
- Full git operations available
- Can push/pull/commit

### Remote Repositories

API-only connections to GitHub repos:
- No local clone required
- View PRs, branches, commits
- Requires GitHub CLI (`gh`)
- Cannot perform local git operations

## Convergence Roadmap

The current architecture supports both single-repo and multi-repo workflows. The path to full convergence:

### Current State

- Single-repo mode: Works via module-level state, also adds to manager
- Multi-repo mode: Works via RepositoryManager, syncs to module state
- Both modes functional and synchronized

### Future Direction

1. **Deprecate module-level state**
   - Move all git operations to use `manager.getActive().git`
   - Remove `repoPath` global variable from git-service.ts

2. **Unified context passing**
   - Pass `RepositoryContext` to git operations instead of using global
   - Enable operations on non-active repos (e.g., background fetches)

3. **Per-repo state in renderer**
   - Store branch/PR/worktree data per-repo in zustand stores
   - Switch displayed data based on active repo

4. **Graceful single-repo UX**
   - When only one repo is open, hide multi-repo UI complexity
   - Auto-show repo switcher when second repo is opened

The goal: "single repo" is just the state when `manager.contexts.size === 1`, not a separate code path.

## Files Reference

| File | Purpose |
|------|---------|
| `lib/repositories/repository-manager.ts` | Singleton manager class |
| `lib/repositories/repository-context.ts` | Context factory and types |
| `lib/repositories/index.ts` | Public exports |
| `lib/conveyor/handlers/repo-handler.ts` | Extended IPC handlers |
| `lib/main/main.ts` | Primary IPC handlers |
| `app/components/plugins/example-components/RepositoryManagerPanel.tsx` | UI panel |
| `app/components/RepoSwitcher.tsx` | Header repo chip |

