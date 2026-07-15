# L-0009 线索来源配置与 LeadSourceConnector 装配边界证据

- 日期：2026-07-15
- 关联需求/任务：`REQ-GJ-ARCH-001 / TASK-GJ-0003`
- 关联阶段能力：`REQ-GJ-LEAD-001 / TASK-GJ-0201`（只建立前置边界，保持 backlog）
- 风险：`R-004 / R-006 / R-013`
- 基线 Commit：`e3a3055`
- 代码交付 Commit：`59594d1`
- 分支：`codex/phase-1-route-modularization`
- 设计依据：`ADR-0003 / ADR-0005 / ADR-0007 / ADR-0008`
- 状态：Completed

## Orient / 范围冻结

本循环继续阶段 2“可维护架构基础”，只迁移线索数据源配置和连接测试边界：

1. `GET /api/lead-finder/providers`
2. `POST /api/lead-finder/source-config`
3. `POST /api/lead-finder/source-config/test`
4. `DELETE /api/lead-finder/source-config/:provider`

范围外事项：

- 不连接真实 Serper、Brave、SerpAPI、Hunter 或其他第三方服务；
- 不使用或提交真实 API Key；
- 不迁移完整搜索、官网采集、AI 评分和线索摄取；
- 不宣称分页、检查点、重试和幂等摄取已完成；
- 不实现真实钉钉、企微、飞书 Adapter；
- 不拆分前端或 MySQL Repository/Unit of Work。

## DoR

- [x] 4 个现有 API 的 URL、方法、认证、响应和用户级配置归属已确认。
- [x] `ADR-0003`、`ADR-0005`、`ADR-0007` 与风险 R-004/R-006/R-012 已复核。
- [x] 第三方厂商和真实凭证不是本循环依赖，生产测试以可注入 Mock 完成。
- [x] 回滚边界明确：单一 Commit，无数据库结构变化。

## 设计与实现

### 新模块

- `backend/src/connectors/lead-source-connector.ts`
  - 定义 `LeadSourceConnector`、Trace ID 和错误契约；
  - 将现有 Provider 注册表装配为生产 Connector；
  - 连接测试和预留单页搜索均在统一边界内执行；
  - 自定义 Base URL 在真实调用前再次进行公网地址校验；
  - 公开错误脱敏原始 Key、URL 编码 Key、Authorization 和常见 Key 查询参数。
- `backend/src/domain/leads/lead-source-config-service.ts`
  - 集中用户级配置查询、公开 DTO、Provider 状态和 AI 搜索状态。
- `backend/src/routes/lead-source-config-routes.ts`
  - 迁移 4 个配置 API；
  - 只依赖可注入 Connector 和 Store；
  - 保持尾四位掩码、缺 Key 门禁、测试状态持久化和用户级删除隔离。
- `backend/src/connectors/lead-source-connector-test.ts`
  - 覆盖错误分类、脱敏、安全拒绝和分页/检查点契约。
- `backend/src/routes/lead-source-config-routes-test.ts`
  - 覆盖 4 路由、租户隔离、掩码保留、失败持久化和零真实外呼。
- `docs/engineering/adr/ADR-0008-lead-source-connector-boundary.md`
  - 冻结本循环范围、错误分类、分页/检查点字段和后续迁移边界。

### Connector 错误分类

- `unconfigured`
- `authentication`
- `timeout`
- `rate_limited`
- `invalid_response`
- `provider_error`
- `security_rejected`

### 分页与检查点契约

契约预留 `cursor`、`checkpoint`、`nextCursor`、`nextCheckpoint` 和 `exhausted`。现有 Provider 只支持单页适配；收到游标或检查点时明确失败，不伪造断点恢复能力。

## 测试发现与处理

1. 首次 TypeScript 构建发现完整搜索代码仍需要按用户读取来源配置；改为复用新的领域服务，未复制旧查询逻辑。
2. 仓库安全检查在新文件暂存前只能看到 115 个已跟踪文件；代码暂存后重跑通过并检查 121 个文件，未跳过门禁。
3. 未通过修改断言、删除测试或关闭安全校验处理失败。

## 验收清单

- [x] 4 个来源配置 API 迁出 `server.ts` 并仅装配一次。
- [x] API 注册/OpenAPI 操作总数保持 167。
- [x] Provider 元数据、AI 搜索状态和既有成功响应兼容。
- [x] 保存和读取只返回尾四位 Key 掩码。
- [x] 掩码更新保留服务端原 Key，不将掩码写回凭证。
- [x] 读取、保存、测试、删除按 ownerId 隔离。
- [x] 未配置、认证失败、超时、限流、非法结果、供应商错误和安全拒绝均有失败注入。
- [x] 自定义私网地址在 Connector/Provider 调用前拒绝。
- [x] Mock 专项测试真实第三方外呼为 0。
- [x] 分页/检查点字段已有类型和契约测试，但未虚报完整实现。
- [x] `server.ts` 从 5974 行降至 5823 行，净减少 151 行。
- [x] 无数据库结构变化，无新生产依赖。

## 验证证据

| 命令 | 结果 |
|---|---|
| `npm run test:connector:lead-source --workspace backend` | PASS；7 类错误；分页/检查点字段；真实外呼 0；密钥脱敏 |
| `npm run test:routes:lead-source-config --workspace backend` | PASS；4 路由；读/存/测/删租户隔离；SSRF 前置拒绝；真实外呼 0 |
| `npm run test:routes` | PASS；九组路由/Gateway/Connector 专项门禁 |
| `npm run test --workspace backend` | PASS |
| `npm run test:security` | PASS；API 167；跨模块租户隔离 18 |
| `npm run build --workspace backend` | PASS |
| `npm run verify` | PASS；双端测试、安全、工作簿与构建通过 |
| `npm run test:e2e` | PASS；Playwright 37/37 |
| `npm run audit:dependencies` | PASS；0 vulnerabilities |
| `npm run test:repo-security` | PASS；代码暂存后 121 个文件；闭环文档暂存后 122 个文件 |
| `git diff --check` / `git diff --cached --check` | PASS |

## Review

- 权限：配置状态、测试和删除仅作用于当前用户；跨租户相同 Provider 配置互不覆盖。
- 数据：复用 `lead_source_configs`，无迁移；公开 DTO 不含原始 Key。
- 外部副作用：专项测试仅使用 Mock；生产连接测试统一由 Composition Root 装配 Connector。
- 兼容：self-test 保持 11 个 Provider，API 167，E2E 37/37。
- 风险：`lead_source_configs.api_key` 仍为明文 at-rest，登记 R-013，真实 Key 正式投入前必须加密或外部 Secret 化。
- 回滚：回滚 Commit `59594d1` 即可恢复内联路由；无数据库回滚。

## 后续

建议 L-0010 继续阶段 2，选择前端 `prototype-api.ts` 的单一领域切片进行渐进拆分。完整 Provider 搜索、分页/检查点、限流重试、幂等摄取与来源证据仍由阶段 3 `REQ-GJ-LEAD-001` 独立交付。
