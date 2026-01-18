# Architecture

Ledger is an Electron application built with React. It follows the standard Electron architecture with main and renderer processes.

## Process Model

```
┌─────────────────────────────────────────────────────────────┐
│                     Main Process                             │
│  ┌─────────────────┐  ┌─────────────────┐                   │
│  │  main.ts        │  │  lib/services/  │                   │
│  │  (app lifecycle)│  │  (git ops)      │                   │
│  └────────┬────────┘  └────────┬────────┘                   │
│           │                    │                             │
│  ┌────────┴────────────────────┴────────┐                   │
│  │   lib/conveyor/handlers/ (IPC+Zod)   │                   │
│  └──────────────────────────────────────┘                   │
└─────────────────────┬───────────────────────────────────────┘
                      │ IPC (conveyor: typed + validated)
┌─────────────────────┴───────────────────────────────────────┐
│                   Preload Script                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  preload.ts - exposes electronAPI + conveyor         │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────┬───────────────────────────────────────┘
                      │ contextBridge
┌─────────────────────┴───────────────────────────────────────┐
│                   Renderer Process                           │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  app.tsx - React UI                                  │   │
│  │  - State management (useState, useMemo)              │   │
│  │  - Branch/Worktree/PR display                        │   │
│  │  - Filter/Sort controls                              │   │
│  │  - Context menus                                     │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
ledger/
├── app/                    # Renderer process (React)
│   ├── app.tsx            # Main React component
│   ├── components/        # UI components
│   ├── styles/            # CSS styles
│   └── types/             # TypeScript declarations
│
├── lib/                    # Main process code
│   ├── main/              # App entry, lifecycle
│   ├── services/          # Git operations (pure functions)
│   │   ├── branch/        # Branch operations
│   │   ├── commit/        # Commit operations
│   │   ├── stash/         # Stash operations
│   │   └── ...            # Other domains
│   ├── conveyor/          # Typed IPC system
│   │   ├── schemas/       # Zod validation schemas
│   │   ├── handlers/      # IPC handlers
│   │   └── api/           # Renderer-side API
│   └── preload/           # Context bridge
│
├── tests/                  # Playwright E2E tests
├── out/                    # Build output (generated)
├── dist/                   # Distribution files (generated)
└── resources/              # Build resources (icons, etc.)
```

## Key Files

### Main Process

| File | Purpose |
|------|---------|
| `lib/main/main.ts` | App lifecycle, handler registration |
| `lib/services/*` | Git operations as pure functions |
| `lib/conveyor/handlers/*` | IPC handlers with Zod validation |
| `lib/main/settings-service.ts` | Read/write settings to disk |

### Renderer Process

| File | Purpose |
|------|---------|
| `app/app.tsx` | Main React component, all UI logic |
| `app/styles/app.css` | All styling (CSS variables for theming) |
| `app/types/electron.d.ts` | TypeScript types for IPC API |

### Preload

| File | Purpose |
|------|---------|
| `lib/preload/preload.ts` | Exposes `window.electronAPI` + `window.conveyor` |

## Data Flow

1. **User selects repo** → `selectRepo()` → IPC → `dialog.showOpenDialog()` → saves path
2. **App loads** → `loadSavedRepo()` → IPC → reads settings → `setRepoPath()`
3. **Refresh** → `refresh()` → parallel IPC calls:
   - `getBranchesWithMetadata()` → git branch + metadata
   - `getWorktrees()` → git worktree list
   - `getPullRequests()` → gh CLI
4. **User action** (double-click, context menu) → IPC → git operation → refresh

## IPC API

IPC uses the **conveyor** system: typed channels with Zod validation.

**Canonical sources:**
- `lib/conveyor/schemas/` - Channel definitions with Zod schemas
- `lib/conveyor/handlers/` - Handler implementations
- `lib/conveyor/api/` - Renderer-side typed API

To add a new IPC channel:

1. Add pure function to `lib/services/` (e.g., `branch-service.ts`)
2. Add Zod schema in `lib/conveyor/schemas/`
3. Add handler in `lib/conveyor/handlers/`
4. Add API method in `lib/conveyor/api/`
5. Call via `window.conveyor.*` from renderer

## State Management

The app uses React's built-in hooks for most UI state:

- `useState` for simple state (repoPath, branches, loading, etc.)
- `useMemo` for derived state (filtered/sorted branches)
- `useCallback` for memoized handlers
- `useEffect` for side effects (load repo on mount, auto-dismiss toasts)

For shared UI concerns (active panels, plugin navigation, persisted UI preferences), a small shared store keeps multiple components in sync and supports optional persistence. This keeps local state lightweight while still allowing cross-panel coordination when needed.

