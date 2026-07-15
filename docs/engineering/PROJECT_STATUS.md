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

**Loop L-0014：AI 工作流 MySQL 持久化、恢复与并发幂等——本地 DoD 完成**

- 关联：`REQ-GJ-AI-PERSIST-001 / TASK-GJ-0103`；实现 Commit：`9ab50b1`；设计：ADR-0013；
- 状态：6 张 `ai_workflow_*` 表，LangGraph Checkpointer、run、审批、Effect 与审计均可持久化；
- 恢复：第二个 Engine 实例可恢复暂停工作流，重复 start 不重复调用模型；
- 并发：同一 run/attempt 唯一决策，并发 Effect 使用稳定键和租约恢复；
- 安全：actor/tenant 校验、Effect 前权限复检、所有持久化面 Secret 拒绝；
- 回归：`verify` PASS、API 167、tenant isolation 18、audit 0、Playwright 37/37；
- 外呼：真实 MySQL、模型、协作平台调用均为 0；
- 限制：R-014 仍需真实 MySQL 迁移、锁等待、断连和备份恢复演练；
- 证据：`evidence/L-0014-ai-workflow-mysql-persistence.md`。

## 下一循环

**L-0015：前端模块化、动态导入、路由分包和主包性能门禁**

1. 冻结当前 1,394.14 kB / gzip 444.16 kB bundle 基线；
2. Test-first 建立可重复的 bundle budget 与路由 chunk 断言；
3. 按页面/领域动态导入，不改变现有 URL、权限和业务行为；
4. 将工作簿和导出等重依赖移出首屏路径；
5. 保持 API 167、tenant isolation 18、E2E 37/37 和 audit 0。
## 阻塞与持续风险

- GitHub 仓库当前为 Public；是否调整为 Private 需由项目负责人确认。
- GitHub Actions、历史 Secret Scan 与分支保护尚未形成远端通过证据。
- 未确认现有部署实例清单，无法证明历史默认凭证已全部失效。
- `pending` 邮件尚无运维查询/人工确认界面。
- R-012/R-013：代码和本地门禁已完成；真实部署仍需数据库备份/恢复、迁移状态和密钥托管验证，验证前继续禁止真实 Key。
- R-005：线索外联已迁移，但其他领域仍可能通过旧 `persistAll` 产生全量覆盖风险。
- R-014：MySQL 契约已实现；真实 MySQL 迁移、锁等待、断连、版本迁移和备份恢复演练未完成。
- 第三方线索数据厂商未指定；完整供应商验收无法开始。
- 钉钉、企微、飞书当前只保留统一 Adapter 入口与 Mock 计划。

## 阶段 2 当前增量：L-0014

- 已完成 AI 工作流 MySQL checkpoint、run、审批、Effect 与审计持久化，Commit `9ab50b1`。
- 验收：6 表、跨实例恢复、并发 Effect 唯一、决策冲突失败关闭、权限复检、Secret 拒绝、API 167、tenant 18、E2E 37/37、audit 0。
- R-014 保持 Mitigating：真实 MySQL 迁移、锁等待、断连和备份恢复演练未完成。
- 当前切片 L-0015：前端模块化、动态导入、路由分包和主包性能门禁；随后 L-0016 阶段 2 收口。
