import { useState } from 'react'
import type { FinalizationApplicationReport, FinalizeReviewSession } from '@quillarium/core'
import {
  CheckCircle2,
  FileText,
  LockKeyhole,
  RefreshCcw,
  Save,
  Send,
  ShieldCheck,
  XCircle
} from 'lucide-react'
import type { LanguageName } from '../../app/types.js'
import { t } from '../../app/i18n.js'
import { formatDesktopError } from '../../shared/errors.js'

type EditableDoc = { data: Record<string, unknown>; content: string; path: string }

export function ChapterProseWorkspace({
  chapterTitle,
  chapterId,
  root,
  doc,
  targetWords,
  dirty,
  busy,
  onDocChange,
  onSave,
  onFinalize,
  onPublish,
  onContinuityApplied,
  language
}: {
  chapterTitle: string
  chapterId: string
  root: string
  doc: EditableDoc
  targetWords: number
  dirty: boolean
  busy: boolean
  onDocChange: (doc: EditableDoc) => void
  onSave: () => Promise<void>
  onFinalize: () => Promise<void>
  onPublish: (confirmation: string) => Promise<void>
  onContinuityApplied: () => Promise<void>
  language: LanguageName
}) {
  const zh = language === 'zh'
  const status = String(doc.data.status ?? 'draft')
  const published = status === 'published'
  const count = countProseCharacters(doc.content)
  const progress = targetWords > 0 ? Math.min(100, Math.round((count / targetWords) * 100)) : 0
  const [review, setReview] = useState<FinalizeReviewSession | null>(null)
  const [report, setReport] = useState<FinalizationApplicationReport | null>(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [reviewBusy, setReviewBusy] = useState(false)
  const [reviewError, setReviewError] = useState('')
  const [reviewNotice, setReviewNotice] = useState('')
  const [answers, setAnswers] = useState<Record<string, string>>({})

  const runReviewAction = async (action: () => Promise<void>) => {
    setReviewBusy(true)
    setReviewError('')
    setReviewNotice('')
    try {
      await action()
    } catch (error) {
      setReviewError(formatDesktopError(error, language))
    } finally {
      setReviewBusy(false)
    }
  }

  const prepareReview = async () => {
    setReviewOpen(true)
    await runReviewAction(async () => {
      const bridge = window.quillarium
      const lifecycle = await bridge.loadChapterLifecycle(root, chapterId)
      const draft = lifecycle.scenes
        .map((scene: { content: string }) => scene.content.trim())
        .filter(Boolean)
        .join('\n\n')
      const next = await bridge.createFinalizeReviewPlan(root, {
        chapterId,
        sceneIds: lifecycle.scenes.map((scene: { data: { id: string } }) => scene.data.id),
        draft: draft || doc.content,
        final: doc.content,
        callAI: true
      })
      setReview(next)
      setReport(null)
    })
  }

  const updateImpact = async (impactId: string, state: 'confirmed' | 'rejected') => {
    if (!review) return
    await runReviewAction(async () => {
      const bridge = window.quillarium
      setReview(
        await bridge.confirmFinalizeImpact(
          root,
          review.id,
          impactId,
          state === 'confirmed'
            ? zh
              ? '作者已确认此项结构化变更。'
              : 'The author confirmed this structured change.'
            : zh
              ? '作者拒绝此项变更。'
              : 'The author rejected this change.',
          state
        )
      )
    })
  }

  const updateQuestion = async (questionId: string, state: 'resolved' | 'deferred') => {
    if (!review) return
    const answer = answers[questionId]?.trim() ?? ''
    if (state === 'resolved' && !answer) {
      setReviewError(zh ? '请先填写作者答复。' : 'Enter an author answer first.')
      return
    }
    await runReviewAction(async () => {
      const bridge = window.quillarium
      setReview(
        await bridge.answerFinalizeQuestion(
          root,
          review.id,
          questionId,
          answer || (zh ? '暂缓决定。' : 'Decision deferred.'),
          state
        )
      )
    })
  }

  const applyReview = async () => {
    if (!review || review.status !== 'ready-to-apply') return
    if (
      !window.confirm(
        zh
          ? `将原子写入 ${review.impacts.filter((impact) => impact.state === 'confirmed').length} 项已确认的连续性变更。系统会先备份并在失败时完整恢复。继续吗？`
          : `Atomically apply ${review.impacts.filter((impact) => impact.state === 'confirmed').length} confirmed continuity changes? All targets are backed up first.`
      )
    )
      return
    await runReviewAction(async () => {
      const bridge = window.quillarium
      const applied = await bridge.applyFinalizeReview(root, review.id)
      setReport(applied)
      setReview(await bridge.loadFinalizeReviewSession(root, review.id))
      setReviewNotice(
        zh ? `连续性回写已验证。审计：${review.id}` : `Continuity apply verified. Audit: ${review.id}`
      )
      await onContinuityApplied()
    })
  }

  const recoverInterrupted = async () => {
    await runReviewAction(async () => {
      const bridge = window.quillarium
      const recovered = await bridge.recoverFinalizationApplications(root)
      setReviewNotice(
        zh
          ? `恢复检查完成：${recovered.length} 个未完成事务已还原。`
          : `Recovery complete: ${recovered.length} interrupted transaction(s) restored.`
      )
    })
  }

  return (
    <section className="chapter-prose-workspace">
      <header className="chapter-prose-head">
        <div>
          <span className="badge ok">
            <FileText size={13} /> {zh ? '章正文' : 'Chapter prose'}
          </span>
          <h2>{chapterTitle}</h2>
          <div className="chapter-status-line">
            <span className={`chapter-status ${status}`}>{statusLabel(status, language)}</span>
            <span>
              {count.toLocaleString()} / {targetWords.toLocaleString()} {zh ? '字' : 'characters'}
            </span>
          </div>
        </div>
        <div className="chapter-prose-actions">
          {!published && (
            <button onClick={onSave} disabled={busy || !dirty}>
              <Save size={15} /> {dirty ? `${t(language, 'save')} *` : t(language, 'saved')}
            </button>
          )}
          {status === 'draft' && (
            <button
              onClick={async () => {
                if (!window.confirm(zh ? '确认将本章定稿？定稿后 AI 与节编辑会锁定。' : 'Finalize chapter?'))
                  return
                await onFinalize()
              }}
              disabled={busy || !doc.content.trim()}
            >
              <CheckCircle2 size={15} /> {zh ? '定稿' : 'Finalize'}
            </button>
          )}
          {status === 'final' && (
            <>
              <button onClick={prepareReview} disabled={busy || reviewBusy || !doc.content.trim()}>
                <ShieldCheck size={15} /> {zh ? '定稿反查与回写' : 'Final review & apply'}
              </button>
              <button
                className="danger"
                onClick={async () => {
                  if (
                    !window.confirm(
                      zh
                        ? '发布会永久锁定正文，并删除各节提示词和 AI 产物。第一次确认：继续吗？'
                        : 'Publishing permanently locks the prose and deletes scene-generation artifacts. Continue?'
                    )
                  )
                    return
                  const confirmation = window.prompt(
                    zh ? `第二次确认：请输入完整章名“${chapterTitle}”` : `Type “${chapterTitle}”`
                  )
                  if (confirmation !== chapterTitle) return
                  await onPublish(confirmation)
                }}
                disabled={busy || !doc.content.trim()}
              >
                <Send size={15} /> {zh ? '发布并清理节产物' : 'Publish'}
              </button>
            </>
          )}
          {published && (
            <span className="chapter-prose-lock">
              <LockKeyhole size={14} /> {zh ? '已发布，永久锁定' : 'Published and locked'}
            </span>
          )}
        </div>
      </header>

      <div className="chapter-word-progress" aria-label={zh ? '章字数进度' : 'Chapter word progress'}>
        <i style={{ width: `${progress}%` }} />
      </div>

      <label className="chapter-prose-editor">
        <span>
          <strong>{zh ? '正文 · 纯文字' : 'Prose · plain text'}</strong>
          <small>
            {status === 'draft'
              ? zh
                ? '草稿可自由编辑'
                : 'Draft: freely editable'
              : status === 'final'
                ? zh
                  ? '已定稿：仅允许作者小幅修改'
                  : 'Final: limited author edits only'
                : zh
                  ? '已发布：禁止修改'
                  : 'Published: read only'}
          </small>
        </span>
        <textarea
          value={doc.content}
          readOnly={published}
          onChange={(event) => onDocChange({ ...doc, content: event.target.value })}
          spellCheck
          aria-label={zh ? '章正文纯文字编辑区' : 'Chapter prose editor'}
        />
      </label>

      {reviewOpen && status === 'final' && (
        <FinalizationReviewPanel
          review={review}
          report={report}
          busy={reviewBusy}
          error={reviewError}
          notice={reviewNotice}
          answers={answers}
          language={language}
          onAnswersChange={setAnswers}
          onClose={() => setReviewOpen(false)}
          onRetry={prepareReview}
          onImpact={updateImpact}
          onQuestion={updateQuestion}
          onApply={applyReview}
          onRecover={recoverInterrupted}
        />
      )}

      <p className="chapter-prose-note">
        {zh
          ? '可以完全手写正文；接受某一节的成果时，系统会按节顺序写入这里，不加入标题或分隔符。'
          : 'Write directly, or accept scene results into this prose in scene order without headings or separators.'}
      </p>
    </section>
  )
}

function FinalizationReviewPanel({
  review,
  report,
  busy,
  error,
  notice,
  answers,
  language,
  onAnswersChange,
  onClose,
  onRetry,
  onImpact,
  onQuestion,
  onApply,
  onRecover
}: {
  review: FinalizeReviewSession | null
  report: FinalizationApplicationReport | null
  busy: boolean
  error: string
  notice: string
  answers: Record<string, string>
  language: LanguageName
  onAnswersChange: (answers: Record<string, string>) => void
  onClose: () => void
  onRetry: () => Promise<void>
  onImpact: (id: string, state: 'confirmed' | 'rejected') => Promise<void>
  onQuestion: (id: string, state: 'resolved' | 'deferred') => Promise<void>
  onApply: () => Promise<void>
  onRecover: () => Promise<void>
}) {
  const zh = language === 'zh'
  const confirmed = review?.impacts.filter((impact) => impact.state === 'confirmed').length ?? 0
  return (
    <section className="finalization-review" aria-label={zh ? '定稿反查与连续性回写' : 'Final review'}>
      <header>
        <div>
          <strong>{zh ? '定稿反查与连续性回写' : 'Final review & continuity apply'}</strong>
          <small>
            {zh
              ? 'AI 只提出结构化建议；作者确认后才会备份、写入、复读验证并留下审计。'
              : 'AI proposes structured changes; author confirmation gates backup, apply, verification, and audit.'}
          </small>
        </div>
        <div>
          <button
            onClick={onRecover}
            disabled={busy}
            title={zh ? '恢复未完成事务' : 'Recover interrupted apply'}
          >
            <RefreshCcw size={14} /> {zh ? '恢复检查' : 'Recovery check'}
          </button>
          <button onClick={onClose} aria-label={zh ? '收起定稿反查' : 'Close final review'}>
            <XCircle size={15} />
          </button>
        </div>
      </header>

      {busy && <p className="finalization-message">{zh ? '正在处理…' : 'Working…'}</p>}
      {error && <p className="finalization-message error">{error}</p>}
      {notice && <p className="finalization-message ok">{notice}</p>}
      {!review && !busy && (
        <p className="finalization-message">
          {zh ? '尚未取得反查结果。' : 'No review result yet.'}{' '}
          <button onClick={onRetry}>{zh ? '重新生成' : 'Retry'}</button>
        </p>
      )}
      {review && (
        <div className="finalization-review-body">
          <div className="finalization-summary">
            <span className={`chapter-status ${review.status}`}>
              {reviewStatusLabel(review.status, language)}
            </span>
            <p>{review.summary || (zh ? 'AI 未提供摘要。' : 'No AI summary.')}</p>
          </div>

          {review.impacts.map((impact) => (
            <article className={`finalization-impact ${impact.state}`} key={impact.id}>
              <header>
                <strong>{impact.title}</strong>
                <span>
                  {impact.state === 'open' ? (zh ? '待作者决定' : 'Author decision') : impact.state}
                </span>
              </header>
              <p>{impact.change}</p>
              <small>
                {targetTypeLabel(impact.target_type, language)} ·{' '}
                {impact.operation ?? (zh ? '缺少操作' : 'No operation')} ·{' '}
                {impact.target_id ?? (zh ? '缺少目标 ID' : 'No target ID')}
              </small>
              <details>
                <summary>{zh ? '查看将要写入的结构化内容' : 'Inspect structured write set'}</summary>
                <pre>
                  {JSON.stringify(
                    {
                      frontmatter: impact.frontmatter ?? {},
                      ...(impact.content === undefined ? {} : { content: impact.content })
                    },
                    null,
                    2
                  )}
                </pre>
              </details>
              {impact.state === 'open' && (
                <div className="finalization-card-actions">
                  <button onClick={() => onImpact(impact.id, 'rejected')} disabled={busy}>
                    {zh ? '拒绝' : 'Reject'}
                  </button>
                  <button
                    className="primary"
                    onClick={() => onImpact(impact.id, 'confirmed')}
                    disabled={busy}
                  >
                    {zh ? '确认此项' : 'Confirm'}
                  </button>
                </div>
              )}
            </article>
          ))}

          {review.questions.map((question) => (
            <article className={`finalization-question ${question.state}`} key={question.id}>
              <strong>{question.title}</strong>
              <p>{question.decision_needed}</p>
              {question.state === 'open' && (
                <>
                  <textarea
                    value={answers[question.id] ?? ''}
                    onChange={(event) => onAnswersChange({ ...answers, [question.id]: event.target.value })}
                    placeholder={zh ? '填写作者答复…' : 'Enter author answer…'}
                  />
                  <div className="finalization-card-actions">
                    <button onClick={() => onQuestion(question.id, 'deferred')} disabled={busy}>
                      {zh ? '暂缓' : 'Defer'}
                    </button>
                    <button
                      className="primary"
                      onClick={() => onQuestion(question.id, 'resolved')}
                      disabled={busy}
                    >
                      {zh ? '提交答复' : 'Resolve'}
                    </button>
                  </div>
                </>
              )}
            </article>
          ))}

          {review.status === 'ready-to-apply' && (
            <div className="finalization-apply-bar">
              <span>
                {zh ? `${confirmed} 项变更已获作者确认` : `${confirmed} change(s) author-confirmed`}
              </span>
              <button className="primary" onClick={onApply} disabled={busy}>
                <ShieldCheck size={15} /> {zh ? '备份、应用并验证' : 'Backup, apply & verify'}
              </button>
            </div>
          )}
          {report?.state === 'applied' && (
            <div className="finalization-audit">
              <strong>{zh ? '审计已完成' : 'Audit complete'}</strong>
              <span>
                {report.items.length} {zh ? '个文件变更' : 'file change(s)'} · {report.id}
              </span>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

export function countProseCharacters(value: string): number {
  return [...value.replace(/\s/gu, '')].length
}

function statusLabel(status: string, language: LanguageName): string {
  if (language === 'en') return status
  if (status === 'final') return '已定稿'
  if (status === 'published') return '已发布'
  return '草稿'
}

function reviewStatusLabel(status: FinalizeReviewSession['status'], language: LanguageName): string {
  const labels = {
    planned: { zh: '准备中', en: 'Planned' },
    'needs-confirmation': { zh: '等待作者确认', en: 'Needs confirmation' },
    'ready-to-apply': { zh: '可以安全应用', en: 'Ready to apply' },
    applied: { zh: '已应用并验证', en: 'Applied & verified' }
  }
  return labels[status][language]
}

function targetTypeLabel(type: string, language: LanguageName): string {
  if (language === 'en') return type
  return (
    {
      canon: 'Canon',
      character: '人物',
      character_state: '人物状态',
      timeline_event: '时间线事件',
      location: '地点',
      world_entry: '世界书',
      resource: '资源',
      foreshadowing: '伏笔',
      narrative: '叙事规则',
      issue: '问题'
    }[type] ?? type
  )
}
