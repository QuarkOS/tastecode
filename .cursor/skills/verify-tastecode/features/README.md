# Taste Code verification map

This directory is the maintained source for verifying the user-facing behavior of Taste Code. Read the index before driving the app, then use the matching feature file as the recipe.

## Baseline preconditions

- Launch with `node .cursor/skills/verify-tastecode/scripts/drive.mjs launch` from the repository root.
- Node on `PATH` is `>=22.18.0`. Linux has `DISPLAY` set, or `Xvfb` installed so launch can start display `:99`.
- `VERIFY_TASTECODE_DATA`, `VERIFY_TASTECODE_STATE`, and `VERIFY_TASTECODE_EVIDENCE` point at three different directories. Data and state are disposable. Evidence is kept.
- The disposable data directory starts empty, so the desktop window opens onboarding.
- Run `drive.mjs doctor` and require Node `>=22.18.0`, ports `5183`, `4311`, and `9333`, and a page on `http://127.0.0.1:5183`.
- Never drive an instance that was not started by this verification run.

## Driving conventions

- Start every recipe from the baseline state unless its preconditions say otherwise.
- Prefer accessible names (`Begin setup`, `Your name`, `Account`, `Settings`, `Providers`, `Models`, `Message`) over CSS selectors or screen coordinates.
- Treat every command as literal. Keep quoted names and flags unchanged.
- Run window actions through `node .cursor/skills/verify-tastecode/scripts/drive.mjs`.
- Wait for the next heading or dialog name after a click. Onboarding animates between pages.
- Restore nothing in the user's real Taste Code profile. The disposable directories are the only state this run may create.
- Do not remove proof artifacts during cleanup.

## Proof and skip reporting

- Capture the user action and the resulting state, not only the final screen.
- UI proof includes an accessibility snapshot and a screenshot with Taste Code visible.
- Stored values need a second user-facing view. For the profile name, that view is the account control after setup closes.
- A Cursor model reply counts only when it uses the sentence the user typed. An empty `<system-instructions>` tag, or a phase JSON result that says the requirements were missing, means the typed text did not arrive.
- Record the feature file and the entry point in the transcript.
- Report an unreachable path with the attempted command and the unmet precondition.
- Do not report a skipped entry point as verified through a different path.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then uses exactly four H2 sections in this order.

1. `Sub-features` lists short IDs with one line for each behavior.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with drive.mjs` starts with `Preconditions:` and uses labeled bullets that pair each user action with an exact command and observable result.
4. `Gotchas` lists traps that can waste or invalidate a verification run.

## Features

- [Onboarding](./onboarding.md) covers the first-run welcome, name, appearance, agents, and project pages.
- [Cursor sign-in](./cursor-sign-in.md) covers the Settings Providers row for Cursor: Install, Sign in, and the signed-in account.
- [Models](./models.md) covers the Settings Models tab and when a Cursor section is present.
- [Chat](./chat.md) covers typing a message, Send, and the stdin body `cursor-agent` receives.
