# 世界书优先与就地特化

Date: 2026-09-21  
Status: approved  
Parent: `docs/superpowers/specs/2026-09-21-chapter-centered-product-design.md`  
Scope: 设定卡「先是世界书，再特化」的身份、写入路径、作者/CLI/AI 共用 API。不含展示层、不含 Agent 专家模式围栏、不含新的类型管理功能（关系图、时间线轨道、伏笔埋设/回收的既有能力保持原样）。

## 主线

设定事实从 **世界书** 长出来。作者觉得细节够了，再把同一张卡特化成人物、地点、伏笔等。特化改变的是 **同一稳定 id 的类型与目录**，不是再建一张卡。

作家和 OC 都能特化。展示层下一轮再做；本轮不靠图片/HTML 卡才能特化。

新建仍允许在人物/地点等模块直接建该类型（快捷方式）。旧项目里已经是人物的卡不迁移、不强迫先变回世界书。

## 已锁定的决策

| 主题 | 选择 |
| ---- | ---- |
| 文件语义 | 就地：同一 `id`，改 `type`；目录按 `fileForDoc` 搬迁，然后删旧文件。 |
| 新建 | 主路径：先建世界书再特化。快捷：各类型模块/CLI `create` 仍可直接建该类型。 |
| 谁发起 | 作者可直接特化/转回，不经 AI。现有 AI `card-conversion` 仍可补字段，apply 必须走同一写入函数。 |
| 允许的目标 | 与当前 AI 转换名单一致，见下节。 |
| 必填 | 写盘前补齐目标 schema 中无默认值的必填项。缺了整笔失败。 |
| 多余字段 | 目标 schema 没有的 frontmatter 丢掉。非空叙述可并进正文附录，禁止非法 frontmatter。 |
| 实现 | `@quillarium/core` 公开就地特化 API；桌面表单、CLI、AI apply 都调用它。 |

## 允许转换的类型

与现有 `WORLD_ENTRY_CONVERSION_KINDS` / `planningConversionKinds` 一致，本轮不扩大、不缩小：

```text
world_entry, canon, character, character_relation, location, timeline_event,
faction, faction_relation, faction_membership, foreshadowing, narrative
```

规则：

- 来源是 `world_entry`：可转到上列除 `world_entry` 以外的任一类型。
- 来源是上列非 `world_entry`：只能转到 `world_entry`（转回）。
- `issue`、`reference`、`outline`、`scene`、`chapter_prose`、`timeline_node`、`route`、`character_state` 等不在名单内：拒绝。
- 目标 type 等于当前 type：拒绝，提示用普通保存，不要走特化。

## 写入契约

公开函数（实现时可微调名字，语义不得改）：

```ts
specializePlanningCard(
  projectRoot: string,
  cardId: string,
  targetType: DocType,
  fields: Record<string, unknown>,
  options?: { content?: string; expectedSha256?: string }
): Promise<{ path: string; data: DocumentIdentity; content: string }>
```

步骤（全部在项目写锁内，失败则看不到半转换卡）：

1. 按 id 找到现卡。找不到则抛错。
2. 若提供 `expectedSha256`，与当前文件字节不一致则抛脏写错误（与规划转换同一类冲突）。
3. 校验来源/目标是否落在允许规则内。
4. 合并字段：
   - 保留 `id`；`type` 设为 `targetType`；`schema_version` 为 1。
   - 标题默认现卡标题，`fields.title` 可覆盖。
   - 共用规划字段：`status`、`tags`、`enabled`、`source_refs`、`relations`、`image`。优先现卡，可被 `fields` 覆盖。
   - 再叠 `fields` 里目标类型的其余键。
   - 用目标 schema **parse（不要 passthrough 把世界书专有键留下）**。
5. 必填：parse 失败或引用校验失败则抛错，不写盘。关系/从属额外约束与现有 `assertPlanningCardDomain` 相同（两端不能是同一 id）。
6. 用 `validatePlanningCardGraph` 检查：若转换后出现 `wrong-relation-target-type` 且目标是本卡 id，拒绝并列出冲突的 `card_id.relation_field`。
7. 新路径 = `fileForDoc(projectRoot, targetType, id, title)`。若新路径已存在且不是当前文件，拒绝。
8. 正文：`options.content` 若给出则用之，否则用现卡正文。若有被丢掉且非空的叙述型字段，追加附录（见下）。
9. 写入新路径并校验读回的 `id`/`type`。若新路径 ≠ 旧路径，删除旧文件。失败则恢复旧文件字节并删除新路径。
10. 作者/CLI 特化不写入 `ai-conversation` 来源。若卡上已有 provenance，原样保留；没有则不新造规划会话 origin。AI 转换 apply 仍由规划事务写它自己的 origin，但搬文件必须调用本函数。

附录格式（仅当确有丢掉的非空标量/数组时追加，避免空标题）：

```markdown
## 特化前摘录

- triggers: 火药, 火器
- story_setting: …
```

键名用原 frontmatter 名。已进入目标 schema 的键不进附录。

### 写盘前必须由作者提供的字段

有 schema 默认值的类型（人物、地点、伏笔、时间线事件、正设、叙事、势力）可以只选目标类型就确认。

无默认、必须在 `fields` 里给出的：

| 目标 | 必填 |
| ---- | ---- |
| `character_relation` | `from_character`, `to_character`, `relation_type` |
| `faction_relation` | `from_faction`, `to_faction`, `relation_type` |
| `faction_membership` | `faction_id`, `character_id` |

引用必须指向项目里已存在、且类型匹配的卡（沿用 `assertCardReferencesExist`）。占位符 `__quillarium_unset_reference__` 不允许出现在特化写入中。

## 调用方

### 桌面

- 设定卡操作：「特化为…」和「转回世界书」。选目标后展示该类型必填控件，确认后调 core。不打开规划 AI 会话。
- 世界书模块的新建仍是 `world_entry`。人物/地点等模块的「新建」仍直接建该类型。
- 现有「转换卡片类型」（AI）保留。其 apply 事务里改 type 的那一笔必须调用 `specializePlanningCard`，不再在 IPC 里手写搬文件。会话、提案、hash、多卡创建仍由规划事务负责；**单卡改 type** 不再有第二条实现。

### CLI

- 新增特化命令，形态：

```text
pnpm cli card specialize <id> --to <type> --project <path>
  [--from-character <id>] [--to-character <id>] [--relation-type <text>]
  [--from-faction <id>] [--to-faction <id>]
  [--faction <id>] [--character <id>]
```

缺必填：stderr 写明缺哪些 flag，退出码非 0，磁盘不变。  
`character add` / `location add` / `world add` 等现有 create 保留。

### AI 卡片转换

- 仍只改锚定卡、不新建第二张卡、不改稳定 id。
- 模型可以建议 `fields` 映射；作者确认后 trusted apply 把目标 kind + fields 交给 `specializePlanningCard`。
- 不允许模型绕过允许名单或必填校验。

## 错误（作者能读懂）

用中文，且失败时源文件 `type` 与路径不变：

- 找不到卡。
- 当前类型不能转到该目标。
- 目标与当前类型相同。
- 缺少必填字段（列出键名）。
- 引用不存在或类型不对。
- 转换会使现有类型化引用失效（列出冲突）。
- 目标文件已存在。
- 期望哈希不匹配（脏写）。

## 测试要求

核心测试用真实项目夹具，不 mock `writeMarkdown`：

1. `world_entry` → `character`：id 不变，新文件在 `characters/`，`world/` 下旧文件不存在，标题与正文仍在。
2. `world_entry` → `character_relation` 缺两端：抛错；源文件仍是世界书。
3. 入边类型冲突：拒绝；源卡不变。
4. `character` → `world_entry`：回到 `world/`，人物专有 frontmatter 不在新文件里。
5. 带 `expectedSha256` 的脏写：拒绝。
6. 规划 `card-conversion` apply 与直接 `specializePlanningCard` 对同一夹具产生相同 id/目录/type（可在 IPC 或 core 测试里断言都走到同一函数）。

CLI：缺 flag 失败；补齐后文件落在正确目录。

桌面：特化表单在缺必填时不能发出 IPC。若现有卡片操作测试装得动，加一条；否则核心 + CLI 即可，表单作为薄封装。

## 非目标

- 不改展示层、设定图、HTML 卡、CCv3。
- 不把 Agent 生文或专家模式并进特化。
- 不强迫旧卡批量变成世界书。
- 不删除各模块的直接新建。
- 不新做关系图、时间线管理、伏笔埋设/回收；那些继续用现有类型管理。
- 不新增 OC 专用 `DocType`。
- 不把 `timeline_node` / `route` 塞进本轮允许名单。

## 与现状的差

- 今天：各类型直接创建；世界书 ↔ 特化主要靠 AI `card-conversion`，搬文件逻辑在 desktop IPC。
- 本轮：作者和 CLI 可直接特化；搬文件与校验收口到 core；AI 转换改为调用同一函数。
- 下一轮（另写规格）：展示层模块；再下一轮：Agent 专家模式围栏。
