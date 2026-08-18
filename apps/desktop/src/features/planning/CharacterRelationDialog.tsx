import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { ArrowRight, Link2, X } from 'lucide-react'
import type { DocEntry, LanguageName } from '../../app/types.js'
import { formatDesktopError } from '../../shared/errors.js'
import { compareTimelineEntries } from './PlanningViews.js'
import { PlanningCardSelector } from './PlanningCardSelector.js'

export interface CharacterRelationDialogInitial {
  fromCharacterId?: string
  toCharacterId?: string
  relationType?: string
  startsAt?: string
}

export interface CharacterRelationInput {
  title: string
  from_character: string
  to_character: string
  relation_type: string
  direction: 'directed' | 'mutual'
  starts_at: string
  ends_at: string | null
  visibility: 'public' | 'private' | 'secret'
  content: string
}

export function CharacterRelationDialog({
  characters,
  timelineNodes,
  initial = {},
  language,
  busy,
  onClose,
  onConfirm
}: {
  characters: DocEntry[]
  timelineNodes: DocEntry[]
  initial?: CharacterRelationDialogInitial
  language: LanguageName
  busy: boolean
  onClose: () => void
  onConfirm: (input: CharacterRelationInput) => Promise<void>
}) {
  const titleId = useId()
  const relationRef = useRef<HTMLInputElement | null>(null)
  const zh = language === 'zh'
  const people = useMemo(
    () =>
      characters
        .filter((item) => item.data.type === 'character')
        .slice()
        .sort((left, right) => left.data.title.localeCompare(right.data.title)),
    [characters]
  )
  const nodes = useMemo(
    () =>
      timelineNodes
        .filter((item) => item.data.type === 'timeline_node')
        .slice()
        .sort(compareTimelineEntries),
    [timelineNodes]
  )
  const defaultFrom =
    people.find((item) => item.data.id === initial.fromCharacterId)?.data.id ?? people[0]?.data.id ?? ''
  const defaultTo =
    people.find((item) => item.data.id === initial.toCharacterId && item.data.id !== defaultFrom)?.data.id ??
    people.find((item) => item.data.id !== defaultFrom)?.data.id ??
    ''
  const [fromCharacter, setFromCharacter] = useState(defaultFrom)
  const [toCharacter, setToCharacter] = useState(defaultTo)
  const [relationType, setRelationType] = useState(initial.relationType ?? '')
  const [direction, setDirection] = useState<'directed' | 'mutual'>('mutual')
  const [startsAt, setStartsAt] = useState(initial.startsAt ?? '')
  const [endsAt, setEndsAt] = useState('')
  const [visibility, setVisibility] = useState<'public' | 'private' | 'secret'>('private')
  const [error, setError] = useState('')

  useEffect(() => {
    relationRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  const submit = async () => {
    const validation = validateCharacterRelationDraft(
      {
        fromCharacter,
        toCharacter,
        relationType,
        startsAt,
        endsAt
      },
      nodes,
      language
    )
    if (validation) {
      setError(validation)
      return
    }
    const from = people.find((item) => item.data.id === fromCharacter)!
    const to = people.find((item) => item.data.id === toCharacter)!
    setError('')
    try {
      await onConfirm({
        title: buildCharacterRelationTitle(from.data.title, to.data.title, relationType.trim(), direction),
        from_character: fromCharacter,
        to_character: toCharacter,
        relation_type: relationType.trim(),
        direction,
        starts_at: startsAt,
        ends_at: endsAt || null,
        visibility,
        content: ''
      })
    } catch (cause) {
      setError(formatDesktopError(cause, language))
    }
  }

  const ready = people.length >= 2 && nodes.length > 0
  return (
    <div
      className="modal-backdrop character-relation-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose()
      }}
    >
      <section
        className="modal character-relation-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="character-relation-dialog-head">
          <div className="character-relation-dialog-icon">
            <Link2 size={20} />
          </div>
          <div>
            <span className="planning-kicker">{zh ? '时态人物关系' : 'Time-aware relationship'}</span>
            <h2 id={titleId}>{zh ? '建立关系阶段' : 'Create relationship phase'}</h2>
            <p>
              {zh
                ? '同一对人物可以按时间建立多段关系；关系图只显示当前时点有效的阶段。'
                : 'A pair can have several phases; the graph shows only the phase active at the selected time.'}
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

        {!ready && (
          <div className="character-relation-prerequisite" role="status">
            <strong>{zh ? '还不能建立关系' : 'Relationship cannot be created yet'}</strong>
            <span>
              {people.length < 2
                ? zh
                  ? '至少需要两个人物卡。'
                  : 'Create at least two character cards.'
                : zh
                  ? '请先建立时间坐标。'
                  : 'Create a timeline coordinate first.'}
            </span>
          </div>
        )}

        <form
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <div className="character-relation-person-grid">
            <label className="timeline-coordinate-field">
              <span>
                <strong>{zh ? '人物一' : 'First character'}</strong>
                <small>{zh ? '关系的发出方或第一端。' : 'Source or first endpoint.'}</small>
              </span>
              <PlanningCardSelector
                docs={people}
                value={fromCharacter}
                onChange={(next) => {
                  setFromCharacter(next)
                  if (next === toCharacter)
                    setToCharacter(people.find((item) => item.data.id !== next)?.data.id ?? '')
                  setError('')
                }}
                language={language}
                ariaLabel={zh ? '选择人物一' : 'Choose first character'}
                disabled={busy || people.length < 2}
                clearable={false}
              />
            </label>
            <label className="timeline-coordinate-field">
              <span>
                <strong>{zh ? '人物二' : 'Second character'}</strong>
                <small>{zh ? '关系的目标方或另一端。' : 'Target or other endpoint.'}</small>
              </span>
              <PlanningCardSelector
                docs={people.filter((character) => character.data.id !== fromCharacter)}
                value={toCharacter}
                onChange={(next) => {
                  setToCharacter(next)
                  setError('')
                }}
                language={language}
                ariaLabel={zh ? '选择人物二' : 'Choose second character'}
                disabled={busy || people.length < 2}
                clearable={false}
              />
            </label>
          </div>

          <div className="character-relation-definition-grid">
            <label className="timeline-coordinate-field relation-name-field">
              <span>
                <strong>{zh ? '关系名称' : 'Relationship name'}</strong>
                <small>
                  {zh
                    ? '会直接写在线上，例如朋友、敌对、君臣。'
                    : 'Shown on the graph edge, such as friend or rival.'}
                </small>
              </span>
              <input
                ref={relationRef}
                value={relationType}
                onChange={(event) => {
                  setRelationType(event.target.value)
                  setError('')
                }}
                placeholder={zh ? '例如：朋友' : 'e.g. Friends'}
                disabled={busy}
              />
            </label>
            <label className="timeline-coordinate-field">
              <span>
                <strong>{zh ? '关系方向' : 'Direction'}</strong>
                <small>
                  {zh
                    ? '双方共有，或由人物一指向人物二。'
                    : 'Mutual, or from the first person to the second.'}
                </small>
              </span>
              <select
                value={direction}
                onChange={(event) => setDirection(event.target.value as 'directed' | 'mutual')}
                disabled={busy}
              >
                <option value="mutual">{zh ? '双方共有 ↔' : 'Mutual ↔'}</option>
                <option value="directed">{zh ? '人物一指向人物二 →' : 'First to second →'}</option>
              </select>
            </label>
          </div>

          <div
            className="character-relation-time-band"
            aria-label={zh ? '关系有效时间' : 'Relationship validity'}
          >
            <label className="timeline-coordinate-field">
              <span>
                <strong>{zh ? '从本节点起生效' : 'Active from this node'}</strong>
                <small>{zh ? '必选；该时间点会显示这条关系。' : 'Required; active at this node.'}</small>
              </span>
              <PlanningCardSelector
                docs={nodes}
                value={startsAt}
                onChange={(next) => {
                  setStartsAt(next)
                  setError('')
                }}
                language={language}
                ariaLabel={zh ? '选择开始时间节点' : 'Choose start timeline node'}
                disabled={busy || !nodes.length}
                placeholder={zh ? '选择开始时间…' : 'Select start time…'}
              />
            </label>
            <ArrowRight size={18} aria-hidden="true" />
            <label className="timeline-coordinate-field">
              <span>
                <strong>{zh ? '到本节点前有效' : 'Active until this node'}</strong>
                <small>
                  {zh ? '可选；到达该节点时关系停止显示。' : 'Optional; inactive when this node is reached.'}
                </small>
              </span>
              <PlanningCardSelector
                docs={nodes}
                value={endsAt}
                onChange={(next) => {
                  setEndsAt(next)
                  setError('')
                }}
                language={language}
                ariaLabel={zh ? '选择结束时间节点' : 'Choose end timeline node'}
                disabled={busy || !nodes.length}
                placeholder={zh ? '持续到后续（不设结束）' : 'Ongoing (no end)'}
              />
            </label>
          </div>

          <label className="timeline-coordinate-field character-relation-visibility">
            <span>
              <strong>{zh ? '知情范围' : 'Visibility'}</strong>
              <small>
                {zh
                  ? '描述故事世界里谁知道这段关系。'
                  : 'Who knows about this relationship in the story world.'}
              </small>
            </span>
            <select
              value={visibility}
              onChange={(event) => setVisibility(event.target.value as 'public' | 'private' | 'secret')}
              disabled={busy}
            >
              <option value="public">{zh ? '公开' : 'Public'}</option>
              <option value="private">{zh ? '私下' : 'Private'}</option>
              <option value="secret">{zh ? '秘密' : 'Secret'}</option>
            </select>
          </label>

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
              type="submit"
              className="primary"
              disabled={busy || !ready || !relationType.trim() || !startsAt}
            >
              <Link2 size={15} />
              {busy ? (zh ? '建立中…' : 'Creating…') : zh ? '建立关系阶段' : 'Create relationship phase'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

export function validateCharacterRelationDraft(
  draft: {
    fromCharacter: string
    toCharacter: string
    relationType: string
    startsAt: string
    endsAt: string
  },
  timelineNodes: DocEntry[],
  language: LanguageName
): string {
  const zh = language === 'zh'
  if (!draft.fromCharacter || !draft.toCharacter)
    return zh ? '请选择关系两端的人物。' : 'Select both relationship endpoints.'
  if (draft.fromCharacter === draft.toCharacter)
    return zh ? '人物不能与自己建立这条关系。' : 'A character cannot have this relationship with itself.'
  if (!draft.relationType.trim()) return zh ? '请输入关系名称。' : 'Enter a relationship name.'
  if (!draft.startsAt) return zh ? '请选择关系开始时间。' : 'Select when the relationship starts.'
  if (draft.endsAt) {
    const start = timelineNodes.findIndex((node) => node.data.id === draft.startsAt)
    const end = timelineNodes.findIndex((node) => node.data.id === draft.endsAt)
    if (start < 0 || end < 0)
      return zh
        ? '关系时间引用了不存在的时间节点。'
        : 'A relationship time points to a missing timeline node.'
    if (end <= start)
      return zh
        ? '结束时间必须晚于开始时间；到达结束节点时，这段关系已不再生效。'
        : 'The end must be after the start; the relationship is inactive at the end node.'
  }
  return ''
}

export function buildCharacterRelationTitle(
  fromTitle: string,
  toTitle: string,
  relationType: string,
  direction: 'directed' | 'mutual'
): string {
  return `${fromTitle}${direction === 'mutual' ? ' ↔ ' : ' → '}${toTitle} · ${relationType}`
}
