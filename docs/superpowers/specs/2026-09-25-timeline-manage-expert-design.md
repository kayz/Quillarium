# 整理时间线：一键专家任务

Date: 2026-09-25  
Status: approved  
Parent: `docs/superpowers/specs/2026-09-21-chapter-centered-product-design.md`  
Fence: `docs/superpowers/specs/2026-09-22-agent-expert-fence-design.md`  
Organize: `docs/superpowers/specs/2026-09-22-organize-outline-worldbook-design.md`  
Relations: `docs/superpowers/specs/2026-09-25-relation-foreshadow-experts-design.md`  
Scope: 针对当前选中轨道，提案新建/整段替换 `timeline_event`，并把点事件挂到本轨已有节点、改同节点内 display 顺序。产出未确认提案，确认后才写入。不含新建时间节点、不重排节点、不改其它轨道、不重做链布局、不含对话助手迁移、节生文。

## 主线

专家模式继续只整理、分析、评估、补设定，不写章正文。

人物关系与伏笔专项已经有一键专家。这一轮补上类型管理里剩下的 **时间线：顺序与显示**：

- 入口仍是现有时间线链（轨道、拖拽、挂点 API 都保留）。
- 作者点一下，模型只看 **当前轨道**，提案事件卡 + 点挂点 + 同节点顺序。
- 不让模型造 `timeline_node` 坐标，也不重做链的布局算法。

走已有 `executeExpertTask`。不经 `applyAssistantTurn`。对话助手、整理大纲/世界书、关系、伏笔、章评估本轮不改。

## 已锁定的决策

| 主题     | 选择                                                                                     |
| -------- | ---------------------------------------------------------------------------------------- |
| 范围     | 一个新 expert 任务，一个 apply。确认层叠在现有链上。                                     |
| 入口     | 链视图一键按钮。不自动跑。                                                               |
| 看哪里   | 当前选中轨道（默认 `main`，含虚拟主轨）。                                                |
| 写什么   | 新建或整段替换已启用 `timeline_event`；把点事件挂到本轨已有节点；改同节点 display 顺序。 |
| 不写什么 | 不新建/重排 `timeline_node`；不写区间挂点；不改其它轨道的挂点；不写 issue；不写章正文。  |
| 挂点池   | 已在本轨的事件 + 全书完全未挂的事件 + 本轮已成功新建的事件。                             |
| 同轮     | 同一确认可先 create 事件卡，再把它挂到本轨已有节点。                                     |
| 新建     | 一律先 `createWorldEntry`，再特化成 `timeline_event`。                                   |
| 更新     | 只打已启用事件卡。整段替换正文；不改 id/type；不经 fields 改 `placements` / 节点指针。   |
| 未勾选   | 一键专家没有会话 turn：未勾选直接丢弃，不写 `rejected`。                                 |
| 取消     | 关闭确认层不调用 apply：磁盘不变。                                                       |
| CLI      | 只评估、打印条数，不 apply。                                                             |
| 链 UI    | 不重做轨道布局和拖拽算法。只加按钮和确认层；保存中禁用按钮。                             |

## 任务

新增一个 `AgentTaskDefinitionV1`，`lane: 'expert'`，`capability_ceiling` 不得含 `generate_candidate`：

| `id`              | 标题       | 本轮动作                                              |
| ----------------- | ---------- | ----------------------------------------------------- |
| `manage-timeline` | 整理时间线 | 一键，返回未确认的事件新建/更新 + 点挂点 + 同节点顺序 |

结果走结构化 JSON（与整理世界书 / 管理伏笔相同）。门面评估阶段不写项目事实文件。

写入：

```ts
applyTimelineManage(
  projectRoot: string,
  proposals: TimelineManageProposalSet,
  decisions: {
    confirmed: true
    creates: Array<{ proposal_id: string; fields?: Record<string, unknown> }>
    updates: Array<{ proposal_id: string; fields?: Record<string, unknown> }>
    placements: string[]
    orders: string[]
  }
): Promise<{
  created_ids: string[]
  updated_ids: string[]
  placed_event_ids: string[]
  ordered_node_ids: string[]
}>
```

`confirmed: true`，否则抛 `提案尚未确认，不能写入。`（`UNCONFIRMED_EVAL`）。同一确认失败则整笔回滚。

## 整理时间线

前置：必须有轨道 id。否则不调模型：

- 桌面/输入空：`没有选中时间轨道，不能整理时间线。`
- 轨道不在时间线目录里（含虚拟 `main`）：`找不到时间轨道，不能整理时间线。`

本轨可以零个节点。仍允许只提案事件卡；任何需要节点的挂点在 apply 时按「节点不在当前轨道上」失败。

输入：项目根、`track_id`。

提案集上的 `track_id` 必须等于这次评估的轨道。否则：`整理时间线的轨道与当前选中不一致。` 桌面确认时若当前选中轨道已变，不调用 apply。Handler 聚合时 **始终用 input 的 `track_id` 盖掉模型值**。

上下文（只读）：

- 当前轨道（id、title）
- 该轨已有节点：id、title、顺序（不把坐标换算规则塞进模型去「发明」新节点）
- 已在本轨的已启用 `timeline_event`：id、title、content、该轨上的起始节点、同节点 display 顺序
- 完全未挂的已启用 `timeline_event`：id、title、content（无任何轨道 placement，且无指向节点的遗留 `timeline_node`）
- 不带其它轨道上已挂好的事件正文、不带禁用事件、不带章正文

模型产出：

```ts
{
  eval_id: string
  track_id: string
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
  placements: Array<{
    proposal_id: string
    node_id: string
    event_id?: string
    create_proposal_id?: string
  }>
  orders: Array<{
    proposal_id: string
    node_id: string
    event_ids: string[]
  }>
}
```

约束（评估聚合或确认写入时都要执行）：

- creates/updates/placements/orders 各最多 64。
- `title` / `content` 去空白后非空。
- 每条 placement 必须恰好一个目标：`event_id`（已有卡）或 `create_proposal_id`（本轮某条 create），不能两个都有或都没有。
- placement 是点事件：只带本轨已有 `node_id`，不得带结束节点。
- 已有 `event_id` 必须落在挂点池：已在本轨，或完全未挂。不得把其它轨道上的事件加挂或挪过来。
- `create_proposal_id` 必须是本轮一条成功 create（apply 时按数组顺序，先 create 再 placement）。
- orders 的 `node_id` 必须在本轨。`event_ids` 必须是 **placements 生效后** 该节点上事件的排列（不漏、不添、不重复）。
- updates 的 `card_id` 必须是已启用 `timeline_event`。找不到或类型不对：`找不到要更新的事件卡。` 已禁用：`不能更新已禁用的设定卡。`
- 更新不改卡 id、不改 type。`fields` 可改 `date`、`duration`、`location`、`characters`、`flashback_reference`。禁止经 fields 改 `placements`、`timeline_node`、`previous`、`next`。改完后须通过 `timelineEventSchema`。
- 提案 `title` 非空时可覆盖更新卡标题。

确认：`applyTimelineManage`。顺序：creates → updates → placements → orders。

- creates：`createWorldEntry`，再 `specializePlanningCard(..., 'timeline_event')`。`timeline_event` 无额外特化必填字段；缺标题/正文在聚合期拒绝。
- updates：整段替换 Markdown 正文；合并允许的 `fields`；`id`/`type` 保留。
- placements：在同一把项目写锁内调用现有 `placeTimelineEvent`（`mode: 'add'` 用于未挂与本轮新建，`mode: 'move'` 仅用于已在 **本轨** 上改挂到本轨另一节点）。`expected_hash` 由 apply 在锁内重读，不信任模型。不得传 `end_node_id`。调用前用本规格中文错误预检节点/池子；不要把 `timeline-model` 的英文错误抛给作者。
- orders：调用现有 `reorderTimelineEvents`（`order_kind: 'display'`，本轨、该节点）。锁内重读 hash。同样先中文预检。
- 失败：删除本轮新建文件，恢复被改事件卡（含挂点/顺序）的 before-image，再抛原错误。

确认层可改 creates 的标题/正文/允许字段，勾选 placements 与 orders。链仍用现有确定性布局与手拖；模型不得改节点坐标或轨道 display_order。

## 入口

桌面：

- **整理时间线** / `Organize timeline`：时间线链栏目始终显示（轨道可零节点）。点击不得发生在保存卡片、拖节点/事件、切轨道时。
- 当前链上选中的轨道就是 `track_id`。切轨道不自动评估。

IPC 当前 **183**，本轮加 2 条 → **185**：

- `expert:manageTimeline` / `expert:applyTimelineManage`

评估走 `executeExpertTask`。Apply 走 core，不经模型。提案集由桌面/CLI 拿在手里回传，不另存 eval 文件。

CLI（不 apply）：

```text
quill expert manage-timeline --track-id <track-id> --project <path>
```

成功一行：

```text
timeline-manage: creates=<n> updates=<n> placements=<n> orders=<n>
```

缺少 `--track-id` 按未选轨道拒绝。

## 错误

中文、fail-closed、不写盘：

| 情况                         | 错误                                 |
| ---------------------------- | ------------------------------------ |
| 未确认就写入                 | `提案尚未确认，不能写入。`           |
| 未选轨道                     | `没有选中时间轨道，不能整理时间线。` |
| 轨道不存在                   | `找不到时间轨道，不能整理时间线。`   |
| 提案轨道与当前选中不一致     | `整理时间线的轨道与当前选中不一致。` |
| 更新目标不是已启用事件卡     | `找不到要更新的事件卡。`             |
| 更新禁用卡                   | `不能更新已禁用的设定卡。`           |
| 节点不在当前轨道             | `节点不在当前轨道上。`               |
| 事件不在本轨/未挂/本轮新建池 | `事件不在当前轨道整理范围内。`       |
| 找不到本轮提案 id            | `找不到时间线提案：{id}`             |
| 特化/schema 失败             | 与特化或 Zod 相同的错误              |
| 门面接到生文/展示            | `专家门面只接受专家任务。`           |

打开链、保存、拖拽、切轨道、切栏目、打开章：都不得调用这条专家任务。

## 测试

真实项目夹具，不 mock 掉写盘：

1. 空 `track_id` / 未知轨道：评估拒绝，对应中文错误，无模型调用。
2. create 事件：评估不改磁盘；确认后事件卡在、`world/` 无残留；取消则两处都没有。
3. 同轮 create 再 placement 到本轨已有节点：确认后事件挂在该节点上（点事件，无 `end_node_id`）。
4. 更新已启用事件：正文被整段替换，`date` 可变，`type` 仍为 `timeline_event`，`placements` 不经 fields 被清空。
5. 更新禁用事件：`不能更新已禁用的设定卡。` 正文不变。
6. placement 指向其它轨道上已挂事件：`事件不在当前轨道整理范围内。` 不写盘。
7. placement 指向不在本轨的节点：`节点不在当前轨道上。` 不写盘。
8. 本轨零节点时 placement：同一句节点错误；若同轮还有 create，整笔回滚。
9. orders 漏掉刚挂上的事件：失败，挂点和新建都回滚。
10. 后一步失败：先写的卡与挂点全部回滚。
11. 桌面：时间线栏目出现「整理时间线」；确认层轨道不一致不调用 apply。
12. CLI：打印计数且不写文件。

## 非目标

- 不把对话助手迁进 `executeExpertTask`。
- 不写章正文，不经节生文。
- 不新建、删除、重排 `timeline_node`。
- 不改链布局算法、手拖、时间系/轨道目录的编辑 UI。
- 不写区间挂点，不从其它轨道 move 过来。
- 不改 `evaluateForeshadowingReminders`、章评估、整理大纲/世界书、关系、伏笔、定稿反查、展示层、CCv3。
- 不自动跑。
- 不为 CLI 提供 apply。

## 与现状的差

- 今天：轨道、节点顺序、事件挂点、未挂列表都靠手；没有盯当前轨道的一键专家。
- 本轮：一个专家；只动当前轨的事件卡、点挂点和同节点顺序；确认后才写。
- 下一轮：是否把对话助手迁进 `executeExpertTask`；若还要「给轨道补节点/写区间」另写规格。
