// 不变量：故事树里的同级节点必须有确定、一致的先后顺序，与文件的读取顺序无关；
// 正文字数按字符计，不计空白。这些规则由人写下，fast-check 自动生成输入去验证。
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { compareStoryOrder, countProseCharacters } from '@quillarium/core'

interface Node {
  order?: number
  id: string
  path?: string
}

const id = fc.stringMatching(/^(chapter|scene|ch)-(?:[0-9]{1,3}|[a-c]{1,2})$/)
const node: fc.Arbitrary<Node> = fc.record(
  {
    order: fc.oneof(fc.integer({ min: -3, max: 12 }), fc.double({ noNaN: false }), fc.constant(undefined)),
    id,
    path: fc.constantFrom('a.md', 'b.md', 'outline/c.md', 'outline/c10.md', 'outline/c2.md')
  },
  { requiredKeys: ['id'] }
)
const sign = (value: number) => Math.sign(value) || 0

describe('故事顺序是一个确定的全序', () => {
  it('节点与自身比较相等', () => {
    fc.assert(fc.property(node, (a) => compareStoryOrder(a, a) === 0))
  })

  it('交换比较双方，结果方向相反', () => {
    fc.assert(
      fc.property(node, node, (a, b) => sign(compareStoryOrder(a, b)) === -sign(compareStoryOrder(b, a)))
    )
  })

  it('满足传递性', () => {
    fc.assert(
      fc.property(node, node, node, (a, b, c) => {
        if (compareStoryOrder(a, b) <= 0 && compareStoryOrder(b, c) <= 0) {
          return compareStoryOrder(a, c) <= 0
        }
        return true
      })
    )
  })

  it('排序结果与输入顺序无关', () => {
    const nodesAndPermutation = fc
      .array(node, { maxLength: 12 })
      .chain((nodes) =>
        fc.tuple(
          fc.constant(nodes),
          fc.shuffledSubarray(nodes, { minLength: nodes.length, maxLength: nodes.length })
        )
      )
    fc.assert(
      fc.property(nodesAndPermutation, ([nodes, permuted]) => {
        const left = [...nodes].sort(compareStoryOrder)
        const right = [...permuted].sort(compareStoryOrder)
        left.forEach((item, index) => expect(compareStoryOrder(item, right[index]!)).toBe(0))
      })
    )
  })
})

describe('正文字数统计', () => {
  const prose = fc.string({
    unit: fc.constantFrom('山', '水', '风', '月', '，', '。', '「', '」', 'A', 'z', '7')
  })
  // 最后一个是全角空格（U+3000）。
  const blank = fc.string({ unit: fc.constantFrom(' ', '\n', '\t', '　'), minLength: 1 })

  it('插入空白不改变字数', () => {
    fc.assert(
      fc.property(prose, blank, prose, (a, gap, b) => {
        return countProseCharacters(`${a}${gap}${b}`) === countProseCharacters(a) + countProseCharacters(b)
      })
    )
  })

  it('不含空白时，每个字符计一个字', () => {
    fc.assert(fc.property(prose, (text) => countProseCharacters(text) === [...text].length))
  })
})
