import path from 'node:path'
import { ensureDir, pathExists, readText, writeText } from './fs.js'
import { sha256Text } from './versioned-yaml-store.js'

export const BOOK_GENERATION_HEADER_PATH = 'prompts/book-generation-header.md'

export interface BookGenerationHeaderState {
  text: string
  relative_path: typeof BOOK_GENERATION_HEADER_PATH
  sha256: string
  character_count: number
  estimated_tokens: number
  configured: boolean
  warnings: string[]
}

export interface BookGenerationHeaderRunSnapshot extends BookGenerationHeaderState {
  schema_version: 1
  actual_tokens: number
  tokenizer_id: string
}

export async function loadBookGenerationHeader(projectRoot: string): Promise<BookGenerationHeaderState> {
  const file = path.join(path.resolve(projectRoot), ...BOOK_GENERATION_HEADER_PATH.split('/'))
  const text = (await pathExists(file)) ? await readText(file) : ''
  return describeBookGenerationHeader(text)
}

export async function saveBookGenerationHeader(
  projectRoot: string,
  text: string
): Promise<BookGenerationHeaderState> {
  const file = path.join(path.resolve(projectRoot), ...BOOK_GENERATION_HEADER_PATH.split('/'))
  await ensureDir(path.dirname(file))
  await writeText(file, text)
  return describeBookGenerationHeader(text)
}

export async function clearBookGenerationHeader(projectRoot: string): Promise<BookGenerationHeaderState> {
  return saveBookGenerationHeader(projectRoot, '')
}

export function describeBookGenerationHeader(text: string): BookGenerationHeaderState {
  const macros = [...text.matchAll(/\{\{\s*([a-zA-Z][\w.-]*)\s*\}\}/gu)].map((match) => match[0])
  const uniqueMacros = [...new Set(macros)]
  return {
    text,
    relative_path: BOOK_GENERATION_HEADER_PATH,
    sha256: sha256Text(text),
    character_count: [...text].length,
    estimated_tokens: text ? Math.ceil([...text].length / 4) : 0,
    configured: Boolean(text.trim()),
    warnings: uniqueMacros.length ? [`未识别的外部宏将按普通文本发送：${uniqueMacros.join('、')}`] : []
  }
}

export function createBookGenerationHeaderRunSnapshot(
  state: BookGenerationHeaderState,
  actualTokens: number,
  tokenizerId: string
): BookGenerationHeaderRunSnapshot {
  return {
    schema_version: 1,
    ...state,
    actual_tokens: actualTokens,
    tokenizer_id: tokenizerId
  }
}
