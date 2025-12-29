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
lib/main/git-service.ts  # All git operations (~3300 lines)
lib/preload/preload.ts   # API exposed to renderer
app/app.tsx              # Main React component (~2600 lines)
app/styles/app.css       # All styling (~5000 lines)
app/types/electron.d.ts  # TypeScript types for IPC
app/components/          # UI components (panels, canvas, window)
```

## Common Tasks

### Adding a new git operation

1. Add function to `lib/main/git-service.ts`
2. Add IPC handler in `lib/main/main.ts`
3. Expose in `lib/preload/preload.ts`
4. Add types to `app/types/electron.d.ts`
5. Call from `app/app.tsx`

### Adding UI elements

Main UI is in `app/app.tsx`. Components are in `app/components/`:
- `panels/editor/` - Editor panels (BranchDetail, PRReview, Staging, etc.)
- `panels/viz/` - Visualization panels (GitGraph)
- `canvas/` - Canvas layout system
- `window/` - Window chrome (Titlebar, menus)

Styling in `app/styles/app.css` uses CSS variables for theming.

### Running the app

```bash
npm run dev      # Development with hot reload
npm test         # Run E2E tests
npm run lint     # Check for linting issues
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
- Responsive multi-column layout

## Testing

Playwright E2E tests in `tests/app.spec.ts`:
- Tests welcome screen (no repo)
- Tests main view (with repo via `--repo=` CLI arg)

Run with `npm test` (builds first) or `npm run test:headed`.

## Git Operations Available

| Operation | Function | Notes |
|-----------|----------|-------|
| List branches | `getBranchesWithMetadata()` | Includes commit counts, dates |
| List worktrees | `getEnhancedWorktrees()` | With agent detection |
| List PRs | `getPullRequests()` | Via `gh pr list` |
| Switch branch | `checkoutBranch()` | Auto-stashes first |
| Checkout remote | `checkoutRemoteBranch()` | Creates tracking branch |
| Checkout PR | `checkoutPRBranch()` | Uses `gh pr checkout`, handles forks |
| Open in browser | `openBranchInGitHub()` | GitHub URL |
| Fetch | `pullBranch()` | git fetch remote branch |
| Stage/Unstage | `stageFile()`, `unstageFile()` | Individual files |
| Commit | `commitChanges()` | With message and description |
| View diff | `getCommitDiff()`, `getFileDiff()` | Full diff parsing |
| Stash ops | `applyStash()`, `popStash()`, etc. | Full stash management |
| PR details | `getPRDetail()` | Full PR info with comments |

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
npm run build:mac:arm64  # Build unsigned for local testing
```

### Release Build (Signed + Notarized + Published)
```bash
APPLE_KEYCHAIN_PROFILE="AC_PASSWORD" npm run release
```

This builds, signs, notarizes, and publishes to GitHub Releases.

### Notarization Setup

**Important:** The `notarize` option in `electron-builder.yml` must be a **boolean** (`true`/`false`), not an object. Credentials are passed via environment variables.

```yaml
# electron-builder.yml
mac:
  identity: "Peter Thomson (R4RRG93J68)"
  notarize: true  # Must be boolean, not object!
```

**Required credentials** (one of these sets via env vars):
1. `APPLE_KEYCHAIN_PROFILE` - keychain profile name (recommended)
2. `APPLE_ID` + `APPLE_APP_SPECIFIC_PASSWORD` + `APPLE_TEAM_ID`
3. `APPLE_API_KEY` + `APPLE_API_KEY_ID` + `APPLE_API_ISSUER`

**One-time setup** to store credentials in keychain:
```bash
xcrun notarytool store-credentials "AC_PASSWORD" \
  --apple-id "your@email.com" \
  --team-id "YOUR_TEAM_ID"
# Enter app-specific password when prompted
```

**During signing:** macOS may show a keychain access dialog - click "Always Allow" to prevent it blocking future builds.

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

1. The `git-service.ts` file is large (~3300 lines) - could be modularized
2. No loading skeletons - just "Loading..." text
3. No keyboard shortcuts yet
4. PR integration requires `gh` CLI - could add fallback
5. Only macOS supported currently
6. React hooks exhaustive-deps warnings (intentional to prevent infinite loops)

## IPC Naming Convention

- Channels use kebab-case: `get-branches`, `checkout-branch`
- Functions use camelCase: `getBranches()`, `checkoutBranch()`
