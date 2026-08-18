import {
  compileContextBlocks,
  createWritingPreset,
  createProjectAt,
  defaultWritingPreset,
  listRuns,
  loadConfig,
  migrateAIProfileApiKeys,
  readRunFile,
  saveBookGenerationHeader,
  selectWritingPreset,
  writeRunFile,
  withStoredAIProfileApiKey,
  withUpdatedAIProfileApiKey
} from '@quillarium/core'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AIRequestError,
  DEFAULT_AI_TIMEOUT_MS,
  generateText,
  generateCandidateGroup,
  generateIntoRun,
  loadAIConfig,
  loadAIProfile,
  createGenerationRun,
  createGenerationCandidateRuns,
  contextCompileOptions,
  getOfficialModelCapabilities,
  listOfficialModelCapabilities,
  resolveGenerationPreset,
  type AIConfig,
  type AIStreamEvent
} from './index.js'

vi.mock('@quillarium/core', async () => {
  const actual = await vi.importActual<typeof import('@quillarium/core')>('@quillarium/core')
  return { ...actual, loadConfig: vi.fn() }
})

const loadConfigMock = vi.mocked(loadConfig)

const config: AIConfig = {
  provider: 'openai',
  baseUrl: 'https://example.test/v1',
  apiKey: 'test-key',
  model: 'test-model',
  temperature: 0.4,
  maxTokens: 512
}

beforeEach(() => {
  loadConfigMock.mockResolvedValue({})
})

afterEach(() => {
  vi.clearAllMocks()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('loadAIConfig', () => {
  it('uses provider-aware DeepSeek defaults', () => {
    expect(loadAIConfig({ QUILL_AI_PROVIDER: 'deepseek' })).toEqual({
      provider: 'deepseek',
      baseUrl: 'https://api.deepseek.com',
      apiKey: '',
      model: 'deepseek-v4-flash',
      temperature: 0.7,
      maxTokens: 384_000,
      contextWindowTokens: 1_000_000
    })
  })

  it('preserves explicit environment overrides for DeepSeek', () => {
    expect(
      loadAIConfig({
        QUILL_AI_PROVIDER: 'deepseek',
        QUILL_AI_BASE_URL: 'https://gateway.example.test/deepseek',
        QUILL_AI_API_KEY: 'environment-key',
        QUILL_AI_MODEL: 'deepseek-v4-pro',
        QUILL_AI_TEMPERATURE: '0.2',
        QUILL_AI_MAX_TOKENS: '4096'
      })
    ).toEqual({
      provider: 'deepseek',
      baseUrl: 'https://gateway.example.test/deepseek',
      apiKey: 'environment-key',
      model: 'deepseek-v4-pro',
      temperature: 0.2,
      maxTokens: 4096,
      contextWindowTokens: 1_000_000
    })
  })

  it('publishes the official DeepSeek V4 model limits with their source metadata', () => {
    expect(getOfficialModelCapabilities('deepseek', 'deepseek-v4-pro')).toMatchObject({
      contextWindowTokens: 1_000_000,
      maxOutputTokens: 384_000,
      verifiedAt: '2026-08-16'
    })
    expect(listOfficialModelCapabilities().map((item) => item.model)).toEqual([
      'deepseek-v4-flash',
      'deepseek-v4-pro'
    ])
  })
})

describe('generation run snapshots', () => {
  it('creates and retains independently reviewable candidates in one group', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'quillarium-ai-candidates-'))
    try {
      const project = await createProjectAt(path.join(tmp, 'project'), {
        id: 'candidate-sample',
        title: 'Candidate Sample'
      })
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(completionResponse('Candidate one.'))
        .mockResolvedValueOnce(completionResponse('Candidate two.'))
        .mockResolvedValueOnce(completionResponse('Candidate three.'))
      vi.stubGlobal('fetch', fetchMock)

      const group = await generateCandidateGroup({
        projectRoot: project.root,
        sceneId: 'scene-one',
        context: 'Context body.',
        config,
        count: 3
      })

      expect(group.candidates).toHaveLength(3)
      expect(new Set(group.candidates.map((candidate) => candidate.run.candidate_group_id))).toEqual(
        new Set([group.id])
      )
      expect(group.candidates.map((candidate) => candidate.run.candidate_index)).toEqual([0, 1, 2])
      expect(group.candidates.map((candidate) => candidate.output)).toEqual([
        'Candidate one.',
        'Candidate two.',
        'Candidate three.'
      ])
      expect(await listRuns(project.root)).toHaveLength(3)
      await expect(readRunFile(project.root, group.candidates[1]!.run.id, 'output-raw.md')).resolves.toBe(
        'Candidate two.'
      )
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  it('creates a new branch group from any retained candidate', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'quillarium-ai-branch-'))
    try {
      const project = await createProjectAt(path.join(tmp, 'project'), {
        id: 'branch-sample',
        title: 'Branch Sample'
      })
      const parent = await createGenerationRun(project.root, 'scene-one', 'Context body.', config)
      await writeRunFile(project.root, parent, 'output-raw.md', 'Retained parent candidate.')
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(completionResponse('Branch one.'))
        .mockResolvedValueOnce(completionResponse('Branch two.'))
      vi.stubGlobal('fetch', fetchMock)

      const branch = await generateCandidateGroup({
        projectRoot: project.root,
        sceneId: 'scene-one',
        context: 'Current context.',
        config,
        count: 2,
        parentRunId: parent.id
      })

      expect(branch.parent_run_id).toBe(parent.id)
      expect(branch.branch_id).toMatch(/^branch-/)
      expect(branch.candidates.every((candidate) => candidate.run.parent_run_id === parent.id)).toBe(true)
      const request = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body)) as {
        messages: Array<{ role: string; content: string }>
      }
      expect(request.messages.at(-1)?.content).toContain('Retained parent candidate.')
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  it('rejects candidate groups outside the bounded generation count', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'quillarium-ai-candidate-limit-'))
    try {
      const project = await createProjectAt(path.join(tmp, 'project'), {
        id: 'candidate-limit',
        title: 'Candidate Limit'
      })
      await expect(
        createGenerationCandidateRuns({
          projectRoot: project.root,
          sceneId: 'scene-one',
          context: 'Context body.',
          config,
          count: 1
        })
      ).rejects.toThrow('between 2 and 8')
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  it('rejects a branch parent from another scene', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'quillarium-ai-branch-target-'))
    try {
      const project = await createProjectAt(path.join(tmp, 'project'), {
        id: 'branch-target',
        title: 'Branch Target'
      })
      const parent = await createGenerationRun(project.root, 'scene-one', 'Context body.', config)
      await writeRunFile(project.root, parent, 'output-raw.md', 'Parent prose.')

      await expect(
        createGenerationCandidateRuns({
          projectRoot: project.root,
          sceneId: 'scene-two',
          context: 'Context body.',
          config,
          count: 2,
          parentRunId: parent.id
        })
      ).rejects.toThrow('belongs to scene scene-one, not scene-two')
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  it('resolves project preset overrides through one shared profile loader', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'quillarium-ai-preset-'))
    try {
      const project = await createProjectAt(path.join(tmp, 'project'), {
        id: 'preset-resolution',
        title: 'Preset Resolution'
      })
      const preset = defaultWritingPreset('custom', 'Custom')
      preset.model = {
        profile: 'background',
        provider: 'deepseek',
        model: 'deepseek-v4-flash',
        temperature: 0.1,
        max_output_tokens: 4096,
        tokenizer_id: 'deepseek-v4'
      }
      await createWritingPreset(project.root, preset)
      await selectWritingPreset(project.root, 'custom')
      const loadProfile = vi.fn(async () => config)

      const resolved = await resolveGenerationPreset(project.root, loadProfile)

      expect(loadProfile).toHaveBeenCalledWith('background')
      expect(resolved.config).toMatchObject({
        provider: 'deepseek',
        baseUrl: 'https://api.deepseek.com',
        model: 'deepseek-v4-flash',
        temperature: 0.1,
        maxTokens: 4096,
        apiKey: config.apiKey
      })
      expect(resolved.snapshot).toMatchObject({
        preset_id: 'custom',
        model: { profile: 'background', provider: 'deepseek', tokenizer_id: 'deepseek-v4' }
      })
      expect(JSON.stringify(resolved.snapshot)).not.toContain(config.apiKey)
      expect(JSON.stringify(resolved.snapshot)).not.toContain(resolved.config.baseUrl)
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  it('stores the exact shared guidance bytes and metadata used by the run', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'quillarium-ai-run-'))
    try {
      const project = await createProjectAt(path.join(tmp, 'project'), {
        id: 'sample-project',
        title: 'Sample Project'
      })
      const guidance = [
        {
          id: 'chapter-method',
          path: 'methodology/chapter.md',
          scope: 'scene' as const,
          content: 'Keep the scene focused.',
          sha256: '0123456789abcdef',
          read_at: '2026-08-12T00:00:00.000Z'
        }
      ]
      const run = await createGenerationRun(project.root, 'scene-one', 'context', config, {}, guidance)

      await expect(readRunFile(project.root, run.id, 'shared-guidance.md')).resolves.toContain(
        'Keep the scene focused.'
      )
      await expect(readRunFile(project.root, run.id, 'shared-guidance.json')).resolves.toContain(
        'chapter-method'
      )
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  it('snapshots an author-adjusted prompt verbatim', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'quillarium-ai-prompt-'))
    try {
      const project = await createProjectAt(path.join(tmp, 'project'), {
        id: 'prompt-sample',
        title: 'Prompt Sample'
      })
      const prompt = '  Author adjusted prompt.\nKeep this exact ending.\n'
      const run = await createGenerationRun(project.root, 'scene-one', 'context', config, {}, [], prompt)

      await expect(readRunFile(project.root, run.id, 'prompt.md')).resolves.toBe(prompt)
      await expect(readRunFile(project.root, run.id, 'context.md')).resolves.toBe('context')
      const envelope = JSON.parse(await readRunFile(project.root, run.id, 'prompt-envelope.json')) as {
        manually_edited: boolean
        compiled_prompt_sha256: string
        sent_prompt_sha256: string
        messages: Array<{ role: string; content: string }>
      }
      expect(envelope.manually_edited).toBe(true)
      expect(envelope.compiled_prompt_sha256).not.toBe(envelope.sent_prompt_sha256)
      expect(envelope.messages.at(-1)?.content).toBe(prompt)
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  it('orders and snapshots the book header and persists the sanitized provider-visible request', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'quillarium-ai-book-header-'))
    try {
      const project = await createProjectAt(path.join(tmp, 'project'), {
        id: 'book-header-run',
        title: 'Book Header Run'
      })
      const supportedConfig: AIConfig = {
        ...config,
        model: 'gpt-4o-mini',
        apiKey: 'sk-must-never-be-snapshotted',
        baseUrl: 'https://private-endpoint.example/v1'
      }
      const headerText = 'BOOK HEADER FIRST. {{char}} stays literal.'
      await saveBookGenerationHeader(project.root, headerText)
      const run = await createGenerationRun(
        project.root,
        'scene-one',
        'PromptBlock context. C:\\Users\\writer\\notes.md sk-visiblecredential12345',
        supportedConfig
      )
      const envelope = JSON.parse(await readRunFile(project.root, run.id, 'prompt-envelope.json')) as {
        system_message: string
        messages: Array<{ role: string; content: string }>
      }
      const headerSnapshot = JSON.parse(
        await readRunFile(project.root, run.id, 'book-generation-header.json')
      ) as {
        text: string
        relative_path: string
        sha256: string
        actual_tokens: number
        tokenizer_id: string
      }
      const providerRequest = JSON.parse(
        await readRunFile(project.root, run.id, 'provider-request.json')
      ) as { messages: Array<{ role: string; content: string }> }
      expect(envelope.system_message.indexOf(headerText)).toBeLessThan(
        envelope.system_message.indexOf('CODE-OWNED GENERATION TASK')
      )
      expect(envelope.system_message.indexOf('CODE-OWNED GENERATION TASK')).toBeLessThan(
        envelope.system_message.indexOf('WritingPreset 生文指令')
      )
      expect(headerSnapshot).toMatchObject({
        text: headerText,
        relative_path: 'prompts/book-generation-header.md',
        sha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
        tokenizer_id: 'o200k'
      })
      expect(headerSnapshot.actual_tokens).toBeGreaterThan(0)
      expect(providerRequest.messages[0]).toEqual(envelope.messages[0])
      expect(JSON.stringify(providerRequest)).not.toMatch(
        /sk-must-never-be-snapshotted|sk-visiblecredential12345|private-endpoint|C:\\\\Users\\\\writer/u
      )
      expect(JSON.stringify(providerRequest)).toContain('[LOCAL_PATH_REDACTED]')
      expect(JSON.stringify(providerRequest)).toContain('[REDACTED_CREDENTIAL]')

      await saveBookGenerationHeader(project.root, 'A later header that must not rewrite old runs.')
      expect(
        JSON.parse(await readRunFile(project.root, run.id, 'book-generation-header.json'))
      ).toMatchObject({ text: headerText })
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  it('reuses the immutable run preset and rejects a mismatched generation config', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'quillarium-ai-preset-replay-'))
    try {
      const project = await createProjectAt(path.join(tmp, 'project'), {
        id: 'preset-replay',
        title: 'Preset Replay'
      })
      const preset = defaultWritingPreset('quiet-prose', 'Quiet Prose')
      preset.prompt_stack.system_prompt = 'Use the snapshotted quiet-prose system instruction.'
      await createWritingPreset(project.root, preset)
      await selectWritingPreset(project.root, preset.id)
      const run = await createGenerationRun(project.root, 'scene-one', 'Context body.', config)
      const fetchMock = vi.fn().mockResolvedValue(completionResponse('Generated from snapshot.'))
      vi.stubGlobal('fetch', fetchMock)

      await expect(
        generateIntoRun(project.root, run, 'Context body.', config, { timeoutMs: 0 })
      ).resolves.toBe('Generated from snapshot.')
      const request = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body)) as {
        messages: Array<{ role: string; content: string }>
      }
      expect(request.messages[0]?.role).toBe('system')
      expect(request.messages[0]?.content).toContain('CODE-OWNED GENERATION TASK AND PERMISSION BOUNDARY')
      expect(request.messages[0]?.content).toContain('Use the snapshotted quiet-prose system instruction.')
      expect(request.messages[0]!.content.indexOf('CODE-OWNED')).toBeLessThan(
        request.messages[0]!.content.indexOf('Use the snapshotted quiet-prose')
      )

      await expect(
        generateIntoRun(project.root, run, 'Context body.', { ...config, model: 'different-model' })
      ).rejects.toThrow('does not match the immutable WritingPreset snapshot')
      expect(fetchMock).toHaveBeenCalledTimes(1)
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  it('persists the exact compilation snapshot without credentials or machine paths', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'quillarium-ai-compilation-'))
    try {
      const project = await createProjectAt(path.join(tmp, 'project'), {
        id: 'compilation-sample',
        title: 'Compilation Sample'
      })
      const supportedConfig: AIConfig = { ...config, model: 'gpt-4o-mini' }
      const resolved = await resolveGenerationPreset(project.root, async () => supportedConfig)
      const compilation = await compileContextBlocks(
        { type: 'scene', id: 'scene-one' },
        [
          {
            id: 'canon:sample',
            kind: 'canon',
            title: 'Sample Canon',
            content: 'The gate remains closed.',
            source: { type: 'canon', id: 'sample', path: 'canon/sample.md' },
            scope: 'scene',
            purpose: 'preserve a fixed fact',
            authority: 'hard_canon',
            authority_rank: 500,
            priority: 500,
            order: 0,
            selected: true,
            required: true,
            selection_reason: 'active hard Canon',
            truncation: 'none'
          }
        ],
        contextCompileOptions(resolved.config, resolved.snapshot)
      )

      const run = await createGenerationRun(
        project.root,
        'scene-one',
        compilation.markdown,
        resolved.config,
        {},
        [],
        undefined,
        {
          prompt_blocks: compilation.blocks,
          context_trace: compilation.trace,
          writing_preset: resolved.snapshot
        }
      )
      const blocks = await readRunFile(project.root, run.id, 'prompt-blocks.json')
      const trace = await readRunFile(project.root, run.id, 'context-trace.json')
      const preset = await readRunFile(project.root, run.id, 'writing-preset.json')
      const envelope = await readRunFile(project.root, run.id, 'prompt-envelope.json')
      const execution = await readRunFile(project.root, run.id, 'agent-execution.json')
      const serialized = `${blocks}\n${trace}\n${preset}\n${envelope}\n${execution}`

      expect(JSON.parse(blocks)).toMatchObject({
        schema_version: 1,
        blocks: [{ source: { path: 'canon/sample.md' }, tokenizer_id: 'o200k' }]
      })
      expect(JSON.parse(trace)).toMatchObject({
        tokenizer: { id: 'o200k', model: 'gpt-4o-mini', exact: true },
        preset: { id: 'default', version: '1.0.0' },
        final_block_ids: ['canon:sample']
      })
      expect(JSON.parse(preset)).toMatchObject({
        preset_id: 'default',
        preset_version: '1.0.0',
        model: { provider: 'openai', model: 'gpt-4o-mini' }
      })
      expect(JSON.parse(envelope)).toMatchObject({
        schema_version: 1,
        manually_edited: false,
        messages: [{ role: 'system' }, { role: 'user' }]
      })
      expect(JSON.parse(execution)).toMatchObject({
        schema_version: 1,
        execution_kind: 'product_task',
        task: { id: 'scene-generation', version: '1.0.0' },
        target: { document_type: 'scene', document_id: 'scene-one' },
        writing_preset: { snapshot_sha256: resolved.snapshot.snapshot_sha256 }
      })
      expect(run).toMatchObject({
        preset_id: 'default',
        preset_version: '1.0.0',
        preset_sha256: resolved.snapshot.snapshot_sha256
      })
      expect(serialized).not.toContain(config.apiKey)
      expect(serialized).not.toContain(tmp.replace(/\\/gu, '/'))
      expect(serialized).not.toContain(tmp)
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })
})

describe('loadAIProfile', () => {
  it('upgrades the legacy DeepSeek 2000-token default in memory without rewriting the profile', async () => {
    loadConfigMock.mockResolvedValue({
      aiProfiles: {
        prose: {
          provider: 'deepseek',
          model: 'deepseek-v4-pro',
          maxTokens: 2_000
        }
      }
    })

    const profile = await loadAIProfile('prose', {})

    expect(profile).toMatchObject({
      provider: 'deepseek',
      model: 'deepseek-v4-pro',
      maxTokens: 384_000,
      contextWindowTokens: 1_000_000
    })
    expect(loadConfigMock).toHaveBeenCalledOnce()
  })

  it('prefers QUILL_AI_API_KEY without invoking the decryptor', async () => {
    loadConfigMock.mockResolvedValue({
      aiProfiles: {
        prose: {
          provider: 'openai',
          apiKeyEncrypted: 'ciphertext',
          apiKey: 'legacy-key'
        }
      }
    })
    const decrypt = vi.fn().mockReturnValue('decrypted-key')

    const profile = await loadAIProfile('prose', { QUILL_AI_API_KEY: 'environment-key' }, decrypt)

    expect(profile.apiKey).toBe('environment-key')
    expect(decrypt).not.toHaveBeenCalled()
  })

  it('prefers a decrypted key over a legacy plaintext key', async () => {
    loadConfigMock.mockResolvedValue({
      aiProfiles: {
        prose: {
          provider: 'openai',
          apiKeyEncrypted: 'ciphertext',
          apiKey: 'legacy-key'
        }
      }
    })
    const decrypt = vi.fn().mockResolvedValue('decrypted-key')

    const profile = await loadAIProfile('prose', {}, decrypt)

    expect(profile.apiKey).toBe('decrypted-key')
    expect(decrypt).toHaveBeenCalledWith('ciphertext')
  })

  it('falls back to the legacy plaintext key when decryption fails', async () => {
    loadConfigMock.mockResolvedValue({
      aiProfiles: {
        prose: {
          provider: 'openai',
          apiKeyEncrypted: 'ciphertext',
          apiKey: 'legacy-key'
        }
      }
    })
    const decrypt = vi.fn().mockRejectedValue(new Error('decryption failed'))

    const profile = await loadAIProfile('prose', {}, decrypt)

    expect(profile.apiKey).toBe('legacy-key')
  })

  it('returns an empty key when encrypted decryption fails without a legacy key', async () => {
    loadConfigMock.mockResolvedValue({
      aiProfiles: {
        prose: {
          provider: 'openai',
          apiKeyEncrypted: 'ciphertext'
        }
      }
    })

    const profile = await loadAIProfile('prose', {}, () => {
      throw new Error('decryption failed')
    })

    expect(profile.apiKey).toBe('')
    expect(profile.apiKey).not.toContain('ciphertext')
  })
})

describe('AI profile key persistence', () => {
  it('serializes only ciphertext when encryption is available', () => {
    const secret = 'plain-secret-that-must-not-reach-disk'
    const stored = withStoredAIProfileApiKey(
      {
        provider: 'openai',
        apiKey: 'old-plaintext',
        apiKeyEncrypted: 'old-ciphertext'
      },
      secret,
      (value) => {
        expect(value).toBe(secret)
        return 'encrypted-base64-payload'
      }
    )
    const serialized = JSON.stringify({ aiProfiles: { prose: stored } })

    expect(stored.apiKey).toBeUndefined()
    expect(stored.apiKeyEncrypted).toBe('encrypted-base64-payload')
    expect(serialized).not.toContain(secret)
    expect(serialized).not.toContain('old-plaintext')
  })

  it('migrates plaintext profiles into a disk payload with no plaintext key fields', () => {
    const secret = 'legacy-secret-on-disk'
    const migrated = migrateAIProfileApiKeys(
      {
        language: 'en',
        aiProfiles: {
          prose: { provider: 'openai', apiKey: secret },
          check: { provider: 'deepseek', apiKey: 'second-legacy-secret' }
        }
      },
      (value) => `encrypted:${value.length}`
    )
    const serialized = JSON.stringify(migrated)

    expect(migrated.aiProfiles?.prose?.apiKey).toBeUndefined()
    expect(migrated.aiProfiles?.check?.apiKey).toBeUndefined()
    expect(migrated.aiProfiles?.prose?.apiKeyEncrypted).toBe(`encrypted:${secret.length}`)
    expect(serialized).not.toContain(secret)
    expect(serialized).not.toContain('second-legacy-secret')
  })

  it('removes a stale plaintext field without replacing existing ciphertext', () => {
    const migrated = migrateAIProfileApiKeys(
      {
        aiProfiles: {
          prose: {
            provider: 'openai',
            apiKey: 'stale-plaintext',
            apiKeyEncrypted: 'existing-ciphertext'
          }
        }
      },
      () => {
        throw new Error('existing ciphertext must not be replaced')
      }
    )

    expect(migrated.aiProfiles?.prose?.apiKey).toBeUndefined()
    expect(migrated.aiProfiles?.prose?.apiKeyEncrypted).toBe('existing-ciphertext')
    expect(JSON.stringify(migrated)).not.toContain('stale-plaintext')
  })

  it('preserves existing ciphertext when an ordinary settings save submits an empty key', () => {
    const stored = withUpdatedAIProfileApiKey(
      { provider: 'openai', model: 'next-model' },
      { provider: 'openai', apiKeyEncrypted: 'existing-ciphertext' },
      ''
    )

    expect(stored.model).toBe('next-model')
    expect(stored.apiKey).toBeUndefined()
    expect(stored.apiKeyEncrypted).toBe('existing-ciphertext')
  })

  it('clears both key fields only when explicitly requested', () => {
    const stored = withUpdatedAIProfileApiKey(
      { provider: 'openai' },
      { provider: 'openai', apiKeyEncrypted: 'existing-ciphertext' },
      '',
      { clear: true }
    )

    expect(stored.apiKey).toBeUndefined()
    expect(stored.apiKeyEncrypted).toBeUndefined()
  })

  it('keeps the legacy plaintext field only when no encryptor is supplied', () => {
    const stored = withStoredAIProfileApiKey(
      { provider: 'openai', apiKeyEncrypted: 'stale-ciphertext' },
      'fallback-key'
    )

    expect(stored.apiKey).toBe('fallback-key')
    expect(stored.apiKeyEncrypted).toBeUndefined()
  })
})

describe('generateText', () => {
  it('returns a successful completion without changing the existing call shape', async () => {
    const fetchMock = vi.fn().mockResolvedValue(completionResponse('Generated prose'))
    vi.stubGlobal('fetch', fetchMock)

    await expect(generateText('Continue the scene', config, undefined, { timeoutMs: 0 })).resolves.toBe(
      'Generated prose'
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://example.test/v1/chat/completions')
    expect(init.headers).toMatchObject({ Authorization: 'Bearer test-key' })
    expect(JSON.parse(String(init.body))).toMatchObject({
      model: 'test-model',
      messages: [{ role: 'system' }, { role: 'user', content: 'Continue the scene' }]
    })
    expect(JSON.parse(String(init.body))).not.toHaveProperty('thinking')
    expect(JSON.parse(String(init.body))).not.toHaveProperty('response_format')
  })

  it('uses the DeepSeek endpoint with non-thinking and optional JSON response modes', async () => {
    const fetchMock = vi.fn().mockResolvedValue(completionResponse('{"issues":[]}'))
    vi.stubGlobal('fetch', fetchMock)
    const deepseekConfig = loadAIConfig({
      QUILL_AI_PROVIDER: 'deepseek',
      QUILL_AI_API_KEY: 'deepseek-test-key'
    })

    await expect(
      generateText('Check the scene', deepseekConfig, undefined, {
        timeoutMs: 0,
        responseFormat: 'json_object'
      })
    ).resolves.toBe('{"issues":[]}')

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.deepseek.com/chat/completions')
    expect(JSON.parse(String(init.body))).toMatchObject({
      model: 'deepseek-v4-flash',
      thinking: { type: 'disabled' },
      response_format: { type: 'json_object' }
    })
  })

  it('allows callers to opt into DeepSeek thinking mode', async () => {
    const fetchMock = vi.fn().mockResolvedValue(completionResponse('Thoughtful response'))
    vi.stubGlobal('fetch', fetchMock)
    const deepseekConfig = loadAIConfig({
      QUILL_AI_PROVIDER: 'deepseek',
      QUILL_AI_API_KEY: 'deepseek-test-key'
    })

    await generateText('Prompt', deepseekConfig, undefined, { timeoutMs: 0, thinkingMode: 'enabled' })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toMatchObject({ thinking: { type: 'enabled' } })
  })

  it('raises an actionable error when the provider reports output truncation', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        choices: [{ finish_reason: 'length', message: { content: '{"items":[' } }]
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    const error = await captureRequestError(
      generateText('Prompt', { ...config, maxTokens: 12_345 }, undefined, { timeoutMs: 0 })
    )

    expect(error).toMatchObject({ provider: 'openai', status: 200 })
    expect(error.message).toContain('AI_OUTPUT_TRUNCATED')
    expect(error.message).toContain('max_tokens=12345')
  })

  it('throws a structured error before fetching when the API key is missing', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const error = await captureRequestError(
      generateText('Prompt', { ...config, apiKey: '' }, undefined, { timeoutMs: 0 })
    )

    expect(error).toMatchObject({
      name: 'AIRequestError',
      provider: 'openai',
      status: undefined,
      hint: 'Set QUILL_AI_API_KEY or use a local OpenAI-compatible endpoint.'
    })
    expect(error.message).toContain('Missing QUILL_AI_API_KEY')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('uses a 120 second default timeout and reports timeout details', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn(() => new Promise<Response>(() => undefined))
    vi.stubGlobal('fetch', fetchMock)
    let settled = false

    const errorPromise = captureRequestError(generateText('Prompt', config)).then((error) => {
      settled = true
      return error
    })

    await vi.advanceTimersByTimeAsync(DEFAULT_AI_TIMEOUT_MS - 1)
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1)

    const error = await errorPromise
    expect(DEFAULT_AI_TIMEOUT_MS).toBe(120_000)
    expect(error).toMatchObject({
      provider: 'openai',
      status: undefined,
      hint: 'Increase timeoutMs or check whether the provider endpoint is responding.'
    })
    expect(error.message).toContain('timed out after 120000ms')
    expect(error.cause).toBeInstanceOf(Error)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('wraps network failures with provider context and the original cause', async () => {
    const cause = new TypeError('socket closed')
    const fetchMock = vi.fn().mockRejectedValue(cause)
    vi.stubGlobal('fetch', fetchMock)

    const error = await captureRequestError(generateText('Prompt', config, undefined, { timeoutMs: 0 }))

    expect(error.provider).toBe('openai')
    expect(error.status).toBeUndefined()
    expect(error.cause).toBe(cause)
    expect(error.message).toContain('AI connection failed')
    expect(error.message).toContain('socket closed')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('applies the timeout while reading a stalled success body', async () => {
    vi.useFakeTimers()
    const stalledResponse = {
      ok: true,
      status: 200,
      json: vi.fn(() => new Promise<unknown>(() => undefined))
    } as unknown as Response
    const fetchMock = vi.fn().mockResolvedValue(stalledResponse)
    vi.stubGlobal('fetch', fetchMock)

    const errorPromise = captureRequestError(generateText('Prompt', config, undefined, { timeoutMs: 25 }))
    await vi.advanceTimersByTimeAsync(25)

    const error = await errorPromise
    expect(error.message).toContain('timed out after 25ms')
    expect(stalledResponse.json).toHaveBeenCalledTimes(1)
  })

  it('retries a 429 response once and can make the backoff immediate', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(providerErrorResponse(429, { error: { message: 'rate limited' } }))
      .mockResolvedValueOnce(completionResponse('Recovered'))
    vi.stubGlobal('fetch', fetchMock)

    await expect(generateText('Prompt', config, undefined, { timeoutMs: 0, retryDelayMs: 0 })).resolves.toBe(
      'Recovered'
    )
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('retries a 500 once, safely parses provider errors, and exposes the final failure', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(providerErrorResponse(500, '{ malformed provider json'))
      .mockResolvedValueOnce(providerErrorResponse(500, { error: { message: 'still unavailable' } }))
    vi.stubGlobal('fetch', fetchMock)

    const error = await captureRequestError(
      generateText('Prompt', config, undefined, { timeoutMs: 0, retryDelayMs: 0 })
    )

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(error).toMatchObject({
      provider: 'openai',
      status: 500,
      hint: 'The provider service is temporarily unavailable; try again later.'
    })
    expect(error.message).toContain('still unavailable')
  })

  it('can disable retries for retryable provider errors', async () => {
    const fetchMock = vi.fn().mockResolvedValue(providerErrorResponse(500, 'upstream failed'))
    vi.stubGlobal('fetch', fetchMock)

    const error = await captureRequestError(
      generateText('Prompt', config, undefined, { timeoutMs: 0, maxRetries: 0 })
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(error.status).toBe(500)
    expect(error.message).toContain('upstream failed')
  })

  it('retains bounded provider request identity and response detail for runtime auditing', async () => {
    const responseBody = JSON.stringify({ error: { message: 'upstream rejected request' } })
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(responseBody, {
        status: 400,
        headers: { 'x-request-id': 'provider-request-123' }
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    const error = await captureRequestError(
      generateText('Prompt', config, undefined, { timeoutMs: 0, maxRetries: 0 })
    )

    expect(error).toMatchObject({
      status: 400,
      requestId: 'provider-request-123',
      responseBody
    })
  })

  it('reports malformed success JSON with status and parse cause', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('not-json', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const error = await captureRequestError(generateText('Prompt', config, undefined, { timeoutMs: 0 }))

    expect(error).toMatchObject({ provider: 'openai', status: 200 })
    expect(error.message).toContain('returned malformed JSON')
    expect(error.cause).toBeInstanceOf(SyntaxError)
  })

  it('reports a successful JSON response with an incompatible shape', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ result: 'unexpected' }))
    vi.stubGlobal('fetch', fetchMock)

    const error = await captureRequestError(generateText('Prompt', config, undefined, { timeoutMs: 0 }))

    expect(error).toMatchObject({ provider: 'openai', status: 200 })
    expect(error.message).toContain('choices[0].message.content')
  })

  it('rejects whitespace-only completion content', async () => {
    const fetchMock = vi.fn().mockResolvedValue(completionResponse('  \n\t'))
    vi.stubGlobal('fetch', fetchMock)

    const error = await captureRequestError(generateText('Prompt', config, undefined, { timeoutMs: 0 }))

    expect(error).toMatchObject({ provider: 'openai', status: 200 })
    expect(error.message).toContain('empty choices[0].message.content')
  })

  it('assembles SSE content across arbitrary and UTF-8 byte boundaries while hiding reasoning content', async () => {
    const encoder = new TextEncoder()
    const payload = [
      'data: {"choices":[{"delta":{"reasoning_content":"private chain"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"你"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"好"},"finish_reason":"stop"}]}\n\n',
      'data: [DONE]\n\n'
    ].join('')
    const bytes = encoder.encode(payload)
    const splitAt = bytes.indexOf(0xe4) + 1
    const response = sseResponse([
      bytes.slice(0, splitAt),
      bytes.slice(splitAt, splitAt + 1),
      bytes.slice(splitAt + 1)
    ])
    const fetchMock = vi.fn().mockResolvedValue(response)
    vi.stubGlobal('fetch', fetchMock)
    const events: AIStreamEvent[] = []

    await expect(
      generateText('Prompt', config, undefined, {
        timeoutMs: 0,
        onStreamEvent: (event) => events.push(event)
      })
    ).resolves.toBe('你好')

    expect(JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body))).toMatchObject({
      stream: true
    })
    expect(
      events
        .filter(
          (event): event is Extract<AIStreamEvent, { type: 'content_delta' }> =>
            event.type === 'content_delta'
        )
        .map((event) => event.delta)
        .join('')
    ).toBe('你好')
    expect(JSON.stringify(events)).not.toContain('private chain')
    expect(events.at(-1)?.type).toBe('completed')
  })

  it('rejects an interrupted SSE stream and never returns its partial content as a success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(sseResponse(['data: {"choices":[{"delta":{"content":"partial"}}]}\n\n']))
    )
    const deltas: string[] = []

    const error = await captureRequestError(
      generateText('Prompt', config, undefined, {
        timeoutMs: 0,
        onStreamEvent: (event) => {
          if (event.type === 'content_delta') deltas.push(event.delta)
        }
      })
    )

    expect(deltas).toEqual(['partial'])
    expect(error.message).toContain('AI_STREAM_INTERRUPTED')
  })

  it('keeps concurrent stream observers isolated', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        sseResponse(['data: {"choices":[{"delta":{"content":"first"},"finish_reason":"stop"}]}\n\n'])
      )
      .mockResolvedValueOnce(
        sseResponse(['data: {"choices":[{"delta":{"content":"second"},"finish_reason":"stop"}]}\n\n'])
      )
    vi.stubGlobal('fetch', fetchMock)
    const first: string[] = []
    const second: string[] = []

    const [firstResult, secondResult] = await Promise.all([
      generateText('First', config, undefined, {
        timeoutMs: 0,
        onStreamEvent: (event) => {
          if (event.type === 'content_delta') first.push(event.delta)
        }
      }),
      generateText('Second', config, undefined, {
        timeoutMs: 0,
        onStreamEvent: (event) => {
          if (event.type === 'content_delta') second.push(event.delta)
        }
      })
    ])

    expect([firstResult, secondResult]).toEqual(['first', 'second'])
    expect(first).toEqual(['first'])
    expect(second).toEqual(['second'])
  })

  it('aborts a live stream and rejects instead of accepting its partial output', async () => {
    const abort = new AbortController()
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n')
          )
          init.signal?.addEventListener(
            'abort',
            () => controller.error(new DOMException('Aborted', 'AbortError')),
            { once: true }
          )
        }
      })
      return new Response(body, { headers: { 'Content-Type': 'text/event-stream' } })
    })
    vi.stubGlobal('fetch', fetchMock)
    const deltas: string[] = []
    const result = captureRequestError(
      generateText('Prompt', config, undefined, {
        timeoutMs: 0,
        signal: abort.signal,
        onStreamEvent: (event) => {
          if (event.type === 'content_delta') {
            deltas.push(event.delta)
            abort.abort()
          }
        }
      })
    )

    const error = await result
    expect(deltas).toEqual(['partial'])
    expect(error.message).toContain('AI_REQUEST_CANCELLED')
  })

  it('falls back to a normal JSON completion while reporting real phases when streaming is unsupported', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(completionResponse('Fallback response')))
    const events: AIStreamEvent[] = []

    await expect(
      generateText('Prompt', config, undefined, {
        timeoutMs: 0,
        onStreamEvent: (event) => events.push(event)
      })
    ).resolves.toBe('Fallback response')

    expect(events.some((event) => event.type === 'phase' && event.phase === 'validating')).toBe(true)
    expect(events.some((event) => event.type === 'content_delta')).toBe(false)
  })
})

function completionResponse(content: string): Response {
  return jsonResponse({ choices: [{ message: { content } }] })
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

function providerErrorResponse(status: number, body: unknown): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })
}

function sseResponse(chunks: Array<string | Uint8Array>): Response {
  const encoder = new TextEncoder()
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks)
          controller.enqueue(typeof chunk === 'string' ? encoder.encode(chunk) : chunk)
        controller.close()
      }
    }),
    { headers: { 'Content-Type': 'text/event-stream; charset=utf-8' } }
  )
}

async function captureRequestError(request: Promise<unknown>): Promise<AIRequestError> {
  try {
    await request
  } catch (error) {
    expect(error).toBeInstanceOf(AIRequestError)
    return error as AIRequestError
  }
  throw new Error('Expected the AI request to fail')
}
