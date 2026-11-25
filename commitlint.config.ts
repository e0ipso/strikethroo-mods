/**
 * Conventional Commits, as semantic-release reads them, plus rules that block
 * AI attribution and private sift ticket IDs in commit messages.
 */
import type { UserConfig } from '@commitlint/types'

const aiTools = [
  'aider',
  'amp',
  'anthropic',
  'chatgpt',
  'claude',
  'codex',
  'copilot',
  'cursor',
  'devin',
  'gemini',
  'jules',
  'openai',
  'opencode',
  'qwen',
  'windsurf',
].join('|')

// Unicode-aware word boundaries, so "Ampère" or "OpenCoder" don't match.
const tool = `(?<![\\p{L}\\p{N}])(?:${aiTools})(?![\\p{L}\\p{N}])`

/** AI attribution lines a commit message may not carry. */
const AI_ATTRIBUTION: readonly RegExp[] = [
  // Any co-author, human or not.
  /^Co-authored-by:.*/im,
  // Made-with: Cursor, Assisted-by: Claude:claude-opus-5-5, ...
  new RegExp(`^(?:Assisted-by|Generated-by|Made-with|Signed-off-by):.*${tool}`, 'imu'),
  // Tool-specific trailers: Copilot-Session: ..., Amp-Thread: ...
  new RegExp(`^${tool}-[\\w-]+:`, 'imu'),
  // 🤖 Generated with [Claude Code](https://claude.com/claude-code)
  new RegExp(`(?:Generated|Made) (?:with|by|using)\\b.*${tool}`, 'iu'),
]

// Sift ticket IDs point at a private tracker. Built from parts so this file
// doesn't contain one.
const SIFT_TICKET_ID = new RegExp(['DASH', '-', '\\d{4}'].join(''))

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
        'no-sift-ticket-ids': parsed => {
          const found = SIFT_TICKET_ID.exec(parsed.raw ?? '')?.[0]
          return found === undefined ? [true, ''] : [false, `Commit message cites a sift ticket ID, which is private: "${found}"`]
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
    'no-sift-ticket-ids': [2, 'always'],
  },
}

export default config
