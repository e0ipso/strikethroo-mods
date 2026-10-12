/**
 * Runs one check over the root, shared/ and every plugin in the marketplace.
 *
 * Usage: node scripts/run.ts <typecheck|test|validate>
 *   typecheck  tsc -p against the root config, shared/ and each plugin
 *   test       claude plugin test on shared/ and each plugin
 *   validate   claude plugin validate --strict on the marketplace and each plugin
 */
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { plugins, ROOT } from './plugins.ts'

const TSC = join(ROOT, 'node_modules/typescript/bin/tsc')
const pluginDirs = plugins().map(plugin => plugin.dir)

const commands: Readonly<Record<string, readonly (readonly string[])[]>> = {
  typecheck: [ROOT, join(ROOT, 'shared'), ...pluginDirs].map(dir => [process.execPath, TSC, '-p', dir]),
  test: [join(ROOT, 'shared'), ...pluginDirs].map(dir => ['claude', 'plugin', 'test', dir]),
  validate: [ROOT, ...pluginDirs].map(dir => ['claude', 'plugin', 'validate', '--strict', dir]),
}

const task = process.argv[2] ?? ''
const steps = commands[task]
if (steps === undefined) {
  console.error(`usage: node scripts/run.ts <${Object.keys(commands).join('|')}>`)
  process.exit(2)
}

const failed = steps.filter(([command = '', ...args]) => {
  console.log(`\n$ ${[command === process.execPath ? 'node' : command, ...args].join(' ')}`)
  return spawnSync(command, args, { cwd: ROOT, stdio: 'inherit' }).status !== 0
})
if (failed.length > 0) {
  console.error(`\n${task}: ${failed.length} of ${steps.length} failed`)
  process.exit(1)
}
console.log(`\n${task}: all ${steps.length} passed`)
