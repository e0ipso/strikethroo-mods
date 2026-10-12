# strikethroo-progress

A Claude Code mod that shows where the active Strikethroo plan stands while a blueprint runs. It reads the task files under `.ai/strikethroo/plans/` and draws one line above the prompt, an optional pane with every task, and a `/strikethroo-status` command that prints the same thing as text.

## What this shows

The band above the prompt, one line:

```text
Plan 83 · phase 3/4 · task 03 in progress · 2/5 done
```

The pane, phase by phase. Finished tasks are dimmed and failed ones are red:

```text
Plan 83: Workspace Data Layer (Parser → JSON Model)
3/5 done · phase 4/4
Phase 1: Parsing primitives
  ✓ 01 Markdown frontmatter, section, and mermaid parsing primitives
Phase 2: Derivation layer
  ✓ 02 Task scanning, derived plan state, and phase inference
Phase 3: Model assembly
  ✓ 03 Workspace model assembly, config enumeration, and typed public API
Phase 4: Verification and documentation
  ▶ 04 Integration tests for the workspace data layer · in progress
  ✗ 05 Document the serve data layer in AGENTS.md · failed
```

`/strikethroo-status` prints those pane lines in the transcript. It runs without a Claude turn, and it works where nothing is drawn, such as `claude -p "/strikethroo-status"`.

The status words come straight from each task's frontmatter. `completed` means the file says so. The mod checks nothing and certifies nothing.

The mod picks the plan to show in this order:

1. the plan you pinned with `pin_plan`, if it exists
2. the plan with a task `in-progress`
3. the plan whose task files changed most recently

It refreshes after any tool call whose input mentions `.ai/strikethroo/`, and on a timer that lists the plan and task directories every `refresh_seconds`. It re-reads the files only when a listing changed, and redraws only when the text it shows changed.

| Hook | What it does |
| --- | --- |
| `session.start` | Finds the workspace, reads the plans, starts the timer, registers `/strikethroo-status` |
| `tool.call` | Lets the call run, then refreshes if its input mentions `.ai/strikethroo/` |
| `command.run` on `strikethroo-status` | Refreshes and returns the plan as text; opens the pane when `display` includes it |
| `ui.render` on `AbovePrompt` | Draws the band line above whatever later mods draw there |
| `ui.render` on `Pane` | Draws the pane |

## Capabilities

The mod runs as you, unsandboxed. This is everything its hooks module hooks and calls, as `claude plugin validate` reports it. CI fails if the module uses anything outside this list (`scripts/check-capabilities.ts`).

<!-- capabilities -->
```json
{
  "hooks": ["session.start", "tool.call", "command.run", "ui.render"],
  "calls": [
    "$.clock.every",
    "$.command.register",
    "$.fs.exists",
    "$.fs.list",
    "$.fs.read",
    "$.session.cwd",
    "$.ui.invalidate",
    "$.ui.log",
    "$.ui.open",
    "$.ui.resolve"
  ]
}
```
<!-- /capabilities -->

The file calls only read. There is no `$.fs.write`, no process, no network, and no model call. The `tool.call` hook always returns the tool's own result, so it never blocks or changes a call.

## Demo

The blocks above are text captured from a Claude Code 2.1.296 session in a 180-column tmux window. The project was set up with `npx strikethroo init --harnesses claude`, plus plan 83 copied from the Strikethroo fixtures with its task statuses edited by hand. The pane capture used a copy of the plugin whose `display` default was `both`. Editing a task file from another shell updated the band and the pane within one refresh. So did asking Claude to edit one.

## How it was built

- **Model:** Claude Opus 5.5 in Claude Code.
- **Prompt(s):** a build brief from the repository owner covering the five plugins in this marketplace. It isn't included here.
- **Transcript:** not shared.
- **Iterations:**
  - The first `refresh` was a closure inside `register`. `claude plugin validate` refused it, because a hooks module may pass `$` only to functions declared at the top of the file. `refresh` and the state it reads moved to module level.
  - The timer first looked for the workspace again on every tick when none was found. In a session outside any Strikethroo project that meant several file checks every few seconds forever, so the timer now only re-lists a workspace it already found.
  - The test runner can't read files or import Markdown, so the tests stub `$.fs` with an in-memory workspace (`tests/lib/strikethroo/memory-fs.ts`).
  - A test that counts `ui.invalidate` calls checks that an unchanged poll doesn't redraw. Removing the change check makes it fail.

## Run it

**Requirements:**

- Claude Code 2.1.287 or later. Tested with 2.1.296.
- A project with a Strikethroo workspace of schema version 4 (`workspaceSchemaVersion` in `.ai/strikethroo/.init-metadata.json`). Verified against the Strikethroo `v4.1.1` fixtures. Any other version gets one log line and then nothing.

**Steps:**

1. Add the marketplace and install the plugin:

   ```bash
   claude plugin marketplace add e0ipso/strikethroo-mods
   claude plugin install strikethroo-progress@strikethroo-mods
   ```

   Or try it for one session from a clone: `claude --plugin-dir ./plugins/strikethroo-progress`.

2. Start Claude Code in a project with an active plan. The band appears above the prompt.
3. Run `/strikethroo-status` for the full list.

## Configuration

Set these in `/config`, or under `pluginConfigs["strikethroo-progress@strikethroo-mods"].options` in `~/.claude/settings.json`.

| Option | Default | What it does |
| --- | --- | --- |
| `display` | `band` | `band`, `pane`, `both` or `off`. With `off` there is no timer and no tool call hook; `/strikethroo-status` still works. |
| `refresh_seconds` | `3` | How often the timer lists the task directories, from 1 to 60 |
| `pin_plan` | empty | A plan id such as `42`, or a directory name such as `42--add-login` |

## Notes / limitations

- The pane opens by itself only in a terminal at least 144 columns wide, which is Claude Code's rule for panes nobody asked for. `/strikethroo-status` opens it at any width.
- The mod looks for the workspace at session start, on `/strikethroo-status`, and after a tool call that mentions `.ai/strikethroo/`. If you run `strikethroo init` from your own shell mid-session, run `/strikethroo-status` once.
- The band is shared. Another mod that draws `AbovePrompt` ahead of this one can hide it.
- The phase shown is the first blueprint phase with an unfinished task. A plan without an `## Execution Blueprint` shows no phase.
- Not checked: the Desktop app, the VS Code extension, and Windows paths. `claude -p` and the terminal were checked.
- Not built: the stretch goal of showing running subagents next to their tasks.

## Dependencies

| Name | Version | License (SPDX) | Source |
| --- | --- | --- | --- |
| None | | | |

`typescript` and `@types/node` are development dependencies of the repository, not of the mod. Claude Code loads the `.ts` files itself.

## Third-party notices

Claude and Claude Code are trademarks of Anthropic; use here is descriptive and implies no endorsement.

---

A prototype, MIT licensed. See the [root README](../../README.md).
