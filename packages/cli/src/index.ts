#!/usr/bin/env node
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { Command } from 'commander'
import dotenv from 'dotenv'
import {
  appendTimelineEvent,
  assembleContextPacket,
  buildChapterWritingPlan,
  buildFinalizeReviewPrompt,
  buildIndex,
  buildImportPrompt,
  chooseObsidianDir,
  configPath,
  confirmFinalizeImpact,
  createCanon,
  createFinalizeReviewSession,
  createCharacter,
  createForeshadowing,
  createIssue,
  createLocation,
  createOutline,
  createPattern,
  createProject,
  createProjectAt,
  createReference,
  createRoute,
  createScene,
  createImportSessionPlan,
  createWorldEntry,
  createRun,
  createWritingPreset,
  defaultWritingPreset,
  ensureDefaultPrompts,
  exportManuscript,
  answerImportIssue,
  getObsidianDir,
  getWorkspaceDir,
  initializeDefaultWritingPreset,
  listWorkspaceProjects,
  importCanonFile,
  importMarkdownPath,
  landImportSession,
  loadFinalizeReviewSession,
  loadImportSession,
  listRuns,
  listWritingPresets,
  listDocs,
  loadWritingPreset,
  planWritingPresetMigration,
  applyWritingPresetMigration,
  readRunFile,
  readPrompt,
  renderContextPacket,
  snapshotContextCompilation,
  snapshotSharedGuidance,
  snapshotWritingPreset,
  searchCanon,
  selectWritingPreset,
  setObsidianDir,
  setWorkspaceDir,
  loadWorkspace,
  registerWorkspaceProject,
  stableProjectId,
  writeRunFile,
  writeRunMetadata,
  type BaseDoc,
  type DocType,
  type OutlineDoc,
  type TimelineEventDoc
} from '@quillarium/core'
import {
  SEMANTIC_CHECK_TIMEOUT_MS,
  checkScene,
  checkTarget,
  formatCheckReport,
  runSemanticChecks,
  scoreCheckReport,
  semanticStatusFromIssues
} from '@quillarium/checks'
import {
  contextCompileOptions,
  createGenerationCandidateRuns,
  createGenerationRun,
  generateCandidateGroup,
  generateIntoRun,
  generateText,
  loadAIConfig,
  resolveGenerationPreset
} from '@quillarium/ai'
import { registerSillyTavernCommands } from './sillytavern.js'
import { registerStrategyCommands } from './strategy.js'
import { registerRunCommands } from './runs.js'

dotenv.config()

export function buildProgram(): Command {
  const program = new Command()
  program
    .name('quill')
    .description('Quillarium CLI for Obsidian-backed long-form fiction projects')
    .version('0.2.0-alpha.1')

  const workspace = program.command('workspace').description('Manage writing workspaces')
  workspace
    .command('list')
    .argument('<root>', 'Writing workspace root')
    .description('List projects registered by a workspace manifest')
    .action(async (root) => {
      for (const project of await listWorkspaceProjects(path.resolve(root))) {
        console.log(`${project.config.id}\t${project.config.title}\t${project.root}`)
      }
    })
  workspace
    .command('create-project')
    .argument('<root>', 'Writing workspace root')
    .argument('<id>', 'Stable project id')
    .argument('<title>', 'Display title')
    .option('--genre <genre>', 'Genre', 'general')
    .description('Create and register a direct project-vault')
    .action(async (root, id, title, opts) => {
      const loaded = await loadWorkspace(path.resolve(root))
      const normalizedId = stableProjectId(id)
      if (normalizedId !== id) throw new Error(`Project id must be path-safe: ${normalizedId}`)
      const relative = path.posix.join(loaded.manifest.projects_dir.replace(/\\/g, '/'), id)
      const projectRoot = path.join(loaded.root, ...relative.split('/'))
      await createProjectAt(projectRoot, { id, title, genre: opts.genre })
      await registerWorkspaceProject(loaded.root, { id, path: relative })
      await setWorkspaceDir(loaded.root, id)
      console.log(projectRoot)
    })

  function projectOption(cmd: Command): Command {
    return cmd.requiredOption('-p, --project <path>', 'Novel project root')
  }

  const presetCmd = program.command('preset').description('Manage versioned project writing presets')
  projectOption(
    presetCmd.command('init').description('Create and select the default writing preset explicitly')
  ).action(async (opts) => {
    const initialized = await initializeDefaultWritingPreset(path.resolve(opts.project))
    console.log(`${initialized.preset.id}\t${initialized.preset.version}\t${initialized.source_path}`)
  })
  projectOption(presetCmd.command('list').description('List writing presets')).action(async (opts) => {
    for (const preset of await listWritingPresets(path.resolve(opts.project))) {
      console.log(
        `${preset.selected ? '*' : ' '}\t${preset.id}\t${preset.version}\t${preset.title}\t${preset.source_path}`
      )
    }
  })
  projectOption(
    presetCmd
      .command('show')
      .argument('<id>', 'Writing preset id')
      .description('Show the parsed current preset schema')
  ).action(async (id, opts) => {
    console.log(JSON.stringify(await loadWritingPreset(path.resolve(opts.project), id), null, 2))
  })
  projectOption(
    presetCmd
      .command('select')
      .argument('<id>', 'Writing preset id')
      .description('Select a preset for future generation runs')
  ).action(async (id, opts) => {
    const selected = await selectWritingPreset(path.resolve(opts.project), id)
    console.log(`${selected.preset.id}\t${selected.preset.version}`)
  })
  projectOption(
    presetCmd
      .command('create')
      .argument('<id>', 'Stable path-safe preset id')
      .option('--title <title>', 'Display title')
      .option('--preset-version <version>', 'Semantic preset version', '1.0.0')
      .option('--profile <profile>', 'Connection profile: prose | background | check', 'prose')
      .option('--provider <provider>', 'Override the connection provider')
      .option('--model <model>', 'Override the model')
      .description('Create a safe project writing preset')
  ).action(async (id, opts) => {
    const preset = defaultWritingPreset(id, opts.title ?? id)
    preset.version = opts.presetVersion
    preset.model.profile = opts.profile
    if (opts.provider) preset.model.provider = opts.provider
    if (opts.model) preset.model.model = opts.model
    const created = await createWritingPreset(path.resolve(opts.project), preset)
    console.log(`${created.preset.id}\t${created.preset.version}\t${created.source_path}`)
  })
  projectOption(
    presetCmd
      .command('migrate')
      .argument('<id>', 'Writing preset id')
      .option('--apply', 'Back up, migrate, and verify the preset')
      .description('Plan or apply a schema-v1 to schema-v2 preset migration')
  ).action(async (id, opts) => {
    const root = path.resolve(opts.project)
    const plan = await planWritingPresetMigration(root, id)
    if (!opts.apply) {
      console.log(JSON.stringify(plan, null, 2))
      return
    }
    console.log(JSON.stringify(await applyWritingPresetMigration(root, plan), null, 2))
  })

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

  async function resolveWritingWorkspace(optionWorkspace?: string): Promise<string> {
    const configured = optionWorkspace ? path.resolve(optionWorkspace) : await getWorkspaceDir()
    if (!configured) {
      throw new Error(
        `Writing workspace is not configured. Run: quill config set-workspace <path>\nConfig file: ${configPath()}`
      )
    }
    const workspace = await loadWorkspace(configured)
    if (optionWorkspace) await setWorkspaceDir(workspace.root)
    return workspace.root
  }

  const configCmd = program.command('config').description('Manage Quillarium global configuration')
  configCmd
    .command('set-workspace')
    .argument('<path>', 'Writing workspace root')
    .description('Validate and save the workspace used by quill init')
    .action(async (dir) => {
      const workspace = await loadWorkspace(path.resolve(dir))
      const config = await setWorkspaceDir(workspace.root)
      console.log(`Writing workspace: ${config.workspaceDir}`)
    })
  configCmd
    .command('get-workspace')
    .description('Show the configured writing workspace')
    .action(async () => {
      const dir = await getWorkspaceDir()
      if (!dir) {
        console.log(`No writing workspace configured. Config file: ${configPath()}`)
        return
      }
      console.log(dir)
    })
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
    .option('--id <id>', 'Stable path-safe project id; defaults to a slug derived from the title')
    .option('--workspace <path>', 'Writing workspace root; also saves global config')
    .option('--vault <path>', 'Legacy compatibility: create under <vault>/novels/<title>')
    .option('--genre <genre>', 'Genre profile', 'general')
    .option('--target-words <number>', 'Target word count', (v) => Number(v), 0)
    .option('--chapter-words <number>', 'Default chapter words', (v) => Number(v), 3200)
    .option('--section-words <number>', 'Default section words', (v) => Number(v), 1000)
    .option('--default-theme <theme>', 'Default UI theme: paper | ink | mist | bamboo', 'paper')
    .description('Create and register a direct project-vault in the configured writing workspace')
    .action(async (title, opts) => {
      if (opts.vault) {
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
        console.log(`Created legacy project: ${paths.root}`)
        return
      }

      const workspaceRoot = await resolveWritingWorkspace(opts.workspace)
      const workspace = await loadWorkspace(workspaceRoot)
      const id = opts.id ?? stableProjectId(title)
      if (stableProjectId(id) !== id) throw new Error(`Project id must be path-safe: ${stableProjectId(id)}`)
      const relative = path.posix.join(workspace.manifest.projects_dir.replace(/\\/g, '/'), id)
      const projectRoot = path.join(workspace.root, ...relative.split('/'))
      const paths = await createProjectAt(projectRoot, {
        id,
        title,
        genre: opts.genre,
        target_words: opts.targetWords,
        chapter_words: opts.chapterWords,
        section_words: opts.sectionWords,
        default_theme: opts.defaultTheme
      })
      await registerWorkspaceProject(workspace.root, { id, path: relative })
      await setWorkspaceDir(workspace.root, id)
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

  const foreshadowing = program.command('foreshadowing').description('Manage foreshadowing ledger entries')
  projectOption(
    foreshadowing
      .command('add')
      .argument('<title>', 'Foreshadowing title or code')
      .option('--level <level>', 'L1 | L2 | L3 | L4 | L5', 'L4')
      .option('--summary <text>', 'One-line summary', '')
      .option('--expires-at <text>', 'Safety expiry such as chapter-010 or 第十章', '')
      .description('Add a foreshadowing ledger entry')
  ).action(async (title, opts) => {
    printPath(
      await createForeshadowing(path.resolve(opts.project), title, {
        code: title.startsWith('FB-') ? title : '',
        level: opts.level,
        summary: opts.summary,
        expires_at: opts.expiresAt
      })
    )
  })
  projectOption(foreshadowing.command('list').description('List foreshadowing entries')).action(
    async (opts) => {
      await printDocs(path.resolve(opts.project), 'foreshadowing')
    }
  )

  const world = program.command('world').description('Manage worldbook/lore entries')
  projectOption(
    world
      .command('add')
      .argument('<title>', 'World entry title')
      .option('--trigger <text...>', 'Trigger words')
      .option('--role <role>', 'constraint | texture | both', 'both')
      .option('--valid-from <text>', 'World-internal start time', '')
      .option('--content <text>', 'World entry body', '')
      .description('Add a worldbook entry')
  ).action(async (title, opts) => {
    printPath(
      await createWorldEntry(
        path.resolve(opts.project),
        title,
        {
          triggers: opts.trigger ?? [],
          role: opts.role,
          valid_from: opts.validFrom,
          entry_status: 'active'
        },
        opts.content
      )
    )
  })
  projectOption(world.command('list').description('List worldbook entries')).action(async (opts) => {
    await printDocs(path.resolve(opts.project), 'world_entry')
  })

  const reference = program.command('reference').description('Manage research/reference documents')
  projectOption(
    reference
      .command('add')
      .argument('<title>', 'Reference title')
      .option('--location <text>', 'URL or local path', '')
      .option('--material-type <type>', 'book | paper | article | webpage | video | other', 'other')
      .description('Add a reference document')
  ).action(async (title, opts) => {
    printPath(
      await createReference(path.resolve(opts.project), title, {
        location: opts.location,
        material_type: opts.materialType
      })
    )
  })
  projectOption(reference.command('list').description('List reference documents')).action(async (opts) => {
    await printDocs(path.resolve(opts.project), 'reference')
  })

  const issue = program.command('issue').description('Manage open writing questions')
  projectOption(
    issue
      .command('add')
      .argument('<title>', 'Issue title')
      .option('--priority <priority>', 'high | medium | low', 'medium')
      .option('--due <text>', 'Due chapter/scene', '')
      .option('--decision-needed <text>', 'Decision needed', '')
      .description('Add an open writing issue')
  ).action(async (title, opts) => {
    printPath(
      await createIssue(path.resolve(opts.project), title, {
        priority: opts.priority,
        due: opts.due,
        decision_needed: opts.decisionNeeded
      })
    )
  })
  projectOption(issue.command('list').description('List open writing issues')).action(async (opts) => {
    await printDocs(path.resolve(opts.project), 'issue')
  })

  registerStrategyCommands(program, projectOption)

  const pattern = program.command('pattern').description('Manage story, writing, and prompt patterns')
  projectOption(
    pattern
      .command('add')
      .argument('<title>', 'Pattern title')
      .option('--kind <kind>', 'story | writing | prompt', 'story')
      .option('--scope <scope>', 'book | volume | arc | chapter | section | agent | project', 'project')
      .option('--source <source>', 'user | ai | accepted_prose | imported', 'user')
      .option('--applies-to <items>', 'Comma-separated applicability tags')
      .description('Add a reusable pattern')
  ).action(async (title, opts) => {
    printPath(
      await createPattern(path.resolve(opts.project), title, {
        kind: opts.kind,
        scope: opts.scope,
        source: opts.source,
        applies_to: csv(opts.appliesTo)
      })
    )
  })
  projectOption(pattern.command('list').description('List patterns')).action(async (opts) => {
    await printDocs(path.resolve(opts.project), 'pattern')
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
      .argument('<level>', 'overview | book | volume | part | act | chapter')
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
      .requiredOption('--section <id>', 'Required section outline id')
      .requiredOption('--timeline <id>', 'Required timeline node id')
      .requiredOption('--location <id>', 'Required location id')
      .requiredOption('--pov <id>', 'Required POV character id')
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
      .command('export')
      .option('--format <format>', 'Export format: md | txt', 'md')
      .option('--volume <id>', 'Export one volume outline by id')
      .description('Export accepted manuscript prose to Markdown or plain text')
  ).action(async (opts) => {
    const format = String(opts.format)
    if (format !== 'md' && format !== 'txt') {
      throw new Error(`Unsupported export format: ${opts.format}. Expected md or txt.`)
    }
    const result = await exportManuscript(path.resolve(opts.project), { volumeId: opts.volume })
    const selectedPath = format === 'md' ? result.markdown_path : result.text_path
    console.log(`Exported ${format.toUpperCase()}: ${path.resolve(selectedPath)}`)
    console.log(`Scenes exported: ${result.exported_scenes.length}`)
    console.log(`Gaps: ${result.gaps.length}`)
    if (result.gaps.length) {
      const sceneLabel = result.gaps.length === 1 ? 'scene was' : 'scenes were'
      console.log(
        `Warning: ${result.gaps.length} ${sceneLabel} skipped; see the gap list at the end of the export.`
      )
    }
  })

  const promptCmd = program.command('prompt').description('Manage Quillarium system prompts')
  projectOption(promptCmd.command('init').description('Create default prompt files')).action(async (opts) => {
    const prompts = await ensureDefaultPrompts(path.resolve(opts.project))
    for (const prompt of prompts) console.log(`${prompt.name}\t${prompt.title}`)
  })
  projectOption(
    promptCmd
      .command('show')
      .argument(
        '<name>',
        'background-import | background-issue-followup | check-finalize-review | prose-scene-draft'
      )
      .description('Show a system prompt')
  ).action(async (name, opts) => {
    console.log(await readPrompt(path.resolve(opts.project), name))
  })

  const importCmd = program.command('import').description('Import external notes into a Quillarium project')
  projectOption(
    importCmd
      .command('markdown')
      .argument('<path>', 'Markdown file or directory')
      .option('--strategy <strategy>', 'auto | single | sections', 'auto')
      .option('--type <type>', 'Default document type when no frontmatter is present')
      .description('Import Markdown and map structured Chinese fields where possible')
  ).action(async (inputPath, opts) => {
    const results = await importMarkdownPath(path.resolve(opts.project), path.resolve(inputPath), {
      strategy: opts.strategy,
      defaultType: opts.type as DocType | undefined
    })
    for (const item of results) {
      const note = item.notes.length ? `\t${item.notes.join(' ')}` : ''
      console.log(
        `${item.imported_type}\t${item.title}\t${path.relative(path.resolve(opts.project), item.path)}${note}`
      )
    }
    console.log(`Imported ${results.length} Markdown document${results.length === 1 ? '' : 's'}.`)
  })
  projectOption(
    importCmd
      .command('ai-plan')
      .argument('[path]', 'Markdown file or directory. Omit when using --text.')
      .option('--text <markdown>', 'Markdown text to classify')
      .option('--ai-response <json>', 'AI JSON response to store into the session')
      .description('Create an AI-assisted import session and print the prompt or plan')
  ).action(async (inputPath, opts) => {
    const root = path.resolve(opts.project)
    const session = await createImportSessionPlan(root, {
      sourceKind: opts.text ? 'text' : inputPath ? 'file' : 'obsidian-scan',
      sourcePaths: inputPath ? [path.resolve(inputPath)] : undefined,
      markdownText: opts.text,
      aiResponse: opts.aiResponse
    })
    console.log(`session: ${session.id}`)
    console.log(`status: ${session.status}`)
    console.log(`candidates: ${session.candidates.length}`)
    console.log(`issues: ${session.issues.length}`)
    if (!opts.aiResponse) console.log(buildImportPrompt(session))
  })
  projectOption(
    importCmd
      .command('answer')
      .argument('<session-id>', 'Import session id')
      .argument('<issue-id>', 'Issue id')
      .argument('<answer>', 'Author answer')
      .description('Answer an import session issue')
  ).action(async (sessionId, issueId, answer, opts) => {
    const session = await answerImportIssue(path.resolve(opts.project), sessionId, issueId, answer)
    console.log(`${session.id}\t${session.status}`)
  })
  projectOption(
    importCmd
      .command('land')
      .argument('<session-id>', 'Import session id')
      .description('Land confirmed import candidates')
  ).action(async (sessionId, opts) => {
    const session = await landImportSession(path.resolve(opts.project), sessionId)
    for (const item of session.landed) console.log(`${item.type}\t${item.title}\t${item.path}`)
  })
  projectOption(
    importCmd
      .command('show')
      .argument('<session-id>', 'Import session id')
      .description('Show an import session JSON')
  ).action(async (sessionId, opts) => {
    console.log(JSON.stringify(await loadImportSession(path.resolve(opts.project), sessionId), null, 2))
  })

  projectOption(
    program
      .command('context')
      .argument('<scene-id>', 'Scene id')
      .option('--run', 'Create a run and save context.md')
      .option('--trace', 'Print PromptBlocks and ContextTrace as JSON')
      .option('--preset <id>', 'Use a specific project writing preset')
      .description('Assemble context for a scene')
  ).action(async (sceneId, opts) => {
    const root = path.resolve(opts.project)
    const resolved = await resolveGenerationPreset(root, async () => loadAIConfig(), opts.preset)
    const config = resolved.config
    const packet = await assembleContextPacket(
      root,
      { type: 'scene', id: sceneId },
      contextCompileOptions(config, resolved.snapshot)
    )
    const context = renderContextPacket(packet)
    if (opts.run) {
      const run = await createRun(root, sceneId, {
        provider: config.provider,
        model: config.model,
        preset_id: resolved.snapshot.preset_id,
        preset_version: resolved.snapshot.preset_version,
        preset_sha256: resolved.snapshot.snapshot_sha256
      })
      await writeRunFile(root, run, 'context.md', context)
      await snapshotSharedGuidance(root, run, packet.shared_guidance)
      await snapshotContextCompilation(root, run, packet.prompt_blocks, packet.context_trace)
      await snapshotWritingPreset(root, run, resolved.snapshot)
      console.log(run.id)
    } else if (opts.trace) {
      console.log(
        JSON.stringify(
          { markdown: context, prompt_blocks: packet.prompt_blocks, context_trace: packet.context_trace },
          null,
          2
        )
      )
    } else {
      console.log(context)
    }
  })

  projectOption(
    program
      .command('generate')
      .argument('<scene-id>', 'Scene id')
      .option('--dry-run', 'Create context and prompt run but do not call AI')
      .option('--preset <id>', 'Use a specific project writing preset')
      .option('--candidates <count>', 'Create 2-8 independently retained candidates')
      .option('--parent-run <run-id>', 'Create a new branch from a retained candidate')
      .description('Generate a scene with configured OpenAI-compatible provider')
  ).action(async (sceneId, opts) => {
    const root = path.resolve(opts.project)
    const resolved = await resolveGenerationPreset(root, async () => loadAIConfig(), opts.preset)
    const config = resolved.config
    const packet = await assembleContextPacket(
      root,
      { type: 'scene', id: sceneId },
      contextCompileOptions(config, resolved.snapshot)
    )
    const context = renderContextPacket(packet)
    const requestedCount = opts.candidates === undefined ? undefined : Number(opts.candidates)
    const candidateCount = requestedCount ?? (opts.parentRun ? 3 : undefined)
    if (candidateCount !== undefined) {
      const request = {
        projectRoot: root,
        sceneId,
        context,
        config,
        count: candidateCount,
        parentRunId: opts.parentRun,
        sharedGuidance: packet.shared_guidance,
        compilation: {
          prompt_blocks: packet.prompt_blocks,
          context_trace: packet.context_trace,
          writing_preset: resolved.snapshot
        }
      }
      if (opts.dryRun) {
        const runs = await createGenerationCandidateRuns(request)
        console.log(`Created candidate group: ${runs[0]?.candidate_group_id}`)
        for (const run of runs) console.log(run.id)
        return
      }
      const group = await generateCandidateGroup(request)
      console.log(`Candidate group: ${group.id}\tbranch: ${group.branch_id}`)
      for (const candidate of group.candidates) {
        console.log(`--- ${candidate.run.id} ---`)
        console.log(candidate.output)
      }
      return
    }
    const run = await createGenerationRun(
      root,
      sceneId,
      context,
      config,
      {},
      packet.shared_guidance,
      undefined,
      {
        prompt_blocks: packet.prompt_blocks,
        context_trace: packet.context_trace,
        writing_preset: resolved.snapshot
      }
    )
    if (opts.dryRun) {
      console.log(`Created dry run: ${run.id}`)
      return
    }
    const output = await generateIntoRun(
      root,
      run,
      context,
      config,
      {},
      undefined,
      undefined,
      resolved.snapshot
    )
    console.log(output)
  })

  projectOption(
    program
      .command('check')
      .argument('<target-id>', 'Scene or outline id')
      .option('--type <type>', 'Target type: scene | outline', 'scene')
      .option('--run <run-id>', 'Also write report into run directory')
      .option('--semantic', 'Also run AI-assisted semantic consistency checks')
      .description('Run deterministic consistency checks for a scene or outline')
  ).action(async (targetId, opts) => {
    const root = path.resolve(opts.project)
    if (opts.type !== 'scene' && opts.type !== 'outline') {
      throw new Error(`Unsupported check target type: ${opts.type}. Expected scene or outline.`)
    }
    if (opts.semantic && opts.type !== 'scene') {
      throw new Error('AI semantic checks currently require a scene target.')
    }
    const candidateRun = opts.run ? (await listRuns(root)).find((item) => item.id === opts.run) : undefined
    if (opts.run && !candidateRun) throw new Error(`Run not found: ${opts.run}`)
    if (candidateRun && (opts.type !== 'scene' || candidateRun.scene_id !== targetId)) {
      throw new Error(`Run ${candidateRun.id} does not belong to scene ${targetId}.`)
    }
    const candidateContent = candidateRun
      ? await readRunFile(root, candidateRun.id, 'output-raw.md')
      : undefined
    const report =
      opts.type === 'outline'
        ? await checkTarget(root, { type: 'outline', id: targetId })
        : await checkScene(root, targetId, candidateContent)
    if (opts.semantic) {
      const config = loadAIConfig()
      const hasUsableConfig = Boolean(config.model && (config.apiKey || config.baseUrl.includes('localhost')))
      if (!hasUsableConfig) {
        report.semantic_status = 'unavailable'
        report.issues.push({
          severity: 'info',
          code: 'semantic-check-unavailable',
          message:
            'Semantic checks were not run because CLI AI is not configured. Set QUILL_AI_API_KEY, or set QUILL_AI_BASE_URL to a local OpenAI-compatible endpoint; omit --semantic to run deterministic checks only.'
        })
      } else {
        const semanticIssues = await runSemanticChecks(
          root,
          targetId,
          (prompt) =>
            generateText(prompt, config, undefined, {
              timeoutMs: SEMANTIC_CHECK_TIMEOUT_MS,
              ...(config.provider === 'deepseek' ? { responseFormat: 'json_object' as const } : {})
            }),
          candidateContent
        )
        report.semantic_status = semanticStatusFromIssues(semanticIssues)
        report.issues.push(...semanticIssues)
      }
    }
    const formatted = formatCheckReport(report)
    if (candidateRun) {
      const checked = { ...candidateRun, status: 'checked' as const }
      await writeRunFile(root, checked, 'check-report.md', formatted)
      await writeRunFile(
        root,
        checked,
        'evaluation.json',
        `${JSON.stringify(scoreCheckReport(report), null, 2)}\n`
      )
      await writeRunMetadata(root, checked)
    }
    console.log(formatted)
  })

  registerSillyTavernCommands(program, projectOption)

  const finalize = program.command('finalize').description('Manage final draft review sessions')
  projectOption(
    finalize
      .command('review-plan')
      .requiredOption('--chapter <id>', 'Chapter outline id')
      .requiredOption('--draft-file <path>', 'Draft text file')
      .requiredOption('--final-file <path>', 'Final text file')
      .option('--scenes <ids>', 'Comma-separated scene ids')
      .option('--ai-response <json>', 'AI JSON response to store into the session')
      .description('Create a finalize back-check session')
  ).action(async (opts) => {
    const root = path.resolve(opts.project)
    const session = await createFinalizeReviewSession(root, {
      chapterId: opts.chapter,
      sceneIds: csv(opts.scenes),
      draft: await readFileText(path.resolve(opts.draftFile)),
      final: await readFileText(path.resolve(opts.finalFile)),
      aiResponse: opts.aiResponse
    })
    console.log(`session: ${session.id}`)
    console.log(`status: ${session.status}`)
    console.log(`impacts: ${session.impacts.length}`)
    console.log(`questions: ${session.questions.length}`)
    if (!opts.aiResponse) console.log(buildFinalizeReviewPrompt(session))
  })
  projectOption(
    finalize
      .command('show')
      .argument('<session-id>', 'Review session id')
      .description('Show finalize review session JSON')
  ).action(async (sessionId, opts) => {
    console.log(
      JSON.stringify(await loadFinalizeReviewSession(path.resolve(opts.project), sessionId), null, 2)
    )
  })
  projectOption(
    finalize
      .command('confirm')
      .argument('<session-id>', 'Review session id')
      .argument('<impact-id>', 'Impact id')
      .argument('<answer>', 'Author answer')
      .option('--reject', 'Reject the impact')
      .description('Confirm or reject a finalize impact')
  ).action(async (sessionId, impactId, answer, opts) => {
    const session = await confirmFinalizeImpact(
      path.resolve(opts.project),
      sessionId,
      impactId,
      answer,
      opts.reject ? 'rejected' : 'confirmed'
    )
    console.log(`${session.id}\t${session.status}`)
  })

  projectOption(
    program
      .command('chapter-plan')
      .argument('<chapter-id>', 'Chapter outline id')
      .option('--preset <id>', 'Use a specific project writing preset')
      .description('Build ordered scene writing prompts for a chapter')
  ).action(async (chapterId, opts) => {
    const resolved = await resolveGenerationPreset(
      path.resolve(opts.project),
      async () => loadAIConfig(),
      opts.preset
    )
    const plan = await buildChapterWritingPlan(
      path.resolve(opts.project),
      chapterId,
      {},
      contextCompileOptions(resolved.config, resolved.snapshot)
    )
    console.log(JSON.stringify(plan, null, 2))
  })

  registerRunCommands(program, projectOption)

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

  async function readFileText(file: string): Promise<string> {
    const { readFile } = await import('node:fs/promises')
    return readFile(file, 'utf8')
  }

  return program
}

const entryPoint = process.argv[1]
if (entryPoint && import.meta.url === pathToFileURL(path.resolve(entryPoint)).href) {
  buildProgram()
    .parseAsync()
    .catch((err) => {
      console.error(err instanceof Error ? err.message : String(err))
      process.exitCode = 1
    })
}
