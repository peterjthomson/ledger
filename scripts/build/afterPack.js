/**
 * electron-builder afterPack hook
 * Removes unused locale files from the Electron Framework to reduce bundle size
 */
const fs = require('fs')
const path = require('path')

// Keep only these locales (saves ~40MB)
const KEEP_LOCALES = ['en', 'en_GB', 'en_US']

exports.default = async function (context) {
  if (context.electronPlatformName !== 'darwin') {
    return
  }

  const appPath = context.appOutDir
  const frameworkResourcesPath = path.join(
    appPath,
    'Ledger.app',
    'Contents',
    'Frameworks',
    'Electron Framework.framework',
    'Versions',
    'A',
    'Resources'
  )

  // Also clean app-level Resources
  const appResourcesPath = path.join(appPath, 'Ledger.app', 'Contents', 'Resources')

  for (const resourcePath of [frameworkResourcesPath, appResourcesPath]) {
    if (!fs.existsSync(resourcePath)) {
      console.log(`[afterPack] Skipping non-existent path: ${resourcePath}`)
      continue
    }

    const items = fs.readdirSync(resourcePath)
    let removed = 0
    let savedBytes = 0

    for (const item of items) {
      if (item.endsWith('.lproj')) {
        const localeName = item.replace('.lproj', '')
        if (!KEEP_LOCALES.includes(localeName)) {
          const localePath = path.join(resourcePath, item)
          const stats = getDirectorySize(localePath)
          fs.rmSync(localePath, { recursive: true, force: true })
          removed++
          savedBytes += stats
        }
      }
    }

    if (removed > 0) {
      console.log(
        `[afterPack] Removed ${removed} unused locale(s) from ${path.basename(resourcePath)} (saved ${(savedBytes / 1024 / 1024).toFixed(1)}MB)`
      )
    }
  }
}

function getDirectorySize(dirPath) {
  let size = 0
  try {
    const items = fs.readdirSync(dirPath, { withFileTypes: true })
    for (const item of items) {
      const itemPath = path.join(dirPath, item.name)
      if (item.isDirectory()) {
        size += getDirectorySize(itemPath)
      } else {
        size += fs.statSync(itemPath).size
      }
    }
  } catch {
    // Ignore errors
  }
  return size
}
