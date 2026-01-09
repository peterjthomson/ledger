/**
 * AI Settings Section
 *
 * Configuration UI for AI providers (Anthropic, OpenAI, Gemini).
 * Allows users to:
 * - Add/remove API keys for each provider
 * - Set default provider
 * - Configure model preferences
 * - Test connections
 * - View usage stats
 */

import { useState, useEffect, useCallback } from 'react'
import { useConveyor } from '../hooks/use-conveyor'

type AIProvider = 'anthropic' | 'openai' | 'gemini' | 'openrouter'

interface ProviderConfig {
  apiKey: string
  enabled: boolean
  organization?: string
}

interface AISettings {
  providers: {
    anthropic?: ProviderConfig
    openai?: ProviderConfig
    gemini?: ProviderConfig
    openrouter?: ProviderConfig
  }
  defaults: {
    provider: AIProvider
    models: {
      quick: string
      balanced: string
      powerful: string
    }
  }
}

interface TestResult {
  provider: AIProvider
  status: 'idle' | 'testing' | 'success' | 'error'
  message?: string
}

const PROVIDER_INFO: Record<AIProvider, { name: string; placeholder: string; link: string; isFree?: boolean }> = {
  anthropic: {
    name: 'Anthropic (Claude)',
    placeholder: 'sk-ant-api03-...',
    link: 'https://console.anthropic.com/settings/keys',
  },
  openai: {
    name: 'OpenAI (GPT)',
    placeholder: 'sk-proj-...',
    link: 'https://platform.openai.com/api-keys',
  },
  gemini: {
    name: 'Google (Gemini)',
    placeholder: 'AIza...',
    link: 'https://aistudio.google.com/app/apikey',
  },
  openrouter: {
    name: 'OpenRouter',
    placeholder: 'sk-or-... (optional for more models)',
    link: 'https://openrouter.ai/keys',
    isFree: true,
  },
}

// Model defaults are stored server-side in the AI service
// This constant is kept for reference but may be used in future UI enhancements
const _DEFAULT_MODELS: Record<AIProvider, { quick: string; balanced: string; powerful: string }> = {
  anthropic: {
    quick: 'claude-3-5-haiku-20241022',
    balanced: 'claude-sonnet-4-20250514',
    powerful: 'claude-opus-4-20250514',
  },
  openai: {
    quick: 'gpt-4o-mini',
    balanced: 'gpt-4o',
    powerful: 'o1',
  },
  gemini: {
    quick: 'gemini-2.0-flash',
    balanced: 'gemini-2.0-pro',
    powerful: 'gemini-2.5-pro',
  },
  openrouter: {
    quick: 'big-pickle',
    balanced: 'big-pickle',
    powerful: 'grok-code',
  },
}

export function AISettingsSection() {
  const ai = useConveyor('ai')
  const [settings, setSettings] = useState<AISettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Local state for editing
  const [editingKeys, setEditingKeys] = useState<Record<AIProvider, string>>({
    anthropic: '',
    openai: '',
    gemini: '',
    openrouter: '',
  })
  const [editingOrg, setEditingOrg] = useState('')
  const [testResults, setTestResults] = useState<Record<AIProvider, TestResult>>({
    anthropic: { provider: 'anthropic', status: 'idle' },
    openai: { provider: 'openai', status: 'idle' },
    gemini: { provider: 'gemini', status: 'idle' },
    openrouter: { provider: 'openrouter', status: 'idle' },
  })
  const [expandedProvider, setExpandedProvider] = useState<AIProvider | null>(null)

  // Load settings on mount
  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      setLoading(true)
      const result = await ai.getSettings()
      setSettings(result)

      // Initialize editing state from loaded settings
      if (result?.providers) {
        setEditingKeys({
          anthropic: result.providers.anthropic?.apiKey || '',
          openai: result.providers.openai?.apiKey || '',
          gemini: result.providers.gemini?.apiKey || '',
          openrouter: result.providers.openrouter?.apiKey || '',
        })
        setEditingOrg(result.providers.openai?.organization || '')
      }
    } catch (error) {
      console.error('Failed to load AI settings:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSaveKey = useCallback(
    async (provider: AIProvider) => {
      const apiKey = editingKeys[provider]
      if (!apiKey.trim()) return

      try {
        setSaving(true)
        const organization = provider === 'openai' ? editingOrg : undefined
        await ai.setProviderKey(provider, apiKey.trim(), true, organization)
        await loadSettings()
        setTestResults((prev) => ({
          ...prev,
          [provider]: { provider, status: 'idle' },
        }))
      } catch (error) {
        console.error(`Failed to save ${provider} key:`, error)
      } finally {
        setSaving(false)
      }
    },
    [ai, editingKeys, editingOrg]
  )

  const handleRemoveKey = useCallback(
    async (provider: AIProvider) => {
      try {
        setSaving(true)
        await ai.removeProviderKey(provider)
        setEditingKeys((prev) => ({ ...prev, [provider]: '' }))
        if (provider === 'openai') setEditingOrg('')
        await loadSettings()
        setTestResults((prev) => ({
          ...prev,
          [provider]: { provider, status: 'idle' },
        }))
      } catch (error) {
        console.error(`Failed to remove ${provider} key:`, error)
      } finally {
        setSaving(false)
      }
    },
    [ai]
  )

  const handleSetDefault = useCallback(
    async (provider: AIProvider) => {
      try {
        setSaving(true)
        await ai.setDefaultProvider(provider)
        await loadSettings()
      } catch (error) {
        console.error(`Failed to set default provider:`, error)
      } finally {
        setSaving(false)
      }
    },
    [ai]
  )

  const handleTestConnection = useCallback(
    async (provider: AIProvider) => {
      setTestResults((prev) => ({
        ...prev,
        [provider]: { provider, status: 'testing' },
      }))

      try {
        // Send a simple test message
        const response = await ai.quick(
          [{ role: 'user', content: 'Say "Hello" in exactly one word.' }],
          { provider, maxTokens: 10 }
        )

        if (response?.content) {
          setTestResults((prev) => ({
            ...prev,
            [provider]: {
              provider,
              status: 'success',
              message: `Connected! Model: ${response.model}`,
            },
          }))
        } else {
          throw new Error('No response received')
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Connection failed'
        setTestResults((prev) => ({
          ...prev,
          [provider]: { provider, status: 'error', message },
        }))
      }
    },
    [ai]
  )

  const isProviderConfigured = (provider: AIProvider): boolean => {
    // OpenRouter is always "configured" via OpenCode Zen free tier
    if (provider === 'openrouter') return true
    return !!settings?.providers?.[provider]?.apiKey
  }

  const hasCustomKey = (provider: AIProvider): boolean => {
    return !!settings?.providers?.[provider]?.apiKey
  }

  const toggleExpanded = (provider: AIProvider) => {
    setExpandedProvider(expandedProvider === provider ? null : provider)
  }

  if (loading) {
    return (
      <div className="settings-section settings-section-ai">
        <h4 className="settings-section-title">AI Providers</h4>
        <p className="settings-hint">Loading...</p>
      </div>
    )
  }

  const configuredProviders = (['anthropic', 'openai', 'gemini', 'openrouter'] as AIProvider[]).filter(
    hasCustomKey
  )

  return (
    <div className="settings-section settings-section-ai" data-testid="ai-settings-section">
      <h4 className="settings-section-title">AI Providers</h4>
      <p className="settings-hint">Configure API keys for AI-powered features. OpenRouter provides free models with no API key required.</p>

      {/* Provider Cards */}
      <div className="ai-provider-list" data-testid="ai-provider-list">
        {(['openrouter', 'anthropic', 'openai', 'gemini'] as AIProvider[]).map((provider) => {
          const info = PROVIDER_INFO[provider]
          const configured = isProviderConfigured(provider)
          const hasKey = hasCustomKey(provider)
          const isExpanded = expandedProvider === provider
          const testResult = testResults[provider]
          const isDefault = settings?.defaults?.provider === provider
          const isFreeProvider = info.isFree === true

          return (
            <div
              key={provider}
              className={`ai-provider-card ${configured ? 'configured' : ''} ${isExpanded ? 'expanded' : ''} ${isFreeProvider ? 'free-tier' : ''}`}
              data-testid={`ai-provider-card-${provider}`}
            >
              <div className="ai-provider-header" onClick={() => toggleExpanded(provider)} data-testid={`ai-provider-header-${provider}`}>
                <div className="ai-provider-status">
                  <span className={`ai-provider-dot ${configured ? 'active' : ''}`} />
                  <span className="ai-provider-name">{info.name}</span>
                  {isFreeProvider && <span className="ai-provider-free">Free</span>}
                  {isDefault && configured && <span className="ai-provider-default">Default</span>}
                </div>
                <div className="ai-provider-actions">
                  {configured && testResult.status === 'idle' && (
                    <button
                      className="ai-test-btn"
                      data-testid={`ai-test-btn-${provider}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleTestConnection(provider)
                      }}
                      disabled={saving}
                      title="Test connection"
                    >
                      Test
                    </button>
                  )}
                  {testResult.status === 'testing' && (
                    <span className="ai-test-status testing" data-testid={`ai-test-status-${provider}`}>Testing...</span>
                  )}
                  {testResult.status === 'success' && (
                    <span className="ai-test-status success" data-testid={`ai-test-status-${provider}`}>✓ Connected</span>
                  )}
                  {testResult.status === 'error' && (
                    <span className="ai-test-status error" data-testid={`ai-test-status-${provider}`} title={testResult.message}>
                      ✗ Failed
                    </span>
                  )}
                  <span className="ai-provider-expand">{isExpanded ? '▼' : '▶'}</span>
                </div>
              </div>

              {isExpanded && (
                <div className="ai-provider-content">
                  {isFreeProvider && (
                    <div className="ai-free-notice">
                      <strong>No API key required!</strong> Free access to Big Pickle and Grok Code models
                      via OpenCode Zen. Add an OpenRouter API key for 300+ additional models.
                    </div>
                  )}
                  <div className="ai-provider-field">
                    <label>API Key {isFreeProvider && '(optional)'}</label>
                    <div className="ai-key-input-row">
                      <input
                        type="password"
                        value={editingKeys[provider]}
                        onChange={(e) =>
                          setEditingKeys((prev) => ({ ...prev, [provider]: e.target.value }))
                        }
                        placeholder={info.placeholder}
                        className="ai-key-input"
                      />
                      {hasKey ? (
                        <button
                          className="ai-key-btn ai-key-btn-remove"
                          onClick={() => handleRemoveKey(provider)}
                          disabled={saving}
                        >
                          Remove
                        </button>
                      ) : (
                        <button
                          className="ai-key-btn ai-key-btn-save"
                          onClick={() => handleSaveKey(provider)}
                          disabled={saving || !editingKeys[provider].trim()}
                        >
                          Save
                        </button>
                      )}
                    </div>
                    <a
                      href={info.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ai-key-link"
                    >
                      Get API key →
                    </a>
                  </div>

                  {provider === 'openai' && (
                    <div className="ai-provider-field">
                      <label>Organization ID (optional)</label>
                      <input
                        type="text"
                        value={editingOrg}
                        onChange={(e) => setEditingOrg(e.target.value)}
                        placeholder="org-..."
                        className="ai-key-input"
                      />
                    </div>
                  )}

                  {configured && !isDefault && (
                    <button
                      className="ai-set-default-btn"
                      onClick={() => handleSetDefault(provider)}
                      disabled={saving}
                    >
                      Set as Default
                    </button>
                  )}

                  {testResult.status === 'error' && testResult.message && (
                    <div className="ai-test-error">{testResult.message}</div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Usage Stats (if any provider is configured) */}
      {configuredProviders.length > 0 && <AIUsageStats />}
    </div>
  )
}

/**
 * Usage statistics component
 */
function AIUsageStats() {
  const ai = useConveyor('ai')
  const [stats, setStats] = useState<{
    totalCost: number
    totalInputTokens: number
    totalOutputTokens: number
    requestCount: number
  } | null>(null)
  const [showStats, setShowStats] = useState(false)

  useEffect(() => {
    if (showStats) {
      loadStats()
    }
  }, [showStats])

  const loadStats = async () => {
    try {
      const result = await ai.getUsageStats()
      setStats(result)
    } catch (error) {
      console.error('Failed to load usage stats:', error)
    }
  }

  const handleClearHistory = async () => {
    try {
      await ai.clearUsageHistory()
      await loadStats()
    } catch (error) {
      console.error('Failed to clear usage history:', error)
    }
  }

  return (
    <div className="ai-usage-section">
      <button className="ai-usage-toggle" onClick={() => setShowStats(!showStats)}>
        {showStats ? '▼' : '▶'} Usage Statistics
      </button>

      {showStats && stats && (
        <div className="ai-usage-content">
          <div className="ai-usage-grid">
            <div className="ai-usage-stat">
              <span className="ai-usage-value">{stats.requestCount}</span>
              <span className="ai-usage-label">Requests</span>
            </div>
            <div className="ai-usage-stat">
              <span className="ai-usage-value">
                {(stats.totalInputTokens / 1000).toFixed(1)}k
              </span>
              <span className="ai-usage-label">Input Tokens</span>
            </div>
            <div className="ai-usage-stat">
              <span className="ai-usage-value">
                {(stats.totalOutputTokens / 1000).toFixed(1)}k
              </span>
              <span className="ai-usage-label">Output Tokens</span>
            </div>
            <div className="ai-usage-stat">
              <span className="ai-usage-value">${stats.totalCost.toFixed(4)}</span>
              <span className="ai-usage-label">Est. Cost</span>
            </div>
          </div>
          {stats.requestCount > 0 && (
            <button className="ai-clear-history-btn" onClick={handleClearHistory}>
              Clear History
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default AISettingsSection
