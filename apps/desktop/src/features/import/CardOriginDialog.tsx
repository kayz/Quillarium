import { useEffect, useId, useState } from 'react'
import { ExternalLink, FileClock, LoaderCircle, RefreshCw, TriangleAlert, X } from 'lucide-react'
import type { DocumentOriginResolution } from '@quillarium/core'
import type { DocEntry, LanguageName } from '../../app/types.js'
import { bridge } from '../../app/bridge.js'
import { formatDesktopError } from '../../shared/errors.js'

export function CardOriginDialog({
  root,
  doc,
  language,
  onClose,
  onReimported
}: {
  root: string
  doc: DocEntry
  language: LanguageName
  onClose: () => void
  onReimported: (result: {
    path: string
    document: { data: Record<string, unknown>; content: string }
  }) => void
}) {
  const titleId = useId()
  const [resolution, setResolution] = useState<DocumentOriginResolution | null>(null)
  const [busy, setBusy] = useState<'load' | 'reimport' | null>('load')
  const [error, setError] = useState<string | null>(null)
  const zh = language === 'zh'

  useEffect(() => {
    let active = true
    void bridge
      .resolveDocumentOrigin(root, doc.path)
      .then((value: DocumentOriginResolution | null) => {
        if (!active) return
        setResolution(value)
        setBusy(null)
      })
      .catch((cause: unknown) => {
        if (!active) return
        setError(formatDesktopError(cause, language))
        setBusy(null)
      })
    return () => {
      active = false
    }
  }, [doc.path, root])

  const reimport = async () => {
    if (!resolution?.can_reimport) return
    const confirmed = window.confirm(
      zh
        ? `将重新读取源文件，只覆盖“${doc.data.title}”这一张卡片；稳定 ID 与卡片路径保持不变。继续吗？`
        : `Re-read the source and replace only “${doc.data.title}”. Its stable ID and path stay unchanged. Continue?`
    )
    if (!confirmed) return
    setBusy('reimport')
    setError(null)
    try {
      onReimported(await bridge.reimportCard(root, doc.path))
    } catch (cause) {
      setError(formatDesktopError(cause, language))
      setBusy(null)
    }
  }

  return (
    <div
      className="modal-backdrop card-origin-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}
    >
      <section className="modal card-origin-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="card-origin-head">
          <div>
            <span className="planning-kicker">{zh ? '导入来源' : 'Import origin'}</span>
            <h2 id={titleId}>{doc.data.title}</h2>
            <p>
              {zh
                ? '这张卡片保留了落地时的源文件与提取位置。'
                : 'This card retains its source files and extraction position.'}
            </p>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            disabled={Boolean(busy)}
            aria-label={zh ? '关闭' : 'Close'}
          >
            <X size={18} />
          </button>
        </header>

        {busy === 'load' ? (
          <div className="card-origin-loading">
            <LoaderCircle className="spin" size={20} /> {zh ? '正在核验源文件…' : 'Checking source files…'}
          </div>
        ) : resolution ? (
          <div className="source-file-list">
            {resolution.sources.map((source) => (
              <article className={`source-file-row ${source.exists ? '' : 'missing'}`} key={source.path}>
                <FileClock size={18} />
                <div>
                  <strong>{source.path.split(/[\\/]/).at(-1)}</strong>
                  <code title={source.path}>{source.path}</code>
                  <small>
                    {!source.exists
                      ? zh
                        ? '源文件已移动或不存在'
                        : 'Source moved or missing'
                      : source.changed
                        ? zh
                          ? '源文件已有修改，可重新提取'
                          : 'Source changed; ready to re-extract'
                        : zh
                          ? '源文件与上次提取一致'
                          : 'Source matches the last extraction'}
                  </small>
                </div>
                <button
                  className="secondary"
                  type="button"
                  disabled={!source.exists}
                  onClick={() => void bridge.openDocExternal(source.path)}
                >
                  <ExternalLink size={14} /> {zh ? '打开源文件' : 'Open source'}
                </button>
              </article>
            ))}
            {!resolution.sources.length && (
              <div className="source-file-empty">
                <TriangleAlert size={18} />{' '}
                {zh ? '这次导入没有可重新读取的文件来源。' : 'This import has no readable file source.'}
              </div>
            )}
          </div>
        ) : (
          <div className="source-file-empty">
            <TriangleAlert size={18} />{' '}
            {zh ? '没有找到这张卡片的导入记录。' : 'No import record was found for this card.'}
          </div>
        )}

        {error && (
          <div className="planning-error" role="alert">
            <p>{error}</p>
          </div>
        )}
        <footer className="modal-actions card-origin-actions">
          <button className="secondary" type="button" onClick={onClose} disabled={Boolean(busy)}>
            {zh ? '关闭' : 'Close'}
          </button>
          <button
            className="primary"
            type="button"
            disabled={!resolution?.can_reimport || Boolean(busy)}
            onClick={() => void reimport()}
          >
            {busy === 'reimport' ? <LoaderCircle className="spin" size={15} /> : <RefreshCw size={15} />}
            {busy === 'reimport'
              ? zh
                ? '正在重提取这一张…'
                : 'Re-extracting this card…'
              : zh
                ? '只重新提取这一张'
                : 'Re-extract this card only'}
          </button>
        </footer>
      </section>
    </div>
  )
}
