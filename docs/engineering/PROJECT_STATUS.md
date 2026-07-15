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
| 2 可维护架构基础 | In progress | ADR-0005~0010；后端 30 个 API 已模块化；邮件、模型、来源 Connector、首个前端领域模块和 AI 工作流编排边界已建立 | 前端剩余超大模块、Repository/Unit of Work、凭证安全、MySQL 工作流状态和剩余集成路由继续拆分 |
| 3~7 数据/AI/协作/发布 | Backlog | 阶段 3/4/5 已有前置 Connector、Gateway 与 Workflow Engine 技术验证 | 真实凭证和供应商未指定；完整来源管道、AI 功能 API/UI、协作 Adapter 与正式发布门禁未完成 |

详细阶段、验收和测试标准见 `DEVELOPMENT_PLAN.md`。

## 当前事实

| 项目 | 当前事实 |
|---|---|
| 业务基线 | 当前 GoodJob 业务功能和行为为唯一基线，不进行 MVP 式推倒重写 |
| 前端 | React 19、Vite、TypeScript；`prototype-api.ts` 11717 行；线索来源类型、选择状态和 4 个配置 API 客户端已迁入独立模块 |
| 后端 | Express、TypeScript；`server.ts` 5823 行，系统/认证/客户/线索/AI 配置/来源配置共 30 个 API 已迁出并显式装配 |
| 数据 | 支持 memory 与 MySQL；`lead_outreach_requests` 记录外联幂等；生产启动禁止 memory store；AI 工作流尚无正式 MySQL 表 |
| 外部副作用 | SMTP 通过 `OutboundEmailGateway`；模型 HTTP 通过 `ModelGateway`；来源连接测试通过 `LeadSourceConnector` |
| AI 编排 | `AiWorkflowEngine` + LangGraph.js 技术验证完成；模型只能经 ModelGateway；支持暂停/恢复、确认/驳回/重跑、权限复检、幂等模拟写入和 Trace 审计 |
| AI 持久化 | 当前仅使用 MemorySaver 技术验证；Checkpoint 不保存 API Key；跨进程/MySQL 恢复尚未实现 |
| AI 依赖 | 精确锁定 LangGraph 1.4.8、Checkpoint 1.1.3、Core 1.1.48、Zod 3.25.76，并纳入版本/完整性门禁 |
| 测试 | `verify` 已包含 AI 工作流专项测试；专项为 8 个运行、8 次 Mock 模型调用、3 次模拟写入、重复/驳回/越权额外写入 0 |
| API 契约 | OpenAPI 与注册路由均保持 167 个操作；跨模块租户隔离 18 |
| E2E | Playwright 最终 37/37；首次中断异常和处理已在 L-0011 证据留痕 |
| 安全 | `npm audit --audit-level=high` 最终为 0；模型和来源 Key at-rest 加密、历史 Secret Scan 与部署凭证仍待闭环 |
| 前端性能 | 生产主包约 1.394 MB；代码分割风险 R-008 仍未关闭 |
| 远端 | GitHub `1060392338/goodjob` 为唯一交付远端；Gitee 不再操作 |

## 当前循环

**Loop L-0011：LangGraph.js 与 AiWorkflowEngine 技术验证——本地 DoD 完成**

- 关联：`REQ-GJ-AI-ORCH-001 / TASK-GJ-0102`；实现 Commit：`356200a`；设计：ADR-0010；
- 工作流：读取权限 → Mock 评分 → 严格结构校验 → 暂停 → 采纳/驳回/重跑 → 权限复检 → 幂等模拟写入 → 审计；
- 安全：ModelGateway 是唯一模型入口；配置 Key 不进入 Snapshot、审计或 Checkpoint；真实模型外呼 0；
- 幂等：顺序和并发重复确认额外写入均为 0；
- 恢复：共享 MemorySaver 时，新 Engine 实例可恢复暂停运行；不宣称 MySQL/跨进程恢复完成；
- 回归：`verify` PASS、API 167、tenant isolation 18、audit 0、Playwright 37/37；
- 证据：`evidence/L-0011-ai-workflow-engine.md`。

## 下一循环建议

**L-0012：模型/来源凭证 SecretVault 边界与迁移策略**

1. 登记独立 REQ/TASK/ADR，冻结 KMS/信封加密或外部 Secret 引用方案；
2. 先覆盖模型与来源 Key 的写入、读取、掩码、轮换、吊销和旧明文迁移；
3. 日志、错误、备份、导出和审计不得出现明文 Key；
4. 只使用测试密钥和 Mock Vault，不接真实云 KMS 或供应商凭证；
5. 迁移/回滚、双读/双写窗口、启动门禁和损坏密文处理必须可测试；
6. R-012/R-013 未满足前，不把 AiWorkflowEngine 接入真实模型评分；
7. SecretVault 边界稳定后，再进入线索评分预览/确认 API 与前端体验。

## 阻塞与持续风险

- GitHub 仓库当前为 Public；是否调整为 Private 需由项目负责人确认。
- GitHub Actions、历史 Secret Scan 与分支保护尚未形成远端通过证据。
- 未确认现有部署实例清单，无法证明历史默认凭证已全部失效。
- `pending` 邮件尚无运维查询/人工确认界面。
- R-012/R-013：模型与来源 API Key 明文 at-rest，真实 Key 禁止投入。
- R-014：正式工作流 MySQL 表、事务、并发、崩溃恢复和版本迁移未实现。
- 第三方线索数据厂商未指定；完整供应商验收无法开始。
- 钉钉、企微、飞书当前只保留统一 Adapter 入口与 Mock 计划。
