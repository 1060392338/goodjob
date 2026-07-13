# L-0002 默认凭证与运行时安全证据

- 日期：2026-07-13
- 分支：`codex/phase-0-security-baseline`
- 基线提交：`3d7cce6`
- 交付提交：本循环提交（提交后由 Git 历史反查）
- 本地环境：Windows；Node `v24.14.0`；npm `11.9.0`

## 变更

- 删除跟踪的管理员账号说明文件。
- 清除两个登录入口的账号和密码预填。
- 增加生产运行时安全配置校验。
- 增加仓库安全检查并纳入统一验证。
- 增加安全配置回归测试和开发账号安全说明。

## 验证

| 命令/场景 | 结果 |
|---|---|
| `npm run verify` | PASS：仓库检查、后端 self-test、前端 self-test、安全测试、前后端构建全部通过 |
| `npm run test:e2e` | PASS：Playwright Chromium 36/36 |
| `npm run test:repo-security` | PASS |
| `git diff --check` | PASS |
| `NODE_ENV=production + CRM_STORE=memory + 弱 JWT + CORS=* + SESSION_COOKIE_SECURE=false` 启动 | 按预期失败，exit code 1；返回数据库、JWT、CORS、Secure Cookie 和首次管理员密码错误码 |

## 验收判断

代码侧安全处置通过，但 `REQ-GJ-SEC-001` 保持 `verification`，原因是仓库本地验证不能证明 Git 历史和已部署实例中的凭证已失效。

## 遗留

- 需要在 GitHub 远端执行历史密钥扫描并归档结果。
- 需要在 GitHub Actions Linux/Node 22 环境实跑质量门禁。
- 需要项目负责人确认是否存在部署实例；若存在，轮换账号、JWT、数据库和第三方凭证。
- `xlsx` 高危漏洞由 `REQ-GJ-SEC-002` 跟踪。
