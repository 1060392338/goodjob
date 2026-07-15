# L-0013 证据：Repository / Unit of Work 与增量持久化

- 日期：2026-07-15
- 关联：REQ-GJ-ARCH-002 / TASK-GJ-0007
- ADR：ADR-0012
- 基线 Commit：2f866cc
- 状态：进行中

## 范围

- 线索外联 Repository 领域端口；
- Memory 与 MySQL Adapter；
- MySQL Unit of Work；
- pending 插入、失败更新、社交触达完成、邮件完成的按行事务；
- 不重写整个 CrmStore，不改变公开 API，不接真实 SMTP 或生产数据库。

## Test-first 记录

待记录首次预期失败。

## 验收标准

- [ ] 同一 Repository 契约测试覆盖 Memory/MySQL Adapter；
- [ ] MySQL 成功事务 commit，失败事务 rollback，连接始终 release；
- [ ] 外联写入不调用全量 persistAll；
- [ ] 唯一键竞争回读现有请求；
- [ ] pending 状态使用条件更新，0 行更新视为冲突；
- [ ] lead/user 更新带 Owner/Team 租户条件；
- [ ] API 167、tenant isolation 18、E2E 37/37、audit 0 保持通过。
