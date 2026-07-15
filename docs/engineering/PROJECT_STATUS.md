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
| 2 可维护架构基础 | In progress | ADR-0005~0009；后端 30 个 API 已模块化；邮件、模型、来源 Connector 和首个前端领域模块边界已建立 | 前端剩余超大模块、Repository/Unit of Work、剩余集成路由继续拆分 |
| 3~7 数据/AI/协作/发布 | Backlog | ADR-0002/0003 与功能台账；阶段 3/4 已有前置 Gateway/Connector | 依赖阶段 2 稳定边界；真实凭证和供应商尚未指定 |

详细阶段、验收和测试标准见 `DEVELOPMENT_PLAN.md`。

## 当前事实

| 项目 | 当前事实 |
|---|---|
| 业务基线 | 当前 GoodJob 业务功能和行为为唯一基线，不进行 MVP 式推倒重写 |
| 前端 | React 19、Vite、TypeScript；`prototype-api.ts` 11745 → 11717 行；线索来源类型、选择状态和 4 个配置 API 客户端已迁入独立模块 |
| 后端 | Express、TypeScript；`server.ts` 5823 行，系统/认证/客户/线索/AI 配置/来源配置共 30 个 API 已迁出并显式装配 |
| 数据 | 支持 memory 与 MySQL；`lead_outreach_requests` 记录外联幂等；生产启动禁止 memory store |
| 外部副作用 | SMTP 通过 `OutboundEmailGateway`；模型 HTTP 通过 `ModelGateway`；来源连接测试通过 `LeadSourceConnector`；完整来源搜索仍沿用既有 Provider 路径 |
| AI 边界 | 三模型协议已统一传输契约；LangGraph.js 尚未引入；完整 Prompt/Schema 版本、用量、重试、审计仍属阶段 4 backlog |
| 来源边界 | Provider 元数据、配置和连接测试已统一；完整标准化搜索、分页/检查点、重试、幂等摄取和来源证据仍属阶段 3 backlog |
| 测试 | `verify` 已包含九组后端路由/Gateway/Connector 门禁和前端来源中心专项契约测试 |
| API 契约 | OpenAPI 与注册路由均保持 167 个操作；跨模块租户隔离 18 |
| E2E | Playwright 37/37 |
| 安全 | `npm audit --audit-level=high` 为 0；模型和来源 Key at-rest 加密、历史 Secret Scan 与部署凭证仍待闭环 |
| 前端性能 | 生产主包约 1.394 MB；L-0010 仅完成结构拆分，代码分割风险 R-008 仍未关闭 |
| 远端 | GitHub `1060392338/goodjob` 为唯一交付远端；Gitee 不再操作 |

## 当前循环

**Loop L-0010：前端线索来源中心模块边界——本地 DoD 完成**

- 关联需求/任务：`REQ-GJ-FE-001 / TASK-GJ-0005`；关联架构：`REQ-GJ-ARCH-001 / TASK-GJ-0003`；
- 基线：`3662a11`；代码交付：`487438b`；
- 设计：`ADR-0009`；证据：`evidence/L-0010-frontend-lead-source-center.md`；
- 范围：Provider 类型、默认选择、刷新/切换规则和来源配置 4 个 API 客户端迁出 `prototype-api.ts`；
- 兼容：DOM、Modal、Toast、按钮状态、导航、API 请求和完整搜索路径不变；
- Test first：首次专项测试因模块不存在失败；实现后 8 组状态规则和 4 个 API 契约通过；
- 回归：`verify` PASS、security API 167/tenant 18、audit 0、Playwright 37/37；
- 规模：`prototype-api.ts` 11745 → 11717 行，净减少 28 行；无数据库变化、无新生产依赖；
- 状态：L-0010 切片完成；阶段 2 继续 `in_progress`。

## 下一优先级

1. 建议启动 L-0011：LangGraph.js 技术验证与 ADR，只建立 `AiWorkflowEngine` 编排边界。
2. 使用 Mock ModelGateway 验证“读取线索 → AI 评分 → 人工确认 → 幂等模拟写入”的暂停、恢复、驳回和重复确认。
3. 不使用真实模型 Key，不写生产 CRM，不改变现有 167 个 API；MySQL Checkpoint 方案必须先决策，不得假设官方直接支持。
4. 若技术验证不满足权限、幂等、审计和恢复门禁，则不引入生产依赖，继续使用现有领域服务 + ModelGateway。
5. 后续仍需继续前端视图/控制器拆分、Repository/Unit of Work、阶段 3 完整来源管道和阶段 4 AI 闭环。

## 阻塞项

- GitHub 仓库当前为 Public；是否调整为 Private 需由项目负责人确认。
- GitHub Actions、历史 Secret Scan 与分支保护尚未形成远端通过证据。
- 未确认现有部署实例清单，无法证明历史默认凭证已全部失效。
- `pending` 邮件尚无运维查询/人工确认界面，当前只能拒绝相同键自动重放。
- `ai_model_configs.api_key` 与 `lead_source_configs.api_key` 仍为明文 at-rest；真实 Key 正式投入前需加密或外部 Secret 引用。
- 第三方线索数据厂商未指定；通用 Connector 不阻塞架构建设，但完整供应商验收无法开始。
- 钉钉、企微、飞书当前只保留统一 Adapter 入口与 Mock 计划，不需要真实企业凭证。
