# strikethroo-scope-watch

A Claude Code mod that warns when Claude edits a file the current Strikethroo task didn't say it would produce. It compares each Write, Edit, MultiEdit and NotebookEdit call with the `## Output Artifacts` of the one task marked `in-progress`. It warns. It never blocks an edit.

## What this shows

A toast, or a dim transcript line with `mode` set to `notice`:

```text
● strikethroo-scope-watch: Task 05 (Document the serve data layer in AGENTS.md) is in
  progress, and src/sixth.txt is not one of its Output Artifacts.
```

The mod stays silent when:

- no task is in progress, or more than one is;
- the in-progress task has no `## Output Artifacts` section, or lists no paths there;
- the edited file is one of the artifacts, sits under an artifact directory, or matches an artifact glob;
- the edited file is under `.ai/strikethroo/`, where Strikethroo keeps its own state;
- it already warned about this task and path in this session.

An artifact is a backtick span under `## Output Artifacts` with no spaces that holds a `/` or ends in an extension. So `` `src/login.ts` ``, `` `docs/` `` and `` `AGENTS.md` `` count, and `` `Task` `` or `` `phaseCount` `` don't. A span with `*` is a glob, and `**` crosses directories.

| Hook | What it does |
| --- | --- |
| `session.start` | Finds the workspace |
| `tool.call` on `Write`, `Edit`, `MultiEdit`, `NotebookEdit` | Passes the call on with `next(e)` first, then checks the path, and returns the tool's result whatever the check finds |

## Capabilities

The mod runs as you, unsandboxed. This is everything its hooks module hooks and calls, as `claude plugin validate` reports it. CI fails if the module uses anything outside this list (`scripts/check-capabilities.ts`).

<!-- capabilities -->
```json
{
  "hooks": ["session.start", "tool.call"],
  "calls": [
    "$.fs.exists",
    "$.fs.list",
    "$.fs.read",
    "$.session.cwd",
    "$.ui.log",
    "$.ui.toast"
  ]
}
```
<!-- /capabilities -->

The hook never returns `{ deny }` and never changes the call. The file calls only read.

## Demo

Captured from a Claude Code 2.1.296 session in a project made with `npx strikethroo init --harnesses claude` and a plan copied from the Strikethroo fixtures, with task 05 in progress and `AGENTS.md` as its only artifact. Asking Claude to write `src/notes.txt` raised the toast during the edit. With `mode` set to `notice` through `--settings`, writing `src/sixth.txt` added the transcript line shown above. Both edits went ahead.

## How it was built

- **Model:** Claude Opus 5.5 in Claude Code.
- **Prompt(s):** a build brief from the repository owner covering the five plugins in this marketplace. It isn't included here.
- **Transcript:** not shared.
- **Iterations:**
  - The brief described `notice` as a notice. The first build used `$.ui.notice`, which draws a line under an open dialog for the tool call. In 2.1.296 nothing appeared under the approval dialog for a Write, even when the call came 800 ms after the dialog opened. The mods overview says a mod can't change what the permission prompt shows, which explains it. In auto mode no dialog opens at all. `notice` now writes a dim transcript line with `$.ui.log`, which shows in every permission mode.
  - The hook first ran its check and then called `next(e)`, so the edit waited on directory listings. It now calls `next(e)` first.
  - Claude Code 2.1.296 has no MultiEdit tool, so a typed matcher listing it fails the type check. The matcher is a regular expression, which still catches MultiEdit on builds that have it.

## Run it

**Requirements:**

- Claude Code 2.1.287 or later. Tested with 2.1.296.
- A Strikethroo workspace of schema version 4. Verified against the Strikethroo `v4.1.1` fixtures. Any other version gets one log line and then nothing.

**Steps:**

1. Install it:

   ```bash
   claude plugin marketplace add e0ipso/strikethroo-mods
   claude plugin install strikethroo-scope-watch@strikethroo-mods
   ```

   Or from a clone, for one session: `claude --plugin-dir ./plugins/strikethroo-scope-watch`.

2. Execute a task with `st-execute-task` or a blueprint. Edits outside the task's artifacts raise a warning.

## Configuration

| Option | Default | What it does |
| --- | --- | --- |
| `mode` | `toast` | `toast` shows a notification for 8 seconds. `notice` adds a dim transcript line that Claude doesn't read. `off` registers no hooks at all. |

## Notes / limitations

- Blueprint phases run several tasks in parallel. With more than one task in progress the mod can't tell which one an edit belongs to, so it stays silent. It is most useful for single-task runs and one-task phases.
- Output Artifacts are prose. The path rule above is a heuristic, and a task that names its artifacts in words, not backticked paths, gets no warnings.
- A path outside the project is compared as an absolute path, so it always warns.
- The workspace is looked up at session start, and again when an edited path is under `.ai/strikethroo/`.
- A toast cuts long text with `…`. `notice` shows the whole line.
- Not checked: the Desktop app, the VS Code extension. Windows paths are covered by a unit test only.

## Dependencies

| Name | Version | License (SPDX) | Source |
| --- | --- | --- | --- |
| None | | | |

## Third-party notices

Claude and Claude Code are trademarks of Anthropic; use here is descriptive and implies no endorsement.

---

A prototype, MIT licensed. See the [root README](../../README.md).
