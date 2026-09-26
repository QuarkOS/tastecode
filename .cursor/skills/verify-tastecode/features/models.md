# Models

The Models tab lists every model the connected providers returned, grouped by provider, with a switch for each one. A Cursor section appears only after a signed-in `cursor-agent models` listing succeeds.

## Sub-features

- `models-open` opens the Models panel from the Settings sidebar.
- `models-sections` shows one section per provider that returned models. Section labels are `Codex`, `Claude Code`, `Grok`, and `Cursor`.
- `models-cursor-present` shows a `Cursor` section whose switches start with the rows `cursor-agent models` printed, including `Auto` when that row is in the listing.
- `models-cursor-absent` omits the Cursor section when the CLI is logged out or `models` fails. Other providers can still be listed.
- `models-empty` shows `No models are available from your connected providers yet.` when no provider returned a catalog.
- `models-switch` toggles `Include <display name> in model picker` and stores the hidden set in `harness.hiddenModels`.

## How to get to it (user POV)

- Open `Account`, choose `Settings`, then choose `Models` in the Settings sidebar.
- Sign-in and install from the Providers tab refresh this list. A Cursor section shows up after that refresh when the account is signed in.

## Driving it with drive.mjs

Preconditions:

- `drive.mjs doctor` reports ports `5183`, `4311`, and `9333`.
- Onboarding is closed.
- Do not click Cursor `Sign in` in this recipe. A Cloudflare block is not a missing Models tab.

- **Open Models.** Choose `Account`, `Settings`, then `Models`. Run `node .cursor/skills/verify-tastecode/scripts/drive.mjs click --name "Account"`, `node .cursor/skills/verify-tastecode/scripts/drive.mjs click --name "Settings"`, `node .cursor/skills/verify-tastecode/scripts/drive.mjs click --name "Models"`, and `node .cursor/skills/verify-tastecode/scripts/drive.mjs wait-text --text "Models"`. The panel heading is `Models`.
- **Read the sections.** Run `node .cursor/skills/verify-tastecode/scripts/drive.mjs snapshot --path "$VERIFY_TASTECODE_EVIDENCE/models/models.aria.txt"` and `node .cursor/skills/verify-tastecode/scripts/drive.mjs screenshot --path "$VERIFY_TASTECODE_EVIDENCE/models/models.png"`. Logged-out Cursor leaves no section labelled `Cursor`. Codex, Claude Code, or Grok may still be there. The empty sentence is `No models are available from your connected providers yet.`
- **Signed-in Cursor section.** Only after Cursor shows as signed in on the Providers tab, reopen `Models` and wait for `Cursor`. The snapshot includes `Include Auto in model picker` when the CLI listing contains Auto. Capture `models/models-cursor.aria.txt` and `models/models-cursor.png`.

## Gotchas

- A missing Cursor section after a real sign-in is a bug. A missing Cursor section while the Providers row says `Not signed in` is the logged-out catalog.
- Grok models belong under the Grok section. A Grok name inside the Claude Code section is a grouping bug.
- The nav button and the panel heading are both named `Models`. Wait for the panel, then snapshot, instead of treating the nav click itself as the catalog.
- `All` and `None` are named `Show all <provider> models in model picker` and `Hide all <provider> models from model picker`.
- Discovery can finish after the panel first paints. If the snapshot is only the empty sentence, wait and snapshot again before calling the catalog empty.
