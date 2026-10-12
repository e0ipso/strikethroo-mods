import type { CommandRunInput, On } from 'claude-code'
import { describe, expect, test } from 'claude-code/testing'

import { configOf, pageUrl, serveArgv, tailOf } from '../hooks/viewer.ts'
import { memoryFs, stubFs } from './lib/strikethroo/memory-fs.ts'

const ROOT = '/work/.ai/strikethroo'
const OPEN: CommandRunInput = {
  command: 'strikethroo-open',
  args: '',
  origin: { kind: 'composer' },
  presentation: { isFullscreen: false, columns: 100 },
}
const BAND = {
  plugin: 'strikethroo-viewer',
  surface: 'terminal',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 100, scroll: { offset: 0, bodyRows: 10 }, view: {} },
} as const

const files = {
  [`${ROOT}/.init-metadata.json`]: '{"workspaceSchemaVersion": 4}',
  [`${ROOT}/plans/42--add-login/plan-42--add-login.md`]: '# Plan: Add login\n',
  [`${ROOT}/plans/42--add-login/tasks/01--a.md`]: '---\nid: 1\ndependencies: []\nstatus: "in-progress"\n---\n# A\n',
}

/**
 * Stubs the workspace, the clock and the network. `answers` says, call by
 * call, whether the viewer answers; the last one repeats.
 */
const session = (on: On, answers: readonly boolean[], spawnFails = false) => {
  const fetched: string[] = []
  const spawned: { argv: readonly string[]; cwd: string | undefined }[] = []
  const toasts: string[] = []
  stubFs(on, memoryFs(files))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'strikethroo-open' } }))
  on('clock.sleep', () => ({ value: undefined }))
  on('http.fetch', ($, e) => {
    fetched.push(e.url)
    const isUp = answers[Math.min(fetched.length, answers.length) - 1] ?? false
    return isUp ? { value: { status: 200, ok: true, headers: {}, text: '[]' } } : { deny: 'connect ECONNREFUSED 127.0.0.1:4317' }
  })
  on('process.spawn', async function* ($, e) {
    spawned.push({ argv: e.argv, cwd: e.cwd })
    if (spawnFails) {
      yield { stream: 'stderr' as const, text: 'npm error could not determine executable to run\n' }
      return { value: { code: 1, signal: null } }
    }
    yield { stream: 'stdout' as const, text: 'Strikethroo viewer at http://127.0.0.1:4317\n' }
    return { value: { code: 0, signal: null } }
  })
  on('ui.toast', ($, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['drawn by Claude Code'] }))
  return { fetched, spawned, toasts }
}

describe('viewer.ts', () => {
  test('builds the command and loopback URLs', async () => {
    const config = configOf({})
    expect(serveArgv(config)).toEqual(['npx', '--yes', 'strikethroo@latest', 'serve', '--no-open', '--port', '4317'])
    expect(pageUrl(4317, '42--add-login')).toBe('http://127.0.0.1:4317/plans/42--add-login')
    expect(pageUrl(5000, undefined)).toBe('http://127.0.0.1:5000/')
  })

  test('refuses --host and falls back from a bad port', async () => {
    expect(configOf({ serve_command: 'strikethroo serve --host 0.0.0.0' }).problem).toContain('refuses')
    expect(configOf({ serve_command: 'strikethroo serve --host=::' }).problem).toContain('refuses')
    expect(configOf({ port: 80 }).port).toBe(4317)
    expect(configOf({ port: 8080, serve_command: '  node  serve.js ' })).toEqual({ argv: ['node', 'serve.js'], port: 8080, problem: undefined })
  })

  test('cleans process output for an error line', async () => {
    expect(tailOf('\u001b[31merror\u001b[0m: port in use\u0007\n')).toBe('error: port in use')
  })
})

describe('register', () => {
  test('links to a viewer that already answers, starting nothing', async ($, on) => {
    const { fetched, spawned } = session(on, [true])
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
    expect((await $.command.run(OPEN)).text).toBe('Strikethroo viewer: http://127.0.0.1:4317/plans/42--add-login')
    expect(fetched).toEqual(['http://127.0.0.1:4317/api/plans'])
    expect(spawned).toEqual([])
    const band = await $.ui.mount(BAND)
    expect((await band.find({ type: 'Link' }))?.props).toMatchObject({ href: 'http://127.0.0.1:4317/plans/42--add-login' })
  })

  test('starts serve in the project with no shell and no --host when nothing answers', async ($, on) => {
    const { spawned } = session(on, [false, true])
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work/src' })
    expect((await $.command.run(OPEN)).text).toBe('Strikethroo viewer: http://127.0.0.1:4317/plans/42--add-login')
    expect(spawned).toEqual([{ argv: ['npx', '--yes', 'strikethroo@latest', 'serve', '--no-open', '--port', '4317'], cwd: '/work' }])
  })

  test('reports a server that never answers, with its output', async ($, on) => {
    session(on, [false], true)
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
    const { text } = await $.command.run(OPEN)
    expect(text).toContain('strikethroo serve did not answer on port 4317')
    expect(text).toContain('could not determine executable')
  })

  test('starts nothing when serve_command passes --host', { options: { serve_command: 'npx strikethroo serve --host 0.0.0.0' } }, async ($, on) => {
    const { fetched, spawned } = session(on, [false])
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
    expect((await $.command.run(OPEN)).text).toContain('refuses')
    expect([fetched, spawned]).toEqual([[], []])
  })

  test('the band button opens the viewer and toasts the link', async ($, on) => {
    const { toasts } = session(on, [true])
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
    const band = await $.ui.mount(BAND)
    await band.press({ key: 'open-viewer' })
    expect(toasts).toEqual(['Strikethroo viewer: http://127.0.0.1:4317/plans/42--add-login'])
  })
})
