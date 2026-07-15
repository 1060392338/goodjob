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
| 2 可维护架构基础 | In progress | ADR-0005~0011；后端 30 个 API 已模块化；邮件、模型、来源 Connector、首个前端领域模块、AI 工作流边界和 SecretVault 已建立 | Repository/Unit of Work、MySQL 工作流状态、前端剩余超大模块和剩余集成路由继续拆分 |
| 3~7 数据/AI/协作/发布 | Backlog | 阶段 3/4/5 已有前置 Connector、Gateway、Workflow Engine 与凭证安全边界 | 真实凭证和供应商未指定；完整来源管道、AI 功能 API/UI、协作 Adapter 与正式发布门禁未完成 |

详细阶段、验收和测试标准见 `DEVELOPMENT_PLAN.md`。

## 当前事实

| 项目 | 当前事实 |
|---|---|
| 业务基线 | 当前 GoodJob 业务功能和行为为唯一基线，不进行 MVP 式推倒重写 |
| 前端 | React 19、Vite、TypeScript；`prototype-api.ts` 11717 行；线索来源类型、选择状态和 4 个配置 API 客户端已迁入独立模块 |
| 后端 | Express、TypeScript；`server.ts` 5823 行，系统/认证/客户/线索/AI 配置/来源配置共 30 个 API 已迁出并显式装配 |
| 数据 | 支持 memory 与 MySQL；`lead_outreach_requests` 记录外联幂等；生产启动禁止 memory store；AI 工作流尚无正式 MySQL 表 |
| 外部副作用 | SMTP 通过 `OutboundEmailGateway`；模型 HTTP 通过 `ModelGateway`；来源连接测试通过 `LeadSourceConnector` |
| 凭证安全 | `SecretVault` 使用 AES-256-GCM 和 Owner/Team/记录上下文绑定；模型与来源 Key 只以 `gjsec:v1` 密文落库；支持检查点迁移、轮换、吊销和损坏密文启动拒绝 |
| AI 编排 | `AiWorkflowEngine` + LangGraph.js 技术验证完成；模型只能经 ModelGateway；支持暂停/恢复、确认/驳回/重跑、权限复检、幂等模拟写入和 Trace 审计 |
| AI 持久化 | 当前仅使用 MemorySaver 技术验证；Checkpoint 不保存 API Key；跨进程/MySQL 恢复尚未实现 |
| AI 依赖 | 精确锁定 LangGraph 1.4.8、Checkpoint 1.1.3、Core 1.1.48、Zod 3.25.76，并纳入版本/完整性门禁 |
| 测试 | `verify` 已包含 AI 工作流与 SecretVault 专项测试；Vault 覆盖加密、上下文隔离、篡改、迁移、轮换、吊销、掩码和生产门禁 |
| API 契约 | OpenAPI 与注册路由均保持 167 个操作；跨模块租户隔离 18 |
| E2E | Playwright 37/37 |
| 安全 | `npm audit --audit-level=high` 为 0；R-012/R-013 本地实现进入部署验证，历史 Secret Scan 与部署凭证仍待闭环 |
| 前端性能 | 生产主包约 1.394 MB；代码分割风险 R-008 仍未关闭 |
| 远端 | GitHub `1060392338/goodjob` 为唯一交付远端；Gitee 不再操作 |

## 当前循环

**Loop L-0012：模型/来源凭证 SecretVault 边界与迁移——本地 DoD 完成**

- 关联：`REQ-GJ-SEC-003 / TASK-GJ-0006`；实现 Commit：`a3e2dcc`；设计：ADR-0011；
- 加密：AES-256-GCM、随机 IV、AAD 绑定凭证类型/记录/Owner/Team；
- 持久化：模型和来源 Key 在 MySQL 只写入 `gjsec:v1` 密文，运行时解密，公开 API 统一掩码；
- 迁移：100 条批次、表/记录检查点、失败分类、失败恢复、并发迁移锁和条件更新；
- 轮换/吊销：主 Key 自动重加密，旧 Key 仅用于过渡解密，未知 Key 或损坏密文拒绝启动；
- 回归：`verify` PASS、API 167、tenant isolation 18、audit 0、Playwright 37/37；
- 外呼：真实模型、来源和云 KMS 外呼均为 0；
- 证据：`evidence/L-0012-secret-vault.md`。

## 下一循环

**L-0013：Repository / Unit of Work 与 MySQL 增量持久化边界**

1. 先选择单一低耦合领域建立 Repository 契约，不一次性重写全 Store；
2. 建立事务边界、按行增量写入、乐观并发或唯一约束和失败回滚；
3. memory/MySQL 契约测试必须使用同一测试集；
4. 路由与领域服务不得直接依赖 MySQL 驱动；
5. 保持 API 167、tenant isolation 18、E2E 37/37 和 audit 0；
6. 完成后再进入 AI 工作流 MySQL 状态持久化。

## 阻塞与持续风险

- GitHub 仓库当前为 Public；是否调整为 Private 需由项目负责人确认。
- GitHub Actions、历史 Secret Scan 与分支保护尚未形成远端通过证据。
- 未确认现有部署实例清单，无法证明历史默认凭证已全部失效。
- `pending` 邮件尚无运维查询/人工确认界面。
- R-012/R-013：代码和本地门禁已完成；真实部署仍需数据库备份/恢复、迁移状态和密钥托管验证，验证前继续禁止真实 Key。
- R-014：正式工作流 MySQL 表、事务、并发、崩溃恢复和版本迁移未实现。
- 第三方线索数据厂商未指定；完整供应商验收无法开始。
- 钉钉、企微、飞书当前只保留统一 Adapter 入口与 Mock 计划。
