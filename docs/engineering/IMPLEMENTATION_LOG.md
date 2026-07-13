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
