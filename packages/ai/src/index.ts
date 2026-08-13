import {
  createRun,
  loadConfig,
  snapshotContextCompilation,
  snapshotSharedGuidance,
  writeRunFile,
  writeRunMetadata,
  type ContextTrace,
  type ContextCompileOptions,
  type PromptBlock,
  type RunMetadata,
  type SharedGuidanceContent
} from '@quillarium/core'

export interface AIConfig {
  provider: 'openai-compatible' | 'openai' | 'claude' | 'gemini' | 'deepseek' | 'ollama'
  baseUrl: string
  apiKey: string
  model: string
  temperature: number
  maxTokens: number
}

export interface AIRequestOptions {
  /** Per-attempt timeout. Set to 0 to disable the timeout. */
  timeoutMs?: number
  /** Number of retries after the initial request. Defaults to one and is capped at three. */
  maxRetries?: number
  /** Base delay for exponential retry backoff. Set to 0 for immediate retries. */
  retryDelayMs?: number
  /** Request an OpenAI-compatible JSON object response. */
  responseFormat?: 'json_object'
  /** DeepSeek thinking mode. Defaults to disabled and is ignored for other providers. */
  thinkingMode?: 'enabled' | 'disabled'
}

export interface GenerationContextCompilationSnapshot {
  prompt_blocks: PromptBlock[]
  context_trace: ContextTrace
}

export type AIKeyDecryptor = (encrypted: string) => string | Promise<string>

export interface AIRequestErrorOptions {
  provider: AIConfig['provider']
  status?: number
  hint?: string
  cause?: unknown
}

export class AIRequestError extends Error {
  readonly provider: AIConfig['provider']
  readonly status?: number
  readonly hint?: string
  override readonly cause?: unknown

  constructor(message: string, options: AIRequestErrorOptions) {
    super(options.hint ? `${message} ${options.hint}` : message, { cause: options.cause })
    this.name = 'AIRequestError'
    this.provider = options.provider
    this.status = options.status
    this.hint = options.hint
    this.cause = options.cause
  }
}

export const DEFAULT_AI_TIMEOUT_MS = 120_000
export const DEFAULT_AI_MAX_RETRIES = 1
export const DEFAULT_AI_SYSTEM_PROMPT = 'You are Quillarium, a continuity-aware fiction writing assistant.'

const DEFAULT_RETRY_DELAY_MS = 250
const MAX_RETRIES = 3
const MAX_RETRY_DELAY_MS = 5_000
const MAX_ERROR_DETAIL_LENGTH = 2_000

export function loadAIConfig(env: NodeJS.ProcessEnv = process.env): AIConfig {
  const provider = (env.QUILL_AI_PROVIDER as AIConfig['provider']) ?? 'openai-compatible'
  return {
    provider,
    baseUrl: env.QUILL_AI_BASE_URL ?? defaultBaseUrl(provider),
    apiKey: env.QUILL_AI_API_KEY ?? '',
    model: env.QUILL_AI_MODEL ?? defaultModel(provider),
    temperature: Number(env.QUILL_AI_TEMPERATURE ?? '0.7'),
    maxTokens: Number(env.QUILL_AI_MAX_TOKENS ?? '2000')
  }
}

export async function loadAIProfile(
  profile: 'prose' | 'background' | 'check' = 'prose',
  env: NodeJS.ProcessEnv = process.env,
  decryptApiKey?: AIKeyDecryptor
): Promise<AIConfig> {
  const fallback = loadAIConfig(env)
  const saved = (await loadConfig()).aiProfiles?.[profile]
  if (!saved) return fallback
  return {
    provider: saved.provider ?? fallback.provider,
    baseUrl: saved.baseUrl ?? defaultBaseUrl(saved.provider ?? fallback.provider),
    apiKey: await resolveAIProfileApiKey(
      env.QUILL_AI_API_KEY,
      saved.apiKeyEncrypted,
      saved.apiKey,
      decryptApiKey
    ),
    model: saved.model ?? defaultModel(saved.provider ?? fallback.provider),
    temperature: saved.temperature ?? fallback.temperature,
    maxTokens: saved.maxTokens ?? fallback.maxTokens
  }
}

async function resolveAIProfileApiKey(
  environmentKey: string | undefined,
  encryptedKey: string | undefined,
  legacyKey: string | undefined,
  decryptApiKey: AIKeyDecryptor | undefined
): Promise<string> {
  if (environmentKey !== undefined) return environmentKey
  if (encryptedKey !== undefined && decryptApiKey) {
    try {
      return await decryptApiKey(encryptedKey)
    } catch {
      // A legacy plaintext key remains a compatibility fallback when decryption is unavailable or fails.
    }
  }
  return legacyKey ?? ''
}

export function defaultBaseUrl(provider: AIConfig['provider']): string {
  switch (provider) {
    case 'openai':
    case 'openai-compatible':
      return 'https://api.openai.com/v1'
    case 'claude':
      return 'https://api.anthropic.com/v1'
    case 'gemini':
      return 'https://generativelanguage.googleapis.com/v1beta'
    case 'deepseek':
      return 'https://api.deepseek.com'
    case 'ollama':
      return 'http://localhost:11434/v1'
  }
}

export function defaultModel(provider: AIConfig['provider']): string {
  switch (provider) {
    case 'openai':
    case 'openai-compatible':
      return 'gpt-4o-mini'
    case 'claude':
      return 'claude-3-5-sonnet-latest'
    case 'gemini':
      return 'gemini-1.5-pro'
    case 'deepseek':
      return 'deepseek-v4-flash'
    case 'ollama':
      return 'llama3.1'
  }
}

export function isAIConfigured(config: AIConfig): boolean {
  return Boolean(
    config.model && (config.apiKey || config.provider === 'ollama' || config.baseUrl.includes('localhost'))
  )
}

export function buildSectionPrompt(context: string): string {
  return [
    'You are assisting with a long-form novel project.',
    'Write only the requested prose section unless the context explicitly asks for notes.',
    'Respect canon, time, location, character state, and style guardrails.',
    'If a fact is uncertain, avoid inventing hard canon.',
    '',
    context
  ].join('\n')
}

export function contextCompileOptions(config: AIConfig): ContextCompileOptions {
  return {
    model: { provider: config.provider, model: config.model },
    reserved_output_tokens: config.maxTokens,
    framing_text: [
      '<|system|>',
      DEFAULT_AI_SYSTEM_PROMPT,
      '<|user|>',
      buildSectionPrompt(''),
      '<|assistant|>'
    ].join('\n')
  }
}

export async function generateText(
  prompt: string,
  config: AIConfig,
  systemPrompt = DEFAULT_AI_SYSTEM_PROMPT,
  options: AIRequestOptions = {}
): Promise<string> {
  if (!config.apiKey && !config.baseUrl.includes('localhost')) {
    throw new AIRequestError('Missing QUILL_AI_API_KEY.', {
      provider: config.provider,
      hint: 'Set QUILL_AI_API_KEY or use a local OpenAI-compatible endpoint.'
    })
  }

  const url = `${config.baseUrl.replace(/\/$/, '')}/chat/completions`
  const timeoutMs = normalizeNonNegativeInteger(options.timeoutMs, DEFAULT_AI_TIMEOUT_MS)
  const maxRetries = normalizeNonNegativeInteger(options.maxRetries, DEFAULT_AI_MAX_RETRIES, MAX_RETRIES)
  const retryDelayMs = normalizeNonNegativeInteger(
    options.retryDelayMs,
    DEFAULT_RETRY_DELAY_MS,
    MAX_RETRY_DELAY_MS
  )
  const body = {
    model: config.model,
    temperature: config.temperature,
    max_tokens: config.maxTokens,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt }
    ],
    ...(config.provider === 'deepseek'
      ? { thinking: { type: options.thinkingMode ?? ('disabled' as const) } }
      : {}),
    ...(options.responseFormat ? { response_format: { type: options.responseFormat } } : {})
  }
  const request: Omit<RequestInit, 'signal'> = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey || 'local'}`
    },
    body: JSON.stringify(body)
  }

  for (let attempt = 0; ; attempt += 1) {
    const result = await performRequest(url, request, config.provider, timeoutMs)

    if (!result.ok) {
      if (isRetryableStatus(result.status) && attempt < maxRetries) {
        await waitForRetry(retryDelayMs, attempt)
        continue
      }

      throw new AIRequestError(`AI request failed ${result.status}: ${result.errorBody.detail}`, {
        provider: config.provider,
        status: result.status,
        hint: httpErrorHint(result.status),
        cause: result.errorBody.cause
      })
    }

    return result.content
  }
}

export async function generateCanonText(
  prompt: string,
  config: AIConfig,
  options: AIRequestOptions = {}
): Promise<string> {
  return generateText(
    prompt,
    config,
    [
      'You are Quillarium Canon Curator.',
      'Your job is to help the writer turn uncertain background material into stable canon for a long-form novel.',
      'Discuss ambiguities first when needed, distinguish hard canon from soft canon, and avoid inventing facts not supported by the writer.',
      'When asked to summarize, produce concise canon rules the novel must obey, then recommend status, strength, and source.',
      'Use clear Chinese by default unless the user writes in another language.'
    ].join('\n'),
    options
  )
}

type AIRequestResult =
  | { ok: true; content: string }
  | { ok: false; status: number; errorBody: { detail: string; cause?: unknown } }

async function performRequest(
  url: string,
  request: Omit<RequestInit, 'signal'>,
  provider: AIConfig['provider'],
  timeoutMs: number
): Promise<AIRequestResult> {
  const controller = new AbortController()
  let didTimeout = false
  let timeout: ReturnType<typeof setTimeout> | undefined

  try {
    const requestPromise = (async (): Promise<AIRequestResult> => {
      const response = await fetch(url, { ...request, signal: controller.signal })
      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
          errorBody: await readProviderErrorBody(response)
        }
      }
      return { ok: true, content: await readCompletion(response, provider) }
    })()
    if (timeoutMs === 0) return await requestPromise

    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => {
        didTimeout = true
        controller.abort()
        reject(new Error(`Timed out after ${timeoutMs}ms`))
      }, timeoutMs)
    })
    return await Promise.race([requestPromise, timeoutPromise])
  } catch (cause) {
    if (didTimeout) {
      throw new AIRequestError(`AI request timed out after ${timeoutMs}ms for ${provider} at ${url}.`, {
        provider,
        hint: 'Increase timeoutMs or check whether the provider endpoint is responding.',
        cause
      })
    }
    if (cause instanceof AIRequestError) throw cause
    throw new AIRequestError(
      `AI connection failed for ${provider} at ${url}. Original error: ${errorMessage(cause)}`,
      {
        provider,
        hint: 'Check the endpoint, API key, proxy/network, and whether the prompt is too large.',
        cause
      }
    )
  } finally {
    if (timeout !== undefined) clearTimeout(timeout)
  }
}

async function readCompletion(response: Response, provider: AIConfig['provider']): Promise<string> {
  let json: unknown
  try {
    json = await response.json()
  } catch (cause) {
    throw new AIRequestError(`AI provider ${provider} returned malformed JSON.`, {
      provider,
      status: response.status,
      hint: 'Check that the endpoint implements the OpenAI-compatible chat completions response format.',
      cause
    })
  }

  const content = getCompletionContent(json)
  if (content === undefined) {
    throw new AIRequestError(`AI provider ${provider} returned JSON without choices[0].message.content.`, {
      provider,
      status: response.status,
      hint: 'Check that the endpoint implements the OpenAI-compatible chat completions response format.'
    })
  }
  if (!content.trim()) {
    throw new AIRequestError(`AI provider ${provider} returned empty choices[0].message.content.`, {
      provider,
      status: response.status,
      hint: 'Retry the request or check the provider response and output token limit.'
    })
  }
  return content
}

function getCompletionContent(value: unknown): string | undefined {
  if (!isRecord(value) || !Array.isArray(value.choices)) return undefined
  const firstChoice = value.choices[0]
  if (!isRecord(firstChoice) || !isRecord(firstChoice.message)) return undefined
  return typeof firstChoice.message.content === 'string' ? firstChoice.message.content : undefined
}

async function readProviderErrorBody(response: Response): Promise<{ detail: string; cause?: unknown }> {
  let raw: string
  try {
    raw = await response.text()
  } catch (cause) {
    return { detail: 'The provider error body could not be read.', cause }
  }

  const trimmed = raw.trim()
  if (!trimmed) return { detail: 'The provider returned no error details.' }

  try {
    const parsed: unknown = JSON.parse(trimmed)
    return { detail: limitErrorDetail(extractProviderErrorMessage(parsed) ?? trimmed) }
  } catch {
    return { detail: limitErrorDetail(trimmed) }
  }
}

function extractProviderErrorMessage(value: unknown): string | undefined {
  if (!isRecord(value)) return typeof value === 'string' ? value : undefined
  if (typeof value.message === 'string') return value.message
  if (typeof value.detail === 'string') return value.detail
  if (typeof value.error === 'string') return value.error
  if (isRecord(value.error) && typeof value.error.message === 'string') return value.error.message
  return undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

function limitErrorDetail(detail: string): string {
  return detail.length <= MAX_ERROR_DETAIL_LENGTH ? detail : `${detail.slice(0, MAX_ERROR_DETAIL_LENGTH)}…`
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599)
}

function httpErrorHint(status: number): string {
  if (status === 400 || status === 413) {
    return 'The request may exceed the model context window; reduce the discussion history or summarize it first.'
  }
  if (status === 401 || status === 403) {
    return 'Check the provider API key and its permissions.'
  }
  if (status === 429) {
    return 'The provider rate limit remained active after retrying; wait before trying again.'
  }
  if (status >= 500) {
    return 'The provider service is temporarily unavailable; try again later.'
  }
  return 'Check the provider endpoint and request settings.'
}

function normalizeNonNegativeInteger(value: number | undefined, fallback: number, maximum?: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback
  const normalized = Math.max(0, Math.floor(value))
  return maximum === undefined ? normalized : Math.min(normalized, maximum)
}

async function waitForRetry(baseDelayMs: number, attempt: number): Promise<void> {
  const delayMs = Math.min(baseDelayMs * 2 ** attempt, MAX_RETRY_DELAY_MS)
  if (delayMs === 0) return
  await new Promise((resolve) => setTimeout(resolve, delayMs))
}

export async function createGenerationRun(
  projectRoot: string,
  sceneId: string,
  context: string,
  config: AIConfig,
  metadata: Partial<RunMetadata> = {},
  sharedGuidance: SharedGuidanceContent[] = [],
  promptOverride?: string,
  compilation?: GenerationContextCompilationSnapshot
): Promise<RunMetadata> {
  const run = await createRun(projectRoot, sceneId, {
    ...metadata,
    provider: config.provider,
    model: config.model,
    status: 'created'
  })
  const prompt = promptOverride?.trim() ? promptOverride : buildSectionPrompt(context)
  await writeRunFile(projectRoot, run, 'context.md', context)
  await writeRunFile(projectRoot, run, 'prompt.md', prompt)
  await snapshotSharedGuidance(projectRoot, run, sharedGuidance)
  if (compilation) {
    await snapshotContextCompilation(projectRoot, run, compilation.prompt_blocks, compilation.context_trace)
  }
  return run
}

export async function generateIntoRun(
  projectRoot: string,
  run: RunMetadata,
  context: string,
  config: AIConfig,
  options: AIRequestOptions = {},
  promptOverride?: string,
  outputTransform: (output: string) => string = (output) => output
): Promise<string> {
  const prompt = promptOverride?.trim() ? promptOverride : buildSectionPrompt(context)
  const output = outputTransform(await generateText(prompt, config, undefined, options))
  const next = { ...run, status: 'generated' as const }
  await writeRunFile(projectRoot, next, 'prompt.md', prompt)
  await writeRunFile(projectRoot, next, 'output-raw.md', output)
  await writeRunMetadata(projectRoot, next)
  return output
}
