/**
 * strikethroo-viewer: /strikethroo-open and a band button that open the
 * active plan in `strikethroo serve`.
 *
 * It asks http://127.0.0.1:<port>/api/plans whether a viewer already answers,
 * and if not, spawns serve_command with --port, no shell, in the project
 * directory, never with --host. The child lives until the band's stop button
 * ends it, or Claude Code stops it when the session ends or the mod reloads.
 * A viewer the mod didn't start is reused and never stopped. Read-only on
 * .ai/strikethroo/; serve's own write routes are not called.
 */
import type { EngineInterface, HookStream, On, PluginOptions, ProcessSpawnChunk, ProcessSpawnResult } from 'claude-code'

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
/** The server this mod started, while it runs. Closing the stream kills it. */
let child: HookStream<ProcessSpawnChunk, ProcessSpawnResult> | undefined
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

/** Starts serve_command until it is stopped or the session ends, keeping the end of its output. */
function startServer($: EngineInterface, project: string): void {
  const stream = $.process.spawn({ argv: serveArgv(config), cwd: project })
  child = stream
  childOutput = ''
  void (async () => {
    try {
      for await (const chunk of stream) childOutput = (childOutput + chunk.text).slice(-4000)
    } catch (error) {
      childOutput += `\n${String(error)}`
    }
    if (child !== stream) return
    child = undefined
    url = undefined
    $.ui.invalidate('ui.render')
  })()
}

/** Kills the server this mod started, and waits for the port to go quiet. */
async function stopServer($: EngineInterface): Promise<string> {
  const stream = child
  if (stream === undefined) return 'No viewer started by this session is running.'
  child = undefined
  url = undefined
  $.ui.invalidate('ui.render')
  void stream.return({ code: null, signal: 'SIGTERM' }).catch(() => undefined)
  for (let step = 0; step < WAIT_STEPS && (await isServing($)); step++) await $.clock.sleep(WAIT_STEP_MS)
  return (await isServing($)) ? `Stopped the viewer, but port ${config.port} still answers.` : 'Strikethroo viewer stopped.'
}

/** Finds or starts the viewer and returns the line to show. */
async function openViewer($: EngineInterface): Promise<string> {
  lookup = await findWorkspace(fsOf($), cwd ?? (await $.session.cwd()))
  if (lookup.kind === 'unsupported') return `${lookup.message}. This mod reads workspace schema 4 only.`
  if (lookup.kind === 'none') return 'No Strikethroo workspace found from this directory.'
  if (config.problem !== undefined) return config.problem

  if (!(await isServing($))) {
    if (child === undefined) startServer($, lookup.project)
    for (let step = 0; step < WAIT_STEPS && child !== undefined && !(await isServing($)); step++) await $.clock.sleep(WAIT_STEP_MS)
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
    const open = Button({
      key: 'open-viewer',
      label: url === undefined ? 'Open in Strikethroo viewer' : 'Reopen viewer',
      plain: true,
      onPress: async () => $.ui.toast(await openViewer($)),
    })
    const stop = Button({ key: 'stop-viewer', label: 'Stop viewer', plain: true, onPress: async () => $.ui.toast(await stopServer($)) })
    const children = [open, ...(child === undefined ? [] : [stop]), ...(url === undefined ? [] : [Link({ href: url, label: url })])]
    const row = Box({ flexDirection: 'row', columnGap: 2, children })
    return Box({ flexDirection: 'column', children: [row, await next(e)] })
  })
}
