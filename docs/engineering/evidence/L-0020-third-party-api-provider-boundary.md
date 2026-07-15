# L-0020 证据：第三方 API Provider 插件边界

- 日期：2026-07-15
- 关联：REQ-GJ-LEAD-001 / TASK-GJ-0201
- ADR：ADR-0019
- 基线 Commit：`cdf346d`
- 状态：Test-first（真实 Red 已确认，实现未开始）

## 目标

在不选择真实供应商、不使用真实凭证和不发生真实外呼的前提下，建立可替换的 Provider 插件、认证引用、分页、重试/退避、额度、错误分类、checkpoint、幂等和血缘契约。

## Test-first 契约

专项测试先锁定：

- Registry 注册、按 ID/version 解析和重复拒绝；
- Provider 描述、配置验证和受控 credential handle；
- 两页 opaque cursor 与 GoodJob cursor 隔离；
- Provider 原始字段映射、逐记录 API 血缘和原始响应不持久化；
- Sink 第二条故障恢复、完整重跑 created 0 / duplicate 2；
- Retry-After、指数退避、最大重试和请求预算；
- authentication、permission、invalid request/response、rate limit、quota、timeout、transient、secret 和 checkpoint 错误分类；
- 错误、payload、checkpoint 不包含 credential handle；
- Mock Provider，真实外呼 0。

## 真实 Red 证据

- 命令：`npm run test:connector:api-leads --workspace backend`
- 环境：Windows / Node.js v24.14.0 / `NODE_ENV=test`
- 退出码：1
- 结果：`ERR_MODULE_NOT_FOUND`
- 缺失目标：`backend/src/connectors/api-lead-ingestion-connector.js`
- 真实外呼：0

该失败证明测试先于生产实现存在，且不是通过跳过测试或弱化断言制造。

## 当前状态

生产实现文件尚未创建。下一步先创建独立 Test-first Commit，再新增 `api-lead-ingestion-connector.ts` 并按真实失败逐项转绿；不得删除测试、放宽凭证隔离或引入真实 HTTP 调用来获得通过。
