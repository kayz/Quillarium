import path from 'node:path'
import { ensureDir, pathExists, readText, writeText } from './fs.js'

export type PromptName =
  'background-import' | 'background-issue-followup' | 'check-finalize-review' | 'prose-scene-draft'

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
      '- narrative：统一承载文风、节奏、叙事结构、类型边界、读者体验原则和写作样例。',
      '- outline：总览、总纲、卷、篇、幕、章。',
      '- scene：章内部的节规划或正文片段。',
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
      '      "type": "canon | world_entry | character | character_state | timeline_event | location | foreshadowing | reference | issue | narrative | outline | scene",',
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
      '- 文风样本是否值得沉淀为启用的 narrative 叙事卡。',
      '',
      '不要直接改文档。先列出候选影响和需要作者确认的问题。',
      '每个候选影响必须给出可审查的结构化 change set；不得把自然语言 change 当作可执行补丁。',
      'create 必须提供稳定、路径安全且尚不存在的 target_id；update 必须提供现有 target_id。',
      'frontmatter 是字段级合并对象；content 是目标 Markdown 正文全文。只写确有证据的字段。',
      '只返回 JSON，不要 Markdown 解释。格式：',
      '{',
      '  "summary": "一句话总结",',
      '  "impacts": [',
      '    {',
      '      "target_type": "canon | character | character_state | timeline_event | location | world_entry | foreshadowing | narrative | issue",',
      '      "target_id": "可能为空",',
      '      "operation": "create | update",',
      '      "title": "影响项标题",',
      '      "confidence": 0.0,',
      '      "change": "建议变化",',
      '      "evidence": "定稿中的证据",',
      '      "frontmatter": { "要更新的字段": "完整新值" },',
      '      "content": "需要创建或替换时的 Markdown 正文全文",',
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
      '目标：根据本章规划、当前节规划、上下文包、作者选择的要素、文风参考，生成本节正文。',
      '',
      '写作规则：',
      '1. 严格服从 canon、人物状态、时间线、地点、世界书、伏笔约束。',
      '2. 只写当前节正文，不输出分析说明。',
      '3. 不要自行发明硬 canon；不确定内容以模糊叙述避开。',
      '4. 如果有前一 scene 输出，需要自然承接，但不要重复。',
      '5. 文风以作者最终定稿样本为最高优先级。',
      '6. 默认中文。',
      '7. 输出必须是纯文字；禁止 Markdown 标题、列表、引用、链接、代码块或强调语法。'
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
