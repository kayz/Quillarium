import { useState } from 'react'
import type { DocEntry, LanguageName } from '../../app/types.js'
import { t } from '../../app/i18n.js'

export function OutlineBoard({
  docs,
  onCreate,
  language
}: {
  docs: DocEntry[]
  onCreate: (kind: string, input: Record<string, unknown>) => Promise<unknown>
  language: LanguageName
}) {
  const outlines = docs
    .filter((doc) => doc.data.type === 'outline')
    .sort((a, b) => Number(a.data.order ?? 0) - Number(b.data.order ?? 0))
  const [title, setTitle] = useState('')
  const createSection = async () => {
    if (!title.trim()) return
    await onCreate('outline', {
      title,
      level: 'section',
      parent: outlines.at(-1)?.data.parent ?? null,
      order: outlines.length,
      target_words: 1000,
      chapter_hook: false,
      content: `## ${title}\n`
    })
    setTitle('')
  }
  return (
    <section className="module-view">
      <div className="module-head">
        <h2>{t(language, 'outline')}</h2>
        <div className="inline-create">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t(language, 'newSectionOutline')}
          />
          <button onClick={createSection}>{t(language, 'newSectionOutline')}</button>
        </div>
      </div>
      <div className="cards-grid">
        {outlines.map((outline) => (
          <article key={outline.data.id} className="info-card">
            <strong>{outline.data.title}</strong>
            <small>
              {String(outline.data.level)} · hook: {outline.data.chapter_hook ? 'yes' : 'no'}
            </small>
            <p>{outline.content.slice(0, 220)}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

export function BeatBoard({
  docs,
  onCreate,
  language
}: {
  docs: DocEntry[]
  onCreate: (kind: string, input: Record<string, unknown>) => Promise<unknown>
  language: LanguageName
}) {
  const sections = docs.filter((doc) => doc.data.type === 'outline' && doc.data.level === 'section')
  const firstTimeline = docs.find((doc) => doc.data.type === 'timeline_event')?.data.id
  const firstLocation = docs.find((doc) => doc.data.type === 'location')?.data.id
  const firstCharacter = docs.find((doc) => doc.data.type === 'character')?.data.id
  const createSceneFromSection = async (section: DocEntry) => {
    if (!firstTimeline || !firstLocation || !firstCharacter) return
    await onCreate('scene', {
      title: `${section.data.title} prose`,
      section: section.data.id,
      timeline_node: firstTimeline,
      location: firstLocation,
      pov: firstCharacter,
      characters: [firstCharacter],
      target_words: Number(section.data.target_words ?? 1000),
      chapter_hook: Boolean(section.data.chapter_hook),
      tags: ['volume-01', 'chapter-001'],
      content: '## Draft\n'
    })
  }
  return (
    <section className="module-view">
      <h2>{t(language, 'beats')}</h2>
      <div className="cards-grid">
        {sections.map((section) => (
          <article key={section.data.id} className="info-card beat-card">
            <strong>{section.data.title}</strong>
            <small>{section.data.chapter_hook ? 'chapter hook' : 'section beat'}</small>
            <p>{section.content.slice(0, 180)}</p>
            <button onClick={() => createSceneFromSection(section)}>{t(language, 'createScene')}</button>
          </article>
        ))}
      </div>
    </section>
  )
}
