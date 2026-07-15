# L-0014 证据：AI 工作流 MySQL 持久化、恢复与并发幂等

- 日期：2026-07-15
- 关联：REQ-GJ-AI-PERSIST-001 / TASK-GJ-0103
- ADR：ADR-0013
- 基线 Commit：`24e77bb`
- 实现 Commit：`9ab50b1`
- 状态：本地 DoD 完成

## 范围

- 保留 LangGraph.js，引入符合 `BaseCheckpointSaver` 契约的 MySQL Checkpointer；
- 持久化工作流 run、checkpoint、pending writes、审批、Effect 与审计；
- 支持第二个 Engine 实例恢复、同一确认重放、冲突决策失败关闭和 Effect 租约恢复；
- 恢复校验 actor/tenant，业务 Effect 前再次鉴权；
- 持久化前递归拒绝 Secret；
- 不新增公开 AI API/UI，不连接真实模型、真实 MySQL 或生产凭证。

## Test-first 记录

1. 首次运行 `npm run test:workflow:persistence --workspace backend`，按预期因 `backend/src/ai/mysql-ai-workflow-persistence.js` 不存在而以 `ERR_MODULE_NOT_FOUND` 失败。
2. 实现后专项测试首先暴露 `getCheckpointId()` 在没有 checkpoint 时返回空字符串；Saver 原先把空字符串误当成待校验 checkpoint ID。修正为仅在读取到非空 ID 时校验，没有删除测试、跳过门禁或放宽产品断言。
3. 后端编译随后发现测试使用 `Array.fromAsync` 超出当前 TypeScript lib 目标；改为标准 `for await` 收集，产品实现与验收断言未变。
4. 专项测试、原 AI 工作流测试、完整 `verify`、37 条 E2E 和依赖审计最终全部通过。

## 实现与设计结果

- 新增六张独立表：`ai_workflow_runs`、`ai_workflow_checkpoints`、`ai_workflow_checkpoint_writes`、`ai_workflow_approvals`、`ai_workflow_effects`、`ai_workflow_audits`。
- `MysqlAiWorkflowCheckpointer` 实现 `getTuple/list/put/putWrites/deleteThread`；checkpoint、metadata 和 pending writes 使用 LangGraph Serializer，不自行解释内部状态。
- `deleteThread` 仅使用 `WHERE thread_id = ?` 的作用域删除；不存在无条件 DELETE、TRUNCATE 或全量快照替换。
- `AiWorkflowPersistence` 端口管理运行摘要、审批唯一决策和结构化审计；同一 run/attempt 只允许一个决策，同决策重放可继续，不同决策返回 `decision_conflict`。
- 第二个 Engine 共享数据库时可以读取暂停 checkpoint 并恢复；重复 start 使用原运行身份，不再次调用模型。
- `MysqlAiWorkflowEffectStore` 使用唯一稳定键 `ai-workflow:<runId>:apply`、executing/succeeded/failed 状态、租约与结果回读；并发 loser 读取成功结果而不再次形成逻辑 Effect。
- 过期租约或失败状态可按条件重新 claim；恢复仍以相同幂等键调用下游，覆盖数据库提交前后崩溃的不确定窗口。
- Checkpoint、metadata、pending write、run、approval、effect result、audit 写入前均执行 Secret 扫描；拒绝敏感键和 `Bearer`、`gjsec:v1`、常见 `sk-` 形态。
- MySQL Store 启动时创建工作流表；本 Loop 没有公开路由，因此现有 167 个 API 操作保持不变。

## 专项验收

```text
npm run test:workflow:persistence --workspace backend  PASS
  schema tables                   6
  cross-process recovery          true
  concurrent approvals            2
  conflicting decisions closed    true
  permission rechecked            true
  expired lease stable key        ai-workflow:crash-recovery:apply
  Secret persistence rejected     true
  checkpoint SQL statements       214
  full snapshot writes            0
  real outbound calls             0

npm run test:workflow:ai --workspace backend           PASS
  workflow runs                   8
  model calls                     8（全部 Mock）
  domain writes                   3
  duplicate approval writes       0
  unauthorized writes             0
  Secret in checkpoint            false
```

## 完整门禁

```text
npm run verify                     PASS
  repository security             PASS，141 tracked files
  dependency policy               PASS，LangGraph/Checkpoint/Core/Zod 精确版本和完整性
  OpenAPI operations               167
  cross-module tenant isolation    18
  backend/frontend build           PASS
  frontend production bundle       1,394.14 kB（风险 R-008 保留）

npm run test:e2e                   PASS，37/37（3.5 分钟）
npm run audit:dependencies         PASS，0 vulnerabilities
git diff --check                   PASS
真实 MySQL / 模型 / 外部平台调用   0
```

## 验收结论

- [x] 第二个 Engine 实例可从同一 MySQL 状态恢复暂停工作流；
- [x] 恢复校验 actor 与 tenant，业务 Effect 前重新鉴权；
- [x] 同一确认并发与重放只形成一个逻辑业务 Effect；
- [x] approve/reject 冲突由数据库唯一决策失败关闭；
- [x] crash/过期租约使用稳定幂等键恢复；
- [x] checkpoint、run、approval、effect、audit 均拒绝 Secret；
- [x] SQL 参数化，无全表 DELETE、TRUNCATE 或快照替换；
- [x] API 167、tenant isolation 18、E2E 37/37、audit 0 保持通过；
- [x] 真实外部调用与生产数据访问为 0。

## 风险与限制

- R-014 从“仅内存验证”推进为“MySQL 契约已实现并由 Fake Pool 验证”，但真实 MySQL 迁移、锁等待、连接中断和备份恢复演练仍未完成，因此保持 `Mitigating`，不能关闭。
- Generic Effect Store 无法替任意第三方系统单独保证 exactly-once；下游 `applyProposal` 仍必须接受并执行稳定幂等键。
- 本 Loop 没有开放 AI 路由和前端入口；它是阶段 4/5 AI 能力的可靠运行底座，不代表完整 AI 产品功能已交付。
- `ai_workflow_*` 表当前由启动期 `CREATE TABLE IF NOT EXISTS` 建立；正式发布前需纳入版本化迁移工具与回滚演练。

## 回滚

1. 优先前向修复 Saver/Persistence/Effect Store，不删除审批和幂等记录。
2. 必须回滚时先停止 AI 工作流入口，并确认没有 `executing` Effect。
3. 导出不含 Secret 的 run/effect 状态；保留 `ai_workflow_approvals` 和 `ai_workflow_effects`，防止旧请求重放。
4. 旧版若只支持 MemorySaver，不得恢复已有 MySQL run；应保持入口关闭直到兼容版本恢复。

## 下一步

- L-0015：前端模块化、动态导入、路由分包和主包性能门禁；
- L-0016：阶段 2 全量回归、追踪审计、风险复核、阶段验收与回顾。
