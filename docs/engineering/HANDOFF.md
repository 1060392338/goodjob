# 会话交接

更新时间：2026-07-15

## 当前工作位置

- 仓库：`C:\Users\Administrator\Documents\Codex\2026-07-13\hi\GoodJob`
- 分支：`codex/phase-1-route-modularization`
- 最近完成循环：`L-0007`
- 需求/任务：`REQ-GJ-ARCH-001 / TASK-GJ-0003`
- 基线 Commit：`79007f7`
- 代码交付 Commit：`dde131a`
- 证据：`docs/engineering/evidence/L-0007-lead-outreach-conversion.md`
- 总体状态：L-0007 已完成本地 DoD；阶段 2 与 `REQ-GJ-ARCH-001` 继续 `in_progress`

## L-0007 已完成内容

- 4 个高耦合线索 API 已迁出 `server.ts`：
  - `POST /api/leads/:id/social-touch`
  - `POST /api/leads/:id/send-email`
  - `GET /api/leads/:id/conversion-preview`
  - `POST /api/leads/:id/convert`
- 新增可注入 `OutboundEmailGateway`，既有 SMTP 路径统一复用 Nodemailer 实现，专项测试使用 Mock。
- 新增 `lead_outreach_requests` / `leadOutreachRequests`，使用哈希化 `Idempotency-Key`、载荷哈希和 `pending/succeeded/failed` 状态。
- 邮件认证失败、超时、成功重复、键/载荷冲突和最终持久化失败均有专项测试。
- 邮件外部结果不确定时保持 `pending`，相同键返回 409，不自动重发。
- 新增转化服务，协调线索、客户、商机、商机事件和线索活动；持久化失败完整回滚。
- 重复转化不重复创建客户、商机、事件或活动；来源事件继续保留。
- 抽取共享 `createDealEvent` 服务。
- `server.ts` 6526 → 6258 行，净减少 268 行。
- 无新生产依赖；新增 MySQL 兼容表属于追加式 Schema 变化。

## 测试驱动发现

专项测试首次运行发现并锁定两处问题：

1. 转化日期正则遗漏转义，导致已有跟进日期未被复用；
2. 商机事件数组原地 `unshift` 使失败回滚快照无效。

两处均通过修复实现解决，没有放宽断言、删除覆盖或跳过测试。

## L-0007 验证

- `npm run test:routes`：PASS；core/customer/lead/outreach/conversion 五组通过。
- `npm run test --workspace backend`：PASS。
- `npm run test:security`：PASS；API 操作 167；跨模块租户隔离 18。
- `npm run build --workspace backend`：PASS。
- `npm run verify`：PASS；仓库安全检查 98 个已跟踪文件。
- `npm run test:e2e`：PASS，Chromium 37/37。
- `npm run audit:dependencies`：PASS，0 vulnerabilities。
- `git diff --check`：PASS。

## 关键语义，不得在后续无 ADR 改动

- `/social-touch` 仅表示人工触达记录，不代表真实 WhatsApp、微信、LinkedIn 或电话平台已发送。
- 邮件先持久化 `pending` 再调用 Gateway；结果不确定时不得自动重发。
- 原始幂等键、邮件正文和 SMTP 凭证不得写入外联幂等记录。
- 真实社交平台发送必须走阶段 6 Collaboration Adapter。
- 转化来源通过 `lead → leadSourceEvents` 反查，不复制或删除来源事件。
- Store 进程内回滚不能替代数据库细粒度事务；R-005 继续 Open。

## GitHub 交付规则

- 唯一后续交付远端：`github https://github.com/1060392338/goodjob.git`。
- 不操作、不推送 Gitee `origin`。
- 推送使用本机代理：

```powershell
git -c http.proxy=http://127.0.0.1:7897 `
    -c https.proxy=http://127.0.0.1:7897 `
    push github codex/phase-1-route-modularization
```

- 推送后使用 `git ls-remote` 校验本地 HEAD 与 GitHub 分支 HEAD 一致。
- GitHub Actions、历史 Secret Scan、分支保护、必需检查和部署凭证轮换仍未闭环，不得声称已完成。

## 下一开发循环

建议启动 **L-0008：AI 与集成装配边界盘点和首个可测试切片**，继续阶段 2，而不是提前进入 AI 功能实现：

1. 盘点 `server.ts` 中 AI 配置、模型调用、获客 Connector、WhatsApp/企微及其他集成路由和直接依赖；
2. 冻结首个边界清晰的路由切片、URL、权限、状态码、响应、外部副作用和失败语义；
3. 根据 ADR-0002/0003/0005 决定是否新增 ADR-0007，明确 Model Gateway、Connector、Collaboration Adapter 与 Composition Root；
4. 先建立 Mock 契约、超时/认证/限流/未配置失败注入和租户隔离测试；
5. 只迁移一个满足 DoR 的切片，保持 API 167、audit 0、`verify`、security 和 E2E 37/37；
6. 不接入真实 OpenAI 密钥，不接入真实钉钉、企微、飞书凭证，不顺手扩展前端拆分或 MySQL Repository。

## 持续风险与阻塞

- R-001/R-009：GitHub 历史扫描、Actions、分支保护和部署凭证轮换未完成；
- R-005：MySQL Store 仍为全量快照持久化；
- R-008：前端主包和 `prototype-api.ts` 仍偏大；
- R-011：`pending` 邮件缺少运维查询、人工确认、告警和受控重试界面；
- 第三方线索厂商未指定；钉钉、企微、飞书真实企业凭证未提供，但不阻塞契约与 Mock 开发。