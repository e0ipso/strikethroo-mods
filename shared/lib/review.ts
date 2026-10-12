/**
 * A minimal scanner for the subset of `self-review-v2` a mod shows:
 * `<review>`, `<file path>`, and each `<comment>` with `new-line-start`,
 * `new-line-end`, `severity`, `confidence`, `<body>` and `<category>`.
 *
 * The input is untrusted: `review.xml` may be uncertified, truncated or
 * hostile. The scanner caps every size, refuses DTDs and entity declarations,
 * skips elements it doesn't know, and strips control and bidi characters, so
 * the result is safe to draw as plain `Text`. It never decides anything:
 * certification belongs to Strikethroo's compiled gate.
 */

export const SEVERITIES = ['critical', 'major', 'minor', 'info'] as const
export const CONFIDENCES = ['high', 'medium', 'low'] as const

export type Severity = (typeof SEVERITIES)[number]
export type Confidence = (typeof CONFIDENCES)[number]

export type Finding = {
  path: string
  /** `new-line-start` and `new-line-end`; undefined for a file-level comment. */
  lines: { start: number; end: number } | undefined
  severity: Severity | undefined
  confidence: Confidence | undefined
  category: string | undefined
  body: string
}

export type ReviewFindings = {
  /** Files with at least one finding, in document order. */
  files: { path: string; findings: Finding[] }[]
  count: number
  /** What was skipped or cut, one line each. */
  problems: string[]
}

export const REVIEW_LIMITS = { input: 1_048_576, findings: 200, body: 4_000, category: 64, path: 1_024 } as const

const ENTITIES: Readonly<Record<string, string>> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }

const decode = (text: string): string =>
  text.replace(/&(lt|gt|amp|quot|apos|#\d{1,7}|#x[0-9a-fA-F]{1,6});/g, (whole, name: string) => {
    if (!name.startsWith('#')) return ENTITIES[name] ?? whole
    const code = name[1] === 'x' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10)
    return code > 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff) ? String.fromCodePoint(code) : '�'
  })

/** Cut to `max` characters, without control characters or bidi overrides. */
const clean = (text: string, max: number, isOneLine = false): string => {
  const kept = text.replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩]/g, '').trim()
  const line = isOneLine ? kept.replace(/\s+/g, ' ') : kept
  return line.length > max ? line.slice(0, max - 1) + '…' : line
}

const localName = (name: string): string => name.slice(name.indexOf(':') + 1)

const attributesOf = (tag: string): Map<string, string> => {
  const attributes = new Map<string, string>()
  for (const match of tag.matchAll(/([A-Za-z_][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    attributes.set(localName(match[1] ?? ''), decode(match[2] ?? match[3] ?? ''))
  }
  return attributes
}

/** The index of the `>` that ends the tag opened at `start`, skipping quoted values. */
const tagEnd = (xml: string, start: number): number => {
  let quote = ''
  for (let i = start + 1; i < xml.length; i++) {
    const char = xml[i]
    if (quote !== '') quote = char === quote ? '' : quote
    else if (char === '"' || char === "'") quote = char
    else if (char === '>') return i
  }
  return -1
}

const lineOf = (value: string | undefined): number | undefined =>
  value !== undefined && /^\s*\d{1,9}\s*$/.test(value) && Number(value) > 0 ? Number(value) : undefined

const oneOf = <T extends string>(values: readonly T[], value: string | undefined): T | undefined =>
  values.find(item => item === value)

type OpenComment = { attributes: Map<string, string>; body: string | undefined; category: string | undefined }

export const parseReviewFindings = (xmlText: string): ReviewFindings => {
  const result: ReviewFindings = { files: [], count: 0, problems: [] }
  const xml = xmlText.slice(0, REVIEW_LIMITS.input)
  if (xmlText.length > REVIEW_LIMITS.input) result.problems.push('review.xml is over 1 MiB; only the first 1 MiB was read')
  if (/<!(DOCTYPE|ENTITY|ELEMENT|ATTLIST|NOTATION)\b/i.test(xml)) {
    result.problems.push('review.xml declares a DTD or an entity, so it was not read')
    return result
  }

  const stack: string[] = []
  let file: { path: string; findings: Finding[] } | undefined
  let comment: OpenComment | undefined
  let field: 'body' | 'category' | undefined
  let text = ''
  let isFull = false
  let hasRoot = false

  const open = (name: string, tag: string): void => {
    const parent = stack.at(-1)
    if (name === 'review' && stack.length === 0) hasRoot = true
    else if (name === 'file' && parent === 'review' && stack.length === 1) {
      const path = clean(attributesOf(tag).get('path') ?? '', REVIEW_LIMITS.path, true)
      file = path === '' ? undefined : { path, findings: [] }
      if (path === '') result.problems.push('a <file> without a path was skipped')
    } else if (name === 'comment' && parent === 'file' && file !== undefined) {
      comment = { attributes: attributesOf(tag), body: undefined, category: undefined }
    } else if ((name === 'body' || name === 'category') && parent === 'comment' && comment !== undefined) {
      field = name
      text = ''
    }
    stack.push(name)
  }

  const close = (name: string): void => {
    const at = stack.lastIndexOf(name)
    if (at === -1) return
    stack.length = at
    if ((name === 'body' || name === 'category') && field === name && comment !== undefined) {
      comment[name] = name === 'body' ? clean(text, REVIEW_LIMITS.body) : clean(text, REVIEW_LIMITS.category, true)
      field = undefined
    } else if (name === 'comment' && comment !== undefined && file !== undefined) {
      addFinding(file, comment)
      comment = undefined
    } else if (name === 'file' && file !== undefined) {
      if (file.findings.length > 0) result.files.push(file)
      file = undefined
    }
  }

  const addFinding = (owner: { path: string; findings: Finding[] }, pending: OpenComment): void => {
    if (pending.body === undefined || pending.body === '') {
      result.problems.push(`a comment on ${owner.path} has no body and was skipped`)
      return
    }
    if (result.count >= REVIEW_LIMITS.findings) {
      if (!isFull) result.problems.push(`only the first ${REVIEW_LIMITS.findings} findings are shown`)
      isFull = true
      return
    }
    const start = lineOf(pending.attributes.get('new-line-start'))
    const end = lineOf(pending.attributes.get('new-line-end')) ?? start
    owner.findings.push({
      path: owner.path,
      lines: start === undefined || end === undefined ? undefined : { start, end: Math.max(start, end) },
      severity: oneOf(SEVERITIES, pending.attributes.get('severity')),
      confidence: oneOf(CONFIDENCES, pending.attributes.get('confidence')),
      category: pending.category === '' ? undefined : pending.category,
      body: pending.body,
    })
    result.count++
  }

  let index = 0
  while (index < xml.length) {
    const lt = xml.indexOf('<', index)
    if (lt === -1) break
    if (field !== undefined) text += decode(xml.slice(index, lt))
    if (xml.startsWith('<!--', lt)) {
      const end = xml.indexOf('-->', lt + 4)
      index = end === -1 ? xml.length : end + 3
    } else if (xml.startsWith('<![CDATA[', lt)) {
      const end = xml.indexOf(']]>', lt + 9)
      if (field !== undefined) text += xml.slice(lt + 9, end === -1 ? xml.length : end)
      index = end === -1 ? xml.length : end + 3
    } else {
      const gt = tagEnd(xml, lt)
      if (gt === -1) {
        result.problems.push('review.xml ends inside a tag')
        stack.length = 0
        break
      }
      const tag = xml.slice(lt + 1, gt)
      index = gt + 1
      if (tag.startsWith('?') || tag.startsWith('!')) continue
      const name = localName(/^\/?\s*([^\s/>]+)/.exec(tag)?.[1] ?? '')
      if (tag.startsWith('/')) close(name)
      else {
        open(name, tag)
        if (tag.endsWith('/')) close(name)
      }
    }
  }

  if (file !== undefined && file.findings.length > 0) result.files.push(file)
  if (!hasRoot) result.problems.push('no <review> element found')
  else if (stack.length > 0) result.problems.push('review.xml ended before every element was closed')
  return result
}
