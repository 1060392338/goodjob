# 会话交接

更新时间：2026-07-14

## 当前工作位置

- 仓库：GoodJob 本地克隆
- 分支：`codex/phase-1-route-modularization`
- 基线 HEAD：`16baac4`
- 当前循环：`L-0005`（本地验收完成，交付 Commit 待回填）
- 需求/任务：`REQ-GJ-ARCH-001 / TASK-GJ-0003`

## L-0005 已完成内容

- 新增 `backend/src/domain/customers/customer-service.ts`。
- 新增 `backend/src/routes/customer-routes.ts`，显式注册 5 个客户 API。
- 新增 `backend/src/routes/customer-routes-test.ts`，覆盖 sales/manager/admin/super_admin、跨负责人/跨团队、persist 和批量删除关联清理。
- `server.ts` 保留 Composition Root，并复用客户聚合服务供线索转客户响应使用。
- `server.ts` 6990 → 6850 行；内联客户路由为 0。
- 无新生产依赖、无数据迁移、无外部调用。

## L-0005 验证

- `npm run test:routes`：PASS。
- `npm run test`：PASS。
- `npm run test:security`：PASS；API 操作 167。
- `npm run verify`：PASS。
- `npm run test:e2e`：PASS，37/37。
- `git diff --check`：PASS。
- 证据：`docs/engineering/evidence/L-0005-customer-modularization.md`。

## 已完成提交

- `3d7cce6`：工程 Harness 与 Loop Engineering 基线。
- `e5c38b4`：默认凭证和生产运行时安全基线。
- `d66eee4`：工作簿安全与依赖供应链修复。
- `4e25f1d`：后端系统/认证路由模块化第一批。
- `16baac4`：L-0004 交付证据。
- `PENDING_LOCAL_COMMIT`：L-0005 客户路由与领域服务模块化。

## 下一开发循环

L-0006 继续 `REQ-GJ-ARCH-001 / TASK-GJ-0003`：

1. 复核线索 API、来源事件、转客户/商机和权限依赖；
2. 冻结一批可回滚的线索路由切片，不同时开发 AI 或协作平台；
3. 提取线索领域服务和来源血缘边界，为后续 LeadSourceConnector 铺路；
4. 增加来源幂等、租户隔离、转客户兼容和 167 API 契约测试；
5. 执行 Harness/Loop 全流程并沉淀 L-0006 证据。

## 持续外部阻塞

- GitHub 目标仓库与权限未提供；
- GitHub 历史 Secret Scan、Linux/Node 22 Actions、分支保护未实跑；
- 部署实例与历史凭证轮换未确认。

不得声称上述远端门禁已完成；`REQ-GJ-SEC-001` 继续保持 `verification`。
