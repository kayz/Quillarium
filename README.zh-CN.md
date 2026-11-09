<h1 align="center">
  <img src="assets/brand/quillarium-wordmark.png" alt="Quillarium" width="560" />
</h1>

<p align="center">
  <img src="assets/brand/quillarium-q.png" alt="Quillarium Q 应用图标" width="88" />
</p>

<p align="center">
  <a href="README.md">English</a> · <strong>简体中文</strong>
</p>

<p align="center">
  最新稳定版：<a href="https://github.com/kayz/Quillarium/releases/tag/v0.3.1">v0.3.1</a>
  · <a href="https://github.com/kayz/Quillarium/releases/latest">下载安装包（Windows / macOS）</a>
  · <a href="docs/README.zh-CN.md">文档导航</a>
</p>

**Quillarium（羽笔馆）** 是一套本地优先、以 Obsidian 为持久化底座的长篇小说与多模态剧本创作系统。它以纯文本 Markdown 与 YAML 存储你的全部世界观、大纲、剧本和正文，让规划事实全程可追溯，提供零静默写入的提案式 AI 专家协作、深度可视化时空画布与确定性上下文编译，助你驾驭百万字长篇小说、短剧分镜与复杂世界观设定集。

Quillarium 是唯一的产品运行时；Obsidian 是持久、可人工编辑的文件界面。一个写作工作区可以注册多个项目和共享指导资料，每个项目目录同时是一座独立的 Obsidian 库（Vault）和 Quillarium 项目根目录。

本文描述截至 2026-11-09 已发布的 `0.3.1` 稳定版代码线。“当前可用”表示该行为存在于带 tag 的仓库中，并经过本地测试和发布门禁验证。

---

## ✨ 软件核心特点（Why Quillarium）

1. **本地优先 × Obsidian 原生纯文本底座（零数据库锁死）**
   - 你的小说正设、人物、势力、时间线、地点、大纲、章节正文与短剧剧本全部存为标准的 **Markdown + YAML Frontmatter** 纯文件。
   - 不引入任何私有数据库或封闭二进制格式；任意本地文件夹即可成为写作库，每个项目目录天然就是一个可直接用 Obsidian 打开双向编辑的 Vault，且完全不需要强制绑定 Git 或云账号。

2. **提案式 AI 协作与零静默写入（Proposal → Author Approval）**
   - **绝不越权改稿**：AI 对项目文件或配置的任何写入（无论是设定抽取、类型转换、大纲细化、时间线整理、连续性修补还是创作助手对话）一律生成**带来源证据与 SHA-256 哈希校验的结构化提案（Proposal）**。
   - **原子事务与随时回滚**：未经作者勾选确认，AI 绝不改动磁盘一字；确认应用时自动获取项目写锁、保留完整备份并复读验证，任何一步冲突或失败均整体回滚，并提供中断恢复检查。

3. **面向不同创作者的弹性工作台（长篇小说家 / 短剧编剧 / OC 世界观设卡师）**
   - **七层弹性小说结构**：支持顶层总览/总纲 + 卷、可选篇、可选幕、章、可选节（约 1000 字 AI 生文块）。可按写作习惯随时隐藏不需要的层级而不删文件。
   - **独立短剧与剧本分镜工作台（`short-play/`）**：内置标准剧本格式实时校验（场头、人物对白、△动作提示、时长估算）、出镜角色/场景视觉资产包自动汇总、单场分镜表拆解，以及一键导出制片级 **CSV / Markdown / JSON 分镜与资产清单**。
   - **先世界书，后特化**：设定事实可先以轻量世界书入库，随后保持同一稳定 ID 原地特化为人物、地点、时间线事件、势力、伏笔或叙事卡，也可随时从手写章节正文中一键抽取新设定卡。

4. **深度可视化时空与关系规划画布**
   - **8 级谷歌地图式无级缩放穿透 + 室内建筑房型图编辑器**：支持全图（L1）→ 省级（L2）→ 市级（L3）→ 县级（L4）→ 镇级（L5）→ 街区级（L6）→ 组团/宅院级（L7）→ **室内多楼层建筑平面图（L8，双线墙体、功能房间、门/窗/楼梯/暗门符号）**。通过滚轮无级缩放达到阈值自动平滑穿透至下一级，并配备独立的全屏地图编辑器与待挂载地点池拖拽落位。
   - **多轨时间线与自动排布**：支持自定义历法、多时间线轨道对比、故事时间自动解析与因果倒置冲突检测。
   - **时态人物关系图与一等公民势力网络**：人物关系与势力归属均带故事时间有效区间；按时间节点动态过滤在场人物、有效关系与势力徽标。

5. **可解释、确定性的上下文编译器与多候选 Run 分支**
   - 告别黑盒拼接：上下文编译器按大纲链、显式固定/排除、时间线链接、关键词触发与有界关系图扩展，生成完全确定性的 `PromptEnvelope` 与 `ContextTrace`，内置精确 Tokenizer 预算控制。
   - 单次生文支持并发生成 **2～8 个独立候选**，支持候选正文与检查报告并排对比、非破坏性选择与分支演进，唯有显式点击“接受”才会写入正文。

6. **独立 Agent 专家中心与受限创作助手**
   - 内置专职创作助手（资料整理、人物试戏、连续性审阅）及独立 **Agent 中心（`AG-1`）**，支持一键发起大纲整理、世界书归并、人物关系分析、伏笔管理、时间线整理与定稿连续性审阅。
   - 每个会话冻结精确的 `ContextBundle`、助手提示词版本与 `WritingPreset`，权限、Token 消耗与完整 Trace 一目了然。

7. **四套可深度定制的东方美学界面皮肤与展示层画廊**
   - 内置 **宣纸（Paper）、松烟（Ink）、云雾（Mist）、竹青（Bamboo）** 四套完整界面皮肤，支持配色、界面/正文字体、字号比例、面板间距、导航布局与按钮样式实时预览定制。
   - 卡片配图画廊（`assets/display/<card-id>/`）与安全无脚本 HTML 卡面设计器作为可选展示层运行，与核心设定事实彻底解耦。

---

## 📦 安装包下载与更新指南

### 1. 下载桌面安装包

前往 [**GitHub Releases 最新版本页面**](https://github.com/kayz/Quillarium/releases/latest) 直接下载对应系统的安装包：

| 操作系统                  | 架构                | 安装包文件名（以 `v0.3.1` 为例）   | 说明                                                |
| :------------------------ | :------------------ | :--------------------------------- | :-------------------------------------------------- |
| **Windows**               | x64                 | `Quillarium-0.3.1-windows-x64.exe` | NSIS 安装程序，下载后双击即可安装并创建桌面快捷方式 |
| **macOS (Apple Silicon)** | arm64 (M1/M2/M3/M4) | `Quillarium-0.3.1-macos-arm64.dmg` | 挂载 DMG 后将 Quillarium 拖入 `Applications` 文件夹 |
| **macOS (Intel)**         | x64                 | `Quillarium-0.3.1-macos-x64.dmg`   | 挂载 DMG 后将 Quillarium 拖入 `Applications` 文件夹 |

> **提示**：当前桌面安装包尚未附带商业代码签名证书。首次在 Windows 运行时若出现 SmartScreen 提示，请点击 **“更多信息” → “仍要运行”**；在 macOS 上首次打开若提示无法验证开发者，请在访达（Finder）中按住 `Control` 键点击应用图标并选择 **“打开”**。

### 2. 应用内检查更新与升级

- **一键检查更新**：打开 Quillarium 桌面端 → 进入 **「设置（Settings）」** → 在版本与更新区域点击 **「检查更新（Check for updates）」**。
- **双通道感知**：更新服务会自动查询公开的 GitHub Releases 接口（无需登录 GitHub 账号或配置 Token），自动识别稳定版（Stable）与预发布版（Prerelease）通道。
- **安全覆盖升级**：检测到新版本（如 `v0.3.1`）时，点击即可一键打开官方 Release 下载页。下载新版安装包直接覆盖安装即可，**你的本地写作工作区、Obsidian 项目文件与全局配置会自动完整保留**。

---

## 当前可用能力全景（`v0.3.1`）

- 文件化项目模型覆盖正设、人物与带时间范围的人物关系、关联时间线、8 级空间地点与室内户型布局、世界书、伏笔、参考资料、问题、叙事卡、七层故事结构、独立章节正文、节、短剧剧本与分镜（`short-play/`）、导入、评审和生成 Run。
- 可直接从源码运行的 CLI 能创建和编辑上述记录、导入 Markdown、装配上下文、生成草稿、执行确定性检查或显式启用的语义检查、接受 Run，并导出书稿。
- Electron 桌面端可把任意本地文件夹变成写作库，并直接打开或创建项目库，不要求 Git 或 GitHub 账号。之后可把 GitHub 作为可选上传目标。规划记录可通过多轮后台 AI 对话创建，作者以结构化字段和 Markdown 检查结果，明确确认后才会写盘。
- Markdown 规划文档可以安全地切换源码和预览，支持 GFM 表格、嵌套列表、引用、链接和代码围栏，不执行原始 HTML。Frontmatter 使用直接控件编辑：标签、触发词、分类等索引字段显示为 chip；列表和嵌套记录使用可增删行；只有 Markdown 正文暴露语法。
- 点击项目标签会打开右侧跨类型索引；可折叠元数据组以及可拖动的列、行分隔线让密集记录和长正文保持可用。
- 可视化规划工作台提供确定性时间线链、可拖动且按时间过滤的人物关系、8 级无级缩放穿透地点地图（含全屏地图编辑器与室内房型图绘制）、参考资料反向索引和问题卡修复。
- 手动项目 AI 检查会排除来源资料和禁用卡片，然后把稳定发现持久化为问题卡。世界书关键词和伏笔条件会激活可解释的提示词来源。
- 版本化 `WritingPreset` 绑定连接配置角色、模型覆盖项、提示词栈、区块顺序、确定性上下文策略和检查策略。桌面端与 CLI 选择同一份 preset；每次生成 Run 都保存清理过的不可变快照及 SHA-256 身份。
- 三个内置创作助手负责整理资料、人物试戏和连续性审阅，并遵守各自受限的任务阶段。独立 **Agent 中心** 汇总全部 AI 专家任务入口与历史会话。版本化 `ContextBundle` 决定助手知道什么；隔离的助手提示词版本决定它如何工作；`WritingPreset` 决定模型和通用提示结构。每个会话冻结精确配置，并记录消息、权限、来源、token、trace、原始/修复输出和 proposal。助手对话不属于正设，任何项目或配置写入仍需作者批准。
- 一次生成可以在同一 Run 组中创建 2 到 8 个彼此独立保留的候选。桌面端与 CLI 可以比较候选正文和检查结果，只做选择而不写正文，也可以从任一保留候选创建新分支。只有单独的“接受”操作才会写入节和章节正文。
- 已定稿章节可以启动 AI 辅助连续性评审，但模型没有写权限。每一项可执行修改都需要作者明确决策。桌面端与 CLI 使用同一服务验证全部目标及哈希，保留完整备份，应用整个修改集，重新读取并验证每个文件，再记录恢复审计；任一失败都会恢复整个集合。
- 可从定稿/已发布章节正文、已接受输出或最终节内容导出 Markdown 和纯文本书稿，缺口会明确报告，也可按卷筛选；短剧工作台支持导出剧本 Markdown、分镜表 CSV/Markdown 及制片资产包 JSON。
- 七层结构由顶层的总览和总纲，以及卷、可选篇、可选幕、章、节组成。章（章纲加章正文）是交付单位。节是项目级可选的 AI 生文模块，把一章拆成约 1000 字一次的生文块；本章全部节确认后才写入章正文。章节正文依次经历草稿、定稿和不可变的已发布状态。
- 项目设置可以隐藏篇、幕或节而不删除其 Markdown。章会显示在最近的已启用父层级下；被禁用的文件仍能通过检查器查看；禁用节时，也会移除绑定在节上的 AI 生文入口。旧项目只在内存中默认启用所有层级，单纯打开不会改写项目文件。新建项目默认关闭节模块。
- 卡片配图和 HTML 卡面属于项目级可选的展示层，与设定事实分开；关闭展示层只隐藏外壳。配图可以本地上传，也可以由作者主动点击，通过 OpenAI Images、OpenAI 兼容的生图接口或 Gemini 生成。图片以多图画廊形式存放在 `assets/display/<card-id>/`，不写回卡片 frontmatter。卡面由内置或已保存的模板渲染，无需调用模型；受限的 `display-card-design` Agent 只提供候选，含脚本的模板会被拒绝。
- 势力是一等组织卡片，势力关系和人物归属使用独立文档。所有链接都使用稳定 ID，并可带开始包含、结束不包含的时间范围。按时间过滤的人物关系图会在人物旁显示势力标志；没有图片时使用确定性的“圆圈 + 一至两个名称字符”，多个当前有效的归属会同时显示。
- 通用规划卡选择器支持搜索、键盘操作和虚拟滚动，并在关系与带时间定位的伏笔控件中始终保存稳定 ID。规划 AI 会话保留多个可独立编辑的 proposal，在受限网格中完整显示，并在恢复后始终把来源卡固定在第一位。明确的批量确认和依赖感知原子应用会把会话临时引用解析成新卡的项目稳定 ID，绝不静默写入。
- 创建参考资料是确定性、可回滚的 UTF-8 Markdown/文本上传，不调用 AI，也不保留外部绝对路径。保存后的参考资料可由作者显式发起多卡 AI 讨论；它是经过哈希校验的只读来源，派生卡会自动把其稳定 ID 写入 `source_refs`，会话不会修改参考资料本身。
- 专用问题工作区支持批量忽略、标记已解决和恢复待处理。稳定 suppression fingerprint 能阻止被忽略的问题重复出现，同时不会错误压制之后重新检测到的已解决问题。
- 本书生文头部提示词、精确 `PromptEnvelope`/provider-request 快照，以及只读的分块/全文/消息查看器，让模型实际可见的提示词可以检查并安全复制。
- 基于公开格式的 CCv3 单向交换可以从 JSON/PNG 角色卡创建故事结构为空的新项目，也可以把作者选择的小说设定导出为一张使用封面的 CCv3 PNG。它不会传输正文、剧情计划、提示词、preset、API 配置、凭据或运行状态。
- **经审阅的设定卡类型转换与正文设定抽取**：正设只与世界书互转；世界书是转换中心，可与人物、人物关系、地点、时间线事件、势力及其关系/成员卡、伏笔和叙事卡互转。章节正文编辑器支持对已手写内容执行“从正文抽取设定”，自动附加 `derived_from` 关系，仅写入作者勾选确认的卡片。
- **拖拽文件归档与空白草稿卡**：在已打开项目中拖入本地文本或 Markdown 文件，可选择确定性归档为参考资料或进入需审阅的 AI 设定导入。每个可直接维护的设定栏目提供独立的“新建空白卡”。
- **四套完整可编辑界面皮肤**：`paper`、`ink`、`mist`、`bamboo` 通过有界 CSS token 控制配色、字体、字号比例、面板间距、导航与详情位置、工具栏排列及按钮样式，支持即时预览与一键恢复内置，详见[界面皮肤契约](docs/UI-SKINS.zh-CN.md)。
- **以章为中心的专家模式与单轮确认层**：
  - **先世界书，后特化**：设定事实先以世界书存在，可就地特化为具体类型或转回世界书。
  - **专家模式**：写作路径上的 AI 只做整理、分析、评估和补设定（`continuity-check`、`organize-outline`、`organize-worldbook`、`analyze-relations`、`manage-foreshadowing`、`manage-timeline`），不代写正文，结果均为未确认提案。
  - **助手每轮一个确认层**：每轮的规划卡、问题和助手配置提案收进同一个确认层，同一把锁下原子写入或整体回滚。
  - **生文只在节模块里**：正文生成只存在于可选的节模块中，不经过专家入口。

打开仍有 `assets/settings/` 文件或卡片 `image` 字段的 0.3.0 项目时，Quillarium 会询问是否重置旧的展示资源。确认后会永久删除 `assets/settings/` 并去掉这些 `image` 字段，然后开启展示层；取消则本次会话不改动磁盘。升级前请先备份这类项目。

项目管理、导入、上下文装配、确定性检查和导出都不要求 AI。生成以及 `check --semantic` 需要 OpenAI 兼容 endpoint 或已经配置的 provider。

上下文编译器是确定性、可解释且受模型预算约束的。它根据大纲链、显式固定/排除、类型化关系、时间线链接、关键词激活和卡片启用状态选择内容；再进行循环安全、深度受限的关系扩展；最后输出类型化 `PromptBlock` 和完整 `ContextTrace`。DeepSeek V4 及受支持的 OpenAI 模型族使用打包的精确 tokenizer。未知 tokenizer/model 组合会关闭失败，而不是静默使用字符估算。Run 元数据记录候选组、父 Run、分支、索引和选择时间；每个候选保留自己的提示词、输出、检查报告和比较分数。

## 快速开始（从源码构建）

前置条件是 Node.js（建议 22+）和 pnpm。在仓库根目录执行：

```bash
pnpm install
pnpm build
pnpm test
```

准备一个包含 `quillarium-workspace.yaml` 和 `projects/` 的目录，注册该目录并创建直接项目库：

```bash
pnpm cli config set-workspace ./writing-workspace
pnpm cli init "My Novel" --id my-novel --genre fantasy
pnpm cli --help
```

项目会创建并注册到 `./writing-workspace/projects/my-novel`，该目录同时也是 Obsidian 库。显式 `init --vault <path>` 只保留用于旧版兼容。端到端写作、检查、接受和导出流程见 [CLI 指南（英文）](docs/CLI.md)，其中也记录了可选的旧 SillyTavern 命令。

## 桌面端开发与打包流程

从源码启动 Electron 应用：

```bash
pnpm desktop:dev
```

然后选择任意本地文件夹作为写作库，打开或创建项目库，建立大纲和配套设定，选择章节，准备节，再编辑或生成正文。AI 页面会在精确、可编辑的提示词旁显示可移除的提示来源卡；可大幅调整尺寸的章节正文编辑器会显示字数反馈。运行时与迁移服务继续兼容旧布局，但欢迎页不再把旧布局作为主动选项。迁移永远是显式的“预演 → 备份 → 应用 → 验证 → 报告”，不会移动或删除来源。上下文/检查器和已记录 Run 让输入输出可复核。

全宽“创作助手”与“Agent 中心”工作区左侧显示会话与助手，中间显示对话、探索和 proposal，右侧显示来源、原因、权威、token、权限和输出位置。人物卡、章/节和资料导入都可以直接打开对应助手。

在已经定稿的章节中，“定稿审阅与应用”会展示每一项连续性影响和待作者决定的问题；只有没有待定项时才允许原子应用。“恢复检查”可用保留的 before image 恢复被中断的事务。

主题、密度、语言、GitHub 凭据、各 AI profile 和项目 `WritingPreset` 都有独立的设置操作。没有 preset 的旧项目必须先显式创建/选择 preset，之后才能生成。

设置页可以手动检查公开的 Quillarium GitHub Releases。检查理解稳定版和预发布通道，不需要 GitHub 账号或 token；发现新版时会打开官方 release 页面。它只在用户要求时运行；未签名构建不会静默下载或安装更新。

选择普通文件夹时，只会创建 `quillarium-workspace.yaml` 和 `projects/`，并保留其他文件。应用不会初始化 Git、联系 GitHub 或把凭据写进写作库。只有显式保存 GitHub Token 后，设置页才能把独立本地项目连接并上传到 GitHub。

规划详情显示为记录卡，而不是序列化 frontmatter。点击标签 chip 会从右侧拉出项目中精确匹配的所有记录，每项都会显示文档类型。拖动可见分隔线可调整导航、集合、详情、写作和底部 Run 区域；分隔线可以获得键盘焦点并响应方向键。这些尺寸只属于本次 UI 会话，不会写入项目文件。

使用 `pnpm desktop:build` 验证桌面端源码构建。现有 `electron-builder` 配置保留 Windows 和 macOS 打包命令：

```bash
pnpm --filter @quillarium/desktop package:win
pnpm --filter @quillarium/desktop package:mac
```

产物写入 `apps/desktop/release/`。只有当不可变 tag `v<desktop-version>` 与所有 package 版本一致，并且指向最新 `master` 时，才会触发发布工作流。工作流重新运行完整质量门禁，在原生 runner 上构建 Windows x64 NSIS、macOS x64 DMG 和 macOS arm64 DMG，验证安装包集合完整后才创建一个 GitHub Release。alpha 版本自动标记为预发布。失败的 tag 不移动、不复用、不重跑；修复后使用新的只向前版本。详见[发布指南](docs/RELEASING.zh-CN.md)。

## CLI 流程

典型 CLI 流程是：

1. 配置写作工作区并初始化直接项目库；
2. 检查或选择项目的版本化 `WritingPreset`；
3. 添加正设、人物、地点、时间事件、大纲和节；
4. 装配上下文，或运行 `generate --dry-run`，在不联网的情况下检查已经记录的提示词；
5. 生成多个候选，执行确定性检查，并按需增加 `--semantic` 来发现 OOC、状态漂移和正设冲突；
6. 比较候选，明确选择一个，再单独接受并导出正文。

所有 CLI 示例和当前命令表都在 [CLI 指南（英文）](docs/CLI.md)中。运行时命令帮助始终是权威来源：

```bash
pnpm cli --help
pnpm cli <command> --help
```

当前七层结构和明确时间坐标以桌面端为主要操作界面。源码 CLI 为兼容 0.2 之前的调用，仍保留两个旧选项名：`scene create --section` 接收所属章节 ID，`--timeline` 接收关联时间事件 ID。这些名称不会改变当前基于 `chapter_id` 的节模型。

## 项目目录

```text
Writing Workspace/
  quillarium-workspace.yaml
  methodology/            templates/          styles/setting-cards/
  projects/
    my-novel/              # Quillarium 项目根目录，同时是 Obsidian 库
      .obsidian/
      project.yaml
      assets/cover/         assets/display/
      canon/               characters/       character-states/
      factions/            factions/relations/  factions/memberships/
      timeline/            locations/        world/
      foreshadowing/       references/       issues/
      narrative/           strategy/         patterns/         resources/
      causality/           outlines/         chapters/         scenes/
      short-play/          # 短剧剧本、分镜表与视觉资产设置
      prompts/             assistant-prompts/  presets/        runs/        imports/
      context-bundles/     creator-roles/    explorations/
      reviews/             # 评审、应用审计、备份和暂存副本
      style/               exports/
      sillytavern/         .quillarium/
```

`strategy/` 和 `patterns/` 仅为旧版兼容而保留。新的风格、结构、节奏和类型指导创建在 `narrative/` 中。

工作区 manifest 只包含相对、受目录边界约束的路径和非敏感元数据。本机路径和凭据保存在工作区之外的用户配置中。

## Packages

- [@quillarium/core](packages/core/README.md) — 项目存储、文档、上下文、导入、Run、评审、短剧分镜、多层地图画布和书稿导出。
- [@quillarium/checks](packages/checks/README.md) — 确定性检查和可注入语义检查。
- [@quillarium/ai](packages/ai/README.md) — AI 配置、请求、提示词和已记录的生成 Run。
- [@quillarium/cli](packages/cli/README.md) — 基于 Commander 的 CLI 装配。
- [@quillarium/sillytavern](packages/sillytavern/README.md) — Character Card 和 World Info 格式转换。

可按读者目标从[中文文档导航](docs/README.zh-CN.md)进入。产品与 Agent 工作流的设计理由见 [Agent 设计（英文）](docs/AGENT-DESIGN.md)；目标架构和交付优先级见 [系统设计（英文）](docs/DESIGN.md)与[路线图（英文）](ROADMAP.md)；外部设计研究、独立实现规则和许可证边界见[参考资料（英文）](docs/REFERENCES.md)。类型化 Agent 任务、`ContextBundle`、创作助手、会话与权限决策记录在[相关 ADR（英文）](docs/adr/ADR-agent-runtime-and-context-bundles.md)中。

[MVP 工作清单（英文）](docs/MVP-WORKLIST.md)是最初 CLI/项目库 MVP 的历史清单，仅为保留沿革，不是当前使用指南。

## 当前边界

- 桌面安装包尚未签名，因此 Windows SmartScreen 或 macOS Gatekeeper 可能显示警告。CI 会验证三种安装包架构；全新机器的安装、重启、迁移、凭据和无障碍检查仍属于明确的人工发布验收。
- 桌面更新控件会检查并比较 GitHub Release，然后打开官方下载页。在签名更新产物和全新机器升级测试进入发布门禁之前，不自动下载或安装。
- 书稿导出支持 Markdown 和纯文本（短剧分镜额外支持 CSV 与 JSON 资产包导出），不支持 PDF、EPUB 或文字处理器格式。
- 保留的通用 SillyTavern adapter 不支持 CHARX 压缩包，也不会物化 CCv3 内嵌资源。专用小说角色卡流程只支持公开 CCv3 JSON/PNG 的设定交换；没有 Quillarium 类型扩展的外部卡片可能需要作者在审阅时分类。两条流程都不是实时同步，也不构成兼容路线图承诺。
- PNG 读取器提取 `ccv3` 或 `chara` 文本元数据，不是通用 PNG 资源或 CRC 校验库。
- Issue V1 账本、旧问题卡、助手会话、Run、`PromptEnvelope` 和 CCv3 adapter 数据继续可读，且不会仅因打开而重写。V1 suppression 条目只在作者执行问题状态操作后升级；无法解析的助手提示词绑定必须显式从快照恢复或重新绑定。
- 引用索引是可派生缓存。项目加载和普通保存不等待索引；引用视图会验证当前文档集合哈希，并在需要时原子重建。

## 许可证

[MIT](LICENSE)
