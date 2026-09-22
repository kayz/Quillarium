# Agent 专家模式围栏：分类、门面与章评估

Date: 2026-09-22  
Status: approved  
Parent: `docs/superpowers/specs/2026-09-21-chapter-centered-product-design.md`  
Scope: 把专家任务和节-生文拆开；专家入口不能生成正文；把 `continuity-check` 收成「评估章正文」，并可带补设定提案。不含大纲整理、伏笔专项、自动评估、CCv3、节生文改写。

## 主线

作家主路径上的 AI 是 **专家模式**：整理、分析、评估、补设定。产出是提案，作者确认后才写入。专家模式 **不写正文**。

节-生文仍是项目级可选模块，走自己的入口，不经专家门面，也不再假装「迁进 runtime 就算统一」。

这一轮只做围栏，外加第一条专家能力：对 **已有章正文** 做评估。

## 已锁定的决策

| 主题       | 选择                                                                       |
| ---------- | -------------------------------------------------------------------------- |
| 本轮范围   | 围栏 + 章评估（收口 `continuity-check`）。整理大纲 / 伏笔专家下一轮。      |
| 开关       | 专家模式常开，不进 `project.yaml`。节模块仍可选。                          |
| 任务分类   | `expert` / `generation` / `display` 三类。                                 |
| 专家入口   | 桌面和 CLI 只走专家门面。门面拒绝 `generate_candidate` 和节生文任务。      |
| 评估对象   | 只打已有 **章正文**。节草稿不评估。没有章正文则入口不可用。                |
| 触发       | 作者主动点评估。打开章、保存、提交章正文都不自动跑。                       |
| 问题提案   | 走现有 issue 确认写入。                                                    |
| 补设定提案 | 默认 `world_entry`；表单可选特化类型，字段不齐不能写盘（对齐现有特化）。   |
| 定稿反查   | `finalization-review` 仍留给定稿流程，本轮不改它的写入语义。               |
| 展示卡设计 | `setting-card-design` / `display-card-design` 属 `display`，不经专家门面。 |
| 人物试戏   | 仍可走专家门面，但本轮去掉其 `generate_candidate` 上限。                   |

## 任务分类

每个 `AgentTaskDefinition` 增加只读 `lane: 'expert' | 'generation' | 'display'`（实现时可放在定义上或并列注册表，语义不得含糊）。

| `id`                  | lane       | 本轮动作                                   |
| --------------------- | ---------- | ------------------------------------------ |
| `import-material`     | expert     | 只分类；不改流程                           |
| `planning-card`       | expert     | 只分类；不改流程                           |
| `organize-setting`    | expert     | 只分类；不改流程                           |
| `continuity-review`   | expert     | 只分类；不改流程                           |
| `continuity-check`    | expert     | **收口为章评估**；可附带补设定提案         |
| `finalization-review` | expert     | 分类为专家，入口仍在定稿流程，本轮不改语义 |
| `character-rehearsal` | expert     | 去掉 `generate_candidate`                  |
| `scene-generation`    | generation | 不进专家门面                               |
| `setting-card-design` | display    | 不进专家门面                               |
| `display-card-design` | display    | 不进专家门面                               |

规则：

- `expert` 的 `capability_ceiling` 不得包含 `generate_candidate`。
- `generation` 不得经专家门面调用。
- `display` 不得经专家门面调用；展示层开关仍管卡面设计入口。

## 专家门面

公开语义（实现时可改名，不得弱化）：

```ts
executeExpertTask(input): Promise<ExpertTaskResult>
```

门面负责：

1. 解析任务 `lane`，非 `expert` 则抛：`专家门面只接受专家任务。`
2. 拒绝 `generate_candidate` 操作，即使旧定义里还带着：`专家模式不能生成正文。`
3. 调用现有 `@quillarium/agent-runtime` 执行器跑专家任务。
4. 返回 **未确认提案**。不得在门面里写项目事实文件。

节模块继续用自己的 IPC/CLI 调 `scene-generation`。那条路径不经过 `executeExpertTask`。

已迁入 runtime 的规划完整性检查（桌面「内容检查」面板 / `planning-integrity-review`）视为 `expert`。本轮不改它的批次与 issue 写入语义，也不把它和「评估章」合成一个按钮。它不得新增 `generate_candidate`。

桌面：专家相关按钮（含「评估章」）只调用门面。不要在 IPC 里再开一条能直接 `generate_candidate` 的专家通道。

## 章评估

目标：作者在有章正文的章上点评估。

前置：该章已有章正文（场景模块开着、正文尚未提交时，入口禁用，不调用模型）。

输入：项目根、章 ID、作者语言。不扫节草稿。

`continuity-check` 对本轮的合同：

- 上下文以该章正文为当前目标，外加既有 Canon / 设定 / 时间线范围（沿用任务已有 `context_scopes`，不在本轮发明新的编译器）。
- 结果包含：
  - 零个或多个 **问题提案**（现有 `issue_proposal`）
  - 零个或多个 **补设定提案**（`planning_proposal`，默认 `type: world_entry`）
- 模型不能把任一提案标成已确认。

补设定提案：

- 默认写成世界书 `world_entry`。
- 作者可在确认表单里选特化类型（与现有特化允许清单相同）。
- 选 typed 时，必填字段不齐 → 拒绝写入，中文错误沿用特化那一套（字段缺失说清缺哪项）。
- 确认写入走现有规划卡创建；若选了 typed，则创建后立刻走现有 `specializePlanningCard`（同一作者确认事务里，失败则整笔不写）。

问题提案确认走现有 issue 写入。取消或关闭面板：磁盘不变。

## 错误

中文、fail-closed、不写盘：

| 情况                              | 错误                       |
| --------------------------------- | -------------------------- |
| 专家门面接到生文/展示任务         | `专家门面只接受专家任务。` |
| 专家任务仍带 `generate_candidate` | `专家模式不能生成正文。`   |
| 章没有正文就评估                  | `没有章正文，不能评估。`   |
| 未确认就写入                      | `提案尚未确认，不能写入。` |
| 补设定 typed 字段不齐             | 与特化相同的中文缺字段错误 |

打开章、保存、提交章正文、开关节模块：都不得调用评估。

## 测试

真实项目夹具，不 mock 掉写盘：

1. 章有正文：点评估得到提案；此时项目里还没有新的 issue / 世界书文件。
2. 作者确认问题提案后才出现 issue 文件；确认补设定后才出现 `world/`（或特化后的目标目录）文件。
3. 章无正文：评估拒绝，中文 `没有章正文，不能评估。`，无模型调用（适配器/门面短路）。
4. 经专家门面请求 `scene-generation`：抛 `专家门面只接受专家任务。`
5. `character-rehearsal` 经门面不得再带 `generate_candidate`。
6. 节模块开着、章正文未提交：桌面不展示可点的评估（或点了等同无正文拒绝）。

## 非目标

- 不做大纲整理、关系分析、伏笔管理等新专家任务。
- 不改节拆分、节生文、全章节确认后写章正文。
- 不把节生文迁进专家门面或 runtime「统一」。
- 不改 CCv3、项目封面、展示层配图。
- 不自动评估。
- 不为专家模式增加项目开关。
- 不改 `finalization-review` 的定稿写入语义。
- 不把 HTML 卡设计收进专家门面。

## 与现状的差

- 今天：`scene-generation`、检查、整理、HTML 卡设计同在一份任务目录；`character-rehearsal` 的上限含 `generate_candidate`；项目规划检查与章/节内容检查入口混在写作界面里。
- 本轮：三类 lane + 专家门面；章评估只打章正文，可带补设定提案；生文仍只在节模块。
- 下一轮：整理大纲/世界书、分析漏洞与关系、伏笔等专项专家任务。
