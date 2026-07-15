# 会话交接

更新时间：2026-07-15

## 可恢复结论

**可以在新会话中继续开发，但必须以本文件记录的 L-0019 Test-first/Red 检查点为起点。** 工程计划、ADR、需求/任务、测试契约、风险、证据和实施日志均已落库；当前没有需要依赖本次聊天上下文才能理解的关键决策。

GitHub 是唯一交付远端，禁止操作 Gitee。当前循环尚未完成，不得把 L-0019 标记为 Done。

## 当前工作位置

- 仓库：`C:\Users\Administrator\Documents\Codex\2026-07-13\hi\GoodJob`
- 分支：`codex/phase-3-lead-pipeline`
- GitHub：`1060392338/goodjob`
- 当前阶段：阶段 3——获客数据管道
- 当前 Loop：`L-0019`（公开网页/搜索安全 Connector）
- 当前 REQ/TASK：`REQ-GJ-LEAD-001 / TASK-GJ-0201`
- 当前状态：`in_progress / Test-first Red`
- L-0017 实现/收口：`308cb67` / `29299ed`
- L-0018 Test-first/实现/收口：`876ba19` / `db6c711` / `d1e4de3`
- L-0019 初始 Test-first/Red：`603c664`
- L-0019 失败分类契约增强：`3058c32`

## 当前事实快照

1. `backend/src/connectors/web-lead-ingestion-connector.ts` **尚不存在**；
2. 专项测试已创建并接入后端测试：
   - `backend/src/connectors/web-lead-ingestion-connector-test.ts`
   - `npm run test:connector:web-leads --workspace backend`
3. 2026-07-15 再次执行专项测试，按预期失败：
   - `ERR_MODULE_NOT_FOUND`
   - 缺少 `web-lead-ingestion-connector.js`
4. 该失败是有效的 Test-first/Red 证据，不是环境故障；下一步应实现生产代码使原契约转绿，不得删除测试、跳过断言或放宽安全边界；
5. 当前测试使用 Mock Resolver、Mock Transport 和 fixtures，真实网络、真实凭证、真实供应商调用为 0；
6. 会话收口前应确认工作区干净，并把本分支推送 GitHub。若远端暂未包含上述提交，以本地 Git 日志为准并先推送。

## L-0019 已完成部分

- ADR-0018 已登记：`docs/engineering/adr/ADR-0018-public-web-search-connector.md`；
- Evidence 已登记：`docs/engineering/evidence/L-0019-public-web-search-connector.md`；
- 已锁定正常抓取、公开公司页发现、统一记录、血缘、内容信任标签、恢复、幂等与真实外呼 0；
- 已锁定以下失败关闭边界：
  - 未许可域名、非 HTTP/HTTPS、URL 凭证；
  - 私网/保留地址、DNS rebinding、重定向到私网；
  - robots 禁止或不可用；
  - 租户/来源/域名限流；
  - 非法内容类型、响应超限、超时、重定向过多；
  - 缺少许可依据；
  - checkpoint 上下文或种子摘要被篡改；
- 原始网页正文不得进入持久化 payload/checkpoint；外部内容必须标记为 `untrusted_external`，且 `instructionUse=forbidden`。

## L-0019 尚未完成部分

1. 实现 `backend/src/connectors/web-lead-ingestion-connector.ts`；
2. 让专项测试从 Red 转为 PASS；
3. 运行后端构建和完整质量门禁；
4. 记录真实专项结果、全量门禁结果、风险变化与回滚方式；
5. 创建独立实现 Commit 和文档收口 Commit；
6. 推送 GitHub；
7. 将 `currentIteration` 切换到 `L-0020`。

## 实现边界（以 ADR-0018 和测试为准）

实现至少应公开：

- `InMemoryWebLeadRateLimiter`
- `WebLeadConnectorError`
- `WebLeadIngestionConnector`
- 测试导入的 Transport、Document、Extractor 等 TypeScript 类型

实现必须显式注入域名策略、DNS Resolver、Transport、Extractor、租户和限流器；不得提供可误用的默认真实网络 Transport。每次请求及重定向都必须重新执行协议、凭证、allowlist、DNS/IP、地址钉扎、限流和响应限制检查。robots 失败关闭，HTML/文本净化后才能交给 Extractor，Prompt 注入样式内容不得作为指令使用。

Transport 只能收到 Connector 已验证并传入的 `resolvedAddresses`；不能在 Transport 内自行重新解析并绕过地址钉扎。checkpoint 必须绑定 connector、tenant、seed digest 和 policy digest。

## 下一次会话启动顺序

1. 阅读 `AGENTS.md`、`docs/engineering/README.md` 和本文件；
2. 执行：

   ```powershell
   git status --short --branch
   git log --oneline -12
   Test-Path backend/src/connectors/web-lead-ingestion-connector.ts
   npm run test:connector:web-leads --workspace backend
   ```

3. 预期实现文件不存在，专项测试以 `ERR_MODULE_NOT_FOUND` 失败；若状态不同，先核对 Git 历史，禁止覆盖未知变更；
4. 阅读 ADR-0018、L-0019 Evidence 和完整专项测试；
5. 创建 `web-lead-ingestion-connector.ts`，按真实失败逐项修复；
6. 专项转绿后依次运行：

   ```powershell
   npm run build --workspace backend
   npm run verify
   npm run audit:dependencies
   npm run test:e2e
   git diff --check
   ```

7. 暂存新增实现后再执行一次 `npm run verify`，确保 repository security 检查覆盖新文件；
8. 实现提交建议：`feat(leads): add secure public web ingestion connector`；
9. 更新 FEATURES、TRACEABILITY、PROJECT_STATUS、HANDOFF、IMPLEMENTATION_LOG、RISK_REGISTER、DEVELOPMENT_PLAN 和 L-0019 Evidence；
10. 文档收口提交后只推送 GitHub。

## L-0019 验收标准

只有同时满足以下条件才能 Done：

- 专项测试 PASS，所有安全拒绝分类保持有效；
- 正常记录具备许可、robots、最终 URL、内容摘要、抓取时间和信任标签血缘；
- 故障恢复成功，完整重跑 created 0、duplicate 2、持久化记录不重复；
- 原始正文和注入样式文本不进入持久化 payload；
- `npm run verify` PASS；
- `npm run audit:dependencies` 0 vulnerabilities；
- `npm run test:e2e` 完整运行全部通过；
- 真实外呼 0；
- Evidence、风险、回滚、实施日志、追踪矩阵和 Git Commit 全部补齐。

## 阶段 3 后续

- `L-0020`：第三方 API Connector 插件边界；
- `L-0021`：阶段 3 全量验收、追踪审计、风险复核和回顾；
- 阶段 3 通过后才进入阶段 4 AI 线索清洗、补全、去重与 ICP 评分。

## 暂停条件

仅在以下情况请求项目负责人确认：

- 需要真实供应商或搜索服务选型；
- 需要真实 API Key、生产凭证或真实网络采集；
- 需要改变数据保留、合规许可或不可逆业务规则；
- 需要生产部署、数据库迁移或真实客户数据回放。

其余 Mock/契约实现、测试修复、文档和 Git 工作可自主继续。
