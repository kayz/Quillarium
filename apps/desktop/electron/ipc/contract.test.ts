import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ipcDir = path.dirname(fileURLToPath(import.meta.url))
const electronDir = path.dirname(ipcDir)

describe('desktop IPC contract', () => {
  it('keeps the contract, handlers, and both preload implementations on the same 84 channels', async () => {
    const [contract, preloadTypeScript, preloadCommonJs, ipcFiles] = await Promise.all([
      readFile(path.join(ipcDir, 'contract.ts'), 'utf8'),
      readFile(path.join(electronDir, 'preload.ts'), 'utf8'),
      readFile(path.join(electronDir, 'preload.cjs'), 'utf8'),
      readdir(ipcDir)
    ])
    const handlerSources = await Promise.all(
      ipcFiles
        .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts') && file !== 'contract.ts')
        .map((file) => readFile(path.join(ipcDir, file), 'utf8'))
    )

    const contractBlock = contract.match(
      /export const QUILLARIUM_API_CHANNELS = \{([\s\S]*?)\n\} as const/
    )?.[1]
    expect(contractBlock).toBeTruthy()
    const contractChannels = matches(contractBlock!, /^\s{2}\w+: '([^']+)'/gm)
    const handlerChannels = matches(handlerSources.join('\n'), /typedHandle\(\s*'([^']+)'/g)
    const typeScriptChannels = matches(preloadTypeScript, /\binvoke\('([^']+)'/g)
    const commonJsChannels = matches(preloadCommonJs, /ipcRenderer\.invoke\('([^']+)'/g)

    expectUniqueCount(contractChannels, 84)
    expectUniqueCount(handlerChannels, 84)
    expectUniqueCount(typeScriptChannels, 84)
    expectUniqueCount(commonJsChannels, 84)
    expect(new Set(handlerChannels)).toEqual(new Set(contractChannels))
    expect(new Set(typeScriptChannels)).toEqual(new Set(contractChannels))
    expect(new Set(commonJsChannels)).toEqual(new Set(contractChannels))
  })
})

function matches(source: string, pattern: RegExp): string[] {
  return [...source.matchAll(pattern)].map((match) => match[1])
}

function expectUniqueCount(values: string[], expected: number): void {
  expect(values).toHaveLength(expected)
  expect(new Set(values).size).toBe(expected)
}
