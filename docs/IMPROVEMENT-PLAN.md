# Quillarium 完善方案(多 Agent 并行开发计划)

> 版本:1.0 / 2026-07-06
> 适用对象:Claude Code / Codex 等编码 Agent,支持多子 Agent 并行执行。
> 本文档是唯一的任务分派依据。每个工作包(WP)自带:目标、涉及文件、实现要点、验收标准(DoD)、验证命令。

---

## 0. 现状基线(所有 Agent 开工前必读)

- Monorepo:pnpm workspace + TypeScript project references + Vitest。
- 包结构:
  - `packages/core`(约 4,200 行,18 文件):文档 schema、YAML frontmatter 数据层、项目脚手架、导入、run 记录。唯一有测试的包(2 个测试文件,10 个用例)。
  - `packages/checks`(446 行,单文件):`checkOutline` / `checkScene` / `checkTarget` / `formatCheckReport`,纯结构性规则检查。
  - `packages/ai`(182 行,单文件):多 provider(openai/openai-compatible/claude/gemini/deepseek/ollama)配置与调用。
  - `packages/cli`(773 行,单文件):commander 命令集。
  - `apps/desktop`:Electron + React。`src/main.tsx` 4,333 行(约 30 个组件、81 个函数),`electron/main.ts` 711 行(49 个 IPC handler),`electron/preload.ts` 74 行。
- 构建/测试现状:`tsc -b` 通过,`vitest run` 10/10 通过。以此为回归基线,**任何 WP 不得使其变红**。
- 已知问题:测试覆盖严重不足;两个巨型文件;checks 只有结构校验无语义校验;API key 明文存 `config.json`;仓库卫生问题(`.vite-manual.*.log` 未忽略、`pnpm-workspace.yaml` 的 `allowBuilds` 为占位符文本、无 `.gitattributes`)。

### 0.1 全局约定(每个子 Agent 的系统性约束)

1. **验证命令**:每个 WP 完成后必须在仓库根执行 `pnpm build && pnpm test && pnpm lint`,三者全绿才算完成。
2. **禁止顺手重构**:只改本 WP 文件所有权清单内的文件。需要改公共文件时,见 §0.2 冲突规避。
3. **公共 API 冻结**:`@quillarium/core` 现有导出符号(`context/config/chapter/documents/fs/ids/import-session/importer/prompts/project/review/runs/schema/types/yaml`)在 Phase 1 期间只增不改不删。改签名的需求上报编排者,排入 Phase 2。
4. **提交规范**:沿用现有 conventional commits(`feat:` / `fix:` / `docs:` / `test:` / `refactor:` / `chore:`)。每个 WP 一个分支 `wp/<编号>-<短名>`,单独 PR。
5. **语言**:代码注释与标识符用英文;面向用户的 UI 文案维持现有中英文双语机制。
6. **不引入新运行时依赖**,除非 WP 明确列出。开发依赖按 WP 说明添加。

### 0.2 文件所有权矩阵(并行冲突规避)

同一 Phase 内,每个文件/目录只属于一个 Track。矩阵外文件默认冻结。

| 路径                                                              | Phase 1 所有权                             |
| ----------------------------------------------------------------- | ------------------------------------------ |
| `packages/checks/**`                                              | Track A(测试)                              |
| `packages/cli/**`                                                 | Track A                                    |
| `packages/core/src/*.test.ts`(新增)                               | Track A                                    |
| `apps/desktop/src/**`                                             | Track B(UI 拆分)                           |
| `apps/desktop/electron/**`                                        | Track C(主进程)                            |
| `packages/ai/**`                                                  | Track C                                    |
| `packages/core/src/config.ts`                                     | Track C(仅 WP-C3 的追加式修改)             |
| 根配置(`.gitattributes`、`.gitignore`、`pnpm-workspace.yaml`、CI) | Phase 0(串行,先于一切)                     |
| `docs/**`                                                         | 各 Track 只允许新增自己的文档,不改他人文档 |

跨 Track 需求的处理:在 `docs/plan-inbox.md` 追加一条记录(格式:`- [ ] <来源WP> 需要 <目标Track> 提供 <内容>`),由编排者调度,不得直接改对方文件。

---

## 1. 总体路线

```text
Phase 0  仓库卫生(串行,半天)
Phase 1  三轨并行(核心质量攻坚)
   Track A: 测试体系          Track B: 桌面 UI 拆分       Track C: 主进程/AI/安全
Phase 2  能力升级(语义检查引擎、SillyTavern 互导、导出)
Phase 3  验证与发布(dogfooding、打包分发、文档)
```

依赖关系:

```text
Phase 0 ──► Track A ─┐
        ├─► Track B ─┼──► Phase 2(WP-D1 依赖 A;WP-D2/D3 依赖 C;WP-D4 依赖 B)──► Phase 3
        └─► Track C ─┘
```

---

## 2. Phase 0:仓库卫生(WP-0,单 Agent 串行执行)

**目标**:消除环境噪音,让后续所有并行 Agent 有干净基线。

**涉及文件**:`.gitattributes`(新建)、`.gitignore`、`pnpm-workspace.yaml`、`.github/workflows/ci.yml`、删除 `.vite-manual.err.log` / `.vite-manual.out.log`。

**任务清单**:

1. 新建 `.gitattributes`:`* text=auto eol=lf`,并对 `*.png` 等二进制类型标 `binary`。执行 `git add --renormalize .` 单独提交,消除全仓 EOL 噪音。
2. `.gitignore` 追加:`*.log`、`.vite-manual.*`、`local-vaults/`。
3. 修复 `pnpm-workspace.yaml`:`allowBuilds` 当前是占位符文本(`electron: set this to true or false`),改为 pnpm v9+ 正确写法:

   ```yaml
   onlyBuiltDependencies:
     - electron
     - esbuild
   ```

4. CI 增强(`.github/workflows/ci.yml`):在现有 build 之外加 `pnpm lint`、`pnpm test`、`pnpm format:check` 四个 job(或同 job 四步),Node 22 + pnpm 9,启用 pnpm 缓存。
5. 在根 `package.json` 增加脚本 `"test:coverage": "vitest run --coverage"`,添加 devDependency `@vitest/coverage-v8`。

**DoD**:干净 clone 后 `pnpm install && pnpm build && pnpm test && pnpm lint && pnpm format:check` 全绿;`git status` 干净;CI 通过。

---

## 3. Phase 1 / Track A:测试体系(Agent A)

**Agent A 启动提示词要点**:你负责 Quillarium 的测试体系。只允许修改 `packages/checks`、`packages/cli`、以及各包内新增 `*.test.ts` 文件。不得修改被测实现的行为;如发现实现 bug,写一个 `it.fails(...)` 或 skip 的用例并在 `docs/plan-inbox.md` 记录,不要自行修复。

### WP-A1:checks 包测试基建与规则级单测(最高优先级)

**目标**:`packages/checks` 是产品核心卖点(一致性检查),当前零测试。为每条规则建立正反用例。

**涉及文件**:`packages/checks/src/index.test.ts`(新建)、`packages/checks/src/fixtures/`(新建,测试夹具工厂)。

**实现要点**:

1. 建立夹具工厂 `fixtures/project.ts`:提供 `createTempProject()`,用 `@quillarium/core` 的 `project.ts` 脚手架 API 在 `os.tmpdir()` 下生成临时小说项目,并提供 `addDoc(type, data, content)` 辅助函数写入 canon/outline/scene/timeline_event/location/route/character_state/strategy/foreshadowing 各类文档(参考 `packages/core/src/example-fixture.test.ts` 现有做法,复用而非重复)。
2. 逐规则覆盖 `checkOutline`(现有规则至少包括:`missing-canon`、`missing-locations`、`missing-strategy`、`strategy-in-canon`、`timeline-chain-gaps`、`book-missing-reader-promise`、`missing-volume-outline`、`volume-missing-goal`、`volume-missing-event-chain`,以实际源码 `grep "code: '"` 结果为准,**每个 code 一个触发用例 + 一个不触发用例**)。
3. 同法覆盖 `checkScene` 全部规则,重点:路线可达性检查(`route` 的 from/to 双向匹配,第 377-381 行附近逻辑)需要 3 个用例:有正向路线、有反向路线、无路线。
4. 覆盖 `checkTarget` 的分发逻辑与 `formatCheckReport` 的输出格式(快照测试)。
5. 中文正则规则(`/叙事策略|文风|节奏|爽点/`)需要中文内容夹具。

**DoD**:`vitest run packages/checks` 全绿;`vitest run --coverage` 中 `packages/checks/src/index.ts` 行覆盖率 ≥ 85%;每个 `CheckIssue.code` 至少出现在一个断言中。

### WP-A2:CLI 冒烟测试

**目标**:773 行 CLI 零测试,建立端到端冒烟层防回归。

**涉及文件**:`packages/cli/src/cli.test.ts`(新建);允许对 `packages/cli/src/index.ts` 做**最小重构**:把 `program.parse()` 从模块顶层移到 `if` 守卫后,导出 `buildProgram(): Command` 以便测试内注入(这是本 Track 唯一允许的实现改动)。

**实现要点**:

1. 用 `buildProgram()` + `program.parseAsync([...])` 在临时目录跑真实命令,不 mock 文件系统。
2. 覆盖场景(每条独立用例):`init` 建项目并断言目录结构与 `project.yaml`;`canon add` / `canon list`;`character add`;`timeline append` 两次并断言 previous/next 链;`foreshadowing add`;`issue add`;`config set-vault` / `get-vault`(用 env 或参数把 config 路径重定向到临时目录——若 `configPath()` 不可重定向,在 `plan-inbox.md` 登记,改测其他命令)。
3. AI 相关命令(generate 等)只测"无 API key 时报友好错误",不发真实请求。

**DoD**:≥ 10 个 CLI 用例全绿;测试不产生仓库内残留文件;不联网。

### WP-A3:core 包补测

**目标**:core 是所有上层的地基,现有 10 个用例不足。

**涉及文件**:`packages/core/src/` 下新增 `yaml.test.ts`、`ids.test.ts`、`documents.test.ts`、`context.test.ts`。

**实现要点**:frontmatter 解析/序列化往返(含中文、多行、特殊字符);id 生成唯一性与格式;`listDocs`/`requireDoc` 对缺失文件、损坏 YAML、未知 type 的行为;`context.ts` 的上下文组装(给定小型项目夹具,断言组装结果包含/排除的文档集合,防止上下文膨胀回归——这是 f8ed694 "trim canon discussion AI context" 修的那类 bug)。

**DoD**:core 行覆盖率 ≥ 70%;全部用例可在无网络环境运行。

---

## 4. Phase 1 / Track B:桌面 UI 拆分(Agent B)

**Agent B 启动提示词要点**:你负责把 `apps/desktop/src/main.tsx`(4,333 行)拆成模块化结构。**纯机械搬移,禁止改任何运行时行为、样式、文案**。每完成一个 WP 就运行 `pnpm build` 与 `pnpm desktop:dev` 手工冒烟(启动、打开项目、切换工作区)。只允许修改 `apps/desktop/src/**`。

**目标结构**(拆分终态):

```text
apps/desktop/src/
  main.tsx                 # 仅入口:render(<App/>)
  app/App.tsx              # 路由与全局状态(原 App)
  app/types.ts             # 共享类型(DocEntry 等)
  app/bridge.ts            # window.quill 桥接的类型化封装(供 Track C 的 WP-C2 对接)
  features/
    welcome/Welcome.tsx
    workspace/Workspace.tsx
    workspace/TopChrome.tsx
    workspace/StructureTree.tsx
    workspace/ModuleNav.tsx
    workspace/ModuleView.tsx
    workspace/ModuleFilters.tsx
    workspace/ModuleCreateForm.tsx
    outline/OutlineHome.tsx
    outline/OutlineSummary.tsx
    outline/OutlineWorkbench.tsx
    outline/OutlineBoard.tsx
    outline/BeatBoard.tsx
    volume/VolumeHome.tsx
    volume/VolumeTimeline.tsx
    writing/WritingWorkspace.tsx
    writing/WritingSidebar.tsx
    writing/WritingBottomPanel.tsx
    writing/WordProgress.tsx
    writing/MarkdownPreview.tsx
    canon/CanonWorkspace.tsx
    inspector/Inspector.tsx
    inspector/InspectorCard.tsx
    inspector/MetadataEditor.tsx
    inspector/StructuredTile.tsx
    runs/RunPanel.tsx
    settings/SettingsModal.tsx
    locations/RouteTable.tsx
  shared/                  # 跨 feature 的 hooks 与纯函数工具
```

### WP-B1:类型与工具层抽离

抽出 `app/types.ts`(所有跨组件 interface/type)与 `shared/` 纯函数(main.tsx 中非组件的 helper),`main.tsx` 通过 import 使用。**DoD**:`main.tsx` 行数下降且 build 绿;无任何组件逻辑改动(git diff 仅为搬移 + import)。

### WP-B2:按 feature 目录搬移组件

按上述终态结构逐目录搬移(建议顺序:settings → runs → inspector → canon → writing → volume → outline → workspace → welcome → app)。每搬完一个目录提交一次。组件间 props 接口保持原样。**DoD**:`main.tsx` ≤ 30 行;每个组件文件 ≤ 500 行(`OutlineWorkbench` 等超大组件允许 ≤ 800 行,拆内部子组件排 Phase 3);build/lint 绿;手工冒烟通过。

### WP-B3:桥接层收口

新建 `app/bridge.ts`:把散落在各组件里的 `window.quill.xxx` / `ipcRenderer.invoke` 调用统一收口成一个类型化模块(每个 IPC channel 一个函数,签名先按现状手写)。组件全部改为 import bridge。**这是与 Track C 的对接面**:WP-C2 产出共享类型后,bridge.ts 换成引用共享类型,届时仅此一个文件需要联动。**DoD**:`grep -rn "window.quill" src/ | grep -v bridge.ts` 为空;build 绿。

---

## 5. Phase 1 / Track C:主进程、AI 与安全(Agent C)

**Agent C 启动提示词要点**:你负责 Electron 主进程拆分、IPC 类型化与密钥安全。只允许修改 `apps/desktop/electron/**`、`packages/ai/**`、`packages/core/src/config.ts`(仅追加)。不得改 renderer(`apps/desktop/src`)。

### WP-C1:electron/main.ts 按域拆分

**目标**:711 行、49 个 handler 的单文件按 IPC 前缀拆成模块。

**目标结构**:

```text
apps/desktop/electron/
  main.ts                  # 仅:窗口创建、菜单、registerAllHandlers()
  ipc/
    config.ts              # config:* (9 个 handler)
    project.ts             # project:* / doc:* / prompt:*
    scene.ts               # scene:* / target:* / outline:generate / chapter:writingPlan
    import.ts              # import:* / finalize:*
    run.ts                 # run:*
    git.ts                 # git:* / github:*
    canon.ts               # canon:discuss
  ipc/registry.ts          # channel 名常量表 + registerAllHandlers
```

**实现要点**:纯搬移;每个模块导出 `register(ipcMain, ctx)`;`ctx` 携带现有共享状态(窗口引用、配置缓存等)。**DoD**:49 个 channel 全部保留且名称不变(用 `grep -oE "ipcMain.handle\('[^']+'" -r electron/ | sort` 与基线比对);`pnpm desktop:dev` 冒烟通过。

### WP-C2:IPC 契约类型化

**目标**:renderer 与 main 之间目前靠约定,无类型保障。

**涉及文件**:`apps/desktop/electron/ipc/contract.ts`(新建)、`preload.ts`、`apps/desktop/src/vite-env.d.ts`。

**实现要点**:

1. `contract.ts` 定义 `QuillIpcContract` 接口:49 个 channel 每个一条,`{ req: ...; res: ... }`,类型从现有 handler 实现反推,能引用 `@quillarium/core` 类型的就引用。
2. `preload.ts` 用 mapped type 从契约生成 `window.quill`,`ipcMain.handle` 侧加类型包装函数 `typedHandle<K extends keyof QuillIpcContract>(...)`。
3. `vite-env.d.ts` 的 `window.quill` 声明改为从契约导入。
4. 完成后在 `plan-inbox.md` 通知 Track B:bridge.ts 可切换到 contract 类型。

**DoD**:main、preload、renderer 三侧 `tsc -b` 全绿且 renderer 侧对 `window.quill` 的调用获得完整类型推断(抽查:故意写错一个参数类型应编译失败,验证后还原)。

### WP-C3:API key 安全存储

**目标**:`config.json` 中 `aiProfiles[].apiKey` 明文落盘,改为 Electron `safeStorage` 加密,CLI 环境降级为环境变量优先。

**涉及文件**:`packages/core/src/config.ts`(追加字段)、`apps/desktop/electron/ipc/config.ts`、`packages/ai/src/index.ts`、`docs/CLI.md`(追加说明)。

**实现要点**:

1. config schema 追加 `apiKeyEncrypted?: string`(base64);读取优先级:`QUILL_AI_API_KEY` 环境变量 > `apiKeyEncrypted`(仅桌面端可解密)> 明文 `apiKey`(兼容旧配置,读到即在下次保存时迁移加密并删除明文字段)。
2. 加解密只在主进程做(`safeStorage.encryptString/decryptString`);`loadAIProfile` 增加可选参数注入解密函数,core/ai 包本身不依赖 electron。
3. `safeStorage.isEncryptionAvailable() === false` 时保持明文并在设置界面返回警告标记(UI 展示由 Track B 在 Phase 2 接)。
4. CLI 路径不加密,文档明确"CLI 用环境变量或 .env,桌面端自动加密"。

**DoD**:桌面端保存 AI profile 后 `config.json` 中无明文 key;旧配置首次加载自动迁移;CLI `QUILL_AI_API_KEY` 优先级测试用例通过(测试放 `packages/ai/src/index.test.ts`,注入 fake 解密函数)。

### WP-C4:ai 包健壮性

**目标**:统一错误处理与超时,当前 `fetch` 失败路径未验证。

**涉及文件**:`packages/ai/src/index.ts`、`packages/ai/src/index.test.ts`(新建)。

**实现要点**:请求加 `AbortSignal.timeout`(默认 120s,可配);非 2xx 响应解析 provider 错误体并抛出带 `provider`/`status`/`hint` 的结构化 `AIRequestError`;对 429/5xx 做一次指数退避重试(可关);单测用 `vi.stubGlobal('fetch', ...)` 模拟成功/超时/429/500/畸形 JSON 五种情况。

**DoD**:5 类场景单测全绿;不改公开函数签名(只增可选参数)。

---

## 6. Phase 2:能力升级(依赖 Phase 1 对应 Track 完成)

### WP-D1:语义一致性检查引擎(依赖 Track A;核心差异化功能)

**目标**:README 承诺的"人物 OOC、服装/伤势/物品/知识状态漂移"检测,现有 checks 全是结构校验,无法覆盖。引入 AI 辅助语义检查,与结构检查统一到同一份 `CheckReport`。

**涉及文件**:`packages/checks/src/semantic/`(新建)、`packages/checks/src/index.ts`(追加导出)、`packages/ai`(消费方)、CLI 与 IPC 各加一个入口。

**实现要点**:

1. 新增 `runSemanticChecks(projectRoot, sceneId, aiInvoke)`:`aiInvoke` 为注入的函数(签名 `(prompt: string) => Promise<string>`),checks 包不直接依赖 ai 包,保持可测。
2. 三个检查器,各自独立 prompt 模板(放 `semantic/prompts/*.md`,便于迭代):
   - `ooc-check`:输入 = 场景正文 + 该角色的 character 卡 + 最近 3 个场景中该角色的 `character_state`;输出 = 结构化 JSON(用 zod 校验)列出疑似 OOC 行为与依据引文。
   - `state-drift-check`:输入 = 场景正文 + 上一场景的 `character_state`(服装/伤势/持有物/知识);输出 = 状态变化清单,标注"合理演进 / 无解释突变"。
   - `canon-conflict-check`:输入 = 场景正文 + 相关 canon 文档(按关键词粗筛,上限 20 条);输出 = 冲突项与 canon 条目 id。
3. AI 输出解析失败时降级为 `severity: 'info', code: 'semantic-check-unparseable'`,绝不让检查流程抛异常。
4. 结果并入 `CheckReport.issues`,code 前缀 `semantic-`;`formatCheckReport` 无需改动。
5. CLI:`quill check <sceneId> --semantic`;IPC:新 channel `scene:semanticCheck`(注意在 WP-C2 的 contract 中登记)。
6. 单测:`aiInvoke` 用 canned JSON 响应 mock,覆盖正常/畸形输出/超时三路径。

**DoD**:mock 测试全绿;真实 AI 冒烟(任一 provider)在示例项目上产出至少一条有意义的 semantic issue;不配置 AI 时 `--semantic` 给出清晰提示而非报错。

### WP-D2:SillyTavern 互导(依赖 Track C;ROADMAP Milestone 6)

**目标**:补齐 ROADMAP 承诺的最后一个未动工里程碑。

**涉及文件**:`packages/sillytavern/`(新包)、CLI 与 IPC 入口。

**实现要点**:

1. 新建 `packages/sillytavern`(依赖 core,遵循现有包模板:tsconfig references、vitest)。
2. 角色卡导入:支持 Character Card V2/V3 JSON 与 PNG 内嵌(tEXt chunk `chara`,base64 JSON);映射到 `characters/` 文档(name/description/personality/first_mes → frontmatter + 正文),无损保留原始 JSON 于 `sillytavern/` 目录。
3. 角色卡导出:characters 文档 → V2 JSON(缺失字段留空)。
4. Lorebook 导出:canon + worldbook 文档 → SillyTavern World Info JSON(keys 取 frontmatter 关键词字段,content 取正文)。
5. CLI:`quill st import-card <file>`、`quill st export-card <characterId>`、`quill st export-lorebook`。
6. 用 2-3 个真实社区卡文件做 fixture(注意选可再分发的示例或自制)。

**DoD**:导入→导出→再导入 round-trip 后关键字段不丢;PNG 内嵌解析有单测;`pnpm build` 新包纳入 references。

### WP-D3:桌面端设置页接入密钥迁移提示(依赖 WP-C3 + Track B;小)

SettingsModal 显示"密钥已加密存储 / 系统不支持加密"状态,并提供一键迁移旧明文配置按钮。**DoD**:两种状态可视;迁移后 config.json 无明文。

### WP-D4:导出与发布物(依赖 Track B)

**目标**:写作成果出口。`exports/` 目录已在脚手架里但无实现。

**实现要点**:`packages/core` 增加 `export.ts`:按 outline 顺序拼接已接受(accepted)场景正文,输出单一 Markdown(含卷/章标题层级)与 TXT(网文平台粘贴格式:无 Markdown 标记、段间空行);CLI `quill export --format md|txt --volume <id?>`;IPC + 简单导出对话框。**DoD**:示例项目导出文件顺序与 outline 一致;跳过未 accepted 场景并在结尾列出缺口清单。

---

## 7. Phase 3:验证与发布

### WP-E1:Dogfooding 验证项目(人机协作,Agent 辅助)

用真实小说项目(AGENT-DESIGN.md 的 First Validation Project)完整走一遍:init → 导入既有稿 → 大纲 → 生成 → 检查 → 接受 → 导出。Agent 的任务:全程记录摩擦点到 `docs/DOGFOODING-REPORT.md`(格式:场景 / 期望 / 实际 / 严重度),该报告生成下一版 worklist。**DoD**:报告 ≥ 15 条有效条目,按严重度排序。

### WP-E2:打包分发

`electron-builder` 接入:mac(dmg)+ Windows(nsis)目标;版本号与 git tag 联动;GitHub Actions release workflow(tag 触发,产物上传 Release)。暂不做代码签名(在 README 注明)。**DoD**:CI 能产出可安装包;冷启动可用。

### WP-E3:文档刷新

README 增加真实截图与 quickstart;`docs/CLI.md` 与实际命令逐条核对;为 `packages/*` 各补 README(公共 API 一页说明);超大组件二次拆分(WP-B2 遗留的 ≤ 800 行文件)。

---

## 8. 多 Agent 编排方案

### 8.1 角色

| Agent        | 角色             | 负责 WP                                                           | 关键约束                                                                                           |
| ------------ | ---------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Orchestrator | 编排者(主 Agent) | 分派、审 PR、处理 plan-inbox、维护本文档勾选状态                  | 不直接写业务代码                                                                                   |
| Agent-0      | 仓库卫生         | WP-0                                                              | 串行,最先完成                                                                                      |
| Agent-A      | 测试工程         | WP-A1 → A2 → A3                                                   | 不改实现行为                                                                                       |
| Agent-B      | UI 重构          | WP-B1 → B2 → B3                                                   | 纯搬移零行为变化                                                                                   |
| Agent-C      | 主进程/安全      | WP-C1 → C2 → C3 → C4                                              | 不碰 renderer                                                                                      |
| Agent-D      | 能力升级         | WP-D1..D4(Phase 2 起,可再并行拆 2 个 Agent:D1+D4 一个,D2+D3 一个) | 遵循新的所有权矩阵(D1: checks+cli;D2: packages/sillytavern;D3/D4 跨界改动需 Orchestrator 合并窗口) |

### 8.2 执行时序

```text
t0        Agent-0: WP-0(其余 Agent 等待)
t0+0.5d   并行启动 Agent-A / Agent-B / Agent-C(各自基于 WP-0 之后的 main 拉分支)
          合并顺序建议:A 的 PR 随到随合(只增测试);B、C 各 WP 完成即合,
          B3 与 C2 有对接面 —— C2 先合,B3 后合并做类型切换。
t0+X      三轨全绿后启动 Phase 2(Agent-D,可双实例并行)
t0+Y      Phase 3 串行收尾
```

### 8.3 每个子 Agent 的标准工作流

1. 读本文档的 §0(基线与约定)+ 自己的 WP 章节,**不需要读全文档其他 Track 细节**。
2. `git checkout -b wp/<编号>-<短名>`(基于最新 main)。
3. 实现 → 本地 `pnpm build && pnpm test && pnpm lint` 全绿 → 按 WP 的 DoD 逐条自检并在 PR 描述中逐条勾选。
4. 发现所有权矩阵外的必要改动:写入 `docs/plan-inbox.md`,继续做能做的部分,不阻塞。
5. PR 标题格式:`[WP-A1] checks: rule-level unit tests`。

### 8.4 编排者的验收清单(每个 PR)

- CI 绿;DoD 逐条核对;diff 未越出文件所有权矩阵;
- 重构类 PR(B/C Track)额外确认:IPC channel 清单与基线一致、无行为 diff(抽查 3 个功能路径);
- 合并后更新本文档对应 WP 的状态标记(在标题后加 `✅`)。

---

## 9. 成功度量(Phase 1-3 完成时)

| 指标                    | 现状            | 目标                            |
| ----------------------- | --------------- | ------------------------------- |
| 测试文件 / 用例数       | 2 / 10          | ≥ 10 / ≥ 80                     |
| checks 行覆盖率         | 0%              | ≥ 85%                           |
| core 行覆盖率           | 低              | ≥ 70%                           |
| 最大单文件行数          | 4,333(main.tsx) | ≤ 800                           |
| IPC 类型安全            | 无              | 49 channel 全契约化             |
| 明文 API key            | 是              | 桌面端加密                      |
| 语义检查                | 无              | OOC / 状态漂移 / canon 冲突三类 |
| ROADMAP M6(SillyTavern) | 未动工          | 卡片+lorebook 互导              |
| 可安装包                | 无              | mac + Windows CI 产出           |
