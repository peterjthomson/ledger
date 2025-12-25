# AGENTS.md

This file helps AI assistants understand and work with the Ledger codebase.

## Project Overview

Ledger is a macOS desktop app for viewing git branches, worktrees, and pull requests. Built with Electron + React + TypeScript.

## Quick Facts

| Aspect | Details |
|--------|---------|
| Type | Electron desktop app |
| Platform | macOS (Apple Silicon) |
| Language | TypeScript |
| UI | React 19 + custom CSS |
| Git | `simple-git` library |
| PRs | GitHub CLI (`gh`) |
| Tests | Playwright E2E |
| Build | electron-vite + electron-builder |

## Key Files to Know

```
lib/main/main.ts         # IPC handlers, app lifecycle
lib/main/git-service.ts  # All git operations
lib/preload/preload.ts   # API exposed to renderer
app/app.tsx              # Main React component (all UI)
app/styles/app.css       # All styling
app/types/electron.d.ts  # TypeScript types for IPC
```

## Common Tasks

### Adding a new git operation

1. Add function to `lib/main/git-service.ts`
2. Add IPC handler in `lib/main/main.ts`
3. Expose in `lib/preload/preload.ts`
4. Add types to `app/types/electron.d.ts`
5. Call from `app/app.tsx`

### Adding UI elements

All UI is in `app/app.tsx`. Styling in `app/styles/app.css` uses CSS variables for theming.

### Running the app

```bash
npm run dev      # Development with hot reload
npm test         # Run E2E tests
npm run build:mac:arm64  # Build for Apple Silicon
```

## Architecture Summary

```
Main Process (Node.js)
├── main.ts - IPC handlers
├── git-service.ts - git commands via simple-git
└── settings-service.ts - persistent storage

    ↕ IPC (ipcMain.handle / ipcRenderer.invoke)

Preload Script
└── preload.ts - exposes window.electronAPI

    ↕ contextBridge

Renderer Process (Browser)
└── app.tsx - React UI, state management
```

## State Management

Uses React hooks only (no Redux/Zustand):
- `useState` for data (branches, worktrees, prs, loading states)
- `useMemo` for derived data (filtered/sorted branches)
- `useCallback` for handlers
- `useEffect` for side effects

## Styling Approach

- Custom CSS (not Tailwind, despite it being installed)
- CSS variables for colors (`--accent`, `--bg-primary`, etc.)
- Mac native light theme aesthetic
- Responsive four-column grid layout

## Testing

Playwright E2E tests in `tests/app.spec.ts`:
- Tests welcome screen (no repo)
- Tests main view (with repo via `--repo=` CLI arg)

Run with `npm test` (builds first) or `npm run test:headed`.

## Git Operations Available

| Operation | Function | Notes |
|-----------|----------|-------|
| List branches | `getBranchesWithMetadata()` | Includes commit counts, dates |
| List worktrees | `getWorktrees()` | Porcelain format |
| List PRs | `getPullRequests()` | Via `gh pr list` |
| Switch branch | `checkoutBranch()` | Auto-stashes first |
| Checkout remote | `checkoutRemoteBranch()` | Creates tracking branch |
| Checkout PR | `checkoutPRBranch()` | Fetches and checkouts |
| Open in browser | `openBranchInGitHub()` | GitHub URL |
| Fetch | `pullBranch()` | git fetch remote branch |

## Error Handling

- Git errors shown in error banner
- PR errors shown in PR column
- Operation results shown as dismissible toasts
- All IPC returns `{ success, message }` or `{ error }` pattern

## Settings Storage

JSON file at `~/Library/Application Support/ledger/ledger-settings.json`:
```json
{
  "lastRepoPath": "/path/to/repo"
}
```

## Build & Distribution

- Built DMG at `dist/Ledger-{version}-arm64.dmg`
- Published to GitHub Releases
- Currently unsigned (users must right-click → Open)

## Code Style

- Prettier for formatting
- ESLint for linting
- TypeScript strict mode
- Functional React components
- No class components

## Areas for Improvement

1. The `app.tsx` file is large (~740 lines) - could be split into components
2. No loading skeletons - just "Loading..." text
3. No keyboard shortcuts yet
4. PR integration requires `gh` CLI - could add fallback
5. Only macOS supported currently

