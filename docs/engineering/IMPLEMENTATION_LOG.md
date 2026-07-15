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

## 2026-07-15 — Loop L-0008：AI 配置路由与 ModelGateway 装配边界

### Orient / Select

- 基线 Commit：`6194cee`；分支：`codex/phase-1-route-modularization`。
- 继续 `REQ-GJ-ARCH-001 / TASK-GJ-0003`，只为 `REQ-GJ-AI-001` 建立前置边界，不提前改变其 backlog 状态。
- 冻结 AI 配置读取、保存、删除、连接测试 4 个 API；完整 AI 搜客、网站采集、协作平台、前端拆分和 Repository 均排除在本循环外。
- 新增 R-012 跟踪模型 Key 明文 at-rest 风险；本循环只使用假密钥和 Mock/Stub。

### Plan / Acceptance

- 新增 `ADR-0007`，冻结 `ModelGateway`、Composition Root 装配、用户级配置隔离、SSRF 防护和公开错误脱敏。
- Gateway 契约覆盖 OpenAI-compatible、Anthropic、Gemini，并分类未配置、认证、超时、限流、非法响应、供应商失败和安全拒绝。
- 连接测试必须解析严格 JSON 且 `ok === true`；不得继续使用字符串包含判断。
- 完整计划、验收、测试和回滚：`docs/engineering/evidence/L-0008-ai-config-model-gateway.md`。

### Implement

- 新增 `model-gateway.ts`，统一三协议传输、Trace ID、120 秒超时、SSRF 校验、响应信封解析、错误分类和 Key 脱敏。
- 新增 `ai-config-service.ts`，集中配置选择、使用场景匹配、公开 DTO 和结构化连接测试。
- 新增 `ai-config-routes.ts`，4 个 API 迁出 `server.ts` 并通过 `registerAiConfigRoutes` 显式装配。
- 既有翻译、AI 搜客、官网 AI 解析改为复用同一个生产 Gateway；业务路由仍留待后续切片。
- 新增 Gateway 契约测试和 AI 配置路由测试，并纳入 `test:routes` / `verify`。
- 修复外租户配置 ID 可被同 ID 新建路径碰撞的问题：现在按不存在处理且不得覆盖。
- `server.ts` 6258 → 5974 行，净减少 284 行；无数据库结构变化、无新生产依赖。

### Verify / Review

- `npm run test:gateway:model --workspace backend`：PASS；三协议、六类失败、真实外呼 0、密钥脱敏通过。
- `npm run test:routes:ai-config --workspace backend`：PASS；4 路由、租户隔离、掩码保留、失败状态持久化通过。
- `npm run test:routes`：PASS；七组路由/Gateway 门禁通过。
- `npm run test --workspace backend`：PASS。
- `npm run test:security`：PASS；API 操作 167；跨模块租户隔离 18。
- `npm run build --workspace backend`：PASS。
- `npm run verify`：PASS；双端测试、安全、工作簿和构建通过。
- `npm run test:e2e`：PASS，Chromium 37/37。
- `npm run audit:dependencies`：首次 npm Registry TLS 失败；使用本机代理重试 PASS，0 vulnerabilities。
- 暂存新文件后 `npm run test:repo-security`：PASS，114 个文件；`git diff --check`：PASS。

### Record / Next

- 代码 Commit：`9160a90`。
- 证据：`docs/engineering/evidence/L-0008-ai-config-model-gateway.md`。
- L-0008 切片完成；`REQ-GJ-ARCH-001` 与阶段 2 继续 `in_progress`，`REQ-GJ-AI-001` 继续 backlog。
- 下一循环 L-0009 建议处理线索来源配置 4 个 API 与 `LeadSourceConnector` 装配边界，先建立 Mock/契约，再迁移；不得混入真实供应商或协作平台凭证。

## 2026-07-15 — Loop L-0009：线索来源配置与 LeadSourceConnector 装配边界

### Orient / Select

- 基线 Commit：`e3a3055`；分支：`codex/phase-1-route-modularization`。
- 继续 `REQ-GJ-ARCH-001 / TASK-GJ-0003`，只为 `REQ-GJ-LEAD-001` 建立配置和连接测试前置边界，其状态继续 backlog。
- 冻结 Provider 列表、来源配置保存、连接测试和删除 4 个 API；完整搜索、网站采集、AI 评分、协作平台、前端拆分和 Repository 均排除在本循环外。
- 新增 R-013 跟踪线索来源 Key 明文 at-rest 风险；本循环只使用假密钥和 Mock。

### Plan / Acceptance

- 新增 `ADR-0008`，冻结 `LeadSourceConnector`、Composition Root 装配、用户级配置隔离、SSRF 和公开错误脱敏。
- Connector 分类未配置、认证、超时、限流、非法响应、供应商失败和安全拒绝。
- 预留 cursor/checkpoint/nextCursor/nextCheckpoint/exhausted；不伪造尚未实现的断点恢复。
- 完整计划、验收、测试和回滚：`docs/engineering/evidence/L-0009-lead-source-connector.md`。

### Implement

- 新增 `lead-source-connector.ts`，把既有 Provider 注册表装配为统一 Connector，并提供 Trace ID、错误分类、SSRF 复核和 Key/Authorization/查询参数脱敏。
- 新增 `lead-source-config-service.ts`，集中用户配置查询、公开 DTO、Provider 状态和 AI 搜索状态。
- 新增 `lead-source-config-routes.ts`，4 个 API 迁出 `server.ts` 并显式装配。
- 完整搜索继续复用领域服务读取配置，但执行路径仍保持既有 Provider 行为，留待阶段 3 独立迁移。
- 新增 Connector 契约测试和来源配置路由测试，并纳入 `test:routes` / `verify`。
- `server.ts` 5974 → 5823 行，净减少 151 行；无数据库结构变化、无新生产依赖。

### Verify / Review

- `npm run test:connector:lead-source --workspace backend`：PASS；7 类错误、分页/检查点字段、真实外呼 0、密钥脱敏通过。
- `npm run test:routes:lead-source-config --workspace backend`：PASS；4 路由、读/存/测/删租户隔离、掩码保留和 SSRF 前置拒绝通过。
- `npm run test:routes`：PASS；九组路由/Gateway/Connector 门禁通过。
- `npm run test --workspace backend`：PASS。
- `npm run test:security`：PASS；API 操作 167；跨模块租户隔离 18。
- `npm run build --workspace backend`：PASS。
- `npm run verify`：PASS；双端测试、安全、工作簿和构建通过。
- `npm run test:e2e`：PASS，Chromium 37/37。
- `npm run audit:dependencies`：PASS，0 vulnerabilities。
- 代码暂存后 `npm run test:repo-security`：PASS，121 个文件；`git diff --check`：PASS。

### Record / Next

- 代码 Commit：`59594d1`。
- 证据：`docs/engineering/evidence/L-0009-lead-source-connector.md`。
- L-0009 切片完成；`REQ-GJ-ARCH-001` 与阶段 2 继续 `in_progress`，`REQ-GJ-LEAD-001` 继续 backlog。
- 下一循环 L-0010 建议从前端 `prototype-api.ts` 选择“线索来源中心”单一切片，先建立模块 self-test，再迁移；不得同时重写 UI、状态管理或完整搜索。

## 2026-07-15 — Loop L-0010：前端线索来源中心模块边界

### Orient / Select

- 基线 Commit：`3662a11`；分支：`codex/phase-1-route-modularization`。
- 登记 `REQ-GJ-FE-001 / TASK-GJ-0005`，关联阶段 2 的 `REQ-GJ-ARCH-001`。
- 只选择 Provider 类型、默认/手动选择状态和来源配置 4 个 API 客户端；完整搜索、UI 重写、状态管理框架、数据库、真实模型/数据源均排除。
- 复核 R-004/R-008：本循环降低维护影响面，不宣称完成代码分割或关闭主包风险。

### Plan / Test first

- 新增 `ADR-0009`，冻结 API、DOM、文案、按钮状态、移动端和回滚边界。
- 先创建专项测试；首次因生产模块不存在按预期失败。
- 模块实现后专项测试覆盖 8 组选择状态和 4 个 API 契约。
- self-test 首次发现 API 字符串已迁出原文件；通过扩展检查源并新增模块标识处理，未删除或放宽断言。

### Implement

- 新增 `lead-source-center.ts`，集中 Provider 类型、纯状态转换和可注入 API 客户端。
- `prototype-api.ts` 通过 `createLeadSourceCenterClient(api)` 装配新模块，保留 DOM/Modal/Toast/导航和完整搜索执行。
- 新增独立测试脚本并纳入前端统一 `test`。
- `prototype-api.ts` 11745 → 11717 行，净减少 28 行；无数据库变化、无新生产依赖。

### Verify / Review

- `npm run test:lead-source-center --workspace frontend`：PASS；8 组状态、4 个 API 契约。
- `npm run test --workspace frontend`：PASS；self-test 41 项。
- `npm run build --workspace frontend`：PASS；596 modules transformed。
- `npm run verify`：PASS。
- `npm run test:security`：PASS；API 167；跨模块租户隔离 18。
- `npm run test:e2e`：PASS，Chromium 37/37。
- `npm run audit:dependencies`：PASS，0 vulnerabilities。
- 代码暂存后 `npm run test:repo-security`：PASS，125 个文件；`git diff --cached --check`：PASS。
- Review 确认 4 个 API、默认排除 AI、刷新保留、保存/测试/删除、DOM 和移动端语义未改变。

### Record / Next

- 代码 Commit：`487438b`。
- 证据：`docs/engineering/evidence/L-0010-frontend-lead-source-center.md`。
- L-0010 切片完成；阶段 2 继续 `in_progress`。
- 下一循环建议 L-0011：LangGraph.js + `AiWorkflowEngine` 技术验证，只使用 Mock ModelGateway，验证暂停/恢复、人工确认、权限、幂等和审计；失败则不引入生产依赖。

## 2026-07-15 — Loop L-0011：LangGraph.js 与 AiWorkflowEngine 技术验证

### Orient / Select

- 基线 Commit：`c2c1e52`；分支：`codex/phase-1-route-modularization`。
- 登记 `REQ-GJ-AI-ORCH-001 / TASK-GJ-0102`，关联 `REQ-GJ-ARCH-001`、ADR-0007 与阶段 4/5 前置边界。
- 只验证一条受控线索评分工作流：读取、Mock AI 评分、结构校验、人工确认、驳回/重跑、权限复检、幂等模拟写入和审计。
- 排除真实模型、真实 CRM 数据、HTTP API、数据库迁移、协作平台和前端改造。

### Plan / DoR

- 新增 ADR-0010，冻结 LangGraph.js、ModelGateway、领域端口、Checkpoint、MySQL 正式化和失败退出边界。
- 先创建专项测试并记录预期失败，再实现生产模块。
- 验收必须证明未确认/驳回/越权写入为 0、重复确认只写一次、暂停可恢复、每步可审计、Secret 不入 checkpoint、真实外呼为 0。
- 完整验证后再决定是否保留 LangGraph 生产依赖；审计或兼容性不通过则回退到 GoodJob 自有状态机。

### Implement

- 引入并精确锁定 `@langchain/langgraph@1.4.8`、`@langchain/core@1.1.48`、`zod@3.25.76`；锁文件中的 Checkpoint 为 `1.1.3`。
- 新增 `backend/src/ai/ai-workflow-engine.ts`：
  - LangGraph 状态图只负责读取、评分、暂停、恢复和分支；
  - 模型配置运行时解析，Checkpoint 只保存 `modelConfigId`，不保存 API Key；
  - 模型调用只经过注入的 `ModelGateway`；
  - 领域读取、权限和写入只经过注入端口；
  - `approve/reject/rerun` 统一确认协议；
  - 写入前二次权限检查和稳定幂等键；
  - 每个关键步骤写入带 Trace ID 的审计事件。
- 新增进程内原子 Effect Store 和 MemorySaver 工厂，仅用于本地技术验证；未新增数据库表或 HTTP API。
- 新增依赖策略门禁，锁定 LangGraph、Checkpoint、Core 和 Zod 的版本与 SHA-512 完整性。
- 后端统一 `test` 已纳入 AI 工作流专项测试。

### Verify / Review

- Test first：专项测试首次因 `ai-workflow-engine` 模块不存在而按预期失败；没有删除、跳过或放宽断言。
- 专项测试：PASS；8 个运行、8 次 Mock ModelGateway 调用、3 次采纳模拟写入；未确认、驳回、越权、顺序重复和并发重复造成的额外写入均为 0；真实外呼 0；Secret 不入 Checkpoint。
- TypeScript 构建首次发现测试事件类型过宽并失败，修正为强类型事件列表后通过。
- `npm run verify`：PASS；API 167，跨模块租户隔离 18，双端测试与构建通过。
- `npm run test:e2e`：首次运行在 33/37 后由 Playwright 进程异常退出，未出现产品断言失败；清理约 571 MB 中断 Trace 后原命令重跑 PASS，37/37。
- `npm run audit:dependencies`：一次请求发生 TLS 网络中断；同一锁文件重跑 PASS，0 vulnerabilities。
- 代码暂存后仓库安全检查 PASS，129 个文件；闭环文档暂存后最终 PASS，130 个文件；`git diff --cached --check` PASS。
- Review 确认：无真实模型/数据/CRM 写入，无新 API/数据库/前端变更；MemorySaver 不得用于正式环境；R-012/R-014 未关闭。

### Record / Next

- 实现 Commit：`356200a`。
- 证据：`docs/engineering/evidence/L-0011-ai-workflow-engine.md`。
- `REQ-GJ-AI-ORCH-001 / TASK-GJ-0102` 本地 DoD 完成；阶段 2 继续 `in_progress`，阶段 4/5 仍未开始功能交付。
- 下一循环建议 L-0012：建立模型/来源凭证 `SecretVault` 边界与迁移策略，先缓解 R-012/R-013，再把 `AiWorkflowEngine` 接入真实线索评分预览/确认 API；不得在明文 Key 风险关闭前接真实凭证。

## 2026-07-15 — Loop L-0012：SecretVault 与凭证迁移安全

### Orient / Select

- 基线 Commit：`9a900a5`；分支：`codex/phase-1-route-modularization`。
- 登记 `REQ-GJ-SEC-003 / TASK-GJ-0006`，关联 R-012/R-013、ADR-0011 和阶段 2 安全前置门禁。
- 范围只包含模型/来源凭证加密、迁移、轮换、吊销、掩码和生产启动门禁。
- 排除真实云 KMS、真实模型/来源凭证、新公开 API 和前端页面。

### Plan / DoR

- 建立可注入 `SecretVault`，当前 Adapter 使用 AES-256-GCM，AAD 必须绑定凭证类型、记录、Owner 和 Team。
- MySQL 中模型与来源 Key 不得新增明文；历史明文必须可按批次迁移并从检查点恢复。
- 损坏密文、未知 Key、跨租户上下文和配置错误必须失败关闭，不允许回退成明文。
- 轮换必须支持新主 Key 重加密和旧 Key 过渡解密；移除旧 Key 后构成吊销。
- 回滚必须保留数据库兼容性证据，禁止把明文凭证导出到普通文件。

### Implement

- 新增 `backend/src/security/secret-vault.ts` 和 `credential-secret-storage.ts`，统一加密、解密、密文识别、掩码与错误分类。
- 密文格式为 `gjsec:v1:<keyId>:<iv>:<authTag>:<ciphertext>:gcm`；随机 IV，认证标签和 AAD 共同防篡改与跨上下文解密。
- `ai_model_configs.api_key` 与 `lead_source_configs.api_key` 只写密文，读取时在准确上下文中解密，公开返回保持尾四位掩码。
- 新增 `credential_secret_migrations`，记录状态、当前表/记录、迁移/轮换/校验计数、失败分类和时间。
- 每批 100 条；使用 MySQL `GET_LOCK` 防并发迁移，并以旧值条件更新防止覆盖并发写入。
- 启动时迁移明文、轮换旧 Key、重新校验已完成数据；损坏密文或未知 Key 直接拒绝启动。
- 新增生产环境主密钥和过渡解密密钥配置门禁；MySQL 模式缺少主 Key 时拒绝启动。

### Verify / Review

- Test first：首次专项测试因 `secret-vault.js` 不存在以 `ERR_MODULE_NOT_FOUND` 失败；未删除、跳过或放宽测试。
- 接入 MySQL 后首次构建因查询助手不支持第三个参数失败；改为参数化查询后通过。
- `npm run test:vault --workspace backend`：PASS，覆盖加密、上下文隔离、篡改、迁移、重复迁移、轮换、吊销、掩码、MySQL 映射和生产门禁。
- `npm run verify`：PASS；API 167，跨模块租户隔离 18。
- `npm run test:e2e`：PASS，37/37。
- `npm run audit:dependencies`：PASS，0 vulnerabilities。
- 暂存后 `npm run test:repo-security`：PASS，135 files；`git diff --cached --check`：PASS。
- Review 确认真实模型、来源和云 KMS 外呼均为 0；明文失败降级被禁止。

### Record / Next

- 实现 Commit：`a3e2dcc`。
- 证据：`docs/engineering/evidence/L-0012-secret-vault.md`。
- R-012/R-013 进入 Verification：本地代码和门禁已完成，真实部署仍需备份恢复、迁移状态与密钥托管验证。
- 下一循环 L-0013：从单一低耦合领域建立 Repository / Unit of Work 与 MySQL 增量持久化，不一次性重写 `CrmStore`。

## 2026-07-15 — Loop L-0013：Repository / Unit of Work 与增量持久化

### Orient / Select

- 基线 Commit：`2f866cc`；分支：`codex/phase-1-route-modularization`。
- 登记 `REQ-GJ-ARCH-002 / TASK-GJ-0007`，关联 R-005/R-011、ADR-0012 和阶段 2 数据边界门禁。
- 只选择线索外联领域，禁止一次性重写 `CrmStore`；不改变公开 API，不连接真实 MySQL/SMTP。

### Plan / Test-first

- 定义 Repository 端口、Memory/MySQL Adapter、Unit of Work、唯一键回读、pending 乐观条件和租户谓词。
- 首次专项测试按预期以 `ERR_MODULE_NOT_FOUND` 失败。
- 实现后测试曾因正则将 `deleted_at` 误判为 `DELETE`；修正为只拒绝以 `DELETE/TRUNCATE` 开头的 SQL，产品断言未放宽。

### Implement

- 新增 `LeadOutreachRepository`、`PersistenceConflictError` 与 Memory Adapter。
- 新增 MySQL Unit of Work，确保 commit/rollback/release。
- 新增 MySQL Repository，使用参数化 SELECT/INSERT/UPDATE 和多表事务。
- 外联服务在 Repository 成功后才同步内存状态；Repository 路径不调用 `store.persist()`。
- `lead_outreach_requests` 退出 `persistAll` 快照替换。

### Verify / Review

- Repository 契约：Memory/MySQL PASS；MySQL commit 2、rollback 2、按行语句 21、全量快照写 0。
- 外联路由：Repository commit 10、全量快照写 0，幂等/pending/回滚通过。
- `npm run verify` PASS；API 167；tenant isolation 18。
- `npm run test:e2e` PASS，37/37；`npm run audit:dependencies` PASS，0。
- Review 确认 SQL 参数化、Owner/Team 条件、原始幂等 Key/邮件正文/SMTP 密钥不落库，真实外呼 0。

### Record / Next

- 实现 Commit：`a70359b`。
- 证据：`docs/engineering/evidence/L-0013-repository-unit-of-work.md`。
- R-005 仅部分缓解；其他领域仍需逐域迁移。
- 下一循环 L-0014：AI 工作流 MySQL 状态、跨进程恢复、并发确认与 Effect 幂等。

## 2026-07-15 — Loop L-0014：AI 工作流 MySQL 持久化、恢复与并发幂等

### 目标

把 L-0011 的 LangGraph 内存技术验证推进为可跨实例恢复、可审计和可防并发重复 Effect 的 MySQL 持久化底座。

### Test-first

- 首次专项测试因 `mysql-ai-workflow-persistence.js` 不存在而按预期失败。
- 实现中测试发现空 checkpoint ID 处理和 TypeScript lib 兼容问题；修复实现/测试兼容性，没有删除门禁或放宽产品断言。

### 已完成

- 新增 ADR-0013 和六张 `ai_workflow_*` 表。
- 实现 MySQL Checkpointer、运行摘要、唯一审批决策、审计和租约式 Effect Store。
- 引擎支持持久化审计、重复 run 恢复、actor/tenant 校验和冲突决策失败关闭。
- Secret 扫描覆盖 checkpoint、metadata、writes、run、approval、effect 和 audit。
- MySQL Store 初始化接入工作流 schema；公开 API 数保持 167。

### 验证

- 专项：6 表、跨实例恢复、并发确认、冲突决策、权限复检、租约恢复和 Secret 拒绝全部通过，真实外呼 0。
- `npm run verify`：PASS；API 167；tenant isolation 18；前端基线包 1,394.14 kB。
- `npm run test:e2e`：PASS，37/37（3.5 分钟）。
- `npm run audit:dependencies`：PASS，0 vulnerabilities。

### Record / Next

- 实现 Commit：`9ab50b1`。
- 证据：`docs/engineering/evidence/L-0014-ai-workflow-mysql-persistence.md`。
- R-014 保持 Mitigating，真实 MySQL 演练留待后续。
- 下一循环 L-0015：前端模块化、动态导入、路由分包和 bundle budget。

## 2026-07-15 — Loop L-0015：前端渐进式动态分包与 Bundle Budget

### Discover / Register

- 登记 `REQ-GJ-FE-PERF-001 / TASK-GJ-0008`，关联 R-004/R-008 与 ADR-0014。
- 确认正式入口为 384.03 kB 静态 `index.html` + `prototype-api.ts`，不是未使用的 React `main.tsx`。
- 基线构建：单个 JavaScript 包 1,394.14 kB / gzip 444.16 kB，无 manifest、动态 import 或性能预算。

### Test-first

- 新增 Bundle Budget 后首次运行按预期失败：报告 1,394.14 kB 单包及 manifest/懒加载边界缺失。
- 实现后 self-test 首次因入口契约改变失败；补充 bootstrap 与动态导入断言，41→44。
- 首次完整 E2E 35/37，工作簿导出暴露包装函数递归；修正后失败用例 2/2、全量 37/37。
- 未删除测试、跳过门禁、提高 warning 阈值或放宽业务断言。

### Implement

- 新增 `bootstrap.ts` 动态加载正式原型。
- 工作簿能力按操作加载，失败后允许重试。
- Dashboard 图表迁入懒加载模块，增加过期渲染保护和统一释放。
- XLSX、ECharts、ZRender 使用稳定独立 chunk；Vite 输出 manifest。
- frontend build 自动执行 Bundle Budget。

### Verify

- 构建：entry 1.90 kB；prototype 389.65 kB；workbook 3.54 kB；XLSX 492.35 kB；dashboard 2.78 kB；ECharts 321.17 kB；ZRender 184.17 kB。
- `npm run test:bundle-budget --workspace frontend`：PASS。
- frontend self-test 44；来源 8 states/4 APIs；workbook security PASS。
- `npm run verify`：PASS；API 167；tenant isolation 18。
- `npm run audit:dependencies`：PASS，0 vulnerabilities。
- `npm run test:e2e`：PASS，37/37（3.4 分钟）。

### Record / Next

- 实现 Commit：`1509f64`。
- 证据：`docs/engineering/evidence/L-0015-frontend-progressive-code-splitting.md`。
- R-008 调整为 Mitigating；不把 384 kB HTML 或页面控制器拆分混报完成。
- 下一循环 L-0016：阶段 2 全量验收、追踪审计、风险复核和回顾。

## 2026-07-15 — Loop L-0016：阶段 2 全量验收、追踪审计与回顾

### Discover / Register

- 登记 `REQ-GJ-ENG-AUDIT-001 / TASK-GJ-0009`，关联 ADR-0015。
- 将阶段 2 收口定义为范围验收，不等同于所有架构和部署工作完成。

### Test-first

- 首次 `npm run test:traceability` 按预期失败，暴露追踪行、完成日期、结构化验证、设计路径和实现 Commit 命名债务。
- 修复真实追踪债务，没有删除测试、跳过门禁或放宽 Done 标准。

### Implement

- 新增机器可验证的追踪门禁并纳入根 `verify`。
- 检查 REQ/TASK 唯一性、状态、设计/证据路径、阶段 2 Done 元数据、本地 Commit 和迭代一致性。
- 补齐历史 Done 项结构化验证，完成阶段状态、计划、风险、证据和交接复核。

### Verify

- `npm run test:traceability`：PASS；16 REQ、16 TASK、阶段 2 Done 7。
- `npm run verify`：PASS；repository security 153；API 167；tenant isolation 18；frontend self-test 44；Bundle Budget PASS。
- `npm run audit:dependencies`：PASS，0 vulnerabilities。
- `npm run test:e2e`：PASS，37/37。
- 测试真实外呼：0。

### Record / Next

- 实现 Commit：`cddd97f`。
- 证据：`docs/engineering/evidence/L-0016-phase-2-acceptance.md`。
- 阶段 2：Accepted with carry-over；持续风险和转移项保持原状态。
- 下一循环 L-0017：阶段 3 获客数据管道基础与统一接入契约。


## 2026-07-15 — Loop L-0017：统一获客数据管道基础

### Discover / Register

- 登记 `REQ-GJ-LEAD-001 / TASK-GJ-0201`，关联 ADR-0016 与 R-015。
- 明确本循环只建立 Connector 无关基础，不接真实供应商、不改公开 API/数据表。

### Test-first

- 首次专项测试因 `lead-ingestion-pipeline.js` 不存在而按预期失败。
- 测试先锁定规范化、稳定键、逐记录检查点、故障恢复、重复写入 0、Secret 拒绝和 CRM 血缘映射。

### Implement

- 实现 `LeadIngestionPipeline`、Connector/Sink/Checkpoint Store 契约。
- 固定 `lead-normalizer/v1` 与 `leadrec_*` 确定性记录键。
- checkpoint 绑定 job/owner/team/source/provider/version，错误上下文失败关闭。
- 新增 CRM Sink，复用现有来源血缘与幂等写入。

### Verify / Review

- 专项 PASS：normalized fields 7、persisted 2、resumed true、duplicate writes 0、Secret rejected、真实外呼 0。
- `npm run verify` PASS；repository security 158；API 167；tenant isolation 18；frontend self-test 44；Bundle Budget PASS。
- `npm run audit:dependencies` PASS，0 vulnerabilities。
- `npm run test:e2e` PASS，37/37。

### Record / Next

- 实现 Commit：`308cb67`。
- 证据：`docs/engineering/evidence/L-0017-lead-ingestion-pipeline.md`。
- R-015 保持 Mitigating；真实样本与供应商验收留待后续。
- 下一循环 L-0018：CSV/Excel Connector 接入统一管道。


## 2026-07-15 — Loop L-0018：CSV/Excel Connector

### Register / Test-first

- 新增 ADR-0017 与 L-0018 Evidence，设计为前后端复用同一工作簿安全 package。
- 创建 file connector 专项契约测试并接入后端 test。
- 首次专项按预期以 `ERR_MODULE_NOT_FOUND` 失败：`@goodjob/workbook-security` 尚未加入 workspace/package-lock。
- 完成 workspace 接线后再次按预期失败：`file-lead-ingestion-connector.js` 尚不存在。

### Implement

- 新增 `FileLeadIngestionConnector`，支持 CSV/XLSX/XLS、显式映射版本、SHA-256 文件摘要和逐行血缘。
- 支持 `reject_batch`、`skip_invalid`、固定分页 cursor、上下文绑定 checkpoint、故障恢复和稳定幂等身份。
- 将工作簿安全实现集中到 `@goodjob/workbook-security`；前端改为薄包装，前后端不再复制安全逻辑。
- dependency-policy 检查共享 package、两个消费者、SheetJS 官方来源和完整性摘要。
- 拒绝 Secret-like/Prototype Pollution 表头、危险公式、签名伪造和资源超限；不保存整行原文；真实外呼 0。

### Verify / Review

- 专项 PASS：formats 3、mappedRows 2、lineageFields 5、resumed true、duplicate writes 0、rejectBatchWrites 0、partial failure true、security rejections 5、真实外呼 0。
- `npm run verify` PASS；repository security 165；traceability 16/16；API 167；tenant isolation 18；frontend self-test 44；workbook security PASS；Bundle Budget PASS。
- `npm run audit:dependencies` PASS，0 vulnerabilities。
- `npm run test:e2e` 首次完整运行 36/37，首条登录等待超时；单条复跑 PASS；随后完整复跑 PASS，37/37。
- `git diff --check` PASS。

### Record / Next

- Test-first/Red Commit：`876ba19`；实现 Commit：`db6c711`。
- 证据：`docs/engineering/evidence/L-0018-csv-excel-lead-connector.md`。
- R-015 保持 Mitigating；真实客户样本、真实网络和供应商验收继续 Deferred。
- 下一循环 L-0019：公开网页/搜索 Connector 安全执行边界。


## 2026-07-15 — Loop L-0019：公开网页/搜索安全 Connector（进行中）

### Register / Test-first

- 新增 ADR-0018 与 L-0019 Evidence，关联 `REQ-GJ-LEAD-001 / TASK-GJ-0201`、R-006/R-015。
- 专项契约先锁定 allowlist、DNS/IP/重定向、robots/许可、租户限流、内容限制/隔离、分页/checkpoint、恢复、幂等和真实外呼 0。
- 首次专项实际运行以 `ERR_MODULE_NOT_FOUND` 失败，缺少 `web-lead-ingestion-connector.js`；当前仅保存 Test-first/Red 检查点，不得标记 Done。


## 2026-07-15 — L-0019 会话收口与可恢复性审计

### Audit

- 发现 PROJECT_STATUS/HANDOFF 仍将 L-0019 写为“待启动”，与仓库实际 Test-first/Red 状态不一致。
- 发现工作区包含尚未提交的超时、robots 不可用、重定向超限和缺少许可依据测试增强。
- 将测试增强固化为 Commit `3058c32`，保留初始 Test-first Commit `603c664`。
- 再次执行专项测试，确认生产实现文件不存在，实际结果为预期 `ERR_MODULE_NOT_FOUND`；真实外呼 0。

### Record / Next

- 更新 PROJECT_STATUS、FEATURES、TRACEABILITY、HANDOFF 和 L-0019 Evidence，使下一会话不依赖聊天上下文即可恢复。
- 下一动作唯一化：实现 `web-lead-ingestion-connector.ts`，按专项失败逐项转绿，再执行 build、verify、audit、E2E 和文档收口。
- 当前不宣称 L-0019 实现完成，不宣称全量质量门禁通过。


## 2026-07-15 — Loop L-0019：公开网页/搜索安全 Connector（完成）

### Implement

- 实现 `WebLeadIngestionConnector`、显式 Resolver/Transport/Extractor/RateLimiter 契约和内存限流器。
- 每次请求/重定向执行 allowlist、DNS/IP、地址钉扎、限流、响应限制；robots 失败关闭。
- 净化危险 HTML 与 Prompt 注入样式内容，外部正文只作为不可信数据交给 Extractor，原文不持久化。
- checkpoint 绑定 connector/tenant/种子/策略摘要并保存队列、robots 摘要和解析钉扎。

### Verify / Review

- 专项 PASS：2 documents、robots/许可血缘、内容隔离、故障恢复、duplicate writes 0、安全拒绝 12、真实外呼 0。
- `npm run verify` PASS：repository security 169、traceability 16/16、API 167、tenant 18、frontend self-test 44、workbook security/Bundle Budget PASS。
- `npm run audit:dependencies` PASS，0 vulnerabilities。
- `npm run test:e2e` PASS，37/37。
- `git diff --check` PASS。

### Record / Next

- Test-first Commits：`603c664`、`3058c32`；实现 Commit：`3b0c366`。
- Evidence：`docs/engineering/evidence/L-0019-public-web-search-connector.md`。
- R-006 保持 Open，R-015 保持 Mitigating；真实网络、供应商、凭证和客户数据继续 Deferred。
- 下一循环 L-0020：第三方 API Connector 插件边界。


## 2026-07-15 — Loop L-0020：第三方 API Provider 插件边界（进行中）

### Discover / Register

- 新增 ADR-0019 与 L-0020 Evidence，继续关联 `REQ-GJ-LEAD-001 / TASK-GJ-0201`、R-006/R-013/R-015。
- 明确只建立 Mock Provider 插件边界，不选择真实供应商、不接真实凭证、不进行真实外呼。

### Test-first

- 专项测试已覆盖 Registry、credential handle、配置、两页分页隔离、Mapper/血缘、Pipeline 恢复/幂等、Retry-After、指数退避、最大重试、额度/预算、错误分类、无效响应、checkpoint 篡改和 Secret 拒绝。
- 实现文件不存在时运行 `npm run test:connector:api-leads --workspace backend`，真实返回 `ERR_MODULE_NOT_FOUND`，退出码 1，真实外呼 0。

### 会话收口审计

- 纠正并持续更新 `PROJECT_STATUS.md`、`FEATURES.json` 和 L-0020 Evidence：先记录契约草拟，再以真实 `ERR_MODULE_NOT_FOUND` 更新为 Test-first/Red 已完成，不能误报实现已通过。
- 扩充 `HANDOFF.md`：记录稳定基线、本地未提交文件、已写/待写测试契约、下一会话命令顺序、完成定义与暂停条件。
- 修复 `L-0017-lead-ingestion-pipeline.md` 的历史编码损坏，恢复目标、Test-first、实现、专项、完整门禁、风险和交接证据。
- 明确根目录 `DEVELOPMENT_STATUS.md` 仅为历史业务快照，工程状态以 `docs/engineering/` 为准。
- 文档校验：`FEATURES.json` 可解析；`npm run test:traceability` PASS（16 REQ / 16 TASK，currentIteration L-0020）；`git diff --check` PASS；工程文档编码/占位审计 PASS。

## 2026-07-15 — Loop L-0020：第三方 API Provider 插件边界（完成）

### Implement

- Test-first/Red Commit `33e508c` 保存完整失败契约；实现 Commit `c361a26` 新增 API Provider Registry、版本化插件/Mapper 和统一 Connector。
- 使用 credential handle，拒绝原始凭证、Secret-like 配置/响应和错误正文透传。
- 实现 Provider opaque cursor 隔离、上下文绑定 checkpoint、Retry-After、指数退避、最大重试、错误分类和租户级请求预算。
- 接入统一 Pipeline，验证第二条 Sink 故障恢复、完整重跑和逐记录 API 血缘。

### Verify / Review

- 专项 PASS：Provider plugins 1、pages 2、lineage fields 6、error classifications 10、duplicate writes 0、credential leaks 0、真实外呼 0。
- backend build PASS。
- 最终 `npm run verify` PASS：repository security 173、REQ/TASK 16/16、API 167、tenant 18、frontend self-test 44。
- dependency audit PASS，0 vulnerabilities；Playwright PASS，37/37；`git diff --check` PASS。
- 文档暂存后再次 `npm run verify` PASS：repository security 174、currentIteration L-0021。
- 首次组合门禁曾随机命中 Fetch 禁用端口，`ai-config-routes-test.ts` 报一次 `bad port`；未修改代码复跑完整 PASS，移交 L-0021 观察。

### Record / Next

- Evidence：`docs/engineering/evidence/L-0020-third-party-api-provider-boundary.md`。
- R-006 Open、R-013 Verification、R-015 Mitigating；真实供应商/凭证/网络/客户数据继续 Deferred。
- 下一循环 L-0021：阶段 3 跨 Connector 全量验收、追踪审计、风险复核和回顾。

## 2026-07-15 — Loop L-0021：阶段 3 全量验收（Test-first/Red）

### Register / Test-first

- 新增 ADR-0020，决定以机器门禁验证阶段 3 状态、统一 Connector 契约、追踪、外部 Deferred 和 L-0022 交接。
- 新增 `scripts/phase-3-acceptance-check.mjs` 与根命令 `npm run test:phase3-acceptance`，暂不接入 `verify`，等待真实 Red 转绿。
- 三类 Connector 源码均已被门禁识别为实现 `LeadIngestionConnector`。

### Red

- 首次运行退出码 1，返回 `Phase 3 acceptance FAILED`，共 24 个真实失败项。
- 失败覆盖：根 verify 未接入、REQ 状态/完成元数据、L-0021 状态、追踪 Done、L-0022 交接、统一验收结论、完整门禁指标、风险、回滚和 Test-first Commit。
- 未修改业务代码、未真实外呼、未使用真实凭证或客户数据。

### Next

- 先创建独立 Test-first Commit，再执行四组专项和全量门禁；按实际结果更新阶段状态和 Evidence，使验收门禁转绿。

## 2026-07-15 — Loop L-0021：阶段 3 全量验收（完成）

### Verify

- 四组专项独立 PASS：统一 Pipeline、File、Web、API Provider；三类 Connector 均实现 `LeadIngestionConnector`。
- 故障恢复和完整重跑通过；duplicate writes 0；credential leaks 0；真实外呼 0。
- `npm run verify` PASS；repository security 176；REQ/TASK 16/16；API 167；tenant 18；frontend self-test 44；workbook security/Bundle Budget PASS。
- dependency audit PASS，0 vulnerabilities；Playwright PASS，37/37；`git diff --check` PASS。
- L-0020 的一次动态端口 `bad port` 在本循环未复现。

### Accept / Review

- 阶段结论：Accepted with explicit deferred external validation。
- REQ-GJ-LEAD-001 与 L-0017~L-0021 标记 Done；追踪矩阵、Evidence、风险、回滚和交接已同步。
- 真实客户文件、网页许可/网络、供应商/凭证、真实数据库和阶段 4 模型红队继续 Deferred。
- R-006 Open、R-013 Verification、R-015 Mitigating，不因本地 Mock 验收自动关闭。

### Next

- `currentIteration` 切换为 L-0022；阶段 4 从 AI 线索清洗、补全、去重与 ICP 评分的 Test-first 契约开始。
- 真实模型供应商、API Key、生产调用、真实客户数据和不可逆评分规则必须暂停确认。
