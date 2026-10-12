import type { On } from 'claude-code'
import { describe, expect, test } from 'claude-code/testing'

import { listActivePlans } from '../hooks/lib/strikethroo/index.ts'
import { configOf, relativeTo, scopeWarning } from '../hooks/scope.ts'
import { memoryFs, stubFs } from './lib/strikethroo/memory-fs.ts'
import type { MemoryFs } from './lib/strikethroo/memory-fs.ts'

const PROJECT = '/work'
const ROOT = `${PROJECT}/.ai/strikethroo`
const TASKS = `${ROOT}/plans/42--add-login/tasks`

const task = (id: number, status: string, artifacts: string): string =>
  `---\nid: ${id}\ndependencies: []\nstatus: "${status}"\n---\n# Task ${id} title\n\n## Output Artifacts\n${artifacts}\n\n## Implementation Notes\n- \`not/an/artifact.ts\`\n`

const workspace = (tasks: Record<string, string>): MemoryFs =>
  memoryFs({
    [`${ROOT}/.init-metadata.json`]: '{"workspaceSchemaVersion": 4}',
    [`${ROOT}/plans/42--add-login/plan-42--add-login.md`]: '# Plan: Add login\n',
    ...Object.fromEntries(Object.entries(tasks).map(([file, text]) => [`${TASKS}/${file}`, text])),
  })

const ONE_IN_PROGRESS = {
  '01--schema.md': task(1, 'completed', '- `db/schema.sql`'),
  '02--endpoint.md': task(2, 'in-progress', '- `src/login.ts`\n- `test/login/` for its tests'),
}

const warningFor = async (tasks: Record<string, string>, path: string): Promise<string | undefined> =>
  scopeWarning(await listActivePlans(workspace(tasks), ROOT), PROJECT, path)?.text

describe('scope.ts', () => {
  test('warns about an edit outside the one in-progress task\'s artifacts', async () => {
    expect(await warningFor(ONE_IN_PROGRESS, '/work/src/admin.ts')).toBe(
      'Task 02 (Task 2 title) is in progress, and src/admin.ts is not one of its Output Artifacts.',
    )
    expect(await warningFor(ONE_IN_PROGRESS, '/work/not/an/artifact.ts')).toBeDefined()
  })

  test('stays quiet inside the artifacts and inside .ai/strikethroo/', async () => {
    expect(await warningFor(ONE_IN_PROGRESS, '/work/src/login.ts')).toBeUndefined()
    expect(await warningFor(ONE_IN_PROGRESS, '/work/test/login/login.test.ts')).toBeUndefined()
    expect(await warningFor(ONE_IN_PROGRESS, `${TASKS}/02--endpoint.md`)).toBeUndefined()
  })

  test('stays quiet with no task, several tasks, or no parseable artifacts in progress', async () => {
    expect(await warningFor({ '01--a.md': task(1, 'pending', '- `a.ts`') }, '/work/x.ts')).toBeUndefined()
    const two = { '01--a.md': task(1, 'in-progress', '- `a.ts`'), '02--b.md': task(2, 'in-progress', '- `b.ts`') }
    expect(await warningFor(two, '/work/x.ts')).toBeUndefined()
    expect(await warningFor({ '01--a.md': task(1, 'in-progress', '- The `Login` type, used by task 3') }, '/work/x.ts')).toBeUndefined()
  })

  test('makes paths project-relative, Windows separators included', async () => {
    expect(relativeTo('/work', '/work/src/a.ts')).toBe('src/a.ts')
    expect(relativeTo('C:\\work', 'C:\\work\\src\\a.ts')).toBe('src/a.ts')
    expect(relativeTo('/work', '/elsewhere/a.ts')).toBe('/elsewhere/a.ts')
  })

  test('narrows the options', async () => {
    expect(configOf({ mode: 'notice' })).toEqual({ mode: 'notice' })
    expect(configOf({ mode: 'loud' })).toEqual({ mode: 'toast' })
  })
})

const session = (on: On, fs: MemoryFs) => {
  const toasts: string[] = []
  const logs: string[] = []
  stubFs(on, fs)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('ui.toast', ($, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.log', ($, e) => {
    logs.push(e.text)
    return { value: undefined }
  })
  on('tool.call', () => ({ result: 'edited' }))
  return { toasts, logs }
}

const edit = (file_path: string) => ({ tool: 'Edit', tool_use_id: 'toolu_1', file_path, old_string: 'a', new_string: 'b' }) as const

describe('register', () => {
  test('toasts once per task and path, and always lets the edit run', async ($, on) => {
    const { toasts } = session(on, workspace(ONE_IN_PROGRESS))
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: PROJECT })
    expect(await $.tool.call(edit('/work/src/admin.ts'))).toEqual({ result: 'edited' })
    expect(await $.tool.call(edit('/work/src/admin.ts'))).toEqual({ result: 'edited' })
    expect(await $.tool.call(edit('/work/src/login.ts'))).toEqual({ result: 'edited' })
    expect(toasts).toEqual(['Task 02 (Task 2 title) is in progress, and src/admin.ts is not one of its Output Artifacts.'])
  })

  test('mode "notice" writes the warning as a transcript line', { options: { mode: 'notice' } }, async ($, on) => {
    const { toasts, logs } = session(on, workspace(ONE_IN_PROGRESS))
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: PROJECT })
    await $.tool.call({ tool: 'Write', tool_use_id: 'toolu_2', file_path: '/work/README.md', content: '# x' })
    expect(toasts).toEqual([])
    expect(logs).toEqual(['Task 02 (Task 2 title) is in progress, and README.md is not one of its Output Artifacts.'])
  })

  test('mode "off" hooks nothing', { options: { mode: 'off' } }, async ($, on) => {
    const { toasts } = session(on, workspace(ONE_IN_PROGRESS))
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: PROJECT })
    expect(await $.tool.call(edit('/work/src/admin.ts'))).toEqual({ result: 'edited' })
    expect(toasts).toEqual([])
  })

  test('a workspace that vanished mid-session stays quiet and lets the edit run', async ($, on) => {
    const fs = workspace(ONE_IN_PROGRESS)
    const { toasts } = session(on, fs)
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: PROJECT })
    fs.files.clear()
    expect(await $.tool.call(edit('/work/src/admin.ts'))).toEqual({ result: 'edited' })
    expect(toasts).toEqual([])
  })
})
