import { describe, expect, test } from 'claude-code/testing'

import { parseBlueprint, parseTaskFrontmatter, parseTitle } from '../lib/index.ts'
import { FIXTURE_FILES } from './fixture-files.ts'

const PLAN_83 = 'serve-workspace/archive/83--workspace-data-layer'
const fixture = (path: string): string => {
  const text = FIXTURE_FILES[path]
  if (text === undefined) throw new Error(`no fixture ${path}`)
  return text
}

describe('parseTaskFrontmatter', () => {
  test('reads a fixture task', async () => {
    expect(parseTaskFrontmatter(fixture(`${PLAN_83}/tasks/03--model-assembly-and-typed-api.md`))).toEqual({
      id: 3,
      status: 'completed',
      dependencies: [1, 2],
      group: 'model-assembly',
      problems: [],
    })
  })

  test('reads dashed dependencies, quotes and trailing comments', async () => {
    const text = '---\nid: 7\nstatus: "in-progress"  # pending | completed\ndependencies:\n  - 2\n  - "5"\ngroup: api\n---\n# T\n'
    expect(parseTaskFrontmatter(text)).toEqual({ id: 7, status: 'in-progress', dependencies: [2, 5], group: 'api', problems: [] })
  })

  test('reports malformed fields without throwing', async () => {
    expect(parseTaskFrontmatter('# no frontmatter').problems).toEqual(['no frontmatter'])
    const parsed = parseTaskFrontmatter('---\nid: abc\nstatus: done\ndependencies: [1, x]\n---\n')
    expect(parsed.id).toBeUndefined()
    expect(parsed.status).toBeUndefined()
    expect(parsed.dependencies).toEqual([1])
    expect(parsed.problems).toEqual(['id "abc" is not a number', 'status "done" is not a v4 status', 'dependency "x" is not a task id'])
  })
})

describe('parseBlueprint', () => {
  test('reads the fixture plan phases, ✅ markers included', async () => {
    expect(parseBlueprint(fixture(`${PLAN_83}/plan-83--workspace-data-layer.md`))).toEqual([
      { index: 1, name: 'Parsing primitives', taskIds: [1] },
      { index: 2, name: 'Derivation layer', taskIds: [2] },
      { index: 3, name: 'Model assembly', taskIds: [3] },
      { index: 4, name: 'Verification and documentation', taskIds: [4, 5] },
    ])
  })

  test('stops at the next ## heading and numbers phases by position', async () => {
    const plan = '## Execution Blueprint\n### Phase 3\n- Task 002: a\n* Task 2 again\n## Notes\n### Phase 9: Late\n- Task 009: b\n'
    expect(parseBlueprint(plan)).toEqual([{ index: 1, name: undefined, taskIds: [2] }])
  })

  test('is undefined without the section or its phases', async () => {
    expect(parseBlueprint('## Plan\n### Phase 1: x\n')).toBeUndefined()
    expect(parseBlueprint('## Execution Blueprint\nnothing yet\n')).toBeUndefined()
  })
})

describe('parseTitle', () => {
  test('reads the first heading after the frontmatter', async () => {
    expect(parseTitle(fixture(`${PLAN_83}/tasks/05--agents-md-serve-note.md`))).toBe('Document the serve data layer in AGENTS.md')
    expect(parseTitle('---\nid: 1\n---\nno heading')).toBeUndefined()
  })
})
