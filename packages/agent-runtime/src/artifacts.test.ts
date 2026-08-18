import path from 'node:path'
import os from 'node:os'
import { mkdtemp, rm } from 'node:fs/promises'
import { afterEach, describe, expect, it } from 'vitest'
import { createProjectAt, pathExists } from '@quillarium/core'
import { AgentArtifactStore } from './artifacts.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('AgentArtifactStore', () => {
  it('isolates concurrent executions and keeps each append-only sequence strictly continuous', async () => {
    const root = await project('agent-event-isolation')
    const now = () => new Date('2026-08-17T00:00:00.000Z')
    const left = await AgentArtifactStore.create({
      projectRoot: root,
      executionId: 'agent-concurrent-left',
      taskId: 'planning-integrity-review',
      now
    })
    const right = await AgentArtifactStore.create({
      projectRoot: root,
      executionId: 'agent-concurrent-right',
      taskId: 'planning-integrity-review',
      now
    })

    await Promise.all([
      ...Array.from({ length: 12 }, (_value, index) => left.appendEvent('execution.planned', {}, { index })),
      ...Array.from({ length: 9 }, (_value, index) => right.appendEvent('context.compiled', {}, { index }))
    ])

    const leftEvents = await left.events()
    const rightEvents = await right.events()
    expect(leftEvents.map((event) => event.seq)).toEqual(
      Array.from({ length: 12 }, (_value, index) => index + 1)
    )
    expect(rightEvents.map((event) => event.seq)).toEqual(
      Array.from({ length: 9 }, (_value, index) => index + 1)
    )
    expect(new Set(leftEvents.map((event) => event.execution_id))).toEqual(new Set(['agent-concurrent-left']))
    expect(new Set(rightEvents.map((event) => event.execution_id))).toEqual(
      new Set(['agent-concurrent-right'])
    )
  })

  it('rejects path traversal without leaving an artifact outside its execution directory', async () => {
    const root = await project('agent-artifact-containment')
    const store = await AgentArtifactStore.create({
      projectRoot: root,
      executionId: 'agent-contained',
      taskId: 'planning-integrity-review',
      now: () => new Date('2026-08-17T00:00:00.000Z')
    })

    await expect(store.write('../escape.json', '{}')).rejects.toThrow('escapes its run')
    expect(await pathExists(path.join(root, 'runs', 'agents', 'escape.json'))).toBe(false)
  })
})

async function project(id: string): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'quillarium-agent-artifacts-'))
  roots.push(root)
  await createProjectAt(root, { id, title: 'Agent artifact sample' })
  return root
}
