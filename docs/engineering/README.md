# GoodJob 工程治理索引

更新时间：2026-07-15

## 使用方式

每次开发从本目录开始：

1. 阅读 [项目状态](PROJECT_STATUS.md)；
2. 从 [功能台账](FEATURES.json) 选择一个 `ready` 项；
3. 检查 [追踪矩阵](TRACEABILITY.md) 和相关 [ADR](adr/)；
4. 实施并执行 [测试策略](TEST_STRATEGY.md)；
5. 更新 [实施日志](IMPLEMENTATION_LOG.md)、[风险登记册](RISK_REGISTER.md) 与 [交接文档](HANDOFF.md)。

## 文档职责

| 文档 | 作用 | 更新时机 |
|---|---|---|
| `DEVELOPMENT_PLAN.md` | 正式分阶段路线、验收和测试标准 | 阶段或门禁变化时 |
| `PROJECT_STATUS.md` | 面向项目跟进的单页状态 | 每个开发循环结束 |
| `FEATURES.json` | 可由人或 Agent 读取的原子功能台账 | 状态、范围或证据变化时 |
| `TRACEABILITY.md` | REQ→TASK→PR→TEST→RELEASE | 每个 PR 与 Release |
| `IMPLEMENTATION_LOG.md` | 决策、变更、验证的时间序列 | 每次开发循环 |
| `TEST_STRATEGY.md` | 分层测试和发布门禁 | 测试体系变化时 |
| `RISK_REGISTER.md` | 项目风险与处理状态 | 发现或关闭风险时 |
| `HANDOFF.md` | 下一会话立即可执行的上下文 | 每次会话结束 |
| `SKILL_EVALUATION.md` | 第三方开发 Skill 的采用/拒绝与安全评估 | 搜索或引入 Skill 时 |
| `adr/` | 长期架构决策 | 决策前创建，变更时追加 ADR |
| `evidence/` | 小型文本证据索引，不存大制品 | 验证与发布时 |

## 状态定义

- `backlog`：已登记，未满足开发准入条件。
- `ready`：需求、验收、依赖和测试已明确，可进入开发。
- `in_progress`：当前循环正在实施。
- `blocked`：存在已记录的外部阻塞。
- `verification`：实现完成，等待完整测试或验收。
- `done`：DoD 与证据链全部满足。

禁止使用“差不多完成”“基本完成”等不可验证状态。

## 状态信息优先级

开发续作发生冲突时，按以下顺序判断：

1. `git status` 与实际代码/测试；
2. `HANDOFF.md` 的当前会话检查点；
3. `PROJECT_STATUS.md` 与 `FEATURES.json`；
4. `IMPLEMENTATION_LOG.md`、`TRACEABILITY.md`、Evidence 与 ADR；
5. 根目录 `DEVELOPMENT_STATUS.md` 仅为历史业务基线快照，不代表当前阶段进度。

任何文档与代码不一致都应先登记并修正文档，禁止依据旧状态继续宣称完成。