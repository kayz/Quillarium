import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { LanguageName } from '../../app/types.js'
import { boundedPageMetrics } from './bounded-page.js'

export function BoundedPager({
  page,
  total,
  pageSize,
  onPage,
  language,
  label
}: {
  page: number
  total: number
  pageSize: number
  onPage: (page: number) => void
  language: LanguageName
  label?: string
}) {
  if (total <= pageSize) return null
  const metrics = boundedPageMetrics(total, page, pageSize)
  const zh = language === 'zh'
  return (
    <nav className="bounded-pager" aria-label={label ?? (zh ? '列表分页' : 'List pagination')}>
      <span aria-live="polite">
        {metrics.start + 1}–{metrics.end} / {metrics.total}
      </span>
      <button
        type="button"
        disabled={metrics.page === 0}
        aria-label={zh ? '上一页' : 'Previous page'}
        onClick={() => onPage(metrics.page - 1)}
      >
        <ChevronLeft size={15} />
      </button>
      <strong>
        {zh
          ? `第 ${metrics.page + 1} / ${metrics.pageCount} 页`
          : `Page ${metrics.page + 1} / ${metrics.pageCount}`}
      </strong>
      <button
        type="button"
        disabled={metrics.page >= metrics.pageCount - 1}
        aria-label={zh ? '下一页' : 'Next page'}
        onClick={() => onPage(metrics.page + 1)}
      >
        <ChevronRight size={15} />
      </button>
    </nav>
  )
}
