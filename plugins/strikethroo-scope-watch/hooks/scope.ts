/**
 * The scope rule, as plain functions: which edit earns a warning. No mods API
 * here, so the tests call these directly.
 */
import type { PluginOptions } from 'claude-code'

import type { Plan, Task } from './lib/strikethroo/index.ts'
import { matchesArtifact, parseOutputArtifacts } from './lib/strikethroo/index.ts'

export type Mode = 'toast' | 'notice' | 'off'

/** The plugin's `userConfig`, as plugin.json declares it. */
export type ScopeConfig = { mode: Mode }

const MODES: readonly Mode[] = ['toast', 'notice', 'off']

export const configOf = (options: PluginOptions): ScopeConfig => ({
  mode: MODES.find(mode => mode === options.mode) ?? 'toast',
})

/** `path` relative to `project` with `/` separators, or as given when it lies outside. */
export const relativeTo = (project: string, path: string): string => {
  const root = project.replace(/\\/g, '/').replace(/\/+$/, '')
  const file = path.replace(/\\/g, '/')
  return file.startsWith(root + '/') ? file.slice(root.length + 1) : file
}

export type ScopeWarning = { task: Task; path: string; text: string }

/**
 * A warning for an edit of `filePath`, or undefined. It warns only when
 * exactly one task is in progress, that task lists Output Artifacts, and the
 * path is outside them and outside `.ai/strikethroo/`.
 */
export const scopeWarning = (plans: readonly Plan[], project: string, filePath: string): ScopeWarning | undefined => {
  const working = plans.flatMap(plan => plan.tasks.filter(task => task.status === 'in-progress'))
  const task = working.length === 1 ? working[0] : undefined
  if (task === undefined) return undefined
  const artifacts = parseOutputArtifacts(task.text)
  const path = relativeTo(project, filePath)
  if (artifacts.length === 0 || path.startsWith('.ai/strikethroo/') || matchesArtifact(path, artifacts)) return undefined
  const number = String(task.id).padStart(2, '0')
  return { task, path, text: `Task ${number} (${task.title}) is in progress, and ${path} is not one of its Output Artifacts.` }
}
