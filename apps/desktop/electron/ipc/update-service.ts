import type { UpdateCheckResult, UpdateUnavailableReason } from './contract.js'

export const QUILLARIUM_RELEASES_API = 'https://api.github.com/repos/kayz/Quillarium/releases?per_page=30'
export const QUILLARIUM_RELEASES_PAGE = 'https://github.com/kayz/Quillarium/releases'

interface ParsedVersion {
  version: string
  major: number
  minor: number
  patch: number
  prerelease: Array<number | string>
}

interface GitHubRelease {
  tag_name: string
  name: string | null
  draft: boolean
  prerelease: boolean
  published_at: string | null
}

export async function checkForUpdates(
  currentVersion: string,
  fetchImpl: typeof fetch = fetch,
  checkedAt = new Date().toISOString()
): Promise<UpdateCheckResult> {
  const current = parseSemanticVersion(currentVersion)
  if (!current) return unavailable(currentVersion, checkedAt, 'current-version-invalid')

  let response: Response
  try {
    response = await fetchImpl(QUILLARIUM_RELEASES_API, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': `Quillarium/${current.version}`,
        'X-GitHub-Api-Version': '2022-11-28'
      },
      signal: AbortSignal.timeout(10_000)
    })
  } catch {
    return unavailable(current.version, checkedAt, 'network')
  }

  if (!response.ok) {
    const rateLimited = response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0'
    return unavailable(current.version, checkedAt, rateLimited ? 'rate-limited' : 'service-error')
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    return unavailable(current.version, checkedAt, 'invalid-response')
  }
  if (!Array.isArray(payload)) return unavailable(current.version, checkedAt, 'invalid-response')

  const releases = payload.filter(isGitHubRelease)
  const latest = selectLatestRelease(current, releases)
  if (!latest) return unavailable(current.version, checkedAt, 'no-release')

  const latestVersion = parseSemanticVersion(latest.tag_name)!
  return {
    status: compareSemanticVersions(latestVersion, current) > 0 ? 'available' : 'up-to-date',
    currentVersion: current.version,
    latestVersion: latestVersion.version,
    releaseName: latest.name?.trim() || latest.tag_name,
    publishedAt: latest.published_at,
    prerelease: latest.prerelease || latestVersion.prerelease.length > 0,
    checkedAt,
    reason: null
  }
}

export function compareVersionStrings(left: string, right: string): number {
  const leftVersion = parseSemanticVersion(left)
  const rightVersion = parseSemanticVersion(right)
  if (!leftVersion || !rightVersion) throw new Error('Version must be valid semantic version text.')
  return compareSemanticVersions(leftVersion, rightVersion)
}

function selectLatestRelease(current: ParsedVersion, releases: GitHubRelease[]): GitHubRelease | null {
  const acceptsPrerelease = current.prerelease.length > 0
  let selected: { release: GitHubRelease; version: ParsedVersion } | null = null
  for (const release of releases) {
    if (release.draft) continue
    const version = parseSemanticVersion(release.tag_name)
    if (!version) continue
    if (!acceptsPrerelease && (release.prerelease || version.prerelease.length > 0)) continue
    if (!selected || compareSemanticVersions(version, selected.version) > 0) {
      selected = { release, version }
    }
  }
  return selected?.release ?? null
}

function parseSemanticVersion(value: string): ParsedVersion | null {
  const match = value
    .trim()
    .match(
      /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/
    )
  if (!match) return null
  const prerelease = match[4]
    ? match[4].split('.').map((part) => (/^(0|[1-9]\d*)$/.test(part) ? Number(part) : part))
    : []
  return {
    version: `${match[1]}.${match[2]}.${match[3]}${match[4] ? `-${match[4]}` : ''}`,
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease
  }
}

function compareSemanticVersions(left: ParsedVersion, right: ParsedVersion): number {
  for (const key of ['major', 'minor', 'patch'] as const) {
    if (left[key] !== right[key]) return left[key] > right[key] ? 1 : -1
  }
  if (left.prerelease.length === 0 || right.prerelease.length === 0) {
    if (left.prerelease.length === right.prerelease.length) return 0
    return left.prerelease.length === 0 ? 1 : -1
  }
  const length = Math.max(left.prerelease.length, right.prerelease.length)
  for (let index = 0; index < length; index += 1) {
    const leftPart = left.prerelease[index]
    const rightPart = right.prerelease[index]
    if (leftPart === undefined || rightPart === undefined) {
      if (leftPart === rightPart) return 0
      return leftPart === undefined ? -1 : 1
    }
    if (leftPart === rightPart) continue
    if (typeof leftPart === 'number' && typeof rightPart === 'number') {
      return leftPart > rightPart ? 1 : -1
    }
    if (typeof leftPart === 'number') return -1
    if (typeof rightPart === 'number') return 1
    return leftPart > rightPart ? 1 : -1
  }
  return 0
}

function isGitHubRelease(value: unknown): value is GitHubRelease {
  if (!value || typeof value !== 'object') return false
  const release = value as Record<string, unknown>
  return (
    typeof release['tag_name'] === 'string' &&
    (typeof release['name'] === 'string' || release['name'] === null) &&
    typeof release['draft'] === 'boolean' &&
    typeof release['prerelease'] === 'boolean' &&
    (typeof release['published_at'] === 'string' || release['published_at'] === null)
  )
}

function unavailable(
  currentVersion: string,
  checkedAt: string,
  reason: UpdateUnavailableReason
): UpdateCheckResult {
  return {
    status: 'unavailable',
    currentVersion,
    latestVersion: null,
    releaseName: null,
    publishedAt: null,
    prerelease: null,
    checkedAt,
    reason
  }
}
