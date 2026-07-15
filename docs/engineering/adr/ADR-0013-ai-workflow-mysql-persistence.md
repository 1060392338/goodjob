# ADR-0013：AI 工作流 MySQL 持久化、恢复与 Effect 幂等

- 状态：Accepted
- 日期：2026-07-15
- 关联：REQ-GJ-AI-PERSIST-001 / TASK-GJ-0103 / R-014
- Loop：L-0014
- 基线 Commit：`24e77bb`

## 背景

L-0011 已验证 LangGraph.js 编排、暂停/恢复、确认/驳回/重跑、权限复检和内存幂等，但正式状态仍使用 `MemorySaver`。进程重启后状态丢失，多实例并发确认也无法依靠进程内 Map 保证业务 Effect 唯一。

## 决策

1. 保留 LangGraph.js，不重写为自研状态机。
2. 实现符合 `BaseCheckpointSaver` 契约的 MySQL Checkpointer，按 thread/namespace/checkpoint 保存 checkpoint、metadata 和 pending writes。
3. 建立独立工作流运行、审批、Effect 和审计表；运行摘要不得只存在 checkpoint 内。
4. Checkpoint、运行摘要、审批和审计禁止保存 API Key、Authorization、Cookie、SMTP 密钥等 Secret；检测到敏感字段时拒绝写入。
5. 恢复时必须复核 actorId 与 tenantId；业务写入前仍由工作流再次执行权限检查。
6. 每个 run 只允许一个最终人工决策；同一决策重放可继续恢复，不同决策并发冲突必须失败关闭。
7. Effect 使用稳定键 `ai-workflow:<runId>:apply`。数据库记录执行状态和结果；业务操作仍必须接受同一幂等键，以处理数据库提交前后的崩溃不确定性。
8. 本 Loop 使用 Fake MySQL 与 Mock ModelGateway 验证 SQL、事务、跨实例恢复和并发；不连接生产数据库或真实模型。

## 数据边界

- `ai_workflow_runs`：运行身份、租户、目标、状态、attempt、proposal、outcome、effect reference、版本和时间。
- `ai_workflow_checkpoints`：LangGraph checkpoint 与 metadata 的序列化载荷、父 checkpoint。
- `ai_workflow_checkpoint_writes`：pending writes，唯一键为 thread/namespace/checkpoint/task/index。
- `ai_workflow_approvals`：每个 run 唯一最终决策、决策人、租户和时间。
- `ai_workflow_effects`：稳定幂等键、状态、结果、错误分类和 lease/时间。
- `ai_workflow_audits`：结构化事件；不保存模型提示全文或 Secret。

## 一致性与恢复

- checkpoint put 和 writes 使用幂等 UPSERT/条件插入；不得使用全表 DELETE。
- run 摘要更新使用 version 乐观并发；终态不得回退为运行态。
- 审批唯一约束决定并发胜者；重复同决策可恢复，不同决策抛冲突。
- Effect 成功结果可跨进程回读；executing 状态由短轮询等待，超时后以同一幂等键恢复。
- 删除 thread 只允许按 thread_id 条件删除 checkpoint/writes，不触碰其他租户或运行。

## 安全

- 所有 SQL 参数化。
- thread/run/actor/tenant 标识限制长度并拒绝控制字符。
- 持久化前递归扫描对象键和值，命中 Secret 键名或 `Bearer`/`gjsec:v1`/常见 API Key 形态时拒绝。
- 审计 details 只允许字符串、数字、布尔和 null；不保存 prompt 或模型配置密钥。

## 回滚

- 优先前向修复 Saver/Store；表结构保持兼容。
- 必须回滚时先停止 AI 工作流入口，导出不含 Secret 的 run/effect 状态，确认没有 executing Effect。
- 不删除已有审批和 Effect 幂等记录；旧版本若只支持 MemorySaver，不得对已有 MySQL run 执行恢复。

## 后果

- 获得跨进程恢复和可审计的幂等边界。
- 增加 MySQL 表、序列化兼容和状态迁移责任。
- Generic Effect Store 无法单独保证任意外部系统 exactly-once；下游 `applyProposal` 必须继续以稳定幂等键防重。
