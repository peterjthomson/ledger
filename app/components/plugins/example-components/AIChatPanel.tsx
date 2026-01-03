/**
 * AI Chat Panel
 *
 * Chat interface for repository questions using real git data.
 * Provides quick actions and contextual responses based on actual repo state.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Send,
  GitBranch,
  GitCommit,
  FileText,
  Zap,
  Bot,
  User,
  Loader2,
  RefreshCw,
} from 'lucide-react'
import type { PluginPanelProps } from '@/lib/plugins/plugin-types'
import type { Commit, Branch } from '@/lib/types'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

interface QuickAction {
  id: string
  label: string
  icon: React.ReactNode
  prompt: string
}

export function AIChatPanel({ context, repoPath, onClose }: PluginPanelProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [commits, setCommits] = useState<Commit[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [currentBranch, setCurrentBranch] = useState<string>('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Refs for cleanup
  const isMountedRef = useRef(true)
  const focusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      if (focusTimeoutRef.current) {
        clearTimeout(focusTimeoutRef.current)
      }
    }
  }, [])

  // Load repo context
  useEffect(() => {
    const loadContext = async () => {
      try {
        const [commitsData, branchesData, branch] = await Promise.all([
          context.api.getCommits(),
          context.api.getBranches(),
          context.api.getCurrentBranch(),
        ])
        // Ensure we always set arrays (API might return null/undefined on error)
        const commits = Array.isArray(commitsData) ? commitsData : []
        const branches = Array.isArray(branchesData) ? branchesData : []
        setCommits(commits.slice(0, 50))
        setBranches(branches)
        setCurrentBranch(branch || 'main')
      } catch (error) {
        console.error('Failed to load repo context:', error)
      }
    }
    loadContext()
  }, [context.api])

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Quick actions based on repo state
  const quickActions: QuickAction[] = [
    {
      id: 'recent-changes',
      label: 'Summarize recent changes',
      icon: <GitCommit size={14} />,
      prompt: 'Summarize the recent changes in this repository',
    },
    {
      id: 'branch-status',
      label: 'Current branch status',
      icon: <GitBranch size={14} />,
      prompt: 'What is the status of the current branch?',
    },
    {
      id: 'active-work',
      label: 'Active development areas',
      icon: <FileText size={14} />,
      prompt: 'What areas of the codebase are being actively worked on?',
    },
    {
      id: 'contributors',
      label: 'Recent contributors',
      icon: <User size={14} />,
      prompt: 'Who are the recent contributors?',
    },
  ]

  // Generate AI response based on actual repo data
  const generateResponse = useCallback(
    async (userMessage: string): Promise<string> => {
      const lowerMessage = userMessage.toLowerCase()

      // Recent changes / commits
      if (
        lowerMessage.includes('recent') ||
        lowerMessage.includes('changes') ||
        lowerMessage.includes('commit')
      ) {
        if (commits.length === 0) {
          return "I don't have access to the commit history. Please ensure the repository is properly loaded."
        }

        const recentCommits = commits.slice(0, 10)
        const summary = recentCommits
          .map((c) => `• **${c.shortHash}**: ${c.message} (${c.author})`)
          .join('\n')

        const uniqueAuthors = [...new Set(recentCommits.map((c) => c.author))]

        return `## Recent Changes\n\nHere are the last ${recentCommits.length} commits on **${currentBranch}**:\n\n${summary}\n\n**Contributors**: ${uniqueAuthors.join(', ')}`
      }

      // Branch status
      if (lowerMessage.includes('branch') || lowerMessage.includes('status')) {
        const current = branches.find((b) => b.current)
        const totalBranches = branches.filter((b) => !b.isRemote).length
        const remoteBranches = branches.filter((b) => b.isRemote).length

        if (!current) {
          return `You are on branch **${currentBranch}**.\n\nTotal local branches: ${totalBranches}\nRemote branches: ${remoteBranches}`
        }

        const lastCommit = commits[0]
        return `## Branch Status\n\n**Current Branch**: ${current.name}\n**Last Commit**: ${lastCommit?.shortHash || 'N/A'} - ${lastCommit?.message || 'No commits'}\n**Commit Count**: ${current.commitCount || 'Unknown'}\n\n**Repository Overview**:\n• ${totalBranches} local branches\n• ${remoteBranches} remote branches`
      }

      // Active work / development areas
      if (
        lowerMessage.includes('active') ||
        lowerMessage.includes('development') ||
        lowerMessage.includes('working')
      ) {
        const recentCommits = commits.slice(0, 20)

        // Extract file paths from commit messages (common patterns)
        const patterns: Record<string, number> = {}
        recentCommits.forEach((c) => {
          const msg = c.message.toLowerCase()
          if (msg.includes('component')) patterns['Components'] = (patterns['Components'] || 0) + 1
          if (msg.includes('api') || msg.includes('service'))
            patterns['API/Services'] = (patterns['API/Services'] || 0) + 1
          if (msg.includes('test')) patterns['Tests'] = (patterns['Tests'] || 0) + 1
          if (msg.includes('fix') || msg.includes('bug'))
            patterns['Bug Fixes'] = (patterns['Bug Fixes'] || 0) + 1
          if (msg.includes('style') || msg.includes('css'))
            patterns['Styling'] = (patterns['Styling'] || 0) + 1
          if (msg.includes('doc') || msg.includes('readme'))
            patterns['Documentation'] = (patterns['Documentation'] || 0) + 1
          if (msg.includes('refactor')) patterns['Refactoring'] = (patterns['Refactoring'] || 0) + 1
          if (msg.includes('feat') || msg.includes('add'))
            patterns['Features'] = (patterns['Features'] || 0) + 1
        })

        const sorted = Object.entries(patterns)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 5)

        if (sorted.length === 0) {
          return `Based on the last ${recentCommits.length} commits, I couldn't identify specific patterns in the development areas.`
        }

        const areas = sorted.map(([area, count]) => `• **${area}**: ${count} commits`).join('\n')

        return `## Active Development Areas\n\nBased on recent commit messages:\n\n${areas}\n\n*Analysis based on ${recentCommits.length} recent commits*`
      }

      // Contributors
      if (lowerMessage.includes('contributor') || lowerMessage.includes('who')) {
        const authorCounts: Record<string, number> = {}
        commits.forEach((c) => {
          authorCounts[c.author] = (authorCounts[c.author] || 0) + 1
        })

        const sorted = Object.entries(authorCounts)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 10)

        const contributors = sorted
          .map(([author, count]) => `• **${author}**: ${count} commits`)
          .join('\n')

        return `## Recent Contributors\n\n${contributors}\n\n*Based on ${commits.length} commits in history*`
      }

      // Default response
      return `I can help you understand your repository! Try asking about:\n\n• Recent changes and commits\n• Current branch status\n• Active development areas\n• Contributors\n\n*Currently viewing: **${currentBranch}** with ${commits.length} commits loaded*`
    },
    [commits, branches, currentBranch]
  )

  const handleSend = useCallback(async () => {
    if (!input.trim() || isTyping) return

    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setIsTyping(true)

    // Simulate typing delay
    await new Promise((resolve) => setTimeout(resolve, 500 + Math.random() * 1000))

    // Check if still mounted before continuing
    if (!isMountedRef.current) return

    const response = await generateResponse(userMessage.content)

    // Check again after async operation
    if (!isMountedRef.current) return

    const assistantMessage: Message = {
      id: `msg-${Date.now()}`,
      role: 'assistant',
      content: response,
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, assistantMessage])
    setIsTyping(false)
  }, [input, isTyping, generateResponse])

  const handleQuickAction = useCallback(
    (action: QuickAction) => {
      setInput(action.prompt)
      // Auto-focus after a brief delay (with cleanup tracking)
      if (focusTimeoutRef.current) clearTimeout(focusTimeoutRef.current)
      focusTimeoutRef.current = setTimeout(() => {
        inputRef.current?.focus()
      }, 100)
    },
    []
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend]
  )

  const handleClearChat = useCallback(() => {
    setMessages([])
  }, [])

  return (
    <div className="ai-chat-panel">
      {/* Header with context info */}
      <div className="ai-chat-header">
        <div className="ai-chat-context">
          <div className="ai-chat-context-item">
            <GitBranch size={12} />
            <span>{currentBranch}</span>
          </div>
          <div className="ai-chat-context-item">
            <GitCommit size={12} />
            <span>{commits.length} commits</span>
          </div>
        </div>
        {messages.length > 0 && (
          <button className="ai-chat-clear" onClick={handleClearChat} title="Clear chat">
            <RefreshCw size={14} />
          </button>
        )}
      </div>

      {/* Quick Actions */}
      {messages.length === 0 && (
        <div className="ai-chat-quick-actions">
          <div className="ai-chat-welcome">
            <Bot size={32} />
            <h3>Repository Assistant</h3>
            <p>Ask questions about your repository or try a quick action:</p>
          </div>
          <div className="ai-chat-actions-grid">
            {quickActions.map((action) => (
              <button
                key={action.id}
                className="ai-chat-action-button"
                onClick={() => handleQuickAction(action)}
              >
                <span className="ai-chat-action-icon">{action.icon}</span>
                <span className="ai-chat-action-label">{action.label}</span>
                <Zap size={12} className="ai-chat-action-spark" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="ai-chat-messages">
        {messages.map((message) => (
          <div key={message.id} className={`ai-chat-message ai-chat-message-${message.role}`}>
            <div className="ai-chat-message-avatar">
              {message.role === 'user' ? <User size={16} /> : <Bot size={16} />}
            </div>
            <div className="ai-chat-message-content">
              <div
                className="ai-chat-message-text"
                dangerouslySetInnerHTML={{
                  __html: message.content
                    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                    .replace(/## (.*)/g, '<h4>$1</h4>')
                    .replace(/• /g, '&bull; ')
                    .replace(/\n/g, '<br />'),
                }}
              />
              <span className="ai-chat-message-time">
                {message.timestamp.toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
          </div>
        ))}

        {isTyping && (
          <div className="ai-chat-message ai-chat-message-assistant">
            <div className="ai-chat-message-avatar">
              <Bot size={16} />
            </div>
            <div className="ai-chat-message-content">
              <div className="ai-chat-typing">
                <Loader2 size={14} className="ai-chat-typing-spinner" />
                <span>Analyzing repository...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="ai-chat-input-container">
        <input
          ref={inputRef}
          type="text"
          className="ai-chat-input"
          placeholder="Ask about your repository..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isTyping}
        />
        <button
          className="ai-chat-send"
          onClick={handleSend}
          disabled={!input.trim() || isTyping}
          title="Send message"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  )
}

export default AIChatPanel
