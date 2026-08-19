import { describe, expect, it } from 'vitest'
import {
  appendSettingCardCandidate,
  moveSettingCardCandidateIndex,
  settingCardStyleSource
} from './setting-card-designer-model.js'

describe('setting-card designer model', () => {
  it('maps the one style selector to local built-in and workspace render sources', () => {
    expect(settingCardStyleSource('builtin:modern-dossier')).toEqual({
      kind: 'builtin',
      id: 'modern-dossier'
    })
    expect(settingCardStyleSource('workspace:paper-archive@1.0.3')).toEqual({
      kind: 'workspace',
      id: 'paper-archive',
      version: '1.0.3'
    })
    expect(settingCardStyleSource('random')).toBeNull()
  })

  it('retains every successful Roll and navigates earlier candidates cyclically', () => {
    const first = appendSettingCardCandidate<string>([], 'candidate-a')
    const second = appendSettingCardCandidate(first.history, 'candidate-b')

    expect(second.history).toEqual(['candidate-a', 'candidate-b'])
    expect(second.selectedIndex).toBe(1)
    expect(moveSettingCardCandidateIndex(second.selectedIndex, second.history.length, -1)).toBe(0)
    expect(moveSettingCardCandidateIndex(0, second.history.length, -1)).toBe(1)
    expect(moveSettingCardCandidateIndex(1, second.history.length, 1)).toBe(0)
  })
})
