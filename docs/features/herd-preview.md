# Herd Preview - Laravel Browser Preview

Preview Laravel projects in the browser via the preview system, using [Laravel Herd](https://herd.laravel.com/) when available.

## Overview

The Herd Preview flow allows you to preview Laravel branches, PRs, or worktrees without disrupting your current work. It automatically:

- Creates ephemeral worktrees for branches/PRs
- Sets up the Laravel environment (`.env`, `vendor/`, build assets)
- Links with Herd to serve at a `.test` domain
- Opens the preview in your default browser

## Requirements

- A Laravel project (detected by `artisan`)
- Herd installed for `.test` domains (optional)
- PHP available for the artisan serve fallback

## Usage

### From Worktree Panel

For existing worktrees, click **"Preview"** to:
1. Set up symlinks for dependencies
2. Link with Herd
3. Open `http://<worktree-folder>.test`

### From Branch Panel

Click **"Preview"** on any branch to:
1. Create a worktree at `~/.ledger/previews/<branch-name>/`
2. Set up Laravel environment
3. Open `http://<branch-name>.test`

### From PR Panel

Click **"Preview"** on any PR to:
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
| `public/build/` | **Symlinked or built** | Build when frontend changes or build output missing |
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

The "Preview" button is shown when a compatible preview provider exists and disabled with a reason when the provider is unavailable.

## Herd CLI Commands Used

Under the hood, Ledger uses:

```bash
# Link the worktree folder with Herd
herd link <folder-name>

# This registers the site at http://<folder-name>.test
```

## Troubleshooting

### "manifest.json not found"

If assets fail to build automatically, run `npm run build` in the preview worktree. For branches without frontend changes, a build in the main repo is usually sufficient.

### Button not appearing

1. Ensure the project is detected as Laravel (`artisan` file).
2. Verify Herd or PHP is available for preview.

### Wrong APP_URL

Each preview gets its own `.env` with the correct `APP_URL`. If you're seeing the wrong URL, the `.env` may have been created before this fix—delete it and re-preview.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Renderer                              │
│  Worktree / Branch / PR panels → "Preview"                   │
└──────────────────────────┬──────────────────────────────────┘
                           │ IPC (Conveyor)
┌──────────────────────────▼──────────────────────────────────┐
│                         Main                                 │
│  preview-handler → laravelProvider → herd-service            │
│  (opens URL after provider returns)                          │
└─────────────────────────────────────────────────────────────┘
```

## Related

- [Laravel Herd Documentation](https://herd.laravel.com/docs/macos/advanced-usage/herd-cli)
- [Worktrees Feature](./worktrees.md)

