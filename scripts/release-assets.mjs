import { readdir } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

export function expectedReleaseAssets(version) {
  return [
    `Quillarium-${version}-windows-x64.exe`,
    `Quillarium-${version}-macos-x64.dmg`,
    `Quillarium-${version}-macos-arm64.dmg`
  ]
}

export function evaluateReleaseAssets(version, actualNames) {
  const expected = expectedReleaseAssets(version)
  const actual = [...actualNames].sort()
  const missing = expected.filter((name) => !actual.includes(name))
  const unexpected = actual.filter((name) => !expected.includes(name))
  if (missing.length > 0 || unexpected.length > 0) {
    throw new Error(
      `Release asset set is incomplete or unexpected. Missing: ${missing.join(', ') || 'none'}. ` +
        `Unexpected: ${unexpected.join(', ') || 'none'}.`
    )
  }
  return expected
}

function parseArguments(argv) {
  const values = new Map()
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index]
    const value = argv[index + 1]
    if (!name?.startsWith('--') || value === undefined) {
      throw new Error(`Invalid release-assets argument near: ${name ?? '<end>'}`)
    }
    values.set(name.slice(2), value)
  }
  return values
}

async function main() {
  const args = parseArguments(process.argv.slice(2))
  const directory = args.get('dir')
  const version = args.get('version')
  if (!directory || !version) {
    throw new Error('Both --dir and --version are required.')
  }
  const entries = await readdir(directory, { withFileTypes: true })
  const files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name)
  const verified = evaluateReleaseAssets(version, files)
  process.stdout.write(`${JSON.stringify({ version, assets: verified })}\n`)
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : ''
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
