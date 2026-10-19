# Quillarium：意图

<!-- spec 的第 1 层：只写代码表达不出来的东西。
     初稿由 Claude 依据 README、ROADMAP、CONTRIBUTING 和 RELEASING 整理，待作者逐条确认后删除本行。 -->

## 要解决的问题

长篇连载写作需要大量规划事实（人物、时间线、世界书、伏笔），AI 能帮忙生成和检查，但作者必须始终掌握
哪些文字和设定是“被接受的事实”。Quillarium 是本地优先的写作系统：数据是作者自己的纯文件，AI 只提议，
写入由作者确认。

## 当前目标

当前代码线是 `0.3.1` 本地候选版，范围见 [ROADMAP](../ROADMAP.md#031-local-candidate-card-retyping-prose-extraction-and-ui-skins)：

- 设定卡类型转换（经作者审阅、哈希校验、可回滚）。
- 从已保存的手写章正文中抽取设定提案，正文保持只读。
- 拖入文件时明确选择用途；拖入本身不写盘、不调用 AI。
- 手动空白设定卡。
- 四个可编辑的 CSS-token 界面皮肤。
- 以章为中心的产品骨架（2026-09 并入本候选版）：节改为可选的生文模块、世界书优先并就地特化、
  可关的展示层、只提案不写正文的专家模式、助手每轮一个确认层。

## 不做什么

- 不把用户写作内容默认公开，不要求 Git 或 GitHub 账号。
- 不引入通用命令语言或任意脚本执行；插件平台推迟（见 ROADMAP 的 Deferred）。
- SillyTavern 只作为设计参考和可选格式适配边界，不是依赖，也不追求兼容。
- 流式输出与实时取消在相关 ADR 被接受之前不做。

## 关键决策

- 小说数据以 Markdown/YAML 纯文件存放在 Obsidian 兼容的目录里；生成的索引和构建产物可丢弃。
- AI 对项目和配置的任何写入都需要作者批准；助手对话不属于正设。
- 章正文依次经历草稿、定稿和不可变的已发布状态；只有草稿章允许 AI 生成。
- 章（章纲 + 章正文）是交付单位。节是可选的 AI 生文模块：节必须按顺序接受，本章全部节确认后，
  正文按节顺序写入章正文。
- 写作路径上的 AI（专家模式）只整理、分析、评估、补设定，不写正文；正文只在节模块里生成。
- 设定事实先是世界书，再就地特化；配图和卡面属于可关的展示层，不写回设定事实。
- 优先使用确定性检查，再用 AI 辅助检查。
- 版本 tag 和 GitHub Release 不可变，失败的版本不移动、不重跑，修复后用新的版本号（见
  [RELEASING](RELEASING.zh-CN.md)）。
- 详细架构决策见 [docs/adr/](adr/)；英文技术规格（DESIGN、AGENT-DESIGN、UI-ARCHITECTURE）是唯一规范文本。

## 验收入口

- 桌面端：`pnpm desktop:dev`，打开或新建一个写作库，走一遍“规划 → 生成节 → 接受节 → 定稿 → 发布 → 导出”。
- 命令行：`pnpm cli --help`。
- 自动化：`pwsh -NoProfile -File scripts/check-fast.ps1`；验收测试在 `tests/`。
- 安装包签名以及全新 Windows/macOS 机器验收仍是人工门禁。

## 仍然有效的既有文档

- [README](../README.zh-CN.md)、[文档导航](README.zh-CN.md)、[ROADMAP](../ROADMAP.md)
- [DESIGN](DESIGN.md)、[AGENT-DESIGN](AGENT-DESIGN.md)、[UI-ARCHITECTURE](UI-ARCHITECTURE.md)、[UI-SKINS](UI-SKINS.zh-CN.md)
- [RELEASING](RELEASING.zh-CN.md)、[CLI](CLI.md)、[REFERENCES](REFERENCES.md)
- 只作历史记录、不构成产品承诺：MVP-WORKLIST、UI-WORKLIST、`superpowers/`、`implementation/`
