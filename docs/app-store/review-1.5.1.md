# App Review blockers: Ledger Code 1.5.1

Checked in Safari on 2026-09-25. [App Store Connect submission](https://appstoreconnect.apple.com/apps/6757086521/distribution/reviewsubmissions/details/b483cf72-2555-48b9-912a-c8ce0d5a4b2b)
was reviewed on July 29, 2026 and remains rejected with unresolved issues.
Version/build: 1.5.1 (1.5.1). Reviewer environment: MacBook Air 15-inch M3 (2024),
macOS 26.5.2, active internet connection.

| Guideline | Reviewer observation | Required proof before resubmission |
| --- | --- | --- |
| 2.1(a), App Completeness | Frozen blank page immediately after launch | Install the actual sandboxed MAS candidate with a fresh profile; observe a usable first window, open a fixture repo, and check main/preload/renderer logs. Also exercise upgrade launch. |
| 4, Design | No menu item to reopen the main window after closing it | Close the main window using the native UI, then reopen from an application/Window menu; verify Dock activation as well. |
| 1.5, Safety / Developer Information | The Support URL pointing to GitHub Issues did not provide adequate support information | Publish a functional support page explaining how to ask questions/request support, update the App Store Support URL, and verify the public page. |

These observations concern the App Store build. Developer ID notarization and
startup checks for the GitHub ZIP do not establish that the sandboxed MAS app
passes review. The direct-download release scripts do not produce MAS
submissions. Keep MAS entitlements, signing and installation validation separate.

No App Store metadata was edited, no reply sent and no resubmission made during
this inspection. Do not describe these issues as resolved until the actual MAS
candidate and support URL have been checked.
