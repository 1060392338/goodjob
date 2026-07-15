# ADR-0007：AI 配置路由与 ModelGateway 装配边界

- 状态：Accepted
- 日期：2026-07-15
- 关联：`REQ-GJ-ARCH-001 / TASK-GJ-0003`
- 实施循环：`L-0008`

## 背景

`server.ts` 仍内联保存、删除、测试 AI 配置的 4 个 API，并直接实现 OpenAI-compatible、Anthropic、Gemini 三种 HTTP 调用。配置、租户范围、密钥脱敏、SSRF 防护、模型协议、超时和错误处理混在 Composition Root 中，后续 AI 获客、评分、邮件草稿及协作平台能力无法在统一契约下测试。

本循环仍属于阶段 2 的架构基础，不代表阶段 4 AI 功能已经开始或完成。

## 决策

1. 只迁移以下既有 API，保持 URL、方法、认证、成功响应和租户归属语义：
   - `GET /api/tools/ai-config`
   - `POST /api/tools/ai-config`
   - `DELETE /api/tools/ai-config/:id`
   - `POST /api/tools/ai-config/test`
2. 新建可注入 `ModelGateway` 契约。生产 Composition Root 只装配一个 HTTP Gateway；路由测试和契约测试只能使用 Mock/Stub，不连接真实模型。
3. Gateway 负责协议差异、超时、响应信封解析、Trace ID、错误分类和公开错误脱敏。错误分类至少包括认证失败、超时、限流、非法响应、供应商失败和安全拒绝。
4. API Key 仍只在服务端 Store 中保存；HTTP 响应只返回尾四位掩码，错误不得包含 Authorization、`x-api-key` 或 Gemini 查询参数中的密钥。
5. 私网/本机模型地址默认拒绝；只有显式 `ALLOW_PRIVATE_AI_ENDPOINTS=true` 才允许。保存配置和实际调用都执行该边界。
6. 配置只属于创建者。读取、更新、测试、删除均不得访问其他用户配置；请求携带与其他租户冲突的配置 ID 时按不存在处理，不得覆盖或复制其 ID。
7. 连接测试必须验证结构化内容确为 `{ "ok": true }`，不能只用字符串包含关系判断成功。
8. `server.ts` 保留 Composition Root，既有翻译、AI 搜客和官网解析暂时通过同一个 Gateway 调用；其业务路由迁移留给后续独立循环。

## 本循环明确不做

- 不接入真实 OpenAI、Anthropic、Gemini 或其他供应商密钥；
- 不实现完整 Prompt 版本、用量计费、审计表、自动重试或评测数据集；
- 不迁移全部 AI 搜客和网站采集路由；
- 不实现真实钉钉、企业微信、飞书 Adapter；
- 不拆分前端 `prototype-api.ts`，不重构 MySQL Repository/Unit of Work。

## 测试与验收

- ModelGateway 契约测试覆盖三协议成功、认证失败、超时、限流、非法 JSON、SSRF 拒绝和密钥脱敏；
- AI 配置路由测试覆盖未登录、未配置、缺少密钥、跨租户读取/更新/测试/删除、掩码保留、连接测试状态持久化和禁止未授权外呼；
- 注册/OpenAPI API 操作仍为 167，跨模块租户隔离不少于 18；
- `npm run verify`、`npm run test:e2e`、依赖审计和 `git diff --check` 全部通过。

## 回滚

代码回滚时删除 AI 配置路由装配和 ModelGateway 模块，并恢复本 ADR 前 `server.ts` 的内联路由/调用函数。无数据库结构变更，无需数据回滚；既有 `ai_model_configs` 数据保持兼容。

## 后果

- AI 配置和模型传输形成首个可独立测试边界，后续业务切片可复用而不绑定厂商协议。
- 阶段 4 的完整 Gateway 能力仍需在独立需求中补齐用量、重试、Prompt/Schema 版本和审计，因此 `REQ-GJ-AI-001` 继续保持 backlog。
