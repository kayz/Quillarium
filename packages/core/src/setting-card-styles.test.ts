import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { getAgentTaskDefinition } from './agent-tasks.js'
import { pathExists } from './fs.js'
import { ensureWorkspaceAt } from './workspace.js'
import {
  BUILTIN_SETTING_CARD_STYLES,
  defaultSettingCardTemplate,
  listWorkspaceDisplayCardStyles,
  listWorkspaceSettingCardStyles,
  normalizeSettingCardTemplate,
  renderSettingCardHtml,
  saveWorkspaceDisplayCardStyle,
  saveWorkspaceSettingCardStyle,
  settingCardDocumentTypeSchema
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

  it('round-trips display card styles under styles/display-cards and does not create setting-cards', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'quillarium-display-style-'))
    roots.push(root)
    await ensureWorkspaceAt(root)
    const template = defaultSettingCardTemplate('ink-archive')

    const saved = await saveWorkspaceDisplayCardStyle(root, {
      name: 'Canon folio',
      template,
      supported_types: ['canon', 'character'],
      default_size: { width: 720, height: 1080 },
      source_execution_id: 'display-card-run-1'
    })
    const listed = await listWorkspaceDisplayCardStyles(root, 'canon')

    expect(saved.value.version).toBe('1.0.0')
    expect(saved.relative_path).toMatch(/^styles\/display-cards\//u)
    expect(listed).toHaveLength(1)
    expect(listed[0]?.value.name).toBe('Canon folio')
    expect(listed[0]?.value.supported_types).toEqual(['canon', 'character'])
    expect(await listWorkspaceDisplayCardStyles(root, 'faction')).toEqual([])
    expect(await listWorkspaceSettingCardStyles(root)).toEqual([])
    expect(await pathExists(path.join(root, 'styles', 'setting-cards'))).toBe(false)
    expect(await pathExists(path.join(root, 'styles', 'display-cards'))).toBe(true)
  })

  it('rejects saving a display-card template that contains script', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'quillarium-display-style-unsafe-'))
    roots.push(root)
    await ensureWorkspaceAt(root)

    await expect(
      saveWorkspaceDisplayCardStyle(root, {
        name: 'Unsafe script card',
        template: {
          schema_version: 1,
          template_html: '<article>{{image}}<h1>{{title}}</h1>{{content}}<script>alert(1)</script></article>',
          css: '.card{color:#211d18}',
          notes: ''
        },
        supported_types: ['canon'],
        default_size: { width: 720, height: 1080 }
      })
    ).rejects.toThrow('SETTING_CARD_SCRIPT_UNSAFE')
    expect(await pathExists(path.join(root, 'styles', 'display-cards'))).toBe(false)
    expect(await pathExists(path.join(root, 'styles', 'setting-cards'))).toBe(false)
  })

  it('saves a display-card template that contains {{images}}', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'quillarium-display-style-images-'))
    roots.push(root)
    await ensureWorkspaceAt(root)

    const saved = await saveWorkspaceDisplayCardStyle(root, {
      name: 'Gallery folio',
      template: {
        schema_version: 1,
        template_html:
          '<article>{{image}}<div class="gallery">{{images}}</div><h1>{{title}}</h1>{{content}}</article>',
        css: 'article { color: #111; } .display-gallery { display: grid; }',
        notes: ''
      },
      supported_types: ['canon'],
      default_size: { width: 720, height: 1080 }
    })

    expect(saved.value.template_html).toContain('{{images}}')
    expect(saved.relative_path).toMatch(/^styles\/display-cards\//u)
    expect(() =>
      normalizeSettingCardTemplate({
        schema_version: 1,
        template_html:
          '<article>{{image}}{{images}}<h1>{{title}}</h1>{{content}}<script>alert(1)</script></article>',
        css: 'article { color: #111; }',
        notes: ''
      })
    ).toThrow('SETTING_CARD_SCRIPT_UNSAFE')
  })

  it('lists every spec document type on each builtin so a canon card can pick one', () => {
    const specTypes = settingCardDocumentTypeSchema.options
    expect(specTypes).toContain('canon')
    expect(specTypes).toContain('narrative')
    for (const style of BUILTIN_SETTING_CARD_STYLES) {
      expect(style.supported_types).toEqual(specTypes)
    }
    expect(getAgentTaskDefinition('display-card-design').id).toBe('display-card-design')
  })

  it('rejects active content and renders a sandboxed self-contained document', () => {
    expect(() =>
      normalizeSettingCardTemplate({
        schema_version: 1,
        template_html: '<article>{{image}}<h1>{{title}}</h1>{{content}}<script>alert(1)</script></article>',
        css: '.card{color:#211d18}',
        notes: ''
      })
    ).toThrow('SETTING_CARD_SCRIPT_UNSAFE')
    expect(() =>
      normalizeSettingCardTemplate({
        schema_version: 1,
        template_html: '<article>{{image}}<h1>{{title}}</h1>{{content}}</article>',
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

  it('expands {{images}} into a scriptless radio carousel and keeps {{image}} as the selection', () => {
    const html = renderSettingCardHtml(
      {
        schema_version: 1,
        template_html:
          '<article>{{image}}<div class="gallery">{{images}}</div><h1>{{title}}</h1>{{content}}</article>',
        css: 'article { color: #111; } .display-gallery { display: grid; }',
        notes: ''
      },
      { width: 720, height: 1080 },
      {
        id: 'world-lin',
        type: 'world_entry',
        title: '林舟',
        content: '水手。',
        fields: {},
        image_data_url: 'data:image/png;base64,AAAA',
        image_data_urls: [
          { id: 'one', alt: 'a', data_url: 'data:image/png;base64,AAAA' },
          { id: 'two', alt: 'b', data_url: 'data:image/png;base64,BBBB' },
          { id: 'bad', alt: 'x', data_url: 'https://example.invalid/x.png' }
        ]
      }
    )
    expect(html).toContain('data:image/png;base64,AAAA')
    expect(html).toContain('data:image/png;base64,BBBB')
    expect(html).toMatch(/<article><img class="setting-card-image" src="data:image\/png;base64,AAAA"/)
    expect(html).not.toMatch(/<article><img class="setting-card-image" src="data:image\/png;base64,BBBB"/)
    expect(html.match(/type="radio"/g)).toHaveLength(2)
    expect(html).toMatch(
      /<input class="display-gallery-input"[^>]*\/><label class="display-gallery-dot"[^>]*><\/label><figure class="display-gallery-slide">/
    )
    expect(html).toContain('display-gallery')
    expect(html).not.toContain('https://example.invalid')
    expect(html).toMatch(/\.visual>\.display-gallery\{[^}]*position:absolute/)
    expect(html).toMatch(/\.visual>\.display-gallery\{[^}]*inset:0/)
    expect(html).toMatch(/\.display-gallery-dot\{[^}]*grid-area:1\/1/)
    expect(html).toMatch(/\.display-gallery-dot\{[^}]*z-index:/)
    expect(html).toMatch(/\.display-gallery-dot\{[^}]*(?:width|min-width):/)
    expect(html).not.toContain('.visual:has(>.display-gallery)')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('onclick')
  })

  it('spreads gallery dots from the bottom center for circular and rectangular visuals', () => {
    const data = {
      id: 'world-lin',
      type: 'world_entry',
      title: '林舟',
      content: '水手。',
      fields: {},
      image_data_url: 'data:image/png;base64,AAAA',
      image_data_urls: [
        { id: 'one', alt: 'a', data_url: 'data:image/png;base64,AAAA' },
        { id: 'two', alt: 'b', data_url: 'data:image/png;base64,BBBB' },
        { id: 'three', alt: 'c', data_url: 'data:image/png;base64,CCCC' }
      ]
    }
    const heraldic = renderSettingCardHtml(
      defaultSettingCardTemplate('heraldic'),
      { width: 720, height: 1080 },
      data
    )
    const rectangular = renderSettingCardHtml(
      defaultSettingCardTemplate('ink-archive'),
      { width: 720, height: 1080 },
      data
    )

    for (const html of [heraldic, rectangular]) {
      expect(html).toMatch(/\.display-gallery-dot\{[^}]*align-self:end/)
      expect(html).toMatch(/\.display-gallery-dot\{[^}]*justify-self:center/)
      expect(html).not.toMatch(/\.display-gallery-dot\{[^}]*justify-self:start/)
      expect(html).not.toMatch(/\.display-gallery-input:nth-of-type/)
      expect(html).toMatch(
        /<input class="display-gallery-input"[^>]*\/><label class="display-gallery-dot"[^>]*style="[^"]*margin[^"]*"[^>]*><\/label><figure class="display-gallery-slide">/
      )
      const dots = [...html.matchAll(/<label class="display-gallery-dot"[^>]*>/g)].map((match) => match[0])
      expect(dots).toHaveLength(3)
      expect(dots[0]).toContain('style="margin-left:-18px;margin-right:18px"')
      expect(dots[1]).toContain('style="margin-left:0px;margin-right:0px"')
      expect(dots[2]).toContain('style="margin-left:18px;margin-right:-18px"')
    }

    expect(heraldic).toMatch(/\.visual\{[^}]*border-radius:50%/)
    expect(heraldic).toContain('overflow:hidden')
  })

  it('renders every built-in style locally with a distinct template', () => {
    const templates = BUILTIN_SETTING_CARD_STYLES.map((style) => defaultSettingCardTemplate(style.id))

    expect(new Set(templates.map((template) => template.template_html)).size).toBe(
      BUILTIN_SETTING_CARD_STYLES.length
    )
    expect(new Set(templates.map((template) => template.css)).size).toBe(BUILTIN_SETTING_CARD_STYLES.length)
    for (const template of templates) {
      expect(template.template_html).toContain('{{image}}')
      expect(template.template_html).toContain('{{images}}')
      expect(template.template_html).toContain('{{title}}')
      expect(template.template_html).toContain('{{content}}')
      expect(template.notes).toContain('rendered locally without an Agent call')
      const html = renderSettingCardHtml(
        template,
        { width: 720, height: 1080 },
        {
          id: 'world-lin',
          type: 'world_entry',
          title: '林舟',
          content: '水手。',
          fields: {},
          image_data_url: 'data:image/png;base64,AAAA',
          image_data_urls: [
            { id: 'one', alt: 'a', data_url: 'data:image/png;base64,AAAA' },
            { id: 'two', alt: 'b', data_url: 'data:image/png;base64,BBBB' }
          ]
        }
      )
      expect(html).toContain('type="radio"')
      expect(html).toContain('display-gallery')
      expect(html).toContain('.display-gallery-input:checked')
      expect(html).not.toContain('<script')
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
