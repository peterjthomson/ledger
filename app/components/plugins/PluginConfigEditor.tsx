/**
 * Plugin Config Editor
 *
 * Form component for editing plugin settings and managing permissions.
 * Renders appropriate inputs based on setting type.
 */

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { Save, RotateCcw, AlertCircle, Check, Shield, ShieldOff, ShieldAlert } from 'lucide-react'
import type { Plugin, PluginSetting, PluginPermission } from '@/lib/plugins/plugin-types'
import { pluginSettingsStore } from '@/lib/plugins/plugin-settings-store'
import {
  getPermissions,
  revokePermissions,
  revokePermission,
  grantPermissions,
  describePermission,
} from '@/lib/plugins/plugin-permissions'
import { pluginRegistry } from '@/lib/plugins/plugin-loader'

interface PluginConfigEditorProps {
  plugin: Plugin
  onClose?: () => void
}

interface SettingValue {
  value: unknown
  error?: string
  dirty: boolean
}

export function PluginConfigEditor({ plugin, onClose }: PluginConfigEditorProps) {
  const settings = plugin.settings ?? []

  // Load current values
  const initialValues = useMemo(() => {
    const stored = pluginSettingsStore.getAll(plugin.id)
    const values: Record<string, SettingValue> = {}

    for (const setting of settings) {
      values[setting.key] = {
        value: stored[setting.key] ?? setting.default,
        dirty: false,
      }
    }

    return values
  }, [plugin.id, settings])

  const [values, setValues] = useState<Record<string, SettingValue>>(initialValues)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  // Ref to track save status timeout for cleanup
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [])

  const hasChanges = useMemo(() => {
    return Object.values(values).some((v) => v.dirty)
  }, [values])

  const hasErrors = useMemo(() => {
    return Object.values(values).some((v) => v.error)
  }, [values])

  const handleChange = useCallback(
    (key: string, value: unknown) => {
      const setting = settings.find((s) => s.key === key)
      if (!setting) return

      // Validate
      const validation = pluginSettingsStore.validate(setting, value)

      setValues((prev) => ({
        ...prev,
        [key]: {
          value,
          error: validation.valid ? undefined : validation.error,
          dirty: true,
        },
      }))
    },
    [settings]
  )

  const handleSave = useCallback(() => {
    if (hasErrors) return

    setSaveStatus('saving')

    try {
      const toSave: Record<string, unknown> = {}
      for (const [key, { value }] of Object.entries(values)) {
        toSave[key] = value
      }

      pluginSettingsStore.setMultiple(plugin.id, toSave)

      // Mark all as not dirty
      setValues((prev) => {
        const next: Record<string, SettingValue> = {}
        for (const [key, v] of Object.entries(prev)) {
          next[key] = { ...v, dirty: false }
        }
        return next
      })

      setSaveStatus('saved')
      // Clear any pending timeout and set new one (with cleanup tracking)
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
      saveTimeoutRef.current = setTimeout(() => setSaveStatus('idle'), 2000)
    } catch (error) {
      console.error('[PluginConfig] Save failed:', error)
      setSaveStatus('error')
    }
  }, [plugin.id, values, hasErrors])

  const handleReset = useCallback(() => {
    pluginSettingsStore.resetAll(plugin.id, settings)
    setValues(initialValues)
    setSaveStatus('idle')
  }, [plugin.id, settings, initialValues])

  // Get current permissions
  const [currentPermissions, setCurrentPermissions] = useState<PluginPermission[]>(() =>
    getPermissions(plugin.id)
  )

  // Get manifest permissions for context
  const manifestPermissions = useMemo(() => {
    const installed = pluginRegistry.get(plugin.id)
    return installed?.permissions ?? []
  }, [plugin.id])

  // Refresh permissions when they change
  useEffect(() => {
    setCurrentPermissions(getPermissions(plugin.id))
  }, [plugin.id])

  const handleRevokePermission = useCallback(
    (permission: PluginPermission) => {
      try {
        // Use granular revocation for single permission
        revokePermission(plugin.id, permission)
        setCurrentPermissions((prev) => prev.filter((p) => p !== permission))
      } catch (error) {
        console.error('[PluginConfig] Failed to revoke permission:', error)
      }
    },
    [plugin.id]
  )

  const handleRevokeAll = useCallback(() => {
    try {
      revokePermissions(plugin.id)
      setCurrentPermissions([])
    } catch (error) {
      console.error('[PluginConfig] Failed to revoke all permissions:', error)
    }
  }, [plugin.id])

  const handleRestorePermission = useCallback(
    (permission: PluginPermission) => {
      try {
        grantPermissions(plugin.id, [permission])
        setCurrentPermissions((prev) => [...prev, permission])
      } catch (error) {
        console.error('[PluginConfig] Failed to restore permission:', error)
      }
    },
    [plugin.id]
  )

  const revokedPermissions = manifestPermissions.filter(
    (p) => !currentPermissions.includes(p)
  )

  const hasPermissionSection = manifestPermissions.length > 0

  if (settings.length === 0 && !hasPermissionSection) {
    return (
      <div className="plugin-config-empty">
        <p>This plugin has no configurable settings.</p>
      </div>
    )
  }

  return (
    <div className="plugin-config-editor">
      {/* Permissions Section */}
      {hasPermissionSection && (
        <div className="plugin-permissions-section">
          <div className="plugin-permissions-header">
            <h3>
              <Shield size={16} />
              Permissions
            </h3>
            {currentPermissions.length > 0 && (
              <button
                className="plugin-revoke-all-button"
                onClick={handleRevokeAll}
                title="Revoke all permissions"
              >
                <ShieldOff size={12} />
                Revoke All
              </button>
            )}
          </div>

          <p className="plugin-permissions-description">
            Manage the permissions granted to this plugin. Revoking permissions may limit functionality.
          </p>

          <div className="plugin-permissions-list">
            {/* Active Permissions */}
            {currentPermissions.map((permission) => (
              <div key={permission} className="plugin-permission-item active">
                <div className="plugin-permission-info">
                  <Shield size={14} className="plugin-permission-icon granted" />
                  <div>
                    <span className="plugin-permission-name">{permission}</span>
                    <span className="plugin-permission-desc">
                      {describePermission(permission)}
                    </span>
                  </div>
                </div>
                <button
                  className="plugin-permission-action revoke"
                  onClick={() => handleRevokePermission(permission)}
                  title="Revoke this permission"
                >
                  <ShieldOff size={12} />
                  Revoke
                </button>
              </div>
            ))}

            {/* Revoked Permissions */}
            {revokedPermissions.map((permission) => (
              <div key={permission} className="plugin-permission-item revoked">
                <div className="plugin-permission-info">
                  <ShieldAlert size={14} className="plugin-permission-icon revoked" />
                  <div>
                    <span className="plugin-permission-name">{permission}</span>
                    <span className="plugin-permission-desc">
                      {describePermission(permission)}
                    </span>
                  </div>
                </div>
                <button
                  className="plugin-permission-action restore"
                  onClick={() => handleRestorePermission(permission)}
                  title="Restore this permission"
                >
                  <Shield size={12} />
                  Restore
                </button>
              </div>
            ))}

            {currentPermissions.length === 0 && revokedPermissions.length === 0 && (
              <div className="plugin-permissions-empty">
                This plugin has no permissions configured.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Settings Section */}
      {settings.length > 0 && (
        <>
          {hasPermissionSection && (
            <div className="plugin-config-divider" />
          )}

          <div className="plugin-config-form">
            {settings.map((setting) => (
              <SettingField
                key={setting.key}
                setting={setting}
                value={values[setting.key]?.value}
                error={values[setting.key]?.error}
                onChange={(value) => handleChange(setting.key, value)}
              />
            ))}
          </div>

          <div className="plugin-config-actions">
            <button
              className="plugin-config-button secondary"
              onClick={handleReset}
              title="Reset all settings to defaults"
            >
              <RotateCcw size={14} />
              Reset
            </button>
            <button
              className="plugin-config-button primary"
              onClick={handleSave}
              disabled={!hasChanges || hasErrors}
              title={hasErrors ? 'Fix errors before saving' : 'Save changes'}
            >
              {saveStatus === 'saving' ? (
                'Saving...'
              ) : saveStatus === 'saved' ? (
                <>
                  <Check size={14} />
                  Saved
                </>
              ) : (
                <>
                  <Save size={14} />
                  Save
                </>
              )}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

interface SettingFieldProps {
  setting: PluginSetting
  value: unknown
  error?: string
  onChange: (value: unknown) => void
}

function SettingField({ setting, value, error, onChange }: SettingFieldProps) {
  const id = `setting-${setting.key}`

  return (
    <div className={`plugin-config-field ${error ? 'has-error' : ''}`}>
      <div className="plugin-config-field-header">
        <label htmlFor={id} className="plugin-config-label">
          {setting.label}
          {setting.required && <span className="required">*</span>}
        </label>
        {error && (
          <span className="plugin-config-error">
            <AlertCircle size={12} />
            {error}
          </span>
        )}
      </div>

      {setting.description && (
        <p className="plugin-config-description">{setting.description}</p>
      )}

      <div className="plugin-config-input-wrapper">
        {renderInput(setting, value, onChange, id)}
      </div>
    </div>
  )
}

function renderInput(
  setting: PluginSetting,
  value: unknown,
  onChange: (value: unknown) => void,
  id: string
) {
  switch (setting.type) {
    case 'string':
      return (
        <input
          id={id}
          type="text"
          className="plugin-config-input"
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={String(setting.default ?? '')}
        />
      )

    case 'number':
      return (
        <input
          id={id}
          type="number"
          className="plugin-config-input"
          value={(value as number) ?? ''}
          onChange={(e) => onChange(e.target.valueAsNumber)}
          min={setting.validation?.min}
          max={setting.validation?.max}
          placeholder={String(setting.default ?? '')}
        />
      )

    case 'boolean':
      return (
        <label className="plugin-config-toggle">
          <input
            id={id}
            type="checkbox"
            checked={(value as boolean) ?? false}
            onChange={(e) => onChange(e.target.checked)}
          />
          <span className="plugin-config-toggle-track">
            <span className="plugin-config-toggle-thumb" />
          </span>
        </label>
      )

    case 'select':
      return (
        <select
          id={id}
          className="plugin-config-select"
          value={String(value ?? setting.default ?? '')}
          onChange={(e) => onChange(e.target.value)}
        >
          {setting.options?.map((opt) => (
            <option key={String(opt.value)} value={String(opt.value)}>
              {opt.label}
            </option>
          ))}
        </select>
      )

    case 'multiselect': {
      const selectedValues = (value as unknown[]) ?? []
      return (
        <div className="plugin-config-multiselect">
          {setting.options?.map((opt) => (
            <label key={String(opt.value)} className="plugin-config-checkbox">
              <input
                type="checkbox"
                checked={selectedValues.includes(opt.value)}
                onChange={(e) => {
                  if (e.target.checked) {
                    onChange([...selectedValues, opt.value])
                  } else {
                    onChange(selectedValues.filter((v) => v !== opt.value))
                  }
                }}
              />
              <span>{opt.label}</span>
            </label>
          ))}
        </div>
      )
    }

    case 'color':
      return (
        <div className="plugin-config-color">
          <input
            id={id}
            type="color"
            value={(value as string) ?? '#000000'}
            onChange={(e) => onChange(e.target.value)}
          />
          <input
            type="text"
            className="plugin-config-input"
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder="#000000"
            pattern="^#[0-9A-Fa-f]{6}$"
          />
        </div>
      )

    case 'file':
      return (
        <input
          id={id}
          type="text"
          className="plugin-config-input"
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Enter file path..."
        />
      )

    default:
      return (
        <input
          id={id}
          type="text"
          className="plugin-config-input"
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
        />
      )
  }
}

export default PluginConfigEditor
