import { useEffect, useState } from 'react'
import type { DocEntry, LanguageName, TargetSelection } from '../../app/types.js'
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
  onChange,
  language = 'zh'
}: {
  data: Record<string, unknown>
  onChange: (data: Record<string, unknown>) => void
  language?: LanguageName
}) {
  const editableKeys = Object.keys(data).filter((key) => !['id', 'type', 'schema_version'].includes(key))
  return (
    <div className="metadata-editor">
      {editableKeys.map((key) => (
        <MetadataField
          key={key}
          name={key}
          value={data[key]}
          language={language}
          onChange={(value) => onChange({ ...data, [key]: value })}
        />
      ))}
    </div>
  )
}

const ENUM_FIELDS: Record<string, readonly string[]> = {
  status: ['draft', 'confirmed', 'active', 'inactive', 'deprecated', 'planned', 'resolved'],
  strength: ['hard', 'soft'],
  source: ['user', 'ai', 'imported', 'historical', 'accepted_prose'],
  role: ['supporting', 'constraint', 'texture', 'both'],
  entry_status: ['candidate', 'active', 'inactive'],
  importance: ['high', 'medium', 'low'],
  level: ['L1', 'L2', 'L3', 'L4', 'L5'],
  state: ['planned', 'planted', 'reinforced', 'resolved', 'abandoned', 'open', 'deferred'],
  material_type: ['book', 'paper', 'article', 'webpage', 'video', 'other'],
  reading_status: ['unread', 'reading', 'read'],
  priority: ['high', 'medium', 'low'],
  category: ['narrative', 'style', 'pacing', 'reader_expectation', 'genre_boundary', 'other'],
  kind: ['story', 'writing', 'prompt'],
  scope: ['book', 'volume', 'arc', 'chapter', 'section', 'agent', 'project']
}

function MetadataField({
  name,
  value,
  language,
  onChange
}: {
  name: string
  value: unknown
  language: LanguageName
  onChange: (value: unknown) => void
}) {
  const options = ENUM_FIELDS[name]
  if (options && (typeof value === 'string' || value === undefined)) {
    const choices = value && !options.includes(value) ? [value, ...options] : options
    return (
      <label>
        {fieldLabel(name)}
        <select value={String(value ?? '')} onChange={(event) => onChange(event.target.value)}>
          {!value && <option value="">—</option>}
          {choices.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
    )
  }
  if (typeof value === 'boolean') {
    return (
      <label className="metadata-checkbox">
        <input type="checkbox" checked={value} onChange={(event) => onChange(event.target.checked)} />
        {fieldLabel(name)}
      </label>
    )
  }
  if (typeof value === 'number') {
    return (
      <label>
        {fieldLabel(name)}
        <input type="number" value={value} onChange={(event) => onChange(Number(event.target.value))} />
      </label>
    )
  }
  if (isStructuredValue(value)) {
    return <StructuredMetadataField name={name} value={value} language={language} onChange={onChange} />
  }
  return (
    <label>
      {fieldLabel(name)}
      <input
        value={String(value ?? '')}
        onChange={(event) => onChange(value === null && !event.target.value ? null : event.target.value)}
      />
    </label>
  )
}

function StructuredMetadataField({
  name,
  value,
  language,
  onChange
}: {
  name: string
  value: object
  language: LanguageName
  onChange: (value: unknown) => void
}) {
  const canonical = formatStructuredFieldDraft(value)
  const [draft, setDraft] = useState(canonical)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    setDraft(canonical)
    setError(null)
  }, [canonical])
  return (
    <label className="metadata-complex-field">
      <span>
        {fieldLabel(name)} <small>JSON</small>
      </span>
      <textarea
        value={draft}
        spellCheck={false}
        aria-invalid={Boolean(error)}
        onChange={(event) => {
          const next = event.target.value
          setDraft(next)
          const parsed = parseStructuredFieldDraft(next)
          if (!parsed.ok) {
            setError(parsed.error)
            return
          }
          setError(null)
          onChange(parsed.value)
        }}
      />
      {error && (
        <small className="field-error">
          {language === 'zh' ? 'JSON 格式有误' : 'Invalid JSON'}：{error}
        </small>
      )}
    </label>
  )
}

function isStructuredValue(value: unknown): value is object {
  return typeof value === 'object' && value !== null
}

export function formatStructuredFieldDraft(value: object): string {
  return JSON.stringify(value, null, 2)
}

export function parseStructuredFieldDraft(
  value: string
): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    const parsed: unknown = JSON.parse(value)
    if (!isStructuredValue(parsed)) return { ok: false, error: '需要 JSON 数组或对象' }
    return { ok: true, value: parsed }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}
