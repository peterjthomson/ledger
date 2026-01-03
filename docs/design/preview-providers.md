# Preview Providers - Extensible Architecture

## URL Strategy for Parallel Worktrees

The key question: **What URL does each worktree get?**

### Option 1: `.test` Domains (Preferred)

Tools like **puma-dev** (Rails) and **Laravel Herd/Valet** provide automatic `.test` domains:

```
Main repo:        myapp.test
feature-login:    feature-login.test
feature-checkout: feature-checkout.test
pr-42:            pr-42.test
```

**Pros:**
- Human-readable URLs
- No port conflicts
- Easy to remember which is which
- HTTPS support built-in
- No server management needed

**Setup (one-time):**
```bash
# Rails: puma-dev
brew install puma/puma/puma-dev
sudo puma-dev -setup
puma-dev -install

# Laravel: Herd
# Just install Herd.app
```

### Option 2: Dynamic Ports (Fallback)

When `.test` domain tools aren't installed:

```
Main repo:        localhost:3000
feature-login:    localhost:3001
feature-checkout: localhost:3002
pr-42:            localhost:3003
```

**Pros:**
- Works without additional setup
- Universal (any framework)

**Cons:**
- Hard to remember which port is which
- Need to track port assignments

---

## DHH's Rails Philosophy

Per DHH (David Heinemeier Hansson):

| Principle | Implementation |
|-----------|----------------|
| **No Docker for dev** | Native Ruby on Mac |
| **Simple tooling** | Homebrew for deps |
| **Foreman/Overmind** | Manage multiple processes |
| **bin/dev** | Rails 7+ standard startup |
| **puma-dev** | Zero-config `.test` domains |

### Rails Parallel Worktree Setup

```
~/.ledger/previews/
├── feature-login/           → feature-login.test (via puma-dev)
│   ├── vendor/bundle → ../../main/vendor/bundle (symlink)
│   ├── node_modules → ../../main/node_modules (symlink)
│   ├── config/
│   │   ├── database.yml (copied, with different DB name)
│   │   ├── master.key → ../../main/config/master.key (symlink)
│   │   └── credentials.yml.enc → (symlink)
│   └── ...
└── pr-42/                   → pr-42.test
    └── ...
```

### Database Strategy

Each worktree needs its own database to avoid conflicts:

```yaml
# config/database.yml (auto-modified)
development:
  database: myapp_feature_login_development  # Added worktree suffix

test:
  database: myapp_feature_login_test
```

---

## Overview

Make "Preview in Browser" extensible to support multiple preview environments:

| Provider | Type | Project Detection | Use Case |
|----------|------|-------------------|----------|
| **Laravel Herd** | Local | `artisan` file | Laravel/PHP projects |
| **Laravel Valet** | Local | `artisan` file | Laravel on Valet |
| **Rails (Puma)** | Local | `config.ru`, `Gemfile` | Ruby on Rails |
| **Docker Compose** | Local | `docker-compose.yml` | Containerized apps |
| **Vercel** | Cloud | `vercel.json` or Next.js | JAMstack, Next.js |
| **Netlify** | Cloud | `netlify.toml` | Static sites, functions |
| **Render** | Cloud | `render.yaml` | Full-stack apps |
| **Custom** | Either | User-defined | Anything else |

---

## Provider Interface

```typescript
// lib/preview/preview-types.ts

/**
 * Preview provider type - determines workflow
 */
export type PreviewType = 'local' | 'cloud'

/**
 * Result of checking provider availability
 */
export interface ProviderAvailability {
  /** Provider is installed/configured */
  available: boolean
  /** Project is compatible with this provider */
  compatible: boolean
  /** Why not available/compatible (for tooltips) */
  reason?: string
}

/**
 * Result of creating a preview
 */
export interface PreviewResult {
  success: boolean
  message: string
  /** Preview URL (opened in browser) */
  url?: string
  /** For cloud providers: deployment ID */
  deploymentId?: string
  /** Non-fatal issues during setup */
  warnings?: string[]
}

/**
 * Preview Provider Interface
 * 
 * Each provider implements this interface to integrate with Ledger's
 * preview system. Providers can be built-in or added via plugins.
 */
export interface PreviewProvider {
  /** Unique identifier */
  id: string
  /** Display name */
  name: string
  /** Short description */
  description: string
  /** Icon (Lucide icon name) */
  icon: string
  /** Local or cloud-based */
  type: PreviewType
  
  /**
   * Check if this provider is available and compatible with the project.
   * Called when detail panels render to determine button visibility.
   * 
   * @param repoPath - Main repository path
   * @param targetPath - Worktree/branch path to preview (may be same as repoPath)
   */
  checkAvailability(repoPath: string, targetPath?: string): Promise<ProviderAvailability>
  
  /**
   * Preview an existing worktree in the browser.
   * 
   * @param worktreePath - Path to the worktree
   * @param mainRepoPath - Path to main repo (for symlinks, env copying)
   */
  previewWorktree(worktreePath: string, mainRepoPath: string): Promise<PreviewResult>
  
  /**
   * Preview a branch (creates ephemeral worktree if needed).
   * 
   * @param branchName - Branch to preview
   * @param mainRepoPath - Path to main repo
   */
  previewBranch(branchName: string, mainRepoPath: string): Promise<PreviewResult>
  
  /**
   * Preview a PR (creates ephemeral worktree if needed).
   * 
   * @param prNumber - PR number
   * @param prBranchName - PR's head branch
   * @param mainRepoPath - Path to main repo
   */
  previewPR(prNumber: number, prBranchName: string, mainRepoPath: string): Promise<PreviewResult>
  
  /**
   * Optional: Custom setup for this provider.
   * Called once when provider is first used.
   */
  setup?(): Promise<{ success: boolean; message: string }>
  
  /**
   * Optional: Cleanup ephemeral resources.
   * Called when preview is closed or on app shutdown.
   */
  cleanup?(previewId: string): Promise<void>
}
```

---

## Provider Registry

```typescript
// lib/preview/preview-registry.ts

import type { PreviewProvider, ProviderAvailability } from './preview-types'

/**
 * Registry of all available preview providers.
 * Built-in providers are registered at startup.
 * Plugins can register additional providers.
 */
class PreviewProviderRegistry {
  private providers = new Map<string, PreviewProvider>()
  
  /**
   * Register a preview provider
   */
  register(provider: PreviewProvider): void {
    if (this.providers.has(provider.id)) {
      console.warn(`Preview provider "${provider.id}" already registered, replacing`)
    }
    this.providers.set(provider.id, provider)
    console.info(`[Preview] Registered provider: ${provider.name}`)
  }
  
  /**
   * Unregister a provider (for plugin cleanup)
   */
  unregister(providerId: string): void {
    this.providers.delete(providerId)
  }
  
  /**
   * Get a specific provider
   */
  get(providerId: string): PreviewProvider | undefined {
    return this.providers.get(providerId)
  }
  
  /**
   * Get all registered providers
   */
  getAll(): PreviewProvider[] {
    return Array.from(this.providers.values())
  }
  
  /**
   * Get available providers for a project.
   * Returns providers sorted by compatibility (compatible first).
   */
  async getAvailableProviders(
    repoPath: string,
    targetPath?: string
  ): Promise<Array<{ provider: PreviewProvider; availability: ProviderAvailability }>> {
    const results = await Promise.all(
      this.getAll().map(async (provider) => ({
        provider,
        availability: await provider.checkAvailability(repoPath, targetPath),
      }))
    )
    
    // Sort: available+compatible first, then available, then others
    return results.sort((a, b) => {
      const scoreA = (a.availability.available ? 2 : 0) + (a.availability.compatible ? 1 : 0)
      const scoreB = (b.availability.available ? 2 : 0) + (b.availability.compatible ? 1 : 0)
      return scoreB - scoreA
    })
  }
}

export const previewRegistry = new PreviewProviderRegistry()
```

---

## Built-in Providers

### Laravel Herd Provider

```typescript
// lib/preview/providers/herd-provider.ts

import type { PreviewProvider, ProviderAvailability, PreviewResult } from '../preview-types'
import { exec } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs'
import * as path from 'path'

const execAsync = promisify(exec)

export const herdProvider: PreviewProvider = {
  id: 'herd',
  name: 'Laravel Herd',
  description: 'Local PHP development environment',
  icon: 'server',
  type: 'local',
  
  async checkAvailability(repoPath, targetPath) {
    const checkPath = targetPath || repoPath
    
    // Check if Herd CLI is installed
    let herdInstalled = false
    try {
      await execAsync('which herd')
      herdInstalled = true
    } catch {
      try {
        await execAsync('herd --version')
        herdInstalled = true
      } catch {
        // Not installed
      }
    }
    
    if (!herdInstalled) {
      return { available: false, compatible: false, reason: 'Herd CLI not installed' }
    }
    
    // Check if it's a Laravel project
    const isLaravel = fs.existsSync(path.join(checkPath, 'artisan'))
    
    return {
      available: true,
      compatible: isLaravel,
      reason: isLaravel ? undefined : 'Not a Laravel project (no artisan file)',
    }
  },
  
  async previewWorktree(worktreePath, mainRepoPath) {
    // ... existing herd-service.ts logic
  },
  
  async previewBranch(branchName, mainRepoPath) {
    // Create worktree at ~/.ledger/previews/<branch>/
    // Setup symlinks, link with Herd
  },
  
  async previewPR(prNumber, prBranchName, mainRepoPath) {
    // Create worktree at ~/.ledger/previews/pr-<number>/
    // Setup symlinks, link with Herd
  },
}
```

### Vercel Provider

```typescript
// lib/preview/providers/vercel-provider.ts

import type { PreviewProvider, ProviderAvailability, PreviewResult } from '../preview-types'
import { exec } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs'
import * as path from 'path'

const execAsync = promisify(exec)

export const vercelProvider: PreviewProvider = {
  id: 'vercel',
  name: 'Vercel',
  description: 'Cloud preview deployments',
  icon: 'cloud',
  type: 'cloud',
  
  async checkAvailability(repoPath, targetPath) {
    const checkPath = targetPath || repoPath
    
    // Check if Vercel CLI is installed
    let vercelInstalled = false
    try {
      await execAsync('vercel --version')
      vercelInstalled = true
    } catch {
      // Not installed
    }
    
    if (!vercelInstalled) {
      return { available: false, compatible: false, reason: 'Vercel CLI not installed (npm i -g vercel)' }
    }
    
    // Check if project is Vercel-compatible
    const hasVercelConfig = fs.existsSync(path.join(checkPath, 'vercel.json'))
    const hasNextConfig = fs.existsSync(path.join(checkPath, 'next.config.js')) ||
                          fs.existsSync(path.join(checkPath, 'next.config.mjs'))
    const hasPackageJson = fs.existsSync(path.join(checkPath, 'package.json'))
    
    const compatible = hasVercelConfig || hasNextConfig || hasPackageJson
    
    return {
      available: true,
      compatible,
      reason: compatible ? undefined : 'No vercel.json, next.config.js, or package.json found',
    }
  },
  
  async previewWorktree(worktreePath, _mainRepoPath) {
    try {
      // Deploy to Vercel preview
      const { stdout } = await execAsync('vercel --yes', { cwd: worktreePath })
      
      // Parse the deployment URL from output
      const urlMatch = stdout.match(/https:\/\/[^\s]+\.vercel\.app/)
      const url = urlMatch ? urlMatch[0] : undefined
      
      return {
        success: true,
        message: url ? `Deployed to ${url}` : 'Deployment started',
        url,
      }
    } catch (error) {
      return {
        success: false,
        message: `Vercel deployment failed: ${(error as Error).message}`,
      }
    }
  },
  
  async previewBranch(branchName, mainRepoPath) {
    // For cloud providers, we can deploy directly from branch
    // without creating a local worktree
    try {
      const { stdout } = await execAsync(
        `vercel --yes --meta branch=${branchName}`,
        { cwd: mainRepoPath }
      )
      
      const urlMatch = stdout.match(/https:\/\/[^\s]+\.vercel\.app/)
      
      return {
        success: true,
        message: `Branch "${branchName}" deployed`,
        url: urlMatch?.[0],
      }
    } catch (error) {
      return {
        success: false,
        message: `Vercel deployment failed: ${(error as Error).message}`,
      }
    }
  },
  
  async previewPR(prNumber, prBranchName, mainRepoPath) {
    return this.previewBranch(prBranchName, mainRepoPath)
  },
}
```

### Rails Provider

```typescript
// lib/preview/providers/rails-provider.ts

import type { PreviewProvider, ProviderAvailability, PreviewResult } from '../preview-types'
import { exec, spawn } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs'
import * as path from 'path'

const execAsync = promisify(exec)

// Track running Rails servers
const runningServers = new Map<string, { port: number; process: ReturnType<typeof spawn> }>()
let nextPort = 3001

export const railsProvider: PreviewProvider = {
  id: 'rails',
  name: 'Rails Server',
  description: 'Local Rails development server',
  icon: 'gem',
  type: 'local',
  
  async checkAvailability(repoPath, targetPath) {
    const checkPath = targetPath || repoPath
    
    // Check if Ruby/Rails is available
    let rubyInstalled = false
    try {
      await execAsync('ruby --version')
      rubyInstalled = true
    } catch {
      // Not installed
    }
    
    if (!rubyInstalled) {
      return { available: false, compatible: false, reason: 'Ruby not installed' }
    }
    
    // Check if it's a Rails project
    const hasConfigRu = fs.existsSync(path.join(checkPath, 'config.ru'))
    const hasGemfile = fs.existsSync(path.join(checkPath, 'Gemfile'))
    const isRails = hasConfigRu && hasGemfile
    
    // Verify it's actually Rails (not just Rack)
    let isActuallyRails = false
    if (hasGemfile) {
      try {
        const gemfile = fs.readFileSync(path.join(checkPath, 'Gemfile'), 'utf-8')
        isActuallyRails = gemfile.includes("'rails'") || gemfile.includes('"rails"')
      } catch {
        // Can't read Gemfile
      }
    }
    
    return {
      available: true,
      compatible: isRails && isActuallyRails,
      reason: isActuallyRails ? undefined : 'Not a Rails project',
    }
  },
  
  async previewWorktree(worktreePath, mainRepoPath) {
    // Check if server already running for this path
    if (runningServers.has(worktreePath)) {
      const server = runningServers.get(worktreePath)!
      return {
        success: true,
        message: `Server already running`,
        url: `http://localhost:${server.port}`,
      }
    }
    
    const port = nextPort++
    
    try {
      // Setup: bundle install (symlink to main repo's vendor/bundle if exists)
      const mainBundle = path.join(mainRepoPath, 'vendor', 'bundle')
      const worktreeBundle = path.join(worktreePath, 'vendor', 'bundle')
      
      if (fs.existsSync(mainBundle) && !fs.existsSync(worktreeBundle)) {
        await fs.promises.mkdir(path.join(worktreePath, 'vendor'), { recursive: true })
        await fs.promises.symlink(mainBundle, worktreeBundle)
      }
      
      // Copy database.yml if not exists
      const mainDbConfig = path.join(mainRepoPath, 'config', 'database.yml')
      const worktreeDbConfig = path.join(worktreePath, 'config', 'database.yml')
      if (fs.existsSync(mainDbConfig) && !fs.existsSync(worktreeDbConfig)) {
        await fs.promises.copyFile(mainDbConfig, worktreeDbConfig)
      }
      
      // Start Rails server in background
      const serverProcess = spawn('bundle', ['exec', 'rails', 'server', '-p', port.toString()], {
        cwd: worktreePath,
        detached: true,
        stdio: 'ignore',
      })
      
      serverProcess.unref()
      
      runningServers.set(worktreePath, { port, process: serverProcess })
      
      // Wait a moment for server to start
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      return {
        success: true,
        message: `Rails server started on port ${port}`,
        url: `http://localhost:${port}`,
      }
    } catch (error) {
      return {
        success: false,
        message: `Failed to start Rails server: ${(error as Error).message}`,
      }
    }
  },
  
  async previewBranch(branchName, mainRepoPath) {
    // Create worktree, then preview it
    // ... worktree creation logic
    const worktreePath = path.join(process.env.HOME || '~', '.ledger', 'previews', branchName.replace(/\//g, '-'))
    return this.previewWorktree(worktreePath, mainRepoPath)
  },
  
  async previewPR(prNumber, prBranchName, mainRepoPath) {
    const worktreePath = path.join(process.env.HOME || '~', '.ledger', 'previews', `pr-${prNumber}`)
    return this.previewWorktree(worktreePath, mainRepoPath)
  },
  
  async cleanup(previewId) {
    const server = runningServers.get(previewId)
    if (server) {
      server.process.kill()
      runningServers.delete(previewId)
    }
  },
}
```

---

## UI Integration

### Preview Button Component

```tsx
// app/components/PreviewButton.tsx

import { useState, useEffect } from 'react'

interface PreviewButtonProps {
  repoPath: string | null
  targetPath?: string
  targetType: 'worktree' | 'branch' | 'pr'
  targetData: {
    branchName?: string
    prNumber?: number
    prBranchName?: string
    worktreePath?: string
  }
  onStatusChange?: (status: { type: 'info' | 'success' | 'error'; message: string } | null) => void
}

interface ProviderOption {
  id: string
  name: string
  icon: string
  available: boolean
  compatible: boolean
  reason?: string
}

export function PreviewButton({ repoPath, targetPath, targetType, targetData, onStatusChange }: PreviewButtonProps) {
  const [providers, setProviders] = useState<ProviderOption[]>([])
  const [loading, setLoading] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  
  // Load available providers
  useEffect(() => {
    if (!repoPath) return
    
    window.electronAPI.getAvailablePreviewProviders(repoPath, targetPath)
      .then(setProviders)
      .catch(() => setProviders([]))
  }, [repoPath, targetPath])
  
  const handlePreview = async (providerId: string) => {
    if (!repoPath) return
    
    setLoading(true)
    setShowDropdown(false)
    onStatusChange?.({ type: 'info', message: 'Starting preview...' })
    
    try {
      let result
      
      switch (targetType) {
        case 'worktree':
          result = await window.electronAPI.previewWithProvider(providerId, 'worktree', {
            worktreePath: targetData.worktreePath!,
            mainRepoPath: repoPath,
          })
          break
        case 'branch':
          result = await window.electronAPI.previewWithProvider(providerId, 'branch', {
            branchName: targetData.branchName!,
            mainRepoPath: repoPath,
          })
          break
        case 'pr':
          result = await window.electronAPI.previewWithProvider(providerId, 'pr', {
            prNumber: targetData.prNumber!,
            prBranchName: targetData.prBranchName!,
            mainRepoPath: repoPath,
          })
          break
      }
      
      if (result.success) {
        onStatusChange?.({ type: 'success', message: result.message })
      } else {
        onStatusChange?.({ type: 'error', message: result.message })
      }
    } catch (error) {
      onStatusChange?.({ type: 'error', message: (error as Error).message })
    } finally {
      setLoading(false)
    }
  }
  
  // Filter to only show available providers
  const availableProviders = providers.filter(p => p.available)
  const compatibleProviders = availableProviders.filter(p => p.compatible)
  
  // No providers available at all
  if (availableProviders.length === 0) {
    return null
  }
  
  // Single compatible provider - show simple button
  if (compatibleProviders.length === 1) {
    const provider = compatibleProviders[0]
    return (
      <button
        className="btn btn-secondary"
        onClick={() => handlePreview(provider.id)}
        disabled={loading}
      >
        {loading ? 'Opening...' : `Preview with ${provider.name}`}
      </button>
    )
  }
  
  // Multiple providers - show dropdown
  return (
    <div className="preview-button-container">
      <button
        className="btn btn-secondary"
        onClick={() => setShowDropdown(!showDropdown)}
        disabled={loading}
      >
        {loading ? 'Opening...' : 'Preview ▾'}
      </button>
      
      {showDropdown && (
        <div className="preview-dropdown">
          {availableProviders.map(provider => (
            <button
              key={provider.id}
              className={`preview-option ${!provider.compatible ? 'disabled' : ''}`}
              onClick={() => provider.compatible && handlePreview(provider.id)}
              disabled={!provider.compatible}
              title={provider.reason}
            >
              <span className="preview-option-icon">{/* Lucide icon */}</span>
              <span className="preview-option-name">{provider.name}</span>
              {!provider.compatible && (
                <span className="preview-option-reason">{provider.reason}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
```

---

## Plugin Integration

### Adding Provider via Plugin

```typescript
// Example: Docker Compose Preview Plugin

import type { ServicePlugin, PluginContext } from '@ledger/plugin-api'
import type { PreviewProvider } from '@ledger/preview-api'

const dockerComposeProvider: PreviewProvider = {
  id: 'docker-compose',
  name: 'Docker Compose',
  description: 'Run with docker-compose up',
  icon: 'container',
  type: 'local',
  
  async checkAvailability(repoPath) {
    // Check for docker-compose.yml
    const hasCompose = await context.api.fs.exists(
      `${repoPath}/docker-compose.yml`
    ) || await context.api.fs.exists(
      `${repoPath}/docker-compose.yaml`
    )
    
    // Check if Docker is running
    const dockerRunning = await context.api.exec('docker info')
      .then(() => true)
      .catch(() => false)
    
    return {
      available: dockerRunning,
      compatible: hasCompose,
      reason: !dockerRunning 
        ? 'Docker is not running' 
        : !hasCompose 
          ? 'No docker-compose.yml found'
          : undefined,
    }
  },
  
  async previewWorktree(worktreePath) {
    await context.api.exec('docker-compose up -d', { cwd: worktreePath })
    
    // Parse exposed port from docker-compose.yml
    // ...
    
    return {
      success: true,
      message: 'Docker containers started',
      url: 'http://localhost:8080',
    }
  },
  
  // ... other methods
}

export const dockerComposePlugin: ServicePlugin = {
  id: 'ledger.preview-docker',
  name: 'Docker Compose Preview',
  version: '1.0.0',
  type: 'service',
  permissions: ['shell', 'fs:read'],
  
  async activate(context) {
    // Register the preview provider
    context.api.registerPreviewProvider(dockerComposeProvider)
  },
  
  async deactivate() {
    context.api.unregisterPreviewProvider('docker-compose')
  },
}
```

---

## Required Plugin API Additions

To make preview providers work as plugins, add to `PluginAPI`:

```typescript
interface PluginAPI {
  // ... existing methods ...
  
  // Preview Provider Registration
  registerPreviewProvider(provider: PreviewProvider): void
  unregisterPreviewProvider(providerId: string): void
  
  // File System (needed by providers)
  fs: {
    exists(path: string): Promise<boolean>
    readFile(path: string): Promise<string>
    writeFile(path: string, content: string): Promise<void>
    symlink(target: string, path: string): Promise<void>
    mkdir(path: string, options?: { recursive?: boolean }): Promise<void>
  }
  
  // Shell Execution (needed by providers)
  exec(command: string, options?: { cwd?: string }): Promise<{ stdout: string; stderr: string }>
  
  // Worktree Operations (needed by providers)
  createWorktree(options: CreateWorktreeOptions): Promise<{ success: boolean; path?: string }>
}
```

---

## Migration Path

### Phase 1: Refactor Herd to Provider Interface
1. Create `lib/preview/` directory structure
2. Move `herd-service.ts` logic to `providers/herd-provider.ts`
3. Update IPC handlers to use registry
4. Keep same UI behavior (single provider)

### Phase 2: Add More Built-in Providers
1. Implement Rails provider
2. Implement Vercel provider
3. Add provider selection dropdown to UI

### Phase 3: Plugin Support
1. Extend PluginAPI with `registerPreviewProvider`
2. Add `fs` and `exec` methods to PluginAPI
3. Document provider plugin development
4. Create example Docker Compose plugin

---

## Benefits

1. **Extensibility**: New providers via plugins without core changes
2. **Project Detection**: Automatic detection of compatible providers
3. **User Choice**: Dropdown when multiple providers available
4. **Clean Architecture**: Provider interface separates concerns
5. **Plugin Ecosystem**: Community can add providers for any platform
