# @quillarium/ai

`@quillarium/ai` loads AI configuration, sends text-generation requests, builds Quillarium prompts,
and records scene-generation artifacts in core run directories.

## Primary APIs

- Configuration: `loadAIConfig`, `loadAIProfile`, `defaultBaseUrl`, `defaultModel`, and
  `isAIConfigured`.
- Portable generation resolution: `resolveGenerationPreset` and `contextCompileOptions` combine a
  project WritingPreset with a caller-provided machine-local connection profile.
- Requests: `generateText`, `generateCanonText`, `AIRequestError`, `AIRequestOptions`,
  `DEFAULT_AI_TIMEOUT_MS`, and `DEFAULT_AI_MAX_RETRIES`.
- Recorded generation: `buildSectionPrompt`, `createGenerationRun`, and `generateIntoRun`.

`buildSectionPrompt` retains its pre-0.2 exported name. Current author-facing terminology is scene
(“节”), and chapter prompt-source composition lives in `@quillarium/core`.

`loadAIConfig` reads `QUILL_AI_PROVIDER`, `QUILL_AI_BASE_URL`, `QUILL_AI_API_KEY`,
`QUILL_AI_MODEL`, `QUILL_AI_TEMPERATURE`, and `QUILL_AI_MAX_TOKENS`. `loadAIProfile` can merge a
saved desktop profile and accepts a decryption callback; an environment API key takes precedence.
Provider-aware defaults select the matching endpoint and model. DeepSeek defaults to
`https://api.deepseek.com` and `deepseek-v4-flash`.

## Minimal Example

```ts
import { generateText, loadAIConfig } from '@quillarium/ai'

const config = loadAIConfig({
  QUILL_AI_PROVIDER: 'openai-compatible',
  QUILL_AI_BASE_URL: 'http://localhost:11434/v1',
  QUILL_AI_MODEL: 'llama3.1'
})

const text = await generateText('Write one restrained opening paragraph.', config)
```

DeepSeek requests default to non-thinking mode to preserve the existing completion behavior. Pass
`{ thinkingMode: 'enabled' }` to opt in. Callers that need structured output can pass
`{ responseFormat: 'json_object' }` to request OpenAI-compatible JSON mode.

`createGenerationRun` writes context and prompt artifacts without calling a provider and requires a
selected WritingPreset (or its exact resolved snapshot). Every generation run records preset
ID/version/hash and immutable `writing-preset.json`; `generateIntoRun` verifies run, snapshot, and AI
configuration identity before calling the provider.

## Boundaries and Tests

`generateText`, `generateCanonText`, and `generateIntoRun` can make network requests. The transport
posts to the configured `<baseUrl>/chat/completions` endpoint and expects the supported
chat-completions response shape. Non-local endpoints require an API key; `localhost` endpoints may
run without one. Empty or whitespace-only completion content is rejected before generation
artifacts can be marked generated. The package does not encrypt credentials—desktop supplies the
encryption and decryption boundary.

Tests stub `globalThis.fetch`, so they require no provider or network access:

```bash
pnpm exec vitest run packages/ai/src
```

Use `createGenerationRun` alone for a no-network dry run, and inject a mocked `fetch` when testing
request, timeout, retry, or provider-error behavior.
