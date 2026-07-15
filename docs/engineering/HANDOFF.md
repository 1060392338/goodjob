# 会话交接

更新时间：2026-07-15

## 可恢复结论

阶段 3 已完成 L-0017、L-0018、L-0019。L-0020 已完成 ADR、完整 Test-first 契约和真实 Red，生产实现尚未创建。下一开发会话可直接从本文件恢复，不依赖聊天记录。GitHub 是唯一交付远端，禁止操作 Gitee；GoodJob 现有业务行为是产品基线，不做 MVP 式推倒重写。

## 当前工作位置

- 仓库：`C:\Users\Administrator\Documents\Codex\2026-07-13\hi\GoodJob`
- 分支：`codex/phase-3-lead-pipeline`
- GitHub：`https://github.com/1060392338/goodjob.git`
- 当前阶段：阶段 3——获客数据管道
- 当前 Loop：`L-0020`（第三方 API Provider 插件边界）
- 当前 REQ/TASK：`REQ-GJ-LEAD-001 / TASK-GJ-0201`
- L-0019 稳定收口：`cdf346d`
- 文档完整性修复：`3f32df7`
- L-0017 实现：`308cb67`
- L-0018 实现：`db6c711`
- L-0019 Test-first：`603c664`、`3058c32`；实现：`3b0c366`

## 当前本地工作区（必须保留）

L-0020 Test-first 变更尚待提交，包含：

```text
M  backend/package.json
M  docs/engineering/DEVELOPMENT_PLAN.md
M  docs/engineering/FEATURES.json
M  docs/engineering/HANDOFF.md
M  docs/engineering/IMPLEMENTATION_LOG.md
M  docs/engineering/PROJECT_STATUS.md
?? backend/src/connectors/api-lead-ingestion-connector-test.ts
?? docs/engineering/adr/ADR-0019-third-party-api-provider-boundary.md
?? docs/engineering/evidence/L-0020-third-party-api-provider-boundary.md
```

下一操作是创建独立 Test-first Commit。不得 reset/clean，不得删除或弱化失败契约。

生产实现当前不存在：

```text
backend/src/connectors/api-lead-ingestion-connector.ts
```

## 最近稳定验收：L-0019

- 安全 Web Connector 专项 PASS；
- `npm run verify` PASS，repository security 169、API operations 167、tenant isolation 18；
- dependency audit 0 vulnerabilities；
- Playwright 37/37；
- 真实外呼 0；
- Evidence：`docs/engineering/evidence/L-0019-public-web-search-connector.md`。

这些结果只代表 L-0019，不得当作 L-0020 的验收结果。

## L-0020 Test-first/Red 证据

完整专项契约已覆盖：

1. Registry 注册、ID/version 解析和重复拒绝；
2. Provider 描述、配置验证、credential handle；
3. Provider opaque cursor 与 GoodJob cursor/checkpoint 隔离；
4. Mapper、逐记录 API 血缘、原始响应不持久化；
5. Pipeline 第二条 Sink 故障、恢复、完整重跑 created 0 / duplicate 2；
6. Retry-After、指数退避、最大重试；
7. authentication、permission_denied、invalid_request、rate_limited、quota_exhausted、request_budget_exhausted、timeout、transient、invalid_response、secret_rejected、checkpoint_context_mismatch、invalid_configuration；
8. tenant + connector + provider 请求预算；
9. providerVersion、configDigest、mapperVersion、tenantDigest checkpoint 篡改拒绝；
10. 错误、payload、checkpoint 中 credential/Secret/原始响应泄漏为 0；
11. Mock Provider，真实外呼 0。

真实 Red：

```text
命令：npm run test:connector:api-leads --workspace backend
环境：Windows / Node.js v24.14.0 / NODE_ENV=test
退出码：1
结果：ERR_MODULE_NOT_FOUND
缺少：backend/src/connectors/api-lead-ingestion-connector.js
真实外呼：0
```

## 下一会话严格执行顺序

1. 检查 `git status --short --branch` 和最近提交；
2. 创建独立 Test-first Commit：

   ```text
   test(leads): checkpoint L-0020 API provider contract
   ```

3. 新建 `backend/src/connectors/api-lead-ingestion-connector.ts`；
4. 按真实失败逐项实现，不删测、不弱化 credential/Secret/checkpoint 隔离；
5. 专项转绿后执行：

   ```powershell
   npm run build --workspace backend
   npm run verify
   npm run audit:dependencies
   npm run test:e2e
   git diff --check
   ```

6. 暂存实现后再次运行 `npm run verify`，确保 repository security 扫描新文件；
7. 创建实现 Commit：

   ```text
   feat(leads): add third-party API provider connector
   ```

8. 更新 FEATURES、TRACEABILITY、PROJECT_STATUS、HANDOFF、IMPLEMENTATION_LOG、RISK_REGISTER、DEVELOPMENT_PLAN 和 Evidence；
9. 创建文档收口 Commit并推送 GitHub；
10. 切换 `currentIteration` 到 `L-0021`，执行阶段 3 全量验收与回顾。

## L-0020 完成定义

- Provider Registry、版本化插件、版本化 Mapper 与统一 Connector 契约转绿；
- 认证仅使用 credential handle，Secret 泄漏为 0；
- 分页、Retry-After、指数退避、最大重试、错误分类、额度/预算均有专项测试；
- checkpoint 上下文绑定，故障可恢复，完整重跑 duplicate writes 0；
- Mock Provider，真实供应商、真实凭证、真实网络调用均为 0；
- 专项、build、`verify`、dependency audit、E2E、`git diff --check` 全部通过；
- REQ/TASK/ADR/Commit/Test/Evidence/风险/回滚/交接完整且一致。

## 剩余阶段 3 工作

- L-0020：第三方 API Provider 插件边界（Test-first/Red 已完成，待实现）；
- L-0021：三类 Connector 统一契约、阶段门禁、风险复核、Deferred 项和回顾。

L-0021 完成后才可宣布阶段 3 完成，并进入阶段 4 AI 获客闭环。

## 暂停条件

仅在需要真实供应商选型、真实凭证、真实外呼、不可逆业务规则、生产数据库或真实客户数据时请求确认。其余 Mock/契约开发可自主继续。