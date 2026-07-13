# L-0001 基线验证证据

- 日期：2026-07-13
- 分支：`codex/phase-0-engineering-harness`
- 基线 Commit：`9f7d154`
- 环境：Windows / PowerShell / Node v24.14.0 / npm 11.9.0

## 变更前

| 命令 | 结果 | 说明 |
|---|---|---|
| `npm run build` | PASS | 前后端构建通过；前端主包约 1.3 MB，有拆包警告 |
| `npm test` | FAIL | Windows 不识别 `NODE_ENV=test`，尚未进入业务测试 |

## 变更后

| 命令 | 结果 | 证据摘要 |
|---|---|---|
| `npm run verify` | PASS | 后端 self-test、前端 self-test、安全测试、前后端构建全部通过 |
| `npm run test:e2e` | PASS | Playwright 36/36 用例通过，耗时约 2.8 分钟 |
| `npm audit --audit-level=high --registry=https://registry.npmjs.org` | FAIL | `xlsx` 发现 1 个 High 漏洞且无可用修复；登记 R-010 / REQ-GJ-SEC-002 |

## 已知非阻断警告

- Vite 构建提示主 JavaScript Chunk 大于 500 kB，已登记 R-008。
- GitHub Actions 尚未在远端运行，原因是目标 GitHub 仓库尚未配置。

## 结论

L-0001 的本地功能、构建、安全测试与 E2E 验证完成；依赖安全问题不隐藏，转入独立 P0 安全任务处理。
