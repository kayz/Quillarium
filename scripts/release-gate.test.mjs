import { describe, expect, it } from 'vitest'
import { evaluateReleaseAssets, expectedReleaseAssets } from './release-assets.mjs'
import { evaluateReleaseGate } from './release-gate.mjs'

const commit = 'a'.repeat(40)
const versions = [
  { path: 'package.json', version: '0.2.0-alpha.2' },
  { path: 'apps/desktop/package.json', version: '0.2.0-alpha.2' }
]

describe('release gate', () => {
  it('accepts an alpha tag at the current master tip', () => {
    expect(
      evaluateReleaseGate({
        tag: 'v0.2.0-alpha.2',
        tagCommit: commit,
        masterCommit: commit,
        versions
      })
    ).toEqual({ version: '0.2.0-alpha.2', prerelease: true })
  })

  it('rejects a tag that is not the current master tip', () => {
    expect(() =>
      evaluateReleaseGate({
        tag: 'v0.2.0-alpha.2',
        tagCommit: commit,
        masterCommit: 'b'.repeat(40),
        versions
      })
    ).toThrow(/current master/)
  })

  it('rejects a package version mismatch', () => {
    expect(() =>
      evaluateReleaseGate({
        tag: 'v0.2.0-alpha.2',
        tagCommit: commit,
        masterCommit: commit,
        versions: [{ path: 'package.json', version: '0.2.0-alpha.1' }]
      })
    ).toThrow(/does not match every package version/)
  })

  it('rejects a malformed tag', () => {
    expect(() =>
      evaluateReleaseGate({
        tag: 'alpha.2',
        tagCommit: commit,
        masterCommit: commit,
        versions
      })
    ).toThrow(/must start/)
  })
})

describe('release assets', () => {
  it('requires all three supported installer architectures', () => {
    const assets = expectedReleaseAssets('0.2.0-alpha.2')
    expect(evaluateReleaseAssets('0.2.0-alpha.2', assets)).toEqual(assets)
  })

  it('rejects a partial installer set', () => {
    expect(() =>
      evaluateReleaseAssets('0.2.0-alpha.2', [
        'Quillarium-0.2.0-alpha.2-windows-x64.exe',
        'Quillarium-0.2.0-alpha.2-macos-x64.dmg'
      ])
    ).toThrow(/macos-arm64/)
  })
})
