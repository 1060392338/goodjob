# 项目实施状态

更新时间：2026-07-15
当前分支：`codex/phase-3-lead-pipeline`
当前阶段：阶段 3——获客数据管道
整体状态：L-0017 已完成，L-0018 进行中

## 阶段门禁概览

| 阶段 | 状态 | 已有证据 | 未完成门禁 |
|---|---|---|---|
| 0 接管与安全基线 | Verification | Harness、生产配置门禁、工作簿安全、audit 0、E2E 37/37 | GitHub 历史扫描、Linux/Node 22 Actions、部署凭证轮换确认 |
| 1 业务行为基线 | Baseline established | 后端 self-test、security test、167 个 API 操作、37 条 E2E | 远端 CI 固化；持续维护角色/API 矩阵 |
| 2 可维护架构基础 | Accepted with carry-over | ADR-0005~0015；机器追踪门禁；后端 30 个 API 模块化；Gateway/Connector、SecretVault、线索外联 Repository/Unit of Work、AI 工作流持久化、前端懒加载与 Bundle Budget | 其他 Store Repository、剩余超大模块、真实 MySQL/部署/CI 演练已显式转入阶段 3/4/7，不作为本阶段完成项 |
| 3 获客数据管道 | In progress | L-0017 已完成统一规范化、稳定键、逐记录血缘、幂等 Sink 和检查点恢复基础 | CSV/Excel、网页/搜索、第三方 API Connector 尚待实现；真实供应商验收需凭证 |
| 4~7 AI/协作/发布 | Backlog | ModelGateway、LangGraph Workflow Engine、持久化与统一 Adapter 设计已具备前置基础 | AI 功能 API/UI、三平台 Adapter 与正式发布门禁未完成 |

详细阶段、验收和测试标准见 `DEVELOPMENT_PLAN.md`。

## 当前事实

| 项目 | 当前事实 |
|---|---|
| 业务基线 | 当前 GoodJob 业务功能和行为为唯一基线，不进行 MVP 式推倒重写 |
| 前端 | React 19、Vite、TypeScript；`prototype-api.ts` 11717 行；线索来源类型、选择状态和 4 个配置 API 客户端已迁入独立模块 |
| 后端 | Express、TypeScript；`server.ts` 5823 行，系统/认证/客户/线索/AI 配置/来源配置共 30 个 API 已迁出并显式装配 |
| 数据 | 支持 memory 与 MySQL；线索外联已通过 Repository/Unit of Work 按行持久化；AI 工作流具备 6 张 MySQL 状态表和跨实例恢复契约；其他领域仍保留旧 `persistAll` |
| 外部副作用 | SMTP 通过 `OutboundEmailGateway`；模型 HTTP 通过 `ModelGateway`；来源连接测试通过 `LeadSourceConnector` |
| 凭证安全 | `SecretVault` 使用 AES-256-GCM 和 Owner/Team/记录上下文绑定；模型与来源 Key 只以 `gjsec:v1` 密文落库；支持检查点迁移、轮换、吊销和损坏密文启动拒绝 |
| AI 编排 | `AiWorkflowEngine` + LangGraph.js 技术验证完成；模型只能经 ModelGateway；支持暂停/恢复、确认/驳回/重跑、权限复检、幂等模拟写入和 Trace 审计 |
| AI 持久化 | MySQL Checkpointer、run、审批、Effect 和审计持久化已完成 Fake Pool 契约；跨实例恢复、并发决策、幂等和 Secret 拒绝通过，真实 MySQL 演练未完成 |
| AI 依赖 | 精确锁定 LangGraph 1.4.8、Checkpoint 1.1.3、Core 1.1.48、Zod 3.25.76，并纳入版本/完整性门禁 |
| 测试 | `verify` 已包含 AI 工作流、SecretVault 与线索外联 Repository 契约测试；Repository 验证 21 条按行 SQL、commit/rollback、租户条件与全量快照写入为 0 |
| API 契约 | OpenAPI 与注册路由均保持 167 个操作；跨模块租户隔离 18 |
| E2E | Playwright 37/37 |
| 安全 | `npm audit --audit-level=high` 为 0；R-012/R-013 本地实现进入部署验证，历史 Secret Scan 与部署凭证仍待闭环 |
| 前端性能 | 入口 1.90 kB，核心原型 389.65 kB；XLSX/ECharts/ZRender 已懒加载；384 kB HTML 与页面控制器拆分仍在 R-004/R-008 |
| 远端 | GitHub `1060392338/goodjob` 为唯一交付远端；Gitee 不再操作 |

## 当前循环

**Loop L-0018：CSV/Excel Connector 接入统一管道——进行中**

- 关联：`REQ-GJ-LEAD-001 / TASK-GJ-0201`；
- L-0017 已以 Commit `308cb67` 完成统一管道基础，专项、`verify`、audit 0 和 E2E 37/37 全部通过；
- 范围：CSV/XLSX/XLS 安全解析、版本化字段映射、文件/批次/行血缘、逐行错误报告、幂等与检查点恢复；
- 边界：复用现有工作簿安全解析边界，不接真实供应商、不使用真实凭证、不新增真实网络调用；
- 后续：L-0019 网页/搜索、L-0020 第三方 API、L-0021 阶段验收。

## 下一循环

**L-0019：公开网页/搜索 Connector 安全执行边界**

仅在 L-0018 的格式兼容、安全限制、字段映射、血缘、部分失败与恢复门禁通过后进入。

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

## 阶段 2 收口结论

- L-0014：AI 工作流 MySQL checkpoint、run、审批、Effect 与审计持久化，Commit `9ab50b1`；R-014 保持 Mitigating。
- L-0015：入口、核心原型、工作簿和图表重依赖分包及 Bundle Budget，Commit `1509f64`；R-008 保持 Mitigating。
- L-0016：机器可验证追踪门禁和阶段验收，Commit `cddd97f`；阶段 2 Accepted with carry-over。
- 转移项继续保留原风险状态和发布门禁，不因阶段收口自动关闭。
