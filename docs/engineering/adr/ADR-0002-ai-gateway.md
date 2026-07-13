# ADR-0002：AI 使用 OpenAI-compatible Gateway 和确认执行协议

- 状态：Accepted
- 日期：2026-07-13

## 决策

- 所有模型调用经过服务端 `ModelGateway`，业务代码不得直接调用厂商 SDK。
- Gateway 负责模型别名、结构化输出、超时、重试、用量、Trace、脱敏与错误分类。
- AI 工具分为 `read`、`draft`、`write`；`write` 必须预览、用户确认、权限二次校验、幂等执行和审计。
- Prompt、模型、工具 Schema 和评测数据全部版本化。

## 后果

- 可以切换兼容模型并进行成本/质量比较。
- 初期需要建设统一接口和 Mock，但可避免业务与供应商锁定。
