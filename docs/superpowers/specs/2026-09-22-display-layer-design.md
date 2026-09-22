# 展示层模块：可关外壳与新卡面

Date: 2026-09-22  
Status: approved  
Parent: `docs/superpowers/specs/2026-09-21-chapter-centered-product-design.md`  
Scope: 把卡片视觉外壳从设定事实里拆出来，做成项目级可选模块；清掉旧图/旧 HTML 卡绑定；换一套新的卡面渲染。不含 Agent 专家模式围栏、不含生图、不含本轮重新上传配图、不含改 CCv3。

## 主线

展示层是挂在设定卡上的 **外壳**，不是世界观。关掉之后，世界书、特化卡、关系、时间线、伏笔都还在，只是没有缩略图和 HTML 卡面。

旧实现把 `image` 写进卡片 frontmatter，HTML 卡设计师和设定模型长在一起。这一轮删掉那套绑定，用新的 `display_layer` 配置和新的卡面渲染器。配图字段预留、允许为空；上传图片或生图 AI 留到下一轮。

## 已锁定的决策

| 主题 | 选择 |
| ---- | ---- |
| 开关位置 | `ProjectConfig.display_layer`，不放进 `story_structure`。 |
| 新项目 | `enabled: false`，`migrated: true`（和节模块一样，作家默认关）。 |
| 旧项目 | 若仍有旧图则打开时询问。确认后清盘并 `enabled: true`；取消则本会话不碰磁盘。 |
| 清盘 | 删除项目内 `assets/settings/`，并从卡片去掉 `image`。破坏性，不可恢复。 |
| 新卡面 | 替换 `setting-card-design`。内置样式 + 作者保存的模板；Agent 只出候选，确认后才保存。 |
| 配图 | 预留空槽 `{{image}}`。本轮无上传、无生图。 |
| 写作字段 | 展示不得要求新的事实 frontmatter 才能工作。新图以后也不写回设定卡 `image`。 |
| CCv3 | 导入/导出当数据交换，本轮不动。 |
| 工作区旧样式 | `styles/setting-cards/` 先留着不删；新渲染器不读它们。 |

## 配置

```ts
display_layer: {
  enabled: boolean
  migrated: boolean
}
```

- `enabled`：本项目是否渲染新卡面外壳。
- `migrated`：旧展示资源是否已按本规格清盘。

缺省 YAML 里没有 `display_layer` 时：

1. 若 `assets/settings/` **里有文件**，或任一规划卡 `image` 为非空对象 → 视为 **未迁移**（`migrated: false`），打开时询问。
2. 否则视为已迁移、`enabled: false`，不询问。空的 `assets/settings/` 目录（新建项目就会建）不算旧图。

不要把缺字段默认成 `migrated: true` 而跳过仍有旧图的项目。

作家新建项目（桌面/CLI `create-project` / `init`）写入：

```yaml
display_layer:
  enabled: false
  migrated: true
```

已有测试夹具和未带此字段、也没有旧图的项目：按上面第 2 条，不提示、默认关。

作者可在项目设置里随时改 `enabled`。关掉只藏外壳，不删新卡面模板，也不删以后会出现的展示资源。

## 打开项目时的清盘

仅桌面在加载项目后、主界面可用前弹出确认（中文）。CLI 不弹窗。

确认文案必须写明：将删除本项目 `assets/settings/` 下的设定图，并从卡片去掉配图字段；此操作不能恢复。

**确认：**

在 `withProjectWriteLock` 内，顺序固定：

1. 先写入 `display_layer.enabled: true` 且 `display_layer.migrated: true`（避免删完资源却没写下标记，下次被当成「无旧图的干净项目」）。
2. 读取所有带 `image` 的规划卡，去掉 `image` 后写回；不改 `id` / `type` / 正文。
3. 删除 `assets/settings/`（目录不存在则跳过）。

第 2 或第 3 步失败：中文报错。下次打开若 `migrated === true` 但仍有 `image` 或仍存在 `assets/settings/`，**自动重试**第 2–3 步，不再询问。不要在询问阶段把未确认的项目写成 `migrated: true`。

**取消：**

本会话不写 `display_layer`，不删文件。本会话仍可用旧缩略图兼容路径读现有 `image`。新卡面不启用。下次打开再问。

**CLI：**

```text
quill project reset-display --confirm --project <path>
```

没有 `--confirm`：退出码非 0，磁盘不变。成功则与桌面确认相同的三步。

不要在 `quill project load` 时自动清盘。

## 新卡面

对世界书及可特化设定卡渲染外壳（与特化允许名单相同）：

```text
world_entry, canon, character, character_relation, location, timeline_event,
faction, faction_relation, faction_membership, foreshadowing, narrative
```

大纲、节、章正文、issue、reference 不做卡面。

### 何时渲染

| 状态 | UI |
| ---- | -- |
| `migrated && enabled` | 新 HTML 卡面（模块列表、详情）。 |
| `migrated && !enabled` | 只显示事实字段和 Markdown，无卡面、无旧缩略图。 |
| `!migrated` 且本会话取消清盘 | 旧缩略图兼容（读 frontmatter `image`）。不跑新卡面，不跑旧 HTML 设计师。 |
| `!migrated` 且尚未回答 | 清盘对话框挡住主界面。 |

### 模板从哪来

- 代码内置样式：打开即可用，不调模型。
- 作者模板：写作工作区 `styles/display-cards/<style-id>/<version>.json`。跨项目，不含小说事实。
- 不读取 `styles/setting-cards/`。

占位符：`{{title}}`、`{{content}}`、`{{fields}}`、可选 `{{image}}`。本轮 `{{image}}` 渲染为空槽，不读磁盘图。禁止脚本、事件处理器、远程 URL、CSS `@import`、未知占位符。预览用空 sandbox 的 iframe。

Agent 任务：停用产品面上的 `setting-card-design`。新任务 `display-card-design`，候选制。Random 只往内存历史里追加候选；作者确认并命名后才写入 `styles/display-cards/`。失败或未确认不写模板。

### 和事实的边界

设定卡 Markdown 只保存世界观事实。展示层不得新增必填写作字段。以后的配图写在展示资源里（例如 `assets/display/<card-id>/`），不写回 `PlanningCardDoc.image`。本轮该目录可以不存在。

封面（项目封面）不是展示层，不动。

## 错误

用中文：

- 未加 `--confirm` 的 CLI 清盘：不写配置，磁盘不变。
- 询问阶段被取消：不写 `migrated: true`。
- 已确认后摘字段或删目录失败：报错；配置里若已是 `migrated: true`，下次打开自动重试剩余清理。
- 模板消毒失败（指出被拒绝的占位符或规则）：不保存模板。
- Agent 候选未通过同一消毒：不写入 `styles/display-cards/`。

## 测试要求

真实项目夹具，不 mock 掉删除：

1. 新建作家项目：`display_layer.enabled === false` 且 `migrated === true`；加载不出现清盘提示。
2. 带 `assets/settings/` 文件与卡片 `image` 的旧项目：确认清盘后目录为空或不存在、卡片无 `image`、`migrated === true`、`enabled === true`。
3. 同上项目取消：目录和 `image` 仍在；本会话列表仍能读到旧缩略图路径。
4. `migrated && !enabled`：模块卡片 HTML 不包含新卡面根节点。
5. CLI 无 `--confirm`：抛错且 `assets/settings/` 仍在。
6. 含 `<script>` 的模板拒绝保存。
7. CCv3 导入夹具仍能进世界书事实（本轮不改断言）。

## 非目标

- 不做 Agent 专家模式围栏（整理/评估/不写正文那条线）。
- 不本轮上传设定图，不用生图 AI。
- 不改 CCv3 导入/导出。
- 不改项目封面。
- 不删工作区 `styles/setting-cards/`（只是不再读取）。
- 不把展示开关塞进 `story_structure`。
- 不为 OC 新增 `DocType`。
- 未确认前不得把旧项目写成 `migrated: true`。

## 与现状的差

- 今天：`image` 在卡片上；HTML 卡走 `setting-card-design` 与 `styles/setting-cards/`；没有项目级展示开关。
- 本轮：事实与外壳分开；旧图确认后删除；新卡面 + `display_layer`；默认关。
- 下一轮：配图上传或生图 AI，写入展示资源而不是设定卡 frontmatter。再下一轮：Agent 专家模式围栏。
