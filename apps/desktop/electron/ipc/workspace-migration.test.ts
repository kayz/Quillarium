import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { fingerprintTree, listWorkspaceProjects } from '@quillarium/core'
import { applyLegacyProjectMigration, prepareLegacyProjectMigration } from './workspace-migration.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('desktop legacy project migration', () => {
  it('keeps the source intact, creates an exact backup, verifies the target, and registers it', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'quillarium-desktop-migration-'))
    roots.push(root)
    const workspace = path.join(root, 'workspace')
    const source = path.join(root, 'legacy-vault', 'novels', 'Archive Project')
    await mkdir(path.join(workspace, 'projects'), { recursive: true })
    await mkdir(path.join(source, 'outlines'), { recursive: true })
    await mkdir(path.join(source, '.git'), { recursive: true })
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
    await writeFile(
      path.join(source, 'project.yaml'),
      [
        'schema_version: 1',
        'title: Archive Project',
        'genre: mystery',
        'target_words: 50000',
        'chapter_words: 2500',
        'section_words: 800',
        'current_volume: 1',
        'current_timeline_node: null',
        'default_theme: paper',
        ''
      ].join('\n'),
      'utf8'
    )
    await writeFile(path.join(source, 'outlines', 'chapter-one.md'), 'Original outline.\n', 'utf8')
    await writeFile(path.join(source, '.git', 'HEAD'), 'ref: refs/heads/main\n', 'utf8')

    const before = await fingerprintTree(source)
    const prepared = await prepareLegacyProjectMigration(source, workspace, { timestamp: 123 })
    expect(prepared.dryRun).toMatchObject({ mode: 'dry-run', verified: false })
    await expect(readFile(path.join(prepared.targetRoot, 'project.yaml'), 'utf8')).rejects.toThrow()

    const result = await applyLegacyProjectMigration(prepared)
    expect(result.applied).toMatchObject({ mode: 'apply', verified: true })
    expect(await fingerprintTree(source)).toEqual(before)
    expect(await fingerprintTree(prepared.backupRoot)).toEqual(before)
    await expect(readFile(path.join(prepared.targetRoot, '.git', 'HEAD'), 'utf8')).rejects.toThrow()
    const report = JSON.parse(await readFile(result.reportPath, 'utf8')) as {
      verified: boolean
      source_file_count: number
    }
    expect(report).toMatchObject({ verified: true, source_file_count: before.length })
    const projects = await listWorkspaceProjects(workspace)
    expect(projects.map((item) => item.config.id)).toEqual(['archive-project'])
  })
})
