# Build & Release Checklist

## Targets
- macOS arm64 (zip, signed; notarization optional per `electron-builder.yml`)
- Linux x64 (deb, AppImage)
- Linux arm64 (deb, AppImage)
- Windows x64 (NSIS installer; build on Windows runner preferred)

## Commands
- macOS arm64: `npm run build:mac:arm64`
- Linux x64: `npm run vite:build:app && npm exec electron-builder -- --linux --x64`
- Linux arm64: `npm run build:linux`
- Windows x64: `npm exec electron-builder -- --win --x64` (run on Windows; on macOS requires Wine + freetype and a valid `.ico`)

## Packaging Notes
- Do **not** exclude `node_modules`; native deps (`better-sqlite3`) must be present in `app.asar.unpacked`.
- electron-builder prunes devDependencies automatically; packaged `app.asar` is ~33MB.
- AppImage may need `fuse3` on some distros; deb is the primary Linux format (Ubuntu/Debian).

## Smoke Checks (per build)
- Verify `app.asar.unpacked/node_modules/better-sqlite3/build/Release/better_sqlite3.node` exists.
- Run `ELECTRON_RUN_AS_NODE=1 <app> -e "console.log('ok')"` to sanity-check the binary.
- On macOS, open app and run one git operation against a fixture repo.
- On Linux, launch AppImage/deb and open the window (xvfb OK) and hit one IPC call.
- On Windows, install NSIS and launch once; verify window and a simple git op.

## Publish
- Upload artifacts to GitHub Releases with SHA256 checksums.
- Update README download links (already generic to Releases).
- Notarization (mac) is disabled in config; enable when credentials are available.
