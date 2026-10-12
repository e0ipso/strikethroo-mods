/**
 * Pure parsers for the Markdown files of a Strikethroo v4 workspace. They take
 * text, never touch the file system, and never throw.
 */

/** The statuses a v4 task may carry (`TASK_STATUSES` in Strikethroo). */
export const TASK_STATUSES = ['pending', 'in-progress', 'completed', 'needs-clarification', 'failed'] as const

export type TaskStatus = (typeof TASK_STATUSES)[number]

export type TaskFrontmatter = {
  id: number | undefined
  status: TaskStatus | undefined
  dependencies: number[]
  group: string | undefined
  /** One line for each field that could not be read; empty for a clean file. */
  problems: string[]
}

/** One `### Phase N: Name` heading of an `## Execution Blueprint` section. */
export type BlueprintPhase = {
  /** 1-based position among the section's phase headings. */
  index: number
  name: string | undefined
  /** Task ids named by `-` or `*` bullets, in order of first mention. */
  taskIds: number[]
}

const FRONTMATTER_RE = /^---\s*\r?\n([\s\S]*?)\r?\n---/
const LIST_ITEM_RE = /^\s*-\s*(.*)$/
const INTEGER_RE = /^\d+$/

/** A scalar with its trailing `# comment` cut and its quotes removed. */
const scalarOf = (raw: string): string => {
  const value = raw.trim()
  const quote = value[0]
  if (quote === '"' || quote === "'") {
    const end = value.indexOf(quote, 1)
    return end === -1 ? value : value.slice(1, end)
  }
  const hash = value.indexOf('#')
  return (hash === -1 ? value : value.slice(0, hash)).trim()
}

const isTaskStatus = (value: string): value is TaskStatus =>
  (TASK_STATUSES as readonly string[]).includes(value)

/** Reads `id`, `status`, `dependencies` and `group` from a task file. */
export const parseTaskFrontmatter = (text: string): TaskFrontmatter => {
  const result: TaskFrontmatter = { id: undefined, status: undefined, dependencies: [], group: undefined, problems: [] }
  const block = FRONTMATTER_RE.exec(text)?.[1]
  if (block === undefined) {
    result.problems.push('no frontmatter')
    return result
  }

  const lines = block.split(/\r?\n/)
  const fields = new Map<string, { value: string; items: string[] }>()
  for (let i = 0; i < lines.length; i++) {
    const match = /^([A-Za-z_][\w-]*)\s*:(.*)$/.exec(lines[i] ?? '')
    if (match === null) continue
    const items: string[] = []
    while (LIST_ITEM_RE.test(lines[i + 1] ?? 'x')) items.push(scalarOf(LIST_ITEM_RE.exec(lines[++i] ?? '')?.[1] ?? ''))
    fields.set(match[1] ?? '', { value: match[2] ?? '', items })
  }

  const id = fields.get('id')
  const idValue = id === undefined ? '' : scalarOf(id.value)
  if (INTEGER_RE.test(idValue)) result.id = Number(idValue)
  else result.problems.push(id === undefined ? 'id is missing' : `id "${idValue}" is not a number`)

  const status = fields.get('status')
  const statusValue = status === undefined ? '' : scalarOf(status.value)
  if (isTaskStatus(statusValue)) result.status = statusValue
  else result.problems.push(status === undefined ? 'status is missing' : `status "${statusValue}" is not a v4 status`)

  const group = fields.get('group')
  if (group !== undefined && scalarOf(group.value) !== '') result.group = scalarOf(group.value)

  const dependencies = fields.get('dependencies')
  if (dependencies !== undefined) {
    const inline = scalarOf(dependencies.value)
    const items =
      inline.startsWith('[') && inline.endsWith(']')
        ? inline.slice(1, -1).split(',').map(scalarOf).filter(item => item !== '')
        : inline === '' ? dependencies.items : [inline]
    for (const item of items) {
      if (INTEGER_RE.test(item)) result.dependencies.push(Number(item))
      else result.problems.push(`dependency "${item}" is not a task id`)
    }
  }
  return result
}

/** The text after a `## <heading>` line, up to the next `##` heading. */
const sectionOf = (text: string, heading: RegExp): string | undefined => {
  const match = heading.exec(text)
  if (match === null) return undefined
  const after = text.slice(match.index + match[0].length)
  const next = after.search(/^##[ \t]/m)
  return next === -1 ? after : after.slice(0, next)
}

const PHASE_HEADING_RE = /^###[ \t]+(?:✅[ \t]*)?Phase[ \t]+(\d+)[ \t]*:?[ \t]*(.*?)[ \t]*$/gm
const TASK_REF_RE = /Task[ \t]+0*(\d+)/i

/**
 * The phases of a plan's `## Execution Blueprint` section, or undefined when
 * the section or its phase headings are absent. A port of Strikethroo's
 * `parseBlueprintPhases` (src/skill-scripts/shared/blueprint-parse.ts, v4.1.1).
 */
export const parseBlueprint = (planText: string): BlueprintPhase[] | undefined => {
  const blueprint = sectionOf(planText, /^##[ \t]+Execution Blueprint[ \t]*$/m)
  if (blueprint === undefined) return undefined

  const headings = [...blueprint.matchAll(PHASE_HEADING_RE)].map(match => ({
    start: match.index,
    end: match.index + match[0].length,
    name: (match[2] ?? '').trim(),
  }))
  if (headings.length === 0) return undefined

  return headings.map((heading, i) => {
    const taskIds: number[] = []
    for (const line of blueprint.slice(heading.end, headings[i + 1]?.start ?? blueprint.length).split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('-') && !trimmed.startsWith('*')) continue
      const ref = TASK_REF_RE.exec(trimmed)?.[1]
      if (ref !== undefined && !taskIds.includes(Number(ref))) taskIds.push(Number(ref))
    }
    return { index: i + 1, name: heading.name === '' ? undefined : heading.name, taskIds }
  })
}

/** The first `# ` heading after the frontmatter, or undefined. */
export const parseTitle = (text: string): string | undefined =>
  /^#[ \t]+(.+?)[ \t]*$/m.exec(text.replace(FRONTMATTER_RE, ''))?.[1]
