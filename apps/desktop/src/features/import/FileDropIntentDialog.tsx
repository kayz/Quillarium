import { useState } from 'react'
import { FileInput, FileText, LoaderCircle, Sparkles, X } from 'lucide-react'
import type { LanguageName } from '../../app/types.js'
import { formatDesktopError } from '../../shared/errors.js'

type DroppedFilePathResolver = (file: unknown) => string

export function pathsFromDroppedFiles(
  files: ArrayLike<unknown>,
  resolver?: DroppedFilePathResolver
): string[] {
  if (typeof resolver !== 'function') {
    throw new Error('Quillarium desktop bridge is out of date: dropped-file paths are unavailable.')
  }
  const unique = new Set<string>()
  for (const file of Array.from(files)) {
    const resolved = resolver(file).trim()
    if (resolved) unique.add(resolved)
  }
  if (!unique.size) throw new Error('No local files were found in the drop operation.')
  return [...unique]
}

export function FileDropIntentDialog({
  sourcePaths,
  language,
  onReference,
  onSettingImport,
  onClose
}: {
  sourcePaths: string[]
  language: LanguageName
  onReference: (sourcePaths: string[]) => Promise<void>
  onSettingImport: (sourcePaths: string[]) => void
  onClose: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const zh = language === 'zh'
  const names = sourcePaths.map(displayFileName)

  const uploadAsReferences = async () => {
    setBusy(true)
    setError('')
    try {
      await onReference(sourcePaths)
    } catch (cause) {
      setError(formatDesktopError(cause, language))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="modal-backdrop file-drop-intent-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose()
      }}
    >
      <section
        className="modal file-drop-intent-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="file-drop-intent-title"
      >
        <header className="file-drop-intent-head">
          <div>
            <span className="planning-kicker">
              {zh ? '文件已接收 · 尚未写入' : 'Files received · not written'}
            </span>
            <h2 id="file-drop-intent-title">
              {zh ? '这些文件要用于什么？' : 'How should these files be used?'}
            </h2>
            <p>
              {zh
                ? '先选择用途。作为参考文档会原样归档；导入设定会进入 AI 拆分和人工确认流程。'
                : 'Choose an intent first. References are archived as-is; setting import opens AI review.'}
            </p>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label={zh ? '关闭' : 'Close'}
          >
            <X size={18} />
          </button>
        </header>

        <div className="file-drop-source-summary" aria-label={zh ? '已拖入文件' : 'Dropped files'}>
          <FileInput size={20} />
          <span>
            <strong>
              {zh ? `${names.length} 个文件` : `${names.length} file${names.length === 1 ? '' : 's'}`}
            </strong>
            <small>
              {names.slice(0, 4).join(' · ')}
              {names.length > 4
                ? zh
                  ? ` · 另有 ${names.length - 4} 个`
                  : ` · ${names.length - 4} more`
                : ''}
            </small>
          </span>
        </div>

        <div className="file-drop-intent-options">
          <button type="button" onClick={() => void uploadAsReferences()} disabled={busy}>
            {busy ? <LoaderCircle className="spin" size={24} /> : <FileText size={24} />}
            <span>
              <strong>{zh ? '作为参考文档' : 'Use as references'}</strong>
              <small>
                {zh
                  ? '保存原文，不自动调用 AI；之后可从参考卡发起 AI 讨论生卡。'
                  : 'Save source text without calling AI. You can discuss a reference later.'}
              </small>
            </span>
          </button>
          <button type="button" onClick={() => onSettingImport(sourcePaths)} disabled={busy}>
            <Sparkles size={24} />
            <span>
              <strong>{zh ? '导入设定' : 'Import settings'}</strong>
              <small>
                {zh
                  ? '交给 AI 拆分为多张候选设定卡，逐张校对确认后才写入。'
                  : 'Split into setting-card candidates; nothing is written before review.'}
              </small>
            </span>
          </button>
        </div>

        {error && (
          <p className="file-drop-intent-error" role="alert">
            {error}
          </p>
        )}
      </section>
    </div>
  )
}

function displayFileName(filePath: string): string {
  return filePath.split(/[\\/]/u).filter(Boolean).at(-1) ?? filePath
}
