# ADR-0016：统一获客数据管道、规范化与检查点契约

- 日期：2026-07-15
- 状态：Accepted
- 关联：REQ-GJ-LEAD-001 / TASK-GJ-0201 / L-0017

## 背景

现有 `LeadSourceConnector` 已隔离第三方网络调用，并具备分页字段，但来源结果进入 CRM 前仍缺少统一的规范化、稳定身份、逐记录血缘、失败恢复和 Connector 无关的执行协议。若 CSV/Excel、网页/搜索和第三方 API 各自直接写入线索，将形成三套去重与恢复逻辑。

## 决策

1. 新增与具体供应商无关的 `LeadIngestionPipeline`；Connector 只负责分页读取原始记录，Pipeline 负责规范化、稳定记录键、逐条写入和检查点推进。
2. 标准记录必须包含 provider、source kind、externalId、sourceUrl、occurredAt、原始 payload 和转换版本；密钥不得进入记录或检查点。
3. 稳定键优先使用 provider + externalId；无 externalId 时按规范化域名、邮箱、电话、公司+国家生成确定性摘要。
4. 检查点在每条成功记录后保存；页面中断时保留已完成键并停留在当前 cursor，重跑跳过已成功记录；整页完成后才推进 nextCursor。
5. Pipeline 通过 Sink 接口写入 CRM，具体 Store/Repository 不进入 Connector；Sink 必须返回 created/duplicate/updated 等明确结果并自行保证租户幂等。
6. L-0017 只交付领域契约和 Mock 验证；真实网络、真实供应商与真实凭证保持 0，分别在后续切片验收。

## 安全与失败策略

- 原始 payload 必须通过 Secret 检查，检测到 API key/token/password 等字段时失败关闭；
- 单条无效记录形成可审计失败，不得伪造成功；
- Connector 错误不推进 cursor；
- 检查点必须绑定 tenant、owner、source 和 job，禁止跨上下文恢复；
- 任何未知版本检查点拒绝恢复。

## 备选方案

- 各 Connector 自行规范化和落库：拒绝，会重复去重、血缘和恢复规则。
- 仅依赖数据库唯一键：拒绝，无法表达页面内检查点、无 externalId 数据和转换版本。
- 批次结束后一次保存检查点：拒绝，中途失败会重复处理整页。

## 回滚

删除新增 Pipeline、测试和脚本即可回滚；L-0017 不修改现有 API、数据表或真实外部调用，回滚不需要数据迁移。
