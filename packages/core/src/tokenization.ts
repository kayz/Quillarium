import { metadata as cl100kMetadata } from '@hypertok/vocab-cl100k'
import { metadata as deepseekV4Metadata } from '@hypertok/vocab-deepseek-v4'
import { metadata as o200kMetadata } from '@hypertok/vocab-o200k'
import { fromBytes, type Tokenizer } from 'hypertok'
import { loadVocab } from 'hypertok/vocab-resolve'
import type { ContextTokenizerTrace, PromptBlockTruncation } from './types.js'

export type SupportedContextTokenizer = 'deepseek-v4' | 'o200k' | 'cl100k'

export interface ContextModelIdentity {
  provider: string
  model: string
  tokenizer_id?: SupportedContextTokenizer
}

export interface TokenTruncationResult {
  text: string
  token_count: number
  original_token_count: number
  truncated: boolean
}

export interface ContextTokenCounter {
  readonly descriptor: ContextTokenizerTrace
  count(text: string): number
  truncate(
    text: string,
    maxTokens: number,
    strategy: Exclude<PromptBlockTruncation, 'none'>
  ): TokenTruncationResult
}

export class UnsupportedContextTokenizerError extends Error {
  readonly provider: string
  readonly model: string

  constructor(provider: string, model: string) {
    super(
      `No exact context tokenizer is registered for provider "${provider}" and model "${model}". ` +
        'Select a supported tokenizer explicitly or use a model backed by DeepSeek V4, OpenAI o200k, or OpenAI cl100k.'
    )
    this.name = 'UnsupportedContextTokenizerError'
    this.provider = provider
    this.model = model
  }
}

const tokenizerCache = new Map<SupportedContextTokenizer, Promise<Tokenizer>>()

export async function createContextTokenCounter(
  identity: ContextModelIdentity
): Promise<ContextTokenCounter> {
  const tokenizerId = resolveContextTokenizer(identity)
  const tokenizer = await loadTokenizer(tokenizerId)
  const metadata = metadataFor(tokenizerId)
  const descriptor: ContextTokenizerTrace = {
    id: tokenizerId,
    provider: identity.provider,
    model: identity.model,
    exact: true,
    source_revision: metadata.sourceRevision,
    source_sha256: metadata.sourceSha256,
    vocabulary_sha256: metadata.fileSha256
  }

  const encode = (text: string): Uint32Array => tokenizer.encodeSync(text)
  return {
    descriptor,
    count: (text) => encode(text).length,
    truncate: (text, maxTokens, strategy) => {
      const ids = encode(text)
      const normalizedMaximum = Math.max(0, Math.floor(maxTokens))
      if (ids.length <= normalizedMaximum) {
        return {
          text,
          token_count: ids.length,
          original_token_count: ids.length,
          truncated: false
        }
      }
      const kept =
        strategy === 'head'
          ? ids.slice(0, normalizedMaximum)
          : ids.slice(Math.max(0, ids.length - normalizedMaximum))
      const truncatedText = tokenizer.decode(kept)
      return {
        text: truncatedText,
        token_count: encode(truncatedText).length,
        original_token_count: ids.length,
        truncated: true
      }
    }
  }
}

export function resolveContextTokenizer(identity: ContextModelIdentity): SupportedContextTokenizer {
  if (identity.tokenizer_id) return identity.tokenizer_id
  const provider = identity.provider.trim().toLocaleLowerCase()
  const model = identity.model.trim().toLocaleLowerCase()

  if (model.includes('deepseek-v4') || (provider === 'deepseek' && /^deepseek-v4(?:-|$)/u.test(model))) {
    return 'deepseek-v4'
  }
  if (
    /^(?:gpt-5|gpt-4o|chatgpt-4o|o[1-9](?:-|$))/u.test(model) ||
    (provider === 'openai' && /^(?:gpt-5|gpt-4o|o[1-9](?:-|$))/u.test(model))
  ) {
    return 'o200k'
  }
  if (
    /^(?:gpt-4(?:-|$)|gpt-3\.5(?:-|$)|text-embedding-3(?:-|$))/u.test(model) ||
    (provider === 'openai' && /^(?:gpt-4|gpt-3\.5|text-embedding-3)/u.test(model))
  ) {
    return 'cl100k'
  }
  throw new UnsupportedContextTokenizerError(identity.provider, identity.model)
}

async function loadTokenizer(id: SupportedContextTokenizer): Promise<Tokenizer> {
  let pending = tokenizerCache.get(id)
  if (!pending) {
    pending = loadVocab(id).then((bytes) => fromBytes(bytes, { tier: 'single' }))
    tokenizerCache.set(id, pending)
  }
  try {
    return await pending
  } catch (error) {
    tokenizerCache.delete(id)
    throw error
  }
}

function metadataFor(id: SupportedContextTokenizer) {
  switch (id) {
    case 'deepseek-v4':
      return deepseekV4Metadata
    case 'o200k':
      return o200kMetadata
    case 'cl100k':
      return cl100kMetadata
  }
}
