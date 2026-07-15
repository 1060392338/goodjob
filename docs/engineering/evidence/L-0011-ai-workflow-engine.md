# L-0011 交付证据：LangGraph.js 与 AiWorkflowEngine 技术验证

- 日期：2026-07-15
- 分支：`codex/phase-1-route-modularization`
- 关联：`REQ-GJ-AI-ORCH-001 / TASK-GJ-0102`
- 关联架构：`REQ-GJ-ARCH-001 / TASK-GJ-0003`、ADR-0007
- 基线 Commit：`c2c1e52`
- 实现 Commit：`356200a`
- 设计：`ADR-0010`
- 状态：本地 DoD 完成

## Orient / Select

L-0011 只验证一条受控线索评分工作流，不新增产品 API、数据库或前端页面。目标是确认 LangGraph.js 能否在不侵入 GoodJob 模型安全边界和领域规则的前提下，承担状态图、暂停、恢复和人工决定编排。

## DoR

- [x] 已登记 `REQ-GJ-AI-ORCH-001 / TASK-GJ-0102`。
- [x] ADR-0010 已冻结 LangGraph、ModelGateway、领域端口、Checkpoint、MySQL 正式化和失败退出条件。
- [x] 模型、线索、写入和审计全部可注入；只使用 Mock。
- [x] 验收包含未确认/驳回/越权写入为 0、重复确认防重、暂停恢复、Trace 审计和 Secret 不入 Checkpoint。
- [x] 无真实凭证、真实 CRM 数据、HTTP API、数据库迁移、协作平台或前端改造。

## Test first

先创建 `backend/src/ai/ai-workflow-engine-test.ts` 并运行。首次按预期失败：`ERR_MODULE_NOT_FOUND`，因为生产模块尚不存在，证明专项测试在实现前生效。

实现后首次 TypeScript 构建发现测试中的审计事件列表被推断为普通字符串数组；修正为 `AiWorkflowAuditEvent["type"][]` 后通过。未删除测试、跳过门禁或放宽业务断言。

## 实现

### `AiWorkflowEngine`

工作流固定为：

```text
发起运行
→ 读取权限检查
→ 读取线索
→ ModelGateway Mock 评分
→ Zod 严格结构校验
→ 暂停等待人工决定
   ├─ reject → 结束且写入 0
   ├─ rerun  → 重新评分并再次暂停
   └─ approve
      → 校验恢复主体
      → 写入权限二次检查
      → 稳定幂等键执行模拟领域写入
      → 审计并完成
```

实现边界：

- LangGraph.js 只负责编排、中断和恢复；
- 模型调用只能经过 `ModelGateway`；
- 模型配置由 Resolver 按配置 ID 和用户/租户运行时读取；
- Checkpoint 保存配置 ID，不保存 API Key；
- 领域读、权限和写入均由 GoodJob 注入端口负责；
- `ai-workflow:<runId>:apply` 是稳定 Effect 幂等键；
- 顺序重复确认直接返回终态，并发重复确认由 Effect Store 合并为一次执行；
- 审计覆盖 workflow、permission、lead、model、proposal、approval、effect 和 failure。

### 依赖与供应链

精确锁定：

- `@langchain/langgraph@1.4.8`
- `@langchain/langgraph-checkpoint@1.1.3`（锁文件传递依赖）
- `@langchain/core@1.1.48`
- `zod@3.25.76`

依赖策略检查验证声明版本、锁文件版本和 SHA-512 完整性。依赖审计最终为 0 vulnerabilities。

## 专项验收结果

| 验收项 | 结果 |
|---|---|
| 人工确认前写入 | 0 |
| 驳回写入 | 0 |
| 写权限撤销后写入 | 0 |
| 读取越权后的模型调用 | 0 |
| 顺序重复确认额外写入 | 0 |
| 并发重复确认额外写入 | 0 |
| 暂停后新 Engine 实例恢复 | PASS |
| rerun 后再次暂停并使用新建议 | PASS |
| 非原发起人恢复 | 拒绝 |
| 非法模型 JSON | 在确认和写入前拒绝 |
| Checkpoint 中 API Key | 0 |
| 审计事件缺失 Trace ID | 0 |
| 真实模型 HTTP 外呼 | 0 |
| 真实 CRM 写入 | 0 |

专项运行汇总：8 个工作流运行、8 次 Mock ModelGateway 调用、3 次受控模拟写入。

## 完整验证证据

| 命令 | 结果 |
|---|---|
| `npm run test:workflow:ai --workspace backend` | PASS；暂停/恢复、采纳/驳回/重跑、权限、顺序/并发防重、审计、Secret 检查 |
| `npm run build --workspace backend` | PASS |
| `npm run test:dependency-policy` | PASS；4 个 AI 工作流依赖版本与完整性锁定 |
| `npm run verify` | PASS；API 167；跨模块租户隔离 18；双端测试与构建通过 |
| `npm run test:e2e` | 最终 PASS；Playwright 37/37 |
| `npm run audit:dependencies` | 最终 PASS；0 vulnerabilities |
| `npm run test:repo-security` | PASS；代码暂存 129 files；闭环文档暂存后最终 130 files |
| `git diff --cached --check` | PASS |

### 中间异常留痕

- E2E 首次运行在通过 33 条后，Playwright 进程以 Windows `4294967295` 异常退出，没有产品断言失败；中断运行留下约 571 MB Trace。清理该次临时制品后使用原命令重跑，37/37 通过。
- 依赖审计有一次在访问 npm audit endpoint 时发生 TLS 连接中断；未修改依赖或门禁，随后使用同一锁文件重跑通过。

## Review

- 权限：发起时检查读取权限；确认恢复校验用户和租户；写入前再次检查写权限。
- 数据：只使用测试内 Mock 线索；无真实客户数据和数据库变化。
- 模型：只使用 Mock `ModelGateway`；节点未导入任何模型厂商 SDK。
- Secret：模型 Key 只存在于运行时 Resolver 返回值；公开 Snapshot、审计和 Checkpoint 均不包含。
- 幂等：稳定键和原子 Effect Store 覆盖顺序与并发重复确认；正式 MySQL 仍需唯一键和事务。
- 恢复：MemorySaver 证明同进程共享 Checkpointer 时可由新 Engine 实例恢复；不代表跨进程/重启/MySQL 已完成。
- 兼容：无 API、数据库、前端和现有业务语义变化；API 仍为 167。
- 供应链：新增依赖已精确锁定、完整性检查和 audit 0；后续升级必须更新 ADR/门禁证据。

## 未完成与风险

- `MemorySaver` 仅允许测试和本地验证，不能用于正式环境；
- MySQL `workflow_runs/steps/approvals/effects`、事务、并发、崩溃恢复和版本迁移未实现；
- R-012 模型 Key、R-013 来源 Key 仍为明文 at-rest；
- Prompt/Schema 版本、成本、重试、Golden Eval 和注入防护仍属阶段 4；
- 真实线索评分 API、前端预览/确认和审计查询界面尚未实现；
- 钉钉、企微、飞书仍只保留未来 Adapter 入口。

## 回滚

回滚实现 Commit `356200a`，移除 LangGraph 依赖、工作流模块、专项测试和依赖策略扩展。无 API、数据库或真实数据变化，无需数据回滚；既有 `ModelGateway` 和 GoodJob 业务保持不变。

## 下一步

建议 L-0012 先建立模型/来源凭证 `SecretVault` 边界与迁移策略，关闭真实凭证接入前的 R-012/R-013 前置风险；之后再把 `AiWorkflowEngine` 接入线索评分预览、人工确认和审计查询 API。
