# strikethroo-viewer

A Claude Code mod that opens the active Strikethroo plan in `strikethroo serve`, Strikethroo's local web viewer. `/strikethroo-open` or a button above the prompt checks whether a viewer already answers on 127.0.0.1, starts one if not, and shows a link to the plan.

## What this shows

Above the prompt, in a project with a Strikethroo workspace:

```text
Open in Strikethroo viewer
```

After `/strikethroo-open` or a press of that button:

```text
⎿  strikethroo-viewer: Strikethroo viewer: http://127.0.0.1:4317/plans/83--workspace-data-layer
Reopen viewer  http://127.0.0.1:4317/plans/83--workspace-data-layer
```

What happens on open:

1. It asks `http://127.0.0.1:<port>/api/plans` whether a viewer answers.
2. If not, it splits `serve_command` on spaces, adds `--port <port>`, and starts it with `$.process.spawn` in the project directory, with no shell. It refuses a `serve_command` that contains `--host`, so the viewer never listens beyond loopback.
3. It waits up to 30 seconds for the viewer to answer, which leaves time for `npx` to download Strikethroo on first use. It then links to `/plans/<id>--<slug>` for the active plan: the plan with a task in progress, or else the plan whose task files changed most recently. `strikethroo-progress`'s `pin_plan` doesn't apply here.

If the viewer doesn't answer, the command prints the end of the server's output, such as an npm error.

| Hook | What it does |
| --- | --- |
| `session.start` | Finds the workspace and registers `/strikethroo-open` |
| `command.run` on `strikethroo-open` | Finds or starts the viewer, and returns the link |
| `ui.render` on `AbovePrompt` | Draws the button, and the link once there is one |

## Capabilities

The mod runs as you, unsandboxed. This is everything its hooks module hooks and calls, as `claude plugin validate` reports it. CI fails if the module uses anything outside this list (`scripts/check-capabilities.ts`). It is the only plugin in this marketplace allowed `$.process.spawn` and `$.http.fetch`.

<!-- capabilities -->
```json
{
  "hooks": ["session.start", "command.run", "ui.render"],
  "calls": [
    "$.clock.sleep",
    "$.command.register",
    "$.fs.exists",
    "$.fs.list",
    "$.fs.read",
    "$.http.fetch",
    "$.process.spawn",
    "$.session.cwd",
    "$.ui.invalidate",
    "$.ui.log",
    "$.ui.resolve",
    "$.ui.toast"
  ]
}
```
<!-- /capabilities -->

`$.http.fetch` only ever gets a URL built from the constant `127.0.0.1` and a port between 1024 and 65535 (`hooks/viewer.ts`). `$.process.spawn` runs `serve_command` as you, so treat that setting like any command you would type. The default downloads the latest `strikethroo` release from npm and runs it without asking; set `serve_command` to a pinned version or a local install to avoid that. The mod calls no viewer write route, such as archive or config.

## Demo

Captured from a Claude Code 2.1.296 session in a temporary project holding the Strikethroo `v4.1.1` fixture workspace, with plan 83 copied into `plans/` and an empty npm cache:

1. `/strikethroo-open` downloaded Strikethroo through `npx`, started the viewer and printed the link 3.3 seconds later.
2. `ss -ltn` showed it listening on `127.0.0.1:4317` only, and the plan page answered 200.
3. After the session ended, port 4317 was free again.

## How it was built

- **Model:** Claude Opus 5.5 in Claude Code.
- **Prompt(s):** a build brief from the repository owner covering the five plugins in this marketplace. It isn't included here.
- **Transcript:** not shared.
- **Iterations:**
  - In the first session the band button never appeared. `session.start` found the workspace but didn't ask for a redraw, and `$.ui.invalidate` only redraws the calling mod's own drawings. It now calls `$.ui.invalidate` once the workspace is found.
  - The test kit skips a `process.spawn` stub that throws, so the failure test makes the stub write to stderr and exit 1, as npx does.

## Run it

**Requirements:**

- Claude Code 2.1.287 or later. Tested with 2.1.296.
- A Strikethroo workspace of schema version 4. Verified against the Strikethroo `v4.1.1` fixtures.
- For the default command, `npx` and access to the npm registry.

**Steps:**

1. Install it:

   ```bash
   claude plugin marketplace add e0ipso/strikethroo-mods
   claude plugin install strikethroo-viewer@strikethroo-mods
   ```

   Or from a clone, for one session: `claude --plugin-dir ./plugins/strikethroo-viewer`.

2. Run `/strikethroo-open`, or press the band button. In the terminal, click the link.

## Configuration

| Option | Default | What it does |
| --- | --- | --- |
| `serve_command` | `npx --yes strikethroo@latest serve --no-open` | The command that starts the viewer, split on spaces, no quoting. `--port` is added; `--host` is refused. |
| `port` | `4317` | The loopback port, from 1024 to 65535 |

## Notes / limitations

- The server the mod starts lives as long as the mod: Claude Code stops it when the session ends or the mod reloads. A viewer you started yourself is reused and left alone.
- The default runs the newest Strikethroo. If a future release stops reading schema 4 workspaces, pin a version in `serve_command`, such as `npx --yes strikethroo@4 serve --no-open`.
- If something other than the viewer answers `/api/plans` with a 2xx on that port, the mod takes it for the viewer.
- The workspace is found at session start. If you create one mid-session, the band button appears after a reload or a new session; `/strikethroo-open` works at once.
- In the Desktop app a `Link` to `http://127.0.0.1` draws as plain text, because the Desktop app only makes `https:` and `http://localhost` links clickable. The command's text still has the URL.
- Not checked: the Desktop app, the VS Code extension, Windows.

## Dependencies

| Name | Version | License (SPDX) | Source |
| --- | --- | --- | --- |
| None | | | |

`strikethroo` is what the default `serve_command` runs. The mod doesn't ship it; `npx` fetches the latest release from npm.

## Third-party notices

Claude and Claude Code are trademarks of Anthropic; use here is descriptive and implies no endorsement.

---

A prototype, MIT licensed. See the [root README](../../README.md).
