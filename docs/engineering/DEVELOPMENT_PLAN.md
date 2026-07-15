# GoodJob 正式开发阶段计划

更新时间：2026-07-15

本计划以 GoodJob 现有代码和业务行为为唯一基线，不采用“先做一个不可维护 MVP、以后再重写”的方式。每个阶段都以可运行代码、自动测试、追踪矩阵、ADR、证据和回顾作为交付物。

## 通用阶段门禁

每个阶段必须完成以下证据链：

```text
业务目标 → REQ/NFR → ADR/设计 → TASK/Loop → Commit/PR
       → 单元/集成/安全/E2E → 验收记录 → 风险处置 → 回顾/交接
```

阶段验收规则：

1. P0/P1 需求有明确可测试验收条件；
2. 代码、数据/API 变化和回滚方案已记录；
3. `npm run verify` 与风险匹配的专项测试通过；
4. Critical/High 安全问题为 0，或有审批后的阻塞/接受记录；
5. `FEATURES.json`、`TRACEABILITY.md`、`PROJECT_STATUS.md`、`RISK_REGISTER.md`、证据和交接一致；
6. 远端可用后，Commit、PR、CI Artifact 和 Release Tag 可互相反查。

## 分阶段路线

| 阶段 | 目标与主要工作 | 阶段验收 | 核心测试标准 | 可追溯交付物 |
|---|---|---|---|---|
| 0. 接管与安全基线 | 克隆原始基线；工程 Harness；默认凭证、生产配置、依赖与文件安全 | 本地统一门禁通过；高危依赖为 0；不安全生产配置拒绝启动 | repo security、dependency audit、security、E2E 100% | ADR-0001/0004、L-0001~0003 证据、风险 R-001~R-010 |
| 1. 业务基线与领域清点 | 冻结现有 URL/角色/数据范围；建立客户、线索、商机、任务、导入导出契约清单 | 关键业务流程和 167 个 API 操作均可回归；未确认业务变化为 0 | self-test、security、OpenAPI 操作数、Playwright P0 | 功能台账、API/角色矩阵、业务基线证据 |
| 2. 可维护架构基础 | 渐进拆分后端路由与前端超大模块；建立领域服务、Repository、Gateway/Connector/Adapter 边界 | 认证、客户、线索、AI、集成按模块装配；公共文件规模持续下降；行为不回归 | 模块单元/集成、API regression、security、E2E | ADR-0005、每批迁移 Loop 证据、模块责任图 |
| 3. 获客数据管道 | CSV/Excel、公开网页/搜索、第三方 API 统一接入；标准化、血缘、去重、检查点和幂等 | 三类 Connector 通过统一契约；每条线索来源可反查；失败可重试/续跑 | connector contract、idempotency、checkpoint、SSRF/限流 | Connector ADR、数据字典、血缘字段、供应商评估 |
| 4. AI 获客闭环 | OpenAI-compatible Model Gateway；线索清洗、补全、去重、ICP 评分、下一步建议 | 模型可替换；结构化输出和失败降级可靠；AI 结果可采纳/驳回/重跑 | gateway contract、fault injection、golden eval、prompt injection | Prompt/Schema 版本、模型与成本记录、Eval 报告 |
| 5. 全局 AI 助手 | 跨模块只读问答与受控写操作；预览、确认、权限复检、幂等和审计 | 未确认写入为 0；重复确认不重复执行；越权查询/写入为 0 | permission matrix、confirmation、idempotency、audit completeness | Tool Catalog、执行审计、确认协议 ADR、红队记录 |
| 6. 协作平台适配 | 预留并实现钉钉、企微、飞书统一 Adapter；身份、消息、待办、审批、通讯录、Webhook | 三平台 Mock 通过同一契约；未配置不外呼；替换平台不改领域逻辑 | adapter contract、webhook signature、replay、idempotency | ADR-0003、Adapter 契约、配置/运维说明 |
| 7. 正式发布与运营 | MySQL 演进、迁移/回滚、性能、可观测性、备份恢复、权限审计、发布流程 | SLO、容量、恢复目标和发布门禁达标；演练可复现 | load/soak、backup restore、migration rollback、security scan | Runbook、发布清单、Release Notes、复盘与指标看板 |

## 当前执行位置

- 阶段 0 的本地代码门禁已完成；远端 GitHub 历史扫描、Actions 和部署凭证轮换仍在验证。
- 阶段 1 已由现有 self-test、security test、167 个 OpenAPI 操作和 37 条 E2E 建立首版行为基线。
- 阶段 2 已于 L-0016 完成范围验收：后端 30 个 API、外部 Gateway/Connector、首个前端领域模块、SecretVault、线索外联 Repository/Unit of Work、LangGraph 工作流持久化和前端动态分包均有独立证据。验收结论为 Accepted with carry-over；剩余超大模块、全 Store 迁移、真实 MySQL/部署/CI 演练没有混报完成。下一执行位置为阶段 3。`REQ-GJ-AI-ORCH-001 / TASK-GJ-0102` 只形成阶段 4/5 前置边界，不代表 AI 功能阶段已完成。

## 变更控制

- 新需求先登记，再进入 Loop；禁止边写边扩大范围。
- API、数据模型、安全边界和外部契约变更前必须有 ADR。
- AI 和外部平台在 Mock/契约测试未通过前不得接真实密钥。
- 部署平台尚未选定，不阻塞模块与契约开发，但生产发布阶段必须补齐部署 ADR。

## 阶段 2 验收结论：L-0013~L-0016

- L-0013：线索外联 Repository/Unit of Work 增量持久化，Commit `a70359b`。
- L-0014：LangGraph MySQL Checkpointer、运行/审批/Effect/审计持久化，Commit `9ab50b1`。
- L-0015：入口与重依赖动态分包、manifest 和 Bundle Budget，Commit `1509f64`。
- L-0016：机器可验证追踪门禁、全量回归、风险复核和阶段回顾，Commit `cddd97f`。
- 阶段结论：Accepted with carry-over。R-004/R-005/R-008/R-011/R-012/R-013/R-014 继续按登记状态跟踪，Critical 风险未部署验证前禁止正式发布。

## 阶段 3 建议切片

| Loop | 小阶段 | 核心验收 |
|---|---|---|
| L-0017 | 统一获客管道领域模型、规范化、血缘、去重和检查点契约 | 同一输入重复执行不新增重复线索；来源与原始记录可反查；失败可从检查点恢复 |
| L-0018 | CSV/Excel Connector 接入统一管道 | 格式兼容、安全限制、字段映射、批次回滚与部分失败报告通过 |
| L-0019 | 公开网页/搜索 Connector 安全执行边界 | 域名许可、SSRF、限流、robots/许可记录、内容隔离和断点续跑通过 |
| L-0020 | 第三方 API Connector 编排与供应商插件边界 | 分页、退避、额度、幂等、检查点和错误分类在 Mock Provider 下通过 |
| L-0021 | 阶段 3 全量验收与回顾 | 三类 Connector 通过统一契约；真实供应商未指定项明确 Deferred，不混报 |

真实供应商、真实网络和真实凭证只在用户确认后进入验收；此前各 Loop 使用 Mock/契约测试并保持真实外呼为 0。

当前执行位置：L-0017 由 Commit `308cb67` 完成；L-0018 由 `db6c711` 完成；L-0019 由 `3b0c366` 完成；L-0020 由 Test-first `33e508c` 和实现 `c361a26` 完成，专项、`verify`、audit 0、E2E 37/37 均通过。当前进入 L-0021 阶段 3 全量验收与回顾；ADR-0020 与机器验收 Test-first 契约已建立，真实 Red 24 项已确认，等待逐项转绿。真实客户文件、网页许可/网络、供应商和凭证继续 Deferred。`REQ-GJ-LEAD-001` 在 L-0021 收口前保持 In progress。
