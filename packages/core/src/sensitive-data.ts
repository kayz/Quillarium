export type SensitiveDataKind =
  'authorization' | 'credential' | 'endpoint' | 'windows-path' | 'unc-path' | 'file-url' | 'posix-path'

export interface SensitiveDataFinding {
  kind: SensitiveDataKind
  source: string
}

export interface SensitiveTextSource {
  source: string
  text: string
}

const SENSITIVE_KEY =
  /^(?:authorization|proxy-authorization|api[_-]?key|x-api-key|access[_-]?token|refresh[_-]?token|client[_-]?secret|private[_-]?key|aws[_-]?(?:access[_-]?key[_-]?id|secret[_-]?access[_-]?key|session[_-]?token)|secret|password|credential|endpoint|base[_-]?url)$/iu

const TEXT_PATTERNS: ReadonlyArray<{
  kind: SensitiveDataKind
  pattern: RegExp
  replacement: string
}> = [
  {
    kind: 'authorization',
    pattern: /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/giu,
    replacement: '$1 [REDACTED]'
  },
  {
    kind: 'credential',
    pattern: /\bgithub_pat_[A-Za-z0-9_]{12,}\b/giu,
    replacement: '[REDACTED_CREDENTIAL]'
  },
  {
    kind: 'credential',
    pattern: /\b(?:(?:sk(?:-ant)?|rk|pk)-[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9]{8,})\b/giu,
    replacement: '[REDACTED_CREDENTIAL]'
  },
  {
    kind: 'credential',
    pattern: /\bAIza[A-Za-z0-9_-]{20,}\b/gu,
    replacement: '[REDACTED_CREDENTIAL]'
  },
  {
    kind: 'credential',
    pattern: /\bya29\.[A-Za-z0-9_-]{12,}\b/gu,
    replacement: '[REDACTED_CREDENTIAL]'
  },
  {
    kind: 'credential',
    pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/gu,
    replacement: '[REDACTED_CREDENTIAL]'
  },
  {
    kind: 'endpoint',
    pattern: /\b(endpoint|base[_ -]?url)\s*[:=]\s*["']?(?:https?|wss?):\/\/[^\s"',;]+/giu,
    replacement: '$1: [REDACTED_ENDPOINT]'
  },
  {
    kind: 'credential',
    pattern:
      /\b(api[_ -]?key|x-api-key|authorization|proxy-authorization|access[_ -]?token|refresh[_ -]?token|client[_ -]?secret|private[_ -]?key|aws[_ -]?(?:access[_ -]?key[_ -]?id|secret[_ -]?access[_ -]?key|session[_ -]?token)|secret|password|credential)\s*[:=]\s*["']?[^\s"',;]+/giu,
    replacement: '$1: [REDACTED]'
  },
  {
    kind: 'file-url',
    pattern: /\bfile:\/\/(?:\/[A-Za-z]:)?[^\s"'<>]+/giu,
    replacement: '[LOCAL_PATH_REDACTED]'
  },
  {
    kind: 'unc-path',
    pattern: /\\\\[^\\\s"'<>]+\\[^\s"'<>]+/gu,
    replacement: '[LOCAL_PATH_REDACTED]'
  },
  {
    kind: 'windows-path',
    pattern: /\b[A-Za-z]:[\\/](?:[^\\/\s\r\n"'<>]+[\\/])*[^\\/\s\r\n"'<>]*/gu,
    replacement: '[LOCAL_PATH_REDACTED]'
  },
  {
    kind: 'posix-path',
    pattern: /\/(?:Users|home|root|private|tmp|var|opt|mnt|etc|srv)(?:\/[^\s"'<>]+)?/gu,
    replacement: '[LOCAL_PATH_REDACTED]'
  }
]

export class SensitiveContentError extends Error {
  readonly code = 'SENSITIVE_PROMPT_CONTENT'
  readonly findings: SensitiveDataFinding[]

  constructor(findings: SensitiveDataFinding[]) {
    super(
      `SENSITIVE_PROMPT_CONTENT: ${[...new Set(findings.map((finding) => `${finding.source}:${finding.kind}`))].join(', ')}`
    )
    this.name = 'SensitiveContentError'
    this.findings = findings
  }
}

export function scanSensitiveText(value: string, source = 'text'): SensitiveDataFinding[] {
  const findings: SensitiveDataFinding[] = []
  for (const { kind, pattern } of TEXT_PATTERNS) {
    pattern.lastIndex = 0
    const matches = value.match(pattern) ?? []
    if (matches.some((match) => !/\[REDACTED(?:_[A-Z]+)?\]/u.test(match))) {
      findings.push({ kind, source })
    }
  }
  return findings
}

export function scanSensitiveValue(value: unknown, source = 'value'): SensitiveDataFinding[] {
  if (typeof value === 'string') return scanSensitiveText(value, source)
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => scanSensitiveValue(item, `${source}[${index}]`))
  }
  if (!value || typeof value !== 'object') return []
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => {
    const childSource = `${source}.${key}`
    if (
      SENSITIVE_KEY.test(key) &&
      typeof child === 'string' &&
      child.trim() &&
      !isRedactedPlaceholder(child)
    ) {
      return [
        {
          kind: /endpoint|base[_-]?url/iu.test(key) ? ('endpoint' as const) : ('credential' as const),
          source: childSource
        }
      ]
    }
    return scanSensitiveValue(child, childSource)
  })
}

function isRedactedPlaceholder(value: string): boolean {
  return /^\[REDACTED(?:_[A-Z]+)?\]$/u.test(value.trim())
}

export function scanSensitiveSources(sources: SensitiveTextSource[]): SensitiveDataFinding[] {
  return sources.flatMap((source) => scanSensitiveText(source.text, source.source))
}

export function assertSensitiveSourcesSafe(sources: SensitiveTextSource[]): void {
  const findings = scanSensitiveSources(sources)
  if (findings.length) throw new SensitiveContentError(findings)
}

export function assertSensitiveValueSafe(value: unknown, source = 'value'): void {
  const findings = scanSensitiveValue(value, source)
  if (findings.length) throw new SensitiveContentError(findings)
}

export function sanitizeSensitiveText(value: string): string {
  let sanitized = value
  for (const { pattern, replacement } of TEXT_PATTERNS) {
    pattern.lastIndex = 0
    sanitized = sanitized.replace(pattern, replacement)
  }
  return sanitized
}

export function sanitizeSensitiveValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeSensitiveValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, child]) => [
        key,
        SENSITIVE_KEY.test(key) ? '[REDACTED]' : sanitizeSensitiveValue(child)
      ])
    )
  }
  return typeof value === 'string' ? sanitizeSensitiveText(value) : value
}
