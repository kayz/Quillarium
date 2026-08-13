import { useEffect, useState } from 'react'
import { Download, ExternalLink, FileText } from 'lucide-react'
import type { ManuscriptExportResult } from '@quillarium/core'
import type { DocEntry, LanguageName } from '../../app/types.js'
import { bridge } from '../../app/bridge.js'
import { t } from '../../app/i18n.js'
import { formatDesktopError } from '../../shared/errors.js'

type ExportFormat = 'md' | 'txt'

export function ExportModal({
  root,
  language,
  onClose
}: {
  root: string
  language: LanguageName
  onClose: () => void
}) {
  const [volumes, setVolumes] = useState<DocEntry[]>([])
  const [volumeId, setVolumeId] = useState('')
  const [format, setFormat] = useState<ExportFormat>('md')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [opening, setOpening] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<ManuscriptExportResult | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadVolumes() {
      setLoading(true)
      setError('')
      try {
        const loaded = await bridge.loadProject(root)
        if (cancelled) return
        setVolumes(
          loaded.docs.filter((doc: DocEntry) => doc.data.type === 'outline' && doc.data.level === 'volume')
        )
      } catch (loadError) {
        if (!cancelled) setError(formatDesktopError(loadError, language))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadVolumes()
    return () => {
      cancelled = true
    }
  }, [language, root])

  const selectedPath = result ? (format === 'md' ? result.markdown_path : result.text_path) : ''

  const exportNow = async () => {
    setBusy(true)
    setError('')
    setResult(null)
    try {
      setResult(await bridge.exportManuscript(root, volumeId ? { volumeId } : {}))
    } catch (exportError) {
      setError(formatDesktopError(exportError, language))
    } finally {
      setBusy(false)
    }
  }

  const openArtifact = async () => {
    if (!selectedPath) return
    setOpening(true)
    setError('')
    try {
      if (!(await bridge.openDocExternal(selectedPath))) {
        setError(t(language, 'openExportFailed'))
      }
    } catch (openError) {
      setError(formatDesktopError(openError, language))
    } finally {
      setOpening(false)
    }
  }

  return (
    <div className="modal-backdrop">
      <section
        className="modal export-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-modal-title"
      >
        <div className="export-modal-head">
          <div>
            <span className="export-kicker">{t(language, 'exportKicker')}</span>
            <h2 id="export-modal-title">{t(language, 'exportTitle')}</h2>
          </div>
          <FileText size={24} aria-hidden="true" />
        </div>
        <p>{t(language, 'exportHint')}</p>

        <div className="export-form-grid">
          <label>
            {t(language, 'exportScope')}
            <select
              value={volumeId}
              onChange={(event) => setVolumeId(event.target.value)}
              disabled={loading || busy}
            >
              <option value="">{t(language, 'allVolumes')}</option>
              {volumes.map((volume) => (
                <option key={volume.data.id} value={volume.data.id}>
                  {volume.data.title}
                </option>
              ))}
            </select>
          </label>
          <div className="export-format-field">
            <span>{t(language, 'exportFormat')}</span>
            <div className="export-format-toggle" role="group" aria-label={t(language, 'exportFormat')}>
              <button
                type="button"
                className={format === 'md' ? 'active' : ''}
                aria-pressed={format === 'md'}
                onClick={() => setFormat('md')}
                disabled={busy}
              >
                Markdown (.md)
              </button>
              <button
                type="button"
                className={format === 'txt' ? 'active' : ''}
                aria-pressed={format === 'txt'}
                onClick={() => setFormat('txt')}
                disabled={busy}
              >
                {t(language, 'plainTextFormat')} (.txt)
              </button>
            </div>
          </div>
        </div>

        {loading && <p className="export-loading">{t(language, 'loadingVolumes')}</p>}
        {!loading && volumes.length === 0 && (
          <p className="export-loading">{t(language, 'noVolumeDocuments')}</p>
        )}
        {error && (
          <div className="error-box export-error" role="alert">
            {error}
          </div>
        )}

        {result && (
          <section className="export-result" aria-live="polite">
            <div className="export-result-head">
              <strong>{t(language, 'exportCompleted')}</strong>
              <span>{result.volume_id ? t(language, 'singleVolume') : t(language, 'allVolumes')}</span>
            </div>
            <div className="export-counts">
              <article>
                <strong>{result.exported_scenes.length}</strong>
                <span>{t(language, 'exportedScenes')}</span>
              </article>
              <article className={result.gaps.length ? 'has-gaps' : ''}>
                <strong>{result.gaps.length}</strong>
                <span>{t(language, 'exportGaps')}</span>
              </article>
            </div>
            <div className="export-artifact">
              <span>{t(language, 'selectedArtifact')}</span>
              <code className="export-path">{selectedPath}</code>
              <button className="secondary" type="button" onClick={openArtifact} disabled={opening}>
                <ExternalLink size={15} />
                {opening ? t(language, 'openingExport') : t(language, 'openExportedFile')}
              </button>
            </div>
            <div className="export-detail-grid">
              <section>
                <h3>
                  {t(language, 'exportedScenes')} · {result.exported_scenes.length}
                </h3>
                {result.exported_scenes.length ? (
                  <ul className="export-detail-list">
                    {result.exported_scenes.map((scene) => (
                      <li key={scene.scene_id}>
                        <span>{scene.scene_title}</span>
                        <small>{sourceLabel(language, scene.source)}</small>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>{t(language, 'noExportedScenes')}</p>
                )}
              </section>
              <section>
                <h3>
                  {t(language, 'exportGaps')} · {result.gaps.length}
                </h3>
                {result.gaps.length ? (
                  <ul className="export-detail-list gaps">
                    {result.gaps.map((gap) => (
                      <li key={gap.scene_id}>
                        <span>{gap.scene_title}</span>
                        <small>{gapReasonLabel(language, gap.reason)}</small>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>{t(language, 'noExportGaps')}</p>
                )}
              </section>
            </div>
          </section>
        )}

        <div className="modal-actions">
          <button className="secondary" type="button" onClick={onClose} disabled={busy || opening}>
            {t(language, 'close')}
          </button>
          <button className="primary" type="button" onClick={exportNow} disabled={busy || loading}>
            <Download size={15} />
            {busy ? t(language, 'exporting') : t(language, 'startExport')}
          </button>
        </div>
      </section>
    </div>
  )
}

function sourceLabel(
  language: LanguageName,
  source: ManuscriptExportResult['exported_scenes'][number]['source']
): string {
  switch (source) {
    case 'chapter_prose':
      return language === 'zh' ? '章正文' : 'Chapter prose'
    case 'accepted_run':
      return t(language, 'acceptedRunSource')
    case 'accepted_output':
      return t(language, 'acceptedOutputSource')
    case 'final_scene':
      return t(language, 'finalSceneSource')
  }
}

function gapReasonLabel(
  language: LanguageName,
  reason: ManuscriptExportResult['gaps'][number]['reason']
): string {
  switch (reason) {
    case 'not_accepted':
      return t(language, 'gapNotAccepted')
    case 'missing_content':
      return t(language, 'gapMissingContent')
    case 'missing_outline':
      return t(language, 'gapMissingOutline')
  }
}
