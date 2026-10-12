import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** The repository root. */
export const ROOT = fileURLToPath(new URL('..', import.meta.url))

type Marketplace = { plugins: { name: string; source: string }[] }

/** Every plugin the marketplace lists, with its absolute directory. */
export const plugins = (): { name: string; dir: string }[] => {
  const marketplace = JSON.parse(readFileSync(join(ROOT, '.claude-plugin/marketplace.json'), 'utf8')) as Marketplace
  return marketplace.plugins.map(plugin => ({ name: plugin.name, dir: join(ROOT, plugin.source) }))
}
