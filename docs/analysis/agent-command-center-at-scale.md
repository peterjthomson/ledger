# Agent Command Center: Scaling to 100+ Agents

**Document Type**: Strategic Vision & Architecture
**Date**: 2025-12-29
**Scope**: Enterprise-scale AI agent orchestration

---

## The Vision Shift

### Current: Local Control Plane
```
1 developer → 3-5 agents → 1 repo → local machine
```

### Future: Agent Command Center
```
1 team → 100+ agents → N repos → distributed infrastructure
```

This isn't just "Ledger but bigger." It's a fundamentally different product category:
**Agent Operations Platform (AgentOps)**

---

## Part 1: The 100-Agent Reality

### What Does 100 Agents Actually Mean?

```
Organization: MegaCorp Engineering

Active Agents by Role:
├── Feature Development (40)
│   ├── Team Alpha: 8 agents on payments-service
│   ├── Team Beta: 12 agents on user-platform
│   ├── Team Gamma: 10 agents on mobile-api
│   └── Team Delta: 10 agents on admin-dashboard
│
├── Bug Fixing (25)
│   ├── P0 Critical: 5 agents (always reserved)
│   ├── P1 High: 10 agents
│   └── P2 Medium: 10 agents
│
├── Code Review (15)
│   ├── Security Review: 5 agents
│   ├── Performance Review: 5 agents
│   └── Style/Standards: 5 agents
│
├── Testing (12)
│   ├── Unit Test Generation: 4 agents
│   ├── Integration Test: 4 agents
│   └── E2E Test Maintenance: 4 agents
│
├── Maintenance (5)
│   ├── Dependency Updates: 2 agents
│   ├── Documentation: 2 agents
│   └── Tech Debt: 1 agent
│
└── Auditing (3)
    ├── Security Audit: 1 agent
    ├── Compliance Audit: 1 agent
    └── Architecture Audit: 1 agent

Repos: 47 active repositories
Worktrees: 200+ active at any time
Events/hour: 2,000+
```

---

## Part 2: Core Abstractions

### 2.1 Agent Registry

Every agent is a first-class entity with identity and capabilities.

```typescript
interface Agent {
  id: string                    // agent-claude-prod-047
  type: AgentType               // claude | cursor | gemini | custom
  role: AgentRole               // developer | reviewer | tester | auditor
  capabilities: Capability[]    // [code-gen, review, test-gen, refactor]
  status: AgentStatus           // idle | working | blocked | errored

  // Resource tracking
  currentTask: Task | null
  worktree: Worktree | null
  resourceUsage: ResourceMetrics

  // Performance history
  completionRate: number        // 94.2%
  avgTaskDuration: Duration
  reworkRate: number            // 8% of commits amended/reverted
  costPerTask: Money

  // Constraints
  maxConcurrentTasks: number
  allowedRepos: string[]
  allowedOperations: Operation[]
}

interface AgentPool {
  name: string                  // "feature-development"
  agents: Agent[]
  scalingPolicy: ScalingPolicy  // min: 5, max: 20, scaleOn: queueDepth
  priorityRules: PriorityRule[]
}
```

### 2.2 Task Queue System

Work flows through a prioritized queue system.

```typescript
interface Task {
  id: string
  type: TaskType                // feature | bugfix | review | test | audit
  priority: Priority            // P0 | P1 | P2 | P3
  status: TaskStatus            // queued | assigned | in_progress | review | done | failed

  // Context
  repo: Repository
  branch: string
  sourceIssue: Issue | null
  sourcePR: PullRequest | null

  // Assignment
  assignedAgent: Agent | null
  assignedAt: Timestamp | null
  estimatedCompletion: Timestamp | null

  // Dependencies
  blockedBy: Task[]
  blocks: Task[]

  // Output
  commits: Commit[]
  pullRequest: PullRequest | null
  artifacts: Artifact[]
}

interface TaskQueue {
  pending: Task[]
  inProgress: Task[]
  blocked: Task[]
  completed: Task[]
  failed: Task[]

  // Queue operations
  enqueue(task: Task, priority: Priority): void
  assignNext(agent: Agent): Task | null
  requeue(task: Task, reason: string): void
  escalate(task: Task, newPriority: Priority): void
}
```

### 2.3 Event Stream

Everything generates events. Events are the nervous system.

```typescript
type AgentEvent =
  | { type: 'agent.started', agent: Agent, task: Task }
  | { type: 'agent.commit', agent: Agent, commit: Commit }
  | { type: 'agent.blocked', agent: Agent, reason: string }
  | { type: 'agent.completed', agent: Agent, task: Task, result: Result }
  | { type: 'agent.failed', agent: Agent, task: Task, error: Error }
  | { type: 'agent.idle', agent: Agent }

type RepoEvent =
  | { type: 'repo.push', repo: Repo, branch: string, commits: Commit[] }
  | { type: 'repo.pr.opened', repo: Repo, pr: PullRequest }
  | { type: 'repo.pr.merged', repo: Repo, pr: PullRequest }
  | { type: 'repo.pr.commented', repo: Repo, pr: PullRequest, comment: Comment }
  | { type: 'repo.ci.passed', repo: Repo, branch: string }
  | { type: 'repo.ci.failed', repo: Repo, branch: string, failures: Failure[] }

type ConflictEvent =
  | { type: 'conflict.detected', agents: Agent[], files: string[] }
  | { type: 'conflict.resolved', resolution: Resolution }
  | { type: 'conflict.escalated', toHuman: User }

type SystemEvent =
  | { type: 'system.agent.pool.scaled', pool: string, from: number, to: number }
  | { type: 'system.budget.warning', spent: Money, budget: Money }
  | { type: 'system.rate.limited', provider: string, retryAfter: Duration }
```

### 2.4 Project & Repository Model

Multi-repo, multi-project hierarchy.

```typescript
interface Organization {
  id: string
  name: string
  projects: Project[]
  agentPools: AgentPool[]
  budgets: Budget[]
  policies: Policy[]
}

interface Project {
  id: string
  name: string                  // "E-Commerce Platform"
  repos: Repository[]
  teams: Team[]
  agentAllocation: AgentAllocation
}

interface Repository {
  id: string
  name: string
  remoteUrl: string
  defaultBranch: string

  // State
  activeBranches: Branch[]
  activeWorktrees: Worktree[]
  openPRs: PullRequest[]

  // Config
  protectedBranches: string[]
  requiredReviewers: ReviewerConfig
  agentPermissions: AgentPermissions

  // Metrics
  agentActivity: ActivityMetrics
  humanActivity: ActivityMetrics
}
```

---

## Part 3: Command Center UI

### 3.1 Dashboard Views

#### Fleet Overview (Default)
```
┌─────────────────────────────────────────────────────────────────────────┐
│ AGENT COMMAND CENTER                                    [Settings] [?]  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  FLEET STATUS                          ACTIVITY (24h)                   │
│  ┌─────────────────────────────┐      ┌────────────────────────────┐   │
│  │ ● Active    87/100          │      │ ▁▂▃▅▇█▇▅▃▂▁▂▃▅▇█▇▅▃▂▁▂▃▅ │   │
│  │ ○ Idle      8/100           │      │ Commits: 1,247  PRs: 89    │   │
│  │ ⚠ Blocked   3/100           │      └────────────────────────────┘   │
│  │ ✗ Errored   2/100           │                                       │
│  └─────────────────────────────┘      COST TODAY                       │
│                                       ┌────────────────────────────┐   │
│  QUEUE DEPTH                          │ $127.43 / $500 budget      │   │
│  ┌─────────────────────────────┐      │ ████████░░░░░░░░ 25%       │   │
│  │ P0: ■■ 2                    │      │ Projection: $412 by EOD    │   │
│  │ P1: ■■■■■■■ 15              │      └────────────────────────────┘   │
│  │ P2: ■■■■■■■■■■■■■■ 47       │                                       │
│  │ P3: ■■■■■■■■■■ 23           │      ALERTS                           │
│  └─────────────────────────────┘      ┌────────────────────────────┐   │
│                                       │ ⚠ 3 agents blocked >15min  │   │
│  BY ROLE                              │ ⚠ payments-api CI failing  │   │
│  ┌─────────────────────────────┐      │ ● 2 PRs ready for human    │   │
│  │ Feature Dev  ████████ 40    │      └────────────────────────────┘   │
│  │ Bug Fix      █████ 25       │                                       │
│  │ Review       ███ 15         │                                       │
│  │ Testing      ██ 12          │                                       │
│  │ Maintenance  █ 5            │                                       │
│  │ Audit        █ 3            │                                       │
│  └─────────────────────────────┘                                       │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│ LIVE FEED                                              [Filter] [Pause] │
├─────────────────────────────────────────────────────────────────────────┤
│ 14:23:07  agent-047 completed feature/user-preferences (PR #1234)      │
│ 14:23:05  agent-012 started review of PR #1231                         │
│ 14:22:58  agent-089 committed "fix: null check in payment flow"        │
│ 14:22:45  CONFLICT: agent-023 & agent-024 both modified auth.ts        │
│ 14:22:41  agent-056 blocked: awaiting human approval on schema change  │
│ 14:22:33  CI passed: user-platform/feature/notifications               │
└─────────────────────────────────────────────────────────────────────────┘
```

#### Agent Detail View
```
┌─────────────────────────────────────────────────────────────────────────┐
│ AGENT: claude-prod-047                              [Pause] [Reassign]  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  STATUS: ● Working                    CURRENT TASK                      │
│  ROLE: Feature Developer              ┌────────────────────────────┐   │
│  POOL: feature-development            │ ID: task-8847              │   │
│  UPTIME: 4h 23m                       │ Type: Feature              │   │
│                                       │ Repo: payments-service     │   │
│  CAPABILITIES                         │ Branch: feature/refunds    │   │
│  ┌─────────────────────────────┐      │ Started: 47 min ago        │   │
│  │ ✓ Code Generation           │      │ Progress: ~70%             │   │
│  │ ✓ Refactoring               │      │ Commits: 4                 │   │
│  │ ✓ Test Writing              │      └────────────────────────────┘   │
│  │ ✗ Security Review           │                                       │
│  │ ✗ Architecture Decisions    │      RECENT COMMITS                   │
│  └─────────────────────────────┘      ┌────────────────────────────┐   │
│                                       │ 14:21 feat: refund API     │   │
│  PERFORMANCE (7d)                     │ 14:08 feat: refund model   │   │
│  ┌─────────────────────────────┐      │ 13:52 test: refund specs   │   │
│  │ Tasks Completed: 23         │      │ 13:41 chore: setup branch  │   │
│  │ Avg Duration: 52 min        │      └────────────────────────────┘   │
│  │ Success Rate: 96%           │                                       │
│  │ Rework Rate: 4%             │      WORKTREE                         │
│  │ Cost: $34.21                │      /worktrees/payments/refunds      │
│  │ Lines Written: 4,892        │      Changed: 12 files (+847 -123)    │
│  └─────────────────────────────┘                                       │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│ AGENT LOG                                                    [Export]   │
├─────────────────────────────────────────────────────────────────────────┤
│ 14:21:33 [COMMIT] "feat: implement refund calculation logic"           │
│ 14:21:30 [THINK] Need to handle partial refunds differently...         │
│ 14:20:15 [READ] Analyzing existing payment models...                   │
│ 14:19:44 [THINK] Starting with the refund data model...                │
│ 14:19:01 [START] Assigned task-8847: Implement refund feature          │
└─────────────────────────────────────────────────────────────────────────┘
```

#### Project Overview
```
┌─────────────────────────────────────────────────────────────────────────┐
│ PROJECT: E-Commerce Platform                         [Settings] [Edit]  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  REPOSITORIES                          AGENT ALLOCATION                 │
│  ┌─────────────────────────────┐      ┌────────────────────────────┐   │
│  │ ● payments-service     12▲  │      │ This Project: 35 agents    │   │
│  │ ● user-platform        8▲   │      │ ├── Feature: 20            │   │
│  │ ● mobile-api           6▲   │      │ ├── Bugs: 8                │   │
│  │ ○ admin-dashboard      2    │      │ ├── Review: 5              │   │
│  │ ○ shared-libs          1    │      │ └── Test: 2                │   │
│  └─────────────────────────────┘      └────────────────────────────┘   │
│  ▲ = agents actively working                                           │
│                                                                         │
│  OPEN WORK                             RECENT ACTIVITY                  │
│  ┌─────────────────────────────┐      ┌────────────────────────────┐   │
│  │ PRs Awaiting Review: 12     │      │ Today:                     │   │
│  │ PRs Awaiting Human: 3       │      │   47 commits, 8 PRs merged │   │
│  │ Blocked Tasks: 2            │      │ This Week:                 │   │
│  │ Failed Tasks: 1             │      │   312 commits, 45 PRs      │   │
│  └─────────────────────────────┘      └────────────────────────────┘   │
│                                                                         │
│  HEALTH METRICS                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ payments    ████████████████████░░░░ 82% healthy                │   │
│  │ user-plat   █████████████████████░░░ 87% healthy                │   │
│  │ mobile-api  ██████████████░░░░░░░░░░ 58% healthy (3 failing)    │   │
│  │ admin       █████████████████████████ 100% healthy              │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

#### Conflict Resolution View
```
┌─────────────────────────────────────────────────────────────────────────┐
│ CONFLICT DETECTED                                    [Auto] [Manual]    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  AGENTS INVOLVED                       CONFLICTING FILES                │
│  ┌─────────────────────────────┐      ┌────────────────────────────┐   │
│  │ agent-023 (feature/oauth)   │      │ src/auth/middleware.ts     │   │
│  │   Working on: OAuth flow    │      │   023: +45 lines (OAuth)   │   │
│  │   Progress: 60%             │      │   024: +23 lines (Session) │   │
│  │                             │      │                            │   │
│  │ agent-024 (feature/session) │      │ src/auth/types.ts          │   │
│  │   Working on: Session mgmt  │      │   023: +12 lines           │   │
│  │   Progress: 40%             │      │   024: +8 lines            │   │
│  └─────────────────────────────┘      └────────────────────────────┘   │
│                                                                         │
│  ANALYSIS                                                               │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Conflict Type: PARALLEL FEATURE DEVELOPMENT                     │   │
│  │                                                                  │   │
│  │ agent-023 is adding OAuth authentication flow                   │   │
│  │ agent-024 is refactoring session management                     │   │
│  │                                                                  │   │
│  │ Both modify the auth middleware, but for different purposes:    │   │
│  │ - 023: Adding OAuth token validation                            │   │
│  │ - 024: Changing session storage mechanism                       │   │
│  │                                                                  │   │
│  │ RECOMMENDATION: Changes are COMPATIBLE                          │   │
│  │ Both can be merged if 024 rebases onto 023's changes           │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  RESOLUTION OPTIONS                                                     │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ [1] Auto-merge: Pause 024, merge 023 first, rebase 024          │   │
│  │ [2] Coordinate: Have 024 wait for 023 to complete               │   │
│  │ [3] Partition: Split middleware.ts, assign sections             │   │
│  │ [4] Escalate: Flag for human decision                           │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│                              [Apply Resolution] [Escalate to Human]     │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Review Queue (Human-in-the-Loop)

```
┌─────────────────────────────────────────────────────────────────────────┐
│ HUMAN REVIEW QUEUE                                   [Filter] [Sort]    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  AWAITING YOUR REVIEW (7)                                               │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ ⚡ PR #1234 - Database schema migration                         │   │
│  │    Agent: claude-047 | Risk: HIGH | Waiting: 2h 15m             │   │
│  │    Reason: Schema changes require human approval                │   │
│  │    [Review] [Approve] [Reject] [Discuss]                        │   │
│  ├─────────────────────────────────────────────────────────────────┤   │
│  │ ● PR #1231 - Add payment retry logic                            │   │
│  │    Agent: claude-012 | Risk: MEDIUM | Waiting: 45m              │   │
│  │    Reason: Touches payment processing code                      │   │
│  │    [Review] [Approve] [Reject] [Discuss]                        │   │
│  ├─────────────────────────────────────────────────────────────────┤   │
│  │ ○ PR #1229 - Update user preferences API                        │   │
│  │    Agent: claude-089 | Risk: LOW | Waiting: 12m                 │   │
│  │    Reason: API contract change                                  │   │
│  │    [Review] [Approve] [Reject] [Discuss]                        │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  DECISIONS NEEDED (3)                                                   │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ ? Architecture: Should refunds be separate service?             │   │
│  │   Agent claude-047 is blocked awaiting decision                 │   │
│  │   [Yes, separate] [No, keep in payments] [Discuss]              │   │
│  ├─────────────────────────────────────────────────────────────────┤   │
│  │ ? Conflict: Two agents modifying auth.ts                        │   │
│  │   Agents 023 & 024 have overlapping changes                     │   │
│  │   [View Conflict] [Auto-resolve] [Manual merge]                 │   │
│  ├─────────────────────────────────────────────────────────────────┤   │
│  │ ? Priority: Should we pause feature work for P0 bug?            │   │
│  │   Critical bug in production, need 5 more agents                │   │
│  │   [Reassign agents] [Keep current] [Partial reassign]           │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Part 4: Orchestration Patterns

### 4.1 Task Assignment Strategies

```typescript
interface AssignmentStrategy {
  name: string
  evaluate(task: Task, agents: Agent[]): Agent | null
}

// Round-robin for even distribution
const roundRobin: AssignmentStrategy = {
  name: 'round-robin',
  evaluate: (task, agents) => {
    const idle = agents.filter(a => a.status === 'idle')
    return idle.sort((a, b) => a.lastTaskTime - b.lastTaskTime)[0]
  }
}

// Specialist matching
const specialist: AssignmentStrategy = {
  name: 'specialist',
  evaluate: (task, agents) => {
    const capable = agents.filter(a =>
      a.capabilities.includes(task.requiredCapability) &&
      a.status === 'idle'
    )
    return capable.sort((a, b) => b.successRate - a.successRate)[0]
  }
}

// Affinity-based (same agent for related tasks)
const affinity: AssignmentStrategy = {
  name: 'affinity',
  evaluate: (task, agents) => {
    // Prefer agent that worked on related code recently
    const withAffinity = agents.find(a =>
      a.recentFiles.some(f => task.affectedFiles.includes(f))
    )
    return withAffinity || roundRobin.evaluate(task, agents)
  }
}

// Cost-optimized
const costOptimized: AssignmentStrategy = {
  name: 'cost-optimized',
  evaluate: (task, agents) => {
    const capable = agents.filter(a => a.status === 'idle')
    return capable.sort((a, b) => a.costPerTask - b.costPerTask)[0]
  }
}
```

### 4.2 Workflow Templates

```yaml
# Feature Development Workflow
workflow: feature-development
trigger: issue.labeled('feature')

steps:
  - name: Create Branch
    agent: any
    action: git.createBranch
    params:
      name: "feature/{{ issue.number }}-{{ issue.slug }}"
      from: main

  - name: Implement Feature
    agent: role:developer
    action: code.implement
    params:
      context: "{{ issue.body }}"
      acceptanceCriteria: "{{ issue.acceptance_criteria }}"
    timeout: 4h

  - name: Write Tests
    agent: role:tester
    action: code.writeTests
    params:
      coverage: 80%
    dependsOn: [Implement Feature]

  - name: Security Review
    agent: role:security-reviewer
    action: review.security
    dependsOn: [Write Tests]

  - name: Code Review
    agent: role:reviewer
    action: review.code
    dependsOn: [Security Review]

  - name: Create PR
    agent: any
    action: github.createPR
    params:
      title: "feat: {{ issue.title }}"
      reviewers: [human:team-lead]
    dependsOn: [Code Review]

  - name: Await Human Approval
    type: human-gate
    approvers: [team-lead, tech-lead]

  - name: Merge
    agent: any
    action: github.merge
    params:
      method: squash
    dependsOn: [Await Human Approval]
```

```yaml
# Bug Fix Workflow (Expedited)
workflow: bug-fix
trigger: issue.labeled('bug')

steps:
  - name: Reproduce
    agent: role:developer
    action: code.reproduce
    params:
      issue: "{{ issue }}"
    timeout: 30m

  - name: Diagnose
    agent: same  # Same agent continues
    action: code.diagnose
    timeout: 1h

  - name: Fix
    agent: same
    action: code.fix
    timeout: 2h

  - name: Verify Fix
    agent: role:tester
    action: test.verify
    dependsOn: [Fix]

  - name: Fast-track Review
    agent: role:reviewer
    action: review.expedited
    params:
      focusOn: [regression, side-effects]
    dependsOn: [Verify Fix]

  - name: Create PR
    agent: any
    action: github.createPR
    params:
      labels: [bug, expedited]
      reviewers: [human:on-call]
    dependsOn: [Fast-track Review]
```

```yaml
# Code Audit Workflow (Scheduled)
workflow: security-audit
trigger: schedule.weekly(sunday, 2am)

steps:
  - name: Dependency Scan
    agent: role:auditor
    action: audit.dependencies
    params:
      repos: all
      severity: [critical, high]

  - name: Secret Scan
    agent: role:auditor
    action: audit.secrets
    parallel: true

  - name: SAST Scan
    agent: role:auditor
    action: audit.sast
    parallel: true

  - name: Generate Report
    agent: role:auditor
    action: report.generate
    dependsOn: [Dependency Scan, Secret Scan, SAST Scan]

  - name: Create Issues
    agent: any
    action: github.createIssues
    params:
      fromFindings: "{{ report.findings }}"
      labels: [security, auto-generated]
    dependsOn: [Generate Report]

  - name: Notify Team
    action: notify.slack
    params:
      channel: "#security"
      summary: "{{ report.summary }}"
```

### 4.3 Conflict Resolution Strategies

```typescript
interface ConflictResolver {
  detect(worktrees: Worktree[]): Conflict[]
  analyze(conflict: Conflict): ConflictAnalysis
  resolve(conflict: Conflict, strategy: ResolutionStrategy): Resolution
}

type ResolutionStrategy =
  | { type: 'serialize', order: Agent[] }      // One after another
  | { type: 'partition', assignments: Map<string, Agent> }  // Split files
  | { type: 'merge', baseAgent: Agent }        // One agent merges both
  | { type: 'escalate', to: User }             // Human decides
  | { type: 'abort', agent: Agent }            // Cancel one agent's work

// Automatic resolution rules
const autoResolveRules: Rule[] = [
  {
    condition: (c) => c.type === 'parallel-edit' && c.filesOverlap < 20,
    strategy: { type: 'serialize', order: 'by-progress' }
  },
  {
    condition: (c) => c.type === 'parallel-edit' && c.changesCompatible,
    strategy: { type: 'merge', baseAgent: 'most-progress' }
  },
  {
    condition: (c) => c.type === 'architectural',
    strategy: { type: 'escalate', to: 'tech-lead' }
  }
]
```

---

## Part 5: Event Processing & Automation

### 5.1 Event-Driven Rules Engine

```typescript
// Rule definitions
const rules: Rule[] = [
  // Auto-assign P0 bugs
  {
    name: 'p0-immediate-assignment',
    trigger: 'issue.created',
    condition: (e) => e.issue.labels.includes('P0'),
    action: async (e, ctx) => {
      const agent = await ctx.agentPool.getAvailable('bug-fix', { priority: true })
      await ctx.taskQueue.enqueue({
        type: 'bugfix',
        priority: 'P0',
        issue: e.issue,
        assignTo: agent
      })
      await ctx.notify.slack('#incidents', `P0 bug assigned to ${agent.id}`)
    }
  },

  // Auto-merge when ready
  {
    name: 'auto-merge-approved',
    trigger: 'pr.review.approved',
    condition: (e) =>
      e.pr.approvals.human >= 1 &&
      e.pr.approvals.bot >= 2 &&
      e.pr.ci.status === 'passed' &&
      !e.pr.labels.includes('hold'),
    action: async (e, ctx) => {
      await ctx.github.merge(e.pr, { method: 'squash' })
      await ctx.notify.pr(e.pr, 'Auto-merged after approval')
    }
  },

  // Blocked agent escalation
  {
    name: 'blocked-agent-alert',
    trigger: 'agent.blocked',
    condition: (e) => e.blockedDuration > minutes(15),
    action: async (e, ctx) => {
      await ctx.notify.slack('#agent-ops',
        `Agent ${e.agent.id} blocked for ${e.blockedDuration}: ${e.reason}`)
      await ctx.metrics.increment('agent.blocked.escalated')
    }
  },

  // Cost budget warning
  {
    name: 'budget-warning',
    trigger: 'system.cost.updated',
    condition: (e) => e.spent / e.budget > 0.8,
    action: async (e, ctx) => {
      await ctx.notify.email('engineering-leads',
        `Agent budget 80% consumed: $${e.spent}/$${e.budget}`)
      // Optionally reduce agent count
      if (e.spent / e.budget > 0.95) {
        await ctx.agentPool.scale('feature-development', { to: 'minimum' })
      }
    }
  },

  // CI failure response
  {
    name: 'ci-failure-auto-fix',
    trigger: 'repo.ci.failed',
    condition: (e) => e.failure.type === 'test' && e.failure.isFlaky === false,
    action: async (e, ctx) => {
      const task = await ctx.taskQueue.enqueue({
        type: 'bugfix',
        priority: 'P1',
        context: e.failure,
        repo: e.repo,
        branch: e.branch
      })
      await ctx.notify.pr(e.pr, `CI failure detected, agent assigned: ${task.id}`)
    }
  }
]
```

### 5.2 Metrics & Observability

```typescript
interface MetricsCollector {
  // Agent metrics
  agentUtilization: Gauge           // % time agents are working
  agentQueueDepth: Gauge            // Tasks waiting
  agentTaskDuration: Histogram      // Time to complete tasks
  agentSuccessRate: Gauge           // % successful completions
  agentCostPerTask: Histogram       // $ per task

  // Throughput metrics
  commitsPerHour: Counter
  prsOpenedPerHour: Counter
  prsMergedPerHour: Counter
  issuesClosedPerHour: Counter

  // Quality metrics
  reworkRate: Gauge                 // % commits amended/reverted
  reviewRejectionRate: Gauge        // % PRs rejected
  bugEscapeRate: Gauge              // Bugs found in prod vs dev

  // System metrics
  eventProcessingLatency: Histogram
  apiRateLimitHits: Counter
  conflictDetectionRate: Gauge
}

// Dashboard queries
const dashboardPanels = {
  fleetHealth: `
    SELECT
      status,
      COUNT(*) as count,
      AVG(task_duration) as avg_duration
    FROM agents
    WHERE last_active > NOW() - INTERVAL '1 hour'
    GROUP BY status
  `,

  costTrend: `
    SELECT
      DATE_TRUNC('hour', timestamp) as hour,
      SUM(cost) as total_cost,
      COUNT(DISTINCT agent_id) as active_agents
    FROM agent_tasks
    WHERE timestamp > NOW() - INTERVAL '24 hours'
    GROUP BY hour
    ORDER BY hour
  `,

  topPerformers: `
    SELECT
      agent_id,
      COUNT(*) as tasks_completed,
      AVG(success_rate) as success_rate,
      SUM(cost) as total_cost
    FROM agent_tasks
    WHERE timestamp > NOW() - INTERVAL '7 days'
    GROUP BY agent_id
    ORDER BY tasks_completed DESC
    LIMIT 10
  `
}
```

---

## Part 6: Human-in-the-Loop Design

### 6.1 Approval Gates

```typescript
type ApprovalGate =
  | { type: 'any', approvers: User[], minApprovals: number }
  | { type: 'all', approvers: User[] }
  | { type: 'role', role: string, minApprovals: number }
  | { type: 'conditional', condition: (pr: PR) => User[] }

const approvalPolicies: Record<string, ApprovalGate> = {
  // Schema changes need DBA approval
  'database-schema': {
    type: 'role',
    role: 'dba',
    minApprovals: 1
  },

  // Security changes need security team
  'security-critical': {
    type: 'all',
    approvers: ['security-lead', 'cto']
  },

  // Regular features need any senior dev
  'feature': {
    type: 'role',
    role: 'senior-developer',
    minApprovals: 1
  },

  // Hotfixes can be approved by on-call
  'hotfix': {
    type: 'any',
    approvers: ['on-call-primary', 'on-call-secondary'],
    minApprovals: 1
  }
}
```

### 6.2 Escalation Paths

```typescript
interface EscalationPath {
  trigger: EscalationTrigger
  levels: EscalationLevel[]
}

const escalationPaths: EscalationPath[] = [
  {
    trigger: { type: 'agent-blocked', duration: minutes(15) },
    levels: [
      { notify: 'slack:#agent-ops', after: minutes(0) },
      { notify: 'pager:on-call', after: minutes(30) },
      { notify: 'pager:engineering-lead', after: hours(1) }
    ]
  },
  {
    trigger: { type: 'pr-stale', duration: hours(24) },
    levels: [
      { notify: 'slack:author', after: hours(0) },
      { notify: 'email:team-lead', after: hours(48) },
      { action: 'auto-close', after: days(7) }
    ]
  },
  {
    trigger: { type: 'conflict-unresolved', duration: minutes(30) },
    levels: [
      { notify: 'slack:#agent-ops', after: minutes(0) },
      { action: 'pause-both-agents', after: minutes(45) },
      { notify: 'pager:tech-lead', after: hours(1) }
    ]
  }
]
```

### 6.3 Decision Capture

```typescript
// Every human decision is captured for learning
interface Decision {
  id: string
  timestamp: Timestamp
  context: DecisionContext
  options: Option[]
  chosen: Option
  decidedBy: User
  reasoning: string | null
  outcome: Outcome | null  // Filled in later
}

// Use decisions to improve future automation
async function learnFromDecisions(decisions: Decision[]) {
  // Cluster similar decisions
  const clusters = clusterByContext(decisions)

  for (const cluster of clusters) {
    // If humans consistently choose the same option...
    if (cluster.consistency > 0.9) {
      // Suggest new automation rule
      suggestRule({
        condition: cluster.commonContext,
        action: cluster.dominantChoice,
        confidence: cluster.consistency
      })
    }
  }
}
```

---

## Part 7: Security & Governance

### 7.1 Agent Permissions Model

```typescript
interface AgentPermissions {
  // Repository access
  repos: {
    allowed: string[]           // ['payments-*', 'user-*']
    denied: string[]            // ['infrastructure', 'secrets']
  }

  // Operation limits
  operations: {
    canCreateBranch: boolean
    canDeleteBranch: boolean
    canForcePush: boolean       // Usually false
    canMergeToMain: boolean     // Usually false
    canModifyCI: boolean        // Usually false
    canAccessSecrets: boolean   // Usually false
  }

  // File restrictions
  files: {
    cannotModify: string[]      // ['.env*', '*secret*', 'infrastructure/*']
    requiresApproval: string[]  // ['**/schema.sql', '**/migration*']
  }

  // Resource limits
  limits: {
    maxConcurrentTasks: number
    maxTokensPerTask: number
    maxCostPerDay: Money
    maxFilesPerCommit: number
  }
}
```

### 7.2 Audit Trail

```typescript
interface AuditEvent {
  id: string
  timestamp: Timestamp
  actor: Agent | User | System
  action: string
  resource: string
  details: Record<string, any>
  outcome: 'success' | 'failure' | 'denied'

  // For compliance
  ipAddress?: string
  userAgent?: string
  sessionId?: string
}

// All agent actions are logged
const auditMiddleware = (action: AgentAction) => {
  return async (ctx: Context) => {
    const event: AuditEvent = {
      id: uuid(),
      timestamp: now(),
      actor: ctx.agent,
      action: action.name,
      resource: action.target,
      details: action.params,
      outcome: 'pending'
    }

    try {
      const result = await action.execute(ctx)
      event.outcome = 'success'
      return result
    } catch (err) {
      event.outcome = err.code === 'DENIED' ? 'denied' : 'failure'
      throw err
    } finally {
      await auditLog.write(event)
    }
  }
}
```

---

## Part 8: Implementation Phases

### Phase 1: Foundation (Current → +3 months)
- [ ] Agent registry and basic status tracking
- [ ] Simple task queue (manual assignment)
- [ ] Event stream infrastructure
- [ ] Basic dashboard (fleet overview)
- [ ] Single-repo focus

### Phase 2: Orchestration (+3 → +6 months)
- [ ] Automatic task assignment
- [ ] Workflow templates (feature, bug, review)
- [ ] Conflict detection (not resolution)
- [ ] Multi-repo support
- [ ] Cost tracking

### Phase 3: Intelligence (+6 → +9 months)
- [ ] Conflict resolution suggestions
- [ ] Performance analytics
- [ ] Workflow optimization recommendations
- [ ] Human decision capture
- [ ] Basic automation rules

### Phase 4: Scale (+9 → +12 months)
- [ ] 100+ agent support
- [ ] Cross-repo orchestration
- [ ] Advanced automation (auto-merge, auto-fix)
- [ ] Custom workflow builder
- [ ] Enterprise features (SSO, audit, compliance)

---

## Conclusion

Scaling Ledger from 3 agents to 100 requires a fundamental shift:

| Aspect | Current (3 agents) | Scale (100 agents) |
|--------|-------------------|-------------------|
| Visibility | See all at once | Dashboards + drill-down |
| Assignment | Manual | Queue + strategies |
| Conflicts | Rare, handle ad-hoc | Common, automated resolution |
| Governance | Trust | Permissions + audit |
| Cost | Negligible | Budget management |
| Humans | Do the work | Approve + decide |

The key insight: **At scale, humans shift from "doing" to "governing."**

The Command Center's job is to:
1. Keep agents productive (assignment, unblocking)
2. Surface what needs human attention (review queue)
3. Prevent chaos (conflict resolution, governance)
4. Provide visibility (dashboards, metrics)
5. Enable learning (decision capture, optimization)

This is **AgentOps** - the operational discipline for managing AI coding agents at scale.
