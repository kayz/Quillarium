import { describe, expect, it, vi } from 'vitest'
import { checkForUpdates, compareVersionStrings } from './update-service.js'

const checkedAt = '2026-08-16T05:00:00.000Z'

function release(tag: string, options: { draft?: boolean; prerelease?: boolean } = {}) {
  return {
    tag_name: tag,
    name: `Quillarium ${tag}`,
    draft: options.draft ?? false,
    prerelease: options.prerelease ?? tag.includes('-'),
    published_at: '2026-08-16T04:00:00.000Z'
  }
}

function response(body: unknown, status = 200, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers }
  })
}

describe('semantic update version ordering', () => {
  it('orders numeric prereleases, named prereleases, and stable versions', () => {
    expect(compareVersionStrings('0.2.0-alpha.4', '0.2.0-alpha.3')).toBeGreaterThan(0)
    expect(compareVersionStrings('0.2.0-beta.1', '0.2.0-alpha.20')).toBeGreaterThan(0)
    expect(compareVersionStrings('0.2.0', '0.2.0-rc.9')).toBeGreaterThan(0)
    expect(compareVersionStrings('0.3.0-alpha.1', '0.2.9')).toBeGreaterThan(0)
    expect(compareVersionStrings('v1.0.0+build.2', '1.0.0+build.1')).toBe(0)
  })
})

describe('GitHub release update checks', () => {
  it('lets an alpha build discover later prereleases and stable releases', async () => {
    const fetchImpl = vi.fn(async () =>
      response([
        release('v0.2.0-alpha.3'),
        release('v0.2.0-alpha.5'),
        release('v0.2.0', { prerelease: false }),
        release('v9.0.0', { draft: true, prerelease: false })
      ])
    )

    await expect(checkForUpdates('0.2.0-alpha.4', fetchImpl, checkedAt)).resolves.toMatchObject({
      status: 'available',
      currentVersion: '0.2.0-alpha.4',
      latestVersion: '0.2.0',
      prerelease: false,
      reason: null
    })
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it('keeps stable builds on the stable channel', async () => {
    const fetchImpl = vi.fn(async () =>
      response([
        release('v0.3.0-alpha.1'),
        release('v0.2.1', { prerelease: false }),
        release('not-a-version', { prerelease: false })
      ])
    )

    await expect(checkForUpdates('0.2.0', fetchImpl, checkedAt)).resolves.toMatchObject({
      status: 'available',
      latestVersion: '0.2.1',
      prerelease: false
    })
  })

  it('reports up-to-date when no higher version exists', async () => {
    const fetchImpl = vi.fn(async () => response([release('v0.2.0-alpha.4'), release('v0.2.0-alpha.3')]))

    await expect(checkForUpdates('0.2.0-alpha.4', fetchImpl, checkedAt)).resolves.toMatchObject({
      status: 'up-to-date',
      latestVersion: '0.2.0-alpha.4'
    })
  })

  it('returns localizable unavailable states instead of throwing', async () => {
    const offline = vi.fn(async () => {
      throw new Error('offline')
    })
    await expect(checkForUpdates('0.2.0-alpha.4', offline, checkedAt)).resolves.toMatchObject({
      status: 'unavailable',
      reason: 'network'
    })

    const limited = vi.fn(async () =>
      response({ message: 'rate limited' }, 403, { 'x-ratelimit-remaining': '0' })
    )
    await expect(checkForUpdates('0.2.0-alpha.4', limited, checkedAt)).resolves.toMatchObject({
      status: 'unavailable',
      reason: 'rate-limited'
    })

    const empty = vi.fn(async () => response([]))
    await expect(checkForUpdates('0.2.0-alpha.4', empty, checkedAt)).resolves.toMatchObject({
      status: 'unavailable',
      reason: 'no-release'
    })
  })
})
