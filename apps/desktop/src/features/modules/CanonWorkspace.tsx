import { useEffect, useMemo, useState } from 'react'
import { MessageSquareText, Search } from 'lucide-react'
import type { DocEntry, LanguageName } from '../../app/types.js'
import { t } from '../../app/i18n.js'
import { bridge } from '../../app/bridge.js'
import { formatDesktopError } from '../../shared/errors.js'
import {
  enumChoiceLabel,
  fieldPresentation,
  type FieldPresentationContext
} from '../metadata/field-presentation.js'

export function CanonWorkspace({
  root,
  docs,
  onCreate,
  onReload,
  language
}: {
  root: string
  docs: DocEntry[]
  onCreate: (kind: string, input: Record<string, unknown>) => Promise<unknown>
  onReload: () => Promise<void>
  language: LanguageName
}) {
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(docs[0]?.data.id ?? null)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [status, setStatus] = useState('draft')
  const [strength, setStrength] = useState('hard')
  const [source, setSource] = useState('user')
  const [message, setMessage] = useState('')
  const [transcript, setTranscript] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return docs
    return docs.filter((doc) =>
      [doc.data.title, doc.content, doc.data.status, doc.data.strength, doc.data.source]
        .map((part) => String(part ?? '').toLowerCase())
        .join('\n')
        .includes(needle)
    )
  }, [docs, query])

  const selected = docs.find((doc) => doc.data.id === selectedId) ?? docs[0] ?? null

  useEffect(() => {
    if (!selected) {
      setSelectedId(null)
      setTitle('')
      setContent('')
      setStatus('draft')
      setStrength('hard')
      setSource('user')
      return
    }
    setSelectedId(selected.data.id)
    setTitle(selected.data.title)
    setContent(selected.content)
    setStatus(String(selected.data.status ?? 'draft'))
    setStrength(String(selected.data.strength ?? 'hard'))
    setSource(String(selected.data.source ?? 'user'))
    setMessage('')
    setTranscript('')
    setError(null)
  }, [selected?.path])

  const createCanon = async () => {
    const count = docs.length + 1
    await onCreate('canon', {
      title: `${t(language, 'newCanon')} ${count}`,
      content: '',
      status: 'draft',
      strength: 'hard',
      source: 'user'
    })
  }

  const saveCanon = async () => {
    if (!selected || !title.trim()) return
    setSaving(true)
    try {
      await bridge.saveDocBody(
        selected.path,
        {
          ...selected.data,
          title: title.trim(),
          status,
          strength,
          source
        },
        content
      )
      await onReload()
    } finally {
      setSaving(false)
    }
  }

  const discuss = async () => {
    if (!selected || !message.trim()) return
    setAiBusy(true)
    setError(null)
    try {
      const nextTranscript = [transcript, `\n\n### ${t(language, 'writer')}\n${message.trim()}`].join('')
      const reply = await bridge.discussCanon(root, {
        mode: 'discuss',
        title,
        content,
        status,
        strength,
        source,
        transcript: nextTranscript,
        message
      })
      setTranscript(`${nextTranscript}\n\n### ${t(language, 'canonCurator')}\n${reply}`)
      setMessage('')
    } catch (err) {
      setError(formatCanonAIError(err, language))
    } finally {
      setAiBusy(false)
    }
  }

  const summarize = async () => {
    if (!selected) return
    setAiBusy(true)
    setError(null)
    try {
      const reply = await bridge.discussCanon(root, {
        mode: 'summarize',
        title,
        content,
        status,
        strength,
        source,
        transcript
      })
      const parsed = parseCanonSummary(reply)
      setContent(parsed.content || reply)
      if (parsed.status) setStatus(parsed.status)
      if (parsed.strength) setStrength(parsed.strength)
      if (parsed.source) setSource(parsed.source)
      setTranscript(`${transcript}\n\n### ${t(language, 'canonCurator')}\n${reply}`)
    } catch (err) {
      setError(formatCanonAIError(err, language))
    } finally {
      setAiBusy(false)
    }
  }

  return (
    <section className="module-view module-view-full canon-workspace">
      <div className="module-head">
        <div>
          <h2>Canon</h2>
          <small>{t(language, 'canonWorkspaceHint')}</small>
        </div>
        <div className="inline-create">
          <button onClick={createCanon}>{t(language, 'createCanonCard')}</button>
        </div>
      </div>
      <div className="canon-layout">
        <div className="canon-card-pane">
          <label className="search-box">
            <Search size={16} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t(language, 'searchCanon')}
            />
          </label>
          <div className="canon-card-list">
            {filtered.map((doc) => (
              <button
                key={doc.data.id}
                className={`canon-card ${selected?.data.id === doc.data.id ? 'active' : ''}`}
                onClick={() => setSelectedId(doc.data.id)}
              >
                <div className="canon-card-title">
                  <strong>{doc.data.title}</strong>
                  <span className={`badge ${doc.data.status === 'confirmed' ? 'ok' : 'warn'}`}>
                    {enumChoiceLabel('status', String(doc.data.status ?? 'draft'), language)}
                  </span>
                </div>
                <small>
                  {enumChoiceLabel('strength', String(doc.data.strength ?? 'hard'), language, {
                    documentType: 'canon'
                  })}{' '}
                  ·{' '}
                  {enumChoiceLabel('source', String(doc.data.source ?? 'user'), language, {
                    documentType: 'canon'
                  })}
                </small>
                <p>{doc.content.slice(0, 140) || t(language, 'emptyBody')}</p>
              </button>
            ))}
            {filtered.length === 0 && <div className="empty-row">{t(language, 'noCanonFound')}</div>}
          </div>
        </div>
        <div className="canon-detail">
          {selected ? (
            <>
              <div className="canon-form-grid">
                <label>
                  <CanonFieldCopy name="title" language={language} />
                  <input value={title} onChange={(e) => setTitle(e.target.value)} />
                </label>
                <label>
                  <CanonFieldCopy name="status" language={language} />
                  <select value={status} onChange={(e) => setStatus(e.target.value)}>
                    {['draft', 'confirmed', 'deprecated'].map((value) => (
                      <option key={value} value={value}>
                        {enumChoiceLabel('status', value, language)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <CanonFieldCopy name="strength" language={language} />
                  <select value={strength} onChange={(e) => setStrength(e.target.value)}>
                    {['hard', 'soft'].map((value) => (
                      <option key={value} value={value}>
                        {enumChoiceLabel('strength', value, language)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <CanonFieldCopy name="source" language={language} context={{ documentType: 'canon' }} />
                  <select value={source} onChange={(e) => setSource(e.target.value)}>
                    {['user', 'ai', 'imported', 'historical'].map((value) => (
                      <option key={value} value={value}>
                        {enumChoiceLabel('source', value, language, { documentType: 'canon' })}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="canon-body">
                <CanonFieldCopy name="canon_content" language={language} />
                <textarea value={content} onChange={(e) => setContent(e.target.value)} />
              </label>
              <div className="canon-actions">
                <button onClick={saveCanon} disabled={saving || !title.trim()}>
                  {saving ? t(language, 'saving') : t(language, 'saveCanon')}
                </button>
              </div>
              <div className="discussion-panel">
                <div className="discussion-head">
                  <span>
                    <MessageSquareText size={16} /> {t(language, 'canonDiscussion')}
                  </span>
                  <small>{t(language, 'usesBackgroundAI')}</small>
                </div>
                <textarea
                  className="discussion-transcript"
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                  placeholder={t(language, 'discussionPlaceholder')}
                />
                <div className="discussion-input">
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder={t(language, 'canonMessagePlaceholder')}
                  />
                  <div className="canon-actions">
                    <button onClick={discuss} disabled={aiBusy || !message.trim()}>
                      {t(language, 'discussWithAI')}
                    </button>
                    <button onClick={summarize} disabled={aiBusy || (!transcript.trim() && !content.trim())}>
                      {t(language, 'summarizeToCanon')}
                    </button>
                  </div>
                </div>
                {error && <div className="error-box">{error}</div>}
              </div>
            </>
          ) : (
            <div className="empty-row">{t(language, 'noCanonCards')}</div>
          )}
        </div>
      </div>
    </section>
  )
}

function CanonFieldCopy({
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

function parseCanonSummary(text: string): {
  content: string
  status?: string
  strength?: string
  source?: string
} {
  const canonMatch = text.match(/##\s*Canon\s*\n([\s\S]*?)(?=\n##\s*Metadata|\s*$)/i)
  const content = canonMatch?.[1]?.trim() ?? ''
  const status = text.match(/status:\s*(draft|confirmed|deprecated)/i)?.[1]
  const strength = text.match(/strength:\s*(hard|soft)/i)?.[1]
  const source = text.match(/source:\s*(user|ai|imported|historical)/i)?.[1]
  return { content, status, strength, source }
}

function formatCanonAIError(err: unknown, language: LanguageName): string {
  const raw = err instanceof Error ? err.message : String(err)
  const message = raw.replace(/^Error invoking remote method 'canon:discuss':\s*/i, '')
  if (/fetch failed|AI connection failed/i.test(message)) {
    return language === 'zh'
      ? [
          'AI 连接失败：请检查背景 AI 的接口地址、API 密钥和网络/代理。',
          '如果上一轮输出很长，系统已在本次请求中自动裁剪旧讨论；仍失败时可以先点“归纳为 Canon”或手动删掉部分讨论记录后继续。'
        ].join('')
      : [
          'AI connection failed. Check the background AI endpoint, API key, and network/proxy.',
          'If the previous response was long, old discussion is now trimmed automatically; if it still fails, summarize to Canon or remove part of the transcript before continuing.'
        ].join(' ')
  }
  if (/context|maximum|too large|413|400/i.test(message)) {
    return language === 'zh'
      ? 'AI 请求过大：请先点“归纳为 Canon”，或删掉部分讨论记录后继续。'
      : 'AI request is too large. Summarize to Canon or remove part of the transcript before continuing.'
  }
  return formatDesktopError(message, language)
}
