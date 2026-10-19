# .keel

本目录由 [keel](https://github.com/kayz/keel) 骨架管理，`copier update` 时会被更新。不要手动修改；
需要调整时改 keel 本身，再在项目里运行 `copier update`。

| 文件                          | 作用                                                                          |
| ----------------------------- | ----------------------------------------------------------------------------- |
| `settings.json`               | 生成时的选项：默认分支、启用的技术栈包                                        |
| `lib.ps1`                     | 检查脚本的公共函数                                                            |
| `stacks/*.ps1`                | 各技术栈包的检查步骤                                                          |
| `protected-paths.txt`         | 受保护的路径，与 `.github/CODEOWNERS` 一致                                    |
| `protected-changes.ps1`       | 列出当前分支改动了哪些受保护文件                                              |
| `dependency-cruiser.base.cjs` | TypeScript 架构规则的基础部分（项目规则写在根目录 `.dependency-cruiser.cjs`） |

## 新仓库首次推送后

受保护路径要真正生效，需要在 GitHub 上开启分支保护：

1. Settings → Rules → Rulesets → New branch ruleset，目标为默认分支。
2. 勾选 Require a pull request before merging，并勾选 Require review from Code Owners。
3. 如果仓库只有你一个人，agent 需要用单独的 GitHub 身份提交 PR，你才能以 Code Owner 身份审核。
   否则 CODEOWNERS 只起到标注作用，可以配合 `scripts/check-fast.ps1` 输出的受保护改动清单人工检查。

## 接入已有项目时

- 项目如果用 prettier 等格式化工具检查全部文件，把 `.keel/` 加入忽略列表，避免项目的格式规则和 keel 冲突。
- 把项目原有的检查命令接到 `scripts/check.local.ps1`，`check-fast.ps1` 和 `check.ps1` 就能覆盖原来的 CI 内容。
- Claude Code 和 Codex 都直接读取 `AGENTS.md`。不要再新建 `CLAUDE.md`：有它时 Claude Code 不再读取
  `AGENTS.md`，除非在 `CLAUDE.md` 里写 `@AGENTS.md` 导入。

## 骨架怎么更新

```powershell
copier update   # 拉取 keel 的新版本，三方合并到本项目
```

`docs/intent.md`、`scripts/check.local.ps1`、`.dependency-cruiser.cjs` 和测试内容归项目所有，更新时不会覆盖。
