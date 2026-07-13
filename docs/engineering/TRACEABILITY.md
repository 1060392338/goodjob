# 需求追踪矩阵

更新时间：2026-07-13

## 追踪规则

```text
OBJ → REQ/NFR → ADR/DESIGN → TASK → PR/COMMIT → TEST → BUILD → RELEASE → RETRO
```

- 每个 PR 至少关联一条 REQ 或 BUG。
- 每条 P0/P1 REQ 必须有测试证据。
- 状态为 `done` 前必须填写 Commit/PR、测试与交付证据。
- 尚未创建 GitHub 远端时使用本表的临时 `TASK-*`，迁移后映射到 GitHub Issue 编号，不删除原 ID。

## 当前矩阵

| REQ | ADR/设计 | TASK | 实现/PR | 测试 | 状态 |
|---|---|---|---|---|---|
| REQ-GJ-ENG-001 | ADR-0001 | TASK-GJ-0001 | Commit `3d7cce6` | `npm run verify`; `npm run test:e2e` 36/36 | Done |
| REQ-GJ-SEC-001 | 风险 R-001；`DEVELOPMENT_ACCOUNTS.md` | TASK-GJ-0002 | 分支 `codex/phase-0-security-baseline` | 仓库安全检查；生产配置测试；`npm run verify`; E2E 36/36 | Verification |
| REQ-GJ-SEC-002 | ADR-0004；风险 R-010 | TASK-GJ-0004 | 分支 `codex/phase-0-workbook-security` | 依赖审计 0；工作簿安全测试；`npm run verify`；E2E 37/37 | Done |
| REQ-GJ-ARCH-001 | ADR-0005；风险 R-004 | TASK-GJ-0003 | 分支 `codex/phase-1-route-modularization`；L-0004 本循环提交 | `test:routes`; API 167；`verify`; E2E 37/37 | In progress |
| REQ-GJ-AI-001 | ADR-0002 | TASK-GJ-0101 | 待开始 | Gateway 契约与故障注入 | Backlog |
| REQ-GJ-LEAD-001 | ADR-0003 | TASK-GJ-0201 | 待开始 | Connector 契约与幂等 | Backlog |
| REQ-GJ-AI-LEAD-001 | ADR-0002 | TASK-GJ-0301 | 待开始 | 金标评测；注入防护 | Backlog |
| REQ-GJ-AI-ASSIST-001 | ADR-0002 | TASK-GJ-0401 | 待开始 | 权限矩阵；确认执行 | Backlog |
| REQ-GJ-COLLAB-001 | ADR-0003 | TASK-GJ-0501 | 待开始 | Adapter 契约；Webhook 安全 | Backlog |

## L-0002 未闭环项

- GitHub 历史 Secret Scan 结果；
- GitHub Actions Linux/Node 22 质量门禁结果；
- 已部署实例清单及账号、JWT、数据库、第三方凭证轮换记录；
- 目标 Commit/PR 与远端证据链接。

## 完整性检查

每个循环结束时检查：

- [x] REQ 有明确验收条件；
- [x] ADR/设计解释关键决策；
- [x] TASK 范围可在一个短分支完成；
- [ ] PR 关联 TASK/REQ；
- [x] 本地测试证据包含命令、环境和结果；
- [ ] BUILD 绑定远端 Commit SHA；
- [ ] Release 能反查全部 P0/P1 REQ。
