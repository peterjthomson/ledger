# Agent Dispatch SDK/API Research

> Research for unified task dispatch from Ledger to multiple AI coding agents.
> Last updated: January 2025

## Executive Summary

| Agent | SDK/API Available | Dispatch Method | Maturity |
|-------|-------------------|-----------------|----------|
| **Claude Code** | ✅ Full SDK (TS/Python) + CLI | CLI (`-p` flag) or SDK `query()` | Production |
| **OpenAI Codex** | ✅ Full SDK (TypeScript) | SDK threads or CLI `exec` | Production |
| **Cursor** | ✅ REST API (Cloud Agents) | HTTP POST to `/v0/agents` | Beta |
| **Jules** | ✅ REST API + CLI | HTTP POST to `/v1alpha/sessions` | Alpha |
| **Gemini CLI** | ⚠️ CLI only (headless mode) | CLI with `--output-format json` | Production |
| **OpenCode** | ✅ SDK (TypeScript) | SDK sessions + chat | Production |
| **Junie** | ❌ No public API | IDE plugin / ACP protocol | No API |

---

## 1. Claude Code (Anthropic)

### Overview
Claude Code provides the most comprehensive programmatic interface through the **Claude Agent SDK**, available in both TypeScript and Python. It powers Claude Code itself and can be used to build custom agents.

### Installation

```bash
# TypeScript
npm install @anthropic-ai/claude-agent-sdk

# Python
pip install claude-agent-sdk
```

### Dispatch Methods

#### Method A: CLI with `-p` flag (simplest)
```bash
# Basic prompt
claude -p "Fix the TypeScript errors in src/app.ts"

# With JSON output
claude -p "List all TODO comments" --output-format json

# With tool permissions
claude -p "Create a commit for staged changes" \
  --allowedTools "Bash(git diff:*),Bash(git commit:*)"

# With working directory
claude -p "Run the tests" --cwd /path/to/project
```

#### Method B: TypeScript SDK
```typescript
import { query } from '@anthropic-ai/claude-agent-sdk';

// Basic agent query
const result = await query({
  prompt: "Fix the authentication bug in login.ts",
  workingDirectory: "/path/to/repo",
  allowedTools: ["Read", "Edit", "Bash"],
  permissionMode: "acceptEdits"
});

// Stream responses
for await (const message of result) {
  console.log(message);
}
```

#### Method C: Python SDK
```python
from claude_agent_sdk import ClaudeAgent, ClaudeAgentOptions

agent = ClaudeAgent(ClaudeAgentOptions(
    allowed_tools=["Read", "Edit", "Glob", "Bash"],
    permission_mode="acceptEdits"
))

result = await agent.query("Refactor the database module")
```

### Key Features
- **Subagent spawning**: Can launch specialized subagents for complex tasks
- **Tool control**: Fine-grained `--allowedTools` permissions
- **JSON schema output**: Structured responses with validation
- **Session persistence**: Resume previous sessions
- **MCP integration**: Extend with Model Context Protocol servers

### Output Formats
- Plain text (default)
- JSON (`--output-format json`)
- Structured JSON with schema validation (`--json-schema`)
- Streaming messages (SDK)

### Resources
- [Headless Mode Docs](https://code.claude.com/docs/en/headless)
- [Agent SDK TypeScript](https://github.com/anthropics/claude-agent-sdk-typescript)
- [SDK Demos](https://github.com/anthropics/claude-agent-sdk-demos)
- [TypeScript Reference](https://platform.claude.com/docs/en/agent-sdk/typescript)

---

## 2. OpenAI Codex

### Overview
Codex provides a full **TypeScript SDK** (`@openai/codex-sdk`) that wraps the CLI binary and exchanges JSONL events over stdin/stdout. Also supports cloud task dispatch.

### Installation

```bash
npm install @openai/codex-sdk
# Requires Node.js 18+
```

### Dispatch Methods

#### Method A: TypeScript SDK (recommended)
```typescript
import { Codex } from "@openai/codex-sdk";

const codex = new Codex();
const thread = codex.startThread({
  workingDirectory: "/path/to/project"
});

// Simple dispatch
const turn = await thread.run("Diagnose the test failure and propose a fix");
console.log(turn.finalResponse);

// Streaming events
const { events } = await thread.runStreamed("Fix the bug");
for await (const event of events) {
  switch (event.type) {
    case "item.completed":
      console.log("Progress:", event.item);
      break;
    case "turn.completed":
      console.log("Done!");
      break;
  }
}
```

#### Method B: CLI exec (non-interactive)
```bash
# Basic execution
codex exec "Summarize the changes in this PR"

# With JSON output
codex exec --json "List failing tests"

# Cloud task dispatch
codex cloud exec --env ENV_ID "Fix the bug in auth.ts" --attempts 2
```

#### Method C: Structured Output with Zod
```typescript
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

const schema = z.object({
  summary: z.string(),
  filesChanged: z.array(z.string()),
  status: z.enum(["ok", "action_required"])
});

const turn = await thread.run("Analyze the PR", {
  outputSchema: zodToJsonSchema(schema, { target: "openAi" })
});
```

### Key Features
- **Thread persistence**: Resume sessions via `codex.resumeThread(threadId)`
- **Streaming events**: Real-time progress with `runStreamed()`
- **Image support**: Pass screenshots/diagrams to the agent
- **Cloud tasks**: Run in Codex cloud with `codex cloud exec`
- **Best-of-N**: Request multiple solutions with `--attempts`
- **MCP server mode**: Orchestrate via Agents SDK

### Resources
- [Codex SDK Docs](https://developers.openai.com/codex/sdk/)
- [npm Package](https://www.npmjs.com/package/@openai/codex-sdk)
- [GitHub](https://github.com/openai/codex/tree/main/sdk/typescript)
- [CLI Reference](https://developers.openai.com/codex/cli/reference/)

---

## 3. Cursor (Cloud Agents)

### Overview
Cursor provides a **REST API** for Cloud Agents (Beta) that can launch coding agents against GitHub repositories. Agents work in isolation and can auto-create PRs.

### Authentication
```typescript
// API key from Cursor Dashboard → Integrations
const apiKey = process.env.CURSOR_API_KEY;
const authHeader = `Basic ${Buffer.from(apiKey + ':').toString('base64')}`;
```

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `GET /v0/agents` | List | List agents (paginated) |
| `GET /v0/agents/{id}` | Status | Get agent status |
| `GET /v0/agents/{id}/conversation` | Messages | Get conversation history |
| `POST /v0/agents` | **Launch** | Create and launch an agent |
| `POST /v0/agents/{id}/followup` | Follow-up | Send additional instructions |
| `POST /v0/agents/{id}/stop` | Stop | Stop running agent |
| `DELETE /v0/agents/{id}` | Delete | Delete agent |
| `GET /v0/repositories` | Repos | List accessible GitHub repos |
| `GET /v0/models` | Models | List available models |

### Dispatch Method: REST API

```typescript
// Launch an agent
const response = await fetch('https://api.cursor.com/v0/agents', {
  method: 'POST',
  headers: {
    'Authorization': authHeader,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    prompt: "Fix the TypeScript errors in the auth module",
    source: {
      type: "github",
      repo: "owner/repo",
      branch: "main"
    },
    model: "claude-4-sonnet-thinking",  // or "o3", "claude-4-opus-thinking"
    target: {
      branch: "fix/auth-errors"  // optional, auto-generated if omitted
    },
    webhook: "https://your-server.com/webhook"  // optional
  })
});

const agent = await response.json();
// { id: "agent_xxx", status: "CREATING" }
```

### Polling for Status
```typescript
// Status flow: CREATING → RUNNING → FINISHED
async function waitForAgent(agentId: string) {
  while (true) {
    const res = await fetch(`https://api.cursor.com/v0/agents/${agentId}`, {
      headers: { 'Authorization': authHeader }
    });
    const agent = await res.json();

    if (agent.status === 'FINISHED') {
      return agent;
    }
    await sleep(5000);
  }
}
```

### Send Follow-up Instructions
```typescript
await fetch(`https://api.cursor.com/v0/agents/${agentId}/followup`, {
  method: 'POST',
  headers: {
    'Authorization': authHeader,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    message: "Also add unit tests for the changes"
  })
});
```

### Key Features
- **GitHub-native**: Works directly with GitHub repos
- **Auto-branching**: Creates new branch per task
- **Auto-PR**: Can create PR when done
- **Multi-model**: Claude 4, O3, and more
- **Parallel agents**: Run up to 8 agents concurrently
- **Webhooks**: Get notified on completion

### Limitations
- **Beta status**: API may change
- **GitHub only**: No local repo support via API
- **Rate limits**: 1 req/min, 30 req/hour for repo listing

### Resources
- [Cloud Agents API Docs](https://cursor.com/docs/cloud-agent/api/endpoints)
- [Cloud Agents Overview](https://cursor.com/docs/cloud-agent)
- [MCP Integration](https://github.com/jxnl/cursor-cloud-agent-mcp)

---

## 4. Gemini CLI (Google)

### Overview
Gemini CLI is Google's open-source AI agent for the terminal. It supports **headless mode** for programmatic use but lacks a dedicated SDK—dispatch is CLI-based.

### Installation
```bash
npm install -g @anthropic-ai/gemini-cli
# or
brew install gemini-cli
```

### Dispatch Method: CLI Headless Mode

```bash
# Basic prompt
gemini "Fix the bug in auth.ts"

# Non-interactive with JSON output
gemini --headless --output-format json "List all TODO comments"

# Pipe input
git diff | gemini "Write a commit message for these changes"

# With specific model
gemini --model gemini-2.5-pro "Refactor the database module"
```

### JSON Output Format
```json
{
  "response": "The analysis shows...",
  "statistics": {
    "inputTokens": 1234,
    "outputTokens": 567
  },
  "metadata": {
    "model": "gemini-2.5-pro",
    "finishReason": "STOP"
  }
}
```

### Key Features
- **ReAct loop**: Reason and act with built-in tools
- **MCP support**: Extend with Model Context Protocol servers
- **Custom commands**: TOML-based command definitions
- **Tool integration**: File system, shell, web browsing

### Limitations
- **No SDK**: Must shell out to CLI
- **No streaming API**: JSON output only after completion
- **No session persistence**: Each call is independent

### Workaround for SDK-like Usage
```typescript
import { execSync } from 'child_process';

function dispatchToGemini(prompt: string, cwd: string): string {
  const result = execSync(
    `gemini --headless --output-format json "${prompt.replace(/"/g, '\\"')}"`,
    { cwd, encoding: 'utf-8' }
  );
  return JSON.parse(result);
}
```

### Resources
- [Gemini CLI Docs](https://geminicli.com/docs/)
- [GitHub](https://github.com/google-gemini/gemini-cli)
- [Headless Mode](https://geminicli.com/docs/cli/headless/)

---

## 5. OpenCode

### Overview
OpenCode is an **open-source** AI coding agent with a full **TypeScript SDK** (`@opencode-ai/sdk`). It's provider-agnostic and supports 75+ LLM providers.

### Installation

```bash
# CLI
npm install -g opencode-ai

# SDK
npm install @opencode-ai/sdk
```

### Dispatch Method: TypeScript SDK

```typescript
import { createOpencodeClient } from "@opencode-ai/sdk";

// Connect to running OpenCode server
const client = createOpencodeClient({
  baseUrl: "http://localhost:4096"
});

// Create a session
const session = await client.session.create({
  title: "Fix Authentication Bug"
});

// Send a task
await client.session.chat({
  id: session.id,
  providerID: "anthropic",
  modelID: "claude-sonnet-4-20250514",
  parts: [{
    type: "text",
    text: "Fix the TypeScript errors in src/auth/"
  }]
});

// Stream events
const eventStream = await client.event.subscribe();
for await (const event of eventStream) {
  console.log("Event:", event.type);
  if (event.type === "session.idle") {
    console.log("Task completed!");
    break;
  }
}
```

### Alternative: CLI Non-Interactive Mode
```bash
# Direct prompt (no TUI)
opencode "Fix the failing tests" --non-interactive

# With specific provider
opencode "Refactor auth module" --provider anthropic --model claude-sonnet-4
```

### Key Features
- **Provider-agnostic**: Claude, GPT, Gemini, local models
- **Server mode**: HTTP API for integrations
- **ACP support**: Agent Client Protocol via stdin/stdout
- **Event streaming**: Real-time SSE updates
- **Session management**: Create, list, resume sessions
- **Plugin system**: Extend with custom tools

### Resources
- [OpenCode Docs](https://opencode.ai/docs/)
- [SDK Docs](https://opencode.ai/docs/sdk/)
- [GitHub](https://github.com/opencode-ai/opencode)
- [npm Package](https://www.npmjs.com/package/@opencode-ai/sdk)

---

## 6. Junie (JetBrains)

### Overview
Junie is JetBrains' AI coding agent integrated into their IDEs. Currently, there is **no public API or SDK** for programmatic dispatch.

### Current Integration Methods
1. **IDE Plugin**: Primary interface through JetBrains IDEs
2. **AI Chat**: Integrated into JetBrains AI chat interface
3. **GitHub Integration**: Delegate tasks via GitHub (async)
4. **ACP Protocol**: Agent Communication Protocol (internal)

### Future Possibilities
JetBrains is developing the **Agent Communication Protocol (ACP)** in collaboration with Zed. This may eventually provide a standard interface for programmatic agent dispatch.

### Workaround
For Junie integration, the best current approach is:
- Detect Junie worktrees by path patterns (as Ledger already does)
- Use the MCP protocol if/when Junie exposes MCP servers
- Monitor for ACP protocol documentation

### Resources
- [Junie Overview](https://www.jetbrains.com/junie/)
- [Getting Started](https://www.jetbrains.com/help/junie/get-started-with-junie.html)
- [ACP Announcement](https://blog.jetbrains.com/ai/2025/12/bring-your-own-ai-agent-to-jetbrains-ides/)

---

## 7. Jules (Google)

### Overview
Jules is Google's **fully asynchronous** remote coding agent. Unlike IDE-based assistants, Jules works autonomously in the cloud—cloning your repo, editing code in a secure VM, running tests, and opening pull requests. Powered by Gemini 2.5/3 Pro.

### Key Characteristics
- **Async by design**: Dispatch a task and check back later
- **Cloud VMs**: Runs in isolated Ubuntu environments
- **GitHub-native**: Works directly with GitHub repos
- **Auto-PR**: Creates pull requests when complete

### Authentication
```typescript
// Get API key from Jules web app → Settings
const headers = {
  'X-Goog-Api-Key': process.env.JULES_API_KEY,
  'Content-Type': 'application/json'
};
```

### API Endpoints (v1alpha)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `GET /v1alpha/sources` | List | List connected GitHub repos |
| `POST /v1alpha/sessions` | **Create** | Create new coding session |
| `GET /v1alpha/sessions/{id}` | Status | Get session status |
| `GET /v1alpha/sessions/{id}/activities` | Activities | List session activities |
| `POST /v1alpha/sessions/{id}:sendMessage` | Message | Send follow-up message |
| `POST /v1alpha/sessions/{id}:approvePlan` | Approve | Approve pending plan |

### Dispatch Method: REST API

```typescript
const JULES_API = 'https://jules.googleapis.com/v1alpha';

// 1. Create a session (dispatch task)
const response = await fetch(`${JULES_API}/sessions`, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    prompt: "Fix the authentication bug in src/auth.ts",
    sourceContext: {
      source: "sources/github/owner/repo",
      branch: "main"
    },
    requirePlanApproval: false  // Set true for human-in-the-loop
  })
});

const session = await response.json();
// { name: "sessions/abc123", state: "ACTIVE", ... }
```

### Polling for Activities
```typescript
// 2. Check session activities for progress/completion
async function getSessionActivities(sessionId: string) {
  const res = await fetch(
    `${JULES_API}/sessions/${sessionId}/activities`,
    { headers }
  );
  return res.json();
}

// Activities include: plan generation, code changes, test runs, PR creation
```

### Send Follow-up Message
```typescript
// 3. Send additional instructions during session
await fetch(`${JULES_API}/sessions/${sessionId}:sendMessage`, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    message: "Also add unit tests for the changes"
  })
});
```

### Approve Plan (if requirePlanApproval=true)
```typescript
await fetch(`${JULES_API}/sessions/${sessionId}:approvePlan`, {
  method: 'POST',
  headers
});
```

### Jules Tools CLI
```bash
# Install Jules CLI
npm install -g @google/jules-tools

# List connected repos
jules sources list

# Create a task
jules task create "Fix the TypeScript errors" --repo owner/repo

# Check task status
jules task status <task-id>

# List recent tasks
jules task list
```

### Alternative: GitHub Label Dispatch
```markdown
# In a GitHub issue, add the "jules" label
# Jules will automatically:
# 1. Fetch the repository
# 2. Clone to a cloud VM
# 3. Generate a plan
# 4. Implement the fix
# 5. Open a PR
```

### Key Features
- **Async execution**: Fire-and-forget task dispatch
- **Cloud VMs**: Secure, isolated execution environment
- **Auto-dependency**: Installs project dependencies automatically
- **AGENTS.md support**: Reads repo-specific instructions
- **Plan approval**: Optional human-in-the-loop for plans
- **GitHub integration**: Direct PR creation
- **Slack/Linear webhooks**: Integration with project tools

### Pricing Tiers
- **Free**: 15 daily tasks, 3 concurrent
- **AI Pro** ($19.99/mo): Higher limits
- **AI Ultra** ($124.99/mo): Maximum limits

### Limitations
- **Alpha API**: Specifications may change
- **GitHub only**: No local repo support
- **Async only**: No real-time streaming (poll for status)
- **Rate limits**: API key limits apply

### Resources
- [Jules Homepage](https://jules.google/)
- [Jules API Documentation](https://developers.google.com/jules/api)
- [API Reference](https://jules.google/docs/api/reference/)
- [Sessions Reference](https://jules.google/docs/api/reference/sessions/)
- [Jules Tools CLI](https://developers.googleblog.com/en/meet-jules-tools-a-command-line-companion-for-googles-async-coding-agent/)
- [Getting Started](https://jules.google/docs/)

---

## 8. Conductor (Melty Labs)

### Overview
Conductor is a macOS app that runs multiple Claude Code instances in parallel. It uses Claude Code under the hood and doesn't have its own API.

### How It Works
- Spawns multiple Claude Code processes
- Uses your existing Claude API key or Claude Pro/Max subscription
- Manages git worktrees for isolation

### Integration Approach
Since Conductor wraps Claude Code, dispatch to Conductor effectively means:
1. Use Claude Code SDK to dispatch to a worktree
2. Let Conductor manage the parallelism
3. Monitor worktree status via Ledger

### Resources
- [Conductor Website](https://www.conductor.build/)

---

## Unified Dispatch Architecture

### Recommended Approach for Ledger

```typescript
interface AgentDispatcher {
  type: 'claude' | 'codex' | 'cursor' | 'jules' | 'gemini' | 'opencode';
  dispatch(task: AgentTask): Promise<AgentResult>;
  getStatus(taskId: string): Promise<AgentStatus>;
  cancel(taskId: string): Promise<void>;
}

interface AgentTask {
  prompt: string;
  workingDirectory: string;  // or repoUrl for Cursor
  branch?: string;
  allowedTools?: string[];
  model?: string;
}

interface AgentResult {
  taskId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  output?: string;
  changes?: FileChange[];
  pullRequestUrl?: string;
}
```

### Implementation Priority

1. **Claude Code** (highest priority)
   - Full SDK available
   - Most flexible (local + any repo)
   - Best documented

2. **Codex**
   - Full SDK available
   - Good for OpenAI users
   - Cloud task support

3. **Cursor**
   - REST API (straightforward)
   - GitHub-only limitation
   - Good for cloud-native workflows

4. **Jules**
   - REST API available (alpha)
   - Async/cloud-native model
   - Good for fire-and-forget tasks

5. **OpenCode**
   - Full SDK available
   - Provider-agnostic
   - Good for self-hosted setups

6. **Gemini CLI**
   - CLI wrapper needed
   - Less integration depth
   - Good as fallback

7. **Junie** (lowest priority)
   - No API currently
   - Wait for ACP protocol

---

## Common Patterns

### MCP Integration
All major agents support or are moving toward **Model Context Protocol (MCP)**:
- Claude Code: Native MCP support
- Codex: MCP server mode
- Gemini CLI: MCP server support
- OpenCode: MCP integration
- Cursor: MCP via extensions

### Worktree-Based Isolation
For parallel agent work:
- Create git worktree per task
- Point agent at worktree directory
- Monitor changes via Ledger
- Merge/PR when complete

### Event Streaming
Most SDKs support streaming:
- Claude: Async iterator from `query()`
- Codex: `runStreamed()` returns event generator
- Cursor: Polling + webhooks
- Jules: Polling activities + webhooks
- OpenCode: SSE via `event.subscribe()`

---

## Next Steps

1. **Prototype Claude Code integration** - Most complete SDK
2. **Add Codex support** - Similar patterns to Claude
3. **Implement Cursor REST client** - For GitHub workflows
4. **Add Jules REST client** - For async cloud tasks
5. **Evaluate OpenCode** - For provider flexibility
6. **CLI wrapper for Gemini** - Fallback option
7. **Monitor Junie ACP** - Future integration

---

## Sources

### Claude Code
- [Run Claude Code Programmatically](https://code.claude.com/docs/en/headless)
- [Agent SDK Overview](https://platform.claude.com/docs/en/agent-sdk/overview)
- [Claude Agent SDK TypeScript](https://github.com/anthropics/claude-agent-sdk-typescript)
- [SDK Demos](https://github.com/anthropics/claude-agent-sdk-demos)

### OpenAI Codex
- [Codex SDK Documentation](https://developers.openai.com/codex/sdk/)
- [Codex CLI Reference](https://developers.openai.com/codex/cli/reference/)
- [@openai/codex-sdk npm](https://www.npmjs.com/package/@openai/codex-sdk)
- [GitHub SDK](https://github.com/openai/codex/tree/main/sdk/typescript)

### Cursor
- [Cloud Agents API Endpoints](https://cursor.com/docs/cloud-agent/api/endpoints)
- [Cloud Agents Overview](https://cursor.com/docs/cloud-agent)
- [Cursor API Docs](https://cursor.com/docs/api)

### Gemini
- [Gemini CLI Documentation](https://geminicli.com/docs/)
- [Headless Mode](https://geminicli.com/docs/cli/headless/)
- [GitHub Repository](https://github.com/google-gemini/gemini-cli)
- [Gemini Code Assist Agent Mode](https://developers.google.com/gemini-code-assist/docs/agent-mode)

### OpenCode
- [OpenCode Documentation](https://opencode.ai/docs/)
- [OpenCode SDK](https://opencode.ai/docs/sdk/)
- [GitHub Repository](https://github.com/opencode-ai/opencode)

### Junie
- [Junie Overview](https://www.jetbrains.com/junie/)
- [Getting Started with Junie](https://www.jetbrains.com/help/junie/get-started-with-junie.html)
- [Bring Your Own Agent](https://blog.jetbrains.com/ai/2025/12/bring-your-own-ai-agent-to-jetbrains-ides/)

### Jules
- [Jules Homepage](https://jules.google/)
- [Jules API Documentation](https://developers.google.com/jules/api)
- [API Reference](https://jules.google/docs/api/reference/)
- [Sessions Reference](https://jules.google/docs/api/reference/sessions/)
- [Jules Tools CLI](https://developers.googleblog.com/en/meet-jules-tools-a-command-line-companion-for-googles-async-coding-agent/)
- [Jules Announcement](https://blog.google/technology/google-labs/jules-tools-jules-api/)

### Conductor
- [Conductor by Melty Labs](https://www.conductor.build/)
- [Code Conductor (GitHub Orchestration)](https://github.com/ryanmac/code-conductor)
