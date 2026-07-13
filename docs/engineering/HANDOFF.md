# 会话交接

更新时间：2026-07-13

## 当前工作位置

- 仓库：GoodJob 本地克隆
- 分支：`codex/phase-0-workbook-security`
- 基线：`e5c38b4`
- 当前循环：L-0003
- 需求/任务：`REQ-GJ-SEC-002 / TASK-GJ-0004`

## 本循环已完成，待提交

- SheetJS 从存在 High 漏洞的 npm 旧版本升级到官方 `xlsx@0.20.3` 发布包。
- 新增 ADR-0004 和统一工作簿安全模块。
- 保留 XLSX、XLS、CSV 兼容，集中处理所有业务导入导出。
- 新增文件大小、签名、行列、单元格长度和危险表头防护。
- 新增工作簿安全测试、恶意输入 E2E、依赖策略门禁和 CI 依赖审计。
- `npm run audit:dependencies`：0 vulnerabilities。
- `npm run verify`：PASS。
- `npm run test:e2e`：PASS，37/37。

## 已完成提交

- `3d7cce6`：工程 Harness 与 Loop Engineering 基线。
- `e5c38b4`：默认凭证和生产运行时安全基线。

## L-0002 仍需外部闭环

1. 获得 GitHub 目标仓库与权限后执行历史 Secret Scan。
2. 在 GitHub Actions 的 Linux/Node 22 环境运行质量门禁。
3. 确认是否存在部署实例；若存在，轮换账号、JWT、数据库与第三方凭证。
4. 将远端 Commit/PR、扫描、轮换和 CI 证据补入追踪矩阵。

因此 `REQ-GJ-SEC-001` 仍保持 `verification`。

## 下一开发循环

`REQ-GJ-ARCH-001 / TASK-GJ-0003`：拆分超大模块并建立正式领域边界。

建议先做后端低风险第一刀：

1. 创建 ADR，定义路由模块装配、依赖注入和公共错误处理边界；
2. 用现有 167 个 API 文档操作和安全测试锁定契约；
3. 优先提取认证、健康检查或客户查询等低耦合路由，不修改 URL、权限和响应结构；
4. 每次只移动一个领域，并运行 API/security/E2E 回归；
5. 为后续 AI Gateway、LeadSourceConnector、钉钉/企微/飞书 Adapter 留出独立模块目录。

## 已知注意事项

- 前端主包约 1.394 MB，工作簿能力后续可评估动态加载，但不能与架构拆分同时无边界扩展。
- `server.ts` 和 `prototype-api.ts` 很大，禁止一次性重写；必须小步移动并保存行为证据。
- `npm ci` 可能触发 WhatsApp/Puppeteer 大型浏览器下载；CI 使用 `PUPPETEER_SKIP_DOWNLOAD=true`。
- 本地 Node 为 24，CI 目标为 Node 22，必须保留远端兼容验证项。
