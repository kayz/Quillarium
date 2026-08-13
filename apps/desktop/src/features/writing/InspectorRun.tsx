import React, { useEffect, useState } from 'react'
import { CheckCircle2, GitBranch, ListChecks, MousePointerClick } from 'lucide-react'
import type {
  CheckReport,
  ContextPacketSummary,
  DocEntry,
  LanguageName,
  RunSummary
} from '../../app/types.js'
import { t } from '../../app/i18n.js'
import { bridge } from '../../app/bridge.js'
import { buildSimpleDiff, runFileLabel } from '../../shared/text.js'
import { formatDesktopError } from '../../shared/errors.js'
import { enumChoiceLabel, outlineLevelDisplayLabel } from '../metadata/field-presentation.js'

export function Inspector({
  docs,
  scene,
  outline,
  context,
  contextPacket,
  checkReport,
  busy = false,
  onCheck,
  language
}: {
  docs: DocEntry[]
  scene: DocEntry | null
  outline: DocEntry | null
  context: string
  contextPacket: ContextPacketSummary | null
  checkReport: CheckReport | null
  busy?: boolean
  onCheck?: () => Promise<void>
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
          <>
            <p>
              {outlineLevelDisplayLabel(contextPacket.target.level, language)} ·{' '}
              {language === 'zh'
                ? `纳入 ${contextPacket.included_ids.length} 份文档 · 排除 ${contextPacket.excluded_ids.length} 份文档`
                : `${contextPacket.included_ids.length} documents included · ${contextPacket.excluded_ids.length} excluded`}
            </p>
            <p>
              {language === 'zh'
                ? `${contextPacket.context_trace.budget.selected_tokens.toLocaleString()} / ${contextPacket.context_trace.budget.available_input_tokens.toLocaleString()} 输入 token · 预留输出 ${contextPacket.context_trace.budget.reserved_output_tokens.toLocaleString()} · ${contextPacket.context_trace.tokenizer.id} 精确计数`
                : `${contextPacket.context_trace.budget.selected_tokens.toLocaleString()} / ${contextPacket.context_trace.budget.available_input_tokens.toLocaleString()} input tokens · ${contextPacket.context_trace.budget.reserved_output_tokens.toLocaleString()} output reserved · exact ${contextPacket.context_trace.tokenizer.id}`}
            </p>
            <p>
              {language === 'zh'
                ? `${contextPacket.context_trace.candidates.discovered} 个候选 · 递归 ${contextPacket.context_trace.candidates.reached_recursion_depth}/${contextPacket.context_trace.candidates.max_recursion_depth} 层`
                : `${contextPacket.context_trace.candidates.discovered} candidates · recursion ${contextPacket.context_trace.candidates.reached_recursion_depth}/${contextPacket.context_trace.candidates.max_recursion_depth}`}
            </p>
            {contextPacket.context_trace.preset && (
              <p>
                {language === 'zh' ? '写作预设' : 'Writing preset'} · {contextPacket.context_trace.preset.id}{' '}
                v{contextPacket.context_trace.preset.version}
              </p>
            )}
          </>
        )}
      </InspectorCard>
      {!!contextPacket?.prompt_blocks.length && (
        <InspectorCard
          title={language === 'zh' ? '提示词块预览' : 'Prompt block preview'}
          ok
          language={language}
        >
          {contextPacket.prompt_blocks.map((block) => (
            <p key={block.id}>
              • {block.title} · {block.token_count.toLocaleString()} token · {block.authority}
              {block.truncated ? (language === 'zh' ? ' · 已截断' : ' · truncated') : ''}
              <small>{block.selection_reason}</small>
            </p>
          ))}
          {contextPacket.context_trace.entries
            .filter((entry) => entry.outcome === 'excluded')
            .slice(0, 8)
            .map((entry) => (
              <p key={`excluded:${entry.block_id}`}>
                • {entry.source_id} · {language === 'zh' ? '已排除' : 'excluded'}
                <small>{entry.reason}</small>
              </p>
            ))}
        </InspectorCard>
      )}
      <InspectorCard title={t(language, 'canonConstraints')} ok language={language}>
        {(contextPacket?.canon ?? docs.filter((doc) => doc.data.type === 'canon').slice(0, 4)).map((item) => (
          <p key={item.data.id}>• {item.data.title}</p>
        ))}
      </InspectorCard>
      {outline && (
        <InspectorCard
          title={`${outlineLevelDisplayLabel(String(outline.data.level), language)}: ${outline.data.title}`}
          ok
          language={language}
        >
          <p>
            {language === 'zh' ? '时间线' : 'Timeline'}：{contextPacket?.timeline.length ?? 0}
          </p>
          {contextPacket?.timeline.slice(0, 6).map((item) => (
            <p key={item.data.id}>• {item.data.title}</p>
          ))}
          <p>
            {language === 'zh' ? '地点' : 'Locations'}：{contextPacket?.locations.length ?? 0}
          </p>
          {contextPacket?.locations.slice(0, 6).map((item) => (
            <p key={item.data.id}>• {item.data.title}</p>
          ))}
          <p>
            {language === 'zh' ? '人物' : 'Characters'}：{contextPacket?.characters.length ?? 0}
          </p>
          {contextPacket?.characters.slice(0, 6).map((item) => (
            <p key={item.data.id}>• {item.data.title}</p>
          ))}
          <p>
            {language === 'zh' ? '世界书' : 'World entries'}：{contextPacket?.world_entries.length ?? 0}
          </p>
          <p>
            {language === 'zh' ? '伏笔' : 'Foreshadowing'}：{contextPacket?.foreshadowing.length ?? 0}
          </p>
        </InspectorCard>
      )}
      {warnings.length > 0 && (
        <InspectorCard
          title={language === 'zh' ? '缺项提示' : 'Missing context'}
          ok={false}
          language={language}
        >
          {warnings.slice(0, 8).map((warning) => (
            <p key={warning}>• {warning}</p>
          ))}
        </InspectorCard>
      )}
      {!!contextPacket?.character_states.length && (
        <InspectorCard
          title={language === 'zh' ? '人物状态快照' : 'Character snapshots'}
          ok
          language={language}
        >
          {contextPacket.character_states.slice(0, 6).map((state) => (
            <p key={state.data.id}>
              • {state.data.title}: {String(state.data.emotion ?? '')}
            </p>
          ))}
        </InspectorCard>
      )}
      {!!contextPacket?.foreshadowing.length && (
        <InspectorCard title={language === 'zh' ? '伏笔叠层' : 'Foreshadowing layers'} ok language={language}>
          {contextPacket.foreshadowing.slice(0, 8).map((item) => (
            <p key={item.data.id}>
              • {String(item.data.level ?? '')} {item.data.title}:{' '}
              {enumChoiceLabel('state', String(item.data.state ?? 'planned'), language, {
                documentType: 'foreshadowing'
              })}
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
                (pov?.data.scene_state as Record<string, unknown> | undefined)?.emotional_state ??
                  (language === 'zh' ? '未记录' : 'Not recorded')
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
      <InspectorCard
        title={t(language, 'consistencyResults')}
        ok={issues.length === 0}
        language={language}
        action={
          scene && onCheck ? (
            <button className="inspector-check-action" onClick={() => void onCheck()} disabled={busy}>
              <CheckCircle2 size={14} />
              {busy
                ? language === 'zh'
                  ? '检查中…'
                  : 'Checking…'
                : language === 'zh'
                  ? '检查当前节'
                  : 'Check scene'}
            </button>
          ) : null
        }
      >
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
        {checkReport?.content_sha256 && (
          <small className="check-report-version">
            {language === 'zh'
              ? `基于 ${checkReport.checked_characters ?? 0} 字 · ${new Date(checkReport.generated_at).toLocaleString('zh-CN')}`
              : `Checked ${checkReport.checked_characters ?? 0} characters · ${new Date(checkReport.generated_at).toLocaleString('en')}`}
          </small>
        )}
      </InspectorCard>
    </div>
  )
}

export function InspectorCard({
  title,
  ok,
  children,
  action,
  language
}: {
  title: string
  ok?: boolean
  children: React.ReactNode
  action?: React.ReactNode
  language: LanguageName
}) {
  return (
    <article className="inspector-card">
      <div className="card-head">
        <strong>{title}</strong>
        <span className="card-head-actions">
          {action}
          <span className={ok ? 'badge ok' : 'badge warn'}>
            {ok ? t(language, 'ok') : t(language, 'warn')}
          </span>
        </span>
      </div>
      <div className="card-body">{children}</div>
    </article>
  )
}

export function RunPanel({
  root,
  runs,
  sceneId,
  sceneIds,
  onAccepted,
  onCandidateChange,
  onBranch,
  language
}: {
  root: string
  runs: RunSummary[]
  sceneId: string | null
  sceneIds?: string[]
  onAccepted: () => Promise<void>
  onCandidateChange?: (value: string) => void
  onBranch?: (parentRunId: string) => Promise<void>
  language: LanguageName
}) {
  const filtered = runs.filter((run) =>
    sceneId ? run.scene_id === sceneId : sceneIds ? sceneIds.includes(run.scene_id) : true
  )
  const [selectedRun, setSelectedRun] = useState<string | null>(null)
  const [activeFile, setActiveFile] = useState('metadata.yaml')
  const [preview, setPreview] = useState('')
  const [accepting, setAccepting] = useState(false)
  const [acceptError, setAcceptError] = useState('')
  const [candidate, setCandidate] = useState('')
  const [comparison, setComparison] = useState<
    Record<string, { raw: string; report: string; evaluation: string }>
  >({})
  const currentRun = filtered.some((run) => run.id === selectedRun) ? selectedRun : (filtered[0]?.id ?? null)
  const currentRunSummary = filtered.find((run) => run.id === currentRun) ?? null
  const currentGroupRuns = currentRunSummary?.candidate_group_id
    ? filtered
        .filter((run) => run.candidate_group_id === currentRunSummary.candidate_group_id)
        .sort(
          (left, right) =>
            (left.candidate_index ?? Number.MAX_SAFE_INTEGER) -
              (right.candidate_index ?? Number.MAX_SAFE_INTEGER) || left.id.localeCompare(right.id)
        )
    : currentRunSummary
      ? [currentRunSummary]
      : []

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
          const value = await bridge.readRunFile(root, currentRun, activeFile)
          setPreview(value)
          if (activeFile === 'output-raw.md') {
            setCandidate(value)
            onCandidateChange?.(value)
          }
        }
      } catch (err) {
        setPreview(formatDesktopError(err, language))
      }
    }
    void loadPreview()
  }, [root, currentRun, activeFile, language, runs])

  useEffect(() => {
    if (activeFile !== 'comparison' || currentGroupRuns.length === 0) return
    void Promise.all(
      currentGroupRuns.map(async (run) => ({
        id: run.id,
        raw: await bridge.readRunFile(root, run.id, 'output-raw.md').catch(() => ''),
        report: await bridge.readRunFile(root, run.id, 'check-report.md').catch(() => ''),
        evaluation: await bridge.readRunFile(root, run.id, 'evaluation.json').catch(() => '')
      }))
    ).then((items) =>
      setComparison(
        Object.fromEntries(
          items.map((item) => [item.id, { raw: item.raw, report: item.report, evaluation: item.evaluation }])
        )
      )
    )
  }, [root, activeFile, currentRunSummary?.candidate_group_id, runs])

  const accept = async () => {
    if (!currentRun) return
    setAccepting(true)
    setAcceptError('')
    try {
      await bridge.acceptRun(root, currentRun, candidate)
      await onAccepted()
    } catch (error) {
      setAcceptError(formatDesktopError(error, language))
    } finally {
      setAccepting(false)
    }
  }

  const selectCandidate = async (runId = currentRun) => {
    if (!runId) return
    setAccepting(true)
    setAcceptError('')
    try {
      await bridge.selectRunCandidate(root, runId)
      setSelectedRun(runId)
      await onAccepted()
    } catch (error) {
      setAcceptError(formatDesktopError(error, language))
    } finally {
      setAccepting(false)
    }
  }

  const checkCandidate = async () => {
    if (!currentRun) return
    setAccepting(true)
    setAcceptError('')
    try {
      await bridge.checkRunCandidate(root, currentRun)
      setActiveFile('check-report.md')
      await onAccepted()
    } catch (error) {
      setAcceptError(formatDesktopError(error, language))
    } finally {
      setAccepting(false)
    }
  }

  const branchCandidate = async () => {
    if (!currentRun || !onBranch) return
    setAccepting(true)
    setAcceptError('')
    try {
      await onBranch(currentRun)
      setSelectedRun(null)
      setActiveFile('comparison')
    } catch (error) {
      setAcceptError(formatDesktopError(error, language))
    } finally {
      setAccepting(false)
    }
  }

  const canAccept =
    currentRunSummary &&
    ['generated', 'checked'].includes(currentRunSummary.status) &&
    (!currentRunSummary.candidate_group_id || Boolean(currentRunSummary.selected_at))

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
        <button
          className={activeFile === 'comparison' ? 'active' : ''}
          onClick={() => setActiveFile('comparison')}
          disabled={currentGroupRuns.length < 2}
        >
          {language === 'zh' ? '候选对比' : 'Candidate compare'}
        </button>
        <span className="spacer" />
        <button onClick={() => void checkCandidate()} disabled={accepting || !currentRun}>
          <ListChecks size={14} /> {language === 'zh' ? '检查本稿' : 'Check'}
        </button>
        {currentRunSummary?.candidate_group_id && (
          <button
            onClick={() => void selectCandidate()}
            disabled={accepting || !currentRun || Boolean(currentRunSummary.selected_at)}
          >
            <MousePointerClick size={14} />
            {currentRunSummary.selected_at
              ? language === 'zh'
                ? '已选中'
                : 'Selected'
              : language === 'zh'
                ? '选中本稿'
                : 'Select'}
          </button>
        )}
        {onBranch && (
          <button onClick={() => void branchCandidate()} disabled={accepting || !currentRun}>
            <GitBranch size={14} /> {language === 'zh' ? '从本稿分支' : 'Branch'}
          </button>
        )}
        <button
          onClick={accept}
          disabled={accepting || !currentRun || !canAccept}
          title={
            currentRunSummary?.candidate_group_id && !currentRunSummary.selected_at
              ? language === 'zh'
                ? '先选中候选稿；选中不会写入正文'
                : 'Select a candidate first; selection does not write prose'
              : undefined
          }
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
            <span>{language === 'zh' ? '候选 / 组' : 'Candidate / group'}</span>
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
                <span>
                  <strong>
                    {run.candidate_index === undefined
                      ? run.id
                      : language === 'zh'
                        ? `候选 ${run.candidate_index + 1}`
                        : `Candidate ${run.candidate_index + 1}`}
                  </strong>
                  {run.candidate_group_id && <small>{run.candidate_group_id.slice(0, 22)}</small>}
                </span>
                <span>{run.model}</span>
                <span>{run.created_at}</span>
                <span>
                  {enumChoiceLabel('run_status', run.status, language)}
                  {run.selected_at && (
                    <small className="candidate-selected-mark">
                      {language === 'zh' ? '已选中' : 'selected'}
                    </small>
                  )}
                </span>
              </button>
            ))
          )}
        </div>
        {activeFile === 'comparison' ? (
          <div className="candidate-comparison">
            {currentGroupRuns.map((run) => (
              <article key={run.id} className={run.selected_at ? 'selected' : ''}>
                <header>
                  <strong>
                    {language === 'zh'
                      ? `候选 ${(run.candidate_index ?? 0) + 1}`
                      : `Candidate ${(run.candidate_index ?? 0) + 1}`}
                  </strong>
                  <span>
                    {enumChoiceLabel('run_status', run.status, language)}
                    {run.selected_at ? (language === 'zh' ? ' · 已选中' : ' · selected') : ''}
                  </span>
                </header>
                {comparison[run.id]?.evaluation && (
                  <CandidateScoreStrip json={comparison[run.id]!.evaluation} language={language} />
                )}
                <pre className="candidate-comparison-prose">{comparison[run.id]?.raw}</pre>
                <details>
                  <summary>{language === 'zh' ? '检查报告' : 'Check report'}</summary>
                  <pre>{comparison[run.id]?.report || (language === 'zh' ? '尚未检查' : 'Not checked')}</pre>
                </details>
                <footer>
                  <button onClick={() => setSelectedRun(run.id)}>
                    {language === 'zh' ? '查看本稿' : 'Open'}
                  </button>
                  <button
                    onClick={() => void selectCandidate(run.id)}
                    disabled={accepting || Boolean(run.selected_at)}
                  >
                    {run.selected_at
                      ? language === 'zh'
                        ? '已选中'
                        : 'Selected'
                      : language === 'zh'
                        ? '选中'
                        : 'Select'}
                  </button>
                </footer>
              </article>
            ))}
          </div>
        ) : activeFile === 'output-raw.md' ? (
          <label className="candidate-editor">
            <span>
              {language === 'zh' ? '节工作稿（接受前可人工修改）' : 'Scene working draft'}
              <small>{[...candidate.replace(/\s/gu, '')].length} 字</small>
            </span>
            <textarea
              value={candidate}
              onChange={(event) => {
                setCandidate(event.target.value)
                onCandidateChange?.(event.target.value)
              }}
              spellCheck={false}
            />
          </label>
        ) : (
          <pre className="run-preview">{preview}</pre>
        )}
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

function CandidateScoreStrip({ json, language }: { json: string; language: LanguageName }) {
  let score: { deterministic_score?: number; semantic_score?: number; semantic_status?: string }
  try {
    score = JSON.parse(json) as typeof score
  } catch {
    return null
  }
  return (
    <div className="candidate-score-strip">
      <span>
        {language === 'zh' ? '规则一致性' : 'Deterministic'}
        <strong>{score.deterministic_score ?? '—'}</strong>
      </span>
      <span>
        {language === 'zh' ? '语义一致性' : 'Semantic'}
        <strong>{score.semantic_score ?? '—'}</strong>
        <small>{score.semantic_status}</small>
      </span>
    </div>
  )
}
