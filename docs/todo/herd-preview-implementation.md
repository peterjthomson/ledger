# Herd Preview Implementation

**Status:** ✅ Complete  
**Date:** January 2026

## Summary

Added "Preview in Browser" functionality to Ledger that uses Laravel Herd CLI to serve worktrees, branches, and PRs locally with automatic environment setup.

## Plan

Based on [Herd CLI documentation](https://herd.laravel.com/docs/macos/advanced-usage/herd-cli), implement browser preview across multiple UI contexts:

- **Existing Worktrees**: Direct Herd link + open
- **Branches**: Create worktree → setup → Herd serve
- **Pull Requests**: Create worktree from PR branch → setup → Herd serve
- **Commits**: Create detached worktree → setup → Herd serve (future)

## Tasks

### Backend

- [x] **Create `lib/main/herd-service.ts`**
  - [x] `isHerdInstalled()` - Check if Herd CLI available (cached)
  - [x] `isLaravelProject()` - Detect Laravel by `artisan` file
  - [x] `getHerdUrl()` - Derive `.test` URL from folder name
  - [x] `setupWorktreeSymlinks()` - Setup Laravel environment
  - [x] `linkWithHerd()` - Run `herd link` command
  - [x] `setupWorktreeForPreview()` - Complete preview flow
  - [x] `getPreviewWorktreePath()` - Return `~/.ledger/previews/<name>/`
  - [x] `ensurePreviewsDirectory()` - Create previews folder

- [x] **Extend `CreateWorktreeOptions`** (`git-service.ts`, `electron.d.ts`)
  - [x] Add optional `commitHash` field for detached HEAD worktrees
  - [x] Support `git worktree add --detach <path> <commit>`

- [x] **Add IPC handlers** (`main.ts`)
  - [x] `check-herd-available` - Returns `{ herdInstalled, isLaravel }`
  - [x] `open-worktree-in-browser` - For existing worktrees
  - [x] `preview-branch-in-browser` - Creates worktree + preview
  - [x] `preview-pr-in-browser` - Creates worktree from PR branch
  - [x] `preview-commit-in-browser` - Creates detached worktree

- [x] **Update preload & types** (`preload.ts`, `electron.d.ts`)
  - [x] Expose new APIs to renderer
  - [x] Add TypeScript type definitions

### Frontend

- [x] **WorktreeDetailPanel**
  - [x] Add `repoPath` prop
  - [x] Add Herd state (`herdInstalled`, `isLaravel`, `previewLoading`)
  - [x] Add effect to check Herd availability
  - [x] Add `handlePreviewInBrowser` handler
  - [x] Add "Preview in Browser" button (conditional visibility)

- [x] **BranchDetailPanel**
  - [x] Add `repoPath` prop
  - [x] Add Herd state and effect
  - [x] Add preview handler and button

- [x] **PRDetailPanel**
  - [x] Add `repoPath` and `onStatusChange` props
  - [x] Add Herd state and effect
  - [x] Add preview handler and button

- [x] **EditorRouter**
  - [x] Pass `repoPath` to WorktreeDetailPanel
  - [x] Pass `repoPath` to BranchDetailPanel

- [x] **app.tsx**
  - [x] Pass `repoPath` and `onStatusChange` to PRDetailPanel

### Bug Fixes

- [x] **Fix manifest.json error**
  - [x] Symlink `public/build/` from main repo (Vite assets)
  - [x] Symlink `node_modules/` from main repo

- [x] **Fix APP_URL issue**
  - [x] Copy `.env` instead of symlink
  - [x] Inject correct `APP_URL` for preview worktree

## Files Changed

### New Files
- `lib/main/herd-service.ts` - Herd CLI wrapper service

### Modified Files
- `lib/main/git-service.ts` - Extended `CreateWorktreeOptions`
- `lib/main/main.ts` - Added 5 IPC handlers
- `lib/preload/preload.ts` - Exposed new APIs
- `app/types/electron.d.ts` - Added type definitions
- `app/components/panels/editor/WorktreeDetailPanel.tsx` - Added preview button
- `app/components/panels/editor/BranchDetailPanel.tsx` - Added preview button
- `app/components/panels/editor/PRDetailPanel.tsx` - Added preview button
- `app/components/panels/editor/EditorRouter.tsx` - Pass repoPath props
- `app/app.tsx` - Pass props to PRDetailPanel

## Environment Setup Strategy

| Resource | Method | Reason |
|----------|--------|--------|
| `.env` | Copy + modify | Need unique `APP_URL` per preview |
| `vendor/` | Symlink | Share PHP deps, save disk space |
| `public/build/` | Symlink | Share compiled Vite assets |
| `node_modules/` | Symlink | Share Node deps |

## Future Enhancements

- [ ] Add "Clear Previews" button in settings to clean up `~/.ledger/previews/`
- [ ] Support commit previews from commit detail view
- [ ] Auto-detect and run `npm run build` if assets missing
- [ ] Support other PHP frameworks (WordPress, etc.)
- [ ] Add preview URL to toast notification (clickable)

