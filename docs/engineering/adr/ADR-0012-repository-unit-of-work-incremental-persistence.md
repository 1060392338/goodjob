# ADR-0012：Repository / Unit of Work 与线索外联增量持久化

- 状态：Accepted
- 日期：2026-07-15
- 关联：REQ-GJ-ARCH-002 / TASK-GJ-0007 / R-005 / R-011

## 背景

GoodJob 当前 MySQL Store 通过 `persistAll` 在每次业务写入后替换全部表数据。该方式在原型阶段简单，但会放大写入、扩大事务范围，并在并发请求中产生覆盖风险。线索外联已经具备幂等请求、活动、线索和账号四类关联更新，是建立正式 Repository / Unit of Work 边界的合适首个切片。

## 决策

1. 不重写整个 `CrmStore`，只为线索外联建立 `LeadOutreachRepository` 领域端口。
2. Repository 对外提供幂等查询、pending 插入、失败状态更新、社交触达完成和邮件完成五类操作。
3. 多表完成操作必须由 Unit of Work 包裹；任一语句失败均回滚。
4. MySQL Adapter 只执行按行 `INSERT/UPDATE/SELECT`，不得调用 `persistAll` 或删除/重写无关表。
5. pending → succeeded/failed 使用条件更新；受影响行数不是 1 时按并发冲突失败关闭。
6. 线索更新必须同时带 lead ID、Owner ID、Team ID 和未删除条件；账号更新必须带 User ID 和 Team ID。
7. 唯一键冲突必须回读现有幂等请求，由领域服务按 payload/status 决定 conflict、duplicate 或 unavailable。
8. Memory Adapter 与 MySQL Adapter 使用同一 Repository 契约测试；MySQL Unit of Work 另测 commit、rollback、release 和语句范围。
9. 其他领域暂时继续走 `persistAll`，后续按领域渐进迁移。

## 结果

- 线索外联不再触发全库快照持久化；
- 幂等创建可抵抗多进程并发唯一键竞争；
- 请求、活动、线索和账号更新具备数据库事务；
- 领域服务依赖 Repository 接口，不依赖 MySQL 驱动；
- R-005 仅对首个领域缓解，不宣称全局关闭。

## 回滚

撤销 Repository 装配后可恢复原 `store.persist()` 路径；本循环不新增破坏性表结构。回滚前应确认没有正在执行的外联事务，并保留 `lead_outreach_requests` 审计记录。不得删除已存在的幂等记录来规避冲突。
