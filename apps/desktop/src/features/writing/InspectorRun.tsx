import React, { useEffect, useState } from 'react'
import type {
  CheckReport,
  ContextPacketSummary,
  DocEntry,
  LanguageName,
  RunSummary
} from '../../app/types.js'
import { t } from '../../app/i18n.js'
import { bridge } from '../../app/bridge.js'
import { outlineLevelLabel } from '../../shared/outline.js'
import { buildSimpleDiff, runFileLabel } from '../../shared/text.js'
import { formatDesktopError } from '../../shared/errors.js'

export function Inspector({
  docs,
  scene,
  outline,
  context,
  contextPacket,
  checkReport,
  language
}: {
  docs: DocEntry[]
  scene: DocEntry | null
  outline: DocEntry | null
  context: string
  contextPacket: ContextPacketSummary | null
  checkReport: CheckReport | null
  language: LanguageName
}) {
  const find = (id?: unknown) => docs.find((doc) => doc.data.id === id)
  const pov = find(scene?.data.pov)
  const timeline = find(scene?.data.timeline_node)
  const location = find(scene?.data.location)
  const issues = checkReport?.issues ?? []
  const warnings = contextPacket?.warnings ?? []
  return (
    <div className="inspector-content">
      <h3>{t(language, 'contextAndChecks')}</h3>
      <InspectorCard title={t(language, 'assembledContext')} ok language={language}>
        <p>
          {context
            ? `${context.length.toLocaleString()} ${t(language, 'charsAssembled')}`
            : t(language, 'notAssembled')}
        </p>
        {contextPacket && (
          <p>
            {outlineLevelLabel(contextPacket.target.level)} · {contextPacket.included_ids.length} docs ·
            excluded {contextPacket.excluded_ids.length}
          </p>
        )}
      </InspectorCard>
      <InspectorCard title={t(language, 'canonConstraints')} ok language={language}>
        {(contextPacket?.canon ?? docs.filter((doc) => doc.data.type === 'canon').slice(0, 4)).map((item) => (
          <p key={item.data.id}>• {item.data.title}</p>
        ))}
      </InspectorCard>
      {outline && (
        <InspectorCard
          title={`${outlineLevelLabel(String(outline.data.level))}: ${outline.data.title}`}
          ok
          language={language}
        >
          <p>时间线：{contextPacket?.timeline.length ?? 0}</p>
          <p>人物：{contextPacket?.characters.length ?? 0}</p>
          <p>世界书：{contextPacket?.world_entries.length ?? 0}</p>
          <p>伏笔：{contextPacket?.foreshadowing.length ?? 0}</p>
        </InspectorCard>
      )}
      {warnings.length > 0 && (
        <InspectorCard title="缺项提示" ok={false} language={language}>
          {warnings.slice(0, 8).map((warning) => (
            <p key={warning}>• {warning}</p>
          ))}
        </InspectorCard>
      )}
      {!!contextPacket?.character_states.length && (
        <InspectorCard title="人物状态快照" ok language={language}>
          {contextPacket.character_states.slice(0, 6).map((state) => (
            <p key={state.data.id}>
              • {state.data.title}: {String(state.data.emotion ?? '')}
            </p>
          ))}
        </InspectorCard>
      )}
      {!!contextPacket?.foreshadowing.length && (
        <InspectorCard title="伏笔叠层" ok language={language}>
          {contextPacket.foreshadowing.slice(0, 8).map((item) => (
            <p key={item.data.id}>
              • {String(item.data.level ?? '')} {item.data.title}: {String(item.data.state ?? '')}
            </p>
          ))}
        </InspectorCard>
      )}
      {scene && (
        <>
          <InspectorCard
            title={`${t(language, 'characterState')}: ${pov?.data.title ?? t(language, 'notSelected')}`}
            ok
            language={language}
          >
            <p>
              {t(language, 'identity')}: {String(pov?.data.role ?? '')}
            </p>
            <p>
              {t(language, 'emotion')}:
              {String(
                (pov?.data.scene_state as Record<string, unknown> | undefined)?.emotional_state ?? '未记录'
              )}
            </p>
          </InspectorCard>
          <InspectorCard
            title={`${t(language, 'timelineNode')}: ${timeline?.data.title ?? t(language, 'notSelected')}`}
            ok
            language={language}
          >
            <p>
              {t(language, 'time')}: {String(timeline?.data.date ?? '')}
            </p>
            <p>
              {t(language, 'event')}: {timeline?.content.slice(0, 80)}
            </p>
          </InspectorCard>
          <InspectorCard
            title={`${t(language, 'location')}: ${location?.data.title ?? t(language, 'notSelected')}`}
            ok
            language={language}
          >
            <p>{String(location?.data.description ?? '')}</p>
          </InspectorCard>
        </>
      )}
      <InspectorCard title={t(language, 'consistencyResults')} ok={issues.length === 0} language={language}>
        {!checkReport ? (
          <p>{t(language, 'noCheckReport')}</p>
        ) : issues.length ? (
          issues.map((issue, index) => (
            <div className={`check-issue ${issue.severity}`} key={`${issue.code}-${index}`}>
              <p>
                <strong>
                  [{issue.severity}] {issue.code}:
                </strong>{' '}
                {issue.message}
              </p>
              {issue.evidence && (
                <small>
                  {t(language, 'evidence')}: {issue.evidence}
                </small>
              )}
              {!!issue.related_ids?.length && (
                <small>
                  {t(language, 'relatedIds')}: {issue.related_ids.join(', ')}
                </small>
              )}
            </div>
          ))
        ) : (
          <p>{t(language, 'noIssuesFound')}</p>
        )}
      </InspectorCard>
    </div>
  )
}

export function InspectorCard({
  title,
  ok,
  children,
  language
}: {
  title: string
  ok?: boolean
  children: React.ReactNode
  language: LanguageName
}) {
  return (
    <article className="inspector-card">
      <div className="card-head">
        <strong>{title}</strong>
        <span className={ok ? 'badge ok' : 'badge warn'}>{ok ? t(language, 'ok') : t(language, 'warn')}</span>
      </div>
      <div className="card-body">{children}</div>
    </article>
  )
}

export function RunPanel({
  root,
  runs,
  sceneId,
  onAccepted,
  language
}: {
  root: string
  runs: RunSummary[]
  sceneId: string | null
  onAccepted: () => Promise<void>
  language: LanguageName
}) {
  const filtered = runs.filter((run) => !sceneId || run.scene_id === sceneId)
  const [selectedRun, setSelectedRun] = useState<string | null>(null)
  const [activeFile, setActiveFile] = useState('metadata.yaml')
  const [preview, setPreview] = useState('')
  const [accepting, setAccepting] = useState(false)
  const [acceptError, setAcceptError] = useState('')
  const currentRun = filtered.some((run) => run.id === selectedRun) ? selectedRun : (filtered[0]?.id ?? null)
  const currentRunSummary = filtered.find((run) => run.id === currentRun) ?? null

  useEffect(() => {
    async function loadPreview() {
      if (!currentRun) {
        setPreview('')
        return
      }
      try {
        if (activeFile === 'diff') {
          const [raw, accepted] = await Promise.all([
            bridge.readRunFile(root, currentRun, 'output-raw.md').catch(() => ''),
            bridge.readRunFile(root, currentRun, 'output-accepted.md').catch(() => '')
          ])
          setPreview(buildSimpleDiff(raw, accepted))
        } else {
          setPreview(await bridge.readRunFile(root, currentRun, activeFile))
        }
      } catch (err) {
        setPreview(String(err))
      }
    }
    void loadPreview()
  }, [root, currentRun, activeFile])

  const accept = async () => {
    if (!currentRun) return
    setAccepting(true)
    setAcceptError('')
    try {
      await bridge.acceptRun(root, currentRun)
      await onAccepted()
    } catch (error) {
      setAcceptError(formatDesktopError(error))
    } finally {
      setAccepting(false)
    }
  }

  return (
    <footer className="run-panel">
      <div className="run-tabs">
        {['metadata.yaml', 'prompt.md', 'output-raw.md', 'output-accepted.md', 'check-report.md'].map(
          (file) => (
            <button
              key={file}
              className={activeFile === file ? 'active' : ''}
              onClick={() => setActiveFile(file)}
            >
              {runFileLabel(file, language)}
            </button>
          )
        )}
        <span className="spacer" />
        <button
          onClick={accept}
          disabled={accepting || !currentRun || currentRunSummary?.status !== 'generated'}
        >
          {t(language, 'acceptRaw')}
        </button>
        <button onClick={() => setActiveFile('diff')} disabled={!currentRun}>
          {t(language, 'compare')}
        </button>
      </div>
      {acceptError && (
        <div className="error-box" role="alert">
          {acceptError}
        </div>
      )}
      <div className="run-split">
        <div className="run-table">
          <div className="run-row header">
            <span>{t(language, 'type')}</span>
            <span>{t(language, 'model')}</span>
            <span>{t(language, 'time')}</span>
            <span>{t(language, 'status')}</span>
          </div>
          {filtered.length === 0 ? (
            <div className="empty-row">{t(language, 'noRuns')}</div>
          ) : (
            filtered.map((run) => (
              <button
                className={`run-row ${currentRun === run.id ? 'active' : ''}`}
                key={run.id}
                onClick={() => setSelectedRun(run.id)}
              >
                <span>{run.id}</span>
                <span>{run.model}</span>
                <span>{run.created_at}</span>
                <span>{run.status}</span>
              </button>
            ))
          )}
        </div>
        <pre className="run-preview">{preview}</pre>
      </div>
    </footer>
  )
}

export function WordProgress({ content, target }: { content: string; target: number }) {
  const count = content.replace(/\s+/g, '').length
  const pct = Math.min(100, Math.round((count / target) * 100))
  return (
    <div className="word-progress">
      <span>
        {count} / {target}
      </span>
      <div>
        <i style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
