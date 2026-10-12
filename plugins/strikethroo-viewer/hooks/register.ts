/**
 * strikethroo-viewer: /strikethroo-open and a band button that open the
 * active plan in `strikethroo serve`.
 *
 * It asks http://127.0.0.1:<port>/api/plans whether a viewer already answers,
 * and if not, spawns serve_command with --port, no shell, in the project
 * directory, never with --host. The child lives as long as the module: Claude
 * Code stops it when the session ends or the mod reloads. Read-only on
 * .ai/strikethroo/; serve's own write routes are not called.
 */
import type { EngineInterface, On, PluginOptions } from 'claude-code'

import type { WorkspaceFs, WorkspaceLookup } from './lib/strikethroo/index.ts'
import { findWorkspace, listActivePlans, pickActivePlan } from './lib/strikethroo/index.ts'
import type { ViewerConfig } from './viewer.ts'
import { apiUrl, configOf, pageUrl, serveArgv, tailOf } from './viewer.ts'

const COMMAND = 'strikethroo-open'
const WAIT_STEP_MS = 250
/** 30 seconds: long enough for npx to download Strikethroo on first use. */
const WAIT_STEPS = 120

let config: ViewerConfig = configOf({})
let cwd: string | undefined
let lookup: WorkspaceLookup = { kind: 'none' }
/** The page last opened, shown as a link in the band. */
let url: string | undefined
let isChildRunning = false
let childOutput = ''

const fsOf = ($: EngineInterface): WorkspaceFs => ({
  exists: path => $.fs.exists(path),
  read: path => $.fs.read(path),
  list: path => $.fs.list(path),
})

/** Whether a viewer answers on the configured loopback port. */
async function isServing($: EngineInterface): Promise<boolean> {
  try {
    return (await $.http.fetch(apiUrl(config.port))).ok
  } catch {
    return false
  }
}

/** Starts serve_command for the session's life, keeping the end of its output. */
function startServer($: EngineInterface, project: string): void {
  isChildRunning = true
  childOutput = ''
  void (async () => {
    try {
      for await (const chunk of $.process.spawn({ argv: serveArgv(config), cwd: project })) {
        childOutput = (childOutput + chunk.text).slice(-4000)
      }
    } catch (error) {
      childOutput += `\n${String(error)}`
    }
    isChildRunning = false
    url = undefined
    $.ui.invalidate('ui.render')
  })()
}

/** Finds or starts the viewer and returns the line to show. */
async function openViewer($: EngineInterface): Promise<string> {
  lookup = await findWorkspace(fsOf($), cwd ?? (await $.session.cwd()))
  if (lookup.kind === 'unsupported') return `${lookup.message}. This mod reads workspace schema 4 only.`
  if (lookup.kind === 'none') return 'No Strikethroo workspace found from this directory.'
  if (config.problem !== undefined) return config.problem

  if (!(await isServing($))) {
    if (!isChildRunning) startServer($, lookup.project)
    for (let step = 0; step < WAIT_STEPS && isChildRunning && !(await isServing($)); step++) await $.clock.sleep(WAIT_STEP_MS)
    if (!(await isServing($))) {
      const tail = tailOf(childOutput)
      return `strikethroo serve did not answer on port ${config.port}${tail === '' ? '.' : `:\n${tail}`}`
    }
  }

  const plan = pickActivePlan(await listActivePlans(fsOf($), lookup.root))
  url = pageUrl(config.port, plan?.name)
  $.ui.invalidate('ui.render')
  return `Strikethroo viewer: ${url}`
}

export function register(on: On, options: PluginOptions): void {
  config = configOf(options)

  on('session.start', async ($, e, next) => {
    cwd = e.cwd
    lookup = await findWorkspace(fsOf($), e.cwd)
    $.ui.invalidate('ui.render')
    try {
      await $.command.register({ name: COMMAND, description: 'Open the active Strikethroo plan in strikethroo serve' })
    } catch (error) {
      $.ui.log(`/${COMMAND} is unavailable: ${String(error)}`)
    }
    return next(e)
  })

  on('command.run', { command: COMMAND }, async $ => ({ text: await openViewer($) }))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (lookup.kind !== 'found' || e.props.hasSurvey) return next(e)
    const { Box, Button, Link } = $.ui.resolve(e)
    const button = Button({
      key: 'open-viewer',
      label: url === undefined ? 'Open in Strikethroo viewer' : 'Reopen viewer',
      plain: true,
      onPress: async () => $.ui.toast(await openViewer($)),
    })
    const row = Box({ flexDirection: 'row', columnGap: 2, children: url === undefined ? [button] : [button, Link({ href: url, label: url })] })
    return Box({ flexDirection: 'column', children: [row, await next(e)] })
  })
}
