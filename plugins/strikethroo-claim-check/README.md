# strikethroo-claim-check

A Claude Code mod that adds one line under Claude's answer when the answer says the work is done, fixed or passing and no test or build command ran during the turn:

```text
● The change is complete.
● strikethroo-claim-check: No test or build command ran this turn.
```

That line is all it ever shows. It reads no workspace files and doesn't need Strikethroo at all. It goes with the Strikethroo mods because Strikethroo starts from the same premise: an agent's report about its own work is a claim, not evidence.

## What this shows

During a turn the mod records each Bash command that ran (`tool.call` with `tool: 'Bash'`), including a subagent's. When the main conversation's turn ends, it reads the last assistant message with `$.session.messages()`. It adds the line when both hold:

1. A sentence claims completion: done, fixed, complete, passing, all tests pass, or the same with "should", such as "It should be fixed now."
2. No recorded command contains any `verify_patterns` entry, ignoring case.

A sentence with a negation, a condition or a question doesn't count, for example "I haven't run the tests", "Once you're done, run npm test", or "Is the build passing?". Code blocks and inline code are skipped. `tests/claim-check.test.ts` holds the table of sentences that count and sentences that don't.

| Hook | What it does |
| --- | --- |
| `tool.call` on `Bash` | Lets the command run, then records it unless it was refused |
| `turn.complete` | Checks the answer and the recorded commands, then forgets the commands |

The mod stays quiet for a subagent's turn, an interrupted turn, and a turn where another mod already put a line under the answer.

## Capabilities

The mod runs as you, unsandboxed. This is everything its hooks module hooks and calls, as `claude plugin validate` reports it. CI fails if the module uses anything outside this list (`scripts/check-capabilities.ts`).

<!-- capabilities -->
```json
{
  "hooks": ["tool.call", "turn.complete"],
  "calls": ["$.session.messages"]
}
```
<!-- /capabilities -->

It doesn't call a model to judge the answer, and it never says the work is verified. When it is quiet, that means a matching command ran, not that it passed.

## Demo

Captured from a Claude Code 2.1.296 session. Asked to reply "All tests pass." with no tools, Claude replied and the line appeared under the answer. Asked to run `echo test-run` first, Claude replied the same and no line appeared, because the command contains `test`. In an earlier turn, Claude declined to write "All tests pass" because it hadn't run any tests, and the mod stayed quiet, since "I won't reply …" is a negation.

## How it was built

- **Model:** Claude Opus 5.5 in Claude Code.
- **Prompt(s):** a build brief from the repository owner covering the five plugins in this marketplace. It isn't included here.
- **Transcript:** not shared.
- **Iterations:**
  - The first build never drew its line in a session, though its tests passed. To avoid overwriting another mod's line, it returned early when `next(e)` gave back a non-empty `text`. In 2.1.296 Claude Code's own result always carries `text`, equal to the answer. The mod now treats `text` as another mod's line only when it differs from `e.answer`. The test stub now behaves like the engine, and putting back the old check fails three tests.
  - `turn.start` carries no `agentId`, so a subagent's turn can't be told from the main one there. The mod clears its command list at the end of each main turn.
  - "This needs to be fixed" matched the first patterns. "be fixed" alone no longer counts, only "should be fixed" and the like.

## Run it

**Requirements:** Claude Code 2.1.287 or later. Tested with 2.1.296. No Strikethroo workspace needed.

**Steps:**

```bash
claude plugin marketplace add e0ipso/strikethroo-mods
claude plugin install strikethroo-claim-check@strikethroo-mods
```

Or from a clone, for one session: `claude --plugin-dir ./plugins/strikethroo-claim-check`.

## Configuration

| Option | Default | What it does |
| --- | --- | --- |
| `verify_patterns` | `test`, `vitest`, `jest`, `pytest`, `tsc`, `build`, `lint`, `validate` | A Bash command that contains any of these, ignoring case, counts as a test or build run |

`verify_patterns` is a list, so `/config` doesn't show it. Set it under `pluginConfigs["strikethroo-claim-check@strikethroo-mods"].options.verify_patterns` in `~/.claude/settings.json`.

## Notes / limitations

- The match is a substring, so `cat latest.log` counts as a test run. That errs toward staying quiet. A command that verifies without matching, such as `npm run typecheck` with the defaults, needs its own pattern.
- Only Bash commands count. Tests run through an MCP tool or another mod's tool don't.
- The claim detector is a short list of English patterns. It misses claims in other words and in other languages.
- Claude Code labels the line with every mod that passed the event on, such as `strikethroo-claim-check+cc-plugin-agents-md`.
- Not checked: the Desktop app, the VS Code extension, `claude -p`.

## Dependencies

| Name | Version | License (SPDX) | Source |
| --- | --- | --- | --- |
| None | | | |

## Third-party notices

Claude and Claude Code are trademarks of Anthropic; use here is descriptive and implies no endorsement.

---

A prototype, MIT licensed. See the [root README](../../README.md).
