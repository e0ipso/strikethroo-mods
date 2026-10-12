# strikethroo-mods

A Claude Code plugin marketplace with prototype mods for [Strikethroo](https://github.com/e0ipso/strikethroo). Each mod reads the `.ai/strikethroo/` workspace in your project and shows what it finds inside Claude Code: progress above the prompt, a pane, a command.

The mods inform. They never write to `.ai/strikethroo/`, approve or deny a tool call, submit a prompt, call a model, or change the system prompt. Strikethroo's compiled gates decide whether a plan, task or review passed, and nothing here claims otherwise.

Strikethroo doesn't depend on this repository. This repository depends only on Strikethroo's on-disk workspace format.

| Plugin | What it does |
| --- | --- |
| [`strikethroo-progress`](plugins/strikethroo-progress/) | The active plan's phase and task progress, in the band above the prompt, in a pane, and from `/strikethroo-status` |
| [`strikethroo-review-findings`](plugins/strikethroo-review-findings/) | A pane listing the findings in a plan's `review/review.xml`, with buttons to copy `path:line` or draft a prompt about a finding |
| [`strikethroo-scope-watch`](plugins/strikethroo-scope-watch/) | A warning when Claude edits a file outside the in-progress task's Output Artifacts. It never blocks. |

## Install

You need Claude Code 2.1.287 or later (`claude --version`). The mods were tested with 2.1.296.

```bash
claude plugin marketplace add e0ipso/strikethroo-mods
```

Then, in a Claude Code session:

```text
/plugin install strikethroo-progress@strikethroo-mods
```

To try a mod for one session from a clone, without installing it:

```bash
claude --plugin-dir ./plugins/strikethroo-progress
```

## Trust

A mod is code that runs inside Claude Code as you, unsandboxed. It could read and write any file you can, start programs, and reach the network. Before you install one, read the capability allowlist in its README. That list is everything its hooks module hooks and calls, as `claude plugin validate` reports it, and CI fails if the code uses anything outside it. You can produce the same list yourself from a clone:

```bash
claude plugin validate ./plugins/strikethroo-progress
```

## Format coupling

The mods read Strikethroo workspace schema 4, the `workspaceSchemaVersion` in `.ai/strikethroo/.init-metadata.json`. They were verified against the fixture workspace from Strikethroo `v4.1.1`, copied into [`shared/fixtures/`](shared/fixtures/). A workspace with any other schema version gets one line saying so, and then the mod shows nothing. When Strikethroo changes its schema, these mods need a new release.

## Development

Contributors need Node.js 22.18 or later, which runs `.ts` files directly, and the `claude` CLI. People who install a mod need neither: Claude Code loads the `.ts` hooks modules itself.

```bash
npm install
npm run typecheck           # tsc -p on the root, shared/ and each plugin
npm test                    # claude plugin test on shared/ and each plugin
npm run validate            # claude plugin validate --strict on the marketplace and each plugin
npm run check-capabilities  # each plugin's hooks and calls against capabilities.json
npm run sync                # copy shared/ into the plugins
```

The layout:

- `plugins/<name>/` holds one self-contained plugin per mod.
- `shared/lib/` is the workspace reader every mod uses. A hooks module may only import files inside its own plugin, so `npm run sync` copies `shared/lib/` into each plugin's `hooks/lib/strikethroo/` and `shared/testing/` into `tests/lib/strikethroo/`. The copies are committed, because an install reads the plugin directory as it is. Edit `shared/`, never a copy. CI runs `node scripts/sync-shared.ts --check` and fails when a copy differs.
- `shared/tests/` unit-tests the reader against the Strikethroo fixtures. `claude plugin test` needs a hooks module to load, so `shared/hooks/` holds an empty one.
- `capabilities.json` is each plugin's allowlist. Each plugin README prints its entry, and `check-capabilities` fails if the two differ.
- `types/vendor/claude-code/` holds the Claude Code mod type declarations the type check uses. Its README says where they came from.

There is no build step. Write only TypeScript that type stripping can remove, which `erasableSyntaxOnly` in `tsconfig.json` enforces, and import relative files with their `.ts` extension. Hooks modules follow the static-analysis rules in the [create guide](https://code.claude.com/docs/en/plugins/mods/create#check-what-claude-code-reads-from-your-mod): write every `$` call in full, use string-literal event names, and use top-level `import` declarations only.

CI (`.github/workflows/ci.yml`) installs Claude Code from npm at the tested version and runs all of the above. `claude plugin validate` and `claude plugin test` need no sign-in.

## License

MIT, except `types/vendor/claude-code/`, which is Anthropic's. See [LICENSE](LICENSE).
