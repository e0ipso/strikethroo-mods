/**
 * strikethroo-scope-watch: a warning when Claude edits a file outside the
 * Output Artifacts of the one Strikethroo task in progress.
 *
 * It warns and never blocks: the hook passes the call on with next(e) before
 * it checks anything, and returns what next(e) gives, whatever the check
 * finds or if it fails. Each task and path pair is warned about once.
 * Read-only on .ai/strikethroo/.
 */
import type { EngineInterface, On, PluginOptions, ToolCallInput } from 'claude-code'

import type { Plan, WorkspaceFs, WorkspaceLookup } from './lib/strikethroo/index.ts'
import { findWorkspace, listActivePlans, planSignature } from './lib/strikethroo/index.ts'
import type { ScopeConfig } from './scope.ts'
import { configOf, scopeWarning } from './scope.ts'

const TOUCHES_WORKSPACE = /\.ai[\\/]+strikethroo/
/** MultiEdit is matched by pattern because Claude Code 2.1.296 has no such tool to type it against. */
const EDITING_TOOLS = /^(Write|Edit|MultiEdit|NotebookEdit)$/

let config: ScopeConfig = configOf({})
let cwd: string | undefined
let lookup: WorkspaceLookup = { kind: 'none' }
let plans: Plan[] = []
let signature: string | undefined
let hasWarnedVersion = false
const warned = new Set<string>()

const fsOf = ($: EngineInterface): WorkspaceFs => ({
  exists: path => $.fs.exists(path),
  read: path => $.fs.read(path),
  list: path => $.fs.list(path),
})

/** The path an editing tool writes to, or undefined. */
const filePathOf = (e: ToolCallInput): string | undefined => {
  if ('file_path' in e && typeof e.file_path === 'string') return e.file_path
  if ('notebook_path' in e && typeof e.notebook_path === 'string') return e.notebook_path
  return undefined
}

/** Looks the edit up against the in-progress task and warns when it is out of scope. */
async function check($: EngineInterface, filePath: string): Promise<void> {
  if (lookup.kind === 'none' && TOUCHES_WORKSPACE.test(filePath)) lookup = await findWorkspace(fsOf($), cwd ?? (await $.session.cwd()))
  if (lookup.kind === 'unsupported' && !hasWarnedVersion) {
    hasWarnedVersion = true
    $.ui.log(`${lookup.message}; not checking edits. This mod reads workspace schema 4 only.`)
  }
  if (lookup.kind !== 'found') return
  const next = await planSignature(fsOf($), lookup.root)
  if (next !== signature) {
    signature = next
    plans = await listActivePlans(fsOf($), lookup.root)
  }
  const warning = scopeWarning(plans, lookup.project, filePath)
  if (warning === undefined || warned.has(`${warning.task.path}\n${warning.path}`)) return
  warned.add(`${warning.task.path}\n${warning.path}`)
  if (config.mode === 'notice') $.ui.log(warning.text)
  else $.ui.toast(warning.text, { timeoutMs: 8000 })
}

export function register(on: On, options: PluginOptions): void {
  config = configOf(options)
  if (config.mode === 'off') return

  on('session.start', async ($, e, next) => {
    cwd = e.cwd
    lookup = await findWorkspace(fsOf($), e.cwd)
    return next(e)
  })

  on('tool.call', { tool: EDITING_TOOLS }, async ($, e, next) => {
    const filePath = filePathOf(e)
    const result = next(e)
    if (filePath !== undefined) await check($, filePath).catch(() => undefined)
    return result
  })
}
