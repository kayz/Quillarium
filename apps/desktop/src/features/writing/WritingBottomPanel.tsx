import { useState } from 'react'
import { CheckCircle2, WandSparkles } from 'lucide-react'
import type {
  CheckReport,
  ContextPacketSummary,
  DocEntry,
  LanguageName,
  RunSummary,
  WorkLevel
} from '../../app/types.js'
import { t } from '../../app/i18n.js'
import { asStringList, docTitle } from '../../shared/outline.js'
import { Inspector, RunPanel } from './InspectorRun.js'

export function WritingBottomPanel({
  root,
  docs,
  runs,
  level,
  sceneId,
  outline,
  scene,
  context,
  contextPacket,
  checkReport,
  busy,
  onCheck,
  onGenerate,
  onAccepted,
  language
}: {
  root: string
  docs: DocEntry[]
  runs: RunSummary[]
  level: WorkLevel
  sceneId: string | null
  outline: DocEntry | null
  scene: DocEntry | null
  context: string
  contextPacket: ContextPacketSummary | null
  checkReport: CheckReport | null
  busy: boolean
  onCheck: () => Promise<void>
  onGenerate: () => Promise<void>
  onAccepted: () => Promise<void>
  language: LanguageName
}) {
  const [chapterPanel, setChapterPanel] = useState<'context' | 'runs'>('context')

  if (level === 'chapter') {
    return (
      <footer className="writing-bottom chapter-flow">
        <div className="chapter-flow-steps">
          <article>
            <strong>要素</strong>
            <p>地点：{docTitle(docs, scene?.data.location) || '未绑定'}</p>
            <p>
              人物：
              {[scene?.data.pov, ...asStringList(scene?.data.characters)]
                .map((id) => docTitle(docs, id))
                .filter(Boolean)
                .join(' / ') || '未绑定'}
            </p>
            <p>
              时间：{docTitle(docs, scene?.data.timeline_node) || String(scene?.data.world_time ?? '未绑定')}
            </p>
          </article>
          <article>
            <strong>章纲</strong>
            <p>{outline?.content.slice(0, 180) || '先在右栏手写章纲。'}</p>
          </article>
          <article>
            <strong>伏笔</strong>
            <p>
              {[
                ...asStringList(outline?.data.foreshadowing_planted),
                ...asStringList(outline?.data.foreshadowing_resolved)
              ]
                .map((id) => docTitle(docs, id) || id)
                .join(' / ') || '未选择'}
            </p>
          </article>
          <article>
            <strong>动作</strong>
            <div className="flow-actions">
              <button
                onClick={async () => {
                  await onCheck()
                  setChapterPanel('context')
                }}
                disabled={busy}
              >
                <CheckCircle2 size={15} /> 检查
              </button>
              <button
                onClick={async () => {
                  await onGenerate()
                  setChapterPanel('runs')
                }}
                disabled={busy || !outline}
              >
                <WandSparkles size={15} /> 组合提示词并撰写
              </button>
            </div>
          </article>
        </div>
        <div className="chapter-flow-runs">
          <div className="chapter-panel-tabs">
            <button
              className={chapterPanel === 'context' ? 'active' : ''}
              onClick={() => setChapterPanel('context')}
            >
              {t(language, 'contextAndChecks')}
            </button>
            <button
              className={chapterPanel === 'runs' ? 'active' : ''}
              onClick={() => setChapterPanel('runs')}
            >
              {t(language, 'runs')}
            </button>
          </div>
          {chapterPanel === 'context' ? (
            <Inspector
              docs={docs}
              scene={scene}
              outline={outline}
              context={context}
              contextPacket={contextPacket}
              checkReport={checkReport}
              language={language}
            />
          ) : (
            <RunPanel root={root} runs={runs} sceneId={sceneId} onAccepted={onAccepted} language={language} />
          )}
        </div>
      </footer>
    )
  }
  return (
    <footer className="writing-bottom checks-bottom">
      <Inspector
        docs={docs}
        scene={scene}
        outline={outline}
        context={context}
        contextPacket={contextPacket}
        checkReport={checkReport}
        language={language}
      />
    </footer>
  )
}
