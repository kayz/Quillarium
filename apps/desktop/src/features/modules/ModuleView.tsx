import { Plus } from 'lucide-react'
import type { DocEntry, LanguageName, ModuleName, RunSummary, TargetSelection } from '../../app/types.js'
import { I18N, t } from '../../app/i18n.js'
import { CanonWorkspace } from './CanonWorkspace.js'

export function ModuleView({
  root,
  module,
  docs,
  runs,
  onCreate,
  onAIPlanningCreate,
  selectedTarget,
  onSelect,
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
  onReload: () => Promise<void>
  language: LanguageName
}) {
  const map: Record<string, string> = {
    canon: 'canon',
    world: 'world_entry',
    characters: 'character',
    timeline: 'timeline_event',
    foreshadowing: 'foreshadowing',
    issues: 'issue',
    references: 'reference',
    strategy: 'strategy',
    patterns: 'pattern',
    locations: 'location',
    runs: 'scene',
    write: 'scene'
  }
  const filtered = docs.filter((doc) => doc.data.type === map[module])
  if (module === 'runs') {
    return (
      <section className="module-view">
        <h2>{t(language, 'runs')}</h2>
        <div className="cards-grid">
          {runs.map((run) => (
            <article key={run.id} className="info-card">
              <strong>{run.id}</strong>
              <small>{run.scene_id}</small>
              <p>
                {run.status} · {run.model} · {run.created_at}
              </p>
            </article>
          ))}
        </div>
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
  return (
    <section className="module-view module-view-full">
      <ModuleCreateForm module={module} onCreate={onAIPlanningCreate} language={language} />
      <ModuleFilters module={module} docs={docs} language={language} />
      <div className="cards-grid">
        {filtered.map((doc) => (
          <button
            type="button"
            key={doc.data.id}
            className={`info-card module-info-card ${selectedTarget?.id === doc.data.id ? 'active' : ''}`}
            onClick={() => onSelect({ type: doc.data.type, id: doc.data.id })}
          >
            <strong>{doc.data.title}</strong>
            <small>
              {doc.data.status} · {doc.data.id}
            </small>
            {doc.data.type === 'canon' && (
              <small>
                {String(doc.data.strength ?? '')} · {String(doc.data.source ?? '')}
              </small>
            )}
            {doc.data.type === 'timeline_event' && (
              <small>
                previous: {String(doc.data.previous ?? 'none')} · next: {String(doc.data.next ?? 'none')}
              </small>
            )}
            {doc.data.type === 'location' && <RouteTable docs={docs} locationId={doc.data.id} />}
            {doc.data.type === 'character' && (
              <small>
                {String(doc.data.speech_style ?? 'no speech style')} ·{' '}
                {String(doc.data.desire ?? 'no desire')}
              </small>
            )}
            {doc.data.type === 'pattern' && (
              <small>
                {String(doc.data.kind ?? 'story')} · {String(doc.data.scope ?? 'project')} ·{' '}
                {String(doc.data.source ?? 'user')}
              </small>
            )}
            <p>{doc.content.slice(0, 180) || t(language, 'emptyBody')}</p>
          </button>
        ))}
      </div>
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
  const statuses = [...new Set(docs.filter((doc) => doc.data.type === 'canon').map((doc) => doc.data.status))]
  return (
    <div className="filter-row">
      <span>
        {t(language, 'status')}: {statuses.join(' / ') || t(language, 'none')}
      </span>
      <span>{t(language, 'strength')}: hard / soft</span>
      <span>{t(language, 'searchHint')}</span>
    </div>
  )
}

export function RouteTable({ docs, locationId }: { docs: DocEntry[]; locationId: string }) {
  const routes = docs.filter(
    (doc) => doc.data.type === 'route' && (doc.data.from === locationId || doc.data.to === locationId)
  )
  if (!routes.length) return <small>routes: none</small>
  return (
    <small>
      routes: {routes.map((route) => `${String(route.data.from)} -> ${String(route.data.to)}`).join('; ')}
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
  const enabled = !['write', 'canon', 'runs'].includes(module)
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
    strategy: 'strategy',
    patterns: 'patterns',
    locations: 'locations',
    runs: 'runs'
  }
  return t(language, map[module])
}
