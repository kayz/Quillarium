import { appendFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { app } from 'electron'

interface DesktopLogEntry {
  recorded_at: string
  type: string
  scope: string
  message?: string
  name?: string
  stack?: string
  context?: Record<string, unknown>
}

let logFile = ''
let handlersInstalled = false

export async function initializeDesktopLogging(): Promise<string> {
  const directory = app.getPath('logs')
  await mkdir(directory, { recursive: true })
  logFile = path.join(directory, `desktop-${localDateStamp(new Date())}.jsonl`)
  await appendDesktopLog({
    type: 'application.started',
    scope: 'main',
    context: {
      version: process.env.QUILLARIUM_APP_VERSION ?? app.getVersion(),
      platform: process.platform,
      packaged: app.isPackaged
    }
  })
  installProcessErrorHandlers()
  return logFile
}

export async function recordIpcFailure(
  channel: string,
  error: unknown,
  context: Record<string, unknown> = {}
): Promise<void> {
  const serialized = serializeErrorForLog(error)
  await appendDesktopLog({
    type: 'ipc.failed',
    scope: channel,
    ...serialized,
    context: sanitizeLogContext(context)
  })
}

export async function recordRendererConsole(
  level: 'warning' | 'error',
  message: string,
  lineNumber: number
): Promise<void> {
  await appendDesktopLog({
    type: 'renderer.console',
    scope: 'renderer',
    message: redactSecrets(message).slice(0, 8_000),
    context: { level, line_number: lineNumber }
  })
}

export function serializeErrorForLog(error: unknown): Pick<DesktopLogEntry, 'message' | 'name' | 'stack'> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: redactSecrets(error.message),
      stack: error.stack ? redactSecrets(error.stack) : undefined
    }
  }
  return { name: 'NonError', message: redactSecrets(String(error)) }
}

export function sanitizeLogContext(value: Record<string, unknown>): Record<string, unknown> {
  return sanitizeValue(value, 0) as Record<string, unknown>
}

async function appendDesktopLog(entry: Omit<DesktopLogEntry, 'recorded_at'>): Promise<void> {
  if (!logFile) return
  const line: DesktopLogEntry = { recorded_at: new Date().toISOString(), ...entry }
  await appendFile(logFile, `${JSON.stringify(line)}\n`, 'utf8')
}

function installProcessErrorHandlers(): void {
  if (handlersInstalled) return
  handlersInstalled = true
  process.on('uncaughtExceptionMonitor', (error) => {
    void appendDesktopLog({
      type: 'process.uncaught-exception',
      scope: 'main',
      ...serializeErrorForLog(error)
    }).catch((loggingError) => console.error('Could not persist Quillarium error log.', loggingError))
  })
  process.on('unhandledRejection', (reason) => {
    void appendDesktopLog({
      type: 'process.unhandled-rejection',
      scope: 'main',
      ...serializeErrorForLog(reason)
    }).catch((loggingError) => console.error('Could not persist Quillarium error log.', loggingError))
  })
}

function sanitizeValue(value: unknown, depth: number): unknown {
  if (depth > 4) return '[omitted]'
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeValue(item, depth + 1))
  if (!value || typeof value !== 'object') {
    return typeof value === 'string' ? redactSecrets(value).slice(0, 1_000) : value
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .slice(0, 40)
      .map(([key, item]) => [
        key,
        /api[-_]?key|authorization|credential|password|secret|token/i.test(key)
          ? '[redacted]'
          : sanitizeValue(item, depth + 1)
      ])
  )
}

function redactSecrets(value: string): string {
  return value
    .replace(/(authorization\s*[:=]\s*)(?:bearer\s+)?\S+/gi, '$1[redacted]')
    .replace(/((?:api[-_]?key|password|secret|credential)\s*[:=]\s*)\S+/gi, '$1[redacted]')
}

function localDateStamp(date: Date): string {
  const year = String(date.getFullYear())
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
