# 会话交接

更新时间：2026-07-14

## 当前工作位置

- 仓库：GoodJob 本地克隆
- 分支：`codex/phase-1-route-modularization`
- 当前循环：`L-0006`（代码与本地验收完成）
- 需求/任务：`REQ-GJ-ARCH-001 / TASK-GJ-0003`
- 代码交付 Commit：`3e5c5b3`
- 证据：`docs/engineering/evidence/L-0006-lead-modularization.md`

## L-0006 已完成内容

- 新增 `backend/src/domain/leads/lead-service.ts`，集中来源摄取、幂等、租户范围、详情、更新、垃圾箱、恢复、永久清理、活动和客户匹配。
- 新增 `backend/src/routes/lead-routes.ts`，显式注册 9 个核心线索 API。
- 新增 `backend/src/routes/lead-routes-test.ts`，覆盖未认证、四级角色范围、跨团队 404、垃圾箱、详情排序、来源事件租户过滤、幂等、生命周期、活动和级联清理。
- `test:routes` 已包含 core、customer、lead 三组独立路由测试。
- `server.ts` 保留 Composition Root，并继续复用 `createLeadFromSource` 供 OCR/Website 同步使用、复用 `findCustomerMatches` 供转化预览使用。
- `server.ts` 6850 → 6526 行，净减少 324 行。
- 无新生产依赖、无数据迁移、无新增外部调用。

## 明确未迁移范围

以下 4 个接口仍在 `server.ts`，不得误认为线索模块已全部完成：

- `POST /api/leads/:id/social-touch`
- `POST /api/leads/:id/send-email`
- `GET /api/leads/:id/conversion-preview`
- `POST /api/leads/:id/convert`

它们涉及社交/邮件外部副作用以及客户、商机跨聚合转化，下一循环必须先冻结副作用、权限、幂等、失败和回滚测试，再实施迁移。

## L-0006 验证

- `npm run test:routes`：PASS；core/customer/lead 三组通过；线索测试 persist 9 次符合预期。
- `npm run test`：PASS；backend self-test + frontend 39 checks。
- `npm run test:security`：PASS；API 操作 167；跨模块租户隔离 18。
- `npm run verify`：PASS；仓库安全检查 94 个已跟踪文件，依赖策略、工作簿安全和双端构建通过。
- `npm run test:e2e`：PASS，Chromium 37/37。
- `npm run build --workspace backend`：PASS。
- `git diff --check`：PASS。

## 已完成提交

- `3d7cce6`：工程 Harness 与 Loop Engineering 基线。
- `e5c38b4`：默认凭证和生产运行时安全基线。
- `d66eee4`：工作簿安全与依赖供应链修复。
- `4e25f1d`：后端系统/认证路由模块化第一批。
- `16baac4`：L-0004 交付证据。
- `ff90350`：L-0005 客户路由与领域服务模块化。
- `6cdd169`：L-0005 交付证据。
- `eb34489`：GitHub 仓库初始化证据。
- `3e5c5b3`：L-0006 线索核心路由、生命周期与来源血缘模块化。

## GitHub 远端状态

- Gitee 业务基线继续保留为 `origin`：`https://gitee.com/sendoh-huang/GoodJob.git`。
- GitHub 协作远端为 `github`：`https://github.com/1060392338/goodjob.git`。
- GitHub 可见性：Public（2026-07-14 已验证）；未经负责人明确决定不得擅自改为 Private。
- GitHub 默认分支：`master`。
- `master` 基线已推送：`9f7d1542713f4ffa104a855a8cb15b09f5768c31`。
- 当前开发分支将在本循环完成文档提交后推送，并以 `git ls-remote` 校验本地/远端 Commit 一致。
- Pull Request、Linux/Node 22 Actions、历史 Secret Scan、分支保护、必需检查和部署凭证轮换确认仍未完成。

## 下一开发循环

L-0007 继续 `REQ-GJ-ARCH-001 / TASK-GJ-0003`：

1. 冻结社交触达、邮件发送、转化预览、转客户/商机 4 个接口的 URL、状态码、响应和权限基线；
2. 建立邮件/社交外部副作用 Mock，覆盖失败、超时、重复请求和“不可见/已删除线索不得发送”；
3. 建立转化预览和执行的客户匹配、重复转化、客户/商机创建、来源追溯与持久化测试；
4. 决定外部调用服务与转化服务边界，必要时先补充 ADR-0005 附录或新 ADR；
5. 迁移 4 个接口并保持 API 167、security、verify、E2E 37/37；
6. 完成 L-0007 证据、风险、追踪、状态和回滚记录后才进入 AI Gateway。

## 持续外部阻塞

- GitHub Actions、历史 Secret Scan、分支保护和必需检查尚未闭环；
- 部署实例与历史凭证轮换未确认；
- 仓库 Public/Private 决策未确认；
- 第三方线索厂商和钉钉/企微/飞书真实企业凭证未提供，但不阻塞 Mock/契约开发。

不得声称上述远端门禁已完成；`REQ-GJ-SEC-001` 继续保持 `verification`，`REQ-GJ-ARCH-001` 继续保持 `in_progress`。
