import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { outlineSchema } from './schema.js'
import {
  applyProjectConfigMigration,
  fingerprintTree,
  loadProject,
  migrateOutlineCycleFields,
  migrateProjectLayout,
  planProjectConfigMigration,
  planProjectMigration
} from './index.js'
import { objectToYaml, parseMarkdown } from './yaml.js'

const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function legacyFixture(): Promise<{ base: string; source: string }> {
  const base = await mkdtemp(path.join(os.tmpdir(), 'quillarium-legacy-migration-'))
  temporaryRoots.push(base)
  const source = path.join(base, 'legacy-vault', 'novels', 'Archive Project')
  await mkdir(path.join(source, 'outlines'), { recursive: true })
  await mkdir(path.join(source, 'runs', 'run-one'), { recursive: true })
  await mkdir(path.join(source, '.git', 'objects'), { recursive: true })
  await writeFile(
    path.join(source, 'project.yaml'),
    `${objectToYaml({
      title: 'Archive Project',
      genre: 'mystery',
      target_words: 100000,
      chapter_words: 3000,
      section_words: 1000,
      current_volume: 1,
      current_timeline_node: null,
      default_theme: 'paper',
      schema_version: 1,
      custom_project_flag: 'preserve-me'
    })}\n`,
    'utf8'
  )
  await writeFile(
    path.join(source, 'outlines', 'volume-one.md'),
    `---\nid: volume-one\ntype: outline\nschema_version: 1\ntitle: Volume One\nstatus: draft\ntags: []\nlevel: volume\nwriter_cycles:\n  - desire\n  - pressure\ncustom_frontmatter: preserve-me\n---\n\n# Volume One\n\nOriginal outline body.\n`,
    'utf8'
  )
  await writeFile(
    path.join(source, 'runs', 'run-one', 'metadata.yaml'),
    'id: run-one\nstatus: generated\nunknown_run_field: preserve-me\n',
    'utf8'
  )
  await writeFile(path.join(source, 'runs', 'run-one', 'output-raw.md'), 'Original output.\n', 'utf8')
  await writeFile(path.join(source, '.git', 'HEAD'), 'ref: refs/heads/main\n', 'utf8')
  await writeFile(path.join(source, '.git', 'objects', 'placeholder'), 'git-internal\n', 'utf8')
  return { base, source }
}

describe('project and outline compatibility migrations', () => {
  it('reads v1 as v2 in memory without silently rewriting and explicitly backs up upgrades', async () => {
    const { base, source } = await legacyFixture()
    const projectFile = path.join(source, 'project.yaml')
    const before = await readFile(projectFile, 'utf8')

    const loaded = await loadProject(source)
    expect(loaded).toMatchObject({
      id: 'archive-project',
      aliases: [],
      title: 'Archive Project',
      synopsis: '',
      cover: null,
      schema_version: 2
    })
    await expect(readFile(projectFile, 'utf8')).resolves.toBe(before)

    const plan = await planProjectConfigMigration(source, {
      id: 'stable-archive',
      aliases: ['Archive Draft']
    })
    expect(plan).toMatchObject({ from_version: 1, to_version: 2, changed: true })
    const backupPath = path.join(base, 'backups', 'project-v1.yaml')
    const applied = await applyProjectConfigMigration(source, {
      id: 'stable-archive',
      aliases: ['Archive Draft'],
      backup_path: backupPath
    })
    expect(applied).toMatchObject({ changed: true, backup_path: path.resolve(backupPath) })
    await expect(readFile(backupPath, 'utf8')).resolves.toBe(before)
    expect(await loadProject(source)).toMatchObject({
      id: 'stable-archive',
      aliases: ['Archive Draft'],
      schema_version: 2
    })
    const upgraded = parseMarkdown<Record<string, unknown>>(
      `---\n${await readFile(projectFile, 'utf8')}\n---\n`
    ).data
    expect(upgraded['custom_project_flag']).toBe('preserve-me')
  })

  it('prefers the current cycle field and offers an explicit legacy-key rewrite', async () => {
    const currentWins = outlineSchema.parse({
      id: 'volume-current',
      type: 'outline',
      title: 'Current Volume',
      level: 'volume',
      story_cycles: ['growth'],
      writer_cycles: ['pressure']
    })
    expect(currentWins.story_cycles).toEqual(['growth'])
    expect(currentWins).not.toHaveProperty('writer_cycles')

    const { base, source } = await legacyFixture()
    const dryRun = await migrateOutlineCycleFields(source)
    expect(dryRun).toMatchObject({ mode: 'dry-run', verified: false })
    expect(dryRun.changed_paths).toEqual(['outlines/volume-one.md'])
    const original = await readFile(path.join(source, 'outlines', 'volume-one.md'), 'utf8')
    expect(original).toContain('writer_cycles:')

    const backupRoot = path.join(base, 'outline-backup')
    const applied = await migrateOutlineCycleFields(source, { apply: true, backup_root: backupRoot })
    expect(applied).toMatchObject({ mode: 'apply', verified: true })
    const migrated = await readFile(path.join(source, 'outlines', 'volume-one.md'), 'utf8')
    expect(migrated).toContain('story_cycles:')
    expect(migrated).not.toContain('writer_cycles:')
    const parsed = parseMarkdown<Record<string, unknown>>(migrated)
    expect(parsed.data['custom_frontmatter']).toBe('preserve-me')
    await expect(readFile(path.join(backupRoot, 'outlines', 'volume-one.md'), 'utf8')).resolves.toBe(original)
  })

  it('classifies a legacy book document with an explicit overview title as overview', () => {
    const legacyOverview = outlineSchema.parse({
      id: 'legacy-overview',
      type: 'outline',
      title: 'Sample Story 总纲与总览',
      level: 'book'
    })

    expect(legacyOverview.level).toBe('overview')
  })
})

describe('lossless legacy layout migration', () => {
  it('runs dry-run, backup, apply, verify, and report while preserving invariant hashes', async () => {
    const { base, source } = await legacyFixture()
    const target = path.join(base, 'workspace', 'projects', 'archive-project')
    const backup = path.join(base, 'migration-backup', 'archive-project')
    const sourceBefore = await fingerprintTree(source)

    const dryRun = await planProjectMigration({
      source_root: source,
      target_root: target,
      id: 'archive-project',
      aliases: ['Archive Draft'],
      backup_root: backup
    })
    expect(dryRun.mode).toBe('dry-run')
    expect(dryRun.stages.map((stage) => [stage.name, stage.status])).toEqual([
      ['dry-run', 'completed'],
      ['backup', 'pending'],
      ['apply', 'pending'],
      ['verify', 'pending'],
      ['report', 'completed']
    ])
    expect(dryRun.source_file_count).toBe(sourceBefore.length)
    expect(dryRun.managed_file_count).toBe(sourceBefore.length - 2)
    expect(dryRun.file_count).toBe(dryRun.managed_file_count)
    expect(dryRun.excluded_paths).toEqual(['.git/HEAD', '.git/objects/placeholder'])
    await expect(readFile(path.join(target, 'project.yaml'), 'utf8')).rejects.toThrow()

    const report = await migrateProjectLayout({
      source_root: source,
      target_root: target,
      id: 'archive-project',
      aliases: ['Archive Draft'],
      backup_root: backup
    })
    expect(report.mode).toBe('apply')
    expect(report.verified).toBe(true)
    expect(report.source_file_count).toBe(sourceBefore.length)
    expect(report.managed_file_count).toBe(sourceBefore.length - 2)
    expect(report.target_file_count).toBe(sourceBefore.length - 2)
    expect(report.target_files).toHaveLength(sourceBefore.length - 2)
    expect(report.stages.every((stage) => stage.status === 'completed')).toBe(true)
    expect(await fingerprintTree(source)).toEqual(sourceBefore)
    expect(await fingerprintTree(backup)).toEqual(sourceBefore)

    const targetByPath = new Map(report.target_files.map((item) => [item.path, item.sha256]))
    for (const sourceFile of sourceBefore) {
      if (sourceFile.path.startsWith('.git/')) continue
      if (sourceFile.path === 'project.yaml') continue
      expect(targetByPath.get(sourceFile.path)).toBe(sourceFile.sha256)
    }
    await expect(readFile(path.join(target, '.git', 'HEAD'), 'utf8')).rejects.toThrow()
    expect(await loadProject(target)).toMatchObject({
      id: 'archive-project',
      aliases: ['Archive Draft'],
      schema_version: 2
    })
    const targetProject = parseMarkdown<Record<string, unknown>>(
      `---\n${await readFile(path.join(target, 'project.yaml'), 'utf8')}\n---\n`
    ).data
    expect(targetProject['custom_project_flag']).toBe('preserve-me')
  })
})
