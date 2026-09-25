# Ledger release checks

Ledger's build and release commands are defined in `package.json` and
`electron-builder.yml`. See [build targets](docs/build-and-release.md) and
[App Store instructions](docs/app-store/README.md) for their separate workflows.
Release tooling in this repository is maintained independently.

## Direct-download macOS candidate

Run `npm test` and `npm run test:release`. Build for the intended architecture
with the existing `build:mac:*` command. Signing and notarization require the
release operator's Developer ID identity and credentials; use the credential
options documented in [AGENTS.md](AGENTS.md#notarization-setup). A keychain profile
belongs to the machine on which it was configured.

For a candidate that must be reviewed before upload, pass `--publish never` to
electron-builder. `npm run release` retains its existing build-and-publish
behavior and should only be used when publication is intended.

Verify the final ZIP (and DMG if shipping one), using the actual candidate paths:

```bash
./scripts/release/verify-mac-artifact.sh \
  --zip dist/Ledger-<version>-arm64-mac.zip \
  --feed dist/latest-mac.yml --bundle-id com.peterjthomson.ledger --version <version>
# Add --dmg dist/Ledger-<version>-arm64.dmg when distributing a DMG.
```

The verifier extracts a temporary copy and checks bundle layout, identity,
version, Developer ID signing, stapled notarization and Gatekeeper acceptance.
It verifies the feed's artifact sizes and SHA-512 checksums, including its legacy
`path`/`sha512` fields. Every referenced file must be present. ZIP-only releases
must have a feed containing only the files actually being distributed.

If a DMG is stapled separately using the existing `scripts/release/notarize.sh`
helper, it refreshes that artifact's feed checksums. This helper is optional;
it does not replace electron-builder's configured app notarization. Keep the
original candidate while waiting on Apple rather than manually assembling an
installer. See the [DMG investigation](docs/dmg-packaging-investigation.md) for
the currently unresolved copy failure.

## Test the packaged app

Point `LEDGER_PACKAGED_EXECUTABLE` at the executable from the extracted candidate
and run `npm run test:packaged`. This exercises the packaged runtime and SQLite;
it does not establish that interactive Git operations work.

Use a disposable Git repository for a native UI walkthrough. Confirm the app
opens the fixture, displays branches and diffs, and performs a relevant Git
operation. Check the result with Git, cancel a destructive dialog, and close
and reopen the window. Exercise any changed path. Record the source commit,
version, archive SHA-256, OS/architecture and observed results alongside the
candidate; keep personal repositories out of test fixtures.

After verification, upload the chosen artifacts, matching feed and SHA-256
checksums. Download the published files and verify them again. A passing script
is one check, not proof of every user path.

The sandboxed App Store build requires its own installation and launch checks.
The [1.5.1 review findings](docs/app-store/review-1.5.1.md) remain unresolved by
these direct-download release checks.
