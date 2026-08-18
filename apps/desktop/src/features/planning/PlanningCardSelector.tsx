import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type UIEvent } from 'react'
import { ChevronDown, Search, X } from 'lucide-react'
import type { DocEntry, LanguageName } from '../../app/types.js'
import { documentTypeLabel } from '../metadata/field-presentation.js'

export interface PlanningCardSelectorOption {
  id: string
  type: string
  title: string
  aliases: string[]
  tags: string[]
  document: DocEntry
}

export interface PlanningCardVirtualWindow {
  start: number
  end: number
  top: number
  bottom: number
}

const ROW_HEIGHT = 58
const MAX_VISIBLE_ROWS = 6
const OVERSCAN = 2

export function planningCardSelectorOptions(docs: DocEntry[]): PlanningCardSelectorOption[] {
  return docs
    .map((document) => ({
      id: String(document.data.id ?? '').trim(),
      type: String(document.data.type ?? '').trim(),
      title: String(document.data.title ?? '').trim(),
      aliases: Array.isArray(document.data.aliases)
        ? document.data.aliases.filter((value): value is string => typeof value === 'string')
        : [],
      tags: Array.isArray(document.data.tags)
        ? document.data.tags.filter((value): value is string => typeof value === 'string')
        : [],
      document
    }))
    .filter((option) => option.id && option.type && option.title)
    .sort(
      (left, right) =>
        left.title.localeCompare(right.title) ||
        left.type.localeCompare(right.type, 'en') ||
        left.id.localeCompare(right.id, 'en')
    )
}

export function filterPlanningCardOptions(
  options: PlanningCardSelectorOption[],
  query: string,
  language: LanguageName = 'zh'
): PlanningCardSelectorOption[] {
  const terms = normalizeSearch(query).split(/\s+/u).filter(Boolean)
  if (!terms.length) return options
  return options.filter((option) => {
    const haystack = normalizeSearch(
      [
        option.title,
        option.id,
        option.type,
        documentTypeLabel(option.type, language),
        ...option.aliases,
        ...option.tags
      ].join('\n')
    )
    return terms.every((term) => haystack.includes(term))
  })
}

export function planningCardVirtualWindow(
  itemCount: number,
  scrollTop: number,
  viewportHeight = ROW_HEIGHT * MAX_VISIBLE_ROWS,
  rowHeight = ROW_HEIGHT,
  overscan = OVERSCAN
): PlanningCardVirtualWindow {
  const safeCount = Math.max(0, Math.floor(itemCount))
  const first = Math.max(0, Math.floor(Math.max(0, scrollTop) / rowHeight) - overscan)
  const visible = Math.max(1, Math.ceil(Math.max(rowHeight, viewportHeight) / rowHeight))
  const end = Math.min(safeCount, first + visible + overscan * 2)
  return {
    start: Math.min(first, end),
    end,
    top: Math.min(first, end) * rowHeight,
    bottom: Math.max(0, (safeCount - end) * rowHeight)
  }
}

export function nextPlanningCardIndex(
  current: number,
  direction: 'next' | 'previous',
  count: number
): number {
  if (count <= 0) return -1
  if (current < 0) return direction === 'next' ? 0 : count - 1
  return direction === 'next' ? (current + 1) % count : (current - 1 + count) % count
}

export function PlanningCardSelector({
  docs,
  value,
  onChange,
  language,
  placeholder,
  ariaLabel,
  disabled = false,
  clearable = true,
  invalidValue,
  className = ''
}: {
  docs: DocEntry[]
  value: string
  onChange: (stableId: string) => void
  language: LanguageName
  placeholder?: string
  ariaLabel?: string
  disabled?: boolean
  clearable?: boolean
  invalidValue?: string
  className?: string
}) {
  const listId = useId()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const options = useMemo(() => planningCardSelectorOptions(docs), [docs])
  const selected = options.find((option) => option.id === value)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(-1)
  const [scrollTop, setScrollTop] = useState(0)
  const results = useMemo(
    () => filterPlanningCardOptions(options, query, language),
    [language, options, query]
  )
  const viewportHeight = Math.min(MAX_VISIBLE_ROWS, Math.max(1, results.length)) * ROW_HEIGHT
  const virtual = planningCardVirtualWindow(results.length, scrollTop, viewportHeight)
  const visible = results.slice(virtual.start, virtual.end)
  const selectedLabel = selected
    ? `${selected.title} · ${documentTypeLabel(selected.type, language)} · ${selected.id}`
    : invalidValue || value
      ? language === 'zh'
        ? `未定义：${invalidValue || value}`
        : `Missing: ${invalidValue || value}`
      : ''

  useEffect(() => {
    if (!open) return
    const selectedIndex = results.findIndex((option) => option.id === value)
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : results.length ? 0 : -1)
  }, [open, results, value])

  useEffect(() => {
    if (!open || activeIndex < 0) return
    const viewport = viewportRef.current
    if (!viewport) return
    const rowTop = activeIndex * ROW_HEIGHT
    const rowBottom = rowTop + ROW_HEIGHT
    if (rowTop < viewport.scrollTop) viewport.scrollTop = rowTop
    else if (rowBottom > viewport.scrollTop + viewport.clientHeight) {
      viewport.scrollTop = rowBottom - viewport.clientHeight
    }
  }, [activeIndex, open])

  const closeAndClearQuery = () => {
    setOpen(false)
    setQuery('')
    setScrollTop(0)
    setActiveIndex(-1)
  }

  const select = (option: PlanningCardSelectorOption) => {
    onChange(option.id)
    closeAndClearQuery()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      closeAndClearQuery()
      inputRef.current?.blur()
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) setOpen(true)
      setActiveIndex((current) =>
        nextPlanningCardIndex(current, event.key === 'ArrowDown' ? 'next' : 'previous', results.length)
      )
      return
    }
    if (event.key === 'Enter' && open && activeIndex >= 0) {
      event.preventDefault()
      const option = results[activeIndex]
      if (option) select(option)
    }
  }

  const onScroll = (event: UIEvent<HTMLDivElement>) => setScrollTop(event.currentTarget.scrollTop)

  return (
    <div className={`planning-card-selector ${className}`.trim()} data-open={open || undefined}>
      <div className="planning-card-selector-control">
        <Search size={14} aria-hidden="true" />
        <input
          ref={inputRef}
          role="combobox"
          aria-label={ariaLabel ?? (language === 'zh' ? '选择关联卡片' : 'Choose linked card')}
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            open && activeIndex >= 0
              ? `${listId}-option-${results[activeIndex]?.id ?? activeIndex}`
              : undefined
          }
          autoComplete="off"
          disabled={disabled}
          value={open ? query : selectedLabel}
          placeholder={
            placeholder ??
            (language === 'zh' ? '搜索标题、ID、别名、标签或类型…' : 'Search title, ID, alias, tag, or type…')
          }
          onFocus={() => {
            if (!disabled) {
              setOpen(true)
              setQuery('')
            }
          }}
          onChange={(event) => {
            setOpen(true)
            setQuery(event.target.value)
            setScrollTop(0)
            setActiveIndex(0)
          }}
          onKeyDown={onKeyDown}
        />
        {clearable && value && !disabled ? (
          <button
            type="button"
            className="planning-card-selector-clear"
            aria-label={language === 'zh' ? '清空关联卡片' : 'Clear linked card'}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              onChange('')
              closeAndClearQuery()
            }}
          >
            <X size={14} />
          </button>
        ) : (
          <ChevronDown size={14} aria-hidden="true" />
        )}
      </div>
      {open && !disabled && (
        <div className="planning-card-selector-popover">
          <div
            ref={viewportRef}
            id={listId}
            className="planning-card-selector-list"
            role="listbox"
            aria-label={language === 'zh' ? '匹配的关联卡片' : 'Matching linked cards'}
            style={{ height: `${viewportHeight}px` }}
            onScroll={onScroll}
          >
            {virtual.top > 0 && <div aria-hidden="true" style={{ height: `${virtual.top}px` }} />}
            {visible.map((option, visibleIndex) => {
              const index = virtual.start + visibleIndex
              const active = index === activeIndex
              return (
                <button
                  key={option.id}
                  id={`${listId}-option-${option.id}`}
                  type="button"
                  role="option"
                  aria-selected={option.id === value}
                  className={active ? 'active' : ''}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => select(option)}
                >
                  <strong>{option.title}</strong>
                  <span>{documentTypeLabel(option.type, language)}</span>
                  <code>{option.id}</code>
                </button>
              )
            })}
            {virtual.bottom > 0 && <div aria-hidden="true" style={{ height: `${virtual.bottom}px` }} />}
            {!results.length && (
              <p className="planning-card-selector-empty">
                {language === 'zh' ? '没有匹配的卡片' : 'No matching cards'}
              </p>
            )}
          </div>
          <small>
            {language === 'zh'
              ? `${results.length} 项 · ↑↓ 选择 · Enter 确认 · Esc 关闭`
              : `${results.length} results · arrows select · Enter confirms · Esc closes`}
          </small>
        </div>
      )}
    </div>
  )
}

function normalizeSearch(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[#_:/\\-]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
}
