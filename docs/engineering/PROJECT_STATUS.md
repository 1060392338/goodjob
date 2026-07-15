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
| 2 可维护架构基础 | In progress | ADR-0005/0006/0007；系统、认证、客户、线索、AI 配置共 26 个 API 已模块化；邮件与模型 Gateway 已建立 | LeadSourceConnector/集成路由、前端超大模块、Repository/Unit of Work 继续拆分 |
| 3~7 数据/AI/协作/发布 | Backlog | ADR-0002/0003 与功能台账 | 依赖阶段 2 稳定边界；真实凭证和供应商尚未指定 |

详细阶段、验收和测试标准见 `DEVELOPMENT_PLAN.md`。

## 当前事实

| 项目 | 当前事实 |
|---|---|
| 业务基线 | 当前 GoodJob 业务功能和行为为唯一基线，不进行 MVP 式推倒重写 |
| 前端 | React 19、Vite、TypeScript；主要交互仍集中在超大文件 `prototype-api.ts` |
| 后端 | Express、TypeScript；`server.ts` 5974 行，系统/认证/客户/线索/AI 配置共 26 个 API 已迁出并显式装配 |
| 数据 | 支持 memory 与 MySQL；`lead_outreach_requests` 记录外联幂等；生产启动禁止 memory store |
| 外部副作用 | SMTP 通过 `OutboundEmailGateway`；模型 HTTP 通过 `ModelGateway`；社交触达仍只是人工活动记录 |
| AI 边界 | OpenAI-compatible、Anthropic、Gemini 已统一传输契约；完整 Prompt/Schema 版本、用量、重试、审计仍属阶段 4 backlog |
| 测试 | `verify` 已包含七组路由/Gateway 门禁、前后端 self-test、安全、工作簿和构建 |
| API 契约 | OpenAPI 与注册路由均保持 167 个操作；跨模块租户隔离 18 |
| E2E | Playwright 37/37 |
| 安全 | `npm audit --audit-level=high` 为 0；模型 Key at-rest 加密、历史 Secret Scan 与部署凭证仍待闭环 |
| 远端 | GitHub `1060392338/goodjob` 为唯一后续交付远端；Gitee 不再操作 |

## 当前循环

**Loop L-0008：AI 配置路由与 ModelGateway 装配边界——本地 DoD 完成**

- 关联需求/任务：`REQ-GJ-ARCH-001 / TASK-GJ-0003`；阶段 4 的 `REQ-GJ-AI-001` 仍保持 backlog；
- 基线：`6194cee`；代码交付：`9160a90`；
- 设计：`ADR-0002` + `ADR-0003` + `ADR-0005` + `ADR-0007`；
- 范围：4 个 AI 配置 API 已迁出 `server.ts`，翻译/AI 搜客/官网 AI 解析复用统一 Gateway；
- Gateway：统一三协议、Trace ID、超时、SSRF 防护、错误分类和密钥脱敏；
- 租户：读取、更新、测试、删除只允许配置所有者，外租户 ID 冲突不得覆盖；
- 结构化测试：连接测试必须解析严格 JSON 且 `ok === true`；
- 外呼：专项测试全部使用 Mock/Stub，真实模型外呼为 0，未使用真实密钥；
- 回归：`test:routes`、backend self-test、security、build、`verify`、audit 全部 PASS；Playwright 37/37；
- 规模：`server.ts` 6258 → 5974，净减少 284 行；
- 状态：L-0008 切片完成；总体 `REQ-GJ-ARCH-001` 和阶段 2 继续 `in_progress`。

## 下一优先级

1. 启动 L-0009：线索来源配置与 `LeadSourceConnector` 装配边界。
2. 冻结 `providers/source-config` 4 个 API 的 URL、权限、状态码、响应、租户范围和外部副作用。
3. 先建立 Connector Mock/契约测试，覆盖未配置、认证失败、超时、限流、分页/检查点、密钥脱敏和禁止未授权真实外呼，再迁移单一切片。
4. 继续保持 API 167、租户隔离 18+、audit high 0、`verify` 和 Playwright 37/37 门禁。
5. 前端拆分、Repository/Unit of Work、完整 AI 功能和 Collaboration Adapter 分别进入后续独立循环，不在 L-0009 顺手扩展。

## 阻塞项

- GitHub 仓库当前为 Public；是否调整为 Private 需由项目负责人确认。
- GitHub Actions、历史 Secret Scan 与分支保护尚未形成远端通过证据。
- 未确认现有部署实例清单，无法证明历史默认凭证已全部失效。
- `pending` 邮件尚无运维查询/人工确认界面，当前只能拒绝相同键自动重放。
- 现有 `ai_model_configs.api_key` 仍为明文 at-rest；真实模型 Key 正式投入前需加密或外部 Secret 引用。
- 第三方线索数据厂商未指定；先实现通用 Connector 和 Mock，不阻塞接口建设。
- 钉钉、企微、飞书当前只建设统一 Adapter 与 Mock，不需要真实企业凭证。
