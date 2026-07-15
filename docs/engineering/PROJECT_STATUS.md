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
| 2 可维护架构基础 | In progress | ADR-0005~0012；后端 30 个 API 已模块化；邮件、模型、来源 Connector、首个前端领域模块、AI 工作流边界、SecretVault 与线索外联 Repository/Unit of Work 已建立 | MySQL 工作流状态、前端剩余超大模块和剩余集成路由继续拆分 |
| 3~7 数据/AI/协作/发布 | Backlog | 阶段 3/4/5 已有前置 Connector、Gateway、Workflow Engine 与凭证安全边界 | 真实凭证和供应商未指定；完整来源管道、AI 功能 API/UI、协作 Adapter 与正式发布门禁未完成 |

详细阶段、验收和测试标准见 `DEVELOPMENT_PLAN.md`。

## 当前事实

| 项目 | 当前事实 |
|---|---|
| 业务基线 | 当前 GoodJob 业务功能和行为为唯一基线，不进行 MVP 式推倒重写 |
| 前端 | React 19、Vite、TypeScript；`prototype-api.ts` 11717 行；线索来源类型、选择状态和 4 个配置 API 客户端已迁入独立模块 |
| 后端 | Express、TypeScript；`server.ts` 5823 行，系统/认证/客户/线索/AI 配置/来源配置共 30 个 API 已迁出并显式装配 |
| 数据 | 支持 memory 与 MySQL；线索外联已通过 Repository/Unit of Work 按行持久化，`lead_outreach_requests` 已退出快照替换；其他领域仍保留旧 `persistAll`；AI 工作流尚无正式 MySQL 表 |
| 外部副作用 | SMTP 通过 `OutboundEmailGateway`；模型 HTTP 通过 `ModelGateway`；来源连接测试通过 `LeadSourceConnector` |
| 凭证安全 | `SecretVault` 使用 AES-256-GCM 和 Owner/Team/记录上下文绑定；模型与来源 Key 只以 `gjsec:v1` 密文落库；支持检查点迁移、轮换、吊销和损坏密文启动拒绝 |
| AI 编排 | `AiWorkflowEngine` + LangGraph.js 技术验证完成；模型只能经 ModelGateway；支持暂停/恢复、确认/驳回/重跑、权限复检、幂等模拟写入和 Trace 审计 |
| AI 持久化 | 当前仅使用 MemorySaver 技术验证；Checkpoint 不保存 API Key；跨进程/MySQL 恢复尚未实现 |
| AI 依赖 | 精确锁定 LangGraph 1.4.8、Checkpoint 1.1.3、Core 1.1.48、Zod 3.25.76，并纳入版本/完整性门禁 |
| 测试 | `verify` 已包含 AI 工作流、SecretVault 与线索外联 Repository 契约测试；Repository 验证 21 条按行 SQL、commit/rollback、租户条件与全量快照写入为 0 |
| API 契约 | OpenAPI 与注册路由均保持 167 个操作；跨模块租户隔离 18 |
| E2E | Playwright 37/37 |
| 安全 | `npm audit --audit-level=high` 为 0；R-012/R-013 本地实现进入部署验证，历史 Secret Scan 与部署凭证仍待闭环 |
| 前端性能 | 生产主包约 1.394 MB；代码分割风险 R-008 仍未关闭 |
| 远端 | GitHub `1060392338/goodjob` 为唯一交付远端；Gitee 不再操作 |

## 当前循环

**Loop L-0013：Repository / Unit of Work 与线索外联增量持久化——本地 DoD 完成**

- 关联：`REQ-GJ-ARCH-002 / TASK-GJ-0007`；实现 Commit：`a70359b`；设计：ADR-0012；
- 契约：Memory/MySQL Adapter 使用同一测试集；
- 事务：MySQL commit 2、rollback 2、连接始终 release；
- 增量：专项测试记录 21 条按行 SQL，外联路由全量快照写入 0；
- 并发：唯一键竞争回读，pending 条件更新，Owner/Team 租户条件；
- 回归：`verify` PASS、API 167、tenant isolation 18、audit 0、Playwright 37/37；
- 外呼：真实 MySQL、SMTP、模型调用均为 0；
- 限制：R-005 仅部分缓解，其他旧领域仍使用 `persistAll`；
- 证据：`evidence/L-0013-repository-unit-of-work.md`。

## 下一循环

**L-0014：AI 工作流 MySQL 状态、恢复与并发幂等**

1. 新增正式持久化端口和 MySQL Schema/迁移，不使用 MemorySaver 作为正式存储；
2. 保存运行、审批、Effect、审计与 checkpoint，禁止 Secret 进入状态；
3. 验证跨进程恢复、崩溃恢复、版本兼容和发起人/权限复检；
4. 并发确认、重放和重试最多执行一次业务 Effect；
5. 继续使用 Mock ModelGateway，不接真实模型、生产凭证或生产数据库；
6. 保持 API 167、tenant isolation 18、E2E 37/37 和 audit 0。

## 阻塞与持续风险

- GitHub 仓库当前为 Public；是否调整为 Private 需由项目负责人确认。
- GitHub Actions、历史 Secret Scan 与分支保护尚未形成远端通过证据。
- 未确认现有部署实例清单，无法证明历史默认凭证已全部失效。
- `pending` 邮件尚无运维查询/人工确认界面。
- R-012/R-013：代码和本地门禁已完成；真实部署仍需数据库备份/恢复、迁移状态和密钥托管验证，验证前继续禁止真实 Key。
- R-005：线索外联已迁移，但其他领域仍可能通过旧 `persistAll` 产生全量覆盖风险。
- R-014：正式工作流 MySQL 表、事务、并发、崩溃恢复和版本迁移未实现。
- 第三方线索数据厂商未指定；完整供应商验收无法开始。
- 钉钉、企微、飞书当前只保留统一 Adapter 入口与 Mock 计划。
