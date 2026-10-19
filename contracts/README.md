# 契约

这里放跨模块、跨服务、跨语言的接口定义，是 spec 的第 2 层：

- HTTP 接口：OpenAPI（`*.openapi.yaml`）
- RPC 接口：Protobuf（`*.proto`）
- 数据和文件格式：JSON Schema（`*.schema.json`）

单一语言内部的模块接口，用该语言的类型和包的公开入口表达即可，不必放在这里。

修改契约等于修改 spec：同步更新实现、调用方和契约测试，并在 PR 里说明原因。
