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
| REQ-GJ-ENG-001 | ADR-0001 | TASK-GJ-0001 | 当前分支 | `npm run verify`; `npm run test:e2e` | 进行中 |
| REQ-GJ-SEC-001 | 风险 R-001 | TASK-GJ-0002 | 待开始 | 密钥扫描；安全测试 | Ready |
| REQ-GJ-ARCH-001 | 待新增 ADR | TASK-GJ-0003 | 待开始 | API 回归；权限回归 | Backlog |
| REQ-GJ-AI-001 | ADR-0002 | TASK-GJ-0101 | 待开始 | Gateway 契约与故障注入 | Backlog |
| REQ-GJ-LEAD-001 | ADR-0003 | TASK-GJ-0201 | 待开始 | Connector 契约与幂等 | Backlog |
| REQ-GJ-AI-LEAD-001 | ADR-0002 | TASK-GJ-0301 | 待开始 | 金标评测；注入防护 | Backlog |
| REQ-GJ-AI-ASSIST-001 | ADR-0002 | TASK-GJ-0401 | 待开始 | 权限矩阵；确认执行 | Backlog |
| REQ-GJ-COLLAB-001 | ADR-0003 | TASK-GJ-0501 | 待开始 | Adapter 契约；Webhook 安全 | Backlog |

## 完整性检查

每个循环结束时检查：

- [ ] REQ 有明确验收条件；
- [ ] ADR/设计解释关键决策；
- [ ] TASK 范围可在一个短分支完成；
- [ ] PR 关联 TASK/REQ；
- [ ] 测试报告包含命令、环境、结果和失败项；
- [ ] BUILD 绑定 Commit SHA；
- [ ] Release 能反查全部 P0/P1 REQ。
