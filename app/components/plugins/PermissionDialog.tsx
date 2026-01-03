/**
 * Permission Dialog
 *
 * Displays a modal for users to approve or deny plugin permission requests.
 * Follows the principle of explicit consent - users must actively approve
 * each permission a plugin requests.
 */

import React, { useState, useCallback } from 'react'
import { Shield, AlertTriangle, Check, X } from 'lucide-react'
import type { PluginPermission } from '@/lib/plugins/plugin-types'

// Permission descriptions for user understanding
const permissionDescriptions: Record<PluginPermission, { label: string; description: string; risk: 'low' | 'medium' | 'high' }> = {
  'git:read': {
    label: 'Read Git Data',
    description: 'Read repository information including branches, commits, and status',
    risk: 'low',
  },
  'git:write': {
    label: 'Write Git Data',
    description: 'Perform git operations like checkout, commit, push, and pull',
    risk: 'medium',
  },
  'fs:read': {
    label: 'Read Files',
    description: 'Read files from the repository',
    risk: 'low',
  },
  'fs:write': {
    label: 'Write Files',
    description: 'Create, modify, or delete files in the repository',
    risk: 'high',
  },
  network: {
    label: 'Network Access',
    description: 'Make network requests to external services',
    risk: 'medium',
  },
  shell: {
    label: 'Shell Commands',
    description: 'Execute shell commands on your system',
    risk: 'high',
  },
  clipboard: {
    label: 'Clipboard Access',
    description: 'Read from and write to the system clipboard',
    risk: 'low',
  },
  notifications: {
    label: 'Notifications',
    description: 'Show system notifications',
    risk: 'low',
  },
}

const riskColors: Record<'low' | 'medium' | 'high', string> = {
  low: 'var(--color-success)',
  medium: 'var(--color-warning)',
  high: 'var(--color-danger)',
}

export interface PermissionDialogProps {
  pluginId: string
  pluginName: string
  permissions: PluginPermission[]
  onApprove: (approved: PluginPermission[]) => void
  onDeny: () => void
}

export function PermissionDialog({
  pluginId,
  pluginName,
  permissions,
  onApprove,
  onDeny,
}: PermissionDialogProps) {
  // Track which permissions are selected (default: all selected)
  const [selected, setSelected] = useState<Set<PluginPermission>>(
    () => new Set(permissions)
  )

  const togglePermission = useCallback((permission: PluginPermission) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(permission)) {
        next.delete(permission)
      } else {
        next.add(permission)
      }
      return next
    })
  }, [])

  const handleApprove = useCallback(() => {
    onApprove(Array.from(selected))
  }, [selected, onApprove])

  const hasHighRiskPermissions = permissions.some(
    (p) => permissionDescriptions[p]?.risk === 'high'
  )

  return (
    <div className="modal-overlay" onClick={onDeny}>
      <div
        className="modal permission-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="permission-dialog-title"
        aria-describedby="permission-dialog-description"
      >
        <div className="modal-header">
          <div className="permission-dialog-header-content">
            <Shield size={20} />
            <h3 id="permission-dialog-title" className="modal-title">
              Permission Request
            </h3>
          </div>
          <button className="modal-close" onClick={onDeny} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="modal-body">
          <p id="permission-dialog-description" className="permission-dialog-intro">
            <strong>{pluginName}</strong> is requesting the following permissions:
          </p>

          {hasHighRiskPermissions && (
            <div className="permission-dialog-warning">
              <AlertTriangle size={16} />
              <span>This plugin requests high-risk permissions. Only approve if you trust the source.</span>
            </div>
          )}

          <ul className="permission-list">
            {permissions.map((permission) => {
              const info = permissionDescriptions[permission]
              const isSelected = selected.has(permission)

              return (
                <li
                  key={permission}
                  className={`permission-item ${isSelected ? 'selected' : ''}`}
                  onClick={() => togglePermission(permission)}
                >
                  <div className="permission-checkbox">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => togglePermission(permission)}
                      id={`perm-${permission}`}
                    />
                    <label htmlFor={`perm-${permission}`} className="permission-check-icon">
                      {isSelected && <Check size={14} />}
                    </label>
                  </div>

                  <div className="permission-content">
                    <div className="permission-header">
                      <span className="permission-label">{info?.label ?? permission}</span>
                      <span
                        className="permission-risk"
                        style={{ color: riskColors[info?.risk ?? 'medium'] }}
                      >
                        {info?.risk ?? 'unknown'} risk
                      </span>
                    </div>
                    <p className="permission-description">{info?.description}</p>
                  </div>
                </li>
              )
            })}
          </ul>

          <p className="permission-dialog-note">
            You can modify these permissions later in plugin settings.
          </p>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onDeny}>
            Deny All
          </button>
          <button
            className="btn btn-primary"
            onClick={handleApprove}
            disabled={selected.size === 0}
          >
            {selected.size === permissions.length
              ? 'Approve All'
              : `Approve ${selected.size} of ${permissions.length}`}
          </button>
        </div>
      </div>
    </div>
  )
}

export default PermissionDialog
