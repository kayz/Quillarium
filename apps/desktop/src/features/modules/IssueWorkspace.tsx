import { useEffect, useMemo, useState } from 'react'
import { Bot, CheckCheck, RotateCcw, ShieldOff } from 'lucide-react'
import type { DocEntry, LanguageName, TargetSelection } from '../../app/types.js'
import { bridge } from '../../app/bridge.js'
import { formatDesktopError } from '../../shared/errors.js'
import { PlanningCardSelector } from '../planning/PlanningCardSelector.js'
import { BoundedPager } from '../layout/BoundedPager.js'
import { boundedPage } from '../layout/bounded-page.js'

const ISSUE_PAGE_SIZE = 50

export function IssueWorkspace({
  root,
  docs,
  issueDocs,
  selectedTarget,
  onSelect,
  onOpenCard,
  onReload,
  language,
  embedded = false
}: {
  root: string
  docs: DocEntry[]
  issueDocs?: DocEntry[]
  selectedTarget: TargetSelection | null
  onSelect: (target: TargetSelection) => void
  onOpenCard?: (doc: DocEntry) => void
  onReload: () => Promise<void>
  language: LanguageName
  embedded?: boolean
}) {
  const zh = language === 'zh'
  const issues = useMemo(
    () => issueDocs ?? docs.filter((document) => document.data.type === 'issue'),
    [docs, issueDocs]
  )
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [relatedFilter, setRelatedFilter] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [pageIndex, setPageIndex] = useState(0)
  useEffect(() => {
    const ids = new Set(issues.map((issue) => issue.data.id))
    setSelected((current) => new Set([...current].filter((id) => ids.has(id))))
  }, [issues])
  const nonIssueDocs = useMemo(() => docs.filter((document) => document.data.type !== 'issue'), [docs])
  const docTitleById = useMemo(
    () => new Map(docs.map((document) => [document.data.id, document.data.title])),
    [docs]
  )
  const visible = useMemo(
    () =>
      relatedFilter
        ? issues.filter(
            (issue) =>
              Array.isArray(issue.data.related_docs) && issue.data.related_docs.includes(relatedFilter)
          )
        : issues,
    [issues, relatedFilter]
  )
  const issuePage = boundedPage(visible, pageIndex, ISSUE_PAGE_SIZE)
  useEffect(() => {
    const selectedIndex = selectedTarget
      ? visible.findIndex((issue) => issue.data.id === selectedTarget.id)
      : -1
    setPageIndex(selectedIndex >= 0 ? Math.floor(selectedIndex / ISSUE_PAGE_SIZE) : 0)
  }, [selectedTarget?.id, visible])
  const apply = async (action: 'ignore' | 'resolve' | 'reopen') => {
    if (!selected.size) return
    setBusy(true)
    setError('')
    try {
      await bridge.applyIssueBatchAction(root, [...selected], action)
      setSelected(new Set())
      await onReload()
    } catch (cause) {
      setError(formatDesktopError(cause, language))
    } finally {
      setBusy(false)
    }
  }
  return (
    <section
      className={`${embedded ? 'issue-workspace-embedded' : 'module-view module-view-full'} issue-workspace`}
    >
      {!embedded && (
        <header className="module-head issue-workspace-head">
          <div>
            <h2>{zh ? '问题处理台' : 'Issue workflow'}</h2>
            <p>
              {zh
                ? '忽略会写入稳定抑制账本；已解决不会抑制以后重新检测。'
                : 'Ignored findings enter the stable suppression ledger; resolved findings may be detected again.'}
            </p>
          </div>
          <span>{issues.length}</span>
        </header>
      )}
      <div className="issue-batch-toolbar" aria-label={zh ? '问题批量操作' : 'Issue batch actions'}>
        <button type="button" onClick={() => setSelected(new Set(visible.map((issue) => issue.data.id)))}>
          {zh ? '全选' : 'Select all'}
        </button>
        <button
          type="button"
          onClick={() =>
            setSelected(
              new Set(visible.filter((issue) => !selected.has(issue.data.id)).map((issue) => issue.data.id))
            )
          }
        >
          {zh ? '反选' : 'Invert'}
        </button>
        <span>{zh ? `已选 ${selected.size}` : `${selected.size} selected`}</span>
        <button type="button" disabled={busy || !selected.size} onClick={() => void apply('ignore')}>
          <ShieldOff size={14} /> {zh ? '忽略' : 'Ignore'}
        </button>
        <button type="button" disabled={busy || !selected.size} onClick={() => void apply('resolve')}>
          <CheckCheck size={14} /> {zh ? '标记已解决' : 'Mark resolved'}
        </button>
        <button type="button" disabled={busy || !selected.size} onClick={() => void apply('reopen')}>
          <RotateCcw size={14} /> {zh ? '恢复待处理' : 'Restore pending'}
        </button>
      </div>
      <div className="issue-filter-row">
        <span>{zh ? '按关联对象筛选' : 'Filter by related object'}</span>
        <PlanningCardSelector
          docs={nonIssueDocs}
          value={relatedFilter}
          onChange={setRelatedFilter}
          language={language}
          ariaLabel={zh ? '筛选关联对象' : 'Filter related object'}
        />
      </div>
      {error && <p className="error-box">{error}</p>}
      <BoundedPager
        page={issuePage.page}
        total={issuePage.total}
        pageSize={issuePage.pageSize}
        onPage={setPageIndex}
        language={language}
        label={zh ? '问题列表分页' : 'Issue list pagination'}
      />
      <div className="issue-table" role="table" aria-label={zh ? '问题列表' : 'Issue list'}>
        <div className="issue-table-row issue-table-header" role="row">
          <span role="columnheader" />
          <span role="columnheader">{zh ? '问题 / 类型' : 'Issue / type'}</span>
          <span role="columnheader">{zh ? '来源' : 'Source'}</span>
          <span role="columnheader">{zh ? '关联对象' : 'Related'}</span>
          <span role="columnheader">{zh ? '优先级 / 状态' : 'Priority / state'}</span>
          <span role="columnheader">{zh ? '检测时间' : 'Detected'}</span>
          <span role="columnheader" />
        </div>
        {issuePage.items.map((issue) => {
          const relatedIds = Array.isArray(issue.data.related_docs)
            ? issue.data.related_docs.filter((id): id is string => typeof id === 'string')
            : []
          return (
            <article
              key={issue.data.id}
              className={`issue-table-row ${selectedTarget?.id === issue.data.id ? 'active' : ''}`}
              role="row"
              onClick={() => onSelect({ type: 'issue', id: issue.data.id })}
            >
              <span role="cell">
                <input
                  type="checkbox"
                  checked={selected.has(issue.data.id)}
                  aria-label={zh ? `选择 ${issue.data.title}` : `Select ${issue.data.title}`}
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) => {
                    const next = new Set(selected)
                    if (event.target.checked) next.add(issue.data.id)
                    else next.delete(issue.data.id)
                    setSelected(next)
                  }}
                />
              </span>
              <span role="cell">
                <strong>{issue.data.title}</strong>
                <small>{String(issue.data.rule_id || (zh ? '手工问题' : 'Manual issue'))}</small>
              </span>
              <span role="cell">
                {Array.isArray(issue.data.tags) && issue.data.tags.includes('ai-check')
                  ? zh
                    ? 'AI 检查'
                    : 'AI check'
                  : zh
                    ? '本地检查器'
                    : 'Local checker'}
              </span>
              <span role="cell">{relatedIds.map((id) => docTitleById.get(id) ?? id).join('、') || '—'}</span>
              <span role="cell">
                {String(issue.data.priority ?? 'medium')} ·{' '}
                {issueStateLabel(String(issue.data.state), language)}
              </span>
              <time role="cell">{String(issue.data.checked_at || issue.data.due || '—')}</time>
              <span role="cell">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    onOpenCard?.(issue)
                  }}
                >
                  <Bot size={14} /> {zh ? 'AI 讨论' : 'Discuss'}
                </button>
              </span>
            </article>
          )
        })}
      </div>
      <BoundedPager
        page={issuePage.page}
        total={issuePage.total}
        pageSize={issuePage.pageSize}
        onPage={setPageIndex}
        language={language}
        label={zh ? '问题列表分页' : 'Issue list pagination'}
      />
    </section>
  )
}

function issueStateLabel(value: string, language: LanguageName): string {
  const labels: Record<string, { zh: string; en: string }> = {
    open: { zh: '待处理', en: 'Pending' },
    resolved: { zh: '已解决', en: 'Resolved' },
    ignored: { zh: '已忽略', en: 'Ignored' },
    deferred: { zh: '旧版延期', en: 'Legacy deferred' }
  }
  return labels[value]?.[language] ?? value
}
