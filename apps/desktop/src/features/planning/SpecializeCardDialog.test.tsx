import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SpecializeCardDialog } from './SpecializeCardDialog.js'

describe('SpecializeCardDialog', () => {
  it('includes a character option when specializing a world_entry', () => {
    const html = renderToStaticMarkup(
      <SpecializeCardDialog
        language="zh"
        sourceType="world_entry"
        onCancel={() => undefined}
        onConfirm={() => undefined}
      />
    )

    expect(html).toContain('value="character"')
    expect(html).toContain('特化为')
  })

  it('disables confirm until character_relation required fields are filled', () => {
    const empty = renderToStaticMarkup(
      <SpecializeCardDialog
        language="zh"
        sourceType="world_entry"
        targetType="character_relation"
        onCancel={() => undefined}
        onConfirm={() => undefined}
      />
    )

    expect(empty).toContain('name="from_character"')
    expect(empty).toContain('name="to_character"')
    expect(empty).toContain('name="relation_type"')
    expect(submitDisabled(empty)).toBe(true)

    const filled = renderToStaticMarkup(
      <SpecializeCardDialog
        language="zh"
        sourceType="world_entry"
        targetType="character_relation"
        fields={{
          from_character: 'char-a',
          to_character: 'char-b',
          relation_type: '盟友'
        }}
        onCancel={() => undefined}
        onConfirm={() => undefined}
      />
    )

    expect(submitDisabled(filled)).toBe(false)
  })
})

function submitDisabled(html: string): boolean {
  const match = html.match(/<button[^>]*type="submit"[^>]*>/)
  return Boolean(match?.[0]?.includes('disabled'))
}
