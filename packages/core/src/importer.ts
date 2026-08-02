import path from 'node:path'
import { stat } from 'node:fs/promises'
import {
  createCanon,
  createCharacter,
  createForeshadowing,
  createIssue,
  createOutline,
  createPattern,
  createReference,
  createScene,
  createStrategy,
  createCharacterState,
  appendTimelineEvent,
  createWorldEntry
} from './documents.js'
import { listMarkdownFiles, readText } from './fs.js'
import type { DocType, OutlineDoc } from './types.js'
import { parseMarkdown } from './yaml.js'

export type MarkdownImportStrategy = 'auto' | 'single' | 'sections'

export interface MarkdownImportOptions {
  strategy?: MarkdownImportStrategy
  defaultType?: DocType
}

export interface MarkdownImportResult {
  source: string
  imported_type: DocType
  title: string
  path: string
  notes: string[]
}

type ImportKind = DocType | 'scene_or_outline'

export async function importMarkdownPath(
  projectRoot: string,
  inputPath: string,
  options: MarkdownImportOptions = {}
): Promise<MarkdownImportResult[]> {
  const resolved = path.resolve(inputPath)
  const info = await stat(resolved)
  const files = (info.isDirectory() ? await listMarkdownFiles(resolved) : [resolved]).filter(
    (file) => !shouldSkipImport(file)
  )
  const results: MarkdownImportResult[] = []
  for (const file of files) {
    results.push(...(await importMarkdownFile(projectRoot, file, options)))
  }
  return results
}

export async function importMarkdownFile(
  projectRoot: string,
  sourceFile: string,
  options: MarkdownImportOptions = {}
): Promise<MarkdownImportResult[]> {
  const parsed = await readMarkdownForImport(sourceFile)
  const hasFrontmatter = Object.keys(parsed.data).length > 0
  const title = inferTitle(sourceFile, parsed.data, parsed.content)
  const kind = inferKind(sourceFile, parsed.data, parsed.content, options)
  const strategy = options.strategy ?? 'auto'

  if (isTimelineLedger(parsed.data, sourceFile)) {
    return importTimelineLedger(projectRoot, sourceFile, parsed.content, parsed.parseError)
  }

  if (isIssueLedger(parsed.data, sourceFile)) {
    return importIssueLedger(projectRoot, sourceFile, parsed.content, parsed.parseError)
  }

  if (!hasFrontmatter && strategy === 'sections') {
    const sections = splitH2Sections(parsed.content)
    if (sections.length > 1) {
      const results: MarkdownImportResult[] = []
      for (const section of sections) {
        const result = await createPlainImport(
          projectRoot,
          sourceFile,
          kind,
          `${title} - ${section.title}`,
          section.content
        )
        if (parsed.parseError) result.notes.push(parsed.parseError)
        results.push(result)
      }
      return results
    }
  }

  const result = await createTypedImport(projectRoot, sourceFile, kind, title, parsed.data, parsed.content)
  if (parsed.parseError) result.notes.push(parsed.parseError)
  return [result]
}

function shouldSkipImport(file: string): boolean {
  const parts = path.normalize(file).split(path.sep)
  if (parts.some((part) => part.startsWith('.'))) return true
  const base = path.basename(file)
  return base === '_索引.md' || base === '_说明.md'
}

async function readMarkdownForImport(
  sourceFile: string
): Promise<{ data: Record<string, unknown>; content: string; parseError?: string }> {
  const raw = await readText(sourceFile)
  try {
    return parseMarkdown<Record<string, unknown>>(raw)
  } catch (error) {
    return {
      data: {},
      content: raw,
      parseError: `frontmatter parse failed; imported as unstructured Markdown (${
        error instanceof Error ? error.message : String(error)
      })`
    }
  }
}

async function importTimelineLedger(
  projectRoot: string,
  sourceFile: string,
  content: string,
  parseError?: string
): Promise<MarkdownImportResult[]> {
  const rows = parseMarkdownTable(content)
  const eventRows = rows.filter((row) => row['世界内时间'] && row['事件'])
  const results: MarkdownImportResult[] = []
  for (const row of eventRows) {
    const title = row['事件']
    const file = await appendTimelineEvent(
      projectRoot,
      title,
      {
        date: row['世界内时间'] ?? '',
        characters: asStringArray(row['关联人物'])
      },
      [
        `## Event`,
        '',
        row['关联章节'] ? `关联章节: ${row['关联章节']}` : '',
        row['备注'] ? `备注: ${row['备注']}` : ''
      ]
        .filter(Boolean)
        .join('\n')
    )
    const notes = parseError ? [parseError] : []
    results.push({ source: sourceFile, imported_type: 'timeline_event', title, path: file, notes })
  }
  if (!results.length) {
    const file = await createCanon(projectRoot, inferTitle(sourceFile, {}, content), content, {
      source: 'imported'
    })
    results.push({
      source: sourceFile,
      imported_type: 'canon',
      title: inferTitle(sourceFile, {}, content),
      path: file,
      notes: ['timeline ledger had no parseable table rows']
    })
  }
  return results
}

async function importIssueLedger(
  projectRoot: string,
  sourceFile: string,
  content: string,
  parseError?: string
): Promise<MarkdownImportResult[]> {
  const rows = parseMarkdownTable(content)
  const issueRows = rows.filter((row) => row['ID'] && row['问题'])
  const results: MarkdownImportResult[] = []
  for (const row of issueRows) {
    const code = row['ID']
    const title = `${code} ${row['问题']}`.trim()
    const file = await createIssue(
      projectRoot,
      title,
      {
        id: code.toLocaleLowerCase(),
        priority: normalizeIssuePriority(row['优先级']),
        state: normalizeIssueLedgerState(row['状态']),
        due: row['截止章/节点'] ?? '',
        decision_needed: row['问题'] ?? '',
        related_docs: asStringArray(row['关联文件'])
      },
      `## Issue\n\n${row['问题'] ?? ''}`
    )
    const notes = parseError ? [parseError] : []
    results.push({ source: sourceFile, imported_type: 'issue', title, path: file, notes })
  }
  if (!results.length) {
    const file = await createIssue(projectRoot, inferTitle(sourceFile, {}, content), {}, content)
    results.push({
      source: sourceFile,
      imported_type: 'issue',
      title: inferTitle(sourceFile, {}, content),
      path: file,
      notes: ['issue ledger had no parseable table rows']
    })
  }
  return results
}

function isTimelineLedger(data: Record<string, unknown>, sourceFile: string): boolean {
  return firstString(data, ['type', '类型']) === '时间线' || /时间线[\\/][^\\/]+\.md$/i.test(sourceFile)
}

function isIssueLedger(data: Record<string, unknown>, sourceFile: string): boolean {
  return firstString(data, ['type', '类型']) === '待解决问题台账' || /待解决问题\.md$/i.test(sourceFile)
}

function parseMarkdownTable(content: string): Array<Record<string, string>> {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('|') && line.endsWith('|'))
  const tables: Array<Record<string, string>> = []
  for (let i = 0; i < lines.length - 1; i++) {
    const headers = splitTableLine(lines[i])
    const separator = splitTableLine(lines[i + 1])
    if (!headers.length || !separator.every((cell) => /^:?-{3,}:?$/.test(cell))) continue
    for (let j = i + 2; j < lines.length; j++) {
      const cells = splitTableLine(lines[j])
      if (cells.length < headers.length) break
      const row: Record<string, string> = {}
      headers.forEach((header, index) => {
        row[header] = cells[index] ?? ''
      })
      tables.push(row)
    }
    break
  }
  return tables
}

function splitTableLine(line: string): string[] {
  return line
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim())
}

async function createPlainImport(
  projectRoot: string,
  sourceFile: string,
  kind: ImportKind,
  title: string,
  content: string
): Promise<MarkdownImportResult> {
  return createTypedImport(projectRoot, sourceFile, kind, title, {}, content)
}

async function createTypedImport(
  projectRoot: string,
  sourceFile: string,
  kind: ImportKind,
  title: string,
  data: Record<string, unknown>,
  content: string
): Promise<MarkdownImportResult> {
  const notes: string[] = []
  let file: string
  let importedType: DocType

  if (kind === 'character') {
    file = await createCharacter(
      projectRoot,
      firstString(data, ['title', '姓名', 'name']) ?? title,
      {
        role: firstString(data, ['role', '阵营', '身份']) ?? 'supporting',
        desire: firstString(data, ['desire', '欲望']) ?? '',
        fear: firstString(data, ['fear', '恐惧']) ?? '',
        bottom_line: firstString(data, ['bottom_line', '底线']) ?? '',
        motivation_anchors: asStringArray(data['motivation_anchors'] ?? data['动机锚点']),
        active_flags: asStringArray(data['active_flags'] ?? data['活跃flag']),
        relationships: relationshipRecord(data['relationships'] ?? data['关系']),
        disclosure: disclosureList(data['disclosure'] ?? data['披露进度'])
      },
      content
    )
    importedType = 'character'
  } else if (kind === 'foreshadowing') {
    const code = firstString(data, ['code', 'ID', 'id']) ?? ''
    file = await createForeshadowing(
      projectRoot,
      code || firstString(data, ['title', '一句话']) || title,
      {
        code,
        level: normalizeLevel(firstString(data, ['level', '级别'])),
        summary: firstString(data, ['summary', '一句话']) ?? '',
        planned_plant: firstString(data, ['planned_plant', '计划埋设章节']) ?? '',
        planted_at: firstString(data, ['planted_at', '埋设章节']) ?? null,
        reinforced_at: asStringArray(data['reinforced_at'] ?? data['强化章节']),
        planned_resolve: firstString(data, ['planned_resolve', '计划回收章节']) ?? '',
        expires_at: firstString(data, ['expires_at', '安全失效期']) ?? '',
        state: normalizeForeshadowingState(firstString(data, ['state', '状态'])),
        related_characters: asStringArray(data['related_characters'] ?? data['关联人物']),
        related_arc: firstString(data, ['related_arc', '关联子情节']) ?? ''
      },
      content
    )
    importedType = 'foreshadowing'
  } else if (kind === 'world_entry') {
    const valid = objectValue(data['valid_from']) ? data : objectValue(data['生效时间'])
    file = await createWorldEntry(
      projectRoot,
      firstString(data, ['title', '词条名']) ?? title,
      {
        code: firstString(data, ['code', 'ID', 'id']) ?? '',
        triggers: asStringArray(data['triggers'] ?? data['触发词']),
        category_tags: asStringArray(data['category_tags'] ?? data['tag']),
        role: normalizeWorldRole(firstString(data, ['role', '作用'])),
        valid_from: firstString(valid, ['valid_from', '起']) ?? '',
        valid_until: firstString(valid, ['valid_until', '止']) ?? '',
        entry_status: normalizeEntryStatus(firstString(data, ['entry_status', '状态'])),
        importance: normalizeImportance(firstString(data, ['importance', '重要度'])),
        historical_reference: firstString(data, ['historical_reference', '史实参考']) ?? '',
        story_setting: firstString(data, ['story_setting', '本作设定']) ?? '',
        links: asStringArray(data['links'] ?? data['关联']),
        source: firstString(data, ['source', '来源']) ?? ''
      },
      content
    )
    importedType = 'world_entry'
  } else if (kind === 'reference') {
    file = await createReference(
      projectRoot,
      firstString(data, ['title', '标题']) ?? title,
      {
        source_title: firstString(data, ['source_title', '标题']) ?? title,
        author: firstString(data, ['author', '作者/出处']) ?? '',
        material_type: normalizeMaterialType(firstString(data, ['material_type', '材料类型'])),
        location: firstString(data, ['location', '链接或位置']) ?? sourceFile,
        reading_status: normalizeReadingStatus(firstString(data, ['reading_status', '阅读状态'])),
        topic_tags: asStringArray(data['topic_tags'] ?? data['主题标签']),
        extracted_entries: asStringArray(data['extracted_entries'] ?? data['已抽取词条']),
        value_assessment: firstString(data, ['value_assessment', '价值评估']) ?? ''
      },
      content
    )
    importedType = 'reference'
  } else if (kind === 'issue') {
    file = await createIssue(
      projectRoot,
      firstString(data, ['title', '问题', '标题']) ?? title,
      {
        priority: normalizePriority(firstString(data, ['priority', '优先级'])),
        state: normalizeIssueState(firstString(data, ['state', '状态'])),
        due: firstString(data, ['due', '截止章']) ?? '',
        decision_needed: firstString(data, ['decision_needed', '待决策']) ?? '',
        related_docs: asStringArray(data['related_docs'] ?? data['关联'])
      },
      content
    )
    importedType = 'issue'
  } else if (kind === 'strategy') {
    file = await createStrategy(
      projectRoot,
      firstString(data, ['title', '标题']) ?? title,
      {
        category: normalizeStrategyCategory(firstString(data, ['category', '分类'])),
        scope: firstString(data, ['scope', '范围']) ?? 'project',
        principles: asStringArray(data['principles'] ?? data['原则']),
        avoid: asStringArray(data['avoid'] ?? data['避免'])
      },
      content
    )
    importedType = 'strategy'
  } else if (kind === 'pattern') {
    file = await createPattern(
      projectRoot,
      firstString(data, ['title', '标题', '模式名']) ?? title,
      {
        kind: normalizePatternKind(firstString(data, ['kind', '模式类型'])),
        scope: normalizePatternScope(firstString(data, ['scope', '作用层级'])),
        applies_to: asStringArray(data['applies_to'] ?? data['适用']),
        source: normalizePatternSource(firstString(data, ['source', '来源']))
      },
      content
    )
    importedType = 'pattern'
  } else if (kind === 'character_state') {
    const character = firstString(data, ['character', '人物'])
    const scopeId = firstString(data, ['scope_id', '绑定对象'])
    if (!character || !scopeId) {
      file = await createIssue(
        projectRoot,
        `${title} import needs character state binding`,
        {
          priority: 'medium',
          state: 'open',
          decision_needed: '补充 character 与 scope_id 后再作为人物状态快照使用。',
          related_docs: []
        },
        content
      )
      importedType = 'issue'
      notes.push('Character state import was converted to an issue because character or scope_id is missing.')
    } else {
      file = await createCharacterState(
        projectRoot,
        firstString(data, ['title', '标题']) ?? title,
        {
          character,
          scope_type: normalizeStateScope(firstString(data, ['scope_type', '绑定类型'])),
          scope_id: scopeId,
          timeline_node: firstString(data, ['timeline_node', '时间线节点']) ?? null,
          motivation: firstString(data, ['motivation', '动机']) ?? '',
          emotion: firstString(data, ['emotion', '情绪']) ?? '',
          knowledge: asStringArray(data['knowledge'] ?? data['认知']),
          relationship_delta: relationshipRecord(data['relationship_delta'] ?? data['关系变化']),
          public_disclosure: asStringArray(data['public_disclosure'] ?? data['公开信息']),
          notes: firstString(data, ['notes', '备注']) ?? ''
        },
        content
      )
      importedType = 'character_state'
    }
  } else if (kind === 'outline') {
    const level = inferOutlineLevel(sourceFile, data, title, content)
    file = await createOutline(
      projectRoot,
      level,
      title,
      {
        target_words: numberOrUndefined(data['target_words'] ?? data['预计字数']),
        chapter_hook: booleanOrUndefined(data['chapter_hook'] ?? data['断章悬念']),
        reader_promise: firstString(data, ['reader_promise', '读者承诺']) ?? '',
        reader_payoff: firstString(data, ['reader_payoff', '卷末兑现', '读者兑现']) ?? '',
        reader_benefit: firstString(data, ['reader_benefit', '读者收益']) ?? '',
        core_appeal: asStringArray(data['core_appeal'] ?? data['核心爽点'] ?? data['核心吸引力']),
        core_suspense: asStringArray(data['core_suspense'] ?? data['核心悬念']),
        genre_boundary: asStringArray(data['genre_boundary'] ?? data['禁区'] ?? data['类型边界']),
        volume_goal: firstString(data, ['volume_goal', '本卷目标', '卷目标']) ?? '',
        event_chain: asStringArray(data['event_chain'] ?? data['事件链']),
        character_growth: asStringArray(data['character_growth'] ?? data['人物成长']),
        writer_cycles: normalizeWriterCycles(data['writer_cycles'] ?? data['五循环']),
        conflict_ladder: asStringArray(data['conflict_ladder'] ?? data['冲突递进']),
        cast_lock: asStringArray(data['cast_lock'] ?? data['出场人物'] ?? data['固定人物']),
        fixed_reveals: asStringArray(data['fixed_reveals'] ?? data['固定揭示']),
        chapter_goal: firstString(data, ['chapter_goal', '本章目标']) ?? '',
        chapter_conflict: firstString(data, ['chapter_conflict', '本章冲突', '核心冲突']) ?? '',
        chapter_change: firstString(data, ['chapter_change', '本章变化']) ?? '',
        ending_hook: firstString(data, ['ending_hook', '章末钩子', '章末悬念']) ?? '',
        invariants: asStringArray(data['invariants'] ?? data['本卷不变量']),
        narrative_function: firstString(data, ['narrative_function', '叙事功能']) ?? '',
        emotional_curve: firstString(data, ['emotional_curve', '情绪循环']) ?? '',
        povs: asStringArray(data['povs'] ?? data['POV']),
        start_state: firstString(data, ['start_state', '起止状态']) ?? '',
        end_state: firstString(data, ['end_state']) ?? '',
        context_pins: asStringArray(data['context_pins'] ?? data['固定上下文']),
        context_exclusions: asStringArray(data['context_exclusions'] ?? data['排除上下文']),
        related_timeline: asStringArray(data['related_timeline'] ?? data['相关时间线']),
        related_characters: asStringArray(data['related_characters'] ?? data['出场人物']),
        related_events: asStringArray(data['related_events'] ?? data['相关事件']),
        related_foreshadowing: asStringArray(data['related_foreshadowing'] ?? data['相关伏笔']),
        world_entries_used: asStringArray(data['world_entries_used'] ?? data['世界书条目']),
        foreshadowing_planted: asStringArray(
          data['foreshadowing_planted'] ?? data['本幕埋设伏笔'] ?? data['本卷新埋伏笔']
        ),
        foreshadowing_resolved: asStringArray(
          data['foreshadowing_resolved'] ?? data['本幕回收伏笔'] ?? data['本卷回收伏笔']
        ),
        related_patterns: asStringArray(data['related_patterns'] ?? data['相关模式'])
      },
      content
    )
    importedType = 'outline'
  } else if (kind === 'scene_or_outline') {
    const sceneBindings = {
      section: firstString(data, ['section', '所属节']),
      timeline_node: firstString(data, ['timeline_node']),
      location: firstString(data, ['location', '地点']),
      pov: firstString(data, ['pov', 'POV'])
    }
    if (sceneBindings.section && sceneBindings.timeline_node && sceneBindings.location && sceneBindings.pov) {
      file = await createScene(
        projectRoot,
        firstString(data, ['title', '章名']) ?? title,
        {
          chapter_number: firstString(data, ['chapter_number', '章号']) ?? '',
          volume: firstString(data, ['volume', '所属卷']) ?? '',
          act: firstString(data, ['act', '所属幕']) ?? '',
          section: sceneBindings.section,
          timeline_node: sceneBindings.timeline_node,
          location: sceneBindings.location,
          pov: sceneBindings.pov,
          characters: asStringArray(data['characters'] ?? data['出场人物']),
          world_time: firstString(data, ['world_time', '世界内时间']) ?? '',
          chapter_break_hook: firstString(data, ['chapter_break_hook', '断章悬念']) ?? '',
          narrative_function: firstString(data, ['narrative_function', '叙事功能']) ?? '',
          writing_environment: firstString(data, ['writing_environment', '写作环境']) ?? '',
          scene_goal: firstString(data, ['scene_goal', '本节目标', '本章目标']) ?? '',
          scene_conflict: firstString(data, ['scene_conflict', '本节冲突', '核心冲突']) ?? '',
          scene_change: firstString(data, ['scene_change', '本节变化', '本章变化']) ?? '',
          reader_benefit: firstString(data, ['reader_benefit', '读者收益']) ?? '',
          ending_hook: firstString(data, ['ending_hook', '章末钩子', '章末悬念']) ?? '',
          foreshadowing_planted: asStringArray(data['foreshadowing_planted'] ?? data['本章埋设伏笔']),
          foreshadowing_resolved: asStringArray(data['foreshadowing_resolved'] ?? data['本章回收伏笔']),
          foreshadowing_reinforced: asStringArray(data['foreshadowing_reinforced'] ?? data['本章强化伏笔']),
          impact: asStringArray(data['impact'] ?? data['影响']),
          related_patterns: asStringArray(data['related_patterns'] ?? data['相关模式'])
        },
        content
      )
      importedType = 'scene'
    } else {
      file = await createOutline(projectRoot, 'chapter', title, {}, content)
      importedType = 'outline'
      notes.push('Imported chapter-like Markdown as a chapter outline because scene bindings were missing.')
    }
  } else {
    file = await createCanon(projectRoot, title, content, {
      source: 'imported',
      status: firstString(data, ['status', '状态']) === '停用' ? 'deprecated' : 'confirmed'
    })
    importedType = 'canon'
  }

  return { source: sourceFile, imported_type: importedType, title, path: file, notes }
}

function inferKind(
  sourceFile: string,
  data: Record<string, unknown>,
  content: string,
  options: MarkdownImportOptions
): ImportKind {
  if (options.defaultType) return options.defaultType
  const rawType = firstString(data, ['type', '类型'])?.toLocaleLowerCase()
  if (rawType) {
    if (['canon', '设定集'].includes(rawType)) return 'canon'
    if (['character', '人物'].includes(rawType)) return 'character'
    if (['foreshadowing', '伏笔'].includes(rawType)) return 'foreshadowing'
    if (['world_entry', 'world-entry', 'lore', '词条'].includes(rawType)) return 'world_entry'
    if (['reference', '参考资料'].includes(rawType)) return 'reference'
    if (['issue', '待解决问题', '待解决问题台账', '问题'].includes(rawType)) return 'issue'
    if (['strategy', '叙事策略', '策略'].includes(rawType)) return 'strategy'
    if (['pattern', '模式', '故事模式', '写法模式', '提示词模式'].includes(rawType)) return 'pattern'
    if (['character_state', 'character-state', '人物状态'].includes(rawType)) return 'character_state'
    if (['timeline_event', 'timeline', '时间线'].includes(rawType)) return 'timeline_event'
    if (['outline', '总纲', '卷纲', '幕纲', '章纲', '节纲'].includes(rawType)) return 'outline'
    if (['scene', '章节'].includes(rawType)) return 'scene_or_outline'
  }

  const normalizedPath = sourceFile.replace(/\\/g, '/')
  const text = `${path.basename(sourceFile)}\n${firstHeading(content) ?? ''}\n${content.slice(0, 600)}`
  if (/伏笔台账|foreshadow/i.test(normalizedPath)) return 'foreshadowing'
  if (/世界书|world|lore/i.test(normalizedPath)) return 'world_entry'
  if (/参考资料|references?/i.test(normalizedPath)) return 'reference'
  if (/待解决问题|issues?/i.test(normalizedPath)) return 'issue'
  if (/叙事策略|策略|strategy/i.test(normalizedPath) || /叙事策略|文风|节奏|爽点/.test(text)) return 'strategy'
  if (/模式|patterns?/i.test(normalizedPath) || /模式类型|作用层级/.test(text)) return 'pattern'
  if (/人物状态|character[-_ ]?states?/i.test(normalizedPath)) return 'character_state'
  if (/时间线|timeline/i.test(normalizedPath)) return 'timeline_event'
  if (/人物|characters?/i.test(normalizedPath)) return 'character'
  if (/大纲|outlines?|创作蓝图|全书总览|第一卷|第二卷|第三卷|终卷/.test(text)) return 'outline'
  if (/设定集|canon|核心设定|世界观/.test(text)) return 'canon'
  return 'canon'
}

function inferOutlineLevel(
  sourceFile: string,
  data: Record<string, unknown>,
  title: string,
  content: string
): OutlineDoc['level'] {
  const rawType = firstString(data, ['type', '类型'])
  const text = `${sourceFile}\n${title}\n${firstHeading(content) ?? ''}`
  if (rawType === '节纲' || /section|节纲/i.test(text)) return 'section'
  if (rawType === '章纲' || /chapter|章纲|第.*章/.test(text)) return 'chapter'
  if (rawType === '幕纲' || /act|幕纲|第.*幕/.test(text)) return 'act'
  if (rawType === '卷纲' || /volume|卷纲|第.*卷/.test(text)) return 'volume'
  if (rawType === '段纲' || /arc|段纲/i.test(text)) return 'arc'
  return 'book'
}

function inferTitle(sourceFile: string, data: Record<string, unknown>, content: string): string {
  return (
    firstString(data, ['title', '标题', '姓名', '词条名', '一句话', '章名', '卷名', '幕名']) ??
    firstHeading(content) ??
    path.basename(sourceFile, path.extname(sourceFile))
  )
}

function firstHeading(content: string): string | null {
  const match = content.match(/^#\s+(.+)$/m)
  return match?.[1]?.trim() ?? null
}

function splitH2Sections(content: string): Array<{ title: string; content: string }> {
  const matches = [...content.matchAll(/^##\s+(.+)$/gm)]
  if (!matches.length) return []
  return matches.map((match, index) => {
    const start = match.index ?? 0
    const end = matches[index + 1]?.index ?? content.length
    return {
      title: match[1].trim(),
      content: content.slice(start, end).trim()
    }
  })
}

function firstString(data: unknown, keys: string[]): string | undefined {
  const obj = objectValue(data)
  if (!obj) return undefined
  for (const key of keys) {
    const value = obj[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number') return String(value)
  }
  return undefined
}

function asStringArray(value: unknown): string[] {
  if (!value) return []
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => {
        if (typeof item === 'string' || typeof item === 'number') return [String(item)]
        if (item && typeof item === 'object') return [Object.values(item).map(String).join(': ')]
        return []
      })
      .map((item) => item.trim())
      .filter(Boolean)
  }
  if (typeof value === 'string') {
    if (!value.trim()) return []
    return value
      .split(/[,，、\n]/)
      .map((item) => item.trim())
      .filter(Boolean)
  }
  return [String(value)]
}

function relationshipRecord(value: unknown): Record<string, string> {
  if (!value) return {}
  if (!Array.isArray(value) && typeof value === 'object') return value as Record<string, string>
  const out: Record<string, string> = {}
  for (const item of Array.isArray(value) ? value : []) {
    if (item && typeof item === 'object') {
      const obj = item as Record<string, unknown>
      const target = firstString(obj, ['对象', 'target', 'name'])
      const relation = firstString(obj, ['关系', 'relation'])
      if (target) out[target] = relation ?? ''
    }
  }
  return out
}

function disclosureList(value: unknown): Array<{ segment: string; reveal_after?: string }> {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const obj = item as Record<string, unknown>
      const segment = firstString(obj, ['segment', '段落'])
      if (!segment) return null
      return { segment, reveal_after: firstString(obj, ['reveal_after', '可披露于']) }
    })
    .filter(Boolean) as Array<{ segment: string; reveal_after?: string }>
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function normalizeLevel(value?: string): 'L1' | 'L2' | 'L3' | 'L4' | 'L5' {
  const upper = value?.toUpperCase()
  return upper === 'L1' || upper === 'L2' || upper === 'L3' || upper === 'L4' || upper === 'L5' ? upper : 'L4'
}

function normalizeForeshadowingState(
  value?: string
): 'planned' | 'planted' | 'reinforced' | 'resolved' | 'abandoned' {
  if (value === '已埋设') return 'planted'
  if (value === '已强化') return 'reinforced'
  if (value === '已回收') return 'resolved'
  if (value === '已废弃') return 'abandoned'
  if (value === 'planted' || value === 'reinforced' || value === 'resolved' || value === 'abandoned')
    return value
  return 'planned'
}

function normalizeWorldRole(value?: string): 'constraint' | 'texture' | 'both' {
  if (value === '约束' || value === 'constraint') return 'constraint'
  if (value === '血肉' || value === 'texture') return 'texture'
  return 'both'
}

function normalizeEntryStatus(value?: string): 'candidate' | 'active' | 'inactive' {
  if (value === '启用' || value === 'active') return 'active'
  if (value === '停用' || value === 'inactive') return 'inactive'
  return 'candidate'
}

function normalizeImportance(value?: string): 'high' | 'medium' | 'low' {
  if (value === '高' || value === 'high') return 'high'
  if (value === '低' || value === 'low') return 'low'
  return 'medium'
}

function normalizeMaterialType(value?: string): 'book' | 'paper' | 'article' | 'webpage' | 'video' | 'other' {
  if (value === '书籍' || value === 'book') return 'book'
  if (value === '论文' || value === 'paper') return 'paper'
  if (value === '文章' || value === 'article') return 'article'
  if (value === '网页' || value === 'webpage') return 'webpage'
  if (value === '影像' || value === 'video') return 'video'
  return 'other'
}

function normalizeReadingStatus(value?: string): 'unread' | 'reading' | 'read' {
  if (value === '在读' || value === 'reading') return 'reading'
  if (value === '已读' || value === 'read') return 'read'
  return 'unread'
}

function normalizePriority(value?: string): 'high' | 'medium' | 'low' {
  if (value === '高' || value === 'high') return 'high'
  if (value === '低' || value === 'low') return 'low'
  return 'medium'
}

function normalizeIssueState(value?: string): 'open' | 'resolved' | 'deferred' {
  if (value === '已解决' || value === 'resolved') return 'resolved'
  if (value === '暂缓' || value === 'deferred') return 'deferred'
  return 'open'
}

function normalizeStrategyCategory(
  value?: string
): 'narrative' | 'style' | 'pacing' | 'reader_expectation' | 'genre_boundary' | 'other' {
  if (value === '文风' || value === 'style') return 'style'
  if (value === '节奏' || value === 'pacing') return 'pacing'
  if (value === '读者预期' || value === 'reader_expectation') return 'reader_expectation'
  if (value === '题材边界' || value === 'genre_boundary') return 'genre_boundary'
  if (value === '其他' || value === 'other') return 'other'
  return 'narrative'
}

function normalizePatternKind(value?: string): 'story' | 'writing' | 'prompt' {
  if (value === 'writing' || value === '写法') return 'writing'
  if (value === 'prompt' || value === '提示词') return 'prompt'
  return 'story'
}

function normalizePatternScope(
  value?: string
): 'book' | 'volume' | 'arc' | 'chapter' | 'section' | 'agent' | 'project' {
  if (value === 'book' || value === '总纲' || value === '全书') return 'book'
  if (value === 'volume' || value === '卷纲' || value === '卷') return 'volume'
  if (value === 'arc' || value === '段纲' || value === '段') return 'arc'
  if (value === 'chapter' || value === '章纲' || value === '章') return 'chapter'
  if (value === 'section' || value === '节纲' || value === '节') return 'section'
  if (value === 'agent' || value === 'Agent') return 'agent'
  return 'project'
}

function normalizePatternSource(value?: string): 'user' | 'ai' | 'accepted_prose' | 'imported' {
  if (value === 'ai' || value === 'AI') return 'ai'
  if (value === 'accepted_prose' || value === '定稿正文') return 'accepted_prose'
  if (value === 'imported' || value === '导入') return 'imported'
  return 'user'
}

function normalizeWriterCycles(
  value: unknown
): Array<'desire' | 'pressure' | 'growth' | 'reveal' | 'relationship'> {
  const allowed = new Set(['desire', 'pressure', 'growth', 'reveal', 'relationship'])
  const translated: Record<string, 'desire' | 'pressure' | 'growth' | 'reveal' | 'relationship'> = {
    欲望: 'desire',
    压力: 'pressure',
    成长: 'growth',
    揭秘: 'reveal',
    关系: 'relationship'
  }
  return asStringArray(value)
    .map((item) => translated[item] ?? item)
    .filter((item): item is 'desire' | 'pressure' | 'growth' | 'reveal' | 'relationship' =>
      allowed.has(item)
    )
}

function normalizeStateScope(value?: string): 'timeline_event' | 'outline' | 'scene' {
  if (value === '时间线' || value === 'timeline_event') return 'timeline_event'
  if (value === '场景' || value === 'scene') return 'scene'
  return 'outline'
}

function normalizeIssuePriority(value?: string): 'high' | 'medium' | 'low' {
  if (value === 'P0' || value === 'P1' || value === '高' || value === 'high') return 'high'
  if (value === 'P2' || value === '低' || value === 'low') return 'low'
  return 'medium'
}

function normalizeIssueLedgerState(value?: string): 'open' | 'resolved' | 'deferred' {
  if (value?.includes('已解决') || value === 'resolved') return 'resolved'
  if (value?.includes('暂缓') || value === 'deferred') return 'deferred'
  return 'open'
}

function numberOrUndefined(value: unknown): number | undefined {
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const match = value.match(/\d+/)
    if (match) return Number(match[0])
  }
  return undefined
}

function booleanOrUndefined(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') return value.trim() ? true : undefined
  return undefined
}
