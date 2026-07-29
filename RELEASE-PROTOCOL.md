# Release protocol (shared across the productivity suite)

Canonical copy: `peterjthomson/marktext`. Mirrored into `peterjthomson/ledger`
and `peterjthomson/year-view` so all three release the same way.

## The rule that shapes everything

**Notarization is asynchronous and may take over a day.** Apple's notary
service is usually minutes; it has taken more than 24 hours. Any pipeline that
blocks on the result eventually strands a build, and a stranded build gets
finished by hand.

That is not hypothetical. Ledger 1.5.0's DMG shipped containing
`Ledger.app/Ledger.app` — a folder wearing the `.app` extension with the real,
correctly-notarized bundle inside it. Finder shows a broken item and
drag-to-Applications installs something that cannot launch. The repository's own
`electron-builder` pipeline produces a **correct** DMG; the nesting was
introduced by the manual step that existed to work around slow notarization. The
workaround, not the tooling, broke the release.

So: never block on Apple, and never hand-assemble an artifact.

## The five stages

Each stage is idempotent and independently re-runnable. State lives on disk, so
a stage can be resumed tomorrow without redoing the one before it.

| Stage | Command | Blocks on Apple? |
|---|---|---|
| 1. Build | repo-native (`pnpm build:mac:arm64`, `npm run build:mac:arm64`, `xcodebuild archive`) | no |
| 2. Submit | `scripts/release/notarize.sh submit dist/*.dmg` | no — returns after upload |
| 3. Collect | `scripts/release/notarize.sh status` | no — poll whenever |
| 4. Staple | `scripts/release/notarize.sh staple` | no — only staples what is Accepted |
| 5. Verify | `scripts/release/verify-mac-artifact.sh --dmg … --bundle-id …` | no |
| 6. Publish | `gh release upload …` | no |

If Apple takes 26 hours, stages 1–2 are already done and nothing is lost: run
`status` tomorrow, `staple` when it clears, and the ticket attaches to the
artifact you already built. No rebuild, no re-sign, no hand-made DMG.

```bash
# Day 1
pnpm build:mac:arm64                          # or the repo's build command
./scripts/release/notarize.sh submit dist/*.dmg
# → "submitted as 3ac911ba-…", terminal returns

# Whenever — an hour later, or Thursday
./scripts/release/notarize.sh status
./scripts/release/notarize.sh staple
./scripts/release/verify-mac-artifact.sh --dmg dist/App.dmg --bundle-id com.example.app
```

`notarize.sh log <artifact>` fetches Apple's detailed report when something is
Invalid. `notarize.sh reset` forgets recorded submissions without cancelling
them.

## Stage 5 is not optional

`verify-mac-artifact.sh` is the gate that would have caught Ledger 1.5.0. It
mounts the DMG the way a user's Mac will — quarantined — and asserts:

- the DMG carries a stapled ticket, and Gatekeeper accepts it quarantined
- **exactly one `.app` at the volume root, with `Contents/Info.plist` directly
  inside it** (the nesting check)
- the bundle identifier is the expected one
- the signature is valid deep+strict, and the authority is Developer ID Application
- the app carries its **own** stapled ticket, so it still validates offline once
  copied out of the DMG
- Gatekeeper accepts the app for execution
- every `latest*.yml` entry matches the bytes on disk — stapling rewrites the
  DMG *after* electron-builder hashes it, so the feed goes stale silently
- the zip, if shipped, has the same single well-formed bundle at its root

Exit code 0 means safe to publish. Run it again on the copy downloaded back from
the release: that is the artifact users actually get.

## Credentials

One notarytool keychain profile per machine, shared by all three repos:

```bash
xcrun notarytool store-credentials AC_PASSWORD \
  --apple-id <email> --team-id R4RRG93J68 --password <app-specific-password>
```

`APPLE_KEYCHAIN_PROFILE` overrides the name (default `AC_PASSWORD`). The
credentials live in the macOS data-protection keychain, which is why they cannot
be read back out for CI — see `signing-and-release.md`.

## Why signing stays off CI

CI builds what needs no secrets (Windows, Linux, unsigned smoke builds and
tests) and stops there. macOS artifacts are built, signed, notarized and stapled
on a Mac, then uploaded.

This is a decision, not a gap. The Apple credential cannot be minted from a CLI,
notarization is the one step that has never actually failed, and putting a
Developer ID private key in CI buys nothing that the local path does not already
do. Every historical mac CI failure across these repos was a *signing-path*
failure while Windows and Linux went green.

The real fragility was always the manual assembly around notarization, which
stages 2–5 remove.

## Per-repo entry points

| Repo | Build | Notarizes | Publishes |
|---|---|---|---|
| marktext | `pnpm build:mac:arm64` | electron-builder (`notarize: true`) + `build/notarize-dmg.cjs` for the DMG | CI publishes win/linux; mac uploaded after stage 5 |
| ledger | `npm run build:mac:arm64` | **should** use stages 2–4; `scripts/notarize.js` is currently dead code (no `afterSign` wiring) | manual upload |
| year-view | `xcodebuild archive` + `-exportArchive` | stages 2–4 on the exported zip | manual upload |
