# Main-Window Implementation Prompt: Unified Agent Runtime P0

Copy the Chinese prompt below into the main implementation window. This file is an execution brief;
the authoritative product decisions remain in
[`ADR-unified-ai-agent-runtime.md`](../adr/ADR-unified-ai-agent-runtime.md).

---

请在 `C:\git\Quillarium` 实现“统一 Agent Runtime P0”这一完整纵切面。先阅读：

- `docs/adr/ADR-unified-ai-agent-runtime.md`
- `docs/adr/ADR-agent-runtime-and-context-bundles.md`
- `docs/AGENT-DESIGN.md`
- `docs/DESIGN.md`
- `ROADMAP.md`
- `docs/REFERENCES.md` 的 DeepSeek Harness 条目

目标不是建设通用聊天 Agent 平台，而是让 Quillarium 中每一次产品 AI 调用都能逐步迁移到一个类型化、可审计、不能自行写入作品事实的执行模块。本轮只迁移“项目 AI 检查”，不要顺手迁移其他 AI 流程。

## 必须完成

1. 新建工作区包 `@quillarium/agent-runtime`，不得包含 Electron、React、凭据存储、GitHub 或窗口代码。依赖方向为 Agent Runtime 调用 `@quillarium/core`、`@quillarium/ai` 和 `@quillarium/checks`；禁止反向依赖。
2. 建立代码拥有的 AgentTask 注册表：
   - 将不可变 `AgentTaskDefinition` 与可执行 `AgentTaskHandler<Input, Output>` 配对；
   - handler 提供输入/输出 Zod schema、prepare 和 decode；
   - 启动时拒绝重复 ID、缺失 handler、schema 不匹配、越权 operation 和非法 result disposition；
   - 项目文件和模型输出都不能注册任务或修改 capability ceiling。
3. 只公开一个模型执行入口 `executeAgentTask()`：
   - 校验请求和目标；
   - 运行确定性 preflight；
   - 解析 WritingPreset/本机连接配置；
   - 通过 ContextPolicy/ContextBundle 编译 PromptBlocks 和 ContextTrace；
   - 创建执行 ID 和计划；
   - 调用 `@quillarium/ai`；
   - 保存原始响应，进行本地 Zod 校验，结构化输出至多修复一次；
   - 返回 candidate、proposal、exploration 或 report，绝不调用领域 apply。
4. 实现模型可见内容的 write-ahead 规则：
   - 先产生精确且不含密钥/授权头/本机敏感路径的 PromptEnvelope；
   - 原子写入 `request.json`、`plan.json`、`agent-execution.json`、`prompt-envelope.json`、`prompt-blocks.json`、`context-trace.json`；
   - 向 `runs/agents/<execution-id>/events.jsonl` 追加并持久化 `request.prepared` 及上述文件哈希；
   - 只有成功完成后才允许 provider 看到请求；
   - 任一预写失败返回 `AGENT_AUDIT_WRITE_FAILED`，provider spy 必须证明调用次数为零。
5. 实现追加式 `AgentExecutionEventV1` 日志：
   - 含 `schema_version`、`seq`、`recorded_at`、`execution_id`、`task_id`、`type`、artifact 哈希引用和小型 typed data；
   - seq 从 1 严格连续，旧行永不重写；
   - 支持 ADR 中列出的 created/planned/context/request/response/output/approval/application/terminal 事件；
   - retry 创建新 execution，并通过 `retry_of` 关联；
   - 日志只是审计索引，不能成为 Canon、正文、规划卡或问题卡事实源。
6. 统一 `AgentRuntimeErrorV1`：
   - 保存稳定 `code`、`phase`、`task_id`、`execution_id`、retry safety、message key、HTTP status、provider request ID、finish reason、validation paths 和 artifact 引用；
   - `provider-error.json` 保存有界且清理过密钥、授权头和凭据的原始响应体/异常/cause chain；
   - 至少覆盖未配置、鉴权、额度、限流、超时、传输、上下文超限、输出截断、空响应、非法 JSON、schema 不符、修复失败、审计写失败和批次部分失败；
   - 中文 UI 显示中文摘要，同时允许展开原始英文技术详情、执行 ID、重试和检查 Run；错误只能停留在任务面板，不能清空整个工作区。
7. 实现失败关闭的作者确认/apply 交接：
   - Agent Runtime 只能产生结果；
   - 独立 `AuthorApplyDecisionV1` 由可信 UI/CLI 明确动作创建，绑定 execution、选中 result、目标和 expected hashes；
   - 缺失、拒绝、格式非法、过期、目标哈希变化、重复消费或审计写失败时，领域写入次数必须为零；
   - apply 服务重新校验 disposition，获取项目写锁，记录 application.started，使用已有原子写/回滚/verify 服务，并记录 completed/failed；
   - 模型文本不能被解释为确认或补丁。
8. 把当前“项目 AI 检查”迁移为首个真实 handler：
   - 保留 `checkPlanningCards()` 等确定性检查，无 AI 时仍能返回；
   - 用真实 token 预算确定性分批，父 execution 管理稳定 child execution IDs；
   - 每批保存 prompt、原始响应、解析结果和错误；成功批次不因其他批失败而丢失；
   - 只重试失败批次；
   - UI 展示确定性发现、语义问题提案、证据、来源 trace 和失败批次；
   - 只有作者选中并确认后才创建/更新 issue cards。
9. Desktop IPC 与 CLI 只能做参数适配、机器本地 profile/凭据加载和本地化展示。不得在 IPC/renderer/CLI 中重新拼 prompt、解析模型 JSON 或执行模型建议的写入。
10. 保留旧 Run 和旧 IPC 的只读/薄适配兼容，不做静默迁移，不改变 Workspace、ProjectConfig、七层故事结构、Canon、正文、时间线或人物文件格式。

## DSH 复用约束

- 本轮不要引入 Cordis、`dsh-base`、`dsh-headless`、`dsh-agent-loop`、`dsh-session`、`dsh-user-approval`、DSH LLM 包或 SDK 包。
- 不复制 DSH 的单个函数、类、注释、提示词或配置片段。
- 当前采用的是经过 ADR 记录的抽象机制，并基于 Quillarium 既有类型独立实现。
- 如果发现某个 DSH 整包实际上可以脱离 Cordis/DSH Session 使用，先停止实现并提交依赖闭包、API 稳定性、安全能力、许可证/notices、打包体积、升级与移除方案；未经新 ADR 不得加入依赖。
- `eventsource-parser` 之类维护良好的上游库只能在未来流式迭代中按普通依赖评审；它不是本轮范围。

## 明确延后

- token 流式 UI；
- provider-acknowledged 实时取消；
- 部分输出作为候选；
- 长任务可暂停审批总线；
- shell、文件工具、Web 工具、子 Agent、动态插件或通用 Agent 市场；
- 其余 Import、Planning、Scene、Finalization 和 Creator Assistant 的迁移。

可以预留执行 ID、`AbortSignal` 和未来 stream event 类型的接口位置，但不得把“关闭面板”描述为已经取消 provider，也不得保存半截内容为成功候选。

## 验收门禁

- Registry：重复/缺失/mismatch/越权全部拒绝。
- Write-ahead：审计文件或 flush 失败时 provider 零调用；provider 被调用时 `request.prepared` 已可从磁盘读取且哈希正确。
- Event log：连续 seq、schema 校验、artifact 哈希、retry lineage、并发执行隔离。
- Errors：覆盖成功、鉴权、额度、429、超时、网络、上下文超限、finish_reason=length、空响应、坏 JSON、schema 不符、修复成功/失败、原始错误清理。
- Apply：无确认、过期确认、哈希冲突、重复确认、审计失败和中途写失败均不产生未审计的项目状态；回滚可验证。
- AI Check：无 AI 保留确定性结果；部分批失败可见且只重试失败批；未确认不写 issue。
- UI：局部错误、双语摘要/技术详情、执行 ID、重试和 Run 检查入口，不再出现整页空白。
- 兼容：旧项目和旧 Run 可读取，无静默重写。
- 仓库门禁：相关单测/集成测试、TypeScript、ESLint、Prettier、build、desktop build、依赖审计、密钥扫描和 `git diff --check` 通过。

先检查并保留工作区已有改动；不要覆盖无关修改。实现完成后报告改动文件、执行生命周期、测试证据、仍延后的项目和任何无法证明的门禁。不要自行提交或推送，除非用户另行明确要求。

---
