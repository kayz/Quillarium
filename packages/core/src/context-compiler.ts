import path from 'node:path'
import { createHash } from 'node:crypto'
import {
  createContextTokenCounter,
  type ContextModelIdentity,
  type ContextTokenCounter
} from './tokenization.js'
import type {
  ContextPolicy,
  ContextTrace,
  ContextTraceEntry,
  PromptBlock,
  PromptBlockAuthority,
  PromptBlockKind,
  PromptBlockTruncation
} from './types.js'

export const CONTEXT_COMPILER_VERSION = '1.0.0'

export const DEFAULT_CONTEXT_POLICY: ContextPolicy = Object.freeze({
  schema_version: 1,
  id: 'structured-fiction-default',
  token_budget: 24_000,
  max_block_tokens: 6_000,
  min_truncated_block_tokens: 64,
  max_candidates: 256,
  max_recursion_depth: 2
})

export interface PromptBlockCandidate {
  id: string
  kind: PromptBlockKind
  role?: 'system' | 'user'
  title: string
  content: string
  source: { type: string; id: string; path?: string }
  scope: string
  purpose: string
  authority: PromptBlockAuthority
  authority_rank: number
  priority: number
  order: number
  selected: boolean
  required?: boolean
  selection_reason: string
  exclusion_reason?: string
  trigger_chain?: string[]
  truncation?: PromptBlockTruncation
}

export interface ContextCompileOptions {
  model?: ContextModelIdentity
  policy?: Partial<Omit<ContextPolicy, 'schema_version'>>
  token_counter?: ContextTokenCounter
  reached_recursion_depth?: number
  reserved_output_tokens?: number
  /** Stable text representing system/user role wrappers and non-context prompt instructions. */
  framing_text?: string
}

export interface CompiledContext {
  blocks: PromptBlock[]
  trace: ContextTrace
  markdown: string
}

export class ContextBudgetExceededError extends Error {
  readonly block_id: string
  readonly token_budget: number

  constructor(blockId: string, tokenBudget: number) {
    super(`Required context block "${blockId}" cannot fit within the ${tokenBudget}-token policy budget.`)
    this.name = 'ContextBudgetExceededError'
    this.block_id = blockId
    this.token_budget = tokenBudget
  }
}

export async function compileContextBlocks(
  target: { type: 'outline' | 'scene'; id: string },
  candidates: PromptBlockCandidate[],
  options: ContextCompileOptions = {}
): Promise<CompiledContext> {
  const policy = resolveContextPolicy(options.policy)
  const model = options.model ?? { provider: 'deepseek', model: 'deepseek-v4-flash' }
  const counter = options.token_counter ?? (await createContextTokenCounter(model))
  const reservedOutputTokens = nonNegativeInteger(
    options.reserved_output_tokens ?? 0,
    'reserved_output_tokens'
  )
  const framingTokens = counter.count(options.framing_text ?? '')
  const availableInputTokens = policy.token_budget - reservedOutputTokens - framingTokens
  if (availableInputTokens <= 0) {
    throw new Error(
      `Context policy token budget ${policy.token_budget} leaves no input capacity after ` +
        `${reservedOutputTokens} reserved output tokens and ${framingTokens} framing tokens.`
    )
  }
  assertCandidateIds(candidates)
  const normalized = candidates.map(normalizeCandidate)
  const tokenCounts = new Map(normalized.map((candidate) => [candidate.id, counter.count(candidate.content)]))
  const entries = new Map<string, ContextTraceEntry>()
  const selected: PromptBlock[] = []

  for (const candidate of normalized.filter((item) => !item.selected || item.exclusion_reason)) {
    entries.set(
      candidate.id,
      traceEntry(
        candidate,
        'excluded',
        candidate.exclusion_reason ?? 'not activated by the current writing scope',
        0,
        tokenCounts
      )
    )
  }

  const eligible = normalized.filter((item) => item.selected && !item.exclusion_reason)
  const ranked = [...eligible].sort(compareSelectionRank)
  const requiredCount = ranked.filter((candidate) => candidate.required).length
  if (requiredCount > policy.max_candidates) {
    throw new Error(
      `Context policy max_candidates=${policy.max_candidates} is smaller than ${requiredCount} required blocks.`
    )
  }
  const admitted = ranked.slice(0, policy.max_candidates)
  for (const candidate of ranked.slice(policy.max_candidates)) {
    entries.set(
      candidate.id,
      traceEntry(candidate, 'excluded', `candidate limit reached (${policy.max_candidates})`, 0, tokenCounts)
    )
  }

  for (const candidate of admitted) {
    const originalTokens = tokenCounts.get(candidate.id) ?? 0
    let content = candidate.content
    let blockWasTruncated = false
    const strategy = candidate.truncation ?? 'head'
    if (strategy !== 'none' && originalTokens > policy.max_block_tokens) {
      const result = counter.truncate(content, policy.max_block_tokens, strategy)
      content = result.text
      blockWasTruncated = result.truncated
    }

    let block = toPromptBlock(candidate, content, counter, originalTokens, blockWasTruncated)
    if (fitsBudget([...selected, block], counter, availableInputTokens)) {
      selected.push(block)
      entries.set(
        candidate.id,
        traceEntry(
          candidate,
          block.truncated ? 'truncated' : 'included',
          block.truncated
            ? `${candidate.selection_reason}; truncated to the per-block limit`
            : candidate.selection_reason,
          block.token_count,
          tokenCounts
        )
      )
      continue
    }

    if (strategy !== 'none') {
      const fitted = fitTruncatedBlock(
        candidate,
        selected,
        counter,
        policy,
        originalTokens,
        availableInputTokens
      )
      if (fitted) {
        block = fitted
        selected.push(block)
        entries.set(
          candidate.id,
          traceEntry(
            candidate,
            'truncated',
            `${candidate.selection_reason}; deterministically truncated to fit the token budget`,
            block.token_count,
            tokenCounts
          )
        )
        continue
      }
    }

    if (candidate.required) throw new ContextBudgetExceededError(candidate.id, availableInputTokens)
    entries.set(
      candidate.id,
      traceEntry(
        candidate,
        'excluded',
        'insufficient token budget after higher-authority blocks',
        0,
        tokenCounts
      )
    )
  }

  const blocks = sortForRendering(selected)
  const markdown = renderPromptBlocks(blocks)
  const usedTokens = counter.count(markdown)
  const blocksById = new Map(blocks.map((block) => [block.id, block]))
  const orderedEntries = normalized
    .map((candidate) => entries.get(candidate.id))
    .filter((entry): entry is ContextTraceEntry => Boolean(entry))
    .map((entry) => {
      const block = blocksById.get(entry.block_id)
      return {
        ...entry,
        content_sha256: block?.content_sha256 ?? entry.content_sha256,
        tokenizer_id: counter.descriptor.id,
        retained_token_range: block?.retained_token_range ?? entry.retained_token_range
      }
    })
    .sort(compareTraceEntries)
  return {
    blocks,
    markdown,
    trace: {
      schema_version: 1,
      compiler_version: CONTEXT_COMPILER_VERSION,
      target,
      policy,
      tokenizer: counter.descriptor,
      budget: {
        total_token_budget: policy.token_budget,
        reserved_output_tokens: reservedOutputTokens,
        framing_tokens: framingTokens,
        available_input_tokens: availableInputTokens,
        selected_tokens: usedTokens,
        unused_input_tokens: availableInputTokens - usedTokens,
        token_budget: availableInputTokens,
        used_tokens: usedTokens,
        remaining_tokens: availableInputTokens - usedTokens
      },
      candidates: {
        discovered: normalized.length,
        eligible: eligible.length,
        limit: policy.max_candidates,
        max_recursion_depth: policy.max_recursion_depth,
        reached_recursion_depth: Math.min(
          Math.max(0, options.reached_recursion_depth ?? 0),
          policy.max_recursion_depth
        )
      },
      entries: orderedEntries,
      final_block_ids: blocks.map((block) => block.id)
    }
  }
}

export function resolveContextPolicy(
  override: Partial<Omit<ContextPolicy, 'schema_version'>> = {}
): ContextPolicy {
  const policy: ContextPolicy = { ...DEFAULT_CONTEXT_POLICY, ...override, schema_version: 1 }
  for (const [name, value] of Object.entries({
    token_budget: policy.token_budget,
    max_block_tokens: policy.max_block_tokens,
    min_truncated_block_tokens: policy.min_truncated_block_tokens,
    max_candidates: policy.max_candidates
  })) {
    if (!Number.isInteger(value) || value <= 0)
      throw new Error(`Context policy ${name} must be a positive integer.`)
  }
  if (!Number.isInteger(policy.max_recursion_depth) || policy.max_recursion_depth < 0) {
    throw new Error('Context policy max_recursion_depth must be a non-negative integer.')
  }
  if (policy.min_truncated_block_tokens > policy.max_block_tokens) {
    throw new Error('Context policy min_truncated_block_tokens cannot exceed max_block_tokens.')
  }
  return policy
}

export function renderPromptBlocks(blocks: PromptBlock[]): string {
  return sortForRendering(blocks)
    .map((block) => block.content.trim())
    .filter(Boolean)
    .join('\n\n')
}

function normalizeCandidate(candidate: PromptBlockCandidate): PromptBlockCandidate {
  const sourcePath = candidate.source.path?.replace(/\\/gu, '/')
  if (sourcePath && isUnsafeSourcePath(sourcePath)) {
    throw new Error(`Context source paths must be relative and contained: ${sourcePath}`)
  }
  return {
    ...candidate,
    role: candidate.role ?? 'user',
    content: candidate.content.trim(),
    source: { ...candidate.source, path: sourcePath },
    trigger_chain: [...(candidate.trigger_chain ?? [])],
    truncation: candidate.truncation ?? 'head'
  }
}

function isUnsafeSourcePath(sourcePath: string): boolean {
  if (path.posix.isAbsolute(sourcePath) || path.win32.isAbsolute(sourcePath)) return true
  const parts = sourcePath.split('/')
  return parts.some((part) => part === '..')
}

function assertCandidateIds(candidates: PromptBlockCandidate[]): void {
  const ids = new Set<string>()
  for (const candidate of candidates) {
    if (!candidate.id.trim()) throw new Error('Context block candidate IDs cannot be empty.')
    if (ids.has(candidate.id)) throw new Error(`Duplicate context block candidate ID: ${candidate.id}`)
    ids.add(candidate.id)
  }
}

function toPromptBlock(
  candidate: PromptBlockCandidate,
  content: string,
  counter: ContextTokenCounter,
  originalTokens: number,
  truncated: boolean
): PromptBlock {
  return {
    id: candidate.id,
    kind: candidate.kind,
    role: candidate.role ?? 'user',
    title: candidate.title,
    content,
    content_sha256: sha256(content),
    source: candidate.source,
    scope: candidate.scope,
    purpose: candidate.purpose,
    authority: candidate.authority,
    authority_rank: candidate.authority_rank,
    priority: candidate.priority,
    order: candidate.order,
    token_count: counter.count(content),
    original_token_count: originalTokens,
    tokenizer_id: counter.descriptor.id,
    retained_token_range: retainedRange(
      originalTokens,
      counter.count(content),
      truncated ? (candidate.truncation ?? 'head') : 'none'
    ),
    truncated,
    truncation: truncated ? (candidate.truncation ?? 'head') : 'none',
    selection_reason: candidate.selection_reason,
    trigger_chain: [...(candidate.trigger_chain ?? [])]
  }
}

function fitTruncatedBlock(
  candidate: PromptBlockCandidate,
  selected: PromptBlock[],
  counter: ContextTokenCounter,
  policy: ContextPolicy,
  originalTokens: number,
  availableInputTokens: number
): PromptBlock | null {
  const strategy = candidate.truncation
  if (!strategy || strategy === 'none') return null
  let low = policy.min_truncated_block_tokens
  let high = Math.min(policy.max_block_tokens, originalTokens - 1)
  let best: PromptBlock | null = null
  while (low <= high) {
    const middle = Math.floor((low + high) / 2)
    const result = counter.truncate(candidate.content, middle, strategy)
    const block = toPromptBlock(candidate, result.text, counter, originalTokens, true)
    if (fitsBudget([...selected, block], counter, availableInputTokens)) {
      best = block
      low = middle + 1
    } else {
      high = middle - 1
    }
  }
  return best
}

function fitsBudget(blocks: PromptBlock[], counter: ContextTokenCounter, budget: number): boolean {
  return counter.count(renderPromptBlocks(blocks)) <= budget
}

function sortForRendering<T extends Pick<PromptBlock, 'order' | 'id'>>(blocks: T[]): T[] {
  return [...blocks].sort((left, right) => left.order - right.order || left.id.localeCompare(right.id, 'en'))
}

function compareSelectionRank(left: PromptBlockCandidate, right: PromptBlockCandidate): number {
  return (
    Number(Boolean(right.required)) - Number(Boolean(left.required)) ||
    right.authority_rank - left.authority_rank ||
    right.priority - left.priority ||
    left.order - right.order ||
    left.id.localeCompare(right.id, 'en')
  )
}

function compareTraceEntries(left: ContextTraceEntry, right: ContextTraceEntry): number {
  const outcomeRank = { included: 0, truncated: 1, excluded: 2 }
  return (
    outcomeRank[left.outcome] - outcomeRank[right.outcome] ||
    right.authority_rank - left.authority_rank ||
    right.priority - left.priority ||
    left.block_id.localeCompare(right.block_id, 'en')
  )
}

function traceEntry(
  candidate: PromptBlockCandidate,
  outcome: ContextTraceEntry['outcome'],
  reason: string,
  tokenCount: number,
  originalCounts: Map<string, number>
): ContextTraceEntry {
  return {
    block_id: candidate.id,
    source_type: candidate.source.type,
    source_id: candidate.source.id,
    ...(candidate.source.path ? { source_path: candidate.source.path } : {}),
    authority: candidate.authority,
    authority_rank: candidate.authority_rank,
    priority: candidate.priority,
    outcome,
    reason,
    trigger_chain: [...(candidate.trigger_chain ?? [])],
    token_count: tokenCount,
    original_token_count: originalCounts.get(candidate.id) ?? 0,
    content_sha256: sha256(candidate.content),
    tokenizer_id: '',
    retained_token_range: retainedRange(
      originalCounts.get(candidate.id) ?? 0,
      tokenCount,
      outcome === 'truncated' ? (candidate.truncation ?? 'head') : outcome === 'included' ? 'none' : 'none'
    )
  }
}

function retainedRange(
  originalTokens: number,
  retainedTokens: number,
  strategy: PromptBlockTruncation
): { start: number; end: number } {
  if (retainedTokens === 0) return { start: 0, end: 0 }
  if (strategy === 'tail') return { start: Math.max(0, originalTokens - retainedTokens), end: originalTokens }
  return { start: 0, end: retainedTokens }
}

function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex')
}

function nonNegativeInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer.`)
  return value
}
