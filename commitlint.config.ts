/**
 * Conventional Commits, as semantic-release reads them, plus the
 * `no-ai-generated` rule from Strikethroo's commitlint.config.js.
 *
 * Strikethroo's rule matches two exact strings. Claude Code now writes the
 * model's name into the trailer (`Co-Authored-By: Claude Opus 5.5 <…>`),
 * which those strings miss, so the rule here matches the pattern as well.
 */
import type { UserConfig } from '@commitlint/types'

/** AI attribution lines a commit message may not carry. */
const AI_ATTRIBUTION: readonly RegExp[] = [
  /🤖 Generated with \[Claude Code\]\([^)]*\)/,
  /^Co-Authored-By: Claude\b[^<\n]*<noreply@anthropic\.com>/im,
]

const config: UserConfig = {
  extends: ['@commitlint/config-conventional'],
  plugins: [
    {
      rules: {
        'no-ai-generated': parsed => {
          const message = parsed.raw ?? ''
          const found = AI_ATTRIBUTION.map(pattern => pattern.exec(message)?.[0]).find(match => match !== undefined)
          return found === undefined ? [true, ''] : [false, `Commit message contains forbidden AI-generated content: "${found}"`]
        },
      },
    },
  ],
  rules: {
    'type-case': [2, 'always', 'lower-case'],
    'type-empty': [2, 'never'],
    'subject-empty': [2, 'never'],
    'subject-full-stop': [2, 'never', '.'],
    'subject-max-length': [2, 'always', 72],
    'body-max-line-length': [2, 'always', 100],
    'footer-max-line-length': [2, 'always', 100],
    'type-enum': [2, 'always', ['feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'build', 'ci', 'chore', 'revert']],
    'no-ai-generated': [2, 'always'],
  },
}

export default config
