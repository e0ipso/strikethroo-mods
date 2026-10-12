import { describe, expect, test } from 'claude-code/testing'

import type { Plan } from '../lib/index.ts'
import { findWorkspace, listActivePlans, listReviewFiles, pickActivePlan, planSignature } from '../lib/index.ts'
import { memoryFs } from '../testing/memory-fs.ts'
import { FIXTURE_FILES } from './fixture-files.ts'

const PROJECT = '/work/project'
const ROOT = `${PROJECT}/.ai/strikethroo`
const ACTIVE = `${ROOT}/plans/83--workspace-data-layer`

/**
 * The fixture workspace mounted under a project, with archived plan 83 also
 * copied into plans/ and its task 03 marked in progress.
 */
const projectFiles = (): Record<string, string> => {
  const files: Record<string, string> = {}
  for (const [path, text] of Object.entries(FIXTURE_FILES)) {
    if (!path.startsWith('serve-workspace/')) continue
    const inWorkspace = path.slice('serve-workspace/'.length)
    files[`${ROOT}/${inWorkspace}`] = text
    if (inWorkspace.startsWith('archive/83--')) {
      const isThird = inWorkspace.includes('/03--')
      files[`${ROOT}/plans/${inWorkspace.slice('archive/'.length)}`] = isThird ? text.replace('status: "completed"', 'status: "in-progress"') : text
    }
  }
  return files
}

describe('findWorkspace', () => {
  test('walks up from a nested directory', async () => {
    expect(await findWorkspace(memoryFs(projectFiles()), `${PROJECT}/src/serve`)).toEqual({ kind: 'found', root: ROOT, project: PROJECT })
  })

  test('finds nothing outside a workspace', async () => {
    expect(await findWorkspace(memoryFs(projectFiles()), '/elsewhere/deep')).toEqual({ kind: 'none' })
  })

  test('reports other schema versions, with an absent one read as 1', async () => {
    const at = (metadata: string) => findWorkspace(memoryFs({ [`${ROOT}/.init-metadata.json`]: metadata }), PROJECT)
    expect(await at('{"workspaceSchemaVersion": 5}')).toEqual({ kind: 'unsupported', root: ROOT, message: 'unsupported workspace version 5' })
    expect(await at('{"version": "1.0.0"}')).toEqual({ kind: 'unsupported', root: ROOT, message: 'unsupported workspace version 1' })
    expect(await at('{not json')).toEqual({ kind: 'unsupported', root: ROOT, message: 'unreadable .init-metadata.json' })
  })
})

describe('listActivePlans', () => {
  test('reads plans/ and ignores archive/', async () => {
    const plans = await listActivePlans(memoryFs(projectFiles()), ROOT)
    expect(plans.map(plan => plan.name)).toEqual(['83--workspace-data-layer'])
    const [plan] = plans
    expect(plan?.title).toBe('Plan: Workspace Data Layer (Parser → JSON Model)')
    expect(plan?.phases?.length).toBe(4)
    expect(plan?.tasks.map(task => [task.id, task.status])).toEqual([
      [1, 'completed'],
      [2, 'completed'],
      [3, 'in-progress'],
      [4, 'completed'],
      [5, 'completed'],
    ])
    expect(plan?.problems).toEqual([])
  })

  test('reports a malformed task file and keeps the rest', async () => {
    const fs = memoryFs(projectFiles())
    fs.files.set(`${ACTIVE}/tasks/06--broken.md`, 'no frontmatter here')
    fs.files.set(`${ROOT}/plans/not-a-plan/notes.md`, 'ignored')
    const [plan] = await listActivePlans(fs, ROOT)
    const broken = plan?.tasks.find(task => task.file === '06--broken.md')
    expect(broken?.id).toBe(6)
    expect(broken?.status).toBeUndefined()
    expect(broken?.problems).toEqual(['no frontmatter'])
    expect(plan?.tasks.length).toBe(6)
  })

  test('returns nothing when plans/ is missing', async () => {
    expect(await listActivePlans(memoryFs({ [`${ROOT}/.init-metadata.json`]: '{}' }), ROOT)).toEqual([])
  })
})

describe('planSignature', () => {
  test('changes when a task file changes', async () => {
    const fs = memoryFs(projectFiles())
    const before = await planSignature(fs, ROOT)
    expect(await planSignature(fs, ROOT)).toBe(before)
    fs.mtimes.set(`${ACTIVE}/tasks/04--integration-tests.md`, 5)
    expect(await planSignature(fs, ROOT)).not.toBe(before)
  })
})

describe('listReviewFiles', () => {
  test('finds review.xml under active plans only, newest first', async () => {
    const fs = memoryFs(projectFiles())
    expect(await listReviewFiles(fs, ROOT)).toEqual([])
    fs.files.set(`${ACTIVE}/review/review.xml`, FIXTURE_FILES['review.xml'] ?? '')
    fs.files.set(`${ACTIVE}/review/base-commit.json`, '{}')
    fs.files.set(`${ROOT}/plans/90--newer/review/review.xml`, '<review/>')
    fs.files.set(`${ROOT}/archive/38--fix-jekyll-link-baseurl/review/review.xml`, '<review/>')
    fs.mtimes.set(`${ROOT}/plans/90--newer/review/review.xml`, 9)
    expect(await listReviewFiles(fs, ROOT)).toEqual([
      { plan: '90--newer', path: `${ROOT}/plans/90--newer/review/review.xml`, mtimeMs: 9 },
      { plan: '83--workspace-data-layer', path: `${ACTIVE}/review/review.xml`, mtimeMs: 1 },
    ])
  })
})

describe('pickActivePlan', () => {
  const plan = (name: string, mtimeMs: number, statuses: Plan['tasks'][number]['status'][]): Plan => ({
    name,
    id: Number(name.split('--')[0]),
    slug: name.split('--')[1] ?? '',
    dir: `${ROOT}/plans/${name}`,
    title: name,
    phases: undefined,
    tasks: statuses.map((status, i) => ({
      file: `0${i + 1}--t.md`, path: '', id: i + 1, title: 't', status, dependencies: [], group: undefined, mtimeMs, text: '', problems: [],
    })),
    problems: [],
    mtimeMs,
  })
  const older = plan('41--older', 100, ['in-progress'])
  const newer = plan('42--newer', 200, ['completed', 'pending'])

  test('prefers a plan with a task in progress', async () => {
    expect(pickActivePlan([newer, older])?.name).toBe('41--older')
  })

  test('falls back to the most recently changed plan', async () => {
    expect(pickActivePlan([plan('41--a', 100, ['pending']), newer])?.name).toBe('42--newer')
    expect(pickActivePlan([])).toBeUndefined()
  })

  test('honours a pin by id or by name, and ignores an unknown pin', async () => {
    expect(pickActivePlan([newer, older], '042')?.name).toBe('42--newer')
    expect(pickActivePlan([newer, older], '42--newer')?.name).toBe('42--newer')
    expect(pickActivePlan([newer, older], '99')?.name).toBe('41--older')
  })
})
