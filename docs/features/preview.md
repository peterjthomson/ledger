# Preview System

Extensible preview system for viewing branches, PRs, and worktrees in the browser.

## Provider Priority

```
1. laravelProvider  → Herd (.test) or artisan serve (ports)
2. railsProvider    → puma-dev (.test) or bin/dev (ports)
3. nodeProvider     → npm/yarn/pnpm run dev (ports) - LAST
```

**Why Node is last:** Laravel/Rails apps also have `package.json`, but we want the proper PHP/Ruby server, not a Node dev server.

**Future providers:**
- `pythonProvider` (Django, Flask, FastAPI)
- `goProvider` (Go HTTP servers)
- `rustProvider` (Actix, Rocket)

## Behavior Summary

- Preview actions choose the first compatible provider.
- Auto-preview creates ephemeral worktrees under `~/.ledger/previews/` when needed.
- Providers return preview URLs; the main process opens the browser.

## Smart Asset Handling

Providers that manage frontend assets (Laravel/Rails) detect frontend changes and:

- Symlink build output when there are no frontend changes.
- Build assets when frontend changes are detected or build output is missing.

## Quick Start

The `nodeProvider` works out of the box for any JS/TS project:

Click "Preview" on any branch/PR/worktree to create a worktree (if needed), run the dev server, and open the detected URL.

## Architecture

```
lib/preview/
├── index.ts              # Exports, provider initialization
├── preview-types.ts      # TypeScript interfaces
├── preview-registry.ts   # Provider registry singleton
└── providers/
    ├── laravel-provider.ts   # Laravel (Herd / artisan serve)
    ├── rails-provider.ts     # Rails (puma-dev / bin/dev)
    └── node-provider.ts      # Node.js (npm/yarn/pnpm run dev)

lib/conveyor/
├── api/preview-api.ts         # Renderer API wrapper
├── handlers/preview-handler.ts # IPC handlers
└── schemas/preview-schema.ts  # Zod schemas for IPC

app/components/panels/editor/
├── BranchDetailPanel.tsx
├── PRDetailPanel.tsx
└── WorktreeDetailPanel.tsx
```

## Built-in Providers

### nodeProvider (Fallback)

Works with any Node.js project that has a `dev` script. It symlinks `node_modules` from the main repo when needed and auto-detects URLs from server output.

### laravelProvider

For Laravel projects. Uses [Laravel Herd](https://herd.laravel.com/) when available, falls back to `php artisan serve`:

Key steps: copy `.env`, prepare dependencies, and link with Herd (or start `artisan serve`).

## Adding a Provider (Plugin)

Implement `PreviewProvider` and register it with `previewRegistry` during plugin activation.

## Renderer API (Conveyor)

Use `window.conveyor.preview.*` for preview actions:

- `getProviders(repoPath, targetPath?)`
- `autoPreviewWorktree(worktreePath, mainRepoPath)`
- `autoPreviewBranch(branchName, mainRepoPath)`
- `autoPreviewPR(prNumber, prBranchName, mainRepoPath)`
- `previewWorktree(providerId, worktreePath, mainRepoPath)`
- `previewBranch(providerId, branchName, mainRepoPath)`
- `previewPR(providerId, prNumber, prBranchName, mainRepoPath)`
- `previewCommit(providerId, commitHash, mainRepoPath)`
- `stop(providerId, worktreePath)`, `stopAll()`, `isRunning(providerId, worktreePath)`, `getUrl(providerId, worktreePath)`

### IPC Channels

| Channel | Args | Returns |
|---------|------|---------|
| `preview:check-available` | `(worktreePath)` | `PreviewAvailability` (legacy) |
| `preview:get-providers` | `(repoPath, targetPath?)` | `Provider[]` |
| `preview:worktree` | `(providerId, worktreePath, mainRepoPath)` | `PreviewResult` |
| `preview:branch` | `(providerId, branchName, mainRepoPath)` | `PreviewResult` |
| `preview:pr` | `(providerId, prNumber, prBranchName, mainRepoPath)` | `PreviewResult` |
| `preview:commit` | `(providerId, commitHash, mainRepoPath)` | `PreviewResult` |
| `preview:auto-worktree` | `(worktreePath, mainRepoPath)` | `PreviewResult` |
| `preview:auto-branch` | `(branchName, mainRepoPath)` | `PreviewResult` |
| `preview:auto-pr` | `(prNumber, prBranchName, mainRepoPath)` | `PreviewResult` |
| `preview:stop` | `(providerId, worktreePath)` | `{success, message}` |
| `preview:stop-all` | `()` | `{success, message}` |
| `preview:is-running` | `(providerId, worktreePath)` | `boolean` |
| `preview:get-url` | `(providerId, worktreePath)` | `string \| null` |

## Provider Status

| Provider | Type | Status |
|----------|------|--------|
| `laravelProvider` | Local | ✅ Implemented (Herd + artisan serve) |
| `railsProvider` | Local | ✅ Implemented (puma-dev + bin/dev) |
| `nodeProvider` | Local | ✅ Implemented (npm/yarn/pnpm/bun) |
| `pythonProvider` | Local | 📋 Planned (Django, Flask, FastAPI) |
| `goProvider` | Local | 📋 Planned |
| `dockerProvider` | Local | 📋 Planned (docker-compose) |
| `vercelProvider` | Cloud | 📋 Planned |
| `netlifyProvider` | Cloud | 📋 Planned |
