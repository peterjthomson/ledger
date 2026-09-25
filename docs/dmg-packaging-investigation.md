# Ledger DMG copy failure (2026-09-25)

Ledger's signed and notarized v1.6.0 ZIP passes signature, stapled-ticket,
Gatekeeper, layout, version, update-feed and packaged startup checks. DMG
packaging fails earlier, while copying `Ledger.app` into the mounted image.

Evidence collected locally:

- `dmgbuild` invokes `/usr/bin/ditto` and receives `Operation not permitted` at
  `/Volumes/Ledger/Ledger.app`.
- The matching `tccd` event reports `kTCCServiceSystemPolicyAppBundles`, subject
  `com.openai.codex`, `authValue=0`, `authReason=2`.
- No stale Ledger/Marktext disk images were mounted before the controlled retry.
- Marktext's existing notarized app packages successfully as a DMG from the
  same Codex task. Ledger's existing notarized app fails.
- Ledger's fresh signed app from the new detached preparation pipeline was
  accepted by Apple, stapled, then failed at the same DMG copy operation.
- The installed `dmg.js` and `dmgUtil.js` implementations are identical between
  the two apps; the builders use the same bundled native dmgbuild implementation.
- Both source apps carry `com.apple.macl` and `com.apple.provenance`. Their
  presence alone does not distinguish success from failure.

This establishes an OS denial for Ledger's copy operation, not a blanket
inability for Codex to package DMGs. It does not establish why macOS treats the
apps differently. No app identity, privacy permissions or security attributes
were changed to evade the denial; no installer was assembled by hand.

The next host-level remedy is a user-approved App Management permission change
for the responsible build host, followed by the same packaging command and full
artifact verification. Until then, a DMG candidate is blocked. ZIP-only delivery
must be an explicit format choice. This is separate from the App Store 1.5.1
review rejection recorded in `docs/app-store/review-1.5.1.md`.
