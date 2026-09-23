# 整理大纲与世界书：两个一键专家任务

Date: 2026-09-22  
Status: approved  
Parent: `docs/superpowers/specs/2026-09-21-chapter-centered-product-design.md`  
Fence: `docs/superpowers/specs/2026-09-22-agent-expert-fence-design.md`  
Scope: 作者点击整理故事树下级节点，以及整理已启用世界书。产出未确认提案，确认后才写入。不含关系/伏笔专项、对话助手迁移、节树、章评估改写。

## 主线

专家模式继续只整理、分析、评估、补设定，不写章正文。

这一轮补上围栏之后的两条整理能力：

- **整理大纲**：给当前选中节点生成合法下级（标题 + 层级 + 父节点）。纲要正文仍手写。
- **整理世界书**：对项目里已启用的 `world_entry` 提案新建或整段替换正文；确认表单可特化。

两条都走已有 `executeExpertTask`。现有对话式 `organize-setting` 助手本轮不迁、不删。

## 已锁定的决策

| 主题           | 选择                                                                         |
| -------------- | ---------------------------------------------------------------------------- |
| 范围           | 两个新 expert 任务，同一套确认写入。                                         |
| 入口           | 两个一键按钮。不自动跑。旧设定整理助手不动。                                 |
| 大纲能做什么   | 只新建当前选区的下级节点。不改已有纲要、不删除、不重排。最深到章，不创建节。 |
| 新建大纲带什么 | 标题、合法层级、父节点；`content` 为空串。                                   |
| 大纲范围       | 当前选中节点及其下级。选区外的节点不得作为 parent，也不得被改。              |
| 选中章         | 拒绝整理，不调模型。                                                         |
| 世界书范围     | 项目里所有**已启用**的 `world_entry`。已特化卡片不在这里改正文。             |
| 世界书能做什么 | 新建 `world_entry`；更新已有世界书为完整新正文（整段替换）。确认时可特化。   |
| CLI            | 只评估、打印条数，不 apply。                                                 |
| 助手           | `organize-setting` 对话流保持原样。                                          |

## 任务

新增两个 `AgentTaskDefinitionV1`，`lane: 'expert'`，`capability_ceiling` 不得含 `generate_candidate`：

| `id`                 | 标题       | 本轮动作                            |
| -------------------- | ---------- | ----------------------------------- |
| `organize-outline`   | 整理大纲   | 一键，返回未确认新建节点提案        |
| `organize-worldbook` | 整理世界书 | 一键，返回未确认新建/更新世界书提案 |
| `organize-setting`   | 设定整理   | **不改**，仍是对话助手              |

结果走结构化 JSON（与章评估相同），不在 V2 上发明 `propose_planning_record` 以外的新写盘操作。门面评估阶段不写项目事实文件。

## 整理大纲

前置：必须有选中的大纲节点，且该节点 `level !== 'chapter'`。否则：

- 未选中：`没有选中大纲节点，不能整理。`
- 选中章：`当前选中的是章，不能再创建下级。`

输入：项目根、`outline_id`。

上下文：该节点及其下级的大纲文档（id、title、level、parent、现有 content 只作只读参考）。不扫节 / scene / `chapter_prose`。

模型输出：零个或多个 creates。每条：

```ts
{ proposal_id: string, title: string, level: 'volume' | 'part' | 'act' | 'chapter', parent_id: string }
```

约束（评估聚合或确认写入时都要执行）：

- `title` 去空白后非空。
- `level` 不得为 `section` / `scene` / `overview` / `book`（overview/book 仍由作者手建）。违例节：`整理大纲不能创建节。`
- `parent_id` 必须是选中节点或其下级。否则：`大纲节点不在整理选区内。`
- 层级相对 parent 必须通过现有 `assertOutlinePlacementAgainst`（尊重 `part_enabled` / `act_enabled`）。
- 最多 64 条 creates。

确认：作者勾选后 `applyOutlineOrganize`。每条调用现有 `createOutline(root, level, title, { parent: parent_id }, '')`。取消或关闭面板：磁盘不变。

## 整理世界书

前置：有打开的项目即可。没有世界书也可以跑（只提案新建）。不因「零张卡」拒绝。

输入：项目根。

上下文：全部 `enabled !== false` 的 `world_entry`（id、title、content）。禁用卡与已特化类型不进上下文。

模型输出：

```ts
{
  creates: Array<{ proposal_id: string; title: string; content: string }>
  updates: Array<{ proposal_id: string; card_id: string; content: string }>
}
```

约束：

- creates/updates 各最多 64。
- `title` / `content` 去空白后非空。
- updates 的 `card_id` 必须对应**已启用** `world_entry`。否则：`只能整理已启用的世界书。`

确认：`applyWorldOrganize`。

- creates：`createWorldEntry`；确认表单可改 `type` / `fields`，非 `world_entry` 则立刻 `specializePlanningCard`。
- updates：用提案 `content` **整段替换**该卡 Markdown body（frontmatter 身份字段不变）。确认表单同样可特化该卡。
- 同一确认事务失败则**整笔不写**：新建文件删除；已替换的卡恢复 before-image；特化失败沿用现有特化回滚，并回滚本事务里其它写入。

取消或关闭：磁盘不变。

## 入口

桌面：

- **整理大纲** / `Organize outline`：故事树在选中非章节点时显示。选中章或未选中：不显示。点击不得发生在保存树、切层级、打开章时。
- **整理世界书** / `Organize world book`：设定首页世界书栏目始终显示（列表可空）。点击不得发生在保存卡片、切栏目、上传参考时。

IPC 当前 **174**，本轮加 4 条 → **178**：

- `expert:organizeOutline` / `expert:applyOutlineOrganize`
- `expert:organizeWorldbook` / `expert:applyWorldOrganize`

评估走 `executeExpertTask`。Apply 走 core，不经模型。

CLI（不 apply）：

```text
quill expert organize-outline --project <path> --outline-id <id>
quill expert organize-worldbook --project <path>
```

成功一行：

```text
outline-organize: creates=<n>
world-organize: creates=<n> updates=<n>
```

## 错误

中文、fail-closed、不写盘：

| 情况                     | 错误                                          |
| ------------------------ | --------------------------------------------- |
| 未选中大纲节点就整理     | `没有选中大纲节点，不能整理。`                |
| 选中章还整理大纲         | `当前选中的是章，不能再创建下级。`            |
| 提案创建节               | `整理大纲不能创建节。`                        |
| parent 不在选区          | `大纲节点不在整理选区内。`                    |
| 层级相对 parent 不合法   | 沿用 `assertOutlinePlacementAgainst` 现有错误 |
| 更新目标不是已启用世界书 | `只能整理已启用的世界书。`                    |
| 未确认就写入             | `提案尚未确认，不能写入。`                    |
| 特化缺字段               | 与特化相同的中文缺字段错误                    |
| 门面接到生文/展示        | `专家门面只接受专家任务。`                    |

打开树、保存、切栏目、开关节模块：都不得调用这两条整理。

## 测试

真实项目夹具，不 mock 掉写盘：

1. 选中卷：评估返回 creates；此时没有新 outline 文件。确认后新节点存在且 content 为空。取消则仍无新文件。
2. 未选中 / 选中章：评估拒绝，对应中文错误，无模型调用。
3. 提案 `level: section` 或 parent 在选区外：拒绝写入，磁盘不变。
4. 已启用世界书：评估不改磁盘；确认 creates 出现新 `world/` 文件；确认 updates 后该卡 body 等于提案全文。
5. 确认「一条新建 + 一条缺字段的 typed 特化」：抛特化缺字段错误；新建与旧卡正文都恢复。
6. 更新禁用卡或人物卡：`只能整理已启用的世界书。`
7. 桌面：未选中/选中章不出现「整理大纲」；世界书栏目出现「整理世界书」。
8. CLI：缺大纲节点拒绝；有节点时打印 `outline-organize: creates=<n>` 且不写文件。

## 非目标

- 不改已有大纲纲要正文。
- 不删除、不重排、不合并节点或卡片。
- 不创建节 / scene，不开关 `scene_enabled`。
- 不迁 `organize-setting` 对话助手。
- 不做关系分析、伏笔埋设/回收专家。
- 不改章评估、定稿反查、节生文、展示层、CCv3。
- 不自动整理。

## 与现状的差

- 今天：设定整理是多轮助手；故事树下级靠手点「新增」。
- 本轮：两个一键专家任务，提案确认后才写；大纲只长树，世界书可新建或替换正文。
- 下一轮：关系与伏笔专项；以及是否把旧助手收进同一确认管道。
