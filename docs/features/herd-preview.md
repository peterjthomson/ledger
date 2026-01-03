# Herd Preview - Laravel Browser Preview

Preview Laravel projects in the browser directly from Ledger using [Laravel Herd](https://herd.laravel.com/).

## Overview

The Herd Preview feature allows you to instantly preview any branch, PR, or worktree in your browser without disrupting your current work. It automatically:

- Creates ephemeral worktrees for branches/PRs
- Sets up the Laravel environment (`.env`, `vendor/`, build assets)
- Links with Herd to serve at a `.test` domain
- Opens the preview in your default browser

## Requirements

- [Laravel Herd](https://herd.laravel.com/) installed on macOS
- A Laravel project (detected by presence of `artisan` file)
- Main repo should have `npm run build` completed (for Vite assets)

## Usage

### From Worktree Panel

For existing worktrees, click **"Preview in Browser"** to:
1. Set up symlinks for dependencies
2. Link with Herd
3. Open `http://<worktree-folder>.test`

### From Branch Panel

Click **"Preview in Browser"** on any branch to:
1. Create a worktree at `~/.ledger/previews/<branch-name>/`
2. Set up Laravel environment
3. Open `http://<branch-name>.test`

### From PR Panel

Click **"Preview in Browser"** on any PR to:
1. Create a worktree at `~/.ledger/previews/pr-<number>/`
2. Checkout the PR's head branch
3. Open `http://pr-<number>.test`

## How It Works

### Environment Setup

When setting up a preview, Ledger:

| Item | Action | Why |
|------|--------|-----|
| `.env` | **Copied** from main repo | Allows modifying `APP_URL` |
| `APP_URL` | Set to `http://<folder>.test` | Correct URL for preview |
| `vendor/` | **Symlinked** to main repo | Share PHP dependencies |
| `public/build/` | **Symlinked** to main repo | Share Vite/Mix assets |
| `node_modules/` | **Symlinked** to main repo | Share Node dependencies |

### Preview Worktree Location

Ephemeral preview worktrees are stored at:

```
~/.ledger/previews/
├── feature-branch/      # Branch previews
├── pr-123/              # PR previews  
└── commit-abc1234/      # Commit previews
```

### Button Visibility

The "Preview in Browser" button:
- **Hidden** if Herd CLI is not installed
- **Disabled** (with tooltip) if project is not Laravel
- **Active** for Laravel projects with Herd installed

## Herd CLI Commands Used

Under the hood, Ledger uses:

```bash
# Link the worktree folder with Herd
herd link <folder-name>

# This registers the site at http://<folder-name>.test
```

## Troubleshooting

### "manifest.json not found"

The main repo needs compiled frontend assets:

```bash
cd /path/to/main/repo
npm run build
```

### Button not appearing

1. Check Herd is installed: `which herd`
2. Ensure project has an `artisan` file (Laravel detection)

### Wrong APP_URL

Each preview gets its own `.env` with the correct `APP_URL`. If you're seeing the wrong URL, the `.env` may have been created before this fix—delete it and re-preview.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Renderer                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │
│  │  Worktree   │  │   Branch    │  │     PR      │          │
│  │   Panel     │  │   Panel     │  │   Panel     │          │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘          │
│         │                │                │                  │
│         └────────────────┼────────────────┘                  │
│                          ▼                                   │
│              "Preview in Browser" button                     │
└──────────────────────────┬──────────────────────────────────┘
                           │ IPC
┌──────────────────────────▼──────────────────────────────────┐
│                         Main                                 │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                   herd-service.ts                    │    │
│  │  • isHerdInstalled()     • setupWorktreeSymlinks()  │    │
│  │  • isLaravelProject()    • linkWithHerd()           │    │
│  │  • getHerdUrl()          • getPreviewWorktreePath() │    │
│  └─────────────────────────────────────────────────────┘    │
│                          │                                   │
│                          ▼                                   │
│              ┌───────────────────────┐                      │
│              │      Herd CLI         │                      │
│              │   `herd link <name>`  │                      │
│              └───────────────────────┘                      │
└─────────────────────────────────────────────────────────────┘
```

## Related

- [Laravel Herd Documentation](https://herd.laravel.com/docs/macos/advanced-usage/herd-cli)
- [Worktrees Feature](./worktrees.md)

