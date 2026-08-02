import type { DocEntry, TargetSelection } from '../../app/types.js'
import { formatFieldValue } from '../../shared/outline.js'
import { fieldLabel, structuredLineForSection, timelineBelongsToArc } from './outline-model.js'

export function VolumeTimeline({
  docs,
  volume,
  arcs,
  items,
  selectedTarget,
  onSelect
}: {
  docs: DocEntry[]
  volume: DocEntry
  arcs: DocEntry[]
  items: DocEntry[]
  selectedTarget: TargetSelection | null
  onSelect: (target: TargetSelection) => void
}) {
  const unassigned = items.filter((item) => !arcs.some((arc) => timelineBelongsToArc(docs, arc, item)))
  return (
    <div className="volume-timeline">
      <article className="timeline-lane volume-lane">
        <h3>{volume.data.title}</h3>
        <p>
          {formatFieldValue(volume.data.volume_goal) || volume.content.slice(0, 120) || '本卷目标尚未填写。'}
        </p>
      </article>
      {arcs.map((arc) => {
        const events = items.filter((item) => timelineBelongsToArc(docs, arc, item))
        return (
          <article key={arc.data.id} className="timeline-lane">
            <div>
              <span className="badge ok">段纲</span>
              <h3>{arc.data.title}</h3>
            </div>
            <div className="timeline-events">
              {events.map((event) => (
                <button
                  key={event.data.id}
                  className={selectedTarget?.id === event.data.id ? 'active' : ''}
                  onClick={() => onSelect({ type: event.data.type, id: event.data.id })}
                >
                  <strong>{String(event.data.date ?? '未定时间')}</strong>
                  <span>{event.data.title}</span>
                  <small>{structuredLineForSection(event) || event.content.slice(0, 80)}</small>
                </button>
              ))}
              {!events.length && <p className="empty-row">这个段纲还没有绑定时间线事件。</p>}
            </div>
          </article>
        )
      })}
      {unassigned.length > 0 && (
        <article className="timeline-lane">
          <div>
            <span className="badge">待分段</span>
            <h3>本卷未分配事件</h3>
          </div>
          <div className="timeline-events">
            {unassigned.map((event) => (
              <button
                key={event.data.id}
                className={selectedTarget?.id === event.data.id ? 'active' : ''}
                onClick={() => onSelect({ type: event.data.type, id: event.data.id })}
              >
                <strong>{String(event.data.date ?? '未定时间')}</strong>
                <span>{event.data.title}</span>
                <small>{structuredLineForSection(event) || event.content.slice(0, 80)}</small>
              </button>
            ))}
          </div>
        </article>
      )}
    </div>
  )
}

export function StructuredTile({ doc }: { doc: DocEntry }) {
  const line = structuredLineForSection(doc)
  return (
    <div className="structured-tile">
      {line ? (
        line.split(' · ').map((part) => <small key={part}>{part}</small>)
      ) : (
        <p>{doc.content.slice(0, 160) || '暂无结构化数据'}</p>
      )}
    </div>
  )
}

export function MetadataEditor({
  data,
  onChange
}: {
  data: Record<string, unknown>
  onChange: (data: Record<string, unknown>) => void
}) {
  const editableKeys = Object.keys(data).filter((key) => !['id', 'type', 'schema_version'].includes(key))
  const update = (key: string, value: string) => {
    const current = data[key]
    let next: unknown = value
    if (Array.isArray(current))
      next = value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    else if (typeof current === 'number') next = Number(value)
    else if (typeof current === 'boolean') next = value === 'true'
    onChange({ ...data, [key]: next })
  }
  return (
    <div className="metadata-editor">
      {editableKeys.map((key) => {
        const value = data[key]
        if (value && typeof value === 'object' && !Array.isArray(value)) return null
        return (
          <label key={key}>
            {fieldLabel(key)}
            <input
              value={Array.isArray(value) ? value.join(', ') : String(value ?? '')}
              onChange={(event) => update(key, event.target.value)}
            />
          </label>
        )
      })}
    </div>
  )
}
