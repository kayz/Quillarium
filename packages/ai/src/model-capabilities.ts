export interface AIModelCapabilities {
  provider: 'deepseek'
  model: string
  displayName: string
  contextWindowTokens: number
  maxOutputTokens: number
  sourceUrl: string
  modelsSourceUrl: string
  verifiedAt: string
}

export const DEEPSEEK_DEFAULT_MODEL = 'deepseek-v4-flash'

const DEEPSEEK_V4_CAPABILITIES = Object.freeze([
  deepSeekV4('deepseek-v4-flash', 'DeepSeek V4 Flash'),
  deepSeekV4('deepseek-v4-pro', 'DeepSeek V4 Pro')
])

export function listOfficialModelCapabilities(): AIModelCapabilities[] {
  return DEEPSEEK_V4_CAPABILITIES.map((capability) => ({ ...capability }))
}

export function getOfficialModelCapabilities(
  provider: string,
  model: string
): AIModelCapabilities | undefined {
  const normalizedProvider = provider.trim().toLowerCase()
  const normalizedModel = model.trim().toLowerCase()
  return DEEPSEEK_V4_CAPABILITIES.find(
    (capability) => capability.provider === normalizedProvider && capability.model === normalizedModel
  )
}

function deepSeekV4(model: string, displayName: string): AIModelCapabilities {
  return Object.freeze({
    provider: 'deepseek',
    model,
    displayName,
    contextWindowTokens: 1_000_000,
    maxOutputTokens: 384_000,
    sourceUrl: 'https://api-docs.deepseek.com/quick_start/pricing',
    modelsSourceUrl: 'https://api-docs.deepseek.com/api/list-models',
    verifiedAt: '2026-08-16'
  })
}
