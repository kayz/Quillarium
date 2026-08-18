import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { DocEntry } from '../../app/types.js'
import {
  MetadataEditor,
  PlanningCardSupportPanel,
  documentLinkIndexLoadKey,
  metadataGroupForField,
  shouldFetchDocumentLinkIndex
} from './OutlineShared.js'

describe('document link index loading', () => {
  it('does not refetch the project-wide index when the open card path changes', () => {
    expect(documentLinkIndexLoadKey('C:/novel', 'characters/a.md')).toBe('C:/novel')
    expect(documentLinkIndexLoadKey('C:/novel', 'characters/b.md')).toBe('C:/novel')
    expect(documentLinkIndexLoadKey('C:/novel', 'characters/a.md')).toBe(
      documentLinkIndexLoadKey('C:/novel', 'characters/b.md')
    )
  })

  it('skips the support-panel index fetch for ordinary character cards', () => {
    expect(shouldFetchDocumentLinkIndex('character')).toBe(false)
    expect(shouldFetchDocumentLinkIndex('character_relation')).toBe(false)
    expect(shouldFetchDocumentLinkIndex('timeline_node')).toBe(false)
    expect(shouldFetchDocumentLinkIndex('reference')).toBe(true)
    expect(shouldFetchDocumentLinkIndex('issue')).toBe(true)
  })
})

describe('friendly frontmatter fields', () => {
  it('groups identity, index, relation and detail fields without exposing serialization syntax', () => {
    expect(metadataGroupForField('status', 'active')).toBe('identity')
    expect(metadataGroupForField('tags', ['制度'])).toBe('index')
    expect(metadataGroupForField('triggers', ['通行证'])).toBe('index')
    expect(metadataGroupForField('category', 'pacing')).toBe('index')
    expect(metadataGroupForField('scope', 'chapter')).toBe('index')
    expect(metadataGroupForField('born_at', null)).toBe('identity')
    expect(metadataGroupForField('introduced_at', null)).toBe('identity')
    expect(metadataGroupForField('exited_at', null)).toBe('identity')
    expect(metadataGroupForField('died_at', null)).toBe('identity')
    expect(metadataGroupForField('used_in', [])).toBe('relations')
    expect(metadataGroupForField('historical_reference', '资料')).toBe('details')
  })

  it('keeps character appearance and life-cycle times in the expanded essentials section', () => {
    const timelineNodes = [
      {
        path: 'timeline/opening.md',
        data: { id: 'time-opening', type: 'timeline_node', title: '故事开篇', schema_version: 1, tags: [] },
        content: ''
      },
      {
        path: 'timeline/ending.md',
        data: { id: 'time-ending', type: 'timeline_node', title: '故事终章', schema_version: 1, tags: [] },
        content: ''
      }
    ] as DocEntry[]
    const html = renderToStaticMarkup(
      <MetadataEditor
        language="zh"
        docs={timelineNodes}
        data={{
          id: 'character-a',
          type: 'character',
          title: '甲',
          status: 'active',
          enabled: true,
          role: '主角',
          born_at: null,
          introduced_at: 'time-opening',
          exited_at: 'time-ending',
          died_at: null
        }}
        onChange={() => undefined}
      />
    )
    const essentialsStart = html.indexOf('<details class="metadata-section" open="">')
    const essentialsEnd = html.indexOf('</details>', essentialsStart)
    const essentials = html.slice(essentialsStart, essentialsEnd)

    expect(essentials).toContain('基本信息')
    expect(essentials).toContain('出生时间')
    expect(essentials).toContain('首次出场')
    expect(essentials).toContain('退场时间')
    expect(essentials).toContain('死亡时间')
    expect(essentials).toContain('故事开篇 · 时间节点')
    expect(essentials).toContain('故事终章 · 时间节点')
    expect(essentials.indexOf('首次出场')).toBeLessThan(essentials.indexOf('状态'))
    expect(essentials.indexOf('退场时间')).toBeLessThan(essentials.indexOf('人物定位'))
  })

  it('renders Chinese tag controls, object rows and collapsible groups instead of JSON textareas', () => {
    const html = renderToStaticMarkup(
      <MetadataEditor
        language="zh"
        data={{
          title: '河港制度',
          status: 'active',
          tags: ['制度'],
          triggers: ['通行证'],
          category_tags: ['交通'],
          used_in: [{ scene: 'scene-1', usage: '限制夜行' }],
          relationships: { 摆渡人: '知情者' }
        }}
        onChange={() => undefined}
        onInspectTag={() => undefined}
      />
    )
    expect(html).toContain('标签与索引')
    expect(html).toContain('#制度')
    expect(html).toContain('#通行证')
    expect(html).toContain('出现这些词时，系统可以把该世界书条目加入上下文')
    expect(html).toContain('按主题或知识类别组织世界书条目')
    expect(html).toContain('使用记录')
    expect(html).toContain('限制夜行')
    expect(html).not.toContain('value="河港制度"')
    expect(html).not.toContain('JSON')
    expect(html).not.toContain('<textarea')
    expect(html).not.toContain('category_tags')
  })

  it('keeps nested and unknown values visible through direct controls', () => {
    const html = renderToStaticMarkup(
      <MetadataEditor
        language="zh"
        data={{
          disclosure: [{ segment: '第二幕', reveal_after: 'scene-8' }],
          scene_state: { current_location: '河港', known_facts: ['密令', '暗门'] },
          unknown_nested: { 阶段: { 名称: '终局', 已确认: true } }
        }}
        onChange={() => undefined}
      />
    )
    expect(html).toContain('第二幕')
    expect(html).toContain('密令')
    expect(html).toContain('终局')
    expect(html).toContain('当前位置')
    expect(html).toContain('从导入材料或旧文档保留的附加信息；原字段为“unknown nested”')
    expect(html).not.toContain('unknown_nested')
    expect(html).not.toContain('&quot;known_facts&quot;')
    expect(html).not.toContain('[&quot;')
  })

  it('renders English field titles and explanations instead of serialization keys', () => {
    const html = renderToStaticMarkup(
      <MetadataEditor
        language="en"
        data={{
          type: 'world_entry',
          status: 'active',
          triggers: ['passport'],
          category_tags: ['transport'],
          valid_until: 'End of volume two',
          entry_status: 'active',
          historical_reference: 'Port regulations'
        }}
        onChange={() => undefined}
      />
    )

    expect(html).toContain('Trigger words')
    expect(html).toContain('Words that can activate this world entry')
    expect(html).toContain('Valid until')
    expect(html).toContain('blank means ongoing')
    expect(html).toContain('Historical reference')
    expect(html).not.toContain('category_tags')
    expect(html).not.toContain('valid_until')
    expect(html).not.toContain('entry_status')
  })

  it('does not expose legacy planning lifecycle fields on reference material', () => {
    const html = renderToStaticMarkup(
      <MetadataEditor
        language="zh"
        data={{
          type: 'reference',
          status: 'draft',
          enabled: true,
          source_refs: [],
          relations: [],
          material_type: 'book',
          reading_status: 'unread'
        }}
        onChange={() => undefined}
      />
    )

    expect(html).toContain('资料类型')
    expect(html).toContain('阅读状态')
    expect(html).not.toContain('表示这项内容目前处于哪个使用阶段')
    expect(html).not.toContain('只有启用的卡片才会自动进入提示词和 AI 检查')
  })

  it('uses story-tree levels for outlines rather than foreshadowing levels', () => {
    const html = renderToStaticMarkup(
      <MetadataEditor
        language="zh"
        data={{
          type: 'outline',
          level: 'volume',
          status: 'draft',
          parent: 'book-1',
          order: 1
        }}
        onChange={() => undefined}
      />
    )

    expect(html).toContain('故事树层级')
    expect(html).toContain('总览')
    expect(html).toContain('总纲')
    expect(html).toContain('卷')
    expect(html).not.toContain('>L1<')
  })

  it('localizes new card fields, enum values, and linked document types', () => {
    const docs = [
      {
        path: 'references/source.md',
        data: { id: 'reference-1', type: 'reference', schema_version: 1, title: '港口史料', tags: [] },
        content: ''
      },
      {
        path: 'timeline/node.md',
        data: { id: 'time-1', type: 'timeline_node', schema_version: 1, title: '二十年秋', tags: [] },
        content: ''
      },
      {
        path: 'characters/a.md',
        data: { id: 'character-a', type: 'character', schema_version: 1, title: '甲', tags: [] },
        content: ''
      },
      {
        path: 'characters/b.md',
        data: { id: 'character-b', type: 'character', schema_version: 1, title: '乙', tags: [] },
        content: ''
      }
    ] as DocEntry[]
    const html = renderToStaticMarkup(
      <MetadataEditor
        language="zh"
        docs={docs}
        data={{
          id: 'relation-1',
          type: 'character_relation',
          title: '同盟关系',
          enabled: true,
          source_refs: ['reference-1'],
          relations: [{ kind: 'depends_on', target_id: 'time-1', note: '战后成立' }],
          from_character: 'character-a',
          to_character: 'character-b',
          relation_type: '同盟',
          direction: 'mutual',
          starts_at: 'time-1',
          ends_at: null,
          visibility: 'private'
        }}
        onChange={() => undefined}
      />
    )

    expect(html).toContain('来源材料')
    expect(html).toContain('这张卡片从哪些参考材料中提取')
    expect(html).toContain('卡片关系')
    expect(html).toContain('依赖')
    expect(html).toContain('双向')
    expect(html).toContain('私下可知')
    expect(html).toContain('关系发出人物')
    expect(html).toContain('关系目标人物')
    expect(html).toContain('关系开始')
    expect(html).toContain('关系结束')
    expect(html).toContain('港口史料 · 参考材料')
    expect(html).toContain('二十年秋 · 时间节点')
    expect(html.indexOf('关系发出人物')).toBeLessThan(html.indexOf('来源材料'))
    expect(html).not.toContain('>source_refs<')
    expect(html).not.toContain('>from_character<')
    expect(html).not.toContain('>character_relation<')
  })

  it('localizes structured trigger fields and choices', () => {
    const html = renderToStaticMarkup(
      <MetadataEditor
        language="zh"
        data={{
          id: 'foreshadow-1',
          type: 'foreshadowing',
          title: '旧钥匙',
          trigger_conditions: [
            { kind: 'timeline_reached', target_id: '', keyword: '' },
            { kind: 'keyword', target_id: '', keyword: '旧钥匙' }
          ]
        }}
        onChange={() => undefined}
      />
    )

    expect(html).toContain('提醒条件')
    expect(html).toContain('触发方式')
    expect(html).toContain('到达时间节点')
    expect(html).toContain('目标卡片')
    expect(html).toContain('触发关键词')
    expect(html).not.toContain('>timeline_reached<')
    expect(html).not.toContain('>target_id<')
  })

  it('shows a live reverse index for reference material and AI repair actions for issue targets', () => {
    const docs = [
      {
        path: 'references/source.md',
        data: { id: 'reference-1', type: 'reference', title: '港口史料', tags: [] },
        content: 'source'
      },
      {
        path: 'world/permit.md',
        data: {
          id: 'world-permit',
          type: 'world_entry',
          title: '通行制度',
          status: 'active',
          enabled: true,
          source_refs: ['reference-1'],
          relations: []
        },
        content: 'rules'
      },
      {
        path: 'issues/check.md',
        data: {
          id: 'issue-1',
          type: 'issue',
          title: '制度冲突',
          status: 'open',
          enabled: true,
          source_refs: [],
          relations: [],
          related_docs: ['world-permit']
        },
        content: 'conflict'
      }
    ] as DocEntry[]

    const referenceHtml = renderToStaticMarkup(
      <PlanningCardSupportPanel
        doc={docs[0]}
        docs={docs}
        language="zh"
        onSelect={() => undefined}
        onAIEdit={() => undefined}
      />
    )
    const issueHtml = renderToStaticMarkup(
      <PlanningCardSupportPanel
        doc={docs[2]}
        docs={docs}
        language="zh"
        onSelect={() => undefined}
        onAIEdit={() => undefined}
      />
    )

    expect(referenceHtml).toContain('由此材料生成的卡片')
    expect(referenceHtml).toContain('通行制度')
    expect(issueHtml).toContain('问题处理与关联卡片')
    expect(issueHtml).toContain('与 AI 讨论修改')
  })
})
