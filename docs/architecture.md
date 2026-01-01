# Architecture

Ledger is an Electron application built with React. It follows the standard Electron architecture with main and renderer processes.

## Process Model

```
┌─────────────────────────────────────────────────────────────┐
│                     Main Process                             │
│  ┌─────────────────┐  ┌─────────────────┐                   │
│  │  main.ts        │  │  git-service.ts │                   │
│  │  (app lifecycle)│  │  (git commands) │                   │
│  └────────┬────────┘  └────────┬────────┘                   │
│           │                    │                             │
│  ┌────────┴────────────────────┴────────┐                   │
│  │         settings-service.ts          │                   │
│  │         (persistent storage)         │                   │
│  └──────────────────────────────────────┘                   │
└─────────────────────┬───────────────────────────────────────┘
                      │ IPC (ipcMain/ipcRenderer)
┌─────────────────────┴───────────────────────────────────────┐
│                   Preload Script                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  preload.ts - exposes electronAPI to renderer        │   │
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
│   ├── styles/            # CSS styles
│   │   └── app.css        # Main stylesheet
│   └── types/             # TypeScript declarations
│       └── electron.d.ts  # ElectronAPI types
│
├── lib/                    # Main process code
│   ├── main/
│   │   ├── main.ts        # App entry, IPC handlers
│   │   ├── app.ts         # Window creation
│   │   ├── git-service.ts # Git operations
│   │   └── settings-service.ts # Persistent settings
│   └── preload/
│       └── preload.ts     # Context bridge
│
├── tests/                  # Playwright E2E tests
│   └── app.spec.ts
│
├── out/                    # Build output (generated)
├── dist/                   # Distribution files (generated)
└── resources/              # Build resources (icons, etc.)
```

## Key Files

### Main Process

| File | Purpose |
|------|---------|
| `lib/main/main.ts` | App lifecycle, IPC handler registration |
| `lib/main/git-service.ts` | All git operations via `simple-git` |
| `lib/main/settings-service.ts` | Read/write settings to disk |
| `lib/main/app.ts` | BrowserWindow creation and config |

### Renderer Process

| File | Purpose |
|------|---------|
| `app/app.tsx` | Main React component, all UI logic |
| `app/styles/app.css` | All styling (CSS variables for theming) |
| `app/types/electron.d.ts` | TypeScript types for IPC API |

### Preload

| File | Purpose |
|------|---------|
| `lib/preload/preload.ts` | Exposes `window.electronAPI` safely |

## Data Flow

1. **User selects repo** → `selectRepo()` → IPC → `dialog.showOpenDialog()` → saves path
2. **App loads** → `loadSavedRepo()` → IPC → reads settings → `setRepoPath()`
3. **Refresh** → `refresh()` → parallel IPC calls:
   - `getBranchesWithMetadata()` → git branch + metadata
   - `getWorktrees()` → git worktree list
   - `getPullRequests()` → gh CLI
4. **User action** (double-click, context menu) → IPC → git operation → refresh

## IPC API

All IPC is via `ipcMain.handle` / `ipcRenderer.invoke` (async request/response).

**Canonical source of truth:** `app/types/electron.d.ts` defines the renderer-facing `window.electronAPI` contract (method names + return types). `lib/preload/preload.ts` maps those methods to IPC channels, and `lib/main/main.ts` implements the handlers.

Because the IPC surface evolves frequently (staging, stashes, PR review, themes, canvases, etc.), this doc intentionally does **not** attempt to keep an exhaustive channel list in sync. If you need to add/verify an API:

1. Update `app/types/electron.d.ts`
2. Update `lib/preload/preload.ts`
3. Update `lib/main/main.ts`
4. Implement logic in `lib/main/git-service.ts` / `lib/main/settings-service.ts`

## State Management

The app uses React's built-in state management:

- `useState` for simple state (repoPath, branches, loading, etc.)
- `useMemo` for derived state (filtered/sorted branches)
- `useCallback` for memoized handlers
- `useEffect` for side effects (load repo on mount, auto-dismiss toasts)

No external state library is used - the app is simple enough that React's built-in hooks suffice.

