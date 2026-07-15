# L-0018 证据：CSV/Excel Connector

- 日期：2026-07-15
- 关联：REQ-GJ-LEAD-001 / TASK-GJ-0201
- ADR：ADR-0017
- 基线 Commit：29299ed
- Test-first/Red Commit：876ba19
- 实现 Commit：db6c711
- 状态：Done（REQ-GJ-LEAD-001 总体继续 In progress）

## 目标

在不复制工作簿安全逻辑的前提下，将 CSV、XLSX、XLS 通过统一获客管道导入，并形成版本化映射、文件/批次/行血缘、行级错误报告、幂等和检查点恢复。

## Test-first 证据

专项测试先锁定：

- 三种格式读取和相同字段映射；
- 文件摘要、批次、工作表、行号和 mapping version 血缘；
- 多页 cursor 与故障后恢复；
- 同文件重跑 duplicate writes 0；
- reject_batch 在预检失败时 Sink 写入 0；
- skip_invalid 输出有效记录并保留完整坏行报告；
- Prototype Pollution、超限、签名伪造、Secret 表头和危险公式拒绝；
- 真实外呼 0。

真实 Red 记录：

1. 首次运行因无法解析 `@goodjob/workbook-security` 失败；
2. 完成 workspace 接线后，因 `file-lead-ingestion-connector.js` 尚不存在再次失败；
3. 未通过删测、跳过或放宽断言掩盖失败。

## 实现

- 新增 `backend/src/connectors/file-lead-ingestion-connector.ts`；
- 将工作簿安全实现集中到 `packages/workbook-security`，前端改为薄包装，前后端共享同一实现；
- `xlsx@0.20.3` 仅由共享 package 直接持有，并保持 SheetJS 官方来源和锁文件完整性摘要门禁；
- 支持 CSV/XLSX/XLS、显式映射版本、文件摘要和逐行血缘；
- 支持 `reject_batch`、`skip_invalid`、固定 page size/cursor、上下文绑定 checkpoint 与故障恢复；
- 对敏感表头、原型污染、危险公式、签名和资源限制失败关闭；
- 不保存整行原始 payload；真实网络调用为 0。

## 验证结果

### 专项

`npm run test:connector:file-leads --workspace backend`：PASS。

```text
formats                  3
mappedRows               2
lineageFields            5
resumedAfterFailure      true
duplicateWrites          0
rejectBatchWrites        0
partialFailureReported   true
securityRejections       5
realOutboundCalls        0
```

### 全量门禁

- `npm run verify`：PASS；repository security 165；traceability 16 REQ / 16 TASK；API operations 167；tenant isolation 18；frontend self-test 44；workbook security PASS；Bundle Budget PASS；
- `npm run audit:dependencies`：PASS，0 vulnerabilities；
- `npm run test:e2e`：首次完整运行 36/37，首条登录等待超时；该用例单独复跑 PASS；随后完整复跑 PASS，37/37；
- `git diff --check`：PASS；
- 测试真实外呼：0。

## 验收结论

L-0018 的格式兼容、共享安全解析、字段映射、血缘、部分失败、批次拒绝、幂等、恢复和安全门禁已通过，可进入 L-0019。该结论不代表真实供应商、真实网络或真实客户文件已验收。

## 风险与回滚

- R-015 继续保持 Mitigating：Mock/fixture 契约已通过，真实客户样本回放与供应商验收仍未执行；
- E2E 首次运行出现一次登录等待波动，完整复跑通过；后续若重复发生，应登记独立稳定性缺陷，不得长期依赖复跑；
- 回滚实现 Commit `db6c711` 可恢复至 L-0018 Test-first 检查点 `876ba19`；共享 package 消费关系和前端薄包装必须整体回滚，避免前后端安全策略分叉。
