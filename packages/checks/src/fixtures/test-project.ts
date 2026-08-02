import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { dirForType, writeMarkdown, type DocType } from '@quillarium/core'

export async function createTestProject(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), 'quillarium-checks-'))
}

export async function removeTestProject(projectRoot: string): Promise<void> {
  await rm(projectRoot, { recursive: true, force: true })
}

export async function writeTestDoc(
  projectRoot: string,
  type: DocType,
  id: string,
  fields: Record<string, unknown> = {},
  content = 'Fixture body.'
): Promise<void> {
  await writeMarkdown(
    path.join(dirForType(projectRoot, type), `${id}.md`),
    { id, type, title: id, ...fields },
    content
  )
}
