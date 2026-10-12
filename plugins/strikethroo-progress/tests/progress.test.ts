import type { CommandRunInput, On } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'

import { listActivePlans } from '../hooks/lib/strikethroo/index.ts'
import { bandLine, configOf, paneRows } from '../hooks/progress.ts'
import { memoryFs, stubFs } from './lib/strikethroo/memory-fs.ts'
import type { MemoryFs } from './lib/strikethroo/memory-fs.ts'

const PROJECT = '/work'
const ROOT = `${PROJECT}/.ai/strikethroo`
const PLAN = `${ROOT}/plans/42--add-login`

const task = (id: number, status: string, title: string): string =>
  `---\nid: ${id}\ngroup: "auth"\ndependencies: []\nstatus: "${status}"\n---\n# ${title}\n`

const files = (): Record<string, string> => ({
  [`${ROOT}/.init-metadata.json`]: '{"workspaceSchemaVersion": 4}',
  [`${PLAN}/plan-42--add-login.md`]:
    '---\nid: 42\n---\n# Plan: Add login\n\n## Execution Blueprint\n\n### Phase 1: Schema\n- Task 001: a\n- Task 002: b\n\n' +
    '### Phase 2: API\n- Task 003: c (depends on: 001)\n- Task 004: d\n\n## Notes\n',
  [`${PLAN}/tasks/01--schema.md`]: task(1, 'completed', 'Create the users table'),
  [`${PLAN}/tasks/02--seed.md`]: task(2, 'completed', 'Seed test users'),
  [`${PLAN}/tasks/03--endpoint.md`]: task(3, 'in-progress', 'Add the login endpoint'),
  [`${PLAN}/tasks/04--errors.md`]: task(4, 'failed', 'Map auth errors'),
  [`${PLAN}/tasks/05--docs.md`]: task(5, 'pending', 'Document the endpoint'),
})

/** /strikethroo-status, as the person types it. */
const STATUS: CommandRunInput = {
  command: 'strikethroo-status',
  args: '',
  origin: { kind: 'composer' },
  presentation: { isFullscreen: false, columns: 100 },
}

const BAND = {
  plugin: 'strikethroo-progress',
  surface: 'terminal',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 100, scroll: { offset: 0, bodyRows: 10 }, view: {} },
} as const

const PANE = {
  plugin: 'strikethroo-progress',
  surface: 'terminal',
  component: 'Pane',
  requestId: 'strikethroo-progress',
  props: { title: 'Strikethroo', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
} as const

/** Stubs everything the mod calls, and returns the toasts and log lines it raised. */
const session = (on: On, fs: MemoryFs) => {
  const logs: string[] = []
  const opened: string[] = []
  stubFs(on, fs)
  const clock = mock.clock(on)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'strikethroo-status' } }))
  on('ui.log', ($, e) => {
    logs.push(e.text)
    return { value: undefined }
  })
  on('ui.open', ($, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['drawn by Claude Code'] }))
  on('tool.call', () => ({ result: 'ok' }))
  return { clock, logs, opened }
}

describe('progress.ts', () => {
  test('summarizes the plan as one band line and as pane rows', async () => {
    const fs = memoryFs(files())
    const [plan] = await listActivePlans(fs, ROOT)
    if (plan === undefined) throw new Error('no plan')
    expect(bandLine(plan)).toBe('Plan 42 · phase 2/2 · task 03 in progress · task 04 failed · 2/5 done')
    expect(paneRows(plan)).toEqual([
      { text: 'Plan 42: Add login', tone: 'heading' },
      { text: '2/5 done · phase 2/2', tone: 'plain' },
      { text: 'Phase 1: Schema', tone: 'heading' },
      { text: '  ✓ 01 Create the users table', tone: 'done' },
      { text: '  ✓ 02 Seed test users', tone: 'done' },
      { text: 'Phase 2: API', tone: 'heading' },
      { text: '  ▶ 03 Add the login endpoint · in progress', tone: 'active' },
      { text: '  ✗ 04 Map auth errors · failed', tone: 'failed' },
      { text: 'Not in the blueprint', tone: 'heading' },
      { text: '  ○ 05 Document the endpoint · pending', tone: 'plain' },
    ])
  })

  test('narrows the options and falls back to the defaults', async () => {
    expect(configOf({ display: 'both', refresh_seconds: 10, pin_plan: ' 42 ' })).toEqual({ display: 'both', refreshSeconds: 10, pinPlan: '42' })
    expect(configOf({ display: 'sidebar', refresh_seconds: 600, pin_plan: '' })).toEqual({ display: 'band', refreshSeconds: 60, pinPlan: undefined })
    expect(configOf({})).toEqual({ display: 'band', refreshSeconds: 3, pinPlan: undefined })
  })
})

describe('register', () => {
  test('draws the band line above what Claude Code draws there', async ($, on) => {
    session(on, memoryFs(files()))
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: `${PROJECT}/src` })
    const band = await $.ui.mount(BAND)
    expect(await band.find({ type: 'Text', text: 'Plan 42 · phase 2/2 · task 03 in progress · task 04 failed · 2/5 done' })).toBeDefined()
    expect(await band.find({ type: 'Text', text: 'drawn by Claude Code' })).toBeDefined()
  })

  test('/strikethroo-status prints the pane rows as text', async ($, on) => {
    session(on, memoryFs(files()))
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: PROJECT })
    const { text } = await $.command.run(STATUS)
    expect(text?.split('\n').slice(0, 4)).toEqual(['Plan 42: Add login', '2/5 done · phase 2/2', 'Phase 1: Schema', '  ✓ 01 Create the users table'])
  })

  test('the pane dims finished tasks and marks failed ones', async ($, on) => {
    session(on, memoryFs(files()))
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: PROJECT })
    const pane = await $.ui.mount(PANE)
    expect((await pane.find({ type: 'Text', text: '  ✓ 01 Create the users table' }))?.props).toMatchObject({ dimColor: true })
    expect((await pane.find({ type: 'Text', text: '  ✗ 04 Map auth errors · failed' }))?.props).toMatchObject({ color: 'error' })
    const desktop = await $.ui.mount({ ...PANE, surface: 'desktop' })
    expect(await desktop.find({ type: 'Text', text: 'Phase 2: API' })).toBeDefined()
  })

  test('display "pane" opens the pane and leaves the band alone', { options: { display: 'pane' } }, async ($, on) => {
    const { opened } = session(on, memoryFs(files()))
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: PROJECT })
    expect(opened).toEqual(['strikethroo-progress'])
    const band = await $.ui.mount(BAND)
    expect(await band.find({ type: 'Text', text: /Plan 42/ })).toBeUndefined()
  })

  test('display "band" opens no pane, and a pin picks the plan', { options: { pin_plan: '7' } }, async ($, on) => {
    const fs = memoryFs(files())
    fs.files.set(`${ROOT}/plans/07--older/plan-07--older.md`, '# Plan: Older\n')
    fs.files.set(`${ROOT}/plans/07--older/tasks/01--a.md`, task(1, 'pending', 'Old task'))
    const { opened } = session(on, fs)
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: PROJECT })
    expect(opened).toEqual([])
    const band = await $.ui.mount(BAND)
    expect(await band.find({ type: 'Text', text: 'Plan 7 · 0/1 done' })).toBeDefined()
  })

  test('the timer picks up a changed task file', async ($, on) => {
    const fs = memoryFs(files())
    const { clock } = session(on, fs)
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: PROJECT })
    fs.files.set(`${PLAN}/tasks/03--endpoint.md`, task(3, 'completed', 'Add the login endpoint'))
    fs.mtimes.set(`${PLAN}/tasks/03--endpoint.md`, 2)
    await clock.advance(3000)
    const band = await $.ui.mount(BAND)
    expect(await band.find({ type: 'Text', text: 'Plan 42 · phase 2/2 · task 04 failed · 3/5 done' })).toBeDefined()
  })

  test('a tool call under .ai/strikethroo refreshes at once', async ($, on) => {
    const fs = memoryFs(files())
    session(on, fs)
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: PROJECT })
    fs.files.set(`${PLAN}/tasks/05--docs.md`, task(5, 'in-progress', 'Document the endpoint'))
    await $.tool.call({ tool: 'Edit', file_path: `${PLAN}/tasks/05--docs.md`, old_string: 'pending', new_string: 'in-progress' })
    const { text } = await $.command.run(STATUS)
    expect(text).toContain('▶ 05 Document the endpoint · in progress')
  })

  test('an unsupported workspace is reported once, then the mod stays quiet', async ($, on) => {
    const { logs } = session(on, memoryFs({ [`${ROOT}/.init-metadata.json`]: '{"workspaceSchemaVersion": 3}' }))
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: PROJECT })
    await $.tool.call({ tool: 'Read', file_path: `${ROOT}/.init-metadata.json` })
    expect(logs).toEqual(['unsupported workspace version 3; showing nothing. This mod reads workspace schema 4 only.'])
    const band = await $.ui.mount(BAND)
    expect(await band.find({ type: 'Text', text: /Plan/ })).toBeUndefined()
  })

  test('redraws only when what it shows changed', async ($, on) => {
    const fs = memoryFs(files())
    const { clock } = session(on, fs)
    let redraws = 0
    on('ui.invalidate', () => {
      redraws++
      return { value: undefined }
    })
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: PROJECT })
    expect(redraws).toBe(1)
    fs.mtimes.set(`${PLAN}/tasks/05--docs.md`, 2)
    await clock.advance(9000)
    expect(redraws).toBe(1)
    fs.files.set(`${PLAN}/tasks/05--docs.md`, task(5, 'needs-clarification', 'Document the endpoint'))
    fs.mtimes.set(`${PLAN}/tasks/05--docs.md`, 3)
    await clock.advance(3000)
    expect(redraws).toBe(2)
  })
})
