# 会话交接

更新时间：2026-07-13

## 当前工作位置

- 仓库：GoodJob 本地克隆
- 分支：`codex/phase-0-security-baseline`
- 基线：`3d7cce6`
- 当前循环：L-0002
- 需求/任务：`REQ-GJ-SEC-001 / TASK-GJ-0002`

## 已完成但尚待提交

- 删除跟踪的管理员账号说明文件。
- 清除两个登录入口的账号/密码预填。
- 新增生产运行时安全配置校验，并在服务启动前执行。
- 新增安全配置测试和仓库敏感文件检查。
- 根 `verify` 已包含仓库安全检查。
- 新增开发账号安全说明与 L-0002 验证证据。
- 本地 `npm run verify` 通过；Playwright E2E 36/36 通过。

## L-0002 仍需外部闭环

1. 获得 GitHub 目标仓库与权限后执行历史 Secret Scan。
2. 在 GitHub Actions 的 Linux/Node 22 环境运行质量门禁。
3. 确认是否存在部署实例；若存在，轮换账号、JWT、数据库与第三方凭证。
4. 将远端 Commit/PR、扫描、轮换和 CI 证据补入追踪矩阵。

因此 `REQ-GJ-SEC-001` 保持 `verification`，不能标记 `done`。

## 下一开发循环

`REQ-GJ-SEC-002 / TASK-GJ-0004`：替换 `xlsx` 高危依赖。

验收要求：

- 生产代码和锁文件不再依赖存在已知 High 漏洞的 `xlsx`；
- 客户导入导出、题库导入以及现有 E2E 行为兼容；
- 对恶意工作簿、原型污染与资源耗尽风险增加测试；
- `npm audit --audit-level=high --registry=https://registry.npmjs.org` 不再报告该漏洞；
- 完整更新功能台账、风险、追踪、实施日志和证据。

## 已知注意事项

- `npm ci` 可能触发 WhatsApp/Puppeteer 大型浏览器下载；CI 使用 `PUPPETEER_SKIP_DOWNLOAD=true`。
- `server.ts` 和 `prototype-api.ts` 很大，禁止在没有回归证据前直接大规模重构。
- 本地 Node 可能为 24，CI 目标为 Node 22，必须保留远端兼容验证项。
