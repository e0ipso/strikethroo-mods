import type { On, TurnCompleteInput } from 'claude-code'
import { describe, expect, test } from 'claude-code/testing'

import { configOf, DEFAULT_PATTERNS, hasCompletionClaim, NOTE, ranVerification } from '../hooks/claims.ts'

/** Answers that claim completion. */
const CLAIMS = [
  'Done.',
  'All done!',
  'All tests pass.',
  'All the tests now pass, and the linter is clean.',
  'Tests are passing now.',
  'The bug is fixed.',
  'Fixed the null check in `parser.ts`.',
  "I've fixed the off-by-one error in the pager.",
  'We have resolved the merge conflict.',
  'The migration has been completed.',
  'Everything is complete and the build is passing.',
  "It's done. The endpoint returns 401 for a bad token.",
  'It should be fixed now.',
  'The tests should pass now.',
  'I changed two files.\n\nThe feature is complete.',
  '- Task 03 is done',
]

/** Answers that don't. */
const NOT_CLAIMS = [
  "I haven't run the tests yet.",
  'Is the build passing?',
  "Once you're done, run npm test.",
  'This is not fixed yet: the second case still fails.',
  "I couldn't get the tests to pass.",
  'Let me know when the deploy is done.',
  'Here is the plan for task 3.',
  'Completed tasks are dimmed in the pane.',
  '```\n// done: all tests pass\n```',
  'The function `isDone` returns true when every task is completed.',
  'If the tests pass, the change is complete.',
  'Complete the form and press Enter.',
  'Fixed-width fonts keep the columns aligned.',
  'This needs to be fixed in a later task.',
  '',
]

describe('hasCompletionClaim', () => {
  for (const text of CLAIMS) {
    test(`claims: ${JSON.stringify(text)}`, async () => {
      expect(hasCompletionClaim(text)).toBe(true)
    })
  }
  for (const text of NOT_CLAIMS) {
    test(`no claim: ${JSON.stringify(text)}`, async () => {
      expect(hasCompletionClaim(text)).toBe(false)
    })
  }
})

describe('ranVerification and configOf', () => {
  test('matches any pattern inside a command, ignoring case', async () => {
    expect(ranVerification(['git status', 'npm run Build'], DEFAULT_PATTERNS)).toBe(true)
    expect(ranVerification(['npx vitest run src'], DEFAULT_PATTERNS)).toBe(true)
    expect(ranVerification(['ls', 'git diff'], DEFAULT_PATTERNS)).toBe(false)
    expect(ranVerification([], DEFAULT_PATTERNS)).toBe(false)
  })

  test('narrows the options', async () => {
    expect(configOf({ verify_patterns: [' cargo check ', '', 'make'] })).toEqual({ verifyPatterns: ['cargo check', 'make'] })
    expect(configOf({ verify_patterns: 'test' })).toEqual({ verifyPatterns: DEFAULT_PATTERNS })
    expect(configOf({})).toEqual({ verifyPatterns: DEFAULT_PATTERNS })
  })
})

const turnEnd = (answer: string, overrides: Partial<TurnCompleteInput> = {}): TurnCompleteInput =>
  ({ turnId: 't1', answer, durationMs: 10, isAborted: false, ...overrides }) as TurnCompleteInput

/** Stubs the engine, whose own turn.complete result carries the answer as its text, as Claude Code 2.1.296's does. */
const session = (on: On, answer: string, otherLine?: string) => {
  on('tool.call', () => ({ result: 'ok' }))
  on('turn.complete', ($, e) => ({ text: otherLine ?? e.answer }))
  on('session.messages', () => ({
    value: [
      { role: 'user', text: 'fix it', toolUses: [] },
      { role: 'assistant', text: answer, toolUses: [] },
    ],
  }))
}

describe('register', () => {
  test('adds the note when the answer claims success and nothing was verified', async ($, on) => {
    session(on, 'Fixed the bug. All tests pass.')
    await $.tool.call({ tool: 'Bash', command: 'git diff' })
    expect(await $.turn.complete(turnEnd('Fixed the bug. All tests pass.'))).toEqual({ text: NOTE })
  })

  test('stays quiet when a test command ran this turn', async ($, on) => {
    session(on, 'Fixed the bug. All tests pass.')
    await $.tool.call({ tool: 'Bash', command: 'npm test -- --run' })
    expect(await $.turn.complete(turnEnd('Fixed the bug. All tests pass.'))).toEqual({ text: 'Fixed the bug. All tests pass.' })
  })

  test("forgets last turn's commands", async ($, on) => {
    session(on, 'Done.')
    await $.tool.call({ tool: 'Bash', command: 'npx tsc --noEmit' })
    expect(await $.turn.complete(turnEnd('Done.'))).toEqual({ text: 'Done.' })
    expect(await $.turn.complete(turnEnd('Done.', { turnId: 't2' }))).toEqual({ text: NOTE })
  })

  test('stays quiet without a claim, for a subagent, and for an interrupted turn', async ($, on) => {
    session(on, 'I could not reproduce the failure.')
    expect(await $.turn.complete(turnEnd('I could not reproduce the failure.'))).toEqual({ text: 'I could not reproduce the failure.' })
    expect(await $.turn.complete(turnEnd('Done.', { agentId: 'a1' }))).toEqual({ text: 'Done.' })
    expect(await $.turn.complete(turnEnd('Done.', { isAborted: true }))).toEqual({ text: 'Done.' })
  })

  test("keeps a line another mod put under the answer", async ($, on) => {
    session(on, 'Done.', 'Done in 12 seconds')
    expect(await $.turn.complete(turnEnd('Done.'))).toEqual({ text: 'Done in 12 seconds' })
  })

  test('honours verify_patterns', { options: { verify_patterns: ['cargo'] } }, async ($, on) => {
    session(on, 'The build is passing.')
    await $.tool.call({ tool: 'Bash', command: 'npm test' })
    expect(await $.turn.complete(turnEnd('The build is passing.'))).toEqual({ text: NOTE })
  })
})
