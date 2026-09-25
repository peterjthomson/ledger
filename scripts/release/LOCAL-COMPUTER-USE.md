# Local native walkthrough

Run this after automated tests and artifact verification, before publishing.
Use the actual signed app extracted from the candidate ZIP or copied from its
DMG. A development window or Playwright startup alone does not prove this gate.

1. Record source commit, app version, archive SHA-256 and executable path. Confirm
   the visible app belongs to that path; quit only test instances you launched.
2. Create disposable fixtures and an isolated app profile/settings file where
   supported. Preserve existing documents, repository changes and calendar data.
3. Exercise the changed behavior through native UI: mouse, keyboard, menus and
   dialogs. Use screenshots/accessibility state to observe results. Do not count
   directly calling internal APIs or dispatching synthetic DOM events as native
   computer-use evidence; those belong to automated tests/debugging.
4. Check meaningful side effects independently: saved file bytes, Git index and
   worktree contents, preferences after relaunch. Cover cancel/undo/error paths
   where the change can affect data. Test only relevant paths, not every control.
5. If a failure appears, reproduce it, fix it and add a focused regression test
   when useful. Rebuild and repeat the affected paths on the final artifact.
6. Close test instances and remove only fixtures you created. Record any checks
   that could not be exercised, with the reason. Never mark a blocked path passed.

Store evidence beside the candidate outside tracked source, for example:

```text
Source commit:
App version / executable:
Archive SHA-256:
OS / architecture:
Automated checks:
Native path | expected result | observed result | pass/fail
Side-effect checks:
Screenshots/log paths (redacted):
Limitations:
```

On Codex desktop, use the available native computer-use tool for UI actions.
CDP and Playwright are useful for debugging and automated checks; they do not
replace the native walkthrough. macOS privacy prompts require the user's
permission choices; do not silently change privacy settings to complete a test.
