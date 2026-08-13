import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  createOutline,
  createProjectAt,
  createRun,
  createScene,
  exportManuscript,
  pathExists,
  readText,
  writeRunFile,
  type RunMetadata,
  type SceneDoc
} from './index.js'

async function createTestProject(base: string, id: string, title: string) {
  return createProjectAt(path.join(base, 'projects', id), { id, title, genre: 'test' })
}

interface TestSceneOptions {
  id: string
  section: string
  volume?: string
  status?: SceneDoc['status']
  chapterNumber?: string
  previousScene?: string | null
}

describe('manuscript export', () => {
  it('walks the real outline tree in stable order and exports accepted prose only', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'quillarium-export-'))
    try {
      const project = await createTestProject(tmp, 'export-story', 'Export Story')
      await createOutline(project.root, 'book', 'The Book', { id: 'book-main', order: 0 })
      await createOutline(project.root, 'volume', 'Volume One', {
        id: 'volume-main',
        parent: 'book-main',
        order: 0
      })
      // Create the lexically later part first. Equal order must still resolve by stable ID.
      await createOutline(project.root, 'arc', 'Hidden Arc Z', {
        id: 'arc-z',
        parent: 'volume-main',
        order: 7
      })
      await createOutline(project.root, 'act', 'Hidden Act Z', {
        id: 'act-z',
        parent: 'arc-z',
        order: 0
      })
      await createOutline(project.root, 'chapter', 'Chapter Z', {
        id: 'chapter-z',
        parent: 'act-z',
        order: 0
      })
      await createOutline(project.root, 'section', 'Section Z', {
        id: 'section-z',
        parent: 'chapter-z',
        order: 0
      })
      await createOutline(project.root, 'arc', 'Hidden Arc A', {
        id: 'arc-a',
        parent: 'volume-main',
        order: 7
      })
      await createOutline(project.root, 'chapter', 'Chapter A', {
        id: 'chapter-a',
        parent: 'arc-a',
        order: 0
      })
      await createOutline(project.root, 'section', 'Section A', {
        id: 'section-a',
        parent: 'chapter-a',
        order: 0
      })

      await createTestScene(
        project.root,
        'Alpha accepted scene',
        {
          id: 'scene-alpha',
          section: 'section-a',
          volume: 'volume-main',
          status: 'final',
          chapterNumber: '99'
        },
        'FINAL FALLBACK MUST NOT LEAK'
      )
      await writeAcceptedOutput(
        project.root,
        'scene-alpha',
        {
          id: 'run-alpha-legacy',
          status: 'generated',
          created_at: '2026-02-01T00:00:00.000Z'
        },
        'NEWER LEGACY MUST NOT WIN'
      )
      await writeAcceptedOutput(
        project.root,
        'scene-alpha',
        {
          id: 'run-alpha-accepted',
          status: 'accepted',
          created_at: '2026-01-01T00:00:00.000Z'
        },
        '**Alpha accepted**\n\n[Second paragraph](https://example.test)'
      )

      await createTestScene(project.root, 'Legacy CLI scene', {
        id: 'scene-legacy',
        section: 'section-z',
        volume: 'volume-main',
        chapterNumber: '10'
      })
      await writeAcceptedOutput(
        project.root,
        'scene-legacy',
        {
          id: 'run-legacy',
          status: 'generated',
          created_at: '2026-03-01T00:00:00.000Z'
        },
        'Legacy **accepted output**'
      )

      await createTestScene(
        project.root,
        'Final scene',
        {
          id: 'scene-final',
          section: 'section-z',
          volume: 'volume-main',
          status: 'final',
          chapterNumber: '1',
          previousScene: 'scene-legacy'
        },
        'Final _fallback_ prose'
      )
      await createTestScene(
        project.root,
        'Unaccepted draft',
        {
          id: 'scene-draft',
          section: 'section-z',
          volume: 'volume-main',
          chapterNumber: '20'
        },
        'DRAFT MUST NOT LEAK'
      )
      await createTestScene(project.root, 'Empty accepted scene', {
        id: 'scene-empty',
        section: 'section-z',
        volume: 'volume-main',
        chapterNumber: '30'
      })
      await createRun(project.root, 'scene-empty', {
        id: 'run-empty',
        status: 'accepted',
        created_at: '2026-04-01T00:00:00.000Z'
      })
      await createTestScene(project.root, 'Checked but unaccepted scene', {
        id: 'scene-checked',
        section: 'section-z',
        volume: 'volume-main',
        chapterNumber: '35'
      })
      await writeAcceptedOutput(
        project.root,
        'scene-checked',
        {
          id: 'run-checked',
          status: 'checked',
          created_at: '2026-04-02T00:00:00.000Z'
        },
        'CHECKED MUST NOT LEAK'
      )
      await createTestScene(project.root, 'Orphan scene', {
        id: 'scene-orphan',
        section: 'missing-section',
        volume: 'volume-main',
        chapterNumber: '40'
      })

      const result = await exportManuscript(project.root)
      const markdown = await readText(result.markdown_path)
      const text = await readText(result.text_path)

      expect(result.volume_id).toBeNull()
      expect(result.exported_scenes).toEqual([
        {
          scene_id: 'scene-alpha',
          scene_title: 'Alpha accepted scene',
          outline_id: 'section-a',
          source: 'accepted_run',
          run_id: 'run-alpha-accepted'
        },
        {
          scene_id: 'scene-legacy',
          scene_title: 'Legacy CLI scene',
          outline_id: 'section-z',
          source: 'accepted_output',
          run_id: 'run-legacy'
        },
        {
          scene_id: 'scene-final',
          scene_title: 'Final scene',
          outline_id: 'section-z',
          source: 'final_scene',
          run_id: null
        }
      ])
      expect(markdown.indexOf('Alpha accepted')).toBeLessThan(markdown.indexOf('Legacy CLI scene'))
      expect(markdown.indexOf('Legacy CLI scene')).toBeLessThan(markdown.indexOf('Final scene'))
      expect(markdown).toContain('# The Book')
      expect(markdown).toContain('## Volume One')
      expect(markdown).toContain('### Hidden Arc A')
      expect(markdown).toContain('##### Chapter A')
      expect(markdown).toContain('###### Section A')
      expect(markdown).toContain('##### Alpha accepted scene')
      expect(markdown).toContain('#### Hidden Act Z')
      expect(markdown).toContain('### Hidden Arc Z')
      expect(markdown).not.toContain('FINAL FALLBACK MUST NOT LEAK')
      expect(markdown).not.toContain('NEWER LEGACY MUST NOT WIN')
      expect(markdown).not.toContain('DRAFT MUST NOT LEAK')
      expect(markdown).not.toContain('CHECKED MUST NOT LEAK')
      expect(markdown).toContain('| scene-draft | Unaccepted draft | section-z | Section Z | not_accepted |')
      expect(markdown).toContain(
        '| scene-empty | Empty accepted scene | section-z | Section Z | missing_content |'
      )
      expect(markdown).toContain(
        '| scene-checked | Checked but unaccepted scene | section-z | Section Z | not_accepted |'
      )
      expect(markdown).toContain('| scene-orphan | Orphan scene | missing-section |  | missing_outline |')
      expect(text).toContain('Alpha accepted\n\nSecond paragraph')
      expect(text).toContain('Legacy accepted output')
      expect(text).toContain('Final fallback prose')
      expect(text).not.toContain('**Alpha accepted**')
      expect(text).not.toContain('[Second paragraph]')
      expect(text).not.toContain('_fallback_')
      expect(text).not.toMatch(/^#{1,6}\s/m)
      expect(result.gaps).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ scene_id: 'scene-draft', reason: 'not_accepted' }),
          expect.objectContaining({ scene_id: 'scene-empty', reason: 'missing_content' }),
          expect.objectContaining({ scene_id: 'scene-checked', reason: 'not_accepted' }),
          expect.objectContaining({ scene_id: 'scene-orphan', reason: 'missing_outline' })
        ])
      )
    } finally {
      await rm(tmp, { recursive: true, force: true })
      expect(await pathExists(tmp)).toBe(false)
    }
  })

  it('filters one volume and keeps export filenames inside the exports directory', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'quillarium-volume-export-'))
    try {
      const project = await createTestProject(tmp, 'filter-story', 'Filter Story')
      await createOutline(project.root, 'book', 'Filter Book', { id: 'book-filter' })
      await createOutline(project.root, 'volume', 'Volume One', {
        id: 'volume-one',
        parent: 'book-filter',
        order: 0
      })
      await createOutline(project.root, 'part', 'First Part', {
        id: 'part-one',
        parent: 'volume-one'
      })
      await createOutline(project.root, 'chapter', 'Chapter One', {
        id: 'chapter-one',
        parent: 'part-one'
      })
      await createOutline(project.root, 'volume', 'Volume Two ../危局:*?', {
        id: 'volume-two',
        parent: 'book-filter',
        order: 1
      })
      await createOutline(project.root, 'part', 'Second Part', {
        id: 'part-two',
        parent: 'volume-two'
      })
      await createOutline(project.root, 'act', 'Second Act', {
        id: 'act-two',
        parent: 'part-two'
      })
      await createOutline(project.root, 'chapter', 'Chapter Two', {
        id: 'chapter-two',
        parent: 'act-two'
      })
      await createTestScene(project.root, 'Other volume scene', {
        id: 'scene-volume-one',
        section: 'chapter-one',
        volume: 'volume-one'
      })
      await writeAcceptedOutput(
        project.root,
        'scene-volume-one',
        {
          id: 'run-volume-one',
          status: 'accepted'
        },
        'OTHER VOLUME MUST NOT LEAK'
      )
      await createTestScene(project.root, 'Selected volume scene', {
        id: 'scene-volume-two',
        section: 'chapter-two',
        volume: 'volume-two'
      })
      await writeAcceptedOutput(
        project.root,
        'scene-volume-two',
        {
          id: 'run-volume-two',
          status: 'accepted'
        },
        'Selected volume prose'
      )
      await createTestScene(project.root, 'Selected orphan', {
        id: 'scene-selected-orphan',
        section: 'missing-in-volume-two',
        volume: 'volume-two'
      })

      const result = await exportManuscript(project.root, { volumeId: 'volume-two' })
      const markdown = await readText(result.markdown_path)
      const exportsDir = path.resolve(project.root, 'exports')

      expect(result.volume_id).toBe('volume-two')
      expect(result.exported_scenes.map((item) => item.scene_id)).toEqual(['scene-volume-two'])
      expect(result.gaps.map((item) => item.scene_id)).toEqual(['scene-selected-orphan'])
      expect(markdown).toContain('# Filter Book')
      expect(markdown).toContain('## Volume Two ../危局:*?')
      expect(markdown).toContain('Selected volume prose')
      expect(markdown).not.toContain('OTHER VOLUME MUST NOT LEAK')
      expect(path.dirname(result.markdown_path)).toBe(exportsDir)
      expect(path.dirname(result.text_path)).toBe(exportsDir)
      expect(path.basename(result.markdown_path)).not.toMatch(/[\\/:*?"<>|]/)
      expect(path.basename(result.text_path)).not.toMatch(/[\\/:*?"<>|]/)
      await expect(exportManuscript(project.root, { volumeId: 'missing-volume' })).rejects.toThrow(
        'Volume outline not found: missing-volume'
      )
    } finally {
      await rm(tmp, { recursive: true, force: true })
      expect(await pathExists(tmp)).toBe(false)
    }
  })

  it('uses the project title when a project has no book outline', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'quillarium-project-heading-export-'))
    try {
      const project = await createTestProject(tmp, 'outline-light-story', 'Outline-light Story')
      await createOutline(
        project.root,
        'chapter',
        'Standalone Chapter',
        {
          id: 'standalone-chapter'
        },
        '',
        { placement: 'legacy-import' }
      )
      await createTestScene(
        project.root,
        'Standalone final scene',
        {
          id: 'standalone-scene',
          section: 'standalone-chapter',
          status: 'final'
        },
        'Standalone prose'
      )

      const result = await exportManuscript(project.root)
      const markdown = await readText(result.markdown_path)

      expect(markdown).toMatch(/^# Outline-light Story\n\n##### Standalone Chapter/m)
      expect(result.exported_scenes.map((item) => item.scene_id)).toEqual(['standalone-scene'])
      expect(result.gaps).toEqual([])
    } finally {
      await rm(tmp, { recursive: true, force: true })
      expect(await pathExists(tmp)).toBe(false)
    }
  })
})

async function createTestScene(
  projectRoot: string,
  title: string,
  options: TestSceneOptions,
  content = ''
): Promise<void> {
  await createScene(
    projectRoot,
    title,
    {
      id: options.id,
      section: options.section,
      volume: options.volume ?? '',
      status: options.status ?? 'draft',
      chapter_number: options.chapterNumber ?? '',
      previous_scene: options.previousScene ?? null,
      timeline_node: 'timeline-export',
      location: 'location-export',
      pov: 'character-export',
      tags: options.volume ? [options.volume] : []
    },
    content
  )
}

async function writeAcceptedOutput(
  projectRoot: string,
  sceneId: string,
  metadata: Partial<RunMetadata> & Pick<RunMetadata, 'id' | 'status'>,
  content: string
): Promise<void> {
  const run = await createRun(projectRoot, sceneId, metadata)
  await writeRunFile(projectRoot, run, 'output-accepted.md', content)
}
