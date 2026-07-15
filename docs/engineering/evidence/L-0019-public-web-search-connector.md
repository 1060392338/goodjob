# L-0019 证据：公开网页/搜索安全 Connector

- 日期：2026-07-15
- 关联：REQ-GJ-LEAD-001 / TASK-GJ-0201
- ADR：ADR-0018
- 基线 Commit：d1e4de3
- 状态：Test-first（Red，未完成）
- 初始契约 Commit：`603c664`
- 失败分类增强 Commit：`3058c32`

## 目标

在统一获客管道上建立公开网页/搜索 Connector 的安全执行边界，覆盖域名许可、DNS/IP/重定向 SSRF 防护、robots、租户限流、内容类型/大小/超时、恶意内容隔离、分页/checkpoint、幂等和逐记录血缘。

## Test-first 契约

专项测试先锁定：

- 搜索页发现公开公司页并形成统一记录；
- 许可引用、robots 决策、内容摘要、最终 URL、信任标签和抓取时间血缘；
- 外部脚本和 Prompt 注入样式文本不进入 Extractor 可用正文或 payload；
- Sink 中断后恢复，同一来源重跑 duplicate writes 0；
- 非 allowlist、非 HTTP/HTTPS、URL 凭证、私网 DNS、DNS rebinding、重定向到私网全部拒绝；
- robots 禁止、限流、响应类型和响应大小失败关闭；
- checkpoint 绑定 connector、种子与策略；篡改拒绝；
- Mock Transport 断言仅接收已验证地址，真实外呼 0。

## 当前状态

专项测试已创建并接入 backend test。首次运行 `npm run test:connector:web-leads --workspace backend` 已按预期失败：`ERR_MODULE_NOT_FOUND`，缺少 `web-lead-ingestion-connector.js`。这是实际 Test-first/Red 证据；不得删除测试、跳过安全断言或引入真实网络调用来获得通过。

## 2026-07-15 会话收口复核

- 生产实现文件仍不存在；
- 再次运行 `npm run test:connector:web-leads --workspace backend`，结果仍为预期 Red：`ERR_MODULE_NOT_FOUND`，缺少 `web-lead-ingestion-connector.js`；
- 在初始契约基础上补充并提交：Transport 超时 → `timeout`、robots 404 → `robots_unavailable`、重定向超限 → `too_many_redirects`、缺少许可依据 → 构造阶段拒绝；
- 安全拒绝计数契约由 8 更新为 12；
- 测试未调用真实 `fetch`，真实外呼为 0；
- 当前只证明测试先行和预期失败，不代表功能、质量门禁或阶段验收通过。

## 下一步验收记录模板

实现后必须在此补充：实现 Commit、专项 PASS 摘要、`verify`、dependency audit、E2E、真实外呼数、风险变化、已知限制与回滚方式。
