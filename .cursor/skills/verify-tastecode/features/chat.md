# Chat

Chat is the composer at the bottom of a project. The user types in the field named `Message` and presses `Send`. For a Cursor thread, Taste Code writes that prompt to `cursor-agent`'s standard input. The typed sentence is not a command-line argument.

## Sub-features

- `chat-composer` shows the `Message` field once a project is open. The placeholder is `Do anything`.
- `chat-needs-project` keeps the field disabled with placeholder `Add a project folder first` until a folder is open.
- `chat-needs-sign-in` keeps `Send` disabled and shows `Sign in to use this provider.` when the active provider is installed but logged out.
- `chat-send` places the typed sentence in the thread and asks the provider to answer it.
- `chat-cursor-stdin` delivers the Cursor prompt on stdin. The first turn of a thread is a `<system-instructions>` block, a blank line, and the typed sentence. Later turns are the typed sentence. A Design-mode request keeps the sentence inside `<user-design-request>`.

## How to get to it (user POV)

- Skip or finish onboarding, open a project folder, and use the composer on that project.
- Pick Cursor in the model control when the proof is a Cursor turn. The field is still labelled `Message` and the button is still `Send`.
- There is no separate chat window. The thread and the composer are the main desktop surface.

## Driving it with drive.mjs

Preconditions:

- `drive.mjs doctor` reports ports `5183`, `4311`, and `9333`.
- Onboarding is closed and a project folder is open. `Choose a folder` opens the operating-system picker, which this harness cannot complete, so the folder has to already be the open project.
- The active provider is signed in. `Send` stays disabled until `send` availability is ready. A logged-out Cursor row means this recipe stops at the composer status.

- **See the blocked composer.** With no signed-in provider, run `node .cursor/skills/verify-tastecode/scripts/drive.mjs wait-text --text "Sign in to use this provider."` and capture `chat/composer-blocked.aria.txt` plus `chat/composer-blocked.png`. Do not click the composer's `Sign in` action when the browser login is behind Cloudflare.
- **Type and send.** When the provider is signed in and a project is open, run `node .cursor/skills/verify-tastecode/scripts/drive.mjs fill --label "Message" --value "hey"`, `node .cursor/skills/verify-tastecode/scripts/drive.mjs click --name "Send"`, and `node .cursor/skills/verify-tastecode/scripts/drive.mjs wait-text --text "hey"`. The thread shows `hey` as the user message.
- **Prove the reply used the sentence.** Wait for an assistant reply that responds to `hey`. Capture `chat/reply.aria.txt` and `chat/reply.png`. A reply that says the message was an empty `<system-instructions>` tag, or a JSON phase result whose findings say the phase name or requirements were missing, means the typed text did not arrive.
- **What Cursor is given.** The process arguments are `--print`, `--output-format`, `stream-json`, plus `--model`, `--force`, or `--resume` when those apply. They do not contain `hey` or `<`. The standard input is the whole prompt, and it is closed so `cursor-agent` finishes reading. On Windows that process is `node.exe` running the install's `index.js`, not `cursor-agent.cmd`.

## Gotchas

- `fill --label "Message"` matches the composer's `aria-label`. The field has no `<label>` element.
- Enter in the field also sends. Shift+Enter inserts a newline. The harness uses the `Send` button.
- Design mode is supposed to wrap a design request. The typed sentence still has to be inside `<user-design-request>` in the stdin body. Do not turn Design mode off to make the text appear.
- The first Cursor turn includes Taste Code's reply-style instructions inside `<system-instructions>`. The typed sentence follows that block. An empty tag means the transport dropped the body at `<`.
- A recorder substituted for `cursor-agent` can show the stdin bytes, but it is not a signed-in model reply. Do not report a recorder's canned result as the assistant answer.
- Cursor attachments are rejected by the CLI. A proof message is plain text.
