import { readFile } from 'node:fs/promises'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import {
  auditSourceTypeLabel,
  assistantTargetDocuments,
  CreatorAssistantWorkspace,
  documentTypeDisplayLabel,
  shouldOpenAssistantTurnOverlay
} from './CreatorAssistantWorkspace.js'

vi.mock('../../app/bridge.js', () => ({ bridge: {} }))

describe('CreatorAssistantWorkspace', () => {
  it('claims the full center workspace while its assistant data is loading', () => {
    const html = renderToStaticMarkup(
      <CreatorAssistantWorkspace
        root="C:/project"
        projectId="sample-project"
        docs={[]}
        selectedTarget={null}
        onProjectChanged={async () => undefined}
        language="zh"
      />
    )

    expect(html).toContain('creator-assistant-loading module-view-full')
    expect(html).toContain('正在准备创作助手')
  })

  it('keeps prompt assets and invalid identities out of target choices', () => {
    const docs = assistantTargetDocuments([
      { path: 'canon/a.md', data: { id: 'a', type: 'canon', title: 'A' }, content: '' },
      { path: 'prompts/background.md', data: { id: '', type: '', title: '' }, content: '' },
      { path: 'canon/a-copy.md', data: { id: 'a', type: 'canon', title: 'Duplicate A' }, content: '' },
      { path: 'future/b.md', data: { id: 'b', type: 'future_note', title: 'Future note' }, content: '' }
    ])

    expect(docs.map((doc) => `${doc.data.type}:${doc.data.id}`)).toEqual(['canon:a', 'future_note:b'])
    expect(documentTypeDisplayLabel('future_note', 'zh')).toBe('future_note')
  })

  it('localizes virtual audit sources independently from document labels', () => {
    expect(auditSourceTypeLabel({ source_type: 'system', source_id: 'assistant-boundary' }, 'zh')).toBe(
      '系统权限边界'
    )
    expect(auditSourceTypeLabel({ source_type: 'project', source_id: 'same-id' }, 'zh')).toBe('当前项目身份')
    expect(auditSourceTypeLabel({ source_type: 'resource', source_id: 'same-id' }, 'zh')).toBe('当前工作目标')
    expect(auditSourceTypeLabel({ source_type: 'project', source_id: 'same-id' }, 'en')).toBe(
      'Current project identity'
    )
  })

  it('opens the confirm overlay when a turn has pending proposals', () => {
    expect(
      shouldOpenAssistantTurnOverlay({
        proposals: [{ status: 'pending' }],
        configuration_proposals: [],
        candidate: null
      })
    ).toBe(true)
  })

  it('does not open the overlay for a rehearsal candidate with no pending proposals', () => {
    expect(
      shouldOpenAssistantTurnOverlay({
        proposals: [],
        configuration_proposals: [],
        candidate: { title: 'Take', content: 'A spoken line.' }
      })
    ).toBe(false)
  })

  it('replaces per-item apply with one turn overlay', async () => {
    const source = await readFile(new URL('./CreatorAssistantWorkspace.tsx', import.meta.url), 'utf8')
    expect(source).not.toContain('bridge.applyAssistantProposal')
    expect(source).not.toContain('bridge.applyAssistantConfigurationProposal')
    expect(source).toContain('applyAssistantTurn')
    expect(source).toContain('确认本轮')
  })
})
