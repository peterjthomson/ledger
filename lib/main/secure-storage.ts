/**
 * Secure Storage
 *
 * Wraps Electron's safeStorage API for encrypting sensitive data like API keys.
 *
 * Platform behavior:
 * - macOS: Uses Keychain (strong, hardware-backed on Apple Silicon)
 * - Windows: Uses DPAPI (strong, user-account bound)
 * - Linux: Uses gnome-keyring/kwallet if available, falls back to basic_text
 *
 * The 'basic_text' fallback on Linux uses a hardcoded key - weak but better than plaintext.
 * We detect this and can warn users in the UI.
 */

import { safeStorage } from 'electron'

export type EncryptionBackend =
  | 'basic_text'
  | 'gnome_libsecret'
  | 'kwallet'
  | 'kwallet5'
  | 'kwallet6'
  | 'dpapi' // Windows
  | 'keychain' // macOS
  | 'unknown'

export interface SecureStorageStatus {
  /** Whether encryption is available at all */
  available: boolean
  /** The backend being used */
  backend: EncryptionBackend
  /** Whether the encryption is considered strong (not basic_text) */
  isStrong: boolean
}

// Prefix to identify encrypted values in storage
const ENCRYPTED_PREFIX = 'enc:v1:'

/**
 * Get the current encryption status
 */
export function getEncryptionStatus(): SecureStorageStatus {
  const available = safeStorage.isEncryptionAvailable()

  if (!available) {
    return {
      available: false,
      backend: 'unknown',
      isStrong: false,
    }
  }

  // Get the backend - this tells us what's actually being used
  // Note: getSelectedStorageBackend() was added in Electron 25.5.0
  // Check if it exists to handle edge cases with bundling/versions
  let backend: EncryptionBackend = 'unknown'
  if (typeof safeStorage.getSelectedStorageBackend === 'function') {
    backend = safeStorage.getSelectedStorageBackend() as EncryptionBackend
  } else {
    // Fallback: on macOS it's always keychain when available
    if (process.platform === 'darwin') {
      backend = 'keychain'
    }
  }

  return {
    available: true,
    backend,
    isStrong: backend !== 'basic_text' && backend !== 'unknown',
  }
}

/**
 * Encrypt a string value
 * Returns the encrypted value as a base64 string with prefix
 */
export function encryptString(plaintext: string): string {
  if (!plaintext) {
    return ''
  }

  const status = getEncryptionStatus()
  if (!status.available) {
    // If encryption isn't available, store plaintext (with warning logged)
    console.warn('[SecureStorage] Encryption not available, storing plaintext')
    return plaintext
  }

  try {
    const encrypted = safeStorage.encryptString(plaintext)
    return ENCRYPTED_PREFIX + encrypted.toString('base64')
  } catch (error) {
    console.error('[SecureStorage] Encryption failed:', error)
    // Fall back to plaintext on error
    return plaintext
  }
}

/**
 * Decrypt a string value
 * Handles both encrypted (prefixed) and unencrypted values
 */
export function decryptString(stored: string): string {
  if (!stored) {
    return ''
  }

  // Check if this is an encrypted value
  if (!stored.startsWith(ENCRYPTED_PREFIX)) {
    // Not encrypted - return as-is (stored without encryption available)
    return stored
  }

  const status = getEncryptionStatus()
  if (!status.available) {
    console.warn('[SecureStorage] Cannot decrypt - encryption not available')
    // Can't decrypt, return empty (user will need to re-enter)
    return ''
  }

  try {
    const base64Data = stored.slice(ENCRYPTED_PREFIX.length)
    const buffer = Buffer.from(base64Data, 'base64')
    return safeStorage.decryptString(buffer)
  } catch (error) {
    console.error('[SecureStorage] Decryption failed:', error)
    // Can't decrypt - could be corrupted or from different machine
    return ''
  }
}

/**
 * Check if a stored value is encrypted
 */
export function isEncrypted(stored: string): boolean {
  return stored?.startsWith(ENCRYPTED_PREFIX) ?? false
}

/**
 * Encrypt an API key for storage
 * This is a convenience wrapper with clearer intent
 */
export function encryptApiKey(apiKey: string): string {
  return encryptString(apiKey)
}

/**
 * Decrypt an API key from storage
 * This is a convenience wrapper with clearer intent
 */
export function decryptApiKey(stored: string): string {
  return decryptString(stored)
}
