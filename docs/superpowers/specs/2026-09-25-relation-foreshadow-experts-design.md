# 关系分析与伏笔管理：两个一键专家任务

Date: 2026-09-25  
Status: approved  
Parent: `docs/superpowers/specs/2026-09-21-chapter-centered-product-design.md`  
Fence: `docs/superpowers/specs/2026-09-22-agent-expert-fence-design.md`  
Organize: `docs/superpowers/specs/2026-09-22-organize-outline-worldbook-design.md`  
Confirm: `docs/superpowers/specs/2026-09-23-assistant-confirm-pipeline-design.md`  
Scope: 给当前人物分析关系，以及管理全书已启用伏笔（含已引用节点上的埋设/回收字段）。产出未确认提案，确认后才写入。不含对话助手迁移、节生文、章评估改写、图布局、提醒评估改写。

## 主线

专家模式继续只整理、分析、评估、补设定，不写章正文。

这一轮补上围栏与整理之后的两条专项能力：

- **分析关系**：针对当前选中人物，提案新建或整段替换人物关系、势力关系、势力从属。
- **管理伏笔**：针对项目里已启用的伏笔卡，提案新建或整段替换；同一确认里可改**已经引用该伏笔**的大纲/节上的埋设、回收字段。

两条都走已有 `executeExpertTask`。不经 `applyAssistantTurn`。对话助手、整理大纲/世界书、章评估本轮不改。

## 已锁定的决策

| 主题         | 选择                                                                                         |
| ------------ | -------------------------------------------------------------------------------------------- |
| 范围         | 两个新 expert 任务，各有 apply，共用门面和确认层样式。                                       |
| 入口         | 两个一键按钮。不自动跑。                                                                     |
| 关系看哪里   | 当前选中人物。入口在时态人物关系图。                                                         |
| 关系写什么   | 新建或整段替换已启用的 `character_relation` / `faction_relation` / `faction_membership`。    |
| 关系不写什么 | 不写 issue，不改图坐标，不创建对端人物/势力。                                                |
| 伏笔看哪里   | 全书已启用伏笔卡。入口在伏笔账本（列表可空）。                                               |
| 伏笔写什么   | 新建或整段替换已启用伏笔卡；另改已引用节点的 `foreshadowing_planted` / `foreshadowing_resolved`。 |
| 伏笔不写什么 | 不改纲要正文，不改 `related_foreshadowing`，不给未引用节点挂新 id。                          |
| 新建         | 一律先 `createWorldEntry`，确认表单再特化。必填字段不齐不能写盘。                            |
| 更新         | 只打已启用的对应类型卡。整段替换正文；`fields` 可改类型字段，不改卡 id、不改 type。          |
| 未勾选       | 一键专家没有会话 turn：未勾选直接丢弃，不写 `rejected`。                                     |
| 取消         | 关闭确认层不调用 apply：磁盘不变。                                                           |
| CLI          | 只评估、打印条数，不 apply。                                                                 |

## 任务

新增两个 `AgentTaskDefinitionV1`，`lane: 'expert'`，`capability_ceiling` 不得含 `generate_candidate`：

| `id`                    | 标题     | 本轮动作                                          |
| ----------------------- | -------- | ------------------------------------------------- |
| `analyze-relations`     | 分析关系 | 一键，返回未确认的关系新建/更新提案               |
| `manage-foreshadowing`  | 管理伏笔 | 一键，返回未确认的伏笔新建/更新 + 埋收绑定提案    |

结果走结构化 JSON（与章评估 / 整理世界书相同）。门面评估阶段不写项目事实文件。

写入：

- `applyRelationAnalyze`
- `applyForeshadowManage`

都要 `confirmed: true`，否则抛 `提案尚未确认，不能写入。`（`UNCONFIRMED_EVAL`）。同一确认失败则整笔回滚。

返回：

```ts
applyRelationAnalyze(...): Promise<{ created_ids: string[]; updated_ids: string[] }>
applyForeshadowManage(...): Promise<{
  created_ids: string[]
  updated_ids: string[]
  binding_document_ids: string[]
}>
```

## 分析关系

前置：必须已选中人物。否则不调模型：

- 桌面未选中：`没有选中人物，不能分析关系。`
- 人物 id 在项目中不存在：`找不到人物，不能分析关系。`

输入：项目根、`character_id`。

提案集上的 `character_id` 必须等于这次评估的人物。否则：`分析关系的人物与当前选中不一致。`

上下文（只读）：

- 该人物卡（id、title、content）
- 所有**已启用**且与此人相关的 `character_relation`、`faction_membership`
- 此人当前已启用从属所指向势力之间、已启用的 `faction_relation`
- 对端人物/势力的 id 与标题

不带章正文、不带禁用卡、不带与此人无关的关系。

模型产出：

```ts
{
  eval_id: string
  character_id: string
  creates: Array<{
    proposal_id: string
    title: string
    content: string
    type: 'character_relation' | 'faction_relation' | 'faction_membership'
    fields: Record<string, unknown>
  }>
  updates: Array<{
    proposal_id: string
    card_id: string
    content: string
    fields: Record<string, unknown>
  }>
}
```

约束（评估聚合或确认写入时都要执行）：

- creates/updates 各最多 64。
- `title` / `content` 去空白后非空。
- `type` 只能是上述三类。
- 人物关系：`from_character` 或 `to_character` 必须是当前人物；两端必须是已有人物卡；不能是同一 id（沿用现有 `assertPlanningCardDomain`）。
- 从属：`character_id` 必须是当前人物；`faction_id` 必须是已有势力卡。
- 势力关系：`from_faction` / `to_faction` 必须是已有势力卡，且至少一端是此人**当前已启用从属**里的势力。校验时承认本事务里**已经成功写入**的从属（creates 按数组顺序）。
- updates 的 `card_id` 必须对应已启用的上述三类卡。找不到或类型不对：`找不到要更新的关系卡。` 已禁用：`不能更新已禁用的设定卡。`
- 更新不改卡 id、不改 type。`fields` 可改 `relation_type`、`direction`、`starts_at`、`ends_at`、`visibility`、`role`、`rank`、`primary` 以及仍满足「与当前人物相关」的端点。改完后仍须通过上面的相关约束。

确认：`applyRelationAnalyze`。顺序：creates → updates。

- creates：`createWorldEntry`，再 `specializePlanningCard` 到提案（或确认表单改过的）`type`。缺字段走现有特化中文错误。
- updates：整段替换 Markdown 正文；把允许的 `fields` 写进 frontmatter；身份字段 `id`/`type` 保留。提案 `title` 非空时可覆盖卡标题。
- 失败：删除本轮新建文件，恢复被替换卡的 before-image，再抛原错误。

确认层可改 creates 的特化类型和必填字段。关系图仍是确定性布局，模型不得改坐标。取消或关闭：磁盘不变。

## 管理伏笔

前置：有打开的项目即可。账本为空也可以跑（只提案新建）。不因「零张卡」拒绝。

输入：项目根。

上下文（只读）：

- 全部 `enabled !== false` 的 `foreshadowing`（id、title、state、content、埋收位置、触发条件）
- 已经引用这些伏笔的大纲和节：`related_foreshadowing`、`foreshadowing_planted`、`foreshadowing_resolved` 任一数组含该 id（带 id、title、level、这三个数组）

不带章正文、不带禁用伏笔。节模块关闭时，磁盘上已有引用的节文件仍可被 binding 改（不新挂 id）。

模型产出：

```ts
{
  eval_id: string
  creates: Array<{
    proposal_id: string
    title: string
    content: string
    fields: Record<string, unknown>
  }>
  updates: Array<{
    proposal_id: string
    card_id: string
    content: string
    fields: Record<string, unknown>
  }>
  bindings: Array<{
    proposal_id: string
    foreshadowing_id: string
    document_id: string
    plant?: 'add' | 'remove'
    resolve?: 'add' | 'remove'
  }>
}
```

约束：

- creates/updates/bindings 各最多 64。
- `title` / `content` 去空白后非空。
- 每条 binding 至少有 `plant` 或 `resolve`，值只能是 `add` | `remove`。
- updates 的 `card_id` 必须对应已启用 `foreshadowing`。找不到：`找不到要更新的伏笔卡。` 已禁用：`不能更新已禁用的设定卡。`
- 更新不改卡 id、不改 type。`fields` 可改 state、level、埋收位置、触发条件等 schema 允许的非身份字段。
- bindings 的 `foreshadowing_id` 必须是**评估前已存在**的伏笔卡（可以同时是本轮某条 update 的目标）。**不得**指向本轮 creates。否则：`伏笔尚未被该节点引用，不能改埋设或回收。`
- `document_id` 必须是大纲或节，且该文档的 `related_foreshadowing` / `foreshadowing_planted` / `foreshadowing_resolved` **至少一处已有**这个 `foreshadowing_id`。否则同一句错误。
- 只改 `foreshadowing_planted` 与 `foreshadowing_resolved`。不改纲要正文，不改 `related_foreshadowing`。
- 已在数组里再 `add`、不在再 `remove`：成功、不重复、不报错。

确认：`applyForeshadowManage`。顺序：creates → 伏笔卡 updates → bindings。

- creates：`createWorldEntry`，再特化成 `foreshadowing`。
- updates：整段替换正文并合并允许的 `fields`。提案 `title` 非空时可覆盖卡标题。
- bindings：改目标文档 frontmatter 两个数组。
- 失败：删除本轮新建文件，恢复被改伏笔卡和大纲/节的 before-image，再抛原错误。

确认层两块：伏笔卡新建/替换；已有引用节点上的埋收。取消或关闭：磁盘不变。

`evaluateForeshadowingReminders` 本轮不改，确认时不调用。

## 入口

桌面：

- **分析关系** / `Analyze relations`：时态人物关系图在已选中人物时显示。未选中人物：不显示。点击不得发生在保存卡片、拖图、切时间点时。
- **管理伏笔** / `Manage foreshadowing`：伏笔账本栏目始终显示（列表可空）。点击不得发生在保存卡片、切栏目时。

IPC 当前 **179**，本轮加 4 条 → **183**：

- `expert:analyzeRelations` / `expert:applyRelationAnalyze`
- `expert:manageForeshadowing` / `expert:applyForeshadowManage`

评估走 `executeExpertTask`。Apply 走 core，不经模型。提案集由桌面/CLI 拿在手里回传，不另存 eval 文件。

CLI（不 apply）：

```text
quill expert analyze-relations --project <path> --character-id <id>
quill expert manage-foreshadowing --project <path>
```

成功一行：

```text
relation-analyze: creates=<n> updates=<n>
foreshadow-manage: creates=<n> updates=<n> bindings=<n>
```

## 错误

中文、fail-closed、不写盘：

| 情况                         | 错误                                           |
| ---------------------------- | ---------------------------------------------- |
| 未确认就写入                 | `提案尚未确认，不能写入。`                     |
| 未选中人物                   | `没有选中人物，不能分析关系。`                 |
| 人物 id 不存在               | `找不到人物，不能分析关系。`                   |
| 提案人物与评估人物不一致     | `分析关系的人物与当前选中不一致。`             |
| 更新目标不是已启用关系三类卡 | `找不到要更新的关系卡。`                       |
| 更新目标不是已启用伏笔       | `找不到要更新的伏笔卡。`                       |
| 更新禁用卡                   | `不能更新已禁用的设定卡。`                     |
| 节点未引用该伏笔 / binding 指向本轮新建 | `伏笔尚未被该节点引用，不能改埋设或回收。` |
| 找不到本轮提案 id            | `找不到关系提案：{id}` / `找不到伏笔提案：{id}` |
| 特化缺字段                   | 与特化相同的中文缺字段错误                     |
| 门面接到生文/展示            | `专家门面只接受专家任务。`                     |

打开图、保存、切栏目、开关节模块、打开章：都不得调用这两条专家任务。

## 测试

真实项目夹具，不 mock 掉写盘：

1. 未选人物 / 未知 `character-id`：评估拒绝，对应中文错误，无模型调用。
2. 关系 create 且 `type: character_relation`：评估不改磁盘；确认且字段齐全后人物关系文件在、`world/` 无残留；取消则两处都没有。
3. 关系 create 缺 `to_character`：抛特化缺字段；整笔不写。
4. 更新已启用人物关系：正文被整段替换，`relation_type` 可变，`type` 仍为 `character_relation`。
5. 更新禁用关系卡：`不能更新已禁用的设定卡。` 正文不变。
6. 势力关系两端都不是此人物所属势力（含本事务尚未写入的从属）：不写盘。
7. 同一次确认先 create 从属、再 create 指向该势力的势力关系：确认后两张卡都在。
8. 伏笔 create 后同轮 binding 指向该新卡：抛引用错误，世界书/伏笔都不落盘。
9. 大纲已有 `related_foreshadowing`：binding `plant: add` 后 `foreshadowing_planted` 含该 id；纲要正文与 `related_foreshadowing` 不变。
10. 绑定未引用节点：抛引用错误；若同轮还有卡 update，卡也不写。
11. 后一步失败（例如第二条 binding 非法）：先写的卡与第一条 binding 全部回滚。
12. 桌面：未选中人物不出现「分析关系」；伏笔栏目出现「管理伏笔」。
13. CLI：打印计数且不写文件。

## 非目标

- 不把对话助手迁进 `executeExpertTask`。
- 不写章正文，不经节生文。
- 不改时态关系图的布局算法。
- 不改 `evaluateForeshadowingReminders`。
- 不创建、删除、重排大纲节点。
- 不改章评估、整理大纲/世界书、定稿反查、展示层、CCv3。
- 不自动跑。
- 不为 CLI 提供 apply。

## 与现状的差

- 今天：关系边和伏笔账本靠手建；章评估/整理世界书只能经特化间接碰到这两类卡；没有专项专家。
- 本轮：两个一键专家；关系盯当前人物；伏笔盯账本并可改已引用节点的埋收数组；确认后才写。
- 下一轮：是否把对话助手迁进 `executeExpertTask`；其它类型管理（时间线等）若要专家再另写规格。
