# L-0006 线索核心路由、生命周期与来源血缘模块化证据

- 日期：2026-07-14
- 关联需求/任务：`REQ-GJ-ARCH-001 / TASK-GJ-0003`
- 风险：`R-004`
- 基线 Commit：`eb34489`
- 代码交付 Commit：`3e5c5b3`
- 分支：`codex/phase-1-route-modularization`
- 设计依据：`ADR-0005`
- 状态：Completed

## Orient / 范围冻结

本循环只迁移以下 9 个现有核心线索 API，不新增、删除或重命名 API：

1. `GET /api/leads`
2. `GET /api/leads/:id`
3. `POST /api/leads`
4. `POST /api/leads/ingest`
5. `PATCH /api/leads/:id`
6. `DELETE /api/leads/:id`
7. `POST /api/leads/:id/restore`
8. `DELETE /api/leads/:id/permanent`
9. `POST /api/leads/:id/activities`

以下 4 个高耦合接口暂时保留在 `server.ts`，作为下一切片处理：

- `POST /api/leads/:id/social-touch`
- `POST /api/leads/:id/send-email`
- `GET /api/leads/:id/conversion-preview`
- `POST /api/leads/:id/convert`

原因：邮件发送属于外部副作用，转客户/商机涉及客户与商机聚合边界；本循环只处理核心线索生命周期、来源血缘与幂等，避免同步改变多个高风险边界。AI Gateway、LeadSourceConnector、钉钉、企业微信、飞书 Adapter 均不在本循环实施范围。

## 现有行为基线

- 线索数据范围继续使用 `canSeeOwner`：sales 仅本人，manager/admin 仅本团队，super_admin 全局。
- 普通列表排除垃圾箱，`trash=true` 只返回垃圾箱线索。
- 来源幂等键保持 `ownerId + sourceChannel + externalId`；不同负责人可使用相同外部 ID，不发生跨租户误去重。
- 来源事件保留渠道、活动、外部 ID、URL、发生/接收时间、原始 payload、owner/team 血缘。
- 线索阶段变化继续写入 `stage` 活动；添加跟进活动继续更新下次跟进时间，并将 `new` 推进为 `following`。
- 移入垃圾箱继续记录原因、操作者、原状态与 30 天 `purgeAt`；恢复继续恢复原状态。
- 已转客户线索不可移入垃圾箱或永久删除。
- 永久删除继续同步清理线索活动与来源事件。
- OCR、Website 同步继续复用 `createLeadFromSource`；转化预览继续复用 `findCustomerMatches`。

## 实施计划

1. 新增 `domain/leads/lead-service.ts`，集中线索范围、来源摄取、幂等、详情、更新、垃圾箱、永久清理、活动和客户匹配。
2. 新增 `routes/lead-routes.ts`，保留 Zod 校验、认证、状态码、错误消息与响应契约。
3. `server.ts` 通过 `registerLeadRoutes(app)` 显式装配，保留外联/邮件/转化 4 个接口。
4. 新增隔离 Store 的线索路由集成测试，并纳入根 `test:routes` 与 `verify`。
5. 执行专项、全量、安全、构建和 E2E 门禁，记录准确结果与回滚点。

## 验收标准

- [x] 9 个核心线索 API 全部迁出 `server.ts`，显式注册一次。
- [x] 4 个外联/邮件/转化 API 保持原位置和行为，本循环不扩展范围。
- [x] URL、方法、状态码、错误消息和响应 JSON 保持兼容。
- [x] sales、manager、admin、super_admin 数据范围及跨团队 404 语义不变。
- [x] 来源幂等边界保持 `ownerId + sourceChannel + externalId`。
- [x] 来源事件 raw payload、owner/team 血缘与详情租户过滤不回归。
- [x] 阶段活动、跟进活动、垃圾箱、恢复、已转客户保护与永久清理行为不回归。
- [x] OCR、Website 同步和转化预览的共享服务调用点保留。
- [x] OpenAPI 与注册 API 操作数均保持 167。
- [x] `server.ts` 物理行数净下降，无新生产依赖、无数据迁移、无新增外部调用。
- [x] `REQ-GJ-ARCH-001` 保持 `in_progress`。

## 测试矩阵

| 层级 | 场景 | 标准 |
|---|---|---|
| 路由集成 | 未认证访问 | 401 |
| 路由集成 | sales/manager/admin/super_admin 列表范围 | 与 `canSeeOwner` 既有规则一致 |
| 路由集成 | 普通列表与垃圾箱列表 | 普通列表排除删除项；`trash=true` 只返回删除项 |
| 路由集成 | 详情访问、活动排序、来源事件过滤 | 越权 404；活动/事件倒序；跨租户来源事件不泄露 |
| 路由集成 | 手工创建 | owner/team、默认来源、来源事件和系统活动正确；persist +1 |
| 路由集成 | 来源摄取与重复摄取 | 首次 201；同 owner/channel/externalId 重复为 200 且不新增数据 |
| 路由集成 | 不同负责人相同 externalId | 分别创建，不跨负责人去重 |
| 路由集成 | PATCH 阶段与越权 PATCH | 阶段活动正确；越权 404 且不持久化 |
| 路由集成 | 移入垃圾箱与已转客户保护 | 正常线索进入垃圾箱；已转客户返回 400 |
| 路由集成 | 恢复与永久删除 | 恢复原状态；永久删除清理活动和来源事件 |
| 路由集成 | 添加活动 | nextFollowAt 更新；`new` 推进到 `following`；persist +1 |
| 契约/安全 | API 注册、OpenAPI、跨模块租户隔离 | 167/167；隔离基线 18 |
| 全量 | self-test/security/workbook/build | `npm run verify` PASS |
| E2E | 现有 P0 流程 | 37/37 |

## 实施结果

### 代码边界

- 新增 `backend/src/domain/leads/lead-service.ts`：来源摄取与幂等、数据范围、详情、更新、垃圾箱、恢复、永久清理、活动和客户匹配。
- 新增 `backend/src/routes/lead-routes.ts`：9 个核心线索 API 的校验、认证、状态码和响应契约。
- 新增 `backend/src/routes/lead-routes-test.ts`：隔离 Store 下验证角色范围、来源租户过滤、幂等、生命周期和清理。
- `backend/src/server.ts` 仅保留 `registerLeadRoutes(app)` 装配，并继续从领域服务复用 `createLeadFromSource` 与 `findCustomerMatches`。
- `server.ts` 从基线 6850 行降至 6526 行，净减少 324 行；9 个目标内联 API 为 0，显式注册调用为 1。
- 未增加生产依赖，未修改数据模型，未执行数据迁移，未增加外部调用。

### 专项测试

`npm run test:routes`：PASS。

- 核心系统/认证、客户和线索三组独立路由测试全部通过。
- 9 个线索路由验证 sales/manager/admin/super_admin 范围、越权 404、垃圾箱过滤和详情排序。
- 来源事件详情过滤阻止跨租户血缘泄露。
- 同负责人、同渠道、同 externalId 重复摄取返回既有线索；不同负责人相同 externalId 正常创建。
- 阶段活动、垃圾箱、恢复、永久级联清理和跟进状态推进通过。
- 测试 Store 共记录 9 次预期持久化，无失败路径误持久化。

### 全量验证

| 命令 | 结果 |
|---|---|
| `npm run test:routes` | PASS；core/customer/lead 独立路由测试全部通过 |
| `npm run test` | PASS；backend self-test + frontend 39 checks |
| `npm run test:security` | PASS；OpenAPI/注册操作 167；跨模块租户隔离 18 |
| `npm run verify` | PASS；仓库安全检查 94 个已跟踪文件，依赖策略、路由、self-test、安全、工作簿和前后端构建全部通过 |
| `npm run test:e2e` | PASS；Chromium 37/37 |
| `npm run build --workspace backend` | PASS |
| `git diff --check` | PASS |

前端构建仍报告约 1.394 MB 主包警告，该问题未由本循环引入，继续由 R-008 跟踪。

## Review / 风险复核

- 权限与租户隔离：专项角色矩阵、来源事件过滤、现有 security test 与 E2E 均通过。
- API 契约：操作数保持 167；URL、方法、状态码、错误消息和响应未改变。
- 数据与幂等：未迁移数据；来源幂等键和生命周期写入顺序保持原实现。
- 外部副作用：邮件、社交触达和转客户/商机暂未迁移，避免在本循环改变外部调用和跨聚合事务。
- 剩余架构风险：R-004 继续为 Mitigating；下一循环处理 4 个线索外联/转化接口及其副作用边界。
- 远端安全风险：GitHub Actions、历史 Secret Scan、分支保护和部署凭证确认仍未闭环；`REQ-GJ-SEC-001` 保持 `verification`。

## 回滚

本切片无数据迁移。若出现权限、来源幂等、生命周期、响应或转化兼容回归，执行回滚代码 Commit `3e5c5b3` 即恢复 `server.ts` 原内联实现；随后重新运行 `npm run verify` 与 `npm run test:e2e`。不得通过放宽测试接受非计划行为。

## 交付

- 代码 Commit：`3e5c5b3`
- 证据与状态文档：由紧随代码提交的 `docs(engineering)` Commit 交付。
- `REQ-GJ-ARCH-001` 继续保持 `in_progress`，因为线索外联/转化、AI、集成和前端边界仍未完成。
