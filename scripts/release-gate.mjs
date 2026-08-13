import { appendFile, readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const VERSION_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/
const COMMIT_PATTERN = /^[0-9a-f]{40,64}$/i

export function evaluateReleaseGate({ tag, tagCommit, masterCommit, versions }) {
  if (!tag?.startsWith('v')) {
    throw new Error(`Release tag must start with "v": ${tag ?? '<missing>'}`)
  }

  const version = tag.slice(1)
  if (!VERSION_PATTERN.test(version)) {
    throw new Error(`Release tag is not a supported semantic version: ${tag}`)
  }

  if (!COMMIT_PATTERN.test(tagCommit ?? '') || !COMMIT_PATTERN.test(masterCommit ?? '')) {
    throw new Error('Tag and master commits must be complete hexadecimal commit IDs.')
  }
  if (tagCommit.toLowerCase() !== masterCommit.toLowerCase()) {
    throw new Error(`Release tag points to ${tagCommit}, but current master is ${masterCommit}.`)
  }

  const mismatches = versions.filter((item) => item.version !== version)
  if (mismatches.length > 0) {
    const details = mismatches.map((item) => `${item.path}=${item.version}`).join(', ')
    throw new Error(`Release tag ${tag} does not match every package version: ${details}`)
  }

  return {
    version,
    prerelease: version.includes('-')
  }
}

export async function readWorkspaceVersions(root = process.cwd()) {
  const manifestPaths = ['package.json']
  for (const parent of ['apps', 'packages']) {
    const entries = await readdir(path.join(root, parent), { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory()) {
        manifestPaths.push(path.join(parent, entry.name, 'package.json'))
      }
    }
  }

  const versions = []
  for (const manifestPath of manifestPaths.sort()) {
    const manifest = JSON.parse(await readFile(path.join(root, manifestPath), 'utf8'))
    if (typeof manifest.version !== 'string' || manifest.version.length === 0) {
      throw new Error(`Package manifest has no version: ${manifestPath}`)
    }
    versions.push({ path: manifestPath.replaceAll('\\', '/'), version: manifest.version })
  }
  return versions
}

function parseArguments(argv) {
  const values = new Map()
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index]
    const value = argv[index + 1]
    if (!name?.startsWith('--') || value === undefined) {
      throw new Error(`Invalid release-gate argument near: ${name ?? '<end>'}`)
    }
    values.set(name.slice(2), value)
  }
  return values
}

async function main() {
  const args = parseArguments(process.argv.slice(2))
  const result = evaluateReleaseGate({
    tag: args.get('tag'),
    tagCommit: args.get('tag-commit'),
    masterCommit: args.get('master-commit'),
    versions: await readWorkspaceVersions()
  })

  const githubOutput = args.get('github-output')
  if (githubOutput) {
    await appendFile(
      githubOutput,
      `version=${result.version}\nprerelease=${String(result.prerelease)}\n`,
      'utf8'
    )
  }
  process.stdout.write(`${JSON.stringify(result)}\n`)
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : ''
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
