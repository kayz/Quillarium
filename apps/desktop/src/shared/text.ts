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
