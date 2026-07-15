# L-0007 线索外联、邮件与转化边界模块化证据

- 日期：2026-07-15
- 关联需求/任务：`REQ-GJ-ARCH-001 / TASK-GJ-0003`
- 风险：`R-004 / R-005 / R-011`
- 基线 Commit：`79007f7`
- 代码交付 Commit：`dde131a`
- 分支：`codex/phase-1-route-modularization`
- 设计依据：`ADR-0005 / ADR-0006`
- 状态：Completed

## Orient / 范围冻结

本循环只迁移以下 4 个现有 API，不新增、删除或重命名 API：

1. `POST /api/leads/:id/social-touch`
2. `POST /api/leads/:id/send-email`
3. `GET /api/leads/:id/conversion-preview`
4. `POST /api/leads/:id/convert`

范围外事项：

- `/social-touch` 仍是人工触达活动记录，不调用 WhatsApp、微信、LinkedIn 或电话平台；
- 不接入真实钉钉、企微、飞书凭证；真实平台发送留到阶段 6 Collaboration Adapter；
- 不在本循环实现 AI Model Gateway、提示词或 AI 写操作；
- 不改变现有 URL、方法、认证、租户范围、成功响应和既有状态码；
- 不重构 MySQL 全量快照持久化机制，Repository/Unit of Work 继续列为后续架构切片。

## 设计与数据影响

### 新模块

- `backend/src/gateways/outbound-email-gateway.ts`：定义 `OutboundEmailGateway`，生产装配 Nodemailer 实现，测试使用 Mock。
- `backend/src/domain/leads/lead-outreach-service.ts`：负责线索可见性、人工社交触达、邮件发送、幂等状态和内存回滚。
- `backend/src/domain/leads/lead-conversion-service.ts`：负责预览、客户匹配、客户/商机创建、商机事件、线索活动、重复转化和失败回滚。
- `backend/src/domain/deals/deal-service.ts`：抽取共享商机事件创建能力。
- `backend/src/routes/lead-outreach-routes.ts` 与 `lead-conversion-routes.ts`：负责 Zod 校验和 HTTP 映射。

### 新持久化记录

新增 `lead_outreach_requests` / `leadOutreachRequests`：

- 组合唯一边界：`lead_id + operator_id + action + idempotency_key_hash`；
- 状态：`pending / succeeded / failed`；
- 保存动作、渠道、活动引用、外部消息 ID、收件人、主题、公开错误和时间；
- 只保存 `Idempotency-Key` 的 SHA-256 哈希和请求载荷哈希；
- 不保存原始幂等键、邮件正文、SMTP 密码或其他凭证。

### 外部副作用规则

1. 邮件发送前先持久化 `pending`；
2. 成功后写邮件活动、用户最近发送摘要、线索跟进状态和 `succeeded`；
3. 相同键和相同载荷的成功请求返回原结果，不再次调用 Gateway；
4. 相同键和不同载荷返回 409；
5. SMTP 连接中断或超时保留 `pending`，相同键重试返回 409，禁止自动重发；
6. Gateway 已成功但最终持久化失败时，线索、用户和活动回滚，幂等记录保持 `pending`，避免未知结果下自动重复发送。

### 转化一致性规则

- 已转化线索通过 `convertedCustomerId / convertedDealId` 幂等返回，不重复创建客户、商机或事件；
- 新建客户或关联可见客户均保持既有权限范围；
- 可选创建商机，并创建对应 `created` 商机事件和线索系统活动；
- 持久化失败时恢复线索、客户、商机、商机事件和线索活动；
- `leadSourceEvents` 不复制、不删除，继续通过转化后的线索反查来源。

## 测试驱动发现与修复

专项测试在首次执行时发现两处实现问题，并在保持测试标准不变的前提下修复：

1. 转化服务日期正则遗漏转义，导致 `2026-08-20 15:30` 未被识别，错误回退到次日；已修复为日期格式识别并由断言锁定。
2. 商机事件使用原数组 `unshift`，原快照引用无法在持久化失败时删除新增事件；已改为复制快照并由失败注入测试锁定完整回滚。

未通过删除覆盖、放宽断言或跳过测试处理失败。

## 验收清单

- [x] 4 个 API 全部迁出 `server.ts` 并显式注册一次。
- [x] SMTP 只通过可注入 `OutboundEmailGateway` 执行，专项测试不连接真实 SMTP。
- [x] 无权访问或已删除线索不得触达、发送、预览或转化。
- [x] 社交触达更新活动、下次跟进时间和 `new → following` 状态。
- [x] 相同幂等键不重复创建活动或再次调用邮件 Gateway。
- [x] 相同键不同载荷返回 409。
- [x] SMTP 认证失败不创建成功活动。
- [x] SMTP 超时保持 `pending`，相同键不自动重放。
- [x] 邮件最终持久化失败回滚线索、用户和活动，并保持 `pending`。
- [x] 转化预览只返回当前用户可见客户。
- [x] 新建客户、关联已有客户、可选商机和商机事件行为通过。
- [x] 重复转化不增加客户、商机、事件或活动数量。
- [x] 转化持久化失败完整回滚，来源事件仍保留。
- [x] OpenAPI/注册 API 操作保持 167；跨模块租户隔离保持 18。
- [x] `server.ts` 从 6526 行降至 6258 行，净减少 268 行。
- [x] 无新生产依赖；`npm audit --audit-level=high` 为 0。
- [x] `REQ-GJ-ARCH-001` 保持 `in_progress`，未虚假声明阶段 2 完成。

## 验证结果

| 命令 | 结果 | 关键证据 |
|---|---|---|
| `npm run test:routes` | PASS | core/customer/lead/outreach/conversion 五组路由测试通过 |
| `npm run test:routes:lead-outreach --workspace backend` | PASS | Gateway 调用 4 次；幂等、pending、防重发和回滚通过 |
| `npm run test:routes:lead-conversion --workspace backend` | PASS | 可见性、来源追溯、重复转化和回滚通过；persist 3 次 |
| `npm run test --workspace backend` | PASS | 既有 social touch、send email、preview、existing/customer-only conversion 自测通过 |
| `npm run test:security` | PASS | API 操作 167；跨模块租户隔离 18 |
| `npm run build --workspace backend` | PASS | TypeScript 编译通过 |
| `npm run verify` | PASS | 仓库安全检查 98 个已跟踪文件；依赖策略、路由、自测、安全、工作簿和双端构建通过 |
| `npm run test:e2e` | PASS | Chromium 37/37 |
| `npm run audit:dependencies` | PASS | 0 vulnerabilities；High 为 0 |
| `git diff --check` | PASS | 无空白错误 |

环境：Windows、Node.js `v24.14.0`、`NODE_ENV=test`（测试脚本内设置）。

## 风险与运行注意事项

- `pending` 邮件代表“正在处理或外部结果不确定”，不得直接用相同键自动重发；需后续建设运维查询、人工确认和受控重新执行流程。
- 当前 MySQL Store 仍是全表替换事务；本循环只保证进程内回滚和整次 `persist()` 事务，不等同于面向并发的细粒度 Unit of Work。
- 未配置幂等键的旧客户端继续兼容，但无法跨请求获得防重复保证；前端/外部调用方后续应统一生成稳定键。
- 当前 `/social-touch` 不代表真实平台消息已发送，UI 和后续 Adapter 不得混淆“人工记录”和“平台外呼”。

## 回滚方案

1. 回滚代码 Commit `dde131a`，恢复 `server.ts` 中 4 个内联接口及原装配；
2. `lead_outreach_requests` 为追加式兼容表，代码回滚时可保留，不要求破坏性删表；
3. 如需物理删除表，必须先确认审计与幂等记录保留要求，并通过独立受控迁移执行；
4. 回滚后重新执行 `npm run verify` 与 `npm run test:e2e`，确认 167 API 与 37 条 E2E 未回归。

## Review / 回顾

- 有效做法：先冻结副作用与回滚语义，再通过可注入 Gateway 和失败注入测试实施，测试实际发现了日期和数组快照缺陷。
- 保留问题：MySQL 全量持久化、`pending` 运维处置、前端稳定幂等键、远端 CI/分支保护仍未闭环。
- 下一切片：在继续阶段 2 的前提下，先盘点 AI 与集成相关路由，建立 Model Gateway/Adapter 的装配边界和 Mock 契约；不得直接接入真实模型或钉钉/企微/飞书凭证。