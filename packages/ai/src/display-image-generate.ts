export type DisplayImageProvider = 'openai' | 'openai-compatible' | 'gemini'
export type DisplayImageMime = 'image/png' | 'image/jpeg' | 'image/webp'

export interface DisplayImageProfile {
  provider: DisplayImageProvider
  baseUrl?: string
  apiKey: string
  model: string
}

export const DISPLAY_IMAGE_UNSUPPORTED = '当前生图凭证不支持生图。'

const OPENAI_DEFAULT_BASE_URL = 'https://api.openai.com/v1'
const GEMINI_DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta'
const SUPPORTED_PROVIDERS = new Set<DisplayImageProvider>(['openai', 'openai-compatible', 'gemini'])

export async function generateDisplayImageCandidate(
  input: {
    prompt: string
    profile: DisplayImageProfile
    signal?: AbortSignal
  },
  deps?: { fetch?: typeof fetch }
): Promise<{ bytes: Uint8Array; mime: DisplayImageMime }> {
  const apiKey = input.profile.apiKey.trim()
  const prompt = input.prompt.trim()
  if (!apiKey || !prompt || !SUPPORTED_PROVIDERS.has(input.profile.provider)) {
    throw new Error(DISPLAY_IMAGE_UNSUPPORTED)
  }

  const fetchFn = deps?.fetch ?? fetch
  if (input.profile.provider === 'gemini') {
    return generateGeminiImage(input.profile, input.prompt, fetchFn, input.signal)
  }
  return generateOpenAIImage(input.profile, input.prompt, fetchFn, input.signal)
}

async function generateOpenAIImage(
  profile: DisplayImageProfile,
  prompt: string,
  fetchFn: typeof fetch,
  signal?: AbortSignal
): Promise<{ bytes: Uint8Array; mime: DisplayImageMime }> {
  const url = `${trimBaseUrl(profile.baseUrl, OPENAI_DEFAULT_BASE_URL)}/images/generations`
  const response = await fetchFn(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${profile.apiKey}`
    },
    body: JSON.stringify({
      model: profile.model,
      prompt,
      n: 1,
      size: '1024x1024',
      response_format: 'b64_json'
    }),
    signal
  })
  const json = await readJson(response)
  const b64 = readOpenAIB64(json)
  if (!b64) throw new Error('生图响应无法解析。')
  return { bytes: decodeB64(b64), mime: 'image/png' }
}

async function generateGeminiImage(
  profile: DisplayImageProfile,
  prompt: string,
  fetchFn: typeof fetch,
  signal?: AbortSignal
): Promise<{ bytes: Uint8Array; mime: DisplayImageMime }> {
  const url = `${trimBaseUrl(profile.baseUrl, GEMINI_DEFAULT_BASE_URL)}/models/${encodeURIComponent(profile.model)}:generateContent`
  const response = await fetchFn(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': profile.apiKey
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'] }
    }),
    signal
  })
  const json = await readJson(response)
  const inline = readGeminiInlineData(json)
  if (!inline) throw new Error('生图响应无法解析。')
  return { bytes: decodeB64(inline.data), mime: displayImageMime(inline.mime) }
}

async function readJson(response: Response): Promise<unknown> {
  if (!response.ok) throw new Error('生图请求失败。')
  try {
    return await response.json()
  } catch {
    throw new Error('生图响应无法解析。')
  }
}

function readOpenAIB64(value: unknown): string | undefined {
  if (!isRecord(value) || !Array.isArray(value.data)) return undefined
  const first = value.data[0]
  return isRecord(first) && typeof first.b64_json === 'string' ? first.b64_json : undefined
}

function readGeminiInlineData(value: unknown): { data: string; mime?: string } | undefined {
  if (!isRecord(value) || !Array.isArray(value.candidates)) return undefined
  for (const candidate of value.candidates) {
    if (!isRecord(candidate) || !isRecord(candidate.content) || !Array.isArray(candidate.content.parts)) {
      continue
    }
    for (const part of candidate.content.parts) {
      if (!isRecord(part)) continue
      const inline = isRecord(part.inlineData)
        ? part.inlineData
        : isRecord(part.inline_data)
          ? part.inline_data
          : undefined
      if (!inline || typeof inline.data !== 'string' || !inline.data) continue
      const mime =
        typeof inline.mimeType === 'string'
          ? inline.mimeType
          : typeof inline.mime_type === 'string'
            ? inline.mime_type
            : undefined
      return { data: inline.data, mime }
    }
  }
  return undefined
}

function displayImageMime(value: string | undefined): DisplayImageMime {
  const mime = (value ?? '').toLowerCase()
  if (mime === 'image/jpeg' || mime === 'image/jpg') return 'image/jpeg'
  if (mime === 'image/webp') return 'image/webp'
  return 'image/png'
}

function trimBaseUrl(baseUrl: string | undefined, fallback: string): string {
  return (baseUrl || fallback).replace(/\/$/, '')
}

function decodeB64(value: string): Uint8Array {
  return Uint8Array.from(Buffer.from(value, 'base64'))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
