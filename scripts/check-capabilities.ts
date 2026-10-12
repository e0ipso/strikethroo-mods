/**
 * Checks what each plugin's hooks module does against capabilities.json.
 *
 * For every plugin in the marketplace it runs `claude plugin validate --json`
 * and reads the `hooks:` and `calls:` lines Claude Code's static analysis
 * prints. It fails when:
 *   - a hook or call is missing from the plugin's allowlist, or an allowlisted
 *     one is no longer used (the README prints the list, so it must be exact);
 *   - a hook or call is one no mod here may use, whatever the allowlist says;
 *   - the plugin's README doesn't print its allowlist exactly.
 *
 * Usage: node scripts/check-capabilities.ts
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { plugins, ROOT } from './plugins.ts'

type Allowlist = { hooks: string[]; calls: string[] }

/** Never allowed: these approve, deny or submit, call a model, write files, or change what Claude reads. */
const FORBIDDEN = {
  hooks: [/^tool\.check$/, /^prompt\.(submit|section|compose|context)$/, /^model\./],
  calls: [/^\$\.fs\.write$/, /^\$\.prompt\.submit$/, /^\$\.model\./],
}

/** Splits `a, b{x=[1,2]}, c` at the commas outside braces and brackets. */
const splitList = (text: string): string[] => {
  const items: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (char === '{' || char === '[') depth++
    else if (char === '}' || char === ']') depth--
    else if (char === ',' && depth === 0) {
      items.push(text.slice(start, i).trim())
      start = i + 1
    }
  }
  items.push(text.slice(start).trim())
  return items.filter(item => item !== '')
}

type Report = { success: boolean; contents?: { notes?: string[] }[] }

/** The events hooked (matchers dropped) and the calls made (`via` dropped). */
const usesOf = (dir: string): Allowlist | string => {
  const run = spawnSync('claude', ['plugin', 'validate', '--json', dir], { encoding: 'utf8' })
  let report: Report
  try {
    report = JSON.parse(run.stdout) as Report
  } catch {
    return `claude plugin validate --json printed no report: ${run.stderr.trim()}`
  }
  if (!report.success) return 'claude plugin validate failed; run npm run validate for details'
  const uses: Allowlist = { hooks: [], calls: [] }
  for (const note of (report.contents ?? []).flatMap(content => content.notes ?? [])) {
    const match = /^\S+ (hooks|calls): (.+)$/.exec(note)
    if (match === null) continue
    const kind = match[1] === 'hooks' ? 'hooks' : 'calls'
    for (const item of splitList(match[2] ?? '')) {
      const name = kind === 'hooks' ? item.replace(/\{.*$/, '') : item.replace(/\s*\(via [^)]*\)$/, '')
      if (!uses[kind].includes(name)) uses[kind].push(name)
    }
  }
  return uses
}

/** The JSON block between `<!-- capabilities -->` and `<!-- /capabilities -->`. */
const readmeAllowlist = (dir: string): unknown => {
  try {
    const readme = readFileSync(join(dir, 'README.md'), 'utf8')
    const block = /<!-- capabilities -->\s*```json\n([\s\S]*?)```\s*<!-- \/capabilities -->/.exec(readme)?.[1]
    return block === undefined ? undefined : (JSON.parse(block) as unknown)
  } catch {
    return undefined
  }
}

const allowlists = JSON.parse(readFileSync(join(ROOT, 'capabilities.json'), 'utf8')) as Record<string, Allowlist>
const errors: string[] = []
const listed = plugins()

for (const name of Object.keys(allowlists)) {
  if (!listed.some(plugin => plugin.name === name)) errors.push(`${name}: in capabilities.json but not in the marketplace`)
}

for (const { name, dir } of listed) {
  const allowed = allowlists[name]
  if (allowed === undefined) {
    errors.push(`${name}: no allowlist in capabilities.json`)
    continue
  }
  const uses = usesOf(dir)
  if (typeof uses === 'string') {
    errors.push(`${name}: ${uses}`)
    continue
  }
  for (const kind of ['hooks', 'calls'] as const) {
    for (const item of uses[kind]) {
      if (FORBIDDEN[kind].some(pattern => pattern.test(item))) errors.push(`${name}: ${kind} uses ${item}, which no mod here may use`)
      else if (!allowed[kind].includes(item)) errors.push(`${name}: ${kind} uses ${item}, which its allowlist doesn't list`)
    }
    for (const item of allowed[kind]) {
      if (!uses[kind].includes(item)) errors.push(`${name}: allowlist lists ${kind} ${item}, which the module no longer uses`)
    }
  }
  if (JSON.stringify(readmeAllowlist(dir)) !== JSON.stringify(allowed)) {
    errors.push(`${name}: README.md doesn't print its capabilities.json entry between <!-- capabilities --> markers`)
  }
  console.log(`${name}: hooks ${uses.hooks.join(', ')}; calls ${uses.calls.join(', ')}`)
}

if (errors.length > 0) {
  console.error(`\ncheck-capabilities failed:\n  ${errors.join('\n  ')}`)
  process.exit(1)
}
console.log(`\ncheck-capabilities: ${listed.length} plugin(s) within their allowlists`)
