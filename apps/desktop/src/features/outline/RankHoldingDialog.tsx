import { useEffect, useId, useState } from 'react'
import { FilePlus2, X } from 'lucide-react'
import type { DocEntry, LanguageName } from '../../app/types.js'
import { formatDesktopError } from '../../shared/errors.js'

export function RankHoldingDialog({
  docs,
  language,
  busy,
  onClose,
  onConfirm
}: {
  docs: DocEntry[]
  language: LanguageName
  busy: boolean
  onClose: () => void
  onConfirm: (input: {
    title: string
    ladder_id: string
    holder_type: 'character' | 'faction'
    holder_id: string
    rung_id: string
    starts_at: string | null
    ends_at: string | null
  }) => Promise<void>
}) {
  const titleId = useId()
  const zh = language === 'zh'
  const ladders = docs.filter((doc) => doc.data.type === 'rank_ladder')
  const [ladderId, setLadderId] = useState(String(ladders[0]?.data.id ?? ''))
  const ladder = ladders.find((doc) => doc.data.id === ladderId)
  const rungs = Array.isArray(ladder?.data.rungs)
    ? ladder.data.rungs.flatMap((row) => {
        if (!row || typeof row !== 'object') return []
        const id = String((row as { id?: unknown }).id ?? '')
        const label = String((row as { label?: unknown }).label ?? '')
        return id && label ? [{ id, label }] : []
      })
    : []
  const [rungId, setRungId] = useState(rungs[0]?.id ?? '')
  const [holderType, setHolderType] = useState<'character' | 'faction'>('character')
  const holders = docs.filter((doc) => doc.data.type === holderType)
  const [holderId, setHolderId] = useState(String(holders[0]?.data.id ?? ''))
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  const submit = async () => {
    const holder = holders.find((doc) => doc.data.id === holderId)
    const rung = rungs.find((row) => row.id === rungId)
    if (!ladder || !holder || !rung) {
      setError(
        zh ? '先选定等级、档位和人物或组织。' : 'Choose a ladder, a rung, and a character or organization.'
      )
      return
    }
    setError('')
    try {
      await onConfirm({
        title: `${String(holder.data.title)} · ${rung.label}`,
        ladder_id: String(ladder.data.id),
        holder_type: holderType,
        holder_id: String(holder.data.id),
        rung_id: rung.id,
        starts_at: startsAt.trim() || null,
        ends_at: endsAt.trim() || null
      })
    } catch (cause) {
      setError(formatDesktopError(cause, language))
    }
  }

  return (
    <div
      className="modal-backdrop outline-create-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose()
      }}
    >
      <section
        className="modal outline-create-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="outline-create-head">
          <div className="outline-create-icon">
            <FilePlus2 size={20} />
          </div>
          <div>
            <span className="planning-kicker">
              {zh ? '一段时间内占据一档' : 'One rung for a span of time'}
            </span>
            <h2 id={titleId}>{zh ? '登记任职' : 'Record a holding'}</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label={zh ? '关闭' : 'Close'}
          >
            <X size={18} />
          </button>
        </header>
        <div className="outline-create-body">
          {ladders.length === 0 ? (
            <p>
              {zh
                ? '先新建一个等级，再登记谁占据哪一档。'
                : 'Create a rank ladder before recording a holding.'}
            </p>
          ) : (
            <>
              <label>
                <span>{zh ? '等级' : 'Ladder'}</span>
                <select
                  value={ladderId}
                  onChange={(event) => {
                    setLadderId(event.target.value)
                    setRungId('')
                  }}
                >
                  {ladders.map((doc) => (
                    <option key={doc.data.id} value={doc.data.id}>
                      {String(doc.data.title)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>{zh ? '档位' : 'Rung'}</span>
                <select value={rungId} onChange={(event) => setRungId(event.target.value)}>
                  <option value="">{zh ? '选择一档' : 'Choose a rung'}</option>
                  {rungs.map((rung) => (
                    <option key={rung.id} value={rung.id}>
                      {rung.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>{zh ? '占据者' : 'Holder'}</span>
                <select
                  value={holderType}
                  onChange={(event) => {
                    const next = event.target.value === 'faction' ? 'faction' : 'character'
                    setHolderType(next)
                    setHolderId('')
                  }}
                >
                  <option value="character">{zh ? '人物' : 'Character'}</option>
                  <option value="faction">{zh ? '组织' : 'Organization'}</option>
                </select>
                <select value={holderId} onChange={(event) => setHolderId(event.target.value)}>
                  <option value="">{zh ? '选择' : 'Choose'}</option>
                  {holders.map((doc) => (
                    <option key={doc.data.id} value={doc.data.id}>
                      {String(doc.data.title)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>{zh ? '开始' : 'Starts'}</span>
                <input value={startsAt} onChange={(event) => setStartsAt(event.target.value)} />
              </label>
              <label>
                <span>{zh ? '结束' : 'Ends'}</span>
                <input value={endsAt} onChange={(event) => setEndsAt(event.target.value)} />
              </label>
            </>
          )}
          {error && (
            <p className="outline-create-error" role="alert">
              {error}
            </p>
          )}
          <div className="modal-actions">
            <button type="button" className="secondary" onClick={onClose} disabled={busy}>
              {zh ? '取消' : 'Cancel'}
            </button>
            <button
              type="button"
              className="primary"
              onClick={() => void submit()}
              disabled={busy || ladders.length === 0}
            >
              {zh ? '写入' : 'Save'}
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
