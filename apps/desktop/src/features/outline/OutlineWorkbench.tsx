import { CheckCircle2, WandSparkles } from 'lucide-react'
import type { ContextPacketSummary, DocEntry, LanguageName } from '../../app/types.js'
import { t } from '../../app/i18n.js'
import {
  asStringList,
  formatFieldValue,
  levelTasks,
  outlineLevelLabel,
  relatedDocs
} from '../../shared/outline.js'

export function OutlineWorkbench({
  docs,
  outline,
  doc,
  contextPacket,
  busy,
  dirty,
  onDocChange,
  onSave,
  onGenerate,
  onCheck,
  language
}: {
  docs: DocEntry[]
  outline: DocEntry
  doc: { data: Record<string, unknown>; content: string; path: string } | null
  contextPacket: ContextPacketSummary | null
  busy: boolean
  dirty: boolean
  onDocChange: (doc: { data: Record<string, unknown>; content: string; path: string }) => void
  onSave: () => Promise<void>
  onGenerate: () => Promise<void>
  onCheck: () => Promise<void>
  language: LanguageName
}) {
  const level = String(outline.data.level ?? 'book')
  const tasks = levelTasks(level)
  const relatedTimeline = relatedDocs(docs, outline.data.related_timeline)
  const relatedCharacters = relatedDocs(docs, outline.data.related_characters)
  const relatedForeshadowing = relatedDocs(docs, [
    ...asStringList(outline.data.related_foreshadowing),
    ...asStringList(outline.data.foreshadowing_planted),
    ...asStringList(outline.data.foreshadowing_resolved)
  ])
  const relatedWorld = relatedDocs(docs, outline.data.world_entries_used)
  const relatedPatterns = relatedDocs(docs, outline.data.related_patterns)
  const packetCounts = [
    ['Canon', contextPacket?.canon.length ?? 0],
    ['策略', contextPacket?.strategies.length ?? 0],
    ['模式', contextPacket?.patterns.length ?? 0],
    ['时间线', contextPacket?.timeline.length ?? 0],
    ['人物', contextPacket?.characters.length ?? 0],
    ['人物状态', contextPacket?.character_states.length ?? 0],
    ['世界书', contextPacket?.world_entries.length ?? 0],
    ['伏笔', contextPacket?.foreshadowing.length ?? 0],
    ['问题', contextPacket?.issues.length ?? 0]
  ]
  return (
    <section className="editor-page outline-workbench">
      <div className="workbench-head">
        <div>
          <span className="badge ok">{outlineLevelLabel(level)}</span>
          <h2>{outline.data.title}</h2>
          <p>{tasks.summary}</p>
        </div>
        <div className="editor-actions">
          <button onClick={onSave} disabled={!dirty}>
            {dirty ? `${t(language, 'save')} *` : t(language, 'saved')}
          </button>
          <button onClick={onCheck} disabled={busy}>
            <CheckCircle2 size={16} /> {t(language, 'checkAction')}
          </button>
          <button onClick={onGenerate} disabled={busy || level !== 'chapter'}>
            <WandSparkles size={16} /> {level === 'chapter' ? '按章纲生成' : '章纲阶段生成'}
          </button>
        </div>
      </div>
      <div className="workbench-grid">
        <article className="info-card focus-card">
          <strong>本级核心工作</strong>
          {tasks.items.map((item) => (
            <p key={item}>• {item}</p>
          ))}
        </article>
        <article className="info-card">
          <strong>上下文包</strong>
          <div className="metric-grid">
            {packetCounts.map(([label, count]) => (
              <span key={label}>
                {label}
                <b>{count}</b>
              </span>
            ))}
          </div>
        </article>
        <article className="info-card">
          <strong>当前绑定</strong>
          <small>时间线：{relatedTimeline.map((item) => item.data.title).join(' / ') || '未绑定'}</small>
          <small>人物：{relatedCharacters.map((item) => item.data.title).join(' / ') || '未绑定'}</small>
          <small>伏笔：{relatedForeshadowing.map((item) => item.data.title).join(' / ') || '未绑定'}</small>
          <small>世界书：{relatedWorld.map((item) => item.data.title).join(' / ') || '未绑定'}</small>
          <small>模式：{relatedPatterns.map((item) => item.data.title).join(' / ') || '未绑定'}</small>
        </article>
        <article className="info-card">
          <strong>{tasks.fieldTitle}</strong>
          {tasks.fields.map(([label, value]) => (
            <small key={label}>
              {label}：{formatFieldValue(outline.data[value]) || '未填写'}
            </small>
          ))}
        </article>
        <article className="info-card">
          <strong>缺项提示</strong>
          {(contextPacket?.warnings ?? []).slice(0, 8).map((warning) => (
            <p key={warning}>• {warning}</p>
          ))}
          {!(contextPacket?.warnings ?? []).length && <p>当前层级没有确定性缺项。</p>}
        </article>
      </div>
      <label className="outline-editor">
        {level === 'chapter' ? '手写章纲' : `${outlineLevelLabel(level)}正文/说明`}
        <textarea
          value={doc?.content ?? ''}
          onChange={(event) => {
            if (!doc) return
            onDocChange({ ...doc, content: event.target.value })
          }}
          placeholder={
            level === 'chapter'
              ? '在这里写章纲：本章目标、开场、冲突、转折、结尾钩子、事实约束...'
              : '记录本层级目标、约束、事件安排和待讨论问题...'
          }
        />
      </label>
    </section>
  )
}
