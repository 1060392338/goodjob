# 项目实施状态

更新时间：2026-07-13
当前分支：`codex/phase-1-route-modularization`
当前阶段：阶段 2——可维护架构基础
整体状态：进行中

## 阶段门禁概览

| 阶段 | 状态 | 已有证据 | 未完成门禁 |
|---|---|---|---|
| 0 接管与安全基线 | Verification | Harness、生产配置门禁、工作簿安全、audit 0、E2E 37/37 | GitHub 历史扫描、Linux/Node 22 Actions、部署凭证轮换确认 |
| 1 业务行为基线 | Baseline established | 后端 self-test、security test、167 个 API 操作、37 条 E2E | 远端 CI 固化；持续维护角色/API 矩阵 |
| 2 可维护架构基础 | In progress | ADR-0005；系统/认证路由第一批模块化 | 客户、线索、AI、集成和前端模块继续拆分 |
| 3~7 数据/AI/协作/发布 | Backlog | ADR-0002/0003 与功能台账 | 依赖阶段 2 稳定边界 |

详细阶段、验收和测试标准见 `DEVELOPMENT_PLAN.md`。

## 当前事实

| 项目 | 当前事实 |
|---|---|
| 业务基线 | 当前 Gitee GoodJob 功能和行为为唯一基线，不进行 MVP 式推倒重写 |
| 前端 | React 19、Vite、TypeScript；主要交互仍集中在超大文件 `prototype-api.ts` |
| 后端 | Express、TypeScript；`server.ts` 仍约 6990 行，第一批 4 个系统/认证 API 已迁出 |
| 数据 | 支持 memory 与 MySQL；生产启动禁止 memory store |
| 测试 | `verify` 已包含仓库安全、依赖策略、独立路由测试、前后端 self-test、安全、工作簿和构建 |
| API 契约 | OpenAPI 与注册路由均保持 167 个操作；安全测试锁定基线 |
| E2E | Playwright 37/37 |
| 安全 | `npm audit --audit-level=high` 为 0；历史与部署凭证仍待远端闭环 |
| 远端 | 尚未提供目标 GitHub 仓库地址和写权限 |

## 当前循环

**Loop L-0004：后端路由模块化第一批**

- 关联需求/任务：`REQ-GJ-ARCH-001 / TASK-GJ-0003`；
- 设计：`ADR-0005`；
- 实现：系统健康检查、认证登录/退出/当前用户、共享 asyncRoute 边界；
- 独立测试：`npm run test:routes`；
- 回归：`npm run verify` PASS；security 保持 167；Playwright 37/37；
- 状态：本地实现和验证完成，待提交；总体架构需求继续 `in_progress`。

## 下一优先级

1. 提交并收口 L-0004，保存 Commit 证据。
2. L-0005：客户路由与客户领域服务第一批拆分，保持数据范围和响应契约。
3. L-0006：线索路由/来源血缘边界，为 LeadSourceConnector 铺路。
4. 完成架构边界后进入 OpenAI-compatible Model Gateway。

## 阻塞项

- 未提供目标 GitHub 仓库地址和写权限，无法完成远端迁移、历史扫描、保护规则和 Actions 实跑。
- 未确认现有部署实例清单，无法证明历史默认凭证已全部失效。
- 第三方线索数据厂商未指定；先实现通用 Connector 和 Mock，不阻塞接口建设。
- 钉钉、企微、飞书当前只建设统一 Adapter 与 Mock，不需要真实企业凭证。
