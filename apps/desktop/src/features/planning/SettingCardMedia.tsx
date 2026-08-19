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
import type { DocEntry, LanguageName } from '../../app/types.js'
import { bridge } from '../../app/bridge.js'
import { formatDesktopError } from '../../shared/errors.js'
import { SETTING_CARD_TYPES, SETTING_IMAGE_TYPES, SettingThumbnail } from './SettingThumbnail.js'
import {
  appendSettingCardCandidate,
  moveSettingCardCandidateIndex,
  settingCardStyleSource
} from './setting-card-designer-model.js'

export { SETTING_CARD_TYPES, SETTING_IMAGE_TYPES, SettingThumbnail } from './SettingThumbnail.js'

type SettingImageResult = NonNullable<Awaited<ReturnType<typeof bridge.getSettingImage>>>
type SettingCardStyle = Awaited<ReturnType<typeof bridge.listSettingCardStyles>>[number]
type SettingCardCandidate = Awaited<ReturnType<typeof bridge.designSettingCard>>['candidate']
type SettingCardSize = SettingCardCandidate['size']
type SettingCardTemplate = SettingCardCandidate['template']

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

export function SettingCardMediaPanel({
  root,
  document,
  dirty,
  onSave,
  onReloadDocument,
  onReloadProject,
  language
}: {
  root: string
  document: DocEntry
  dirty: boolean
  onSave: () => Promise<void>
  onReloadDocument: () => Promise<void>
  onReloadProject: () => Promise<void>
  language: LanguageName
}) {
  const zh = language === 'zh'
  const type = String(document.data.type)
  const [image, setImage] = useState<SettingImageResult | null>(null)
  const [designerOpen, setDesignerOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    void bridge
      .getSettingImage(root, document.data.id)
      .then((result) => {
        if (active) setImage(result)
      })
      .catch((cause) => {
        if (active) setError(formatDesktopError(cause, language))
      })
    return () => {
      active = false
    }
  }, [document.data.id, language, root])

  if (!SETTING_IMAGE_TYPES.has(type)) return null

  const refresh = async () => {
    await onReloadProject()
    await onReloadDocument()
    setImage(await bridge.getSettingImage(root, document.data.id))
  }
  const chooseImage = async () => {
    setBusy(true)
    setError('')
    try {
      if (dirty) await onSave()
      const result = await bridge.chooseSettingImage(root, document.path, String(document.data.title))
      if (result) {
        setImage(result)
        await refresh()
      }
    } catch (cause) {
      setError(formatDesktopError(cause, language))
    } finally {
      setBusy(false)
    }
  }
  const removeImage = async () => {
    if (
      !window.confirm(
        zh
          ? '移除这张卡片当前使用的图片？原资源文件会保留以便恢复。'
          : 'Remove the image from this card? Existing asset files are retained for recovery.'
      )
    )
      return
    setBusy(true)
    setError('')
    try {
      if (dirty) await onSave()
      await bridge.removeSettingImage(root, document.path)
      setImage(null)
      await refresh()
    } catch (cause) {
      setError(formatDesktopError(cause, language))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="setting-media-panel">
      <div className="setting-media-preview">
        <SettingThumbnail preview={image} title={String(document.data.title)} type={type} />
        {!image && type !== 'faction' && (
          <div className="setting-media-empty">
            <ImagePlus size={22} />
            <span>{zh ? '尚未上传图片' : 'No image yet'}</span>
          </div>
        )}
      </div>
      <div className="setting-media-copy">
        <strong>
          {type === 'faction' ? (zh ? '势力标志' : 'Faction emblem') : zh ? '设定图片' : 'Setting image'}
        </strong>
        <small>
          {zh
            ? '原图与缩略图保存在项目 assets/settings 中；项目文档只记录相对路径。'
            : 'The original and thumbnail live under project assets/settings; the document stores relative paths only.'}
        </small>
        {image?.warning && <span className="warning-text">{image.warning}</span>}
        {error && (
          <span className="warning-text" role="alert">
            {error}
          </span>
        )}
        <div className="setting-media-actions">
          <button type="button" onClick={() => void chooseImage()} disabled={busy}>
            <ImagePlus size={14} /> {image ? (zh ? '替换图片' : 'Replace') : zh ? '上传图片' : 'Upload'}
          </button>
          {image && (
            <button type="button" onClick={() => void removeImage()} disabled={busy}>
              <Trash2 size={14} /> {zh ? '移除' : 'Remove'}
            </button>
          )}
          {SETTING_CARD_TYPES.has(type) && (
            <button className="primary" type="button" onClick={() => setDesignerOpen(true)} disabled={busy}>
              <Bot size={14} /> {zh ? '创建设定卡' : 'Design card'}
            </button>
          )}
        </div>
      </div>
      {designerOpen && (
        <SettingCardDesigner
          root={root}
          document={document}
          imageDataUrl={image?.previewDataUrl ?? null}
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
  imageDataUrl,
  language,
  onClose
}: {
  root: string
  document: DocEntry
  imageDataUrl: string | null
  language: LanguageName
  onClose: () => void
}) {
  const zh = language === 'zh'
  const documentType = String(document.data.type) as
    'world_entry' | 'character' | 'location' | 'character_relation'
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
      image_data_url: imageDataUrl
    }),
    [document.content, document.data, documentType, imageDataUrl]
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
