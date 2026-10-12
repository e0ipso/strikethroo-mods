# Claude Code mod types, vendored

The type check (`npm run typecheck`) resolves `claude-code`, `claude-code/testing` and the built-in tool inputs from this directory. Each plugin's `tsconfig.json` points `typeRoots` here.

| File | What it declares |
| --- | --- |
| `claude-code/index.d.ts` | Events, the mods API, elements, and the `claude-code/testing` kit |
| `claude-code-tools/index.d.ts` | Built-in tool inputs, so `e.tool === 'Edit'` narrows `e` |
| `claude-code-mcp/index.d.ts` | MCP tool inputs; empty here |

## Source

These are the files Claude Code **2.1.296** wrote into `.claude-plugin/types/` when it loaded a mod with `claude --plugin-dir` on 2026-10-12. Their first line names that version. This is also the version the plugins were tested against.

The brief for this repository asked for a pinned copy of `mods/types/claude-code.d.ts` from [anthropics/claude-code](https://github.com/anthropics/claude-code). At commit `3deb873687379f0c199a69fdaccc65f0865f7a29` (2026-10-11) that file was written by Claude Code 2.1.277, ten releases before the first one that loads mods by default. It lacks `$.ui.copy`, which the since-removed `strikethroo-review-findings` called, and `PluginState`, which typed `$.state` needs. The mods documentation says to trust the generated copy when the two disagree, so the generated copy is vendored here and the upstream commit is recorded for reference.

SHA-256 of the vendored files:

```text
ea634205532548aa90020ff3a941e570bff5bec8ae242fb96d09dbcc8fc1bfad  claude-code/index.d.ts
92a192dcc81dff6365a27139034efe3c36e7969775dda0000041173648b5b7f6  claude-code-tools/index.d.ts
0cab298516885f406c7762cf83b84334b5f5f02e1207abc79a02d136f518354b  claude-code-mcp/index.d.ts
```

## Updating

1. Install the Claude Code version to test against.
2. Load any plugin here with `claude --plugin-dir plugins/<name>` in an interactive session, then exit.
3. Copy the three directories from `plugins/<name>/.claude-plugin/types/` over these, and update the version, date and hashes above.
4. Run `npm run typecheck`, `npm test` and `npm run validate`, and update the tested version in each plugin's README.

## License

These declarations are Anthropic's, not this repository's. The MIT license in the repository root doesn't cover them. The claude-code repository says: "© Anthropic PBC. All rights reserved. Use is subject to Anthropic's Commercial Terms of Service."
