/**
 * What strikethroo-progress shows, as plain data: its configuration, a plan's
 * summary, the band line, and the pane's rows. No mods API here, so the tests
 * call these directly.
 */
import type { PluginOptions } from 'claude-code'

import type { Plan, Task, TaskStatus } from './lib/strikethroo/index.ts'

export type Display = 'band' | 'pane' | 'both' | 'off'

/** The plugin's `userConfig`, as plugin.json declares it. */
export type ProgressConfig = {
  display: Display
  refreshSeconds: number
  pinPlan: string | undefined
}

const DISPLAYS: readonly Display[] = ['band', 'pane', 'both', 'off']

/** Narrows `register`'s options; anything unexpected falls back to the default. */
export const configOf = (options: PluginOptions): ProgressConfig => {
  const seconds = options.refresh_seconds
  const pin = options.pin_plan
  return {
    display: DISPLAYS.find(display => display === options.display) ?? 'band',
    refreshSeconds: typeof seconds === 'number' && Number.isFinite(seconds) ? Math.min(60, Math.max(1, seconds)) : 3,
    pinPlan: typeof pin === 'string' && pin.trim() !== '' ? pin.trim() : undefined,
  }
}

export type Summary = {
  done: number
  total: number
  /** The first phase with an unfinished task, or the last phase when all are done. */
  phase: { index: number; count: number } | undefined
  inProgress: Task[]
  failed: Task[]
}

export const summarize = (plan: Plan): Summary => {
  const byId = new Map(plan.tasks.map(task => [task.id, task]))
  const phases = plan.phases ?? []
  const current = phases.find(phase => phase.taskIds.some(id => byId.get(id)?.status !== 'completed')) ?? phases.at(-1)
  return {
    done: plan.tasks.filter(task => task.status === 'completed').length,
    total: plan.tasks.length,
    phase: current === undefined ? undefined : { index: current.index, count: phases.length },
    inProgress: plan.tasks.filter(task => task.status === 'in-progress'),
    failed: plan.tasks.filter(task => task.status === 'failed'),
  }
}

const number = (task: Task): string => String(task.id).padStart(2, '0')

const tasksPhrase = (tasks: readonly Task[], state: string): string =>
  `${tasks.length === 1 ? 'task' : 'tasks'} ${tasks.map(number).join(', ')} ${state}`

/** `Plan 42 · phase 2/4 · task 05 in progress · 7/12 done` */
export const bandLine = (plan: Plan): string => {
  const summary = summarize(plan)
  const parts = [`Plan ${plan.id}`]
  if (summary.phase !== undefined) parts.push(`phase ${summary.phase.index}/${summary.phase.count}`)
  if (summary.inProgress.length > 0) parts.push(tasksPhrase(summary.inProgress, 'in progress'))
  if (summary.failed.length > 0) parts.push(tasksPhrase(summary.failed, 'failed'))
  parts.push(`${summary.done}/${summary.total} done`)
  return parts.join(' · ')
}

export type Tone = 'heading' | 'done' | 'active' | 'failed' | 'plain' | 'problem'
export type Row = { text: string; tone: Tone }

const MARKS: Readonly<Record<TaskStatus, string>> = {
  completed: '✓',
  'in-progress': '▶',
  failed: '✗',
  pending: '○',
  'needs-clarification': '?',
}

const TONES: Readonly<Record<TaskStatus, Tone>> = {
  completed: 'done',
  'in-progress': 'active',
  failed: 'failed',
  pending: 'plain',
  'needs-clarification': 'plain',
}

const taskRow = (task: Task): Row => {
  const state = task.status === undefined ? 'unreadable status' : task.status === 'completed' ? '' : task.status.replace('-', ' ')
  const mark = task.status === undefined ? '!' : MARKS[task.status]
  return {
    text: `  ${mark} ${number(task)} ${task.title}${state === '' ? '' : ` · ${state}`}`,
    tone: task.status === undefined ? 'problem' : TONES[task.status],
  }
}

/** The pane's lines; `/strikethroo-status` prints the same lines as text. */
export const paneRows = (plan: Plan): Row[] => {
  const summary = summarize(plan)
  const phaseText = summary.phase === undefined ? '' : ` · phase ${summary.phase.index}/${summary.phase.count}`
  const rows: Row[] = [
    { text: `Plan ${plan.id}: ${plan.title.replace(/^Plan:\s*/i, '')}`, tone: 'heading' },
    { text: `${summary.done}/${summary.total} done${phaseText}`, tone: 'plain' },
  ]
  const placed = new Set<number>()
  for (const phase of plan.phases ?? []) {
    rows.push({ text: `Phase ${phase.index}${phase.name === undefined ? '' : `: ${phase.name}`}`, tone: 'heading' })
    for (const task of plan.tasks.filter(task => phase.taskIds.includes(task.id))) {
      placed.add(task.id)
      rows.push(taskRow(task))
    }
  }
  const unplaced = plan.tasks.filter(task => !placed.has(task.id))
  if (unplaced.length > 0) {
    if (plan.phases !== undefined) rows.push({ text: 'Not in the blueprint', tone: 'heading' })
    rows.push(...unplaced.map(taskRow))
  }
  const problems = [...plan.problems, ...plan.tasks.flatMap(task => task.problems.map(problem => `${task.file}: ${problem}`))]
  if (problems.length > 0) {
    rows.push({ text: 'Could not read', tone: 'heading' })
    rows.push(...problems.map(problem => ({ text: `  ${problem}`, tone: 'problem' as const })))
  }
  return rows
}
