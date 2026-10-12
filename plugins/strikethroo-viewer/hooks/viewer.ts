/**
 * The viewer's configuration and URLs, as plain functions. Every URL is built
 * here from a fixed loopback host and a validated port, so nothing the user
 * or a workspace supplies can point a request elsewhere.
 */
import type { PluginOptions } from 'claude-code'

export const HOST = '127.0.0.1'
export const DEFAULT_COMMAND = 'npx --yes strikethroo@latest serve --no-open'
export const DEFAULT_PORT = 4317

/** The plugin's `userConfig`, as plugin.json declares it, plus what was wrong with it. */
export type ViewerConfig = {
  argv: readonly string[]
  port: number
  /** Set when serve_command can't be used; the mod then starts nothing. */
  problem: string | undefined
}

export const configOf = (options: PluginOptions): ViewerConfig => {
  const command = typeof options.serve_command === 'string' && options.serve_command.trim() !== '' ? options.serve_command : DEFAULT_COMMAND
  const argv = command.trim().split(/\s+/)
  const port = options.port
  const isPort = typeof port === 'number' && Number.isInteger(port) && port >= 1024 && port <= 65535
  const hasHost = argv.some(arg => arg === '--host' || arg.startsWith('--host='))
  return {
    argv,
    port: isPort ? port : DEFAULT_PORT,
    problem: hasHost ? 'serve_command passes --host, which this mod refuses: the viewer stays on 127.0.0.1.' : undefined,
  }
}

/** The command to spawn: the configured argv with the port added. */
export const serveArgv = (config: ViewerConfig): string[] => [...config.argv, '--port', String(config.port)]

export const apiUrl = (port: number): string => `http://${HOST}:${port}/api/plans`

/** The viewer page for a plan directory such as `42--add-login`, or the plan list. */
export const pageUrl = (port: number, plan: string | undefined): string =>
  `http://${HOST}:${port}/${plan === undefined ? '' : `plans/${encodeURIComponent(plan)}`}`

/** The end of a process's output, without control characters, for an error message. */
export const tailOf = (output: string): string =>
  output.replace(/\u001b\[[0-9;]*[A-Za-z]/g, '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(-500)
