---
name: verify-tastecode
description: "Drive Taste Code's Electron desktop window (Vite renderer on 127.0.0.1:5183, local server on 127.0.0.1:4311) the way a user does. Use when proving onboarding, Cursor sign-in, the Models tab, or a chat send, or when /maintain-verification-skill needs a fresh check."
---

# Verify Taste Code

Taste Code's primary surface is the Electron desktop window. The renderer is the Vite app at `http://127.0.0.1:5183`. The local server listens on `127.0.0.1:4311`. Drive that window over the opt-in Chromium debug port. Do not prove behavior by calling React setters or test-only endpoints.

Secondary surface: a browser pointed at `http://127.0.0.1:5183` is the same renderer. First-run onboarding only mounts when Electron sets the desktop bridge, so a browser proof does not cover onboarding. `pnpm harness` is the headless server CLI and does not open the window.

Read `features/README.md` before a run, then follow one feature file. A proof of one entry point does not cover the others.

## Launch

From the repository root, with Node `>=22.18.0` first on `PATH` (the server uses `node:sqlite` FTS5; older Node builds fail at startup):

```text
export VERIFY_TASTECODE_DATA=/tmp/tastecode-verify/data
export VERIFY_TASTECODE_STATE=/tmp/tastecode-verify/state
export VERIFY_TASTECODE_EVIDENCE=/tmp/tastecode-verify/evidence
export HARNESS_DEBUG_PORT=9333
node .cursor/skills/verify-tastecode/scripts/drive.mjs launch
```

`launch` refuses to start when `5183`, `4311`, or `9333` is already taken. It runs `pnpm dev` with:

- `HARNESS_DATA_DIR` set to `VERIFY_TASTECODE_DATA` (server database, not `~/.local/share/TasteCode`)
- `HARNESS_DESKTOP_DATA_DIR` set to `$VERIFY_TASTECODE_DATA/desktop` (Electron profile, not `~/.config/TasteCode`)
- `HARNESS_DISABLE_GPU=1` unless that variable is already set
- `HARNESS_DEBUG_PORT` so `apps/desktop/src/main.ts` opens the remote debugging port

On Linux, Electron needs an X display. If `DISPLAY` is already set, launch uses it. If it is unset, launch starts `Xvfb :99 -screen 0 1280x800x24` and records that pid. A missing `Xvfb` binary, or a `:99` socket that already exists, stops launch with an error instead of starting a second window.

Ready means all three ports accept TCP connections, the debug target is a page on `http://127.0.0.1:5183`, and the window text includes `Welcome to TasteCode`. The command records the `pnpm` pid and any Xvfb pid in `$VERIFY_TASTECODE_STATE/run.json` and appends logs to `$VERIFY_TASTECODE_STATE/dev.log`.

Only one `pnpm dev` can run. The ports are fixed in `tools/scripts/dev.js`, and Electron takes a single-instance lock for the desktop profile.

## Doctor

```text
node .cursor/skills/verify-tastecode/scripts/drive.mjs doctor
```

Run this before driving whenever the window looks wrong. It is read-only. It exits non-zero unless Node is `>=22.18.0`, `run.json` exists, ports `5183`, `4311`, and `9333` are open, and the debug page URL is the Vite origin. It prints the Node version, the Vite listener pid, the page URL, and the disposable data directory.

Do not drive an instance that was not started by `launch`. A doctor failure means fix the launch, not the feature.

## Drive

The harness is `drive.mjs`. It talks to the Electron page over CDP and clicks by accessible name or visible button text. Prefer those names over coordinates.

```text
node .cursor/skills/verify-tastecode/scripts/drive.mjs click --name "Begin setup"
node .cursor/skills/verify-tastecode/scripts/drive.mjs click --name "Install" --row "Cursor"
node .cursor/skills/verify-tastecode/scripts/drive.mjs fill --label "Your name" --value "Verify Ada"
node .cursor/skills/verify-tastecode/scripts/drive.mjs fill --label "Message" --value "hey"
node .cursor/skills/verify-tastecode/scripts/drive.mjs wait-text --text "Pick your look"
node .cursor/skills/verify-tastecode/scripts/drive.mjs snapshot --path "$VERIFY_TASTECODE_EVIDENCE/onboarding/appearance.aria.txt"
node .cursor/skills/verify-tastecode/scripts/drive.mjs screenshot --path "$VERIFY_TASTECODE_EVIDENCE/onboarding/appearance.png"
node .cursor/skills/verify-tastecode/scripts/drive.mjs storage --key harness.profile.displayName
```

Stable handles in this app:

- Onboarding dialog shows `Welcome to TasteCode`, then `What should we call you?`, `Pick your look`, `Your coding agents`, and `Open your first project`.
- Buttons: `Begin setup`, `Continue`, `Back`, `Skip setup`, `Skip for now`, `Choose a folder`, `Set up Codex`, `Set up Claude Code`, `Set up Grok`.
- Name field label: `Your name`. Theme choices: `System`, `Light`, `Dark`.
- After setup, the sidebar account button is named `Account` even when its visible text is the display name. Its menu includes `Profile` and `Settings`.
- Settings is `role="dialog"` labelled `Settings`. Category buttons include `Providers`, `Models`, `Appearance`, `Profile`, and `About`.
- Provider rows use the title `Cursor`, `Codex`, `Claude Code`, or `Grok`. The action button is `Install` or `Sign in`. Pass `--row` so the click stays on that title.
- The Models panel heading is `Models`. Each connected catalog is a section labelled with the provider name (`Cursor`, `Codex`, `Claude Code`, `Grok`). A model switch is named `Include <display name> in model picker`.
- The composer field is named `Message`. Its placeholder is `Do anything`, or `Add a project folder first` when no project is open. The submit button is `Send`.
- Command palette dialog is named `Command palette`. Its search box is named `Search commands`. Default shortcut is Ctrl+K or Cmd+K.
- Chat search dialog is named `Search all chats`. The field is named `Search every chat`. Default shortcut is Ctrl+Shift+F or Cmd+Shift+F.

`click` sends a real mouse press and release at the control's center. `fill` focuses the labelled field, or a field whose `aria-label` matches, clears it, and inserts text with CDP `Input.insertText`. `wait-text` polls visible text for 15 seconds. Onboarding page changes wait for a CSS animation, so wait for the next heading instead of assuming the click landed on the next page immediately.

## Evidence

Write proof under `VERIFY_TASTECODE_EVIDENCE`. The helper appends a timestamped line to `$VERIFY_TASTECODE_EVIDENCE/transcript.txt` for every command.

A proof has to show the user action and the resulting state:

- An accessibility snapshot (`.aria.txt`) and a PNG screenshot of the same moment.
- The window must show Taste Code, not an empty desktop.
- For a change that is stored, confirm it from a second user-facing view. The onboarding name is written to `localStorage` key `harness.profile.displayName` inside the disposable Electron profile. After `Skip setup`, the account control shows that name. `storage --key harness.profile.displayName` reads the same key and does not write it.
- A Cursor chat send is proven only when the thread shows the typed sentence and the assistant reply addresses that sentence. The prompt Taste Code hands to `cursor-agent` is that process's standard input, not an argument. See `features/chat.md`.
- Do not treat a status string alone as proof.

There is no network dry-run for onboarding. Provider `Sign in` can open a browser. Cursor's login page often stops on a Cloudflare check; do not click `Sign in` unless the feature file says the login is the thing under test, and stop if the page is a bot check. `Choose a folder` opens the operating-system folder picker, which this harness cannot complete.

## Cleanup

```text
node .cursor/skills/verify-tastecode/scripts/drive.mjs cleanup
```

Cleanup sends `SIGTERM` to the process group recorded in `run.json`, waits until port `5183` closes, then stops the Xvfb pid when launch started one. It deletes `VERIFY_TASTECODE_DATA` and `VERIFY_TASTECODE_STATE`. It does not delete `VERIFY_TASTECODE_EVIDENCE`. It does not kill processes by name and does not touch the default Taste Code directories.

Run cleanup after a failed launch too, so the fixed ports and a leftover `:99` display are not left occupied.

## Helpers

`.cursor/skills/verify-tastecode/scripts/drive.mjs` is the only helper. Invoke it with `node` as shown above. Subcommands: `launch`, `doctor`, `click`, `fill`, `wait-text`, `snapshot`, `screenshot`, `storage`, `cleanup`.

Keep the feature map honest with `/maintain-verification-skill` when onboarding, Cursor sign-in, the Models tab, or the chat composer changes.
