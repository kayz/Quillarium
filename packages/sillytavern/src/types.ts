export type CharacterCardFormat = 'v2' | 'v3'
export type CharacterCardPngKeyword = 'ccv3' | 'chara'

export interface CharacterCardData {
  name: string
  description: string
  personality: string
  scenario: string
  first_mes: string
  mes_example: string
  creator_notes: string
  system_prompt: string
  post_history_instructions: string
  alternate_greetings: string[]
  tags: string[]
  creator: string
  character_version: string
  extensions: Record<string, unknown>
  character_book?: Record<string, unknown>
  [key: string]: unknown
}

export interface CharacterCardV2 {
  spec: 'chara_card_v2'
  spec_version: '2.0'
  data: CharacterCardData
  [key: string]: unknown
}

export interface CharacterCardV3 {
  spec: 'chara_card_v3'
  spec_version: '3.0'
  data: CharacterCardData
  [key: string]: unknown
}

export type SupportedCharacterCard = CharacterCardV2 | CharacterCardV3

export interface ParsedCharacterCard {
  format: CharacterCardFormat
  card: SupportedCharacterCard
  rawJson: string
  pngKeyword?: CharacterCardPngKeyword
}

export interface CharacterCardImportOptions {
  sourceName?: string
}

export interface CharacterCardImportResult {
  format: CharacterCardFormat
  source: 'json' | 'png'
  pngKeyword?: CharacterCardPngKeyword
  characterId: string
  characterPath: string
  rawPath: string
}

export interface SillyTavernWorldInfoEntry {
  uid: number
  key: string[]
  keysecondary: string[]
  comment: string
  content: string
  constant: boolean
  selective: boolean
  order: number
  position: number
  disable: boolean
}

export interface SillyTavernWorldInfo {
  entries: Record<string, SillyTavernWorldInfoEntry>
}

export interface CharacterCardWriteResult {
  format: 'v2'
  characterId: string
  outputPath: string
}

export interface WorldInfoWriteResult {
  format: 'world-info'
  entryCount: number
  outputPath: string
}
