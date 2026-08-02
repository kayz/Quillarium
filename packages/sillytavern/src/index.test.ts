import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { deflateSync } from 'node:zlib'
import {
  createCanon,
  createCharacter,
  createProject,
  createWorldEntry,
  requireDoc,
  type CharacterDoc
} from '@quillarium/core'
import { afterEach, describe, expect, it } from 'vitest'
import {
  exportCharacterCardV2,
  exportCharacterCardV2Json,
  exportWorldInfo,
  exportWorldInfoJson,
  extractCharacterCardJsonFromPng,
  importCharacterCard,
  importCharacterCardJson,
  importCharacterCardPng,
  parseCharacterCardJson,
  parseCharacterCardPng,
  writeCharacterCardV2File,
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
  const created = await createProject({ vault, title: `Card Project ${++projectSequence}` })
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
