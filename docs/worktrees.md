# Worktree Strategy for Ledger

> **Thesis:** Git worktrees are native but unloved—under-metaphored and under-tooled. Ledger exists to give worktrees the visual treatment they deserve, especially in the age of AI-assisted development where parallel workspaces are the norm.

## Competitive Landscape

### 1. WorktreeWise ([docs.worktreewise.com](https://docs.worktreewise.com))

**What it is:** A paid desktop app ($TBD, license-based) focused on traditional worktree management.

| Feature | WorktreeWise | Ledger Current | Ledger Planned |
|---------|--------------|----------------|----------------|
| **Create worktree** | ✅ Full wizard | ❌ | ✅ |
| **Rename worktree** | ✅ | ❌ | ⚠️ Low priority |
| **Move worktree** | ✅ | ❌ | ⚠️ Low priority |
| **Delete worktree** | ✅ | ❌ | ✅ |
| **Lock/Unlock worktree** | ✅ | ❌ | ⚠️ Low priority |
| **Prune stale worktrees** | ✅ | ❌ | ✅ |
| **Naming patterns** | ✅ Customizable | ❌ | ✅ |
| **Open in Terminal** | ✅ | ❌ | ✅ |
| **Open in IDE** | ✅ (WebStorm, etc.) | ❌ | ✅ (Cursor, VS Code) |
| **Workflows** | ✅ Run commands across worktrees | ❌ | ⚠️ Future |
| **Code Generators** | ✅ Scaffold files | ❌ | ❌ Not planned |
| **Git Log viewer** | ✅ | ✅ Work mode | ✅ |
| **Git Diff viewer** | ✅ Branch/tag/commit diffs | ✅ Commit diffs | ✅ |
| **Agent detection** | ❌ | ✅ cursor/claude/gemini/junie | ✅ |
| **Diff stats per worktree** | ❌ | ✅ +/-/files | ✅ |
| **PR integration** | ❌ | ✅ GitHub CLI | ✅ |
| **Light/Dark mode** | ✅ | ⚠️ Light only | ✅ |

**WorktreeWise Strengths:**
- Complete worktree lifecycle (rename, move, lock)
- "Workflows" feature for batch operations
- Code generators for scaffolding

**WorktreeWise Gaps:**
- No AI agent awareness
- No understanding of worktree "ownership"
- No PR integration
- No diff stats at-a-glance
- Paid/licensed model

---

### 2. git-worktree-runner (gtr) ([github.com/coderabbitai/git-worktree-runner](https://github.com/coderabbitai/git-worktree-runner))

**What it is:** A CLI tool from CodeRabbit focused on AI tool integration.

| Feature | gtr | Ledger Current | Ledger Planned |
|---------|-----|----------------|----------------|
| **Create worktree** | ✅ `git gtr new` | ❌ | ✅ |
| **Remove worktree** | ✅ `git gtr rm` | ❌ | ✅ |
| **Config copying** | ✅ .env, docker, etc. | ❌ | ✅ |
| **Post-create hooks** | ✅ npm install, etc. | ❌ | ✅ |
| **Open in editor** | ✅ cursor/code/zed | ❌ | ✅ |
| **Launch AI tools** | ✅ claude/aider | ❌ | ✅ |
| **Multiple worktrees same branch** | ✅ `--force --name` | ❌ | ✅ |
| **Shell completions** | ✅ | N/A (GUI) | N/A |
| **GUI** | ❌ CLI only | ✅ | ✅ |
| **Agent detection** | ❌ | ✅ | ✅ |
| **Visual diff stats** | ❌ | ✅ | ✅ |
| **PR integration** | ❌ | ✅ | ✅ |

**gtr Strengths:**
- AI-first workflow (launch Claude Code, Aider directly)
- Config copying and hooks
- Same-branch multiple worktrees for parallel AI agents
- Open source, CLI-composable

**gtr Gaps:**
- No GUI—power users only
- No visualization of worktree state
- No agent "ownership" tracking

---

## Ledger's Unique Position

### The Insight

Worktrees are experiencing a renaissance because of AI coding assistants:
- **Cursor** creates worktrees in `~/.cursor/worktrees/`
- **Claude Code** creates worktrees in `~/.claude/worktrees/`
- Developers need **parallel workspaces** for AI agents to work simultaneously

Neither WorktreeWise nor gtr understands this shift. They treat worktrees as developer tools, not as **AI agent workspaces**.

### Ledger's Differentiators

| Capability | Why It Matters |
|------------|----------------|
| **Agent Detection** | Know which AI tool created each worktree |
| **Visual State** | See diff stats, file counts, activity at a glance |
| **PR Context** | Worktrees alongside PRs—the full picture |
| **One-Click Launch** | Open Cursor/Claude directly into the worktree |
| **Mission Control** | Orchestrate multiple AI agents from one place |

---

## Implementation Plan

> Note: The code blocks in this section are **illustrative pseudo-code** for communicating intent. The canonical implementation lives in:
> - `lib/main/git-service.ts` (git operations)
> - `lib/main/main.ts` (IPC handlers)
> - `app/types/electron.d.ts` (renderer-facing API contract)
>
> This keeps docs from “asserting the implementation” and reduces drift.

### Phase 1: Core Worktree Actions

**Goal:** Match basic WorktreeWise/gtr functionality with Ledger's visual polish.

#### 1.1 Create Worktree

**UI:** 
- Button in worktrees column header: "+" or "New Worktree"
- Also available from branch context menu: "Create Worktree Here"

**Modal Flow:**
```
┌─────────────────────────────────────────────────────┐
│  Create New Worktree                                │
├─────────────────────────────────────────────────────┤
│  Branch: [feature/auth ▼]  ○ Existing  ○ New       │
│                                                     │
│  Folder name: [feature-auth          ]              │
│  Location: ~/.cursor/worktrees/ledger/              │
│                                                     │
│  ☑ Copy config files                                │
│    [.env.local, .env.example]                       │
│                                                     │
│  ☑ Run post-create                                  │
│    [npm install]                                    │
│                                                     │
│              [Cancel]  [Create Worktree]            │
└─────────────────────────────────────────────────────┘
```

**Implementation notes (non-exhaustive):**
- **Entry points**: `createWorktree()` in `lib/main/git-service.ts`, invoked via IPC from `lib/main/main.ts`
- **Return shape**: prefer `{ success, message, path? }`-style results (see `app/types/electron.d.ts`)
- **Post-create hooks/config copying**: if/when added, treat as optional enhancements (avoid baking exact CLI strings into docs)

#### 1.2 Remove Worktree

**UI:**
- Context menu: "Remove Worktree"
- Confirmation modal with options

**Modal Flow:**
```
┌─────────────────────────────────────────────────────┐
│  Remove Worktree                                    │
├─────────────────────────────────────────────────────┤
│  ⚠️ This worktree has uncommitted changes:          │
│     +47 -12 in 3 files                              │
│                                                     │
│  ☐ Also delete branch 'feature/auth'               │
│  ☑ Force removal (ignore uncommitted changes)      │
│                                                     │
│              [Cancel]  [Remove Worktree]            │
└─────────────────────────────────────────────────────┘
```

**Implementation notes (non-exhaustive):**
- **Entry point**: `removeWorktree()` in `lib/main/git-service.ts`
- **UI**: should always confirm destructive actions, and default to safe behavior

#### 1.3 Prune Worktrees

**UI:**
- Column header menu: "Prune Stale Worktrees"
- Shows count of stale worktrees before pruning

**Implementation notes (non-exhaustive):**
- Prefer returning *counts + summary*, but don’t lock docs to a specific algorithm or message text.

---

### Phase 2: Editor & AI Integration

**Goal:** Make Ledger the launchpad for AI-assisted development.

#### 2.1 Open in Editor

**UI:**
- Context menu: "Open in Cursor", "Open in VS Code", "Open in Zed"
- Keyboard shortcut: `Cmd+O` on selected worktree

**Implementation:**

```typescript
export async function openWorktreeInEditor(
  worktreePath: string,
  editor: 'cursor' | 'code' | 'zed' = 'cursor'
): Promise<{ success: boolean; message: string }> {
  try {
    const commands: Record<string, string> = {
      cursor: 'cursor',
      code: 'code',
      zed: 'zed',
    };
    
    await execAsync(`${commands[editor]} "${worktreePath}"`);
    return { success: true, message: `Opened in ${editor}` };
  } catch (error) {
    return { success: false, message: (error as Error).message };
  }
}
```

#### 2.2 Open in Terminal

**Implementation:**

```typescript
export async function openWorktreeInTerminal(
  worktreePath: string,
  terminal: 'iterm' | 'terminal' = 'terminal'
): Promise<{ success: boolean; message: string }> {
  try {
    if (terminal === 'iterm') {
      await execAsync(`open -a iTerm "${worktreePath}"`);
    } else {
      await execAsync(`open -a Terminal "${worktreePath}"`);
    }
    return { success: true, message: `Opened terminal at ${worktreePath}` };
  } catch (error) {
    return { success: false, message: (error as Error).message };
  }
}
```

#### 2.3 Launch AI Tool (Future)

**Concept:** Launch Claude Code or Aider directly into a worktree.

```typescript
export async function launchAITool(
  worktreePath: string,
  tool: 'claude' | 'aider'
): Promise<{ success: boolean; message: string }> {
  try {
    const commands: Record<string, string> = {
      claude: 'claude',  // Claude Code CLI
      aider: 'aider',    // Aider CLI
    };
    
    // Open new terminal with AI tool
    const script = `cd "${worktreePath}" && ${commands[tool]}`;
    await execAsync(`osascript -e 'tell app "Terminal" to do script "${script}"'`);
    
    return { success: true, message: `Launched ${tool} in worktree` };
  } catch (error) {
    return { success: false, message: (error as Error).message };
  }
}
```

---

### Phase 3: Worktree Settings

#### 3.1 Per-Project Configuration

Store in `.ledger/config.json` or similar:

```json
{
  "worktrees": {
    "defaultLocation": "~/.cursor/worktrees/${repoName}",
    "copyFiles": [".env.local", ".env.example", "docker-compose.yml"],
    "postCreate": "npm install",
    "preferredEditor": "cursor"
  }
}
```

#### 3.2 Naming Patterns

Support patterns like WorktreeWise:
- `${branch}` → `feature-auth`
- `${branch}-${date}` → `feature-auth-2025-01-15`
- `${branch}-${short-hash}` → `feature-auth-abc123`

---

## UI Mockups

### Enhanced Worktree Column

```
┌─────────────────────────────────────────────────────┐
│  ⧉ Worktrees                           [+] [⋮]  3  │
├─────────────────────────────────────────────────────┤
│  🤖 Cursor 1: auth-feature              ●          │
│  ~/.cursor/worktrees/ledger/auth-feature            │
│  feature/auth • +234 -56 • 8 files                  │
│  ─────────────────────────────────────────────────  │
│  🤖 Claude 1: api-refactor                          │
│  ~/.claude/worktrees/ledger/api-refactor            │
│  refactor/api • clean • 2h ago                      │
│  ─────────────────────────────────────────────────  │
│  📁 main                                            │
│  ~/code/ledger                                      │
│  main • +12 -3 • 2 files                            │
└─────────────────────────────────────────────────────┘
```

### Worktree Context Menu

```
┌─────────────────────────────────┐
│  Check Out Worktree             │
│  Convert to Branch              │
│  ──────────────────────────────│
│  Open in Cursor            ⌘O   │
│  Open in VS Code                │
│  Open in Terminal          ⌘T   │
│  Open in Finder                 │
│  ──────────────────────────────│
│  Remove Worktree           ⌫    │
└─────────────────────────────────┘
```

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Create worktree from UI | < 3 clicks |
| Open worktree in editor | < 2 clicks |
| Visual identification of agent | Immediate (icon/color) |
| Understanding worktree state | At-a-glance (no hover needed) |

---

## Open Questions

1. **Should Ledger manage worktree locations?**
   - WorktreeWise allows moving worktrees
   - Is this needed, or is "create in default location" sufficient?

2. **How deep should AI tool integration go?**
   - Just launch the tool, or track its activity?
   - Show "agent active" indicators?

3. **Should we support "same branch multiple worktrees"?**
   - gtr supports this with `--force --name`
   - Useful for parallel AI agents on same feature
   - Risky for manual development

4. **WorktreeWise "Workflows" feature:**
   - Run commands across multiple worktrees
   - Is this valuable for Ledger's use case?

---

## References

- [Git Worktree Documentation](https://git-scm.com/docs/git-worktree)
- [WorktreeWise Docs](https://docs.worktreewise.com)
- [git-worktree-runner (gtr)](https://github.com/coderabbitai/git-worktree-runner)
- [Cursor Worktree Behavior](https://forum.cursor.com/t/worktrees-and-cursor/1234) (needs research)


