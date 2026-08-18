import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { CanonWorkspace } from './CanonWorkspace.js'

vi.mock('../../app/bridge.js', () => ({ bridge: {} }))

const docs = [
  {
    path: 'canon/fact.md',
    data: {
      id: 'canon-1',
      type: 'canon',
      title: 'The gate closes at dusk',
      status: 'confirmed',
      strength: 'hard',
      source: 'user',
      tags: []
    },
    content: 'The city gate closes at dusk.'
  }
]

describe('CanonWorkspace field copy', () => {
  it('shows Chinese labels, explanations, and enum choices', () => {
    const html = renderToStaticMarkup(
      <CanonWorkspace
        root="C:/projects/sample"
        docs={docs}
        onCreate={async () => undefined}
        onReload={async () => undefined}
        language="zh"
      />
    )

    expect(html).toContain('约束强度')
    expect(html).toContain('<h2>正设</h2>')
    expect(html).toContain('决定生成与检查时应当多严格地遵守这项设定')
    expect(html).toContain('硬约束')
    expect(html).toContain('作者')
    expect(html).not.toContain('>hard<')
    expect(html).not.toContain('>user<')
    expect(html).not.toContain('<h2>Canon</h2>')
  })

  it('shows English labels and explanations in the English interface', () => {
    const html = renderToStaticMarkup(
      <CanonWorkspace
        root="C:/projects/sample"
        docs={docs}
        onCreate={async () => undefined}
        onReload={async () => undefined}
        language="en"
      />
    )

    expect(html).toContain('Constraint strength')
    expect(html).toContain('How strictly generation and checks must follow this fact')
    expect(html).toContain('Hard constraint')
    expect(html).toContain('Author')
  })
})
