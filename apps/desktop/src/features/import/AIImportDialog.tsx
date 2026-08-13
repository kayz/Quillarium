import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  Check,
  FileText,
  LoaderCircle,
  Plus,
  Trash2,
  Upload,
  WandSparkles,
  X
} from 'lucide-react'
import type { DocType, ImportCandidate, ImportSession } from '@quillarium/core'
import type { DocEntry, LanguageName } from '../../app/types.js'
import { bridge } from '../../app/bridge.js'
import { formatDesktopError } from '../../shared/errors.js'
import {
  documentTypeLabel,
  fieldPresentation,
  outlineLevelDisplayLabel,
  type FieldPresentationContext
} from '../metadata/field-presentation.js'
import { MetadataEditor } from '../outline/OutlineShared.js'
import { MarkdownBodyEditor } from '../markdown/MarkdownBodyEditor.js'

const IMPORT_TYPES: DocType[] = [
  'canon',
  'character',
  'character_state',
  'world_entry',
  'timeline_event',
  'location',
  'foreshadowing',
  'strategy',
  'pattern',
  'issue',
  'reference',
  'outline'
]

export async function chooseAIImportSources(importBridge: {
  chooseImportSources?: () => Promise<string[]>
}): Promise<string[]> {
  if (typeof importBridge.chooseImportSources !== 'function') {
    throw new Error('Quillarium desktop bridge is out of date: import source picker unavailable.')
  }
  return importBridge.chooseImportSources()
}

export function AIImportDialog({
  root,
  docs,
  language,
  onClose,
  onImported
}: {
  root: string
  docs: DocEntry[]
  language: LanguageName
  onClose: () => void
  onImported: () => Promise<void>
}) {
  const zh = language === 'zh'
  const [inputMode, setInputMode] = useState<'text' | 'files'>('text')
  const [sourceText, setSourceText] = useState('')
  const [sourcePaths, setSourcePaths] = useState<string[]>([])
  const [session, setSession] = useState<ImportSession | null>(null)
  const [candidates, setCandidates] = useState<ImportCandidate[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [issueAnswers, setIssueAnswers] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<'choose' | 'analyze' | 'save' | 'land' | 'issue' | null>(null)
  const [error, setError] = useState('')
  const selected = candidates[selectedIndex] ?? null
  const openIssues = session?.issues.filter((issue) => issue.state === 'open') ?? []
  const outlines = useMemo(() => docs.filter((doc) => doc.data.type === 'outline'), [docs])

  const chooseFiles = async () => {
    setBusy('choose')
    setError('')
    try {
      const paths = await chooseAIImportSources(bridge)
      if (paths.length) {
        setSourcePaths(paths)
        setInputMode('files')
      }
    } catch (cause) {
      setError(formatDesktopError(cause, language))
    } finally {
      setBusy(null)
    }
  }

  const analyze = async () => {
    setBusy('analyze')
    setError('')
    try {
      const planned = await bridge.createAIImportPlan(root, {
        sourceKind: inputMode === 'text' ? 'text' : 'file',
        ...(inputMode === 'text' ? { markdownText: sourceText } : { sourcePaths })
      })
      setSession(planned)
      setCandidates(planned.candidates.map(withFriendlyFields))
      setSelectedIndex(0)
    } catch (cause) {
      setError(formatDesktopError(cause, language))
    } finally {
      setBusy(null)
    }
  }

  const updateCandidate = (index: number, update: Partial<ImportCandidate>) => {
    setCandidates((items) =>
      items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...update } : item))
    )
  }

  const saveCandidates = async (): Promise<ImportSession | null> => {
    if (!session) return null
    setBusy('save')
    setError('')
    try {
      const saved = await bridge.updateImportCandidates(root, session.id, candidates)
      setSession(saved)
      setCandidates(saved.candidates.map(withFriendlyFields))
      return saved
    } catch (cause) {
      setError(formatDesktopError(cause, language))
      return null
    } finally {
      setBusy(null)
    }
  }

  const resolveIssue = async (issueId: string) => {
    if (!session) return
    setBusy('issue')
    setError('')
    try {
      const answer =
        issueAnswers[issueId]?.trim() ||
        (zh ? '已按当前候选内容人工确认。' : 'Confirmed as currently edited.')
      const next = await bridge.answerImportIssue(root, session.id, issueId, answer)
      setSession(next)
    } catch (cause) {
      setError(formatDesktopError(cause, language))
    } finally {
      setBusy(null)
    }
  }

  const land = async () => {
    if (!session) return
    setBusy('land')
    setError('')
    try {
      const saved = await bridge.updateImportCandidates(root, session.id, candidates)
      if (saved.issues.some((issue: ImportSession['issues'][number]) => issue.state === 'open')) {
        setSession(saved)
        throw new Error('Import session still has open issues.')
      }
      const landed = await bridge.landImportSession(root, session.id)
      setSession(landed)
      setCandidates(landed.candidates.map(withFriendlyFields))
      await onImported()
    } catch (cause) {
      setError(formatDesktopError(cause, language))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="modal-backdrop ai-import-backdrop">
      <section
        className="modal ai-import-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-import-title"
      >
        <header className="ai-import-head">
          <div>
            <span className="planning-kicker">{zh ? '资料拆分台' : 'Source breakdown desk'}</span>
            <h2 id="ai-import-title">{zh ? 'AI 辅助导入设定' : 'AI-assisted record import'}</h2>
            <p>
              {zh
                ? '输入材料 → AI 拆分 → 人工校对 → 确认写入。未经确认不会改动项目。'
                : 'Provide sources, review AI-split records, then confirm the write.'}
            </p>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            disabled={Boolean(busy)}
            aria-label={zh ? '关闭' : 'Close'}
          >
            <X size={18} />
          </button>
        </header>

        <ol className="ai-import-steps" aria-label={zh ? '导入步骤' : 'Import steps'}>
          <li className={!session ? 'active' : 'done'}>
            <span>1</span>
            {zh ? '输入材料' : 'Sources'}
          </li>
          <li
            className={
              session && session.status !== 'landed' && session.status !== 'partial'
                ? 'active'
                : session
                  ? 'done'
                  : ''
            }
          >
            <span>2</span>
            {zh ? '拆分与校对' : 'Review'}
          </li>
          <li className={session?.status === 'landed' || session?.status === 'partial' ? 'active' : ''}>
            <span>3</span>
            {zh ? '导入结果' : 'Results'}
          </li>
        </ol>

        {!session ? (
          <div className="ai-import-input-grid">
            <section className="ai-import-source-choice">
              <button className={inputMode === 'text' ? 'active' : ''} onClick={() => setInputMode('text')}>
                <FileText size={18} />
                <strong>{zh ? '粘贴大段文字' : 'Paste text'}</strong>
                <small>{zh ? '纯文本或 Markdown 都可以' : 'Plain text or Markdown'}</small>
              </button>
              <button className={inputMode === 'files' ? 'active' : ''} onClick={() => void chooseFiles()}>
                <Upload size={18} />
                <strong>{zh ? '选择文件' : 'Choose files'}</strong>
                <small>{zh ? '支持 .md、.markdown、.txt' : '.md, .markdown, or .txt'}</small>
              </button>
            </section>
            <section className="ai-import-source-editor">
              {inputMode === 'text' ? (
                <label>
                  <span>
                    {zh ? '原始材料' : 'Source material'}{' '}
                    <small>
                      {sourceText.length} {zh ? '字符' : 'chars'}
                    </small>
                  </span>
                  <textarea
                    value={sourceText}
                    onChange={(event) => setSourceText(event.target.value)}
                    placeholder={
                      zh
                        ? '粘贴人物小传、世界观资料、时间线、旧大纲或混合笔记…'
                        : 'Paste notes, timelines, outlines, or mixed source material…'
                    }
                  />
                </label>
              ) : (
                <div className="ai-import-file-list">
                  {sourcePaths.map((source) => (
                    <div key={source}>
                      <FileText size={16} />
                      <span>
                        <strong>{fileName(source)}</strong>
                        <small>{source}</small>
                      </span>
                    </div>
                  ))}
                  {!sourcePaths.length && (
                    <button onClick={() => void chooseFiles()}>
                      <Plus size={16} />
                      {zh ? '选择材料文件' : 'Choose source files'}
                    </button>
                  )}
                </div>
              )}
            </section>
          </div>
        ) : session.status === 'landed' || session.status === 'partial' ? (
          <ImportResults
            session={session}
            language={language}
            onRetry={() => void land()}
            busy={busy === 'land'}
          />
        ) : (
          <div className="ai-import-review-grid">
            <aside className="ai-import-candidate-list">
              <header>
                <strong>{zh ? `候选条目 ${candidates.length}` : `${candidates.length} candidates`}</strong>
                <small>{zh ? '选择后在右侧校对' : 'Select one to review'}</small>
              </header>
              {candidates.map((candidate, index) => (
                <button
                  key={`${candidate.type}-${index}`}
                  className={selectedIndex === index ? 'active' : ''}
                  onClick={() => setSelectedIndex(index)}
                >
                  <span className={`candidate-type type-${candidate.type}`}>
                    {typeLabel(candidate.type, language)}
                  </span>
                  <strong>{candidate.title}</strong>
                  <small>
                    {Math.round(candidate.confidence * 100)}% ·{' '}
                    {candidate.reason || (zh ? 'AI 拆分' : 'AI split')}
                  </small>
                </button>
              ))}
              {!candidates.length && (
                <p>{zh ? '没有可导入的候选条目。请返回并补充材料。' : 'No candidates were found.'}</p>
              )}
            </aside>
            <section className="ai-import-candidate-editor">
              {selected ? (
                <>
                  <div className="candidate-editor-head">
                    <label>
                      <ImportFieldCopy name="import_target_type" language={language} />
                      <select
                        value={selected.type}
                        onChange={(event) =>
                          updateCandidate(selectedIndex, { type: event.target.value as DocType })
                        }
                      >
                        {IMPORT_TYPES.map((type) => (
                          <option key={type} value={type}>
                            {typeLabel(type, language)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <ImportFieldCopy name="title" language={language} />
                      <input
                        value={selected.title}
                        onChange={(event) => updateCandidate(selectedIndex, { title: event.target.value })}
                      />
                    </label>
                    <button
                      className="danger"
                      onClick={() => {
                        setCandidates((items) => items.filter((_item, index) => index !== selectedIndex))
                        setSelectedIndex((index) => Math.max(0, index - 1))
                      }}
                    >
                      <Trash2 size={15} />
                      {zh ? '移除' : 'Remove'}
                    </button>
                  </div>
                  {selected.type === 'outline' && (
                    <div className="candidate-outline-target">
                      <label>
                        <ImportFieldCopy
                          name="level"
                          language={language}
                          context={{ documentType: 'outline' }}
                        />
                        <select
                          value={String(selected.frontmatter.level ?? 'book')}
                          onChange={(event) =>
                            updateCandidate(selectedIndex, {
                              frontmatter: { ...selected.frontmatter, level: event.target.value }
                            })
                          }
                        >
                          {['overview', 'book', 'volume', 'part', 'act', 'chapter'].map((level) => (
                            <option key={level} value={level}>
                              {outlineLevelDisplayLabel(level, language)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <ImportFieldCopy
                          name="parent"
                          language={language}
                          context={{ documentType: 'outline' }}
                        />
                        <select
                          value={String(selected.frontmatter.parent ?? '')}
                          onChange={(event) =>
                            updateCandidate(selectedIndex, {
                              frontmatter: { ...selected.frontmatter, parent: event.target.value || null }
                            })
                          }
                        >
                          <option value="">{zh ? '根节点' : 'Root'}</option>
                          {outlines.map((outline) => (
                            <option key={outline.data.id} value={outline.data.id}>
                              {outline.data.title}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  )}
                  <section className="candidate-fields">
                    <MetadataEditor
                      data={selected.frontmatter}
                      docs={docs}
                      language={language}
                      documentType={selected.type}
                      excludeKeys={selected.type === 'outline' ? ['level', 'parent'] : []}
                      onChange={(frontmatter) => updateCandidate(selectedIndex, { frontmatter })}
                    />
                  </section>
                  <MarkdownBodyEditor
                    value={selected.content}
                    onChange={(content) => updateCandidate(selectedIndex, { content })}
                    language={language}
                  />
                </>
              ) : (
                <div className="proposal-empty">
                  <WandSparkles size={28} />
                  <h3>{zh ? '选择一个候选条目' : 'Select a candidate'}</h3>
                </div>
              )}
            </section>
          </div>
        )}

        {session && session.status !== 'landed' && session.status !== 'partial' && openIssues.length > 0 && (
          <section className="ai-import-issues">
            <header>
              <AlertTriangle size={17} />
              <strong>{zh ? '需要人工确认' : 'Needs confirmation'}</strong>
            </header>
            {openIssues.map((issue) => (
              <div key={issue.id}>
                <span>
                  <strong>{issue.title}</strong>
                  <small>{issue.decision_needed}</small>
                </span>
                <input
                  value={issueAnswers[issue.id] ?? ''}
                  onChange={(event) =>
                    setIssueAnswers((answers) => ({ ...answers, [issue.id]: event.target.value }))
                  }
                  placeholder={zh ? '可填写确认说明' : 'Optional decision note'}
                />
                <button onClick={() => void resolveIssue(issue.id)} disabled={Boolean(busy)}>
                  <Check size={14} />
                  {zh ? '确认' : 'Resolve'}
                </button>
              </div>
            ))}
          </section>
        )}

        {error && (
          <div className="error-box" role="alert">
            {error}
          </div>
        )}
        <footer className="modal-actions ai-import-actions">
          <button className="secondary" onClick={onClose} disabled={Boolean(busy)}>
            {session?.status === 'landed' || session?.status === 'partial'
              ? zh
                ? '完成'
                : 'Done'
              : zh
                ? '取消'
                : 'Cancel'}
          </button>
          {!session ? (
            <button
              className="primary"
              onClick={() => void analyze()}
              disabled={Boolean(busy) || (inputMode === 'text' ? !sourceText.trim() : !sourcePaths.length)}
            >
              {busy === 'analyze' ? <LoaderCircle className="spin" size={15} /> : <WandSparkles size={15} />}
              {busy === 'analyze' ? (zh ? '正在拆分…' : 'Analyzing…') : zh ? '交给 AI 拆分' : 'Split with AI'}
            </button>
          ) : session.status !== 'landed' && session.status !== 'partial' ? (
            <>
              <button onClick={() => void saveCandidates()} disabled={Boolean(busy) || !candidates.length}>
                {zh ? '保存校对' : 'Save review'}
              </button>
              <button
                className="primary"
                onClick={() => void land()}
                disabled={Boolean(busy) || !candidates.length || openIssues.length > 0}
              >
                {busy === 'land' ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />}
                {zh ? '确认并导入' : 'Confirm import'}
              </button>
            </>
          ) : null}
        </footer>
      </section>
    </div>
  )
}

function ImportFieldCopy({
  name,
  language,
  context = {}
}: {
  name: string
  language: LanguageName
  context?: FieldPresentationContext
}) {
  const presentation = fieldPresentation(name, language, context)
  return (
    <span className="localized-field-copy">
      <strong>{presentation.label}</strong>
      <small>{presentation.description}</small>
    </span>
  )
}

function ImportResults({
  session,
  language,
  onRetry,
  busy
}: {
  session: ImportSession
  language: LanguageName
  onRetry: () => void
  busy: boolean
}) {
  const zh = language === 'zh'
  return (
    <section className="ai-import-results">
      <header>
        <Check size={22} />
        <div>
          <h3>
            {session.failures?.length
              ? zh
                ? '部分条目需要重试'
                : 'Some records need retrying'
              : zh
                ? '导入完成'
                : 'Import complete'}
          </h3>
          <p>{zh ? `已写入 ${session.landed.length} 项。` : `${session.landed.length} records written.`}</p>
        </div>
      </header>
      <div className="import-result-list">
        {session.landed.map((item) => (
          <div key={item.path} className="success">
            <Check size={15} />
            <span>
              <strong>{item.title}</strong>
              <small>{typeLabel(item.type, language)}</small>
            </span>
          </div>
        ))}
        {session.failures?.map((failure) => (
          <div key={`${failure.candidate_index}-${failure.title}`} className="failure">
            <AlertTriangle size={15} />
            <span>
              <strong>{failure.title}</strong>
              <small>{formatDesktopError(failure.message, language)}</small>
            </span>
          </div>
        ))}
      </div>
      {Boolean(session.failures?.length) && (
        <button onClick={onRetry} disabled={busy}>
          {busy ? <LoaderCircle className="spin" size={15} /> : null}
          {zh ? '重试失败项' : 'Retry failed records'}
        </button>
      )}
    </section>
  )
}

function withFriendlyFields(candidate: ImportCandidate): ImportCandidate {
  return {
    ...candidate,
    frontmatter: {
      tags: [],
      ...(candidate.type === 'world_entry' ? { triggers: [], category_tags: [] } : {}),
      ...candidate.frontmatter
    }
  }
}

function typeLabel(type: string, language: LanguageName): string {
  return documentTypeLabel(type, language)
}

function fileName(value: string): string {
  return value.split(/[\\/]/u).at(-1) ?? value
}
