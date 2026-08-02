import path from 'node:path'
import { ensureDir, pathExists, readText, writeText } from './fs.js'

export type PromptName =
  | 'background-import'
  | 'background-issue-followup'
  | 'check-finalize-review'
  | 'prose-scene-draft'

export interface PromptAsset {
  name: PromptName
  title: string
  content: string
}

export const DEFAULT_PROMPTS: Record<PromptName, PromptAsset> = {
  'background-import': {
    name: 'background-import',
    title: '背景 AI 导入拆分提示词',
    content: [
      '你是 Quillarium 的背景资料整理 Agent。',
      '目标：读取作者提供的 Markdown 或纯文本，判断它应该落入小说项目的哪个结构化部分，并拆分为可落地文档。',
      '',
      '可用文档类型：',
      '- canon：已确认正设或强约束。',
      '- world_entry：世界书、制度、地点背景、组织、历史设定、规则。',
      '- character：人物基础档案。',
      '- character_state：人物在某个时间、章节、scene 的状态快照。',
      '- timeline_event：时间线事件。',
      '- location：地点。',
      '- foreshadowing：伏笔台账。',
      '- reference：参考资料或史料原文。',
      '- issue：需要作者判断的问题。',
      '- strategy：叙事策略、节奏、类型边界、读者体验原则。',
      '- pattern：故事模式、写法模式、提示词模式。',
      '- outline：总纲、卷纲、段纲、章纲。',
      '- scene：章节内部 scene/节纲或正文片段。',
      '',
      '要求：',
      '1. 不要覆盖原文；只输出落地计划。',
      '2. 置信度低于 0.72、需要作者决策、或会改变 canon 的内容，必须生成 issue。',
      '3. 对每个落地文档给出 title、type、confidence、frontmatter、content。',
      '4. frontmatter 必须使用 Quillarium 字段名；不确定字段留空或放入 issue。',
      '5. 如果文本包含多个独立条目，请拆分。',
      '6. 默认中文。',
      '',
      '只返回 JSON，不要 Markdown 解释。格式：',
      '{',
      '  "summary": "一句话总结",',
      '  "items": [',
      '    {',
      '      "type": "canon | world_entry | character | character_state | timeline_event | location | foreshadowing | reference | issue | strategy | pattern | outline | scene",',
      '      "title": "文档标题",',
      '      "confidence": 0.0,',
      '      "frontmatter": {},',
      '      "content": "Markdown body",',
      '      "reason": "为什么这样归类",',
      '      "questions": ["需要作者确认的问题"]',
      '    }',
      '  ],',
      '  "issues": [',
      '    { "title": "问题标题", "priority": "high | medium | low", "decision_needed": "需要作者回答什么", "related_items": ["临时条目标题"] }',
      '  ]',
      '}'
    ].join('\n')
  },
  'background-issue-followup': {
    name: 'background-issue-followup',
    title: '人工 issue 追问处理提示词',
    content: [
      '你是 Quillarium 的背景资料整理 Agent。',
      '作者正在回答导入或反查过程中产生的 issue。',
      '请根据 issue、原始材料、已有落地计划和作者回答，输出更新后的落地计划。',
      '如果作者回答仍不足，请继续给出更具体的问题；如果足够，请明确哪些文档可以落地，哪些保持 issue。',
      '',
      '只返回 JSON，格式与导入拆分提示词一致。'
    ].join('\n')
  },
  'check-finalize-review': {
    name: 'check-finalize-review',
    title: '检查 AI 定稿反查提示词',
    content: [
      '你是 Quillarium 的定稿反查 Agent。',
      '目标：比较初稿和作者定稿，判断哪些结构化资料可能需要调整。',
      '',
      '重点检查：',
      '- canon 是否新增、改变或被推翻。',
      '- 人物状态、人物关系、认知、伤势、物品、位置是否变化。',
      '- 时间线事件是否新增或顺序改变。',
      '- 地点、路线、世界书规则是否出现新信息。',
      '- 伏笔是否被埋设、强化、回收或废弃。',
      '- 文风样本是否值得沉淀为 pattern 或 style reference。',
      '',
      '不要直接改文档。先列出候选影响和需要作者确认的问题。',
      '只返回 JSON，不要 Markdown 解释。格式：',
      '{',
      '  "summary": "一句话总结",',
      '  "impacts": [',
      '    {',
      '      "target_type": "canon | character | character_state | timeline_event | location | world_entry | foreshadowing | pattern | issue",',
      '      "target_id": "可能为空",',
      '      "title": "影响项标题",',
      '      "confidence": 0.0,',
      '      "change": "建议变化",',
      '      "evidence": "定稿中的证据",',
      '      "requires_confirmation": true',
      '    }',
      '  ],',
      '  "questions": [',
      '    { "title": "问题标题", "decision_needed": "需要作者确认什么", "priority": "high | medium | low" }',
      '  ]',
      '}'
    ].join('\n')
  },
  'prose-scene-draft': {
    name: 'prose-scene-draft',
    title: '写作 AI scene 文稿提示词',
    content: [
      '你是 Quillarium 的小说正文写作 Agent。',
      '目标：根据章纲、当前 scene/节纲、上下文包、作者选择的要素、文风参考，生成本 scene 的正文。',
      '',
      '写作规则：',
      '1. 严格服从 canon、人物状态、时间线、地点、世界书、伏笔约束。',
      '2. 只写当前 scene 正文，不输出分析说明。',
      '3. 不要自行发明硬 canon；不确定内容以模糊叙述避开。',
      '4. 如果有前一 scene 输出，需要自然承接，但不要重复。',
      '5. 文风以作者最终定稿样本为最高优先级。',
      '6. 默认中文。'
    ].join('\n')
  }
}

export function promptPath(projectRoot: string, name: PromptName): string {
  return path.join(projectRoot, 'prompts', `${name}.md`)
}

export async function ensureDefaultPrompts(projectRoot: string): Promise<PromptAsset[]> {
  await ensureDir(path.join(projectRoot, 'prompts'))
  const out: PromptAsset[] = []
  for (const prompt of Object.values(DEFAULT_PROMPTS)) {
    const file = promptPath(projectRoot, prompt.name)
    if (!(await pathExists(file))) {
      await writeText(file, `# ${prompt.title}\n\n${prompt.content}\n`)
    }
    out.push({ ...prompt, content: await readPrompt(projectRoot, prompt.name) })
  }
  return out
}

export async function readPrompt(projectRoot: string, name: PromptName): Promise<string> {
  const file = promptPath(projectRoot, name)
  if (await pathExists(file)) {
    const raw = await readText(file)
    return raw.replace(/^# .+\n+/, '').trim()
  }
  return DEFAULT_PROMPTS[name].content
}
