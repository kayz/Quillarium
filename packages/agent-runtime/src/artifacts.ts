import path from 'node:path'
import { open, lstat, realpath } from 'node:fs/promises'
import { ensureDir, pathExists, readText, sha256Text, writeText } from '@quillarium/core'
import {
  agentArtifactReferenceV1Schema,
  agentExecutionEventV1Schema,
  agentRuntimeIdSchema,
  type AgentArtifactReferenceV1,
  type AgentExecutionEventType,
  type AgentExecutionEventV1
} from './contracts.js'

const appendTails = new Map<string, Promise<void>>()

export type AuditFaultInjector = (operation: string, relativePath: string) => void | Promise<void>

export class AgentArtifactStore {
  readonly projectRoot: string
  readonly executionId: string
  readonly taskId: string
  readonly relativeDirectory: string
  readonly #directory: string
  readonly #now: () => Date
  readonly #fault?: AuditFaultInjector

  private constructor(input: {
    projectRoot: string
    executionId: string
    taskId: string
    directory: string
    relativeDirectory: string
    now: () => Date
    fault?: AuditFaultInjector
  }) {
    this.projectRoot = input.projectRoot
    this.executionId = input.executionId
    this.taskId = input.taskId
    this.#directory = input.directory
    this.relativeDirectory = input.relativeDirectory
    this.#now = input.now
    this.#fault = input.fault
  }

  static async create(input: {
    projectRoot: string
    executionId: string
    taskId: string
    now: () => Date
    fault?: AuditFaultInjector
  }): Promise<AgentArtifactStore> {
    const executionId = agentRuntimeIdSchema.parse(input.executionId)
    const taskId = agentRuntimeIdSchema.parse(input.taskId)
    const projectReal = await realpath(input.projectRoot)
    const runs = path.join(projectReal, 'runs')
    const agents = path.join(runs, 'agents')
    await ensureDir(agents)
    await assertContainedDirectory(projectReal, runs, 'runs')
    await assertContainedDirectory(projectReal, agents, path.join('runs', 'agents'))
    const directory = path.join(agents, executionId)
    await ensureDir(directory)
    await assertContainedDirectory(projectReal, directory, path.join('runs', 'agents', executionId))
    const relativeDirectory = portableRelative(projectReal, directory)
    return new AgentArtifactStore({
      projectRoot: projectReal,
      executionId,
      taskId,
      directory,
      relativeDirectory,
      now: input.now,
      ...(input.fault ? { fault: input.fault } : {})
    })
  }

  async writeJson(name: string, value: unknown): Promise<AgentArtifactReferenceV1> {
    return this.write(name, `${JSON.stringify(value, null, 2)}\n`)
  }

  async write(name: string, value: string): Promise<AgentArtifactReferenceV1> {
    const file = await this.#artifactPath(name, true)
    const relative = portableRelative(this.projectRoot, file)
    await this.#fault?.('write', relative)
    if (await pathExists(file)) {
      const stats = await lstat(file)
      if (stats.isSymbolicLink() || !stats.isFile()) {
        throw new Error(`Agent artifact must be a regular file: ${relative}`)
      }
    }
    await writeText(file, value)
    const handle = await open(file, 'r+')
    try {
      await this.#fault?.('flush', relative)
      await handle.sync()
    } finally {
      await handle.close()
    }
    const actual = await readText(file)
    if (actual !== value) throw new Error(`Agent artifact verification failed: ${relative}`)
    return agentArtifactReferenceV1Schema.parse({
      path: relative,
      sha256: sha256Text(actual),
      bytes: Buffer.byteLength(actual, 'utf8')
    })
  }

  async read(name: string): Promise<string> {
    const file = await this.#artifactPath(name, false)
    const stats = await lstat(file)
    if (stats.isSymbolicLink() || !stats.isFile()) throw new Error(`Invalid Agent artifact: ${name}`)
    return readText(file)
  }

  async readJson<T>(name: string): Promise<T> {
    return JSON.parse(await this.read(name)) as T
  }

  async reference(name: string): Promise<AgentArtifactReferenceV1> {
    const file = await this.#artifactPath(name, false)
    const value = await readText(file)
    return agentArtifactReferenceV1Schema.parse({
      path: portableRelative(this.projectRoot, file),
      sha256: sha256Text(value),
      bytes: Buffer.byteLength(value, 'utf8')
    })
  }

  async appendEvent(
    type: AgentExecutionEventType,
    artifacts: Record<string, AgentArtifactReferenceV1> = {},
    data: Record<string, unknown> = {}
  ): Promise<AgentExecutionEventV1> {
    const key = `${this.projectRoot.toLocaleLowerCase('en-US')}\0${this.executionId}`
    const previous = appendTails.get(key) ?? Promise.resolve()
    let release!: () => void
    const hold = new Promise<void>((resolve) => {
      release = resolve
    })
    const tail = previous.then(() => hold)
    appendTails.set(key, tail)
    await previous
    try {
      await Promise.all(Object.values(artifacts).map((reference) => this.verifyReference(reference)))
      const existing = await this.events()
      const event = agentExecutionEventV1Schema.parse({
        schema_version: 1,
        seq: existing.length + 1,
        recorded_at: this.#now().toISOString(),
        execution_id: this.executionId,
        task_id: this.taskId,
        type,
        artifacts,
        data
      })
      const file = await this.#artifactPath('events.jsonl', true)
      const relative = portableRelative(this.projectRoot, file)
      await this.#fault?.('append', relative)
      const handle = await open(file, 'a')
      try {
        await handle.write(`${JSON.stringify(event)}\n`, null, 'utf8')
        await this.#fault?.('flush', relative)
        await handle.sync()
      } finally {
        await handle.close()
      }
      const verified = await this.events()
      const last = verified.at(-1)
      if (!last || last.seq !== event.seq || last.type !== event.type) {
        throw new Error(`Agent event flush verification failed: ${relative}`)
      }
      return event
    } finally {
      release()
      if (appendTails.get(key) === tail) appendTails.delete(key)
    }
  }

  async events(): Promise<AgentExecutionEventV1[]> {
    const file = await this.#artifactPath('events.jsonl', true)
    if (!(await pathExists(file))) return []
    const stats = await lstat(file)
    if (stats.isSymbolicLink() || !stats.isFile()) throw new Error('Agent event log must be a regular file')
    const raw = await readText(file)
    const lines = raw.split(/\r?\n/u).filter(Boolean)
    return lines.map((line, index) => {
      const event = agentExecutionEventV1Schema.parse(JSON.parse(line))
      if (event.seq !== index + 1) throw new Error(`Agent event sequence gap at ${index + 1}`)
      if (event.execution_id !== this.executionId || event.task_id !== this.taskId) {
        throw new Error(`Agent event identity mismatch at ${event.seq}`)
      }
      return event
    })
  }

  async verifyReference(reference: AgentArtifactReferenceV1): Promise<void> {
    const parsed = agentArtifactReferenceV1Schema.parse(reference)
    const absolute = path.resolve(this.projectRoot, parsed.path)
    assertPathContained(this.projectRoot, absolute, parsed.path)
    const stats = await lstat(absolute)
    if (stats.isSymbolicLink() || !stats.isFile()) {
      throw new Error(`Agent event reference is not a regular file: ${parsed.path}`)
    }
    const fileReal = await realpath(absolute)
    assertPathContained(this.projectRoot, fileReal, parsed.path)
    const value = await readText(fileReal)
    if (sha256Text(value) !== parsed.sha256 || Buffer.byteLength(value, 'utf8') !== parsed.bytes) {
      throw new Error(`Agent event artifact hash mismatch: ${parsed.path}`)
    }
  }

  async #artifactPath(name: string, createParent: boolean): Promise<string> {
    if (!name || path.isAbsolute(name) || path.win32.isAbsolute(name)) {
      throw new Error(`Agent artifact path must be relative: ${name}`)
    }
    const normalized = name.replace(/\\/gu, '/')
    if (normalized.split('/').includes('..')) throw new Error(`Agent artifact path escapes its run: ${name}`)
    const file = path.resolve(this.#directory, normalized)
    assertPathContained(this.#directory, file, name)
    if (createParent) {
      await ensureDir(path.dirname(file))
      await assertContainedDirectory(this.#directory, path.dirname(file), path.dirname(normalized))
    }
    return file
  }
}

export async function openAgentArtifactStore(input: {
  projectRoot: string
  executionId: string
  taskId?: string
  now?: () => Date
  fault?: AuditFaultInjector
}): Promise<AgentArtifactStore> {
  const taskId =
    input.taskId ??
    (await readExecutionTaskId(input.projectRoot, agentRuntimeIdSchema.parse(input.executionId)))
  return AgentArtifactStore.create({
    projectRoot: input.projectRoot,
    executionId: input.executionId,
    taskId,
    now: input.now ?? (() => new Date()),
    ...(input.fault ? { fault: input.fault } : {})
  })
}

async function readExecutionTaskId(projectRoot: string, executionId: string): Promise<string> {
  const file = path.join(projectRoot, 'runs', 'agents', executionId, 'request.json')
  const parsed = JSON.parse(await readText(file)) as { task_id?: unknown }
  return agentRuntimeIdSchema.parse(parsed.task_id)
}

async function assertContainedDirectory(
  root: string,
  directory: string,
  expectedRelative: string
): Promise<void> {
  const stats = await lstat(directory)
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new Error(`Agent audit directory cannot be a symbolic link: ${expectedRelative}`)
  }
  const directoryReal = await realpath(directory)
  assertPathContained(root, directoryReal, expectedRelative)
}

function assertPathContained(root: string, candidate: string, label: string): void {
  const relative = path.relative(path.resolve(root), path.resolve(candidate))
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Agent artifact resolves outside its project/run: ${label}`)
  }
}

function portableRelative(root: string, file: string): string {
  const relative = path.relative(root, file)
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Agent artifact path is outside its project: ${file}`)
  }
  return relative.replace(/\\/gu, '/')
}
