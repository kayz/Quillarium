import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import {
  Bot,
  ChevronLeft,
  ChevronRight,
  Download,
  ImagePlus,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
  X
} from 'lucide-react'
import { settingCardDocumentTypeSchema, type SettingCardDocumentType } from '@quillarium/core'
import type { DocEntry, LanguageName } from '../../app/types.js'
import { bridge } from '../../app/bridge.js'
import { formatDesktopError } from '../../shared/errors.js'
import {
  appendSettingCardCandidate,
  moveSettingCardCandidateIndex,
  settingCardStyleSource
} from './setting-card-designer-model.js'

export { SETTING_CARD_TYPES, SETTING_IMAGE_TYPES, SettingThumbnail } from './SettingThumbnail.js'

type SettingCardStyle = Awaited<ReturnType<typeof bridge.listSettingCardStyles>>[number]
type SettingCardCandidate = Awaited<ReturnType<typeof bridge.designSettingCard>>['candidate']
type SettingCardSize = SettingCardCandidate['size']
type SettingCardTemplate = SettingCardCandidate['template']
type DisplayImageManifest = Awaited<ReturnType<typeof bridge.listDisplayImages>>
type DisplayImageCandidate = Awaited<ReturnType<typeof bridge.generateDisplayImage>>
type GalleryImage = DisplayImageManifest['image_data_urls'][number]

const CARD_SIZES: Array<{ id: string; zh: string; en: string; value: SettingCardSize }> = [
  { id: 'portrait', zh: '竖版 720×1080', en: 'Portrait 720×1080', value: { width: 720, height: 1080 } },
  { id: 'square', zh: '方形 900×900', en: 'Square 900×900', value: { width: 900, height: 900 } },
  { id: 'landscape', zh: '横版 1200×720', en: 'Landscape 1200×720', value: { width: 1200, height: 720 } }
]

const BUILTIN_STYLES = [
  { id: 'ink-archive', zh: '墨色档案', en: 'Ink archive' },
  { id: 'modern-dossier', zh: '现代资料卡', en: 'Modern dossier' },
  { id: 'editorial', zh: '杂志编辑页', en: 'Editorial' },
  { id: 'minimal', zh: '极简信息卡', en: 'Minimal' },
  { id: 'heraldic', zh: '纹章叙事', en: 'Heraldic' }
]

export function defaultDisplayImagePrompt(title: string, content: string): string {
  return `${title}\n${content.slice(0, 400)}`
}

export function nextDisplayImagePrompt({
  previousCardId,
  cardId,
  title,
  content,
  currentPrompt
}: {
  previousCardId: string | null | undefined
  cardId: string
  title: string
  content: string
  currentPrompt: string
}): string {
  if (previousCardId === cardId) {
    return currentPrompt
  }
  return defaultDisplayImagePrompt(title, content)
}

export function SettingCardMediaPanel({
  root,
  document,
  language,
  showImageChrome = false
}: {
  root: string
  document: DocEntry
  dirty: boolean
  onSave: () => Promise<void>
  onReloadDocument: () => Promise<void>
  onReloadProject: () => Promise<void>
  language: LanguageName
  showImageChrome?: boolean
}) {
  const zh = language === 'zh'
  const parsedType = settingCardDocumentTypeSchema.safeParse(document.data.type)
  const [designerOpen, setDesignerOpen] = useState(false)
  const [manifest, setManifest] = useState<DisplayImageManifest | null>(null)
  const [prompt, setPrompt] = useState(() =>
    defaultDisplayImagePrompt(String(document.data.title), document.content)
  )
  const [candidate, setCandidate] = useState<DisplayImageCandidate | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setPrompt(defaultDisplayImagePrompt(String(document.data.title), document.content))
  }, [document.data.id])

  useEffect(() => {
    if (!showImageChrome || !parsedType.success) return
    let active = true
    void bridge
      .listDisplayImages(root, document.data.id)
      .then((next) => {
        if (active) setManifest(next)
      })
      .catch((cause) => {
        if (active) setError(formatDesktopError(cause, language))
      })
    return () => {
      active = false
    }
  }, [document.data.id, language, parsedType.success, root, showImageChrome])

  if (!parsedType.success) return null
  const documentType = parsedType.data
  const gallery = manifest?.image_data_urls ?? []
  const selectedUrl = gallery[0]?.data_url ?? null

  return (
    <section className="setting-media-panel">
      {showImageChrome && (
        <DisplayImageControls
          zh={zh}
          busy={busy}
          error={error}
          prompt={prompt}
          candidate={candidate}
          gallery={gallery}
          selectedId={manifest?.selected_id ?? null}
          onPrompt={setPrompt}
          onUpload={() =>
            void runAction(setBusy, setError, language, async () => {
              const next = await bridge.chooseDisplayImage(
                root,
                document.data.id,
                String(document.data.title)
              )
              if (next) setManifest(next)
            })
          }
          onGenerate={() =>
            void runAction(setBusy, setError, language, async () => {
              setCandidate(await bridge.generateDisplayImage(root, document.data.id, prompt))
            })
          }
          onConfirm={() =>
            void runAction(setBusy, setError, language, async () => {
              if (!candidate) return
              setManifest(
                await bridge.confirmGenerateDisplayImage(root, document.data.id, candidate.candidate_id)
              )
              setCandidate(null)
            })
          }
          onCancel={() => setCandidate(null)}
          onSelect={(imageId) =>
            void runAction(setBusy, setError, language, async () => {
              setManifest(await bridge.selectDisplayImage(root, document.data.id, imageId))
            })
          }
          onRemove={(imageId) =>
            void runAction(setBusy, setError, language, async () => {
              setManifest(await bridge.removeDisplayImage(root, document.data.id, imageId))
            })
          }
        />
      )}
      <div className="setting-media-actions">
        <button className="primary" type="button" onClick={() => setDesignerOpen(true)}>
          <Bot size={14} /> {zh ? '创建设定卡' : 'Design card'}
        </button>
      </div>
      {designerOpen && (
        <SettingCardDesigner
          root={root}
          document={document}
          documentType={documentType}
          imageDataUrl={selectedUrl}
          imageDataUrls={gallery}
          language={language}
          onClose={() => setDesignerOpen(false)}
        />
      )}
    </section>
  )
}

type SettingCardRenderSource = Parameters<typeof bridge.renderSettingCardStyle>[1]['source']

interface SettingCardCandidateHistoryItem {
  candidate: SettingCardCandidate
  runRelativePath: string
}

function SettingCardDesigner({
  root,
  document,
  documentType,
  imageDataUrl,
  imageDataUrls = [],
  language,
  onClose
}: {
  root: string
  document: DocEntry
  documentType: SettingCardDocumentType
  imageDataUrl: string | null
  imageDataUrls?: GalleryImage[]
  language: LanguageName
  onClose: () => void
}) {
  const zh = language === 'zh'
  const [styles, setStyles] = useState<SettingCardStyle[]>([])
  const [styleSelection, setStyleSelection] = useState('builtin:ink-archive')
  const [sizeId, setSizeId] = useState(CARD_SIZES[0].id)
  const [candidateHistory, setCandidateHistory] = useState<SettingCardCandidateHistoryItem[]>([])
  const [candidateIndex, setCandidateIndex] = useState(0)
  const [template, setTemplate] = useState<SettingCardTemplate | null>(null)
  const [html, setHtml] = useState('')
  const [styleName, setStyleName] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const size = useMemo(
    () => CARD_SIZES.find((item) => item.id === sizeId)?.value ?? CARD_SIZES[0].value,
    [sizeId]
  )
  const currentCandidate = candidateHistory[candidateIndex] ?? null
  const preview = useMemo(
    () => ({
      id: document.data.id,
      type: documentType,
      title: String(document.data.title),
      content: document.content,
      fields: document.data as Record<string, unknown>,
      image_data_url: imageDataUrl,
      image_data_urls: imageDataUrls
    }),
    [document.content, document.data, documentType, imageDataUrl, imageDataUrls]
  )

  useEffect(() => {
    let active = true
    setBusy(true)
    void Promise.all([
      bridge.listSettingCardStyles(root, documentType),
      bridge.renderSettingCardStyle(root, {
        document_id: document.data.id,
        source: { kind: 'builtin', id: 'ink-archive' },
        size: CARD_SIZES[0].value,
        language,
        preview
      })
    ])
      .then(([loadedStyles, rendered]) => {
        if (!active) return
        setStyles(loadedStyles)
        setTemplate(rendered.template)
        setHtml(rendered.html)
      })
      .catch((cause) => {
        if (active) setError(formatDesktopError(cause, language))
      })
      .finally(() => {
        if (active) setBusy(false)
      })
    return () => {
      active = false
    }
  }, [document.data.id, documentType, language, preview, root])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
    }
  }, [busy, onClose])

  const renderLocal = async (source: SettingCardRenderSource, nextSize: SettingCardSize) => {
    const result = await bridge.renderSettingCardStyle(root, {
      document_id: document.data.id,
      source,
      size: nextSize,
      language,
      preview
    })
    setTemplate(result.template)
    setHtml(result.html)
    return result
  }

  const roll = async () => {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await bridge.designSettingCard(root, {
        document_id: document.data.id,
        document_type: documentType,
        style_direction: 'random',
        variation_index: candidateHistory.length,
        size,
        base_style: null,
        language,
        preview
      })
      const next = appendSettingCardCandidate(candidateHistory, {
        candidate: result.candidate,
        runRelativePath: result.run_relative_path
      })
      setCandidateHistory(next.history)
      setCandidateIndex(next.selectedIndex)
      setTemplate(result.candidate.template)
      setHtml(result.html)
      setNotice(
        zh
          ? `已生成候选；运行快照：${result.run_relative_path}`
          : `Candidate generated; run snapshot: ${result.run_relative_path}`
      )
    } catch (cause) {
      setError(formatDesktopError(cause, language))
    } finally {
      setBusy(false)
    }
  }

  const selectStyle = async (value: string) => {
    setStyleSelection(value)
    setError('')
    setNotice('')
    if (value === 'random') {
      if (!currentCandidate) {
        setTemplate(null)
        setHtml('')
        return
      }
      setBusy(true)
      try {
        await renderLocal({ kind: 'candidate', template: currentCandidate.candidate.template }, size)
        setNotice(candidateNotice(currentCandidate, candidateIndex, candidateHistory.length, zh))
      } catch (cause) {
        setError(formatDesktopError(cause, language))
      } finally {
        setBusy(false)
      }
      return
    }
    const source = settingCardStyleSource(value)
    if (!source) return
    setBusy(true)
    try {
      const result = await renderLocal(source, size)
      const label =
        result.style?.value.name ??
        BUILTIN_STYLES.find((item) => `builtin:${item.id}` === value)?.[zh ? 'zh' : 'en'] ??
        value
      setNotice(zh ? `已本地渲染：${label}` : `Rendered locally: ${label}`)
    } catch (cause) {
      setError(formatDesktopError(cause, language))
    } finally {
      setBusy(false)
    }
  }

  const changeSize = async (value: string) => {
    const nextSize = CARD_SIZES.find((item) => item.id === value)?.value ?? CARD_SIZES[0].value
    setSizeId(value)
    const source =
      styleSelection === 'random'
        ? currentCandidate
          ? ({
              kind: 'candidate',
              template: currentCandidate.candidate.template
            } satisfies SettingCardRenderSource)
          : null
        : settingCardStyleSource(styleSelection)
    if (!source) return
    setBusy(true)
    setError('')
    try {
      await renderLocal(source, nextSize)
    } catch (cause) {
      setError(formatDesktopError(cause, language))
    } finally {
      setBusy(false)
    }
  }

  const showCandidate = async (nextIndex: number) => {
    if (!candidateHistory.length) return
    const normalizedIndex = moveSettingCardCandidateIndex(
      candidateIndex,
      candidateHistory.length,
      nextIndex - candidateIndex
    )
    const item = candidateHistory[normalizedIndex]!
    setBusy(true)
    setError('')
    try {
      await renderLocal({ kind: 'candidate', template: item.candidate.template }, size)
      setCandidateIndex(normalizedIndex)
      setNotice(candidateNotice(item, normalizedIndex, candidateHistory.length, zh))
    } catch (cause) {
      setError(formatDesktopError(cause, language))
    } finally {
      setBusy(false)
    }
  }

  const saveStyle = async () => {
    if (!currentCandidate || !styleName.trim()) return
    setBusy(true)
    setError('')
    try {
      const saved = await bridge.saveSettingCardStyle(root, {
        name: styleName.trim(),
        candidate: { ...currentCandidate.candidate, size }
      })
      setStyles(await bridge.listSettingCardStyles(root, documentType))
      setStyleSelection(`workspace:${saved.value.id}@${saved.value.version}`)
      setStyleName('')
      setNotice(
        zh
          ? `已保存工作区样式 ${saved.value.name} v${saved.value.version}`
          : `Workspace style saved: ${saved.value.name} v${saved.value.version}`
      )
    } catch (cause) {
      setError(formatDesktopError(cause, language))
    } finally {
      setBusy(false)
    }
  }

  const exportHtml = async () => {
    if (!template) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await bridge.exportSettingCard(root, {
        document_id: document.data.id,
        template,
        size,
        language
      })
      if (result.canceled) return
      setNotice(zh ? `已另存为 ${result.file_name}` : `Saved as ${result.file_name}`)
    } catch (cause) {
      setError(formatDesktopError(cause, language))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="modal-backdrop setting-card-designer-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose()
      }}
    >
      <section
        className="modal setting-card-designer"
        role="dialog"
        aria-modal="true"
        aria-label={zh ? '设定卡设计器' : 'Setting card designer'}
      >
        <header className="setting-card-designer-head">
          <div>
            <span className="planning-kicker">
              {zh ? '候选 HTML · 不写入正设' : 'Candidate HTML · no Canon write'}
            </span>
            <h2>{zh ? `设计「${document.data.title}」` : `Design “${document.data.title}”`}</h2>
            <p>
              {zh
                ? '内置与已保存样式会立即在本地渲染；只有“随机风格”调用 Agent。候选不会写入正设，满意后可命名保存。'
                : 'Built-in and saved styles render locally. Only Random style calls the Agent; save a candidate only after you like it.'}
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
        <div className="setting-card-designer-grid">
          <aside className="setting-card-controls">
            <label>
              {zh ? '输出风格' : 'Style direction'}
              <select
                value={styleSelection}
                onChange={(event) => void selectStyle(event.target.value)}
                disabled={busy}
              >
                <option value="random">{zh ? '随机风格（Agent）' : 'Random style (Agent)'}</option>
                <optgroup label={zh ? '内置样式 · 即时渲染' : 'Built-in · instant render'}>
                  {BUILTIN_STYLES.map((item) => (
                    <option key={item.id} value={`builtin:${item.id}`}>
                      {zh ? item.zh : item.en}
                    </option>
                  ))}
                </optgroup>
                {styles.length > 0 && (
                  <optgroup label={zh ? '我的样式 · 即时渲染' : 'My styles · instant render'}>
                    {styles.map((style) => (
                      <option
                        key={`${style.value.id}@${style.value.version}`}
                        value={`workspace:${style.value.id}@${style.value.version}`}
                      >
                        {style.value.name} · v{style.value.version}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              <small className="setting-card-control-hint">
                {styleSelection === 'random'
                  ? zh
                    ? '每次 Roll 都会轮换主构图与多项视觉约束，并保留为一个候选。'
                    : 'Each Roll rotates the primary composition and visual axes, then remains in history.'
                  : zh
                    ? '切换样式或尺寸不会调用模型。'
                    : 'Changing style or size does not call the model.'}
              </small>
            </label>
            <label>
              {zh ? '尺寸' : 'Size'}
              <select
                value={sizeId}
                onChange={(event) => void changeSize(event.target.value)}
                disabled={busy}
              >
                {CARD_SIZES.map((item) => (
                  <option key={item.id} value={item.id}>
                    {zh ? item.zh : item.en}
                  </option>
                ))}
              </select>
            </label>
            {styleSelection === 'random' && (
              <section className="setting-card-random-controls">
                <button className="primary" type="button" onClick={() => void roll()} disabled={busy}>
                  <RefreshCw size={15} className={busy ? 'spin' : ''} />{' '}
                  {zh ? 'Roll 随机新候选' : 'Roll random candidate'}
                </button>
                {currentCandidate && (
                  <>
                    <hr />
                    <label>
                      {zh ? '满意后命名保存' : 'Name after approval'}
                      <input
                        value={styleName}
                        onChange={(event) => setStyleName(event.target.value)}
                        placeholder={zh ? '例如：羊皮纸人物档案' : 'e.g. Parchment dossier'}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => void saveStyle()}
                      disabled={busy || !styleName.trim()}
                    >
                      <Save size={15} /> {zh ? '保存当前风格' : 'Save current style'}
                    </button>
                  </>
                )}
              </section>
            )}
            <button type="button" onClick={() => void exportHtml()} disabled={busy || !template}>
              <Download size={15} /> {zh ? 'HTML 另存为…' : 'Save HTML as…'}
            </button>
            {notice && (
              <p className="settings-notice success" role="status">
                {notice}
              </p>
            )}
            {error && (
              <p className="settings-notice danger" role="alert">
                {error}
              </p>
            )}
          </aside>
          <div
            className={`setting-card-stage${
              styleSelection === 'random' && candidateHistory.length > 0 ? ' has-candidate-nav' : ''
            }`}
          >
            {styleSelection === 'random' && candidateHistory.length > 0 && (
              <nav className="setting-card-candidate-nav" aria-label={zh ? '候选历史' : 'Candidate history'}>
                <button
                  className="icon-button"
                  type="button"
                  onClick={() => void showCandidate(candidateIndex - 1)}
                  disabled={busy || candidateHistory.length < 2}
                  aria-label={zh ? '上一个候选' : 'Previous candidate'}
                >
                  <ChevronLeft size={17} />
                </button>
                <div>
                  <strong>
                    {zh ? '随机候选' : 'Random candidate'} {candidateIndex + 1} / {candidateHistory.length}
                  </strong>
                  <span>
                    {currentCandidate?.candidate.template.notes || (zh ? '未附设计说明' : 'No design note')}
                  </span>
                </div>
                <div className="setting-card-candidate-dots" aria-hidden="true">
                  {candidateHistory.map((item, index) => (
                    <i
                      className={index === candidateIndex ? 'active' : ''}
                      key={item.candidate.execution_id}
                    />
                  ))}
                </div>
                <button
                  className="icon-button"
                  type="button"
                  onClick={() => void showCandidate(candidateIndex + 1)}
                  disabled={busy || candidateHistory.length < 2}
                  aria-label={zh ? '下一个候选' : 'Next candidate'}
                >
                  <ChevronRight size={17} />
                </button>
              </nav>
            )}
            <div
              className="setting-card-preview-shell"
              style={{ '--setting-card-ratio': `${size.width} / ${size.height}` } as CSSProperties}
            >
              {html ? (
                <iframe
                  title={zh ? '设定卡 HTML 预览' : 'Setting card HTML preview'}
                  sandbox=""
                  srcDoc={html}
                />
              ) : (
                <div className="setting-card-preview-empty">
                  <Sparkles size={28} />
                  <strong>{zh ? '点击 Roll 生成第一个随机候选' : 'Roll your first random candidate'}</strong>
                  <span>
                    {zh
                      ? '后续候选会保留在这里，可左右翻看。'
                      : 'Later candidates remain here for navigation.'}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

function candidateNotice(
  item: SettingCardCandidateHistoryItem,
  index: number,
  count: number,
  zh: boolean
): string {
  return zh
    ? `候选 ${index + 1}/${count}；运行快照：${item.runRelativePath}`
    : `Candidate ${index + 1}/${count}; run snapshot: ${item.runRelativePath}`
}

function DisplayImageControls({
  zh,
  busy,
  error,
  prompt,
  candidate,
  gallery,
  selectedId,
  onPrompt,
  onUpload,
  onGenerate,
  onConfirm,
  onCancel,
  onSelect,
  onRemove
}: {
  zh: boolean
  busy: boolean
  error: string
  prompt: string
  candidate: DisplayImageCandidate | null
  gallery: GalleryImage[]
  selectedId: string | null
  onPrompt: (value: string) => void
  onUpload: () => void
  onGenerate: () => void
  onConfirm: () => void
  onCancel: () => void
  onSelect: (imageId: string) => void
  onRemove: (imageId: string) => void
}) {
  return (
    <div className="setting-media-copy">
      {gallery.length > 0 && (
        <div className="setting-media-gallery" role="list">
          {gallery.map((image) => (
            <div
              className={`setting-media-thumb${image.id === selectedId ? ' selected' : ''}`}
              key={image.id}
              role="listitem"
            >
              <button type="button" onClick={() => onSelect(image.id)} disabled={busy}>
                <img src={image.data_url} alt={image.alt || (zh ? '配图' : 'Display image')} />
              </button>
              <button
                className="icon-button"
                type="button"
                onClick={() => onRemove(image.id)}
                disabled={busy}
                aria-label={zh ? '删除配图' : 'Remove image'}
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
      {candidate && (
        <div className="setting-media-preview">
          <img src={candidate.data_url} alt={zh ? '生图候选' : 'Generated candidate'} />
        </div>
      )}
      <label>
        {zh ? '生图提示词' : 'Image prompt'}
        <textarea
          value={prompt}
          onChange={(event) => onPrompt(event.target.value)}
          rows={3}
          disabled={busy}
        />
      </label>
      <div className="setting-media-actions">
        <button type="button" onClick={onUpload} disabled={busy}>
          <ImagePlus size={14} /> {zh ? '上传图片' : 'Upload image'}
        </button>
        <button type="button" onClick={onGenerate} disabled={busy || !prompt.trim()}>
          <Sparkles size={14} /> {zh ? '生成配图' : 'Generate image'}
        </button>
        <button type="button" onClick={onConfirm} disabled={busy || !candidate}>
          <Save size={14} /> {zh ? '确认保存' : 'Confirm save'}
        </button>
        <button type="button" onClick={onCancel} disabled={busy || !candidate}>
          <X size={14} /> {zh ? '取消' : 'Cancel'}
        </button>
      </div>
      {error && (
        <p className="settings-notice danger" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

async function runAction(
  setBusy: (value: boolean) => void,
  setError: (value: string) => void,
  language: LanguageName,
  action: () => Promise<void>
): Promise<void> {
  setBusy(true)
  setError('')
  try {
    await action()
  } catch (cause) {
    setError(formatDesktopError(cause, language))
  } finally {
    setBusy(false)
  }
}
