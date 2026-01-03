/**
 * Agent Events Inbox App Component
 *
 * Real-time inbox view for AI agent events.
 * Shows lifecycle events, activity updates, and work events.
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import {
  Inbox,
  Bot,
  GitCommit,
  GitPullRequest,
  AlertTriangle,
  Activity,
  Clock,
  RefreshCw,
  Trash2,
  Filter,
  Bell,
  BellOff,
  ChevronRight,
  Circle,
  CheckCircle,
  XCircle,
  AlertCircle,
  Zap,
  Eye,
  EyeOff,
  Settings,
} from 'lucide-react'
import type { PluginAppProps } from '@/lib/plugins/plugin-types'
import type { AgentEvent, AgentEventType, AgentState } from '@/lib/plugins/agent-events'
import './example-plugin-styles.css'

// Type guard for AgentEvent - validates event structure at runtime
function isAgentEvent(event: unknown): event is AgentEvent {
  if (!event || typeof event !== 'object') return false
  const e = event as Record<string, unknown>
  return (
    typeof e.type === 'string' &&
    e.type.startsWith('agent:') &&
    typeof e.agentType === 'string' &&
    typeof e.worktreePath === 'string' &&
    (e.branch === null || typeof e.branch === 'string') &&
    e.timestamp instanceof Date
  )
}

// Event type metadata for display
const EVENT_TYPE_META: Record<AgentEventType, { label: string; icon: typeof Inbox; color: string }> = {
  'agent:detected': { label: 'Agent Detected', icon: Bot, color: 'var(--color-blue)' },
  'agent:removed': { label: 'Agent Removed', icon: XCircle, color: 'var(--text-tertiary)' },
  'agent:active': { label: 'Active', icon: Activity, color: 'var(--color-green)' },
  'agent:idle': { label: 'Idle', icon: Clock, color: 'var(--color-yellow)' },
  'agent:stale': { label: 'Stale', icon: AlertCircle, color: 'var(--text-tertiary)' },
  'agent:commit': { label: 'Commit', icon: GitCommit, color: 'var(--color-green)' },
  'agent:push': { label: 'Push', icon: Zap, color: 'var(--color-blue)' },
  'agent:pr-created': { label: 'PR Created', icon: GitPullRequest, color: 'var(--color-purple)' },
  'agent:pr-updated': { label: 'PR Updated', icon: GitPullRequest, color: 'var(--color-blue)' },
  'agent:conflict': { label: 'Conflict', icon: AlertTriangle, color: 'var(--color-red)' },
  'agent:behind': { label: 'Behind', icon: AlertCircle, color: 'var(--color-yellow)' },
}

// Agent type colors
const AGENT_COLORS: Record<string, string> = {
  cursor: 'var(--color-blue)',
  claude: 'var(--color-orange)',
  conductor: 'var(--color-purple)',
  gemini: 'var(--color-green)',
  junie: 'var(--color-yellow)',
  unknown: 'var(--text-tertiary)',
}

interface StoredEvent extends AgentEvent {
  id: string
  read: boolean
}

export function AgentEventsInboxApp({ context, repoPath, activeNavItem, onNavigate }: PluginAppProps) {
  const [events, setEvents] = useState<StoredEvent[]>([])
  const [agents, setAgents] = useState<AgentState[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedEvent, setSelectedEvent] = useState<StoredEvent | null>(null)
  const [filterType, setFilterType] = useState<AgentEventType | 'all'>('all')
  const [filterAgent, setFilterAgent] = useState<string | 'all'>('all')
  const [showUnreadOnly, setShowUnreadOnly] = useState(false)
  const [notificationsEnabled, setNotificationsEnabled] = useState(true)

  // Refs for cleanup
  const isMountedRef = useRef(true)

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  // Load initial data
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true)
      try {
        // Load stored events from plugin storage
        const storedEvents = await context.storage.get<StoredEvent[]>('events')
        if (storedEvents && isMountedRef.current) {
          setEvents(storedEvents)
        }

        // Load notification preference
        const notifEnabled = await context.storage.get<boolean>('notificationsEnabled')
        if (notifEnabled !== undefined && isMountedRef.current) {
          setNotificationsEnabled(notifEnabled)
        }
      } catch (error) {
        context.logger.error('Failed to load events:', error)
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false)
        }
      }
    }

    loadData()
  }, [context])

  // Subscribe to agent events
  useEffect(() => {
    const eventTypes: AgentEventType[] = [
      'agent:detected',
      'agent:removed',
      'agent:active',
      'agent:idle',
      'agent:stale',
      'agent:commit',
      'agent:push',
      'agent:pr-created',
      'agent:pr-updated',
      'agent:conflict',
      'agent:behind',
    ]

    const unsubscribers: Array<() => void> = []

    eventTypes.forEach((eventType) => {
      const unsub = context.events.on(eventType, (event) => {
        if (!isMountedRef.current) return

        // Validate event structure before processing
        if (!isAgentEvent(event)) {
          context.logger.warn('Received invalid agent event:', event)
          return
        }

        const agentEvent = event
        const storedEvent: StoredEvent = {
          ...agentEvent,
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          read: false,
        }

        setEvents((prev) => {
          const newEvents = [storedEvent, ...prev].slice(0, 100) // Keep max 100 events
          // Persist to storage (async, don't await)
          context.storage.set('events', newEvents).catch((err) => {
            context.logger.error('Failed to save events:', err)
          })
          return newEvents
        })

        // Update agents list - use agentEvent.type (not loop variable) to avoid closure bug
        setAgents((prev) => {
          const existingIndex = prev.findIndex((a) => a.worktreePath === agentEvent.worktreePath)
          const agentState: AgentState = {
            agentType: agentEvent.agentType,
            worktreePath: agentEvent.worktreePath,
            branch: agentEvent.branch,
            status: agentEvent.type === 'agent:active' ? 'active' : agentEvent.type === 'agent:idle' ? 'idle' : agentEvent.type === 'agent:stale' ? 'stale' : 'unknown',
            lastActivity: agentEvent.timestamp,
            changedFiles: agentEvent.data?.changedFiles || 0,
            additions: agentEvent.data?.additions || 0,
            deletions: agentEvent.data?.deletions || 0,
          }

          if (existingIndex >= 0) {
            const updated = [...prev]
            updated[existingIndex] = agentState
            return updated
          } else if (agentEvent.type === 'agent:detected') {
            return [...prev, agentState]
          } else if (agentEvent.type === 'agent:removed') {
            return prev.filter((a) => a.worktreePath !== agentEvent.worktreePath)
          }
          return prev
        })
      })

      unsubscribers.push(unsub)
    })

    return () => {
      unsubscribers.forEach((unsub) => unsub())
    }
  }, [context])

  // Filtered events
  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      if (filterType !== 'all' && event.type !== filterType) return false
      if (filterAgent !== 'all' && event.agentType !== filterAgent) return false
      if (showUnreadOnly && event.read) return false
      return true
    })
  }, [events, filterType, filterAgent, showUnreadOnly])

  // Unread count
  const unreadCount = useMemo(() => {
    return events.filter((e) => !e.read).length
  }, [events])

  // Mark event as read
  const markAsRead = useCallback((eventId: string) => {
    setEvents((prev) => {
      const updated = prev.map((e) => (e.id === eventId ? { ...e, read: true } : e))
      context.storage.set('events', updated).catch((err) => {
        context.logger.error('Failed to save events:', err)
      })
      return updated
    })
  }, [context])

  // Mark all as read
  const markAllAsRead = useCallback(() => {
    setEvents((prev) => {
      const updated = prev.map((e) => ({ ...e, read: true }))
      context.storage.set('events', updated).catch((err) => {
        context.logger.error('Failed to save events:', err)
      })
      return updated
    })
  }, [context])

  // Clear all events
  const clearEvents = useCallback(() => {
    setEvents([])
    context.storage.set('events', []).catch((err) => {
      context.logger.error('Failed to clear events:', err)
    })
    setSelectedEvent(null)
  }, [context])

  // Toggle notifications
  const toggleNotifications = useCallback(() => {
    setNotificationsEnabled((prev) => {
      const newValue = !prev
      context.storage.set('notificationsEnabled', newValue).catch((err) => {
        context.logger.error('Failed to save notification preference:', err)
      })
      return newValue
    })
  }, [context])

  // Format relative time
  const formatRelativeTime = (date: Date) => {
    const now = new Date()
    const diff = now.getTime() - new Date(date).getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes < 1) return 'just now'
    if (minutes < 60) return `${minutes}m ago`
    if (hours < 24) return `${hours}h ago`
    return `${days}d ago`
  }

  // Render inbox view
  const renderInboxView = () => (
    <div className="agent-inbox-content">
      {/* Toolbar */}
      <div className="agent-inbox-toolbar">
        <div className="agent-inbox-filters">
          <select
            className="agent-inbox-filter-select"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as AgentEventType | 'all')}
          >
            <option value="all">All Events</option>
            <optgroup label="Lifecycle">
              <option value="agent:detected">Detected</option>
              <option value="agent:removed">Removed</option>
            </optgroup>
            <optgroup label="Activity">
              <option value="agent:active">Active</option>
              <option value="agent:idle">Idle</option>
              <option value="agent:stale">Stale</option>
            </optgroup>
            <optgroup label="Work">
              <option value="agent:commit">Commits</option>
              <option value="agent:push">Pushes</option>
              <option value="agent:pr-created">PR Created</option>
              <option value="agent:pr-updated">PR Updated</option>
            </optgroup>
            <optgroup label="Issues">
              <option value="agent:conflict">Conflicts</option>
              <option value="agent:behind">Behind</option>
            </optgroup>
          </select>

          <select
            className="agent-inbox-filter-select"
            value={filterAgent}
            onChange={(e) => setFilterAgent(e.target.value)}
          >
            <option value="all">All Agents</option>
            <option value="cursor">Cursor</option>
            <option value="claude">Claude</option>
            <option value="conductor">Conductor</option>
            <option value="gemini">Gemini</option>
            <option value="junie">Junie</option>
          </select>

          <button
            className={`agent-inbox-filter-btn ${showUnreadOnly ? 'active' : ''}`}
            onClick={() => setShowUnreadOnly(!showUnreadOnly)}
            title={showUnreadOnly ? 'Show all' : 'Show unread only'}
          >
            {showUnreadOnly ? <Eye size={14} /> : <EyeOff size={14} />}
          </button>
        </div>

        <div className="agent-inbox-actions">
          {unreadCount > 0 && (
            <button className="agent-inbox-action-btn" onClick={markAllAsRead} title="Mark all as read">
              <CheckCircle size={14} />
              <span>Mark all read</span>
            </button>
          )}
          <button className="agent-inbox-action-btn" onClick={toggleNotifications} title={notificationsEnabled ? 'Disable notifications' : 'Enable notifications'}>
            {notificationsEnabled ? <Bell size={14} /> : <BellOff size={14} />}
          </button>
          <button className="agent-inbox-action-btn danger" onClick={clearEvents} title="Clear all events">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Event list */}
      <div className="agent-inbox-list">
        {isLoading ? (
          <div className="agent-inbox-loading">
            <RefreshCw size={24} className="spinning" />
            <span>Loading events...</span>
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="agent-inbox-empty">
            <Inbox size={48} />
            <h3>No Events</h3>
            <p>{showUnreadOnly ? 'No unread events' : 'Agent events will appear here'}</p>
          </div>
        ) : (
          filteredEvents.map((event) => {
            const meta = EVENT_TYPE_META[event.type]
            const Icon = meta.icon

            return (
              <div
                key={event.id}
                className={`agent-inbox-item ${!event.read ? 'unread' : ''} ${selectedEvent?.id === event.id ? 'selected' : ''}`}
                onClick={() => {
                  setSelectedEvent(event)
                  markAsRead(event.id)
                }}
              >
                <div className="agent-inbox-item-indicator" style={{ background: meta.color }} />
                <div className="agent-inbox-item-icon" style={{ color: meta.color }}>
                  <Icon size={16} />
                </div>
                <div className="agent-inbox-item-content">
                  <div className="agent-inbox-item-header">
                    <span className="agent-inbox-item-type">{meta.label}</span>
                    <span className="agent-inbox-item-agent" style={{ color: AGENT_COLORS[event.agentType] }}>
                      {event.agentType}
                    </span>
                  </div>
                  <div className="agent-inbox-item-details">
                    {event.branch && <span className="agent-inbox-item-branch">{event.branch}</span>}
                    {event.data?.commitMessage && (
                      <span className="agent-inbox-item-message">{event.data.commitMessage}</span>
                    )}
                    {event.data?.prTitle && (
                      <span className="agent-inbox-item-message">{event.data.prTitle}</span>
                    )}
                  </div>
                </div>
                <div className="agent-inbox-item-meta">
                  <span className="agent-inbox-item-time">{formatRelativeTime(event.timestamp)}</span>
                  {!event.read && <Circle size={8} className="agent-inbox-item-unread-dot" />}
                </div>
                <ChevronRight size={14} className="agent-inbox-item-chevron" />
              </div>
            )
          })
        )}
      </div>

      {/* Event detail panel */}
      {selectedEvent && (
        <div className="agent-inbox-detail">
          <div className="agent-inbox-detail-header">
            <h3>{EVENT_TYPE_META[selectedEvent.type].label}</h3>
            <button onClick={() => setSelectedEvent(null)}>&times;</button>
          </div>
          <div className="agent-inbox-detail-content">
            <div className="agent-inbox-detail-section">
              <h4>Agent</h4>
              <p style={{ color: AGENT_COLORS[selectedEvent.agentType] }}>{selectedEvent.agentType}</p>
            </div>
            <div className="agent-inbox-detail-section">
              <h4>Branch</h4>
              <p>{selectedEvent.branch || 'N/A'}</p>
            </div>
            <div className="agent-inbox-detail-section">
              <h4>Worktree</h4>
              <p className="agent-inbox-detail-path">{selectedEvent.worktreePath}</p>
            </div>
            <div className="agent-inbox-detail-section">
              <h4>Time</h4>
              <p>{new Date(selectedEvent.timestamp).toLocaleString()}</p>
            </div>
            {selectedEvent.data && (
              <div className="agent-inbox-detail-section">
                <h4>Details</h4>
                {selectedEvent.data.commitHash && (
                  <p><strong>Commit:</strong> {selectedEvent.data.commitHash.substring(0, 7)}</p>
                )}
                {selectedEvent.data.commitMessage && (
                  <p><strong>Message:</strong> {selectedEvent.data.commitMessage}</p>
                )}
                {selectedEvent.data.prNumber && (
                  <p><strong>PR:</strong> #{selectedEvent.data.prNumber}</p>
                )}
                {selectedEvent.data.prTitle && (
                  <p><strong>Title:</strong> {selectedEvent.data.prTitle}</p>
                )}
                {selectedEvent.data.changedFiles !== undefined && (
                  <p><strong>Changed Files:</strong> {selectedEvent.data.changedFiles}</p>
                )}
                {selectedEvent.data.additions !== undefined && (
                  <p>
                    <span className="additions">+{selectedEvent.data.additions}</span>
                    {' / '}
                    <span className="deletions">-{selectedEvent.data.deletions || 0}</span>
                  </p>
                )}
                {selectedEvent.data.conflictingFiles && (
                  <div>
                    <strong>Conflicting Files:</strong>
                    <ul>
                      {selectedEvent.data.conflictingFiles.map((file, i) => (
                        <li key={i}>{file}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {selectedEvent.data.commitsBehind !== undefined && (
                  <p><strong>Commits Behind:</strong> {selectedEvent.data.commitsBehind}</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )

  // Render agents view
  const renderAgentsView = () => (
    <div className="agent-inbox-agents">
      {agents.length === 0 ? (
        <div className="agent-inbox-empty">
          <Bot size={48} />
          <h3>No Active Agents</h3>
          <p>Agent worktrees will appear here when detected</p>
        </div>
      ) : (
        <div className="agent-inbox-agents-list">
          {agents.map((agent) => (
            <div key={agent.worktreePath} className="agent-inbox-agent-card">
              <div className="agent-inbox-agent-header">
                <div className="agent-inbox-agent-icon" style={{ background: AGENT_COLORS[agent.agentType] }}>
                  <Bot size={20} />
                </div>
                <div className="agent-inbox-agent-info">
                  <span className="agent-inbox-agent-name">{agent.agentType}</span>
                  <span className="agent-inbox-agent-branch">{agent.branch || 'detached'}</span>
                </div>
                <div className={`agent-inbox-agent-status status-${agent.status}`}>
                  {agent.status === 'active' && <Activity size={12} />}
                  {agent.status === 'idle' && <Clock size={12} />}
                  {agent.status === 'stale' && <AlertCircle size={12} />}
                  <span>{agent.status}</span>
                </div>
              </div>
              <div className="agent-inbox-agent-stats">
                <div className="agent-inbox-agent-stat">
                  <span className="label">Changed Files</span>
                  <span className="value">{agent.changedFiles}</span>
                </div>
                <div className="agent-inbox-agent-stat">
                  <span className="label">Changes</span>
                  <span className="value">
                    <span className="additions">+{agent.additions}</span>
                    {' / '}
                    <span className="deletions">-{agent.deletions}</span>
                  </span>
                </div>
                <div className="agent-inbox-agent-stat">
                  <span className="label">Last Activity</span>
                  <span className="value">{formatRelativeTime(agent.lastActivity)}</span>
                </div>
              </div>
              <div className="agent-inbox-agent-path">{agent.worktreePath}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  // Render settings view
  const renderSettingsView = () => (
    <div className="agent-inbox-settings">
      <div className="agent-inbox-settings-section">
        <h3>Notifications</h3>
        <div className="agent-inbox-setting">
          <div className="agent-inbox-setting-info">
            <span className="agent-inbox-setting-label">Enable Notifications</span>
            <span className="agent-inbox-setting-desc">Show notifications for agent events</span>
          </div>
          <button
            className={`agent-inbox-toggle ${notificationsEnabled ? 'active' : ''}`}
            onClick={toggleNotifications}
          >
            {notificationsEnabled ? 'On' : 'Off'}
          </button>
        </div>
      </div>

      <div className="agent-inbox-settings-section">
        <h3>Data</h3>
        <div className="agent-inbox-setting">
          <div className="agent-inbox-setting-info">
            <span className="agent-inbox-setting-label">Event History</span>
            <span className="agent-inbox-setting-desc">{events.length} events stored</span>
          </div>
          <button className="agent-inbox-clear-btn" onClick={clearEvents}>
            <Trash2 size={14} />
            Clear History
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="agent-inbox-app">
      {/* Header */}
      <div className="agent-inbox-header">
        <div className="agent-inbox-header-left">
          <Inbox size={20} className="agent-inbox-icon" />
          <h1 className="agent-inbox-title">Agent Events</h1>
          {unreadCount > 0 && (
            <span className="agent-inbox-badge">{unreadCount}</span>
          )}
        </div>
        <div className="agent-inbox-header-right">
          <span className="agent-inbox-repo">{repoPath?.split('/').pop() || 'No repo'}</span>
        </div>
      </div>

      {/* Content based on nav */}
      {activeNavItem === 'agents' ? renderAgentsView() :
       activeNavItem === 'settings' ? renderSettingsView() :
       renderInboxView()}
    </div>
  )
}

export default AgentEventsInboxApp
