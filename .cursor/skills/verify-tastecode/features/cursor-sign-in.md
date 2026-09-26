# Cursor sign-in

Cursor is a provider account in Settings. The row shows Install when `cursor-agent` is missing, Sign in when the CLI is installed and the account is logged out, and the account identity plus Sign out when the CLI is logged in.

## Sub-features

- `cursor-row-install` shows the Cursor row with status `Not installed` and an `Install` button.
- `cursor-row-sign-in` shows status `Not signed in` and a `Sign in` button after the CLI is installed.
- `cursor-sign-in-browser` starts `cursor-agent login`, which opens a browser. The row status becomes `Signing in…` and the button becomes `Cancel sign-in`.
- `cursor-row-signed-in` replaces Sign in with the account identity and `Sign out` after the CLI reports a signed-in account.

## How to get to it (user POV)

- Finish or skip onboarding, open the `Account` menu at the bottom of the sidebar, and choose `Settings`.
- In the Settings sidebar, choose `Providers`. The Accounts list includes Cursor after Grok.
- Onboarding's coding-agents page does not list Cursor. Its `Set up` buttons open Settings for Codex, Claude Code, or Grok only.

## Driving it with drive.mjs

Preconditions:

- `drive.mjs doctor` reports ports `5183`, `4311`, and `9333`.
- Onboarding is closed. From the welcome page, `Skip setup` closes it. From the project page, `Skip for now` closes it.
- This recipe stops before a browser login unless a signed-in account is the thing under test.

- **Open Providers.** Choose `Account`, then `Settings`, then `Providers`. Run `node .cursor/skills/verify-tastecode/scripts/drive.mjs click --name "Account"`, `node .cursor/skills/verify-tastecode/scripts/drive.mjs click --name "Settings"`, `node .cursor/skills/verify-tastecode/scripts/drive.mjs click --name "Providers"`, and `node .cursor/skills/verify-tastecode/scripts/drive.mjs wait-text --text "Cursor"`. The dialog is labelled `Settings`, the panel heading is `Providers`, and a row titled `Cursor` is visible.
- **Read the logged-out row.** Do not click `Install` or `Sign in` yet. Run `node .cursor/skills/verify-tastecode/scripts/drive.mjs snapshot --path "$VERIFY_TASTECODE_EVIDENCE/cursor-sign-in/providers.aria.txt"` and `node .cursor/skills/verify-tastecode/scripts/drive.mjs screenshot --path "$VERIFY_TASTECODE_EVIDENCE/cursor-sign-in/providers.png"`. A missing CLI shows `Not installed` and `Install`. An installed logged-out CLI shows `Not signed in` and `Sign in`.
- **Stop if the browser login cannot finish.** A signed-in proof clicks `Sign in` with `node .cursor/skills/verify-tastecode/scripts/drive.mjs click --name "Sign in" --row "Cursor"` and waits for `Signing in…`. If the browser stops on a Cloudflare check, click `Cancel sign-in` with `node .cursor/skills/verify-tastecode/scripts/drive.mjs click --name "Cancel sign-in" --row "Cursor"` and record the unmet precondition. Do not paste the login URL into the evidence.
- **Signed-in result.** After a real login, the Cursor row shows the account identity and `Sign out`. Capture `cursor-sign-in/signed-in.aria.txt` and `cursor-sign-in/signed-in.png` with `snapshot` and `screenshot`.

## Gotchas

- `Install` runs the official Cursor installer. Do not click it when the proof only needs to see the row.
- `Sign in` runs `cursor-agent login` and opens a browser. One click is one login. `Open link again` opens a second tab.
- Cloudflare's bot check blocks a headless or remote browser. Cancel and say the signed-in row was not reached.
- The row title used by `--row` is `Cursor`, not `cursor-agent`.
- A logged-out row is the correct state when `cursor-agent status` says not logged in. It is not a failed Models tab.
