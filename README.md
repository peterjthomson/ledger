# Ledger

A modern git interface for macOS - view branches, worktrees, and pull requests at a glance.

[![Download](https://img.shields.io/badge/Download-v0.1.0-blue?style=for-the-badge)](https://github.com/peterjthomson/ledger/releases/download/v0.1.0/Ledger-0.1.0-arm64.dmg)
[![GitHub Release](https://img.shields.io/github/v/release/peterjthomson/ledger?style=flat-square)](https://github.com/peterjthomson/ledger/releases)

## Download

**[⬇️ Download Ledger for Mac (Apple Silicon)](https://github.com/peterjthomson/ledger/releases/download/v0.1.0/Ledger-0.1.0-arm64.dmg)**

> ⚠️ **First launch:** The app is unsigned. Right-click → Open to bypass Gatekeeper.

## Features

- **Branch Viewer** - See all local and remote branches with metadata (commit dates, counts)
- **Worktree Support** - View and navigate to git worktrees
- **Pull Request Integration** - View open PRs from GitHub (via `gh` CLI)
- **Smart Filtering** - Filter branches by: All, Local Only, Unmerged
- **Flexible Sorting** - Sort by: Name, Last Commit, First Commit, Most Commits
- **Quick Actions** - Double-click to switch branches, open worktrees, or view PRs
- **Context Menus** - Right-click for additional options
- **Auto-Stash** - Automatically stashes uncommitted changes before switching branches

## Requirements

- macOS (Apple Silicon)
- [GitHub CLI](https://cli.github.com/) (`gh`) - optional, for PR integration

## Development

### Installation

```bash
# Clone the repository
git clone https://github.com/peterjthomson/ledger
cd ledger

# Install dependencies
npm install
```

## Development

```bash
npm run dev
```

## Building

```bash
# For macOS
npm run build:mac
```

## Tech Stack

- **[Electron](https://www.electronjs.org)** - Cross-platform desktop application framework
- **[React](https://react.dev)** - UI library
- **[TypeScript](https://www.typescriptlang.org)** - Type-safe JavaScript
- **[simple-git](https://github.com/steveukx/git-js)** - Git operations
- **[GitHub CLI](https://cli.github.com/)** - Pull request data

## License

MIT
