import { describe, expect, it } from 'vitest'
import type { GitState } from '../../app/types.js'
import { gitActionFor } from './git-presentation.js'

function gitState(patch: Partial<GitState> = {}): GitState {
  return {
    initialized: false,
    dirty: false,
    branch: null,
    remote: null,
    summary: '',
    repositoryScope: 'standalone',
    repositoryRoot: 'C:/novels/sample',
    projectPathspec: '.',
    canInitializeRepository: true,
    ...patch
  }
}

describe('optional GitHub status presentation', () => {
  it('presents an uninitialized project as locally usable', () => {
    expect(gitActionFor('zh', gitState())).toEqual({
      label: '仅本地',
      title: '当前小说保存在本地，无需 GitHub；需要时可在设置中连接并上传。'
    })
  })

  it('distinguishes local Git from a linked GitHub remote', () => {
    expect(gitActionFor('en', gitState({ initialized: true, branch: 'main' })).label).toBe('Local Git')
    expect(
      gitActionFor(
        'en',
        gitState({ initialized: true, branch: 'main', remote: 'https://example.test/sample.git' })
      ).label
    ).toBe('GitHub synced')
  })
})
