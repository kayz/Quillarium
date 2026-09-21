import { describe, expect, it } from 'vitest'
import { selectionAfterSpecialize } from './selection-after-specialize.js'

describe('selectionAfterSpecialize', () => {
  it('maps specialize IPC result to the new target type and doc path', () => {
    const result = {
      path: 'characters/hero.md',
      data: {
        id: 'card-1',
        type: 'character',
        title: 'Hero'
      },
      content: '# Hero\n\nFormer world entry.'
    }

    expect(selectionAfterSpecialize(result)).toEqual({
      selectedTarget: { type: 'character', id: 'card-1' },
      doc: {
        path: 'characters/hero.md',
        data: {
          id: 'card-1',
          type: 'character',
          title: 'Hero'
        },
        content: '# Hero\n\nFormer world entry.'
      }
    })
  })

  it('stringifies id and type when IPC values are not strings', () => {
    const mapped = selectionAfterSpecialize({
      path: 'world/entry.md',
      data: {
        id: 42 as unknown as string,
        type: 'world_entry' as const,
        title: 'Entry'
      },
      content: 'body'
    })

    expect(mapped.selectedTarget).toEqual({ type: 'world_entry', id: '42' })
    expect(mapped.doc.path).toBe('world/entry.md')
  })
})
