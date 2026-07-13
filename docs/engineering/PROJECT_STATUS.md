# 项目实施状态

更新时间：2026-07-13
当前分支：`codex/phase-0-workbook-security`
当前阶段：阶段 0——代码接管、安全基线与工程治理
整体状态：进行中

## 本阶段目标

- [x] 从 Gitee 克隆 GoodJob，确认基线 Commit `9f7d154`。
- [x] 建立 Harness Engineering 与 Loop Engineering 文档体系。
- [x] 修复 Windows/Linux 跨平台测试脚本。
- [x] 完成本地统一验证与 Playwright E2E 基线。
- [x] 完成默认凭证和生产运行时安全代码基线，Commit `e5c38b4`。
- [x] 替换存在已知 High 漏洞的工作簿依赖，并增加统一安全边界和回归测试。
- [ ] 在 GitHub 完成历史密钥扫描、Actions 实跑和分支保护。
- [ ] 确认是否存在已部署实例；如存在，完成全部相关凭证轮换并归档证据。

## 当前事实

| 项目 | 当前事实 |
|---|---|
| 前端 | React 19、Vite、TypeScript；主要交互集中在超大文件 `prototype-api.ts` |
| 后端 | Express、TypeScript；大量路由集中在约 7000 行的 `server.ts` |
| 数据 | 支持 memory 与 MySQL；生产启动禁止 memory store |
| 测试 | 统一门禁覆盖仓库安全、依赖策略、前后端 self-test、后端安全、工作簿安全和构建；E2E 37/37 |
| 构建 | 本机生产构建通过；前端主 JS 包约 1.394 MB / gzip 444 KB，仍有拆包警告 |
| 安全 | `npm audit --audit-level=high` 为 0；默认凭证的 Git 历史和部署实例仍待远端审计 |
| 工作簿 | 统一由 `frontend/src/workbook.ts` 处理 XLSX/XLS/CSV；限制 5 MB、行列、单元格长度和危险表头 |
| 远端 | 尚未提供目标 GitHub 仓库地址和写权限 |

## 当前循环

**Loop L-0003：工作簿依赖与不可信文件安全边界**

- 关联需求：`REQ-GJ-SEC-002`
- 关联任务：`TASK-GJ-0004`
- 设计：`ADR-0004`
- 实现状态：本地完成，待提交
- 已通过：依赖审计 0 漏洞、工作簿安全测试、`npm run verify`、Playwright 37/37
- 兼容范围：客户 XLSX/XLS/CSV 导入、客户导出、题库导入导出、提成导出、搜客结果导出

## 下一优先级

1. 提交并收口 L-0003 工作簿安全循环。
2. 执行 `REQ-GJ-ARCH-001 / TASK-GJ-0003`：以回归测试保护为前提，先提取后端认证/客户/线索路由装配边界。
3. 执行 `REQ-GJ-AI-001`：建立 OpenAI-compatible Model Gateway。
4. 执行 `REQ-GJ-LEAD-001`：建立统一 LeadSourceConnector 与数据血缘。

## 阻塞项

- 未提供目标 GitHub 仓库地址和写权限，无法完成远端迁移、历史扫描、保护规则和 Actions 实跑。
- 未确认现有部署实例清单，无法证明历史默认凭证已全部失效。
- 第三方线索数据厂商未指定；先实现通用 Connector 和 Mock，不阻塞接口建设。
- 钉钉、企微、飞书本阶段只做统一 Adapter 与 Mock，不需要真实企业凭证。
