# Ledger Plugin Standard

Version: 1.0.0

This document defines the standard for creating Ledger plugins. Following this standard ensures your plugin integrates seamlessly with Ledger and provides a consistent user experience.

---

## Table of Contents

1. [Repository Structure](#repository-structure)
2. [Plugin Manifest](#plugin-manifest)
3. [Plugin Types](#plugin-types)
4. [Permissions](#permissions)
5. [UI Guidelines](#ui-guidelines)
6. [API Reference](#api-reference)
7. [Publishing](#publishing)

---

## Repository Structure

Your plugin repository should follow this structure:

```
my-ledger-plugin/
├── package.json           # NPM package manifest
├── ledger-plugin.json     # Ledger plugin manifest
├── README.md              # Documentation
├── LICENSE                # License file
├── src/
│   ├── index.ts          # Main entry point (exports plugin)
│   ├── components/       # React components (if UI plugin)
│   │   ├── App.tsx       # Main app component
│   │   └── styles.css    # Plugin-specific styles
│   └── services/         # Business logic
├── assets/               # Icons, images
│   └── icon.svg          # Plugin icon (24x24 SVG)
└── dist/                 # Built output
    └── index.js          # Bundled plugin
```

### package.json

```json
{
  "name": "@yourorg/ledger-plugin-name",
  "version": "1.0.0",
  "description": "Description of your plugin",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "ledger": {
    "manifest": "ledger-plugin.json"
  },
  "keywords": ["ledger-plugin", "git", "your-category"],
  "peerDependencies": {
    "react": "^19.0.0"
  }
}
```

---

## Plugin Manifest

Every plugin must have a `ledger-plugin.json` manifest:

```json
{
  "$schema": "https://ledger.dev/schemas/plugin-manifest.json",
  "id": "com.yourorg.plugin-name",
  "name": "Plugin Display Name",
  "version": "1.0.0",
  "type": "app|panel|widget|service",
  "description": "What this plugin does",
  "author": "Your Name",
  "homepage": "https://github.com/yourorg/plugin-name",
  "repository": "https://github.com/yourorg/plugin-name",
  "license": "MIT",
  "engines": {
    "ledger": ">=1.0.0"
  },
  "permissions": [
    "git:read",
    "git:write",
    "notifications",
    "storage",
    "network"
  ],
  "main": "dist/index.js",
  "icon": "assets/icon.svg"
}
```

### ID Convention

Plugin IDs must be globally unique. Use reverse domain notation:
- `com.yourcompany.plugin-name`
- `io.github.username.plugin-name`

For Ledger built-in plugins: `ledger.plugin-name`

---

## Plugin Types

### App Plugin

Full-screen application with sidebar navigation. Use for complex features.

```typescript
import type { AppPlugin, PluginContext } from '@ledger/plugin-api'

export const myAppPlugin: AppPlugin = {
  id: 'com.example.my-app',
  name: 'My App',
  version: '1.0.0',
  type: 'app',
  description: 'Description here',
  author: 'Your Name',
  permissions: ['git:read'],

  // Sidebar icon (Lucide icon name)
  icon: 'layout-dashboard',
  iconTooltip: 'My App',
  iconOrder: 10, // Lower = higher in sidebar

  // React component name (registered separately)
  component: 'MyAppComponent',

  // Optional sub-navigation
  navigation: [
    { id: 'overview', label: 'Overview', icon: 'home' },
    { id: 'details', label: 'Details', icon: 'list' },
  ],

  // Plugin settings
  settings: [
    {
      key: 'refreshInterval',
      label: 'Refresh interval (seconds)',
      type: 'number',
      default: 30,
      validation: { min: 5, max: 300 },
    },
  ],

  // Commands for command palette
  commands: [
    {
      id: 'com.example.my-app.refresh',
      name: 'Refresh Data',
      shortcut: 'Cmd+Shift+R',
      handler: async (context) => {
        // Command implementation
      },
    },
  ],

  async activate(context: PluginContext): Promise<void> {
    context.logger.info('Plugin activated')
  },

  async deactivate(): Promise<void> {
    // Cleanup
  },
}
```

### Panel Plugin

Floating modal/panel for focused tasks. Use for quick actions.

```typescript
import type { PanelPlugin } from '@ledger/plugin-api'

export const myPanelPlugin: PanelPlugin = {
  id: 'com.example.my-panel',
  name: 'Quick Actions',
  version: '1.0.0',
  type: 'panel',
  permissions: ['git:read'],

  title: 'Quick Actions',
  component: 'MyPanelComponent',
  size: 'medium',       // 'small' | 'medium' | 'large' | 'fullscreen'
  position: 'center',   // 'center' | 'right' | 'bottom'
  closable: true,
  shortcut: 'Cmd+K',

  async activate(context) {
    // Setup
  },
}
```

### Widget Plugin

Small UI embedded in existing views. Use for inline enhancements.

```typescript
import type { WidgetPlugin } from '@ledger/plugin-api'

export const myWidgetPlugin: WidgetPlugin = {
  id: 'com.example.my-widget',
  name: 'Status Badge',
  version: '1.0.0',
  type: 'widget',
  permissions: ['git:read'],

  component: 'MyWidgetComponent',

  // Where this widget appears
  slots: [
    'pr-list-item',
    'branch-list-item',
    'commit-list-item',
    'worktree-list-item',
  ],

  async activate(context) {
    // Setup
  },
}
```

#### Available Widget Slots

| Slot | Location | Data Provided |
|------|----------|---------------|
| `pr-list-item` | PR list items | `PullRequest` object |
| `branch-list-item` | Branch list items | `Branch` object |
| `commit-list-item` | Commit list items | `Commit` object |
| `worktree-list-item` | Worktree list items | `Worktree` object |
| `staging-panel-header` | Top of staging panel | `StagingStatus` |
| `staging-panel-footer` | Bottom of staging panel | `StagingStatus` |
| `commit-panel-header` | Top of commit detail | `Commit` object |
| `commit-panel-footer` | Bottom of commit detail | `Commit` object |
| `toolbar` | Main toolbar | Current view context |

### Service Plugin

Headless background service. Use for automation and sync.

```typescript
import type { ServicePlugin } from '@ledger/plugin-api'

export const myServicePlugin: ServicePlugin = {
  id: 'com.example.my-service',
  name: 'Auto Sync',
  version: '1.0.0',
  type: 'service',
  permissions: ['git:read', 'git:write', 'notifications'],

  // Background tasks
  backgroundTasks: [
    {
      id: 'sync',
      interval: 5 * 60 * 1000, // 5 minutes
      handler: async (context) => {
        // Periodic task
      },
    },
  ],

  // Git lifecycle hooks
  hooks: {
    'git:before-commit': async (message) => {
      // Return modified message or original
      return message
    },
    'git:after-push': async (branch) => {
      // React to push
    },
  },

  async activate(context) {
    context.logger.info('Service started')
  },
}
```

---

## Permissions

Plugins must declare required permissions in their manifest.

| Permission | Access Granted |
|------------|----------------|
| `git:read` | Read repo path, branches, commits, status |
| `git:write` | Execute git commands (commit, push, etc.) |
| `notifications` | Show system notifications |
| `storage` | Plugin-isolated localStorage |
| `network` | Make HTTP requests |
| `clipboard` | Read/write clipboard |
| `shell` | Execute shell commands (requires approval) |

### Permission Best Practices

1. **Request minimal permissions** - Only what you need
2. **Explain why** - Document permission usage in README
3. **Graceful degradation** - Handle permission denial gracefully

---

## UI Guidelines

### Design Principles

1. **Consistent with Ledger** - Use Ledger's design tokens
2. **Minimal and focused** - One task per view
3. **Responsive** - Work in panels and full-screen
4. **Accessible** - Keyboard navigable, readable contrast

### CSS Variables

Always use Ledger's CSS variables for theming:

```css
/* Backgrounds */
--bg-primary      /* Main background */
--bg-secondary    /* Cards, panels */
--bg-tertiary     /* Nested elements */
--bg-hover        /* Hover states */

/* Text */
--text-primary    /* Main text */
--text-secondary  /* Secondary text */
--text-tertiary   /* Muted text */
--text-muted      /* Disabled text */

/* Accent & Status */
--accent          /* Primary action color */
--accent-bg       /* Accent background */
--accent-text     /* Text on accent */
--success         /* Success states */
--error           /* Error states */
--warning         /* Warning states */
--info            /* Info states */

/* Borders */
--border          /* Standard borders */
--border-color    /* Alias for --border */

/* Plugin Type Colors */
--color-blue      /* App plugins */
--color-purple    /* Panel plugins */
--color-green     /* Widget plugins */
--color-orange    /* Service plugins */
```

### Component Patterns

#### Cards

```css
.my-plugin-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
}

.my-plugin-card:hover {
  background: var(--bg-hover);
}
```

#### Buttons

```css
.my-plugin-button {
  padding: 8px 16px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--bg-secondary);
  color: var(--text-primary);
  cursor: pointer;
  font-size: 13px;
}

.my-plugin-button:hover {
  background: var(--bg-hover);
}

.my-plugin-button.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: white;
}
```

#### Status Badges

```css
.my-plugin-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
}

.my-plugin-badge.success {
  background: var(--success-bg);
  color: var(--success-text);
}

.my-plugin-badge.warning {
  background: var(--warning-bg);
  color: var(--warning-text);
}

.my-plugin-badge.error {
  background: var(--error-bg);
  color: var(--error-text);
}
```

### Typography

- Body text: 13px
- Small text: 11px
- Headings: 14-16px, font-weight: 600
- Monospace: `JetBrains Mono` for code/hashes

---

## API Reference

### PluginContext

Provided to all plugins on activation:

```typescript
interface PluginContext {
  // Logging
  logger: {
    debug(...args: any[]): void
    info(...args: any[]): void
    warn(...args: any[]): void
    error(...args: any[]): void
  }

  // Isolated storage (localStorage by default)
  storage: {
    get<T>(key: string): Promise<T | null>
    set<T>(key: string, value: T): Promise<void>
    delete(key: string): Promise<void>
    clear(): Promise<void>
    keys(): Promise<string[]>
    has(key: string): Promise<boolean>
  }

  // Git API (requires permissions)
  api: {
    getRepoPath(): string | null
    getCurrentBranch(): Promise<string>
    getBranches(): Promise<Branch[]>
    getWorktrees(): Promise<Worktree[]>       // Agent worktrees
    getPullRequests(): Promise<PullRequest[]> // GitHub PRs
    getCommits(limit?: number): Promise<Commit[]>
    getWorkingStatus(): Promise<StagingStatus>
    git(args: string[]): Promise<string>  // Requires git:write
    showNotification(message: string, type?: 'info' | 'success' | 'warning' | 'error'): void
    openPanel(pluginId: string, data?: unknown): void
    closePanel(pluginId: string): void
    navigateToApp(pluginId: string): void
    refresh(): Promise<void>  // Refresh all repository data
  }

  // Lifecycle
  subscriptions: {
    onDispose(callback: () => void): void
  }
}
```

### Storage Options

Plugins have two storage options:

**1. localStorage (default)** - Fast, volatile
```typescript
// Default storage - cleared on app restart
context.storage.set('key', value)
```

**2. SQLite (persistent)** - Survives restarts
```typescript
import { createPersistentPluginStorage } from '@ledger/plugin-api'

// Persistent storage - survives restarts
const storage = createPersistentPluginStorage(pluginId)
await storage.set('key', value)
```

### Hooks

Plugins can register hooks for git lifecycle events:

```typescript
hooks: {
  // Before hooks - return false to cancel, string to modify
  'git:before-checkout': (branch: string) => Promise<boolean>
  'git:before-commit': (message: string) => Promise<string | false>
  'git:before-push': (branch: string) => Promise<boolean>
  'git:before-pull': (branch: string) => Promise<boolean>

  // After hooks - react to completed operations
  'git:after-checkout': (branch: string) => Promise<void>
  'git:after-commit': (hash: string) => Promise<void>
  'git:after-push': (branch: string) => Promise<void>
  'git:after-pull': (branch: string) => Promise<void>

  // Repo events
  'repo:opened': (path: string) => Promise<void>
  'repo:closed': (path: string) => Promise<void>
  'repo:refreshed': () => Promise<void>  // Called after data refresh
}
```

---

## Publishing

### Pre-publish Checklist

- [ ] Manifest is valid JSON
- [ ] All permissions are documented
- [ ] README includes screenshots
- [ ] LICENSE file present
- [ ] No hardcoded secrets
- [ ] Tested on light and dark themes

### Publishing to Ledger Registry

```bash
# Build your plugin
npm run build

# Validate manifest
npx ledger-cli validate

# Publish (requires account)
npx ledger-cli publish
```

### Installing from Git

Users can install plugins directly from git:

```
Ledger > Settings > Plugins > Install from Git
URL: https://github.com/yourorg/your-plugin
```

---

## Example Plugins

See the `lib/plugins/examples/` directory for reference implementations:

- `team-dashboard.ts` - App plugin with analytics
- `pr-review-queue.ts` - Panel for managing reviews
- `branch-health-widget.ts` - Widget showing branch status
- `notification-relay.ts` - Service for webhooks

---

## Support

- Documentation: https://ledger.dev/docs/plugins
- Examples: https://github.com/ledger/plugin-examples
- Issues: https://github.com/ledger/ledger/issues
