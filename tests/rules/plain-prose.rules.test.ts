// 决策表：章正文必须是纯文字（README：“节生成纯文本候选”；实现报错文案：“不能包含 Markdown 标题、列表、
// 引用、链接或强调语法”）。预期值来自 plain-prose.csv，由人确认；这里只负责逐行执行。
// status 为 pending 的行是规则与实现不一致、尚待作者决定的情况，先跳过并在测试名里标明。
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { assertPlainProse } from '@quillarium/core'

interface Row {
  id: string
  text: string
  expected: 'accept' | 'reject'
  status: 'confirmed' | 'pending'
  note: string
}

const rows: Row[] = readFileSync(new URL('./plain-prose.csv', import.meta.url), 'utf8')
  .trim()
  .split(/\r?\n/)
  .slice(1)
  .map((line) => {
    const [id = '', text = '', expected = '', status = '', note = ''] = line.split(',')
    return {
      id,
      text: text.replace(/\\n/g, '\n'),
      expected: expected as Row['expected'],
      status: status as Row['status'],
      note
    }
  })

function verdict(text: string): 'accept' | 'reject' {
  try {
    assertPlainProse(text)
    return 'accept'
  } catch {
    return 'reject'
  }
}

describe('章正文纯文字规则', () => {
  for (const row of rows) {
    const name = `${row.id} ${row.note}：应${row.expected === 'accept' ? '接受' : '拒绝'}`
    if (row.status === 'pending') {
      it.skip(`${name}（待作者确认）`, () => {})
      continue
    }
    it(name, () => {
      expect(verdict(row.text)).toBe(row.expected)
    })
  }
})
