import path from 'node:path'
import { AsyncLocalStorage } from 'node:async_hooks'

const projectWriteTails = new Map<string, Promise<void>>()
const activeProjectLocks = new AsyncLocalStorage<ReadonlySet<string>>()

/**
 * Serializes project-scoped mutations inside the current Quillarium process.
 * Cross-process changes are detected separately with expected content hashes.
 */
export async function withProjectWriteLock<T>(projectRoot: string, operation: () => Promise<T>): Promise<T> {
  const key = path.resolve(projectRoot).toLocaleLowerCase('en-US')
  const inherited = activeProjectLocks.getStore()
  if (inherited?.has(key)) return operation()
  const previous = projectWriteTails.get(key) ?? Promise.resolve()
  let release!: () => void
  const hold = new Promise<void>((resolve) => {
    release = resolve
  })
  const tail = previous.then(() => hold)
  projectWriteTails.set(key, tail)
  await previous
  try {
    return await activeProjectLocks.run(new Set([...(inherited ?? []), key]), operation)
  } finally {
    release()
    if (projectWriteTails.get(key) === tail) projectWriteTails.delete(key)
  }
}
