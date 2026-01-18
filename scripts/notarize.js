/**
 * Custom notarization hook for electron-builder
 *
 * This script is called by electron-builder after code signing.
 * It provides more control over notarization than the built-in `notarize: true` option.
 *
 * How it works:
 * 1. electron-builder builds and signs the .app
 * 2. electron-builder calls this hook via `afterSign`
 * 3. We submit the .app to Apple's notarization service
 * 4. We wait for Apple to process (can take 1-30+ minutes)
 * 5. The notarization ticket is "stapled" to the app
 * 6. electron-builder continues to create DMG/ZIP
 *
 * Usage:
 *   APPLE_KEYCHAIN_PROFILE="AC_PASSWORD" npm run release
 *
 * Debug:
 *   DEBUG=electron-notarize* APPLE_KEYCHAIN_PROFILE="AC_PASSWORD" npm run release
 */

const { notarize } = require('@electron/notarize');

// Configuration
const KEYCHAIN_PROFILE = process.env.APPLE_KEYCHAIN_PROFILE || 'AC_PASSWORD';
const SKIP_NOTARIZATION = process.env.SKIP_NOTARIZATION === 'true';

/**
 * Main export - called by electron-builder after signing
 * @param {Object} context - electron-builder context
 */
exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;

  // Only notarize macOS builds
  if (electronPlatformName !== 'darwin') {
    console.log('Skipping notarization: not macOS');
    return;
  }

  // Allow skipping for local testing
  if (SKIP_NOTARIZATION) {
    console.log('Skipping notarization: SKIP_NOTARIZATION=true');
    return;
  }

  // Get app path
  const appName = context.packager.appInfo.productFilename;
  const appPath = `${appOutDir}/${appName}.app`;

  console.log('');
  console.log('='.repeat(60));
  console.log('NOTARIZATION');
  console.log('='.repeat(60));
  console.log(`App: ${appPath}`);
  console.log(`Keychain Profile: ${KEYCHAIN_PROFILE}`);
  console.log('');
  console.log('Submitting to Apple notarization service...');
  console.log('(This can take 1-30+ minutes depending on Apple\'s servers)');
  console.log('');

  const startTime = Date.now();

  try {
    await notarize({
      appPath,
      // Use keychain profile (most secure - credentials stored in macOS Keychain)
      keychainProfile: KEYCHAIN_PROFILE,

      // Alternative: Use App Store Connect API key (also secure)
      // appleApiKey: process.env.APPLE_API_KEY_PATH,
      // appleApiKeyId: process.env.APPLE_API_KEY_ID,
      // appleApiIssuer: process.env.APPLE_API_ISSUER,

      // Alternative: Use Apple ID directly (less secure)
      // appleId: process.env.APPLE_ID,
      // appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
      // teamId: process.env.APPLE_TEAM_ID,
    });

    const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    console.log('');
    console.log(`✅ Notarization complete! (${duration} minutes)`);
    console.log('');
    console.log('The app has been notarized and stapled.');
    console.log('Users will not see Gatekeeper warnings when opening the app.');
    console.log('='.repeat(60));
    console.log('');
  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    console.error('');
    console.error(`❌ Notarization failed after ${duration} minutes`);
    console.error('');
    console.error('Error:', error.message);
    console.error('');
    console.error('Troubleshooting:');
    console.error('1. Check Apple Developer account status at developer.apple.com');
    console.error('2. Verify keychain profile exists: security find-generic-password -s "AC_PASSWORD"');
    console.error('3. Check submission status: xcrun notarytool history --keychain-profile "AC_PASSWORD"');
    console.error('4. Get detailed logs: xcrun notarytool log <submission-id> --keychain-profile "AC_PASSWORD"');
    console.error('');

    // Re-throw to fail the build
    throw error;
  }
};
