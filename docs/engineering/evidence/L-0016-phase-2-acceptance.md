# L-0016 证据：阶段 2 全量验收与收口

- 日期：2026-07-15
- 关联：REQ-GJ-ENG-AUDIT-001 / TASK-GJ-0009
- ADR：ADR-0015
- 基线 Commit：`ba6ef0b`
- 实现 Commit：`cddd97f`
- 状态：Done
- 验收结论：Accepted with carry-over

## Test-first 记录

首次运行 `npm run test:traceability` 按预期失败，发现：

- 新 L-0016 需求尚未进入追踪矩阵且验收证据不存在；
- REQ-GJ-FE-001、REQ-GJ-ARCH-002、REQ-GJ-AI-PERSIST-001、REQ-GJ-SEC-003 缺少完成日期或结构化 verification；
- REQ-GJ-AI-ORCH-001 缺少结构化 design 路径；
- L-0010 证据使用“代码 Commit”而不是机器门禁要求的“实现 Commit”。

以上均作为真实追踪债务修复；没有删除测试、跳过检查或放宽 Done 标准。

## 实现

- 新增 `scripts/engineering-traceability-check.mjs` 和根命令 `npm run test:traceability`；
- 将追踪检查纳入 `npm run verify`；
- 自动验证 REQ/TASK 唯一性、允许状态、追踪行、设计/证据路径、阶段 2 Done 元数据和本地实现 Commit；
- 自动验证 `FEATURES.json` 的 `currentIteration` 与状态、计划、交接文档一致；
- 自动拒绝核心工程文档中的 Unicode replacement character 和未解决 `???` 占位；
- 补齐已完成需求的结构化验证信息，不改变其业务范围。

## 最终验收

| 门禁 | 结果 |
|---|---|
| `npm run test:traceability` | PASS；16 requirements；16 tasks；phase2Done 7；currentIteration L-0016 |
| `npm run verify` | PASS |
| repository security | PASS；153 tracked files |
| API / tenant | 167 API operations；18 tenant isolation checks |
| frontend | self-test 44；lead-source 8 states / 4 APIs；workbook security PASS |
| persistence / workflow | 21 row-level repository statements；6 workflow tables；full snapshot writes 0；真实外呼 0 |
| bundle | entry/core/lazy dependency graph budget PASS |
| `npm run audit:dependencies` | PASS；0 vulnerabilities |
| `npm run test:e2e` | PASS；37/37 |

## 阶段 2 已验收范围

- 后端系统、认证、客户、线索、外联、转化、AI 配置与来源配置共 30 个 API 的显式模块装配；
- `ModelGateway`、`OutboundEmailGateway`、`LeadSourceConnector` 外部边界；
- `SecretVault` 本地加密、迁移、轮换、吊销和启动门禁；
- 线索外联 Repository/Unit of Work 按行持久化；
- LangGraph Workflow Engine 及 MySQL checkpoint/run/approval/effect/audit 持久化契约；
- 前端首个领域模块拆分、动态分包、manifest 和 Bundle Budget；
- 机器可验证追踪完整性门禁。

## 明确转移项

以下工作未完成，不因阶段 2 收口而关闭：

- `REQ-GJ-ARCH-001` 继续 `in_progress`：剩余后端路由和前端页面控制器拆分；
- R-004/R-008：`server.ts`、`prototype-api.ts`、384 kB 静态 HTML 和真实网络性能；
- R-005：其他 Store 的 Repository/Unit of Work 迁移；
- R-011：邮件 pending 运维查询、人工确认、受控重试和告警；
- R-012/R-013/R-014：真实 MySQL、密钥托管、迁移、锁等待、断连、备份恢复；
- R-001/R-009：GitHub Actions、历史 Secret Scan、分支保护和部署凭证轮换；
- 正式供应商、真实凭证、真实网络和生产发布演练。

## 回滚

- 移除根 `verify` 中的 `test:traceability` 调用并回滚 `cddd97f` 可撤销机器门禁；
- 该回滚只撤销工程检查，不更改业务数据和运行时 API；
- 不建议单独回滚历史追踪字段，因为会重新产生无法机器审计的 Done 记录。

## 下一入口

L-0017：阶段 3 获客数据管道基础与统一接入契约。真实供应商和凭证未确定前，仅进行 Mock/契约开发，真实外呼保持 0。
