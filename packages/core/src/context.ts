import { listDocs, requireDoc } from './documents.js'
import { loadProject } from './project.js'
import type { CanonDoc, CharacterDoc, LocationDoc, OutlineDoc, SceneDoc, TimelineEventDoc } from './types.js'

function section(title: string, body: string): string {
  return body.trim() ? `## ${title}\n\n${body.trim()}\n` : ''
}

export async function assembleContext(projectRoot: string, sceneId: string): Promise<string> {
  const project = await loadProject(projectRoot)
  const scene = await requireDoc<SceneDoc>(projectRoot, sceneId)
  const canon = await listDocs<CanonDoc>(projectRoot, 'canon')
  const timeline = await requireDoc<TimelineEventDoc>(projectRoot, scene.data.timeline_node)
  const location = await requireDoc<LocationDoc>(projectRoot, scene.data.location)
  const pov = await requireDoc<CharacterDoc>(projectRoot, scene.data.pov)
  const characters = await Promise.all(scene.data.characters.map(id => requireDoc<CharacterDoc>(projectRoot, id).catch(() => null)))
  const sectionOutline = await requireDoc<OutlineDoc>(projectRoot, scene.data.section).catch(() => null)
  const outlines = await collectOutlineChain(projectRoot, sectionOutline?.data.parent ?? null)
  const previousScene = scene.data.previous_scene
    ? await requireDoc<SceneDoc>(projectRoot, scene.data.previous_scene).catch(() => null)
    : null

  const activeCanon = canon
    .filter(item => item.data.status !== 'deprecated')
    .map(item => `### ${item.data.title}\n\n- strength: ${item.data.strength}\n- source: ${item.data.source}\n\n${item.content.trim()}`)
    .join('\n\n')

  const outlineText = [
    ...outlines.reverse().map(o => `### ${o.data.level}: ${o.data.title}\n\n${o.content.trim()}`),
    sectionOutline ? `### section: ${sectionOutline.data.title}\n\n${sectionOutline.content.trim()}` : ''
  ].filter(Boolean).join('\n\n')

  const characterText = [pov, ...characters.filter(Boolean)]
    .map(char => {
      const data = char!.data
      return `### ${data.title}\n\nrole: ${data.role}\nspeech_style: ${data.speech_style}\ndesire: ${data.desire}\nfear: ${data.fear}\nbottom_line: ${data.bottom_line}\nooc_guardrails:\n${data.ooc_guardrails.map(x => `- ${x}`).join('\n')}\n\n${char!.content.trim()}`
    })
    .join('\n\n')

  return [
    `# Quillarium Context: ${scene.data.title}`,
    section('Project', `title: ${project.title}\ngenre: ${project.genre}\ntarget_words: ${project.target_words}\nsection_words: ${project.section_words}`),
    section('Canon', activeCanon),
    section('Outlines', outlineText),
    section('Timeline', `id: ${timeline.data.id}\ndate: ${timeline.data.date}\nduration: ${timeline.data.duration}\nlocation: ${timeline.data.location}\n\n${timeline.content.trim()}`),
    section('Location', `id: ${location.data.id}\ntitle: ${location.data.title}\nparent: ${location.data.parent_location}\ndescription: ${location.data.description}\n\n${location.content.trim()}`),
    section('Characters', characterText),
    section('Previous Section Ending', previousScene ? previousScene.content.trim().slice(-1000) : ''),
    section('Generation Target', `scene_id: ${scene.data.id}\ntarget_words: ${scene.data.target_words}\nchapter_hook: ${scene.data.chapter_hook}\npov: ${pov.data.title}`)
  ].filter(Boolean).join('\n\n')
}

async function collectOutlineChain(projectRoot: string, parentId: string | null): Promise<Array<{ data: OutlineDoc; content: string }>> {
  const out: Array<{ data: OutlineDoc; content: string }> = []
  let current = parentId
  while (current) {
    const doc = await requireDoc<OutlineDoc>(projectRoot, current).catch(() => null)
    if (!doc) break
    out.push({ data: doc.data, content: doc.content })
    current = doc.data.parent
  }
  return out
}
