# 需求追踪矩阵

更新时间：2026-07-15

## 追踪规则

```text
OBJ → REQ/NFR → ADR/DESIGN → TASK → PR/COMMIT → TEST → BUILD → RELEASE → RETRO
```

- 每个 PR 至少关联一条 REQ 或 BUG。
- 每条 P0/P1 REQ 必须有测试证据。
- 状态为 `done` 前必须填写 Commit/PR、测试与交付证据。
- 现有 `TASK-*` 是长期追踪 ID；创建 GitHub Issue/PR 后追加映射，不删除原 ID。

## 当前矩阵

| REQ | ADR/设计 | TASK | 实现/PR | 测试 | 状态 |
|---|---|---|---|---|---|
| REQ-GJ-ENG-001 | ADR-0001 | TASK-GJ-0001 | Commit `3d7cce6` | `npm run verify`; `npm run test:e2e` 36/36 | Done |
| REQ-GJ-ENG-AUDIT-001 | ADR-0015；L-0016 证据 | TASK-GJ-0009 | Commit `cddd97f`；分支 `codex/phase-1-route-modularization` | 追踪 16/16、阶段 2 Done 7；`verify`；audit 0；E2E 37/37 | Done |
| REQ-GJ-SEC-001 | 风险 R-001；`DEVELOPMENT_ACCOUNTS.md` | TASK-GJ-0002 | 分支 `codex/phase-0-security-baseline` | 仓库安全检查；生产配置测试；`npm run verify`; E2E 36/36 | Verification |
| REQ-GJ-SEC-002 | ADR-0004；风险 R-010 | TASK-GJ-0004 | 分支 `codex/phase-0-workbook-security` | 依赖审计 0；工作簿安全测试；`npm run verify`；E2E 37/37 | Done |
| REQ-GJ-ARCH-001 | ADR-0005/0006/0007/0008；风险 R-004/R-005/R-006/R-011/R-012/R-013；L-0004~L-0009 证据 | TASK-GJ-0003 | Commit `4e25f1d` + `ff90350` + `3e5c5b3` + `dde131a` + `9160a90` + `59594d1`；分支 `codex/phase-1-route-modularization` | 九组独立路由/Gateway/Connector 测试；来源血缘；邮件/模型 Gateway；LeadSourceConnector；外联幂等；转化回滚；API 167；tenant isolation 18；`verify`；audit 0；E2E 37/37 | In progress |
| REQ-GJ-ARCH-002 | ADR-0012；风险 R-005/R-011；L-0013 证据 | TASK-GJ-0007 | Commit `a70359b`；分支 `codex/phase-1-route-modularization` | Memory/MySQL 同契约；21 条按行 SQL；commit 2/rollback 2；外联路由全量快照写 0；API 167；tenant 18；`verify`；audit 0；E2E 37/37 | Done |
| REQ-GJ-FE-001 | ADR-0009；风险 R-004/R-008；L-0010 证据 | TASK-GJ-0005 | Commit `487438b`；分支 `codex/phase-1-route-modularization` | 来源选择状态 8 组；4 个 API 客户端契约；self-test 41；API 167；tenant isolation 18；`verify`；audit 0；E2E 37/37 | Done |
| REQ-GJ-FE-PERF-001 | ADR-0014；风险 R-004/R-008；L-0015 证据 | TASK-GJ-0008 | Commit `1509f64`；分支 `codex/phase-1-route-modularization` | entry 1.90 kB；prototype 389.65 kB；workbook/XLSX/ECharts/ZRender lazy；self-test 44；API 167；tenant 18；`verify`；audit 0；E2E 37/37 | Done |
| REQ-GJ-AI-ORCH-001 | ADR-0010；风险 R-006/R-012/R-014；L-0011 证据 | TASK-GJ-0102 | Commit `356200a`；分支 `codex/phase-1-route-modularization` | 8 个工作流运行；暂停/恢复；确认/驳回/重跑；并发防重；权限复检；Secret 不入 checkpoint；Mock 外呼 0；API 167；tenant 18；`verify`；audit 0；E2E 37/37 | Done |
| REQ-GJ-SEC-003 | ADR-0011；风险 R-012/R-013；L-0012 证据 | TASK-GJ-0006 | Commit `a3e2dcc`；分支 `codex/phase-1-route-modularization` | Vault 加密/上下文/篡改/迁移/轮换/吊销/掩码；API 167；tenant 18；`verify`；audit 0；E2E 37/37 | Done |
| REQ-GJ-AI-PERSIST-001 | ADR-0013；风险 R-014；L-0014 证据 | TASK-GJ-0103 | Commit `9ab50b1`；分支 `codex/phase-1-route-modularization` | 6 表；跨实例恢复；并发 Effect 唯一；决策冲突失败关闭；权限复检；Secret 拒绝；API 167；tenant 18；`verify`；audit 0；E2E 37/37 | Done |
| REQ-GJ-AI-001 | ADR-0002/0007；L-0008 仅建立前置传输边界 | TASK-GJ-0101 | 前置边界 Commit `9160a90` | 已覆盖三协议传输、脱敏、SSRF、超时和错误分类；Prompt/Schema 版本、用量、重试、审计仍未完成 | Backlog |
| REQ-GJ-LEAD-001 | ADR-0003/0008/0016/0017/0018/0019；L-0009 前置边界；L-0017~L-0021 证据 | TASK-GJ-0201 | Commit `59594d1` + `308cb67` + `db6c711` + `3b0c366` + `c361a26`；Test-first `603c664` + `3058c32` + `33e508c`；分支 `codex/phase-3-lead-pipeline` | L-0017 管道；L-0018 CSV/XLSX/XLS；L-0019 Web 安全边界；L-0020 API Provider：分页/退避/预算/错误/checkpoint/血缘 PASS，credential leaks 0、duplicate writes 0、真实外呼 0；`verify` repository security 173、API 167、tenant 18；audit 0；E2E 37/37；L-0021 阶段验收 Ready | In progress |
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
