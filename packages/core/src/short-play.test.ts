import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  applyShortPlayAssetProposals,
  buildShortPlayExportPackage,
  createCharacter,
  createItem,
  createLocation,
  createOutline,
  createProjectAt,
  createScene,
  listDocs,
  listShortPlayAssets,
  loadSceneStoryboard,
  loadShortPlaySettings,
  projectDefaultsForRole,
  proposeSceneStoryboard,
  proposeShortPlayAssetsFromWorldbook,
  reconcileShortPlayAssetBySeedId,
  reorderSceneStoryboardShots,
  saveSceneStoryboard,
  saveShortPlayAsset,
  saveShortPlaySettings,
  updateWorkCapabilitySwitches
} from './index.js'

const tempDirs: string[] = []

async function makeTempProject(rolePreset: 'ai_screenwriter' | 'traditional_writer' = 'ai_screenwriter') {
  const root = await mkdtemp(path.join(os.tmpdir(), 'quillarium-short-play-'))
  tempDirs.push(root)
  const defaults = projectDefaultsForRole(rolePreset)
  await createProjectAt(root, {
    id: 'short-play-demo',
    title: '潮汐短剧',
    ...defaults
  })
  return root
}

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!
    await rm(dir, { recursive: true, force: true })
  }
})

describe('short-play (ST-12, ST-13, ST-14, IO-8, CAP-7)', () => {
  it('stores settings, assets, and storyboards under short-play/ without polluting listDocs', async () => {
    const root = await makeTempProject('ai_screenwriter')

    const settings = await saveShortPlaySettings(root, {
      default_episode_duration_sec: 100,
      default_shot_duration_sec: 10,
      aspect_ratio: '9:16',
      chapter_episode_mapping: 'one-chapter-multi-episode',
      visual_style_preset: '冷峻电影感，高对比度霓虹雨夜',
      pacing_notes: '前3秒强冲突钩子，结尾留悬念',
      episodes: [
        {
          episode_id: 'ep-1',
          episode_number: 1,
          title: '第一集：雨夜来客',
          chapter_ids: ['chapter-1'],
          scene_ids: ['scene-1'],
          target_duration_sec: 95,
          hook_note: '开场匕首钉在海图上',
          ending_cliffhanger: '神秘来客摘下面具'
        }
      ]
    })

    expect(settings.default_episode_duration_sec).toBe(100)
    const reloaded = await loadShortPlaySettings(root)
    expect(reloaded.episodes).toHaveLength(1)
    expect(reloaded.episodes[0]?.title).toBe('第一集：雨夜来客')

    const asset = await saveShortPlayAsset(root, {
      category: 'character',
      title: '林澜',
      prompt: '青年水手，深蓝风衣，左眉细疤，冷峻眼神'
    })
    expect(asset.seed_id).toMatch(/^seed-character-/u)
    expect(asset.path).toMatch(/^short-play\/assets\//u)

    const allDocs = await listDocs(root)
    expect(allDocs.some((doc) => doc.path.includes('short-play'))).toBe(false)
  })

  it('proposes assets from worldbook without writing to disk until confirmed, and reconciles by seed_id (ST-13)', async () => {
    const root = await makeTempProject('ai_screenwriter')
    await createCharacter(root, '林澜', { id: 'char-lin', desire: '守住灯塔' }, '身穿旧海魂衫的守塔人。')
    await createLocation(root, '断崖灯塔', { id: 'loc-tower', description: '矗立在礁石上的石砌灯塔。' })
    await createItem(root, '青铜罗盘', {
      id: 'item-compass',
      description: '刻度逆行的古旧罗盘',
      important: true
    })

    const proposals = await proposeShortPlayAssetsFromWorldbook(root)
    expect(proposals.length).toBeGreaterThanOrEqual(4)
    expect(await listShortPlayAssets(root)).toHaveLength(0)

    const saved = await applyShortPlayAssetProposals(root, proposals)
    expect(saved.length).toBe(proposals.length)

    const targetSeed = saved[0]!.seed_id
    const reconciled = await reconcileShortPlayAssetBySeedId(
      root,
      targetSeed,
      'external://midjourney/job-987654'
    )
    expect(reconciled.external_result_status).toBe('reconciled')
    expect(reconciled.external_result_ref).toBe('external://midjourney/job-987654')
  })

  it('splits a scene into 5-15s storyboard shots, validates duration bounds, and supports reordering (ST-14)', async () => {
    const root = await makeTempProject('ai_screenwriter')
    await createCharacter(root, '林澜', { id: 'char-lin' }, '守塔青年')
    await createLocation(root, '断崖灯塔', { id: 'loc-tower', description: '海边高塔' })
    await saveShortPlayAsset(root, {
      category: 'character',
      title: '林澜',
      linked_doc_id: 'char-lin',
      prompt: '守塔青年三视图'
    })

    await createOutline(root, 'book', '潮汐短剧总纲', { id: 'book-1', order: 0 })
    await createOutline(root, 'volume', '第一卷', { id: 'vol-1', parent: 'book-1', order: 1 })
    await createOutline(root, 'chapter', '第一章', { id: 'chap-1', parent: 'vol-1', order: 1 })
    await createScene(
      root,
      '灯塔夜警',
      {
        id: 'scene-1',
        chapter_id: 'chap-1',
        order: 1,
        location: 'loc-tower',
        characters: ['char-lin'],
        scene_goal: '林澜在暴风雨中发现异常信标'
      },
      '暴雨拍打着灯塔玻璃，林澜推开铁门走向露台。\n\n远海黑浪中突然亮起一盏幽绿色的信号灯。\n\n林澜握紧栏杆：“那不是商船的航道！”'
    )

    const proposal = await proposeSceneStoryboard(root, 'scene-1', {
      shotDurationSec: 8,
      targetTotalDurationSec: 40
    })
    expect(proposal.shots.length).toBeGreaterThanOrEqual(3)
    for (const shot of proposal.shots) {
      expect(shot.duration_sec).toBeGreaterThanOrEqual(5)
      expect(shot.duration_sec).toBeLessThanOrEqual(15)
      expect(shot.asset_seed_ids.length).toBeGreaterThan(0)
    }
    expect(await loadSceneStoryboard(root, 'scene-1')).toBeNull()

    const saved = await saveSceneStoryboard(root, {
      scene_id: 'scene-1',
      chapter_id: 'chap-1',
      episode_id: 'ep-1',
      target_total_duration_sec: proposal.target_total_duration_sec,
      notes: '注意雨夜反光',
      shots: proposal.shots
    })
    expect(saved.shots).toHaveLength(proposal.shots.length)

    const reversedIds = [...saved.shots].reverse().map((shot) => shot.id)
    const reordered = await reorderSceneStoryboardShots(root, 'scene-1', reversedIds)
    expect(reordered.shots.map((shot) => shot.id)).toEqual(reversedIds)
    expect(reordered.shots.map((shot) => shot.order)).toEqual(reversedIds.map((_, index) => index + 1))

    await expect(
      saveSceneStoryboard(root, {
        scene_id: 'scene-1',
        chapter_id: 'chap-1',
        episode_id: 'ep-1',
        target_total_duration_sec: 20,
        notes: '',
        shots: [
          {
            id: 'bad-shot',
            order: 1,
            duration_sec: 25,
            shot_size: '特写',
            camera_movement: '固定',
            asset_seed_ids: [],
            action_description: '超时镜头',
            dialogue: '',
            shot_prompt: '超时镜头提示词'
          }
        ]
      })
    ).rejects.toThrow(/5–15 秒/u)
  })

  it('exports asset prompts with seed_id and ordered storyboard prompts, and blocks export when short_drama_export is off (IO-8, CAP-7)', async () => {
    const root = await makeTempProject('ai_screenwriter')
    const asset = await saveShortPlayAsset(root, {
      category: 'character',
      title: '林澜',
      prompt: '深蓝风衣水手三视图'
    })
    await createOutline(root, 'book', '潮汐短剧总纲', { id: 'book-1', order: 0 })
    await createOutline(root, 'volume', '第一卷', { id: 'vol-1', parent: 'book-1', order: 1 })
    await createOutline(root, 'chapter', '第一章', { id: 'chap-1', parent: 'vol-1', order: 1 })
    await createScene(root, '第一场', {
      id: 'scene-1',
      chapter_id: 'chap-1',
      order: 1
    })
    await saveSceneStoryboard(root, {
      scene_id: 'scene-1',
      chapter_id: 'chap-1',
      episode_id: 'ep-1',
      target_total_duration_sec: 16,
      notes: '',
      shots: [
        {
          id: 'shot-1',
          order: 1,
          duration_sec: 8,
          shot_size: '全景',
          camera_movement: '推镜',
          asset_seed_ids: [asset.seed_id],
          action_description: '林澜立于甲板',
          dialogue: '起风了。',
          shot_prompt: '全景推镜，林澜立于甲板'
        }
      ]
    })

    const exported = await buildShortPlayExportPackage(root)
    expect(exported.asset_prompts).toHaveLength(1)
    expect(exported.asset_prompts[0]?.seed_id).toBe(asset.seed_id)
    expect(exported.storyboard_prompts).toHaveLength(1)
    expect(exported.markdown).toContain(asset.seed_id)
    expect(exported.markdown).toContain('全景推镜，林澜立于甲板')

    await updateWorkCapabilitySwitches(root, { short_drama_export: false })
    await expect(buildShortPlayExportPackage(root)).rejects.toThrow(/SHORT_DRAMA_EXPORT_DISABLED/u)
  })
})
