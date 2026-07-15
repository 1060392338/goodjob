# ADR-0008：线索来源配置与 LeadSourceConnector 装配边界

- 状态：Accepted
- 日期：2026-07-15
- 关联：`REQ-GJ-ARCH-001 / TASK-GJ-0003`
- 关联阶段能力：`REQ-GJ-LEAD-001 / TASK-GJ-0201`（仅建立前置边界）
- 实施循环：`L-0009`

## 背景

`server.ts` 当前内联维护线索数据源注册表状态、用户 Key 配置、连接测试和删除逻辑，测试连接直接调用具体 `LeadProvider.test`。配置归属、密钥脱敏、SSRF、超时/限流分类和真实外呼边界尚未形成可注入契约，后续接入搜索、第三方数据服务和分页恢复会继续放大 Composition Root。

本循环仍属于阶段 2 的可维护架构基础，不代表阶段 3 的完整线索采集管道已经完成。

## 决策

1. 只迁移以下既有 API，保持 URL、HTTP 方法、认证、主要状态码、成功响应和用户级配置归属：
   - `GET /api/lead-finder/providers`
   - `POST /api/lead-finder/source-config`
   - `POST /api/lead-finder/source-config/test`
   - `DELETE /api/lead-finder/source-config/:provider`
2. 新建可注入 `LeadSourceConnector` 契约；生产 Composition Root 装配基于现有 Provider 注册表的实现，路由专项测试只使用 Mock，不连接真实第三方数据源。
3. Connector 统一生成 Trace ID，并分类 `unconfigured`、`authentication`、`timeout`、`rate_limited`、`invalid_response`、`provider_error`、`security_rejected`。
4. Connector 公开错误必须脱敏原始 Key、URL 编码后的 Key、Authorization 和常见 Key 查询参数。自定义 Base URL 在保存和连接测试前均执行公网 HTTP/HTTPS 校验。
5. 配置仅属于创建者。读取状态、更新、测试和删除均不得访问其他用户配置；公开响应只返回尾四位掩码。
6. 契约预留分页与检查点字段：`cursor`、`checkpoint`、`nextCursor`、`nextCheckpoint` 和 `exhausted`。L-0009 不迁移完整搜索路由，也不宣称已实现断点恢复。
7. `server.ts` 继续保留完整搜索的既有执行路径；后续独立循环再把 Provider 搜索、分页、限流重试、幂等摄取和来源证据迁入 Connector 管道。

## 本循环明确不做

- 不调用或保存真实第三方数据源凭证；
- 不迁移完整搜索、网站采集、AI 评分或线索入库流程；
- 不实现真实钉钉、企微、飞书 Adapter；
- 不拆分前端 `prototype-api.ts`；
- 不重构 MySQL Repository/Unit of Work；
- 不关闭阶段 3 的 `REQ-GJ-LEAD-001`。

## 测试与验收

- Connector 契约测试覆盖成功、未配置、认证失败、超时、限流、非法结果、安全拒绝、未知错误和密钥脱敏；
- 路由测试覆盖未登录、未知 Provider、缺少 Key、掩码 Key 保留、SSRF、用户级租户隔离、连接状态持久化、删除隔离和 Mock 真实外呼为 0；
- 注册/OpenAPI API 操作保持 167，跨模块租户隔离不少于 18；
- `npm run verify`、`npm run test:e2e`、依赖审计、仓库安全检查与 `git diff --check` 全部通过。

## 回滚

回滚 L-0009 代码 Commit，删除 Connector、领域服务和路由装配，恢复 `server.ts` 中原有 4 个内联 API。无数据库结构变化，无需数据迁移回滚。

## 后果

- 数据源配置和连接测试形成独立、可注入、可失败注入的边界；
- 真实搜索仍沿用既有 Provider 路径，因此完整分页、检查点、重试和幂等能力继续作为阶段 3 backlog；
- 第三方厂商未确定不再阻塞配置接口和统一契约建设。
