import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  appendTimelineEvent,
  assembleContext,
  assembleContextPacket,
  buildChapterWritingPlan,
  buildImportPrompt,
  buildIndex,
  confirmFinalizeImpact,
  createCanon,
  createFinalizeReviewSession,
  createCharacter,
  createCharacterState,
  createForeshadowing,
  createImportSessionPlan,
  createLocation,
  createOutline,
  createPattern,
  createProject,
  createRoute,
  createScene,
  createStrategy,
  createWorldEntry,
  importMarkdownPath,
  landImportSession,
  listDocs,
  loadImportSession,
  pathExists,
  type ForeshadowingDoc,
  type OutlineDoc,
  type PatternDoc
} from './index.js'

describe('core project flow', () => {
  it('creates a project and assembles context', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'quillarium-'))
    try {
      const project = await createProject({ vault: tmp, title: 'Test Novel', genre: 'test' })
      expect(await pathExists(path.join(project.root, 'project.yaml'))).toBe(true)
      expect(await pathExists(path.join(project.root, 'foreshadowing'))).toBe(true)
      expect(await pathExists(path.join(project.root, 'world'))).toBe(true)
      expect(await pathExists(path.join(project.root, 'references'))).toBe(true)
      expect(await pathExists(path.join(project.root, 'issues'))).toBe(true)
      expect(await pathExists(path.join(project.root, 'strategy'))).toBe(true)
      expect(await pathExists(path.join(project.root, 'character-states'))).toBe(true)
      expect(await pathExists(path.join(project.root, 'patterns'))).toBe(true)
      expect(await pathExists(path.join(project.root, 'prompts', 'background-import.md'))).toBe(true)

      await createCanon(project.root, 'Core Rule', 'Do not break canon.')
      const charFile = await createCharacter(project.root, 'Asha', {
        ooc_guardrails: ['Do not become childish.']
      })
      const locFile = await createLocation(project.root, 'Old Palace')
      await createRoute(project.root, 'loc-old-palace', 'loc-old-road')
      const evtFile = await appendTimelineEvent(project.root, 'Opening Night', { location: 'loc-old-palace' })
      const outlineFile = await createOutline(project.root, 'section', 'Opening Section')

      const charId = path.basename(charFile).split('-Asha')[0]
      const locId = path.basename(locFile).split('-Old')[0]
      const evtId = path.basename(evtFile).split('-Opening')[0]
      const sectionId = path.basename(outlineFile).split('-Opening')[0]

      await createScene(project.root, 'Opening Scene', {
        section: sectionId,
        timeline_node: evtId,
        location: locId,
        pov: charId,
        characters: [charId]
      })
      const scenes = await listDocs(project.root, 'scene')
      const context = await assembleContext(project.root, scenes[0].data.id)
      expect(context).toContain('Do not break canon')
      expect(context).toContain('Asha')
      const index = await buildIndex(project.root)
      expect(index.entries.length).toBeGreaterThan(0)
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  it('imports Writer-style Markdown frontmatter', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'quillarium-import-'))
    try {
      const project = await createProject({ vault: tmp, title: 'Import Novel', genre: 'historical' })
      const source = path.join(tmp, 'FB-L4-001.md')
      await writeFile(
        source,
        `---\n类型: 伏笔\nID: FB-L4-001\n级别: L4\n一句话: 旧船队还在\n计划埋设章节: 第十章\n安全失效期: 第二十章\n状态: 待埋设\n关联人物:\n  - 朱祁镇\n---\n\n## 说明\n\n正统八年海船伏笔。\n`,
        'utf8'
      )

      const results = await importMarkdownPath(project.root, source)
      expect(results).toHaveLength(1)
      expect(results[0].imported_type).toBe('foreshadowing')
      const foreshadowing = await listDocs<ForeshadowingDoc>(project.root, 'foreshadowing')
      expect(foreshadowing[0].data.code).toBe('FB-L4-001')
      expect(foreshadowing[0].data.level).toBe('L4')
      expect(foreshadowing[0].data.expires_at).toBe('第二十章')
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  it('assembles outline context packets with inherited filters', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'quillarium-packet-'))
    try {
      const project = await createProject({ vault: tmp, title: 'Packet Novel', genre: 'test' })
      await createCanon(project.root, 'Hard Rule', 'Accepted prose is the strongest anchor.')
      await createStrategy(project.root, 'Web Serial Rhythm', {
        principles: ['End chapters with forward pressure.']
      })
      const charFile = await createCharacter(project.root, 'Lin')
      const charId = path.basename(charFile).split('-Lin')[0]
      const eventFile = await appendTimelineEvent(project.root, 'First Turn', { characters: [charId] })
      const eventId = path.basename(eventFile).split('-First')[0]
      const worldFile = await createWorldEntry(project.root, 'Cloisonne Guild', {
        triggers: ['guild'],
        role: 'constraint'
      })
      const worldId = path.basename(worldFile).split('-Cloisonne')[0]
      const fbFile = await createForeshadowing(project.root, 'Blue Fire', {
        level: 'L3',
        related_characters: [charId],
        planned_plant: '第一章',
        planned_resolve: '第十章'
      })
      const fbId = path.basename(fbFile, '.md')
      const bookFile = await createOutline(project.root, 'book', 'Book Plan', {
        context_pins: [worldId],
        related_characters: [charId]
      })
      const bookId = path.basename(bookFile).split('-Book')[0]
      const chapterFile = await createOutline(project.root, 'chapter', 'Chapter One', {
        parent: bookId,
        related_timeline: [eventId],
        related_characters: [charId],
        related_foreshadowing: [fbId]
      })
      const chapterId = path.basename(chapterFile).split('-Chapter')[0]
      await createCharacterState(project.root, 'Lin before chapter', {
        character: charId,
        scope_type: 'outline',
        scope_id: chapterId,
        emotion: 'watchful'
      })

      const packet = await assembleContextPacket(project.root, { type: 'outline', id: chapterId })
      expect(packet.outline_chain.map((item) => item.data.title)).toEqual(['Book Plan', 'Chapter One'])
      expect(packet.world_entries.map((item) => item.data.id)).toContain(worldId)
      expect(packet.timeline.map((item) => item.data.id)).toContain(eventId)
      expect(packet.character_states[0].data.emotion).toBe('watchful')
      expect(packet.foreshadowing.map((item) => item.data.id)).toContain(fbId)
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  it('imports strategy Markdown separately from canon', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'quillarium-strategy-'))
    try {
      const project = await createProject({ vault: tmp, title: 'Strategy Novel', genre: 'test' })
      const source = path.join(tmp, '叙事策略.md')
      await writeFile(
        source,
        `---\n类型: 叙事策略\n分类: 节奏\n原则:\n  - 每章有推进\n避免:\n  - 空转解释\n---\n\n## 节奏\n\n保持网文章节推进。\n`,
        'utf8'
      )
      const results = await importMarkdownPath(project.root, source)
      expect(results[0].imported_type).toBe('strategy')
      const strategies = await listDocs(project.root, 'strategy')
      const canon = await listDocs(project.root, 'canon')
      expect(strategies).toHaveLength(1)
      expect(canon).toHaveLength(0)
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  it('imports Writer-native pattern and outline fields', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'quillarium-writer-import-'))
    try {
      const project = await createProject({ vault: tmp, title: '景泰蓝', genre: 'historical-political' })
      const patternSource = path.join(tmp, '卷节奏模式.md')
      await writeFile(
        patternSource,
        `---\n类型: 模式\n模式类型: story\n作用层级: volume\n适用:\n  - historical\n  - political\n来源: ai\n---\n\n## 卷节奏\n\n本卷需要以身份跃迁收束。\n`,
        'utf8'
      )
      const outlineSource = path.join(tmp, '第一卷.md')
      await writeFile(
        outlineSource,
        `---\n类型: 卷纲\n标题: 第一卷 北京危局\n读者收益: 主角完成第一次承担\n本卷目标: 守住北京\n事件链:\n  - 监国入局\n  - 北京保卫\n人物成长:\n  - 朱祁钰: 惶恐 -> 承担\n五循环:\n  - desire\n  - pressure\n  - growth\n---\n\n## 第一卷\n\n守城、立威、开改革入口。\n`,
        'utf8'
      )

      const results = await importMarkdownPath(project.root, tmp)
      expect(results.some((item) => item.imported_type === 'pattern')).toBe(true)
      expect(results.some((item) => item.imported_type === 'outline')).toBe(true)
      const patterns = await listDocs<PatternDoc>(project.root, 'pattern')
      expect(patterns[0].data.kind).toBe('story')
      expect(patterns[0].data.scope).toBe('volume')
      expect(patterns[0].data.source).toBe('ai')
      const outlines = await listDocs<OutlineDoc>(project.root, 'outline')
      const volume = outlines.find((item) => item.data.level === 'volume')
      expect(volume?.data.reader_benefit).toBe('主角完成第一次承担')
      expect(volume?.data.volume_goal).toBe('守住北京')
      expect(volume?.data.event_chain).toEqual(['监国入局', '北京保卫'])
      expect(volume?.data.writer_cycles).toEqual(['desire', 'pressure', 'growth'])
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  it('stores Writer-native four-level outlines and patterns', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'quillarium-agent-'))
    try {
      const project = await createProject({ vault: tmp, title: '景泰蓝', genre: 'historical-political' })
      const storyPatternFile = await createPattern(project.root, '卷末身份跃迁', {
        id: 'pattern-volume-status-rise',
        kind: 'story',
        scope: 'volume',
        applies_to: ['historical', 'political'],
        source: 'user'
      })
      const writingPatternFile = await createPattern(project.root, '权谋对话压迫感', {
        id: 'pattern-political-dialogue-pressure',
        kind: 'writing',
        scope: 'chapter',
        applies_to: ['historical-political'],
        source: 'accepted_prose'
      })
      expect(storyPatternFile).toContain('pattern-volume-status-rise')
      expect(writingPatternFile).toContain('pattern-political-dialogue-pressure')
      const storyPatternId = 'pattern-volume-status-rise'
      const writingPatternId = 'pattern-political-dialogue-pressure'

      const bookFile = await createOutline(project.root, 'book', '全书总纲', {
        id: 'book-master-outline',
        reader_promise: '现代基层治理经验进入皇权躯壳。',
        core_appeal: ['制度设计', '危局翻盘'],
        core_suspense: ['朱祁钰如何重塑大明'],
        genre_boundary: ['不写技术百科全书式碾压'],
        related_patterns: [storyPatternId]
      })
      expect(bookFile).toContain('book-master-outline')
      const bookId = 'book-master-outline'

      const volumeFile = await createOutline(project.root, 'volume', '第一卷 北京危局', {
        id: 'volume-01',
        parent: bookId,
        volume_goal: '守住北京，确认新皇合法性。',
        reader_payoff: '主角从求生转为承担。',
        event_chain: ['监国入局', '北京保卫', '战后整顿'],
        character_growth: ['朱祁钰: 惶恐 -> 承担'],
        writer_cycles: ['desire', 'pressure', 'growth', 'relationship'],
        related_patterns: [storyPatternId]
      })
      expect(volumeFile).toContain('volume-01')
      const volumeId = 'volume-01'

      const arcFile = await createOutline(project.root, 'arc', '城防与朝局段', {
        id: 'arc-city-defense',
        parent: volumeId,
        conflict_ladder: ['廷议施压', '军务失衡', '民心动摇'],
        cast_lock: ['char-jingtai', 'char-yuqian'],
        fixed_reveals: ['京师粮储不足'],
        foreshadowing_planted: ['fb-old-fleet'],
        foreshadowing_resolved: ['fb-court-loyalty']
      })
      expect(arcFile).toContain('arc-city-defense')
      const arcId = 'arc-city-defense'

      await createOutline(project.root, 'chapter', '第一章 危城', {
        id: 'chapter-001',
        parent: arcId,
        chapter_goal: '让主角意识到局势无法靠躲避解决。',
        chapter_conflict: '群臣要他表态，军报不断逼近。',
        chapter_change: '主角从旁观转为下令。',
        reader_benefit: '看到现代治理能力第一次起效。',
        ending_hook: '于谦带来更坏的军报。',
        related_patterns: [writingPatternId]
      })

      const packet = await assembleContextPacket(project.root, { type: 'outline', id: arcId })
      expect(packet.patterns.map((item) => item.data.id)).toContain(storyPatternId)
      expect(packet.outline_chain.map((item) => item.data.title)).toEqual([
        '全书总纲',
        '第一卷 北京危局',
        '城防与朝局段'
      ])
      const outlines = await listDocs<OutlineDoc>(project.root, 'outline')
      const volume = outlines.find((item) => item.data.id === volumeId)
      expect(volume?.data.volume_goal).toBe('守住北京，确认新皇合法性。')
      expect(volume?.data.writer_cycles).toContain('growth')
      expect(outlines.find((item) => item.data.id === bookId)?.data.reader_promise).toContain('皇权躯壳')
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  it('plans AI import sessions with source index and confirmation issues', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'quillarium-ai-import-'))
    try {
      const project = await createProject({ vault: tmp, title: 'AI Import Novel', genre: 'test' })
      const source = path.join(tmp, 'new-note.md')
      await writeFile(source, '# 新地点\n\n玉河桥是进城必经之处。', 'utf8')
      const aiResponse = JSON.stringify({
        summary: '识别出一个地点',
        items: [
          {
            type: 'location',
            title: '玉河桥',
            confidence: 0.91,
            frontmatter: { description: '进城必经之处', tags: ['地标'] },
            content: '## 地点\n\n玉河桥是进城必经之处。',
            reason: '文本描述地点',
            questions: []
          }
        ],
        issues: [
          {
            title: '玉河桥时间有效性',
            priority: 'medium',
            decision_needed: '确认玉河桥是否在本书全部时间段存在。',
            related_items: ['玉河桥']
          }
        ]
      })
      const session = await createImportSessionPlan(project.root, {
        sourceKind: 'file',
        sourcePaths: [source],
        aiResponse
      })
      expect(session.status).toBe('needs-confirmation')
      expect(session.issues[0].state).toBe('open')
      expect(buildImportPrompt(session)).toContain('玉河桥')
      const answered = await loadImportSession(project.root, session.id)
      answered.issues = answered.issues.map((issue) => ({ ...issue, state: 'resolved', answer: '全书有效' }))
      await writeFile(
        path.join(project.root, 'imports', `${session.id}.json`),
        `${JSON.stringify(answered, null, 2)}\n`,
        'utf8'
      )
      const landed = await landImportSession(project.root, session.id)
      expect(landed.landed[0].type).toBe('location')
      const locations = await listDocs(project.root, 'location')
      expect(locations.some((doc) => doc.data.title === '玉河桥')).toBe(true)
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  it('creates finalize review sessions and chapter scene prompt plans', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'quillarium-finalize-'))
    try {
      const project = await createProject({ vault: tmp, title: 'Finalize Novel', genre: 'test' })
      await createCanon(project.root, 'Core Rule', '不能改变主角出身。')
      const charFile = await createCharacter(project.root, '沈青')
      const charId = path.basename(charFile).split('-')[0]
      const locFile = await createLocation(project.root, '书房')
      const locId = path.basename(locFile).split('-')[0]
      const eventFile = await appendTimelineEvent(project.root, '夜谈', {
        location: locId,
        characters: [charId]
      })
      const eventId = path.basename(eventFile).split('-')[0]
      await createOutline(project.root, 'chapter', '第一章 夜谈', {
        id: 'chapter-001',
        chapter_goal: '让沈青接下任务。'
      })
      const chapterId = 'chapter-001'
      await createScene(
        project.root,
        '开场',
        {
          id: 'scene-opening',
          status: 'final',
          section: chapterId,
          timeline_node: eventId,
          location: locId,
          pov: charId,
          characters: [charId],
          scene_goal: '进入书房',
          tags: ['volume-01', 'chapter-001']
        },
        '他推开书房的门，烛火安静地伏在案上。'
      )
      await createScene(
        project.root,
        '交锋',
        {
          id: 'scene-clash',
          section: chapterId,
          timeline_node: eventId,
          location: locId,
          pov: charId,
          characters: [charId],
          scene_goal: '接下任务',
          tags: ['volume-01', 'chapter-001']
        },
        '## 节纲\n\n沈青被迫表态。'
      )

      const review = await createFinalizeReviewSession(project.root, {
        chapterId,
        sceneIds: ['scene-opening', 'scene-clash'],
        draft: '沈青犹豫。',
        final: '沈青接过密信，决定出城。',
        aiResponse: JSON.stringify({
          summary: '人物状态发生变化',
          impacts: [
            {
              target_type: 'character_state',
              title: '沈青接任务后状态',
              confidence: 0.86,
              change: '新增知道密信并决定出城',
              evidence: '接过密信，决定出城',
              requires_confirmation: true
            }
          ],
          questions: []
        })
      })
      expect(review.status).toBe('needs-confirmation')
      const confirmed = await confirmFinalizeImpact(project.root, review.id, review.impacts[0].id, '确认')
      expect(confirmed.status).toBe('ready-to-apply')

      const plan = await buildChapterWritingPlan(project.root, chapterId)
      expect(plan.scene_prompts).toHaveLength(2)
      expect(plan.scene_prompts[1].prompt).toContain('前一 scene 输出')
      expect(plan.style_reference?.scene_id).toBe('scene-opening')
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })
})
