# L-0021 证据：阶段 3 全量验收与回顾

- 日期：2026-07-15
- 关联：REQ-GJ-LEAD-001 / TASK-GJ-0201
- ADR：ADR-0020
- 基线 Commit：`d708e80`
- Test-first Commit：`789a0e4`
- 状态：Done
- 验收结论：Accepted with explicit deferred external validation

## Test-first / 真实 Red

新增 `npm run test:phase3-acceptance`，先要求阶段状态、统一 Connector 契约、追踪、Evidence、风险、回滚、外部 Deferred 和 L-0022 交接全部成立。

首次运行：

```text
命令：npm run test:phase3-acceptance
退出码：1
结果：Phase 3 acceptance FAILED
真实失败项：24
真实外呼：0
```

失败准确指出根 `verify` 尚未接入新门禁、REQ/L-0021 状态未完成、完成元数据和结构化 verification 缺失、追踪矩阵未 Done、L-0022 未交接，以及权威文档尚缺统一结论、完整门禁指标、风险和回滚。未删除测试、跳过检查或放宽验收条件。

## 需求逐项验收

| 验收条件 | 证据 | 结论 |
|---|---|---|
| CSV/Excel、网页/搜索、第三方 API 使用统一标准化管道 | 三类 Connector 源码均显式 `implements LeadIngestionConnector`；统一 Pipeline 专项 PASS | PASS |
| 每条线索保留来源、任务、时间、证据与转换版本 | Pipeline 7 个规范化字段；File lineage 5；Web/API lineage 6；各 Evidence 记录映射版本和来源上下文 | PASS |
| 分页、限流、重试、检查点和幂等 | File checkpoint/部分失败；Web robots/SSRF/限流/恢复；API cursor/Retry-After/退避/预算/恢复 | PASS |
| 故障恢复和完整重跑不重复写入 | Pipeline、File、Web、API 专项均恢复成功，duplicate writes 0 | PASS |
| 凭证和不可信内容不泄漏 | Pipeline Secret 拒绝；Web 内容隔离；API credential leaks 0 | PASS |
| Mock 阶段不发生真实外呼 | 四组专项 real outbound calls 0 | PASS |

## 四组专项结果

```text
统一 Pipeline：PASS；normalized fields 7；resumedAfterFailure true；duplicate writes 0；Secret rejected；真实外呼 0
File Connector：PASS；CSV/XLSX/XLS；lineage fields 5；security rejections 5；duplicate writes 0；真实外呼 0
Web Connector：PASS；documents 2；lineage fields 6；robots/SSRF/redirect/rate/content isolation；security rejections 12；duplicate writes 0；真实外呼 0
API Connector：PASS；plugins 1；pages 2；lineage fields 6；Retry-After/退避/预算；error classifications 10；credential leaks 0；duplicate writes 0；真实外呼 0
```

## 完整门禁

- `npm run verify`：PASS；repository security 176；REQ/TASK 16/16；OpenAPI 167；tenant isolation 18；frontend self-test 44；workbook security 与 Bundle Budget PASS；
- `npm run audit:dependencies`：PASS，0 vulnerabilities；
- `npm run test:e2e`：PASS，37/37；
- `git diff --check`：PASS；
- Critical/High 新增安全问题：0。

L-0020 收口前曾出现一次动态端口命中 Fetch 禁用端口的 `bad port`；本次 L-0021 完整 `verify` 未复现，因此不登记为已确认重复缺陷，历史观察仍保留在风险记录中。

## 范围与 Deferred

以下外部验证没有执行，继续 Deferred，不能解释为已完成：

- 真实客户 CSV/Excel 文件回放；
- 真实网页采集许可、robots 法务依据和真实网络 Transport；
- 真实供应商选择、合同、字段/额度、真实凭证和真实网络；
- 真实数据库迁移、备份恢复和 SecretVault 部署验证；
- 阶段 4 真实模型调用与 Prompt 注入红队。

## 风险复核

- R-006 保持 Open：Mock Web 安全边界通过，但真实网页许可/网络和模型输入红队未验证；
- R-013 保持 Verification：credential handle/SecretVault 本地边界通过，但真实部署、备份恢复和供应商额度告警未验证；
- R-015 保持 Mitigating：三类 Connector 的 checkpoint、恢复、幂等和血缘通过，但真实客户数据和真实供应商验收未执行；
- 未关闭或未正式接受的 Critical 风险继续阻止内部正式发布。

## 回滚

- 回滚本 Loop 可移除 `scripts/phase-3-acceptance-check.mjs`、根 `test:phase3-acceptance` 及 `verify` 接入；
- 同时恢复 FEATURES、TRACEABILITY、PROJECT_STATUS、DEVELOPMENT_PLAN、RISK_REGISTER、IMPLEMENTATION_LOG 和 HANDOFF 的阶段状态；
- 该回滚不修改数据库、业务数据、公开 API 或外部供应商状态；
- 不建议只回滚机器门禁而保留 Done 状态，否则阶段结论将不可自动复核。

## 阶段回顾

阶段 3 形成了一个可替换、可恢复、可审计的获客数据管道，而不是为单一来源写一次性导入逻辑。安全和外部副作用默认失败关闭，所有真实外部条件均显式转移。下一执行位置为 L-0022：阶段 4 AI 线索清洗、补全、去重与 ICP 评分的 Test-first 业务契约；真实模型凭证和生产调用必须先暂停确认。
