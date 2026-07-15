# L-0019 证据：公开网页/搜索安全 Connector

- 日期：2026-07-15
- 关联：REQ-GJ-LEAD-001 / TASK-GJ-0201
- ADR：ADR-0018
- 基线 Commit：`d1e4de3`
- Test-first Commits：`603c664`、`3058c32`
- 实现 Commit：`3b0c366`
- 状态：Done

## 目标

在统一获客管道上建立公开网页/搜索 Connector 的安全执行边界，覆盖域名许可、DNS/IP/重定向 SSRF 防护、robots、租户限流、内容限制与隔离、分页/checkpoint、幂等和逐记录血缘。

## Test-first / Red

专项测试先于实现建立，首次运行：

```text
npm run test:connector:web-leads --workspace backend
ERR_MODULE_NOT_FOUND: web-lead-ingestion-connector.js
```

Red 契约锁定正常抓取、搜索页发现公开公司页、故障恢复、完整重跑幂等，以及 12 类安全拒绝。后续没有删除测试、跳过断言或引入真实网络调用。

## 实现

- 新增 `WebLeadIngestionConnector`，只实现统一 `LeadIngestionConnector`；
- Resolver、Transport、Extractor、域名许可策略、租户和限流器全部显式注入，不提供默认真实网络 Transport；
- 每次 robots、正文和重定向请求重新执行协议、URL 凭证、allowlist、DNS/IP、地址钉扎和限流检查；
- Transport 只接收 Connector 已验证的 `resolvedAddresses`；
- 拒绝本机、私网、链路本地、共享、文档、保留、组播和未分类地址，并检测同一 checkpoint 内公共地址变化；
- robots 缺失、异常或禁止时失败关闭；规则按 User-agent 和最长路径决策；
- 限制状态码、Content-Type、Content-Length、实际字节、超时和重定向次数；
- 删除危险 HTML 元素，检测并移除 Prompt 注入样式指令；Extractor 文档标记 `untrusted_external` / `instructionUse=forbidden`；
- payload 仅保存许可、robots、最终 URL、内容摘要、抓取时间、信任标签等血缘，不保存原始正文；
- checkpoint 绑定 connector、tenant、种子和策略摘要，保存待处理队列、访问记录、robots 摘要/规则和解析地址钉扎。

## 专项验收

`npm run test:connector:web-leads --workspace backend`：PASS。

```json
{
  "fetchedDocuments": 2,
  "lineageFields": 6,
  "robotsEvidence": true,
  "dnsAndRedirectProtection": true,
  "rateLimitProtection": true,
  "contentIsolation": true,
  "resumedAfterFailure": true,
  "duplicateWrites": 0,
  "securityRejections": 12,
  "realOutboundCalls": 0
}
```

同时验证：第二条 Sink 写入故障后恢复完成；新 job 完整重跑 created 0、duplicate 2；持久化记录仍为 2。

## 全量质量门禁

- `npm run build --workspace backend`：PASS；
- `npm run verify`：PASS；repository security 169、traceability 16 REQ / 16 TASK、API operations 167、tenant isolation 18、frontend self-test 44、workbook security PASS、Bundle Budget PASS；
- `npm run audit:dependencies`：PASS，0 vulnerabilities；
- `npm run test:e2e`：PASS，37/37；
- `git diff --check`：PASS；
- 真实外呼：0。

## 风险与限制

- R-006 仍保持 Open：L-0019 已缓解 Mock Web Connector 的 SSRF、robots、许可和内容隔离风险，但真实网站许可审查、真实网络实现和阶段 4 模型输入红队尚未执行；
- R-015 保持 Mitigating：网页 checkpoint、恢复、幂等和血缘已通过 fixture；真实数据回放与供应商验收仍 Deferred；
- 未引入真实搜索供应商、真实凭证、真实网络 Transport、数据库 schema 或公开 API。

## 回滚

回滚实现 Commit `3b0c366`，并回滚 L-0019 测试/文档提交即可恢复到 L-0018。该实现没有数据库迁移、真实外部副作用或生产数据回滚步骤。

## 下一步

进入 L-0020：第三方 API Connector 插件边界，在 Mock Provider 下验证分页、退避、额度、幂等、checkpoint 和错误分类。
