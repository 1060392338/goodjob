# L-0020 证据：第三方 API Provider 插件边界

- 日期：2026-07-15
- 关联：REQ-GJ-LEAD-001 / TASK-GJ-0201
- ADR：ADR-0019
- 基线 Commit：`cdf346d`
- Test-first Commit：`33e508c`
- 实现 Commit：`c361a26`
- 状态：Done（真实供应商/凭证/网络验收 Deferred）

## 目标

在不选择真实供应商、不使用真实凭证和不发生真实外呼的前提下，建立可替换的 Provider 插件、认证引用、分页、重试/退避、额度、错误分类、checkpoint、幂等和血缘契约。

## Test-first / Red

专项测试先锁定 Registry、Provider ID/version、配置、credential handle、opaque cursor、Mapper、API 血缘、Pipeline 恢复、Retry-After、指数退避、最大重试、预算、错误分类、Secret 拒绝和 checkpoint 篡改。

真实 Red：

```text
npm run test:connector:api-leads --workspace backend
退出码：1
结果：ERR_MODULE_NOT_FOUND
缺失：backend/src/connectors/api-lead-ingestion-connector.js
真实外呼：0
```

该失败发生在生产实现创建前，保存于 Commit `33e508c`，未通过删测或弱化断言获得通过。

## 实现

`backend/src/connectors/api-lead-ingestion-connector.ts` 实现：

- `ApiLeadProviderPlugin`、`ApiLeadProviderRegistry`、`ApiLeadIngestionConnector`；
- Provider ID/version 注册与重复拒绝；
- 受控 `credentialHandle`，拒绝原始 API Key/Token、Secret-like 配置和原始记录；
- Provider opaque cursor 与 `api-v1:` GoodJob cursor 隔离；
- checkpoint 绑定 connector、tenant digest、Provider ID/version、config digest、Mapper version 和 Provider cursor/token；
- Retry-After、指数退避、最大重试、错误分类和 tenant + connector + provider 请求预算；
- 原始 Provider 响应不进入 payload/checkpoint，错误文本不透传；
- 统一 Pipeline 的故障恢复、完整重跑、幂等和逐记录 `apiLineage`。

## 专项验收

```json
{
  "ok": true,
  "providerPlugins": 1,
  "pages": 2,
  "lineageFields": 6,
  "retryAfterHonored": true,
  "exponentialBackoff": true,
  "requestBudgetProtected": true,
  "errorClassifications": 10,
  "resumedAfterFailure": true,
  "duplicateWrites": 0,
  "credentialLeaks": 0,
  "realOutboundCalls": 0
}
```

## 完整门禁

2026-07-15，Windows / Node.js v24.14.0：

- `npm run test:connector:api-leads --workspace backend`：PASS；
- `npm run build --workspace backend`：PASS；
- `npm run verify`：PASS；repository security 173、REQ/TASK 16/16、OpenAPI 167、tenant isolation 18、frontend self-test 44；
- `npm run audit:dependencies`：PASS，0 vulnerabilities；
- `npm run test:e2e`：PASS，37/37；
- `git diff --check`：PASS；
- 文档暂存后再次 `npm run verify`：PASS，repository security 174、currentIteration L-0021。

首次组合门禁中的 `verify` 曾因 `ai-config-routes-test.ts` 动态端口随机命中 Fetch 禁用端口出现一次 `bad port`；未修改代码直接复跑后完整 PASS。该现象移交 L-0021 观察，若再次发生则登记测试稳定性缺陷。

## 风险与 Deferred

- R-006 保持 Open：真实网页许可/网络和阶段 4 Prompt 注入红队未验证；
- R-013 保持 Verification：真实部署密钥治理、备份恢复和供应商额度告警未验证；
- R-015 保持 Mitigating：Mock Provider 下恢复、幂等和血缘通过，真实客户数据/供应商验收未执行；
- 真实 Provider、真实凭证、真实网络、真实客户数据、生产数据库、schema 和公开 API 变化均为 0。

## 回滚

若需回滚 L-0020，可回退实现 Commit `c361a26` 和 Test-first Commit `33e508c`，删除 API Provider Connector、专项测试及 backend 测试脚本登记；不涉及数据库回滚、数据迁移或外部供应商操作。

## 交接

L-0020 完成。下一循环为 `L-0021`：阶段 3 跨 Connector 全量验收、追踪审计、风险复核和阶段回顾。真实外部验证必须继续显式 Deferred，不能混报完成。
