# Quillarium

本地优先、以 Obsidian 为持久化底座的长篇小说创作系统。

<!-- 本节由 keel 骨架管理，copier update 时会更新；项目自己的规则写在后面的“项目补充”里。 -->

## 工作方式（keel）

- 意图、范围和不做的事见 `docs/intent.md`；重要决策见 `docs/adr/`。
- 跨模块、跨语言的接口以 `contracts/` 和各模块的公开入口为准。
- 如何拆分任务、是否使用子 agent、模块内部怎么写，由你自行判断。
- 产品含义不清楚时先问；实现细节自己决定，不要为常规选择请求确认。
- 不要为了让实现通过而修改 `tests/rules/`、`tests/properties/`、`tests/flows/`、`contracts/`
  或 `docs/intent.md`。认为它们有误时，单独提出并说明理由。
- 完成前运行 `pwsh -NoProfile -File scripts/check-fast.ps1`；涉及契约、持久化或主流程时运行
  `scripts/check.ps1`。没跑或跑不了就直接说明，不要写成已通过。
- 发布、部署、破坏性数据迁移、修改 CI 与保护规则、改动 `.keel/`，都必须由我明确要求才做。
- 只修改完成任务所需的文件；发现的无关问题记下来，不顺手扩大范围。

## 项目补充

<!-- 在这里写只适用于本项目的规则。每条规则最好能说出它对应的真实问题。 -->

- 用户的小说数据必须保持为 Obsidian 兼容目录里的 Markdown/YAML 纯文件；不要引入数据库或私有格式。
- AI 对项目文件或配置的写入一律走“提案 → 作者批准”，不要新增绕过批准的写入路径。
- `packages/*` 之间只通过包名导入（`@quillarium/core` 等），不要引用其他包的 `src/` 文件；`pnpm arch` 会检查。
- 现存的 5 处循环依赖记录在 `.dependency-cruiser-known-violations.json`。可以消除它们，但不要往里加新条目。
- 验收测试（`tests/`）通过构建产物导入 `@quillarium/core`，运行前需要先 `pnpm build`。
- 发版只按 `docs/RELEASING.zh-CN.md` 执行：只有我明确要求时才打 tag；失败的 tag 不移动、不重跑。
- 详细技术规格以英文的 `docs/DESIGN.md`、`docs/AGENT-DESIGN.md`、`docs/UI-ARCHITECTURE.md` 为准。
