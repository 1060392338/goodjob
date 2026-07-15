# 项目实施状态

更新时间：2026-07-15
当前分支：`codex/phase-3-lead-pipeline`
当前阶段：阶段 3——获客数据管道
整体状态：L-0017~L-0020 已完成，L-0021 阶段 3 全量验收与回顾待执行

## 阶段门禁概览

| 阶段 | 状态 | 已有证据 | 未完成门禁 |
|---|---|---|---|
| 0 接管与安全基线 | Verification | Harness、生产配置门禁、工作簿安全、audit 0、E2E 37/37 | GitHub 历史扫描、Linux/Node 22 Actions、部署凭证轮换确认 |
| 1 业务行为基线 | Baseline established | 后端 self-test、security test、167 个 API 操作、37 条 E2E | 远端 CI 固化；持续维护角色/API 矩阵 |
| 2 可维护架构基础 | Accepted with carry-over | ADR-0005~0015；机器追踪门禁；后端模块化、Gateway/Connector、SecretVault、Repository/UoW、AI 工作流持久化、前端懒加载 | 其他 Store Repository、剩余超大模块、真实 MySQL/部署/CI 演练继续转移 |
| 3 获客数据管道 | Acceptance pending | L-0017 统一管道、L-0018 文件、L-0019 Web、L-0020 API Provider 均完成并通过各自专项和完整本地门禁 | L-0021 跨 Connector 全量验收、追踪复核和阶段回顾；真实外部验证显式 Deferred |
| 4~7 AI/协作/发布 | Backlog | ModelGateway、LangGraph Workflow Engine、持久化与统一 Adapter 设计已具备前置基础 | AI 功能 API/UI、三平台 Adapter 与正式发布门禁未完成 |

详细阶段、验收和测试标准见 `DEVELOPMENT_PLAN.md`。

## 当前事实

| 项目 | 当前事实 |
|---|---|
| 业务基线 | 当前 GoodJob 业务功能和行为为唯一基线，不进行 MVP 式推倒重写 |
| 前端 | React 19、Vite、TypeScript；首个线索来源领域模块已拆分，Playwright 37/37 |
| 后端 | Express、TypeScript；OpenAPI 保持 167 个操作，跨模块租户隔离 18 |
| 数据 | memory/MySQL；线索外联 Repository/UoW 与 AI 工作流 6 张 MySQL 状态表已有契约，真实 MySQL 演练未完成 |
| 获客管道 | 统一 `LeadIngestionConnector` 管道，CSV/XLSX/XLS、公开网页/搜索、第三方 API Provider 三类接入边界已实现 |
| 外部副作用 | SMTP 经 `OutboundEmailGateway`；模型经 `ModelGateway`；来源经 Connector/Provider 边界；Mock 验收真实外呼 0 |
| 凭证安全 | `SecretVault` 与 credential handle 边界；L-0020 credential leaks 0，真实凭证未接入 |
| AI 编排 | `AiWorkflowEngine` + LangGraph.js 基础完成，但阶段 4 AI 获客功能尚未验收 |
| 测试 | `verify` 包含 Pipeline、三类 Connector、AI workflow、SecretVault、Repository、前后端和安全门禁 |
| 安全 | dependency audit 0；R-006/R-013/R-015 仍有真实环境验证项 |
| 远端 | GitHub `1060392338/goodjob` 为唯一交付远端；禁止操作 Gitee |

## 最近完成循环

**L-0020：第三方 API Provider 插件边界——已完成**

- 关联：`REQ-GJ-LEAD-001 / TASK-GJ-0201`；ADR-0019；Test-first `33e508c`；实现 `c361a26`；
- Registry、Provider 版本、Mapper、credential handle、分页/cursor、Retry-After、指数退避、请求预算、错误分类、checkpoint 和血缘已通过；
- 专项 PASS：Provider plugins 1、pages 2、lineage fields 6、error classifications 10、duplicate writes 0、credential leaks 0、真实外呼 0；
- 完整门禁 PASS：repository security 173、REQ/TASK 16/16、API 167、tenant 18、audit 0、E2E 37/37；
- Evidence：`docs/engineering/evidence/L-0020-third-party-api-provider-boundary.md`。

## 当前循环

**L-0021：阶段 3 全量验收与回顾——Ready**

- 对 L-0017~L-0020 进行跨 Connector 复核，而不是新增供应商功能；
- 复跑统一 Pipeline、文件、Web、API 四组专项和完整门禁；
- 审计 REQ/TASK/ADR/Commit/Test/Evidence/风险/回滚/交接；
- 明确真实客户文件、真实网页许可/网络、真实供应商、真实凭证和真实数据库为 Deferred；
- 执行清单：`docs/engineering/evidence/L-0021-phase-3-acceptance.md`。

## 最新会话检查点

- L-0020 Test-first Commit：`33e508c`；实现 Commit：`c361a26`。
- 专项、build、实现收口 `verify`、audit 和 E2E 均 PASS；文档暂存后再次 `verify` PASS，repository security 174、currentIteration L-0021；`git diff --check` PASS。
- 首次 `verify` 曾随机命中 Fetch 禁用端口导致一次 `bad port`，未修改代码复跑 PASS；若 L-0021 再现，应登记并修复测试稳定性缺陷。
- 生产 schema、公开 API、真实 Provider、真实凭证、真实网络调用和真实客户数据变化均为 0。
- 精确续作顺序见 `HANDOFF.md`；聊天记录不作为恢复前提。

## 阻塞与持续风险

- GitHub 仓库当前为 Public；是否调整为 Private 需项目负责人确认。
- GitHub Actions、历史 Secret Scan 与分支保护尚未形成远端通过证据。
- R-006：真实网页许可、真实网络和阶段 4 Prompt 注入红队未验证。
- R-013：真实部署密钥治理、备份恢复和供应商额度告警未验证。
- R-015：真实客户数据回放与真实供应商验收未执行。
- 其他领域仍可能通过旧 `persistAll` 产生全量覆盖风险；真实 MySQL 演练未完成。
- 钉钉、企微、飞书当前只保留统一 Adapter 入口与 Mock 计划。
