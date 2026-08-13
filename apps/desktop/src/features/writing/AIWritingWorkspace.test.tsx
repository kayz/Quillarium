import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { ContextPacketSummary, DocEntry } from '../../app/types.js'
import { AIWritingWorkspace } from './AIWritingWorkspace.js'
import { Inspector, RunPanel } from './InspectorRun.js'

vi.mock('../../app/bridge.js', () => ({ bridge: {} }))

const chapter: DocEntry = {
  path: 'outlines/chapter-one.md',
  data: {
    id: 'chapter-one',
    type: 'outline',
    title: '第一章',
    status: 'draft',
    level: 'chapter'
  },
  content: ''
}

const openingScene: DocEntry = {
  path: 'scenes/scene-opening.md',
  data: {
    id: 'scene-opening',
    type: 'scene',
    title: '第一节',
    status: 'draft',
    chapter_id: 'chapter-one',
    section: 'chapter-one',
    order: 1
  },
  content: ''
}

const navigationCallbacks = {
  onScenePrepared: async () => undefined,
  onSelectScene: () => undefined,
  onOpenProse: () => undefined
}

const openingTimeline: DocEntry = {
  path: 'timeline/opening.md',
  data: {
    id: 'event-opening',
    type: 'timeline_event',
    title: 'Opening Event',
    status: 'confirmed'
  },
  content: '关联章节: 1-3'
}

const openingLocation: DocEntry = {
  path: 'locations/opening.md',
  data: {
    id: 'location-opening',
    type: 'location',
    title: 'Opening Room',
    status: 'confirmed'
  },
  content: ''
}

const openingCharacter: DocEntry = {
  path: 'characters/opening.md',
  data: {
    id: 'character-opening',
    type: 'character',
    title: 'Opening POV',
    status: 'active'
  },
  content: ''
}

describe('AIWritingWorkspace', () => {
  it('gives the adjusted prompt a dedicated full workspace before generation', () => {
    const html = renderToStaticMarkup(
      <AIWritingWorkspace
        root="C:/project"
        docs={[chapter, openingScene]}
        runs={[]}
        outline={chapter}
        scene={openingScene}
        context="assembled context"
        contextPacket={null}
        checkReport={null}
        assembledPrompt="作者调整后的提示词"
        busy={false}
        onPromptChange={() => undefined}
        onCheck={async () => undefined}
        onGenerate={async () => undefined}
        onDelete={async () => undefined}
        onAccepted={async () => undefined}
        {...navigationCallbacks}
        language="zh"
      />
    )

    expect(html).toContain('1 · 提示词')
    expect(html).toContain('2 · 上下文与检查')
    expect(html).toContain('3 · 候选稿与运行')
    expect(html).toContain('作者调整后的提示词')
    expect(html).toContain('生成 3 稿')
    expect(html).toContain('候选数')
    expect(html).toContain('run/prompt.md')
  })

  it('shows grouped candidates as selectable, checkable, and branchable without implying acceptance', () => {
    const html = renderToStaticMarkup(
      <RunPanel
        root="C:/project"
        runs={[
          {
            id: 'run-a',
            scene_id: 'scene-opening',
            status: 'generated',
            model: 'sample-model',
            created_at: '2026-08-13T00:00:00.000Z',
            candidate_group_id: 'candidate-group-one',
            candidate_index: 0,
            branch_id: 'main',
            selected_at: '2026-08-13T00:01:00.000Z'
          },
          {
            id: 'run-b',
            scene_id: 'scene-opening',
            status: 'checked',
            model: 'sample-model',
            created_at: '2026-08-13T00:00:00.000Z',
            candidate_group_id: 'candidate-group-one',
            candidate_index: 1,
            branch_id: 'main'
          }
        ]}
        sceneId="scene-opening"
        onAccepted={async () => undefined}
        onBranch={async () => undefined}
        language="zh"
      />
    )

    expect(html).toContain('候选对比')
    expect(html).toContain('检查本稿')
    expect(html).toContain('从本稿分支')
    expect(html).toContain('已选中')
    expect(html).toContain('采纳原文')
  })

  it('shows the selected timeline title in the assembled context inspector', () => {
    const contextPacket: ContextPacketSummary = {
      target: { type: 'outline', id: 'chapter-one', title: '第一章', level: 'chapter' },
      canon: [],
      strategies: [],
      patterns: [],
      narratives: [],
      timeline_nodes: [],
      timeline: [openingTimeline],
      characters: [openingCharacter],
      character_states: [],
      locations: [openingLocation],
      world_entries: [],
      foreshadowing: [],
      issues: [],
      prompt_blocks: [],
      context_trace: {
        tokenizer: { id: 'deepseek-v4', provider: 'deepseek', model: 'deepseek-v4-flash', exact: true },
        policy: { token_budget: 24000, max_candidates: 256, max_recursion_depth: 2 },
        budget: {
          total_token_budget: 24000,
          reserved_output_tokens: 2000,
          framing_tokens: 64,
          available_input_tokens: 21936,
          selected_tokens: 128,
          unused_input_tokens: 21808,
          token_budget: 21936,
          used_tokens: 128,
          remaining_tokens: 21808
        },
        candidates: {
          discovered: 3,
          eligible: 3,
          limit: 256,
          max_recursion_depth: 2,
          reached_recursion_depth: 0
        },
        entries: []
      },
      warnings: [],
      included_ids: ['event-opening', 'location-opening', 'character-opening'],
      excluded_ids: []
    }

    const html = renderToStaticMarkup(
      <Inspector
        docs={[chapter, openingTimeline, openingLocation, openingCharacter]}
        scene={openingScene}
        outline={chapter}
        context="assembled context"
        contextPacket={contextPacket}
        checkReport={null}
        onCheck={async () => undefined}
        language="zh"
      />
    )

    expect(html).toContain('时间线：1')
    expect(html).toContain('Opening Event')
    expect(html).toContain('地点：1')
    expect(html).toContain('Opening Room')
    expect(html).toContain('人物：1')
    expect(html).toContain('Opening POV')
    expect(html).toContain('检查当前节')
  })

  it('describes default prompt sources as removable instead of locking them', () => {
    const html = renderToStaticMarkup(
      <AIWritingWorkspace
        root="C:/project"
        docs={[chapter, openingScene]}
        runs={[]}
        outline={chapter}
        scene={openingScene}
        context=""
        contextPacket={null}
        checkReport={null}
        assembledPrompt="assembled"
        busy={false}
        onPromptChange={() => undefined}
        onCheck={async () => undefined}
        onGenerate={async () => undefined}
        onDelete={async () => undefined}
        onAccepted={async () => undefined}
        {...navigationCallbacks}
        language="zh"
      />
    )

    expect(html).not.toContain('章和节为必选来源')
    expect(html).not.toContain('LockKeyhole')
  })

  it('shows every scene beside the manually editable chapter prose entry', () => {
    const secondScene: DocEntry = {
      ...openingScene,
      path: 'scenes/scene-second.md',
      data: { ...openingScene.data, id: 'scene-second', title: '第二节', order: 2 }
    }
    const html = renderToStaticMarkup(
      <AIWritingWorkspace
        root="C:/project"
        docs={[chapter, openingScene, secondScene]}
        runs={[]}
        outline={chapter}
        scene={null}
        context=""
        contextPacket={null}
        checkReport={null}
        assembledPrompt=""
        busy={false}
        onPromptChange={() => undefined}
        onCheck={async () => undefined}
        onGenerate={async () => undefined}
        onDelete={async () => undefined}
        onAccepted={async () => undefined}
        {...navigationCallbacks}
        language="zh"
      />
    )

    expect(html).toContain('节与章正文')
    expect(html).toContain('第一节')
    expect(html).toContain('第二节')
    expect(html).toContain('章正文')
    expect(html).toContain('增加节')
  })

  it('allows the next scene when the current scene is accepted but chapter prose remains draft', () => {
    const acceptedScene: DocEntry = {
      ...openingScene,
      data: {
        ...openingScene.data,
        accepted_at: '2026-08-13T00:00:00.000Z'
      }
    }
    const draftProse: DocEntry = {
      path: 'chapters/chapter-one.md',
      data: {
        id: 'prose-chapter-one',
        type: 'chapter_prose',
        title: '第一章 正文',
        status: 'draft',
        chapter_id: 'chapter-one',
        scene_ids: ['scene-opening']
      },
      content: '已经接受的第一节。'
    }
    const html = renderToStaticMarkup(
      <AIWritingWorkspace
        root="C:/project"
        docs={[chapter, acceptedScene, draftProse]}
        runs={[]}
        outline={chapter}
        scene={acceptedScene}
        context=""
        contextPacket={null}
        checkReport={null}
        assembledPrompt=""
        busy={false}
        onPromptChange={() => undefined}
        onCheck={async () => undefined}
        onGenerate={async () => undefined}
        onDelete={async () => undefined}
        onAccepted={async () => undefined}
        {...navigationCallbacks}
        language="zh"
      />
    )

    expect(html).toContain('新增下一节')
  })

  it('explains why a finalized chapter cannot add or edit scenes', () => {
    const finalProse: DocEntry = {
      path: 'chapters/chapter-one.md',
      data: {
        id: 'prose-chapter-one',
        type: 'chapter_prose',
        title: '第一章 正文',
        status: 'final',
        chapter_id: 'chapter-one',
        scene_ids: ['scene-opening']
      },
      content: '已定稿正文。'
    }
    const html = renderToStaticMarkup(
      <AIWritingWorkspace
        root="C:/project"
        docs={[chapter, openingScene, finalProse]}
        runs={[]}
        outline={chapter}
        scene={null}
        context=""
        contextPacket={null}
        checkReport={null}
        assembledPrompt=""
        busy={false}
        onPromptChange={() => undefined}
        onCheck={async () => undefined}
        onGenerate={async () => undefined}
        onDelete={async () => undefined}
        onAccepted={async () => undefined}
        {...navigationCallbacks}
        language="zh"
      />
    )

    expect(html).toContain('第一节')
    expect(html).toContain('正文已定稿，不能新增或修改节')
  })
})
