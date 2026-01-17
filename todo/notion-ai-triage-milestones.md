# Notion AI Triage - Implementation Milestones

**Branch:** `claude/notion-ai-card-triage-dGCZM`
**Started:** 2025-01-08
**Status:** In Progress

---

## Overview

Building AI-powered card triage for Notion databases in 4 layers:

| Layer | Name | Status | Commit |
|-------|------|--------|--------|
| 0 | Core AI Infrastructure | Complete | 4e3b6a4 |
| 1 | Notion Database Viewer | Pending | - |
| 2 | Card Actions (Write-back) | Pending | - |
| 3 | Pokemon Triage Game | Pending | - |

---

## Layer 0: Core AI Infrastructure

**Goal:** First-class support for Anthropic, OpenAI, Gemini, and OpenRouter APIs

### Milestones

- [x] **0.1** Add AI SDK dependencies
- [x] **0.2** Create AI types and model registry
- [x] **0.3** Implement provider classes (Anthropic, OpenAI, Gemini, OpenRouter)
- [x] **0.4** Create AI service orchestrator
- [x] **0.5** Add AI settings to settings service
- [x] **0.6** Create IPC schemas and handlers
- [x] **0.7** Create renderer API
- [x] **0.8** Lint, test, self-inspect
- [x] **0.9** Atomic commit for Layer 0

### Files to Create

```
lib/main/ai/
├── types.ts              # Core types
├── models.ts             # Model registry
├── ai-service.ts         # Main orchestrator
└── providers/
    ├── index.ts          # Provider exports
    ├── anthropic.ts      # Claude provider
    ├── openai.ts         # GPT provider
    ├── gemini.ts         # Gemini provider
    └── openrouter.ts     # OpenRouter/free tier provider

lib/conveyor/schemas/ai-schema.ts
lib/conveyor/handlers/ai-handler.ts
lib/conveyor/api/ai-api.ts
```

### Files to Modify

```
lib/main/settings-service.ts    # Add AI settings
lib/conveyor/schemas/index.ts   # Export AI schemas
lib/main/main.ts                # Register AI handlers
package.json                    # Add SDK dependencies
```

---

## Layer 1: Notion Database Viewer

**Goal:** Basic read-only Notion integration

### Milestones

- [ ] **1.1** Add Notion SDK dependency
- [ ] **1.2** Create Notion service with API wrapper
- [ ] **1.3** Handle 2025-09-03 API changes (data_source_id)
- [ ] **1.4** Add Notion settings to settings service
- [ ] **1.5** Create IPC schemas and handlers
- [ ] **1.6** Create viewer plugin structure
- [ ] **1.7** Build DatabasePicker component
- [ ] **1.8** Build CardList component
- [ ] **1.9** Build CardDetail component
- [ ] **1.10** Lint, test, self-inspect
- [ ] **1.11** Atomic commit for Layer 1

---

## Layer 2: Card Actions (Write-back)

**Goal:** Ability to modify Notion cards

### Milestones

- [ ] **2.1** Add status update to Notion service
- [ ] **2.2** Add comment creation to Notion service
- [ ] **2.3** Add content append to Notion service
- [ ] **2.4** Create IPC handlers for write operations
- [ ] **2.5** Add status dropdown to CardDetail
- [ ] **2.6** Add "Add Comment" action
- [ ] **2.7** Add "Append Notes" action
- [ ] **2.8** Lint, test, self-inspect
- [ ] **2.9** Atomic commit for Layer 2

---

## Layer 3: Pokemon Triage Game

**Goal:** Gamified triage experience with AI

### Milestones

- [ ] **3.1** Create triage plugin structure
- [ ] **3.2** Build encounter screen UI
- [ ] **3.3** Build question panel component
- [ ] **3.4** Build completeness bar component
- [ ] **3.5** Implement AI question generation
- [ ] **3.6** Implement completeness evaluation
- [ ] **3.7** Implement write-back synthesis
- [ ] **3.8** Add session tracking and stats
- [ ] **3.9** Style with Pokemon theme
- [ ] **3.10** Lint, test, self-inspect
- [ ] **3.11** Atomic commit for Layer 3

---

## Verification Checklist

After each layer:

- [ ] `npm run lint` passes
- [ ] `npm run build:mac:arm64` succeeds
- [ ] TypeScript compiles without errors
- [ ] Self-inspection of generated code
- [ ] Atomic commit with descriptive message
- [ ] Push to branch

---

## Progress Log

### 2026-01-08

- Created exploration document
- Refined architecture with user feedback
- Decided on SDK approach (vs raw APIs)
- **Layer 0 Complete:**
  - Added AI SDK dependencies (@anthropic-ai/sdk, openai, @google/generative-ai)
  - Created core AI types (types.ts) with provider interfaces
  - Built model registry (models.ts) with 11 models across 3 tiers
  - Implemented Anthropic provider with complete/stream support
  - Implemented OpenAI provider with complete/stream support
  - Implemented Gemini provider with complete/stream support
  - Implemented OpenRouter provider with free tier support
  - Created AI service orchestrator with usage tracking
  - Added AI settings to settings-service.ts
  - Created IPC schemas (ai-schema.ts) with Zod validation
  - Created IPC handlers (ai-handler.ts)
  - Created renderer API (ai-api.ts)
  - TypeScript compiles without errors

