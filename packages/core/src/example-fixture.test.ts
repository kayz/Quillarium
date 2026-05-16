import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { assembleContext, listDocs, projectExists } from './index.js'

const fixtureRoot = path.resolve('examples/novels/minimal')

describe('minimal example fixture', () => {
  it('contains the MVP fixture shape', async () => {
    expect(await projectExists(fixtureRoot)).toBe(true)
    expect((await listDocs(fixtureRoot, 'character')).length).toBeGreaterThanOrEqual(2)
    expect((await listDocs(fixtureRoot, 'timeline_event')).length).toBeGreaterThanOrEqual(2)
    expect((await listDocs(fixtureRoot, 'location')).length).toBeGreaterThanOrEqual(2)
    expect((await listDocs(fixtureRoot, 'route')).length).toBeGreaterThanOrEqual(1)
    expect((await listDocs(fixtureRoot, 'scene')).length).toBeGreaterThanOrEqual(1)
  })

  it('assembles context from the example scene', async () => {
    const context = await assembleContext(fixtureRoot, 'scene-opening-scene')
    expect(context).toContain('Core Rule')
    expect(context).toContain('Main Character')
    expect(context).toContain('Second Character')
    expect(context).toContain('Opening Night')
  })
})
