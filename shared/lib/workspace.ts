/**
 * Reads a Strikethroo v4 workspace through a file system the caller supplies,
 * so the same code runs under a mod's `$.fs` and under a test's in-memory map.
 * Nothing here writes, and nothing throws: a file that can't be read becomes a
 * problem line on its plan or task.
 */
import type { BlueprintPhase, TaskStatus } from './parse.ts'
import { parseBlueprint, parseTaskFrontmatter, parseTitle } from './parse.ts'

/** The workspace schema these mods read (`workspaceSchemaVersion`). */
export const SUPPORTED_SCHEMA_VERSION = 4

export type FsEntryLike = {
  readonly name: string
  readonly kind: 'file' | 'dir' | 'other'
  /** A regular file's modification time; 0 for every other kind. */
  readonly mtimeMs: number
}

/** The three reads the reader needs, shaped like `$.fs`. */
export type WorkspaceFs = {
  readonly exists: (path: string) => Promise<boolean>
  readonly read: (path: string) => Promise<string>
  readonly list: (path: string) => Promise<readonly FsEntryLike[]>
}

export type WorkspaceLookup =
  /** `root` is the `.ai/strikethroo` directory, `project` the one holding `.ai/`. */
  | { kind: 'found'; root: string; project: string }
  /** A workspace these mods don't read; `message` is the line to show once. */
  | { kind: 'unsupported'; root: string; message: string }
  | { kind: 'none' }

export type Task = {
  /** File name, such as `05--write-tests.md`. */
  file: string
  path: string
  /** The frontmatter `id`, or the file name's number when that is unreadable. */
  id: number
  title: string
  status: TaskStatus | undefined
  dependencies: number[]
  group: string | undefined
  mtimeMs: number
  text: string
  problems: string[]
}

export type Plan = {
  /** Directory name, `<id>--<slug>`. */
  name: string
  id: number
  slug: string
  dir: string
  title: string
  phases: BlueprintPhase[] | undefined
  tasks: Task[]
  problems: string[]
  /** The newest task file's modification time, or the plan file's. */
  mtimeMs: number
}

const PLAN_DIR_RE = /^(\d+)--([a-z0-9-]+)$/
const TASK_FILE_RE = /^(\d+)--.+\.md$/
const MAX_PLANS = 200
const MAX_TASKS = 500

const join = (dir: string, name: string): string =>
  dir.endsWith('/') || dir.endsWith('\\') ? dir + name : `${dir}/${name}`

/** The parent directory, or undefined at a file system root. */
const parentOf = (dir: string): string | undefined => {
  const cut = Math.max(dir.lastIndexOf('/'), dir.lastIndexOf('\\'))
  if (cut === -1) return undefined
  const up = /^[A-Za-z]:$/.test(dir.slice(0, cut)) || cut === 0 ? dir.slice(0, cut + 1) : dir.slice(0, cut)
  return up === dir ? undefined : up
}

const listOr = async (fs: WorkspaceFs, path: string): Promise<readonly FsEntryLike[]> =>
  fs.list(path).catch(() => [])

const schemaMessage = (metadata: unknown): string | undefined => {
  if (typeof metadata !== 'object' || metadata === null) return 'unreadable .init-metadata.json'
  const version = (metadata as { workspaceSchemaVersion?: unknown }).workspaceSchemaVersion ?? 1
  return version === SUPPORTED_SCHEMA_VERSION ? undefined : `unsupported workspace version ${String(version)}`
}

/**
 * Walks up from `cwd` to the first `.ai/strikethroo/.init-metadata.json` and
 * checks its `workspaceSchemaVersion`, which is 1 when absent.
 */
export const findWorkspace = async (fs: WorkspaceFs, cwd: string): Promise<WorkspaceLookup> => {
  for (let dir: string | undefined = cwd; dir !== undefined; dir = parentOf(dir)) {
    const root = join(dir, '.ai/strikethroo')
    const metadataPath = join(root, '.init-metadata.json')
    if (!(await fs.exists(metadataPath).catch(() => false))) continue
    const metadata: unknown = await fs.read(metadataPath).then(text => JSON.parse(text) as unknown).catch(() => undefined)
    const message = schemaMessage(metadata)
    return message === undefined ? { kind: 'found', root, project: dir } : { kind: 'unsupported', root, message }
  }
  return { kind: 'none' }
}

const readTask = async (fs: WorkspaceFs, dir: string, entry: FsEntryLike, number: number): Promise<Task> => {
  const path = join(dir, entry.name)
  const text = await fs.read(path).catch(() => undefined)
  const frontmatter = parseTaskFrontmatter(text ?? '')
  return {
    file: entry.name,
    path,
    id: frontmatter.id ?? number,
    title: parseTitle(text ?? '') ?? entry.name.replace(/\.md$/, ''),
    status: frontmatter.status,
    dependencies: frontmatter.dependencies,
    group: frontmatter.group,
    mtimeMs: entry.mtimeMs,
    text: text ?? '',
    problems: text === undefined ? ['could not be read'] : frontmatter.problems,
  }
}

const readPlan = async (fs: WorkspaceFs, plansDir: string, name: string, id: number, slug: string): Promise<Plan> => {
  const dir = join(plansDir, name)
  const planFile = `plan-${name}.md`
  const entries = await listOr(fs, dir)
  const text = await fs.read(join(dir, planFile)).catch(() => undefined)
  const taskEntries = (await listOr(fs, join(dir, 'tasks')))
    .filter(entry => entry.kind === 'file' && TASK_FILE_RE.test(entry.name))
    .map(entry => ({ entry, number: Number(TASK_FILE_RE.exec(entry.name)?.[1]) }))
    .sort((a, b) => a.number - b.number)
    .slice(0, MAX_TASKS)
  const tasks = await Promise.all(taskEntries.map(({ entry, number }) => readTask(fs, join(dir, 'tasks'), entry, number)))
  const planMtime = entries.find(entry => entry.name === planFile)?.mtimeMs ?? 0
  return {
    name,
    id,
    slug,
    dir,
    title: (text === undefined ? undefined : parseTitle(text)) ?? slug,
    phases: text === undefined ? undefined : parseBlueprint(text),
    tasks,
    problems: text === undefined ? [`${planFile} could not be read`] : [],
    mtimeMs: Math.max(planMtime, ...tasks.map(task => task.mtimeMs)),
  }
}

const planDirsOf = async (fs: WorkspaceFs, plansDir: string) =>
  (await listOr(fs, plansDir))
    .flatMap(entry => {
      const match = entry.kind === 'dir' ? PLAN_DIR_RE.exec(entry.name) : null
      return match === null ? [] : [{ name: entry.name, id: Number(match[1]), slug: match[2] ?? '' }]
    })
    .sort((a, b) => a.id - b.id)
    .slice(0, MAX_PLANS)

/** The plans under `plans/` (never `archive/`), sorted by id. */
export const listActivePlans = async (fs: WorkspaceFs, root: string): Promise<Plan[]> => {
  const plansDir = join(root, 'plans')
  const dirs = await planDirsOf(fs, plansDir)
  return Promise.all(dirs.map(({ name, id, slug }) => readPlan(fs, plansDir, name, id, slug)))
}

/**
 * A string that changes when a plan directory, plan file or task file under
 * `plans/` appears, disappears or is modified. It costs directory listings
 * only, so a timer can call it often and re-read the plans only on a change.
 */
export const planSignature = async (fs: WorkspaceFs, root: string): Promise<string> => {
  const plansDir = join(root, 'plans')
  const parts: string[] = []
  for (const { name } of await planDirsOf(fs, plansDir)) {
    const dir = join(plansDir, name)
    for (const entry of await listOr(fs, dir)) parts.push(`${name}/${entry.name}:${entry.mtimeMs}`)
    for (const entry of await listOr(fs, join(dir, 'tasks'))) parts.push(`${name}/tasks/${entry.name}:${entry.mtimeMs}`)
  }
  return parts.join('\n')
}

/**
 * The plan to show: the pinned one when it exists, else the plan with an
 * `in-progress` task, else the plan whose task files changed most recently.
 * `pin` is a plan id (`42`) or a directory name (`42--slug`).
 */
export const pickActivePlan = (plans: readonly Plan[], pin?: string): Plan | undefined => {
  const pinned = pin === undefined ? undefined : plans.find(plan => plan.name === pin || String(plan.id) === pin.replace(/^0+(?=\d)/, ''))
  if (pinned !== undefined) return pinned
  const working = plans.filter(plan => plan.tasks.some(task => task.status === 'in-progress'))
  const pool = working.length > 0 ? working : plans
  return pool.reduce<Plan | undefined>((best, plan) => (best === undefined || plan.mtimeMs > best.mtimeMs ? plan : best), undefined)
}
