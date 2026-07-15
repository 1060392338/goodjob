# 项目实施状态

更新时间：2026-07-15
当前分支：`codex/phase-1-route-modularization`
当前阶段：阶段 2——可维护架构基础
整体状态：进行中

## 阶段门禁概览

| 阶段 | 状态 | 已有证据 | 未完成门禁 |
|---|---|---|---|
| 0 接管与安全基线 | Verification | Harness、生产配置门禁、工作簿安全、audit 0、E2E 37/37 | GitHub 历史扫描、Linux/Node 22 Actions、部署凭证轮换确认 |
| 1 业务行为基线 | Baseline established | 后端 self-test、security test、167 个 API 操作、37 条 E2E | 远端 CI 固化；持续维护角色/API 矩阵 |
| 2 可维护架构基础 | In progress | ADR-0005~0008；系统、认证、客户、线索、AI 配置、来源配置共 30 个 API 已模块化；邮件、模型与线索来源边界已建立 | 前端超大模块、Repository/Unit of Work、剩余集成路由继续拆分 |
| 3~7 数据/AI/协作/发布 | Backlog | ADR-0002/0003 与功能台账；阶段 3/4 已有前置 Gateway/Connector | 依赖阶段 2 稳定边界；真实凭证和供应商尚未指定 |

详细阶段、验收和测试标准见 `DEVELOPMENT_PLAN.md`。

## 当前事实

| 项目 | 当前事实 |
|---|---|
| 业务基线 | 当前 GoodJob 业务功能和行为为唯一基线，不进行 MVP 式推倒重写 |
| 前端 | React 19、Vite、TypeScript；`prototype-api.ts` 约 11745 行，仍是阶段 2 主要维护风险 |
| 后端 | Express、TypeScript；`server.ts` 5823 行，系统/认证/客户/线索/AI 配置/来源配置共 30 个 API 已迁出并显式装配 |
| 数据 | 支持 memory 与 MySQL；`lead_outreach_requests` 记录外联幂等；生产启动禁止 memory store |
| 外部副作用 | SMTP 通过 `OutboundEmailGateway`；模型 HTTP 通过 `ModelGateway`；来源连接测试通过 `LeadSourceConnector`；完整来源搜索仍沿用既有 Provider 路径 |
| AI 边界 | 三模型协议已统一传输契约；完整 Prompt/Schema 版本、用量、重试、审计仍属阶段 4 backlog |
| 来源边界 | Provider 元数据、配置和连接测试已统一；完整标准化搜索、分页/检查点、重试、幂等摄取和来源证据仍属阶段 3 backlog |
| 测试 | `verify` 已包含九组路由/Gateway/Connector 门禁、前后端 self-test、安全、工作簿和构建 |
| API 契约 | OpenAPI 与注册路由均保持 167 个操作；跨模块租户隔离 18 |
| E2E | Playwright 37/37 |
| 安全 | `npm audit --audit-level=high` 为 0；模型和来源 Key at-rest 加密、历史 Secret Scan 与部署凭证仍待闭环 |
| 远端 | GitHub `1060392338/goodjob` 为唯一交付远端；Gitee 不再操作 |

## 当前循环

**Loop L-0009：线索来源配置与 LeadSourceConnector 装配边界——本地 DoD 完成**

- 关联需求/任务：`REQ-GJ-ARCH-001 / TASK-GJ-0003`；阶段 3 的 `REQ-GJ-LEAD-001` 仍保持 backlog；
- 基线：`e3a3055`；代码交付：`59594d1`；
- 设计：`ADR-0003` + `ADR-0005` + `ADR-0008`；
- 范围：Provider 状态、来源配置保存、连接测试、删除 4 个 API 已迁出 `server.ts`；
- Connector：统一 Trace ID、7 类错误、SSRF 前置拒绝、Key/Authorization/查询参数脱敏；
- 租户：配置读取、保存、测试和删除均按 `ownerId` 隔离；
- 分页：已冻结 cursor/checkpoint/nextCursor/nextCheckpoint/exhausted 契约，未虚报完整恢复能力；
- 外呼：专项测试全部使用 Mock，真实第三方外呼为 0，未使用真实 Key；
- 回归：`test:routes`、backend self-test、security、build、`verify`、audit 全部 PASS；Playwright 37/37；
- 规模：`server.ts` 5974 → 5823，净减少 151 行；
- 状态：L-0009 切片完成；总体 `REQ-GJ-ARCH-001` 和阶段 2 继续 `in_progress`。

## 下一优先级

1. 启动 L-0010：前端 `prototype-api.ts` 的单一领域渐进拆分，建议先冻结“线索来源中心”的类型、API 客户端和事件处理边界。
2. 只迁移一个前端领域切片，保持 DOM 标识、交互流程、API 请求、错误提示和移动端行为不变。
3. 先增加前端模块级 self-test/契约测试，再迁移生产代码；不得同时重写页面样式或状态管理框架。
4. 继续保持 API 167、租户隔离 18+、audit high 0、`verify` 和 Playwright 37/37 门禁。
5. Repository/Unit of Work、完整来源搜索、完整 AI、Collaboration Adapter 分别进入后续独立循环。

## 阻塞项

- GitHub 仓库当前为 Public；是否调整为 Private 需由项目负责人确认。
- GitHub Actions、历史 Secret Scan 与分支保护尚未形成远端通过证据。
- 未确认现有部署实例清单，无法证明历史默认凭证已全部失效。
- `pending` 邮件尚无运维查询/人工确认界面，当前只能拒绝相同键自动重放。
- `ai_model_configs.api_key` 与 `lead_source_configs.api_key` 仍为明文 at-rest；真实 Key 正式投入前需加密或外部 Secret 引用。
- 第三方线索数据厂商未指定；通用 Connector 不阻塞架构建设，但完整供应商验收无法开始。
- 钉钉、企微、飞书当前只保留统一 Adapter 入口与 Mock 计划，不需要真实企业凭证。
