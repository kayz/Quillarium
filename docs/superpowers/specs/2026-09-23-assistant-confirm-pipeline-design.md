# 创作助手确认管道：一轮一个确认层

Date: 2026-09-23  
Status: approved  
Parent: `docs/superpowers/specs/2026-09-21-chapter-centered-product-design.md`  
Fence: `docs/superpowers/specs/2026-09-22-agent-expert-fence-design.md`  
Organize: `docs/superpowers/specs/2026-09-22-organize-outline-worldbook-design.md`  
Scope: 把设定整理、人物试戏、连续性审阅的待确认产出收进与整理世界书 / 章评估相同的确认写入。对话、会话、资料包、executeExpertTask 不迁。不含关系/伏笔新专家、不含节生文、不含把助手回合改经专家门面。

## 主线

创作助手仍然是多轮对话。模型回合只把提案记在该轮 `turn.json` 上，不写项目事实。

每一轮只要还有待确认的规划卡、问题或助手配置，就弹出确认层。作者勾选后一次确认整笔写入；没勾选的标成已拒绝。取消或关闭确认层：磁盘不变，提案仍 pending，这一轮可以重新打开确认层。

新建设定默认落成世界书，确认表单可特化。已有卡可以整段替换正文；已特化卡也可以替换，type 不变，除非确认时按现有特化规则改 type。

## 已锁定的决策

| 主题       | 选择                                                                                           |
| ---------- | ---------------------------------------------------------------------------------------------- |
| 对话       | 仍走现有助手会话 / `assistant:turn`。不经 `executeExpertTask`。                                |
| 范围       | 三个助手都改确认层：设定整理、人物试戏、连续性审阅。                                           |
| 新建       | 一律先建成 `world_entry`。模型给的人物/地点等 `document_type` 只是确认层的特化建议。           |
| 更新       | 整段替换已启用世界书或已特化设定卡正文。type 默认不变；确认时可按现有特化规则改 type。         |
| 问题       | 连续性审阅的 `issue` 提案进确认层，走现有 `createIssue`。试戏候选正文不进确认层、不写章正文。  |
| 助手配置   | 同一确认层第二块：资料包 / 角色配置。可分开勾选；与设定/问题同一次确认、同一把锁、失败全回滚。 |
| 未勾选     | 点确认时：未勾选的规划卡、问题、配置提案全部标 `rejected`。                                    |
| 取消       | 关闭确认层不调用 apply：不写盘、不拒绝。该轮留下「确认本轮」以便重开。                         |
| CLI        | 不对 CLI 提供聊天。只对已有会话的某一轮做确认写入，须提交 decisions JSON。                     |
| 旧逐条按钮 | 创作助手 UI 不再调用 `applyAssistantProposal` / `applyAssistantConfigurationProposal`。        |

## 提案形状

扩展 `assistantProposalV1Schema`，旧回合 JSON 仍能解析：

```ts
{
  id: string
  kind: 'planning_record' | 'issue'
  title: string
  document_type: /* 现有名单，不扩 */
  operation?: 'create' | 'update'  // 缺省 = create
  card_id?: string                 // update 必填
  fields: Record<string, unknown>
  content: string
  rationale: string
  status: 'pending' | 'applied' | 'rejected'
  applied_document_id?: string
}
```

约束：

- `operation === 'update'` 必须有非空 `card_id`，且 `kind === 'planning_record'`。
- `kind === 'issue'` 只能 create，不能 update。
- 缺 `operation` 的旧提案按 create 处理。
- 记录回合时就要校验上述约束；非法输出不得写成 pending。

## 确认层

触发：某一轮 `recordAssistantTurn` 成功之后，若该轮存在 `status === 'pending'` 的 `proposals` 或 `configuration_proposals`，桌面立即打开确认层。试戏的 `candidate` 不算。

确认层分两块：

1. **项目写入**：规划卡新建 / 替换、问题提案。新建项可选特化类型与必填字段（与章评估 / 整理世界书相同，走 `specializationTargets` / `requiredSpecializationFields`）。
2. **助手配置**：资料包或角色 diff。只影响新会话。

页脚：确认、关闭。关闭不写入。确认调用 `applyAssistantTurn`。

该轮若仍有 pending，对话里显示「确认本轮」重新打开同一确认层。已全部 applied/rejected 则不再显示。

## 写入：`applyAssistantTurn`

公开函数（名字可微调，语义固定）：

```ts
applyAssistantTurn(
  projectRoot: string,
  sessionId: string,
  turnId: string,
  decisions: {
    confirmed: boolean
    creates: Array<{ proposal_id: string; type?: string; fields?: Record<string, unknown> }>
    updates: Array<{ proposal_id: string; type?: string; fields?: Record<string, unknown> }>
    issues: string[]
    configs: string[]
  },
  expectedTurnSha256: string
): Promise<{
  created_ids: string[]
  updated_ids: string[]
  issue_ids: string[]
  config_ids: string[]
  rejected_ids: string[]
}>
```

规则：

1. `confirmed !== true` → 抛 `提案尚未确认，不能写入。`（复用 `UNCONFIRMED_EVAL`），turn 与项目都不改。
2. `expectedTurnSha256` 与当前 `turn.json` 不符 → 抛 `本轮提案已过期，请重新打开确认。`
3. decisions 里的 id 必须对应该轮 **pending** 提案。找不到或已 applied/rejected → `找不到本轮提案：{id}`。
4. 在 `withProjectWriteLock` 下按顺序：creates → updates → issues → configs，最后一次写 `turn.json`：选中项 `applied`（规划卡带 `applied_document_id`），其余 pending 项 `rejected`。
5. 任一步失败：回滚本次创建的文件、恢复被替换正文的 before-image、恢复已应用的助手配置、恢复 `turn.json`，再抛出原错误。

### 新建

- 用提案的 `title` + `content` 调用 `createWorldEntry`。忽略模型 `document_type` 作为落盘类型。
- `decision.type` 缺省为提案 `document_type`（若不是可特化目标则当 `world_entry`）。
- `type` 为 `world_entry` 或与当前相同：停在世界书。
- 其它 type：同一事务里 `specializePlanningCard`。字段不齐沿用特化中文错误。
- 特化规则与现有函数相同：世界书可特化到允许名单；已特化卡只能转回世界书。新建总是从世界书出发，所以可以直接特化成人物。

### 更新

- 用提案 `card_id` 在项目里找卡。找不到：`找不到要更新的设定卡。`
- `enabled === false`：`不能更新已禁用的设定卡。`
- 目标必须是规划设定卡（世界书或已特化类型）。不能更新大纲、节、章正文、Canon、issue。
- 先整段替换 Markdown 正文（frontmatter 其它字段保留，title 可用提案 title 覆盖若提案 title 非空）。
- 若 `decision.type` 存在且与当前 type 不同：再 `specializePlanningCard`。不能跨类型跳（人物不能直接变地点）；非法组合用现有 `当前类型不能特化为 ${type}。`

### 问题

- `createIssue`，`related_docs` 含该会话 `target.document_id`（若 target 不是 `project`）。
- 正文用提案 `content`。

### 配置

- 对勾选的项调用现有 `applyConfigurationChangePlan(..., true)`。
- 不经 `applyAssistantConfigurationProposal`（那条会单独改 turn.json，破坏整笔回滚）。

## 桌面

- `CreatorAssistantWorkspace`：去掉规划卡 / 配置的逐条「确认写入」。拒绝仍可通过确认层不勾选完成。
- 新增 IPC `assistant:applyTurn`（178 → 179）。overlay 只走这一条。
- 确认层复用 `.chapter-eval-panel`（绝对定位、可滚动、页脚确认、关闭始终可点）。
- 打开助手、切会话、保存、预览：不得自动 apply。

旧 IPC `assistant:applyProposal` / `assistant:applyConfigurationProposal` 本轮可保留，但助手 UI 禁止调用。

## CLI

新命令组，不是 `expert` 子命令（本轮不聊天、不评估）：

```bash
quill assistant apply-turn --project <path> --session <id> --turn <id> --decisions <json-file>
```

`--decisions` 为上面的 `decisions` 对象。没有该文件或 `confirmed` 不是 true：`提案尚未确认，不能写入。` 不提供聊天、不提供 apply-all 默认勾选。

成功打印：

```text
assistant-turn: creates=<n> updates=<n> issues=<n> configs=<n> rejected=<n>
```

## 错误

中文、fail-closed、不写盘（turn.json 也不改，除非确认成功）：

| 情况                            | 错误                               |
| ------------------------------- | ---------------------------------- |
| 未确认就写入                    | `提案尚未确认，不能写入。`         |
| turn hash 过期                  | `本轮提案已过期，请重新打开确认。` |
| decisions 引用不存在/非 pending | `找不到本轮提案：{id}`             |
| 更新目标不存在                  | `找不到要更新的设定卡。`           |
| 更新已禁用卡                    | `不能更新已禁用的设定卡。`         |
| 特化缺字段 / 非法类型           | 与现有特化相同                     |

## 测试

真实项目夹具，不 mock 掉写盘：

1. 未确认：抛 `提案尚未确认，不能写入。`，项目无新世界书，turn 仍 pending。
2. 模型提案 `document_type: character` 的 create：确认且 type 缺省为 character 时，先有世界书再特化，最终在 `characters/`，`world/` 无残留；取消则两处都没有。
3. 更新已启用人物卡正文：type 不变，正文被整段替换。
4. 更新禁用世界书：抛 `不能更新已禁用的设定卡。`，正文不变。
5. 同一轮两条 create，第二条特化缺字段：两条都不落盘，turn 仍全部 pending。
6. 确认层勾选一条 create、不勾选另一条：选中的写入并 applied，未勾选 rejected。
7. 连续性审阅问题提案确认后才有 issue 文件。
8. 桌面：有 pending 的一轮渲染确认层；试戏 candidate 单独存在时不打开确认层。
9. CLI：无 `--decisions` 或 `confirmed: false` 拒绝写入；成功路径打印计数且文件已写。

## 非目标

- 不把对话迁进 `executeExpertTask` / agent-runtime。
- 不新做关系分析、伏笔埋设/回收专家。
- 不改节拆分、节生文、章评估、整理大纲/世界书、展示层、CCv3。
- 不为助手增加项目开关。
- 不在 CLI 里聊天或自动勾选全部 pending。
- 不删除旧的逐条 apply IPC（本轮只禁止助手 UI 调用）。

## 与现状的差

- 今天：三个助手在对话里逐条 `createProjectDocument`；不能改已有卡；模型直接指定人物等类型；配置另条确认；失败不能整笔回滚。
- 本轮：对话仍在；每轮一个确认层；新建世界书可特化；可替换已启用设定卡；问题与配置同一事务；未勾选标拒绝；CLI 只 apply 已有回合。
- 下一轮：关系与伏笔专项专家；以及是否把助手回合迁进 runtime。
