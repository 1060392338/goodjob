# L-0017 证据：统一获客数据管道基础

- 日期：2026-07-15
- 关联：REQ-GJ-LEAD-001 / TASK-GJ-0201
- ADR：ADR-0016
- 基线 Commit：`60cf336`
- 状态：进行中

## 目标

建立 Connector 无关的标准化、稳定键、血缘、幂等 Sink 和检查点恢复契约；真实供应商与真实外呼保持 0。

## Test-first

首次运行 `npm run test:pipeline:lead-ingestion --workspace backend` 按预期失败：

`ERR_MODULE_NOT_FOUND: lead-ingestion-pipeline.js`

测试先定义了以下产品契约：

- 字段、邮箱、电话和 URL 规范化；
- provider + externalId 稳定记录键；
- 第一条成功、第二条瞬时失败后的逐记录检查点；
- 重跑跳过已成功记录且不重复写入；
- 已完成 job 再次执行不重新调用 Connector/Sink；
- payload Secret 失败关闭且不保存检查点；
- checkpoint context 不匹配拒绝恢复；
- 标准记录映射到现有 CRM 线索和来源血缘输入。

## 当前实现

- `LeadIngestionPipeline`、Connector/Sink/Checkpoint Store 契约；
- `lead-normalizer/v1` 和确定性 `leadrec_*` 稳定键；
- 页面内逐记录保存、失败停留当前 cursor、成功页推进 nextCursor；
- Secret-like 字段拒绝进入 payload/checkpoint；
- `createCrmLeadIngestionSink` 将标准记录接入现有 `persistLeadFromSource` 血缘逻辑；
- 专项测试当前 PASS：2 条记录、故障恢复、duplicate writes 0、真实外呼 0。
