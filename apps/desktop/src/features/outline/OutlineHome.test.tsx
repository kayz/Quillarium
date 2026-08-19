import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { DocEntry, ProjectListItem } from '../../app/types.js'
import { OutlineHome } from './OutlineHome.js'

vi.mock('../../app/bridge.js', () => ({ bridge: {} }))

const noop = () => undefined
const noopAsync = async () => undefined
const project: ProjectListItem = {
  root: 'C:/projects/sample',
  id: 'sample',
  aliases: [],
  title: 'Sample',
  genre: 'fiction',
  target_words: 100_000,
  chapter_words: 3_000,
  section_words: 1_000
}

function renderOutlineHome(
  docs: DocEntry[],
  activeSection: 'issues' | 'world' | 'factions' | 'references',
  search = ''
): string {
  return renderToStaticMarkup(
    <OutlineHome
      docs={docs}
      doc={null}
      selectedTarget={null}
      activeSection={activeSection}
      leftOpen
      rightOpen={false}
      middlePct={62}
      viewMode="list"
      search={search}
      dirty={false}
      busy={false}
      project={project}
      onSection={noop}
      onToggleLeft={noop}
      onToggleRight={noop}
      onMiddlePct={noop}
      onSearch={noop}
      onViewMode={noop}
      onSelect={noop}
      onOpenVolume={noop}
      onCreate={noopAsync}
      onAIPlanningCreate={noop}
      onAIEditCard={noop}
      onUploadReferences={noopAsync}
      onAIExtractReference={noop}
      onPlanningCheck={noopAsync}
      onDelete={noopAsync}
      onOpenExternal={noopAsync}
      onReloadDoc={noopAsync}
      onReloadProject={noopAsync}
      onDocChange={noop}
      onInspectTag={noop}
      onSave={noopAsync}
      onImport={noop}
      language="zh"
    />
  )
}

describe('OutlineHome issue workflow', () => {
  it('keeps faction records, faction relations, and memberships in one dedicated workspace', () => {
    const docs: DocEntry[] = [
      {
        path: 'factions/faction-a.md',
        data: { id: 'faction-a', type: 'faction', title: '海灯会', faction_kind: 'guild' },
        content: ''
      },
      {
        path: 'factions/relations/relation-a.md',
        data: {
          id: 'relation-a',
          type: 'faction_relation',
          title: '海灯会与北港议会',
          from_faction: 'faction-a',
          to_faction: 'faction-b',
          relation_type: 'alliance'
        },
        content: ''
      },
      {
        path: 'factions/memberships/member-a.md',
        data: {
          id: 'member-a',
          type: 'faction_membership',
          title: '林澜属于海灯会',
          faction_id: 'faction-a',
          character_id: 'character-a',
          role: 'observer'
        },
        content: ''
      }
    ]

    const html = renderOutlineHome(docs, 'factions')
    expect(html).toContain('势力、关系与成员')
    expect(html).toContain('新增势力')
    expect(html).toContain('势力关系')
    expect(html).toContain('人物所属')
    expect(html.match(/class="outline-item/g)).toHaveLength(3)
    expect(html).toContain('setting-thumbnail-fallback')
  })

  it('renders the dedicated selection and batch actions in the planning issue section', () => {
    const issue: DocEntry = {
      path: 'issues/issue-one.md',
      data: {
        id: 'issue-one',
        type: 'issue',
        title: '时间线缺少节点',
        state: 'open',
        priority: 'high',
        related_docs: []
      },
      content: '事件没有稳定时间节点。'
    }
    const html = renderOutlineHome([issue], 'issues')

    expect(html).toContain('aria-label="问题批量操作"')
    expect(html).toContain('aria-label="选择 时间线缺少节点"')
    expect(html).toContain('全选')
    expect(html).toContain('反选')
    expect(html).toContain('忽略')
    expect(html).toContain('标记已解决')
    expect(html).toContain('恢复待处理')
    expect(html).not.toContain('>新增<')
  })

  it('bounds a large planning collection while searching the complete result set', () => {
    const worldEntries: DocEntry[] = Array.from({ length: 185 }, (_, index) => ({
      path: `world/world-${index + 1}.md`,
      data: {
        id: `WORLD-${String(index + 1).padStart(4, '0')}`,
        type: 'world_entry',
        title: `世界设定 ${index + 1}`,
        status: 'candidate'
      },
      content: `第 ${index + 1} 条世界设定。`
    }))

    const html = renderOutlineHome(worldEntries, 'world')
    const filteredHtml = renderOutlineHome(worldEntries, 'world', '世界设定 185')

    expect(html.match(/class="outline-item/g)).toHaveLength(48)
    expect(html).toContain('1–48 / 185')
    expect(html).not.toContain('世界设定 185')
    expect(filteredHtml).toContain('世界设定 185')
    expect(filteredHtml.match(/class="outline-item/g)).toHaveLength(1)
  })

  it('bounds the issue table without changing batch actions over the filtered result set', () => {
    const issues: DocEntry[] = Array.from({ length: 721 }, (_, index) => ({
      path: `issues/issue-${index + 1}.md`,
      data: {
        id: `ISSUE-${String(index + 1).padStart(4, '0')}`,
        type: 'issue',
        title: `问题 ${index + 1}`,
        state: 'open',
        priority: 'medium',
        related_docs: []
      },
      content: `第 ${index + 1} 个问题。`
    }))

    const html = renderOutlineHome(issues, 'issues')

    expect(html.match(/aria-label="选择 问题 /g)).toHaveLength(50)
    expect(html).toContain('1–50 / 721')
    expect(html).toContain('全选')
    expect(html).toContain('反选')
  })

  it('uses deterministic upload as the only reference creation action', () => {
    const html = renderOutlineHome([], 'references')

    expect(html).toContain('上传参考文档')
    expect(html).not.toContain('>新增<')
    expect(html).not.toContain('与 AI 对话新增')
  })
})
