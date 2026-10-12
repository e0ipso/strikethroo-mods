/**
 * Writes a version into every plugin's .claude-plugin/plugin.json.
 * semantic-release runs it before its release commit, because Claude Code
 * caches an installed plugin by version: without a bump, `/plugin update`
 * never fetches the new code.
 *
 * Usage: node scripts/set-version.ts <version>
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { plugins } from './plugins.ts'

const version = process.argv[2] ?? ''
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error('usage: node scripts/set-version.ts <semver>')
  process.exit(2)
}

for (const { name, dir } of plugins()) {
  const path = join(dir, '.claude-plugin/plugin.json')
  const manifest = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
  manifest.version = version
  writeFileSync(path, JSON.stringify(manifest, null, 2) + '\n')
  console.log(`${name}: ${version}`)
}
