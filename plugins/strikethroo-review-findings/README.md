# strikethroo-review-findings

A Claude Code mod that lists the findings in a Strikethroo code review. When `plans/<plan>/review/review.xml` appears or changes, a pane opens with the findings grouped by file, and each finding has a button to copy its location and a button to draft a prompt about it.

## What this shows

```text
Review findings · 83--workspace-data-layer · 4 finding(s)
Severity and confidence are the reviewer's advisory labels. Nothing acts on them.
Whether the review was certified is in the plan's execution summary, not here.

src/serve/workspace-model.ts
  src/serve/workspace-model.ts:42-44  major · high confidence · bug
  `getPlanSummaries` drops a plan whose `id` does not parse, so the list and the
  detail view disagree for that plan.
  [ Copy path:line ]  [ Draft prompt ]
```

The header is there because Strikethroo's gate doesn't branch on severity or confidence, and the pane shouldn't suggest otherwise. The pane also doesn't know whether the review was certified. A `review.xml` can sit on disk after a failed validation, so the pane reads it as untrusted input:

- The scanner refuses any DTD or entity declaration and skips elements it doesn't know.
- It keeps at most 200 findings and cuts each body at 4,000 characters.
- It strips control and bidi characters.
- Everything is drawn as plain `Text`, so `<b>` in a body shows as `<b>`.

**Copy path:line** puts `src/serve/workspace-model.ts:42` on the clipboard. **Draft prompt** appends a draft like this to the prompt box, and you decide whether to send it:

```text
A Strikethroo review finding on src/serve/workspace-model.ts:42-44 (major · high confidence · bug; advisory labels):

`getPlanSummaries` drops a plan whose `id` does not parse, …

Check whether this finding holds before changing anything.
```

`/strikethroo-review` opens the pane with the keyboard on the first finding's copy button, at any terminal width. When several plans have a review, the pane shows the newest.

| Hook | What it does |
| --- | --- |
| `session.start` | Finds the workspace, notes which review files exist, starts a 3-second listing poll, registers `/strikethroo-review` |
| `tool.call` | Lets the call run, then checks again if its input mentions `.ai/strikethroo/` |
| `command.run` on `strikethroo-review` | Opens the pane with focus, and returns the finding count |
| `ui.render` on `Pane` | Draws the findings and the buttons |

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
    "$.prompt.fill",
    "$.session.cwd",
    "$.ui.copy",
    "$.ui.invalidate",
    "$.ui.log",
    "$.ui.open",
    "$.ui.resolve",
    "$.ui.toast"
  ]
}
```
<!-- /capabilities -->

`$.prompt.fill` writes a draft into the prompt box and never sends it; the mod has no `$.prompt.submit`. The file calls only read. The `tool.call` hook returns the tool's own result unchanged.

## Demo

Captured from a Claude Code 2.1.296 session in a 180-column tmux window, in a project made with `npx strikethroo init --harnesses claude` and a plan copied from the Strikethroo fixtures. Copying `shared/fixtures/review.xml` into the plan's `review/` directory opened the pane within one poll. `/strikethroo-review` then focused the first copy button. Enter showed the toast `Copied src/serve/workspace-model.ts:42`. Tab and Enter on **Draft prompt** put the draft in the prompt box, unsent.

## How it was built

- **Model:** Claude Opus 5.5 in Claude Code.
- **Prompt(s):** a build brief from the repository owner covering the five plugins in this marketplace. It isn't included here.
- **Transcript:** not shared.
- **Iterations:**
  - In the first session, Ctrl+X Tab put the keyboard on another mod's band button before this pane, so reaching a finding took guesswork. The first copy button now has `autoFocus`, and `/strikethroo-review` opens the pane focused.
  - The first listing at session start only records what exists, so an old review doesn't pop a pane every time a session starts. A review that appears or changes later opens it.
  - The tests can't import the repository's fixture file, so they embed a small `review.xml` with markup in a body and check it comes back as text.

## Run it

**Requirements:**

- Claude Code 2.1.287 or later. Tested with 2.1.296.
- A Strikethroo workspace of schema version 4. Verified against the Strikethroo `v4.1.1` fixtures. Any other version gets one log line and then nothing.

**Steps:**

1. Install it:

   ```bash
   claude plugin marketplace add e0ipso/strikethroo-mods
   claude plugin install strikethroo-review-findings@strikethroo-mods
   ```

   Or from a clone, for one session: `claude --plugin-dir ./plugins/strikethroo-review-findings`.

2. Run a blueprint with Strikethroo's code review enabled. When the review writes `review.xml`, the pane opens.
3. Run `/strikethroo-review` to open it again.

There is no configuration.

## Notes / limitations

- The pane opens by itself only in a terminal at least 144 columns wide. Below that you get a toast pointing at `/strikethroo-review`.
- Only `new-line-start` and `new-line-end` are read. A comment on deleted lines (`old-line-*`) shows as a file-level finding.
- After Strikethroo archives the plan, its `review/` directory moves to `archive/` and the mod stops watching it. The last findings stay in the pane until the session ends.
- In a desktop or remote surface, `$.ui.copy` may not reach a clipboard. The toast then says why.
- A finding's body goes into the draft as written by the reviewer. Read the draft before you send it.
- Not checked: the Desktop app (only a test mount on the `desktop` surface), the VS Code extension, Windows paths.

## Dependencies

| Name | Version | License (SPDX) | Source |
| --- | --- | --- | --- |
| None | | | |

## Third-party notices

Claude and Claude Code are trademarks of Anthropic; use here is descriptive and implies no endorsement.

---

A prototype, MIT licensed. See the [root README](../../README.md).
