# Notion AI Card Triage - Exploration Document

## Overview

This document explores two interconnected features:

1. **Core AI Infrastructure** - First-class support for Anthropic, OpenAI, Gemini, and OpenRouter (free tier option) as foundational services available throughout Ledger
2. **Notion Triage Plugin** - A gamified card triage experience (Pokémon-style encounters) that uses AI to help build complete product specs

---

## Part 0: Vision - The Pokémon Triage Experience

### Concept

Each Notion card is like encountering a wild Pokémon. The user enters a triage session and cards appear one at a time. For each card:

1. **Encounter** - Card appears with AI-generated summary of current state
2. **Investigation** - AI asks multi-choice questions to gather context
3. **Knowledge Transfer** - Answers are synthesized and written back to Notion
4. **Satisfaction Check** - AI evaluates if the card has enough detail for an agent to code it
5. **Capture or Release** - Card is triaged (status updated) or skipped for later

The goal: Transform vague ideas into complete product specs that AI coding agents can execute.

```
┌─────────────────────────────────────────────────────────────────────┐
│  A wild CARD appeared!                              [Run] [Catch]   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   ╔═══════════════════════════════════════════════════════════╗    │
│   ║  🎴 Fix auth timeout on mobile                            ║    │
│   ║  ─────────────────────────────────────────────────────────║    │
│   ║  HP: ████████░░ 80% (Missing: acceptance criteria)        ║    │
│   ║  Type: Bug | Priority: Unknown | Sprint: Unassigned       ║    │
│   ╚═══════════════════════════════════════════════════════════╝    │
│                                                                     │
│   ┌─────────────────────────────────────────────────────────────┐  │
│   │ AI Summary:                                                  │  │
│   │ Users report sessions expire after 5 mins on iOS. Likely    │  │
│   │ related to Safari's aggressive background tab handling.     │  │
│   │ Missing: reproduction steps, affected versions, priority.   │  │
│   └─────────────────────────────────────────────────────────────┘  │
│                                                                     │
│   ┌─────────────────────────────────────────────────────────────┐  │
│   │ Question 1 of 4:                                             │  │
│   │                                                              │  │
│   │ Which platforms are affected?                                │  │
│   │                                                              │  │
│   │   ○ iOS only                                                 │  │
│   │   ○ Android only                                             │  │
│   │   ○ Both iOS and Android                                     │  │
│   │   ○ Web browsers only                                        │  │
│   │   ○ All platforms                                            │  │
│   │   ○ Unknown - needs investigation                            │  │
│   └─────────────────────────────────────────────────────────────┘  │
│                                                                     │
│   Progress: ██░░░░░░░░ Question 1/4                                │
│   Answers collected: 0 | Card completeness: 45%                    │
│                                                                     │
│   [Skip Question] [Answer & Continue →]                            │
└─────────────────────────────────────────────────────────────────────┘
```

### Write-Back to Notion

After each triage session, results are written back to the card:

1. **Content Addendum** - Appended to the card body with triage notes, acceptance criteria, and agent readiness status
2. **Comment Thread** - For discussion/audit trail showing what was gathered

### Satisfaction System

The AI evaluates card "completeness" based on:

| Dimension | Weight | Questions |
|-----------|--------|-----------|
| **Problem Definition** | 25% | What, who, when, impact |
| **Acceptance Criteria** | 30% | Definition of done, test cases |
| **Technical Context** | 20% | Related systems, dependencies |
| **Priority/Urgency** | 15% | Business impact, deadlines |
| **Scope Boundaries** | 10% | What's NOT included |

Once completeness reaches threshold (e.g., 80%), AI declares the card "ready for an agent."

---

## Architecture Decision: Core vs Plugin

### Recommendation: Hybrid Approach

| Component | Location | Rationale |
|-----------|----------|-----------|
| **AI Infrastructure** | Core | First-class citizen - used everywhere in the app |
| **Notion Service** | Core | Complex API, auth flow, rate limiting - centralized |
| **Triage Plugin** | Plugin | Gamified UX, optional, can evolve independently |

### Why Core AI Infrastructure?

AI should be a **first-class citizen** in Ledger, not an afterthought:

1. **Multiple providers** - Users should be able to use Anthropic, OpenAI, Gemini, or OpenRouter based on preference/cost
2. **Model preferences** - Different tasks need different models (Haiku for quick summaries, Opus for complex analysis)
3. **Ubiquitous access** - Commit messages, PR reviews, diff explanations, branch summaries, merge conflict help
4. **Plugin ecosystem** - All plugins should have easy access to AI capabilities

### Why Core Notion Service?

1. **API Complexity**: Notion's 2025-09-03 API changes require two-step queries, pagination handling, and rate limiting
2. **Auth Management**: OAuth flow or API key storage needs secure handling
3. **Reusability**: Other plugins might want Notion access (project tracking, wiki sync)

---

## Part 1: Core AI Infrastructure ✅ (Implemented)

The AI system is designed as **first-class infrastructure** with all major providers treated equally. OpenRouter provides an optional free tier for onboarding, and provider keys are encrypted via `safeStorage` with UI warnings when strong encryption is unavailable.

### File Structure

```
lib/main/ai/
├── ai-service.ts           # Main service orchestrator
├── providers/
│   ├── index.ts            # Provider exports
│   ├── anthropic.ts        # Claude implementation
│   ├── openai.ts           # GPT implementation
│   ├── gemini.ts           # Gemini implementation
│   └── openrouter.ts       # OpenRouter/free tier implementation
├── models.ts               # Model definitions and capabilities
└── types.ts                # Shared types

lib/conveyor/handlers/ai-handler.ts
lib/conveyor/schemas/ai-schema.ts
lib/conveyor/api/ai-api.ts
```

See `docs/features/ai-services-api.md` for the complete API documentation.

---

## Part 2: Core Notion Service (Pending)

### File Structure

```
lib/main/notion-service.ts              # Notion API wrapper
lib/conveyor/handlers/notion-handler.ts # IPC handlers
lib/conveyor/schemas/notion-schema.ts   # Zod validation
lib/conveyor/api/notion-api.ts          # Renderer API
```

### Key Considerations

- **API Version**: Notion 2025-09-03 requires `data_source_id` for queries
- **Rate Limiting**: 3 req/sec - need request queue with exponential backoff
- **Pagination**: 100 items max per request

---

## Part 3: Notion Triage Plugin (Pending)

### File Structure

```
lib/plugins/notion-triage/
├── index.ts                        # Plugin definition
├── components/
│   ├── TriageApp.tsx               # Main encounter screen
│   ├── SetupWizard.tsx             # First-time configuration
│   ├── EncounterCard.tsx           # Pokemon-style card display
│   ├── QuestionPanel.tsx           # Multi-choice question UI
│   ├── CompletenessBar.tsx         # HP-style progress bar
│   ├── TriageActions.tsx           # Catch/Run/Skip buttons
│   ├── SessionSummary.tsx          # End-of-session stats
│   └── SettingsPanel.tsx           # Plugin settings
├── hooks/
│   ├── useTriage.ts                # Main triage state machine
│   ├── useCardCompleteness.ts      # Completeness scoring
│   └── useNotionWriteBack.ts       # Write results to Notion
├── prompts/
│   ├── question-generation.ts      # Prompts for generating questions
│   ├── completeness-eval.ts        # Prompts for evaluating readiness
│   └── synthesis.ts                # Prompts for synthesizing answers
├── types.ts                        # Plugin-specific types
└── styles.css                      # Pokemon-inspired styling
```

### Plugin Settings

- Database selection
- Status column configuration
- Filter/ready status values
- Completeness threshold (default 80%)
- Write-back mode (content, comment, or both)

---

## Security Considerations

### API Key Storage

**Current approach**: API keys are stored in the settings file at `~/Library/Application Support/ledger/ledger-settings.json`, encrypted via Electron `safeStorage`.

**Storage backends**:
- macOS: Keychain
- Windows: DPAPI
- Linux: gnome-keyring/kwallet (falls back to `basic_text` if unavailable)

The settings UI surfaces encryption status so users know when the fallback is in use.

### Rate Limiting

- Notion: strict request limits; use a queue with exponential backoff.
- AI providers: limits vary by provider and plan; retry with backoff and surface rate-limit errors in the UI.

---

## Open Questions

1. **Should AI keys be per-repo or global?**
   - Recommendation: Global, since AI is a user-level resource

2. **OAuth vs API key for Notion?**
   - Recommendation: Start with API key (simpler), add OAuth later for teams

3. **How should we handle Linux fallback encryption?**
   - When `basic_text` is used, should we gate AI features or just warn?

4. **Cost visibility and budgets?**
   - Show preflight cost estimates for large requests
   - Add monthly budget alerts in the UI

5. **Offline mode for Notion triage?**
   - Could cache cards locally for offline review
   - Sync status changes when online

---

## Implementation Plan

| Phase | Component | Priority | Status |
|-------|-----------|----------|--------|
| 1 | Core AI Service | High | ✅ Complete |
| 2 | Core Notion Service | High | Pending |
| 3 | Settings UI | Medium | ✅ Complete |
| 4 | Notion Triage Plugin | Medium | Pending |

---

## Conclusion

This feature is **highly feasible** with the current architecture:

- **Plugin system** already supports app plugins with storage and hooks
- **IPC patterns** are well-established and type-safe
- **AI infrastructure** is now implemented with all major providers
- **Settings service** supports extensible configuration

The hybrid approach (core services + plugin UI) provides:
- Maximum reusability of AI across the app
- Clean separation of concerns
- Ability to add more AI-powered features later
- Optional Notion functionality for users who need it
