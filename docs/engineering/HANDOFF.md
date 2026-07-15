# 会话交接

更新时间：2026-07-15

## 当前工作位置

- 仓库：`C:\Users\Administrator\Documents\Codex\2026-07-13\hi\GoodJob`
- 分支：`codex/phase-1-route-modularization`
- GitHub：`https://github.com/1060392338/goodjob.git`
- L-0013 基线：`2f866cc`
- L-0013 实现 Commit：`a70359b`
- 禁止推送 Gitee `origin`。

## L-0013 已完成内容

1. 登记 `REQ-GJ-ARCH-002 / TASK-GJ-0007` 和 ADR-0012。
2. 建立 `LeadOutreachRepository` 领域端口、Memory/MySQL Adapter 与 MySQL Unit of Work。
3. 线索外联 pending、失败更新、社交完成、邮件完成改为参数化按行写入。
4. 社交和邮件完成使用多表事务；失败 rollback、成功 commit、连接始终 release。
5. 唯一键竞争回读现有请求；pending 条件更新防止重复完成。
6. lead 更新带 ID/Owner/Team/未删除条件；user 更新带 ID/Team 条件。
7. Repository 成功后才同步内存状态，失败时不污染 request/lead/user/activity。
8. `lead_outreach_requests` 已退出旧 `persistAll` 快照替换。
9. 未连接真实 MySQL、SMTP 或模型；真实外呼为 0。

## 不得隐式改变的边界

- GoodJob 原业务和当前页面仍是唯一基线，不进行 MVP 式推倒重写。
- L-0013 只迁移线索外联，不得宣称整个 `CrmStore` Repository 化完成。
- 其他领域仍使用 `persistAll`，R-005 保持 Mitigating。
- `lead_outreach_requests` 不得重新放回 `DELETE + INSERT` 快照替换。
- 邮件 pending 仍需后续运维查询、人工确认、受控重试和告警。
- LangGraph.js 只负责编排；模型调用必须经过 `ModelGateway`。
- 下一循环继续使用 Mock Gateway 和 Fake MySQL，不接真实凭证或生产数据。

## L-0013 测试证据

```text
npm run test:repository:lead-outreach --workspace backend  PASS
  memory/mysql contract, row SQL 21, commit 2, rollback 2
npm run test:routes:lead-outreach --workspace backend      PASS
  repository commit 10, full snapshot write 0
npm run verify                                             PASS
npm run test:security                                      PASS，API 167，tenant 18
npm run test:e2e                                           PASS，37/37
npm run audit:dependencies                                 PASS，0 vulnerabilities
npm run test:repo-security                                 PASS，135 tracked files
真实 MySQL/SMTP/模型外呼                                  0
```

完整 Test-first、事务、风险和回滚证据见 `docs/engineering/evidence/L-0013-repository-unit-of-work.md`。

## GitHub 交付规则

仅推送 GitHub：

```powershell
git -c http.proxy=http://127.0.0.1:7897 `
    -c https.proxy=http://127.0.0.1:7897 `
    push github codex/phase-1-route-modularization
```

不得执行 `git push origin`。

## 下一开发循环

L-0014：AI 工作流 MySQL 状态、恢复与并发幂等。

1. 先登记 REQ/TASK、ADR-0013、证据文件和 Test-first 失败。
2. 建立正式 Workflow Persistence Port 与 MySQL Adapter。
3. 持久化 workflow run、checkpoint、approval、effect、audit，不保存 API Key。
4. 验证跨进程恢复、崩溃恢复、发起人和权限复检。
5. 并发确认/重放只允许一次业务 Effect。
6. 保持 API 167、tenant isolation 18、E2E 37/37 和 audit 0。

## 持续风险

- R-004：`server.ts` 和 `prototype-api.ts` 仍需继续拆分。
- R-005：仅线索外联完成增量持久化；其他领域仍使用 `persistAll`。
- R-008：前端主包仍约 1.394 MB，L-0015 处理。
- R-011：pending 邮件缺少运维处置界面。
- R-012/R-013：真实部署仍需备份恢复、迁移状态和密钥托管验证。
- R-014：正式 AI 工作流 MySQL 状态、事务、并发和崩溃恢复未完成，L-0014 处理。
- GitHub Actions、历史 Secret Scan、分支保护和部署凭证轮换尚未闭环。
