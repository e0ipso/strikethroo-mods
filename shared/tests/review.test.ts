import { describe, expect, test } from 'claude-code/testing'

import { parseReviewFindings, REVIEW_LIMITS } from '../lib/index.ts'
import { FIXTURE_FILES } from './fixture-files.ts'

const review = (body: string): string => `<review xmlns="urn:self-review:v2" timestamp="2026-01-01T00:00:00Z">${body}</review>`
const comment = (inner: string, attributes = ''): string =>
  review(`<file path="a.ts" change-type="modified" viewed="true"><comment ${attributes}>${inner}</comment></file>`)

describe('parseReviewFindings', () => {
  test('reads the fixture, grouped by file', async () => {
    const parsed = parseReviewFindings(FIXTURE_FILES['review.xml'] ?? '')
    expect(parsed.count).toBe(4)
    expect(parsed.problems).toEqual([])
    expect(parsed.files.map(file => [file.path, file.findings.length])).toEqual([
      ['src/serve/workspace-model.ts', 2],
      ['src/serve/derivation.ts', 2],
    ])
    expect(parsed.files[0]?.findings[0]).toEqual({
      path: 'src/serve/workspace-model.ts',
      lines: { start: 42, end: 44 },
      severity: 'major',
      confidence: 'high',
      category: 'bug',
      body: '`getPlanSummaries` drops a plan whose `id` does not parse, so the list and the detail view disagree for that plan.',
    })
  })

  test('keeps markup in bodies as text', async () => {
    const [first, second] = parseReviewFindings(FIXTURE_FILES['review.xml'] ?? '').files.flatMap(file => file.findings).slice(1, 3)
    expect(first?.body).toContain('the <b>tags</b> here are text')
    expect(second?.body).toBe('The removed guard handled an empty `tasks/` directory & nothing replaces it. <script>alert(1)</script>')
  })

  test('treats a comment without new-line attributes as file-level', async () => {
    const findings = parseReviewFindings(FIXTURE_FILES['review.xml'] ?? '').files[1]?.findings ?? []
    expect(findings.map(finding => finding.lines)).toEqual([undefined, undefined])
    expect(findings[1]?.severity).toBe('critical')
  })

  test('refuses DTDs and entity declarations', async () => {
    const parsed = parseReviewFindings(`<!DOCTYPE review [<!ENTITY x "boom">]>${comment('<body>&x;</body><category>bug</category>')}`)
    expect(parsed.count).toBe(0)
    expect(parsed.problems).toEqual(['review.xml declares a DTD or an entity, so it was not read'])
  })

  test('skips unknown elements and values outside the enums', async () => {
    const parsed = parseReviewFindings(
      comment('<body>real</body><category>bug</category><suggestion><original-code>x</original-code></suggestion>', 'severity="blocker" confidence="high" new-line-start="0"'),
    )
    expect(parsed.files[0]?.findings[0]).toEqual({ path: 'a.ts', lines: undefined, severity: undefined, confidence: 'high', category: 'bug', body: 'real' })
  })

  test('strips control and bidi characters and caps the body', async () => {
    const parsed = parseReviewFindings(comment(`<body>\u001b[31mred‮${'x'.repeat(5000)}</body><category>a\nb</category>`))
    const finding = parsed.files[0]?.findings[0]
    expect(finding?.body.startsWith('[31mred' + 'x')).toBe(true)
    expect(finding?.body.length).toBe(REVIEW_LIMITS.body)
    expect(finding?.category).toBe('a b')
  })

  test('caps the number of findings', async () => {
    const many = '<comment><body>b</body><category>c</category></comment>'.repeat(REVIEW_LIMITS.findings + 5)
    const parsed = parseReviewFindings(review(`<file path="a.ts" change-type="added" viewed="false">${many}</file>`))
    expect(parsed.count).toBe(REVIEW_LIMITS.findings)
    expect(parsed.problems).toEqual([`only the first ${REVIEW_LIMITS.findings} findings are shown`])
  })

  test('reports a truncated document and keeps what it read', async () => {
    const whole = comment('<body>kept</body><category>bug</category>')
    const parsed = parseReviewFindings(whole.slice(0, whole.indexOf('</file>')) + '<comment new-line-start="3')
    expect(parsed.files[0]?.findings.map(finding => finding.body)).toEqual(['kept'])
    expect(parsed.problems).toEqual(['review.xml ends inside a tag'])
    expect(parseReviewFindings('not xml at all').problems).toEqual(['no <review> element found'])
  })
})
