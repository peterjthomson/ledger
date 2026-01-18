/**
 * Notion Viewer App Component
 *
 * Full-screen app for browsing Notion databases and cards.
 * Layer 1 of the Notion AI Card Triage feature.
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Database,
  LayoutList,
  RefreshCw,
  ChevronRight,
  BookOpen,
  Settings,
  ExternalLink,
  Search,
  Filter,
  Calendar,
  User,
  Tag,
  AlertCircle,
} from 'lucide-react'
import type { PluginAppProps } from '@/lib/plugins/plugin-types'
import './example-plugin-styles.css'

// Types for Notion data
interface NotionDatabase {
  id: string
  title: string
  url: string
  icon?: string
  description?: string
  properties: NotionProperty[]
  createdTime: string
  lastEditedTime: string
}

interface NotionProperty {
  id: string
  name: string
  type: string
  options?: Array<{ id: string; name: string; color?: string }>
}

interface NotionCard {
  id: string
  title: string
  url: string
  icon?: string
  cover?: string
  properties: Record<string, NotionPropertyValue>
  content?: string
  createdTime: string
  lastEditedTime: string
}

interface NotionPropertyValue {
  type: string
  value: unknown
  displayValue: string
}

interface QueryResult {
  cards: NotionCard[]
  hasMore: boolean
  nextCursor?: string
}

export function NotionViewerApp({ context, activeNavItem, onNavigate }: PluginAppProps) {
  const [databases, setDatabases] = useState<NotionDatabase[]>([])
  const [selectedDatabase, setSelectedDatabase] = useState<NotionDatabase | null>(null)
  const [cards, setCards] = useState<NotionCard[]>([])
  const [selectedCard, setSelectedCard] = useState<NotionCard | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingCards, setIsLoadingCards] = useState(false)
  const [isConfigured, setIsConfigured] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [hasMore, setHasMore] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | undefined>()

  // Check if Notion is configured
  useEffect(() => {
    checkConfiguration()
  }, [])

  const checkConfiguration = async () => {
    try {
      const configured = await window.conveyor?.notion?.isConfigured()
      setIsConfigured(configured ?? false)
      if (configured) {
        loadDatabases()
      } else {
        setIsLoading(false)
      }
    } catch (error) {
      context.logger.error('Failed to check Notion configuration:', error)
      setIsLoading(false)
    }
  }

  const loadDatabases = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await window.conveyor?.notion?.listDatabases()
      if (result?.success && result.databases) {
        setDatabases(result.databases)
      } else {
        setError(result?.error || 'Failed to load databases')
      }
    } catch (error) {
      context.logger.error('Failed to load databases:', error)
      setError('Failed to load databases')
    } finally {
      setIsLoading(false)
    }
  }

  const loadCards = useCallback(async (databaseId: string, cursor?: string) => {
    setIsLoadingCards(true)
    setError(null)
    try {
      const result = await window.conveyor?.notion?.queryCards(databaseId, {
        pageSize: 50,
        startCursor: cursor,
        sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }],
      })
      if (result?.success && result.result) {
        if (cursor) {
          setCards(prev => [...prev, ...result.result!.cards])
        } else {
          setCards(result.result.cards)
        }
        setHasMore(result.result.hasMore)
        setNextCursor(result.result.nextCursor)
      } else {
        setError(result?.error || 'Failed to load cards')
      }
    } catch (error) {
      context.logger.error('Failed to load cards:', error)
      setError('Failed to load cards')
    } finally {
      setIsLoadingCards(false)
    }
  }, [context.logger])

  const loadCardDetails = async (cardId: string) => {
    try {
      const result = await window.conveyor?.notion?.getCard(cardId)
      if (result?.success && result.card) {
        setSelectedCard(result.card)
      }
    } catch (error) {
      context.logger.error('Failed to load card details:', error)
    }
  }

  const handleDatabaseSelect = (db: NotionDatabase) => {
    setSelectedDatabase(db)
    setSelectedCard(null)
    setCards([])
    setNextCursor(undefined)
    loadCards(db.id)
    onNavigate?.('cards')
  }

  const handleCardSelect = (card: NotionCard) => {
    setSelectedCard(card)
    loadCardDetails(card.id)
  }

  const handleCardClose = () => {
    setSelectedCard(null)
  }

  const handleLoadMore = () => {
    if (selectedDatabase && hasMore && nextCursor) {
      loadCards(selectedDatabase.id, nextCursor)
    }
  }

  // Filter cards by search query
  const filteredCards = useMemo(() => {
    if (!searchQuery.trim()) return cards
    const query = searchQuery.toLowerCase()
    return cards.filter(card =>
      card.title.toLowerCase().includes(query) ||
      Object.values(card.properties).some(prop =>
        prop.displayValue.toLowerCase().includes(query)
      )
    )
  }, [cards, searchQuery])

  // Render content based on active nav
  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="notion-viewer-loading">
          <RefreshCw className="spinning" size={24} />
          <span>Loading Notion data...</span>
        </div>
      )
    }

    if (!isConfigured) {
      return <NotConfiguredView />
    }

    if (error) {
      return (
        <div className="notion-viewer-error">
          <AlertCircle size={48} />
          <h3>Error</h3>
          <p>{error}</p>
          <button onClick={loadDatabases} className="notion-viewer-btn">
            <RefreshCw size={16} /> Retry
          </button>
        </div>
      )
    }

    switch (activeNavItem) {
      case 'cards':
        if (!selectedDatabase) {
          return (
            <div className="notion-viewer-empty">
              <Database size={48} />
              <h3>No Database Selected</h3>
              <p>Select a database from the Databases tab to view cards</p>
              <button onClick={() => onNavigate?.('databases')} className="notion-viewer-btn">
                <ChevronRight size={16} /> Go to Databases
              </button>
            </div>
          )
        }
        return (
          <CardsView
            database={selectedDatabase}
            cards={filteredCards}
            selectedCard={selectedCard}
            isLoading={isLoadingCards}
            hasMore={hasMore}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onSelectCard={handleCardSelect}
            onLoadMore={handleLoadMore}
            onBack={() => {
              setSelectedDatabase(null)
              setCards([])
              onNavigate?.('databases')
            }}
          />
        )
      default:
        return (
          <DatabasesView
            databases={databases}
            selectedDatabase={selectedDatabase}
            isLoading={isLoading}
            onSelectDatabase={handleDatabaseSelect}
            onRefresh={loadDatabases}
          />
        )
    }
  }

  return (
    <div className="notion-viewer-app">
      {/* Header */}
      <div className="notion-viewer-header">
        <div className="notion-viewer-header-left">
          <BookOpen size={24} className="notion-viewer-icon" />
          <h1 className="notion-viewer-title">Notion Viewer</h1>
        </div>
        {isConfigured && (
          <button
            className="notion-viewer-refresh-btn"
            onClick={loadDatabases}
            disabled={isLoading}
          >
            <RefreshCw size={16} className={isLoading ? 'spinning' : ''} />
            Refresh
          </button>
        )}
      </div>

      {/* Content */}
      <div className="notion-viewer-content">{renderContent()}</div>
    </div>
  )
}

// ============================================================================
// Not Configured View
// ============================================================================

function NotConfiguredView() {
  return (
    <div className="notion-viewer-not-configured">
      <Settings size={48} />
      <h3>Notion Not Configured</h3>
      <p>To use the Notion Viewer, you need to set up a Notion integration.</p>
      <div className="notion-viewer-setup-steps">
        <h4>Setup Steps:</h4>
        <ol>
          <li>Go to <a href="https://www.notion.so/my-integrations" target="_blank" rel="noopener noreferrer">Notion Integrations</a></li>
          <li>Create a new integration for your workspace</li>
          <li>Copy the Internal Integration Token</li>
          <li>Open Ledger Settings and paste the token in the Notion section</li>
          <li>In Notion, share your databases with the integration</li>
        </ol>
      </div>
    </div>
  )
}

// ============================================================================
// Databases View
// ============================================================================

interface DatabasesViewProps {
  databases: NotionDatabase[]
  selectedDatabase: NotionDatabase | null
  isLoading: boolean
  onSelectDatabase: (db: NotionDatabase) => void
  onRefresh: () => void
}

function DatabasesView({ databases, selectedDatabase, isLoading, onSelectDatabase, onRefresh }: DatabasesViewProps) {
  if (databases.length === 0) {
    return (
      <div className="notion-viewer-empty">
        <Database size={48} />
        <h3>No Databases Found</h3>
        <p>No databases are shared with your Notion integration.</p>
        <p>Make sure to share your databases with the integration in Notion.</p>
        <button onClick={onRefresh} className="notion-viewer-btn">
          <RefreshCw size={16} /> Refresh
        </button>
      </div>
    )
  }

  return (
    <div className="notion-viewer-databases">
      <div className="notion-viewer-section-header">
        <Database size={18} />
        <span>Databases ({databases.length})</span>
      </div>

      <div className="notion-viewer-databases-grid">
        {databases.map(db => (
          <div
            key={db.id}
            className={`notion-viewer-database-card ${selectedDatabase?.id === db.id ? 'selected' : ''}`}
            onClick={() => onSelectDatabase(db)}
          >
            <div className="notion-viewer-database-header">
              <span className="notion-viewer-database-icon">
                {db.icon || <Database size={20} />}
              </span>
              <h4 className="notion-viewer-database-title">{db.title}</h4>
            </div>
            {db.description && (
              <p className="notion-viewer-database-description">{db.description}</p>
            )}
            <div className="notion-viewer-database-meta">
              <span className="notion-viewer-database-properties">
                {db.properties.length} properties
              </span>
              <span className="notion-viewer-database-date">
                Updated {new Date(db.lastEditedTime).toLocaleDateString()}
              </span>
            </div>
            <div className="notion-viewer-database-actions">
              <button
                className="notion-viewer-database-open"
                onClick={(e) => {
                  e.stopPropagation()
                  window.open(db.url, '_blank')
                }}
              >
                <ExternalLink size={14} /> Open in Notion
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ============================================================================
// Cards View
// ============================================================================

interface CardsViewProps {
  database: NotionDatabase
  cards: NotionCard[]
  selectedCard: NotionCard | null
  isLoading: boolean
  hasMore: boolean
  searchQuery: string
  onSearchChange: (query: string) => void
  onSelectCard: (card: NotionCard) => void
  onLoadMore: () => void
  onBack: () => void
}

function CardsView({
  database,
  cards,
  selectedCard,
  isLoading,
  hasMore,
  searchQuery,
  onSearchChange,
  onSelectCard,
  onLoadMore,
  onBack,
}: CardsViewProps) {
  return (
    <div className="notion-viewer-cards">
      {/* Database Header */}
      <div className="notion-viewer-cards-header">
        <button onClick={onBack} className="notion-viewer-back-btn">
          <ChevronRight size={16} style={{ transform: 'rotate(180deg)' }} />
          Back to Databases
        </button>
        <div className="notion-viewer-cards-database">
          <span className="notion-viewer-database-icon">
            {database.icon || <Database size={18} />}
          </span>
          <span>{database.title}</span>
        </div>
      </div>

      {/* Search Bar */}
      <div className="notion-viewer-search">
        <Search size={16} />
        <input
          type="text"
          placeholder="Search cards..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>

      <div className="notion-viewer-cards-layout">
        {/* Cards List */}
        <div className="notion-viewer-cards-list">
          <div className="notion-viewer-section-header">
            <LayoutList size={18} />
            <span>Cards ({cards.length}{hasMore ? '+' : ''})</span>
          </div>

          {isLoading && cards.length === 0 ? (
            <div className="notion-viewer-loading-inline">
              <RefreshCw className="spinning" size={16} />
              <span>Loading cards...</span>
            </div>
          ) : cards.length === 0 ? (
            <div className="notion-viewer-empty-inline">
              <p>No cards found</p>
            </div>
          ) : (
            <>
              {cards.map(card => (
                <div
                  key={card.id}
                  className={`notion-viewer-card-item ${selectedCard?.id === card.id ? 'selected' : ''}`}
                  onClick={() => onSelectCard(card)}
                >
                  <div className="notion-viewer-card-header">
                    {card.icon && <span className="notion-viewer-card-icon">{card.icon}</span>}
                    <h4 className="notion-viewer-card-title">{card.title}</h4>
                  </div>
                  <div className="notion-viewer-card-properties">
                    {Object.entries(card.properties)
                      .filter(([, prop]) => prop.displayValue && prop.type !== 'title')
                      .slice(0, 3)
                      .map(([name, prop]) => (
                        <span key={name} className={`notion-viewer-card-property ${prop.type}`}>
                          <PropertyIcon type={prop.type} />
                          <span className="property-value">{prop.displayValue}</span>
                        </span>
                      ))}
                  </div>
                  <div className="notion-viewer-card-meta">
                    <span className="notion-viewer-card-date">
                      {new Date(card.lastEditedTime).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}
              {hasMore && (
                <button
                  className="notion-viewer-load-more"
                  onClick={onLoadMore}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <RefreshCw className="spinning" size={14} />
                      Loading...
                    </>
                  ) : (
                    'Load More'
                  )}
                </button>
              )}
            </>
          )}
        </div>

        {/* Card Detail */}
        {selectedCard && (
          <CardDetailView
            card={selectedCard}
            database={database}
            onClose={handleCardClose}
          />
        )}
      </div>
    </div>
  )
}

// ============================================================================
// Card Detail View
// ============================================================================

interface CardDetailViewProps {
  card: NotionCard
  database: NotionDatabase
  onClose: () => void
}

function CardDetailView({ card, database, onClose }: CardDetailViewProps) {
  return (
    <div className="notion-viewer-card-detail">
      <div className="notion-viewer-detail-header">
        <h3>
          {card.icon && <span className="notion-viewer-card-icon">{card.icon}</span>}
          {card.title}
        </h3>
        <div className="notion-viewer-detail-actions">
          <button
            className="notion-viewer-detail-open"
            onClick={() => window.open(card.url, '_blank')}
          >
            <ExternalLink size={14} /> Open
          </button>
          <button onClick={onClose} className="notion-viewer-detail-close">×</button>
        </div>
      </div>

      {card.cover && (
        <div className="notion-viewer-detail-cover">
          <img src={card.cover} alt="Cover" />
        </div>
      )}

      <div className="notion-viewer-detail-content">
        {/* Properties */}
        <div className="notion-viewer-detail-section">
          <h4>Properties</h4>
          <div className="notion-viewer-properties-grid">
            {Object.entries(card.properties)
              .filter(([, prop]) => prop.type !== 'title')
              .map(([name, prop]) => (
                <div key={name} className="notion-viewer-property-row">
                  <span className="notion-viewer-property-name">
                    <PropertyIcon type={prop.type} />
                    {name}
                  </span>
                  <span className={`notion-viewer-property-value ${prop.type}`}>
                    {prop.displayValue || '—'}
                  </span>
                </div>
              ))}
          </div>
        </div>

        {/* Content */}
        {card.content && (
          <div className="notion-viewer-detail-section">
            <h4>Content</h4>
            <div className="notion-viewer-content-body">
              <pre>{card.content}</pre>
            </div>
          </div>
        )}

        {/* Metadata */}
        <div className="notion-viewer-detail-section">
          <h4>Metadata</h4>
          <div className="notion-viewer-metadata">
            <div className="notion-viewer-metadata-item">
              <span className="label">Created</span>
              <span className="value">{new Date(card.createdTime).toLocaleString()}</span>
            </div>
            <div className="notion-viewer-metadata-item">
              <span className="label">Last Edited</span>
              <span className="value">{new Date(card.lastEditedTime).toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Helper Components
// ============================================================================

function PropertyIcon({ type }: { type: string }) {
  switch (type) {
    case 'select':
    case 'multi_select':
    case 'status':
      return <Tag size={12} />
    case 'date':
    case 'created_time':
    case 'last_edited_time':
      return <Calendar size={12} />
    case 'people':
    case 'created_by':
    case 'last_edited_by':
      return <User size={12} />
    default:
      return null
  }
}

export default NotionViewerApp
