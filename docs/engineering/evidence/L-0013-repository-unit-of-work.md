# L-0013 证据：Repository / Unit of Work 与增量持久化

- 日期：2026-07-15
- 关联：REQ-GJ-ARCH-002 / TASK-GJ-0007
- ADR：ADR-0012
- 基线 Commit：`2f866cc`
- 实现 Commit：`a70359b`
- 状态：本地 DoD 完成

## 范围

- 为线索外联建立 `LeadOutreachRepository` 领域端口；
- 提供 Memory 与 MySQL Adapter，并用同一套契约测试验证；
- 建立 MySQL Unit of Work；
- 将 pending 插入、失败更新、社交触达完成、邮件完成改为按行持久化；
- 不重写整个 `CrmStore`，不改变公开 API，不连接真实 SMTP 或生产数据库。

## Test-first 记录

1. 首次运行 `npm run test:repository:lead-outreach --workspace backend`，按预期因 `backend/src/domain/leads/lead-outreach-repository.js` 尚不存在而以 `ERR_MODULE_NOT_FOUND` 失败。
2. 实现后，专项测试曾因测试正则把 SQL 条件中的 `deleted_at` 误识别为 `DELETE` 语句而失败；修正测试只拒绝以 `DELETE` 或 `TRUNCATE` 开头的语句。该修正仅消除测试误判，没有删除门禁、跳过测试或放宽产品断言。
3. 随后 Memory/MySQL 契约、路由回归和完整门禁全部通过。

## 实现与设计结果

- `LeadOutreachService` 依赖 Repository 端口，不依赖 MySQL 驱动；无 Repository 时保留兼容路径。
- Repository 成功提交后才同步进程内 request/lead/user/activity；提交失败时内存状态不被污染。
- MySQL Unit of Work 保证 `beginTransaction → work → commit`，失败时 rollback，连接始终 release；rollback 失败不覆盖原始业务错误。
- `lead_outreach_requests` 唯一键竞争捕获 `ER_DUP_ENTRY` 后回读现有请求。
- pending 完成/失败采用 `WHERE id = ? AND status = 'pending'` 条件更新，受影响行数不为 1 时抛出持久化冲突。
- lead 更新附带 ID、Owner、Team、未删除条件；user 更新附带 ID、Team 条件。
- 社交触达在一个事务内更新 request、插入 activity、更新 lead。
- 邮件完成在一个事务内更新 request、插入 activity、更新 lead、更新 user 最后开发邮件字段。
- 所有 SQL 参数化；未持久化邮件正文、SMTP 密钥或原始 Idempotency-Key。
- `lead_outreach_requests` 已退出旧 `persistAll` 快照替换，避免被其他领域全量保存删除或覆盖。

## 专项验收

```text
npm run test:repository:lead-outreach --workspace backend  PASS
  contract                         memory + mysql
  MySQL commit                     2
  MySQL rollback                   2
  row-level statements             21
  full snapshot writes             0
  tenant predicates                true

npm run test:routes:lead-outreach --workspace backend      PASS
  repository commits               10
  full snapshot writes             0
  idempotency/pending/rollback      verified
```

## 完整门禁

```text
npm run verify                     PASS
  OpenAPI operations               167
  cross-module tenant isolation    18
  repository contract              PASS
  frontend production bundle       1,394.14 kB（风险 R-008 保留）

npm run test:e2e                   PASS，37/37（4.0 分钟）
npm run audit:dependencies         PASS，0 vulnerabilities
npm run test:repo-security         PASS，135 tracked files
git diff --check                   PASS
真实 MySQL / SMTP / 模型外呼       0
```

说明：首次 `npm run test:e2e` 的 180 秒执行窗口不足而被外层命令终止；随后使用同一 Playwright 配置、Chrome 通道和 600 秒窗口重跑，37/37 全部通过。一次仅用于诊断的 `CI=1` 运行因本机未安装 Playwright bundled Chromium 而失败，不是产品测试失败；正式本地门禁使用项目默认 Chrome 通道通过。

## 验收结论

- [x] 同一 Repository 契约覆盖 Memory/MySQL Adapter；
- [x] 成功事务 commit、失败事务 rollback、连接始终 release；
- [x] 线索外联不调用全量 `persistAll`；
- [x] 唯一键竞争回读现有请求；
- [x] pending 使用条件更新，0 行更新视为冲突；
- [x] lead/user 更新带 Owner/Team 租户条件；
- [x] API 167、tenant isolation 18、E2E 37/37、audit 0 保持通过；
- [x] 真实外部调用与生产数据访问为 0。

## 风险与限制

- R-005 仅部分缓解：本 Loop 只迁移线索外联；`leads`、`users`、`lead_activities` 等仍会被其他旧领域的 `persistAll` 使用，不能宣称全局并发风险关闭。
- R-011 保留：邮件发送结果不确定的 pending 请求仍缺少运维查询、人工确认和受控重试界面。
- 完成阶段发生乐观冲突时当前由统一异常处理失败关闭；后续运维恢复设计需要明确 409/告警/人工处置语义。
- 本次使用 Fake Pool 验证 MySQL SQL 与事务契约，没有连接真实数据库。

## 回滚

1. 优先前向修复 Repository Adapter，不回退幂等数据表。
2. 若必须回滚代码，先停止外联写入，确认没有新版本 pending/succeeded 请求正在处理。
3. `lead_outreach_requests` 不得重新纳入快照 `DELETE + INSERT`；必要时保留 Repository 归属隔离补丁。
4. 回滚前后执行专项 Repository、外联路由、security、E2E 和数据一致性检查。

## 下一循环

L-0014：AI 工作流 MySQL 状态、跨进程恢复、并发确认与 Effect 幂等。继续使用 Mock `ModelGateway`，禁止真实模型和生产凭证。
