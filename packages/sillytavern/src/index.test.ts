import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { deflateSync } from 'node:zlib'
import {
  createCanon,
  createCharacter,
  createCharacterRelation,
  createFaction,
  createFactionMembership,
  createFactionRelation,
  createLocation,
  createProjectAt,
  createWorldEntry,
  ensureDir,
  listDocs,
  loadProject,
  requireDoc,
  updateProjectConfig,
  writeText,
  type CharacterDoc
} from '@quillarium/core'
import { afterEach, describe, expect, it } from 'vitest'
import {
  exportCharacterCardV2,
  exportCharacterCardV2Json,
  importBookCharacterCardIntoProject,
  inspectBookCharacterCard,
  exportWorldInfo,
  exportWorldInfoJson,
  extractCharacterCardJsonFromPng,
  importCharacterCard,
  importCharacterCardJson,
  importCharacterCardPng,
  parseCharacterCardJson,
  parseCharacterCardPng,
  writeCharacterCardV2File,
  writeBookCharacterCardV3Png,
  writeWorldInfoFile
} from './index.js'

const temporaryVaults: string[] = []
let projectSequence = 0

afterEach(async () => {
  await Promise.all(temporaryVaults.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function project(): Promise<{ vault: string; root: string }> {
  const vault = await mkdtemp(path.join(os.tmpdir(), 'quillarium-sillytavern-'))
  temporaryVaults.push(vault)
  const id = `card-project-${++projectSequence}`
  const created = await createProjectAt(path.join(vault, 'projects', id), { id, title: 'Card Project' })
  return { vault, root: created.root }
}

function v2Card(name = 'Mira') {
  return {
    spec: 'chara_card_v2',
    spec_version: '2.0',
    top_level_future_field: { retained: true },
    data: {
      name,
      description: 'A cartographer of impossible coastlines.',
      personality: 'Patient, precise, and quietly defiant.',
      scenario: 'The harbor map has changed overnight.',
      first_mes: '“That island was not there yesterday.”',
      mes_example: '{{char}}: Mark the tide before it moves again.',
      creator_notes: 'Keep the mystery grounded in observed details.',
      system_prompt: 'Never reveal hidden geography without evidence.',
      post_history_instructions: 'Use concise nautical language.',
      alternate_greetings: ['The compass needle circles.', 'A new inlet cuts through the map.'],
      tags: ['cartographer', 'harbor'],
      creator: 'fixture-author',
      character_version: '2.4',
      extensions: { fixture_extension: { enabled: true, mode: 'strict' } },
      character_book: { name: 'Mira lore', entries: [{ keys: ['island'], content: 'It moves.' }] },
      future_optional_field: ['must', 'survive', 'raw']
    }
  }
}

function v3Card(name = 'Vesper') {
  return {
    spec: 'chara_card_v3',
    spec_version: '3.0',
    data: {
      ...v2Card(name).data,
      description: 'A V3 observer who remembers erased timelines.',
      creator: 'v3-author',
      character_version: '3.1',
      extensions: { v3_unknown_extension: { nested: ['preserved'] } },
      assets: [{ type: 'icon', uri: 'ccdefault:', name: 'main', ext: 'png' }],
      nickname: 'The Witness'
    }
  }
}

function v3BookCard(entries: Array<{ id: string; title: string; content?: string }>, name = 'Imported Book') {
  const card = v3Card(name)
  card.data.character_book = {
    name: `${name} setting`,
    entries: entries.map((entry, index) => ({
      id: index + 1,
      keys: [entry.title],
      name: entry.title,
      content: entry.content ?? `Content for ${entry.title}`,
      extensions: {
        quillarium: {
          stable_id: entry.id,
          type: 'world_entry',
          fields: {}
        }
      }
    }))
  }
  return card
}

describe('Character Card JSON import and V2 export', () => {
  it('imports a V2 JSON file, preserves the exact raw JSON, and round-trips key fields', async () => {
    const { vault, root } = await project()
    const sourceDir = path.join(vault, 'incoming')
    await mkdir(sourceDir)
    const sourcePath = path.join(sourceDir, 'mira.card.json')
    const raw = `\n${JSON.stringify(v2Card(), null, 2)}\n`
    await writeFile(sourcePath, raw, 'utf8')

    const imported = await importCharacterCard(root, sourcePath)
    const character = await requireDoc<CharacterDoc>(root, imported.characterId)
    const exported = await exportCharacterCardV2(root, imported.characterId)

    expect(imported).toMatchObject({ format: 'v2', source: 'json' })
    expect(path.dirname(imported.rawPath)).toBe(path.join(root, 'sillytavern'))
    expect(await readFile(imported.rawPath, 'utf8')).toBe(raw)
    expect(JSON.parse(await readFile(imported.rawPath, 'utf8'))).toMatchObject({
      top_level_future_field: { retained: true },
      data: {
        future_optional_field: ['must', 'survive', 'raw'],
        extensions: { fixture_extension: { enabled: true, mode: 'strict' } }
      }
    })
    expect(character.data).toMatchObject({
      title: 'Mira',
      tags: ['cartographer', 'harbor'],
      speech_style: 'Patient, precise, and quietly defiant.',
      active_flags: ['sillytavern-import']
    })
    expect(character.content).toContain('## First Message')
    expect(exported).toMatchObject({
      spec: 'chara_card_v2',
      spec_version: '2.0',
      data: {
        name: 'Mira',
        description: 'A cartographer of impossible coastlines.',
        personality: 'Patient, precise, and quietly defiant.',
        scenario: 'The harbor map has changed overnight.',
        first_mes: '“That island was not there yesterday.”',
        mes_example: '{{char}}: Mark the tide before it moves again.',
        alternate_greetings: ['The compass needle circles.', 'A new inlet cuts through the map.'],
        creator: 'fixture-author',
        character_version: '2.4',
        extensions: { fixture_extension: { enabled: true, mode: 'strict' } }
      }
    })
    expect(JSON.parse(await exportCharacterCardV2Json(root, imported.characterId))).toEqual(exported)
  }, 15_000)

  it('imports V3 JSON while retaining V3-only and unknown data in the raw sidecar', async () => {
    const { root } = await project()
    const card = v3Card()
    const raw = JSON.stringify(card)

    const imported = await importCharacterCardJson(root, raw, { sourceName: 'vesper.v3.json' })
    const character = await requireDoc<CharacterDoc>(root, imported.characterId)
    const saved = JSON.parse(await readFile(imported.rawPath, 'utf8'))
    const v2 = await exportCharacterCardV2(root, imported.characterId)

    expect(imported).toMatchObject({ format: 'v3', source: 'json' })
    expect(character.data.title).toBe('Vesper')
    expect(saved.data.assets).toEqual(card.data.assets)
    expect(saved.data.nickname).toBe('The Witness')
    expect(saved.data.extensions).toEqual(card.data.extensions)
    expect(v2).toMatchObject({
      spec: 'chara_card_v2',
      spec_version: '2.0',
      data: {
        name: 'Vesper',
        description: 'A V3 observer who remembers erased timelines.',
        extensions: { v3_unknown_extension: { nested: ['preserved'] } }
      }
    })
  })

  it('exports a native Quillarium character as a complete normative V2 envelope', async () => {
    const { root } = await project()
    await createCharacter(
      root,
      'Native Hero',
      {
        tags: ['hero'],
        aliases: ['The Watcher'],
        role: 'protagonist',
        speech_style: 'Terse and observant.',
        desire: 'Protect the archive',
        fear: 'Being forgotten',
        bottom_line: 'Never destroys a record',
        motivation_anchors: ['the blue ledger'],
        relationships: { 'char-ally': 'trusted' },
        arc: { volume_one: { start: 'isolated', end: 'allied' } },
        ooc_guardrails: ['Never boasts'],
        active_flags: ['watchful'],
        disclosure: [{ segment: 'chapter-010', reveal_after: 'chapter-009' }],
        scene_state: {
          current_location: 'archive',
          carried_items: ['blue ledger'],
          emotional_state: 'alert'
        }
      },
      'A native Quillarium profile.'
    )
    const character = await requireDoc<CharacterDoc>(root, 'char-native-hero')

    const exported = await exportCharacterCardV2(root, character.data.id)
    const firstWrite = await writeCharacterCardV2File(root, character.data.id)
    const secondWrite = await writeCharacterCardV2File(root, character.data.id)

    expect({ ...exported, data: { ...exported.data, extensions: {} } }).toEqual({
      spec: 'chara_card_v2',
      spec_version: '2.0',
      data: {
        name: 'Native Hero',
        description: 'A native Quillarium profile.',
        personality: 'Terse and observant.',
        scenario: '',
        first_mes: '',
        mes_example: '',
        creator_notes: '',
        system_prompt: '',
        post_history_instructions: '',
        alternate_greetings: [],
        tags: ['hero'],
        creator: 'Quillarium',
        character_version: '1.0',
        extensions: {}
      }
    })
    expect(exported.data.extensions.quillarium).toEqual({
      schema_version: 1,
      source_id: character.data.id,
      aliases: ['The Watcher'],
      role: 'protagonist',
      speech_style: 'Terse and observant.',
      desire: 'Protect the archive',
      fear: 'Being forgotten',
      bottom_line: 'Never destroys a record',
      motivation_anchors: ['the blue ledger'],
      relationships: { 'char-ally': 'trusted' },
      arc: { volume_one: { start: 'isolated', end: 'allied' } },
      ooc_guardrails: ['Never boasts'],
      active_flags: ['watchful'],
      disclosure: [{ segment: 'chapter-010', reveal_after: 'chapter-009' }],
      scene_state: {
        current_location: 'archive',
        carried_items: ['blue ledger'],
        emotional_state: 'alert'
      }
    })
    const roundTrip = await importCharacterCardJson(root, JSON.stringify(exported), {
      sourceName: 'native-hero-round-trip.json'
    })
    const roundTrippedCharacter = await requireDoc<CharacterDoc>(root, roundTrip.characterId)
    expect(roundTrippedCharacter.data).toMatchObject({
      aliases: ['The Watcher'],
      role: 'protagonist',
      speech_style: 'Terse and observant.',
      desire: 'Protect the archive',
      fear: 'Being forgotten',
      bottom_line: 'Never destroys a record',
      motivation_anchors: ['the blue ledger'],
      relationships: { 'char-ally': 'trusted' },
      arc: { volume_one: { start: 'isolated', end: 'allied' } },
      ooc_guardrails: ['Never boasts'],
      active_flags: ['watchful', 'sillytavern-import'],
      disclosure: [{ segment: 'chapter-010', reveal_after: 'chapter-009' }],
      scene_state: {
        current_location: 'archive',
        carried_items: ['blue ledger'],
        emotional_state: 'alert'
      }
    })
    expect(firstWrite).toEqual(secondWrite)
    expect(firstWrite).toMatchObject({ format: 'v2', characterId: character.data.id })
    expect(path.relative(root, firstWrite.outputPath).replace(/\\/g, '/')).toBe(
      'sillytavern/char-native-hero-card-v2.json'
    )
    expect(JSON.parse(await readFile(firstWrite.outputPath, 'utf8'))).toEqual(exported)
  })

  it('sanitizes hostile source names and never writes raw copies outside the project', async () => {
    const { root } = await project()

    const imported = await importCharacterCardJson(root, JSON.stringify(v2Card('Safe Name')), {
      sourceName: '../../escape\u0000.json'
    })

    expect(path.relative(root, imported.rawPath).replace(/\\/g, '/')).toMatch(
      /^sillytavern\/escape-v2-raw\.json$/
    )
    expect(await readFile(imported.rawPath, 'utf8')).toContain('Safe Name')
  })
})

describe('PNG Character Cards', () => {
  it('prefers a ccv3 tEXt payload over chara regardless of chunk order', async () => {
    const { root } = await project()
    const rawV2 = JSON.stringify(v2Card('Legacy Card'))
    const rawV3 = JSON.stringify(v3Card('Preferred Card'))
    const png = makeCardPng([
      ['chara', Buffer.from(rawV2).toString('base64')],
      ['ccv3', Buffer.from(rawV3).toString('base64')]
    ])

    const parsed = parseCharacterCardPng(png)
    const extracted = extractCharacterCardJsonFromPng(png)
    const imported = await importCharacterCardPng(root, png, { sourceName: '../preferred.png' })
    const character = await requireDoc<CharacterDoc>(root, imported.characterId)

    expect(parsed).toMatchObject({ format: 'v3', pngKeyword: 'ccv3' })
    expect(parsed.card.data.name).toBe('Preferred Card')
    expect(extracted).toEqual({ keyword: 'ccv3', rawJson: rawV3 })
    expect(imported).toMatchObject({ format: 'v3', source: 'png', pngKeyword: 'ccv3' })
    expect(character.data.title).toBe('Preferred Card')
    expect(await readFile(imported.rawPath, 'utf8')).toBe(rawV3)
  })

  it('accepts the compatible chara PNG keyword for V2 cards and file-based import', async () => {
    const { vault, root } = await project()
    const raw = JSON.stringify(v2Card('PNG V2'))
    const png = makeCardPng([['chara', Buffer.from(raw).toString('base64')]])
    const input = path.join(vault, 'card-without-png-extension.bin')
    await writeFile(input, png)

    const imported = await importCharacterCard(root, input)

    expect(parseCharacterCardPng(png)).toMatchObject({ format: 'v2', pngKeyword: 'chara' })
    expect(imported).toMatchObject({ format: 'v2', source: 'png', pngKeyword: 'chara' })
    expect(await readFile(imported.rawPath, 'utf8')).toBe(raw)
  })
})

describe('World Info export', () => {
  it('maps Canon and world entries into entries with tag/title keys and body content', async () => {
    const { root } = await project()
    await Promise.all([
      createCanon(root, 'Moon Law', 'Canon body: the moon never sets.', {
        tags: ['moon', 'night']
      }),
      createWorldEntry(
        root,
        'Glass Harbor',
        { tags: ['harbor', 'moon'], triggers: ['glass-tide'], entry_status: 'active' },
        'World body: every pier is transparent.'
      )
    ])

    const worldInfo = await exportWorldInfo(root)
    const written = await writeWorldInfoFile(root)
    const entries = Object.values(worldInfo.entries)
    const canon = entries.find((entry) => entry.comment === 'Moon Law')
    const world = entries.find((entry) => entry.comment === 'Glass Harbor')

    expect(entries).toHaveLength(2)
    expect(canon).toMatchObject({ key: ['moon', 'night', 'Moon Law'], disable: false })
    expect(canon?.content).toContain('Canon body: the moon never sets.')
    expect(world).toMatchObject({
      key: ['glass-tide', 'harbor', 'moon', 'Glass Harbor'],
      keysecondary: [],
      selective: false,
      disable: false
    })
    expect(world?.content).toContain('World body: every pier is transparent.')
    expect(JSON.parse(await exportWorldInfoJson(root))).toEqual(worldInfo)
    expect(written).toMatchObject({ format: 'world-info', entryCount: 2 })
    expect(path.relative(root, written.outputPath).replace(/\\/g, '/')).toBe(
      'sillytavern/quillarium-world-info.json'
    )
    expect(JSON.parse(await readFile(written.outputPath, 'utf8'))).toEqual(worldInfo)
  })
})

describe('CCv3 novel setting card boundary', () => {
  it('exports one readable cover PNG with complete allowlisted world book data and imports it as reviewable candidates', async () => {
    const { vault, root } = await project()
    await updateProjectConfig(root, {
      synopsis: 'A city protects its memories from the tide.'
    })
    await createCanon(
      root,
      'Memory law',
      'Never delete a memory. C:\\Users\\author\\secret.txt\nsk-testcredential12345\napi_key=fixture-secret',
      {
        id: 'canon-memory-law',
        status: 'confirmed'
      }
    )
    await createWorldEntry(
      root,
      'Glass tide',
      { id: 'world-glass-tide', entry_status: 'active', status: 'active', triggers: ['glass tide'] },
      'The tide carries visible memories.'
    )
    await createCharacter(root, 'Mira', {
      id: 'char-mira',
      status: 'active',
      aliases: ['Map keeper'],
      image: {
        schema_version: 1,
        original_path: 'assets/settings/character/char-mira/original-fixture.png',
        thumbnail_path: 'assets/settings/character/char-mira/thumbnail-fixture.png',
        mime_type: 'image/png',
        sha256: 'a'.repeat(64),
        width: 1200,
        height: 1800,
        palette: ['#102030'],
        focus_x: 0.5,
        focus_y: 0.5,
        alt_text: 'Mira portrait'
      }
    })
    await createCharacter(root, 'Vesper', { id: 'char-vesper', status: 'active' })
    await createCharacterRelation(
      root,
      'Mira trusts Vesper',
      {
        id: 'rel-mira-vesper',
        from_character: 'char-mira',
        to_character: 'char-vesper',
        relation_type: 'trust',
        status: 'active'
      },
      'They exchange verified maps.'
    )
    await createLocation(
      root,
      'Glass Harbor',
      { id: 'loc-glass-harbor', status: 'confirmed', scale: 'city' },
      'The harbor is built around a memory well.'
    )
    await createFaction(root, 'Lantern Guild', { id: 'faction-lantern', status: 'active' })
    await createFaction(root, 'Harbor Council', { id: 'faction-council', status: 'active' })
    await createFactionRelation(root, 'Lantern Guild allies with Harbor Council', {
      id: 'frel-lantern-council',
      from_faction: 'faction-lantern',
      to_faction: 'faction-council',
      relation_type: 'alliance',
      direction: 'mutual'
    })
    await createFactionMembership(root, 'Mira serves the Lantern Guild', {
      id: 'member-mira-lantern',
      faction_id: 'faction-lantern',
      character_id: 'char-mira',
      role: 'cartographer'
    })
    const cover = makeCardPng([])
    await ensureDir(path.join(root, 'assets', 'cover'))
    await writeFile(path.join(root, 'assets', 'cover', 'original.png'), cover)
    await writeFile(path.join(root, 'assets', 'cover', 'thumbnail.png'), cover)
    await writeFile(path.join(root, 'assets', 'cover', 'export.png'), cover)
    await updateProjectConfig(root, {
      cover: {
        original_path: 'assets/cover/original.png',
        thumbnail_path: 'assets/cover/thumbnail.png',
        export_png_path: 'assets/cover/export.png',
        focus_x: 0.5,
        focus_y: 0.5,
        source_width: 1,
        source_height: 1
      }
    })
    await ensureDir(path.join(root, 'scenes'))
    await ensureDir(path.join(root, 'runs', 'run-leak'))
    await writeText(path.join(root, 'scenes', 'scene-leak.md'), 'LEAKED_PROSE_BODY')
    await writeText(path.join(root, 'prompts', 'book-generation-header.md'), 'LEAKED_PROMPT_HEADER')
    await writeText(path.join(root, 'runs', 'run-leak', 'prompt.md'), 'LEAKED_RUN_PROMPT')

    const written = await writeBookCharacterCardV3Png(root)
    const png = await readFile(written.outputPath)
    const parsed = parseCharacterCardPng(png)
    const inspection = await inspectBookCharacterCard(written.outputPath)
    expect(parsed).toMatchObject({ format: 'v3', pngKeyword: 'ccv3' })
    expect(inspection).toMatchObject({
      name: 'Card Project',
      hasPngCover: true,
      worldBookEntryCount: 10
    })
    const worldBook = parsed.card.data.character_book as { entries: Array<Record<string, unknown>> }
    expect(worldBook.entries).toHaveLength(10)
    expect(
      worldBook.entries.map(
        (entry) => (entry.extensions as { quillarium: { stable_id: string } }).quillarium.stable_id
      )
    ).toEqual(
      expect.arrayContaining([
        'canon-memory-law',
        'world-glass-tide',
        'char-mira',
        'char-vesper',
        'rel-mira-vesper',
        'faction-lantern',
        'faction-council',
        'frel-lantern-council',
        'member-mira-lantern',
        'loc-glass-harbor'
      ])
    )
    expect(parsed.card.data.system_prompt).toBe('')
    expect(parsed.card.data.post_history_instructions).toBe('')
    const serialized = JSON.stringify(parsed.card)
    expect(serialized).not.toMatch(/LEAKED_PROSE_BODY|LEAKED_PROMPT_HEADER|LEAKED_RUN_PROMPT/u)
    expect(serialized).not.toContain('C:\\Users\\author')
    expect(serialized).not.toContain('sk-testcredential12345')
    expect(serialized).not.toContain('fixture-secret')
    expect(serialized).not.toContain('assets/settings')
    expect(serialized).toContain('[LOCAL_PATH_REDACTED]')
    expect(serialized).toContain('[REDACTED_CREDENTIAL]')

    const importedRoot = (
      await createProjectAt(path.join(vault, 'projects', 'ccv3-imported'), {
        id: 'ccv3-imported',
        title: 'Temporary import title'
      })
    ).root
    const imported = await importBookCharacterCardIntoProject(importedRoot, written.outputPath)
    expect(await readFile(imported.archivePath)).toEqual(png)
    expect(imported.candidateDocumentIds).toHaveLength(10)
    const importedProject = await loadProject(importedRoot)
    expect(importedProject).toMatchObject({
      title: 'Card Project',
      synopsis: 'A city protects its memories from the tide.',
      cover: { original_path: 'assets/cover/imported-card.png' }
    })
    const importedDocs = await listDocs(importedRoot)
    expect(importedDocs).toHaveLength(10)
    expect(
      importedDocs.every((doc) =>
        ['draft', 'candidate'].includes(String((doc.data as typeof doc.data & { status?: string }).status))
      )
    ).toBe(true)
    expect(await listDocs(importedRoot, 'outline')).toHaveLength(0)
    expect(await listDocs(importedRoot, 'scene')).toHaveLength(0)
    expect(await listDocs(importedRoot, 'chapter_prose')).toHaveLength(0)
  })

  it.each([
    ['same title', 'Existing title'],
    ['different title', 'Changed title']
  ])('rejects an existing stable ID with %s before writing anything', async (_label, importedTitle) => {
    const { vault, root } = await project()
    await createWorldEntry(
      root,
      'Existing title',
      { id: 'world-conflict', status: 'active', entry_status: 'active' },
      'Existing content'
    )
    const sourcePath = path.join(vault, 'conflict.card.json')
    await writeFile(
      sourcePath,
      JSON.stringify(v3BookCard([{ id: 'world-conflict', title: importedTitle }])),
      'utf8'
    )
    const projectBefore = await readFile(path.join(root, 'project.yaml'), 'utf8')

    await expect(importBookCharacterCardIntoProject(root, sourcePath)).rejects.toThrow(
      'CCV3_IMPORT_STABLE_ID_CONFLICT: world-conflict'
    )
    expect(await readFile(path.join(root, 'project.yaml'), 'utf8')).toBe(projectBefore)
    expect((await listDocs(root)).map((document) => document.data.id)).toEqual(['world-conflict'])
    expect(await readdir(path.join(root, 'imports', 'archive'))).toEqual([])
  })

  it('rejects duplicate stable IDs inside one card during preflight', async () => {
    const { vault, root } = await project()
    const sourcePath = path.join(vault, 'duplicate.card.json')
    await writeFile(
      sourcePath,
      JSON.stringify(
        v3BookCard([
          { id: 'world-duplicate', title: 'First title' },
          { id: 'world-duplicate', title: 'Second title' }
        ])
      ),
      'utf8'
    )

    await expect(importBookCharacterCardIntoProject(root, sourcePath)).rejects.toThrow(
      'CCV3_IMPORT_DUPLICATE_STABLE_ID: world-duplicate'
    )
    expect(await listDocs(root)).toEqual([])
    expect(await readdir(path.join(root, 'imports', 'archive'))).toEqual([])
  })

  it('rolls back archive, documents, cover/config writes after an injected mid-transaction failure', async () => {
    const { vault, root } = await project()
    const sourcePath = path.join(vault, 'rollback.card.json')
    await writeFile(
      sourcePath,
      JSON.stringify(
        v3BookCard([
          { id: 'world-first', title: 'First' },
          { id: 'world-second', title: 'Second' }
        ])
      ),
      'utf8'
    )
    const projectBefore = await readFile(path.join(root, 'project.yaml'), 'utf8')

    await expect(
      importBookCharacterCardIntoProject(
        root,
        sourcePath,
        { title: 'Author override' },
        {
          afterStep(step) {
            if (step === 'document:world-first') throw new Error('INJECTED_IMPORT_FAILURE')
          }
        }
      )
    ).rejects.toThrow('INJECTED_IMPORT_FAILURE')
    expect(await readFile(path.join(root, 'project.yaml'), 'utf8')).toBe(projectBefore)
    expect(await listDocs(root)).toEqual([])
    expect(await readdir(path.join(root, 'imports', 'archive'))).toEqual([])
  })

  it('applies the author title override inside the successful import transaction', async () => {
    const { vault, root } = await project()
    const sourcePath = path.join(vault, 'override.card.json')
    await writeFile(
      sourcePath,
      JSON.stringify(v3BookCard([{ id: 'world-imported', title: 'Imported setting' }], 'Card title')),
      'utf8'
    )

    await importBookCharacterCardIntoProject(root, sourcePath, { title: 'Author title' })
    expect((await loadProject(root)).title).toBe('Author title')
  })
})

describe('malformed input diagnostics', () => {
  it('reports JSON syntax, required fields, and unsupported specs readably', () => {
    expect(() => parseCharacterCardJson('{not-json')).toThrow('Invalid Character Card JSON')
    expect(() =>
      parseCharacterCardJson(
        JSON.stringify({ spec: 'chara_card_v2', spec_version: '2.0', data: { name: '' } })
      )
    ).toThrow('data.name')
    expect(() =>
      parseCharacterCardJson(JSON.stringify({ ...v2Card(), spec: 'chara_card_v4', spec_version: '4.0' }))
    ).toThrow('Unsupported Character Card spec/version')
  })

  it('reports PNG signature, chunk bounds, base64, decoded JSON, and ccv3 version errors', () => {
    expect(() => parseCharacterCardPng(Buffer.from('not a png'))).toThrow('Invalid PNG signature')

    const truncated = Buffer.concat([PNG_SIGNATURE, uint32(13), Buffer.from('IHDR'), Buffer.alloc(4)])
    expect(() => parseCharacterCardPng(truncated)).toThrow('exceeds the input bounds')

    expect(() => parseCharacterCardPng(makeCardPng([['chara', '***not-base64***']]))).toThrow(
      'not valid base64'
    )
    expect(() =>
      parseCharacterCardPng(makeCardPng([['chara', Buffer.from('{not-json').toString('base64')]]))
    ).toThrow('Invalid Character Card JSON')
    expect(() =>
      parseCharacterCardPng(
        makeCardPng([
          ['chara', Buffer.from(JSON.stringify(v3Card())).toString('base64')],
          ['ccv3', Buffer.from(JSON.stringify(v2Card())).toString('base64')]
        ])
      )
    ).toThrow('ccv3 payload must contain chara_card_v3/3.0')
  })

  it('rejects structural PNG violations and non-canonical card payload encodings', () => {
    const ihdr = pngChunk('IHDR', makeIhdrData())
    const iend = pngChunk('IEND', Buffer.alloc(0))

    expect(() => parseCharacterCardPng(PNG_SIGNATURE)).toThrow('missing its IHDR')
    expect(() => parseCharacterCardPng(Buffer.concat([PNG_SIGNATURE, Buffer.alloc(4)]))).toThrow(
      'Truncated PNG chunk header'
    )
    expect(() =>
      parseCharacterCardPng(
        Buffer.concat([PNG_SIGNATURE, uint32(32 * 1024 * 1024 + 1), Buffer.from('IHDR'), Buffer.alloc(4)])
      )
    ).toThrow('maximum is')
    expect(() =>
      parseCharacterCardPng(Buffer.concat([PNG_SIGNATURE, uint32(0), Buffer.from('1234'), Buffer.alloc(4)]))
    ).toThrow('Invalid PNG chunk type')
    expect(() => parseCharacterCardPng(Buffer.concat([PNG_SIGNATURE, iend]))).toThrow(
      'must begin with a 13-byte IHDR'
    )
    expect(() => parseCharacterCardPng(Buffer.concat([PNG_SIGNATURE, ihdr, ihdr]))).toThrow(
      'more than one IHDR'
    )
    expect(() => parseCharacterCardPng(Buffer.concat([PNG_SIGNATURE, ihdr]))).toThrow('missing its IEND')
    expect(() => parseCharacterCardPng(Buffer.concat([PNG_SIGNATURE, ihdr, iend]))).toThrow(
      'no SillyTavern tEXt chunk'
    )
    expect(() =>
      parseCharacterCardPng(Buffer.concat([PNG_SIGNATURE, ihdr, pngChunk('tEXt', Buffer.from([0])), iend]))
    ).toThrow('keyword must be 1-79 bytes')
    expect(() =>
      parseCharacterCardPng(Buffer.concat([PNG_SIGNATURE, ihdr, pngChunk('IEND', Buffer.from([1]))]))
    ).toThrow('IEND chunk must have zero data bytes')
    expect(() => parseCharacterCardPng(Buffer.concat([makeCardPng([]), Buffer.from([1])]))).toThrow(
      'trailing bytes after the IEND'
    )
    expect(() => parseCharacterCardPng(makeCardPng([['chara', ' ']]))).toThrow('not valid base64')
    expect(() => parseCharacterCardPng(makeCardPng([['chara', 'AA=']]))).toThrow('invalid base64 padding')
    expect(() => parseCharacterCardPng(makeCardPng([['chara', 'AB==']]))).toThrow('not valid base64')
    expect(() =>
      parseCharacterCardPng(makeCardPng([['chara', Buffer.from([0xff]).toString('base64')]]))
    ).toThrow('not valid UTF-8 JSON text')
  })

  it('reports file read and UTF-8 failures before attempting JSON parsing', async () => {
    const { vault, root } = await project()
    const invalidUtf8 = path.join(vault, 'invalid.json')
    await writeFile(invalidUtf8, Buffer.from([0xff]))

    await expect(importCharacterCard(root, path.join(vault, 'missing.json'))).rejects.toThrow(
      'Could not read Character Card file'
    )
    await expect(importCharacterCard(root, invalidUtf8)).rejects.toThrow('is not valid UTF-8')
  })
})

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

function makeCardPng(textChunks: Array<[keyword: string, value: string]>): Buffer {
  const idat = deflateSync(Buffer.from([0, 0, 0, 0, 0]))
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', makeIhdrData()),
    ...textChunks.map(([keyword, value]) =>
      pngChunk('tEXt', Buffer.concat([Buffer.from(keyword, 'latin1'), Buffer.from([0]), Buffer.from(value)]))
    ),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0))
  ])
}

function makeIhdrData(): Buffer {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(1, 0)
  ihdr.writeUInt32BE(1, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return ihdr
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBytes = Buffer.from(type, 'ascii')
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])))
  return Buffer.concat([uint32(data.byteLength), typeBytes, data, checksum])
}

function uint32(value: number): Buffer {
  const bytes = Buffer.alloc(4)
  bytes.writeUInt32BE(value)
  return bytes
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}
