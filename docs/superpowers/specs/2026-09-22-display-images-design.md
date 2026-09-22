# 展示层配图：上传、画廊与生图 API

Date: 2026-09-22  
Status: approved  
Parent: `docs/superpowers/specs/2026-09-22-display-layer-design.md`  
Scope: 设定卡配图写入 `assets/display/`，不写回设定卡 `image`；本地上传 + 作者主动生图；HTML 卡面 CSS-only 多图轮播。不含 Agent 专家模式围栏、不含改 CCv3、不含改项目封面、不含打开卡片时自动生图。

## 主线

配图是展示层资源，不是世界观事实。上传和生图都落到 `assets/display/<card-id>/`。关掉展示层只藏外壳，不删这些文件。生图只在作者点按钮时调用；适配器对准 OpenAI Images、同形态 openai-compatible、以及 Gemini 生图，请求/响应字段允许随后在适配器里改。

## 已锁定的决策

| 主题 | 选择 |
| ---- | ---- |
| 本轮范围 | 本地上传 + 生图。 |
| 写盘位置 | `assets/display/<card-id>/`，不写 `PlanningCardDoc.image`。 |
| 数量 | 多图画廊。 |
| 卡面 | 改模板：`{{image}}` 当前图，`{{images}}` CSS-only 轮播。继续禁止 script 和事件处理器。 |
| 生图触发 | 作者主动点生成。打开卡片、保存、特化、打开展示层都不调生图 API。 |
| 提示词 | 可改；默认带卡片标题和一段摘录。摘录不写回卡片。 |
| 写盘时机 | 生图先当候选，预览确认后才写入。取消/失败不留文件。上传在选文件成功后写入。 |
| 凭证 | 独立「生图凭证」，与写作 `aiProfiles` 分开。 |
| 生图 API | OpenAI Images、openai-compatible（同 `/v1/images/generations` 形态）、Gemini 生图。Claude / DeepSeek / Ollama 本轮提示不支持。 |
| CLI | 只上传，不生图。 |
| CCv3 / 封面 | 不动。 |

## 存储

`PROJECT_DIRS` 增加 `assets/display`。每张允许配图的卡一个目录：

```text
assets/display/<card-id>/
  manifest.json
  <image-id>.png   # 或 .jpg / .webp
```

`manifest.json`：

```ts
{
  schema_version: 1
  selected_id: string | null
  images: Array<{
    id: string
    file: string
    mime_type: 'image/png' | 'image/jpeg' | 'image/webp'
    alt: string
    source: 'upload' | 'generated'
    created_at: string
  }>
}
```

规则：

- `images` 数组顺序即画廊顺序。
- `selected_id` 必须指向数组中的一项，或在空画廊时为 `null`。
- 核心 API 增、删、选中、读列表。删文件时同步改 manifest。
- 允许的卡类型与展示卡面相同：`world_entry, canon, character, character_relation, location, timeline_event, faction, faction_relation, faction_membership, foreshadowing, narrative`。
- 特化保持同一 `id`，目录跟着走，不用搬。
- 删除设定卡时删除对应 `assets/display/<card-id>/`。
- 关掉 `display_layer.enabled`：UI 不展示、不上传、不生图；磁盘文件保留。

公开函数（实现时可改名，语义不得改）：

```ts
listDisplayImages(projectRoot, cardId): Promise<DisplayImageManifest>
addDisplayImage(projectRoot, cardId, bytes, meta): Promise<DisplayImageManifest>
removeDisplayImage(projectRoot, cardId, imageId): Promise<DisplayImageManifest>
selectDisplayImage(projectRoot, cardId, imageId): Promise<DisplayImageManifest>
```

全部走 `withProjectWriteLock`。不要把路径写进设定卡 frontmatter。

## 卡面渲染

`renderSettingCardHtml`：

- `{{image}}`：当前选中图的 `<img>`；没有选中时保持现在的字母回退。
- `{{images}}`：渲染器生成一组无脚本轮播标记（radio + label + figure），不采用作者模板里手写的 radio。用 CSS `:checked` 显示当前张。内置样式必须带这套 CSS。无图时替换为空字符串。
- `{{images}}` 加入允许占位符。不含 `{{images}}` 的作者模板仍然合法，只是没有轮播、只靠 `{{image}}`。
- 继续拒绝 `<script>`、事件处理器、远程 URL、CSS `@import`。不要为了轮播放开 JS。

预览 iframe 仍是空 sandbox。宿主把画廊 data URL 填进渲染数据，不让模板去读磁盘路径。

## 生图适配器

应用级配置增加独立 profile（与 `aiProfiles.prose/background/check` 并列，不进 `project.yaml`）：

```ts
displayImageProfile?: {
  provider: 'openai' | 'openai-compatible' | 'gemini'
  baseUrl?: string
  apiKey?: string
  apiKeyEncrypted?: string
  model: string
}
```

密钥存储与现有桌面 AI 凭证同一套加密/回退。未配置或 provider 不在上列：中文提示当前生图凭证不支持，不发起 HTTP。

适配器入口一个函数，内部按 provider 分文件，便于改请求体/响应解析：

```ts
generateDisplayImageCandidate(input: {
  prompt: string
  profile: DisplayImageProfile
  signal?: AbortSignal
}): Promise<{ bytes: Uint8Array; mime: 'image/png' | 'image/jpeg' | 'image/webp' }>
```

- OpenAI / openai-compatible：`POST {baseUrl}/images/generations`（默认 baseUrl 与现有文字配置同类官方根路径）。成功后从 `b64_json` 或 URL 取字节；优先 b64，避免再下一次外网。
- Gemini：走该账户的生图接口（Imagen 或 `generateContent` 出图，以适配器实现为准，可改）。
- 超时、取消、`AbortSignal` 与现有文字请求同一纪律。取消不得写盘。

提示词：桌面在点生成前展示可编辑框，默认 `标题` + 卡片正文摘录（截断，不明文复制进设定卡）。API 只收这一条 prompt 字符串。

候选：只在内存（或系统临时文件，进程/会话结束删）。确认后才 `addDisplayImage(..., source: 'generated')`。

## 桌面与 CLI

仅当 `display_layer.migrated && display_layer.enabled` 时显示上传、生图、画廊。未迁移且本会话取消清盘：仍走旧缩略图兼容，不走新画廊。

桌面（卡片详情，展示层开着）：

1. 选文件上传（png / jpg / jpeg / webp）→ 直接写入画廊，新图设为 `selected_id`。
2. 编辑提示词 → 生成 → 预览候选 → 确认写入或取消。
3. 画廊可删图、点选当前图（改 `selected_id`，卡面 `{{image}}` / 轮播选中态跟着变）。

旧 `settingImage:choose` 不再把图写进设定卡 `image` 或 `assets/settings/`。产品路径改走新 display-image IPC。未迁移兼容读路径可暂时保留。

CLI：

```text
quill display add-image --project <path> --card-id <id> --file <path>
```

成功则写入画廊并选中。没有 `--file` 或卡类型不在允许名单：中文报错，磁盘不变。不提供生图子命令。

## 错误

用中文：

- 展示层关闭时上传/生图：拒绝，不写盘。
- 未配置生图凭证，或 Claude/DeepSeek/Ollama：提示不支持，不发起请求。
- 生图 HTTP 失败/超时/取消：提示失败，不写 `assets/display/`。
- 候选未确认：不写盘。
- 图片签名不是 png/jpeg/webp，或解码失败：拒绝保存。
- CLI 缺 `--file`：非 0 退出，磁盘不变。
- 删卡失败时配图目录也不要半删；与卡片删除同一把项目锁。

## 测试

真实项目夹具，不 mock 掉写盘：

1. 上传一张图：`assets/display/<id>/` 有文件和 manifest；设定卡 YAML 仍无 `image`。
2. 再上传一张：manifest 两张，`selected_id` 为新图；`{{image}}` 为新图，`{{images}}` 含两张且无 `<script>`。
3. 生图候选确认前：目录与 manifest 不变；确认后多一项 `source: generated`。
4. 未配置生图凭证时点生成：不发起网络（测适配器入参/短路），中文错误。
5. `display_layer.enabled === false`：核心仍允许已有文件留在磁盘；桌面/CLI 写入口拒绝。
6. `quill display add-image` 无 `--file`：抛错且无新文件。
7. 含 `<script>` 的模板仍拒绝保存；带 `{{images}}` 的合法模板可保存。
8. CCv3 导入夹具仍只进世界书事实（本轮不改断言）。

## 非目标

- 不做 Agent 专家模式围栏。
- 不改 CCv3 导入/导出。
- 不改项目封面。
- 不自动生图。
- 不为 Claude / DeepSeek / Ollama 编造生图端点。
- 不把配图写回设定卡 frontmatter。
- 不把生图凭证塞进 `project.yaml` 或 `story_structure`。
