# 开发与测试账号安全说明

更新时间：2026-07-13

## 原则

- 仓库不保存可用于生产环境的账号、密码、Token 或数据库凭证。
- `backend/src/data.ts` 中的账号只属于 memory store 的开发/自动化测试夹具。
- 自动化测试可以使用固定测试口令，但生产环境禁止启用 memory store，也禁止使用任何项目默认口令。
- 登录页面不预填账号或密码。

## 生产启动门禁

`NODE_ENV=production` 时，服务启动前强制检查：

- 必须提供 MySQL `DATABASE_URL` 或 `MYSQL_URL`；
- 禁止 `CRM_STORE=memory`；
- `JWT_SECRET` 至少 32 字符；
- `CORS_ORIGINS` 必须是明确域名，禁止 `*`；
- 禁止显式关闭 Secure Cookie；
- 如果提供首次管理员密码，至少 12 位且不能包含项目默认口令。

首次空数据库管理员由环境变量创建，真实值只能通过部署密钥系统注入，不写入 Git、Issue、PR、日志或截图。

## 安全测试

```bash
npm run test:repo-security
npm run test:security
```

仓库检查会阻止：

- 跟踪 `.env`；
- 跟踪账号/凭证说明文件；
- 提交私钥；
- 在 HTML 密码输入框中预填密码。

这不是完整的密钥扫描替代方案。迁移到 GitHub 后仍需启用平台 Secret Scanning，并对历史提交执行专用扫描。
