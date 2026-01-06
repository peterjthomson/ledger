/**
 * MailmapDetailPanel - Manage author identity mappings via .mailmap
 *
 * Shows all contributors and the current .mailmap file.
 * Drag users onto each other to combine identities.
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import type { AuthorIdentity, MailmapEntry } from '../../../types/electron'
import type { StatusMessage } from '../../../types/app-types'

export interface MailmapDetailPanelProps {
  onStatusChange?: (status: StatusMessage | null) => void
}

interface MergedIdentity {
  canonical: AuthorIdentity
  aliases: AuthorIdentity[]
}

export function MailmapDetailPanel({
  onStatusChange,
}: MailmapDetailPanelProps) {
  const [identities, setIdentities] = useState<AuthorIdentity[]>([])
  const [existingMailmap, setExistingMailmap] = useState<MailmapEntry[]>([])
  const [pendingMerges, setPendingMerges] = useState<MergedIdentity[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  // Track dragged identity by unique key (name + email)
  const [draggedKey, setDraggedKey] = useState<string | null>(null)
  const [dropTargetKey, setDropTargetKey] = useState<string | null>(null)
  
  // Create unique key for identity (since same email can have different names)
  const identityKey = useCallback((identity: AuthorIdentity) => {
    return `${identity.name}|||${identity.email}`
  }, [])

  // Load/reload data
  const loadData = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true)
    try {
      const [rawIdentities, mailmap] = await Promise.all([
        window.electronAPI.getAuthorIdentities(),
        window.electronAPI.getMailmap(),
      ])
      setIdentities(rawIdentities)
      setExistingMailmap(mailmap)
      setPendingMerges([])
    } catch (error) {
      console.error('Error loading identities:', error)
      onStatusChange?.({ type: 'error', message: 'Failed to load author identities' })
    } finally {
      if (showLoading) setLoading(false)
    }
  }, [onStatusChange])

  // Initial load
  useEffect(() => {
    loadData()
  }, [loadData])

  // Identities not in any pending merge
  const availableIdentities = useMemo(() => {
    const usedKeys = new Set<string>()
    for (const merge of pendingMerges) {
      usedKeys.add(identityKey(merge.canonical))
      for (const alias of merge.aliases) {
        usedKeys.add(identityKey(alias))
      }
    }
    return identities.filter(i => !usedKeys.has(identityKey(i)))
  }, [identities, pendingMerges, identityKey])

  // Calculate stats for meta panel
  const stats = useMemo(() => {
    // Mapped: number of rows in .mailmap file
    const mappedEntries = existingMailmap.length
    
    // Raw unique: total unique (name, email) pairs git sees
    const rawUnique = identities.length
    
    // Unique (with mapping): simulate mailmap application
    // For each identity, resolve to canonical if it's an alias, otherwise keep as-is
    const resolvedSet = new Set<string>()
    
    for (const identity of identities) {
      let resolvedKey: string | null = null
      
      // Check if this identity is an alias in any mailmap entry
      for (const entry of existingMailmap) {
        // Match logic: email must match, and if aliasName is specified, name must also match
        const emailMatches = identity.email.toLowerCase() === entry.aliasEmail.toLowerCase()
        const nameMatches = !entry.aliasName || identity.name === entry.aliasName
        
        if (emailMatches && nameMatches) {
          // This identity is an alias - resolve to canonical
          resolvedKey = `${entry.canonicalName.toLowerCase()}|||${entry.canonicalEmail.toLowerCase()}`
          break
        }
      }
      
      if (!resolvedKey) {
        // Not an alias - stays as itself
        resolvedKey = `${identity.name.toLowerCase()}|||${identity.email.toLowerCase()}`
      }
      
      resolvedSet.add(resolvedKey)
    }
    
    return {
      mappedEntries,
      rawUnique,
      uniqueWithMapping: resolvedSet.size,
    }
  }, [identities, existingMailmap])

  // Find identity by key
  const findIdentity = useCallback((key: string) => {
    return identities.find(i => identityKey(i) === key)
  }, [identities, identityKey])

  // Handle drag start
  const handleDragStart = useCallback((e: React.DragEvent, identity: AuthorIdentity) => {
    const key = identityKey(identity)
    setDraggedKey(key)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', key)
  }, [identityKey])

  // Handle drag end
  const handleDragEnd = useCallback(() => {
    setDraggedKey(null)
    setDropTargetKey(null)
  }, [])

  // Handle drag over
  const handleDragOver = useCallback((e: React.DragEvent, identity: AuthorIdentity) => {
    e.preventDefault()
    const key = identityKey(identity)
    if (draggedKey && draggedKey !== key) {
      setDropTargetKey(key)
    }
  }, [draggedKey, identityKey])

  // Handle drag leave
  const handleDragLeave = useCallback(() => {
    setDropTargetKey(null)
  }, [])

  // Handle drop - create or add to merge
  const handleDrop = useCallback((e: React.DragEvent, targetIdentity: AuthorIdentity) => {
    e.preventDefault()
    
    const targetKey = identityKey(targetIdentity)
    
    if (!draggedKey || draggedKey === targetKey) {
      setDraggedKey(null)
      setDropTargetKey(null)
      return
    }

    const dragged = findIdentity(draggedKey)
    
    if (!dragged) {
      setDraggedKey(null)
      setDropTargetKey(null)
      return
    }

    setPendingMerges(prev => {
      const draggedK = draggedKey
      const targetK = targetKey
      
      // Remove dragged from any existing merge (as canonical or alias)
      const updated = prev.map(m => {
        if (identityKey(m.canonical) === draggedK) {
          // Dragged was a canonical - dissolve this merge, aliases go back to available
          return null
        }
        // Remove from aliases
        const newAliases = m.aliases.filter(a => identityKey(a) !== draggedK)
        if (newAliases.length === 0 && identityKey(m.canonical) !== targetK) {
          return null // No more aliases and not the target - dissolve
        }
        return { ...m, aliases: newAliases }
      }).filter(Boolean) as MergedIdentity[]

      // Check if target is already a canonical
      const targetMergeIdx = updated.findIndex(m => identityKey(m.canonical) === targetK)
      
      if (targetMergeIdx >= 0) {
        // Add dragged to existing group
        updated[targetMergeIdx] = {
          ...updated[targetMergeIdx],
          aliases: [...updated[targetMergeIdx].aliases, dragged]
        }
      } else {
        // Create new merge with target as canonical
        updated.push({ canonical: targetIdentity, aliases: [dragged] })
      }

      return updated
    })

    setDraggedKey(null)
    setDropTargetKey(null)
  }, [draggedKey, findIdentity, identityKey])

  // Remove alias from merge
  const handleRemoveAlias = useCallback((canonical: AuthorIdentity, alias: AuthorIdentity) => {
    setPendingMerges(prev => {
      return prev.map(m => {
        if (identityKey(m.canonical) === identityKey(canonical)) {
          const newAliases = m.aliases.filter(a => identityKey(a) !== identityKey(alias))
          if (newAliases.length === 0) return null
          return { ...m, aliases: newAliases }
        }
        return m
      }).filter(Boolean) as MergedIdentity[]
    })
  }, [identityKey])

  // Delete a mailmap entry
  const handleDeleteEntry = useCallback(async (entry: MailmapEntry) => {
    try {
      const result = await window.electronAPI.removeMailmapEntry(entry)
      if (result.success) {
        onStatusChange?.({ type: 'success', message: result.message })
        await loadData(false)
      } else {
        onStatusChange?.({ type: 'error', message: result.message })
      }
    } catch (_error) {
      onStatusChange?.({ type: 'error', message: 'Failed to remove entry' })
    }
  }, [onStatusChange, loadData])

  // Save to .mailmap
  const handleSave = useCallback(async () => {
    setSaving(true)
    onStatusChange?.({ type: 'info', message: 'Saving to .mailmap...' })
    
    try {
      const entries: MailmapEntry[] = []
      for (const merge of pendingMerges) {
        for (const alias of merge.aliases) {
          entries.push({
            canonicalName: merge.canonical.name,
            canonicalEmail: merge.canonical.email,
            aliasName: alias.name !== merge.canonical.name ? alias.name : undefined,
            aliasEmail: alias.email,
          })
        }
      }
      
      const result = await window.electronAPI.addMailmapEntries(entries)
      
      if (result.success) {
        onStatusChange?.({ type: 'success', message: result.message })
        // Reload all data to refresh the table
        await loadData(false)
      } else {
        onStatusChange?.({ type: 'error', message: result.message })
      }
    } catch (_error) {
      onStatusChange?.({ type: 'error', message: 'Failed to save .mailmap' })
    } finally {
      setSaving(false)
    }
  }, [pendingMerges, onStatusChange, loadData])

  // Render identity card
  const renderCard = (identity: AuthorIdentity, options?: { onRemove?: () => void }) => {
    const key = identityKey(identity)
    const isDragging = draggedKey === key
    const isDropTarget = dropTargetKey === key
    
    return (
      <div
        className={`mailmap-card ${isDragging ? 'dragging' : ''} ${isDropTarget ? 'drop-target' : ''}`}
        draggable
        onDragStart={(e) => handleDragStart(e, identity)}
        onDragEnd={handleDragEnd}
        onDragOver={(e) => handleDragOver(e, identity)}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDrop(e, identity)}
      >
        <span className="card-name">{identity.name}</span>
        <span className="card-email">{identity.email}</span>
        <span className="card-count">{identity.commitCount}</span>
        {options?.onRemove && (
          <button className="card-remove" onClick={options.onRemove} title="Remove">×</button>
        )}
      </div>
    )
  }

  if (loading) {
    return (
      <div className="sidebar-detail-panel mailmap-panel">
        <div className="detail-loading">Loading contributors...</div>
      </div>
    )
  }

  return (
    <div className="sidebar-detail-panel mailmap-panel">
      <div className="detail-type-badge">Contributors</div>
      <h3 className="detail-title">Manage Author Identities</h3>
      
      {/* Meta grid like other detail panels */}
      <div className="detail-meta-grid">
        <div className="detail-meta-item">
          <span className="meta-label">Git Authors</span>
          <span className="meta-value">{stats.rawUnique}</span>
        </div>
        <div className="detail-meta-item">
          <span className="meta-label">After Mapping</span>
          <span className="meta-value">{stats.uniqueWithMapping}</span>
        </div>
        <div className="detail-meta-item">
          <span className="meta-label">Entries</span>
          <span className="meta-value">{stats.mappedEntries}</span>
        </div>
      </div>

      <p className="mailmap-hint">
        Drag one user onto another to combine them. The drop target becomes the canonical name.
      </p>

      {/* Existing .mailmap entries */}
      {existingMailmap.length > 0 && (
        <div className="mailmap-section">
          <h4>Current .mailmap ({existingMailmap.length} entries)</h4>
          <table className="mailmap-table">
            <thead>
              <tr>
                <th>Canonical</th>
                <th>Alias</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {existingMailmap.map((entry, idx) => (
                <tr key={`entry-${idx}`}>
                  <td>{entry.canonicalName} &lt;{entry.canonicalEmail}&gt;</td>
                  <td>{entry.aliasName ? `${entry.aliasName} ` : ''}&lt;{entry.aliasEmail}&gt;</td>
                  <td>
                    <button 
                      className="mailmap-delete-btn"
                      onClick={() => handleDeleteEntry(entry)}
                      title="Remove entry"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pending Merges */}
      {pendingMerges.length > 0 && (
        <div className="mailmap-section">
          <h4>Pending Changes ({pendingMerges.length})</h4>
          <div className="mailmap-merges">
            {pendingMerges.map((merge, idx) => (
              <div key={`merge-${idx}`} className="mailmap-merge-group">
                <div className="merge-canonical">
                  {renderCard(merge.canonical)}
                </div>
                <div className="merge-arrow">←</div>
                <div className="merge-aliases">
                  {merge.aliases.map((alias, aIdx) => (
                    <div key={`alias-${aIdx}`}>
                      {renderCard(alias, { onRemove: () => handleRemoveAlias(merge.canonical, alias) })}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <button 
            className="btn btn-primary" 
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save to .mailmap'}
          </button>
        </div>
      )}

      {/* All Contributors */}
      <div className="mailmap-section">
        <h4>Contributors ({availableIdentities.length})</h4>
        <div className="mailmap-list">
          {availableIdentities.map((identity, idx) => (
            <div key={`id-${idx}`}>
              {renderCard(identity)}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

