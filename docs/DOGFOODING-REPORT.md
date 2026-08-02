# Quillarium 合成 Dogfooding 报告

> 执行日期：2026-08-02
> 起始基线：`86ce7f8`；报告包含其后的本轮修复，CLI `0.1.0`
> 环境：Windows、Node `v24.18.0`、pnpm `10.30.0`

## 结论与证据边界

这次验证使用的是仓库自带示例文档和临时创建的合成项目，不是真实小说项目，不是已有
真人稿件，不包含真人作者的冷启动体验，也没有调用真实 AI。报告不能用于判断生成正文质量、
真实语义检查质量、桌面安装体验或长期写作可用性。

已实际走通的本地流程是：`init` → 导入既有 Markdown → 补大纲和场景 →
`generate --dry-run` → 确定性 `check` → 无 key 的 `check --semantic` 降级 →
`run set-output --file` 写入候选稿 → `run accept` → Markdown/TXT 导出 → SillyTavern JSON 卡片导入、卡片导出和
lorebook 导出。

网络边界通过进程内 `fetch` 计数守卫复核：dry-run 与无 key semantic check 的
`DOGFOOD_FETCH_CALLS=0`。这只证明上述两个命令路径未调用 `fetch`，不等于完成了真实 provider
验证。

共记录 20 条有实际证据的摩擦点。发现时包括高 2 条、中 13 条、低 5 条；其中 10 条已在本轮
修复并完成最小复测，1 条部分缓解，另有 9 条尚未修复。当前剩余高风险为 0；应优先处理
大纲关键结构字段、导出行为的误导性反馈和 SillyTavern 可用性细节。

执行结束后，dogfood 前的用户配置已按 SHA-256 哈希原样恢复；主流程及修复复测的临时 vault、
run、导出物和临时配置备份均已删除，`TEMP_EXISTS_AFTER=False`、
`FIX_PROBE_EXISTS_AFTER=False`、`ROUNDTRIP_PROBE_EXISTS_AFTER=False`、
`CLI_GAP_PROBE_EXISTS_AFTER=False`、`CONFIG_PROBE_EXISTS_AFTER=False`、
`SET_OUTPUT_PROBE_EXISTS_AFTER=False`、`SET_OUTPUT_STATE_PROBE_EXISTS_AFTER=False`。

## 测试设置

为避免把机器绝对路径写成可复用指令，下文使用两个代号：

```powershell
$DOGFOOD_ROOT = Join-Path $env:TEMP 'quillarium-e1-<random-id>'
$PROJECT = Join-Path $DOGFOOD_ROOT 'vault\novels\Synthetic Dogfood Novel'
```

实际输入来自仓库中的自制示例：

- `examples/novels/minimal/canon/canon-core-rule-Core-Rule.md`
- `examples/novels/minimal/characters/char-main-character-Main-Character.md`

首轮所用版本的 `init --vault` 会写用户级 Quillarium 配置，因此执行前将已有 `config.json`
原样复制到临时目录，结束时先恢复并核对哈希，再删除经过绝对路径校验的临时目录。备份内容
从未打印到终端或报告；本轮新增的 `QUILL_CONFIG_DIR` 隔离路径已在 E17 复测。

## 流程证据

### E1. 初始化独立项目

```powershell
pnpm cli init "Synthetic Dogfood Novel" `
  --vault "$DOGFOOD_ROOT\vault" `
  --genre synthetic-validation `
  --target-words 12000 `
  --chapter-words 1800 `
  --section-words 600 `
  --default-theme paper
```

关键结果：

```text
Created project: <TEMP>\vault\novels\Synthetic Dogfood Novel
```

### E2. 导入既有 Markdown

```powershell
pnpm cli import markdown examples/novels/minimal/canon --project $PROJECT
pnpm cli import markdown examples/novels/minimal/characters/char-main-character-Main-Character.md --project $PROJECT
pnpm cli canon list --project $PROJECT
pnpm cli character list --project $PROJECT
```

关键结果：

```text
canon    Core Rule       canon\canon-core-rule-Core-Rule.md
Imported 1 Markdown document.
character    Main Character    characters\char-main-character-Main-Character.md
Imported 1 Markdown document.
canon-core-rule      Core Rule       confirmed
char-main-character  Main Character  active
```

### E3. 补齐世界、大纲和场景

```powershell
pnpm cli location add "Archive Hall" --description "A sealed municipal archive." --project $PROJECT
pnpm cli timeline append "First Bell" --date "day-001 08:00" --duration "20m" `
  --location loc-archive-hall --characters char-main-character --project $PROJECT
pnpm cli world add "Blue Registry" --trigger registry blue-ledger --role constraint `
  --valid-from day-001 --project $PROJECT
pnpm cli outline add book "Synthetic Book" --target-words 12000 --project $PROJECT
pnpm cli outline add volume "Synthetic Volume" --parent book-synthetic-book `
  --order 1 --target-words 12000 --project $PROJECT
pnpm cli outline add chapter "Synthetic Chapter" --parent volume-synthetic-volume `
  --order 1 --target-words 1800 --chapter-hook --project $PROJECT
pnpm cli outline add section "Synthetic Section" --parent chapter-synthetic-chapter `
  --order 1 --target-words 600 --chapter-hook --project $PROJECT
pnpm cli scene create "Synthetic Opening" `
  --section section-synthetic-section `
  --timeline evt-first-bell `
  --location loc-archive-hall `
  --pov char-main-character `
  --characters char-main-character `
  --target-words 600 `
  --chapter-hook `
  --project $PROJECT
pnpm cli index --project $PROJECT
```

关键结果：每个创建命令都返回了绝对文件路径，场景路径位于
`scenes/volume-01/chapter-001/`，`index` 报告 `Indexed 14 documents.`。

用 core 的 `checkOutline` 复核刚创建的大纲，得到：

```text
book-synthetic-book: missing-strategy, book-missing-reader-promise
volume-synthetic-volume: missing-strategy, volume-missing-goal,
  volume-missing-event-chain, volume-thin-writer-cycles,
  volume-missing-timeline, volume-missing-characters, missing-character-state
```

### E4. Dry-run 与 run 记录

```powershell
$env:QUILL_AI_API_KEY = ''
$env:QUILL_AI_BASE_URL = 'https://api.openai.com/v1'
pnpm cli generate scene-synthetic-opening --dry-run --project $PROJECT
pnpm cli run list --project $PROJECT
pnpm cli run show run-20260802-190213-scene-synthetic-opening `
  --file metadata.yaml --project $PROJECT
```

关键结果：

```text
Created dry run: run-20260802-190213-scene-synthetic-opening
status: created
provider: openai-compatible
model: gpt-4o-mini
```

run 目录文件大小：

```text
context.md           1395
prompt.md            1653
metadata.yaml         296
output-raw.md            0
output-accepted.md       0
check-report.md          0
```

### E5. 确定性检查

```powershell
pnpm cli check scene-synthetic-opening `
  --run run-20260802-190213-scene-synthetic-opening `
  --project $PROJECT
```

初始空场景的实际结果为 1 条 info：

```text
[info] chapter-hook-style: Chapter hook requested, but the section ending does not look like a strong sentence ending.
```

### E6. 无 key 的 semantic 降级与零网络复核

```powershell
$env:QUILL_AI_API_KEY = ''
$env:QUILL_AI_BASE_URL = 'https://api.openai.com/v1'
pnpm cli check scene-synthetic-opening --semantic --project $PROJECT
```

关键结果与退出码：

```text
SEMANTIC_EXIT=0
[info] semantic-check-unavailable: Semantic checks were not run because CLI AI is not configured.
```

随后通过 `buildProgram()` 在同一进程安装一个“调用即抛错”的 `globalThis.fetch` 守卫，并分别执行
dry-run 与同样的 semantic 命令：

```text
Created dry run: run-20260802-190721-scene-synthetic-opening
[info] semantic-check-unavailable: ...
DOGFOOD_FETCH_CALLS=0
```

### E7. 人工写入输出并接受

由于 CLI 没有“给 run 写入候选正文”的命令，本次调用公开 core API `listRuns` + `writeRunFile`
把以下 238 字符合成文本写入 dry-run 的 `output-raw.md`：

```text
The first bell broke the archive silence. Main Character found the blue registry open beneath a lamp that no clerk had lit.

A page had been removed cleanly, leaving only a thread of blue binding. Who had changed the registry before dawn?
```

然后执行：

```powershell
pnpm cli run show run-20260802-190213-scene-synthetic-opening `
  --file output-raw.md --project $PROJECT
pnpm cli run accept run-20260802-190213-scene-synthetic-opening --project $PROJECT
pnpm cli check scene-synthetic-opening --project $PROJECT
```

关键结果：

```text
Accepted run-20260802-190213-scene-synthetic-opening into <scene-file>
status: accepted
issues: 0
No deterministic issues found.
```

原始 `created_at`、provider 和 model 在 accept 后得到保留。

### E8. Markdown 与纯文本导出

```powershell
pnpm cli export --format md --project $PROJECT
pnpm cli export --format txt --project $PROJECT
```

首次完整流程的关键结果：

```text
Exported MD: <PROJECT>\exports\Synthetic-Dogfood-Novel.md
Scenes exported: 1
Gaps: 0
Exported TXT: <PROJECT>\exports\Synthetic-Dogfood-Novel.txt
Scenes exported: 1
Gaps: 0
```

Markdown 为 377 bytes，TXT 为 354 bytes，顺序是 book → volume → chapter → section → scene。
时间戳探针确认，之后执行 `--format txt` 时 Markdown 和 TXT 两个文件都被重写：

```text
BOTH_REWRITTEN_BY_TXT=True
```

### E9. SillyTavern JSON 导入、卡片导出和 lorebook 导出

```powershell
pnpm cli character add "Card Traveler" --role rival `
  --speech-style "Answers in clipped sentences." `
  --desire "Recover the ledger" `
  --fear "Being forgotten" `
  --bottom-line "Will not destroy an archive" `
  --ooc "Never boasts" `
  --project $PROJECT
pnpm cli st export-card char-card-traveler --project $PROJECT
pnpm cli st import-card "$PROJECT\sillytavern\char-card-traveler-card-v2.json" --project $PROJECT
pnpm cli st export-card char-card-traveler --project $PROJECT
pnpm cli st export-lorebook --project $PROJECT
```

关键结果：

```text
format: v2
output: <PROJECT>\sillytavern\char-card-traveler-card-v2.json
format: v2
character: <PROJECT>\characters\char-card-traveler-Card-Traveler.md
raw: <PROJECT>\sillytavern\char-card-traveler-card-v2-v2-raw.json
format: world-info
entries: 2
output: <PROJECT>\sillytavern\quillarium-world-info.json
```

导入前角色是 `role: rival`，并有 desire/fear/bottom_line/OOC；导入同名导出卡后，同一路径变成
`role: supporting`，这些字段均为空。lorebook 的 Canon 正文正确，但 CLI 新建的 world entry 内容是
默认占位 `## World Entry`。

### E10. 空输出接受守卫探针

在临时项目中另建 `Empty Acceptance Probe` 场景，执行 dry-run 后不写任何输出，直接 accept：

```powershell
pnpm cli generate scene-empty-acceptance-probe --dry-run --project $PROJECT
pnpm cli run accept run-20260802-190602-scene-empty-acceptance-probe --project $PROJECT
pnpm cli export --format md --project $PROJECT
```

实际结果：

```text
Accepted output length: 0
Scene body length: 0
status: accepted
Scenes exported: 1
Gaps: 1
reason: missing_content
```

### E11. 清理

先恢复 dogfood 前的配置文件并核对哈希，再验证删除目标确实是 `%TEMP%` 下唯一的随机子目录，最后
删除该目录：

```text
CONFIG_RESTORED_HASH_MATCH=True
VERIFIED_RELATIVE=quillarium-e1-<random-id>
TEMP_EXISTS_AFTER=False
```

### E12. 同轮修复复测

dogfood 发现 DF-01、DF-02 后，共享分支在本轮加入了 core `requireNonEmptyRunOutput` 和磁盘感知的
唯一 ID 分配。重新构建后，在第二个独立临时项目执行最小复测。

空输出 accept：

```text
EMPTY_ACCEPT_EXIT=1
Run output is empty; refusing to overwrite a scene: run-20260802-191512-scene-probe-scene
SCENE_BODY="Original scene body.\n"
RUN_STATUS=created
ACCEPTED_LENGTH=0
```

同名 Character Card 导入：

```text
character: <FIX-PROBE>\characters\char-card-traveler-2-Card-Traveler.md
char-card-traveler-2  Card Traveler  active
char-card-traveler    Card Traveler  active
```

原 `char-card-traveler` 的 rival/desire/fear/bottom_line/OOC 均保留，证明覆盖问题已修复。此时
新建的 `char-card-traveler-2` 仍缺少这些 Quillarium 专有字段；随后本轮又修复了 DF-03，见 E13。
复测临时目录随后删除：`FIX_PROBE_EXISTS_AFTER=False`。

### E13. CCv2 Quillarium 扩展字段复测

第二次修复在 CCv2 `extensions.quillarium` 中写入带版本的 Quillarium 元数据，并在导入时恢复。
再次创建包含 aliases、role、speech_style、desire/fear/bottom_line、motivation anchors、
relationships、arc、OOC、active flags、disclosure 和 scene state 的角色，执行导出再导入。

实际结果：

```text
character: <ROUNDTRIP-PROBE>\characters\char-card-traveler-2-Card-Traveler.md
aliases=true
role=true
speech_style=true
desire=true
fear=true
bottom_line=true
motivation_anchors=true
relationships=true
arc=true
ooc_guardrails=true
disclosure=true
scene_state=true
original_active_flags=["watching"]
imported_active_flags=["watching","sillytavern-import"]
```

除预期追加的 `sillytavern-import` 来源标记外，探针中的全部 Quillarium 专有字段均往返一致。
复测目录随后删除：`ROUNDTRIP_PROBE_EXISTS_AFTER=False`。

### E14. Semantic 状态报告复测

DF-09 修复后，对仓库只读示例项目重新执行无 key semantic check：

```powershell
$env:QUILL_AI_API_KEY = ''
$env:QUILL_AI_BASE_URL = 'https://api.openai.com/v1'
pnpm cli check scene-opening-scene --semantic --project examples/novels/minimal
```

实际输出：

```text
SEMANTIC_RETEST_EXIT=0
semantic_status: unavailable
## AI-Assisted Checks
status: unavailable
checks: OOC, state drift, Canon conflict
```

永久 pending 和错误的检查名称已消失，DF-09 完成修复。DF-10 得到部分缓解：报告对象和文本已有
机器可读状态，但 CLI 仍以 0 退出，尚无“semantic 必须执行”的严格模式。

### E15. Strategy 与 world entry 正文修复复测

在另一个独立临时项目中，先确认 book 的 `missing-strategy` 确实存在，再使用新增的 CLI 命令创建
strategy；同时用新增的 `world add --content` 创建 world entry 并导出 lorebook：

```powershell
pnpm cli strategy add "Escalating Questions" --category pacing --scope project `
  --principle "Each answer creates a narrower question" `
  --avoid "Unopposed exposition" --content "Keep the archive mystery cumulative." `
  --project $PROJECT
pnpm cli strategy list --project $PROJECT
pnpm cli world add "Blue Registry" --trigger registry --role constraint `
  --content "Only sworn clerks may alter the blue registry." --project $PROJECT
pnpm cli st export-lorebook --project $PROJECT
```

实际结果：

```text
BEFORE_MISSING_STRATEGY=true
AFTER_MISSING_STRATEGY=false
LOREBOOK_WORLD_CONTENT="Only sworn clerks may alter the blue registry.\n"
CLI_GAP_PROBE_EXISTS_AFTER=False
```

这证明 DF-07 和 DF-11 的主要阻断均已修复；`strategy add/list` 与 world 正文随后也通过帮助树和
CLI 回归测试。

### E16. Outline CLI 检查修复复测

对仓库只读示例执行新增的 target 类型选项：

```powershell
pnpm cli check section-opening-section --type outline --project examples/novels/minimal
pnpm cli check section-opening-section --type outline --semantic `
  --project examples/novels/minimal
```

第一条命令正常生成 section 检查报告，`semantic_status: not_requested`，并报告示例中真实存在的
`missing-strategy`。第二条命令明确拒绝不支持的组合：

```text
OUTLINE_SEMANTIC_EXIT=1
AI semantic checks currently require a scene target.
```

DF-08 因此完成修复；outline 检查不再需要绕到 core API，也不会把 `--semantic` 静默忽略。

### E17. 隔离配置目录修复复测

把 `QUILL_CONFIG_DIR` 指向随机 `%TEMP%` 子目录，再执行真实 `init --vault`。复测只比较用户配置
文件的 SHA-256 指纹，没有读取或输出配置正文：

```powershell
$env:QUILL_CONFIG_DIR = "$env:TEMP\quillarium-e1-config-probe-<random-id>\config"
pnpm cli init "Config Isolation Probe" --vault $VAULT `
  --genre synthetic-validation --target-words 1000 `
  --chapter-words 500 --section-words 250 --default-theme paper
```

实际结果：

```text
CONFIG_PROBE_EXIT=0
ISOLATED_CONFIG_EXISTS=True
USER_CONFIG_UNCHANGED=True
CONFIG_PROBE_EXISTS_AFTER=False
```

DF-04 已完成修复。空白的 `QUILL_CONFIG_DIR` 仍回退用户目录的兼容行为由 core 测试覆盖。

### E18. CLI 候选稿写入闭环与 scene help 修复复测

DF-05 修复后，把仓库自制 minimal 项目复制到随机 `%TEMP%` 子目录，以仓库自带的 193 字符
`examples/novels/README.md` 作为合成 UTF-8 候选载荷，执行完整离线闭环：

```powershell
pnpm cli generate scene-opening-scene --dry-run --project $PROJECT
pnpm cli run set-output $RUN_ID --file examples/novels/README.md --project $PROJECT
pnpm cli run accept $RUN_ID --project $PROJECT
```

实际结果：

```text
SET_OUTPUT_EXIT=0
RAW_EQUALS_SOURCE=True
RAW_LENGTH=193
RUN_STATUS_AFTER_SET_GENERATED=True
ACCEPT_EXIT=0
RUN_STATUS_AFTER_ACCEPT_ACCEPTED=True
SCENE_CONTAINS_SOURCE=True
SET_OUTPUT_PROBE_EXISTS_AFTER=False
SET_OUTPUT_STATE_PROBE_EXISTS_AFTER=False
```

`set-output` 因此可以替代 E7 使用的 core API 绕行，且没有改变候选内容。该路径只用了
`generate --dry-run`，AI base URL 指向不可用的本机端口，没有执行真实生成请求。

第一次尝试在刚初始化的空项目创建 probe scene 时还发现：`scene create --help` 没有标出四个
必填引用，遗漏 `--section` 后退出 1；补 section 后又因缺 `--timeline` 退出 1。两个失败探针的
临时目录均已清理。本轮随后把四项帮助文案改为：

```text
--section <id>   Required section outline id
--timeline <id>  Required timeline node id
--location <id>  Required location id
--pov <id>       Required POV character id
```

实际帮助输出和 CLI 回归测试均确认该修复，DF-20 完成修复。最终帮助树递归渲染了 74 个实际
命令/命令组，无重复，并包含 `run set-output`。

## 摩擦点清单

严重度定义：高 = 可能造成无提示数据丢失；中 = 阻断或显著误导主要流程；低 = 可完成但效率、
可读性或自动化体验较差。

| ID    | 场景                                             | 期望                                              | 实际                                                                                                                                     | 严重度           | 可操作下一步                                                                                 |
| ----- | ------------------------------------------------ | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------- |
| DF-01 | E10/E12：接受一个未写入正文的 dry-run            | accept 前拒绝空候选，至少需要显式确认             | 首轮命令返回成功并把场景写成 0 字符；本轮修复后退出 1，scene 原文和 created 状态均保留                                                   | 高（本轮已修复） | 保留 CLI/desktop/core 共用校验和空白文本回归测试；后续若需要空场景，设计显式且安全的独立操作 |
| DF-02 | E9/E12：导入与已有角色同名的卡片                 | 创建冲突安全的新 ID，或要求明确 `--overwrite`     | 首轮静默覆盖 `char-card-traveler`；本轮修复后分配 `char-card-traveler-2`，原文件字段保留                                                 | 高（本轮已修复） | 保留已有磁盘、同进程并发和连续 `-2/-3` 的回归覆盖；补充真正的多进程竞争测试                  |
| DF-03 | E9/E12/E13：Quillarium 角色导出 V2 后再导入      | 原生角色约束可往返保留，或明确提示不可逆字段      | 首轮副本从 `rival` 变 `supporting` 且约束为空；本轮修复后，除追加导入来源标记外，探针中的全部专有字段往返一致                            | 中（本轮已修复） | 保留 `extensions.quillarium` schema 版本、未知扩展兼容和 native round-trip 回归测试          |
| DF-04 | E1/E17：为隔离验证使用 `init --vault`            | 可为一次 init 指定 vault 而不改变用户默认配置     | 首轮 `--vault` 同时保存用户配置；本轮新增 `QUILL_CONFIG_DIR` 后，隔离配置成功写入且用户配置指纹不变                                      | 中（本轮已修复） | 保留隔离读写、空值回退、CLI init 和 desktop 继承环境的回归测试                               |
| DF-05 | E7/E18：检查 dry-run 后人工提供候选正文          | CLI 能从文件或 stdin 写入 run，再供 review/accept | 首轮必须调用 core API；本轮新增 `run set-output --file` 后，193 字符 UTF-8 候选逐字写入、状态转为 generated，并成功 accept               | 中（本轮已修复） | 保留非空/空白、UTF-8、路径错误、generated 状态和 accept 闭环测试；后续可补 `--stdin`         |
| DF-06 | E3：用 CLI 创建 book/volume 大纲                 | 创建命令可填写 checker 要求的关键结构字段         | `outline add` 只暴露 parent/order/target/chapter-hook；新文件 reader promise、volume goal、event chain 等均为空，core check 随即报告缺失 | 中               | 为各 level 增加关键选项或提供 `outline edit/validate` 引导流程，命令完成后可选择立即检查     |
| DF-07 | E3/E15：解决 `missing-strategy`                  | CLI 能创建 checker 所要求的 strategy 文档         | 首轮没有入口；本轮新增 `strategy add/list` 后，创建前为 `missing-strategy=true`、创建后为 false                                          | 中（本轮已修复） | 保留 category/scope/principle/avoid/content 的解析和 `checkOutline` 联动回归测试             |
| DF-08 | E3/E16：从 CLI 检查大纲                          | `check` 可接受 scene 或 outline target            | 首轮只能绕到 core；本轮 `check --type outline` 生成真实报告，outline + semantic 组合以清晰错误退出 1                                     | 中（本轮已修复） | 保留 scene 默认兼容、四级 outline target 和不支持 semantic 组合的回归测试                    |
| DF-09 | E5/E6/E7/E14：阅读检查报告                       | footer 与实际 semantic 状态和实现的三类检查一致   | 首轮缺 key 时仍显示四项 pending；本轮修复后输出 `semantic_status: unavailable` 和准确的 OOC/state drift/Canon conflict                   | 中（本轮已修复） | 保留四种 semantic status、CLI/desktop 路径和格式化输出的回归测试                             |
| DF-10 | E6/E14：在自动化中要求 semantic 已执行           | 降级应有机器可判定的状态或严格模式                | 现已有机器可读 `semantic_status: unavailable`，但命令仍退出 0，没有“必须执行”的严格失败模式                                              | 中（部分缓解）   | 增加 `--require-semantic` 非零退出模式；全局 `--json` 直接输出结构化报告                     |
| DF-11 | E3/E9/E15：用 CLI 创建 world entry 后导 lorebook | 创建时可写正文，导出的 content 有实际知识         | 首轮只能得到占位正文；本轮新增 `--content` 后，lorebook 精确保留所写 registry 规则                                                       | 中（本轮已修复） | 保留正文到 lorebook 的精确映射测试；后续可补 `--file`/stdin 和空占位警告                     |
| DF-12 | E8：分别请求 MD 和 TXT                           | `--format` 只生成所选格式，或明确选择是“显示路径” | 每次调用都重写 MD 和 TXT；`--format txt` 也更新 Markdown，文件名固定且无版本                                                             | 中               | 增加真正的单格式写入或改名为 `--report-format`；默认原子写入并提供 `--output`/`--force`      |
| DF-13 | E8：导出英文合成项目                             | 输出语言一致，零缺口时没有多余尾部                | MD/TXT 都固定追加中文 `导出缺口`，即使 `count: 0` 也保留该段                                                                             | 中               | 根据项目/应用语言本地化；零缺口默认省略，或提供 `--include-gap-report`                       |
| DF-14 | E9：把原生角色导出为 Character Card              | `description` 是有意义的角色描述                  | 原生空模板被导出为 `## Profile\n\n## Notes`，对 SillyTavern 用户几乎没有信息                                                             | 中               | 提供明确 description 字段映射，导出时识别并剔除脚手架占位标题                                |
| DF-15 | E9：保存导入卡原始 JSON                          | raw 文件名简洁并可追溯来源                        | 输入 `char-card-traveler-card-v2.json` 生成 `char-card-traveler-card-v2-v2-raw.json`，版本词重复                                         | 中               | 规范化已含版本/`card` 后缀的 stem，并为重复导入设计稳定序号                                  |
| DF-16 | E2-E9：连续执行项目命令                          | 一次选择项目后可复用上下文                        | 每条命令都必须重复带空格的长 `--project` 路径                                                                                            | 低               | 支持 `QUILL_PROJECT`、向上寻找 `project.yaml`，或提供 `config set-project`                   |
| DF-17 | E3：把创建结果用于下一个命令                     | 输出直接给出 ID，支持脚本消费                     | 创建命令只打印绝对路径；必须从文件名推断 ID 或再跑 list                                                                                  | 低               | 同时打印 `id:` 与相对路径，并增加全局 `--json` 输出                                          |
| DF-18 | E6：在工作区以 `pnpm cli` 执行只读命令           | 开发态反馈接近即时                                | 单次 `character list` 实测 3551 ms；该数字仅代表 pnpm+tsx 源码入口，不代表打包 binary                                                    | 低               | 在 CI 增加 built CLI 基准；开发脚本可使用常驻模式或先构建后调用 Node 入口                    |
| DF-19 | E4：关联 run ID 与元数据时间                     | 同一时区、格式明确                                | run ID 是本地时间 `190213`，`created_at` 是未标注给用户的 UTC `11:02:13Z`                                                                | 低               | ID 与展示统一 UTC，或在 `run list` 明示/转换时区                                             |
| DF-20 | E18：根据 `scene create --help` 准备参数         | 所有必填引用在帮助中一眼可辨                      | 首轮帮助只写普通描述，实际缺 section/timeline/location/pov 会逐项退出 1；本轮四项均明确加上 `Required` 并通过帮助测试                    | 低（本轮已修复） | 保留 required help 契约测试；后续可让 Commander 的格式层统一渲染必填标识                     |

## 下一轮验证

本次仅完成 synthetic 路径，不能将 WP-E1 视为完整验收。下一轮仍需：

1. 使用有实质体量的真实小说稿和复杂目录结构重复导入、规划、接受与导出。
2. 由真人作者独立完成桌面和 CLI 冷启动，记录说明文档之外的理解成本。
3. 在明确授权和费用边界后，用真实 provider 执行三类 semantic check，人工评估有效发现、误报和
   引文质量。
4. 在打包产物完成后，从全新 Windows/macOS 环境验证安装、首次启动、凭据状态和导出。
5. DF-01 至 DF-05、DF-07 至 DF-09、DF-11、DF-20 的修复和最小复测已完成；后续版本持续
   运行相同回归，防止数据丢失和 CLI 入口退化复发。

计划状态见 [IMPROVEMENT-PLAN.md](IMPROVEMENT-PLAN.md)。
