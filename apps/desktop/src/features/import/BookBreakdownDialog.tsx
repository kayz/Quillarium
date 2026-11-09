import { useState } from 'react'
import { X } from 'lucide-react'
import type { BookBreakdownPlan, BookBreakdownType } from '@quillarium/core'
import type { LanguageName } from '../../app/types.js'
import { bridge } from '../../app/bridge.js'
import { formatDesktopError } from '../../shared/errors.js'

const TYPES: Array<{ id: BookBreakdownType; label: string }> = [
  { id: 'world_entry', label: '基础条目' },
  { id: 'character', label: '人物' },
  { id: 'location', label: '地点' },
  { id: 'timeline_event', label: '事件' },
  { id: 'item', label: '物品' },
  { id: 'faction', label: '组织' }
]

export function BookBreakdownDialog({
  root,
  language,
  onClose,
  onImported
}: {
  root: string
  language: LanguageName
  onClose: () => void
  onImported: () => Promise<void>
}) {
  const zh = language === 'zh'
  const [text, setText] = useState('')
  const [importProse, setImportProse] = useState(false)
  const [plan, setPlan] = useState<BookBreakdownPlan | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const planBreakdown = async () => {
    try {
      setBusy(true)
      setError('')
      setPlan(await bridge.planBookBreakdown(root, text, importProse))
    } catch (cause) {
      setError(formatDesktopError(cause, language))
    } finally {
      setBusy(false)
    }
  }

  const confirm = async () => {
    if (!plan) return
    try {
      setBusy(true)
      setError('')
      await bridge.confirmBookBreakdown(root, plan)
      await onImported()
      onClose()
    } catch (cause) {
      setError(formatDesktopError(cause, language))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal" role="dialog" aria-labelledby="book-breakdown-title">
        <header>
          <h2 id="book-breakdown-title">{zh ? '拆书' : 'Break down a text'}</h2>
          <button onClick={onClose} aria-label={zh ? '关闭' : 'Close'}>
            <X size={16} />
          </button>
        </header>
        <p>
          {zh
            ? '放入原文后，模型一次列出世界书提案。默认不把正文写入作品。'
            : 'The model lists world-book proposals once. Prose stays out unless you ask for it.'}
        </p>
        {error && <div className="error-box">{error}</div>}
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={zh ? '把要拆的原文粘贴在这里' : 'Paste the source text'}
          rows={8}
          disabled={busy}
        />
        <label>
          <input
            type="checkbox"
            checked={importProse}
            onChange={(event) => setImportProse(event.target.checked)}
            disabled={busy}
          />
          {zh ? '同时把正文导入为章草稿' : 'Also import the prose as chapter drafts'}
        </label>
        <button onClick={() => void planBreakdown()} disabled={busy || !text.trim()}>
          {busy ? (zh ? '处理中…' : 'Working…') : zh ? '列出世界书提案' : 'List world-book proposals'}
        </button>
        {plan?.warning && <p>{plan.warning}</p>}
        {plan && (
          <ul>
            {plan.proposals.map((proposal) => (
              <li key={proposal.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={proposal.selected}
                    onChange={(event) =>
                      setPlan({
                        ...plan,
                        proposals: plan.proposals.map((item) =>
                          item.id === proposal.id ? { ...item, selected: event.target.checked } : item
                        )
                      })
                    }
                  />
                  {proposal.title}
                </label>
                <select
                  value={proposal.type}
                  onChange={(event) =>
                    setPlan({
                      ...plan,
                      proposals: plan.proposals.map((item) =>
                        item.id === proposal.id
                          ? { ...item, type: event.target.value as BookBreakdownType }
                          : item
                      )
                    })
                  }
                >
                  {TYPES.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </li>
            ))}
            {plan.proposals.length === 0 && <li>{zh ? '这次没有提案。' : 'No proposals.'}</li>}
          </ul>
        )}
        {plan && (
          <button className="primary" onClick={() => void confirm()} disabled={busy}>
            {zh ? '确认写入' : 'Confirm'}
          </button>
        )}
      </section>
    </div>
  )
}
