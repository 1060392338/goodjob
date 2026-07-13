# ADR-0003：外部数据源与协作平台采用 Connector/Adapter

- 状态：Accepted
- 日期：2026-07-13

## 决策

- CSV/Excel、网页/搜索和第三方数据服务统一实现 `LeadSourceConnector`。
- 钉钉、企业微信、飞书统一实现 `CollaborationAdapter`。
- 核心领域只接收标准化对象和事件，不认识厂商字段。
- 每个实现必须通过统一契约测试；本阶段三方协作平台使用 Mock Adapter 验证入口。

## 后果

- 新增供应商不改核心业务。
- 必须维护标准模型、版本兼容、幂等、重试和来源证据。
