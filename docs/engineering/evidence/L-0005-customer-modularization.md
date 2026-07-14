# L-0005 客户路由与领域服务模块化证据

- 日期：2026-07-14
- 关联需求/任务：`REQ-GJ-ARCH-001 / TASK-GJ-0003`
- 风险：`R-004`
- 基线 Commit：`16baac4`
- 分支：`codex/phase-1-route-modularization`
- 设计依据：`ADR-0005`
- 状态：Completed locally；交付 Commit 待回填

## Orient / 范围冻结

本循环只迁移以下现有 API，不新增、删除或重命名 API：

1. `GET /api/customers`
2. `POST /api/customers`
3. `PATCH /api/customers/:id`
4. `POST /api/customers/bulk-delete`
5. `POST /api/customers/:id/activities`

`server.ts` 继续作为 Composition Root；客户路由使用显式注册函数；客户服务复用现有 Store 与权限函数。线索、商机、AI、协作平台和数据模型不在本循环扩展范围内。

## 现有行为基线

- 客户列表通过 `canSeeOwner` 按本人/团队/全局范围过滤。
- 创建客户强制绑定当前用户 `ownerId` 与 `teamId`。
- 更新不可见客户返回 `404` 和原消息。
- 批量删除只删除可见客户，并级联清理客户活动、商机、商机事件，以及当前用户与已删除客户名称相关的待办。
- 客户活动写入操作者、提醒和时间；提醒非空时同步更新客户。
- 客户响应包含 owner、活动和活跃商机派生字段。

## 实施计划

1. 新增 `domain/customers/customer-service.ts`，集中客户数据范围、写入、级联清理、活动和响应聚合。
2. 新增 `routes/customer-routes.ts`，保留 Zod 校验、HTTP 状态码和原响应契约。
3. `server.ts` 仅显式调用 `registerCustomerRoutes(app)`，并复用导出的客户聚合函数服务线索转客户响应。
4. 扩展独立路由测试，使用隔离 Store 覆盖角色范围、越权、持久化和关联清理。
5. 运行专项与全量门禁，记录输出、风险和回滚点。

## 验收标准

- [x] 5 个客户 API 全部迁出 `server.ts`。
- [x] URL、方法、状态码、错误消息和响应 JSON 保持兼容。
- [x] sales 仅访问本人客户；manager/admin 仅访问本团队；super_admin 全局访问。
- [x] 跨负责人或跨团队更新/活动保持原 404 行为。
- [x] 批量删除关联清理和“仅处理可见客户”语义不变。
- [x] 创建、更新、删除、活动均按原行为调用持久化。
- [x] OpenAPI 与注册 API 操作数均为 167。
- [x] `server.ts` 物理行数净下降，无新生产依赖、无数据迁移。
- [x] `REQ-GJ-ARCH-001` 保持 `in_progress`。

## 测试矩阵

| 层级 | 场景 | 标准 |
|---|---|---|
| 路由集成 | 未认证访问 | 401 |
| 路由集成 | sales/manager/super_admin 列表范围 | 与 `canSeeOwner` 既有规则一致 |
| 路由集成 | 创建客户 | owner/team 自动绑定；默认字段和响应聚合正确；persist +1 |
| 路由集成 | 更新本人/不可见客户 | 成功/404；不可见数据不变 |
| 路由集成 | 批量删除与越权混合 ID | 仅删除可见客户；关联活动/商机/事件/本人待办按原规则清理 |
| 路由集成 | 添加活动 | 活动、操作者、提醒、聚合响应正确；persist +1 |
| 契约/安全 | API 注册与 OpenAPI | 167/167 |
| 全量 | self-test/security/build | `npm run verify` PASS |
| E2E | 现有 P0 流程 | 37/37 |

## 回滚

本切片无数据迁移。若出现权限、响应或级联清理回归，回滚 L-0005 代码 Commit 即恢复 `server.ts` 原内联实现；不得通过放宽测试接受非计划行为。

## 实施结果

### 代码边界

- 新增 `backend/src/domain/customers/customer-service.ts`：客户范围过滤、创建、更新、批量删除关联清理、活动写入与客户响应聚合。
- 新增 `backend/src/routes/customer-routes.ts`：5 个客户 API 的 Zod 校验、认证、状态码和响应契约。
- 新增 `backend/src/routes/customer-routes-test.ts`：使用隔离 Store 验证角色范围、越权、持久化和级联清理。
- `backend/src/server.ts` 仅保留 `registerCustomerRoutes(app)` 装配，并从客户服务复用 `customerWithPipeline` 供线索转客户响应使用。
- `server.ts` 从基线 6990 行降至 6850 行，净减少 140 行；内联客户 API 为 0，显式注册调用为 1。
- 未增加生产依赖，未修改数据模型，未执行数据迁移，未增加外部调用。

### 专项测试

`npm run test:routes`：PASS。

- 核心系统/认证路由测试通过。
- 5 个客户路由独立测试通过。
- sales 仅见本人客户；manager/admin 仅见本团队；super_admin 可见全部测试客户。
- 创建自动绑定 owner/team；更新与活动越权返回原 404。
- 批量删除只处理可见客户，客户活动、商机、商机事件和当前用户相关待办按原规则清理。
- 测试 Store 共记录 4 次预期持久化，无失败路径误持久化。

### 全量验证

| 命令 | 结果 |
|---|---|
| `npm run test:routes` | PASS |
| `npm run test` | PASS；backend self-test + frontend 39 checks |
| `npm run test:security` | PASS；OpenAPI/注册操作 167；跨模块租户隔离 18 |
| `npm run verify` | PASS；仓库安全、依赖策略、路由、self-test、安全、工作簿、前后端构建全部通过 |
| `npm run test:e2e` | PASS；Chromium 37/37 |
| `git diff --check` | PASS |

前端构建仍报告约 1.394 MB 主包警告，该问题未由本循环引入，继续由 R-008 跟踪。

## Review / 风险复核

- 权限与数据范围：专项角色矩阵、现有 security test 和 E2E 均通过。
- API 契约：操作数保持 167；URL、方法、状态码和错误消息未改变。
- 数据：批量删除级联行为和客户活动持久化保持原实现；无迁移。
- 回滚：L-0005 为单一可回滚切片；回滚交付 Commit 即恢复内联实现。
- 剩余架构风险：R-004 继续为 Mitigating，后续 L-0006 迁移线索边界。
- 外部阻塞：未配置 GitHub 目标远端，未声称远端 CI、Secret Scan 或分支保护完成。

## 交付

- 代码/文档 Commit：`PENDING_LOCAL_COMMIT`
- 证据回填 Commit：待代码 Commit 后创建。
- `REQ-GJ-ARCH-001` 继续保持 `in_progress`，因为线索、AI、集成和前端边界仍未完成。
