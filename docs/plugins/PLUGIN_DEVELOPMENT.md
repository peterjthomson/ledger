# Ledger Plugin Development Guide

Welcome to the Ledger plugin development guide! This document explains how to create plugins that extend Ledger's functionality.

## Table of Contents

- [Overview](#overview)
- [Plugin Types](#plugin-types)
- [Getting Started](#getting-started)
- [Plugin Structure](#plugin-structure)
- [API Reference](#api-reference)
- [Best Practices](#best-practices)
- [Examples](#examples)

---

## Overview

Ledger's plugin system allows you to extend the application with new features, UI components, and integrations. The system supports four types of plugins, each suited for different use cases:

| Type | Description | Use Cases |
|------|-------------|-----------|
| **App** | Full-screen applications | AI code review, project management, analytics |
| **Panel** | Floating modals/sidebars | Chat assistants, quick actions, diff viewers |
| **Widget** | Embedded UI components | Status badges, action buttons, info displays |
| **Service** | Background services | Auto-sync, notifications, data processing |

---

## Plugin Types

### App Plugins

App plugins provide full-screen experiences accessible via icons in the left sidebar. They're ideal for complex features that need dedicated space.

```typescript
import type { AppPlugin } from '@/lib/plugins'

const myAppPlugin: AppPlugin = {
  id: 'my-org.my-app',
  name: 'My App',
  version: '1.0.0',
  type: 'app',

  // Sidebar icon (Lucide icon name)
  icon: 'sparkles',
  iconTooltip: 'My Awesome App',
  iconOrder: 10, // Lower = higher in sidebar

  // React component to render
  component: 'MyAppComponent',

  // Optional sub-navigation
  navigation: [
    { id: 'dashboard', label: 'Dashboard', icon: 'home' },
    { id: 'settings', label: 'Settings', icon: 'settings' },
  ],
}
```

**Available Icons:** Any [Lucide](https://lucide.dev/icons) icon name in kebab-case.

### Panel Plugins

Panel plugins create floating UI that overlays the current view. They can be triggered by keyboard shortcuts, commands, or programmatically.

```typescript
import type { PanelPlugin } from '@/lib/plugins'

const myPanelPlugin: PanelPlugin = {
  id: 'my-org.my-panel',
  name: 'My Panel',
  version: '1.0.0',
  type: 'panel',

  title: 'My Panel Title',
  component: 'MyPanelComponent',

  // Panel configuration
  size: 'medium',      // 'small' | 'medium' | 'large' | 'fullscreen'
  position: 'center',  // 'center' | 'right' | 'bottom'
  closable: true,
  shortcut: 'Cmd+Shift+P',
}
```

### Widget Plugins

Widget plugins embed small UI components in specific locations within Ledger's interface.

```typescript
import type { WidgetPlugin } from '@/lib/plugins'

const myWidgetPlugin: WidgetPlugin = {
  id: 'my-org.my-widget',
  name: 'My Widget',
  version: '1.0.0',
  type: 'widget',

  component: 'MyWidgetComponent',

  // Where the widget appears
  slots: [
    'staging-panel-footer',
    'commit-panel-header',
  ],
}
```

**Available Slots:**
- `commit-panel-header` / `commit-panel-footer`
- `staging-panel-header` / `staging-panel-footer`
- `branch-list-item` / `pr-list-item` / `worktree-list-item` / `commit-list-item`
- `detail-panel-header` / `detail-panel-footer`
- `sidebar-header` / `sidebar-footer`
- `toolbar`

### Service Plugins

Service plugins run in the background without UI. They're perfect for automated tasks and integrations.

```typescript
import type { ServicePlugin } from '@/lib/plugins'

const myServicePlugin: ServicePlugin = {
  id: 'my-org.my-service',
  name: 'My Service',
  version: '1.0.0',
  type: 'service',

  // Background tasks
  backgroundTasks: [
    {
      id: 'sync',
      interval: 5 * 60 * 1000, // Run every 5 minutes
      handler: async (context) => {
        // Your background logic
      },
    },
  ],
}
```

---

## Getting Started

### 1. Create Your Plugin

Create a new file in your project:

```typescript
// my-plugin.ts
import type { AppPlugin, PluginContext } from '@/lib/plugins'

export const myPlugin: AppPlugin = {
  id: 'my-org.awesome-plugin',
  name: 'Awesome Plugin',
  version: '1.0.0',
  type: 'app',
  description: 'Does awesome things',
  author: 'Your Name',

  icon: 'zap',
  component: 'AwesomePluginApp',

  async activate(context: PluginContext) {
    context.logger.info('Plugin activated!')
  },

  async deactivate() {
    console.log('Plugin deactivated')
  },
}
```

### 2. Register Your Plugin

```typescript
import { pluginManager } from '@/lib/plugins'
import { myPlugin } from './my-plugin'

// Register the plugin
pluginManager.register(myPlugin)

// Activate it
await pluginManager.activate(myPlugin.id)
```

### 3. Create the React Component

For UI plugins (App, Panel, Widget), create a React component:

```tsx
// AwesomePluginApp.tsx
import type { PluginAppProps } from '@/lib/plugins'

export function AwesomePluginApp({ context, repoPath }: PluginAppProps) {
  return (
    <div className="plugin-app-content">
      <h1>Awesome Plugin</h1>
      <p>Current repo: {repoPath ?? 'None'}</p>
    </div>
  )
}
```

---

## Plugin Structure

### Common Properties

All plugins share these base properties:

```typescript
interface PluginBase {
  id: string           // Unique ID (use reverse domain: 'org.plugin-name')
  name: string         // Display name
  version: string      // Semantic version
  type: PluginType     // 'app' | 'panel' | 'widget' | 'service'
  description?: string // Short description
  author?: string      // Author name
  homepage?: string    // Plugin homepage/repo URL

  hooks?: Partial<PluginHooks>      // Hook implementations
  commands?: PluginCommand[]        // Commands
  settings?: PluginSetting[]        // Configurable settings

  activate?: (context: PluginContext) => Promise<void>
  deactivate?: () => Promise<void>
}
```

### Settings

Define configurable settings for your plugin:

```typescript
settings: [
  {
    key: 'apiKey',
    label: 'API Key',
    description: 'Your service API key',
    type: 'string',
    default: '',
  },
  {
    key: 'enabled',
    label: 'Enable feature',
    type: 'boolean',
    default: true,
  },
  {
    key: 'theme',
    label: 'Color theme',
    type: 'select',
    default: 'dark',
    options: [
      { label: 'Light', value: 'light' },
      { label: 'Dark', value: 'dark' },
    ],
  },
]
```

**Setting Types:** `string`, `number`, `boolean`, `select`, `multiselect`, `color`, `file`

### Commands

Add commands that users can execute:

```typescript
commands: [
  {
    id: 'my-org.my-plugin.do-thing',
    name: 'Do The Thing',
    description: 'Does the thing',
    shortcut: 'Cmd+Shift+T',
    handler: async (args) => {
      // Command logic
    },
  },
]
```

---

## API Reference

### PluginContext

The context object provided during activation:

```typescript
interface PluginContext {
  storage: PluginStorage      // Persistent key-value storage
  logger: PluginLogger        // Scoped logging
  subscriptions: PluginSubscriptions  // Lifecycle events
  api: PluginAPI              // Ledger API access
}
```

### PluginStorage

Persist data across sessions:

```typescript
// Store data
await context.storage.set('myKey', { foo: 'bar' })

// Retrieve data
const data = await context.storage.get<{ foo: string }>('myKey')

// Delete data
await context.storage.delete('myKey')

// Clear all plugin data
await context.storage.clear()

// List all keys
const keys = await context.storage.keys()
```

### PluginLogger

Log messages with plugin context:

```typescript
context.logger.debug('Debug message')
context.logger.info('Info message')
context.logger.warn('Warning message')
context.logger.error('Error message', error)
```

### PluginAPI

Access Ledger's functionality:

```typescript
// Repository info
const repoPath = context.api.getRepoPath()
const branch = await context.api.getCurrentBranch()
const branches = await context.api.getBranches()
const commits = await context.api.getCommits(50)

// Git operations
const result = await context.api.git(['status'])

// UI interactions
context.api.showNotification('Hello!', 'success')
context.api.openPanel('other-plugin-id', { data: 'value' })
context.api.navigateToApp('another-app-id')

// Refresh data
await context.api.refresh()
```

---

## Hooks

Plugins can hook into various Ledger events:

### Git Lifecycle Hooks

```typescript
hooks: {
  // Before/after checkout (return false to cancel)
  'git:before-checkout': async (branch) => { return true },
  'git:after-checkout': async (branch) => { },

  // Before/after commit (return string to modify message)
  'git:before-commit': async (message) => { return message },
  'git:after-commit': async (hash) => { },

  // Before/after push/pull
  'git:before-push': async (branch) => { return true },
  'git:after-push': async (branch) => { },
  'git:before-pull': async (branch) => { return true },
  'git:after-pull': async (branch) => { },
}
```

### AI Integration Hooks

```typescript
hooks: {
  'ai:analyze-commit': async (commit) => {
    return {
      summary: 'Analysis...',
      category: 'feature',
      complexity: 'medium',
    }
  },

  'ai:suggest-commit-message': async (diff) => {
    return 'feat: add new feature'
  },

  'ai:review-pr': async (pr, diff) => {
    return [
      { file: 'src/app.ts', type: 'suggestion', message: 'Consider...' }
    ]
  },
}
```

### UI Extension Hooks

```typescript
hooks: {
  'ui:commit-badge': async (commit) => {
    return { label: 'AI', color: 'blue', tooltip: 'AI analyzed' }
  },

  'ui:context-menu-items': async (target) => {
    return [
      { id: 'my-action', label: 'My Action', action: 'my-org.my-plugin.action' }
    ]
  },
}
```

---

## Best Practices

### 1. Use Meaningful IDs

Use reverse domain notation for plugin IDs:
- ✅ `acme-corp.code-analyzer`
- ✅ `github.copilot-integration`
- ❌ `my-plugin`
- ❌ `plugin1`

### 2. Handle Errors Gracefully

```typescript
async activate(context: PluginContext) {
  try {
    const apiKey = await context.storage.get<string>('apiKey')
    if (!apiKey) {
      context.logger.warn('No API key configured')
      return
    }
    // Initialize...
  } catch (error) {
    context.logger.error('Activation failed', error)
    throw error
  }
}
```

### 3. Clean Up Resources

Always clean up in `deactivate`. The plugin system provides multiple cleanup mechanisms:

```typescript
let intervalId: number | null = null

async activate(context: PluginContext) {
  intervalId = setInterval(() => { /* ... */ }, 5000)

  // Register cleanup callback - automatically called when plugin is deactivated
  context.subscriptions.onDispose(() => {
    if (intervalId) clearInterval(intervalId)
  })

  // Subscribe to events - automatically cleaned up on deactivation
  context.events.on('repo:switched', (event) => {
    // Handle repo change
  })
}

async deactivate() {
  // Manual cleanup (for resources not registered with onDispose)
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
  }
}
```

**Cleanup lifecycle:**
1. Plugin's `deactivate()` method is called first
2. All event subscriptions are automatically removed
3. All `onDispose` callbacks are executed
4. Plugin context is disposed and removed from cache

### 4. Respect User Settings

Always check settings before performing actions:

```typescript
const autoRun = await context.storage.get<boolean>('autoRun')
if (autoRun !== false) { // Default to true
  // Run automatic action
}
```

### 5. Use the Logger

Use the provided logger instead of `console.log`:

```typescript
// ✅ Good
context.logger.info('Processing...')

// ❌ Bad
console.log('Processing...')
```

---

## Examples

Complete example plugins are available in `lib/plugins/examples/`:

| Example | Type | Description |
|---------|------|-------------|
| `ai-review-app.ts` | App | AI-powered code review application |
| `ai-chat-panel.ts` | Panel | Chat assistant panel |
| `commit-suggester-widget.ts` | Widget | Commit message suggestions |
| `auto-fetch-service.ts` | Service | Automatic remote fetching |

---

## Publishing Plugins

*Coming soon: Plugin marketplace and distribution guidelines.*

For now, plugins can be:
1. Bundled with Ledger
2. Shared as npm packages
3. Loaded from local directories

---

## Need Help?

- 📖 [API Documentation](./API.md)
- 💬 [GitHub Discussions](https://github.com/ledger/ledger/discussions)
- 🐛 [Report Issues](https://github.com/ledger/ledger/issues)

Happy plugin development! 🚀
