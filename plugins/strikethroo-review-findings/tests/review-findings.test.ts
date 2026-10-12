import type { CommandRunInput, On } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'

import { copyTextOf, draftOf, labelsOf, locationOf } from '../hooks/findings.ts'
import type { Finding } from '../hooks/lib/strikethroo/index.ts'
import { memoryFs, stubFs } from './lib/strikethroo/memory-fs.ts'
import type { MemoryFs } from './lib/strikethroo/memory-fs.ts'

const ROOT = '/work/.ai/strikethroo'
const REVIEW = `${ROOT}/plans/42--add-login/review/review.xml`

const XML = `<?xml version="1.0"?>
<review xmlns="urn:self-review:v2" timestamp="2026-01-01T00:00:00Z">
  <file path="src/login.ts" change-type="added" viewed="true">
    <comment new-line-start="42" new-line-end="44" severity="major" confidence="high">
      <body>Token is compared with == &lt;b&gt;not&lt;/b&gt; a constant-time check.</body>
      <category>security</category>
    </comment>
  </file>
  <file path="README.md" change-type="modified" viewed="true">
    <comment><body>File-level note.</body><category>docs</category></comment>
  </file>
</review>`

const STATUS: CommandRunInput = {
  command: 'strikethroo-review',
  args: '',
  origin: { kind: 'composer' },
  presentation: { isFullscreen: false, columns: 100 },
}

const PANE = {
  plugin: 'strikethroo-review-findings',
  surface: 'terminal',
  component: 'Pane',
  requestId: 'strikethroo-review-findings',
  props: { title: 'Review findings', isFocused: true, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

const workspace = (withReview: boolean): MemoryFs =>
  memoryFs({
    [`${ROOT}/.init-metadata.json`]: '{"workspaceSchemaVersion": 4}',
    [`${ROOT}/plans/42--add-login/plan-42--add-login.md`]: '# Plan: Add login\n',
    ...(withReview ? { [REVIEW]: XML } : {}),
  })

const session = (on: On, fs: MemoryFs) => {
  const opened: { id: string; focus?: true }[] = []
  const copied: string[] = []
  const filled: { text: string; mode?: string }[] = []
  const toasts: string[] = []
  stubFs(on, fs)
  const clock = mock.clock(on)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'strikethroo-review' } }))
  on('ui.open', ($, e) => {
    opened.push(e.focus === undefined ? { id: e.id } : { id: e.id, focus: e.focus })
    return { value: { isPlaced: true } }
  })
  on('ui.copy', ($, e) => {
    copied.push(e.text)
    return { value: { isCopied: true } }
  })
  on('prompt.fill', ($, e) => {
    filled.push(e.mode === undefined ? { text: e.text } : { text: e.text, mode: e.mode })
    return { isFilled: true }
  })
  on('ui.toast', ($, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['drawn by Claude Code'] }))
  return { clock, opened, copied, filled, toasts }
}

const FINDING: Finding = {
  path: 'src/login.ts',
  lines: { start: 42, end: 44 },
  severity: 'major',
  confidence: 'high',
  category: 'security',
  body: 'Token compared with ==.',
}

describe('findings.ts', () => {
  test('formats locations, labels and the draft', async () => {
    expect(locationOf(FINDING)).toBe('src/login.ts:42-44')
    expect(copyTextOf(FINDING)).toBe('src/login.ts:42')
    expect(labelsOf(FINDING)).toBe('major · high confidence · security')
    const fileLevel: Finding = { ...FINDING, lines: undefined, severity: undefined, confidence: undefined, category: undefined }
    expect([locationOf(fileLevel), copyTextOf(fileLevel), labelsOf(fileLevel)]).toEqual(['src/login.ts', 'src/login.ts', ''])
    expect(draftOf(FINDING)).toBe(
      'A Strikethroo review finding on src/login.ts:42-44 (major · high confidence · security; advisory labels):\n\n' +
        'Token compared with ==.\n\nCheck whether this finding holds before changing anything.',
    )
  })
})

describe('register', () => {
  test('/strikethroo-review opens the pane, which lists findings by file as text', async ($, on) => {
    const { opened } = session(on, workspace(true))
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
    expect(opened).toEqual([])
    expect((await $.command.run(STATUS)).text).toBe('2 finding(s) from 42--add-login/review/review.xml.')
    expect(opened).toEqual([{ id: 'strikethroo-review-findings', focus: true }])

    const pane = await $.ui.mount(PANE)
    expect(await pane.find({ type: 'Text', text: /advisory labels/ })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: /execution summary/ })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: 'src/login.ts:42-44  major · high confidence · security' })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: 'Token is compared with == <b>not</b> a constant-time check.' })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: 'README.md  docs' })).toBeDefined()
    const desktop = await $.ui.mount({ ...PANE, surface: 'desktop' })
    expect(await desktop.find({ key: 'draft-1' })).toBeDefined()
  })

  test('the buttons copy path:line and fill a draft, never submitting', async ($, on) => {
    const { copied, filled, toasts } = session(on, workspace(true))
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
    const pane = await $.ui.mount(PANE)
    await pane.press({ key: 'copy-0' })
    await pane.press({ key: 'draft-1' })
    expect(copied).toEqual(['src/login.ts:42'])
    expect(toasts).toEqual(['Copied src/login.ts:42'])
    expect(filled.map(fill => fill.mode)).toEqual(['append'])
    expect(filled[0]?.text).toContain('A Strikethroo review finding on README.md (docs; advisory labels):')
  })

  test('opens the pane when review.xml appears, and not again while it is unchanged', async ($, on) => {
    const fs = workspace(false)
    const { clock, opened } = session(on, fs)
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
    await clock.advance(3000)
    expect(opened).toEqual([])
    fs.files.set(REVIEW, XML)
    await clock.advance(3000)
    expect(opened).toEqual([{ id: 'strikethroo-review-findings' }])
    await clock.advance(9000)
    expect(opened.length).toBe(1)
    fs.mtimes.set(REVIEW, 2)
    await clock.advance(3000)
    expect(opened.length).toBe(2)
  })

  test('says so when there is no review', async ($, on) => {
    session(on, workspace(false))
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
    expect((await $.command.run(STATUS)).text).toBe('No review.xml under .ai/strikethroo/plans/*/review/.')
    const pane = await $.ui.mount(PANE)
    expect(await pane.find({ type: 'Text', text: 'No review.xml under .ai/strikethroo/plans/*/review/.' })).toBeDefined()
  })
})
