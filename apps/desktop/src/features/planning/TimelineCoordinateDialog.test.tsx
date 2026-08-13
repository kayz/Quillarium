import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { DocEntry } from '../../app/types.js'
import { TimelineCoordinateDialog } from './TimelineCoordinateDialog.js'

const event: DocEntry = {
  path: 'timeline/event-opening.md',
  data: {
    id: 'event-opening',
    type: 'timeline_event',
    schema_version: 1,
    title: '开篇事变',
    tags: [],
    date: '1449-08',
    timeline_node: null
  },
  content: ''
}

describe('TimelineCoordinateDialog', () => {
  it('offers a direct coordinate entry and reuses an event story time', () => {
    const html = renderToStaticMarkup(
      <TimelineCoordinateDialog
        events={[event]}
        initialEventId="event-opening"
        language="zh"
        busy={false}
        onClose={() => undefined}
        onConfirm={async () => undefined}
      />
    )

    expect(html).toContain('建立时间坐标')
    expect(html).toContain('可直接读取事件的“故事时间”')
    expect(html).toContain('开篇事变 · 1449-08')
    expect(html).toContain('value="1449-08"')
    expect(html).toContain('相同时间已有坐标')
  })
})
