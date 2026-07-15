# ADR-0019：第三方 API Lead Provider 插件边界

- 日期：2026-07-15
- 状态：Accepted
- 关联：REQ-GJ-LEAD-001 / TASK-GJ-0201 / L-0020

## 背景

L-0017 已建立统一获客管道，L-0018/L-0019 已完成文件与公开网页 Connector。第三方数据 API 的认证方式、分页 token、限流、Retry-After、额度字段和原始数据结构均由供应商定义。如果直接在领域管道中编写供应商分支，会泄漏认证与分页细节，难以替换供应商，也无法统一恢复、幂等和错误分类。

## 决策

1. 新增通用 `ApiLeadIngestionConnector`，只实现 `LeadIngestionConnector`；供应商差异封装在 `ApiLeadProviderPlugin`。
2. Provider 必须声明不可变描述：ID、版本、配置 Schema 版本和分页/Retry-After/额度能力；`ApiLeadProviderRegistry` 拒绝重复 ID+版本。
3. Connector 只接受显式 `credentialHandle`，格式为受控引用；不接受 API Key、Bearer Token 或密码值。Provider 调用边界可接收 handle，由后续真实 Adapter/SecretVault 解析；handle 和任何认证材料不得进入记录、错误、checkpoint 或日志。
4. Provider 配置必须由插件验证，且配置键不得包含 secret-like 字段；checkpoint 只保存配置摘要，不保存原配置。
5. Provider 原始记录先做 Secret-like 结构扫描，再交给版本化 Mapper；原始记录不得进入线索 payload。Connector 形成 provider、request、cursor 摘要、record index、mapper version、quota 和时间血缘。
6. Provider opaque cursor 只存在 Connector checkpoint；外部 cursor 使用 GoodJob 自有版本格式并与 checkpoint 绑定。
7. 可重试错误仅限 timeout、transient 和带 Retry-After 的 rate_limited；认证、权限、无效请求、无效响应和额度耗尽立即失败。指数退避、Retry-After、最大重试和最大退避均由 Connector 控制，并通过注入 sleeper 测试。
8. 本地请求预算键绑定 tenant + connector + provider；每次 Provider 尝试均计入预算。Provider quota 只记录非敏感剩余额度与复位时间。
9. checkpoint 绑定 connector、tenant、provider ID/version、配置摘要、mapper version 与分页状态；Sink 中断时重放当前 Provider 页，依赖统一管道逐记录完成键避免重复写入。
10. L-0020 仅提供 Mock Provider 契约，不选择真实供应商、不接真实凭证、不进行真实外呼。

## 错误分类

Connector 对外固定分类：

- `authentication`、`permission_denied`、`invalid_request`；
- `rate_limited`、`quota_exhausted`、`request_budget_exhausted`；
- `timeout`、`transient`、`invalid_response`；
- `secret_rejected`、`checkpoint_context_mismatch`、`invalid_configuration`。

Provider 原始错误文本不得直接透传，避免泄漏 handle、请求细节或供应商响应正文。

## 备选方案

- 每个供应商实现一个完整 LeadIngestionConnector：拒绝，会复制 checkpoint、重试、预算、血缘和安全规则。
- Connector 直接读取 API Key：拒绝，绕过 SecretVault/凭证执行边界。
- 把 Provider 原始响应保存到 payload：拒绝，可能保存 Secret、PII 或供应商内部字段。
- 对所有错误自动重试：拒绝，认证和无效请求重试会放大额度消耗与封禁风险。

## 回滚

删除 API Connector、Provider Registry、专项测试和脚本即可回滚到 L-0019。该循环不修改数据库 schema、公开 API，不引入真实 Provider、网络调用或数据迁移。
