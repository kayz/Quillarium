import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { CalendarPlus2, Link2, X } from 'lucide-react'
import type { TimelineCatalogV1, TimelineCoordinateV2 } from '@quillarium/core'
import type { DocEntry, LanguageName } from '../../app/types.js'
import { formatDesktopError } from '../../shared/errors.js'
import { PlanningCardSelector } from './PlanningCardSelector.js'

export interface TimelineCoordinateInput {
  title: string
  storyTime: string
  sourceEventId?: string
  coordinate?: TimelineCoordinateV2
  trackIds?: string[]
}

export function TimelineCoordinateDialog({
  events,
  projectRoot,
  initialEventId,
  language,
  busy,
  onClose,
  onConfirm
}: {
  events: DocEntry[]
  projectRoot: string
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
          !(Array.isArray(item.data.placements) && item.data.placements.length) &&
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
  const [catalog, setCatalog] = useState<TimelineCatalogV1>()
  const [timeSystemId, setTimeSystemId] = useState('legacy-story')
  const [trackIds, setTrackIds] = useState<string[]>(['main'])
  const [components, setComponents] = useState<Record<string, string>>(() =>
    stringComponents(basicStoryTimeComponents(String(initialEvent?.data.date ?? '')))
  )
  const [precision, setPrecision] = useState('month')
  const [explicitOrder, setExplicitOrder] = useState(
    events.filter((item) => item.data.type === 'timeline_node').length
  )
  const [cycle, setCycle] = useState('')
  const [occurrence, setOccurrence] = useState(1)

  useEffect(() => {
    let active = true
    void window.quillarium
      .loadTimelineCatalog(projectRoot)
      .then((loaded) => {
        if (!active) return
        setCatalog(loaded)
        const firstTrack = loaded.tracks[0]
        if (firstTrack) {
          setTrackIds([firstTrack.value.id])
          setTimeSystemId(firstTrack.value.time_system_id)
          const system = loaded.time_systems.find((item) => item.value.id === firstTrack.value.time_system_id)
          setPrecision(
            system?.value.units.find((unit) => unit.id === 'month')?.id ??
              system?.value.units[0]?.id ??
              'month'
          )
        }
      })
      .catch((cause) => {
        if (active) setError(formatDesktopError(cause, language))
      })
    return () => {
      active = false
    }
  }, [language, projectRoot])

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
    setComponents(stringComponents(basicStoryTimeComponents(String(source.data.date ?? ''))))
  }

  const submit = async () => {
    const time = storyTime.trim()
    const name = title.trim() || time
    if (!time) {
      setError(zh ? '请输入故事时间。' : 'Enter a story time.')
      storyTimeRef.current?.focus()
      return
    }
    setError('')
    try {
      const numericComponents = Object.fromEntries(
        Object.entries(components)
          .filter(([, value]) => value.trim() !== '' && Number.isFinite(Number(value)))
          .map(([key, value]) => [key, Number(value)])
      )
      if (catalog && timeSystemId !== 'legacy-story' && !Object.keys(numericComponents).length) {
        setError(zh ? '请至少填写一个时间坐标分量。' : 'Enter at least one coordinate component.')
        return
      }
      if (catalog && !trackIds.length) {
        setError(zh ? '请至少选择一条时间线轨道。' : 'Select at least one timeline track.')
        return
      }
      const canUseV2 = Boolean(catalog && trackIds.length && Object.keys(numericComponents).length)
      await onConfirm({
        title: name,
        storyTime: time,
        sourceEventId: sourceEventId || undefined,
        ...(canUseV2
          ? {
              trackIds,
              coordinate: {
                schema_version: 2,
                time_system_id: timeSystemId,
                components: numericComponents,
                precision,
                display_text: time,
                sort_value: null,
                explicit_order: Math.max(0, Math.trunc(explicitOrder || 0)),
                uncertain: false,
                fuzzy: false,
                cycle: cycle.trim() ? Math.trunc(Number(cycle)) : null,
                occurrence: Math.max(1, Math.trunc(occurrence || 1))
              }
            }
          : {})
      })
    } catch (cause) {
      setError(formatDesktopError(cause, language))
    }
  }

  const selectedEvent = candidates.find((item) => item.data.id === sourceEventId)
  const selectedSystem = catalog?.time_systems.find((item) => item.value.id === timeSystemId)
  const compatibleTracks = catalog?.tracks.filter((item) => item.value.time_system_id === timeSystemId)

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
            <PlanningCardSelector
              docs={candidates}
              value={sourceEventId}
              onChange={selectSource}
              language={language}
              ariaLabel={zh ? '使用已有时间事件' : 'Use an existing timeline event'}
              placeholder={zh ? '不关联事件，手工输入时间' : 'No event; enter time manually'}
              disabled={busy}
            />
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
                    ? '支持日期、分钟、模糊季节或相对周次。'
                    : 'Dates, minutes, fuzzy seasons, and relative story weeks are supported.'}
                </small>
              </span>
              <input
                ref={storyTimeRef}
                value={storyTime}
                onChange={(event) => {
                  setStoryTime(event.target.value)
                  if (timeSystemId === 'legacy-story') {
                    setComponents(stringComponents(basicStoryTimeComponents(event.target.value)))
                  }
                  if (error) setError('')
                }}
                placeholder={
                  zh ? '例如：1449-08、20年秋、第1周周二' : 'e.g. 1449-08, 20 autumn, or week 1 day 2'
                }
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

          {catalog && selectedSystem && (
            <details className="timeline-coordinate-v2" open={selectedSystem.value.kind !== 'gregorian'}>
              <summary>{zh ? '时间体系、精度与轨道' : 'Time system, precision, and tracks'}</summary>
              <p>
                {zh
                  ? '显示文本与排序坐标分开保存。未配置历法换算时只使用这里的明确顺序，不推测跨历法先后。'
                  : 'Display text and sortable coordinates are stored separately. Without conversion rules, only explicit order is used.'}
              </p>
              <div className="timeline-coordinate-v2-grid">
                <label>
                  <span>{zh ? '时间体系' : 'Time system'}</span>
                  <select
                    value={timeSystemId}
                    disabled={busy}
                    onChange={(event) => {
                      const nextId = event.target.value
                      const system = catalog.time_systems.find((item) => item.value.id === nextId)
                      const tracks = catalog.tracks.filter((item) => item.value.time_system_id === nextId)
                      setTimeSystemId(nextId)
                      setTrackIds(tracks[0] ? [tracks[0].value.id] : [])
                      setPrecision(system?.value.units[0]?.id ?? '')
                      setComponents({})
                    }}
                  >
                    {catalog.time_systems.map((system) => (
                      <option key={system.value.id} value={system.value.id}>
                        {system.value.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>{zh ? '精度单位' : 'Precision unit'}</span>
                  <select
                    value={precision}
                    disabled={busy}
                    onChange={(event) => setPrecision(event.target.value)}
                  >
                    {selectedSystem.value.units.map((unit) => (
                      <option key={unit.id} value={unit.id}>
                        {unit.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>{zh ? '明确排序值' : 'Explicit order'}</span>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={explicitOrder}
                    disabled={busy}
                    onChange={(event) => setExplicitOrder(Number(event.target.value))}
                  />
                </label>
                {selectedSystem.value.kind === 'cyclic' && (
                  <>
                    <label>
                      <span>{zh ? '循环编号' : 'Cycle'}</span>
                      <input
                        type="number"
                        value={cycle}
                        disabled={busy}
                        onChange={(event) => setCycle(event.target.value)}
                      />
                    </label>
                    <label>
                      <span>{zh ? '同坐标出现次数' : 'Occurrence'}</span>
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={occurrence}
                        disabled={busy}
                        onChange={(event) => setOccurrence(Number(event.target.value))}
                      />
                    </label>
                  </>
                )}
              </div>
              <div className="timeline-coordinate-components">
                {selectedSystem.value.units.map((unit) => (
                  <label key={unit.id}>
                    <span>{unit.label}</span>
                    <input
                      type="number"
                      value={components[unit.id] ?? ''}
                      disabled={busy}
                      onChange={(event) => setComponents({ ...components, [unit.id]: event.target.value })}
                    />
                  </label>
                ))}
              </div>
              <fieldset className="timeline-coordinate-tracks">
                <legend>{zh ? '加入轨道（可多选）' : 'Add to tracks (multiple allowed)'}</legend>
                {compatibleTracks?.map((track) => (
                  <label key={track.value.id}>
                    <input
                      type="checkbox"
                      checked={trackIds.includes(track.value.id)}
                      disabled={busy}
                      onChange={(event) =>
                        setTrackIds(
                          event.target.checked
                            ? [...new Set([...trackIds, track.value.id])]
                            : trackIds.filter((id) => id !== track.value.id)
                        )
                      }
                    />
                    <span>{track.value.title}</span>
                  </label>
                ))}
              </fieldset>
            </details>
          )}

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

function basicStoryTimeComponents(value: string): Record<string, number> {
  const normalized = value.normalize('NFC').trim()
  const year = /^(-?\d{1,6})(?:\s*年|(?=[-/])|$)/u.exec(normalized)?.[1]
  if (!year) return {}
  const numeric = normalized.match(/-?\d+/gu)?.map(Number) ?? []
  const season = /春/u.test(normalized)
    ? 3
    : /夏/u.test(normalized)
      ? 6
      : /秋/u.test(normalized)
        ? 9
        : /冬/u.test(normalized)
          ? 12
          : undefined
  return {
    year: Number(year),
    ...(numeric[1] !== undefined || season !== undefined ? { month: numeric[1] ?? season! } : {}),
    ...(numeric[2] !== undefined ? { day: numeric[2] } : {}),
    ...(numeric[3] !== undefined ? { hour: numeric[3] } : {}),
    ...(numeric[4] !== undefined ? { minute: numeric[4] } : {})
  }
}

function stringComponents(value: Record<string, number>): Record<string, string> {
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, String(item)]))
}
