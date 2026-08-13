import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@quillarium/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@quillarium/core')>()
  return {
    ...actual,
    setObsidianDir: async (dir: string) => ({ obsidianDir: dir })
  }
})

import {
  createCanon,
  createOutline,
  createScene,
  createWorldEntry,
  listDocs,
  listRuns,
  pathExists,
  readRunFile,
  type CanonDoc,
  type CharacterDoc,
  type ForeshadowingDoc,
  type IssueDoc,
  type OutlineDoc,
  type SceneDoc,
  type StrategyDoc,
  type TimelineEventDoc,
  type WorldEntryDoc
} from '@quillarium/core'
import { buildProgram } from './index.js'

const temporaryVaults: string[] = []
let output: string[]
let errors: string[]
let projectSequence = 0

beforeEach(() => {
  output = []
  errors = []
  vi.spyOn(console, 'log').mockImplementation((...values: unknown[]) => {
    output.push(values.map(String).join(' '))
  })
  vi.spyOn(console, 'error').mockImplementation((...values: unknown[]) => {
    errors.push(values.map(String).join(' '))
  })
})

afterEach(async () => {
  const { rm } = await import('node:fs/promises')
  const roots = temporaryVaults.splice(0)
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })))
  for (const root of roots) expect(await pathExists(root)).toBe(false)
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

async function run(...args: string[]): Promise<void> {
  const program = buildProgram()
  program.exitOverride()
  await program.parseAsync(args, { from: 'user' })
}

async function initProject(): Promise<{ vault: string; root: string }> {
  const { mkdtemp } = await import('node:fs/promises')
  const os = await import('node:os')
  const vault = await mkdtemp(path.join(os.tmpdir(), 'quillarium-cli-'))
  const title = `Smoke Novel ${++projectSequence}`
  temporaryVaults.push(vault)
  await run(
    'init',
    title,
    '--vault',
    vault,
    '--genre',
    'mystery',
    '--target-words',
    '50000',
    '--chapter-words',
    '2500',
    '--section-words',
    '800',
    '--default-theme',
    'ink'
  )
  return { vault, root: path.join(vault, 'novels', title) }
}

async function initWorkspaceProject(): Promise<{ workspace: string; root: string; id: string }> {
  const { mkdtemp, mkdir } = await import('node:fs/promises')
  const os = await import('node:os')
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'quillarium-cli-workspace-'))
  const id = `workspace-novel-${++projectSequence}`
  temporaryVaults.push(workspace)
  vi.stubEnv('QUILL_CONFIG_DIR', path.join(workspace, '.test-config'))
  await mkdir(path.join(workspace, 'projects'), { recursive: true })
  await writeFile(
    path.join(workspace, 'quillarium-workspace.yaml'),
    [
      'schema_version: 1',
      'id: sample-workspace',
      'projects_dir: projects',
      'projects: []',
      'shared_guidance: []',
      ''
    ].join('\n'),
    'utf8'
  )
  await run('config', 'set-workspace', workspace)
  await run('init', 'Workspace Novel', '--id', id, '--genre', 'mystery')
  return { workspace, root: path.join(workspace, 'projects', id), id }
}

async function seedScene(root: string): Promise<{
  sceneId: string
  sectionId: string
  eventId: string
  locationId: string
  characterId: string
}> {
  const suffix = String(projectSequence)
  await run('character', 'add', `Hero ${suffix}`, '--role', 'protagonist', '--project', root)
  await run('location', 'add', `Hall ${suffix}`, '--project', root)
  await run('timeline', 'append', `Opening ${suffix}`, '--date', '1449-08', '--project', root)
  const bookId = `book-opening-${suffix}`
  const volumeId = `volume-opening-${suffix}`
  const partId = `part-opening-${suffix}`
  await createOutline(root, 'book', `Opening Book ${suffix}`, { id: bookId })
  await createOutline(root, 'volume', `Opening Volume ${suffix}`, {
    id: volumeId,
    parent: bookId
  })
  await createOutline(root, 'part', `Opening Part ${suffix}`, {
    id: partId,
    parent: volumeId
  })
  await run('outline', 'add', 'chapter', `Opening Chapter ${suffix}`, '--parent', partId, '--project', root)

  const [character] = await listDocs<CharacterDoc>(root, 'character')
  const [location] = await listDocs(root, 'location')
  const [event] = await listDocs<TimelineEventDoc>(root, 'timeline_event')
  const section = (await listDocs<OutlineDoc>(root, 'outline')).find((item) => item.data.level === 'chapter')!

  await run(
    'scene',
    'create',
    `Opening Scene ${suffix}`,
    '--section',
    section.data.id,
    '--timeline',
    event.data.id,
    '--location',
    location.data.id,
    '--pov',
    character.data.id,
    '--characters',
    character.data.id,
    '--project',
    root
  )
  const [createdScene] = await listDocs<SceneDoc>(root, 'scene')
  return {
    sceneId: createdScene.data.id,
    sectionId: section.data.id,
    eventId: event.data.id,
    locationId: location.data.id,
    characterId: character.data.id
  }
}

async function seedExportProject(root: string): Promise<{ volumeOneId: string; volumeTwoId: string }> {
  const bookId = 'book-export'
  const volumeOneId = 'volume-export-one'
  const volumeTwoId = 'volume-export-two'
  const partOneId = 'part-export-one'
  const partTwoId = 'part-export-two'
  await createOutline(root, 'book', 'Export Book', { id: bookId })
  await createOutline(root, 'volume', 'Volume One', {
    id: volumeOneId,
    parent: bookId,
    order: 0
  })
  await createOutline(root, 'part', 'Part One', {
    id: partOneId,
    parent: volumeOneId
  })
  await createOutline(root, 'chapter', 'Chapter One', {
    id: 'chapter-export-one',
    parent: partOneId
  })
  await createOutline(root, 'volume', 'Volume Two', {
    id: volumeTwoId,
    parent: bookId,
    order: 1
  })
  await createOutline(root, 'part', 'Part Two', {
    id: partTwoId,
    parent: volumeTwoId
  })
  await createOutline(root, 'chapter', 'Chapter Two', {
    id: 'chapter-export-two',
    parent: partTwoId
  })
  await createScene(
    root,
    'Accepted Scene One',
    {
      id: 'scene-export-one',
      status: 'final',
      section: 'chapter-export-one',
      volume: volumeOneId,
      timeline_node: 'timeline-export',
      location: 'location-export',
      pov: 'character-export',
      tags: [volumeOneId]
    },
    '**Volume one accepted prose.**\n\nSecond paragraph.'
  )
  await createScene(
    root,
    'Unaccepted Scene',
    {
      id: 'scene-export-gap',
      section: 'chapter-export-one',
      volume: volumeOneId,
      timeline_node: 'timeline-export',
      location: 'location-export',
      pov: 'character-export',
      tags: [volumeOneId]
    },
    'DRAFT MUST NOT LEAK'
  )
  await createScene(
    root,
    'Accepted Scene Two',
    {
      id: 'scene-export-two',
      status: 'final',
      section: 'chapter-export-two',
      volume: volumeTwoId,
      timeline_node: 'timeline-export',
      location: 'location-export',
      pov: 'character-export',
      tags: [volumeTwoId]
    },
    '_Volume two accepted prose._'
  )
  return { volumeOneId, volumeTwoId }
}

function configureSemanticAI(): void {
  vi.stubEnv('QUILL_AI_PROVIDER', 'deepseek')
  vi.stubEnv('QUILL_AI_BASE_URL', 'https://semantic.test/v1')
  vi.stubEnv('QUILL_AI_API_KEY', 'semantic-test-key')
  vi.stubEnv('QUILL_AI_MODEL', 'semantic-test-model')
}

function stubSemanticFetch() {
  const findings = {
    ooc: {
      severity: 'error',
      message: 'The hero acts outside established guardrails.',
      evidence: 'The hero abandons the hall.',
      related_ids: ['character-main']
    },
    'state-drift': {
      severity: 'warning',
      message: 'The emotional transition is unexplained.',
      evidence: 'The scene changes from calm to panic.',
      related_ids: ['state-main']
    },
    'canon-conflict': {
      severity: 'info',
      message: 'The scene conflicts with an active Canon rule.',
      evidence: 'The sealed gate opens.',
      related_ids: ['canon-main']
    }
  } as const
  const fetchMock = vi.fn(async (...args: Parameters<typeof fetch>): Promise<Response> => {
    const body = JSON.parse(String(args[1]?.body)) as {
      messages: Array<{ content: string }>
    }
    const prompt = body.messages.at(-1)?.content ?? ''
    const kind = prompt.match(/CHECK_KIND: ([^\n]+)/)?.[1] as keyof typeof findings | undefined
    if (!kind || !(kind in findings)) throw new Error(`Unexpected semantic prompt: ${kind}`)
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ issues: [findings[kind]] }) } }]
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function cliCharacterCard(name = 'CLI Card Hero') {
  return {
    spec: 'chara_card_v2',
    spec_version: '2.0',
    data: {
      name,
      description: 'A CLI-imported harbor guide.',
      personality: 'Direct and observant.',
      scenario: 'A storm closes the harbor.',
      first_mes: 'Follow the blue lanterns.',
      mes_example: '{{char}}: Stay off the eastern pier.',
      creator_notes: 'CLI fixture.',
      system_prompt: '',
      post_history_instructions: '',
      alternate_greetings: [],
      tags: ['harbor-guide'],
      creator: 'cli-test',
      character_version: '1.2',
      extensions: { cli_fixture: true }
    }
  }
}

describe('CLI smoke flow', () => {
  it('builds a fresh Commander program without parsing on import', () => {
    const first = buildProgram()
    const second = buildProgram()

    expect(first).not.toBe(second)
    expect(first.name()).toBe('quill')
    expect(first.commands.map((command) => command.name())).toContain('init')
    expect(process.exitCode).not.toBe(1)
  })

  it('marks every mandatory scene option as required in help', () => {
    const scene = buildProgram().commands.find((command) => command.name() === 'scene')
    const create = scene?.commands.find((command) => command.name() === 'create')
    const help = create?.helpInformation() ?? ''

    for (const option of ['--section <id>', '--timeline <id>', '--location <id>', '--pov <id>']) {
      expect(help).toContain(option)
    }
    expect(help.match(/Required/g)).toHaveLength(4)
  })

  it('uses neutral author terminology in public import and finalize help', () => {
    const program = buildProgram()
    const importCommand = program.commands.find((command) => command.name() === 'import')
    const markdown = importCommand?.commands.find((command) => command.name() === 'markdown')
    const importAnswer = importCommand?.commands.find((command) => command.name() === 'answer')
    const finalize = program.commands.find((command) => command.name() === 'finalize')
    const finalizeConfirm = finalize?.commands.find((command) => command.name() === 'confirm')
    const help = [
      markdown?.helpInformation() ?? '',
      importAnswer?.helpInformation() ?? '',
      finalizeConfirm?.helpInformation() ?? ''
    ].join('\n')

    expect(help).toContain('structured Chinese fields')
    expect(help.match(/Author answer/g)).toHaveLength(2)
    expect(help).not.toMatch(/Writer/)
  })

  it('keeps explicit legacy-vault creation available without making it the default', async () => {
    const { root } = await initProject()
    const config = await readFile(path.join(root, 'project.yaml'), 'utf8')

    expect(await pathExists(path.join(root, 'project.yaml'))).toBe(true)
    expect(await pathExists(path.join(root, 'prompts', 'prose-scene-draft.md'))).toBe(true)
    expect(config).toContain('genre: mystery')
    expect(config).toContain('target_words: 50000')
    expect(config).toContain('default_theme: ink')
    expect(output.at(-1)).toBe(`Created legacy project: ${root}`)
  })

  it('initializes and registers a direct project-vault in the configured workspace by default', async () => {
    const { workspace, root, id } = await initWorkspaceProject()
    const config = await readFile(path.join(root, 'project.yaml'), 'utf8')
    const manifest = await readFile(path.join(workspace, 'quillarium-workspace.yaml'), 'utf8')

    expect(config).toContain('schema_version: 2')
    expect(config).toContain(`id: ${id}`)
    expect(await pathExists(path.join(root, '.obsidian'))).toBe(true)
    expect(manifest).toContain(`id: ${id}`)
    expect(manifest).toContain(`path: projects/${id}`)
    expect(output.at(-1)).toBe(`Created project: ${root}`)
  })

  it('adds and lists Canon', async () => {
    const { root } = await initProject()
    await run(
      'canon',
      'add',
      'Core Rule',
      '--content',
      'Every victory has a cost.',
      '--strength',
      'soft',
      '--source',
      'imported',
      '--project',
      root
    )

    const [canon] = await listDocs<CanonDoc>(root, 'canon')
    output = []
    await run('canon', 'list', '--project', root)

    expect(canon.data).toMatchObject({ title: 'Core Rule', strength: 'soft', source: 'imported' })
    expect(canon.content).toContain('Every victory has a cost.')
    expect(output.join('\n')).toContain(`${canon.data.id}\tCore Rule\tconfirmed`)
  })

  it('creates substantive world entries and first-class writing strategies', async () => {
    const { root } = await initProject()

    await run(
      'world',
      'add',
      'Blue Registry',
      '--trigger',
      'registry',
      'ledger',
      '--role',
      'constraint',
      '--content',
      'The blue registry may only be opened before the first bell.',
      '--project',
      root
    )
    await run(
      'strategy',
      'add',
      'Archive Suspense',
      '--category',
      'pacing',
      '--scope',
      'volume-01',
      '--principle',
      'Reveal one ledger clue per chapter',
      '--avoid',
      'Exposition without a decision',
      '--content',
      'Keep every reveal attached to a character choice.',
      '--project',
      root
    )

    const [world] = await listDocs<WorldEntryDoc>(root, 'world_entry')
    const [strategy] = await listDocs<StrategyDoc>(root, 'strategy')
    expect(world.data).toMatchObject({
      title: 'Blue Registry',
      triggers: ['registry', 'ledger'],
      role: 'constraint',
      entry_status: 'active'
    })
    expect(world.content).toContain('only be opened before the first bell')
    expect(strategy.data).toMatchObject({
      title: 'Archive Suspense',
      category: 'pacing',
      scope: 'volume-01',
      principles: ['Reveal one ledger clue per chapter'],
      avoid: ['Exposition without a decision']
    })
    expect(strategy.content).toContain('attached to a character choice')

    output = []
    await run('strategy', 'list', '--project', root)
    expect(output.join('\n')).toContain(`${strategy.data.id}\tArchive Suspense\tactive`)
  })

  it('adds a character with writing constraints', async () => {
    const { root } = await initProject()
    await run(
      'character',
      'add',
      'Lin',
      '--role',
      'protagonist',
      '--speech-style',
      'Terse',
      '--desire',
      'Protect the city',
      '--fear',
      'Failure',
      '--bottom-line',
      'No civilian sacrifices',
      '--ooc',
      'Never boasts',
      'Never abandons allies',
      '--project',
      root
    )

    const [character] = await listDocs<CharacterDoc>(root, 'character')

    expect(character.data).toMatchObject({
      title: 'Lin',
      role: 'protagonist',
      speech_style: 'Terse',
      desire: 'Protect the city',
      fear: 'Failure',
      bottom_line: 'No civilian sacrifices',
      ooc_guardrails: ['Never boasts', 'Never abandons allies']
    })
  })

  it('appends two timeline events into a previous-link chain', async () => {
    const { root } = await initProject()
    await run('timeline', 'append', 'Alarm Raised', '--date', '1449-08-01', '--project', root)
    const [first] = await listDocs<TimelineEventDoc>(root, 'timeline_event')
    await run('timeline', 'append', 'Council Meets', '--date', '1449-08-02', '--project', root)

    const events = await listDocs<TimelineEventDoc>(root, 'timeline_event')
    const second = events.find((event) => event.data.title === 'Council Meets')

    expect(events).toHaveLength(2)
    expect(second?.data.previous).toBe(first.data.id)
  })

  it('adds a foreshadowing ledger entry', async () => {
    const { root } = await initProject()
    await run(
      'foreshadowing',
      'add',
      'FB-SECRET-FLEET',
      '--level',
      'L2',
      '--summary',
      'The fleet still exists.',
      '--expires-at',
      'Chapter 20',
      '--project',
      root
    )

    const [entry] = await listDocs<ForeshadowingDoc>(root, 'foreshadowing')

    expect(entry.data).toMatchObject({
      id: 'fb-secret-fleet',
      code: 'FB-SECRET-FLEET',
      level: 'L2',
      summary: 'The fleet still exists.',
      expires_at: 'Chapter 20',
      state: 'planned'
    })
  })

  it('adds an open writing issue', async () => {
    const { root } = await initProject()
    await run(
      'issue',
      'add',
      'Choose the traitor',
      '--priority',
      'high',
      '--due',
      'Chapter 8',
      '--decision-needed',
      'Which minister betrays the council?',
      '--project',
      root
    )

    const [issue] = await listDocs<IssueDoc>(root, 'issue')

    expect(issue.data).toMatchObject({
      title: 'Choose the traitor',
      priority: 'high',
      due: 'Chapter 8',
      decision_needed: 'Which minister betrays the council?',
      state: 'open'
    })
  })

  it('builds a project index through the read/write maintenance path', async () => {
    const { root } = await initProject()
    await run('canon', 'add', 'Indexed Rule', '--content', 'Keep this.', '--project', root)
    output = []
    await run('index', '--project', root)

    const index = JSON.parse(await readFile(path.join(root, '.quillarium', 'index.json'), 'utf8')) as {
      entries: Array<{ title: string }>
    }

    expect(index.entries.some((entry) => entry.title === 'Indexed Rule')).toBe(true)
    expect(output).toEqual([`Indexed ${index.entries.length} documents.`])
  })

  it('checks an appended timeline without changing it', async () => {
    const { root } = await initProject()
    await run('timeline', 'append', 'First Event', '--project', root)
    await run('timeline', 'append', 'Second Event', '--project', root)
    output = []
    await run('timeline', 'check', '--project', root)

    expect(output).toEqual(['Checked 2 timeline events.'])
    expect(await listDocs<TimelineEventDoc>(root, 'timeline_event')).toHaveLength(2)
  })

  it('assembles scene context through a read-only command', async () => {
    const { root } = await initProject()
    const seeded = await seedScene(root)
    await run('canon', 'add', 'Context Rule', '--content', 'The hero cannot teleport.', '--project', root)
    output = []
    await run('context', seeded.sceneId, '--project', root)

    const context = output.join('\n')
    expect(context).toContain('Context Rule')
    expect(context).toContain('The hero cannot teleport.')
    expect(context).toContain(seeded.sceneId)
  })

  it('previews the exact PromptBlocks and ContextTrace without calling the provider', async () => {
    vi.stubEnv('QUILL_AI_PROVIDER', 'deepseek')
    vi.stubEnv('QUILL_AI_MODEL', 'deepseek-v4-flash')
    const { root } = await initProject()
    const seeded = await seedScene(root)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    output = []

    await run('context', seeded.sceneId, '--trace', '--project', root)

    const preview = JSON.parse(output.join('\n')) as {
      markdown: string
      prompt_blocks: Array<{ id: string; tokenizer_id: string; token_count: number }>
      context_trace: {
        tokenizer: { id: string; exact: boolean }
        budget: { selected_tokens: number; available_input_tokens: number }
        final_block_ids: string[]
      }
    }
    expect(preview.markdown).toContain(seeded.sceneId)
    expect(preview.prompt_blocks.map((block) => block.id)).toEqual(preview.context_trace.final_block_ids)
    expect(preview.prompt_blocks.every((block) => block.tokenizer_id === 'deepseek-v4')).toBe(true)
    expect(preview.context_trace.tokenizer).toMatchObject({ id: 'deepseek-v4', exact: true })
    expect(preview.context_trace.budget.selected_tokens).toBeLessThanOrEqual(
      preview.context_trace.budget.available_input_tokens
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('creates a run from context and writes a deterministic check report into it', async () => {
    vi.stubEnv('QUILL_AI_PROVIDER', 'deepseek')
    vi.stubEnv('QUILL_AI_MODEL', 'deepseek-v4-flash')
    const { root } = await initProject()
    const seeded = await seedScene(root)
    output = []
    await run('context', seeded.sceneId, '--run', '--project', root)
    const runId = output.at(-1)

    expect(runId).toMatch(/^run-/)
    output = []
    await run('check', seeded.sceneId, '--run', runId!, '--project', root)

    expect(output.join('\n')).toContain(`# Check Report: ${seeded.sceneId}`)
    expect(await readRunFile(root, runId!, 'context.md')).toContain(seeded.sceneId)
    expect(await readRunFile(root, runId!, 'check-report.md')).toContain('## AI-Assisted Checks')
    const blocks = JSON.parse(await readRunFile(root, runId!, 'prompt-blocks.json')) as {
      blocks: Array<{ id: string }>
    }
    const trace = JSON.parse(await readRunFile(root, runId!, 'context-trace.json')) as {
      tokenizer: { id: string; exact: boolean }
      final_block_ids: string[]
    }
    expect(blocks.blocks.map((block) => block.id)).toEqual(trace.final_block_ids)
    expect(trace.tokenizer).toMatchObject({ id: 'deepseek-v4', exact: true })
    expect(await listRuns(root)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: runId, provider: 'deepseek', model: 'deepseek-v4-flash' })
      ])
    )
  })

  it('keeps check deterministic by default and never calls AI', async () => {
    const { root } = await initProject()
    const seeded = await seedScene(root)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('QUILL_AI_API_KEY', 'unused-key')
    output = []

    await run('check', seeded.sceneId, '--project', root)

    const report = output.join('\n')
    expect(report).toContain(`# Check Report: ${seeded.sceneId}`)
    expect(report).not.toContain('semantic-ooc')
    expect(report).not.toContain('semantic-state-drift')
    expect(report).not.toContain('semantic-canon-conflict')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('checks outline targets without requiring a core API workaround', async () => {
    const { root } = await initProject()
    const outlineId = 'book-cli-check'
    await createOutline(root, 'book', 'CLI Check Book', { id: outlineId })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    output = []

    await run('check', outlineId, '--type', 'outline', '--project', root)

    const report = output.join('\n')
    expect(report).toContain(`# Check Report: ${outlineId}`)
    expect(report).toContain('book-missing-reader-promise')
    expect(report).toContain('semantic_status: not_requested')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reports semantic checks as unavailable without a CLI API key or network call', async () => {
    const { root } = await initProject()
    const seeded = await seedScene(root)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('QUILL_AI_PROVIDER', 'openai-compatible')
    vi.stubEnv('QUILL_AI_BASE_URL', 'https://api.openai.com/v1')
    vi.stubEnv('QUILL_AI_API_KEY', '')
    vi.stubEnv('QUILL_AI_MODEL', 'gpt-4o-mini')
    output = []

    await expect(run('check', seeded.sceneId, '--semantic', '--project', root)).resolves.toBeUndefined()

    const report = output.join('\n')
    expect(report).toContain('[info] semantic-check-unavailable:')
    expect(report).toContain('semantic_status: unavailable')
    expect(report).toContain('Set QUILL_AI_API_KEY')
    expect(report).toContain('omit --semantic to run deterministic checks only')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(errors).toEqual([])
  })

  it('merges three mocked semantic responses into the deterministic report', async () => {
    const { root } = await initProject()
    const seeded = await seedScene(root)
    configureSemanticAI()
    const fetchMock = stubSemanticFetch()
    output = []

    await run('check', seeded.sceneId, '--semantic', '--project', root)

    const report = output.join('\n')
    expect(report).toContain('[error] semantic-ooc: The hero acts outside established guardrails.')
    expect(report).toContain('[warning] semantic-state-drift: The emotional transition is unexplained.')
    expect(report).toContain('[info] semantic-canon-conflict: The scene conflicts with an active Canon rule.')
    expect(report).toContain('semantic_status: completed')
    expect(report).toContain('  - evidence: The sealed gate opens.')
    expect(report).toContain('  - related_ids: canon-main')
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(
      fetchMock.mock.calls.every(([, init]) => {
        const body = JSON.parse(String(init?.body)) as { response_format?: { type?: string } }
        return body.response_format?.type === 'json_object'
      })
    ).toBe(true)
  })

  it('writes the merged semantic report when --semantic and --run are combined', async () => {
    const { root } = await initProject()
    const seeded = await seedScene(root)
    output = []
    await run('context', seeded.sceneId, '--run', '--project', root)
    const runId = output.at(-1)!
    configureSemanticAI()
    const fetchMock = stubSemanticFetch()
    output = []

    await run('check', seeded.sceneId, '--semantic', '--run', runId, '--project', root)

    const stored = await readRunFile(root, runId, 'check-report.md')
    expect(stored).toContain('[error] semantic-ooc:')
    expect(stored).toContain('[warning] semantic-state-drift:')
    expect(stored).toContain('[info] semantic-canon-conflict:')
    expect(stored).toContain('  - related_ids: canon-main')
    expect(output.join('\n')).toContain('[info] semantic-canon-conflict:')
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('does not create a partial run directory for an unknown --run id', async () => {
    const { root } = await initProject()
    const seeded = await seedScene(root)

    await expect(run('check', seeded.sceneId, '--run', '../unknown-run', '--project', root)).rejects.toThrow(
      'Run not found: ../unknown-run'
    )
    expect(await pathExists(path.join(root, 'unknown-run'))).toBe(false)
    expect(await listRuns(root)).toHaveLength(0)
  })

  it('imports a JSON Character Card through st and prints its preserved paths and format', async () => {
    const { vault, root } = await initProject()
    const input = path.join(vault, 'cli-card.json')
    const raw = JSON.stringify(cliCharacterCard(), null, 2)
    await writeFile(input, raw, 'utf8')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    output = []

    await run('st', 'import-card', input, '--project', root)

    expect(output[0]).toBe('format: v2')
    const characterPath = output.find((line) => line.startsWith('character: '))?.slice(11)
    const rawPath = output.find((line) => line.startsWith('raw: '))?.slice(5)
    expect(characterPath).toBeTruthy()
    expect(rawPath).toBeTruthy()
    expect(await pathExists(characterPath!)).toBe(true)
    expect(await readFile(rawPath!, 'utf8')).toBe(raw)
    const characters = await listDocs<CharacterDoc>(root, 'character')
    expect(characters).toHaveLength(1)
    expect(characters[0].data).toMatchObject({
      title: 'CLI Card Hero',
      tags: ['harbor-guide'],
      speech_style: 'Direct and observant.'
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('exports a Quillarium character through st with stable V2 output fields', async () => {
    const { root } = await initProject()
    await run('character', 'add', 'Export Hero', '--speech-style', 'Measured and terse.', '--project', root)
    const [character] = await listDocs<CharacterDoc>(root, 'character')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    output = []

    await run('st', 'export-card', character.data.id, '--project', root)

    expect(output[0]).toBe('format: v2')
    const outputPath = output.find((line) => line.startsWith('output: '))?.slice(8)
    expect(path.relative(root, outputPath!).replace(/\\/g, '/')).toBe(
      `sillytavern/${character.data.id}-card-v2.json`
    )
    const exported = JSON.parse(await readFile(outputPath!, 'utf8'))
    expect(exported).toMatchObject({
      spec: 'chara_card_v2',
      spec_version: '2.0',
      data: {
        name: 'Export Hero',
        personality: 'Measured and terse.',
        creator: 'Quillarium',
        character_version: '1.0'
      }
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('exports Canon and world entries through st as an activating World Info file', async () => {
    const { root } = await initProject()
    await Promise.all([
      createCanon(root, 'CLI Canon', 'Canon content.', { tags: ['canon-key'] }),
      createWorldEntry(
        root,
        'CLI Harbor',
        { tags: ['harbor-tag'], triggers: ['glass-tide'], entry_status: 'active' },
        'Harbor content.'
      )
    ])
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    output = []

    await run('st', 'export-lorebook', '--project', root)

    expect(output.slice(0, 2)).toEqual(['format: world-info', 'entries: 2'])
    const outputPath = output.find((line) => line.startsWith('output: '))?.slice(8)
    const lorebook = JSON.parse(await readFile(outputPath!, 'utf8')) as {
      entries: Record<string, { comment: string; key: string[]; content: string; selective: boolean }>
    }
    const entries = Object.values(lorebook.entries)
    expect(entries.find((entry) => entry.comment === 'CLI Canon')).toMatchObject({
      key: ['canon-key', 'CLI Canon'],
      content: expect.stringContaining('Canon content.'),
      selective: false
    })
    expect(entries.find((entry) => entry.comment === 'CLI Harbor')).toMatchObject({
      key: ['glass-tide', 'harbor-tag', 'CLI Harbor'],
      content: expect.stringContaining('Harbor content.'),
      selective: false
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects malformed st card input without network access', async () => {
    const { vault, root } = await initProject()
    const input = path.join(vault, 'broken-card.json')
    await writeFile(input, '{not-json', 'utf8')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    output = []

    await expect(run('st', 'import-card', input, '--project', root)).rejects.toThrow(
      'Invalid Character Card JSON'
    )

    expect(await listDocs<CharacterDoc>(root, 'character')).toHaveLength(0)
    expect(output).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('creates and inspects an AI dry run without network access', async () => {
    const { root } = await initProject()
    const seeded = await seedScene(root)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    output = []
    await run('generate', seeded.sceneId, '--dry-run', '--project', root)
    const match = output.at(-1)?.match(/^Created dry run: (.+)$/)
    const runId = match?.[1]

    expect(runId).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(await listRuns(root)).toHaveLength(1)

    output = []
    await run('run', 'list', '--project', root)
    expect(output.join('\n')).toContain(runId!)

    output = []
    await run('run', 'show', runId!, '--file', 'prompt.md', '--project', root)
    expect(output.join('\n')).toContain('You are assisting with a long-form novel project.')
  })

  it('accepts a run without discarding its metadata and updates the scene', async () => {
    const { root } = await initProject()
    const seeded = await seedScene(root)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    output = []
    await run('generate', seeded.sceneId, '--dry-run', '--project', root)
    const runId = output.at(-1)?.match(/^Created dry run: (.+)$/)?.[1]
    expect(runId).toBeTruthy()

    const candidate = path.join(root, 'candidate-prose.md')
    await writeFile(candidate, 'Accepted CLI prose.', 'utf8')
    await run('run', 'set-output', runId!, '--file', candidate, '--project', root)
    const before = (await listRuns(root)).find((item) => item.id === runId)!
    expect(before.status).toBe('generated')
    output = []
    await run('run', 'accept', runId!, '--project', root)

    const after = (await listRuns(root)).find((item) => item.id === runId)
    expect(after).toEqual({ ...before, status: 'accepted' })
    expect(await readRunFile(root, runId!, 'output-accepted.md')).toBe('Accepted CLI prose.')
    expect(
      (await listDocs<SceneDoc>(root, 'scene'))
        .find((item) => item.data.id === seeded.sceneId)
        ?.content.trimEnd()
    ).toBe('Accepted CLI prose.')
    expect(output.at(-1)).toContain(`Accepted ${runId}`)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refuses to accept an empty run so existing scene prose is preserved', async () => {
    const { root } = await initProject()
    const seeded = await seedScene(root)
    output = []
    await run('generate', seeded.sceneId, '--dry-run', '--project', root)
    const runId = output.at(-1)?.match(/^Created dry run: (.+)$/)?.[1]
    const original = (await listDocs<SceneDoc>(root, 'scene')).find(
      (item) => item.data.id === seeded.sceneId
    )?.content

    await expect(run('run', 'accept', runId!, '--project', root)).rejects.toThrow(
      'Run output is empty; refusing to overwrite a scene'
    )

    expect(
      (await listDocs<SceneDoc>(root, 'scene')).find((item) => item.data.id === seeded.sceneId)?.content
    ).toBe(original)
    expect((await listRuns(root)).find((item) => item.id === runId)?.status).toBe('created')
  })

  it('fails AI generation helpfully when no key is configured and never fetches', async () => {
    const { root } = await initProject()
    const seeded = await seedScene(root)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('QUILL_AI_PROVIDER', 'openai-compatible')
    vi.stubEnv('QUILL_AI_BASE_URL', 'https://api.openai.com/v1')
    vi.stubEnv('QUILL_AI_API_KEY', '')

    await expect(run('generate', seeded.sceneId, '--project', root)).rejects.toThrow(
      'Missing QUILL_AI_API_KEY. Set QUILL_AI_API_KEY or use a local OpenAI-compatible endpoint.'
    )
    expect(fetchMock).not.toHaveBeenCalled()
    expect(errors).toEqual([])
  })

  it('exports Markdown by default and reports skipped-scene gaps without network access', async () => {
    const { root } = await initProject()
    await seedExportProject(root)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    output = []

    await run('export', '--project', root)

    const exportPath = output[0].slice('Exported MD: '.length)
    expect(path.isAbsolute(exportPath)).toBe(true)
    expect(path.extname(exportPath)).toBe('.md')
    expect(await pathExists(exportPath)).toBe(true)
    expect(await pathExists(exportPath.replace(/\.md$/, '.txt'))).toBe(true)
    expect(await readFile(exportPath, 'utf8')).not.toContain('DRAFT MUST NOT LEAK')
    expect(output).toEqual([
      `Exported MD: ${exportPath}`,
      'Scenes exported: 2',
      'Gaps: 1',
      'Warning: 1 scene was skipped; see the gap list at the end of the export.'
    ])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('prints the plain-text artifact selected with --format txt', async () => {
    const { root } = await initProject()
    await seedExportProject(root)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    output = []

    await run('export', '--format', 'txt', '--project', root)

    const exportPath = output[0].slice('Exported TXT: '.length)
    const text = await readFile(exportPath, 'utf8')
    expect(path.isAbsolute(exportPath)).toBe(true)
    expect(path.extname(exportPath)).toBe('.txt')
    expect(text).toContain('Volume one accepted prose.')
    expect(text).toContain('Volume two accepted prose.')
    expect(text).not.toContain('**Volume one accepted prose.**')
    expect(text).not.toContain('_Volume two accepted prose._')
    expect(output.slice(1, 3)).toEqual(['Scenes exported: 2', 'Gaps: 1'])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('passes --volume through and reports only that volume', async () => {
    const { root } = await initProject()
    const { volumeTwoId } = await seedExportProject(root)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    output = []

    await run('export', '--volume', volumeTwoId, '--format', 'md', '--project', root)

    const exportPath = output[0].slice('Exported MD: '.length)
    const markdown = await readFile(exportPath, 'utf8')
    expect(markdown).toContain('Volume two accepted prose.')
    expect(markdown).not.toContain('Volume one accepted prose.')
    expect(output).toEqual([`Exported MD: ${exportPath}`, 'Scenes exported: 1', 'Gaps: 0'])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects unsupported formats and unknown volumes without export residue', async () => {
    const { root } = await initProject()
    await seedExportProject(root)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    output = []

    await expect(run('export', '--format', 'pdf', '--project', root)).rejects.toThrow(
      'Unsupported export format: pdf. Expected md or txt.'
    )
    await expect(run('export', '--volume', 'missing-volume', '--project', root)).rejects.toThrow(
      'Volume outline not found: missing-volume'
    )

    const { readdir } = await import('node:fs/promises')
    expect(await readdir(path.join(root, 'exports'))).toEqual([])
    expect(output).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
