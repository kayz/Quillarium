import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { DocEntry } from '../../app/types.js'
import {
  buildCharacterRelationTitle,
  CharacterRelationDialog,
  validateCharacterRelationDraft
} from './CharacterRelationDialog.js'

function doc(type: string, id: string, title: string, data: Record<string, unknown> = {}): DocEntry {
  return {
    path: `${type}/${id}.md`,
    data: { id, type, title, schema_version: 1, tags: [], ...data },
    content: ''
  }
}

describe('CharacterRelationDialog', () => {
  const first = doc('character', 'char-a', '甲')
  const second = doc('character', 'char-b', '乙')
  const opening = doc('timeline_node', 'time-1', '初见', {
    year: 1,
    month: 1,
    display_time: '元年一月'
  })
  const reversal = doc('timeline_node', 'time-3', '反目', {
    year: 1,
    month: 3,
    display_time: '元年三月'
  })

  it('renders author-facing relationship and validity controls', () => {
    const html = renderToStaticMarkup(
      <CharacterRelationDialog
        characters={[first, second]}
        timelineNodes={[reversal, opening]}
        initial={{
          fromCharacterId: first.data.id,
          toCharacterId: second.data.id,
          relationType: '朋友',
          startsAt: opening.data.id
        }}
        language="zh"
        busy={false}
        onClose={() => undefined}
        onConfirm={async () => undefined}
      />
    )

    expect(html).toContain('建立关系阶段')
    expect(html).toContain('关系名称')
    expect(html).toContain('从本节点起生效')
    expect(html).toContain('到本节点前有效')
    expect(html).toContain('role="combobox"')
    expect(html).toContain('初见 · 时间节点 · time-1')
  })

  it('requires a strictly later exclusive end node', () => {
    expect(
      validateCharacterRelationDraft(
        {
          fromCharacter: first.data.id,
          toCharacter: second.data.id,
          relationType: '朋友',
          startsAt: opening.data.id,
          endsAt: opening.data.id
        },
        [opening, reversal],
        'zh'
      )
    ).toContain('结束时间必须晚于开始时间')

    expect(
      validateCharacterRelationDraft(
        {
          fromCharacter: first.data.id,
          toCharacter: second.data.id,
          relationType: '朋友',
          startsAt: opening.data.id,
          endsAt: reversal.data.id
        },
        [opening, reversal],
        'zh'
      )
    ).toBe('')
  })

  it('builds a readable title without exposing document syntax', () => {
    expect(buildCharacterRelationTitle('甲', '乙', '朋友', 'mutual')).toBe('甲 ↔ 乙 · 朋友')
    expect(buildCharacterRelationTitle('甲', '乙', '敬畏', 'directed')).toBe('甲 → 乙 · 敬畏')
  })
})
