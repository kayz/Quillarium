import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createCharacter, createProjectAt } from '@quillarium/core'
import { AgentRuntimeError } from '../errors.js'
import {
  createSettingCardDesignHandler,
  SETTING_CARD_DESIGN_DEFINITION,
  settingCardDesignInputSchema,
  settingCardRandomStyleBrief
} from './setting-card-design.js'
import { settingCardDesignModelOutputSchema } from './setting-card-design.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('setting-card design Agent', () => {
  it('keeps old design requests readable by defaulting the variation index', () => {
    const parsed = settingCardDesignInputSchema.parse({
      document_id: 'char-lin',
      document_type: 'character',
      style_direction: 'random',
      size: { width: 720, height: 1080 },
      base_style: null
    })

    expect(parsed.variation_index).toBe(0)
  })

  it('receives text and a bounded image summary without image bytes or local paths', async () => {
    const base = await mkdtemp(path.join(os.tmpdir(), 'quillarium-setting-card-agent-'))
    roots.push(base)
    const root = path.join(base, 'project')
    await createProjectAt(root, { id: 'setting-card-agent', title: 'Setting Card Agent' })
    await createCharacter(root, '林澜', {
      id: 'char-lin',
      image: {
        schema_version: 1,
        original_path: 'assets/settings/character/char-lin/original.png',
        thumbnail_path: 'assets/settings/character/char-lin/thumbnail.png',
        mime_type: 'image/png',
        sha256: 'a'.repeat(64),
        width: 1200,
        height: 1800,
        palette: ['#112233', '#ddeeff'],
        focus_x: 0.5,
        focus_y: 0.5,
        alt_text: '雨夜中的人物剪影'
      }
    })
    const handler = createSettingCardDesignHandler()
    const prepared = await handler.prepare(
      {
        document_id: 'char-lin',
        document_type: 'character',
        style_direction: 'ink archive',
        variation_index: 0,
        size: { width: 720, height: 1080 },
        base_style: null
      },
      {
        projectRoot: root,
        request: {
          schema_version: 1,
          task_id: 'setting-card-design',
          target: { type: 'character', id: 'char-lin' },
          input: {},
          language: 'zh',
          requested_by: 'author'
        },
        executionId: 'setting-card-execution',
        definition: SETTING_CARD_DESIGN_DEFINITION,
        config: null,
        writingPreset: null,
        now: () => new Date('2026-08-19T00:00:00.000Z')
      }
    )
    const source = prepared.modelCalls[0]!.candidates[0]!.content

    expect(source).toContain('"width": 1200')
    expect(source).toContain('"palette"')
    expect(source).toContain('雨夜中的人物剪影')
    expect(source).not.toContain('original_path')
    expect(source).not.toContain('thumbnail_path')
    expect(source).not.toContain('assets/settings')
  })

  it('rejects unsafe model CSS before a candidate can reach the renderer', () => {
    const handler = createSettingCardDesignHandler()
    expect(() =>
      handler.decode(
        {
          template_html: '<article>{{image}}<h1>{{title}}</h1>{{content}}</article>',
          css: '.card{background:url(https://example.invalid/x)}',
          notes: ''
        },
        {} as never
      )
    ).toThrow('SETTING_CARD_CSS_UNSAFE')
  })

  it('rotates the mandatory composition and records orthogonal random-style axes for each Roll', () => {
    const first = settingCardRandomStyleBrief({
      documentId: 'char-lin',
      executionId: 'roll-execution-a',
      variationIndex: 0
    })
    const repeated = settingCardRandomStyleBrief({
      documentId: 'char-lin',
      executionId: 'roll-execution-a',
      variationIndex: 0
    })
    const second = settingCardRandomStyleBrief({
      documentId: 'char-lin',
      executionId: 'roll-execution-b',
      variationIndex: 1
    })
    const composition = (value: string) =>
      value.split('\n').find((line) => line.startsWith('Primary composition:'))

    expect(first).toBe(repeated)
    expect(composition(first)).not.toBe(composition(second))
    for (const brief of [first, second]) {
      expect(brief).toContain('Treat every axis below as mandatory')
      expect(brief).toContain('Typography:')
      expect(brief).toContain('Image treatment:')
      expect(brief).toContain('Information density:')
      expect(brief).toContain('Palette:')
      expect(brief).toContain('Graphic language:')
      expect(brief).toContain('not a recolored version')
    }
  })

  it('rejects missing required placeholders at the structured-output boundary', () => {
    const parsed = settingCardDesignModelOutputSchema.safeParse({
      template_html: '<article><h1>{{title}}</h1><div>{{content}}</div></article>',
      css: '.setting-card{color:#211d18}',
      notes: ''
    })

    expect(parsed.success).toBe(false)
    if (!parsed.success) {
      expect(parsed.error.issues).toContainEqual(
        expect.objectContaining({
          path: ['template_html'],
          message: 'SETTING_CARD_TEMPLATE_TOKEN_REQUIRED: {{image}}'
        })
      )
    }
  })

  it('accepts a model-designed core-field badge using the documented bounded placeholder', () => {
    const parsed = settingCardDesignModelOutputSchema.safeParse({
      template_html: [
        '<article class="setting-card">',
        '<figure>{{image}}<span class="role-badge">{{fields.role}}</span></figure>',
        '<h1>{{title}}</h1><main>{{content}}</main><aside>{{fields}}</aside>',
        '</article>'
      ].join(''),
      css: '.role-badge{font-weight:700}',
      notes: 'Highlights the character role.'
    })

    expect(parsed.success).toBe(true)
  })

  it('includes the exact invalid placeholder in structured-output diagnostics', () => {
    const parsed = settingCardDesignModelOutputSchema.safeParse({
      template_html:
        '<article>{{image}}<h1>{{title}}</h1><span>{{fields.role.name}}</span>{{content}}</article>',
      css: '.setting-card{color:#211d18}',
      notes: ''
    })

    expect(parsed.success).toBe(false)
    if (!parsed.success) {
      expect(parsed.error.issues).toContainEqual(
        expect.objectContaining({
          path: ['template_html'],
          message: 'SETTING_CARD_TEMPLATE_TOKEN_UNKNOWN: {{fields.role.name}}'
        })
      )
    }
  })

  it('reports an unavailable model profile instead of a generic model-call failure', () => {
    const handler = createSettingCardDesignHandler()
    expect(() =>
      handler.aggregate({
        request: {} as never,
        executionId: 'setting-card-parent',
        preparation: {
          planData: {},
          deterministicResult: {},
          modelCalls: [],
          warnings: []
        },
        successful: [],
        failed: [],
        now: () => new Date('2026-08-19T00:00:00.000Z')
      })
    ).toThrow('AGENT_AI_NOT_CONFIGURED')
  })

  it('preserves the typed child provider failure for the parent designer run', () => {
    const handler = createSettingCardDesignHandler()
    let caught: unknown
    try {
      handler.aggregate({
        request: {} as never,
        executionId: 'setting-card-parent',
        preparation: {
          planData: {},
          deterministicResult: {},
          modelCalls: [],
          warnings: []
        },
        successful: [],
        failed: [
          {
            childExecutionId: 'setting-card-child',
            call: {} as never,
            error: {
              schema_version: 1,
              code: 'AGENT_PROVIDER_AUTH_FAILED',
              phase: 'provider',
              task_id: 'setting-card-design',
              execution_id: 'setting-card-child',
              retry_safe: false,
              message_key: 'agent.error.agent_provider_auth_failed',
              technical_detail: 'AIRequestError: unauthorized',
              validation_paths: [],
              artifacts: {}
            }
          }
        ],
        now: () => new Date('2026-08-19T00:00:00.000Z')
      })
    } catch (cause) {
      caught = cause
    }

    expect(caught).toBeInstanceOf(AgentRuntimeError)
    expect((caught as AgentRuntimeError).value).toMatchObject({
      code: 'AGENT_PROVIDER_AUTH_FAILED',
      execution_id: 'setting-card-parent',
      failed_child_execution_id: 'setting-card-child'
    })
  })
})
