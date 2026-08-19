# Quillarium 文档导航

<p>
  <a href="README.md">English</a> · <strong>简体中文</strong>
</p>

本导航对应已经发布的
[`v0.3.0`](https://github.com/kayz/Quillarium/releases/tag/v0.3.0) 代码线。仓库根目录的
[中文版 README](../README.zh-CN.md) 是中文产品总览；如果历史文档与当前行为不一致，以运行时
schema、命令帮助和测试为准。当前工作区是 `0.3.1` 本地候选版，界面皮肤另有中英文契约。

## 从这里开始

| 目标                                      | 文档                                   |
| ----------------------------------------- | -------------------------------------- |
| 了解产品并从源码启动                      | [中文版 README](../README.zh-CN.md)    |
| 阅读英文产品总览                          | [Project README](../README.md)         |
| 使用命令行工作流                          | [CLI 指南（英文）](CLI.md)             |
| 理解存储、权威层级、兼容策略和 0.3.0 设计 | [系统设计（英文）](DESIGN.md)          |
| 理解桌面端信息架构                        | [UI 架构（英文）](UI-ARCHITECTURE.md)  |
| 自定义或审计 0.3.1 界面皮肤               | [界面皮肤契约](UI-SKINS.zh-CN.md)      |
| 理解 Agent、ContextBundle、权限和快照     | [Agent 设计（英文）](AGENT-DESIGN.md)  |
| 构建或审计不可变发布                      | [发布流程（中文）](RELEASING.zh-CN.md) |
| 查看已交付门禁和后续优先级                | [产品路线图（英文）](../ROADMAP.md)    |
| 查看外部设计来源和许可证边界              | [参考资料（英文）](REFERENCES.md)      |

## v0.3.0 功能索引

本版新增项目内设定图片、可复用的 HTML 设定卡样式、可逆的章节树层级开关、类型化势力网络，以及
“确定性上传参考资料，再按需以只读来源发起 AI 讨论”的工作流。同时合入 v0.2.2 之后完成的可靠性
增强：事务化 CCv3 导入、带证据锚点的问题指纹、助手提示词原子绑定、按需引用索引、按故事时间解析
人物试戏上下文，以及统一敏感信息边界。

- 存储契约与兼容策略：[DESIGN — 0.3.0 设定卡、章节树和势力设计（英文）](DESIGN.md#030-setting-cards-story-tree-visibility-and-factions)
- 桌面交互和信任边界：[UI 架构（英文）](UI-ARCHITECTURE.md)
- 纯文本设定卡 Agent 与提案权限：[Agent 设计（英文）](AGENT-DESIGN.md)
- 当前产品能力：[中文版 README](../README.zh-CN.md#当前可用能力)
- 已交付门禁与后续工作：[产品路线图（英文）](../ROADMAP.md#completed-release-gate-v030-settings-and-reliability)

## 0.3.1 本地候选版

候选版增加经审阅的卡片类型转换、从正文抽取设定、明确的文件拖入用途选择、手动空白设定卡，以及四个
可编辑的 CSS-token 界面皮肤。详见[界面皮肤契约](UI-SKINS.zh-CN.md)、
[当前中文版 README](../README.zh-CN.md#031-本地候选版)和
[候选版路线图（英文）](../ROADMAP.md#031-local-candidate-card-retyping-prose-extraction-and-ui-skins)。

## 架构决策

`adr/` 目录记录即使实现位置变化也应保持稳定的架构决策：

- [统一 Agent Runtime（英文）](adr/ADR-unified-ai-agent-runtime.md)
- [Agent Runtime 与 ContextBundle（英文）](adr/ADR-agent-runtime-and-context-bundles.md)
- [上下文激活（英文）](adr/ADR-context-activation.md)
- [WritingPreset（英文）](adr/ADR-writing-presets.md)
- [多候选分支（英文）](adr/ADR-candidate-branches.md)
- [定稿应用事务（英文）](adr/ADR-finalization-apply.md)

## 历史与维护文档

- [MVP 工作清单（英文）](MVP-WORKLIST.md) 仅用于保留项目沿革，不是当前使用指南。
- [UI 工作清单（英文）](UI-WORKLIST.md) 和 `superpowers/` 下的文件是实现记录，不构成产品承诺。
- [P0 Agent Runtime 实施提示（英文）](implementation/AGENT-RUNTIME-P0-PROMPT.md) 是已经完成的实施简报。
- 各 package 的 README 说明内部包边界和公开导出。

简体中文版目前覆盖完整产品 README、本导航和发布指南。详细架构规范与 ADR 仍以英文版本作为唯一
规范文本，避免双份技术契约逐渐分叉；本导航提供中文摘要并直达对应的权威文件。
