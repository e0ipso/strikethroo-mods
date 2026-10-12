/**
 * The text strikethroo-review-findings shows and copies for a finding. No
 * mods API here, so the tests call these directly.
 */
import type { Finding } from './lib/strikethroo/index.ts'

/** The pane's header: what the labels are, and where certification lives. */
export const HEADER = [
  'Severity and confidence are the reviewer\'s advisory labels. Nothing acts on them.',
  'Whether the review was certified is in the plan\'s execution summary, not here.',
] as const

/** `path:42-44`, `path:42`, or `path` for a file-level finding. */
export const locationOf = (finding: Finding): string => {
  if (finding.lines === undefined) return finding.path
  const { start, end } = finding.lines
  return `${finding.path}:${start === end ? start : `${start}-${end}`}`
}

/** What the copy button puts on the clipboard: `path:line`, or `path`. */
export const copyTextOf = (finding: Finding): string =>
  finding.lines === undefined ? finding.path : `${finding.path}:${finding.lines.start}`

/** `major · high confidence · bug`, leaving out what the reviewer left out. */
export const labelsOf = (finding: Finding): string =>
  [finding.severity, finding.confidence === undefined ? undefined : `${finding.confidence} confidence`, finding.category]
    .filter(label => label !== undefined)
    .join(' · ')

/** The draft the "Draft prompt" button puts in the prompt box. It is never sent. */
export const draftOf = (finding: Finding): string => {
  const labels = labelsOf(finding)
  return [
    `A Strikethroo review finding on ${locationOf(finding)}${labels === '' ? '' : ` (${labels}; advisory labels)`}:`,
    '',
    finding.body,
    '',
    'Check whether this finding holds before changing anything.',
  ].join('\n')
}
