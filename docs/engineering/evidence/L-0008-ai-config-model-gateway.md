# L-0008 AI 配置路由与 ModelGateway 装配边界证据

- 日期：2026-07-15
- 关联需求/任务：`REQ-GJ-ARCH-001 / TASK-GJ-0003`
- 关联架构：`REQ-GJ-AI-001 / TASK-GJ-0101`（只建立前置边界，不改变其 backlog 状态）
- 风险：`R-004 / R-006 / R-012`
- 基线 Commit：`6194cee`
- 代码交付 Commit：`9160a90`
- 分支：`codex/phase-1-route-modularization`
- 设计依据：`ADR-0002 / ADR-0003 / ADR-0005 / ADR-0007`
- 状态：Completed

## Orient / 范围冻结

本循环仍属于阶段 2“可维护架构基础”，只交付一个边界清晰切片：

1. 迁移 4 个 AI 配置 API：
   - `GET /api/tools/ai-config`
   - `POST /api/tools/ai-config`
   - `DELETE /api/tools/ai-config/:id`
   - `POST /api/tools/ai-config/test`
2. 建立可注入 `ModelGateway`，统一既有 OpenAI-compatible、Anthropic、Gemini HTTP 协议调用。
3. 将翻译、AI 搜客和官网 AI 解析的底层模型传输改为复用同一个生产 Gateway，但不迁移这些业务路由。

范围外事项：

- 不接入或提交真实模型密钥；
- 不完成阶段 4 的 Prompt/Schema 版本、用量计费、自动重试、审计和金标评测；
- 不迁移全部 AI 搜客、网站采集或 WhatsApp 路由；
- 不接入真实钉钉、企微、飞书凭证；
- 不拆分前端或 MySQL Repository/Unit of Work。

## 设计与实现

### 新模块

- `backend/src/gateways/model-gateway.ts`
  - 定义 `ModelGateway`、请求/结果契约与 `ModelGatewayError`；
  - 生产实现统一 OpenAI-compatible、Anthropic、Gemini；
  - 提供 Trace ID、120 秒超时、SSRF 公网地址检查、错误分类和密钥脱敏；
  - 错误分类：未配置、认证失败、超时、限流、非法响应、供应商失败、安全拒绝。
- `backend/src/domain/ai/ai-config-service.ts`
  - 负责配置选择、使用场景匹配、公开字段掩码和连接测试判定；
  - 连接测试必须解析严格 JSON 且 `ok === true`。
- `backend/src/routes/ai-config-routes.ts`
  - 独立注册 4 个 API；
  - Gateway、公网地址检查和时钟通过 Composition Root 注入；
  - 读取、更新、测试、删除按 `ownerId` 隔离；其他租户已占用的 ID 不得覆盖。
- `backend/src/gateways/model-gateway-test.ts`
  - 纯 Stub HTTP 契约测试，不访问真实网络。
- `backend/src/routes/ai-config-routes-test.ts`
  - 最小 Express 应用 + Mock Gateway 路由集成测试。

### 安全边界

1. API Key 不通过配置 API 明文返回，只显示尾四位掩码。
2. 错误会移除原始和 URL 编码后的密钥；Gemini 查询参数不进入公开错误。
3. 私网/本机地址默认拒绝；仅显式 `ALLOW_PRIVATE_AI_ENDPOINTS=true` 可放行。
4. 无配置、无 Key、外租户配置及安全拒绝路径不调用 Gateway。
5. 测试没有真实外呼，也没有使用真实企业或模型凭证。
6. 现有数据库仍明文保存模型 Key，已登记 R-012；正式使用真实密钥前需完成加密或外部 Secret 引用。

## 测试驱动发现与处理

1. 首次专项执行发现 PowerShell 写入 `backend/package.json` 时带 BOM，`tsx` 无法解析；已改为无 BOM UTF-8，并由后端编译和完整 `verify` 锁定。
2. TypeScript 编译发现测试将 `User` 直接传给 `signToken(SessionUser)`；已改为通过 `publicUser` 构造会话对象，未放宽类型检查。
3. 首次依赖审计因 npm Registry TLS 连接中断失败；使用本机已配置代理重试后通过并报告 0 vulnerabilities。未跳过审计门禁。

## 验收清单

- [x] 4 个 AI 配置 API 迁出 `server.ts` 并显式装配一次。
- [x] URL、HTTP 方法、认证、主要成功响应和 API 操作总数保持不变。
- [x] 三种协议通过同一 `ModelGateway` 契约。
- [x] 未配置和缺少 Key 时不发起模型调用。
- [x] 认证失败、超时、限流、非法 JSON、空内容和结构化结果非法均有失败注入覆盖。
- [x] 配置读取、更新、测试、删除具备用户级租户隔离。
- [x] API Key 公开响应和错误信息脱敏。
- [x] SSRF 安全拒绝发生在真实请求之前。
- [x] Mock/Stub 测试真实外呼次数为 0。
- [x] OpenAPI/注册 API 操作保持 167；跨模块租户隔离保持 18。
- [x] `server.ts` 从 6258 行降至 5974 行，净减少 284 行。
- [x] 无数据库结构变化，无新生产依赖。

## 验证证据

| 命令 | 结果 |
|---|---|
| `npm run test:gateway:model --workspace backend` | PASS；3 协议成功；6 类失败；真实外呼 0；密钥脱敏 |
| `npm run test:routes:ai-config --workspace backend` | PASS；4 路由；5 次 Mock 调用；租户隔离与失败注入通过 |
| `npm run test:routes` | PASS；core/customer/lead/outreach/conversion/model-gateway/ai-config 全部通过 |
| `npm run test --workspace backend` | PASS |
| `npm run test:security` | PASS；API 167；跨模块租户隔离 18 |
| `npm run build --workspace backend` | PASS |
| `npm run verify` | PASS；仓库安全检查 108 个当时已跟踪文件，双端测试与构建通过 |
| `npm run test:repo-security`（暂存新文件后） | PASS；114 个已跟踪/暂存文件 |
| `npm run test:e2e` | PASS；Playwright 37/37 |
| `npm run audit:dependencies` | PASS；0 vulnerabilities（首次网络失败后代理重试） |
| `git diff --check` / `git diff --cached --check` | PASS |

## Review

- 权限：配置严格归属创建者，外租户 ID 冲突返回 404。
- 数据：复用既有 `ai_model_configs`，无迁移；公开 DTO 不含原始 Key。
- 外部副作用：专项测试仅 Mock/Stub；生产模型调用统一由 Composition Root 装配 Gateway。
- 兼容：API 操作仍为 167，E2E AI 配置保存和连接测试场景通过。
- 回滚：回滚 Commit `9160a90` 即可恢复内联路由和调用；无数据库回滚。

## 后续

建议 L-0009 选择“线索来源配置与 LeadSourceConnector 装配边界”：先冻结 provider/source-config 4 个 API 和连接器错误契约，再迁移单一切片。真实第三方数据源、真实协作平台凭证和完整 AI 功能仍不得混入该循环。
