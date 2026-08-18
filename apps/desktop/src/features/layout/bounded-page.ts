export interface BoundedPage<T> {
  items: T[]
  page: number
  pageCount: number
  start: number
  end: number
  total: number
  pageSize: number
}

export interface BoundedPageMetrics {
  page: number
  pageCount: number
  start: number
  end: number
  total: number
  pageSize: number
}

export function boundedPageMetrics(
  total: number,
  requestedPage: number,
  pageSize: number
): BoundedPageMetrics {
  const safePageSize = Math.max(1, Math.floor(Number.isFinite(pageSize) ? pageSize : 1))
  const safeTotal = Math.max(0, Math.floor(Number.isFinite(total) ? total : 0))
  const pageCount = Math.max(1, Math.ceil(safeTotal / safePageSize))
  const normalizedPage = Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 0
  const page = Math.min(pageCount - 1, Math.max(0, normalizedPage))
  const start = safeTotal ? page * safePageSize : 0
  const end = Math.min(safeTotal, start + safePageSize)
  return {
    page,
    pageCount,
    start,
    end,
    total: safeTotal,
    pageSize: safePageSize
  }
}

export function boundedPage<T>(items: readonly T[], requestedPage: number, pageSize: number): BoundedPage<T> {
  const metrics = boundedPageMetrics(items.length, requestedPage, pageSize)
  return {
    ...metrics,
    items: items.slice(metrics.start, metrics.end)
  }
}
