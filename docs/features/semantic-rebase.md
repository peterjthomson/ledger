# Semantic Rebase

> AI-powered branch reconciliation that preserves intent, not just code.

**Status**: Proposed
**Priority**: High
**Dependencies**: Frontier Agent SDK integration
**References**: [Steve Yegge - Merge Queue Problem](https://steve-yegge.medium.com/), [Feature Analysis: AI Integration](../analysis/feature-analysis-ai-integration.md)

---

## Problem Statement

When multiple AI agents work in parallel—each starting from the same baseline commit—their changes can collide catastrophically when merging. Traditional `git rebase` assumes textual compatibility. But in the agentic era, one agent might restructure an entire module while another modifies files within it.

As Steve Yegge describes in his analysis of AI agent swarming:

> When the fourth agent D finishes its work, a rebase may no longer be feasible. The system may have changed so much that D's work needs to be completely redesigned and reimplemented on the new system baseline.

This is the **Merge Queue problem**: the reduce phase of agent swarming is arbitrarily complex, potentially requiring full reimplementation rather than mechanical merging.

Ledger is uniquely positioned to solve this. As the control plane for agentic development with native worktree visibility, Ledger can detect divergence severity, assess reconciliation strategies, and dispatch agents to perform semantic rebases.

---

## The Rebase Spectrum

### Level 1: Mechanical Rebase

**What it is**: Standard `git rebase` — replay commits onto a new base.

**Assumes**: Changes are textually compatible. The files you modified still exist in roughly the same shape.

**Fails when**: Someone restructured the module you were working in. Commits can't apply.

**Tooling**: Git CLI, all Git GUIs.

```
git checkout feature-branch
git rebase main
# ✅ Works when changes are additive
# ❌ Fails on structural conflicts
```

---

### Level 2: Conflict-Resolution Rebase

**What it is**: Merge + resolve conflicts with human judgment.

**Assumes**: The *shape* of the code is still compatible. Architecture hasn't fundamentally shifted.

**Fails when**: Your branch assumes a directory structure, API pattern, or architectural approach that no longer exists in main.

**Tooling**: Git CLI, IDEs, merge tools (kdiff3, meld).

```
git checkout feature-branch
git merge main
# Resolve conflicts manually
# ✅ Works when conflicts are localized
# ❌ Fails when architecture has diverged
```

---

### Level 3: Intent-Preserving Rebase (Semantic Rebase)

**What it is**: Extract the *intent* of the feature, then reimplement that intent on the new architecture.

**Assumes**: The feature concept still makes sense in the new architecture.

**Fails when**: The feature is now obsolete or incompatible at the conceptual level.

**Tooling**: Requires AI agent with codebase understanding. **This is what Ledger aims to provide.**

```
Traditional:  code₁ → code₂           (mechanical transformation)
Semantic:     code₁ → intent → code₂  (semantic transformation)
```

The original code becomes *reference material* rather than *source material*. You're not replaying commits—you're rescuing functionality.

---

### Level 4: Semantic Reconciliation

**What it is**: Full understanding of *why* changes were made, enabling decisions about obsolescence.

**Scenario**: Agent A deleted a subsystem. Agent B has changes to that (now-deleted) subsystem.

**Requires**: Understanding why A deleted it. Maybe it was replaced with something better. Maybe B's changes should target the replacement. Or maybe B's work is simply obsolete.

**Tooling**: Requires human judgment or AI with deep context. May require user confirmation for irreversible decisions.

---

## Feature Specification

### Overview

Semantic Rebase adds an AI-powered reconciliation flow to Ledger's branch management. When a branch has diverged significantly from its target, users can invoke Semantic Rebase to:

1. Analyze divergence scope and severity
2. Extract the branch's intent
3. Dispatch an agent to reconcile the branch
4. Review and approve the result

### User Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    Branch Detail Panel                          │
├─────────────────────────────────────────────────────────────────┤
│  feature/auth-v2                                                │
│  ────────────────────────────────────────────────────────────   │
│                                                                 │
│  ⚠️  Significant Divergence Detected                            │
│                                                                 │
│  This branch is 147 commits behind main.                        │
│  Main has undergone structural changes that affect this branch. │
│                                                                 │
│  Conflicting areas:                                             │
│  • src/auth/ (restructured in main)                            │
│  • src/api/middleware.ts (deleted in main)                     │
│  • src/types/ (moved to src/shared/types/)                     │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Rebase Strategy                                         │   │
│  │                                                          │   │
│  │  ○ Mechanical (git rebase) — likely to fail             │   │
│  │  ○ Merge + Manual Conflict Resolution                   │   │
│  │  ● Semantic Rebase — AI-assisted reconciliation         │   │
│  │  ○ Fresh Start — cherry-pick intent to new branch       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  [Analyze Divergence]  [Start Semantic Rebase]                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Divergence Analysis

Before offering rebase options, Ledger analyzes the divergence:

| Metric | Description | Source |
|--------|-------------|--------|
| **Commits Behind** | How many commits is the branch behind target | `git rev-list --count` |
| **Structural Changes** | Directory renames, module moves, file deletions | Diff analysis |
| **Conflict Severity** | Number and complexity of conflicting files | `git merge-tree` |
| **Branch Intent** | Inferred purpose of the branch | Commit messages + diff summary |
| **Overlap Score** | How much branch changes touch areas modified in target | File intersection |

```typescript
interface DivergenceAnalysis {
  commitsBehind: number
  structuralChanges: StructuralChange[]
  conflictSeverity: 'low' | 'medium' | 'high' | 'severe'
  branchIntent: string  // AI-generated summary
  overlapScore: number  // 0-1, higher = more conflict potential
  recommendedStrategy: RebaseStrategy
}

interface StructuralChange {
  type: 'renamed' | 'moved' | 'deleted' | 'restructured'
  path: string
  newPath?: string
  affectsBranch: boolean
}

type RebaseStrategy =
  | 'mechanical'      // Level 1: git rebase
  | 'merge_resolve'   // Level 2: merge + manual
  | 'semantic'        // Level 3: AI-assisted
  | 'fresh_start'     // Level 4: new branch from intent
```

### Semantic Rebase Execution

When the user selects Semantic Rebase, Ledger:

1. **Creates a reconciliation worktree** (isolated from user's work)
2. **Generates context document** for the agent
3. **Dispatches reconciliation agent** with custom instructions
4. **Monitors progress** via worktree activity detection
5. **Presents result** for user review

```
┌─────────────────────────────────────────────────────────────────┐
│                  Semantic Rebase in Progress                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Agent: Claude (reconciliation-agent-1)                        │
│  Worktree: ~/.ledger/reconcile/feature-auth-v2-abc123          │
│  Status: ● Active                                               │
│                                                                 │
│  Progress:                                                      │
│  ✓ Analyzed divergence scope                                   │
│  ✓ Merged main into branch                                     │
│  ✓ Resolved 12 conflicts                                       │
│  ● Rebuilding auth module for new patterns...                  │
│  ○ Verifying functionality                                     │
│  ○ Running tests                                                │
│                                                                 │
│  Live Activity:                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Modified: src/auth/oauth-handler.ts (+47, -23)          │   │
│  │ Modified: src/auth/session.ts (+12, -89)                │   │
│  │ Created:  src/auth/providers/index.ts                   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  [View Worktree]  [Cancel]                                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Agent Instructions Template

The reconciliation agent receives custom instructions based on the divergence analysis:

```markdown
# Semantic Rebase Task

## Context
You are reconciling feature branch `{branch_name}` with `{target_branch}`.
The target has undergone significant structural changes since this branch diverged.

## Branch Intent
{ai_generated_intent_summary}

## Key Structural Changes in Target
{structural_changes_list}

## Conflicting Areas
{conflict_analysis}

## Instructions

1. **Assess Scope**
   Compare this branch against {target_branch} to understand what's diverged in both.

2. **Merge Target**
   Merge {target_branch} into this branch.

3. **Resolve Conflicts**
   Prioritize {target_branch}'s architecture where there are structural disagreements.
   The new patterns in {target_branch} are intentional and should be preserved.

4. **Rebuild/Rescue Feature**
   Reimplement this branch's functionality to work within {target_branch}'s current patterns.
   Reference the original implementation but don't be bound by it.

5. **Verify Functionality**
   Ensure the feature still works as intended.
   Run relevant tests: {test_commands}

## Success Criteria
- No merge conflicts with {target_branch}
- Follows {target_branch}'s current architectural patterns
- Preserves the branch's intended functionality
- All relevant tests pass

## Important Notes
- If divergence is too severe, report back rather than forcing a broken reconciliation.
- Document any functionality that could not be preserved and why.
- Do not modify {target_branch}, only this feature branch.
```

### Result Review

After the agent completes, the user reviews the result:

```
┌─────────────────────────────────────────────────────────────────┐
│                  Semantic Rebase Complete                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ✓ Reconciliation successful                                   │
│                                                                 │
│  Summary:                                                       │
│  • Merged 147 commits from main                                │
│  • Resolved 12 conflicts automatically                         │
│  • Rebuilt auth module for new middleware pattern              │
│  • Migrated types to src/shared/types/                         │
│  • All 23 auth tests passing                                   │
│                                                                 │
│  Changes Made:                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ src/auth/oauth-handler.ts    Rebuilt for new patterns   │   │
│  │ src/auth/session.ts          Migrated to new middleware │   │
│  │ src/auth/providers/index.ts  New file (pattern match)   │   │
│  │ src/shared/types/auth.ts     Types moved here          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Agent Notes:                                                   │
│  "The original auth module used direct database calls. Main    │
│   now uses the repository pattern. Rebuilt OAuth handler to    │
│   use AuthRepository instead of direct queries."               │
│                                                                 │
│  [View Full Diff]  [Accept & Apply]  [Discard]                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Technical Architecture

### New Components

```
┌─────────────────────────────────────────────────────────────────┐
│                      Semantic Rebase System                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────┐  ┌─────────────────┐  ┌────────────────┐  │
│  │   Divergence    │  │    Context      │  │    Agent       │  │
│  │   Analyzer      │  │    Generator    │  │    Dispatcher  │  │
│  └────────┬────────┘  └────────┬────────┘  └───────┬────────┘  │
│           │                    │                    │           │
│           └────────────────────┼────────────────────┘           │
│                                │                                │
│                    ┌───────────▼───────────┐                   │
│                    │   Reconciliation      │                   │
│                    │   Orchestrator        │                   │
│                    └───────────┬───────────┘                   │
│                                │                                │
│           ┌────────────────────┼────────────────────┐          │
│           │                    │                    │           │
│  ┌────────▼────────┐  ┌───────▼────────┐  ┌───────▼────────┐  │
│  │   Worktree      │  │   Progress     │  │   Result       │  │
│  │   Manager       │  │   Monitor      │  │   Reviewer     │  │
│  └─────────────────┘  └────────────────┘  └────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### IPC Channels

| Channel | Parameters | Returns | Description |
|---------|------------|---------|-------------|
| `analyze-divergence` | `branch, target` | `DivergenceAnalysis` | Analyze branch divergence |
| `start-semantic-rebase` | `branch, target, options` | `{ jobId }` | Start reconciliation |
| `get-rebase-progress` | `jobId` | `RebaseProgress` | Get current progress |
| `cancel-semantic-rebase` | `jobId` | `{ success }` | Cancel in-progress rebase |
| `accept-rebase-result` | `jobId` | `{ success }` | Apply reconciled branch |
| `discard-rebase-result` | `jobId` | `{ success }` | Discard and cleanup |

### Data Models

```typescript
interface SemanticRebaseJob {
  id: string
  branch: string
  targetBranch: string
  status: 'analyzing' | 'in_progress' | 'completed' | 'failed' | 'cancelled'
  worktreePath: string
  agentId: string
  startedAt: string
  completedAt?: string
  divergenceAnalysis: DivergenceAnalysis
  result?: SemanticRebaseResult
  error?: string
}

interface SemanticRebaseResult {
  success: boolean
  summary: string
  conflictsResolved: number
  filesModified: FileChange[]
  testsRun: TestResult[]
  agentNotes: string
  functionalityPreserved: boolean
  warnings: string[]
}

interface FileChange {
  path: string
  action: 'modified' | 'created' | 'deleted' | 'renamed'
  description: string  // AI-generated explanation
  additions: number
  deletions: number
}

interface RebaseProgress {
  phase: 'analyzing' | 'merging' | 'resolving' | 'rebuilding' | 'verifying'
  phaseProgress: number  // 0-100
  currentFile?: string
  liveChanges: FileChange[]
  logs: string[]
}
```

### Agent SDK Integration

Semantic Rebase requires integration with a frontier agent SDK. The architecture is SDK-agnostic:

```typescript
interface AgentSDK {
  // Dispatch an agent with instructions
  dispatch(config: AgentConfig): Promise<AgentSession>

  // Monitor agent progress
  onProgress(session: AgentSession, callback: (progress: AgentProgress) => void): void

  // Cancel running agent
  cancel(session: AgentSession): Promise<void>

  // Get final result
  getResult(session: AgentSession): Promise<AgentResult>
}

interface AgentConfig {
  model: 'claude-opus-4' | 'claude-sonnet-4' | 'gpt-4' | string
  workingDirectory: string
  instructions: string
  tools: AgentTool[]  // file editing, git commands, shell access
  maxTokens?: number
  timeout?: number
}
```

**Potential SDK Integrations**:
- Claude Agent SDK (Anthropic) — preferred for Ledger
- OpenAI Assistants API
- Local models via Ollama + tool use
- Cursor/Windsurf agent APIs (if exposed)

---

## UI Components

### New Components

| Component | Location | Description |
|-----------|----------|-------------|
| `DivergenceIndicator` | Branch list item | Badge showing divergence severity |
| `SemanticRebasePanel` | Detail panel | Full rebase UI |
| `RebaseStrategySelector` | SemanticRebasePanel | Strategy radio buttons |
| `RebaseProgressView` | SemanticRebasePanel | Live progress display |
| `RebaseResultReview` | SemanticRebasePanel | Result review and accept/discard |
| `AgentActivityFeed` | RebaseProgressView | Live file changes from agent |

### Integration Points

**Branch Panel**: Add "Semantic Rebase" action when divergence detected.

**Worktree Panel**: Show reconciliation worktrees with special indicator.

**Notification System**: Alert when semantic rebase completes.

---

## Configuration

### User Settings

```typescript
interface SemanticRebaseSettings {
  // Agent model preference
  preferredModel: string

  // Auto-suggest semantic rebase when divergence exceeds threshold
  autoSuggestThreshold: 'low' | 'medium' | 'high' | 'never'

  // Run tests after reconciliation
  runTestsAfterRebase: boolean
  testCommand?: string

  // Require approval before applying result
  requireApproval: boolean

  // Keep reconciliation worktree for inspection
  keepWorktreeOnSuccess: boolean

  // API keys (stored securely)
  anthropicApiKey?: string
  openaiApiKey?: string
}
```

### Defaults

```json
{
  "preferredModel": "claude-sonnet-4",
  "autoSuggestThreshold": "medium",
  "runTestsAfterRebase": true,
  "requireApproval": true,
  "keepWorktreeOnSuccess": false
}
```

---

## Implementation Phases

### Phase 1: Divergence Analysis (No Agent Required)

- Implement `analyze-divergence` IPC channel
- Add divergence indicators to branch list
- Show divergence details in branch panel
- Recommend rebase strategy based on analysis

**Deliverable**: Users can see divergence severity and get strategy recommendations.

### Phase 2: Agent Infrastructure

- Define AgentSDK interface
- Implement worktree management for reconciliation
- Build progress monitoring system
- Create result review UI

**Deliverable**: Infrastructure ready for agent integration.

### Phase 3: Claude Agent SDK Integration

- Integrate with Claude Agent SDK
- Implement instruction generation
- Build agent dispatch and monitoring
- Handle agent errors and timeouts

**Deliverable**: Full semantic rebase with Claude.

### Phase 4: Multi-Agent Support

- Add support for alternative agent SDKs
- Implement model selection UI
- Add local model support (Ollama)
- Cost estimation and tracking

**Deliverable**: Users can choose their preferred agent/model.

### Phase 5: Advanced Features

- Batch semantic rebase (multiple branches)
- Learning from successful rebases
- Custom instruction templates
- Integration with CI/CD

**Deliverable**: Enterprise-ready semantic rebase.

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Rebase Success Rate** | >80% | Successful reconciliations / attempts |
| **Time Saved** | >50% | vs. manual conflict resolution |
| **User Satisfaction** | >4/5 | Post-rebase survey |
| **Functionality Preserved** | >95% | Test pass rate after rebase |
| **Adoption Rate** | >30% | Users with divergent branches using feature |

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Agent makes incorrect changes | High | Require user approval, show full diff |
| API costs too high | Medium | Estimate cost before dispatch, support local models |
| Agent timeout on large rebases | Medium | Chunked reconciliation, progress checkpoints |
| Functionality not preserved | High | Mandatory test run, user verification step |
| SDK API changes | Medium | Abstract SDK interface, version pinning |

---

## Appendix: Manual Prompt (Works Today)

Until Semantic Rebase is implemented in Ledger, users can use this prompt with any frontier coding agent:

```
Reconcile this feature branch with master so it can be merged cleanly.
Do not change master, only this feature branch.

Warning: master has undergone significant structural changes, so this
isn't a simple merge from master to reduce the diff.

Suggested approach:

1. First, assess the scope — compare this branch against master to
   understand what's diverged in both
2. Merge master into this branch
3. Resolve conflicts, prioritizing master's architecture where there
   are structural disagreements
4. Rebuild/rescue feature functionality to work within master's
   current patterns
5. Verify the feature still works as intended

The goal is a PR that:
- Has no merge conflicts with master
- Follows master's current architectural patterns
- Preserves the feature's intended functionality

Note: If the divergence is too severe, it may be faster to cherry-pick
the feature's intent onto a fresh branch from master rather than
wrestling with conflicts.
```

---

## References

- [Steve Yegge: AI Agent Swarming and the Merge Queue Problem](https://steve-yegge.medium.com/)
- [Feature Analysis: AI Integration Opportunities](../analysis/feature-analysis-ai-integration.md)
- [Ledger Architecture](../architecture.md)
- [Worktree Management](./worktrees.md)
