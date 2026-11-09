import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { DocEntry } from '../../app/types.js'
import { WritingReferenceWorkspace } from './WritingReferenceWorkspace.js'

const guidance: DocEntry = {
  path: 'references/voice.md',
  data: { id: 'voice', type: 'reference', title: '短句', prompt_material: true },
  content: '句子要短。'
}

const archive: DocEntry = {
  path: 'references/archive.md',
  data: { id: 'archive', type: 'reference', title: '史料归档', prompt_material: false },
  content: '不要进提示词。'
}

describe('WritingReferenceWorkspace', () => {
  it('lists writing guidance and hides archived references', () => {
    const html = renderToStaticMarkup(
      <WritingReferenceWorkspace
        docs={[guidance, archive]}
        doc={guidance}
        dirty={false}
        busy={false}
        language="zh"
        onSelect={() => undefined}
        onCreate={async () => undefined}
        onImport={async () => undefined}
        onDraft={async () => ({ title: '短句', content: '一句一事。' })}
        onDocChange={() => undefined}
        onSave={async () => undefined}
      />
    )
    expect(html).toContain('短句')
    expect(html).toContain('句子要短。')
    expect(html).not.toContain('史料归档')
    expect(html).toContain('方式和世界书相同')
    expect(html).toContain('导入')
    expect(html).toContain('对话')
  })
})
