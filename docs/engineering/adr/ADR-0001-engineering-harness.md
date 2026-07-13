# ADR-0001：采用 Harness Engineering 与 Loop Engineering 开发闭环

- 状态：Accepted
- 日期：2026-07-13

## 背景

项目将由 1–3 人及 AI Agent 持续推进。单靠聊天上下文和零散说明无法保证跨会话可维护、可回溯和可验收。

## 决策

- 使用 `AGENTS.md` 作为持久协作契约。
- 使用机器可读 `FEATURES.json` 管理原子功能和验收条件。
- 每次只推进一个满足 DoR 的任务，执行 Orient→Select→Plan→Implement→Verify→Review→Record 闭环。
- 项目状态、实施日志、风险、追踪矩阵、测试证据与交接文档是强制交付物。
- 没有新鲜验证证据不得声明完成。

## 后果

- 增加少量文档维护成本；换取跨人员、跨 Agent、跨会话的一致性。
- 文档过期被视为工程缺陷。
- PR 需要同时更新代码、测试和项目状态。
