# 项目实施状态

更新时间：2026-07-13  
当前分支：`codex/phase-0-security-baseline`
当前阶段：阶段 0——代码接管、安全基线与工程治理
整体状态：进行中

## 本阶段目标

- [x] 从 Gitee 克隆 GoodJob，确认基线 Commit `9f7d154`。
- [x] 建立 Harness Engineering 与 Loop Engineering 文档体系。
- [x] 修复 Windows/Linux 跨平台测试脚本。
- [x] 完成本地 `npm run verify` 与 Playwright E2E 基线，E2E 36/36 通过。
- [x] 删除当前分支中的管理员凭证说明和登录页密码预填。
- [x] 增加生产运行时安全配置门禁和仓库安全检查。
- [ ] 在 GitHub 完成历史密钥扫描、Actions 实跑和分支保护。
- [ ] 确认是否存在已部署实例；如存在，完成全部相关凭证轮换并归档证据。
- [ ] 替换存在 High 漏洞且无可用修复版本的 `xlsx` 依赖。

## 当前事实

| 项目 | 当前事实 |
|---|---|
| 前端 | React 19、Vite、TypeScript；主要交互集中在超大文件 `prototype-api.ts` |
| 后端 | Express、TypeScript；大量路由集中在约 7000 行的 `server.ts` |
| 数据 | 支持 memory 与 MySQL；生产启动现已禁止 memory store |
| 测试 | 后端 self-test、安全测试、前端 self-test、Playwright E2E；统一命令为 `npm run verify` 与 `npm run test:e2e` |
| 构建 | 本机生产构建通过；前端主 JS 包约 1.3 MB，仍有拆包警告 |
| 安全 | 当前工作树已移除显式凭证说明与密码预填；Git 历史和部署实例仍待远端审计 |
| 依赖 | `xlsx` 存在 Prototype Pollution 与 ReDoS High 漏洞，npm 当前无修复版本 |
| 远端 | 尚未提供目标 GitHub 仓库地址和写权限 |

## 当前循环

**Loop L-0002：默认凭证与生产运行时安全基线**

- 关联需求：`REQ-GJ-SEC-001`
- 关联任务：`TASK-GJ-0002`
- 实现状态：代码完成，进入 `verification`
- 已通过：`npm run verify`、Playwright 36/36、不安全生产配置启动失败验证
- 待完成：GitHub 历史 Secret Scan、远端 CI、部署实例确认与必要轮换

## 下一优先级

1. 提交并收口 L-0002 安全基线。
2. 执行 `REQ-GJ-SEC-002 / TASK-GJ-0004`：替换 `xlsx` 高危依赖并保持导入导出兼容。
3. 执行 `REQ-GJ-ARCH-001 / TASK-GJ-0003`：以回归测试保护为前提拆分后端与前端超大模块。
4. 执行 `REQ-GJ-AI-001`：建立 OpenAI-compatible Model Gateway。

## 阻塞项

- 未提供目标 GitHub 仓库地址和写权限，无法完成远端迁移、历史扫描、保护规则和 Actions 实跑。
- 未确认现有部署实例清单，无法证明历史默认凭证已全部失效。
- 第三方线索数据厂商未指定；先实现通用 Connector 和 Mock，不阻塞接口建设。
- 钉钉、企微、飞书本阶段只做统一 Adapter 与 Mock，不需要真实企业凭证。
