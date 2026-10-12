/**
 * strikethroo-review-findings: a pane listing the findings in a plan's
 * review/review.xml, opened when that file appears or changes, and by
 * /strikethroo-review.
 *
 * Read-only. review.xml is untrusted: the shared scanner caps and cleans it,
 * and the pane draws it as plain Text. Buttons copy a location or put a draft
 * in the prompt box; they never submit anything.
 */
import type { EngineInterface, On } from 'claude-code'

import type { ReviewFindings, WorkspaceFs, WorkspaceLookup } from './lib/strikethroo/index.ts'
import { findWorkspace, listReviewFiles, parseReviewFindings } from './lib/strikethroo/index.ts'
import { copyTextOf, draftOf, HEADER, labelsOf, locationOf } from './findings.ts'

const PANE = 'strikethroo-review-findings'
const COMMAND = 'strikethroo-review'
const POLL_MS = 3000
const TOUCHES_WORKSPACE = /\.ai[\\/]+strikethroo/

let cwd: string | undefined
let lookup: WorkspaceLookup = { kind: 'none' }
/** The review files as last listed; undefined before the first listing. */
let signature: string | undefined
let review: { plan: string; findings: ReviewFindings } | undefined
let hasWarned = false

const fsOf = ($: EngineInterface): WorkspaceFs => ({
  exists: path => $.fs.exists(path),
  read: path => $.fs.read(path),
  list: path => $.fs.list(path),
})

/**
 * Lists the review files and re-reads the newest when the listing changed.
 * Resolves true when a review appeared or changed after the first listing.
 */
async function refresh($: EngineInterface, isRefind: boolean): Promise<boolean> {
  if (isRefind) lookup = await findWorkspace(fsOf($), cwd ?? (await $.session.cwd()))
  if (lookup.kind === 'unsupported' && !hasWarned) {
    hasWarned = true
    $.ui.log(`${lookup.message}; showing nothing. This mod reads workspace schema 4 only.`)
  }
  if (lookup.kind !== 'found') return false
  const files = await listReviewFiles(fsOf($), lookup.root)
  const next = files.map(file => `${file.path}:${file.mtimeMs}`).join('\n')
  if (next === signature) return false
  const isFirst = signature === undefined
  signature = next
  const newest = files[0]
  review = newest === undefined ? undefined : { plan: newest.plan, findings: parseReviewFindings(await $.fs.read(newest.path).catch(() => '')) }
  $.ui.invalidate('ui.render')
  return !isFirst && newest !== undefined
}

/** Refreshes, and opens the pane when a review appeared or changed. */
async function watch($: EngineInterface, isRefind: boolean): Promise<void> {
  if (!(await refresh($, isRefind))) return
  const opened = await $.ui.open({ id: PANE, title: 'Review findings' })
  if (!opened.isPlaced) $.ui.toast(`Review findings are ready. Run /${COMMAND} to see them.`)
}

export function register(on: On): void {
  on('session.start', async ($, e, next) => {
    cwd = e.cwd
    await refresh($, true)
    $.clock.every(POLL_MS, () => void watch($, false).catch(() => undefined))
    try {
      await $.command.register({ name: COMMAND, description: 'Show the findings in the latest Strikethroo review.xml', immediate: true })
    } catch (error) {
      $.ui.log(`/${COMMAND} is unavailable: ${String(error)}`)
    }
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const result = await next(e)
    if (TOUCHES_WORKSPACE.test(JSON.stringify(e))) void watch($, true).catch(() => undefined)
    return result
  })

  on('command.run', { command: COMMAND }, async $ => {
    await refresh($, true)
    if (review === undefined) return { text: 'No review.xml under .ai/strikethroo/plans/*/review/.' }
    await $.ui.open({ id: PANE, title: 'Review findings', focus: true, closeOnEscape: true })
    return { text: `${review.findings.count} finding(s) from ${review.plan}/review/review.xml.` }
  })

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE) return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    if (review === undefined) return Text({ children: ['No review.xml under .ai/strikethroo/plans/*/review/.'] })

    const rows = [
      Text({ bold: true, children: [`Review findings · ${review.plan} · ${review.findings.count} finding(s)`] }),
      ...HEADER.map(line => Text({ dimColor: true, children: [line] })),
      ...review.findings.problems.map(problem => Text({ color: 'error', children: [problem] })),
    ]
    let index = 0
    for (const file of review.findings.files) {
      rows.push(Text({ children: [' '] }), Text({ bold: true, children: [file.path] }))
      for (const finding of file.findings) {
        const at = index++
        rows.push(
          Box({
            key: `finding-${at}`,
            flexDirection: 'column',
            paddingLeft: 2,
            children: [
              Text({ children: [`${locationOf(finding)}  ${labelsOf(finding)}`] }),
              Text({ dimColor: true, children: [finding.body] }),
              Box({
                flexDirection: 'row',
                columnGap: 2,
                children: [
                  Button({
                    key: `copy-${at}`,
                    label: 'Copy path:line',
                    ...(at === 0 ? { autoFocus: true as const } : {}),
                    onPress: async press => {
                      const copied = await $.ui.copy({ text: copyTextOf(finding), surface: press.surface })
                      $.ui.toast(copied.isCopied ? `Copied ${copyTextOf(finding)}` : `Could not copy: ${copied.reason}`)
                    },
                  }),
                  Button({
                    key: `draft-${at}`,
                    label: 'Draft prompt',
                    onPress: async () => {
                      const filled = await $.prompt.fill({ text: draftOf(finding), mode: 'append' })
                      if (!filled.isFilled) $.ui.toast('Could not fill the prompt box here.')
                    },
                  }),
                ],
              }),
            ],
          }),
        )
      }
    }
    return Box({ flexDirection: 'column', children: rows })
  })
}
