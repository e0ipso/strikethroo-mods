/**
 * An in-memory file system for tests. `memoryFs` serves the shared reader
 * directly; `stubFs` answers a mod's `$.fs.exists`, `$.fs.read` and
 * `$.fs.list` calls from the same files under `claude plugin test`.
 *
 * Source of truth: `shared/testing/`. `node scripts/sync-shared.ts` copies it
 * into each plugin's `tests/lib/strikethroo/`.
 */
import type { FsEntry, On } from 'claude-code'

export type MemoryFs = {
  /** Absolute `/`-separated paths to file contents. Tests may change it. */
  readonly files: Map<string, string>
  /** Modification times by path; a file without one reads as 1. */
  readonly mtimes: Map<string, number>
  readonly exists: (path: string) => Promise<boolean>
  readonly read: (path: string) => Promise<string>
  readonly list: (path: string) => Promise<FsEntry[]>
}

const missing = (path: string): Error => new Error(`ENOENT: no such file or directory, '${path}'`)

export const memoryFs = (files: Readonly<Record<string, string>>): MemoryFs => {
  const fs: MemoryFs = {
    files: new Map(Object.entries(files)),
    mtimes: new Map(),
    exists: async path =>
      fs.files.has(path) || [...fs.files.keys()].some(file => file.startsWith(path.replace(/\/$/, '') + '/')),
    read: async path => {
      const text = fs.files.get(path)
      if (text === undefined) throw missing(path)
      return text
    },
    list: async path => {
      const prefix = path.replace(/\/$/, '') + '/'
      const entries = new Map<string, FsEntry>()
      for (const [file, text] of fs.files) {
        if (!file.startsWith(prefix)) continue
        const [name = '', ...rest] = file.slice(prefix.length).split('/')
        entries.set(name, rest.length > 0
          ? { name, kind: 'dir', size: 0, mtimeMs: 0, isLink: false }
          : { name, kind: 'file', size: text.length, mtimeMs: fs.mtimes.get(file) ?? 1, isLink: false })
      }
      if (entries.size === 0) throw missing(path)
      return [...entries.values()]
    },
  }
  return fs
}

/** Prefixes every path in `files` with `dir`. */
export const mountAt = (dir: string, files: Readonly<Record<string, string>>): Record<string, string> =>
  Object.fromEntries(Object.entries(files).map(([path, text]) => [`${dir.replace(/\/$/, '')}/${path}`, text]))

/** Registers stubs that answer the mod's file reads from `fs`. */
export const stubFs = (on: On, fs: MemoryFs): void => {
  on('fs.exists', async ($, e) => ({ value: await fs.exists(e.path) }))
  on('fs.read', async ($, e) => fs.read(e.path).then(value => ({ value }), (error: Error) => ({ deny: error.message })))
  on('fs.list', async ($, e) => fs.list(e.path).then(value => ({ value }), (error: Error) => ({ deny: error.message })))
}
