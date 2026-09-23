import { describe, expect, it } from 'vitest'
import { assistantProposalV1Schema } from './assistant-sessions.js'

describe('assistantProposalV1Schema', () => {
  it('treats legacy proposals without operation as create', () => {
    const parsed = assistantProposalV1Schema.parse({
      id: 'proposal-legacy',
      kind: 'planning_record',
      title: 'Tide',
      document_type: 'character',
      fields: {},
      content: 'A tide spirit.',
      rationale: 'From source notes.',
      status: 'pending'
    })
    expect(parsed.operation).toBe('create')
    expect(parsed.card_id).toBeUndefined()
  })

  it('rejects an update without card_id', () => {
    expect(() =>
      assistantProposalV1Schema.parse({
        id: 'proposal-bad-update',
        kind: 'planning_record',
        title: 'Tide',
        document_type: 'world_entry',
        operation: 'update',
        fields: {},
        content: 'Replacement.',
        rationale: 'Rewrite.',
        status: 'pending'
      })
    ).toThrow(/card_id/u)
  })

  it('rejects issue updates', () => {
    expect(() =>
      assistantProposalV1Schema.parse({
        id: 'proposal-issue-update',
        kind: 'issue',
        title: 'Gap',
        document_type: 'issue',
        operation: 'update',
        card_id: 'issue-old',
        fields: {},
        content: 'Body',
        rationale: 'Cannot patch issues this way.',
        status: 'pending'
      })
    ).toThrow()
  })
})
