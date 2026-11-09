# 接着做（2026-11-08 暂停）

这一版主体还没验收完。从本页接着做，不要从聊天记录重开。产品含义以
[intent.md](intent.md) 为准，模块所有权以
[ADR-work-audiences](adr/ADR-work-audiences.md) 为准，逐条验收以
[FEATURES.zh-CN.md](FEATURES.zh-CN.md) 的条目正文为准。功能清单里的「已有 / 增强 / 新增」状态列没有跟着这次改动改写，不要用那一列判断代码做没做。

目标原文：

> 按已确认的主体完成代码：新建作品问卷写入五档与四开关且不迁移旧作品；壳换成世界书与写作两个主页面并按身份决定进门页；补齐物品、等级、条目作者字段、不完整事件只作草稿、伏笔位置改到写作树、新作品默认只显示卷和章；节合并成章正文草稿快照；分段提示词与作品内模板；拆书导入（默认只出世界书提案，作者点选后才导入正文）。地图画布与编剧（ST-12 至 ST-14、IO-8）不实现。以 docs/FEATURES.zh-CN.md、docs/intent.md、docs/adr/ADR-work-audiences.md 为验收。

## 这一版不做

- 可缩放、可穿透的地图画布（WB-22）。
- 编剧：剧本设定、剧本资产、分镜，以及短剧导出的实现（ST-12 至 ST-14、IO-8、AG-20、CAP-7 的导出本身）。开关可以记下，没有导出入口。
- 不拆 `@quillarium/core`。不把 `WRITER_DEFAULT_STORY_STRUCTURE` 改成篇、幕默认关闭。不给旧作品补问卷。不打 `v0.3.1` tag。不提交，除非作者明确要求。

## 已经在工作区里，不要重做

这些都还没提交。下次先看当前文件，再改。

- 新建作品问卷写入五档和四开关。没有角色的旧作品不补能力记录。入口：`apps/desktop/src/app/App.tsx`，`packages/core/src/work-capabilities.ts`。
- 进作品后是世界书和写作。OC 人、AI 原住民先进世界书，其余和没有角色的作品进写作。内部模式值仍是 `planning` | `writing`。
- 新作品默认只显示卷和章。篇、幕、节在设置的章节树里开关，关掉不删文件。有问卷记录时，节与生文、展示层、生图、短剧导出可以改。入口：`apps/desktop/src/features/settings/TopChrome.tsx`。
- 物品、等级（档从低到高，登记任职）、世界书作者字段、不完整事件只作草稿、伏笔的埋设和回收选写作树上的卷篇幕章。
- 节全部定稿后，按顺序合并成章正文草稿快照。已定稿或已发布的章拒绝再合并。手写章拒绝用节覆盖。`packages/core/src/chapter-lifecycle.ts`。
- 分段提示词：简介、来源、字数，上下按钮改顺序，这一次的文字不写回来源。模板在作品目录 `prompt-templates/`，可以有多份，可以设当前。还没排过的节用当前模板。`packages/core/src/prompt-templates.ts`，`apps/desktop/src/features/writing/AIWritingWorkspace.tsx`。
- 拆书从世界书导入进入。默认只出世界书提案；作者勾选后才把正文写成章草稿。`packages/core/src/book-breakdown.ts`。
- 写作页有伏笔编辑。世界书的基础条目和物品有「转到伏笔」，同一 ID，原文件不留。重要道具不会自动变成伏笔。
- AI 参考资料用 `reference.prompt_material`。为真才被当前模板自动带进生文；只归档的上传仍是假。写作页可以手写、导入、对话起草，对话确认前不写盘。
- 作品壳用 Windows 色：窗口 `#F3F3F3`，内容区白色，文字 `#1A1A1A`，分割线 `#E5E5E5`。皮肤数据还在，作品壳不跟着稿纸色走。`apps/desktop/src/styles.css` 里的 `.app-shell`。

## 下一步

按这个顺序做。做完一条再对 FEATURES 里对应条目核对，不要另开一条产品线。

1. **把「管理伏笔」放到写作页。** FS-2 的提案面板还在 `apps/desktop/src/features/outline/OutlineHome.tsx` 的 `manageForeshadowing`。按钮只在 `activeSection === 'foreshadowing'` 时出现，而 `WORLD_BOOK_SECTION_IDS` 没有这一栏，所以现在点不到。写作页的 `ForeshadowingWorkspace.tsx` 只能手改一条伏笔。下一步：在写作页的伏笔里打开同一套提案，确认后才写入，取消则磁盘不变。
2. **让 AI 参考资料按节纲要组装，而不是把所有写作资料整包塞进模板。** ST-11 要求它进入提示词的方式和世界书相同。现在 `packages/core/src/chapter.ts` 在模板含 `reference` 时，会带上每一个 `prompt_material === true` 的资料。归档资料已经被排除。下一步：只带和本节纲要相关的写作资料，手选和已保存的段顺序保持不变。
3. **写作侧栏不要在每个标签下都铺开结构树。** UI-1 里结构树是写作的一个标签。`WorkspaceView.tsx` 现在在所有写作标签左侧都渲染 `StructureTree`。节和提示词仍要能选中章。下一步：结构树只作为「结构树」标签的内容；其它标签保留选章，不把整棵树当成第二套导航。
4. **检查结果不要跳进世界书里不存在的「问题」栏。** `apps/desktop/src/features/workspace/Workspace.tsx` 在检查应用后执行 `setOutlineSection('issues')`。世界书标签没有「问题」。下一步：结果留在作者当时所在的页面上，或给出写作页里确实存在的去处。
5. **角色卡导入也要先答问卷。** `App.tsx` 的 `importBookCharacterCardProject` 会直接创建作品，不经过新建向导。CAP-1、CAP-3 要求新建作品问完才建目录。下一步：这条路径也先完成五档问卷，再创建目录。
6. **提示词段的顺序交互。** ST-10 写的是上下拖动。现在是上、下按钮，发送顺序已经是作者排好的顺序。数据行为先留着。若还要符合条文，再把按钮换成拖动，不要改发送顺序的规则。
7. **在真实窗口里走一遍主体。** 这次没有打开桌面窗口。要走：新建问卷和进门页、四开关关掉只藏入口、节合并、分段提示词和切换当前模板、拆书默认不导入正文、等级任职、转到伏笔、AI 参考资料的导入和对话确认。没有 Electron 或窗口打不开时，写明没验到哪一步，不要写成已通过。

做完以上几条之后，再按 FEATURES、intent、ADR 逐条对照当前代码。有一条对不上，就不算这一版完成。

## 重启时

- 先读本页，再读功能清单、intent 和 ADR。英文 `DESIGN.md`、`AGENT-DESIGN.md`、`UI-ARCHITECTURE.md` 描述的是更早的实现；和 intent、ADR 冲突时，产品含义以后两者为准。
- 包之间只通过包名导入。不要往 `.dependency-cruiser-known-violations.json` 加条目。
- 不要为了让检查通过去改 `tests/rules/`、`tests/properties/`、`tests/flows/`、`contracts/` 或 `docs/intent.md`。
- 改完相关区域后跑对应的 vitest，再跑 `pnpm exec tsc -b --pretty false`。
- `scripts/check-fast.ps1` 会对照未提交的受保护文件，其中包含 `docs/intent.md` 和 `docs/adr/`。这些文件和 `46e421b` 的差异是作者已经同意的产品含义，还没提交，所以检查会保持红色。不要改检查脚本，也不要把红色写成已通过。
- 作者没有要求时不要提交，不要推远程，不要打 tag。
