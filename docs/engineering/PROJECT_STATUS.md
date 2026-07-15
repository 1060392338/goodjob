# 项目实施状态

更新时间：2026-07-15
当前分支：`codex/phase-1-route-modularization`
当前阶段：阶段 2——可维护架构基础
整体状态：进行中

## 阶段门禁概览

| 阶段 | 状态 | 已有证据 | 未完成门禁 |
|---|---|---|---|
| 0 接管与安全基线 | Verification | Harness、生产配置门禁、工作簿安全、audit 0、E2E 37/37 | GitHub 历史扫描、Linux/Node 22 Actions、部署凭证轮换确认 |
| 1 业务行为基线 | Baseline established | 后端 self-test、security test、167 个 API 操作、37 条 E2E | 远端 CI 固化；持续维护角色/API 矩阵 |
| 2 可维护架构基础 | In progress | ADR-0005/0006；系统、认证、客户、线索共 22 个 API 已模块化；邮件 Gateway、外联幂等、转化回滚 | AI/集成路由、前端超大模块、Repository/Unit of Work 继续拆分 |
| 3~7 数据/AI/协作/发布 | Backlog | ADR-0002/0003 与功能台账 | 依赖阶段 2 稳定边界 |

详细阶段、验收和测试标准见 `DEVELOPMENT_PLAN.md`。

## 当前事实

| 项目 | 当前事实 |
|---|---|
| 业务基线 | 当前 GoodJob 业务功能和行为为唯一基线，不进行 MVP 式推倒重写 |
| 前端 | React 19、Vite、TypeScript；主要交互仍集中在超大文件 `prototype-api.ts` |
| 后端 | Express、TypeScript；`server.ts` 6258 行，系统/认证/客户/线索共 22 个 API 已迁出并显式装配 |
| 数据 | 支持 memory 与 MySQL；新增 `lead_outreach_requests` 幂等记录；生产启动禁止 memory store |
| 外部副作用 | SMTP 通过可注入 `OutboundEmailGateway`；社交触达当前仍是人工活动记录，不进行真实平台外呼 |
| 测试 | `verify` 已包含仓库安全、依赖策略、五组独立路由测试、前后端 self-test、安全、工作簿和构建 |
| API 契约 | OpenAPI 与注册路由均保持 167 个操作；安全测试锁定基线 |
| E2E | Playwright 37/37 |
| 安全 | `npm audit --audit-level=high` 为 0；历史与部署凭证仍待远端闭环 |
| 远端 | GitHub `1060392338/goodjob` 为唯一后续交付远端；Gitee 不再操作 |

## 当前循环

**Loop L-0007：线索外联、邮件与转化边界模块化——本地 DoD 完成**

- 关联需求/任务：`REQ-GJ-ARCH-001 / TASK-GJ-0003`；
- 基线：`79007f7`；代码交付：`dde131a`；
- 设计：`ADR-0005` + `ADR-0006`；
- 范围：社交触达、邮件发送、转化预览、转客户/商机 4 个 API 已迁出 `server.ts`；
- Gateway：SMTP 进入可注入 `OutboundEmailGateway`，专项测试使用 Mock，不连接真实 SMTP；
- 幂等：新增哈希化 `Idempotency-Key`、载荷哈希和 `pending/succeeded/failed` 持久化状态；
- 一致性：邮件最终持久化失败保持 `pending`；转化持久化失败回滚线索、客户、商机、事件和活动；
- 来源：转化后继续通过 `lead → leadSourceEvents` 反查来源；
- 测试发现并修复：转化日期识别错误、商机事件数组快照无法回滚；
- 回归：`test:routes`、backend self-test、security、build、`verify`、audit 全部 PASS；Playwright 37/37；
- 规模：`server.ts` 6526 → 6258，净减少 268 行；
- 状态：L-0007 切片完成；总体 `REQ-GJ-ARCH-001` 和阶段 2 继续 `in_progress`。

## 下一优先级

1. 启动 L-0008：盘点 AI 与集成相关路由，冻结 Model Gateway、Connector、Collaboration Adapter 的 Composition Root 装配边界。
2. 先建立 Mock/契约和失败注入测试，再迁移一个边界清晰的 AI/集成路由切片；不得直接接真实模型或真实钉钉、企微、飞书凭证。
3. 继续保持 167 API、租户隔离、audit 0、`verify` 和 Playwright 37/37 门禁。
4. 后续独立处理前端 `prototype-api.ts` 拆分与 MySQL Repository/Unit of Work，不在 L-0008 顺手扩展。

## 阻塞项

- GitHub 仓库当前为 Public；是否调整为 Private 需由项目负责人确认。
- GitHub Actions、历史 Secret Scan 与分支保护尚未形成远端通过证据。
- 未确认现有部署实例清单，无法证明历史默认凭证已全部失效。
- `pending` 邮件尚无运维查询/人工确认界面，当前只能拒绝相同键自动重放。
- 第三方线索数据厂商未指定；先实现通用 Connector 和 Mock，不阻塞接口建设。
- 钉钉、企微、飞书当前只建设统一 Adapter 与 Mock，不需要真实企业凭证。