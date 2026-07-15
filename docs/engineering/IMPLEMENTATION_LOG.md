# 实施日志

## 2026-07-13 — Loop L-0001：接管与工程 Harness

### 目标

把 GoodJob 从“代码和零散说明”提升为可由人类与 Agent 连续推进、可追踪和可验证的正式工程。

### 已完成

- 从 Gitee 克隆项目，基线 Commit：`9f7d154`。
- 创建开发分支：`codex/phase-0-engineering-harness`。
- 安装依赖并确认依赖树可解析。
- 运行 `npm run build`：通过；发现前端大包警告。
- 运行初始 `npm test`：失败，原因是 Windows 不识别 `NODE_ENV=test` 前缀。
- 引入 `cross-env`，统一后端测试、MySQL 启动和 Playwright webServer 的跨平台环境变量。
- 新增 `.gitignore`，防止依赖、密钥、构建产物和运行缓存误提交。
- 新增工程协作契约、状态、功能台账、追踪矩阵、测试策略、风险、ADR 和交接文档。
- 新增 GitHub Issue/PR 模板与质量门禁工作流。

### 决策

- 使用 ADR-0001 定义 Harness/Loop Engineering 工作方式。
- AI 通过 Model Gateway；数据源和协作平台通过 Adapter/Connector，见 ADR-0002/0003。
- 当前循环只建立基线与门禁，不同时改造业务逻辑。

### 待验证

- `npm run verify`。
- `npm run test:e2e`。
- GitHub Actions Linux 环境实跑。

### 下一循环

`TASK-GJ-0002`：默认账号、敏感文件与历史凭证处置。

## 2026-07-13 — Loop L-0002：默认凭证与生产运行时安全基线

### 目标

处置仓库中显式默认凭证风险，禁止不安全生产配置启动，并把安全检查纳入持续质量门禁。

### 已完成

- 删除跟踪的管理员登录账号说明文件。
- 清除根页面与前端页面中的登录账号/密码预填。
- 新增 `backend/src/runtime-config.ts`：生产环境强制 MySQL、强 JWT Secret、明确 CORS、安全 Cookie 和强首次管理员密码。
- 在后端 `startServer()` 启动入口最前执行运行时配置校验。
- 扩展安全测试，覆盖安全配置通过与危险配置拒绝。
- 新增仓库安全检查，阻止跟踪环境密钥文件、凭证说明、私钥和 HTML 密码预填。
- 将仓库安全检查加入根 `npm run verify`。
- 新增 `DEVELOPMENT_ACCOUNTS.md` 和 L-0002 证据文档。

### 验证

- `npm run verify`：PASS。
- `npm run test:e2e`：PASS，36/36。
- 不安全生产配置启动：按预期失败，exit code 1；包含数据库、JWT、CORS 和 Secure Cookie 错误码。
- `git diff --check`：PASS。

### 决策与范围控制

- 当前循环只建立代码侧安全基线，不重写 Git 历史。
- 测试夹具账号允许保留在 memory store，但生产启动禁止 memory store。
- `REQ-GJ-SEC-001` 保持 `verification`：GitHub 历史扫描、远端 CI 和部署凭证轮换证据尚未完成。
- `xlsx` High 漏洞单独由 `REQ-GJ-SEC-002 / TASK-GJ-0004` 跟踪，避免扩大本循环范围。

### 下一循环

替换 `xlsx` 高危依赖，保持导入导出兼容并增加恶意工作簿与资源限制测试。

## 2026-07-13 — Loop L-0003：工作簿依赖与不可信文件安全边界

### 目标

消除 `xlsx@0.18.5` 的 Prototype Pollution 和 ReDoS High 漏洞，同时保持客户、题库、提成和搜客工作簿流程兼容。

### 方案

- 新增 ADR-0004，选择 SheetJS 官方已修复 `0.20.3` 发布包，而不是继续使用 npm Registry 的旧版本。
- 本阶段不切换 ExcelJS，因为当前系统仍声明支持旧版 `.xls` 导入，立即切换会造成兼容回归。
- 新增统一 `frontend/src/workbook.ts`，业务代码不再直接调用 SheetJS。

### 已完成

- 依赖升级到 SheetJS 官方 CDN `xlsx-0.20.3.tgz`，锁文件记录 SHA-512 完整性。
- 工作簿读取统一执行扩展名、5 MB 文件大小、文件签名、行数、128 列和 32767 字符限制。
- 拒绝 `__proto__`、`prototype`、`constructor` 表头，读取行使用无原型对象。
- 迁移客户导入/导出、客户模板、题库导入/导出、提成导出和搜客结果导出。
- 增加 XLSX、XLS、CSV 兼容测试，危险表头、伪造扩展名、损坏文件、超限行列和长单元格测试。
- 增加 UI 级恶意 CSV 拒绝测试，确认危险客户不会写入业务数据。
- 增加离线依赖版本/来源/完整性门禁，并在 GitHub Actions 增加 High 依赖审计。

### 验证

- `npm run audit:dependencies`：PASS，0 vulnerabilities。
- `npm run test:dependency-policy`：PASS，锁定 `xlsx@0.20.3` 官方来源和完整性。
- `npm run test:workbook-security`：PASS，XLSX/XLS/CSV 与安全限制全部通过。
- `npm run verify`：PASS。
- `npm run test:e2e`：PASS，37/37。
- 前端构建：PASS；主包约 1.394 MB，拆包风险继续由 R-008 跟踪。

### 结果

`REQ-GJ-SEC-002 / TASK-GJ-0004` 的验收条件全部满足，R-010 关闭。下一循环进入架构模块边界拆分准备。

## 2026-07-13 — Loop L-0004：后端路由模块化第一批

### 目标

在不改变 GoodJob 现有 API、权限和业务行为的前提下，建立可持续的后端模块装配方式，并完成系统/认证低风险第一批迁移。

### Orient / Select

- 基线 Commit：`d66eee4`；分支：`codex/phase-1-route-modularization`。
- 选择 `REQ-GJ-ARCH-001 / TASK-GJ-0003`，风险对应 R-004。
- 现状基线：`server.ts` 超过 7000 个物理行；OpenAPI/注册 API 操作 167；E2E 37 条。

### Plan / Decision

- 新增 ADR-0005：只做渐进式搬迁，`server.ts` 保留 Composition Root。
- 首批只迁移 4 个低耦合操作：health、login、logout、me。
- 模块导出显式注册函数，不导入全局 app；共享异步错误边界放入 `http/`。
- 不修改 URL、状态码、响应、Cookie、限流、认证、CSRF 或数据模型。

### Implement

- 新增 `backend/src/routes/system-routes.ts`。
- 新增 `backend/src/routes/auth-routes.ts`。
- 新增 `backend/src/http/async-route.ts`。
- `server.ts` 改为显式注册系统/认证模块；内联 API 操作由 167 降至 163，总操作仍为 167。
- 新增 `backend/src/routes/routes-test.ts` 和 `npm run test:routes`，纳入根 verify。
- security test 增加 167 操作基线锁，防止模块迁移时 API 静默丢失。
- 新增正式开发阶段计划和 GitHub Skill 评估记录；本轮不安装第三方 Skill。

### Verify / Review

- `npm run test:routes`：PASS。
- `npm run test:security`：PASS；OpenAPI/注册路由操作 167。
- `npm run verify`：PASS。
- `npm run test:e2e`：PASS，37/37。
- 后端构建：PASS；无新生产依赖、无数据迁移、无外部调用。

### Record / Next

- 证据：`docs/engineering/evidence/L-0004-route-modularization.md`。
- `REQ-GJ-ARCH-001` 保持 `in_progress`；本 Loop 完成的是第一批可回滚切片，不虚假标记总体完成。
- 下一 Loop 迁移客户路由与客户领域服务，并增加 sales/manager/team 数据范围测试。


## 2026-07-14 — Loop L-0005：客户路由与客户领域服务模块化

### Orient / Select

- 基线 Commit：`16baac4`；分支：`codex/phase-1-route-modularization`。
- 继续 `REQ-GJ-ARCH-001 / TASK-GJ-0003`，风险对应 R-004。
- 冻结 5 个客户 API；不改变 URL、权限、状态码、响应、Store 模式或数据模型。
- 复核确认客户聚合函数也被线索转客户响应复用，因此提取后必须保留该调用点。

### Plan / Acceptance

- 路由层负责参数校验与 HTTP 契约；客户领域服务负责数据范围、写入、级联清理、活动和响应聚合。
- 显式 `registerCustomerRoutes(app)` 装配，不使用嵌套 Router，不改变 167 操作统计。
- 独立测试覆盖 sales/manager/super_admin、跨负责人、跨团队、持久化和级联清理。
- 完整计划、验收和测试矩阵：`docs/engineering/evidence/L-0005-customer-modularization.md`。

### Implement

- 新增 `backend/src/domain/customers/customer-service.ts`，集中客户数据范围、创建、更新、级联删除、活动和响应聚合。
- 新增 `backend/src/routes/customer-routes.ts`，显式注册 5 个现有客户 API。
- `server.ts` 通过 `registerCustomerRoutes(app)` 装配；线索转客户继续复用 `customerWithPipeline`。
- 新增隔离 Store 的客户路由集成测试，并将 core/customer 两组测试纳入 `test:routes`。
- `server.ts` 从 6990 行降至 6850 行；无新生产依赖、无数据迁移。

### Verify / Review

- `npm run test:routes`：PASS；角色范围、越权、persist 和级联清理通过。
- `npm run test`：PASS；backend self-test、frontend 39 checks。
- `npm run test:security`：PASS；OpenAPI/注册操作 167，跨模块租户隔离 18。
- `npm run verify`：PASS。
- `npm run test:e2e`：PASS，37/37。
- `git diff --check`：PASS。
- 前端约 1.394 MB 构建警告继续由 R-008 跟踪，本循环未扩大该风险。

### Record / Next

- 证据：`docs/engineering/evidence/L-0005-customer-modularization.md`。
- L-0005 已由 Commit `ff90350` 交付；本次文档提交回填精确证据。
- `REQ-GJ-ARCH-001` 保持 `in_progress`；下一循环为 L-0006 线索路由、来源血缘与领域服务边界。

## 2026-07-14 — GitHub 远端初始化

### Orient / Decision

- Gitee `origin` 继续作为 GoodJob 业务基线，不替换、不删除。
- GitHub 使用独立 `github` 远端，避免误覆盖业务基线。
- 目标仓库：`1060392338/goodjob`；创建时为空仓库，当前可见性为 Public。

### Implement / Verify

- 新增 `github` 远端：`https://github.com/1060392338/goodjob.git`。
- 推送 `master` 基线 Commit `9f7d154`。
- 推送开发分支 `codex/phase-1-route-modularization` Commit `6cdd169`。
- `git ls-remote --heads github` 返回两个目标分支。
- 本地 HEAD 与 GitHub 开发分支 Commit 均为 `6cdd169dbdc11257c41e6adef47d15fc394408b3`。

### Review / Next

- 仓库创建和提交一致性已验证，但不得据此声称远端安全门禁完成。
- 后续通过 Pull Request 触发 Linux/Node 22 Actions，并继续完成历史 Secret Scan、分支保护与部署凭证轮换确认。
- 证据：`docs/engineering/evidence/GH-0001-repository-bootstrap.md`。

## 2026-07-14 — Loop L-0006：线索核心路由、生命周期与来源血缘模块化

### Orient / Select

- 基线 Commit：`eb34489`；分支：`codex/phase-1-route-modularization`。
- 继续 `REQ-GJ-ARCH-001 / TASK-GJ-0003`，风险对应 R-004，设计沿用 ADR-0005。
- 冻结 9 个核心线索 API；不改变 URL、权限、状态码、响应、Store 模式、数据模型或外部调用。
- 社交触达、邮件发送、转化预览和转客户/商机 4 个高耦合 API 明确延后，不同时开发 AI 或协作平台。

### Plan / Acceptance

- 路由层负责 Zod 校验和 HTTP 契约；线索领域服务负责来源摄取、幂等、租户范围、生命周期、活动、清理与客户匹配。
- 来源幂等键冻结为 `ownerId + sourceChannel + externalId`；来源事件保留 raw payload 和 owner/team 血缘。
- 显式 `registerLeadRoutes(app)` 装配，OCR/Website 同步与转化预览继续复用提取后的服务函数。
- 独立测试覆盖四级角色范围、越权、垃圾箱、详情租户过滤、幂等、阶段活动、恢复和永久清理。
- 完整计划、验收、测试和回滚：`docs/engineering/evidence/L-0006-lead-modularization.md`。

### Implement

- 新增 `backend/src/domain/leads/lead-service.ts`，集中来源摄取、幂等、范围、详情、更新、垃圾箱、恢复、永久清理、活动和客户匹配。
- 新增 `backend/src/routes/lead-routes.ts`，显式注册 9 个核心线索 API。
- 新增 `backend/src/routes/lead-routes-test.ts`，并将 lead 路由测试纳入 `test:routes` 与 `verify`。
- `server.ts` 继续作为 Composition Root；4 个外联/转化接口保留原位。
- `server.ts` 6850 → 6526 行，净减少 324 行；无新生产依赖、无数据迁移、无新增外部调用。

### Verify / Review

- `npm run test:routes`：PASS；core/customer/lead 三组独立测试通过，测试 Store 记录 9 次预期持久化。
- `npm run test`：PASS；backend self-test、frontend 39 checks。
- `npm run test:security`：PASS；OpenAPI/注册操作 167，跨模块租户隔离 18。
- `npm run verify`：PASS；仓库安全检查 94 个已跟踪文件，依赖、工作簿和双端构建门禁通过。
- `npm run test:e2e`：PASS，Chromium 37/37。
- `npm run build --workspace backend`：PASS；`git diff --check`：PASS。
- 前端约 1.394 MB 构建警告继续由 R-008 跟踪，本循环未扩大该风险。

### Record / Next

- 代码 Commit：`3e5c5b3`。
- 证据：`docs/engineering/evidence/L-0006-lead-modularization.md`。
- `REQ-GJ-ARCH-001` 保持 `in_progress`；不得因 9 个核心接口迁移完成而提前标记总体完成。
- 下一循环 L-0007 处理社交触达、邮件发送、转化预览和转客户/商机 4 个高耦合接口，先冻结外部副作用和跨聚合事务测试，再实施迁移。

## 2026-07-15 — Loop L-0007：线索外联、邮件与转化边界模块化

### Orient / Select

- 基线 Commit：`79007f7`；分支：`codex/phase-1-route-modularization`。
- 继续 `REQ-GJ-ARCH-001 / TASK-GJ-0003`，风险对应 R-004/R-005，并新增 R-011 跟踪邮件结果不确定与 `pending` 运维处置。
- 冻结 4 个 API：社交触达、邮件发送、转化预览、转客户/商机。
- 明确 `/social-touch` 仅记录人工活动；真实平台外呼、AI Gateway 和协作平台凭证均不进入本循环。

### Plan / Acceptance

- 新增 `ADR-0006`，冻结邮件 Gateway、哈希化幂等键、`pending/succeeded/failed` 状态和转化跨聚合回滚规则。
- 邮件副作用必须通过可注入 Gateway；测试使用 Mock，覆盖成功、认证失败、超时、重复键和最终持久化失败。
- 转化测试覆盖可见客户匹配、新建/关联客户、可选商机、商机事件、重复转化、来源追溯与失败回滚。
- 完整计划、验收、测试和回滚：`docs/engineering/evidence/L-0007-lead-outreach-conversion.md`。

### Implement

- 新增 `OutboundEmailGateway`，并将既有 SMTP 调用统一复用 Nodemailer Gateway。
- 新增 `lead-outreach-service.ts`、`lead-conversion-service.ts` 和共享 `deal-service.ts`。
- 新增 `lead-outreach-routes.ts`、`lead-conversion-routes.ts`，4 个 API 从 `server.ts` 迁出并显式装配。
- 新增 `lead_outreach_requests` MySQL 表和 Store 集合，只保存键/载荷哈希及副作用状态，不保存邮件正文、原始键或 SMTP 凭证。
- 新增两组专项路由测试并纳入 `test:routes` 与 `verify`。
- 专项测试首次发现日期正则遗漏转义和商机事件快照无法回滚；保持断言不变修复实现。
- `server.ts` 6526 → 6258 行，净减少 268 行；无新生产依赖。

### Verify / Review

- `npm run test:routes`：PASS；core/customer/lead/outreach/conversion 五组通过。
- `npm run test --workspace backend`：PASS；既有外联和转化行为未回归。
- `npm run test:security`：PASS；API 操作 167；跨模块租户隔离 18。
- `npm run build --workspace backend`：PASS。
- `npm run verify`：PASS；仓库安全检查 98 个已跟踪文件，依赖策略、工作簿安全和双端构建通过。
- `npm run test:e2e`：PASS，Chromium 37/37。
- `npm run audit:dependencies`：PASS，0 vulnerabilities。
- `git diff --check`：PASS。

### Record / Next

- 代码 Commit：`dde131a`。
- 证据：`docs/engineering/evidence/L-0007-lead-outreach-conversion.md`。
- L-0007 切片完成；`REQ-GJ-ARCH-001` 与阶段 2 继续 `in_progress`。
- 下一循环 L-0008 先盘点 AI 与集成路由，冻结 Model Gateway/Connector/Collaboration Adapter 装配边界并建立 Mock 契约；不得直接连接真实模型或钉钉、企微、飞书。