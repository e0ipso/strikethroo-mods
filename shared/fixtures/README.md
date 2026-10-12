# Fixtures

`serve-workspace/` is a verbatim copy of `src/__tests__/fixtures/serve-workspace/` from [Strikethroo](https://github.com/e0ipso/strikethroo) at tag `v4.1.1` (commit `8b63c3427308b5c109210227b87e3fedece5589c`), MIT licensed. Don't edit it. To move to a newer Strikethroo, copy the new tag's fixture over it and update this note.

It is a bare workspace: `.init-metadata.json`, `config/`, `plans/` and `archive/` sit at its top level with no `.ai/strikethroo/` above them. Its `plans/` directory is empty, so tests that need an active plan mount it under a project and copy an archived plan into `plans/`.

The mods' test runner can only import code files, so `node scripts/sync-shared.ts` turns `serve-workspace/.init-metadata.json` and `serve-workspace/archive/` into `shared/tests/fixture-files.ts`. CI fails when that file is out of date.
