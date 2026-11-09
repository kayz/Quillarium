import { useState } from 'react'
import { Plus, Sparkles, XCircle } from 'lucide-react'
import { requiredSpecializationFields } from '@quillarium/core/browser-contracts'
import type { ForeshadowManageProposalSet } from '@quillarium/core'
import type { DocEntry, LanguageName } from '../../app/types.js'
import { MarkdownBodyEditor } from '../markdown/MarkdownBodyEditor.js'
import { MetadataEditor } from '../outline/OutlineShared.js'
import { OutlineCreateDialog } from '../outline/OutlineCreateDialog.js'
import { blankSettingCardInput } from '../planning/planning-model.js'
import { fieldLabel } from '../metadata/field-presentation.js'
import { formatDesktopError } from '../../shared/errors.js'

type ForeshadowDraft = { path: string; content: string; data: Record<string, unknown> }

export function ForeshadowingWorkspace({
  docs,
  doc,
  dirty,
  busy,
  language,
  projectRoot,
  onSelect,
  onCreate,
  onDocChange,
  onSave,
  onReloadProject
}: {
  docs: DocEntry[]
  doc: ForeshadowDraft | null
  dirty: boolean
  busy: boolean
  language: LanguageName
  projectRoot: string
  onSelect: (doc: DocEntry) => void
  onCreate: (input: Record<string, unknown>) => Promise<void>
  onDocChange: (doc: ForeshadowDraft) => void
  onSave: () => Promise<void>
  onReloadProject?: () => Promise<void>
}) {
  const zh = language === 'zh'
  const [createOpen, setCreateOpen] = useState(false)
  const [foreshadowProposals, setForeshadowProposals] = useState<ForeshadowManageProposalSet | null>(null)
  const [foreshadowBusy, setForeshadowBusy] = useState(false)
  const [foreshadowError, setForeshadowError] = useState('')
  const [foreshadowNotice, setForeshadowNotice] = useState('')
  const [foreshadowCreates, setForeshadowCreates] = useState<Record<string, boolean>>({})
  const [foreshadowUpdates, setForeshadowUpdates] = useState<Record<string, boolean>>({})
  const [foreshadowBindings, setForeshadowBindings] = useState<Record<string, boolean>>({})
  const [foreshadowFields, setForeshadowFields] = useState<Record<string, Record<string, string>>>({})

  const cards = docs.filter((item) => item.data.type === 'foreshadowing')
  const selected = doc?.data.type === 'foreshadowing' ? doc : null
  const selectedTitle = String(selected?.data.title ?? '')

  const closeForeshadowPanel = () => {
    setForeshadowProposals(null)
    setForeshadowError('')
    setForeshadowNotice('')
    setForeshadowCreates({})
    setForeshadowUpdates({})
    setForeshadowBindings({})
    setForeshadowFields({})
  }

  const runForeshadowAction = async (action: () => Promise<void>) => {
    setForeshadowBusy(true)
    setForeshadowError('')
    setForeshadowNotice('')
    try {
      await action()
    } catch (error) {
      setForeshadowError(formatDesktopError(error, language))
    } finally {
      setForeshadowBusy(false)
    }
  }

  const manageForeshadowing = async () => {
    await runForeshadowAction(async () => {
      const proposals = await window.quillarium.manageForeshadowing(projectRoot)
      setForeshadowProposals(proposals)
      setForeshadowCreates(Object.fromEntries(proposals.creates.map((item) => [item.proposal_id, true])))
      setForeshadowUpdates(Object.fromEntries(proposals.updates.map((item) => [item.proposal_id, true])))
      setForeshadowBindings(Object.fromEntries(proposals.bindings.map((item) => [item.proposal_id, true])))
      setForeshadowFields(
        Object.fromEntries(
          [...proposals.creates, ...proposals.updates].map((item) => {
            const seeded: Record<string, string> = {}
            for (const key of requiredSpecializationFields('foreshadowing')) {
              const value = item.fields[key]
              seeded[key] = typeof value === 'string' ? value : ''
            }
            return [item.proposal_id, seeded] as const
          })
        )
      )
    })
  }

  const foreshadowConfirmReady =
    !foreshadowProposals ||
    [...foreshadowProposals.creates, ...foreshadowProposals.updates].every((item) => {
      const isSelected =
        'card_id' in item ? foreshadowUpdates[item.proposal_id] : foreshadowCreates[item.proposal_id]
      if (!isSelected) return true
      const fields = foreshadowFields[item.proposal_id] ?? {}
      return requiredSpecializationFields('foreshadowing').every((key) => Boolean(fields[key]?.trim()))
    })

  const applyForeshadow = async () => {
    if (!foreshadowProposals || !foreshadowConfirmReady) return
    await runForeshadowAction(async () => {
      const toDecision = (proposalId: string) => {
        const fields = foreshadowFields[proposalId] ?? {}
        const payload: Record<string, unknown> = {}
        for (const key of requiredSpecializationFields('foreshadowing')) {
          payload[key] = fields[key]?.trim() ?? ''
        }
        return { proposal_id: proposalId, fields: payload }
      }
      const result = await window.quillarium.applyForeshadowManage(projectRoot, foreshadowProposals, {
        confirmed: true,
        creates: foreshadowProposals.creates
          .filter((item) => foreshadowCreates[item.proposal_id])
          .map((item) => toDecision(item.proposal_id)),
        updates: foreshadowProposals.updates
          .filter((item) => foreshadowUpdates[item.proposal_id])
          .map((item) => toDecision(item.proposal_id)),
        bindings: foreshadowProposals.bindings
          .filter((item) => foreshadowBindings[item.proposal_id])
          .map((item) => item.proposal_id)
      })
      setForeshadowNotice(
        zh
          ? `已新建 ${result.created_ids.length} 条、更新 ${result.updated_ids.length} 条、绑定 ${result.binding_document_ids.length} 条。`
          : `Created ${result.created_ids.length}, updated ${result.updated_ids.length}, bound ${result.binding_document_ids.length}.`
      )
      setForeshadowProposals(null)
      setForeshadowCreates({})
      setForeshadowUpdates({})
      setForeshadowBindings({})
      setForeshadowFields({})
      await onReloadProject?.()
    })
  }

  const renderForeshadowCardRow = (
    item: { proposal_id: string; title?: string; content: string; card_id?: string },
    kind: 'create' | 'update'
  ) => {
    const isSelected = kind === 'create' ? foreshadowCreates : foreshadowUpdates
    const setSelected = kind === 'create' ? setForeshadowCreates : setForeshadowUpdates
    const fields = foreshadowFields[item.proposal_id] ?? {}
    const required = requiredSpecializationFields('foreshadowing')
    const heading =
      kind === 'create'
        ? (item.title ?? '')
        : (docs.find((d) => d.data.id === item.card_id)?.data.title ?? item.card_id ?? '')
    return (
      <div className="chapter-eval-setting" key={item.proposal_id}>
        <label>
          <input
            type="checkbox"
            checked={Boolean(isSelected[item.proposal_id])}
            onChange={(event) =>
              setSelected({
                ...isSelected,
                [item.proposal_id]: event.target.checked
              })
            }
          />
          <span>
            <strong>
              {kind === 'create' ? (zh ? '新建' : 'Create') : zh ? '更新' : 'Update'}: {heading}
            </strong>
            <small>{item.content}</small>
          </span>
        </label>
        {required.map((key) => (
          <label key={key}>
            {fieldLabel(key, language)}
            <input
              value={fields[key] ?? ''}
              aria-label={fieldLabel(key, language)}
              onChange={(event) =>
                setForeshadowFields({
                  ...foreshadowFields,
                  [item.proposal_id]: {
                    ...fields,
                    [key]: event.target.value
                  }
                })
              }
            />
          </label>
        ))}
      </div>
    )
  }

  const renderForeshadowBindingRow = (item: ForeshadowManageProposalSet['bindings'][number]) => {
    const foreshadowTitle =
      docs.find((d) => d.data.id === item.foreshadowing_id)?.data.title ?? item.foreshadowing_id
    const documentTitle = docs.find((d) => d.data.id === item.document_id)?.data.title ?? item.document_id
    const actions = [
      item.plant ? `${zh ? '埋设' : 'plant'}:${item.plant}` : null,
      item.resolve ? `${zh ? '回收' : 'resolve'}:${item.resolve}` : null
    ]
      .filter(Boolean)
      .join(' · ')
    return (
      <div className="chapter-eval-setting" key={item.proposal_id}>
        <label>
          <input
            type="checkbox"
            checked={Boolean(foreshadowBindings[item.proposal_id])}
            onChange={(event) =>
              setForeshadowBindings({
                ...foreshadowBindings,
                [item.proposal_id]: event.target.checked
              })
            }
          />
          <span>
            <strong>
              {zh ? '绑定' : 'Binding'}: {foreshadowTitle}
            </strong>
            <small>
              {zh ? '文档' : 'Document'}: {documentTitle}
              {actions ? ` · ${actions}` : ''}
            </small>
          </span>
        </label>
      </div>
    )
  }

  return (
    <section className="foreshadow-workspace">
      <aside className="foreshadow-list">
        <div className="foreshadow-list-head">
          <strong>{zh ? '伏笔' : 'Foreshadowing'}</strong>
          <div style={{ display: 'flex', gap: '0.25rem' }}>
            <button
              type="button"
              onClick={() => void manageForeshadowing()}
              disabled={busy || foreshadowBusy}
              title={zh ? '管理伏笔' : 'Manage foreshadowing'}
            >
              <Sparkles size={14} /> {zh ? '管理伏笔' : 'Manage foreshadowing'}
            </button>
            <button type="button" onClick={() => setCreateOpen(true)} disabled={busy}>
              <Plus size={14} /> {zh ? '新建' : 'New'}
            </button>
          </div>
        </div>
        <p className="muted">
          {zh
            ? '埋设和回收选写作树上的卷、篇、幕或章。一条伏笔可以跨这些层级。'
            : 'Plant and payoff use a volume, part, act, or chapter. One thread can span those levels.'}
        </p>
        {cards.map((card) => (
          <button
            key={card.data.id}
            type="button"
            className={selected?.data.id === card.data.id ? 'active' : ''}
            onClick={() => onSelect(card)}
          >
            <strong>{card.data.title}</strong>
            <small>{String(card.data.summary ?? '')}</small>
          </button>
        ))}
        {!cards.length && <p className="empty-row">{zh ? '还没有伏笔。' : 'No foreshadowing yet.'}</p>}
      </aside>
      <div className="foreshadow-detail">
        {selected ? (
          <>
            <label className="metadata-field">
              <span>{zh ? '名称' : 'Name'}</span>
              <input
                value={selectedTitle}
                onChange={(event) =>
                  onDocChange({ ...selected, data: { ...selected.data, title: event.target.value } })
                }
              />
            </label>
            <MetadataEditor
              data={selected.data}
              docs={docs}
              projectRoot={projectRoot}
              documentPath={selected.path}
              language={language}
              onChange={(data) => onDocChange({ ...selected, data })}
            />
            <MarkdownBodyEditor
              value={selected.content}
              language={language}
              onChange={(content) => onDocChange({ ...selected, content })}
            />
            <div className="detail-actions">
              <button type="button" onClick={() => void onSave()} disabled={!dirty || busy}>
                {zh ? '保存' : 'Save'}
              </button>
            </div>
          </>
        ) : (
          <p className="empty-row">
            {zh
              ? '选一条伏笔，填写被掩盖的真相、埋设位置和回收位置。'
              : 'Select a thread to edit its truth and positions.'}
          </p>
        )}
      </div>
      {createOpen && (
        <OutlineCreateDialog
          label={zh ? '伏笔' : 'Foreshadowing'}
          mode="setting"
          language={language}
          busy={busy}
          onClose={() => setCreateOpen(false)}
          onConfirm={async (title) => {
            await onCreate(blankSettingCardInput('foreshadowing', title))
            setCreateOpen(false)
          }}
        />
      )}
      {(foreshadowProposals || foreshadowBusy || foreshadowError || foreshadowNotice) && (
        <section
          className="chapter-eval-panel"
          aria-label={zh ? '伏笔管理提案' : 'Foreshadow manage proposals'}
        >
          <header>
            <strong>{zh ? '伏笔管理提案' : 'Foreshadow manage proposals'}</strong>
            <button
              onClick={closeForeshadowPanel}
              disabled={foreshadowBusy}
              aria-label={zh ? '关闭伏笔提案' : 'Close foreshadow manage'}
            >
              <XCircle size={15} />
            </button>
          </header>
          <div className="chapter-eval-body">
            {foreshadowBusy && <p className="finalization-message">{zh ? '正在管理…' : 'Managing…'}</p>}
            {foreshadowError && <p className="finalization-message error">{foreshadowError}</p>}
            {foreshadowNotice && <p className="finalization-message ok">{foreshadowNotice}</p>}
            {foreshadowProposals?.creates.map((item) => renderForeshadowCardRow(item, 'create'))}
            {foreshadowProposals?.updates.map((item) => renderForeshadowCardRow(item, 'update'))}
            {foreshadowProposals?.bindings.map((item) => renderForeshadowBindingRow(item))}
          </div>
          {foreshadowProposals && (
            <div className="chapter-eval-footer">
              <button
                className="primary"
                onClick={() => void applyForeshadow()}
                disabled={foreshadowBusy || !foreshadowConfirmReady}
              >
                {zh ? '确认写入' : 'Confirm write'}
              </button>
            </div>
          )}
        </section>
      )}
    </section>
  )
}
