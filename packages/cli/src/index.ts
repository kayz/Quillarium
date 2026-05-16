#!/usr/bin/env node
import path from 'node:path'
import { Command } from 'commander'
import dotenv from 'dotenv'
import {
  appendTimelineEvent,
  assembleContext,
  buildIndex,
  chooseObsidianDir,
  configPath,
  createCanon,
  createCharacter,
  createLocation,
  createOutline,
  createProject,
  createRoute,
  createScene,
  createRun,
  getObsidianDir,
  importCanonFile,
  listRuns,
  listDocs,
  readRunFile,
  requireDoc,
  searchCanon,
  setObsidianDir,
  writeMarkdown,
  writeRunFile,
  type BaseDoc,
  type OutlineDoc,
  type SceneDoc,
  type TimelineEventDoc
} from '@quillarium/core'
import { checkScene, formatCheckReport } from '@quillarium/checks'
import { createGenerationRun, generateIntoRun, loadAIConfig } from '@quillarium/ai'

dotenv.config()

const program = new Command()
program
  .name('quill')
  .description('Quillarium CLI for Obsidian-backed long-form fiction projects')
  .version('0.1.0')

function projectOption(cmd: Command): Command {
  return cmd.requiredOption('-p, --project <path>', 'Novel project root')
}

function printPath(file: string) {
  console.log(path.resolve(file))
}

async function resolveVault(optionVault?: string): Promise<string> {
  if (optionVault) {
    const config = await setObsidianDir(optionVault)
    return config.obsidianDir!
  }
  const configured = await getObsidianDir()
  if (configured) return configured
  const selected = await chooseObsidianDir()
  if (selected) {
    const config = await setObsidianDir(selected)
    return config.obsidianDir!
  }
  throw new Error(
    `Obsidian directory is not configured. Run: quill config set-vault <path>\nConfig file: ${configPath()}`
  )
}

const configCmd = program.command('config').description('Manage Quillarium global configuration')
configCmd
  .command('set-vault')
  .argument('<path>', 'Obsidian vault directory')
  .description('Set the Obsidian vault directory used by quill init')
  .action(async (dir) => {
    const config = await setObsidianDir(dir)
    console.log(`Obsidian directory: ${config.obsidianDir}`)
  })
configCmd
  .command('get-vault')
  .description('Show the configured Obsidian vault directory')
  .action(async () => {
    const dir = await getObsidianDir()
    if (!dir) {
      console.log(`No Obsidian directory configured. Config file: ${configPath()}`)
      return
    }
    console.log(dir)
  })
configCmd
  .command('choose-vault')
  .description('Open a folder picker and save the selected Obsidian vault directory')
  .action(async () => {
    const selected = await chooseObsidianDir()
    if (!selected) throw new Error('No folder selected or folder picker is unavailable.')
    const config = await setObsidianDir(selected)
    console.log(`Obsidian directory: ${config.obsidianDir}`)
  })

program
  .command('init')
  .argument('<title>', 'Novel title')
  .option('--vault <path>', 'Obsidian vault directory; also saves global config')
  .option('--genre <genre>', 'Genre profile', 'general')
  .option('--target-words <number>', 'Target word count', (v) => Number(v), 0)
  .option('--chapter-words <number>', 'Default chapter words', (v) => Number(v), 3200)
  .option('--section-words <number>', 'Default section words', (v) => Number(v), 1000)
  .option('--default-theme <theme>', 'Default UI theme: paper | ink | mist | bamboo', 'paper')
  .description('Create a novel project folder under <vault>/novels/<title>')
  .action(async (title, opts) => {
    const vault = await resolveVault(opts.vault)
    const paths = await createProject({
      vault,
      title,
      genre: opts.genre,
      targetWords: opts.targetWords,
      chapterWords: opts.chapterWords,
      sectionWords: opts.sectionWords,
      defaultTheme: opts.defaultTheme
    })
    console.log(`Created project: ${paths.root}`)
  })

const canon = program.command('canon').description('Manage canon documents')
projectOption(
  canon
    .command('add')
    .argument('<title>', 'Canon title')
    .option('--content <text>', 'Canon content', '')
    .option('--strength <hard|soft>', 'Canon strength', 'hard')
    .option('--source <source>', 'Canon source', 'user')
    .description('Add a canon item')
).action(async (title, opts) => {
  printPath(
    await createCanon(path.resolve(opts.project), title, opts.content, {
      strength: opts.strength,
      source: opts.source
    })
  )
})
projectOption(
  canon
    .command('import')
    .argument('<file>', 'Markdown or text file to import')
    .option('--strength <hard|soft>', 'Canon strength', 'hard')
    .option('--source <source>', 'Canon source', 'imported')
    .description('Import a file as a canon item')
).action(async (file, opts) => {
  printPath(
    await importCanonFile(path.resolve(opts.project), path.resolve(file), {
      strength: opts.strength,
      source: opts.source
    })
  )
})
projectOption(canon.command('list').description('List canon items')).action(async (opts) => {
  await printDocs(path.resolve(opts.project), 'canon')
})
projectOption(
  canon
    .command('search')
    .argument('<query>', 'Text to search')
    .description('Search canon titles, metadata, and content')
).action(async (query, opts) => {
  const docs = await searchCanon(path.resolve(opts.project), query)
  for (const doc of docs) {
    console.log(
      `${doc.data.id}\t${doc.data.title}\t${doc.data.status}\t${path.relative(path.resolve(opts.project), doc.path)}`
    )
  }
})

const character = program.command('character').description('Manage characters')
projectOption(
  character
    .command('add')
    .argument('<name>', 'Character name')
    .option('--role <role>', 'Character role', 'supporting')
    .option('--speech-style <text>', 'Speech style', '')
    .option('--desire <text>', 'Core desire', '')
    .option('--fear <text>', 'Core fear', '')
    .option('--bottom-line <text>', 'Bottom line', '')
    .option('--ooc <text...>', 'OOC guardrails')
    .description('Add a character')
).action(async (name, opts) => {
  printPath(
    await createCharacter(path.resolve(opts.project), name, {
      role: opts.role,
      speech_style: opts.speechStyle,
      desire: opts.desire,
      fear: opts.fear,
      bottom_line: opts.bottomLine,
      ooc_guardrails: opts.ooc ?? []
    })
  )
})
projectOption(character.command('list').description('List characters')).action(async (opts) => {
  await printDocs(path.resolve(opts.project), 'character')
})

const timeline = program.command('timeline').description('Manage timeline events')
projectOption(
  timeline
    .command('append')
    .argument('<title>', 'Event title')
    .option('--date <date>', 'Event date', '')
    .option('--duration <duration>', 'Duration', '')
    .option('--location <id>', 'Location id')
    .option('--characters <ids>', 'Comma-separated character ids')
    .option('--previous <id>', 'Previous event id')
    .description('Append a forward timeline event')
).action(async (title, opts) => {
  printPath(
    await appendTimelineEvent(path.resolve(opts.project), title, {
      date: opts.date,
      duration: opts.duration,
      location: opts.location ?? null,
      characters: csv(opts.characters),
      previous: opts.previous
    })
  )
})
projectOption(timeline.command('list').description('List timeline events')).action(async (opts) => {
  await printDocs(path.resolve(opts.project), 'timeline_event')
})
projectOption(timeline.command('check').description('Check timeline links')).action(async (opts) => {
  const docs = await listDocs<TimelineEventDoc>(path.resolve(opts.project), 'timeline_event')
  const ids = new Set(docs.map((doc) => doc.data.id))
  for (const doc of docs) {
    if (doc.data.previous && !ids.has(doc.data.previous))
      console.log(`[error] ${doc.data.id}: missing previous ${doc.data.previous}`)
    if (doc.data.next && !ids.has(doc.data.next))
      console.log(`[error] ${doc.data.id}: missing next ${doc.data.next}`)
  }
  console.log(`Checked ${docs.length} timeline events.`)
})

const location = program.command('location').description('Manage locations and routes')
projectOption(
  location
    .command('add')
    .argument('<title>', 'Location title')
    .option('--parent <id>', 'Parent location id')
    .option('--description <text>', 'Short description', '')
    .description('Add a location')
).action(async (title, opts) => {
  printPath(
    await createLocation(path.resolve(opts.project), title, {
      parent_location: opts.parent ?? null,
      description: opts.description
    })
  )
})
projectOption(location.command('list').description('List locations')).action(async (opts) => {
  await printDocs(path.resolve(opts.project), 'location')
})

const route = program.command('route').description('Manage location routes')
projectOption(
  route
    .command('add')
    .requiredOption('--from <id>', 'From location id')
    .requiredOption('--to <id>', 'To location id')
    .option('--distance-li <number>', 'Distance in li', (v) => Number(v))
    .option('--travel-time-days <number>', 'Travel time in days', (v) => Number(v))
    .option('--route-type <type>', 'Route type', 'road')
    .option('--restriction <text>', 'Restriction', '')
    .description('Add a route edge')
).action(async (opts) => {
  printPath(
    await createRoute(path.resolve(opts.project), opts.from, opts.to, {
      distance_li: opts.distanceLi ?? null,
      travel_time_days: opts.travelTimeDays ?? null,
      route_type: opts.routeType,
      restriction: opts.restriction
    })
  )
})

const outline = program.command('outline').description('Manage outlines')
projectOption(
  outline
    .command('add')
    .argument('<level>', 'book | volume | arc | chapter | section')
    .argument('<title>', 'Outline title')
    .option('--parent <id>', 'Parent outline id')
    .option('--order <number>', 'Order', (v) => Number(v), 0)
    .option('--target-words <number>', 'Target words', (v) => Number(v))
    .option('--chapter-hook', 'Requires chapter hook')
    .description('Add an outline node')
).action(async (level: OutlineDoc['level'], title, opts) => {
  printPath(
    await createOutline(path.resolve(opts.project), level, title, {
      parent: opts.parent ?? null,
      order: opts.order,
      target_words: opts.targetWords,
      chapter_hook: opts.chapterHook
    })
  )
})
projectOption(outline.command('list').description('List outline nodes')).action(async (opts) => {
  await printDocs(path.resolve(opts.project), 'outline')
})

const scene = program.command('scene').description('Manage scenes')
projectOption(
  scene
    .command('create')
    .argument('<title>', 'Scene title')
    .requiredOption('--section <id>', 'Section outline id')
    .requiredOption('--timeline <id>', 'Timeline node id')
    .requiredOption('--location <id>', 'Location id')
    .requiredOption('--pov <id>', 'POV character id')
    .option('--characters <ids>', 'Comma-separated participating character ids')
    .option('--target-words <number>', 'Target words', (v) => Number(v))
    .option('--chapter-hook', 'Requires chapter hook')
    .option('--previous-scene <id>', 'Previous scene id')
    .option('--volume <tag>', 'Volume tag', 'volume-01')
    .option('--chapter <tag>', 'Chapter tag', 'chapter-001')
    .description('Create a scene/section prose file')
).action(async (title, opts) => {
  printPath(
    await createScene(path.resolve(opts.project), title, {
      section: opts.section,
      timeline_node: opts.timeline,
      location: opts.location,
      pov: opts.pov,
      characters: csv(opts.characters),
      target_words: opts.targetWords,
      chapter_hook: !!opts.chapterHook,
      previous_scene: opts.previousScene ?? null,
      tags: [opts.volume, opts.chapter]
    })
  )
})
projectOption(scene.command('list').description('List scenes')).action(async (opts) => {
  await printDocs(path.resolve(opts.project), 'scene')
})

projectOption(program.command('index').description('Build project index')).action(async (opts) => {
  const index = await buildIndex(path.resolve(opts.project))
  console.log(`Indexed ${index.entries.length} documents.`)
})

projectOption(
  program
    .command('context')
    .argument('<scene-id>', 'Scene id')
    .option('--run', 'Create a run and save context.md')
    .description('Assemble context for a scene')
).action(async (sceneId, opts) => {
  const root = path.resolve(opts.project)
  const context = await assembleContext(root, sceneId)
  if (opts.run) {
    const run = await createRun(root, sceneId)
    await writeRunFile(root, run, 'context.md', context)
    console.log(run.id)
  } else {
    console.log(context)
  }
})

projectOption(
  program
    .command('generate')
    .argument('<scene-id>', 'Scene id')
    .option('--dry-run', 'Create context and prompt run but do not call AI')
    .description('Generate a scene with configured OpenAI-compatible provider')
).action(async (sceneId, opts) => {
  const root = path.resolve(opts.project)
  const context = await assembleContext(root, sceneId)
  const config = loadAIConfig()
  const run = await createGenerationRun(root, sceneId, context, config)
  if (opts.dryRun) {
    console.log(`Created dry run: ${run.id}`)
    return
  }
  const output = await generateIntoRun(root, run, context, config)
  console.log(output)
})

projectOption(
  program
    .command('check')
    .argument('<scene-id>', 'Scene id')
    .option('--run <run-id>', 'Also write report into run directory')
    .description('Run deterministic consistency checks for a scene')
).action(async (sceneId, opts) => {
  const root = path.resolve(opts.project)
  const report = await checkScene(root, sceneId)
  const formatted = formatCheckReport(report)
  if (opts.run) {
    await writeRunFile(
      root,
      {
        id: opts.run,
        scene_id: sceneId,
        created_at: new Date().toISOString(),
        provider: 'none',
        model: 'none',
        status: 'checked',
        run_dir: `runs/${opts.run}`
      },
      'check-report.md',
      formatted
    )
  }
  console.log(formatted)
})

const run = program.command('run').description('Manage generation runs')
projectOption(run.command('list').description('List run directories')).action(async (opts) => {
  const runs = await listRuns(path.resolve(opts.project))
  for (const item of runs) {
    console.log(`${item.id}\t${item.scene_id}\t${item.status}\t${item.model}\t${item.created_at}`)
  }
})
projectOption(
  run
    .command('show')
    .argument('<run-id>', 'Run id')
    .option('--file <file>', 'Run file', 'metadata.yaml')
    .description('Show a run file')
).action(async (runId, opts) => {
  console.log(await readRunFile(path.resolve(opts.project), runId, opts.file))
})
projectOption(
  run
    .command('accept')
    .argument('<run-id>', 'Run id')
    .option('--scene <scene-id>', 'Scene id; defaults to metadata scene_id')
    .description('Accept output-raw.md into output-accepted.md and scene file')
).action(async (runId, opts) => {
  const root = path.resolve(opts.project)
  const raw = await readRunFile(root, runId, 'output-raw.md')
  const sceneId = opts.scene ?? (await inferSceneId(root, runId))
  const sceneDoc = await requireDoc<SceneDoc>(root, sceneId)
  await writeRunFile(
    root,
    {
      id: runId,
      scene_id: sceneId,
      created_at: new Date().toISOString(),
      provider: 'unknown',
      model: 'unknown',
      status: 'accepted',
      run_dir: `runs/${runId}`
    },
    'output-accepted.md',
    raw
  )
  await writeMarkdown(sceneDoc.path, sceneDoc.data as unknown as Record<string, unknown>, raw)
  console.log(`Accepted ${runId} into ${sceneDoc.path}`)
})

async function printDocs(projectRoot: string, type: Parameters<typeof listDocs>[1]) {
  const docs = await listDocs<BaseDoc>(projectRoot, type)
  for (const doc of docs) {
    console.log(
      `${doc.data.id}\t${doc.data.title}\t${doc.data.status}\t${path.relative(projectRoot, doc.path)}`
    )
  }
}

function csv(value?: string): string[] {
  return value
    ? value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : []
}

async function inferSceneId(projectRoot: string, runId: string): Promise<string> {
  const metadata = await readRunFile(projectRoot, runId, 'metadata.yaml')
  const match = metadata.match(/^scene_id:\s*(.+)$/m)
  if (!match) throw new Error('Could not infer scene_id from run metadata. Pass --scene.')
  return match[1].trim()
}

program.parseAsync().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exitCode = 1
})
