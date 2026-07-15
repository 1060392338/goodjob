# L-0017 证据：统一获客数据管道

- 日期：2026-07-15
- 关联：REQ-GJ-LEAD-001 / TASK-GJ-0201
- ADR：ADR-0016
- Test-first Commit：`60cf336`
- 实现 Commit：`308cb67`
- 状态：Done

## 目标

建立独立于具体 Connector 的统一获客管道，使候选记录经过规范化、稳定身份、逐记录血缘、检查点和幂等 Sink 后进入 CRM；故障恢复不得重复写入，真实外呼保持 0。

## Test-first

实现前运行：

```text
npm run test:pipeline:lead-ingestion --workspace backend
```

真实 Red：

```text
ERR_MODULE_NOT_FOUND: lead-ingestion-pipeline.js
```

失败契约先锁定规范化字段、稳定记录键、URL 规范化、血缘、逐记录检查点、Connector/Sink 故障恢复、Secret 拒绝、checkpoint context 绑定以及 CRM Sink 映射。

## 实现

- 新增 `LeadIngestionPipeline`、Connector、Sink 和 Checkpoint Store 契约；
- 使用版本化 `lead-normalizer/v1` 和稳定的 `leadrec_*` 记录键；
- 稳定身份优先采用 provider + externalId，否则采用规范化邮箱、电话和域名；
- 逐记录保存血缘和已处理记录键，只在页面完成后推进 cursor/nextCursor；
- checkpoint 与 job、owner、team、source、provider 上下文绑定，不匹配时失败关闭；
- payload/checkpoint 拒绝 API key、token、password、secret 等敏感字段；
- `createCrmLeadIngestionSink` 复用 `persistLeadFromSource`，保留统一来源追踪；
- 不引入真实 API、供应商或网络调用，真实外呼 0。

## 专项验证

`npm run test:pipeline:lead-ingestion --workspace backend`：PASS。

| 指标 | 结果 |
|---|---:|
| normalizedFields | 7 |
| connectorCalls | 2 |
| sinkCalls | 3 |
| persisted | 2 |
| resumedAfterFailure | true |
| duplicateWrites | 0 |
| secretRejected | true |
| realOutboundCalls | 0 |

## 完整门禁

- `npm run verify`：PASS；
- repository security：158 tracked files；
- OpenAPI operations：167；
- tenant isolation：18；
- frontend self-test：44；
- Bundle Budget：PASS；
- `npm run audit:dependencies`：0 vulnerabilities；
- `npm run test:e2e`：37/37；
- 真实外部网络调用：0。

## 风险、范围与交接

- R-015 保持 `Mitigating`：Mock 已验证稳定键、血缘、检查点、恢复和幂等；真实 CSV/Excel、网页和第三方供应商数据仍待后续 Loop 验证。
- 实现 Commit `308cb67` 只包含 pipeline/sink/test 及必要装配，不改变公开 API、数据库 schema 或现有业务行为。
- 下一 Loop：L-0018，接入 CSV/Excel Connector 并继续复用统一管道。
- `REQ-GJ-LEAD-001` 保持 `in_progress`，因为 L-0017 只是阶段 3 的第一个切片。