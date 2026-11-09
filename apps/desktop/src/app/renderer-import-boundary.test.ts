import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const srcDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

async function collectRendererSourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const out: string[] = []
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...(await collectRendererSourceFiles(fullPath)))
    } else if (
      (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) &&
      !entry.name.endsWith('.test.ts') &&
      !entry.name.endsWith('.test.tsx')
    ) {
      out.push(fullPath)
    }
  }
  return out
}

describe('renderer browser import boundary', () => {
  it('never imports runtime values from the root @quillarium/core barrel', async () => {
    const files = await collectRendererSourceFiles(srcDir)
    const violations: string[] = []
    for (const file of files) {
      const source = await readFile(file, 'utf8')
      const matches = source.matchAll(/import\s+(?!type\b)\{([^}]*)\}\s+from\s+['"]@quillarium\/core['"]/gsu)
      for (const match of matches) {
        const specifiers = match[1]!
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
        const hasRuntimeSpecifier = specifiers.some((spec) => !spec.startsWith('type '))
        if (hasRuntimeSpecifier) {
          violations.push(path.relative(srcDir, file))
        }
      }
    }
    expect(violations).toEqual([])
  })
})
