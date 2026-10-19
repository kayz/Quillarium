// keel 的 TypeScript 架构规则基础部分。由 keel 管理，不要手改；项目规则写在根目录 .dependency-cruiser.cjs。
// 约定：模块内部如果按 src/domain、src/application、src/adapters 分层，依赖只能由外向内。

/* global module */
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: '循环依赖会让模块边界失效。',
      from: {},
      to: { circular: true },
    },
    {
      name: 'not-to-unresolvable',
      severity: 'error',
      comment: '导入的模块无法解析。',
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: 'domain-is-pure',
      severity: 'error',
      comment: 'domain 只能依赖 domain 自身，不能依赖应用层、适配器或界面。',
      from: { path: '(^|/)src/domain/' },
      to: { path: '(^|/)src/(application|adapters|infrastructure|infra|ui|api)/' },
    },
    {
      name: 'domain-no-io',
      severity: 'error',
      comment: 'domain 不直接做文件、网络或进程 IO，通过端口交给适配器。',
      from: { path: '(^|/)src/domain/' },
      to: {
        dependencyTypes: ['core'],
        path: '^(node:)?(fs|fs/promises|net|http|https|http2|child_process|worker_threads|dgram)$',
      },
    },
    {
      name: 'application-not-to-adapters',
      severity: 'error',
      comment: '应用层通过端口使用适配器，不直接依赖具体实现。',
      from: { path: '(^|/)src/application/' },
      to: { path: '(^|/)src/(adapters|infrastructure|infra|ui)/' },
    },
    {
      name: 'no-deep-import-across-packages',
      severity: 'error',
      comment: '跨 package 只能通过对方的公开入口导入，不能直接引用对方 src 里的文件。',
      from: { path: '^(packages|apps)/([^/]+)/' },
      to: {
        path: '^packages/[^/]+/src/',
        pathNot: ['^packages/$2/', '^packages/[^/]+/src/index\\.[cm]?[jt]sx?$'],
      },
    },
    {
      name: 'src-not-to-tests',
      severity: 'error',
      comment: '生产代码不能依赖测试文件。',
      from: { path: '/src/', pathNot: '\\.(test|spec)\\.[cm]?[jt]sx?$' },
      to: { path: '\\.(test|spec)\\.[cm]?[jt]sx?$' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)(dist|build|out|coverage|node_modules|\\.stryker-tmp)/' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs', '.json'],
    },
  },
}
