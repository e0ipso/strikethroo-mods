/**
 * Completion-claim detection and the verification-command match, as plain
 * functions. A heuristic: it leans toward staying quiet, because a wrong note
 * under every answer would teach people to ignore it.
 */
import type { PluginOptions } from 'claude-code'

export const NOTE = 'No test or build command ran this turn.'

export const DEFAULT_PATTERNS: readonly string[] = ['test', 'vitest', 'jest', 'pytest', 'tsc', 'build', 'lint', 'validate']

/** The plugin's `userConfig`, as plugin.json declares it. */
export type ClaimConfig = { verifyPatterns: readonly string[] }

export const configOf = (options: PluginOptions): ClaimConfig => {
  const patterns = options.verify_patterns
  return {
    verifyPatterns: Array.isArray(patterns)
      ? patterns.filter((pattern): pattern is string => typeof pattern === 'string' && pattern.trim() !== '').map(pattern => pattern.trim())
      : DEFAULT_PATTERNS,
  }
}

/** Sentences that say the work is finished or verified. */
const CLAIMS = [
  /\ball (?:the )?tests? (?:now )?pass/,
  /\btests? (?:are |now |all )*(?:pass(?:es|ed|ing)?|green)\b/,
  /\b(?:is|are|was|were|now|it's|that's|everything's) (?:now |all )?(?:done|fixed|complete|completed|passing|resolved|working)\b/,
  /\b(?:i|we)(?:'ve| have)? (?:now )?(?:fixed|completed|finished|resolved)\b/,
  /\b(?:has|have) been (?:fixed|completed|resolved)\b/,
  /\bshould (?:now )?(?:be (?:fixed|done|resolved|working|passing|complete)|pass|work)\b/,
  /^(?:all )?(?:done|fixed|complete)[.!]*$/,
  /^(?:all done|fixed (?:the|a|an|it|this|that|both|all))\b/,
]

/** Words that make a sentence a negation, a condition or a question rather than a claim. */
const NOT_A_CLAIM = /\b(?:not|never|no longer|cannot|unable|if|once|when|until|before|whether)\b|n't\b|\?$/

const sentencesOf = (text: string): string[] =>
  text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`\n]*`/g, 'CODE')
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .split(/(?<=[.!?])\s+|\n+/)
    .map(sentence => sentence.replace(/^[\s>*#-]+/, '').trim())
    .filter(sentence => sentence !== '')

/** Whether the answer claims that something is done, fixed, complete or passing. */
export const hasCompletionClaim = (text: string): boolean =>
  sentencesOf(text).some(sentence => !NOT_A_CLAIM.test(sentence) && CLAIMS.some(claim => claim.test(sentence)))

/** Whether any command contains any pattern, ignoring case. */
export const ranVerification = (commands: readonly string[], patterns: readonly string[]): boolean =>
  commands.some(command => patterns.some(pattern => command.toLowerCase().includes(pattern.toLowerCase())))
