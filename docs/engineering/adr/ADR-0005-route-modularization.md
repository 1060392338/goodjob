# ADR-0005：渐进式后端路由模块化

- 状态：Accepted
- 日期：2026-07-13
- 关联：`REQ-GJ-ARCH-001 / TASK-GJ-0003`
- 首个实施循环：`L-0004`

## 背景

`backend/src/server.ts` 同时承担运行时配置、全局中间件、167 个 API 操作、领域规则、外部服务调用、错误处理和进程启动。文件超过 7000 个物理行，任何功能改动都具有较大的回归、冲突和审查成本。后续 Model Gateway、LeadSourceConnector 及钉钉/企微/飞书 Adapter 不能继续堆叠在该文件中。

## 决策

1. 采用**渐进式搬迁**，禁止一次性重写。每个 Loop 只迁移一个低耦合领域切片，并保持 URL、HTTP 方法、状态码、响应结构、权限和中间件顺序不变。
2. `server.ts` 暂时保留 Composition Root 职责：加载环境、全局安全中间件、限流器、Store 启动、Swagger、错误处理和进程生命周期。
3. 领域路由放入 `backend/src/routes/`，导出显式注册函数，不得导入或启动全局 `app`。注册函数接收 Composition Root 提供的 Express Application 和依赖，使既有 Swagger/API 基线仍能识别完整路由。
4. 共享 HTTP 机制放入 `backend/src/http/`；跨领域依赖通过显式参数或稳定服务模块提供，避免路由模块之间相互导入。
5. 第一批迁移系统健康检查和认证路由；后续顺序为客户、线索、AI、外部集成。每批均需独立路由集成测试、全量 API/security 回归和证据文档。
6. Model Gateway、LeadSourceConnector、Collaboration Adapter 必须进入独立目录和契约，不得回填到 `server.ts`。

## 模块装配约定

```text
server.ts (Composition Root)
  ├─ global middleware / rate limits / store startup
  ├─ registerSystemRoutes(app)
  ├─ registerAuthRoutes(app, { loginLimiter })
  ├─ future domain routers
  ├─ Swagger
  └─ common error handler
```

每个路由注册模块必须满足：

- 可由最小 Express 测试应用独立注册；
- 输入校验和错误通过统一错误处理中间件；
- 不改变既有认证、数据范围与审计语义；
- 有清晰前缀、依赖和测试入口；
- 可通过删除装配并恢复原内联块快速回滚。

## 验收与回滚

单个迁移切片只有同时满足以下条件才可提交：

- 路由级集成测试通过；
- 后端 self-test 与 security test 通过；
- OpenAPI 操作数量仍为 167；
- 全量 Playwright P0 流程通过；
- 文档记录迁移端点、命令、结果、风险和 Commit。

若出现契约或权限回归，回滚该切片 Commit；不得通过修改测试预期来接受非计划行为变化。

## 后果

- 短期内新旧路由并存，`server.ts` 仍然较大，但每个循环都有可验证的净拆分。
- 路由模块先复用现有 Store 与认证服务，后续再把领域服务从路由中提取，避免同时改变结构和业务行为。
- 独立路由测试成为 `npm run verify` 的强制门禁。
