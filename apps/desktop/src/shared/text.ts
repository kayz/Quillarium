import type { LanguageName } from '../app/types.js'
import { I18N, t } from '../app/i18n.js'

export function formatImportResult(result: unknown): string {
  if (!Array.isArray(result) || result.length === 0) return '没有发现可导入的 Markdown。'
  const counts = new Map<string, number>()
  for (const item of result as Array<{ imported_type?: string }>) {
    const key = item.imported_type ?? 'unknown'
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return `已导入 ${result.length} 个文档：${[...counts.entries()].map(([key, count]) => `${key} ${count}`).join('，')}`
}

export function renderMiniMarkdown(content: string): string {
  const escaped = escapeHtml(content || '暂无内容')
  return escaped
    .split(/\n{2,}/)
    .map((block) => {
      const trimmed = block.trim()
      if (!trimmed) return ''
      if (trimmed.startsWith('### ')) return `<h4>${inlineMarkdown(trimmed.slice(4))}</h4>`
      if (trimmed.startsWith('## ')) return `<h3>${inlineMarkdown(trimmed.slice(3))}</h3>`
      if (trimmed.startsWith('# ')) return `<h2>${inlineMarkdown(trimmed.slice(2))}</h2>`
      if (/^[-*]\s+/m.test(trimmed)) {
        const items = trimmed
          .split('\n')
          .filter((line) => /^[-*]\s+/.test(line))
          .map((line) => `<li>${inlineMarkdown(line.replace(/^[-*]\s+/, ''))}</li>`)
          .join('')
        return `<ul>${items}</ul>`
      }
      return `<p>${inlineMarkdown(trimmed).replace(/\n/g, '<br />')}</p>`
    })
    .join('')
}

export function inlineMarkdown(value: string): string {
  return value.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, '<code>$1</code>')
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function runFileLabel(file: string, language: LanguageName): string {
  const labels: Record<string, keyof typeof I18N.zh> = {
    'metadata.yaml': 'runMetadata',
    'prompt.md': 'runPrompt',
    'output-raw.md': 'runRaw',
    'output-accepted.md': 'runAccepted',
    'check-report.md': 'runCheckReport'
  }
  return labels[file] ? t(language, labels[file]) : file
}

export function buildSimpleDiff(raw: string, accepted: string): string {
  if (raw === accepted) return 'raw and accepted are identical.'
  return ['# Raw', raw || '(empty)', '', '# Accepted', accepted || '(empty)'].join('\n')
}
