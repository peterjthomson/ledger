# AI Services API

## Overview

The AI Services API provides first-class integration with multiple AI providers (Anthropic, OpenAI, Google Gemini, and OpenRouter) as a core capability of Ledger. This infrastructure enables both internal features and third-party plugins to leverage foundation model AI APIs for code analysis, commit summarization, and simple call-response patterns. Agent workflows are excluded from this service and will be part of a seperate common base layer with an SDK focused instead of REST API calls as in this common service.

### Design Philosophy

**Provider Agnostic:** The service abstracts provider differences behind a unified interface. Internal features and plugins call the same API regardless of which provider is configured.

**Tier-Based Model Selection:** Rather than forcing users to understand model names, the API offers three tiers: `quick` (fast, cheap), `balanced` (general purpose), and `powerful` (complex reasoning). The service automatically routes to the appropriate model based on the configured provider.

**Opt-In with Free Tier:** No AI provider is configured by default. Users must explicitly enable a provider in settings. OpenRouter can be enabled without an API key, providing free access via OpenCode Zen for testing and demos.

---

## Architecture

### Three-Layer Design

#### 1. Provider Layer (`lib/main/ai/providers/`)

Four provider implementations, each conforming to `AIProviderInterface`:

- **AnthropicProvider** - Claude models
- **OpenAIProvider** - GPT models
- **GeminiProvider** - Google models
- **OpenRouterProvider** - Aggregator with optional free tier access

Each provider handles:
- API authentication and configuration
- Message format translation (our unified format → provider-specific format)
- Streaming response handling
- Token usage tracking
- Error normalization

#### 2. Orchestration Layer (`lib/main/ai/ai-service.ts`)

The `AIService` singleton coordinates:
- **Provider selection** - Chooses a configured provider and can fall back to OpenRouter if enabled
- **Model resolution** - Maps tier requests to specific models based on provider
- **Usage tracking** - Records token counts and estimated costs
- **Settings persistence** - Saves API keys and preferences via settings service
- **Fallback strategy** - Optional free tier fallback when OpenRouter is enabled

#### 3. Internal API Layer (`lib/conveyor/api/ai-api.ts`)

The renderer-facing API exposed as `window.conveyor.ai`:
- Type-safe IPC communication
- Zod schema validation
- Async/await interface
- Error serialization for cross-process safety

### Data Flow

```
Plugin or Internal Feature
    ↓
window.conveyor.ai.balanced([messages])
    ↓
IPC (ai:balanced channel)
    ↓
AI Handler (main process)
    ↓
AIService.balanced()
    ↓
Provider Selection Logic
    ↓
SelectedProvider.complete()
    ↓
External API (Claude, GPT, Gemini, OpenRouter)
    ↓
Response + Usage Tracking
    ↓
Return to caller
```

---

## Model Registry

### Centralized Model Definitions

All supported models are defined in `lib/main/ai/models.ts` as a registry mapping model IDs to metadata:

- Context window size
- Maximum output tokens
- Input/output pricing (per million tokens)
- Capability flags (vision, JSON mode, streaming)
- Performance tier assignment
- Human-readable descriptions

### Cost Estimation

The registry enables real-time cost estimation for every completion. Usage tracking records:
- Input and output token counts
- Estimated cost in USD
- Provider and model used
- Timestamp

History is capped at 1,000 records to prevent unbounded growth.

---

## Configuration & Settings

### Storage Location

AI settings are persisted in the main settings file at:
`~/Library/Application Support/ledger/ledger-settings.json`

Under the `ai` key, stored alongside repository, theme, and canvas settings.

### Settings Structure

**Provider Configuration:**
- API key (encrypted at rest via platform-specific secure storage)
- Enabled/disabled state
- Optional organization ID (OpenAI only)

**Default Provider:**
- Which provider to use when no explicit provider specified
- Falls back to first configured provider if default unavailable
- Can fall back to OpenRouter free tier if enabled

**Model Preferences:**
- Per-tier model selection (quick, balanced, powerful)
- Allows customization while maintaining tier abstraction

**Usage Tracking:**
- Enable/disable cost tracking
- Optional monthly budget alerts (future)
- Historical usage records

### Settings UI

Location: Settings panel → AI Providers section

Features:
- Collapsible provider cards for Anthropic, OpenAI, Gemini, OpenRouter
- API key input (masked)
- Organization ID field (OpenAI)
- Test connection button (makes real API call)
- Visual status indicators (unconfigured, connected, error)
- "Set as Default" action
- Usage statistics toggle with summary view

**OpenRouter:**
- Marked with "Free" badge
- When enabled without an API key, uses the free tier (OpenCode Zen)
- Optional API key input for broader model access
- Same enable flow as other providers (no special treatment in UI)

---

## API Surface

### Available Endpoints (IPC Channels)

**Settings Management:**
- `ai:get-settings` - Retrieve current AI configuration
- `ai:save-settings` - Update entire settings object
- `ai:set-provider-key` - Add/update provider credentials
- `ai:remove-provider-key` - Delete provider credentials
- `ai:set-default-provider` - Change default provider

**Provider Status:**
- `ai:get-configured-providers` - List providers that are enabled and ready to use (includes OpenRouter when enabled, even without API key)
- `ai:is-provider-available` - Check if a specific provider is available (enabled and configured)

**Model Information:**
- `ai:get-models` - Retrieve full model registry
- `ai:get-models-for-provider` - Filter models by provider

**Completions:**
- `ai:complete` - Generic completion with full options
- `ai:quick` - Fast tier completion
- `ai:balanced` - Balanced tier completion
- `ai:powerful` - Powerful tier completion

**Usage Tracking:**
- `ai:get-usage-stats` - Aggregate statistics by provider
- `ai:clear-usage-history` - Reset usage tracking

### Completion Options

All completion methods accept:
- `model` - Override automatic model selection
- `provider` - Override default provider
- `maxTokens` - Cap output length
- `temperature` - Control randomness (0.0-1.0)
- `stopSequences` - Define stop conditions
- `jsonMode` - Request structured JSON output (where supported)
- `systemPrompt` - Set context/instructions

### Response Format

Every completion returns:
- `content` - The generated text
- `model` - Actual model used
- `provider` - Actual provider used
- `usage` - Token counts and estimated cost
- `finishReason` - Why generation stopped (complete, length, stop, error)

---

## Plugin Integration

### How Plugins Use AI

Plugins access AI via the global `window.conveyor.ai` object exposed in the renderer process.

**Simple Example Flow:**
1. Plugin calls `window.conveyor.ai.quick([messages])`
2. Request validates via Zod schema
3. IPC sends to main process
4. AIService routes to appropriate provider
5. Provider calls external API
6. Response flows back through IPC
7. Plugin receives result

**No Direct API Keys:** Plugins never handle API keys. All authentication happens in the main process.

**No Provider Lock-In:** Plugins specify tiers (quick/balanced/powerful) rather than providers. The service routes based on user configuration.

### Three-Tier Model Selection System

The AI service uses a tier-based abstraction so code doesn't need to know specific model names. When you call `ai.quick()`, `ai.balanced()`, or `ai.powerful()`, the service selects the appropriate model based on the user's configured provider and per-tier defaults. This document intentionally avoids listing model names and pricing to prevent drift; the model registry is the canonical source.

**Model Selection Priority:**
1. User's configured default provider (if available)
2. First configured provider in list
3. OpenRouter free tier (if enabled)

### Plugin Examples

**Two example plugins demonstrate real-world usage:**

**AI Chat Panel (`lib/plugins/examples/ai-chat-panel.ts`):**
- Type: Panel plugin (floating UI component)
- Features: Conversational assistant, diff explanation, git help
- Tier usage: Quick for simple Q&A, Balanced for diff analysis
- Hooks: Provides `ai:explain-diff` and `ai:summarize-changes` for other plugins

**AI Review App (`lib/plugins/examples/ai-review-app.ts`):**
- Type: App plugin (full sidebar app)
- Features: Commit analysis, PR review, code quality insights
- Tier usage: Quick for commits, Balanced for PRs, Powerful available for deep analysis
- Hooks: Provides `ai:analyze-commit`, `ai:review-pr`, `ai:suggest-commit-message`

### Hook System

Plugins can expose AI-powered hooks that other plugins consume. The examples above show this pattern:

**Provider Hook:** A plugin implements `ai:explain-diff` using the AI service  
**Consumer Hook:** Another plugin calls `ai:explain-diff` expecting AI-generated explanation  
**Decoupling:** Consumer doesn't know which AI provider was used

This creates a marketplace of AI-enhanced capabilities.

---

## Internal Feature Integration

### Current Usage

**Settings Panel:**
- API key management
- Provider testing (real API calls)
- Usage statistics display

**Future Internal Features (Planned):**
- Commit message generation (staging panel)
- PR comment summarization (PR detail panel)
- Branch comparison summaries (branch detail panel)
- Agent work analysis (worktree panel)
- Conflict resolution suggestions (merge panel)

### Integration Pattern

Internal features follow the same pattern as plugins:

1. Import conveyor API: `import { useConveyor } from '@/hooks/use-conveyor'`
2. Access AI service: `const ai = useConveyor('ai')`
3. Call tier method: `await ai.balanced([messages], options)`
4. Handle response: Display content, record usage, handle errors

**No Special Privileges:** Internal features use the same public API as plugins. No backdoors or special access.

---

## Free Tier Strategy

### OpenRouter Free Access (OpenCode Zen)

**Why This Matters:**
- Removes friction for new users
- Enables dogfooding without API keys
- Can provide a fallback when user's API quota is exhausted (if enabled)
- Demonstrates AI capability before purchase decision

**How It Works:**
- OpenRouter offers free tier via "OpenCode Zen" initiative
- No API key required (or use `"public"` as key)
- Limited set of free models suitable for testing and light usage
- Rate limited but sufficient for onboarding and demos

**User Experience:**
1. New Ledger install - no AI providers enabled by default
2. Open AI settings
3. Expand OpenRouter card
4. Click "Enable" button (no API key needed for free tier)
5. OpenRouter now shows as configured, Test button appears
6. Click Test → success (uses free tier models)
7. Optional: Add OpenRouter API key for premium models, or add other providers

**Fallback Hierarchy:**
1. User's configured default provider (if available)
2. First configured provider in list (if default unavailable)
3. OpenRouter free tier (if enabled)

AI requires explicit opt-in. Users must enable at least one provider for AI features to work.

---

## Error Handling

### Provider-Level Errors

Each provider catches and normalizes errors:
- Authentication failures → "Provider not configured" message
- Rate limits → "Rate limit exceeded" message with retry suggestion
- Network errors → "Network error" message
- Token limits → Graceful truncation with warning

### Service-Level Errors

AIService adds additional safety:
- Missing provider → Falls back to next configured provider, or error if none enabled
- Invalid model ID → Error with suggested valid models
- Malformed request → Zod validation error with clear message

### IPC-Level Errors

All errors serialize safely across process boundaries:
- Error objects → Plain objects with message, stack, name
- Avoids non-serializable error properties
- Preserves error context for debugging

### UI-Level Errors

Settings panel shows specific error states:
- Red status indicator
- Error message on hover
- "Retry" button for transient failures
- "Remove" button to clear bad credentials

---

## Performance Considerations

### Caching Strategy

**Not Implemented Yet (Intentional):**
- Provider responses are not cached
- Every request is fresh
- Allows testing configuration changes immediately

**Future Enhancement:**
- Consider caching based on hash of (messages + options)
- TTL based on file modification time
- Opt-in per-request via options flag

### Token Limits

**Input Truncation:**
- Plugin responsibility to truncate large diffs/files
- Model registry provides context window sizes
- Example plugins show truncation patterns

**Output Limits:**
- Set via `maxTokens` option
- Defaults to model's `maxOutputTokens`
- Balance between completeness and cost

### Streaming

**Supported but Not Exposed:**
- All providers implement streaming internally
- IPC layer doesn't support streaming (Electron limitation)
- Future: Consider WebSocket bridge for streaming to renderer

---

## Security & Privacy

### API Key Storage

**Storage:** Encrypted using Electron's `safeStorage` API with platform-specific backends:
- **macOS:** Keychain (hardware-backed on Apple Silicon)
- **Windows:** DPAPI (user-account bound)
- **Linux:** gnome-keyring or kwallet (falls back to basic encryption if unavailable)

The UI displays encryption status so users know their keys are protected. On Linux without a keyring, a warning is shown that encryption is weaker.

**Never Sent to Renderer:**
- API keys stay in main process
- Renderer sees only "configured" vs "not configured" status
- IPC never transmits keys

### Data Privacy

**User Content:**
- Sent to provider APIs based on user's explicit action (Test button, plugin usage, proactive selection of a provider by user in settings)
- Users control which providers receive their data
- Free tier alternative (OpenRouter) for those avoiding big tech

**No Analytics:**
- Ledger doesn't track what AI features users enable
- Ledger doesn't log AI request content
- Usage tracking is local only (not transmitted anywhere)

### Provider Trust

**User Choice:**
- Explicit provider selection
- Clear indication of which provider will be used
- Test button shows which model responded

**Transparency:**
- Model registry is open and auditable
- Cost estimation visible before requests (via usage stats)
- No hidden AI calls (everything is user-initiated or explicit in plugins)

---

## Testing Strategy

### E2E Tests

Location: `tests/app.spec.ts` - "AI Settings" test suite

**Coverage:**
- Settings panel opens and displays correctly
- All provider cards render
- OpenRouter connection test (mocked response)
- Provider list completeness

**Test Philosophy:**
- External API calls are mocked in E2E to avoid network flakiness
- Provider-boundary mocks can be enabled for unit tests (future)
- E2E tests verify the full stack including IPC, service, provider, and UI

### Validation Tests

Location: `tests/validation.spec.ts`

**Coverage:**
- Error serialization (cross-process safety)
- Input validation patterns (future AI-specific validation)

### Manual Testing

**Test Connection Button:**
- Each provider card has "Test" action
- Makes real API call with minimal prompt
- Shows success/failure immediately
- Validates credentials work end-to-end

---

## Cost Management

### Usage Tracking

**Automatic Recording:**
- Every completion records: date, provider, model, tokens, cost
- History limited to 1,000 records
- Clear history action available

**Statistics View:**
- Visible when any provider is enabled (including OpenRouter free tier)
- Total requests made
- Total tokens consumed (input/output)
- Total estimated cost
- Per-provider breakdown

**Budget Alerts (Future):**
- Optional monthly budget setting
- Warning when approaching limit
- Disable AI features when exceeded

### Cost Optimization Tips

**For Plugin Developers:**
- Use quick tier for simple tasks
- Truncate long inputs before sending
- Set reasonable `maxTokens` limits
- Cache results when appropriate (plugin responsibility)

**For Users:**
- Start with OpenRouter free tier
- Add premium providers for specific use cases
- Monitor usage statistics
- Set budget alerts when feature available

---

## Extension Points

### Adding New Providers

To add a new provider (e.g., Cohere, Mistral):

1. Create provider class implementing `AIProviderInterface`
2. Add models to `MODEL_REGISTRY` in `models.ts`
3. Add provider configuration to `AISettings` type
4. Update `AIService` to instantiate and configure provider
5. Add UI card to `AISettingsSection.tsx`
6. Update IPC schemas to include new provider

**Estimated Effort:** 2-4 hours for experienced developer

### Adding Custom Models

Models can be added to existing providers:

1. Add model definition to `MODEL_REGISTRY`
2. Assign tier (quick/balanced/powerful)
3. Set pricing and capabilities
4. Model becomes available automatically

**No Code Changes Needed Beyond Registry**

### Extending API Surface

New AI-powered features can be added as:

**IPC Channels:**
- Define in `ai-schema.ts`
- Implement handler in `ai-handler.ts`
- Expose in `ai-api.ts`
- Document here

**Plugin Hooks:**
- Define hook name and signature
- Implement in plugin using AI service
- Register in plugin manifest
- Other plugins can consume

---

## Roadmap

### Completed (Layer 0)

- ✅ Core AI infrastructure (providers, service, IPC)
- ✅ Settings UI and persistence
- ✅ Model registry with tiered defaults
- ✅ Usage tracking
- ✅ Optional free tier fallback
- ✅ E2E tests
- ✅ Example plugins

### In Progress (Layer 1+)

- 🔄 Notion database integration
- 🔄 Card triage workflows

### Planned (Future Layers)

- 📋 Streaming support via WebSocket bridge
- 📋 Response caching system
- 📋 Budget alerts and spending controls
- 📋 Agent coordination layer (multi-agent workflows)
- 📋 Commit message generation UI
- 📋 PR review suggestions in PR panel
- 📋 Conflict resolution assistant
- 📋 Custom model fine-tuning integration
- 📋 Local model support (Ollama, llama.cpp)

---

## Migration Guide

### For Plugin Developers

**Before (No AI Support):**
Plugins couldn't access shared AI capabilities. Had to tell users to use external tools and provision creditials per-plugin.

**After (AI Services Available):**
Plugins can now call `window.conveyor.ai` methods with minimal setup.

**No Breaking Changes:**
Existing plugins continue to work. AI common layer is opt-in.

**Recommended Adoption:**
1. Add AI-enhanced features as progressive enhancement
2. Gracefully degrade if AI unavailable (user may not have enabled any provider)
3. Use tiers appropriately (don't waste powerful tier on simple tasks)
4. Respect user's provider choice (don't require specific provider)

### For Internal Features

**Pattern:**
1. Import hook: `const ai = useConveyor('ai')`
2. Check availability: `const hasAI = await ai.getConfiguredProviders()`
3. Call tier method: `const response = await ai.balanced([...])`
4. Handle response: Display in UI, log errors

**Example Use Cases:**
- Explain this diff → Balanced tier
- Suggest commit message → Quick tier
- Analyze PR for security issues → Powerful tier
- Summarize 20 commits → Quick tier

---

## Support & Troubleshooting

### Common Issues

**"Provider not configured" Error:**
- Check API key is correctly entered
- Click "Test" button to verify connection
- Ensure API key has necessary permissions (not restricted)
- Try OpenRouter free tier as alternative

**"Rate limit exceeded" Error:**
- Wait before retrying (provider-specific cooldown)
- Consider switching to different provider
- OpenRouter free tier has different rate limits

**"Network error" Error:**
- Check internet connection
- Verify firewall not blocking provider domains
- Try different provider as test

**Slow Responses:**
- Normal for powerful tier models (they think longer)
- Consider quick tier for non-critical tasks
- Check provider status pages for outages

### Debug Mode

**Enable Verbose Logging:**
Currently handled by main process console logs. Look for:
- `[AI Service]` prefix for service-level logs
- `[AI Handler]` prefix for IPC handler logs
- Provider-specific errors logged with context

**Future Enhancement:**
- Settings toggle for debug mode
- Export logs to file
- Structured logging with levels

---

## Contributing

### Adding AI Features

**Internal Features:**
1. Design feature in docs/features/ (like this document)
2. Implement using conveyor.ai API
3. Add E2E test covering the feature
4. Update this document with new capability

**External Plugins:**
1. Study example plugins in lib/plugins/examples/
2. Use three-tier strategy for model selection
3. Document which tiers your features use
4. Submit plugin to registry (future)

### Provider Contributions

New provider PRs welcome. Requirements:
- Must implement full `AIProviderInterface`
- Must include at least 1 model per tier
- Must handle errors gracefully
- Must support streaming (even if not exposed yet)
- Must include settings UI component
- Must document pricing and rate limits

### Documentation Updates

This document is living. Update when:
- New providers added
- New API endpoints added
- Usage patterns change
- Best practices emerge
- Roadmap items complete

---

## Acknowledgments

**Provider Selection:**
- Anthropic (Claude) - Industry-leading coding models
- OpenAI (GPT) - Broad ecosystem and tool use
- Google (Gemini) - Massive context windows and multimodal
- OpenRouter - Aggregator with free tier access

**Inspiration:**
- GitHub Copilot - AI-first developer tool
- Cursor IDE - Agent-centric workflows
- Windsurf - Agentic development patterns

**Philosophy:**
- Local-first - User owns their data
- Privacy-respecting - No telemetry on AI usage
- User choice - Multiple providers, explicit control
- Progressive enhancement - Works without AI, better with it
