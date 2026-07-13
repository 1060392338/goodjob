# L-0004 后端路由模块化第一批证据

- 日期：2026-07-13
- 分支：`codex/phase-1-route-modularization`
- 基线提交：`d66eee4`
- 交付提交：`4e25f1d`
- 关联：`REQ-GJ-ARCH-001 / TASK-GJ-0003`
- 设计：`ADR-0005`
- 本地环境：Windows；Node `v24.14.0`；npm `11.9.0`

## 本批迁移范围

| 原端点 | 新模块 | 行为约束 |
|---|---|---|
| `GET /api/health` | `backend/src/routes/system-routes.ts` | 响应结构与 Store mode 不变 |
| `POST /api/auth/login` | `backend/src/routes/auth-routes.ts` | 登录限流、密码升级、JWT、CSRF Cookie 和 no-store 不变 |
| `POST /api/auth/logout` | `backend/src/routes/auth-routes.ts` | 清理 Cookie、响应和缓存头不变 |
| `GET /api/auth/me` | `backend/src/routes/auth-routes.ts` | requireAuth、用户响应和缓存头不变 |

同时提取 `backend/src/http/async-route.ts`，作为后续路由模块共用的异步错误转发边界。`server.ts` 继续作为 Composition Root，显式注册模块，不允许模块反向导入全局 app。

## 独立测试

`backend/src/routes/routes-test.ts` 使用最小 Express 应用独立注册系统与认证模块，覆盖：

- health 200 与 memory store 响应；
- 非法登录参数 400；
- 错误密码 401；
- 邮箱规范化、正确登录 200、Token/CSRF/Cookie/no-store；
- Bearer Token 访问当前用户 200；
- 未认证访问 401；
- 退出 200 与 no-store。

## 验证结果

| 命令/指标 | 结果 |
|---|---|
| `npm run test:routes` | PASS |
| `npm run test:security` | PASS；OpenAPI/注册路由操作均为 167 |
| `npm run verify` | PASS |
| `npm run test:e2e` | PASS，37/37 |
| 后端 TypeScript 构建 | PASS |
| `server.ts` 规模 | 约 7034 行降至 6990 行；4 个 API 操作移出内联区 |

## 审查结论

- 未修改 URL、HTTP 方法、状态码、响应结构或权限语义；
- Swagger 仍能识别全部 167 个 API 操作；安全测试增加 167 操作基线锁；
- 未引入新生产依赖、数据迁移或外部调用；
- 回滚方式为撤销本循环提交，恢复原内联路由块；
- `REQ-GJ-ARCH-001` 继续保持 `in_progress`，因为客户、线索、AI 和集成路由尚未完成模块化。

## 已知风险与下一批

- `server.ts` 仍然很大，R-004 仅进入缓解中，尚未关闭；
- 下一批优先拆分客户路由，并先提取客户数据范围/映射服务测试；
- 前端 `prototype-api.ts` 拆分另设 Loop，避免与后端客户迁移同时扩大影响面。
