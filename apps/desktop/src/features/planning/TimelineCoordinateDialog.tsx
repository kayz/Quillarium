import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { CalendarPlus2, Link2, X } from 'lucide-react'
import type { DocEntry, LanguageName } from '../../app/types.js'
import { formatDesktopError } from '../../shared/errors.js'

export interface TimelineCoordinateInput {
  title: string
  storyTime: string
  sourceEventId?: string
}

export function TimelineCoordinateDialog({
  events,
  initialEventId,
  language,
  busy,
  onClose,
  onConfirm
}: {
  events: DocEntry[]
  initialEventId?: string | null
  language: LanguageName
  busy: boolean
  onClose: () => void
  onConfirm: (input: TimelineCoordinateInput) => Promise<void>
}) {
  const titleId = useId()
  const storyTimeRef = useRef<HTMLInputElement | null>(null)
  const zh = language === 'zh'
  const candidates = useMemo(
    () =>
      events.filter(
        (item) =>
          item.data.type === 'timeline_event' &&
          !item.data.timeline_node &&
          typeof item.data.date === 'string' &&
          item.data.date.trim()
      ),
    [events]
  )
  const initialEvent = candidates.find((item) => item.data.id === initialEventId) ?? null
  const [sourceEventId, setSourceEventId] = useState(initialEvent?.data.id ?? '')
  const [storyTime, setStoryTime] = useState(String(initialEvent?.data.date ?? ''))
  const [title, setTitle] = useState(initialEvent?.data.title ?? '')
  const [error, setError] = useState('')

  useEffect(() => {
    storyTimeRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  const selectSource = (eventId: string) => {
    setSourceEventId(eventId)
    setError('')
    const source = candidates.find((item) => item.data.id === eventId)
    if (!source) return
    setStoryTime(String(source.data.date ?? ''))
    setTitle(source.data.title)
  }

  const submit = async () => {
    const time = storyTime.trim()
    const name = title.trim() || time
    if (!time) {
      setError(zh ? '请输入至少精确到月的故事时间。' : 'Enter a story time precise to at least a month.')
      storyTimeRef.current?.focus()
      return
    }
    setError('')
    try {
      await onConfirm({
        title: name,
        storyTime: time,
        sourceEventId: sourceEventId || undefined
      })
    } catch (cause) {
      setError(formatDesktopError(cause, language))
    }
  }

  const selectedEvent = candidates.find((item) => item.data.id === sourceEventId)

  return (
    <div
      className="modal-backdrop timeline-coordinate-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose()
      }}
    >
      <section
        className="modal timeline-coordinate-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="timeline-coordinate-head">
          <div className="timeline-coordinate-icon">
            <CalendarPlus2 size={20} />
          </div>
          <div>
            <span className="planning-kicker">{zh ? '时间主链' : 'Timeline chain'}</span>
            <h2 id={titleId}>{zh ? '建立时间坐标' : 'Create time coordinate'}</h2>
            <p>
              {zh
                ? '坐标负责排序；同一坐标可以挂载多个同时发生的事件。'
                : 'Coordinates define order; several concurrent events can share one coordinate.'}
            </p>
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

        <form
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <label className="timeline-coordinate-field">
            <span>
              <strong>{zh ? '使用已有事件' : 'Use an existing event'}</strong>
              <small>
                {zh
                  ? '可直接读取事件的“故事时间”，创建后自动挂载该事件。'
                  : 'Read its Story time directly and attach the event after creation.'}
              </small>
            </span>
            <select
              value={sourceEventId}
              onChange={(event) => selectSource(event.target.value)}
              disabled={busy}
            >
              <option value="">{zh ? '不关联事件，手工输入时间' : 'No event; enter time manually'}</option>
              {candidates.map((item) => (
                <option key={item.data.id} value={item.data.id}>
                  {item.data.title} · {String(item.data.date)}
                </option>
              ))}
            </select>
          </label>

          {selectedEvent && (
            <div className="timeline-coordinate-source">
              <Link2 size={15} />
              <span>
                <strong>{selectedEvent.data.title}</strong>
                <small>
                  {zh ? '故事时间' : 'Story time'} · {String(selectedEvent.data.date)}
                </small>
              </span>
            </div>
          )}

          <div className="timeline-coordinate-grid">
            <label className="timeline-coordinate-field">
              <span>
                <strong>{zh ? '故事时间' : 'Story time'}</strong>
                <small>
                  {zh
                    ? '至少精确到月；支持日期、分钟或模糊季节。'
                    : 'At least a month; dates, minutes, and fuzzy seasons are supported.'}
                </small>
              </span>
              <input
                ref={storyTimeRef}
                value={storyTime}
                onChange={(event) => {
                  setStoryTime(event.target.value)
                  if (error) setError('')
                }}
                placeholder={zh ? '例如：1449-08、1449-08-15 09:30、20年秋' : 'e.g. 1449-08 or 20 autumn'}
                disabled={busy}
                aria-invalid={Boolean(error)}
              />
            </label>
            <label className="timeline-coordinate-field">
              <span>
                <strong>{zh ? '坐标名称' : 'Coordinate name'}</strong>
                <small>
                  {zh
                    ? '便于作者识别；留空时使用故事时间。'
                    : 'An author-facing label; defaults to Story time.'}
                </small>
              </span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={zh ? '例如：秋季朝会' : 'e.g. Autumn council'}
                disabled={busy}
              />
            </label>
          </div>

          <p className="timeline-coordinate-note">
            {zh
              ? '如果相同时间已有坐标，系统会直接复用，不会建立重复节点。'
              : 'If the moment already has a coordinate, it is reused instead of duplicated.'}
          </p>
          {error && (
            <p className="outline-create-error" role="alert">
              {error}
            </p>
          )}
          <div className="modal-actions">
            <button type="button" className="secondary" onClick={onClose} disabled={busy}>
              {zh ? '取消' : 'Cancel'}
            </button>
            <button type="submit" className="primary" disabled={busy || !storyTime.trim()}>
              <CalendarPlus2 size={15} />
              {busy ? (zh ? '建立中…' : 'Creating…') : zh ? '建立坐标' : 'Create coordinate'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
