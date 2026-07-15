# ADR-0020：阶段 3 机器可验证验收与显式外部 Deferred

- 状态：Accepted
- 日期：2026-07-15
- 关联：REQ-GJ-LEAD-001 / TASK-GJ-0201
- Loop：L-0021
- 基线 Commit：`d708e80`

## 背景

L-0017~L-0020 已分别交付统一获客管道、CSV/Excel、公开网页/搜索和第三方 API Provider 边界。各切片已有专项测试，但阶段收口不能只依赖人工汇总，也不能把 Mock/fixture 结果扩大解释为真实客户数据、真实网页许可或真实供应商验收完成。

## 决策

1. 新增 `test:phase3-acceptance` 仓库级门禁，并在转绿后纳入根 `verify`。
2. 门禁验证三类 Connector 都显式实现统一 `LeadIngestionConnector`，统一 Pipeline 与四组专项测试脚本存在。
3. 门禁验证 L-0017~L-0021 的 ADR、Evidence、Test-first/实现 Commit、状态和追踪矩阵一致。
4. 阶段 3 只有在四组专项、`verify`、dependency audit、E2E 和差异检查全部通过后才能标记 Done。
5. 阶段结论使用 `Accepted with explicit deferred external validation`，真实客户文件、真实网页许可/网络、真实供应商/凭证和真实数据库演练必须继续 Deferred。
6. 阶段收口后执行位置切换到 L-0022（阶段 4 AI 获客闭环首个 Loop），但不在本 Loop 实现新的 AI 业务功能。
7. 发现测试稳定性问题必须记录并修复，禁止用无限复跑替代发布门禁。

## 验收证据边界

机器门禁只证明仓库内结构、追踪和阶段状态一致；功能正确性仍由 Pipeline/Connector 专项、全量 `verify`、audit 和 E2E 独立证明。真实外部环境没有执行时，不得以本地 Mock 结果关闭 R-006、R-013 或 R-015。

## 回滚

- 可移除 `test:phase3-acceptance` 及其 `verify` 接入，不影响运行时业务数据和 API；
- 若门禁规则误报，应前向修正规则并保留 Test-first 失败证据，不得静默删除完成条件；
- 阶段状态回滚必须同时恢复 FEATURES、TRACEABILITY、PROJECT_STATUS、DEVELOPMENT_PLAN、RISK_REGISTER、Evidence 和 HANDOFF，禁止只修改单一台账。

## 后果

- 阶段 3 的完成结论可由仓库自动复核；
- 外部验证范围保持诚实且可追踪；
- L-0022 可在新会话中从明确入口开始，而不依赖聊天记录。
