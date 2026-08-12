import { describe, expect, it } from 'vitest'
import { objectToYaml, parseMarkdown, stringifyFrontmatter, toYamlValue } from './yaml.js'

describe('YAML and Markdown serialization', () => {
  it('round-trips Chinese, multiline, and YAML-sensitive frontmatter', () => {
    const data = {
      title: '城门：雨夜 #1',
      summary: '第一行\n第二行',
      leading: ' 前导空格',
      trailing: '尾随空格 ',
      dash: '-危险开头',
      brackets: '[尚未决定]',
      braces: '{秘密}',
      comma: '甲,乙',
      empty: '',
      count: 12,
      enabled: true,
      missing: null,
      tags: ['权谋', '雨夜:城门', '#关键'],
      nested: {
        中文键: '中文值',
        omit: undefined,
        rows: [
          { name: '甲', note: '一行\n二行' },
          { name: '乙', note: '含:冒号' }
        ]
      },
      omit: undefined
    }

    const markdown = stringifyFrontmatter(data, '\n\n正文第一行\n正文第二行\n')
    const parsed = parseMarkdown<Record<string, unknown>>(markdown)

    expect(parsed.data).toEqual({
      title: '城门：雨夜 #1',
      summary: '第一行\n第二行',
      leading: ' 前导空格',
      trailing: '尾随空格 ',
      dash: '-危险开头',
      brackets: '[尚未决定]',
      braces: '{秘密}',
      comma: '甲,乙',
      empty: '',
      count: 12,
      enabled: true,
      missing: null,
      tags: ['权谋', '雨夜:城门', '#关键'],
      nested: {
        中文键: '中文值',
        rows: [
          { name: '甲', note: '一行\n二行' },
          { name: '乙', note: '含:冒号' }
        ]
      }
    })
    expect(parsed.content).toBe('正文第一行\n正文第二行\n')
    expect(markdown).not.toContain('omit:')
  })

  it('renders scalar, array, and nested object values as parseable YAML', () => {
    const data = {
      plain: '普通文本',
      quoted: '值: 含冒号',
      empty: '',
      nil: null,
      integer: 7,
      flag: false,
      empty_list: [],
      list: ['甲', '乙:二'],
      nested: { child: '值', list: [{ key: '甲' }, { key: '乙' }] }
    }
    const yaml = objectToYaml(data)
    const parsed = parseMarkdown<Record<string, unknown>>(`---\n${yaml}\n---\n`)

    expect(parsed.data).toEqual(data)
    expect(toYamlValue(null)).toBe('null')
    expect(toYamlValue(3)).toBe('3')
    expect(toYamlValue(true)).toBe('true')
    expect(toYamlValue('')).toBe('""')
    expect(toYamlValue(undefined)).toBeUndefined()
  })

  it('renders empty nested objects as parseable mapping values', () => {
    const yaml = objectToYaml({ empty_object: {} })

    expect(yaml).toBe('empty_object: {}')
    expect(() => parseMarkdown(`---\n${yaml}\n---\n`)).not.toThrow()
  })

  it('omits undefined values from standalone YAML objects', () => {
    expect(objectToYaml({ id: 'run-one', source_outline: undefined, enabled: false })).toBe(
      'id: run-one\nenabled: false'
    )
  })

  it('parses Markdown without frontmatter and trims only leading body whitespace', () => {
    const parsed = parseMarkdown<Record<string, unknown>>('\n\n# 标题\n\n正文  \n')

    expect(parsed.data).toEqual({})
    expect(parsed.content).toBe('# 标题\n\n正文  \n')
  })
})
