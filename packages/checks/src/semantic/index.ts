import { readFile } from 'node:fs/promises'
import {
  listDocs,
  requireDoc,
  type CanonDoc,
  type CharacterDoc,
  type CharacterStateDoc,
  type SceneDoc
} from '@quillarium/core'
import { z } from 'zod'
import type { CheckIssue } from '../index.js'

export type SemanticCheckKind = 'ooc' | 'state-drift' | 'canon-conflict'
export type SemanticAIInvoke = (prompt: string) => Promise<string>

export const SEMANTIC_CHECK_TIMEOUT_MS = 30_000

const MAX_SCENE_CHARS = 12_000
const MAX_DOC_CHARS = 2_000
const MAX_CHARACTERS = 12
const MAX_CANON = 20
const MAX_LIST_ITEMS = 20

const PROMPT_FILES: Record<SemanticCheckKind, string> = {
  ooc: 'ooc.md',
  'state-drift': 'state-drift.md',
  'canon-conflict': 'canon-conflict.md'
}

const FALLBACK_PROMPTS: Record<SemanticCheckKind, string> = {
  ooc: [
    'You are the Quillarium OOC consistency checker.',
    'Use only the bounded scene, character profiles, and recent states supplied below.',
    'Return JSON only: {"issues":[{"severity":"error|warning|info","message":"finding","evidence":"optional","related_ids":[]}]}'
  ].join('\n'),
  'state-drift': [
    'You are the Quillarium character-state drift checker.',
    'Report only unexplained state changes supported by the bounded input below.',
    'Return JSON only: {"issues":[{"severity":"error|warning|info","message":"finding","evidence":"optional","related_ids":[]}]}'
  ].join('\n'),
  'canon-conflict': [
    'You are the Quillarium Canon conflict checker.',
    'Report only direct contradictions with the bounded Canon candidates below.',
    'Return JSON only: {"issues":[{"severity":"error|warning|info","message":"finding","evidence":"optional","related_ids":[]}]}'
  ].join('\n')
}

const findingSchema = z.object({
  severity: z.enum(['error', 'warning', 'info']).default('warning'),
  message: z.string().trim().min(1),
  evidence: z.string().trim().optional(),
  related_ids: z.array(z.string()).default([])
})

const semanticResponseSchema = z.object({
  issues: z.array(findingSchema).default([])
})

const CHECK_CODE: Record<SemanticCheckKind, string> = {
  ooc: 'semantic-ooc',
  'state-drift': 'semantic-state-drift',
  'canon-conflict': 'semantic-canon-conflict'
}

const CHECK_LABEL: Record<SemanticCheckKind, string> = {
  ooc: 'OOC',
  'state-drift': 'state drift',
  'canon-conflict': 'Canon conflict'
}

interface BoundedSemanticInput {
  scene: {
    id: string
    title: string
    section: string
    timeline_node: string
    location: string
    pov: string
    content: string
  }
  characters: Array<{
    id: string
    title: string
    role: string
    speech_style: string
    desire: string
    fear: string
    bottom_line: string
    ooc_guardrails: string[]
    scene_state: CharacterDoc['scene_state']
    recent_state: null | {
      id: string
      scope_type: CharacterStateDoc['scope_type']
      scope_id: string
      timeline_node: string | null
      motivation: string
      emotion: string
      knowledge: string[]
      relationship_delta: Record<string, string>
      public_disclosure: string[]
      notes: string
    }
  }>
  canon: Array<{
    id: string
    title: string
    strength: CanonDoc['strength']
    tags: string[]
    content: string
  }>
}

export async function loadSemanticPromptTemplate(
  kind: SemanticCheckKind,
  promptUrl = new URL(`./prompts/${PROMPT_FILES[kind]}`, import.meta.url)
): Promise<string> {
  try {
    return (await readFile(promptUrl, 'utf8')).trim()
  } catch {
    return FALLBACK_PROMPTS[kind]
  }
}

export async function runSemanticChecks(
  projectRoot: string,
  sceneId: string,
  aiInvoke: SemanticAIInvoke
): Promise<CheckIssue[]> {
  try {
    const input = await buildBoundedInput(projectRoot, sceneId)
    const kinds: SemanticCheckKind[] = ['ooc', 'state-drift', 'canon-conflict']
    const prompts = await Promise.all(
      kinds.map(async (kind) => buildPrompt(kind, await loadSemanticPromptTemplate(kind), input))
    )
    const results = await Promise.all(
      kinds.map((kind, index) => runOneSemanticCheck(kind, prompts[index], aiInvoke))
    )
    return results.flat()
  } catch (error) {
    return [unavailableIssue('input preparation', error)]
  }
}

export function semanticStatusFromIssues(issues: CheckIssue[]): 'completed' | 'partial' | 'unavailable' {
  const failures = issues.filter(
    (issue) => issue.code === 'semantic-check-unavailable' || issue.code === 'semantic-check-unparseable'
  ).length
  if (failures === 0) return 'completed'
  return failures >= 3 ? 'unavailable' : 'partial'
}

async function buildBoundedInput(projectRoot: string, sceneId: string): Promise<BoundedSemanticInput> {
  const scene = await requireDoc<SceneDoc>(projectRoot, sceneId)
  const [characters, states, canon] = await Promise.all([
    listDocs<CharacterDoc>(projectRoot, 'character'),
    listDocs<CharacterStateDoc>(projectRoot, 'character_state'),
    listDocs<CanonDoc>(projectRoot, 'canon')
  ])
  const characterIds = unique([scene.data.pov, ...scene.data.characters]).slice(0, MAX_CHARACTERS)
  const byCharacterId = new Map(characters.map((item) => [item.data.id, item]))
  const selectedCharacters = characterIds.flatMap((id) => {
    const character = byCharacterId.get(id)
    if (!character) return []
    const recent = mostRelevantState(states, id, scene.data)
    return [
      {
        id: character.data.id,
        title: character.data.title,
        role: clip(character.data.role),
        speech_style: clip(character.data.speech_style),
        desire: clip(character.data.desire),
        fear: clip(character.data.fear),
        bottom_line: clip(character.data.bottom_line),
        ooc_guardrails: character.data.ooc_guardrails.slice(0, MAX_LIST_ITEMS).map(clip),
        scene_state: boundedSceneState(character.data.scene_state),
        recent_state: recent
          ? {
              id: recent.data.id,
              scope_type: recent.data.scope_type,
              scope_id: recent.data.scope_id,
              timeline_node: recent.data.timeline_node,
              motivation: clip(recent.data.motivation),
              emotion: clip(recent.data.emotion),
              knowledge: recent.data.knowledge.slice(0, MAX_LIST_ITEMS).map(clip),
              relationship_delta: boundedRecord(recent.data.relationship_delta),
              public_disclosure: recent.data.public_disclosure.slice(0, MAX_LIST_ITEMS).map(clip),
              notes: clip(recent.data.notes)
            }
          : null
      }
    ]
  })
  const focusTokens = tokensFrom(
    [scene.data.title, scene.content, ...selectedCharacters.map((item) => item.title)].join('\n')
  )
  const selectedCanon = canon
    .filter((item) => item.data.status !== 'deprecated')
    .map((item) => ({ item, score: relevanceScore(item, focusTokens) }))
    .sort((a, b) => b.score - a.score || a.item.data.id.localeCompare(b.item.data.id))
    .slice(0, MAX_CANON)
    .map(({ item }) => ({
      id: item.data.id,
      title: item.data.title,
      strength: item.data.strength,
      tags: item.data.tags.slice(0, MAX_LIST_ITEMS).map(clip),
      content: clip(item.content)
    }))

  return {
    scene: {
      id: scene.data.id,
      title: scene.data.title,
      section: scene.data.section,
      timeline_node: scene.data.timeline_node,
      location: scene.data.location,
      pov: scene.data.pov,
      content: clip(scene.content, MAX_SCENE_CHARS)
    },
    characters: selectedCharacters,
    canon: selectedCanon
  }
}

function mostRelevantState(
  states: Awaited<ReturnType<typeof listDocs<CharacterStateDoc>>>,
  characterId: string,
  scene: SceneDoc
) {
  return states
    .filter((item) => item.data.character === characterId)
    .map((item) => ({ item, score: stateScore(item.data, scene) }))
    .sort((a, b) => b.score - a.score || a.item.data.id.localeCompare(b.item.data.id))[0]?.item
}

function stateScore(state: CharacterStateDoc, scene: SceneDoc): number {
  if (state.scope_type === 'scene' && state.scope_id === scene.id) return 4
  if (state.timeline_node && state.timeline_node === scene.timeline_node) return 3
  if (state.scope_id === scene.section) return 2
  return 1
}

function boundedSceneState(state: CharacterDoc['scene_state']): CharacterDoc['scene_state'] {
  return {
    current_location: state.current_location ? clip(state.current_location) : undefined,
    outfit_layers: state.outfit_layers?.slice(0, MAX_LIST_ITEMS).map(clip),
    wounds: state.wounds?.slice(0, MAX_LIST_ITEMS).map(clip),
    carried_items: state.carried_items?.slice(0, MAX_LIST_ITEMS).map(clip),
    known_facts: state.known_facts?.slice(0, MAX_LIST_ITEMS).map(clip),
    emotional_state: state.emotional_state ? clip(state.emotional_state) : undefined
  }
}

function boundedRecord(value: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(value)
      .slice(0, MAX_LIST_ITEMS)
      .map(([key, item]) => [clip(key), clip(item)])
  )
}

function relevanceScore(canon: { data: CanonDoc; content: string }, focusTokens: string[]): number {
  const haystack = [canon.data.id, canon.data.title, ...canon.data.tags, canon.content]
    .join('\n')
    .toLocaleLowerCase()
  return focusTokens.reduce((score, token) => score + (haystack.includes(token) ? 1 : 0), 0)
}

function tokensFrom(value: string): string[] {
  return unique(
    value
      .toLocaleLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2)
  ).slice(0, 80)
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))]
}

function clip(value: string, limit = MAX_DOC_CHARS): string {
  return value.length <= limit ? value : `${value.slice(0, limit)}…`
}

function buildPrompt(kind: SemanticCheckKind, template: string, input: BoundedSemanticInput): string {
  const payload =
    kind === 'canon-conflict'
      ? { scene: input.scene, canon: input.canon }
      : { scene: input.scene, characters: input.characters }
  return `${template}\n\nCHECK_KIND: ${kind}\nINPUT_JSON:\n${JSON.stringify(payload, null, 2)}`
}

async function runOneSemanticCheck(
  kind: SemanticCheckKind,
  prompt: string,
  aiInvoke: SemanticAIInvoke
): Promise<CheckIssue[]> {
  try {
    const raw = await invokeWithTimeout(prompt, aiInvoke)
    const parsed = parseSemanticResponse(raw)
    if (!parsed.success) {
      return [
        {
          severity: 'info',
          code: 'semantic-check-unparseable',
          message: `${CHECK_LABEL[kind]} semantic check returned unparseable structured output: ${parsed.reason}`
        }
      ]
    }
    return parsed.data.issues.map((finding) => ({
      severity: finding.severity,
      code: CHECK_CODE[kind],
      message: finding.message,
      ...(finding.evidence ? { evidence: finding.evidence } : {}),
      ...(finding.related_ids.length ? { related_ids: finding.related_ids } : {})
    }))
  } catch (error) {
    return [unavailableIssue(CHECK_LABEL[kind], error)]
  }
}

function parseSemanticResponse(
  raw: string
): { success: true; data: z.infer<typeof semanticResponseSchema> } | { success: false; reason: string } {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = (fenced?.[1] ?? raw).trim()
  let value: unknown
  try {
    value = JSON.parse(candidate)
  } catch (error) {
    return { success: false, reason: errorMessage(error) }
  }
  const result = semanticResponseSchema.safeParse(value)
  if (!result.success) {
    return {
      success: false,
      reason: result.error.issues
        .map((issue) => `${issue.path.join('.') || 'response'}: ${issue.message}`)
        .join('; ')
    }
  }
  return { success: true, data: result.data }
}

async function invokeWithTimeout(prompt: string, aiInvoke: SemanticAIInvoke): Promise<string> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      Promise.resolve().then(() => aiInvoke(prompt)),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`timed out after ${SEMANTIC_CHECK_TIMEOUT_MS}ms`)),
          SEMANTIC_CHECK_TIMEOUT_MS
        )
      })
    ])
  } finally {
    if (timeout !== undefined) clearTimeout(timeout)
  }
}

function unavailableIssue(label: string, error: unknown): CheckIssue {
  return {
    severity: 'info',
    code: 'semantic-check-unavailable',
    message: `${label} semantic check unavailable: ${errorMessage(error)}`
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
