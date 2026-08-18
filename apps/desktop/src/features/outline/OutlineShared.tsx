import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Bot, ChevronDown, Link2, Plus, Trash2, X } from 'lucide-react'
import type { LocalDocumentLinkIndexV1, LocalDocumentReferenceResult } from '@quillarium/core'
import type { DocEntry, LanguageName, TargetSelection } from '../../app/types.js'
import { formatFieldValue } from '../../shared/outline.js'
import { TagEditor } from '../metadata/TagEditor.js'
import {
  collectTagSuggestions,
  displayTag,
  INDEXED_CATEGORY_FIELDS,
  isTagField
} from '../metadata/tag-index.js'
import {
  documentTypeLabel,
  enumChoiceLabel,
  enumOptionsForField,
  fieldDescription,
  fieldLabel,
  fieldPresentation,
  type FieldPresentationContext
} from '../metadata/field-presentation.js'
import { structuredLineForSection, timelineBelongsToArc } from './outline-model.js'
import { removeArrayItem, renameRecordKey, updateArrayItem } from '../metadata/value-editing.js'
import { PlanningCardSelector } from '../planning/PlanningCardSelector.js'

export function VolumeTimeline({
  docs,
  volume,
  arcs,
  items,
  language = 'zh',
  selectedTarget,
  onSelect
}: {
  docs: DocEntry[]
  volume: DocEntry
  arcs: DocEntry[]
  items: DocEntry[]
  language?: LanguageName
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
              <span className="badge ok">篇</span>
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
                  <small>{structuredLineForSection(event, language) || event.content.slice(0, 80)}</small>
                </button>
              ))}
              {!events.length && <p className="empty-row">这个篇还没有绑定时间线事件。</p>}
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
                <small>{structuredLineForSection(event, language) || event.content.slice(0, 80)}</small>
              </button>
            ))}
          </div>
        </article>
      )}
    </div>
  )
}

export function StructuredTile({ doc, language = 'zh' }: { doc: DocEntry; language?: LanguageName }) {
  const line = structuredLineForSection(doc, language)
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

export function documentLinkIndexLoadKey(
  projectRoot: string | undefined,
  _documentPath?: string
): string | undefined {
  return projectRoot
}

export function shouldFetchDocumentLinkIndex(docType: string): boolean {
  return docType === 'reference' || docType === 'issue'
}

export function PlanningCardSupportPanel({
  doc,
  docs,
  projectRoot,
  language,
  onSelect,
  onAIEdit,
  onReload
}: {
  doc: DocEntry
  docs: DocEntry[]
  projectRoot?: string
  language: LanguageName
  onSelect: (target: TargetSelection) => void
  onAIEdit: (doc: DocEntry) => void
  onReload?: () => Promise<void>
}) {
  const zh = language === 'zh'
  const [linkIndex, setLinkIndex] = useState<LocalDocumentLinkIndexV1>()
  const fetchLinkIndex = shouldFetchDocumentLinkIndex(String(doc.data.type))
  useEffect(() => {
    let active = true
    if (!projectRoot || !fetchLinkIndex) return () => undefined
    void window.quillarium
      .rebuildDocumentLinkIndex(projectRoot)
      .then((index) => {
        if (active) setLinkIndex(index)
      })
      .catch(() => {
        if (active) setLinkIndex(undefined)
      })
    return () => {
      active = false
    }
  }, [fetchLinkIndex, projectRoot])
  const forwardLinks = linkIndex?.forward[doc.data.id] ?? []
  const backlinks = linkIndex?.backlinks[doc.data.id] ?? []
  const graphIssues = forwardLinks.filter((reference) => reference.status !== 'resolved')
  const derived =
    doc.data.type === 'reference'
      ? docs.filter(
          (item) =>
            Array.isArray(item.data.source_refs) && item.data.source_refs.includes(String(doc.data.id))
        )
      : []
  const related =
    doc.data.type === 'issue' && Array.isArray(doc.data.related_docs)
      ? doc.data.related_docs
          .map((id) => docs.find((candidate) => candidate.data.id === id))
          .filter((item): item is DocEntry => Boolean(item))
      : []
  const missingIssueTargets =
    doc.data.type === 'issue' && Array.isArray(doc.data.related_docs)
      ? doc.data.related_docs.filter((id) => !docs.some((candidate) => candidate.data.id === id))
      : []

  const hasDocumentLinks = forwardLinks.length > 0 || backlinks.length > 0

  if (
    doc.data.type !== 'reference' &&
    doc.data.type !== 'issue' &&
    graphIssues.length === 0 &&
    !hasDocumentLinks
  )
    return null

  return (
    <section className={`card-support-panel type-${doc.data.type}`}>
      <header>
        <span className="card-support-icon">
          {doc.data.type === 'issue' ? <Bot size={15} /> : <Link2 size={15} />}
        </span>
        <div>
          <strong>
            {doc.data.type === 'reference'
              ? zh
                ? '由此材料生成的卡片'
                : 'Cards derived from this material'
              : doc.data.type === 'issue'
                ? zh
                  ? '问题处理与关联卡片'
                  : 'Issue resolution and related cards'
                : zh
                  ? '关系完整性提醒'
                  : 'Relationship integrity'}
          </strong>
          <small>
            {doc.data.type === 'reference'
              ? zh
                ? '这里按来源引用实时汇总；参考原文不会直接进入生成上下文。'
                : 'Built live from source references; the material body is excluded from generation context.'
              : doc.data.type === 'issue'
                ? zh
                  ? '先打开证据卡片核对，也可以与 AI 讨论后原位修改对应卡片。'
                  : 'Inspect evidence first, then discuss and update the related card in place.'
                : zh
                  ? '这张卡片存在孤立或失效引用；可在关联属性中修复。'
                  : 'This card is isolated or contains a broken link; repair it in Relations.'}
          </small>
        </div>
      </header>

      {doc.data.type === 'reference' && (
        <div className="card-support-links">
          {derived.map((item) => (
            <button key={item.data.id} type="button" onClick={() => onSelect(item.data)}>
              <span>{item.data.title}</span>
              <small>{documentTypeLabel(item.data.type, language)}</small>
            </button>
          ))}
          {!derived.length && <p>{zh ? '还没有卡片引用这份材料。' : 'No card cites this material yet.'}</p>}
        </div>
      )}

      {doc.data.type === 'issue' && (
        <div className="issue-repair-list">
          {related.map((item) => (
            <article key={item.data.id}>
              <button type="button" className="issue-related-card" onClick={() => onSelect(item.data)}>
                <span>{item.data.title}</span>
                <small>{documentTypeLabel(item.data.type, language)}</small>
              </button>
              {AI_EDITABLE_CARD_TYPES.has(item.data.type) && (
                <button type="button" className="issue-ai-repair" onClick={() => onAIEdit(item)}>
                  <Bot size={13} /> {zh ? '与 AI 讨论修改' : 'Discuss fix with AI'}
                </button>
              )}
            </article>
          ))}
          {!related.length && !missingIssueTargets.length && (
            <p>{zh ? '尚未关联到具体卡片，请先在“关联资料”中选择。' : 'Link a specific record first.'}</p>
          )}
          {missingIssueTargets.map((id) => (
            <p className="field-warning" key={id}>
              {zh ? `失效关联：${id}` : `Broken relation: ${id}`}
            </p>
          ))}
        </div>
      )}

      {doc.data.type !== 'reference' && doc.data.type !== 'issue' && graphIssues.length > 0 && (
        <ul className="card-graph-warnings">
          {graphIssues.map((issue, index) => (
            <li key={`${issue.status}:${issue.raw_reference}:${index}`}>
              {issue.status === 'ambiguous'
                ? zh
                  ? `引用有歧义：${issue.raw_reference}`
                  : `Ambiguous link: ${issue.raw_reference}`
                : zh
                  ? `存在失效引用：${issue.raw_reference}`
                  : `Broken link: ${issue.raw_reference}`}
            </li>
          ))}
        </ul>
      )}

      {hasDocumentLinks && (
        <div className="document-link-index">
          <DocumentReferenceList
            title={zh ? '前向链接' : 'Outgoing links'}
            references={forwardLinks}
            docs={docs}
            language={language}
            onSelect={onSelect}
          />
          <DocumentReferenceList
            title={zh ? '反向链接' : 'Backlinks'}
            references={backlinks}
            docs={docs}
            language={language}
            onSelect={onSelect}
          />
        </div>
      )}
      {projectRoot && (hasDocumentLinks || doc.data.type === 'world_entry') && (
        <ReferenceMigrationControls projectRoot={projectRoot} language={language} onReload={onReload} />
      )}
    </section>
  )
}

function ReferenceMigrationControls({
  projectRoot,
  language,
  onReload
}: {
  projectRoot: string
  language: LanguageName
  onReload?: () => Promise<void>
}) {
  const [plan, setPlan] = useState<
    Awaited<ReturnType<typeof window.quillarium.planDocumentReferenceMigration>> | undefined
  >()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const zh = language === 'zh'
  return (
    <details className="reference-migration-controls">
      <summary>
        {zh ? '旧引用规范化（需确认）' : 'Normalize legacy references (confirmation required)'}
      </summary>
      <p>
        {zh
          ? '先生成只读预览；不会在加载时改写。歧义和真正缺失的引用不会自动处理。'
          : 'Generate a read-only preview first. Loading never rewrites files; ambiguous and missing references are not changed.'}
      </p>
      {!plan ? (
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            setMessage('')
            try {
              setPlan(await window.quillarium.planDocumentReferenceMigration(projectRoot))
            } catch (error) {
              setMessage(error instanceof Error ? error.message : String(error))
            } finally {
              setBusy(false)
            }
          }}
        >
          <Link2 size={14} />{' '}
          {busy ? (zh ? '正在扫描…' : 'Scanning…') : zh ? '预览迁移' : 'Preview migration'}
        </button>
      ) : (
        <div className="reference-migration-preview">
          <p>
            {zh
              ? `${plan.files.length} 个文件、${plan.files.reduce((sum, file) => sum + file.replacements.length, 0)} 处可规范化；${plan.ambiguous.length} 处歧义；${plan.missing.length} 处缺失。`
              : `${plan.files.length} files and ${plan.files.reduce((sum, file) => sum + file.replacements.length, 0)} replacements; ${plan.ambiguous.length} ambiguous; ${plan.missing.length} missing.`}
          </p>
          <ul>
            {plan.files.slice(0, 8).map((file) => (
              <li key={file.relative_path}>
                {file.relative_path} · {file.replacements.length}
              </li>
            ))}
          </ul>
          <div className="reference-migration-actions">
            <button type="button" onClick={() => setPlan(undefined)} disabled={busy}>
              {zh ? '关闭预览' : 'Close preview'}
            </button>
            <button
              type="button"
              disabled={busy || plan.files.length === 0}
              onClick={async () => {
                setBusy(true)
                setMessage('')
                try {
                  const report = await window.quillarium.applyDocumentReferenceMigration(projectRoot, plan)
                  setMessage(
                    zh
                      ? `已备份并规范化 ${report.changed_files} 个文件，写后验证通过。`
                      : `Backed up and normalized ${report.changed_files} files; verification passed.`
                  )
                  setPlan(undefined)
                  await onReload?.()
                } catch (error) {
                  setMessage(error instanceof Error ? error.message : String(error))
                } finally {
                  setBusy(false)
                }
              }}
            >
              {zh ? '确认备份并应用' : 'Confirm backup and apply'}
            </button>
          </div>
        </div>
      )}
      {message && <p className="reference-migration-message">{message}</p>}
    </details>
  )
}

function DocumentReferenceList({
  title,
  references,
  docs,
  language,
  onSelect
}: {
  title: string
  references: LocalDocumentReferenceResult[]
  docs: DocEntry[]
  language: LanguageName
  onSelect: (target: TargetSelection) => void
}) {
  const byId = new Map(docs.map((document) => [document.data.id, document] as const))
  if (!references.length) return null
  return (
    <section className="document-reference-list">
      <strong>{title}</strong>
      {references.map((reference, index) => {
        const target = reference.target_id ? byId.get(reference.target_id) : undefined
        return (
          <div
            key={`${reference.origin}:${reference.raw_reference}:${index}`}
            className={`document-reference-row ${reference.status}`}
          >
            {target ? (
              <button type="button" onClick={() => onSelect(target.data)}>
                <span>{target.data.title}</span>
                <small>
                  {documentTypeLabel(target.data.type, language)} · {reference.matched_by}
                </small>
              </button>
            ) : (
              <span>
                <b>{reference.raw_reference}</b>
                <small>
                  {reference.status === 'ambiguous'
                    ? language === 'zh'
                      ? `引用有歧义：${reference.candidates.map((candidate) => candidate.title).join('、')}`
                      : `Ambiguous: ${reference.candidates.map((candidate) => candidate.title).join(', ')}`
                    : language === 'zh'
                      ? '引用目标不存在'
                      : 'Reference target is missing'}
                </small>
              </span>
            )}
          </div>
        )
      })}
    </section>
  )
}

export const AI_EDITABLE_CARD_TYPES = new Set([
  'character',
  'character_relation',
  'world_entry',
  'timeline_node',
  'timeline_event',
  'location',
  'foreshadowing',
  'strategy',
  'pattern',
  'narrative',
  'issue',
  'reference'
])

const IDENTITY_FIELDS = new Set([
  'title',
  'status',
  'code',
  'level',
  'state',
  'kind',
  'scope',
  'enabled',
  'role',
  'entry_status',
  'importance',
  'strength',
  'source',
  'category',
  'priority',
  'material_type',
  'reading_status'
])
const CHARACTER_TIME_FIELDS = new Set(['born_at', 'introduced_at', 'exited_at', 'died_at'])
const CHARACTER_IDENTITY_FIELD_ORDER = new Map(
  ['introduced_at', 'exited_at', 'born_at', 'died_at', 'status', 'enabled', 'role'].map((field, index) => [
    field,
    index
  ])
)
const CHARACTER_RELATION_FIELDS = new Set([
  'from_character',
  'to_character',
  'relation_type',
  'direction',
  'starts_at',
  'ends_at',
  'visibility'
])
const CHARACTER_RELATION_IDENTITY_FIELD_ORDER = new Map(
  [
    'from_character',
    'to_character',
    'relation_type',
    'direction',
    'starts_at',
    'ends_at',
    'visibility',
    'status',
    'enabled'
  ].map((field, index) => [field, index])
)
const RELATION_FIELDS = new Set([
  'source_refs',
  'relations',
  'parent',
  'previous',
  'next',
  'location',
  'parent_location',
  'layout_of',
  'timeline_node',
  'from_character',
  'to_character',
  'starts_at',
  'ends_at',
  'born_at',
  'died_at',
  'introduced_at',
  'exited_at',
  'characters',
  'related_characters',
  'related_arc',
  'related_docs',
  'related_timeline',
  'related_events',
  'related_foreshadowing',
  'world_entries_used',
  'foreshadowing_planted',
  'foreshadowing_resolved',
  'foreshadowing_reinforced',
  'related_patterns',
  'links',
  'used_in',
  'relationships',
  'relationship_delta'
])
const ARRAY_ITEM_TEMPLATES: Record<string, Record<string, unknown>> = {
  used_in: { scene: '', usage: '' },
  disclosure: { segment: '', reveal_after: '' },
  trigger_conditions: { kind: 'outline_reached', target_id: '', keyword: '' }
}

const DOCUMENT_LINK_FIELDS: Record<string, string[]> = {
  source_refs: ['reference'],
  parent: ['outline'],
  previous: ['timeline_node'],
  next: ['timeline_node'],
  timeline_node: ['timeline_node', 'timeline_event'],
  location: ['location'],
  parent_location: ['location'],
  layout_of: ['location'],
  characters: ['character'],
  related_characters: ['character'],
  from_character: ['character'],
  to_character: ['character'],
  born_at: ['timeline_node'],
  died_at: ['timeline_node'],
  introduced_at: ['timeline_node'],
  exited_at: ['timeline_node'],
  starts_at: ['timeline_node'],
  ends_at: ['timeline_node'],
  related_arc: ['outline'],
  related_docs: [],
  related_timeline: ['timeline_node', 'timeline_event'],
  related_events: ['timeline_event'],
  related_foreshadowing: ['foreshadowing'],
  world_entries_used: ['world_entry'],
  foreshadowing_planted: ['foreshadowing'],
  foreshadowing_resolved: ['foreshadowing'],
  foreshadowing_reinforced: ['foreshadowing'],
  related_patterns: ['narrative', 'strategy', 'pattern'],
  links: ['world_entry']
}

export function MetadataEditor({
  data,
  docs = [],
  projectRoot,
  documentPath,
  onChange,
  onSelectDocument,
  onInspectTag,
  excludeKeys = [],
  documentType,
  language = 'zh'
}: {
  data: Record<string, unknown>
  docs?: DocEntry[]
  projectRoot?: string
  documentPath?: string
  onChange: (data: Record<string, unknown>) => void
  onSelectDocument?: (target: TargetSelection) => void
  onInspectTag?: (tag: string, displayValue?: string) => void
  excludeKeys?: string[]
  documentType?: string
  language?: LanguageName
}) {
  const resolvedDocumentType = documentType ?? String(data['type'] ?? '')
  const editableKeys = Object.keys(data).filter(
    (key) =>
      !['id', 'type', 'schema_version', 'title', 'quillarium_origin'].includes(key) &&
      !(
        resolvedDocumentType === 'reference' &&
        ['status', 'enabled', 'source_refs', 'relations'].includes(key)
      ) &&
      !excludeKeys.includes(key)
  )
  const groups = [
    { id: 'identity', label: language === 'zh' ? '基本信息' : 'Essentials', defaultOpen: true },
    { id: 'index', label: language === 'zh' ? '标签与索引' : 'Tags & index', defaultOpen: true },
    { id: 'relations', label: language === 'zh' ? '关联内容' : 'Relations', defaultOpen: false },
    { id: 'details', label: language === 'zh' ? '详细属性' : 'Details', defaultOpen: false }
  ] as const
  const grouped = new Map(groups.map((group) => [group.id, [] as string[]]))
  for (const key of editableKeys) {
    const group =
      resolvedDocumentType === 'character_relation' && CHARACTER_RELATION_FIELDS.has(key)
        ? 'identity'
        : metadataGroupForField(key, data[key])
    grouped.get(group)?.push(key)
  }
  const suggestions = useMemo(() => collectTagSuggestions(docs), [docs])
  const [referenceIndex, setReferenceIndex] = useState<LocalDocumentLinkIndexV1>()
  const indexKey = documentLinkIndexLoadKey(projectRoot, documentPath)
  useEffect(() => {
    let active = true
    if (!indexKey) return () => undefined
    void window.quillarium
      .rebuildDocumentLinkIndex(indexKey)
      .then((index) => {
        if (active) setReferenceIndex(index)
      })
      .catch(() => {
        if (active) setReferenceIndex(undefined)
      })
    return () => {
      active = false
    }
  }, [indexKey])
  const referenceResults = referenceIndex?.forward[String(data['id'] ?? '')] ?? []
  return (
    <div className="metadata-editor">
      {groups.map((group) => {
        const keys = [...(grouped.get(group.id) ?? [])]
        if (group.id === 'identity' && resolvedDocumentType === 'character') {
          keys.sort(
            (left, right) =>
              (CHARACTER_IDENTITY_FIELD_ORDER.get(left) ?? Number.MAX_SAFE_INTEGER) -
              (CHARACTER_IDENTITY_FIELD_ORDER.get(right) ?? Number.MAX_SAFE_INTEGER)
          )
        }
        if (group.id === 'identity' && resolvedDocumentType === 'character_relation') {
          keys.sort(
            (left, right) =>
              (CHARACTER_RELATION_IDENTITY_FIELD_ORDER.get(left) ?? Number.MAX_SAFE_INTEGER) -
              (CHARACTER_RELATION_IDENTITY_FIELD_ORDER.get(right) ?? Number.MAX_SAFE_INTEGER)
          )
        }
        if (!keys.length) return null
        return (
          <MetadataSection
            key={group.id}
            label={group.label}
            count={keys.length}
            defaultOpen={group.defaultOpen}
          >
            {keys.map((key) => (
              <MetadataField
                key={key}
                name={key}
                value={data[key]}
                siblingData={data}
                context={{
                  documentType: resolvedDocumentType,
                  documentId: String(data['id'] ?? '')
                }}
                language={language}
                docs={docs}
                projectRoot={projectRoot}
                documentPath={documentPath}
                referenceResults={referenceResults}
                suggestions={suggestions}
                onInspectTag={onInspectTag}
                onSelectDocument={onSelectDocument}
                onChange={(value) => onChange({ ...data, [key]: value })}
              />
            ))}
          </MetadataSection>
        )
      })}
    </div>
  )
}

function MetadataSection({
  label,
  count,
  defaultOpen,
  children
}: {
  label: string
  count: number
  defaultOpen: boolean
  children: ReactNode
}) {
  return (
    <details className="metadata-section" open={defaultOpen}>
      <summary>
        <span>{label}</span>
        <small>{count}</small>
        <ChevronDown size={15} />
      </summary>
      <div className="metadata-section-grid">{children}</div>
    </details>
  )
}

export function metadataGroupForField(
  name: string,
  value: unknown
): 'identity' | 'index' | 'relations' | 'details' {
  if (isTagField(name) || INDEXED_CATEGORY_FIELDS.has(name)) return 'index'
  if (CHARACTER_TIME_FIELDS.has(name)) return 'identity'
  if (RELATION_FIELDS.has(name)) return 'relations'
  if (IDENTITY_FIELDS.has(name) || typeof value === 'boolean') return 'identity'
  return 'details'
}

function MetadataField({
  name,
  value,
  siblingData,
  context,
  language,
  docs,
  projectRoot,
  documentPath,
  referenceResults,
  suggestions,
  onInspectTag,
  onSelectDocument,
  onChange
}: {
  name: string
  value: unknown
  siblingData: Record<string, unknown>
  context: FieldPresentationContext
  language: LanguageName
  docs: DocEntry[]
  projectRoot?: string
  documentPath?: string
  referenceResults: LocalDocumentReferenceResult[]
  suggestions: string[]
  onInspectTag?: (tag: string, displayValue?: string) => void
  onSelectDocument?: (target: TargetSelection) => void
  onChange: (value: unknown) => void
}) {
  const options = enumOptionsForField(name, context)
  const presentation = fieldPresentation(name, language, context)
  if (name === 'planned_plant_ref' || name === 'planned_resolve_ref') {
    return (
      <ForeshadowTimePositionEditor
        name={name}
        value={isRecord(value) ? value : null}
        legacyText={String(
          siblingData[name === 'planned_plant_ref' ? 'planned_plant' : 'planned_resolve'] ?? ''
        )}
        docs={docs}
        language={language}
        onChange={onChange}
      />
    )
  }
  if (name === 'relations' && Array.isArray(value)) {
    return (
      <CardRelationEditor
        value={value}
        docs={docs.filter((document) => document.data.id !== context.documentId)}
        language={language}
        onChange={onChange}
      />
    )
  }
  if (name === 'trigger_conditions' && Array.isArray(value)) {
    return (
      <ForeshadowTriggerEditor
        value={value}
        docs={docs.filter((document) => document.data.id !== context.documentId)}
        language={language}
        onChange={onChange}
      />
    )
  }
  if (Object.hasOwn(DOCUMENT_LINK_FIELDS, name)) {
    const allowedTypes = DOCUMENT_LINK_FIELDS[name]
    const choices = docs.filter(
      (document) =>
        document.data.id !== context.documentId &&
        (allowedTypes.length === 0 || allowedTypes.includes(document.data.type))
    )
    if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
      return (
        <DocumentMultiSelect
          name={name}
          value={value}
          docs={choices}
          language={language}
          context={context}
          projectRoot={projectRoot}
          sourcePath={documentPath}
          referenceResults={referenceResults}
          onSelectDocument={onSelectDocument}
          onChange={onChange}
        />
      )
    }
    if (typeof value === 'string' || value === null || value === undefined) {
      return (
        <DocumentSingleSelect
          name={name}
          value={typeof value === 'string' ? value : ''}
          docs={choices}
          language={language}
          context={context}
          projectRoot={projectRoot}
          sourcePath={documentPath}
          referenceResults={referenceResults}
          onSelectDocument={onSelectDocument}
          nullable={value === null}
          onChange={onChange}
        />
      )
    }
  }
  if (options && (typeof value === 'string' || value === undefined)) {
    const choices = value && !options.includes(value) ? [value, ...options] : options
    return (
      <div className="choice-field">
        <div className="metadata-field-label">
          <FieldCopy name={name} language={language} context={context} />
        </div>
        <div className="choice-chip-list" role="radiogroup" aria-label={presentation.label}>
          {choices.map((option) => (
            <button
              type="button"
              role="radio"
              aria-checked={option === value}
              className={option === value ? 'active' : ''}
              key={option}
              title={
                option === value && INDEXED_CATEGORY_FIELDS.has(name) && onInspectTag
                  ? language === 'zh'
                    ? '再次点击查看同类内容'
                    : 'Click again to view matching records'
                  : undefined
              }
              onClick={() => {
                if (option === value && INDEXED_CATEGORY_FIELDS.has(name) && onInspectTag)
                  onInspectTag(option, enumChoiceLabel(name, option, language, context))
                else onChange(option)
              }}
            >
              {INDEXED_CATEGORY_FIELDS.has(name)
                ? displayTag(enumChoiceLabel(name, option, language, context))
                : enumChoiceLabel(name, option, language, context)}
            </button>
          ))}
        </div>
      </div>
    )
  }
  if (typeof value === 'boolean') {
    return (
      <label className="metadata-checkbox">
        <input type="checkbox" checked={value} onChange={(event) => onChange(event.target.checked)} />
        <FieldCopy name={name} language={language} context={context} />
      </label>
    )
  }
  if (typeof value === 'number') {
    return (
      <label className="metadata-scalar-field">
        <FieldCopy name={name} language={language} context={context} />
        <input type="number" value={value} onChange={(event) => onChange(Number(event.target.value))} />
      </label>
    )
  }
  if (Array.isArray(value)) {
    const itemTemplate = ARRAY_ITEM_TEMPLATES[name]
    if (itemTemplate && (value.length === 0 || value.every(isRecord))) {
      return (
        <ArrayRecordEditor
          name={name}
          value={value}
          itemTemplate={itemTemplate}
          language={language}
          context={context}
          onChange={onChange}
        />
      )
    }
    if (value.every((item) => typeof item === 'string')) {
      if (!isTagField(name)) {
        return (
          <StringListEditor
            name={name}
            values={value}
            language={language}
            context={context}
            onChange={onChange}
          />
        )
      }
      return (
        <TagEditor
          label={fieldLabel(name, language, context)}
          description={fieldDescription(name, language, context)}
          values={value}
          suggestions={suggestions}
          language={language}
          onChange={onChange}
          onInspectTag={isTagField(name) ? onInspectTag : undefined}
        />
      )
    }
    return (
      <ArrayRecordEditor
        name={name}
        value={value}
        language={language}
        context={context}
        onChange={onChange}
      />
    )
  }
  if (isRecord(value)) {
    if (name === 'scene_state') {
      return (
        <NestedRecordEditor
          value={value}
          label={presentation.label}
          description={presentation.description}
          language={language}
          context={context}
          onChange={onChange}
        />
      )
    }
    return (
      <RecordEditor name={name} value={value} language={language} context={context} onChange={onChange} />
    )
  }
  return (
    <label className="metadata-scalar-field">
      <FieldCopy name={name} language={language} context={context} />
      <input
        value={String(value ?? '')}
        aria-label={presentation.label}
        onChange={(event) => onChange(value === null && !event.target.value ? null : event.target.value)}
      />
    </label>
  )
}

function ForeshadowTimePositionEditor({
  name,
  value,
  legacyText,
  docs,
  language,
  onChange
}: {
  name: 'planned_plant_ref' | 'planned_resolve_ref'
  value: Record<string, unknown> | null
  legacyText: string
  docs: DocEntry[]
  language: LanguageName
  onChange: (value: unknown) => void
}) {
  const zh = language === 'zh'
  const timeDocs = docs.filter(
    (document) => document.data.type === 'timeline_node' || document.data.type === 'timeline_event'
  )
  const timelineIds = Array.from(
    new Set(
      timeDocs.flatMap((document) => {
        const placements = [
          ...(Array.isArray(document.data.timeline_tracks) ? document.data.timeline_tracks : []),
          ...(Array.isArray(document.data.placements) ? document.data.placements : [])
        ]
        const ids = placements
          .filter(isRecord)
          .map((placement) => String(placement['timeline_id'] ?? '').trim())
          .filter(Boolean)
        return ids.length ? ids : ['main']
      })
    )
  ).sort()
  const timelineDocs: DocEntry[] = timelineIds.map((id) => ({
    path: '',
    data: { id, type: 'timeline', title: zh ? `时间线 ${id}` : `Timeline ${id}`, tags: [] },
    content: ''
  }))
  const timelineId = String(value?.['timeline_id'] ?? '')
  const targetId = String(value?.['target_id'] ?? '')
  const targetType = String(value?.['target_type'] ?? '')
  const outlineId = String(value?.['outline_id'] ?? '')
  const targetChoices = timeDocs.filter((document) => {
    if (!timelineId) return true
    const placements = [
      ...(Array.isArray(document.data.timeline_tracks) ? document.data.timeline_tracks : []),
      ...(Array.isArray(document.data.placements) ? document.data.placements : [])
    ].filter(isRecord)
    return placements.length === 0
      ? timelineId === 'main'
      : placements.some((placement) => placement['timeline_id'] === timelineId)
  })
  const outlineChoices = docs.filter(
    (document) => document.data.type === 'outline' || document.data.type === 'scene'
  )
  const selectedTarget = timeDocs.find((document) => document.data.id === targetId)
  const updateTarget = (nextTargetId: string) => {
    if (!nextTargetId) {
      onChange(
        timelineId
          ? {
              timeline_id: timelineId,
              target_type: 'timeline',
              target_id: timelineId,
              display_name:
                timelineDocs.find((item) => item.data.id === timelineId)?.data.title ?? timelineId,
              outline_id: outlineId || null
            }
          : null
      )
      return
    }
    const target = timeDocs.find((document) => document.data.id === nextTargetId)
    if (!target) return
    const placements = [
      ...(Array.isArray(target.data.timeline_tracks) ? target.data.timeline_tracks : []),
      ...(Array.isArray(target.data.placements) ? target.data.placements : [])
    ].filter(isRecord)
    const inferredTimeline = timelineId || String(placements[0]?.['timeline_id'] ?? '').trim() || 'main'
    onChange({
      timeline_id: inferredTimeline,
      target_type: target.data.type,
      target_id: String(target.data.id),
      display_name: String(target.data.display_time ?? target.data.date ?? target.data.title),
      outline_id: outlineId || null
    })
  }
  return (
    <div className="foreshadow-time-position-editor">
      <div className="metadata-field-label">
        <FieldCopy name={name} language={language} context={{ documentType: 'foreshadowing' }} />
      </div>
      {legacyText.trim() && !value && (
        <p className="metadata-migration-warning" role="note">
          {zh
            ? `旧自由文本“${legacyText}”仍被保留。请在下方选择时间位置以显式迁移；选择不会删除旧文字。`
            : `Legacy free text “${legacyText}” is still preserved. Choose a story-time location to migrate it explicitly; the text will not be deleted.`}
        </p>
      )}
      <PlanningCardSelector
        docs={timelineDocs}
        value={timelineId}
        language={language}
        placeholder={zh ? '先选择时间线…' : 'Choose a timeline…'}
        ariaLabel={zh ? '选择主时间线' : 'Choose primary timeline'}
        onChange={(id) => {
          if (!id) return onChange(null)
          onChange({
            timeline_id: id,
            target_type: 'timeline',
            target_id: id,
            display_name: String(timelineDocs.find((item) => item.data.id === id)?.data.title ?? id),
            outline_id: outlineId || null
          })
        }}
      />
      <PlanningCardSelector
        docs={targetChoices}
        value={targetType === 'timeline' ? '' : targetId}
        language={language}
        placeholder={zh ? '可继续选择时间节点或事件…' : 'Optionally choose a node or event…'}
        ariaLabel={zh ? '选择时间节点或事件' : 'Choose timeline node or event'}
        onChange={updateTarget}
      />
      <PlanningCardSelector
        docs={outlineChoices}
        value={outlineId}
        language={language}
        placeholder={zh ? '可选：关联章或节…' : 'Optional: link a chapter or section…'}
        ariaLabel={zh ? '关联章或节' : 'Link chapter or section'}
        onChange={(id) => {
          if (!value) return
          onChange({ ...value, outline_id: id || null })
        }}
      />
      {value && (
        <small className="foreshadow-time-position-summary">
          {zh ? '已保存稳定引用' : 'Stable reference saved'}：{timelineId} / {targetType} / {targetId}
          {selectedTarget ? ` · ${selectedTarget.data.title}` : ''}
        </small>
      )}
    </div>
  )
}

function ForeshadowTriggerEditor({
  value,
  docs,
  language,
  onChange
}: {
  value: unknown[]
  docs: DocEntry[]
  language: LanguageName
  onChange: (value: unknown) => void
}) {
  const conditions = value.map((item) =>
    isRecord(item)
      ? {
          kind: String(item['kind'] ?? 'outline_reached'),
          target_id: String(item['target_id'] ?? ''),
          keyword: String(item['keyword'] ?? '')
        }
      : { kind: 'outline_reached', target_id: '', keyword: '' }
  )
  const targetChoices = (kind: string) =>
    docs.filter((document) => {
      if (kind === 'timeline_reached')
        return document.data.type === 'timeline_node' || document.data.type === 'timeline_event'
      if (kind === 'outline_reached') return document.data.type === 'outline'
      if (kind === 'card_enabled') return document.data.type !== 'reference'
      return false
    })

  return (
    <div className="foreshadow-trigger-editor">
      <div className="metadata-field-label">
        <FieldCopy
          name="trigger_conditions"
          language={language}
          context={{ documentType: 'foreshadowing' }}
        />
        <small className="metadata-field-count">{conditions.length}</small>
      </div>
      <div className="foreshadow-trigger-rows">
        {conditions.map((condition, index) => {
          const choices = targetChoices(condition.kind)
          const missing =
            condition.kind !== 'keyword' &&
            Boolean(condition.target_id) &&
            !choices.some((document) => document.data.id === condition.target_id)
          return (
            <div className="foreshadow-trigger-row" key={`${condition.kind}-${index}`}>
              <label>
                <span>{fieldLabel('kind', language, { documentType: 'foreshadowing' })}</span>
                <select
                  value={condition.kind}
                  onChange={(event) => {
                    const kind = event.target.value
                    onChange(
                      updateArrayItem(conditions, index, {
                        ...condition,
                        kind,
                        target_id: kind === 'keyword' ? '' : condition.target_id,
                        keyword: kind === 'keyword' ? condition.keyword : ''
                      })
                    )
                  }}
                >
                  {['timeline_reached', 'outline_reached', 'keyword', 'card_enabled'].map((kind) => (
                    <option key={kind} value={kind}>
                      {enumChoiceLabel('kind', kind, language, { documentType: 'foreshadowing' })}
                    </option>
                  ))}
                </select>
              </label>
              {condition.kind === 'keyword' ? (
                <label>
                  <span>{fieldLabel('keyword', language)}</span>
                  <input
                    value={condition.keyword}
                    placeholder={language === 'zh' ? '输入触发词' : 'Enter a trigger phrase'}
                    onChange={(event) =>
                      onChange(
                        updateArrayItem(conditions, index, { ...condition, keyword: event.target.value })
                      )
                    }
                  />
                </label>
              ) : (
                <label>
                  <span>{fieldLabel('target_id', language)}</span>
                  <PlanningCardSelector
                    docs={choices}
                    value={condition.target_id}
                    language={language}
                    ariaLabel={fieldLabel('target_id', language)}
                    invalidValue={missing ? condition.target_id : undefined}
                    onChange={(stableId) =>
                      onChange(updateArrayItem(conditions, index, { ...condition, target_id: stableId }))
                    }
                  />
                </label>
              )}
              <button
                type="button"
                onClick={() => onChange(removeArrayItem(conditions, index))}
                aria-label={language === 'zh' ? '删除提醒条件' : 'Delete reminder condition'}
              >
                <Trash2 size={14} />
              </button>
              {missing && (
                <small className="field-warning">
                  {language === 'zh'
                    ? '目标卡片不存在，请重新选择。'
                    : 'Target card is missing; choose another.'}
                </small>
              )}
            </div>
          )
        })}
      </div>
      <button
        type="button"
        className="structured-add-button"
        onClick={() => onChange([...conditions, { kind: 'outline_reached', target_id: '', keyword: '' }])}
      >
        <Plus size={14} /> {language === 'zh' ? '添加提醒条件' : 'Add reminder condition'}
      </button>
    </div>
  )
}

function DocumentSingleSelect({
  name,
  value,
  docs,
  language,
  context,
  projectRoot,
  sourcePath,
  referenceResults,
  onSelectDocument,
  nullable,
  onChange
}: {
  name: string
  value: string
  docs: DocEntry[]
  language: LanguageName
  context: FieldPresentationContext
  projectRoot?: string
  sourcePath?: string
  referenceResults: LocalDocumentReferenceResult[]
  onSelectDocument?: (target: TargetSelection) => void
  nullable: boolean
  onChange: (value: unknown) => void
}) {
  const resolution = value
    ? (referenceResults.find(
        (reference) =>
          reference.raw_reference === value &&
          reference.source_path.replace(/\\/gu, '/') ===
            (sourcePath ?? '').replace(/\\/gu, '/').replace(`${projectRoot?.replace(/\\/gu, '/')}/`, '')
      ) ?? referenceResults.find((reference) => reference.raw_reference === value))
    : undefined
  const directDocument = value ? docs.find((candidate) => candidate.data.id === value) : undefined
  const document =
    resolution?.status === 'resolved'
      ? docs.find((candidate) => candidate.data.id === resolution.target_id)
      : directDocument
  const unresolvedOption = value && !document ? `__unresolved__:${value}` : ''
  return (
    <label className="metadata-scalar-field document-link-field">
      <FieldCopy name={name} language={language} context={context} />
      <PlanningCardSelector
        docs={docs}
        value={document?.data.id ?? ''}
        language={language}
        ariaLabel={fieldLabel(name, language, context)}
        invalidValue={unresolvedOption ? value : undefined}
        onChange={(stableId) => {
          const selected = docs.find((candidate) => candidate.data.id === stableId)
          if (!selected) {
            onChange(nullable ? null : '')
            return
          }
          if (name !== 'links' || !projectRoot) {
            onChange(selected.data.id)
            return
          }
          void window.quillarium
            .formatDocumentLink(projectRoot, selected.data.id, selected.data.title)
            .then(onChange)
        }}
      />
      {document && onSelectDocument && (
        <button type="button" className="document-link-open" onClick={() => onSelectDocument(document.data)}>
          <Link2 size={13} /> {language === 'zh' ? '打开关联卡片' : 'Open linked card'}
        </button>
      )}
      {resolution?.status === 'resolved' && value !== resolution.target_id && (
        <small className="field-help">
          {language === 'zh'
            ? `兼容解析为“${document?.data.title ?? resolution.target_id}”；仅在重新选择或显式迁移后规范化。`
            : `Resolved compatibly to “${document?.data.title ?? resolution.target_id}”; it is canonicalized only after reselection or explicit migration.`}
        </small>
      )}
      {resolution?.status === 'ambiguous' && (
        <small className="field-warning">
          {language === 'zh'
            ? `多个卡片匹配：${resolution.candidates.map((candidate) => candidate.title).join('、')}。请选择明确目标。`
            : `Multiple cards match: ${resolution.candidates.map((candidate) => candidate.title).join(', ')}. Choose one explicitly.`}
        </small>
      )}
      {resolution?.status === 'missing' && (
        <small className="field-warning">
          {language === 'zh'
            ? '当前引用指向未定义卡片；请选择一个现有卡片修复。'
            : 'This link points to a missing card. Select an existing card to repair it.'}
        </small>
      )}
    </label>
  )
}

function DocumentMultiSelect({
  name,
  value,
  docs,
  language,
  context,
  projectRoot,
  sourcePath,
  referenceResults,
  onSelectDocument,
  onChange
}: {
  name: string
  value: string[]
  docs: DocEntry[]
  language: LanguageName
  context: FieldPresentationContext
  projectRoot?: string
  sourcePath?: string
  referenceResults: LocalDocumentReferenceResult[]
  onSelectDocument?: (target: TargetSelection) => void
  onChange: (value: unknown) => void
}) {
  const [pending, setPending] = useState('')
  const byId = new Map(docs.map((document) => [document.data.id, document]))
  const resolvedValues = value.map((raw) => ({
    raw,
    resolution: referenceResults.find(
      (reference) =>
        reference.raw_reference === raw &&
        reference.source_path.replace(/\\/gu, '/') ===
          (sourcePath ?? '').replace(/\\/gu, '/').replace(`${projectRoot?.replace(/\\/gu, '/')}/`, '')
    ) ??
      referenceResults.find((reference) => reference.raw_reference === raw) ?? {
        raw_reference: raw,
        source_path: sourcePath ?? '',
        origin: 'structured_link' as const,
        status: byId.has(raw) ? ('resolved' as const) : ('missing' as const),
        ...(byId.has(raw) ? { target_id: raw, matched_by: 'stable_id' as const } : {}),
        candidates: []
      }
  }))
  const selectedIds = new Set(
    resolvedValues.map((item) => item.resolution.target_id).filter((id): id is string => Boolean(id))
  )
  const available = docs.filter((document) => !selectedIds.has(document.data.id))
  return (
    <div className="document-multi-field">
      <div className="metadata-field-label">
        <FieldCopy name={name} language={language} context={context} />
        <small className="metadata-field-count">{value.length}</small>
      </div>
      <div className="document-link-chips">
        {resolvedValues.map(({ raw, resolution }, index) => {
          const document = resolution.target_id ? byId.get(resolution.target_id) : undefined
          return (
            <span
              key={`${raw}:${index}`}
              className={`document-link-chip ${resolution.status === 'resolved' ? '' : resolution.status}`}
              title={
                resolution.status === 'ambiguous'
                  ? resolution.candidates.map((candidate) => candidate.title).join('、')
                  : raw
              }
            >
              {document ? (
                <button type="button" onClick={() => onSelectDocument?.(document.data)}>
                  {document.data.title} · {documentTypeLabel(document.data.type, language)}
                </button>
              ) : resolution.status === 'ambiguous' ? (
                language === 'zh' ? (
                  `有歧义：${raw}`
                ) : (
                  `Ambiguous: ${raw}`
                )
              ) : language === 'zh' ? (
                `未定义：${raw}`
              ) : (
                `Missing: ${raw}`
              )}
              <button
                type="button"
                onClick={() => onChange(value.filter((_, candidateIndex) => candidateIndex !== index))}
                aria-label={
                  language === 'zh'
                    ? `移除 ${document?.data.title ?? raw}`
                    : `Remove ${document?.data.title ?? raw}`
                }
              >
                <X size={12} />
              </button>
            </span>
          )
        })}
      </div>
      <div className="document-link-add">
        <PlanningCardSelector
          docs={available}
          value={pending}
          language={language}
          ariaLabel={language === 'zh' ? '新增关联卡片' : 'Add linked card'}
          onChange={setPending}
        />
        <button
          type="button"
          disabled={!pending}
          onClick={() => {
            const selected = byId.get(pending)
            if (!selected || selectedIds.has(pending)) return
            if (name !== 'links' || !projectRoot) {
              onChange([...value, selected.data.id])
              setPending('')
              return
            }
            void window.quillarium
              .formatDocumentLink(projectRoot, selected.data.id, selected.data.title)
              .then((canonical) => {
                onChange([...value, canonical])
                setPending('')
              })
          }}
        >
          <Plus size={14} /> {language === 'zh' ? '关联' : 'Link'}
        </button>
      </div>
    </div>
  )
}

const CARD_RELATION_KINDS = [
  'related',
  'supports',
  'contradicts',
  'depends_on',
  'located_in',
  'layout_of',
  'involves',
  'triggers',
  'resolves',
  'explains'
] as const

function CardRelationEditor({
  value,
  docs,
  language,
  onChange
}: {
  value: unknown[]
  docs: DocEntry[]
  language: LanguageName
  onChange: (value: unknown) => void
}) {
  const relations = value.map((item) =>
    isRecord(item)
      ? {
          kind: String(item['kind'] ?? 'related'),
          target_id: String(item['target_id'] ?? ''),
          note: String(item['note'] ?? '')
        }
      : { kind: 'related', target_id: '', note: '' }
  )
  return (
    <div className="card-relation-editor">
      <div className="metadata-field-label">
        <FieldCopy name="relations" language={language} />
        <small className="metadata-field-count">{relations.length}</small>
      </div>
      {relations.map((relation, index) => {
        const missing =
          relation.target_id && !docs.some((document) => document.data.id === relation.target_id)
        return (
          <div className="card-relation-row" key={`${relation.kind}-${relation.target_id}-${index}`}>
            <select
              value={relation.kind}
              aria-label={language === 'zh' ? '关系类型' : 'Relation type'}
              onChange={(event) =>
                onChange(updateArrayItem(relations, index, { ...relation, kind: event.target.value }))
              }
            >
              {CARD_RELATION_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {enumChoiceLabel('relation_kind', kind, language)}
                </option>
              ))}
            </select>
            <PlanningCardSelector
              docs={docs}
              value={relation.target_id}
              ariaLabel={language === 'zh' ? '目标卡片' : 'Target card'}
              language={language}
              invalidValue={missing ? relation.target_id : undefined}
              onChange={(stableId) =>
                onChange(updateArrayItem(relations, index, { ...relation, target_id: stableId }))
              }
            />
            <input
              value={relation.note}
              placeholder={language === 'zh' ? '关系说明（可选）' : 'Relation note (optional)'}
              onChange={(event) =>
                onChange(updateArrayItem(relations, index, { ...relation, note: event.target.value }))
              }
            />
            <button
              type="button"
              onClick={() => onChange(removeArrayItem(relations, index))}
              aria-label={language === 'zh' ? '删除关系' : 'Delete relation'}
            >
              <Trash2 size={14} />
            </button>
            {missing && (
              <small className="field-warning">
                {language === 'zh'
                  ? '目标卡片不存在，请重新选择。'
                  : 'Target card is missing; choose another.'}
              </small>
            )}
          </div>
        )
      })}
      <button
        type="button"
        className="structured-add-button"
        onClick={() => onChange([...relations, { kind: 'related', target_id: '', note: '' }])}
      >
        <Plus size={14} /> {language === 'zh' ? '添加卡片关系' : 'Add card relation'}
      </button>
    </div>
  )
}

function StringListEditor({
  name,
  values,
  language,
  context = {},
  label,
  description,
  onChange
}: {
  name: string
  values: string[]
  language: LanguageName
  context?: FieldPresentationContext
  label?: string
  description?: string
  onChange: (value: unknown) => void
}) {
  const [draft, setDraft] = useState('')
  const add = () => {
    const next = draft.trim()
    if (!next) return
    onChange([...values, next])
    setDraft('')
  }
  return (
    <div className="string-list-field">
      <div className="metadata-field-label">
        <FieldCopy
          name={name}
          label={label}
          description={description}
          language={language}
          context={context}
        />
        <small className="metadata-field-count">{values.length}</small>
      </div>
      <div className="string-list-rows">
        {values.map((value, index) => (
          <div className="string-list-row" key={index}>
            <input
              value={value}
              aria-label={(label ?? fieldLabel(name, language, context)) + ' ' + String(index + 1)}
              onChange={(event) => onChange(updateArrayItem(values, index, event.target.value))}
            />
            <button
              type="button"
              onClick={() => onChange(removeArrayItem(values, index))}
              aria-label={language === 'zh' ? '删除这一项' : 'Delete item'}
            >
              <X size={13} />
            </button>
          </div>
        ))}
      </div>
      <div className="string-list-add">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={language === 'zh' ? '添加一项…' : 'Add an item…'}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              add()
            }
          }}
        />
        <button type="button" disabled={!draft.trim()} onClick={add}>
          <Plus size={14} />
          <span className="sr-only">{language === 'zh' ? '添加' : 'Add'}</span>
        </button>
      </div>
    </div>
  )
}

function ArrayRecordEditor({
  name,
  value,
  itemTemplate,
  language,
  context = {},
  label,
  description,
  onChange
}: {
  name: string
  value: unknown[]
  itemTemplate?: Record<string, unknown>
  language: LanguageName
  context?: FieldPresentationContext
  label?: string
  description?: string
  onChange: (value: unknown) => void
}) {
  const objectRows = Boolean(itemTemplate) || value.every(isRecord)
  const keys = objectRows
    ? [
        ...new Set([
          ...(itemTemplate ? Object.keys(itemTemplate) : []),
          ...value.flatMap((row) => (isRecord(row) ? Object.keys(row) : []))
        ])
      ]
    : []
  return (
    <div className="structured-list-field">
      <div className="metadata-field-label">
        <FieldCopy
          name={name}
          label={label}
          description={description}
          language={language}
          context={context}
        />
        <small className="metadata-field-count">{value.length}</small>
      </div>
      <div className="structured-list-rows">
        {value.map((item, index) => (
          <div className="structured-list-row" key={index}>
            {objectRows && isRecord(item) ? (
              keys.map((key) => (
                <ValueEditor
                  key={key}
                  name={key}
                  value={item[key]}
                  label={fieldLabel(key, language, context)}
                  description={fieldDescription(key, language, context)}
                  language={language}
                  context={context}
                  onChange={(next) => {
                    onChange(updateArrayItem(value, index, { ...item, [key]: next }))
                  }}
                />
              ))
            ) : (
              <ValueEditor
                value={item}
                label={(label ?? fieldLabel(name, language, context)) + ' ' + String(index + 1)}
                description={description ?? fieldDescription(name, language, context)}
                language={language}
                context={context}
                onChange={(next) => onChange(updateArrayItem(value, index, next))}
              />
            )}
            <button
              type="button"
              onClick={() => onChange(removeArrayItem(value, index))}
              aria-label={language === 'zh' ? '删除这一项' : 'Delete item'}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
      <button
        className="structured-add-button"
        type="button"
        onClick={() =>
          onChange([
            ...value,
            objectRows ? { ...(itemTemplate ?? Object.fromEntries(keys.map((key) => [key, '']))) } : ''
          ])
        }
      >
        <Plus size={14} /> {language === 'zh' ? '添加一项' : 'Add item'}
      </button>
    </div>
  )
}

function RecordEditor({
  name,
  value,
  language,
  context = {},
  onChange
}: {
  name: string
  value: Record<string, unknown>
  language: LanguageName
  context?: FieldPresentationContext
  onChange: (value: unknown) => void
}) {
  const [newKey, setNewKey] = useState('')
  const rows = Object.entries(value)
  return (
    <div className="record-field-editor">
      <div className="metadata-field-label">
        <FieldCopy name={name} language={language} context={context} />
        <small className="metadata-field-count">{rows.length}</small>
      </div>
      <div className="record-field-rows">
        {rows.map(([key, item]) => (
          <div className="record-field-row" key={key}>
            <label>
              <FieldCopy
                label={language === 'zh' ? '条目名称' : 'Entry name'}
                description={
                  language === 'zh'
                    ? '这条关系、阶段或自定义信息的名称。'
                    : 'The name of this relationship, stage, or custom entry.'
                }
                language={language}
                context={context}
              />
              <RecordKeyInput
                value={key}
                existingKeys={Object.keys(value)}
                language={language}
                onRename={(nextKey) => onChange(renameRecordKey(value, key, nextKey))}
              />
            </label>
            <ValueEditor
              value={item}
              language={language}
              label={language === 'zh' ? '内容' : 'Value'}
              description={
                language === 'zh' ? '该名称对应的具体内容。' : 'The value associated with this name.'
              }
              context={context}
              onChange={(next) => onChange({ ...value, [key]: next })}
            />
            <button
              type="button"
              onClick={() => onChange(Object.fromEntries(rows.filter(([rowKey]) => rowKey !== key)))}
              aria-label={language === 'zh' ? '删除这一项' : 'Delete item'}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
      <div className="record-add-row">
        <input
          value={newKey}
          onChange={(event) => setNewKey(event.target.value)}
          placeholder={language === 'zh' ? '新名称' : 'New name'}
        />
        <button
          type="button"
          disabled={!newKey.trim() || Object.hasOwn(value, newKey.trim())}
          onClick={() => {
            const key = newKey.trim()
            if (!key || Object.hasOwn(value, key)) return
            onChange({ ...value, [key]: '' })
            setNewKey('')
          }}
        >
          <Plus size={14} /> {language === 'zh' ? '添加' : 'Add'}
        </button>
      </div>
    </div>
  )
}

function RecordKeyInput({
  value,
  existingKeys,
  language,
  onRename
}: {
  value: string
  existingKeys: string[]
  language: LanguageName
  onRename: (value: string) => void
}) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  const commit = () => {
    const next = draft.trim()
    if (!next || (next !== value && existingKeys.includes(next))) {
      setDraft(value)
      return
    }
    if (next !== value) onRename(next)
  }
  return (
    <input
      value={draft}
      aria-label={language === 'zh' ? `重命名 ${value}` : `Rename ${value}`}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          commit()
          event.currentTarget.blur()
        }
        if (event.key === 'Escape') {
          setDraft(value)
          event.currentTarget.blur()
        }
      }}
    />
  )
}

function NestedRecordEditor({
  value,
  language,
  label,
  description,
  context = {},
  onChange
}: {
  value: Record<string, unknown>
  language: LanguageName
  label: string
  description: string
  context?: FieldPresentationContext
  onChange: (value: Record<string, unknown>) => void
}) {
  return (
    <div className="nested-record-editor">
      <div className="metadata-field-label">
        <FieldCopy label={label} description={description} language={language} context={context} />
      </div>
      {Object.entries(value).map(([key, item]) => (
        <ValueEditor
          key={key}
          name={key}
          value={item}
          language={language}
          label={fieldLabel(key, language, context)}
          description={fieldDescription(key, language, context)}
          context={context}
          onChange={(next) => onChange({ ...value, [key]: next })}
        />
      ))}
    </div>
  )
}

function ValueEditor({
  name,
  value,
  label,
  description,
  language,
  context = {},
  onChange
}: {
  name?: string
  value: unknown
  label: string
  description: string
  language: LanguageName
  context?: FieldPresentationContext
  onChange: (value: unknown) => void
}) {
  const options = name ? enumOptionsForField(name, context) : undefined
  if (Array.isArray(value)) {
    if (value.every((item) => typeof item === 'string')) {
      return (
        <StringListEditor
          name={label}
          label={label}
          description={description}
          values={value}
          language={language}
          context={context}
          onChange={onChange}
        />
      )
    }
    return (
      <ArrayRecordEditor
        name={label}
        label={label}
        description={description}
        value={value}
        language={language}
        context={context}
        onChange={onChange}
      />
    )
  }
  if (isRecord(value)) {
    return (
      <NestedRecordEditor
        value={value}
        label={label}
        description={description}
        language={language}
        context={context}
        onChange={onChange}
      />
    )
  }
  if (options && typeof value === 'string') {
    const choices = value && !options.includes(value) ? [value, ...options] : options
    return (
      <label>
        <FieldCopy label={label} description={description} language={language} context={context} />
        <select value={value} onChange={(event) => onChange(event.target.value)}>
          {choices.map((option) => (
            <option key={option} value={option}>
              {enumChoiceLabel(name ?? '', option, language, context)}
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
        <FieldCopy label={label} description={description} language={language} context={context} />
      </label>
    )
  }
  if (typeof value === 'number') {
    return (
      <label>
        <FieldCopy label={label} description={description} language={language} context={context} />
        <input type="number" value={value} onChange={(event) => onChange(Number(event.target.value))} />
      </label>
    )
  }
  return (
    <label>
      <FieldCopy label={label} description={description} language={language} context={context} />
      <input value={formatPrimitive(value)} onChange={(event) => onChange(event.target.value)} />
    </label>
  )
}

function FieldCopy({
  name,
  label,
  description,
  language,
  context = {}
}: {
  name?: string
  label?: string
  description?: string
  language: LanguageName
  context?: FieldPresentationContext
}) {
  const presentation = name ? fieldPresentation(name, language, context) : null
  return (
    <span className="localized-field-copy">
      <strong>{label ?? presentation?.label}</strong>
      <small>{description ?? presentation?.description}</small>
    </span>
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function formatPrimitive(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') return formatFieldValue(value)
  return String(value)
}
