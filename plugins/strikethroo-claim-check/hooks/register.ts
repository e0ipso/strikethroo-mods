/**
 * strikethroo-claim-check: when Claude's last answer of a turn claims the
 * work is done, fixed or passing, and no Bash command of the turn looked like
 * a test or build run, it adds one line under the answer. Nothing else: it
 * reads no files, blocks nothing, and never says the work is verified.
 */
import type { On, PluginOptions } from 'claude-code'

import type { ClaimConfig } from './claims.ts'
import { configOf, hasCompletionClaim, NOTE, ranVerification } from './claims.ts'

let config: ClaimConfig = configOf({})
/**
 * The Bash commands since the main conversation's last turn ended, subagents'
 * included. It resets at the end of a main turn, because turn.start can't tell
 * a subagent's turn from the main one.
 */
let commands: string[] = []

export function register(on: On, options: PluginOptions): void {
  config = configOf(options)

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const result = await next(e)
    if (!('deny' in result) && e.tool === 'Bash') commands.push(e.command)
    return result
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId !== undefined) return result
    const ran = commands
    commands = []
    if (e.isAborted || (Boolean(result.text) && result.text !== e.answer) || ranVerification(ran, config.verifyPatterns)) return result
    const last = (await $.session.messages()).findLast(message => message.role === 'assistant')
    return last !== undefined && hasCompletionClaim(last.text) ? { ...result, text: NOTE } : result
  })
}
