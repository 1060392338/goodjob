# ADR-0018：公开网页/搜索 Connector 安全执行边界

- 日期：2026-07-15
- 状态：Accepted
- 关联：REQ-GJ-LEAD-001 / TASK-GJ-0201 / L-0019

## 背景

L-0017 已建立统一获客管道，L-0018 已完成文件 Connector。公开网页和搜索结果具有网络 SSRF、重定向绕过、DNS rebinding、robots/许可、限流、超大响应、恶意 HTML 与 Prompt 注入等额外风险，不能复用普通 `fetch` 后直接把正文交给 AI 或 CRM。

## 决策

1. 新增 `WebLeadIngestionConnector`，只实现 `LeadIngestionConnector`，不得直接访问 Store/Repository，也不得调用模型。
2. Connector 必须显式接收域名许可策略、DNS Resolver、Transport、Extractor 和租户标识；本循环仅提供 Mock Transport 契约，不提供可误用的真实网络默认实现。
3. 每次请求及每次重定向前重新验证 HTTP/HTTPS、无 URL 凭证、域名 allowlist、DNS 全地址公网属性；Transport 必须只连接 Connector 已验证并传入的地址集合，以阻断校验后再次解析造成的 DNS rebinding/TOCTOU。
4. 每个域名必须有许可依据、证据引用和复核时间；抓取正文前必须获取并执行 robots 规则，robots 缺失、异常或明确禁止时默认失败关闭。
5. 限流键绑定 tenant + connector + origin；robots、重定向和正文请求均计入额度。
6. 只接受受限的 HTML/纯文本内容；状态码、Content-Type、Content-Length、实际字节数、超时和重定向次数均有硬限制。
7. 外部内容必须先净化并标记为 `untrusted_external`、`instructionUse=forbidden`；脚本、可执行标签和 Prompt 注入样式指令不得进入 Extractor 可用正文。原始正文不得进入线索 payload/checkpoint。
8. Extractor 只能返回结构化候选和后续目标；Connector 负责再次校验、形成内容摘要、robots/许可/抓取时间/转换版本血缘、稳定 externalId、分页队列和上下文绑定 checkpoint。
9. 真实搜索供应商、真实网站、真实凭证和生产采集继续 Deferred，除非项目负责人明确确认。

## 安全失败策略

- allowlist、DNS、重定向、robots、许可、限流、响应类型/大小和 checkpoint 任一不匹配均失败关闭；
- 解析到任一本机、私网、链路本地、共享地址、文档/保留、组播或未分类地址即拒绝；
- robots 决策和许可证据写入逐记录血缘，但不保存 robots 全文；
- checkpoint 只保存队列、已访问 URL、策略/种子摘要和 robots 摘要，不保存正文、Cookie、Authorization 或其他 Secret；
- Sink 中断时依赖 L-0017 的逐记录完成键重放当前页面，不重复写入。

## 备选方案

- 直接使用现有 `fetchPublicUrl`：拒绝，缺少许可/robots、租户限流、内容隔离、Extractor 和 Connector checkpoint 契约。
- 在浏览器端抓取网页：拒绝，无法集中执行 SSRF、许可、审计与租户限流。
- 把网页原文直接交给模型抽取：拒绝，阶段 4 前不得绕过内容隔离和 Prompt 注入边界。
- robots 失败时默认放行：拒绝，无法证明采集许可。

## 回滚

删除 Web Connector、专项测试和脚本即可回滚至 L-0018。该循环不修改数据库 schema、公开 API，不引入真实网络 Transport，无数据迁移和外部副作用回滚步骤。
