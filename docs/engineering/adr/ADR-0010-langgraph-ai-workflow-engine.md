# ADR-0010：LangGraph.js 与 AiWorkflowEngine 编排边界

- 状态：Accepted for technical validation
- 日期：2026-07-15
- 关联：`REQ-GJ-AI-ORCH-001 / TASK-GJ-0102`
- 关联架构：`REQ-GJ-ARCH-001 / TASK-GJ-0003`、`ADR-0007`
- 实施循环：`L-0011`

## 背景

GoodJob 已通过 `ModelGateway` 建立模型协议、安全外呼和 Trace ID 边界，但尚未形成可暂停、恢复、人工确认、权限复检和幂等执行的 AI 工作流编排层。阶段 4/5 的 AI 评分与助手写操作不能把模型调用、权限判断、业务写入和供应商 SDK 混在路由或 LangGraph 节点中。

L-0011 仍属于阶段 2 的架构技术验证，不代表阶段 4 AI 获客闭环或阶段 5 全局 AI 助手已经交付。

## 决策

1. 引入 `AiWorkflowEngine` 作为 GoodJob 的稳定边界；LangGraph.js 仅实现状态图、分支、中断和恢复。
2. LangGraph 节点不得直接调用 OpenAI、Anthropic、Gemini 或其他厂商 SDK；所有模型生成必须经过既有 `ModelGateway`。
3. 领域读取、权限判断和写入通过注入的 GoodJob 领域端口完成。编排层不得绕过当前租户/用户数据范围，也不得直接操作 Store。
4. AI 写操作固定遵循：读取与权限检查 → 模型建议 → 结构化校验 → 暂停等待人工确认 → 确认主体校验 → 权限二次检查 → 幂等执行 → 审计。
5. `reject` 不执行写入；`rerun` 重新调用 ModelGateway 并再次暂停；`approve` 只有在权限复检通过后才能执行。
6. 每次写入使用稳定的幂等键。技术验证提供进程内原子 Effect Store；正式 MySQL 实现必须使用唯一键和事务保证，不能只依赖进程内 Map。
7. Checkpoint 只保存工作流所需的非密钥状态。模型配置仅保存配置 ID，运行时通过受控 Resolver 取回，禁止把 API Key 写入 LangGraph checkpoint、审计或公开结果。
8. 技术验证使用 LangGraph `MemorySaver`，验证同一进程内暂停/恢复。正式环境不假设存在可直接使用的官方 MySQL Checkpointer；优先由 GoodJob 管理 `workflow_runs`、`workflow_steps`、`workflow_approvals`、`workflow_effects`，在独立 ADR 和迁移演练通过后再接 MySQL。
9. 本循环不新增 HTTP API 和数据库表，不连接真实模型，不写真实 CRM 数据。Mock 外呼必须为 0。

## 失败退出条件

满足任一条件时，LangGraph.js 不进入后续生产路径，保留 `AiWorkflowEngine` 契约并改用 GoodJob 自有状态机：

- 无法证明未确认、驳回、越权写入为 0；
- 无法保证重复确认最多写入一次；
- 暂停后无法使用稳定 run/thread ID 恢复；
- Checkpoint 会持久化 API Key 或不可控敏感数据；
- 模型调用无法强制经过 `ModelGateway`；
- 依赖审计出现未处置的 High/Critical 漏洞；
- Node 22 / TypeScript 构建或现有门禁不兼容。

## MySQL 正式化策略

后续独立循环必须设计并演练：

- `workflow_runs`：租户、发起人、状态、版本、当前步骤、输入摘要；
- `workflow_steps`：节点、Trace ID、开始/结束、结果摘要、错误分类；
- `workflow_approvals`：审批人、决定、版本、时间和防重放信息；
- `workflow_effects`：稳定幂等键、pending/completed/failed、结果引用；
- 唯一键、事务、并发确认、崩溃恢复、保留期、脱敏、删除与审计查询；
- Schema/Graph 版本升级和旧运行恢复策略。

在以上设计和迁移测试完成前，`MemorySaver` 只能用于测试和本地技术验证。

## 测试与验收

- 首次测试必须在生产模块不存在或能力缺失时失败，保留 test-first 证据；
- 覆盖等待确认、采纳、驳回、重跑、重复确认、越权、恢复、非法模型输出、Trace 审计和 Secret 不入 checkpoint；
- 模型调用全部由 Mock `ModelGateway` 提供，真实 HTTP 外呼为 0；
- 模拟领域写入只能通过注入端口，并验证稳定幂等键；
- 注册/OpenAPI API 仍为 167，跨模块租户隔离仍为 18；
- `npm run verify`、`npm run test:e2e`、`npm run audit:dependencies`、仓库安全检查和 `git diff --check` 全部通过。

## 回滚

回滚 L-0011 代码 Commit，移除 LangGraph 依赖、`AiWorkflowEngine`、专项测试和测试脚本。由于没有 API、数据库或真实数据变化，无需数据回滚；既有 `ModelGateway` 和 GoodJob 业务保持不变。

## 后果

- LangGraph.js 被限制在可替换的编排层，GoodJob 的模型安全边界与领域规则不会被框架反向侵入。
- 阶段 4/5 可复用统一确认协议，但真实评分、Prompt/Eval、MySQL 恢复、权限矩阵和 UI 仍需后续独立需求。
- 新增依赖会扩大供应链与升级成本，必须持续执行依赖审计并记录版本兼容性。
