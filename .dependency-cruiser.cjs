// 本项目的架构规则。基础规则来自 keel（.keel/dependency-cruiser.base.cjs），这里只写项目特有的部分。
// 本文件归项目所有，keel 更新时不会覆盖；改动它等于改动架构约束，需要人审核。
// 接入已有项目时，可以用 `depcruise-baseline` 把现存违规记入 .dependency-cruiser-known-violations.json，
// 并在检查命令里加 `--ignore-known .dependency-cruiser-known-violations.json`：只拦新增违规，旧账逐步还。

/* global module */
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  extends: './.keel/dependency-cruiser.base.cjs',
  forbidden: [
    // 示例：界面不能直接依赖存储实现。
    // {
    //   name: 'ui-not-to-storage',
    //   severity: 'error',
    //   from: { path: '^apps/desktop/src/' },
    //   to: { path: '^packages/storage/' },
    // },
  ],
  options: {
    tsConfig: { fileName: 'tsconfig.json' }
  }
}
