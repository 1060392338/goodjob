# 会话交接

更新时间：2026-07-15

## 当前工作位置

- 仓库：`C:\Users\Administrator\Documents\Codex\2026-07-13\hi\GoodJob`
- 分支：`codex/phase-1-route-modularization`
- GitHub：`https://github.com/1060392338/goodjob.git`
- 当前完成 Commit：`9ab50b1`（L-0014 实现）
- 当前 Loop：L-0015
- 禁止推送 Gitee `origin`。

## L-0014 已完成内容

1. 登记 `REQ-GJ-AI-PERSIST-001 / TASK-GJ-0103` 与 ADR-0013。
2. 建立符合 LangGraph `BaseCheckpointSaver` 的 MySQL Checkpointer。
3. 新增 run/checkpoint/write/approval/effect/audit 六张表。
4. 第二个 Engine 实例可恢复暂停工作流；重复 start 不重复调用模型。
5. actor/tenant 恢复校验和业务 Effect 前权限复检保持有效。
6. 同一 run/attempt 唯一决策；同决策可重放，不同决策抛 `decision_conflict`。
7. Effect 使用稳定键、状态、结果回读和过期租约恢复；下游继续以相同 key 防重。
8. 所有持久化面写前递归拒绝 Secret；SQL 参数化，无全表 DELETE/TRUNCATE/快照替换。
9. 实现 Commit：`9ab50b1`；证据：`docs/engineering/evidence/L-0014-ai-workflow-mysql-persistence.md`。

## 已通过门禁

```text
npm run test:workflow:persistence --workspace backend  PASS
npm run test:workflow:ai --workspace backend           PASS
npm run verify                                         PASS
npm run test:e2e                                       PASS，37/37（3.5 分钟）
npm run audit:dependencies                             PASS，0
API operations                                         167
tenant isolation                                       18
真实模型/MySQL/外部平台调用                            0
```

## 当前下一步：L-0015

目标：前端模块化、动态导入、路由分包和主包性能门禁。

执行顺序：

1. 记录当前 bundle 文件、raw/gzip 大小和模块组成基线；
2. Test-first 建立 bundle budget/路由 chunk 验收脚本；
3. 按现有路由或页面注册方式引入 `React.lazy`/动态 import；
4. 将工作簿、演示导出等重依赖移出首屏路径；
5. 增加稳定 manual chunks，避免 vendor 与业务全部回到单主包；
6. 运行 frontend self-test/build、完整 verify、37 条 E2E、audit；
7. 更新 REQ/TASK/ADR/风险/证据/回滚并提交。

## 持续风险

- R-005：其他旧领域仍可能使用 `persistAll`，L-0013 只完成线索外联切片。
- R-008：当前前端主包约 1,394.14 kB / gzip 444.16 kB，L-0015 处理。
- R-011：邮件 pending 运维处置界面未完成。
- R-012/R-013：SecretVault 真实部署、备份恢复和托管验证未完成。
- R-014：MySQL 契约已完成，但真实 MySQL 迁移、锁等待、断连和备份恢复演练仍需后续验证。
- GitHub Actions、历史 Secret Scan、分支保护和部署凭证轮换尚未闭环。
