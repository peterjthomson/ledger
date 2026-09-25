# AGENTS.md

This file helps AI assistants understand and work with the Ledger codebase.

## Project Overview

Ledger is a macOS desktop app for viewing git branches, worktrees, and pull requests. Built with Electron + React + TypeScript.

## Quick Facts

| Aspect | Details |
|--------|---------|
| Type | Electron desktop app |
| Platform | macOS (Apple Silicon) |
| Language | TypeScript (strict mode) |
| UI | React 19 + custom CSS |
| Git | `simple-git` library |
| PRs | GitHub CLI (`gh`) |
| Tests | Playwright E2E |
| Build | electron-vite + electron-builder |

## Key Files to Know

```
lib/main/main.ts         # IPC handlers, app lifecycle
lib/services/            # Git operations as pure functions (branch, commit, stash, etc.)
lib/services/codegraph/  # Code dependency graph parsing (PHP, Ruby, TypeScript)
lib/conveyor/            # Typed IPC with Zod validation (schemas, handlers, APIs)
lib/preload/preload.ts   # API exposed to renderer
app/app.tsx              # Main React component (large)
app/styles/app.css       # All styling (large)
app/types/electron.d.ts  # TypeScript types for IPC
app/components/          # UI components (panels, canvas, window)
resources/scripts/       # External parser scripts (PHP, Ruby)
```

## Common Tasks

### Adding a new git operation

1. Add pure function to appropriate service in `lib/services/` (e.g., `branch-service.ts`)
2. Add Zod schema in `lib/conveyor/schemas/`
3. Add handler in `lib/conveyor/handlers/`
4. Add API method in `lib/conveyor/api/`
5. Call via `window.conveyor.*` from renderer

### Adding UI elements

Main UI is in `app/app.tsx`. Components are in `app/components/`:
- `panels/editor/` - Editor panels (BranchDetail, PRReview, Staging, etc.)
- `panels/viz/` - Visualization panels (GitGraph, ERD, CodeGraph)
- `panels/viz/codegraph/` - Code dependency graph visualization
- `canvas/` - Canvas layout system
- `window/` - Window chrome (Titlebar, menus)

Styling in `app/styles/app.css` uses CSS variables for theming.

### Running the app

```bash
npm run dev      # Development with hot reload
npm test         # Run E2E tests
npm run lint     # Check for linting issues
npm run typecheck # Check all TypeScript (also required before production builds)
npm run build:mac:arm64  # Build for Apple Silicon
```

## Architecture Summary

```
Main Process (Node.js)
├── main.ts - App lifecycle, handler registration
├── lib/services/ - Pure functions for git operations
├── lib/conveyor/handlers/ - IPC handlers with Zod validation
└── settings-service.ts - Persistent storage

    ↕ IPC (conveyor: typed + validated)

Preload Script
└── preload.ts - Exposes window.electronAPI + window.conveyor

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
- Responsive multi-column layout

## Testing

Playwright tests in `tests/` cover app behavior and Git operations using temporary repositories. `tests/app.spec.ts` covers:
- Tests welcome screen (no repo)
- Tests main view (with repo via `--repo=` CLI arg)

Run with `npm test` (builds first) or `npm run test:headed`. Packaged-app checks are excluded from these runs: set `LEDGER_PACKAGED_EXECUTABLE` to an absolute executable path and run `npm run test:packaged`. Missing or invalid paths fail immediately. See `CONTRIBUTING.md` for local packaging instructions.

## Chrome DevTools Protocol (CDP) Access

AI agents can interact with the running Electron app via CDP for debugging and UI interaction.

```bash
# Start with CDP enabled
npm run dev -- --remote-debugging-port=9222

# Verify available
curl -s http://127.0.0.1:9222/json
```

Helper scripts in `tools/electron-mcp-server/`:

| Script | Purpose |
|--------|---------|
| `cdp-snapshot.js` | Get page content and text |
| `cdp-screenshot.js` | Capture PNG screenshot |
| `cdp-click.js` | Click element by CSS selector |

Usage: `cd tools/electron-mcp-server && node cdp-screenshot.js`

## Git Operations Available

The canonical sources are:

- `app/types/electron.d.ts` - Renderer-facing API types
- `lib/services/` - Git operations as pure functions
- `lib/conveyor/schemas/` - IPC channel definitions with Zod validation

## Code Graph (AST Parsing)

Visualizes code dependencies as a force-directed network graph. Supports:

| Language | Parser | Notes |
|----------|--------|-------|
| PHP | `nikic/php-parser` (bundled) | Laravel-optimized (Models/Controllers/Services) |
| Ruby | Regex-based | Rails-optimized (Models/Controllers) |
| TypeScript | `ts-morph` | Full AST with tsconfig resolution |

Key files:
- `lib/services/codegraph/` - Parser service and type definitions
- `resources/scripts/php-ast-parser.php` - PHP parser (bundled with nikic/php-parser)
- `resources/scripts/ruby-ast-parser.rb` - Ruby parser (no gem dependencies)
- `app/components/panels/viz/codegraph/` - React components and D3 renderer

The parsers run zero-touch (no modifications needed to target repo). For Laravel/Rails projects, only key directories are scanned for performance. Nodes with fewer than 2 connections are filtered out.

## Error Handling

- Git errors shown in error banner
- PR errors shown in PR column
- Operation results shown as dismissible toasts
- All IPC returns `{ success, message }` or `{ error }` pattern
- Unused catch variables prefixed with `_` (e.g., `_error`)

## Settings Storage

JSON file at `~/Library/Application Support/ledger/ledger-settings.json`:
```json
{
  "lastRepoPath": "/path/to/repo"
}
```

## Build & Distribution

### Development Build
```bash
npm run build:mac:arm64  # Local installers; notarization is a separate release stage
```

### Release builds

Follow `RELEASE-PROTOCOL.md`. `npm run release:prepare` signs the app and submits
notarization without waiting; `release:package` packages the accepted, stapled
app. `npm run release` is an alias for preparation and never publishes.

`mac.notarize` stays false: notarization is an explicit, resumable release stage.
Use the existing `AC_PASSWORD` notarytool keychain profile, or override it with
`APPLE_KEYCHAIN_PROFILE`. Complete artifact verification and the native
walkthrough in `scripts/release/LOCAL-COMPUTER-USE.md` before publishing.

### Notarization Troubleshooting

⚠️ **Warning:** Apple's notarization service can be slow and unreliable. Builds may hang for 30+ minutes or even 24+ hours. The service occasionally has outages or backlogs. Proceed with patience.

**Best practices:**
- Copy build artifacts to `wip/builds/` before starting notarization (folder is gitignored)
- Run notarization separately from the main build if experiencing issues
- Don't assume a timeout means failure - check status manually

**Check notarization status:**
```bash
# List recent submissions
xcrun notarytool history --keychain-profile "AC_PASSWORD"

# Get detailed log for a submission ID
xcrun notarytool log <submission-id> --keychain-profile "AC_PASSWORD"

# Check info for a specific submission
xcrun notarytool info <submission-id> --keychain-profile "AC_PASSWORD"
```

**Common issues:**
- "In Progress" for extended periods: Apple's servers may be slow; check back later
- "Team is not yet configured for notarization": Contact Apple Developer support
- ZIP files notarize; DMGs sometimes fail: Try rebuilding or contact support

### Build Artifacts
- DMG: `dist/Ledger-{version}-arm64.dmg`
- ZIP: `dist/Ledger-{version}-arm64-mac.zip`
- Published to GitHub Releases automatically

## Code Style

- Prettier for formatting
- ESLint for linting (see `eslint.config.mjs`)
- TypeScript strict mode
- Functional React components
- No class components
- Unused variables prefixed with `_`

## Areas for Improvement

1. No loading skeletons - just "Loading..." text
2. No keyboard shortcuts yet
3. PR integration requires `gh` CLI - could add fallback
4. Only macOS supported currently

## IPC Naming Convention

- Channels use kebab-case: `get-branches`, `checkout-branch`
- Functions use camelCase: `getBranches()`, `checkoutBranch()`
