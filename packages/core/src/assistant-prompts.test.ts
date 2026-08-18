import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  ensureBuiltinAssistantPrompts,
  listAssistantPromptVersions,
  saveAssistantPromptVersion
} from './assistant-prompts.js'
import { ensureBuiltinCreatorRoles } from './creator-roles.js'
import { loadAgentSessionDetail, startAgentSession } from './assistant-sessions.js'
import { createProjectAt } from './project.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('assistant prompt version isolation and retention', () => {
  it('shows only the latest five versions for one assistant and retains exact old session snapshots', async () => {
    const base = await mkdtemp(path.join(os.tmpdir(), 'quillarium-assistant-prompts-'))
    roots.push(base)
    const root = (
      await createProjectAt(path.join(base, 'project'), {
        id: 'assistant-prompts',
        title: 'Assistant prompts'
      })
    ).root
    await ensureBuiltinAssistantPrompts(root)
    await ensureBuiltinCreatorRoles(root)
    const session = await startAgentSession(root, 'character-rehearsal', {
      document_type: 'project',
      document_id: 'assistant-prompts'
    })
    expect(session.session.configuration.assistant_prompt?.version).toBe('1.0.0')

    for (let index = 0; index < 6; index += 1) {
      const current = await listAssistantPromptVersions(root, 'character-rehearsal')
      await saveAssistantPromptVersion(root, {
        assistant_id: 'character-rehearsal',
        base_version: current[0]?.value.version,
        instructions: `Character rehearsal workflow revision ${index + 1}.`
      })
    }
    const rehearsal = await listAssistantPromptVersions(root, 'character-rehearsal')
    expect(rehearsal).toHaveLength(5)
    expect(rehearsal.map((item) => item.value.version)).toEqual(['1.0.6', '1.0.5', '1.0.4', '1.0.3', '1.0.2'])
    expect(rehearsal.every((item) => item.value.assistant_id === 'character-rehearsal')).toBe(true)
    expect(await listAssistantPromptVersions(root, 'continuity-review')).toHaveLength(1)
    expect(await listAssistantPromptVersions(root, 'setting-organizer')).toHaveLength(1)

    const restored = await loadAgentSessionDetail(root, session.session.id)
    expect(restored.session.configuration.assistant_prompt).toMatchObject({
      assistant_id: 'character-rehearsal',
      version: '1.0.0',
      instructions: expect.stringContaining('product workflow')
    })
  })
})
