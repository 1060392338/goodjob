# 项目实施状态

更新时间：2026-07-14
当前分支：`codex/phase-1-route-modularization`
当前阶段：阶段 2——可维护架构基础
整体状态：进行中

## 阶段门禁概览

| 阶段 | 状态 | 已有证据 | 未完成门禁 |
|---|---|---|---|
| 0 接管与安全基线 | Verification | Harness、生产配置门禁、工作簿安全、audit 0、E2E 37/37 | GitHub 历史扫描、Linux/Node 22 Actions、部署凭证轮换确认 |
| 1 业务行为基线 | Baseline established | 后端 self-test、security test、167 个 API 操作、37 条 E2E | 远端 CI 固化；持续维护角色/API 矩阵 |
| 2 可维护架构基础 | In progress | ADR-0005；系统/认证/客户/线索核心共 18 个 API 已模块化 | 线索外联/转化、AI、集成和前端模块继续拆分 |
| 3~7 数据/AI/协作/发布 | Backlog | ADR-0002/0003 与功能台账 | 依赖阶段 2 稳定边界 |

详细阶段、验收和测试标准见 `DEVELOPMENT_PLAN.md`。

## 当前事实

| 项目 | 当前事实 |
|---|---|
| 业务基线 | 当前 Gitee GoodJob 功能和行为为唯一基线，不进行 MVP 式推倒重写 |
| 前端 | React 19、Vite、TypeScript；主要交互仍集中在超大文件 `prototype-api.ts` |
| 后端 | Express、TypeScript；`server.ts` 约 6526 行，系统/认证/客户/线索核心共 18 个 API 已迁出并显式装配 |
| 数据 | 支持 memory 与 MySQL；生产启动禁止 memory store |
| 测试 | `verify` 已包含仓库安全、依赖策略、独立路由测试、前后端 self-test、安全、工作簿和构建 |
| API 契约 | OpenAPI 与注册路由均保持 167 个操作；安全测试锁定基线 |
| E2E | Playwright 37/37 |
| 安全 | `npm audit --audit-level=high` 为 0；历史与部署凭证仍待远端闭环 |
| 远端 | GitHub `1060392338/goodjob` 已建立；`master` 与当前开发分支已推送旧版本，L-0006 待本轮推送；Gitee `origin` 保留 |

## 当前循环

**Loop L-0006：线索核心路由、生命周期与来源血缘模块化——本地验证完成**

- 关联需求/任务：`REQ-GJ-ARCH-001 / TASK-GJ-0003`；
- 设计：沿用 `ADR-0005`；
- 实现：9 个核心线索 API、来源摄取幂等、生命周期、垃圾箱、来源血缘和客户匹配已迁出；
- 延后：社交触达、邮件发送、转化预览、转客户/商机 4 个高耦合 API 继续留在 `server.ts`；
- 专项：独立线索路由测试覆盖四级角色范围、越权、垃圾箱、详情租户过滤、幂等、活动和永久清理；
- 回归：`npm run verify` PASS；OpenAPI/注册操作 167；跨模块租户隔离 18；Playwright 37/37；
- 规模：`server.ts` 6850 → 6526，净减少 324 行；
- 交付：代码 Commit `3e5c5b3`；证据 `docs/engineering/evidence/L-0006-lead-modularization.md`；
- 状态：L-0006 已完成本地 DoD；总体 `REQ-GJ-ARCH-001` 继续 `in_progress`。

## 下一优先级

1. L-0007：模块化线索社交触达、邮件发送、转化预览和转客户/商机 4 个接口，明确外部副作用与跨聚合边界。
2. 保持每批迁移的 167 API、安全、来源追溯和 37 E2E 门禁。
3. 完成线索高耦合边界后，再进入 OpenAI-compatible Model Gateway 与统一协作平台 Adapter 入口。

## 阻塞项

- GitHub 仓库当前为 Public；是否调整为 Private 需由项目负责人确认。
- GitHub Actions、历史 Secret Scan 与分支保护尚未形成远端通过证据。
- 未确认现有部署实例清单，无法证明历史默认凭证已全部失效。
- 第三方线索数据厂商未指定；先实现通用 Connector 和 Mock，不阻塞接口建设。
- 钉钉、企微、飞书当前只建设统一 Adapter 与 Mock，不需要真实企业凭证。
