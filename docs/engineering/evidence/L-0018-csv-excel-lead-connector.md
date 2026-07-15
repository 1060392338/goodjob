# L-0018 证据：CSV/Excel Connector

- 日期：2026-07-15
- 关联：REQ-GJ-LEAD-001 / TASK-GJ-0201
- ADR：ADR-0017
- 基线 Commit：29299ed
- 状态：Test-first（Red，未完成）

## 目标

在不复制工作簿安全逻辑的前提下，将 CSV、XLSX、XLS 通过统一获客管道导入，并形成版本化映射、文件/批次/行血缘、行级错误报告、幂等和检查点恢复。

## Test-first 计划

专项测试先锁定：

- 三种格式读取和相同字段映射；
- 文件摘要、批次、工作表、行号和 mapping version 血缘；
- 多页 cursor 与故障后恢复；
- 同文件重跑 duplicate writes 0；
- reject_batch 在预检失败时 Sink 写入 0；
- skip_invalid 输出有效记录并保留完整坏行报告；
- Prototype Pollution、超限、签名伪造、Secret 表头和危险公式拒绝；
- 真实外呼 0。

## 当前状态

首次运行 npm run test:connector:file-leads --workspace backend 按预期失败：ERR_MODULE_NOT_FOUND，无法解析 @goodjob/workbook-security。

已创建专项测试、ADR 和共享 package 骨架；尚未完成 workspace/package-lock 接线、前端迁移和 FileLeadIngestionConnector 实现。当前内容仅作为 Test-first/Red 检查点保存，不代表实现或验收完成；REQ-GJ-LEAD-001 继续保持 in_progress。
