import { useEffect, useMemo, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Clapperboard,
  Copy,
  Download,
  Film,
  Layers,
  Plus,
  Sparkles,
  Trash2
} from 'lucide-react'
import type {
  ShortPlayAssetCategory,
  ShortPlayAssetProposalV1,
  ShortPlayAssetV1,
  ShortPlayEpisodeSettingV1,
  ShortPlayExportPackageV1,
  ShortPlaySceneStoryboardV1,
  ShortPlaySettingsV1,
  ShortPlayShotV1,
  ShortPlayStoryboardProposalV1
} from '@quillarium/core'
import { bridge } from '../../app/bridge.js'
import type { DocEntry, LanguageName } from '../../app/types.js'
import { formatDesktopError } from '../../shared/errors.js'

export type ShortPlaySubTab = 'settings' | 'assets' | 'storyboard' | 'export'

const ASSET_CATEGORY_LABELS: Record<ShortPlayAssetCategory, { zh: string; en: string }> = {
  character: { zh: '人物外观', en: 'Character' },
  costume: { zh: '服装造型', en: 'Costume' },
  architecture: { zh: '建筑场景', en: 'Architecture' },
  style: { zh: '画风设定', en: 'Visual style' },
  prop: { zh: '核心道具', en: 'Prop' }
}

export function ShortPlayWorkspace({
  root,
  data,
  language,
  activeSceneId,
  onSelectScene
}: {
  root: string
  data: { docs: DocEntry[] }
  language: LanguageName
  activeSceneId?: string | null
  onSelectScene?: (sceneId: string) => void
}) {
  const zh = language === 'zh'
  const [subTab, setSubTab] = useState<ShortPlaySubTab>('settings')
  const [settings, setSettings] = useState<ShortPlaySettingsV1 | null>(null)
  const [assets, setAssets] = useState<ShortPlayAssetV1[]>([])
  const [assetProposals, setAssetProposals] = useState<ShortPlayAssetProposalV1[]>([])
  const [selectedProposalIds, setSelectedProposalIds] = useState<string[]>([])
  const [assetFilter, setAssetFilter] = useState<ShortPlayAssetCategory | 'all'>('all')
  const [editingAsset, setEditingAsset] = useState<{
    id?: string
    seed_id: string
    category: ShortPlayAssetCategory
    title: string
    linked_doc_id: string
    prompt: string
  }>({
    seed_id: '',
    category: 'character',
    title: '',
    linked_doc_id: '',
    prompt: ''
  })
  const [reconcileSeedId, setReconcileSeedId] = useState('')
  const [reconcileRef, setReconcileRef] = useState('')

  const scenes = useMemo(
    () =>
      data.docs
        .filter((doc: DocEntry) => doc.data.type === 'scene')
        .sort((a: DocEntry, b: DocEntry) => (Number(a.data.order) || 0) - (Number(b.data.order) || 0)),
    [data.docs]
  )
  const chapters = useMemo(
    () =>
      data.docs
        .filter((doc: DocEntry) => doc.data.type === 'outline' && doc.data.level === 'chapter')
        .sort((a: DocEntry, b: DocEntry) => (Number(a.data.order) || 0) - (Number(b.data.order) || 0)),
    [data.docs]
  )

  const [selectedSceneId, setSelectedSceneId] = useState<string>(activeSceneId || scenes[0]?.data.id || '')
  const [storyboard, setStoryboard] = useState<ShortPlaySceneStoryboardV1 | null>(null)
  const [storyboardProposal, setStoryboardProposal] = useState<ShortPlayStoryboardProposalV1 | null>(null)
  const [shotDurationInput, setShotDurationInput] = useState(8)
  const [exportPreview, setExportPreview] = useState<ShortPlayExportPackageV1 | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)

  useEffect(() => {
    if (activeSceneId && activeSceneId !== selectedSceneId) {
      setSelectedSceneId(activeSceneId)
    } else if (!selectedSceneId && scenes[0]?.data.id) {
      setSelectedSceneId(scenes[0].data.id)
    }
  }, [activeSceneId, scenes, selectedSceneId])

  useEffect(() => {
    let cancelled = false
    async function loadInitial() {
      try {
        const [loadedSettings, loadedAssets] = await Promise.all([
          bridge.loadShortPlaySettings?.(root),
          bridge.listShortPlayAssets?.(root)
        ])
        if (cancelled) return
        if (loadedSettings) {
          setSettings(loadedSettings)
          setShotDurationInput(loadedSettings.default_shot_duration_sec || 8)
        }
        if (loadedAssets) setAssets(loadedAssets)
      } catch (err) {
        if (!cancelled) {
          setNotice({ tone: 'danger', text: formatDesktopError(err, language) })
        }
      }
    }
    void loadInitial()
    return () => {
      cancelled = true
    }
  }, [root, language])

  useEffect(() => {
    if (!selectedSceneId) {
      setStoryboard(null)
      return
    }
    let cancelled = false
    async function fetchStoryboard() {
      try {
        const loaded = await bridge.loadSceneStoryboard?.(root, selectedSceneId)
        if (!cancelled) {
          setStoryboard(loaded ?? null)
          setStoryboardProposal(null)
        }
      } catch (err) {
        if (!cancelled) {
          setNotice({ tone: 'danger', text: formatDesktopError(err, language) })
        }
      }
    }
    void fetchStoryboard()
    return () => {
      cancelled = true
    }
  }, [root, selectedSceneId])

  async function handleSaveSettings() {
    if (!settings) return
    setBusy(true)
    setNotice(null)
    try {
      const saved = await bridge.saveShortPlaySettings(root, settings)
      setSettings(saved)
      setNotice({
        tone: 'success',
        text: zh ? '已保存剧本设定（short-play/settings.yaml）。' : 'Saved short-play settings.'
      })
    } catch (err) {
      setNotice({ tone: 'danger', text: formatDesktopError(err, language) })
    } finally {
      setBusy(false)
    }
  }

  function handleAddEpisode() {
    if (!settings) return
    const nextNum = settings.episodes.length + 1
    const nextEp: ShortPlayEpisodeSettingV1 = {
      episode_id: `ep-${nextNum}`,
      episode_number: nextNum,
      title: zh ? `第 ${nextNum} 集` : `Episode ${nextNum}`,
      chapter_ids: chapters[nextNum - 1] ? [chapters[nextNum - 1]!.data.id] : [],
      scene_ids: [],
      target_duration_sec: settings.default_episode_duration_sec,
      hook_note: '',
      ending_cliffhanger: ''
    }
    setSettings({ ...settings, episodes: [...settings.episodes, nextEp] })
  }

  async function handleSaveAsset() {
    if (!editingAsset.title.trim() || !editingAsset.prompt.trim()) {
      setNotice({
        tone: 'danger',
        text: zh ? '请填写资产名称与资产提示词。' : 'Asset title and prompt are required.'
      })
      return
    }
    setBusy(true)
    setNotice(null)
    try {
      await bridge.saveShortPlayAsset(root, {
        id: editingAsset.id,
        seed_id: editingAsset.seed_id.trim() || undefined,
        category: editingAsset.category,
        title: editingAsset.title.trim(),
        linked_doc_id: editingAsset.linked_doc_id.trim() || undefined,
        prompt: editingAsset.prompt.trim()
      })
      const refreshed = await bridge.listShortPlayAssets(root)
      setAssets(refreshed)
      setEditingAsset({
        seed_id: '',
        category: editingAsset.category,
        title: '',
        linked_doc_id: '',
        prompt: ''
      })
      setNotice({
        tone: 'success',
        text: zh ? '资产提示词已保存至 short-play/assets/。' : 'Asset prompt saved.'
      })
    } catch (err) {
      setNotice({ tone: 'danger', text: formatDesktopError(err, language) })
    } finally {
      setBusy(false)
    }
  }

  async function handleDeleteAsset(assetId: string) {
    setBusy(true)
    setNotice(null)
    try {
      await bridge.deleteShortPlayAsset(root, assetId)
      setAssets(await bridge.listShortPlayAssets(root))
    } catch (err) {
      setNotice({ tone: 'danger', text: formatDesktopError(err, language) })
    } finally {
      setBusy(false)
    }
  }

  async function handleProposeAssetsFromWorldbook() {
    setBusy(true)
    setNotice(null)
    try {
      const proposals = await bridge.proposeShortPlayAssets(root)
      setAssetProposals(proposals)
      setSelectedProposalIds(proposals.map((item) => item.proposal_id))
      if (proposals.length === 0) {
        setNotice({
          tone: 'success',
          text: zh
            ? '当前世界书中的人物、地点、物品均已生成过对应剧本资产。'
            : 'All worldbook cards already have matching short-play assets.'
        })
      }
    } catch (err) {
      setNotice({ tone: 'danger', text: formatDesktopError(err, language) })
    } finally {
      setBusy(false)
    }
  }

  async function handleConfirmAssetProposals() {
    const chosen = assetProposals.filter((item) => selectedProposalIds.includes(item.proposal_id))
    if (chosen.length === 0) return
    setBusy(true)
    setNotice(null)
    try {
      await bridge.applyShortPlayAssetProposals(root, chosen)
      setAssets(await bridge.listShortPlayAssets(root))
      setAssetProposals([])
      setSelectedProposalIds([])
      setNotice({
        tone: 'success',
        text: zh
          ? `已确认并写入 ${chosen.length} 条剧本资产。`
          : `Confirmed and saved ${chosen.length} short-play assets.`
      })
    } catch (err) {
      setNotice({ tone: 'danger', text: formatDesktopError(err, language) })
    } finally {
      setBusy(false)
    }
  }

  async function handleReconcileSeed() {
    if (!reconcileSeedId.trim() || !reconcileRef.trim()) {
      setNotice({
        tone: 'danger',
        text: zh ? '请填写种子 ID（Seed ID）与外部结果标识。' : 'Seed ID and external reference are required.'
      })
      return
    }
    setBusy(true)
    setNotice(null)
    try {
      const updated = await bridge.reconcileShortPlayAssetBySeed(
        root,
        reconcileSeedId.trim(),
        reconcileRef.trim()
      )
      setAssets(await bridge.listShortPlayAssets(root))
      setReconcileSeedId('')
      setReconcileRef('')
      setNotice({
        tone: 'success',
        text: zh
          ? `已按种子 ID「${updated.seed_id}」对回本地资产「${updated.title}」。`
          : `Reconciled asset "${updated.title}" by seed ID "${updated.seed_id}".`
      })
    } catch (err) {
      setNotice({ tone: 'danger', text: formatDesktopError(err, language) })
    } finally {
      setBusy(false)
    }
  }

  async function handleProposeStoryboard() {
    if (!selectedSceneId) return
    setBusy(true)
    setNotice(null)
    try {
      const proposal = await bridge.proposeSceneStoryboard(root, selectedSceneId, {
        shotDurationSec: shotDurationInput,
        targetTotalDurationSec: settings?.default_episode_duration_sec ?? 90
      })
      setStoryboardProposal(proposal)
      setNotice({
        tone: 'success',
        text: zh
          ? `已按 5–15 秒规范生成 ${proposal.shots.length} 个分镜提案，请审阅确认后保存。`
          : `Generated ${proposal.shots.length} shot proposals (5–15s each). Review and confirm to save.`
      })
    } catch (err) {
      setNotice({ tone: 'danger', text: formatDesktopError(err, language) })
    } finally {
      setBusy(false)
    }
  }

  async function handleAcceptStoryboardProposal() {
    if (!storyboardProposal) return
    setBusy(true)
    setNotice(null)
    try {
      const saved = await bridge.saveSceneStoryboard(root, {
        scene_id: storyboardProposal.scene_id,
        chapter_id: storyboardProposal.chapter_id,
        episode_id: storyboard?.episode_id ?? 'ep-1',
        target_total_duration_sec: storyboardProposal.target_total_duration_sec,
        notes: storyboard?.notes ?? '',
        shots: storyboardProposal.shots
      })
      setStoryboard(saved)
      setStoryboardProposal(null)
      setNotice({
        tone: 'success',
        text: zh ? '已确认并保存分镜至 short-play/storyboards/。' : 'Confirmed and saved storyboard.'
      })
    } catch (err) {
      setNotice({ tone: 'danger', text: formatDesktopError(err, language) })
    } finally {
      setBusy(false)
    }
  }

  async function handleSaveStoryboard() {
    if (!storyboard) return
    setBusy(true)
    setNotice(null)
    try {
      const saved = await bridge.saveSceneStoryboard(root, {
        scene_id: storyboard.scene_id,
        chapter_id: storyboard.chapter_id,
        episode_id: storyboard.episode_id,
        target_total_duration_sec: storyboard.target_total_duration_sec,
        notes: storyboard.notes,
        shots: storyboard.shots
      })
      setStoryboard(saved)
      setNotice({
        tone: 'success',
        text: zh ? '已保存分镜修改。' : 'Saved storyboard changes.'
      })
    } catch (err) {
      setNotice({ tone: 'danger', text: formatDesktopError(err, language) })
    } finally {
      setBusy(false)
    }
  }

  function handleMoveShot(index: number, direction: -1 | 1) {
    if (!storyboard) return
    const targetIndex = index + direction
    if (targetIndex < 0 || targetIndex >= storyboard.shots.length) return
    const nextShots = [...storyboard.shots]
    const [moved] = nextShots.splice(index, 1)
    if (!moved) return
    nextShots.splice(targetIndex, 0, moved)
    setStoryboard({
      ...storyboard,
      shots: nextShots.map((shot, idx) => ({ ...shot, order: idx + 1 }))
    })
  }

  function handleAddShot() {
    const activeScene = scenes.find((item) => item.data.id === selectedSceneId)
    const baseBoard: ShortPlaySceneStoryboardV1 = storyboard ?? {
      schema_version: 1,
      scene_id: selectedSceneId,
      chapter_id: String(activeScene?.data.chapter_id ?? ''),
      episode_id: 'ep-1',
      target_total_duration_sec: settings?.default_episode_duration_sec ?? 90,
      notes: '',
      shots: []
    }
    const nextOrder = baseBoard.shots.length + 1
    const newShot: ShortPlayShotV1 = {
      id: `${selectedSceneId}-shot-${nextOrder}`,
      order: nextOrder,
      duration_sec: Math.min(15, Math.max(5, shotDurationInput || 8)),
      shot_size: '中景',
      camera_movement: '固定',
      asset_seed_ids: [],
      action_description: '',
      dialogue: '',
      shot_prompt: zh ? `镜头 #${nextOrder} 提示词` : `Shot #${nextOrder} prompt`
    }
    setStoryboard({
      ...baseBoard,
      shots: [...baseBoard.shots, newShot]
    })
  }

  async function handleRefreshExportPreview() {
    setBusy(true)
    setNotice(null)
    try {
      const pkg = await bridge.previewShortPlayExport(root)
      setExportPreview(pkg)
    } catch (err) {
      setNotice({ tone: 'danger', text: formatDesktopError(err, language) })
    } finally {
      setBusy(false)
    }
  }

  async function handleExportFile(format: 'markdown' | 'json') {
    setBusy(true)
    setNotice(null)
    try {
      const res = await bridge.exportShortPlayToFile(root, format)
      if (res) {
        setNotice({
          tone: 'success',
          text: zh
            ? `已导出 ${res.assetCount} 条资产提示词与 ${res.shotCount} 条分镜提示词至：${res.outputPath}`
            : `Exported ${res.assetCount} assets and ${res.shotCount} shots to ${res.outputPath}`
        })
      }
    } catch (err) {
      setNotice({ tone: 'danger', text: formatDesktopError(err, language) })
    } finally {
      setBusy(false)
    }
  }

  const filteredAssets = useMemo(
    () => (assetFilter === 'all' ? assets : assets.filter((item) => item.category === assetFilter)),
    [assets, assetFilter]
  )

  return (
    <div className="short-play-workspace">
      <header className="workspace-panel-header">
        <div>
          <h2>
            <Clapperboard size={18} /> {zh ? '剧本与分镜工作台' : 'Short-Play & Storyboard Studio'}
          </h2>
          <p className="muted">
            {zh
              ? '独立存放于 short-play/ 子目录。本工具只产出带种子 ID 的资产提示词与 5–15 秒分镜提示词，生图和生视频由外部工具完成。'
              : 'Stored in the short-play/ subdirectory. Produces seed-tagged asset prompts and 5–15s storyboard prompts for external tools.'}
          </p>
        </div>
        <div className="icon-segment" role="tablist" aria-label={zh ? '短剧模块切换' : 'Short-play tabs'}>
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'settings'}
            className={subTab === 'settings' ? 'active' : ''}
            onClick={() => setSubTab('settings')}
          >
            <Layers size={14} /> {zh ? '剧本设定' : 'Settings'}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'assets'}
            className={subTab === 'assets' ? 'active' : ''}
            onClick={() => setSubTab('assets')}
          >
            <Sparkles size={14} /> {zh ? `剧本资产 (${assets.length})` : `Assets (${assets.length})`}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'storyboard'}
            className={subTab === 'storyboard' ? 'active' : ''}
            onClick={() => setSubTab('storyboard')}
          >
            <Film size={14} /> {zh ? '分镜拆分' : 'Storyboard'}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'export'}
            className={subTab === 'export' ? 'active' : ''}
            onClick={() => {
              setSubTab('export')
              void handleRefreshExportPreview()
            }}
          >
            <Download size={14} /> {zh ? '提示词导出' : 'Export Prompts'}
          </button>
        </div>
      </header>

      {notice && (
        <div className={notice.tone === 'danger' ? 'error-banner' : 'status-banner'} role="status">
          {notice.text}
        </div>
      )}

      {subTab === 'settings' && settings && (
        <section className="settings-group">
          <div className="settings-section-head">
            <div>
              <h3>{zh ? '作品通用剧本设定（ST-12）' : 'General Short-Play Settings (ST-12)'}</h3>
              <p className="muted">
                {zh
                  ? '定义单集目标时长、单镜头时长（5–15 秒）、画幅比例，以及剧集与章节的对应方式。'
                  : 'Configure episode duration, shot duration (5–15s), aspect ratio, and chapter-to-episode mapping.'}
              </p>
            </div>
            <button
              type="button"
              className="primary"
              disabled={busy}
              onClick={() => void handleSaveSettings()}
            >
              {zh ? '保存剧本设定' : 'Save settings'}
            </button>
          </div>

          <div className="settings-grid two">
            <label>
              {zh ? '默认单集时长（秒）' : 'Default episode duration (sec)'}
              <input
                type="number"
                min={15}
                max={600}
                value={settings.default_episode_duration_sec}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    default_episode_duration_sec: Math.max(15, Math.min(600, Number(e.target.value) || 90))
                  })
                }
              />
              <small>
                {zh ? '一节大约 1000 字，通常对应 60–120 秒镜头。' : 'Typically 60–120 seconds per scene.'}
              </small>
            </label>

            <label>
              {zh ? '默认单镜头时长（5–15 秒）' : 'Default shot duration (5–15 sec)'}
              <input
                type="number"
                min={5}
                max={15}
                value={settings.default_shot_duration_sec}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    default_shot_duration_sec: Math.max(5, Math.min(15, Number(e.target.value) || 8))
                  })
                }
              />
              <small>
                {zh
                  ? '外部 AI 生视频单次时长通常为 5–15 秒。'
                  : 'AI video generators typically produce 5–15s clips.'}
              </small>
            </label>

            <label>
              {zh ? '画幅比例' : 'Aspect ratio'}
              <select
                value={settings.aspect_ratio}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    aspect_ratio: e.target.value as ShortPlaySettingsV1['aspect_ratio']
                  })
                }
              >
                <option value="9:16">9:16（竖屏短剧）</option>
                <option value="16:9">16:9（横屏漫剧/番剧）</option>
                <option value="2.35:1">2.35:1（宽银幕电影）</option>
                <option value="4:3">4:3</option>
                <option value="1:1">1:1</option>
              </select>
            </label>

            <label>
              {zh ? '剧集与章的关系' : 'Chapter to episode mapping'}
              <select
                value={settings.chapter_episode_mapping}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    chapter_episode_mapping: e.target.value as ShortPlaySettingsV1['chapter_episode_mapping']
                  })
                }
              >
                <option value="one-chapter-one-episode">
                  {zh ? '一章对应一集（1 章 = 1 集）' : 'One chapter per episode'}
                </option>
                <option value="one-chapter-multi-episode">
                  {zh ? '一章拆分为多集（按节分集）' : 'Multiple episodes per chapter'}
                </option>
                <option value="multi-chapter-one-episode">
                  {zh ? '多章合并为一集' : 'Multiple chapters per episode'}
                </option>
              </select>
            </label>
          </div>

          <div className="settings-grid two">
            <label>
              {zh ? '全剧统一画风提示词' : 'Global visual style preset'}
              <textarea
                rows={3}
                value={settings.visual_style_preset}
                onChange={(e) => setSettings({ ...settings, visual_style_preset: e.target.value })}
                placeholder={
                  zh
                    ? '例：国风赛博修仙，电影级体积光，冷青与鎏金配色，写实厚涂质感…'
                    : 'e.g., Cinematic lighting, high contrast, realistic textures...'
                }
              />
            </label>
            <label>
              {zh ? '全剧节奏与卡点要求' : 'Pacing & hook notes'}
              <textarea
                rows={3}
                value={settings.pacing_notes}
                onChange={(e) => setSettings({ ...settings, pacing_notes: e.target.value })}
                placeholder={
                  zh
                    ? '例：每集前 3 秒必须出现视觉奇观或正面冲突；结尾 5 秒留悬念反转…'
                    : 'e.g., First 3 seconds hook, ending cliffhanger...'
                }
              />
            </label>
          </div>

          <div className="settings-section-head">
            <div>
              <h4>{zh ? '分集设置（单集时长、章映射与悬念卡点）' : 'Episode-Specific Settings'}</h4>
            </div>
            <button type="button" className="secondary" onClick={handleAddEpisode}>
              <Plus size={14} /> {zh ? '新增一集设置' : 'Add episode'}
            </button>
          </div>

          {settings.episodes.length === 0 ? (
            <p className="muted">
              {zh
                ? '尚未添加单集覆盖设置，点击右上角「新增一集设置」可按集定制。'
                : 'No per-episode settings yet.'}
            </p>
          ) : (
            <div className="short-play-episode-list">
              {settings.episodes.map((ep, idx) => (
                <div key={ep.episode_id} className="settings-group">
                  <div className="settings-grid two">
                    <label>
                      {zh ? `第 ${ep.episode_number} 集标题` : `Episode #${ep.episode_number} title`}
                      <input
                        value={ep.title}
                        onChange={(e) => {
                          const next = [...settings.episodes]
                          next[idx] = { ...ep, title: e.target.value }
                          setSettings({ ...settings, episodes: next })
                        }}
                      />
                    </label>
                    <label>
                      {zh ? '本集目标时长（秒）' : 'Target duration (sec)'}
                      <input
                        type="number"
                        min={15}
                        max={600}
                        value={ep.target_duration_sec}
                        onChange={(e) => {
                          const next = [...settings.episodes]
                          next[idx] = {
                            ...ep,
                            target_duration_sec: Math.max(15, Math.min(600, Number(e.target.value) || 90))
                          }
                          setSettings({ ...settings, episodes: next })
                        }}
                      />
                    </label>
                    <label>
                      {zh ? '关联章' : 'Linked chapter'}
                      <select
                        value={ep.chapter_ids[0] ?? ''}
                        onChange={(e) => {
                          const next = [...settings.episodes]
                          next[idx] = {
                            ...ep,
                            chapter_ids: e.target.value ? [e.target.value] : []
                          }
                          setSettings({ ...settings, episodes: next })
                        }}
                      >
                        <option value="">{zh ? '（未指定章）' : '(None)'}</option>
                        {chapters.map((ch) => (
                          <option key={ch.data.id} value={ch.data.id}>
                            {ch.data.title}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      {zh ? '本集开场钩子 / 结尾悬念' : 'Opening hook / Ending cliffhanger'}
                      <input
                        value={ep.hook_note}
                        placeholder={zh ? '开场冲突与结尾留扣…' : 'Opening hook & cliffhanger...'}
                        onChange={(e) => {
                          const next = [...settings.episodes]
                          next[idx] = { ...ep, hook_note: e.target.value }
                          setSettings({ ...settings, episodes: next })
                        }}
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {subTab === 'assets' && (
        <section className="settings-group">
          <div className="settings-section-head">
            <div>
              <h3>{zh ? '剧本资产与种子 ID 管理（ST-13）' : 'Short-Play Assets & Seed IDs (ST-13)'}</h3>
              <p className="muted">
                {zh
                  ? '管理人物、服装、建筑、画风、道具五类资产提示词。每条资产带稳定 Seed ID，外部工具生成后可用 Seed ID 对回本地资产。'
                  : 'Manage character, costume, architecture, style, and prop asset prompts with stable Seed IDs.'}
              </p>
            </div>
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => void handleProposeAssetsFromWorldbook()}
            >
              <Sparkles size={14} /> {zh ? '从世界书生成资产提案' : 'Propose from Worldbook'}
            </button>
          </div>

          {assetProposals.length > 0 && (
            <div className="settings-group proposal-review-box">
              <div className="settings-section-head">
                <strong>
                  {zh
                    ? `待确认的世界书资产提案（共 ${assetProposals.length} 条，确认前不写盘）`
                    : `Pending Worldbook Asset Proposals (${assetProposals.length})`}
                </strong>
                <div className="settings-section-actions">
                  <button type="button" className="secondary" onClick={() => setAssetProposals([])}>
                    {zh ? '取消' : 'Cancel'}
                  </button>
                  <button
                    type="button"
                    className="primary"
                    disabled={busy || selectedProposalIds.length === 0}
                    onClick={() => void handleConfirmAssetProposals()}
                  >
                    {zh
                      ? `确认写入选中提案 (${selectedProposalIds.length})`
                      : `Confirm selected (${selectedProposalIds.length})`}
                  </button>
                </div>
              </div>
              <div className="proposal-list">
                {assetProposals.map((item) => (
                  <label key={item.proposal_id} className="story-structure-option">
                    <input
                      type="checkbox"
                      checked={selectedProposalIds.includes(item.proposal_id)}
                      onChange={(e) =>
                        setSelectedProposalIds((prev) =>
                          e.target.checked
                            ? [...prev, item.proposal_id]
                            : prev.filter((id) => id !== item.proposal_id)
                        )
                      }
                    />
                    <span>
                      <strong>
                        [{ASSET_CATEGORY_LABELS[item.category][zh ? 'zh' : 'en']}] {item.title} ·{' '}
                        <code>{item.seed_id}</code>
                      </strong>
                      <small>{item.prompt}</small>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="settings-grid two">
            <div className="settings-group">
              <h4>{zh ? '新建 / 编辑剧本资产提示词' : 'Create / Edit Asset Prompt'}</h4>
              <div className="settings-grid two">
                <label>
                  {zh ? '资产类别' : 'Category'}
                  <select
                    value={editingAsset.category}
                    onChange={(e) =>
                      setEditingAsset({
                        ...editingAsset,
                        category: e.target.value as ShortPlayAssetCategory
                      })
                    }
                  >
                    {(Object.keys(ASSET_CATEGORY_LABELS) as ShortPlayAssetCategory[]).map((cat) => (
                      <option key={cat} value={cat}>
                        {ASSET_CATEGORY_LABELS[cat][zh ? 'zh' : 'en']}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {zh ? '资产名称' : 'Asset title'}
                  <input
                    value={editingAsset.title}
                    placeholder={zh ? '例：林澜（雨夜战损装）' : 'e.g., Lin Lan (Raincoat)'}
                    onChange={(e) => setEditingAsset({ ...editingAsset, title: e.target.value })}
                  />
                </label>
                <label>
                  {zh ? '本地种子 ID（留空自动生成）' : 'Seed ID (auto-generated if blank)'}
                  <input
                    value={editingAsset.seed_id}
                    placeholder="seed-character-..."
                    onChange={(e) => setEditingAsset({ ...editingAsset, seed_id: e.target.value })}
                  />
                </label>
                <label>
                  {zh ? '关联世界书卡片 ID（可选）' : 'Linked card ID (optional)'}
                  <input
                    value={editingAsset.linked_doc_id}
                    placeholder="char-..."
                    onChange={(e) => setEditingAsset({ ...editingAsset, linked_doc_id: e.target.value })}
                  />
                </label>
              </div>
              <label>
                {zh ? '资产提示词（供外部生图/生视频工具使用）' : 'Asset prompt'}
                <textarea
                  rows={3}
                  value={editingAsset.prompt}
                  placeholder={
                    zh
                      ? '输入外观、服装纹理、建筑结构或画风细节提示词…'
                      : 'Enter visual prompt for external generation tools...'
                  }
                  onChange={(e) => setEditingAsset({ ...editingAsset, prompt: e.target.value })}
                />
              </label>
              <div className="settings-section-actions">
                {editingAsset.id && (
                  <button
                    type="button"
                    className="secondary"
                    onClick={() =>
                      setEditingAsset({
                        seed_id: '',
                        category: 'character',
                        title: '',
                        linked_doc_id: '',
                        prompt: ''
                      })
                    }
                  >
                    {zh ? '取消编辑' : 'Cancel'}
                  </button>
                )}
                <button
                  type="button"
                  className="primary"
                  disabled={busy}
                  onClick={() => void handleSaveAsset()}
                >
                  {editingAsset.id ? (zh ? '更新资产' : 'Update asset') : zh ? '保存资产' : 'Save asset'}
                </button>
              </div>
            </div>

            <div className="settings-group">
              <h4>{zh ? '按种子 ID（Seed ID）对回外部结果' : 'Reconcile External Result by Seed ID'}</h4>
              <p className="muted">
                {zh
                  ? '当外部工具返回结果后，输入提示词携带的 Seed ID 与外部资产标识/路径，自动对回本地资产。'
                  : 'Match an external tool result back to its local asset using the Seed ID.'}
              </p>
              <label>
                {zh ? '种子 ID (Seed ID)' : 'Seed ID'}
                <input
                  value={reconcileSeedId}
                  placeholder="seed-character-..."
                  list="short-play-seed-list"
                  onChange={(e) => setReconcileSeedId(e.target.value)}
                />
                <datalist id="short-play-seed-list">
                  {assets.map((asset) => (
                    <option key={asset.id} value={asset.seed_id}>
                      {asset.title}
                    </option>
                  ))}
                </datalist>
              </label>
              <label>
                {zh ? '外部生成结果标识 / 引用路径' : 'External result reference'}
                <input
                  value={reconcileRef}
                  placeholder="external://asset-id 或文件相对标识"
                  onChange={(e) => setReconcileRef(e.target.value)}
                />
              </label>
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => void handleReconcileSeed()}
              >
                <CheckCircle2 size={14} /> {zh ? '对回本地资产' : 'Reconcile asset'}
              </button>
            </div>
          </div>

          <div className="settings-section-head">
            <div className="icon-segment">
              <button
                type="button"
                className={assetFilter === 'all' ? 'active' : ''}
                onClick={() => setAssetFilter('all')}
              >
                {zh ? `全部 (${assets.length})` : `All (${assets.length})`}
              </button>
              {(Object.keys(ASSET_CATEGORY_LABELS) as ShortPlayAssetCategory[]).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  className={assetFilter === cat ? 'active' : ''}
                  onClick={() => setAssetFilter(cat)}
                >
                  {ASSET_CATEGORY_LABELS[cat][zh ? 'zh' : 'en']}
                </button>
              ))}
            </div>
          </div>

          {filteredAssets.length === 0 ? (
            <p className="muted">{zh ? '当前分类下暂无剧本资产。' : 'No assets in this category.'}</p>
          ) : (
            <div className="short-play-asset-list">
              {filteredAssets.map((asset) => (
                <article key={asset.id} className="settings-group">
                  <div className="settings-section-head">
                    <div>
                      <strong>
                        [{ASSET_CATEGORY_LABELS[asset.category][zh ? 'zh' : 'en']}] {asset.title}
                      </strong>{' '}
                      <code>{asset.seed_id}</code>{' '}
                      <span className="status-pill">
                        {asset.external_result_status === 'reconciled'
                          ? zh
                            ? `已对回：${asset.external_result_ref}`
                            : `Reconciled: ${asset.external_result_ref}`
                          : zh
                            ? '待外部生成'
                            : 'Pending external'}
                      </span>
                    </div>
                    <div className="settings-section-actions">
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => {
                          void navigator.clipboard?.writeText(`[Seed ID: ${asset.seed_id}]\n${asset.prompt}`)
                          setNotice({
                            tone: 'success',
                            text: zh ? `已复制「${asset.title}」提示词与 Seed ID。` : 'Copied asset prompt.'
                          })
                        }}
                      >
                        <Copy size={13} /> {zh ? '复制提示词' : 'Copy'}
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() =>
                          setEditingAsset({
                            id: asset.id,
                            seed_id: asset.seed_id,
                            category: asset.category,
                            title: asset.title,
                            linked_doc_id: asset.linked_doc_id ?? '',
                            prompt: asset.prompt
                          })
                        }
                      >
                        {zh ? '编辑' : 'Edit'}
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => void handleDeleteAsset(asset.id)}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                  <p>{asset.prompt}</p>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {subTab === 'storyboard' && (
        <section className="settings-group">
          <div className="settings-section-head">
            <div>
              <h3>
                {zh
                  ? '分镜拆分（ST-14 · 按节拆分为 5–15 秒镜头序列）'
                  : 'Scene Storyboard (ST-14 · 5–15s Shots)'}
              </h3>
              <p className="muted">
                {zh
                  ? '一节大约 1000 字（约 1–2 分钟），按 5–15 秒的视频生成长度拆分为有序镜头，输出分镜提示词。'
                  : 'Split a scene (~1000 words / 1–2 min) into ordered 5–15s video generation shots.'}
              </p>
            </div>
            <div className="settings-section-actions">
              <select
                aria-label={zh ? '选择要拆分分镜的节' : 'Select scene'}
                value={selectedSceneId}
                onChange={(e) => {
                  setSelectedSceneId(e.target.value)
                  onSelectScene?.(e.target.value)
                }}
              >
                {scenes.length === 0 && (
                  <option value="">{zh ? '（当前作品暂无节）' : '(No scenes yet)'}</option>
                )}
                {scenes.map((scene) => (
                  <option key={scene.data.id} value={scene.data.id}>
                    {scene.data.title} ({scene.data.id})
                  </option>
                ))}
              </select>
              <label className="inline-number-field">
                {zh ? '单镜头秒数' : 'Sec/shot'}
                <input
                  type="number"
                  min={5}
                  max={15}
                  value={shotDurationInput}
                  onChange={(e) =>
                    setShotDurationInput(Math.max(5, Math.min(15, Number(e.target.value) || 8)))
                  }
                />
              </label>
              <button
                type="button"
                className="secondary"
                disabled={busy || !selectedSceneId}
                onClick={() => void handleProposeStoryboard()}
              >
                <Sparkles size={14} /> {zh ? '按本节生成分镜提案' : 'Propose shots from scene'}
              </button>
              <button
                type="button"
                className="secondary"
                disabled={busy || !selectedSceneId}
                onClick={handleAddShot}
              >
                <Plus size={14} /> {zh ? '手动加镜头' : 'Add shot'}
              </button>
              {storyboard && (
                <button
                  type="button"
                  className="primary"
                  disabled={busy}
                  onClick={() => void handleSaveStoryboard()}
                >
                  {zh ? '保存分镜' : 'Save storyboard'}
                </button>
              )}
            </div>
          </div>

          {storyboardProposal && (
            <div className="settings-group proposal-review-box">
              <div className="settings-section-head">
                <strong>
                  {zh
                    ? `分镜拆分提案：${storyboardProposal.scene_title}（共 ${storyboardProposal.shots.length} 镜，合计 ${storyboardProposal.target_total_duration_sec} 秒，确认后写盘）`
                    : `Storyboard Proposal: ${storyboardProposal.scene_title} (${storyboardProposal.shots.length} shots)`}
                </strong>
                <div className="settings-section-actions">
                  <button type="button" className="secondary" onClick={() => setStoryboardProposal(null)}>
                    {zh ? '放弃提案' : 'Discard'}
                  </button>
                  <button
                    type="button"
                    className="primary"
                    disabled={busy}
                    onClick={() => void handleAcceptStoryboardProposal()}
                  >
                    {zh ? '确认采纳并保存分镜' : 'Accept & Save Storyboard'}
                  </button>
                </div>
              </div>
              {storyboardProposal.shots.map((shot) => (
                <div key={shot.id} className="proposal-shot-row">
                  <strong>
                    #{shot.order} ({shot.duration_sec}s · {shot.shot_size} · {shot.camera_movement})
                  </strong>
                  <p>{shot.shot_prompt}</p>
                </div>
              ))}
            </div>
          )}

          {!storyboard || storyboard.shots.length === 0 ? (
            <p className="muted">
              {zh
                ? '当前节尚未保存分镜。可点击上方「按本节生成分镜提案」或「手动加镜头」。'
                : 'No saved shots for this scene yet.'}
            </p>
          ) : (
            <div className="short-play-shot-list">
              {storyboard.shots.map((shot, idx) => (
                <article key={shot.id} className="settings-group">
                  <div className="settings-section-head">
                    <strong>
                      {zh
                        ? `镜头 #${shot.order}（${shot.duration_sec} 秒）`
                        : `Shot #${shot.order} (${shot.duration_sec}s)`}
                    </strong>
                    <div className="settings-section-actions">
                      <button
                        type="button"
                        className="secondary"
                        disabled={idx === 0}
                        onClick={() => handleMoveShot(idx, -1)}
                        title={zh ? '上移镜头' : 'Move up'}
                      >
                        <ArrowUp size={13} />
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        disabled={idx === storyboard.shots.length - 1}
                        onClick={() => handleMoveShot(idx, 1)}
                        title={zh ? '下移镜头' : 'Move down'}
                      >
                        <ArrowDown size={13} />
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => {
                          const nextShots = storyboard.shots
                            .filter((_, i) => i !== idx)
                            .map((item, i) => ({ ...item, order: i + 1 }))
                          setStoryboard({ ...storyboard, shots: nextShots })
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  <div className="settings-grid two">
                    <label>
                      {zh ? '时长（5–15 秒）' : 'Duration (5–15s)'}
                      <input
                        type="number"
                        min={5}
                        max={15}
                        value={shot.duration_sec}
                        onChange={(e) => {
                          const next = [...storyboard.shots]
                          next[idx] = {
                            ...shot,
                            duration_sec: Math.max(5, Math.min(15, Number(e.target.value) || 8))
                          }
                          setStoryboard({ ...storyboard, shots: next })
                        }}
                      />
                    </label>
                    <label>
                      {zh ? '景别 / 运镜' : 'Shot size / Camera movement'}
                      <div className="settings-grid two">
                        <input
                          value={shot.shot_size}
                          placeholder={zh ? '景别（中景/特写/全景）' : 'Shot size'}
                          onChange={(e) => {
                            const next = [...storyboard.shots]
                            next[idx] = { ...shot, shot_size: e.target.value }
                            setStoryboard({ ...storyboard, shots: next })
                          }}
                        />
                        <input
                          value={shot.camera_movement}
                          placeholder={zh ? '运镜（固定/推镜/跟拍）' : 'Camera movement'}
                          onChange={(e) => {
                            const next = [...storyboard.shots]
                            next[idx] = { ...shot, camera_movement: e.target.value }
                            setStoryboard({ ...storyboard, shots: next })
                          }}
                        />
                      </div>
                    </label>
                    <label>
                      {zh ? '画面动作描述' : 'Action description'}
                      <input
                        value={shot.action_description}
                        onChange={(e) => {
                          const next = [...storyboard.shots]
                          next[idx] = { ...shot, action_description: e.target.value }
                          setStoryboard({ ...storyboard, shots: next })
                        }}
                      />
                    </label>
                    <label>
                      {zh ? '角色台词 / 旁白' : 'Dialogue / Voiceover'}
                      <input
                        value={shot.dialogue}
                        onChange={(e) => {
                          const next = [...storyboard.shots]
                          next[idx] = { ...shot, dialogue: e.target.value }
                          setStoryboard({ ...storyboard, shots: next })
                        }}
                      />
                    </label>
                  </div>

                  <label>
                    {zh ? '引用资产 Seed ID（逗号分隔）' : 'Referenced Asset Seed IDs (comma-separated)'}
                    <input
                      value={shot.asset_seed_ids.join(', ')}
                      placeholder="seed-character-..., seed-architecture-..."
                      onChange={(e) => {
                        const next = [...storyboard.shots]
                        next[idx] = {
                          ...shot,
                          asset_seed_ids: e.target.value
                            .split(',')
                            .map((s) => s.trim())
                            .filter(Boolean)
                        }
                        setStoryboard({ ...storyboard, shots: next })
                      }}
                    />
                  </label>

                  <label>
                    {zh ? '分镜生成提示词（交给外部视频生成工具）' : 'Shot generation prompt'}
                    <textarea
                      rows={2}
                      value={shot.shot_prompt}
                      onChange={(e) => {
                        const next = [...storyboard.shots]
                        next[idx] = { ...shot, shot_prompt: e.target.value }
                        setStoryboard({ ...storyboard, shots: next })
                      }}
                    />
                  </label>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {subTab === 'export' && (
        <section className="settings-group">
          <div className="settings-section-head">
            <div>
              <h3>
                {zh ? '短剧提示词导出包（IO-8 / CAP-7）' : 'Short-Play Prompt Export Package (IO-8 / CAP-7)'}
              </h3>
              <p className="muted">
                {zh
                  ? '汇总带本地种子 ID 的资产提示词清单与按章节/镜头顺序排列的 5–15 秒分镜提示词清单。'
                  : 'Bundles seed-tagged asset prompts and ordered 5–15s storyboard shot prompts.'}
              </p>
            </div>
            <div className="settings-section-actions">
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => void handleRefreshExportPreview()}
              >
                {zh ? '刷新预览' : 'Refresh'}
              </button>
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => void handleExportFile('json')}
              >
                <Download size={14} /> {zh ? '导出 JSON' : 'Export JSON'}
              </button>
              <button
                type="button"
                className="primary"
                disabled={busy}
                onClick={() => void handleExportFile('markdown')}
              >
                <Download size={14} /> {zh ? '导出 Markdown' : 'Export Markdown'}
              </button>
            </div>
          </div>

          {exportPreview ? (
            <textarea
              readOnly
              rows={18}
              className="short-play-export-preview"
              value={exportPreview.markdown}
            />
          ) : (
            <p className="muted">{zh ? '正在加载导出预览…' : 'Loading export preview...'}</p>
          )}
        </section>
      )}
    </div>
  )
}
