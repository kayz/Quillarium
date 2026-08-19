# 发布流程

<p>
  <a href="RELEASING.md">English</a> · <strong>简体中文</strong>
</p>

当前最新稳定版是
[`v0.3.0`](https://github.com/kayz/Quillarium/releases/tag/v0.3.0)。该发布记录不可变；之后的
任何发布都必须使用新的、只向前推进的语义化版本号。

Quillarium 的版本 tag 和 GitHub Release 是不可变的交付记录。普通 commit、Pull Request 或合并
不会发布版本。

## 候选版本要求

创建版本 tag 之前：

1. 完成本版本的实现和人工验收清单；
2. 把精确候选合并到 `master`，并确认本地 `master` 与 `origin/master` 完全一致；
3. 在根 package、desktop 以及所有 workspace package manifest 中设置相同的语义化版本；
4. 运行 `pnpm build`、`pnpm test`、`pnpm test:coverage`、`pnpm lint`、
   `pnpm format:check`、`pnpm desktop:build` 和 `pnpm audit --prod --audit-level=high`；
5. 确认目标 tag 在本地、远端和 GitHub Release 中都不存在。

tag 格式为 `v<package-version>`，例如 `v0.3.0` 或 `v0.4.0-alpha.1`。

## 创建 tag

只允许从已经验证的当前 `master` 顶端创建并推送 tag：

```bash
git switch master
git pull --ff-only origin master
QUILLARIUM_RELEASE_VERSION=0.3.1 # 仅为示例；替换为批准的新版本号
git tag "v${QUILLARIUM_RELEASE_VERSION}"
git push origin "v${QUILLARIUM_RELEASE_VERSION}"
```

推送 tag 即表示授权自动发布工作流。不要在功能分支或旧提交上创建 tag。

## 自动门禁

tag 工作流会：

1. 拒绝工作流重跑，并验证 tag 指向当前远端 `master` 顶端；
2. 验证 tag 版本与每个 package manifest 一致；
3. 在 Linux 上运行 build、test、coverage、lint、format、desktop build 和生产依赖审计；
4. 在 Windows 上打包 Windows x64，在 macOS 上打包 macOS x64 和 arm64；
5. 验证恰好下载到这三份安装包；
6. 仅当所有门禁通过后创建一个 GitHub Release。

`0.4.0-alpha.1` 之类的语义化预发布版本会自动带上 GitHub 的 Pre-release 标志。工作流永远
不会创建、移动或强制更新 Git tag，也不会覆盖已有 Release 或附件。

已发布且不是草稿的 Release 同时也是桌面应用的更新目录。预发布版本会考虑更晚的预发布版和稳定版；
稳定版忽略预发布版。当前更新功能只报告可用版本并打开官方 Releases 页面，不自动下载或安装附件，
也不使用项目的 GitHub 凭据。

## 失败策略

如果任一 tag 工作流失败，保留该 tag 及其证据。不得移动 tag、删除后重建、重跑工作流或上传替代
附件。通过正常开发和评审流程修复问题，选择新的只向前版本号，再在届时的 `master` 顶端创建新 tag。

安装包签名以及全新 Windows/macOS 机器验收仍是人工门禁。自动打包成功不能证明安装、重启、迁移、
凭据持久化、无障碍能力或真实写作流程均已通过。
