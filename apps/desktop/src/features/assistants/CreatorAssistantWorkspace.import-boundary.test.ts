import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('CreatorAssistantWorkspace browser import boundary', () => {
  it('loads workflow guards through the browser-safe core subpath', async () => {
    const source = await readFile(new URL('./CreatorAssistantWorkspace.tsx', import.meta.url), 'utf8')

    expect(source).toContain("from '@quillarium/core/assistant-workflows'")
    expect(source).not.toMatch(/import\s+\{[^}]*\}\s+from\s+['"]@quillarium\/core['"]/su)
  })
})
