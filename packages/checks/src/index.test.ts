import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkScene } from './index.js'

const fixtureRoot = path.resolve('examples/novels/minimal')

describe('scene checks', () => {
  it('checks a legacy scene that omits newly defaulted frontmatter', async () => {
    const report = await checkScene(fixtureRoot, 'scene-opening-scene')

    expect(report.scene_id).toBe('scene-opening-scene')
    expect(report.target_type).toBe('scene')
    expect(report.target_id).toBe('scene-opening-scene')
    expect(report.issues).toEqual(expect.any(Array))
  })
})
