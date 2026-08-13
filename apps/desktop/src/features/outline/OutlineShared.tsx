import { useEffect, useState, type ReactNode } from 'react'
import { Bot, ChevronDown, Link2, Plus, Trash2, X } from 'lucide-react'
import type { DocumentIdentity } from '@quillarium/core'
import {
  derivedCardsForReference,
  validatePlanningCardGraph,
  type DocumentWithContent
} from '@quillarium/core/planning-cards'
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

export function PlanningCardSupportPanel({
  doc,
  docs,
  language,
  onSelect,
  onAIEdit
}: {
  doc: DocEntry
  docs: DocEntry[]
  language: LanguageName
  onSelect: (target: TargetSelection) => void
  onAIEdit: (doc: DocEntry) => void
}) {
  const zh = language === 'zh'
  const graphDocuments = docs.map((item) => ({
    path: item.path,
    data: item.data as unknown as DocumentIdentity,
    content: item.content
  })) satisfies Array<DocumentWithContent<DocumentIdentity>>
  const graphIssues = validatePlanningCardGraph(graphDocuments).filter(
    (issue) => issue.card_id === doc.data.id && issue.code !== 'self-relation'
  )
  const derived =
    doc.data.type === 'reference'
      ? derivedCardsForReference(String(doc.data.id), graphDocuments)
          .map((item) => docs.find((candidate) => candidate.data.id === item.data.id))
          .filter((item): item is DocEntry => Boolean(item))
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

  if (doc.data.type !== 'reference' && doc.data.type !== 'issue' && graphIssues.length === 0) return null

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
          {graphIssues.map((issue) => (
            <li key={`${issue.code}:${issue.target_id ?? ''}`}>
              {issue.code === 'isolated-card'
                ? zh
                  ? '当前没有材料来源、出向关系或入向关系。'
                  : 'No source, outgoing relation, or incoming relation.'
                : zh
                  ? `存在失效引用：${issue.target_id ?? issue.relation_field ?? ''}`
                  : `Broken link: ${issue.target_id ?? issue.relation_field ?? ''}`}
            </li>
          ))}
        </ul>
      )}
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
  onChange,
  onInspectTag,
  excludeKeys = [],
  documentType,
  language = 'zh'
}: {
  data: Record<string, unknown>
  docs?: DocEntry[]
  onChange: (data: Record<string, unknown>) => void
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
  const suggestions = collectTagSuggestions(docs)
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
                context={{
                  documentType: resolvedDocumentType,
                  documentId: String(data['id'] ?? '')
                }}
                language={language}
                docs={docs}
                suggestions={suggestions}
                onInspectTag={onInspectTag}
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
  context,
  language,
  docs,
  suggestions,
  onInspectTag,
  onChange
}: {
  name: string
  value: unknown
  context: FieldPresentationContext
  language: LanguageName
  docs: DocEntry[]
  suggestions: string[]
  onInspectTag?: (tag: string, displayValue?: string) => void
  onChange: (value: unknown) => void
}) {
  const options = enumOptionsForField(name, context)
  const presentation = fieldPresentation(name, language, context)
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
                  <select
                    value={condition.target_id}
                    onChange={(event) =>
                      onChange(
                        updateArrayItem(conditions, index, { ...condition, target_id: event.target.value })
                      )
                    }
                  >
                    <option value="">
                      {language === 'zh' ? '选择现有卡片…' : 'Choose an existing card…'}
                    </option>
                    {missing && (
                      <option value={condition.target_id} disabled>
                        {language === 'zh'
                          ? `未定义：${condition.target_id}`
                          : `Missing: ${condition.target_id}`}
                      </option>
                    )}
                    {choices
                      .slice()
                      .sort((left, right) => left.data.title.localeCompare(right.data.title))
                      .map((document) => (
                        <option key={document.data.id} value={document.data.id}>
                          {document.data.title} · {documentTypeLabel(document.data.type, language)}
                        </option>
                      ))}
                  </select>
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
  nullable,
  onChange
}: {
  name: string
  value: string
  docs: DocEntry[]
  language: LanguageName
  context: FieldPresentationContext
  nullable: boolean
  onChange: (value: unknown) => void
}) {
  const missing = value && !docs.some((document) => document.data.id === value)
  return (
    <label className="metadata-scalar-field document-link-field">
      <FieldCopy name={name} language={language} context={context} />
      <select value={value} onChange={(event) => onChange(event.target.value || (nullable ? null : ''))}>
        <option value="">{language === 'zh' ? '未选择' : 'Not selected'}</option>
        {missing && (
          <option value={value} disabled>
            {language === 'zh' ? `未定义：${value}` : `Missing: ${value}`}
          </option>
        )}
        {docs
          .slice()
          .sort((a, b) => a.data.title.localeCompare(b.data.title))
          .map((document) => (
            <option key={document.data.id} value={document.data.id}>
              {document.data.title} · {documentTypeLabel(document.data.type, language)}
            </option>
          ))}
      </select>
      {missing && (
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
  onChange
}: {
  name: string
  value: string[]
  docs: DocEntry[]
  language: LanguageName
  context: FieldPresentationContext
  onChange: (value: unknown) => void
}) {
  const [pending, setPending] = useState('')
  const byId = new Map(docs.map((document) => [document.data.id, document]))
  const available = docs.filter((document) => !value.includes(document.data.id))
  return (
    <div className="document-multi-field">
      <div className="metadata-field-label">
        <FieldCopy name={name} language={language} context={context} />
        <small className="metadata-field-count">{value.length}</small>
      </div>
      <div className="document-link-chips">
        {value.map((id) => {
          const document = byId.get(id)
          return (
            <span key={id} className={document ? 'document-link-chip' : 'document-link-chip missing'}>
              {document?.data.title ?? (language === 'zh' ? `未定义：${id}` : `Missing: ${id}`)}
              <button
                type="button"
                onClick={() => onChange(value.filter((candidate) => candidate !== id))}
                aria-label={
                  language === 'zh'
                    ? `移除 ${document?.data.title ?? id}`
                    : `Remove ${document?.data.title ?? id}`
                }
              >
                <X size={12} />
              </button>
            </span>
          )
        })}
      </div>
      <div className="document-link-add">
        <select value={pending} onChange={(event) => setPending(event.target.value)}>
          <option value="">{language === 'zh' ? '选择现有卡片…' : 'Choose an existing card…'}</option>
          {available
            .slice()
            .sort((a, b) => a.data.title.localeCompare(b.data.title))
            .map((document) => (
              <option key={document.data.id} value={document.data.id}>
                {document.data.title} · {documentTypeLabel(document.data.type, language)}
              </option>
            ))}
        </select>
        <button
          type="button"
          disabled={!pending}
          onClick={() => {
            if (!pending || value.includes(pending)) return
            onChange([...value, pending])
            setPending('')
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
            <select
              value={relation.target_id}
              aria-label={language === 'zh' ? '目标卡片' : 'Target card'}
              onChange={(event) =>
                onChange(updateArrayItem(relations, index, { ...relation, target_id: event.target.value }))
              }
            >
              <option value="">{language === 'zh' ? '选择现有卡片…' : 'Choose an existing card…'}</option>
              {missing && (
                <option value={relation.target_id} disabled>
                  {language === 'zh' ? `未定义：${relation.target_id}` : `Missing: ${relation.target_id}`}
                </option>
              )}
              {docs
                .filter((document) => document.data.id !== relation.target_id || !missing)
                .slice()
                .sort((a, b) => a.data.title.localeCompare(b.data.title))
                .map((document) => (
                  <option key={document.data.id} value={document.data.id}>
                    {document.data.title} · {documentTypeLabel(document.data.type, language)}
                  </option>
                ))}
            </select>
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
