import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  RefreshCw,
  ShieldCheck,
  X
} from 'lucide-react'
import type {
  AgentExecutionOutcome,
  AgentRuntimeErrorV1,
  PlanningIntegrityReviewResult,
  PlanningIssueApplicationResultV1,
  PlanningIssueProposalV1
} from '@quillarium/agent-runtime'
import type { LanguageName } from '../../app/types.js'
import { formatDesktopError } from '../../shared/errors.js'

export type PlanningCheckPanelOutcome = AgentExecutionOutcome<
  PlanningIntegrityReviewResult,
  AgentRuntimeErrorV1
>

export type PlanningCheckApplyPanelOutcome =
  | { status: 'applied'; result: PlanningIssueApplicationResultV1 }
  | { status: 'failed'; error: AgentRuntimeErrorV1 }

export function PlanningCheckPanel({
  outcome,
  language,
  busy,
  onClose,
  onRetry,
  onApply,
  onInspect
}: {
  outcome: PlanningCheckPanelOutcome
  language: LanguageName
  busy: boolean
  onClose: () => void
  onRetry: (executionId: string) => Promise<void>
  onApply: (executionId: string, selectedResultIds: string[]) => Promise<PlanningCheckApplyPanelOutcome>
  onInspect: (executionId: string) => Promise<void>
}) {
  const zh = language === 'zh'
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [localError, setLocalError] = useState<{ summary: string; technical: string } | null>(null)
  const [applied, setApplied] = useState<PlanningIssueApplicationResultV1 | null>(null)
  const proposals = useMemo(
    () =>
      outcome.status === 'completed'
        ? [...outcome.result.deterministic_findings, ...outcome.result.semantic_proposals]
        : [],
    [outcome]
  )

  useEffect(() => {
    setSelected(new Set())
    setLocalError(null)
    setApplied(null)
  }, [outcome.execution_id])

  const applySelected = async () => {
    setLocalError(null)
    try {
      const application = await onApply(outcome.execution_id, [...selected])
      if (application.status === 'failed') {
        setLocalError({
          summary: localizedErrorSummary(application.error.code, language),
          technical: `${application.error.code}\n${application.error.technical_detail}`
        })
        return
      }
      setApplied(application.result)
    } catch (error) {
      setLocalError({
        summary: formatDesktopError(error, language),
        technical: error instanceof Error ? `${error.name}: ${error.message}` : String(error)
      })
    }
  }

  return (
    <div className="agent-task-backdrop" role="presentation">
      <section
        className="agent-task-panel"
        role="dialog"
        aria-modal="true"
        aria-label={zh ? '项目 AI 检查' : 'Project AI check'}
      >
        <header className="agent-task-head">
          <div className="agent-task-heading">
            <span className="agent-task-kicker">
              <ShieldCheck size={15} /> {zh ? '统一 Agent Runtime' : 'Unified Agent Runtime'}
            </span>
            <h2>{zh ? '项目 AI 检查' : 'Project AI check'}</h2>
            <p>
              {zh
                ? '检查结果只是一组报告和问题提案；确认前不会写入问题卡。'
                : 'Results are reports and issue proposals only. No issue card is written before confirmation.'}
            </p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label={zh ? '关闭' : 'Close'}>
            <X size={18} />
          </button>
        </header>

        <div className="agent-task-runbar">
          <span>{zh ? '执行 ID' : 'Execution ID'}</span>
          <code>{outcome.execution_id}</code>
          <button
            type="button"
            className="button button-subtle"
            onClick={() => void onInspect(outcome.execution_id)}
          >
            <ExternalLink size={15} /> {zh ? '检查 Run' : 'Inspect Run'}
          </button>
        </div>

        {outcome.status === 'failed' ? (
          <RuntimeFailure
            error={outcome.error}
            language={language}
            busy={busy}
            onRetry={() => void onRetry(outcome.execution_id)}
          />
        ) : (
          <CompletedReview
            result={outcome.result}
            proposals={proposals}
            selected={selected}
            language={language}
            onSelected={setSelected}
            onInspect={onInspect}
          />
        )}

        {localError && (
          <div className="agent-task-local-error" role="alert">
            <strong>{localError.summary}</strong>
            <details>
              <summary>{zh ? '英文技术详情' : 'Technical details'}</summary>
              <pre>{localError.technical}</pre>
            </details>
          </div>
        )}
        {applied && (
          <div className="agent-task-success" role="status">
            <CheckCircle2 size={17} />
            {zh
              ? `已创建 ${applied.created_issue_ids.length} 张、更新 ${applied.updated_issue_ids.length} 张问题卡。`
              : `Created ${applied.created_issue_ids.length} and updated ${applied.updated_issue_ids.length} issue cards.`}
          </div>
        )}

        <footer className="agent-task-actions">
          <button type="button" className="button" onClick={onClose}>
            {zh ? '关闭' : 'Close'}
          </button>
          {outcome.status === 'completed' &&
            outcome.result.batches.some((batch) => batch.status === 'failed') && (
              <button
                type="button"
                className="button button-subtle"
                disabled={busy}
                onClick={() => void onRetry(outcome.execution_id)}
              >
                <RefreshCw size={15} /> {zh ? '只重试失败批次' : 'Retry failed batches'}
              </button>
            )}
          {outcome.status === 'completed' && (
            <button
              type="button"
              className="button primary"
              disabled={busy || selected.size === 0 || Boolean(applied)}
              onClick={() => void applySelected()}
            >
              <ShieldCheck size={16} />
              {zh ? `确认写入所选问题（${selected.size}）` : `Apply selected issues (${selected.size})`}
            </button>
          )}
        </footer>
      </section>
    </div>
  )
}

function RuntimeFailure({
  error,
  language,
  busy,
  onRetry
}: {
  error: AgentRuntimeErrorV1
  language: LanguageName
  busy: boolean
  onRetry: () => void
}) {
  const zh = language === 'zh'
  return (
    <div className="agent-task-failure">
      <AlertTriangle size={22} />
      <div>
        <strong>{localizedErrorSummary(error.code, language)}</strong>
        <p>
          {zh
            ? '本次错误只影响当前检查任务，写作工作区和作品文件均未被清空。'
            : 'This failure is local to the check task; the workspace and project files remain available.'}
        </p>
        <details>
          <summary>
            <ChevronDown size={14} /> {zh ? '英文技术详情' : 'Technical details'}
          </summary>
          <code>{error.code}</code>
          <pre>{error.technical_detail}</pre>
          {error.provider_http_status !== undefined && <p>HTTP {error.provider_http_status}</p>}
          {error.finish_reason && <p>finish_reason={error.finish_reason}</p>}
          {error.validation_paths.length > 0 && <pre>{error.validation_paths.join('\n')}</pre>}
        </details>
        {error.retry_safe && (
          <button type="button" className="button button-subtle" disabled={busy} onClick={onRetry}>
            <RefreshCw size={15} /> {zh ? '重试任务' : 'Retry task'}
          </button>
        )}
      </div>
    </div>
  )
}

function CompletedReview({
  result,
  proposals,
  selected,
  language,
  onSelected,
  onInspect
}: {
  result: PlanningIntegrityReviewResult
  proposals: PlanningIssueProposalV1[]
  selected: Set<string>
  language: LanguageName
  onSelected: (value: Set<string>) => void
  onInspect: (executionId: string) => Promise<void>
}) {
  const zh = language === 'zh'
  const failed = result.batches.filter((batch) => batch.status === 'failed')
  const [showFailedBatches, setShowFailedBatches] = useState(failed.length > 0)
  const toggle = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onSelected(next)
  }
  return (
    <div className="agent-task-content">
      <div className="agent-task-stats">
        <Metric label={zh ? '检查卡片' : 'Cards'} value={result.checked_cards} />
        <Metric label={zh ? '确定性发现' : 'Rule findings'} value={result.deterministic_findings.length} />
        <Metric label={zh ? '语义提案' : 'Semantic proposals'} value={result.semantic_proposals.length} />
        <Metric
          label={zh ? '失败批次' : 'Failed batches'}
          value={failed.length}
          tone={failed.length ? 'warn' : 'ok'}
          interactive={failed.length > 0}
          expanded={showFailedBatches}
          onClick={() => setShowFailedBatches((value) => !value)}
        />
      </div>

      {showFailedBatches && failed.length > 0 && (
        <section className="agent-failed-batches" aria-label={zh ? '失败批次详情' : 'Failed batch details'}>
          <header>
            <AlertTriangle size={17} />
            <span>
              <strong>{zh ? '模型输出未通过格式校验' : 'Model output failed format validation'}</strong>
              <small>
                {zh
                  ? '失败批次的内容没有作为问题提案采纳；其他成功批次已经保留。查看详情不会触发重试或写入。'
                  : 'Failed output was not adopted as issue proposals; successful batches are preserved. Viewing does not retry or write.'}
              </small>
            </span>
          </header>
          <div>
            {failed.map((batch, index) => {
              const error = batch.error as AgentRuntimeErrorV1 | undefined
              const validationPaths = error?.validation_paths ?? []
              return (
                <article key={batch.child_execution_id}>
                  <div className="agent-failed-batch-title">
                    <span>
                      {zh
                        ? `批次 ${batchNumber(batch.key, index)}`
                        : `Batch ${batchNumber(batch.key, index)}`}
                    </span>
                    <code>{batch.child_execution_id}</code>
                  </div>
                  <dl>
                    <div>
                      <dt>{zh ? '资料数量' : 'Documents'}</dt>
                      <dd>{batch.document_ids.length}</dd>
                    </div>
                    <div>
                      <dt>{zh ? '错误码' : 'Error code'}</dt>
                      <dd>
                        <code>{error?.code ?? 'AGENT_BATCH_PARTIAL_FAILURE'}</code>
                      </dd>
                    </div>
                    <div>
                      <dt>{zh ? '失败阶段' : 'Phase'}</dt>
                      <dd>{error?.phase ?? 'aggregation'}</dd>
                    </div>
                    <div>
                      <dt>{zh ? '允许重试' : 'Retry safe'}</dt>
                      <dd>{error?.retry_safe ? (zh ? '是' : 'Yes') : zh ? '否' : 'No'}</dd>
                    </div>
                  </dl>
                  <p>{localizedErrorSummary(error?.code ?? 'AGENT_BATCH_PARTIAL_FAILURE', language)}</p>
                  <details>
                    <summary>
                      {zh
                        ? `涉及资料（${batch.document_ids.length}）`
                        : `Source documents (${batch.document_ids.length})`}
                    </summary>
                    <ul>
                      {batch.document_ids.map((id) => (
                        <li key={id}>
                          <code>{id}</code>
                        </li>
                      ))}
                    </ul>
                  </details>
                  {validationPaths.length > 0 && (
                    <details open>
                      <summary>{zh ? '校验路径' : 'Validation paths'}</summary>
                      <pre>{validationPaths.join('\n')}</pre>
                    </details>
                  )}
                  {error && (
                    <details>
                      <summary>{zh ? '英文技术详情' : 'Technical details'}</summary>
                      <pre>{error.technical_detail}</pre>
                    </details>
                  )}
                  <button
                    type="button"
                    className="button button-subtle"
                    onClick={() => void onInspect(batch.child_execution_id)}
                  >
                    <ExternalLink size={14} /> {zh ? '检查 Run' : 'Inspect Run'}
                  </button>
                </article>
              )
            })}
          </div>
        </section>
      )}

      {result.semantic_status === 'not-configured' && (
        <div className="agent-task-note">
          {zh
            ? '检查模型尚未配置；确定性检查已经完成，没有调用模型。'
            : 'The check model is not configured. Deterministic checks completed without a model call.'}
        </div>
      )}

      <div className="agent-proposal-toolbar">
        <strong>
          {zh ? `待审阅问题提案 ${proposals.length}` : `${proposals.length} proposals to review`}
        </strong>
        <div>
          <button
            type="button"
            className="text-button"
            onClick={() => onSelected(new Set(proposals.map((item) => item.id)))}
          >
            {zh ? '全选' : 'Select all'}
          </button>
          <button type="button" className="text-button" onClick={() => onSelected(new Set())}>
            {zh ? '清空' : 'Clear'}
          </button>
        </div>
      </div>
      <div className="agent-proposal-list">
        {proposals.length === 0 ? (
          <div className="empty-state">
            {zh ? '没有发现需要建立问题卡的内容。' : 'No issue-card proposals were found.'}
          </div>
        ) : (
          proposals.map((proposal) => (
            <label className={`agent-proposal-card severity-${proposal.severity}`} key={proposal.id}>
              <input
                type="checkbox"
                checked={selected.has(proposal.id)}
                onChange={() => toggle(proposal.id)}
              />
              <span>
                <span className="agent-proposal-meta">
                  <b>
                    {proposal.source === 'rule'
                      ? zh
                        ? '确定性规则'
                        : 'Deterministic rule'
                      : zh
                        ? 'AI 语义检查'
                        : 'AI semantic check'}
                  </b>
                  <code>{proposal.code}</code>
                </span>
                <strong>{proposal.title}</strong>
                <p>{proposal.message}</p>
                {proposal.evidence && <blockquote>{proposal.evidence}</blockquote>}
                <small>
                  {zh ? '相关资料' : 'Related sources'}：{proposal.related_ids.join(' · ')}
                </small>
              </span>
            </label>
          ))
        )}
      </div>

      {result.batches.length > 0 && (
        <details className="agent-batch-details">
          <summary>
            {zh
              ? `模型批次与来源追踪（${result.batches.length}）`
              : `Model batches and source traces (${result.batches.length})`}
          </summary>
          <div>
            {result.batches.map((batch) => (
              <article key={batch.child_execution_id}>
                <span className={`status-dot ${batch.status}`} />
                <div>
                  <strong>{batch.key}</strong>
                  <small>{batch.document_ids.join(' · ')}</small>
                  {batch.status === 'failed' && (
                    <code>
                      {(batch.error as AgentRuntimeErrorV1 | undefined)?.code ??
                        'AGENT_BATCH_PARTIAL_FAILURE'}
                    </code>
                  )}
                </div>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => void onInspect(batch.child_execution_id)}
                >
                  {zh ? '查看 trace' : 'Inspect trace'}
                </button>
              </article>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}

function Metric({
  label,
  value,
  tone,
  interactive = false,
  expanded,
  onClick
}: {
  label: string
  value: number
  tone?: 'ok' | 'warn'
  interactive?: boolean
  expanded?: boolean
  onClick?: () => void
}) {
  const Tag = interactive ? 'button' : 'div'
  return (
    <Tag
      className={`${tone ? `metric-${tone}` : ''}${interactive ? ' agent-task-metric-button' : ''}`}
      {...(interactive
        ? { type: 'button' as const, onClick, 'aria-expanded': expanded, 'aria-label': `${label}: ${value}` }
        : {})}
    >
      <span>{label}</span>
      <strong>{value}</strong>
      {interactive && <ChevronDown className={expanded ? 'is-open' : ''} size={15} aria-hidden="true" />}
    </Tag>
  )
}

function batchNumber(key: string, fallbackIndex: number): string {
  return /(?:^|-)batch-(\d+)(?:$|-)/u.exec(key)?.[1] ?? String(fallbackIndex + 1)
}

function localizedErrorSummary(code: string, language: LanguageName): string {
  const zh: Record<string, string> = {
    AGENT_AI_NOT_CONFIGURED: '检查模型尚未配置',
    AGENT_PROVIDER_AUTH_FAILED: '模型鉴权失败，请检查 API Key',
    AGENT_PROVIDER_QUOTA_EXCEEDED: '模型额度不足',
    AGENT_PROVIDER_RATE_LIMITED: '模型服务限流，请稍后重试',
    AGENT_PROVIDER_TIMEOUT: '模型请求超时',
    AGENT_PROVIDER_TRANSPORT_FAILED: '无法连接模型服务',
    AGENT_PROVIDER_CONTEXT_EXCEEDED: '输入超过模型上下文限制',
    AGENT_OUTPUT_TRUNCATED: '模型输出被截断，请调整输出限制',
    AGENT_EMPTY_RESPONSE: '模型返回了空响应',
    AGENT_INVALID_JSON: '模型返回内容不是有效 JSON',
    AGENT_SCHEMA_MISMATCH: '模型返回字段不符合任务格式',
    AGENT_REPAIR_FAILED: '自动修复结构化输出后仍然无效',
    AGENT_AUDIT_WRITE_FAILED: '执行审计无法安全写入，模型未继续调用',
    AGENT_CONTEXT_LIMIT_EXCEEDED: '上下文编译无法满足真实 token 预算',
    AGENT_APPROVAL_REQUIRED: '缺少可验证的作者确认',
    AGENT_APPROVAL_REJECTED: '作者已拒绝本次写入',
    AGENT_APPROVAL_INVALID: '作者确认记录无效',
    AGENT_APPROVAL_EXPIRED: '作者确认已过期，请重新确认',
    AGENT_APPROVAL_ALREADY_CONSUMED: '这次确认已经使用过，不能重复写入',
    AGENT_APPLY_HASH_CONFLICT: '项目内容已变化，未执行写入',
    AGENT_APPLY_FAILED: '问题卡写入失败并已回滚'
  }
  if (language === 'zh') return zh[code] ?? `Agent 任务失败（${code}）`
  return code
    .replace(/^AGENT_/u, '')
    .replaceAll('_', ' ')
    .toLowerCase()
}
