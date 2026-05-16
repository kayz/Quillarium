import { createRun, writeRunFile, writeRunMetadata, type RunMetadata } from '@quillarium/core'

export interface AIConfig {
  provider: string
  baseUrl: string
  apiKey: string
  model: string
  temperature: number
  maxTokens: number
}

export function loadAIConfig(env: NodeJS.ProcessEnv = process.env): AIConfig {
  return {
    provider: env.QUILL_AI_PROVIDER ?? 'openai-compatible',
    baseUrl: env.QUILL_AI_BASE_URL ?? 'https://api.openai.com/v1',
    apiKey: env.QUILL_AI_API_KEY ?? '',
    model: env.QUILL_AI_MODEL ?? 'gpt-4o-mini',
    temperature: Number(env.QUILL_AI_TEMPERATURE ?? '0.7'),
    maxTokens: Number(env.QUILL_AI_MAX_TOKENS ?? '2000')
  }
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

export async function generateText(prompt: string, config: AIConfig): Promise<string> {
  if (!config.apiKey && !config.baseUrl.includes('localhost')) {
    throw new Error('Missing QUILL_AI_API_KEY. Set QUILL_AI_API_KEY or use a local OpenAI-compatible endpoint.')
  }
  const response = await fetch(`${config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey || 'local'}`
    },
    body: JSON.stringify({
      model: config.model,
      temperature: config.temperature,
      max_tokens: config.maxTokens,
      messages: [
        { role: 'system', content: 'You are Quillarium, a continuity-aware fiction writing assistant.' },
        { role: 'user', content: prompt }
      ]
    })
  })
  if (!response.ok) {
    throw new Error(`AI request failed ${response.status}: ${await response.text()}`)
  }
  const json = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
  return json.choices?.[0]?.message?.content ?? ''
}

export async function createGenerationRun(projectRoot: string, sceneId: string, context: string, config: AIConfig): Promise<RunMetadata> {
  const run = await createRun(projectRoot, sceneId, {
    provider: config.provider,
    model: config.model,
    status: 'created'
  })
  const prompt = buildSectionPrompt(context)
  await writeRunFile(projectRoot, run, 'context.md', context)
  await writeRunFile(projectRoot, run, 'prompt.md', prompt)
  return run
}

export async function generateIntoRun(projectRoot: string, run: RunMetadata, context: string, config: AIConfig): Promise<string> {
  const prompt = buildSectionPrompt(context)
  const output = await generateText(prompt, config)
  const next = { ...run, status: 'generated' as const }
  await writeRunFile(projectRoot, next, 'prompt.md', prompt)
  await writeRunFile(projectRoot, next, 'output-raw.md', output)
  await writeRunMetadata(projectRoot, next)
  return output
}
