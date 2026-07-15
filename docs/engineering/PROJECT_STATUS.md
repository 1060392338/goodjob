# 项目实施状态

更新时间：2026-07-15
当前分支：`codex/phase-3-lead-pipeline`
当前阶段：阶段 4 准备——AI 获客闭环
当前 Loop：`L-0022`（Ready，尚未开始实现）
整体状态：阶段 3 已完成，结论为 Accepted with explicit deferred external validation

## 阶段门禁概览

| 阶段 | 状态 | 已有证据 | 未完成门禁 |
|---|---|---|---|
| 0 接管与安全基线 | Verification | Harness、生产配置门禁、工作簿安全、audit 0、E2E 37/37 | GitHub 历史扫描、Linux/Node 22 Actions、部署凭证轮换确认 |
| 1 业务行为基线 | Baseline established | self-test、security、167 个 API 操作、37 条 E2E | 远端 CI 固化；持续维护角色/API 矩阵 |
| 2 可维护架构基础 | Accepted with carry-over | 模块化、Gateway/Connector、SecretVault、Repository/UoW、LangGraph 持久化、前端懒加载 | 剩余 Store/超大模块、真实 MySQL/部署/CI 演练继续转移 |
| 3 获客数据管道 | Accepted with explicit deferred external validation | L-0017~L-0021；统一 Pipeline；文件/Web/API 三类 Connector；机器验收门禁；专项、verify、audit、E2E | 真实客户文件、网页许可/网络、供应商/凭证、数据库演练 Deferred |
| 4 AI 获客闭环 | Ready | ModelGateway、LangGraph Workflow、SecretVault、阶段 3 血缘/检查点基础 | L-0022 Test-first、金标数据集、Prompt/Schema 版本、AI 功能 API/UI 尚未开始 |
| 5~7 助手/协作/发布 | Backlog | 统一 Adapter 与前置架构边界 | 全局助手、钉钉/企微/飞书实现、正式发布门禁 |

## 阶段 3 验收事实

- REQ/TASK：`REQ-GJ-LEAD-001 / TASK-GJ-0201`，状态 Done；
- ADR：ADR-0016~ADR-0020；
- Test-first：L-0017~L-0021 均保留真实 Red/契约证据；L-0021 Test-first Commit `789a0e4`；
- 统一契约：File、Web、API 三类 Connector 均实现 `LeadIngestionConnector`；
- 专项：四组 PASS；故障恢复成功；duplicate writes 0；credential leaks 0；真实外呼 0；
- 完整门禁：`verify` PASS、dependency audit 0 vulnerabilities、E2E 37/37、diff check PASS；
- Evidence：`docs/engineering/evidence/L-0021-phase-3-acceptance.md`。

## 当前事实

| 项目 | 当前事实 |
|---|---|
| 业务基线 | GoodJob 现有业务功能和行为仍是唯一基线，没有 MVP 式推倒重写 |
| 前端 | React 19、Vite、TypeScript；Playwright 37/37 |
| 后端 | Express、TypeScript；OpenAPI 167；跨模块租户隔离 18 |
| 获客管道 | 统一规范化、稳定键、逐记录血缘、checkpoint、恢复和幂等；CSV/XLSX/XLS、Web、API Provider 三类来源 |
| 外部副作用 | 模型、邮件、来源均通过 Gateway/Connector 边界；阶段 3 Mock 验收真实外呼 0 |
| 凭证安全 | SecretVault 与 credential handle；阶段 3 credential leaks 0；真实凭证未接入 |
| AI 基础 | ModelGateway、LangGraph Workflow 和持久化边界已具备；AI 获客业务功能尚未开始 |
| 远端 | GitHub `1060392338/goodjob` 为唯一交付远端；禁止操作 Gitee |

## 下一循环

**L-0022：AI 线索清洗、补全、去重与 ICP 评分——Ready**

先建立业务契约、金标数据集边界、Prompt/Schema 版本、结构化输出失败隔离、人工采纳/驳回/重跑和成本/模型记录。真实模型供应商、真实凭证和生产调用必须暂停确认；Mock/契约和本地金标评测可继续。

## 持续风险

- R-006 Open：真实网页许可/网络与阶段 4 Prompt 注入红队待验证；
- R-013 Verification：真实部署密钥治理、备份恢复和供应商额度告警待验证；
- R-015 Mitigating：真实客户数据回放和真实供应商验收待验证；
- GitHub Actions、历史 Secret Scan、分支保护、真实 MySQL 和部署演练仍缺外部证据；
- 钉钉、企微、飞书仅保留统一 Adapter 入口与 Mock 计划。
