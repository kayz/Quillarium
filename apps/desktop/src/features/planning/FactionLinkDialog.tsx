import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Flag, Link2, UsersRound, X } from 'lucide-react'
import type { DocEntry, LanguageName } from '../../app/types.js'
import { formatDesktopError } from '../../shared/errors.js'
import { PlanningCardSelector } from './PlanningCardSelector.js'

export type FactionLinkMode = 'relation' | 'membership'

export function FactionLinkDialog({
  mode,
  docs,
  language,
  busy,
  onClose,
  onConfirm
}: {
  mode: FactionLinkMode
  docs: DocEntry[]
  language: LanguageName
  busy: boolean
  onClose: () => void
  onConfirm: (
    kind: 'faction_relation' | 'faction_membership',
    input: Record<string, unknown>
  ) => Promise<void>
}) {
  const titleId = useId()
  const firstInputRef = useRef<HTMLInputElement | null>(null)
  const zh = language === 'zh'
  const factions = useMemo(() => docs.filter((item) => item.data.type === 'faction'), [docs])
  const characters = useMemo(() => docs.filter((item) => item.data.type === 'character'), [docs])
  const timelineNodes = useMemo(() => docs.filter((item) => item.data.type === 'timeline_node'), [docs])
  const [fromFaction, setFromFaction] = useState(factions[0]?.data.id ?? '')
  const [toFaction, setToFaction] = useState(factions[1]?.data.id ?? '')
  const [characterId, setCharacterId] = useState(characters[0]?.data.id ?? '')
  const [relationType, setRelationType] = useState('')
  const [role, setRole] = useState('member')
  const [rank, setRank] = useState('')
  const [direction, setDirection] = useState<'directed' | 'mutual'>('mutual')
  const [primary, setPrimary] = useState(false)
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [visibility, setVisibility] = useState<'public' | 'private' | 'secret'>('private')
  const [error, setError] = useState('')

  useEffect(() => {
    firstInputRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  const submit = async () => {
    const from = factions.find((item) => item.data.id === fromFaction)
    const to = factions.find((item) => item.data.id === toFaction)
    const character = characters.find((item) => item.data.id === characterId)
    if (mode === 'relation' && (!from || !to || from.data.id === to.data.id || !relationType.trim())) {
      setError(
        zh
          ? '请选择两个不同势力，并填写关系类型。'
          : 'Choose two different factions and enter a relationship type.'
      )
      return
    }
    if (mode === 'membership' && (!from || !character || !role.trim())) {
      setError(
        zh
          ? '请选择势力和人物，并填写成员身份。'
          : 'Choose a faction and character, then enter a membership role.'
      )
      return
    }
    setError('')
    try {
      if (mode === 'relation' && from && to) {
        await onConfirm('faction_relation', {
          title: `${from.data.title} · ${relationType.trim()} · ${to.data.title}`,
          from_faction: from.data.id,
          to_faction: to.data.id,
          relation_type: relationType.trim(),
          direction,
          starts_at: startsAt || null,
          ends_at: endsAt || null,
          visibility,
          content: ''
        })
      } else if (from && character) {
        await onConfirm('faction_membership', {
          title: `${character.data.title} · ${role.trim()} · ${from.data.title}`,
          faction_id: from.data.id,
          character_id: character.data.id,
          role: role.trim(),
          rank: rank.trim(),
          primary,
          starts_at: startsAt || null,
          ends_at: endsAt || null,
          visibility,
          content: ''
        })
      }
    } catch (cause) {
      setError(formatDesktopError(cause, language))
    }
  }

  const ready = mode === 'relation' ? factions.length >= 2 : factions.length >= 1 && characters.length >= 1
  return (
    <div
      className="modal-backdrop character-relation-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose()
      }}
    >
      <section
        className="modal character-relation-dialog faction-link-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="character-relation-dialog-head">
          <div className="character-relation-dialog-icon">
            {mode === 'relation' ? <Link2 size={20} /> : <UsersRound size={20} />}
          </div>
          <div>
            <span className="planning-kicker">{zh ? '时态势力网络' : 'Time-aware faction network'}</span>
            <h2 id={titleId}>
              {mode === 'relation'
                ? zh
                  ? '建立势力关系'
                  : 'Create faction relationship'
                : zh
                  ? '建立人物所属势力'
                  : 'Create faction membership'}
            </h2>
            <p>
              {zh
                ? '关系和成员身份可绑定生效与结束时间；未填写时间时作为待确认的长期设定。'
                : 'Relationships and memberships may have active intervals; missing time remains a long-lived, unconfirmed constraint.'}
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
            <Flag size={18} />
            <span>
              {mode === 'relation'
                ? zh
                  ? '至少需要两个势力。'
                  : 'Create at least two factions.'
                : zh
                  ? '至少需要一个势力和一个人物。'
                  : 'Create at least one faction and one character.'}
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
                <strong>{zh ? '势力' : 'Faction'}</strong>
              </span>
              <PlanningCardSelector
                docs={factions}
                value={fromFaction}
                onChange={(value) => {
                  setFromFaction(value)
                  setError('')
                }}
                language={language}
                clearable={false}
                disabled={busy || !factions.length}
              />
            </label>
            {mode === 'relation' ? (
              <label className="timeline-coordinate-field">
                <span>
                  <strong>{zh ? '另一势力' : 'Other faction'}</strong>
                </span>
                <PlanningCardSelector
                  docs={factions.filter((item) => item.data.id !== fromFaction)}
                  value={toFaction}
                  onChange={(value) => {
                    setToFaction(value)
                    setError('')
                  }}
                  language={language}
                  clearable={false}
                  disabled={busy || factions.length < 2}
                />
              </label>
            ) : (
              <label className="timeline-coordinate-field">
                <span>
                  <strong>{zh ? '人物' : 'Character'}</strong>
                </span>
                <PlanningCardSelector
                  docs={characters}
                  value={characterId}
                  onChange={(value) => {
                    setCharacterId(value)
                    setError('')
                  }}
                  language={language}
                  clearable={false}
                  disabled={busy || !characters.length}
                />
              </label>
            )}
          </div>
          <div className="settings-grid two">
            {mode === 'relation' ? (
              <>
                <label>
                  {zh ? '关系类型' : 'Relationship type'}
                  <input
                    ref={firstInputRef}
                    value={relationType}
                    onChange={(event) => setRelationType(event.target.value)}
                    placeholder={zh ? '例如：盟友、敌对、附庸' : 'e.g. allied, hostile, vassal'}
                  />
                </label>
                <label>
                  {zh ? '方向' : 'Direction'}
                  <select
                    value={direction}
                    onChange={(event) => setDirection(event.target.value as typeof direction)}
                  >
                    <option value="mutual">{zh ? '双向' : 'Mutual'}</option>
                    <option value="directed">{zh ? '单向' : 'Directed'}</option>
                  </select>
                </label>
              </>
            ) : (
              <>
                <label>
                  {zh ? '成员身份' : 'Membership role'}
                  <input ref={firstInputRef} value={role} onChange={(event) => setRole(event.target.value)} />
                </label>
                <label>
                  {zh ? '职位 / 等级' : 'Rank'}
                  <input value={rank} onChange={(event) => setRank(event.target.value)} />
                </label>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={primary}
                    onChange={(event) => setPrimary(event.target.checked)}
                  />
                  {zh ? '主要所属势力' : 'Primary membership'}
                </label>
              </>
            )}
            <label>
              {zh ? '开始时间' : 'Starts at'}
              <PlanningCardSelector
                docs={timelineNodes}
                value={startsAt}
                onChange={setStartsAt}
                language={language}
                disabled={busy}
              />
            </label>
            <label>
              {zh ? '结束时间' : 'Ends at'}
              <PlanningCardSelector
                docs={timelineNodes}
                value={endsAt}
                onChange={setEndsAt}
                language={language}
                disabled={busy}
              />
            </label>
            <label>
              {zh ? '可见性' : 'Visibility'}
              <select
                value={visibility}
                onChange={(event) => setVisibility(event.target.value as typeof visibility)}
              >
                <option value="public">{zh ? '公开' : 'Public'}</option>
                <option value="private">{zh ? '私下可知' : 'Private'}</option>
                <option value="secret">{zh ? '秘密' : 'Secret'}</option>
              </select>
            </label>
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <footer className="modal-actions">
            <button type="button" onClick={onClose} disabled={busy}>
              {zh ? '取消' : 'Cancel'}
            </button>
            <button className="primary" type="submit" disabled={busy || !ready}>
              {busy ? (zh ? '创建中…' : 'Creating…') : zh ? '创建' : 'Create'}
            </button>
          </footer>
        </form>
      </section>
    </div>
  )
}
