# Build and release

The canonical sequence is [RELEASE-PROTOCOL.md](../RELEASE-PROTOCOL.md).

- `npm run vite:build:app`: strict typecheck and compile.
- `npm test`: compile and run the local regression suite.
- `npm run test:release`: release-script regression checks.
- `npm run build:mac:arm64`: local signed installers, without notarization or upload.
- `npm run release:prepare`: signed app plus detached notarization submission.
- `npm run release:package`: package the accepted, stapled app without rebuilding.
- `LEDGER_PACKAGED_EXECUTABLE=<absolute executable> npm run test:packaged`:
  launch the final extracted app from outside the checkout and exercise bundled
  dependencies, including native SQLite.

Use the [native walkthrough](../scripts/release/LOCAL-COMPUTER-USE.md) against a
fixture repo to check branch/worktree navigation, diff search, selected changes
and historical commit browsing in the final package.

Linux x64/arm64 AppImage/deb and Windows installers must be built and launched
on matching hosts before their release is claimed ready. The macOS packaged
smoke test does not establish Linux/Windows compatibility. Keep native runtime
dependencies in `node_modules`; electron-builder prunes development dependencies.

Stage assets and their checksums in a draft GitHub release. Download them again
and verify before publication. No build command should upload automatically.
