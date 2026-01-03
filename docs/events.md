# Ledger Event System

This document describes Ledger's event architecture for real-time communication between the main process, renderer, and plugins.

## Overview

Ledger has two complementary event systems:

1. **LedgerEvents** - General app events for main ↔ renderer communication
2. **AgentEvents** - Specialized events for AI agent worktree tracking

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           MAIN PROCESS                                      │
│                                                                             │
│  ┌─────────────────────────────┐    ┌─────────────────────────────────────┐ │
│  │   LedgerEvents              │    │   AgentEvents                       │ │
│  │   lib/events/               │    │   lib/plugins/agent-events.ts       │ │
│  │                             │    │                                     │ │
│  │   Emits via IPC to renderer │    │   For plugin subscriptions          │ │
│  └──────────────┬──────────────┘    └─────────────────────────────────────┘ │
│                 │                                                           │
└─────────────────│───────────────────────────────────────────────────────────┘
                  │ IPC: 'ledger:event'
┌─────────────────│───────────────────────────────────────────────────────────┐
│                 ↓                  RENDERER                                 │
│  ┌─────────────────────────────┐                                            │
│  │   window.ledgerEvents       │                                            │
│  │   React hooks available     │                                            │
│  └─────────────────────────────┘                                            │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## LedgerEvents (Main ↔ Renderer)

### Event Types

| Event | Description | Payload |
|-------|-------------|---------|
| `repo:opened` | Repository opened | `{ path, name }` |
| `repo:closed` | Repository closed | `{ path }` |
| `repo:switched` | Active repo changed | `{ fromPath, toPath, name }` |
| `repo:refreshed` | Data refreshed | `{ path }` |
| `git:commit` | Commit created | `{ path, hash, message }` |
| `git:push` | Branch pushed | `{ path, branch }` |
| `git:pull` | Branch pulled | `{ path, branch }` |
| `git:checkout` | Branch checked out | `{ path, branch }` |
| `git:stash` | Stash operation | `{ path, action: 'save'|'apply'|'pop'|'drop' }` |

### Emitting Events (Main Process)

```typescript
import { emitRepoOpened, emitGitCommit, emitGitCheckout } from '@/lib/events'

// In your IPC handler:
handle('some-operation', async () => {
  const result = await doSomething()

  if (result.success) {
    // Emit event to all renderer windows
    emitGitCommit(repoPath, result.hash, message)
  }

  return result
})
```

**Available Emitters:**
- `emitRepoOpened(path: string)`
- `emitRepoClosed(path: string)`
- `emitRepoSwitched(fromPath: string | null, toPath: string)`
- `emitRepoRefreshed(path: string)`
- `emitGitCommit(path: string, hash: string, message: string)`
- `emitGitPush(path: string, branch: string)`
- `emitGitPull(path: string, branch: string)`
- `emitGitCheckout(path: string, branch: string)`
- `emitGitStash(path: string, action: 'save' | 'apply' | 'pop' | 'drop')`

### Subscribing to Events (Renderer)

#### Using React Hooks (Recommended)

```typescript
import {
  useRepoSwitched,
  useGitCommit,
  useGitCheckout,
  useGitPush,
  useGitPull,
  useGitStash,
  useAllLedgerEvents
} from '@/app/hooks/use-ledger-events'

function MyComponent() {
  // Subscribe to specific events
  useGitCommit((path, hash, message) => {
    console.log(`Commit ${hash} in ${path}: ${message}`)
  }, [])

  useRepoSwitched((fromPath, toPath, name) => {
    console.log(`Switched from ${fromPath} to ${toPath}`)
  }, [])

  // Subscribe to ALL events (debugging)
  useAllLedgerEvents((event) => {
    console.log('Event:', event.type, event)
  }, [])
}
```

**Available Hooks:**
- `useRepoOpened(callback, deps)`
- `useRepoClosed(callback, deps)`
- `useRepoSwitched(callback, deps)`
- `useGitCommit(callback, deps)`
- `useGitCheckout(callback, deps)`
- `useGitPush(callback, deps)`
- `useGitPull(callback, deps)`
- `useGitStash(callback, deps)`
- `useAllLedgerEvents(callback, deps)`
- `useLedgerEvent(type, callback, deps)` - Generic hook

#### Using Window API Directly

```typescript
// Subscribe
const unsubscribe = window.ledgerEvents.on('git:commit', (event) => {
  if (event.type === 'git:commit') {
    console.log('Commit:', event.hash)
  }
})

// Later: unsubscribe
unsubscribe()

// Subscribe once
window.ledgerEvents.once('repo:opened', (event) => {
  console.log('Repo opened:', event.path)
})

// Wildcard subscription
window.ledgerEvents.on('*', (event) => {
  console.log('Any event:', event)
})
```

---

## AgentEvents (Plugin System)

For tracking AI agent activity in worktrees. Used by plugins to monitor Cursor, Claude, Conductor, etc.

### Event Types

| Event | Description | Payload |
|-------|-------------|---------|
| `agent:detected` | New agent worktree found | `{ agentType, worktreePath, branch }` |
| `agent:removed` | Agent worktree removed | `{ agentType, worktreePath, branch }` |
| `agent:active` | Agent showing file changes | `{ agentType, worktreePath, branch, data: { changedFiles, additions, deletions } }` |
| `agent:idle` | Agent stopped (5 min threshold) | `{ agentType, worktreePath, branch }` |
| `agent:stale` | Agent inactive (1 hour threshold) | `{ agentType, worktreePath, branch }` |
| `agent:commit` | Agent made a commit | `{ agentType, worktreePath, branch, data: { commitHash, commitMessage } }` |
| `agent:push` | Agent pushed changes | `{ agentType, worktreePath, branch }` |
| `agent:pr-created` | Agent created a PR | `{ agentType, worktreePath, branch, data: { prNumber, prTitle, prUrl } }` |
| `agent:conflict` | Agent has merge conflicts | `{ agentType, worktreePath, branch, data: { conflictingFiles } }` |
| `agent:behind` | Agent branch behind main | `{ agentType, worktreePath, branch, data: { commitsBehind } }` |

### Subscribing (Plugins/Main Process)

```typescript
import { agentEvents } from '@/lib/plugins/agent-events'

// Subscribe to specific events
const unsubscribe = agentEvents.on('agent:commit', (event) => {
  console.log(`${event.agentType} committed: ${event.data?.commitMessage}`)
})

// Subscribe to all agent events
agentEvents.on('*', (event) => {
  console.log('Agent event:', event.type, event.agentType)
})

// Query agent state
const state = agentEvents.getState('/path/to/worktree')
const activeAgents = agentEvents.getActiveAgents()
const claudeAgents = agentEvents.getAgentsByType('claude')
```

### How AgentEvents Are Triggered

The `agentEvents.updateFromWorktrees()` method is called automatically when worktrees are fetched:

```typescript
// In worktree-handler.ts
handle('get-worktrees', async () => {
  const worktrees = await getEnhancedWorktrees()
  agentEvents.updateFromWorktrees(worktrees)  // Updates agent state
  return worktrees
})
```

This method:
1. Detects new agents → emits `agent:detected`
2. Tracks activity changes → emits `agent:active`
3. Detects removed agents → emits `agent:removed`
4. Starts idle/stale timers automatically

---

## File Locations

| File | Purpose |
|------|---------|
| `lib/events/event-types.ts` | LedgerEvent type definitions |
| `lib/events/main-events.ts` | Main process emitters |
| `lib/events/index.ts` | Module exports |
| `lib/preload/preload.ts` | IPC bridge to renderer |
| `lib/conveyor/conveyor.d.ts` | TypeScript declarations |
| `app/hooks/use-ledger-events.ts` | React hooks |
| `lib/plugins/agent-events.ts` | AgentEvents system |

---

## Adding New Events

### 1. Define the Event Type

```typescript
// lib/events/event-types.ts

export interface MyNewEvent {
  type: 'my:new-event'
  someData: string
  // ... other fields
}

// Add to union
export type LedgerEvent =
  | RepoOpenedEvent
  | ...
  | MyNewEvent  // Add here
```

### 2. Create an Emitter

```typescript
// lib/events/main-events.ts

export function emitMyNewEvent(someData: string): void {
  emitEvent({ type: 'my:new-event', someData })
}
```

### 3. Call from Handler

```typescript
// lib/conveyor/handlers/my-handler.ts

import { emitMyNewEvent } from '@/lib/events'

handle('my-operation', async () => {
  const result = await doThing()
  if (result.success) {
    emitMyNewEvent(result.data)
  }
  return result
})
```

### 4. Create React Hook (Optional)

```typescript
// app/hooks/use-ledger-events.ts

export function useMyNewEvent(
  callback: (someData: string) => void,
  deps: React.DependencyList = []
) {
  useLedgerEvent(
    'my:new-event',
    (event) => {
      if (event.type === 'my:new-event') {
        callback(event.someData)
      }
    },
    deps
  )
}
```

---

## Best Practices

1. **Always emit after success** - Only emit events when operations succeed
2. **Include path for context** - Most events include the repo path so subscribers can filter
3. **Use React hooks** - They handle cleanup automatically and integrate with React lifecycle
4. **Keep payloads small** - Events are serialized over IPC, avoid large objects
5. **Don't emit too frequently** - Debounce rapid operations if needed
6. **Unsubscribe properly** - Always clean up subscriptions to avoid memory leaks

---

## Comparison: LedgerEvents vs AgentEvents

| Aspect | LedgerEvents | AgentEvents |
|--------|--------------|-------------|
| **Purpose** | General app events | AI agent tracking |
| **Scope** | Main ↔ Renderer | Main process only |
| **IPC Bridge** | Yes (`window.ledgerEvents`) | No |
| **React Hooks** | Yes | No |
| **State Tracking** | No | Yes (agent states) |
| **Auto Timers** | No | Yes (idle/stale detection) |
| **Plugin Access** | No (future) | Yes (`context.events`) |
| **Use Case** | UI reactivity | Plugin automation |

---

## Plugin Event Access

Plugins can subscribe to AgentEvents via `context.events`:

```typescript
const myPlugin: ServicePlugin = {
  id: 'my-plugin',
  name: 'My Plugin',
  version: '1.0.0',
  type: 'service',

  async activate(context: PluginContext) {
    // Subscribe to agent commits
    const unsubCommit = context.events.on('agent:commit', (event) => {
      console.log(`Agent ${event.agentType} committed: ${event.data?.commitMessage}`)
    })

    // Subscribe to all agent events
    const unsubAll = context.events.on('*', (event) => {
      console.log('Agent event:', event.type, event.agentType)
    })

    // Subscribe once
    context.events.once('agent:detected', (event) => {
      console.log('First agent detected:', event.agentType)
    })

    // Clean up on deactivate
    context.subscriptions.onDispose(() => {
      unsubCommit()
      unsubAll()
    })
  }
}
```

### Available Events for Plugins

| Event | Payload |
|-------|---------|
| `agent:detected` | `{ agentType, worktreePath, branch }` |
| `agent:removed` | `{ agentType, worktreePath, branch }` |
| `agent:active` | `{ agentType, worktreePath, branch, data: { changedFiles, additions, deletions } }` |
| `agent:idle` | `{ agentType, worktreePath, branch }` |
| `agent:stale` | `{ agentType, worktreePath, branch }` |
| `agent:commit` | `{ agentType, worktreePath, branch, data: { commitHash, commitMessage } }` |
| `agent:push` | `{ agentType, worktreePath, branch }` |
| `agent:pr-created` | `{ agentType, worktreePath, branch, data: { prNumber, prTitle, prUrl } }` |
| `agent:conflict` | `{ agentType, worktreePath, branch, data: { conflictingFiles } }` |
| `agent:behind` | `{ agentType, worktreePath, branch, data: { commitsBehind } }` |
| `*` | All agent events |
