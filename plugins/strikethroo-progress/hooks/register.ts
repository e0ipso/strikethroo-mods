/**
 * strikethroo-progress: the active Strikethroo plan's progress, drawn in the
 * band above the prompt and in a pane, and printed by /strikethroo-status.
 *
 * Read-only: it lists and reads files under .ai/strikethroo/ and writes
 * nothing. It refreshes after a tool call that touches .ai/strikethroo/ and on
 * a timer that compares directory listings, and redraws only on a change.
 */
import type { EngineInterface, On, PluginOptions } from 'claude-code'

import type { Plan, WorkspaceFs, WorkspaceLookup } from './lib/strikethroo/index.ts'
import { findWorkspace, listActivePlans, pickActivePlan, planSignature } from './lib/strikethroo/index.ts'
import type { ProgressConfig, Row, Tone } from './progress.ts'
import { bandLine, configOf, paneRows } from './progress.ts'

const PANE = 'strikethroo-progress'
const COMMAND = 'strikethroo-status'
const TOUCHES_WORKSPACE = /\.ai[\\/]+strikethroo/

const STYLES: Readonly<Record<Tone, { bold?: true; dimColor?: true; color?: 'error' }>> = {
  heading: { bold: true },
  done: { dimColor: true },
  active: { bold: true },
  failed: { color: 'error', bold: true },
  plain: {},
  problem: { color: 'error' },
}

let cwd: string | undefined
let lookup: WorkspaceLookup = { kind: 'none' }
let plans: Plan[] = []
let signature: string | undefined
let shown = ''
let isRefreshing = false
let hasWarned = false
let hasOpened = false

/** `$.fs` in the shape the shared reader takes. */
const fsOf = ($: EngineInterface): WorkspaceFs => ({
  exists: path => $.fs.exists(path),
  read: path => $.fs.read(path),
  list: path => $.fs.list(path),
})

/** What /strikethroo-status prints when there is no plan to show. */
const emptyText = (): string => {
  if (lookup.kind === 'unsupported') return `${lookup.message}. This mod reads workspace schema 4 only.`
  if (lookup.kind === 'none') return `No Strikethroo workspace found from ${cwd ?? 'this directory'}.`
  return `No active plans in ${lookup.root}/plans.`
}

/** What the panes and commands read; `register` sets it from the options. */
let config: ProgressConfig = configOf({})
const showsBand = (): boolean => config.display === 'band' || config.display === 'both'
const showsPane = (): boolean => config.display === 'pane' || config.display === 'both'
const active = (): Plan | undefined => pickActivePlan(plans, config.pinPlan)

const statusText = (): string => {
  const plan = active()
  return plan === undefined ? emptyText() : paneRows(plan).map(row => row.text).join('\n')
}

/**
 * Re-reads the plans when their files changed. `isRefind` looks for the
 * workspace again first; the timer never does, so a session outside any
 * workspace costs nothing between tool calls.
 */
async function refresh($: EngineInterface, isRefind: boolean): Promise<void> {
  if (isRefreshing && !isRefind) return
  isRefreshing = true
  try {
    if (isRefind) lookup = await findWorkspace(fsOf($), cwd ?? (await $.session.cwd()))
    if (lookup.kind === 'unsupported' && !hasWarned) {
      hasWarned = true
      $.ui.log(`${lookup.message}; showing nothing. This mod reads workspace schema 4 only.`)
    }
    const next = lookup.kind === 'found' ? await planSignature(fsOf($), lookup.root) : undefined
    if (next !== signature || isRefind) {
      signature = next
      plans = lookup.kind === 'found' ? await listActivePlans(fsOf($), lookup.root) : []
    }
    const text = statusText()
    if (text === shown) return
    shown = text
    $.ui.invalidate('ui.render')
    if (showsPane() && !hasOpened && active() !== undefined) {
      hasOpened = true
      await $.ui.open({ id: PANE, title: 'Strikethroo' })
    }
  } finally {
    isRefreshing = false
  }
}

export function register(on: On, options: PluginOptions): void {
  config = configOf(options)

  on('session.start', async ($, e, next) => {
    cwd = e.cwd
    if (config.display !== 'off') {
      await refresh($, true)
      $.clock.every(config.refreshSeconds * 1000, () => void refresh($, false).catch(() => undefined))
    }
    try {
      await $.command.register({
        name: COMMAND,
        description: 'Show the active Strikethroo plan, phase by phase',
        immediate: true,
      })
    } catch (error) {
      $.ui.log(`/${COMMAND} is unavailable: ${String(error)}`)
    }
    return next(e)
  })

  if (config.display !== 'off') {
    on('tool.call', async ($, e, next) => {
      const result = await next(e)
      if (TOUCHES_WORKSPACE.test(JSON.stringify(e))) void refresh($, true).catch(() => undefined)
      return result
    })
  }

  on('command.run', { command: COMMAND }, async $ => {
    await refresh($, true)
    if (showsPane() && active() !== undefined) await $.ui.open({ id: PANE, title: 'Strikethroo' })
    return { text: statusText() }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const plan = showsBand() && !e.props.hasSurvey ? active() : undefined
    if (plan === undefined) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const line = Text({ dimColor: true, wrap: 'truncate-end', children: [bandLine(plan)] })
    return Box({ flexDirection: 'column', children: [line, await next(e)] })
  })

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const plan = active()
    const rows: Row[] = plan === undefined ? [{ text: emptyText(), tone: 'plain' }] : paneRows(plan)
    return Box({
      flexDirection: 'column',
      children: rows.map(row => Text({ ...STYLES[row.tone], wrap: 'truncate-end', children: [row.text] })),
    })
  })
}
