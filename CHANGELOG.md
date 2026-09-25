# Changelog

All notable changes to Ledger are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.6.0] - 2026-09-25

### Added

- Find text in expanded diffs with Command/Ctrl-F, match navigation, and character-level change highlighting.
- Branch status links to the worktree where the branch is checked out.
- Explicit packaged-app smoke test via `npm run test:packaged`.

### Fixed

- Partial staging, unstaging, and discard preserve adjacent unselected changes, line order, and missing final newlines.
- Current branch and main/master stay above other branches under every sort.
- `npm run typecheck` checks all source files once and passes; production builds now require it.
- Corrected asynchronous IPC contracts, local/remote repository types, graph renderer APIs, and plugin status/refresh handling.

## [1.5.0] - 2026-07-27

### Changed

- **Dependency shotgun upgrade** (typecheck, lint, E2E, and local packaging green)
  - Electron `41` → `43.2`
  - better-sqlite3 `12` → `13`
  - tldraw `4` → `5`
  - shiki `3` → `4`
  - ts-morph `27` → `28`
  - Anthropic SDK `0.50` → `0.115`
  - electron-builder `26.0` → `26.15`
  - Many minor/patch bumps (React 19.2, Playwright 1.62, simple-git 3.36, openai, lucide, etc.)
  - Intentionally held: TypeScript `6.0` (typescript-eslint needs `<6.1`), Vite `7` (electron-vite peers), ESLint `9` (eslint-plugin-react peers)

### Fixed

- **Remote / branch list sorting** — tip dates loaded via bulk `git for-each-ref` so Last Commit reorder works; fixed simple-git last/first commit metadata parsing
- **E2E Electron launch under agent harnesses** — clear `ELECTRON_RUN_AS_NODE` in Playwright launches so Chromium flags work
- **Main window visibility** — force show/focus with fallback so the window is not left invisible

### Added

- **FileGraph Visualization** - New `file-graph` viz panel type
  - Treemap visualization showing repository code sized by line count
  - Files colored by programming language (25+ languages supported)
  - Click folders to drill down, breadcrumb navigation to go back up
  - Language legend showing line counts per language
  - Hover tooltips with file path, line count, and language
  - Respects `.gitignore` (uses `git ls-files`)
  - Available as a panel type in the Graph canvas

## [0.1.0] - 2024-12-27

### Added

- **Branch Management**
  - View all local and remote branches with metadata
  - See commit counts, last commit dates, and merge status
  - Filter: All, Local Only, Unmerged
  - Sort: Name, Last Commit, First Commit, Most Commits
  - Switch branches with double-click
  - Auto-stash uncommitted changes before switching
  - Create new branches from current HEAD
  - Push branches to remote

- **Pull Request Integration**
  - View open PRs from GitHub via `gh` CLI
  - See PR metadata (author, additions/deletions, review status)
  - Filter: All, Open (not draft), Drafts only
  - Sort: Updated, Comments, First/Last commit
  - Checkout PR branches directly
  - View PR details with inline diff viewer
  - Create new PRs from branches

- **Worktree Support**
  - List all git worktrees
  - See worktree metadata and change stats
  - Open worktree folders in Finder
  - Detect AI agent worktrees (Cursor, Claude, etc.)
  - Convert worktree changes to branches

- **Commit History**
  - View commit history with graph visualization
  - See commit details (author, date, message)
  - View file diffs for any commit
  - Reset to specific commits (soft/mixed/hard)

- **Staging & Committing**
  - View uncommitted changes
  - Stage/unstage individual files or all
  - View file diffs (staged and unstaged)
  - Commit with message and description
  - Pull current branch with conflict detection

- **Stash Management**
  - View stash list
  - Apply, pop, or drop stashes
  - View stash contents and file diffs
  - Convert stash to branch

- **User Interface**
  - Two view modes: Radar (overview) and Focus (detail)
  - Resizable sidebar panels
  - Context menus for all items
  - Status toasts for operation feedback
  - macOS native light theme
  - Custom window titlebar with controls

### Technical

- Built with Electron 37 + React 19 + TypeScript
- Git operations via `simple-git` library
- PR data via GitHub CLI (`gh`)
- E2E tests with Playwright
- Distributed as unsigned DMG for Apple Silicon

---

*This project was bootstrapped from the [electron-react-app](https://github.com/nicepkg/electron-react-app) template.*
