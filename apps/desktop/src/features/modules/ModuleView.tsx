import { useEffect, useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import type { DocEntry, LanguageName, ModuleName, RunSummary, TargetSelection } from '../../app/types.js'
import { I18N, t } from '../../app/i18n.js'
import { docTitle } from '../../shared/outline.js'
import { enumChoiceLabel, fieldLabel } from '../metadata/field-presentation.js'
import { docTypeLabel } from '../outline/outline-model.js'
import { CanonWorkspace } from './CanonWorkspace.js'
import { IssueWorkspace } from './IssueWorkspace.js'
import { BoundedPager } from '../layout/BoundedPager.js'
import { boundedPage } from '../layout/bounded-page.js'

const MODULE_PAGE_SIZE = 30
const MODULE_TYPE_MAP: Record<string, string> = {
  canon: 'canon',
  world: 'world_entry',
  characters: 'character',
  timeline: 'timeline_event',
  foreshadowing: 'foreshadowing',
  issues: 'issue',
  references: 'reference',
  narrative: 'narrative',
  locations: 'location',
  runs: 'scene',
  write: 'scene',
  assistants: 'resource'
}

export function ModuleView({
  root,
  module,
  docs,
  runs,
  onCreate,
  onAIPlanningCreate,
  selectedTarget,
  onSelect,
  onOpenCard,
  onOpenAssistant,
  onReload,
  language
}: {
  root: string
  module: ModuleName
  docs: DocEntry[]
  runs: RunSummary[]
  onCreate: (kind: string, input: Record<string, unknown>) => Promise<unknown>
  onAIPlanningCreate: (module: ModuleName) => void
  selectedTarget: TargetSelection | null
  onSelect: (target: TargetSelection) => void
  onOpenCard?: (doc: DocEntry) => void
  onOpenAssistant?: (roleId: string, target: TargetSelection) => void
  onReload: () => Promise<void>
  language: LanguageName
}) {
  const [pageIndex, setPageIndex] = useState(0)
  const filtered = useMemo(
    () =>
      docs.filter((doc) =>
        module === 'narrative'
          ? ['narrative', 'strategy', 'pattern'].includes(doc.data.type)
          : doc.data.type === MODULE_TYPE_MAP[module]
      ),
    [docs, module]
  )
  const docPage = boundedPage(filtered, pageIndex, MODULE_PAGE_SIZE)
  const runPage = boundedPage(runs, pageIndex, MODULE_PAGE_SIZE)
  useEffect(() => {
    const selectedIndex =
      module !== 'runs' && selectedTarget
        ? filtered.findIndex(
            (document) => document.data.id === selectedTarget.id && document.data.type === selectedTarget.type
          )
        : -1
    setPageIndex(selectedIndex >= 0 ? Math.floor(selectedIndex / MODULE_PAGE_SIZE) : 0)
  }, [filtered, module, selectedTarget?.id, selectedTarget?.type])
  if (module === 'runs') {
    return (
      <section className="module-view">
        <h2>{t(language, 'runs')}</h2>
        <BoundedPager
          page={runPage.page}
          total={runPage.total}
          pageSize={runPage.pageSize}
          onPage={setPageIndex}
          language={language}
          label={language === 'zh' ? '运行记录分页' : 'Run pagination'}
        />
        <div className="cards-grid">
          {runPage.items.map((run) => (
            <article key={run.id} className="info-card">
              <strong>{run.id}</strong>
              <small>
                {language === 'zh' ? '所属节' : 'Scene'}：{run.scene_id}
              </small>
              <p>
                {enumChoiceLabel('run_status', run.status, language)} · {run.model} · {run.created_at}
              </p>
            </article>
          ))}
        </div>
        <BoundedPager
          page={runPage.page}
          total={runPage.total}
          pageSize={runPage.pageSize}
          onPage={setPageIndex}
          language={language}
          label={language === 'zh' ? '运行记录分页' : 'Run pagination'}
        />
      </section>
    )
  }
  if (module === 'canon') {
    return (
      <CanonWorkspace
        root={root}
        docs={docs.filter((doc) => doc.data.type === 'canon')}
        onCreate={onCreate}
        onReload={onReload}
        language={language}
      />
    )
  }
  if (module === 'issues') {
    return (
      <IssueWorkspace
        root={root}
        docs={docs}
        selectedTarget={selectedTarget}
        onSelect={onSelect}
        onOpenCard={onOpenCard}
        onReload={onReload}
        language={language}
      />
    )
  }
  return (
    <section className="module-view module-view-full">
      <ModuleCreateForm module={module} onCreate={onAIPlanningCreate} language={language} />
      <ModuleFilters module={module} docs={docs} language={language} />
      {module === 'characters' && selectedTarget?.type === 'character' && (
        <div className="assistant-card-shortcut">
          <span>
            {language === 'zh'
              ? '用当前人物、时段关系、地点和正设开始一段非正史试戏。'
              : 'Rehearse this character with current relationships, location, and Canon.'}
          </span>
          <button
            className="primary"
            type="button"
            onClick={() => onOpenAssistant?.('character-rehearsal', selectedTarget)}
          >
            {language === 'zh' ? '人物试戏' : 'Rehearse character'}
          </button>
        </div>
      )}
      <BoundedPager
        page={docPage.page}
        total={docPage.total}
        pageSize={docPage.pageSize}
        onPage={setPageIndex}
        language={language}
        label={language === 'zh' ? '资料卡分页' : 'Card pagination'}
      />
      <div className="cards-grid">
        {docPage.items.map((doc) => (
          <button
            type="button"
            key={doc.data.id}
            className={`info-card module-info-card ${doc.data.enabled === false ? 'disabled-card' : ''} ${selectedTarget?.id === doc.data.id ? 'active' : ''}`}
            onClick={() => {
              onSelect({ type: doc.data.type, id: doc.data.id })
              onOpenCard?.(doc)
            }}
          >
            <strong>{doc.data.title}</strong>
            {doc.data.type === 'reference' ? (
              <small>
                {docTypeLabel(doc, language)} ·{' '}
                {language === 'zh' ? '材料来源，不直接进入上下文' : 'Source material; excluded from context'}
              </small>
            ) : (
              <small>
                {docTypeLabel(doc, language)} ·{' '}
                {enumChoiceLabel('status', String(doc.data.status ?? 'draft'), language, {
                  documentType: String(doc.data.type)
                })}
                {doc.data.enabled === false ? (language === 'zh' ? ' · 未启用' : ' · Disabled') : ''}
              </small>
            )}
            {doc.data.type === 'canon' && (
              <small>
                {enumChoiceLabel('strength', String(doc.data.strength ?? 'hard'), language, {
                  documentType: 'canon'
                })}{' '}
                ·{' '}
                {enumChoiceLabel('source', String(doc.data.source ?? 'user'), language, {
                  documentType: 'canon'
                })}
              </small>
            )}
            {doc.data.type === 'timeline_event' && (
              <small>
                {fieldLabel('previous', language)}：{docTitle(docs, doc.data.previous) || t(language, 'none')}{' '}
                · {fieldLabel('next', language)}：{docTitle(docs, doc.data.next) || t(language, 'none')}
              </small>
            )}
            {doc.data.type === 'location' && (
              <RouteTable docs={docs} locationId={doc.data.id} language={language} />
            )}
            {doc.data.type === 'character' && (
              <small>
                {fieldLabel('speech_style', language)}：{String(doc.data.speech_style || t(language, 'none'))}{' '}
                · {fieldLabel('desire', language)}：{String(doc.data.desire || t(language, 'none'))}
              </small>
            )}
            {doc.data.type === 'pattern' && (
              <small>
                {enumChoiceLabel('kind', String(doc.data.kind ?? 'story'), language, {
                  documentType: 'pattern'
                })}{' '}
                ·{' '}
                {enumChoiceLabel('scope', String(doc.data.scope ?? 'project'), language, {
                  documentType: 'pattern'
                })}{' '}
                ·{' '}
                {enumChoiceLabel('source', String(doc.data.source ?? 'user'), language, {
                  documentType: 'pattern'
                })}
              </small>
            )}
            <p>{doc.content.slice(0, 180) || t(language, 'emptyBody')}</p>
          </button>
        ))}
      </div>
      <BoundedPager
        page={docPage.page}
        total={docPage.total}
        pageSize={docPage.pageSize}
        onPage={setPageIndex}
        language={language}
        label={language === 'zh' ? '资料卡分页' : 'Card pagination'}
      />
    </section>
  )
}

export function ModuleFilters({
  module,
  docs,
  language
}: {
  module: ModuleName
  docs: DocEntry[]
  language: LanguageName
}) {
  if (module !== 'canon') return null
  const statuses = [
    ...new Set(
      docs
        .filter((doc) => doc.data.type === 'canon')
        .map((doc) => doc.data.status)
        .filter((status): status is string => Boolean(status))
    )
  ]
  return (
    <div className="filter-row">
      <span>
        {t(language, 'status')}:{' '}
        {statuses.map((status) => enumChoiceLabel('status', status, language)).join(' / ') ||
          t(language, 'none')}
      </span>
      <span>
        {t(language, 'strength')}: {enumChoiceLabel('strength', 'hard', language)} /{' '}
        {enumChoiceLabel('strength', 'soft', language)}
      </span>
      <span>{t(language, 'searchHint')}</span>
    </div>
  )
}

export function RouteTable({
  docs,
  locationId,
  language
}: {
  docs: DocEntry[]
  locationId: string
  language: LanguageName
}) {
  const routes = docs.filter(
    (doc) => doc.data.type === 'route' && (doc.data.from === locationId || doc.data.to === locationId)
  )
  if (!routes.length) return <small>{language === 'zh' ? '暂无关联路线' : 'No related routes'}</small>
  return (
    <small>
      {language === 'zh' ? '关联路线' : 'Routes'}：
      {routes
        .map(
          (route) =>
            (docTitle(docs, route.data.from) || String(route.data.from)) +
            ' → ' +
            (docTitle(docs, route.data.to) || String(route.data.to))
        )
        .join('；')}
    </small>
  )
}

export function ModuleCreateForm({
  module,
  onCreate,
  language
}: {
  module: ModuleName
  onCreate: (module: ModuleName) => void
  language: LanguageName
}) {
  const enabled = !['write', 'canon', 'runs', 'assistants'].includes(module)
  return (
    <div className="module-head">
      <h2>{moduleTitle(module, language)}</h2>
      {enabled && (
        <button className="primary" type="button" onClick={() => onCreate(module)}>
          <Plus size={15} /> {language === 'zh' ? '与 AI 对话新增' : 'Create with AI'}
        </button>
      )}
    </div>
  )
}

export function moduleTitle(module: ModuleName, language: LanguageName): string {
  const map: Record<ModuleName, keyof typeof I18N.zh> = {
    write: 'writing',
    canon: 'canon',
    world: 'worldBook',
    characters: 'characters',
    timeline: 'timeline',
    foreshadowing: 'foreshadowing',
    issues: 'issues',
    references: 'references',
    narrative: 'narrative',
    locations: 'locations',
    runs: 'runs',
    assistants: 'creatorAssistants'
  }
  return t(language, map[module])
}
