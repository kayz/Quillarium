import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ensureWorkspaceAt } from './workspace.js'
import {
  BUILTIN_SETTING_CARD_STYLES,
  defaultSettingCardTemplate,
  listWorkspaceSettingCardStyles,
  normalizeSettingCardTemplate,
  renderSettingCardHtml,
  saveWorkspaceSettingCardStyle
} from './setting-card-styles.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('workspace setting-card styles', () => {
  it('stores reusable versioned styles at workspace scope', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'quillarium-setting-style-'))
    roots.push(root)
    await ensureWorkspaceAt(root)
    const template = defaultSettingCardTemplate('ink-archive')

    const first = await saveWorkspaceSettingCardStyle(root, {
      name: 'Archive folio',
      template,
      supported_types: ['character', 'world_entry'],
      default_size: { width: 720, height: 1080 },
      source_execution_id: 'setting-card-run-1'
    })
    const second = await saveWorkspaceSettingCardStyle(root, {
      name: 'Archive folio',
      template,
      supported_types: ['character'],
      default_size: { width: 720, height: 1080 }
    })

    expect(first.value.version).toBe('1.0.0')
    expect(second.value.version).toBe('1.0.1')
    expect(first.relative_path).toMatch(/^styles\/setting-cards\//u)
    expect(await listWorkspaceSettingCardStyles(root, 'location')).toEqual([])
    expect(await listWorkspaceSettingCardStyles(root, 'character')).toHaveLength(2)
  })

  it('rejects active content and renders a sandboxed self-contained document', () => {
    expect(() =>
      normalizeSettingCardTemplate({
        schema_version: 1,
        template_html: '<article>{{image}}<h1>{{title}}</h1>{{content}}<script>alert(1)</script></article>',
        css: '.card{background:url(https://example.invalid/x)}',
        notes: ''
      })
    ).toThrow('SETTING_CARD_CSS_UNSAFE')

    const html = renderSettingCardHtml(
      defaultSettingCardTemplate('modern-dossier'),
      { width: 640, height: 960 },
      {
        id: 'char-001',
        type: 'character',
        title: '<主角>',
        content: '第一段。\n\n第二段。',
        fields: { role: 'protagonist', image: { original_path: 'C:/must-not-leak.png' } },
        image_data_url: 'data:image/png;base64,AAAA'
      }
    )

    expect(html).toContain("default-src 'none'")
    expect(html).toContain('&lt;主角&gt;')
    expect(html).toContain('data:image/png;base64,AAAA')
    expect(html).not.toContain('must-not-leak')
    expect(html).not.toContain('<script')
  })

  it('renders every built-in style locally with a distinct template', () => {
    const templates = BUILTIN_SETTING_CARD_STYLES.map((style) => defaultSettingCardTemplate(style.id))

    expect(new Set(templates.map((template) => template.template_html)).size).toBe(
      BUILTIN_SETTING_CARD_STYLES.length
    )
    expect(new Set(templates.map((template) => template.css)).size).toBe(BUILTIN_SETTING_CARD_STYLES.length)
    for (const template of templates) {
      expect(template.template_html).toContain('{{image}}')
      expect(template.template_html).toContain('{{title}}')
      expect(template.template_html).toContain('{{content}}')
      expect(template.notes).toContain('rendered locally without an Agent call')
    }
  })

  it('presents core attributes and common Markdown structures instead of raw source syntax', () => {
    const html = renderSettingCardHtml(
      defaultSettingCardTemplate('modern-dossier'),
      { width: 720, height: 1080 },
      {
        id: 'char-yu-qian',
        type: 'character',
        title: '于谦',
        language: 'zh',
        content: [
          '## 小传',
          '',
          '| 阶段 | 弧光 |',
          '| --- | --- |',
          '| 初见 | 守住原则 |',
          '',
          '### 金句',
          '',
          '- **社稷为先**',
          '- 不计个人得失'
        ].join('\n'),
        fields: {
          role: '大明重臣',
          aliases: ['少保', '于少保'],
          motivation_anchors: ['守城', '公义'],
          arc: { starting_point: '孤臣', destination: '国之柱石' }
        }
      }
    )

    expect(html).toContain('<h2>小传</h2>')
    expect(html).toContain('<table>')
    expect(html).toContain('<strong>社稷为先</strong>')
    expect(html).toContain('<dt>人物定位</dt>')
    expect(html).toContain('<dt>动机锚点</dt>')
    expect(html).toContain('class="field-list"')
    expect(html).not.toContain('| 阶段 |')
    expect(html).not.toContain('{&quot;starting_point&quot;')
  })

  it('renders an explicitly placed core field without interpreting field content as template syntax', () => {
    const template = normalizeSettingCardTemplate({
      schema_version: 1,
      template_html:
        '<article>{{image}}<h1>{{title}}</h1><span class="role">{{fields.role}}</span><main>{{content}}</main><aside>{{fields}}</aside></article>',
      css: '.role{font-weight:700}',
      notes: ''
    })
    const html = renderSettingCardHtml(
      template,
      { width: 720, height: 1080 },
      {
        id: 'char-field-token',
        type: 'character',
        title: '核心属性测试',
        content: '正文',
        fields: { role: '<谋士>{{title}}' }
      }
    )

    expect(html).toContain('<span class="role">&lt;谋士&gt;{{title}}</span>')
    expect(html).not.toContain('<谋士>')
    expect(html).toContain('<dt>人物定位</dt>')
  })

  it('reports the exact unsupported placeholder for bounded Agent repair', () => {
    expect(() =>
      normalizeSettingCardTemplate({
        schema_version: 1,
        template_html:
          '<article>{{image}}<h1>{{title}}</h1><span>{{fields.role.name}}</span>{{content}}</article>',
        css: '.setting-card{color:#211d18}',
        notes: ''
      })
    ).toThrow('SETTING_CARD_TEMPLATE_TOKEN_UNKNOWN: {{fields.role.name}}')
  })
})
