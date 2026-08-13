import { describe, expect, it } from 'vitest'
import { addUniqueTag, removeArrayItem, renameRecordKey, updateArrayItem } from './value-editing.js'

describe('metadata value editing', () => {
  it('adds normalized tags without duplicates or serialization markers', () => {
    expect(addUniqueTag(['河港'], ' #河港 ')).toEqual(['河港'])
    expect(addUniqueTag(['河港'], '制度')).toEqual(['河港', '制度'])
  })

  it('updates and removes exactly one array item while preserving object structure', () => {
    const rows = [
      { scene: 'scene-1', usage: '限制夜行' },
      { scene: 'scene-2', usage: '揭示身份' }
    ]
    expect(updateArrayItem(rows, 1, { scene: 'scene-2', usage: '提前揭示' })).toEqual([
      rows[0],
      { scene: 'scene-2', usage: '提前揭示' }
    ])
    expect(removeArrayItem(rows, 0)).toEqual([rows[1]])
  })

  it('renames keys without flattening nested values or overwriting siblings', () => {
    const value = { 旧名: { start: '第一幕', notes: ['保留'] }, 已有: '内容' }
    expect(renameRecordKey(value, '旧名', '新名')).toEqual({ 新名: value.旧名, 已有: '内容' })
    expect(renameRecordKey(value, '旧名', '已有')).toBe(value)
  })
})
