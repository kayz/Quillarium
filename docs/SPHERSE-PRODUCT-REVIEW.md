# Spherse 对 Quillarium 的产品与架构启示

> 状态：研究证据、采用矩阵与当前实现记录；产品规范以 ADR 和设计文档为准  
> 评审日期：2026-08-16  
> 决策对象：Quillarium 产品、领域模型、上下文编译、运行审计与后续自动化  
> 外部代码基线：Spherse [`10f5d6a8b357d6e2fc5615e9a8feb62474383b8e`](https://github.com/mengrru/spherse/tree/10f5d6a8b357d6e2fc5615e9a8feb62474383b8e)  
> Quillarium 基线：本地工作区（当时的 `HEAD` 为 `b527abd3e9bebb54ca2db6f5ace45eac00f06a14`）  
> 研究关系：只借鉴抽象产品和架构机制；不复制源码、提示词、界面资产或命令定义

## Executive Summary（执行摘要）

- **应当借鉴“一个工作角色长期绑定多份项目资料”的能力，但不应把 Quillarium 改造成通用 Agent 工作区。** 视频最有价值的并非一次选择多个附件，而是把行为提示、稳定资料集、权限和输出去向组合成可复用角色，让用户从原始世界观快速走到结构化资料、角色代理、互动页面和自动更新。
- **Quillarium 已在自身上下文基础上完成第一阶段领域化实现。** 当前代码已有版本化 `ContextBundleV1`、`CreatorRoleV1`、产品任务契约、可恢复会话、探索文档、结构化提案、PromptEnvelope 和完整执行快照。提示来源卡也已经改为由可信进程解析的临时 ContextBundle overlay，可保存为资料包。
- **这并不意味着所有旧 AI 流程已经由一个运行器执行。** 创作助手闭环使用统一的类型、权限和快照；scene generation 已接入通用 product snapshot。Import、Planning、Check、Finalization 仍保留各自业务入口与旧 Run 兼容，并按同一任务契约和快照逐步适配。因此当前是“统一执行协议和审计边界”，尚不是一个取代全部领域服务的通用 Agent runtime。
- **基础设施采用明确分期。** 路径 containment、符号链接防逃逸、项目写锁、原子写、旧哈希冲突和运行时 schema 已落地；外部文件 watcher、可暂停审批控制总线和写后领域事件进入 P1。移动访问、通用 MCP、任意 HTML 工作台和通用触发器继续暂缓。

## 已作出的产品判断

| 分类     | Spherse 机制/方向                             | Quillarium 决策                                                                   | 当前实现状态                                                   |
| -------- | --------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 采用     | 纯数据、可版本控制的长期角色与资料组合        | 用产品任务、资料包、创作助手三个对象明确所有权                                    | v1 schema、CRUD、稳定 ID 引用和桌面入口已实现                  |
| 采用     | 写入互斥、路径访问边界、运行时 schema         | 作为通用安全底座独立实现                                                          | 项目写锁、原子写、SHA-256 冲突、containment/符号链接测试已实现 |
| 调整采用 | Agent 长期绑定行为、资料和权限                | `CreatorRole` 只绑定一个 `ContextBundle` 和 `WritingPreset`，权限是任务上限的子集 | 已实现；中文产品名统一为“创作助手”                             |
| 调整采用 | AI 建议创建/修改 Agent                        | 只生成结构化配置 diff；高风险变更高亮，作者批准后由服务写入                       | 已实现；会话冻结，配置只影响新会话/分支                        |
| 调整采用 | 会话与长期记忆                                | 完整对话保存在 Run；长期结论追加到 advisory 探索文档                              | 已实现；探索默认不进入上下文                                   |
| 调整采用 | 多文件上下文                                  | 保存稳定领域身份，运行时走确定性编译、权威、token 与 trace                        | 已实现；required 阻断，preferred 告警                          |
| 延后     | watcher、运行中审批控制总线、写后领域事件     | 作为 P1 基础设施，不与第一版助手闭环绑定                                          | 未实现                                                         |
| 延后     | 领域配方、技能、连接器、移动访问              | 等章节闭环与领域事件稳定后再评估                                                  | P2 或更后                                                      |
| 拒绝     | 通用聊天事实源、无界全文注入、任意脚本/触发器 | 违反小说事实权威、复现与权限边界                                                  | 明确非目标                                                     |
| 拒绝     | 任意 HTML 工作台、Spherse 兼容层或源码复制    | Quillarium 保持领域 UI 和独立 MIT 实现                                            | 无依赖、无兼容目标、无代码复制                                 |

## 视频展示的核心不是“多附件”，而是一个压缩后的创作闭环

**视频中的惊艳感来自多个能力连续工作，而不是单个文件选择控件。** 演示将一份大体量设定输入转为项目文件，再把特定角色和相关文件绑定成独立 Agent，最后生成可交互界面并安排更新。对 Quillarium 而言，真正值得借鉴的是这条低摩擦路径。

### 视频事实时间线

| 时间                                                              | 观察到的操作                                                                        | 可确认的产品能力                                                             | 对 Quillarium 的启示                                                  |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| [00:01–00:58](https://www.bilibili.com/video/BV11Tuz6VEay/?t=1)   | 下载/打开应用、建立空白项目、配置模型                                               | 本地项目和模型连接是首次使用基础                                             | 新用户应能从空项目快速得到可工作的默认流程                            |
| [00:58–01:29](https://www.bilibili.com/video/BV11Tuz6VEay/?t=58)  | 创建“世界观创作小助手”、开启高级权限、使用预设提示并开始会话                        | Agent 有独立用途、提示与权限                                                 | Quillarium 的角色也需要用途与操作边界，但权限必须是领域化的           |
| [01:35–02:12](https://www.bilibili.com/video/BV11Tuz6VEay/?t=95)  | 输入一份包含世界、人物、技术等内容的大提示，助手将其整理为结构化文件                | 原始材料可通过 Agent 转化为长期项目资产                                      | 可设计“导入/整理设定”流程，但写入应走提案和校验                       |
| [02:17–03:07](https://www.bilibili.com/video/BV11Tuz6VEay/?t=137) | 继续整理人物并检查生成文件                                                          | 会话与文件工作区形成反馈循环                                                 | 结构化结果应能在文档视图检查，而不是只留在聊天记录里                  |
| [03:08–05:59](https://www.bilibili.com/video/BV11Tuz6VEay/?t=188) | Agent 提议并生成主题化资料面板，支持明暗主题和设定导航                              | 项目文件能被转为可消费的交互界面                                             | Quillarium 可强化角色/地点/关系的产品化视图，不必依赖任意 HTML        |
| [06:05–06:38](https://www.bilibili.com/video/BV11Tuz6VEay/?t=365) | 创建人物卡片                                                                        | 项目知识可派生为面向使用的内容资产                                           | 可提供角色卡上的“试戏/访谈/视角检查”等领域动作                        |
| [06:43–07:16](https://www.bilibili.com/video/BV11Tuz6VEay/?t=403) | 让世界观助手创建人物 Agent；写操作要求批准；新 Agent 自动获得角色提示和多份相关文件 | Agent 可被 AI 配置，且持久绑定人物、关系、世界规则等资料；持久化写入有批准门 | 这是本次评审中最值得落地的交互：AI 提议角色配置，用户审阅后保存       |
| [07:23–09:30](https://www.bilibili.com/video/BV11Tuz6VEay/?t=443) | 创建学生论坛页面，与人物互动、发帖并获得人物回复；提到用触发器每日更新公告          | 同一项目资料可驱动角色模拟、界面和自动任务                                   | Quillarium 可把模拟作为创作探索，但自动结果不可越过事实权威和接受流程 |
| [09:40–10:24](https://www.bilibili.com/video/BV11Tuz6VEay/?t=580) | 通过 Cloudflared/隧道和二维码在移动端访问                                           | 本地项目可以经临时网络桥接到手机                                             | 属于后续分发能力，不应先于核心创作闭环                                |
| [10:26–11:36](https://www.bilibili.com/video/BV11Tuz6VEay/?t=626) | 展示其他类型项目和远程使用方式                                                      | Spherse 的目标是通用 Agent 基础设施                                          | 进一步说明两者产品定位不同，不宜按功能数量追求对齐                    |

视频来源为 [Bilibili：我做了个Agent应用，可以让你的OC世界观变成活的生态系统](https://www.bilibili.com/video/BV11Tuz6VEay/)；页面显示作者为 `-Monroe-`，时长约 11 分 56 秒，发布于 2026-08-11。上述内容来自完整观看、关键画面核对和本地语音转写后的事实提取，不保存或传播完整字幕。

### 演示证明、源码证明与尚未证明的内容

| 证据层级         | 可以下的结论                                                                                                                                        | 不能据此下的结论                                                               |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 视频直接观察     | 产品确实提供创建 Agent、设置提示/权限、生成项目文件、批准写操作、绑定多份资料、创建互动页面和移动访问的演示路径                                     | 不能仅凭视频判断异常恢复、并发安全、权限无旁路、迁移兼容或大项目性能           |
| 固定提交源码     | Agent profile 中有 `context` 文件数组；运行时读取这些文件并注入系统上下文；创建/更新 Agent 经过审批包装；另有 watcher、路径策略和控制总线等基础设施 | 不能把“存在实现”自动等同于完全满足 Quillarium 的权威、预算、追踪和领域审计要求 |
| 本报告的产品推断 | 把提示、资料集和权限组合成长期角色能降低重复设置成本；Quillarium 现有编译器可以成为更安全的实现底座                                                 | 还没有用户研究证明最终命名、默认角色数量、动态选择器或移动端优先级             |

## Spherse 的实现确认了“提示 + 多文件 + 权限”是持久角色配置

**源码表明视频中的多文件能力是 Agent profile 的一部分，而不是一次性上传。** Agent 编辑表单同时提供系统提示和上下文路径字段；`manage_agent` 用项目相对路径数组创建或整体替换 profile 的 `context`；会话启动时逐项读取，再把每份文件序列化为带路径标识的上下文段落。

| 机制          | 固定提交证据                                                                                                                                                                                                                                                                                                                                 | 产品含义                                                                              | 对 Quillarium 的限制/改造                                                              |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Agent 表单    | [`AgentDialogForm.tsx`](https://github.com/mengrru/spherse/blob/10f5d6a8b357d6e2fc5615e9a8feb62474383b8e/packages/app/src/features/agent-dialog/AgentDialogForm.tsx)、[`ContextPathField.tsx`](https://github.com/mengrru/spherse/blob/10f5d6a8b357d6e2fc5615e9a8feb62474383b8e/packages/app/src/features/agent-dialog/ContextPathField.tsx) | 提示和多个项目文件共同定义一个长期 Agent                                              | 应把裸路径选择升级为领域文档、权威、用途、必需性和预算可见的来源卡                     |
| AI 管理 Agent | [`manage-agent.ts`](https://github.com/mengrru/spherse/blob/10f5d6a8b357d6e2fc5615e9a8feb62474383b8e/packages/core/src/tools/manage-agent.ts)、[`tools/index.ts`](https://github.com/mengrru/spherse/blob/10f5d6a8b357d6e2fc5615e9a8feb62474383b8e/packages/core/src/tools/index.ts)                                                         | AI 能检查、创建和修改 Agent；写动作要求显式批准                                       | 只允许生成类型化配置 diff，不能借此获得任意项目写权限                                  |
| 上下文读取    | [`read-context-files.ts`](https://github.com/mengrru/spherse/blob/10f5d6a8b357d6e2fc5615e9a8feb62474383b8e/packages/core/src/context/read-context-files.ts)                                                                                                                                                                                  | 逐个解析项目路径、检查访问并读取 UTF-8 内容；失败项会被跳过                           | Quillarium 对 required 来源必须阻止运行，对 preferred 来源应告警，不能静默丢失关键事实 |
| 会话装配      | [`live-session.ts`](https://github.com/mengrru/spherse/blob/10f5d6a8b357d6e2fc5615e9a8feb62474383b8e/packages/core/src/session/live-session.ts)                                                                                                                                                                                              | 项目指令、Agent profile、会话上下文、技能目录和预载文件共同进入系统提示               | Quillarium 必须继续通过确定性编译、权威排序、精确 token 预算和选择轨迹装配             |
| 文件序列化    | [`serialize.ts`](https://github.com/mengrru/spherse/blob/10f5d6a8b357d6e2fc5615e9a8feb62474383b8e/packages/core/src/context/serialize.ts)                                                                                                                                                                                                    | 每份完整文件带路径标签注入                                                            | 不采用无界全文注入；应按来源类型选择、截断、摘要或引用，并记录哈希                     |
| profile 格式  | [`data-conventions.md`](https://github.com/mengrru/spherse/blob/10f5d6a8b357d6e2fc5615e9a8feb62474383b8e/docs/official/data-conventions.md)                                                                                                                                                                                                  | Agent 配置用纯文本 frontmatter 表达，`context` 是项目相对路径列表                     | 可借鉴纯数据、可版本控制，但应使用稳定文档 ID 和 schema version                        |
| 基础设施边界  | [`architecture.md`](https://github.com/mengrru/spherse/blob/10f5d6a8b357d6e2fc5615e9a8feb62474383b8e/docs/official/architecture.md)                                                                                                                                                                                                          | 核心、服务、桌面、Web、预设、SDK 等分层；包含工具审批、路径控制、触发器、技能和移动端 | 借鉴边界和保障措施，不照搬通用运行时的产品表面                                         |

Spherse 还实现了值得单独评估的 [`fs-watcher.ts`](https://github.com/mengrru/spherse/blob/10f5d6a8b357d6e2fc5615e9a8feb62474383b8e/packages/server/src/lib/fs-watcher.ts) 和 [`control-bus.ts`](https://github.com/mengrru/spherse/blob/10f5d6a8b357d6e2fc5615e9a8feb62474383b8e/packages/core/src/session/control-bus.ts)。它们分别处理外部文件变化和运行中的用户问题/审批；这些属于可独立吸收的工程模式，并不要求采用 Spherse 的 Agent 产品模型。

### 仓库基线与包边界

| 项目       | 评审基线                                   | 提交时间与主题                                                                    | 工作区/许可证                               |
| ---------- | ------------------------------------------ | --------------------------------------------------------------------------------- | ------------------------------------------- |
| Spherse    | `10f5d6a8b357d6e2fc5615e9a8feb62474383b8e` | 2026-08-15 22:57:02 +08:00；`feat: LLM ask_user 工具——运行中向用户提问并等待回答` | 克隆于 `C:\github\spherse`，评审时干净；MIT |
| Quillarium | `b527abd3e9bebb54ca2db6f5ace45eac00f06a14` | 2026-08-14 07:51:21 +08:00；`feat(desktop): complete branded Windows shell`       | 当前本地工作区包含用户已有未提交改动；MIT   |

Spherse 的 `packages` 分为 `core`（Agent/会话/工具/上下文）、`server`（API、存储和文件同步）、`app`（React 产品界面）、`desktop`、`web`、`presets`、`i18n`、`sdk` 和 `landing`。这是一套围绕同一通用 Agent 运行时提供多宿主、多入口和可扩展能力的结构。

Quillarium 当前的共享包分为 `core`（小说领域模型、项目和运行）、`ai`（模型边界）、`checks`（质量/连续性检查）、`cli` 和 `sillytavern`（可选适配边界），桌面应用位于 `apps/desktop`。其边界天然更适合让不同 AI 能力调用同一领域服务，而不是让任意 Agent 各自成为状态中心。

## 两个项目共享本地优先基础，但围绕不同的“真相”工作

**最大的差异不是技术栈，而是系统把什么当作核心对象。** Spherse 围绕 Agent、会话、项目文件和工具构建通用工作区；Quillarium 围绕小说项目、写作目标、章节/场景、生成运行、接受与定稿构建领域生产系统。

### 相同点

- 都以本地项目和普通文件为重要资产，强调用户拥有数据。
- 都使用 TypeScript、React、Electron/桌面壳和分包结构。
- 都需要模型连接、提示装配、AI 工具和项目范围内的数据访问。
- 都面对外部编辑、文件路径安全、持久化写入、用户批准和可恢复性问题。
- 都能从“多个专门角色/任务入口”获益，而不是只提供一个无差别聊天框。

### 关键差异

| 比较维度   | Spherse                                        | Quillarium                                                               | 产品结论                                            |
| ---------- | ---------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------- |
| 产品中心   | 通用 Agent、会话、工具和项目工作区             | 长篇小说的规划、起草、检查、接受、定稿与连续性                           | 只吸收机制，不改变领域中心                          |
| 首要真相   | 任意项目文件和各 Agent 会话状态                | Markdown/YAML 项目文档、权威层级、已接受正文和 Canon                     | 任何角色输出都必须服从现有权威模型                  |
| 上下文模式 | profile 固定路径列表，加项目/会话/技能内容     | 确定性 `ContextPolicy`、类型化 `PromptBlock`、预算、哈希、`ContextTrace` | 在编译器上增加可复用选择配置，不绕开编译器          |
| 路径身份   | 以项目相对路径为主                             | 文档类型、领域 ID、关系和当前路径共同参与                                | 上下文包应保存稳定类型 + ID，运行时解析路径         |
| 缺失来源   | 预载读取失败可跳过                             | 权威事实缺失会改变生成可靠性                                             | 区分 required 与 preferred，并在预览中显式阻止/警告 |
| 模型写入   | 通用文件工具、Agent 管理和触发任务，经工具审批 | 类型化提案、比较、选择、接受、定稿与审计                                 | 不给角色通用写权限，只给领域操作能力                |
| 输出地位   | 会话和文件可作为 Agent 工作结果                | 草稿、候选、已接受正文、Canon、派生摘要有严格区别                        | 角色扮演/讨论默认进入探索材料或候选，不自动晋升     |
| 自动化     | 通用定时/事件触发器                            | 计划中的类型化生命周期事件和领域配方                                     | 先领域事件，后受限配方；不提供任意脚本语言          |
| UI 责任    | 可生成任意 HTML，借 SDK/宿主运行               | 产品拥有章节、角色、关系、运行和审计界面                                 | 优先增强结构化产品界面；任意页面不是核心路线        |
| 会话历史   | 是 Agent 工作连续性的主要部分                  | 不应取代项目事实、已接受正文或可重建摘要                                 | 聊天只能作为输入/证据，不能成为隐含 Canon           |
| 运行复现   | 侧重 Agent session 和项目现场                  | 要求精确提示、预设、来源哈希、编译轨迹、候选谱系                         | 每次使用角色仍须产生不可变运行快照                  |
| 分发范围   | 桌面、Web、移动桥接和通用项目                  | 小说项目、Obsidian/Git 友好工作流和桌面创作体验                          | 移动访问排在核心编写/审阅闭环之后                   |

Quillarium 的对应依据包括 [DESIGN.md](DESIGN.md)、[AGENT-DESIGN.md](AGENT-DESIGN.md)、[上下文激活 ADR](adr/ADR-context-activation.md)、[`context-compiler.ts`](../packages/core/src/context-compiler.ts)、[`types.ts`](../packages/core/src/types.ts)、[`chapter.ts`](../packages/core/src/chapter.ts)、[`AIWritingWorkspace.tsx`](../apps/desktop/src/features/writing/AIWritingWorkspace.tsx) 和 [`scene.ts`](../apps/desktop/electron/ipc/scene.ts)。

## Quillarium 当前实现：持久组合已落地，旧流程仍在逐步统一

写作工作区原有的 `PromptBlock`、`ContextPolicy`、精确 token 预算和 `ContextTrace` 仍是知识装配底座。本轮在其上补齐了：

1. **具名组合与稳定引用。** `context-bundles/<id>.yaml` 保存领域文档类型与稳定 ID，不保存路径；当前提示来源可保存为资料包。
2. **明确必需性。** required 来源的缺失、重复、越界或不可读会阻止执行；preferred 只产生进入快照的警告。
3. **可复用助手。** `creator-roles/<id>.yaml` 绑定一个资料包、一个预设、行为和受任务上限约束的操作。
4. **可解释预览。** 桌面端在运行前显示来源、用途、权威、token、选择原因、缺失状态、有效权限和结果去向。
5. **恢复与复现。** 会话冻结配置版本，每轮重新读取项目并保存精确消息、编译块、trace、原始/修复结果和哈希；失败轮可恢复。
6. **审阅边界。** 规划、问题和配置都先形成提案。模型不能接受正文、写 Canon、应用定稿影响或批准自己的扩权。

目前仍有一个重要限制：这些对象和快照构成统一的 **Agent 执行协议**，但不是一个已经替换全部旧业务入口的统一运行器。创作助手完整使用该协议；scene generation 已写入 product execution snapshot；Import、Planning、Check 和 Finalization 仍由现有 IPC/领域服务执行并保留旧 Run 读取兼容，后续逐项适配。这个限制避免为了形式统一而重写已经稳定的接受和定稿边界。

## 已采用的产品模型：资料包负责“知道什么”，创作助手负责“为何与如何工作”

### 1. `WritingPreset`：模型怎样运行

继续承载模型配置、系统提示/用户指令、提示块顺序、`ContextPolicy`、检查策略、预算和采样参数。现有定义可见 [`types.ts`](../packages/core/src/types.ts)。它不应同时成为任意项目文件收藏夹。

### 2. `ContextBundle`：本次工作知道哪些项目知识

`ContextBundle` 保存用户的选择意图，而不是预编译后的全文。来源可包含固定领域文档、当前目标/场景等动态引用、关系选择器、排除项和 required/preferred 语义。运行时仍由现有编译器解析、排序、预算和追踪。

当前 v1 数据只保存稳定身份和有限选择意图：

```yaml
schema_version: 1
id: character-rehearsal
version: 1.0.0
title: 人物试戏资料包
description: 用于角色访谈、场景试演和动机检查
sources:
  - document_type: character
    document_id: character-a
    mode: required
    usage: subject
dynamic_selectors:
  - kind: explicit_relations
    mode: preferred
    usage: evidence
    max_depth: 1
  - kind: active_timeline_context
    mode: preferred
    usage: constraint
exclusions: []
```

关键约束：

- 配置保存稳定的领域类型与 ID；路径只是在本次运行解析出的结果。
- `required` 缺失、无权访问或无法解析时阻止生成；`preferred` 失败时显示警告并进入轨迹。
- 动态选择器必须确定性、有限深度、可预算并可在运行前预览。
- 上下文包不保存凭据，不携带隐式写权限，也不改变项目事实权威。
- 修改包只影响未来运行；旧运行保存当时的解析结果、版本/哈希和来源哈希。

### 3. `CreatorRole`：一个可复用的创作助手

代码名保留 `CreatorRole`，中文界面统一称“创作助手”。它组合任务、行为指令、资料包、写作预设、允许的领域操作和默认输出去向。

```yaml
schema_version: 1
id: character-rehearsal
version: 1.0.0
title: 人物试戏助手
description: 在当前时空和关系约束下探索人物反应
task_id: character-rehearsal
behavior_instructions:
  - Treat rehearsal as exploration, not Canon.
context_bundle_id: character-rehearsal
writing_preset_id: default
enabled_operations:
  - converse
  - append_exploration
  - propose_configuration_change
output_disposition: exploration
```

关键约束：

- `allowed_operations` 只能引用 Quillarium 定义的类型化命令；不能嵌入 shell、任意脚本或通用文件写入。
- 助手行为属于可版本化配置。AI 可以提出新版本，但保存前必须显示变更和影响范围。
- `output_disposition` 明确结果是 exploration、candidate、planning proposal、issue proposal 等；不得写入 Canon 或覆盖已接受正文。
- 角色引用的是 `ContextBundle` 和 `WritingPreset`，而不是复制它们的全部内容；运行时记录解析后的精确快照。

### 三者关系

| 对象            | 回答的问题                           | 可复用范围                     | 是否授予权限             | 运行时是否重新解析           |
| --------------- | ------------------------------------ | ------------------------------ | ------------------------ | ---------------------------- |
| `WritingPreset` | 模型、提示结构、预算和检查怎样运行？ | 多个目标、上下文包和角色       | 否                       | 是                           |
| `ContextBundle` | 本次需要哪些项目知识？               | 多个目标、角色和配方           | 否                       | 是，解析为精确 `PromptBlock` |
| `CreatorRole`   | 以什么用途、行为和允许操作开展工作？ | 角色卡动作、写作任务和未来配方 | 是，但仅限类型化领域操作 | 是，解析其引用并生成快照     |

## 目标工作流：任何惊艳体验都不能绕过编译与审阅

```mermaid
flowchart LR
    A["用户选择用途或角色卡动作"] --> B["创建/应用 CreatorRole"]
    B --> C["解析 ContextBundle"]
    C --> D["Context Compiler：权威、关系、预算、截断"]
    D --> E["预览来源、token、缺失项与权限"]
    E --> F["生成候选/探索结果"]
    F --> G["保存角色、上下文包、预设与来源快照"]
    G --> H["生成结构化变更提案或问题"]
    H --> I["用户审阅、接受或拒绝"]
    I --> J["由领域服务执行已批准写入"]
```

### 默认体验示例：从角色卡创建“角色试戏”

1. 用户在人物卡点击“角色试戏”。
2. 系统建议一个上下文包：人物档案、当前状态、已知关系、所在地点、相关 Canon、当前场景和叙事限制。
3. 用户在预览中看到每个来源的类型、权威、required/preferred、预计 token、选择原因、是否已变更或缺失。
4. 系统应用“角色试戏”创作角色和指定 `WritingPreset`，但不赋予 Canon 写权限。
5. 生成的对话或试演进入探索运行；系统可以从中提出“人物动机笔记”“连续性问题”或“候选场景”，但不能直接改事实。
6. 用户审阅提案后，领域服务才执行相应写入；接受/定稿仍遵循现有生命周期。

### 工作区交互改造

- 现有提示来源栏已经支持可信进程重新解析，并可把当前来源保存为资料包；通用资料包管理仍通过创作助手配置逐步披露。
- 来源卡展示类型、稳定 ID、当前路径、权威、用途、required/preferred、token、哈希状态、缺失/变更状态和选择原因。
- 创作助手工作区的右栏展示资料包解析结果、有效权限、输出去向和版本；资料包与助手公共 CRUD 已由 core/IPC 提供。
- 允许 AI 点击式建议角色/包，但提交的是结构化 diff；批准界面列出新增来源、删除来源、权限变化和 token 影响。
- 运行检查器显示解析到的角色版本、上下文包版本、预设版本、精确来源哈希、编译顺序、截断和未采用原因。
- 首次使用只复制“设定整理”“人物试戏”“连续性审阅”三个内置模板，不开放无限制工具市场。

## 实施记录：先交付可审计闭环，再继续基础设施

本轮已经完成 ADR、版本化 schema、稳定来源解析、ContextBundle/CreatorRole CRUD、权限矩阵、结构化执行、会话恢复/分支、探索文档、配置 diff、运行快照和桌面三助手闭环。旧项目在没有新对象时行为不变；内置模板首次使用才写入项目；旧 Run 不迁移也不静默重写。

验收覆盖非法 ID、重复/悬空引用、未来版本、助手扩权、非法输出类型、required/preferred、稳定 ID 重命名、确定性顺序/token/hash、提示注入边界、结构化输出修复、路径穿越、符号链接逃逸、并发旧哈希冲突和失败轮恢复。产品规范见 [Agent/ContextBundle ADR](adr/ADR-agent-runtime-and-context-bundles.md)。

### 基础设施并行轨：优先吸收六项安全能力

| 状态    | 能力                | 当前边界 / 下一步                                                                 |
| ------- | ------------------- | --------------------------------------------------------------------------------- |
| 已采用  | 运行时 schema 边界  | 核心持久化对象、结构化模型输出与 IPC contract 已校验；未来宿主继续复用同一 schema |
| 已采用  | 路径分类与访问策略  | 新对象按项目 containment 和真实路径检查，覆盖穿越、链接逃逸与重命名               |
| 已采用  | 文件写互斥 + 原子写 | 新对象使用项目级可重入锁、原子替换和旧哈希冲突；不得以最后写入者覆盖外部修改      |
| 延后 P1 | 外部变更监听        | 监听 Obsidian、编辑器和 Git，合并抖动并区分自身写入                               |
| 延后 P1 | 运行控制总线        | 在长任务中统一提问、批准、取消、超时和进程重启后的恢复                            |
| 延后 P1 | 写后领域事件        | 仅在领域服务成功提交后发布，不授予文件、网络或 AI 权限                            |

这些能力可以参考 Spherse 的分层和实现思路，但必须由 Quillarium 独立设计与实现。当前相关内部入口包括 [`contract.ts`](../apps/desktop/electron/ipc/contract.ts) 和 [`fs.ts`](../packages/core/src/fs.ts)。

### P2：让领域配方复用角色与上下文包

**目标：在创作助手交付门禁稳定后，把可复用配置组合为受限生产流程。**

- 配方步骤只能调用类型化 Quillarium 操作，例如装配上下文、生成多个候选、检查、比较、选择、提出接受和执行获批定稿。
- `CreatorRole` 和 `ContextBundle` 作为配方输入，而不是把一段通用命令或脚本嵌入配方。
- 触发条件来自成功写后的领域事件；每一步保留输入、输出、批准者和运行谱系。
- 默认由用户触发。定时或无人值守模式必须另做威胁模型、失败恢复和通知设计。

这与现有 [ROADMAP.md](../ROADMAP.md) 中“先类型化生命周期事件，再做声明式章节配方，插件延后”的顺序一致。

### 后续候选项，不进入当前承诺

- **分层领域技能。** 把“整理设定”“人物访谈”“连续性审阅”等封装为有版本的领域方法；先做内置，再评估扩展机制。
- **MCP/外部连接器。** 仅在有明确创作场景时接入，逐连接器声明网络、读取和写入权限；外部数据不能自动成为 Canon。
- **受限展示 SDK。** 若确有项目仪表板需求，优先提供只读、类型化查询和宿主组件，而不是任意 HTML 获得项目文件权限。
- **移动访问。** 等桌面闭环和本地安全模型稳定后，再评估局域网或隧道方案、认证、会话吊销和秘密泄露风险。
- **多语言与更新交付。** 可借鉴 Spherse 的工程成熟度，按 Quillarium 发布计划单独推进。

## 明确不采用的部分

1. 不把通用 Agent、聊天会话或每个 Agent 的数据库状态升级为项目事实源。
2. 不用无界的“把所选文件全文全部塞进系统提示”替代上下文编译器。
3. 不把裸路径作为长期唯一身份；不允许重命名后静默漏掉关键文件。
4. 不让 Agent 自行创建另一个高权限 Agent 并立即生效；所有持久化或权限扩张都需要审阅。
5. 不把角色扮演回复、论坛内容、聊天摘要或模型记忆直接视为 Canon。
6. 不提供通用 shell、任意命令语言或任意 JavaScript 作为核心自动化接口。
7. 不让生成的 HTML 成为核心编辑器或绕过领域服务直接读写项目。
8. 不以功能对齐、文件格式兼容或运行时依赖 Spherse 为目标。
9. 不复制 Spherse 的源码、提示词、UI、文案、命令定义或配置格式细节。

## 风险与缓解

| 风险                    | 可能后果                               | 设计缓解                                                       | 必要测试/观测                                   |
| ----------------------- | -------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------- |
| 多文件导致 token 爆炸   | 成本、延迟上升，关键资料被截断         | 所有来源进入编译器；优先级、预算、摘要/截断规则可预览          | 大项目预算边界、不同 tokenizer、预览/实际一致性 |
| 文件重命名或移动        | 角色悄悄失忆                           | 保存稳定 ID，集中 resolver；显示当前路径和失效状态             | 重命名、跨目录移动、ID 冲突、删除恢复           |
| required 文件缺失       | 生成建立在残缺事实之上                 | required 阻止，preferred 告警；轨迹记录失败原因                | 缺失、无权限、编码失败、损坏 frontmatter        |
| 项目文档中的提示注入    | 资料文本试图改变系统行为或索取工具权限 | 指令与证据分层；来源按不可信数据处理；工具由角色 schema 决定   | 恶意文档、越权工具请求、指令边界回归            |
| 不同来源权威冲突        | 模型选择错误事实                       | 固定项目权威层级，冲突在预览和检查中显式化                     | Canon/草稿/摘要冲突矩阵                         |
| AI 配置导致权限升级     | 模型借修改角色获得写权限               | 结构化 diff、权限变化高亮、明确批准、审计记录                  | 新增/扩大/组合权限测试，取消和超时              |
| 对话内容泄漏为真相      | 即兴内容污染设定和后续生成             | exploration 默认无 Canon 效果；只允许变更提案进入审阅          | 从对话到笔记/issue/Canon 的全链路权限测试       |
| 配置复杂度压垮用户      | 用户不知道该选什么或创建过多重复角色   | 少量默认模板、渐进披露、AI 建议、用途命名和重复检测            | 新手任务测试、完成时间、撤销/恢复               |
| UI 拼接与编译快照不一致 | 审计记录无法复现实际提示               | bundle/role 成为 core 一等输入；实际发送提示由同一编译结果生成 | snapshot golden test、旧 run 重放/解释          |
| schema 演进破坏项目     | 老项目打不开或配置含义改变             | 版本化纯数据、显式迁移、备份、验证、失败回滚                   | 跨版本 fixtures、降级提示、部分迁移失败         |
| watcher 与应用写入竞争  | 重复刷新、覆盖或事件环                 | 写互斥、自写标记、去抖、冲突状态                               | 高频外部写、Git 切换、编辑器原子保存            |
| 移动/远程暴露本地项目   | 未授权访问、凭据和隐私泄露             | 不进入当前阶段；未来要求认证、最小暴露、撤销和安全提示         | 单独威胁模型与渗透测试                          |
| 外部借鉴边界不清        | MIT 项目混入未审计实现或失去来源       | 固定提交、记录抽象机制、独立实现、代码评审                     | 每项借鉴在 `REFERENCES.md` 登记并检查来源       |

## 已锁定决策与仍需验证的体验

首版已经锁定：中文统一称“创作助手”；内置设定整理、人物试戏和连续性审阅三个助手；一个助手对应一个资料包和一个预设；完整对话进入 Run，长期结论进入探索文档；资料包仅在项目内实时引用；旧项目和旧 Run 不强制迁移；自定义 HTML 不进入产品路线。

后续用户研究只需要验证渐进披露是否足够易懂、默认资料选择是否过多或不足、高风险配置 diff 是否能被正确理解，以及外部编辑冲突应按何种文档状态展示。它们不能改变已经锁定的 Canon、接受、定稿和发布权限边界。

## 研究范围、假设与局限

- 本评审基于完整观看视频、关键时间点画面核对、视频音轨的本地自动转写，以及 Spherse 固定提交的源码和官方仓库文档。转写只用于定位事实，可能存在专有名词误识别；关键结论已用画面或源码交叉检查。
- Spherse 源码下载于 `C:\github\spherse`，工作区干净；固定提交是评审时的仓库 `HEAD`。未来 Spherse 的行为可能变化，因此所有外部源码链接都固定到该提交。
- Quillarium 的评审对象是 2026-08-16 的本地工作区；当时 `HEAD` 为上述提交且已有用户未提交改动。因此 Quillarium 提交号用于标记祖先基线，具体观察以本报告引用的同仓库文件为准。
- 本次没有进行 Spherse 的端到端安全审计、负载测试、异常恢复测试或许可证法律意见；“可借鉴”不表示其实现可直接复制或已满足我们的标准。
- 视频是作者演示，不是独立用户研究。它能说明体验可能性，不能证明用户需求规模、留存、学习成本或生产环境可靠性。
- 本文中的当前 YAML 示例已与 v1 schema 对齐；规范、路径和兼容承诺以 [Agent/ContextBundle ADR](adr/ADR-agent-runtime-and-context-bundles.md) 和代码 schema 为准。
- 本文同时保留外部研究证据与 2026-08-16 的实现状态。未来实现变化应更新 DESIGN/ADR；不能通过改写外部研究事实来追认产品决定。

## 来源索引

### 外部一手来源

1. [Spherse GitHub 仓库](https://github.com/mengrru/spherse)及本次[固定提交](https://github.com/mengrru/spherse/tree/10f5d6a8b357d6e2fc5615e9a8feb62474383b8e)。
2. [Spherse README](https://github.com/mengrru/spherse/blob/10f5d6a8b357d6e2fc5615e9a8feb62474383b8e/README.md)：产品定位、本地项目、独立 Agent、会话、触发器、HTML/UI SDK 和分发能力。
3. [Spherse 架构文档](https://github.com/mengrru/spherse/blob/10f5d6a8b357d6e2fc5615e9a8feb62474383b8e/docs/official/architecture.md)：包边界、上下文、工具审批、路径安全、技能、触发器、服务和移动访问。
4. [Spherse 数据约定](https://github.com/mengrru/spherse/blob/10f5d6a8b357d6e2fc5615e9a8feb62474383b8e/docs/official/data-conventions.md)：Agent profile 和 `context` 路径列表。
5. [Agent 编辑表单](https://github.com/mengrru/spherse/blob/10f5d6a8b357d6e2fc5615e9a8feb62474383b8e/packages/app/src/features/agent-dialog/AgentDialogForm.tsx)、[上下文路径字段](https://github.com/mengrru/spherse/blob/10f5d6a8b357d6e2fc5615e9a8feb62474383b8e/packages/app/src/features/agent-dialog/ContextPathField.tsx)、[Agent 管理工具](https://github.com/mengrru/spherse/blob/10f5d6a8b357d6e2fc5615e9a8feb62474383b8e/packages/core/src/tools/manage-agent.ts)、[会话装配](https://github.com/mengrru/spherse/blob/10f5d6a8b357d6e2fc5615e9a8feb62474383b8e/packages/core/src/session/live-session.ts)、[上下文读取](https://github.com/mengrru/spherse/blob/10f5d6a8b357d6e2fc5615e9a8feb62474383b8e/packages/core/src/context/read-context-files.ts)和[序列化](https://github.com/mengrru/spherse/blob/10f5d6a8b357d6e2fc5615e9a8feb62474383b8e/packages/core/src/context/serialize.ts)：持久角色与多文件上下文的实现链。
6. [文件 watcher](https://github.com/mengrru/spherse/blob/10f5d6a8b357d6e2fc5615e9a8feb62474383b8e/packages/server/src/lib/fs-watcher.ts)和[会话控制总线](https://github.com/mengrru/spherse/blob/10f5d6a8b357d6e2fc5615e9a8feb62474383b8e/packages/core/src/session/control-bus.ts)：独立基础设施参考。
7. [Bilibili 演示视频](https://www.bilibili.com/video/BV11Tuz6VEay/)：产品体验、角色 Agent、多资料绑定、互动页面、触发器和移动访问的直接演示。

### Quillarium 内部依据

1. [DESIGN.md](DESIGN.md)：领域对象、事实权威、章节流程、提示与上下文编译、集成边界。
2. [AGENT-DESIGN.md](AGENT-DESIGN.md)：单一事实源、Agent 职责、写入权限、Canon/连续性和审计原则。
3. [UI-ARCHITECTURE.md](UI-ARCHITECTURE.md)：桌面产品的信息架构和交互边界。
4. [ROADMAP.md](../ROADMAP.md)：P1 生命周期事件/笔记/摘要，P2 声明式配方和插件延后顺序。
5. [ADR-context-activation.md](adr/ADR-context-activation.md)与 [`context-compiler.ts`](../packages/core/src/context-compiler.ts)：确定性激活、预算、追踪和上下文编译实现。
6. [`types.ts`](../packages/core/src/types.ts)：`WritingPreset`、提示栈、上下文与检查策略类型。
7. [`chapter.ts`](../packages/core/src/chapter.ts)：类型化提示来源块和可编辑写作计划。
8. [`AIWritingWorkspace.tsx`](../apps/desktop/src/features/writing/AIWritingWorkspace.tsx)：当前来源卡、临时添加/移除项目文档和精确提示编辑体验。
9. [`scene.ts`](../apps/desktop/electron/ipc/scene.ts)：生成候选时的编译、编辑后提示和 run snapshot 路径。
10. [`contract.ts`](../apps/desktop/electron/ipc/contract.ts)与 [`fs.ts`](../packages/core/src/fs.ts)：IPC 合同与原子文件写入现状。
11. [REFERENCES.md](REFERENCES.md)：外部研究、独立实现和许可证边界。
12. [ADR-agent-runtime-and-context-bundles.md](adr/ADR-agent-runtime-and-context-bundles.md)、[`agent-tasks.ts`](../packages/core/src/agent-tasks.ts)、[`context-bundles.ts`](../packages/core/src/context-bundles.ts)、[`creator-roles.ts`](../packages/core/src/creator-roles.ts) 与 [`assistant-sessions.ts`](../packages/core/src/assistant-sessions.ts)：当前产品规范和执行底座。

## 结论

Spherse 证明了一个很强的产品事实：当角色提示、项目资料、权限和可消费界面被组合成低摩擦流程时，用户会感觉自己的世界观“活了起来”。Quillarium 不需要复制这个通用平台，反而应利用自身更严格的事实权威和上下文审计，提供更可靠的领域版本。

第一阶段已经把 `ContextBundle`、`CreatorRole`、执行快照和创作助手闭环建立在上下文编译器之上。下一步是让剩余旧 AI 流程逐项采用同一快照，并在 P1 补外部文件 watcher、可恢复审批控制总线和写后领域事件；领域配方仍排在这些边界稳定之后。
