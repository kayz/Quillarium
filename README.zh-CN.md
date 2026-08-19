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
  最新稳定版：<a href="https://github.com/kayz/Quillarium/releases/tag/v0.3.0">v0.3.0</a>
  · <a href="docs/README.zh-CN.md">文档导航</a>
</p>

Quillarium（羽笔馆）是一套本地优先、以 Obsidian 为持久化底座的长篇小说创作系统。它以
Markdown 和 YAML 存储小说，让规划事实可追溯，记录 AI Run，检查连续性，并导出作者已经接受的
正文。

Quillarium 是唯一的产品运行时；Obsidian 是持久、可人工编辑的文件界面。一个写作工作区可以注册
多个项目和共享指导资料，每个项目目录同时是一座独立的 Obsidian 库和 Quillarium 项目根目录。

本文描述截至 2026-08-19 已发布的 `0.3.0` 代码线。“当前可用”表示该行为存在于带 tag 的仓库中，
并经过本地测试和发布门禁验证。强类型生命周期事件仍在[路线图](ROADMAP.md)中；连续性应用已经是
可评审、可恢复的原子操作。

## 当前可用能力

- 文件化项目模型覆盖正设、人物与带时间范围的人物关系、关联时间线、空间地点与布局、世界书、伏笔、
  参考资料、问题、叙事卡、七层故事结构、独立章节正文、节、导入、评审和生成 Run。
- 可直接从源码运行的 CLI 能创建和编辑上述记录、导入 Markdown、装配上下文、生成草稿、执行确定性
  检查或显式启用的语义检查、接受 Run，并导出书稿。
- Electron 桌面端可把任意本地文件夹变成写作库，并直接打开或创建项目库，不要求 Git 或 GitHub
  账号。之后可把 GitHub 作为可选上传目标。规划记录可通过多轮后台 AI 对话创建，作者以结构化字段
  和 Markdown 检查结果，明确确认后才会写盘。
- Markdown 规划文档可以安全地切换源码和预览，支持 GFM 表格、嵌套列表、引用、链接和代码围栏，
  不执行原始 HTML。Frontmatter 使用直接控件编辑：标签、触发词、分类等索引字段显示为 chip；列表
  和嵌套记录使用可增删行；只有 Markdown 正文暴露语法。
- 点击项目标签会打开右侧跨类型索引；可折叠元数据组以及可拖动的列、行分隔线让密集记录和长正文
  保持可用。
- 可视化规划工作台提供确定性时间线链、可拖动且按时间过滤的人物关系、六级地点探索、参考资料反向
  索引和问题卡修复。
- 手动项目 AI 检查会排除来源资料和禁用卡片，然后把稳定发现持久化为问题卡。世界书关键词和伏笔条件
  会激活可解释的提示词来源。
- 版本化 WritingPreset 绑定连接配置角色、模型覆盖项、提示词栈、区块顺序、确定性上下文策略和检查
  策略。桌面端与 CLI 选择同一份 preset；每次生成 Run 都保存清理过的不可变快照及 SHA-256 身份。
- 三个内置创作助手负责整理资料、人物试戏和连续性审阅，并遵守各自受限的任务阶段。版本化
  ContextBundle 决定助手知道什么；隔离的助手提示词版本决定它如何工作；WritingPreset 决定模型
  和通用提示结构。每个会话冻结精确配置，并记录消息、权限、来源、token、trace、原始/修复输出和
  proposal。助手对话不属于正设，任何项目或配置写入仍需作者批准。
- 一次生成可以在同一 Run 组中创建 2 到 8 个彼此独立保留的候选。桌面端与 CLI 可以比较候选正文和
  检查结果，只做选择而不写正文，也可以从任一保留候选创建新分支。只有单独的“接受”操作才会写入
  节和章节正文。
- 已定稿章节可以启动 AI 辅助连续性评审，但模型没有写权限。每一项可执行修改都需要作者明确决策。
  桌面端与 CLI 使用同一服务验证全部目标及哈希，保留完整备份，应用整个修改集，重新读取并验证每个
  文件，再记录恢复审计；任一失败都会恢复整个集合。
- 可从定稿/已发布章节正文、已接受输出或最终节内容导出 Markdown 和纯文本书稿，缺口会明确报告，
  也可按卷筛选。
- 七层工作流由顶层的总览和总纲，以及卷、篇、可选幕、章、节组成。节生成纯文本候选；接受节后把
  正文追加到章节正文。章节正文依次经历草稿、定稿和不可变的已发布状态。
- 项目设置可以隐藏篇、幕或节而不删除其 Markdown。章会显示在最近的已启用父层级下；被禁用的文件
  仍能通过检查器查看；禁用节时，也会移除绑定在节上的 AI 生文入口。旧项目只在内存中默认启用所有
  层级，单纯打开不会改写项目文件。
- 世界书、人物、地点、人物关系和势力均可携带一张项目内主图片。原图和 PNG 缩略图位于
  `assets/settings/`；卡片与关系图优先显示缩略图，而 Markdown 只记录经过校验的相对路径、尺寸、
  哈希、焦点、替代文字和小型色板。
- 世界书、人物、地点和人物关系可以渲染为自包含、沙箱化的 HTML 设定卡。内置样式和已保存的工作区
  样式无需模型调用即可立即渲染；只有选择“随机风格”时才会调用受限的 `setting-card-design`
  Agent。Agent 只接收设定文字和图片尺寸、宽高比、色板、替代文字，不接收像素或本机路径。每次
  Roll 都使用不同的、由代码控制的构图和视觉维度要求；历史候选可以左右翻阅；满意的候选可命名并
  保存到同一个样式下拉框，以供其他小说复用。导出 HTML 会打开系统“另存为”，且只写入作者选择的
  位置。核心属性会获得结构化呈现，布局可以安全突出一个指定核心字段，人物小传等长文本中的常用
  Markdown 会显示为标题、表格、列表、引用、强调和段落。
- 势力是一等组织卡片，势力关系和人物归属使用独立文档。所有链接都使用稳定 ID，并可带开始包含、
  结束不包含的时间范围。按时间过滤的人物关系图会在人物旁显示势力标志；没有图片时使用确定性的
  “圆圈 + 一至两个名称字符”，多个当前有效的归属会同时显示。
- 通用规划卡选择器支持搜索、键盘操作和虚拟滚动，并在关系与带时间定位的伏笔控件中始终保存稳定
  ID。规划 AI 会话保留多个可独立编辑的 proposal，在受限网格中完整显示，并在恢复后始终把来源卡
  固定在第一位。明确的批量确认和依赖感知原子应用会把会话临时引用解析成新卡的项目稳定 ID，绝不
  静默写入。
- 创建参考资料是确定性、可回滚的 UTF-8 Markdown/文本上传，不调用 AI，也不保留外部绝对路径。
  保存后的参考资料可由作者显式发起多卡 AI 讨论；它是经过哈希校验的只读来源，派生卡会自动把其
  稳定 ID 写入 `source_refs`，会话不会修改参考资料本身。
- 专用问题工作区支持批量忽略、标记已解决和恢复待处理。稳定 suppression fingerprint 能阻止被
  忽略的问题重复出现，同时不会错误压制之后重新检测到的已解决问题。
- 本书生文头部提示词、精确 PromptEnvelope/provider-request 快照，以及只读的分块/全文/消息查看器，
  让模型实际可见的提示词可以检查并安全复制。
- 基于公开格式的 CCv3 单向交换可以从 JSON/PNG 角色卡创建故事结构为空的新项目，也可以把作者选择
  的小说设定导出为一张使用封面的 CCv3 PNG。它不会传输正文、剧情计划、提示词、preset、API 配置、
  凭据或运行状态。
- 0.2.3 可靠性边界已并入本版：CCv3 小说导入使用事务；问题 suppression 升级为带证据锚点的 V2
  身份；助手提示词原子绑定；引用索引按需重建；人物试戏在明确故事时间解析状态；敏感提示词在创建
  新 Run 或 provider request 之前被阻断。
- 0.3.0 设定工作台边界增加项目内图片、纯文本 HTML 设计 Agent、工作区级可复用卡片样式、可逆的
  故事树可见性，以及类型化势力网络。

## 0.3.1 本地候选版

当前 `v0.3.0` 之后的 `0.3.1` 本地候选版增加了经审阅的设定卡类型转换，以及从作者手写章节正文抽取设定。正设只
与世界书互转；世界书是转换中心，可以与人物、人物关系、地点、时间线事件、势力及其关系/成员卡、
伏笔和叙事卡互转。转换沿用稳定卡片 ID、共享标签、来源、关系、图片元数据和 Markdown 正文，作者在
现有多卡提案对话框中审阅目标字段。应用时取得项目写锁并检查原文件哈希；新文件复读验证且会话快照
落盘后才删除旧类型文件。冲突或失败时不留下项目写入。

章节正文编辑器也可以对已经手写的内容执行“从正文抽取设定”。已保存的正文是受哈希保护的只读来源，
不会成为可编辑提案。AI 可以一次给出多张只新增的正设和设定卡候选；Quillarium 由代码为每张卡增加
指向正文稳定 ID 的 `derived_from` 关系，只写入作者明确确认的卡片，抽取过程绝不修改正文。

在已打开的项目中可直接拖入本地文本或 Markdown 文件。Quillarium 会先询问是将其确定性归档为参考
文档，还是进入需要人工审阅的 AI 设定导入；仅拖入文件不会写盘，也不会调用模型。每个可直接维护的
设定栏目同时提供独立的“新建空白卡”，空白卡以禁用的草稿状态开始，方便作者手填；关系、成员归属和
时间坐标仍通过要求稳定引用的专用表单创建。

同一候选版把四个只含配色的主题升级为四个完整且可编辑的界面皮肤。`paper`、`ink`、`mist`、
`bamboo` 继续作为兼容存储 ID；每个皮肤通过有界 CSS token 控制配色、界面/正文字体、字号比例、
面板间距、主导航与详情位置、工具栏排列，以及按钮形状、填充方式和尺寸。设置页即时预览，但只有保存
才会写盘；皮肤、密度和全局语言一次保存，恢复内置只删除当前皮肤的自定义。旧全局配置与项目
`default_theme` 无需迁移，读取时也不会被改写。详见中英文对照的
[界面皮肤契约](docs/UI-SKINS.zh-CN.md)。

项目管理、导入、上下文装配、确定性检查和导出都不要求 AI。生成以及 `check --semantic` 需要
OpenAI 兼容 endpoint 或已经配置的 provider。

上下文编译器是确定性、可解释且受模型预算约束的。它根据大纲链、显式固定/排除、类型化关系、时间线
链接、关键词激活和卡片启用状态选择内容；再进行循环安全、深度受限的关系扩展；最后输出类型化
`PromptBlock` 和完整 `ContextTrace`。DeepSeek V4 及受支持的 OpenAI 模型族使用打包的精确
tokenizer。未知 tokenizer/模型组合会关闭失败，而不是静默使用字符估算。Run 元数据记录候选组、
父 Run、分支、索引和选择时间；每个候选保留自己的提示词、输出、检查报告和比较分数。

## 快速开始

前置条件是 Node.js 和 pnpm。在仓库根目录执行：

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

项目会创建并注册到 `./writing-workspace/projects/my-novel`，该目录同时也是 Obsidian 库。显式
`init --vault <path>` 只保留用于旧版兼容。端到端写作、检查、接受和导出流程见
[CLI 指南（英文）](docs/CLI.md)，其中也记录了可选的旧 SillyTavern 命令。

## 桌面端流程

从源码启动 Electron 应用：

```bash
pnpm desktop:dev
```

然后选择任意本地文件夹作为写作库，打开或创建项目库，建立大纲和配套设定，选择章节，准备节，再
编辑或生成正文。AI 页面会在精确、可编辑的提示词旁显示可移除的提示来源卡；可大幅调整尺寸的章节
正文编辑器会显示字数反馈。运行时与迁移服务继续兼容旧布局，但欢迎页不再把旧布局作为主动选项。
迁移永远是显式的“预演 → 备份 → 应用 → 验证 → 报告”，不会移动或删除来源。上下文/检查器和已记录
Run 让输入输出可复核。

全宽“创作助手”工作区左侧显示会话与助手，中间显示对话、探索和 proposal，右侧显示来源、原因、
权威、token、权限和输出位置。人物卡、章/节和资料导入都可以直接打开对应助手。

在已经定稿的章节中，“定稿审阅与应用”会展示每一项连续性影响和待作者决定的问题；只有没有待定项
时才允许原子应用。“恢复检查”可用保留的 before image 恢复被中断的事务。

主题、密度、语言、GitHub 凭据、各 AI profile 和项目 WritingPreset 都有独立的设置操作。没有
preset 的旧项目必须先显式创建/选择 preset，之后才能生成。

设置页可以手动检查公开的 Quillarium GitHub Releases。检查理解稳定版和预发布通道，不需要
GitHub 账号或 token；发现新版时会打开官方 release 页面。它只在用户要求时运行；未签名构建不会
静默下载或安装更新。

选择普通文件夹时，只会创建 `quillarium-workspace.yaml` 和 `projects/`，并保留其他文件。应用
不会初始化 Git、联系 GitHub 或把凭据写进写作库。只有显式保存 GitHub Token 后，设置页才能把
独立本地项目连接并上传到 GitHub。

规划详情显示为记录卡，而不是序列化 frontmatter。点击标签 chip 会从右侧拉出项目中精确匹配的所有
记录，每项都会显示文档类型。拖动可见分隔线可调整导航、集合、详情、写作和底部 Run 区域；分隔线
可以获得键盘焦点并响应方向键。这些尺寸只属于本次 UI 会话，不会写入项目文件。

使用 `pnpm desktop:build` 验证桌面端源码构建。现有 `electron-builder` 配置保留 Windows 和
macOS 打包命令：

```bash
pnpm --filter @quillarium/desktop package:win
pnpm --filter @quillarium/desktop package:mac
```

产物写入 `apps/desktop/release/`。只有当不可变 tag `v<desktop-version>` 与所有 package 版本
一致，并且指向最新 `master` 时，才会触发发布工作流。工作流重新运行完整质量门禁，在原生 runner
上构建 Windows x64 NSIS、macOS x64 DMG 和 macOS arm64 DMG，验证安装包集合完整后才创建一个
GitHub Release。alpha 版本自动标记为预发布。失败的 tag 不移动、不复用、不重跑；修复后使用新的
只向前版本。详见[发布指南](docs/RELEASING.zh-CN.md)。

## CLI 流程

典型 CLI 流程是：

1. 配置写作工作区并初始化直接项目库；
2. 检查或选择项目的版本化 WritingPreset；
3. 添加正设、人物、地点、时间事件、大纲和节；
4. 装配上下文，或运行 `generate --dry-run`，在不联网的情况下检查已经记录的提示词；
5. 生成多个候选，执行确定性检查，并按需增加 `--semantic` 来发现 OOC、状态漂移和正设冲突；
6. 比较候选，明确选择一个，再单独接受并导出正文。

所有 CLI 示例和当前命令表都在 [CLI 指南（英文）](docs/CLI.md)中。运行时命令帮助始终是权威来源：

```bash
pnpm cli --help
pnpm cli <command> --help
```

当前七层结构和明确时间坐标以桌面端为主要操作界面。源码 CLI 为兼容 0.2 之前的调用，仍保留两个旧
选项名：`scene create --section` 接收所属章节 ID，`--timeline` 接收关联时间事件 ID。这些名称
不会改变当前基于 `chapter_id` 的节模型。

## 项目目录

```text
Writing Workspace/
  quillarium-workspace.yaml
  methodology/            templates/          styles/setting-cards/
  projects/
    my-novel/              # Quillarium 项目根目录，同时是 Obsidian 库
      .obsidian/
      project.yaml
      assets/cover/         assets/settings/
      canon/               characters/       character-states/
      factions/            factions/relations/  factions/memberships/
      timeline/            locations/        world/
      foreshadowing/       references/       issues/
      narrative/           strategy/         patterns/         resources/
      causality/           outlines/         chapters/         scenes/
      prompts/             assistant-prompts/  presets/        runs/        imports/
      context-bundles/     creator-roles/    explorations/
      reviews/             # 评审、应用审计、备份和暂存副本
      style/               exports/
      sillytavern/         .quillarium/
```

`strategy/` 和 `patterns/` 仅为旧版兼容而保留。新的风格、结构、节奏和类型指导创建在
`narrative/` 中。

工作区 manifest 只包含相对、受目录边界约束的路径和非敏感元数据。本机路径和凭据保存在工作区之外
的用户配置中。

## Packages

- [@quillarium/core](packages/core/README.md) — 项目存储、文档、上下文、导入、Run、评审和书稿导出。
- [@quillarium/checks](packages/checks/README.md) — 确定性检查和可注入语义检查。
- [@quillarium/ai](packages/ai/README.md) — AI 配置、请求、提示词和已记录的生成 Run。
- [@quillarium/cli](packages/cli/README.md) — 基于 Commander 的 CLI 装配。
- [@quillarium/sillytavern](packages/sillytavern/README.md) — Character Card 和 World Info 格式转换。

可按读者目标从[中文文档导航](docs/README.zh-CN.md)进入。产品与 Agent 工作流的设计理由见
[Agent 设计（英文）](docs/AGENT-DESIGN.md)；目标架构和交付优先级见
[系统设计（英文）](docs/DESIGN.md)与[路线图（英文）](ROADMAP.md)；外部设计研究、独立实现规则和
许可证边界见[参考资料（英文）](docs/REFERENCES.md)。类型化 Agent 任务、ContextBundle、创作助手、
会话与权限决策记录在
[相关 ADR（英文）](docs/adr/ADR-agent-runtime-and-context-bundles.md)中。

[MVP 工作清单（英文）](docs/MVP-WORKLIST.md)是最初 CLI/项目库 MVP 的历史清单，仅为保留沿革，不是
当前使用指南。

## 当前边界

- 桌面安装包尚未签名，因此 Windows SmartScreen 或 macOS Gatekeeper 可能显示警告。CI 会验证三种
  安装包架构；全新机器的安装、重启、迁移、凭据和无障碍检查仍属于明确的人工发布验收。
- 桌面更新控件会检查并比较 GitHub Release，然后打开官方下载页。在签名更新产物和全新机器升级测试
  进入发布门禁之前，不自动下载或安装。
- 书稿导出支持 Markdown 和纯文本，不支持 PDF、EPUB 或文字处理器格式。
- 保留的通用 SillyTavern adapter 不支持 CHARX 压缩包，也不会物化 CCv3 内嵌资源。专用小说角色卡
  流程只支持公开 CCv3 JSON/PNG 的设定交换；没有 Quillarium 类型扩展的外部卡片可能需要作者在
  审阅时分类。两条流程都不是实时同步，也不构成兼容路线图承诺。
- PNG 读取器提取 `ccv3` 或 `chara` 文本元数据，不是通用 PNG 资源或 CRC 校验库。
- Issue V1 账本、旧问题卡、助手会话、Run、PromptEnvelope 和 CCv3 adapter 数据继续可读，且不会
  仅因打开而重写。V1 suppression 条目只在作者执行问题状态操作后升级；无法解析的助手提示词绑定
  必须显式从快照恢复或重新绑定。
- 引用索引是可派生缓存。项目加载和普通保存不等待索引；引用视图会验证当前文档集合哈希，并在需要时
  原子重建。

## 许可证

[MIT](LICENSE)
