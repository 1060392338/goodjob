# 项目实施状态

更新时间：2026-07-13  
当前分支：`codex/phase-0-engineering-harness`  
当前阶段：阶段 0——代码接管、基线审计与工程 Harness 建设  
整体状态：进行中

## 本阶段目标

- [x] 从 Gitee 克隆 GoodJob，确认基线 Commit `9f7d154`。
- [x] 确认前后端生产构建可以通过。
- [x] 发现 Windows 下测试脚本使用 Unix 环境变量语法，登记并修复。
- [x] 建立持久化工程文档、功能台账、追踪矩阵和开发循环规则。
- [ ] 完成修复后的全量 `npm run verify`。
- [ ] 安装 Playwright Chromium 并完成 E2E 基线。
- [ ] 完成默认账号文件、历史凭证与依赖风险审计。
- [ ] 配置 GitHub 远端、分支保护和项目看板。

## 基线事实

| 项目 | 当前事实 |
|---|---|
| 前端 | React 19、Vite、TypeScript；主要交互集中在超大文件 `prototype-api.ts` |
| 后端 | Express、TypeScript；大量路由集中在 `server.ts` |
| 数据 | 支持 memory 与 MySQL；现有 MySQL Store 仍有原型阶段全量持久化特征 |
| 测试 | 后端 self-test、安全测试、前端 self-test、Playwright E2E |
| 构建 | 2026-07-13 本机 `npm run build` 通过；前端主 JS 包约 1.3 MB，有拆包警告 |
| 测试基线 | 初次 `npm test` 在 Windows 因 `NODE_ENV=...` 语法失败，不是业务断言失败 |
| 仓库卫生 | 原仓库无 `.gitignore`，安装后 `node_modules/` 会进入未跟踪状态 |
| 安全 | 存在“管理员登录账号说明”类跟踪文件，必须确认内容、移除真实凭证并执行轮换 |

## 当前循环

**Loop L-0001：工程 Harness 与跨平台验证基线**

- 关联需求：`REQ-GJ-ENG-001`
- 关联任务：`TASK-GJ-0001`
- 输出：`AGENTS.md`、工程文档、GitHub 模板、CI、跨平台脚本、`.gitignore`
- 验收：`npm run verify` 在 Windows 与 GitHub Actions Linux 均可执行；状态文档与证据同步。

## 下一优先级

1. 完成 L-0001 验证并记录结果。
2. 执行 `SEC-GJ-001`：默认账号与历史密钥处置。
3. 执行 `ARCH-GJ-001`：为 AI/Connector/Adapter 提取后端模块边界，先不改变现有 API 行为。
4. 执行 `AI-GJ-001`：建立 OpenAI-compatible Model Gateway 的最小正式接口、配置与契约测试。

## 阻塞项

- 尚未提供目标 GitHub 仓库地址和写权限；本地开发可继续，但无法完成远端迁移、分支保护和 Actions 实跑。
- 第三方线索数据厂商未指定；先实现通用 Connector 和 Mock，不阻塞接口建设。
- 钉钉、企微、飞书本阶段只做接口与 Mock，不需要真实企业凭证。
