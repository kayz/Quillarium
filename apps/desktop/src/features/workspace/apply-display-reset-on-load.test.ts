import { describe, expect, it } from 'vitest'
import { applyDisplayResetOnLoad } from './apply-display-reset-on-load.js'

function snapshot(migrated: boolean | undefined, id = 'pre-wipe') {
  return {
    id,
    project: { display_layer: migrated === undefined ? undefined : { migrated } }
  }
}

describe('applyDisplayResetOnLoad', () => {
  it('records the root only when the user cancels the wipe prompt', async () => {
    const session = { loaded: snapshot(false), promptedRoot: null as string | null }
    let resetCalls = 0
    await applyDisplayResetOnLoad(session, {
      root: '/proj',
      language: 'en',
      needsMigration: true,
      confirm: () => false,
      resetDisplayLayer: async () => {
        resetCalls += 1
      },
      loadProject: async () => snapshot(true, 'post-wipe')
    })
    expect(session.promptedRoot).toBe('/proj')
    expect(resetCalls).toBe(0)
    expect(session.loaded?.id).toBe('pre-wipe')
  })

  it('prompts again after a confirmed wipe throws before migrated is on disk', async () => {
    const session = { loaded: snapshot(undefined), promptedRoot: null as string | null }
    let confirmCalls = 0
    const options = {
      root: '/proj',
      language: 'zh' as const,
      needsMigration: true,
      confirm: () => {
        confirmCalls += 1
        return true
      },
      resetDisplayLayer: async () => {
        throw new Error('wipe failed before migrated')
      },
      loadProject: async () => snapshot(true, 'post-wipe')
    }

    await expect(applyDisplayResetOnLoad(session, options)).rejects.toThrow('wipe failed before migrated')
    expect(session.promptedRoot).toBeNull()
    expect(session.loaded).toBeUndefined()

    session.loaded = snapshot(undefined)
    await expect(applyDisplayResetOnLoad(session, options)).rejects.toThrow('wipe failed before migrated')
    expect(confirmCalls).toBe(2)
  })

  it('does not keep a pre-wipe snapshot when reload throws after a successful reset', async () => {
    const session = { loaded: snapshot(false), promptedRoot: null as string | null }
    await expect(
      applyDisplayResetOnLoad(session, {
        root: '/proj',
        language: 'en',
        needsMigration: true,
        confirm: () => true,
        resetDisplayLayer: async () => undefined,
        loadProject: async () => {
          throw new Error('reload failed')
        }
      })
    ).rejects.toThrow('reload failed')
    expect(session.loaded).toBeUndefined()
    expect(session.promptedRoot).toBeNull()
  })

  it('clears loaded before an auto-reset that throws', async () => {
    const session = { loaded: snapshot(true), promptedRoot: null as string | null }
    await expect(
      applyDisplayResetOnLoad(session, {
        root: '/proj',
        language: 'en',
        needsMigration: true,
        confirm: () => false,
        resetDisplayLayer: async () => {
          throw new Error('auto reset failed')
        },
        loadProject: async () => snapshot(true, 'post-wipe')
      })
    ).rejects.toThrow('auto reset failed')
    expect(session.loaded).toBeUndefined()
  })
})
