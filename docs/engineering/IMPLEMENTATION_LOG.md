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
