# GH-0001：GitHub 仓库初始化与首轮推送证据

日期：2026-07-14
关联：`REQ-GJ-SEC-001`、风险 `R-009`

## 目标

在不改变 Gitee 业务基线的前提下，建立 GitHub 协作远端并验证提交一致性，为 Pull Request、Linux CI、Secret Scan 和分支保护提供远端基础。

## 决策

- `origin` 保持指向 Gitee：`https://gitee.com/sendoh-huang/GoodJob.git`。
- 新增 `github` 远端：`https://github.com/1060392338/goodjob.git`。
- 不重写历史、不强制推送、不删除 Gitee 分支。
- GitHub 仓库当前为 Public；可见性变更必须作为独立权限决策处理。

## 推送结果

| 分支 | Commit | 结果 |
|---|---|---|
| `master` | `9f7d1542713f4ffa104a855a8cb15b09f5768c31` | 已推送 |
| `codex/phase-1-route-modularization` | `6cdd169dbdc11257c41e6adef47d15fc394408b3` | 已推送并建立跟踪 |

## 验证

```text
git ls-remote --heads github
6cdd169dbdc11257c41e6adef47d15fc394408b3 refs/heads/codex/phase-1-route-modularization
9f7d1542713f4ffa104a855a8cb15b09f5768c31 refs/heads/master

local=6cdd169dbdc11257c41e6adef47d15fc394408b3
remote=6cdd169dbdc11257c41e6adef47d15fc394408b3
REMOTE_COMMIT_MATCH=PASS
```

GitHub 页面确认：

- 默认分支：`master`；
- 代码与 LICENSE 可浏览；
- 仓库标记：Public repository。

## 尚未完成

- Pull Request 质量门禁实跑；
- Linux/Node 22 `verify` 与 E2E 结果；
- Git 历史 Secret Scan；
- 分支保护与必需检查；
- 部署实例清单和历史凭证轮换确认。

因此 `REQ-GJ-SEC-001` 继续保持 `verification`，`R-009` 仅从 Blocked 转为 Mitigating。
