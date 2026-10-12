# strikethroo-mods

A Claude Code plugin marketplace for [Strikethroo](https://github.com/e0ipso/strikethroo) plan progress, review findings, scope warnings, and a local viewer.

| Plugin | What it does |
| --- | --- |
| [`strikethroo-progress`](plugins/strikethroo-progress/) | Shows phase and task progress above the prompt. `/strikethroo-status` lists tasks; an optional pane shows them alongside the conversation. |
| [`strikethroo-review-findings`](plugins/strikethroo-review-findings/) | Shows `review/review.xml` findings in a pane. `/strikethroo-review` opens it, with buttons to copy locations or draft a prompt. |
| [`strikethroo-scope-watch`](plugins/strikethroo-scope-watch/) | Warns about edits outside the task's Output Artifacts when exactly one task is in progress. |
| [`strikethroo-claim-check`](plugins/strikethroo-claim-check/) | Adds a note when Claude claims completion without running a Bash command matching a verification pattern that turn. Works without Strikethroo. |
| [`strikethroo-viewer`](plugins/strikethroo-viewer/) | `/strikethroo-open` finds or starts `strikethroo serve` on `127.0.0.1` and returns a link to the active plan. |

The mods leave workspace files unchanged and provide advisory information. Progress reflects task file statuses; claim-check matches command text without checking whether commands passed. Strikethroo's own gates determine validation results.

## Install

Add the marketplace, then install any plugin from the table:

```bash
claude plugin marketplace add e0ipso/strikethroo-mods
claude plugin install strikethroo-progress@strikethroo-mods
```

Start Claude Code in your Strikethroo project. Each plugin's README covers its options and capabilities.

To try a plugin from a clone for one session:

```bash
claude --plugin-dir ./plugins/strikethroo-progress
```

Repeat `--plugin-dir` to load more plugins.

## Compatibility

- CI tests against Claude Code **2.1.296**.
- Workspace-based mods read `.ai/strikethroo/` schema **4**, identified by `workspaceSchemaVersion` in `.init-metadata.json`. They report unsupported schemas and skip them. Tests use [Strikethroo v4.1.1 fixtures](shared/fixtures/).
- The viewer's default command is `npx --no-install strikethroo serve --no-open`, so Strikethroo must already be available to that command. Set `serve_command` to use another installation.

## Development

Use Node.js 22.18 or later and the Claude Code CLI. Claude Code loads the TypeScript plugins directly; there is no build step.

```bash
npm ci
npm run typecheck
npm test
npm run validate
npm run check-capabilities
```

Each `plugins/<name>/` directory is self-contained. Edit shared code in `shared/lib/` and test helpers in `shared/testing/`, then run `npm run sync` to update the committed copies inside each plugin. CI checks that the copies match.

[`capabilities.json`](capabilities.json) lists each plugin's allowed hooks and API calls. `check-capabilities` checks the code and plugin READMEs against it.

## License

MIT, except `types/vendor/claude-code/`, which is Anthropic's. See [LICENSE](LICENSE).
