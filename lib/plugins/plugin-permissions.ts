/**
 * Plugin Permissions
 *
 * Manages plugin permissions - tracking what each plugin is allowed to do.
 * Currently logs and auto-approves, but provides the foundation for
 * future UI-based permission requests.
 */

import type { PluginPermission } from './plugin-types'

// ============================================================================
// Permission Storage
// ============================================================================

/** Granted permissions per plugin */
const grantedPermissions = new Map<string, Set<PluginPermission>>()

// ============================================================================
// Permission Management
// ============================================================================

/**
 * Check if a plugin has a specific permission
 */
export function hasPermission(pluginId: string, permission: PluginPermission): boolean {
  const perms = grantedPermissions.get(pluginId)
  return perms?.has(permission) ?? false
}

/**
 * Check if a plugin has ALL specified permissions
 */
export function hasAllPermissions(pluginId: string, permissions: PluginPermission[]): boolean {
  return permissions.every((p) => hasPermission(pluginId, p))
}

/**
 * Check if a plugin has ANY of the specified permissions
 */
export function hasAnyPermission(pluginId: string, permissions: PluginPermission[]): boolean {
  return permissions.some((p) => hasPermission(pluginId, p))
}

/**
 * Grant permissions to a plugin.
 * Called during plugin activation after user approval.
 */
export function grantPermissions(pluginId: string, permissions: PluginPermission[]): void {
  let perms = grantedPermissions.get(pluginId)
  if (!perms) {
    perms = new Set()
    grantedPermissions.set(pluginId, perms)
  }

  for (const permission of permissions) {
    perms.add(permission)
  }

  console.info(`[Permissions] Granted to ${pluginId}:`, permissions)
}

/**
 * Revoke all permissions from a plugin.
 * Called during plugin deactivation.
 */
export function revokePermissions(pluginId: string): void {
  const had = grantedPermissions.has(pluginId)
  grantedPermissions.delete(pluginId)

  if (had) {
    console.info(`[Permissions] Revoked all permissions from ${pluginId}`)
  }
}

/**
 * Revoke a single permission from a plugin.
 * Called from the plugin settings UI for granular permission management.
 * Returns true if the permission was revoked, false if it wasn't granted.
 */
export function revokePermission(pluginId: string, permission: PluginPermission): boolean {
  const perms = grantedPermissions.get(pluginId)
  if (!perms) {
    return false
  }

  const revoked = perms.delete(permission)
  if (revoked) {
    console.info(`[Permissions] Revoked ${permission} from ${pluginId}`)
  }
  return revoked
}

/**
 * Get all permissions granted to a plugin
 */
export function getPermissions(pluginId: string): PluginPermission[] {
  const perms = grantedPermissions.get(pluginId)
  return perms ? Array.from(perms) : []
}

// ============================================================================
// Permission Enforcement
// ============================================================================

/**
 * Assert that a plugin has a permission, throwing if not.
 * Use this at API boundaries to enforce permissions.
 */
export function requirePermission(pluginId: string, permission: PluginPermission): void {
  if (!hasPermission(pluginId, permission)) {
    const error = new Error(`Plugin "${pluginId}" lacks required permission: ${permission}`)
    console.error(`[Permissions] ${error.message}`)
    throw error
  }
}

/**
 * Create a permission-checked wrapper for an async function.
 * Returns a function that checks permission before executing.
 */
export function withPermission<T extends (...args: unknown[]) => Promise<unknown>>(
  pluginId: string,
  permission: PluginPermission,
  fn: T
): T {
  return (async (...args: Parameters<T>) => {
    requirePermission(pluginId, permission)
    return fn(...args)
  }) as T
}

// ============================================================================
// Permission Descriptions (for future UI)
// ============================================================================

export const permissionDescriptions: Record<PluginPermission, string> = {
  'git:read': 'Read git repository information (branches, commits, status)',
  'git:write': 'Perform git operations (checkout, commit, push, pull)',
  'fs:read': 'Read files from the repository',
  'fs:write': 'Write files to the repository',
  network: 'Make network requests to external services',
  shell: 'Execute shell commands',
  clipboard: 'Access the system clipboard',
  notifications: 'Show system notifications',
}

/**
 * Get human-readable description of a permission
 */
export function describePermission(permission: PluginPermission): string {
  return permissionDescriptions[permission] ?? permission
}
