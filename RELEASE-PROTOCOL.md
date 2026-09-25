# Release protocol

Shared by Marktext, Ledger and Year View. The scripts in `scripts/release/` are
mirrored; update and test all three copies together. macOS signing stays local.
Windows/Linux builds run on their target platforms where supported.

## Release gates

1. Record the source commit and version. Run typechecking, relevant tests and
   platform builds. Keep candidate outputs in a new version/candidate directory.
2. Build and sign the app using the repository's build tool. Do not publish yet.
3. Submit notarization, save the submission ID, and return. Check status later;
   pending or invalid submissions block subsequent stages. Never rebuild an app
   to work around a slow Apple response.
4. Staple the accepted app, then package it using the repository's packager.
   Submit and staple the enclosing DMG if shipping one. Refresh update feeds
   after stapling, since it changes the DMG's bytes.
5. Verify the exact DMG/ZIP, then run the native walkthrough on the extracted
   package. Record the artifact SHA-256, source commit, test results and observed
   UI results. See `scripts/release/LOCAL-COMPUTER-USE.md`.
6. Tag the approved source commit. Stage every intended asset and a complete
   SHA-256 manifest in a **draft** release. Download the assets again, verify
   checksums and rerun artifact verification. Only then publish the draft.

Do not overwrite published tags/assets. Check whether an existing release is
immutable before proposing additions; a new patch release may be required.
A release that intentionally omits a platform or installer must say so explicitly.

## Electron apps: Ledger and Marktext

Run from the repository root. `release:prepare` compiles, packages a signed app,
creates its submission ZIP and submits it without waiting for Apple. It refuses
to overwrite an existing candidate. It does not publish anything.

```bash
# Ledger
npm run typecheck
npm test
npm run test:release
npm run release:prepare

# Marktext
pnpm check
pnpm test
pnpm test:e2e
pnpm test:release
pnpm release:prepare
```

The candidate directory is `dist/release-<package version>`. For a replacement
candidate, compile first and call `scripts/release/electron-mac.sh prepare`
with a fresh output directory; never overwrite the previous candidate.

```bash
export NOTARIZE_STATE="$PWD/dist/release-<version>/notarize-state.json"
scripts/release/notarize.sh status
scripts/release/notarize.sh staple app.zip
# Only after the app is Accepted and stapled:
npm run release:package  # Marktext: pnpm release:package
scripts/release/notarize.sh submit dist/release-<version>/artifacts/*.dmg
scripts/release/notarize.sh status
scripts/release/notarize.sh staple dist/release-<version>/artifacts/*.dmg
```

`status` exits 2 while any submission is not accepted. `staple` exits 2 while
any selected submission is not accepted; pass names to staple only the current
stage (app, then DMG). Use `log
<artifact>` to investigate an Invalid submission. Submission is idempotent for
unchanged bytes; changed artifacts require a new candidate/state file. The
stored `AC_PASSWORD` keychain profile is shared; `APPLE_KEYCHAIN_PROFILE`
overrides it. Never put credentials in release manifests or logs.

`build:mac*` creates local installers without notarizing or uploading them.
A successful build alone is not a release gate. Do not remove quarantine to make
release verification pass. The legacy `npm run release` in Ledger now prepares
an app; it no longer uploads unchecked artifacts.

## Year View

Use the archive/export commands in `release-config/README.md`. Submit its ZIP
with `notarize.sh submit --app <exported.app> <submission.zip>`, then run
`status` and `staple`. Recreate the final ZIP from the stapled app with
`ditto -c -k --keepParent`. ZIP files themselves cannot be stapled.

## Artifact verification

Both formats are supported independently. For an Electron DMG+ZIP release:

```bash
scripts/release/verify-mac-artifact.sh \
  --dmg <artifacts/App.dmg> --zip <artifacts/App.zip> \
  --feed <artifacts/latest-mac.yml> --bundle-id <expected.id> --version <version>
```

For ZIP-only releases, omit `--dmg` and, when no updater exists, `--feed`.
Verification checks archive layout, the extracted app's identity/version,
Developer ID signature, stapled ticket and Gatekeeper acceptance with quarantine.
It checks every feed entry and legacy checksum; missing requested files fail.
DMGs are mounted read-only and verified as downloaded, including the copied app.
Verification does not replace the native UI walkthrough.

## DMG copy permissions

If the packager reports `ditto: /Volumes/.../App.app: Operation not permitted`,
retain its log and inspect `hdiutil info` plus the matching macOS `tccd` log.
Compare the exact packager, app and parent process before diagnosing the cause.
Do not detach unrelated volumes, change app identity, clear security attributes,
hand-assemble an installer or change OS permissions as an automatic workaround.
An App Management denial may need the user to grant permission to the build host
in System Settings. ZIP-only publication is an explicit release-format decision.

## Per-repository native paths

- Ledger: disposable Git repo; branch/worktree navigation, search, selected
  stage/unstage/discard and read-only historical commits. Check Git state on disk.
- Marktext: disposable Markdown/profile; unchanged save, edit/undo, dirty prompts,
  actual save, external reload and close. Compare file bytes. Include OS clipboard
  and drag/drop when the change affects them.
- Year View: all layouts, year/today navigation, day details and preferences;
  real calendar permissions and deep links when applicable. Keep calendar data
  read-only and redact event details from recorded evidence.

Marktext's tag workflow stages Windows/Linux artifacts in a draft. Add verified
Mac assets, regenerate the manifest for all assets, then publish. Update the
Homebrew cask only after the referenced DMG is published.
