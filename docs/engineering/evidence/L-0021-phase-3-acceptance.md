# L-0021 执行清单：阶段 3 全量验收与回顾

- 日期：2026-07-15
- 关联：REQ-GJ-LEAD-001 / TASK-GJ-0201
- 状态：Ready，尚未执行
- 输入 Evidence：L-0017、L-0018、L-0019、L-0020

## 目标

对阶段 3 已交付的统一获客管道、文件 Connector、Web Connector 和 API Provider Connector 做跨切片验收。此 Loop 以证据复核和阶段结论为主，不选择真实供应商，不接真实凭证，不采集真实客户数据。

## 验收步骤

1. 核对 L-0017~L-0020 的 REQ、TASK、ADR、Test-first、实现 Commit、专项输出、风险和回滚；
2. 验证三类 Connector 均通过统一 `LeadIngestionConnector` 进入同一规范化、去重、血缘和 checkpoint 管道；
3. 执行：

```powershell
npm run test:pipeline:lead-ingestion --workspace backend
npm run test:connector:file-leads --workspace backend
npm run test:connector:web-leads --workspace backend
npm run test:connector:api-leads --workspace backend
npm run verify
npm run audit:dependencies
npm run test:e2e
git diff --check
```

4. 检查完整重跑 duplicate writes 0、Secret/credential leaks 0、真实外呼 0；
5. 复核 checkpoint tenant/context 绑定、失败恢复和逐记录来源血缘；
6. 检查 `FEATURES.json`、`TRACEABILITY.md`、`PROJECT_STATUS.md`、`RISK_REGISTER.md`、`IMPLEMENTATION_LOG.md`、Evidence 和 `HANDOFF.md` 一致；
7. 形成阶段回顾、Carry-over/Deferred 清单和下一阶段入口。

## 测试标准

- 四组专项 100% PASS；
- `verify`、audit、E2E、diff check 100% PASS；
- Critical/High 新增安全问题 0；
- duplicate writes 0；
- Secret/credential leaks 0；
- Mock 验收真实外呼 0；
- REQ/TASK/ADR/Commit/Test/Evidence 双向追踪无缺口；
- 不允许以重复复跑掩盖稳定性失败；若 `bad port` 再现，先登记和修复测试缺陷。

## 必须显式 Deferred

- 真实客户 CSV/Excel 回放；
- 真实网页采集许可、robots 法务依据和真实网络 Transport；
- 真实第三方供应商选择、合同、字段/额度、凭证和网络；
- 真实数据库迁移、备份恢复和 SecretVault 部署验证；
- 阶段 4 模型输入 Prompt 注入红队。

## 完成后更新

- 将本文件从 Ready 更新为实际 Evidence；
- 更新 FEATURES、TRACEABILITY、PROJECT_STATUS、RISK_REGISTER、DEVELOPMENT_PLAN、IMPLEMENTATION_LOG 和 HANDOFF；
- 创建独立 L-0021 验收 Commit 并只推送 GitHub；
- 只有证据完整后，才能把阶段 3 标记为带明确 Deferred 项的 Accepted，并将 `currentIteration` 切换到阶段 4 的首个 Loop。
