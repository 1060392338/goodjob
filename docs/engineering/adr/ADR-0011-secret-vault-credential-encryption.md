# ADR-0011：SecretVault 与凭证落库加密边界

- 状态：Accepted
- 日期：2026-07-15
- 关联：`REQ-GJ-SEC-003 / TASK-GJ-0006`
- 关联风险：`R-012 / R-013`
- 实施循环：`L-0012`

## 背景

GoodJob 的模型配置和线索来源配置原先直接把 `api_key` 明文写入 MySQL。虽然接口响应已有掩码，但数据库、备份和误操作查询仍可能暴露真实凭证。真实模型和真实线索来源凭证在该风险关闭前不得投入。

## 决策

1. 建立统一 `SecretVault` 接口，业务路由、`ModelGateway` 和 `LeadSourceConnector` 不直接依赖具体加密库或未来云 KMS。
2. 当前本地实现使用 AES-256-GCM 信封格式 `gjsec:v1`；每次加密使用独立随机 IV，并通过 AAD 绑定凭证类型、记录 ID、所有者和团队。
3. MySQL Store 只把密文写入 `ai_model_configs.api_key` 和 `lead_source_configs.api_key`；运行时加载后仅在进程内持有解密值，公开 API 继续只返回掩码。
4. 主密钥通过 `GOODJOB_SECRET_VAULT_PRIMARY_KEY=key-id:32-byte-base64` 注入；旧解密密钥通过 `GOODJOB_SECRET_VAULT_DECRYPTION_KEYS` 注入。密钥不得写入数据库、日志、Checkpoint、Git 或 API。
5. 主密钥 Key ID 变化时，启动迁移会使用旧解密密钥读取，并用主密钥重加密。移除旧密钥即表示吊销；仍引用被吊销 Key ID 的记录必须导致启动失败。
6. 建立 `credential_secret_migrations` 检查点表。迁移按固定顺序和 100 条批次执行，记录表名、记录 ID、迁移数、轮换数、校验数和失败分类，可在失败后从已提交检查点恢复。
7. 旧明文只允许由启动迁移路径读取并立即转为密文。任何以 `gjsec:` 开头但格式损坏、认证失败、上下文不匹配或 Key ID 未配置的值都不得降级为明文。
8. MySQL 模式没有可用 SecretVault 主密钥时拒绝启动；生产运行时门禁同时检查密钥存在性和格式。
9. 本循环不接真实云 KMS、不使用真实供应商凭证。未来 KMS/HSM Adapter 必须保持同一接口、错误分类和上下文绑定语义。

## 密钥轮换与吊销

1. 生成新的 32 字节随机密钥和新的 Key ID；
2. 新密钥设为 `GOODJOB_SECRET_VAULT_PRIMARY_KEY`；
3. 旧密钥放入 `GOODJOB_SECRET_VAULT_DECRYPTION_KEYS`；
4. 启动并确认迁移状态为 `completed`、`rotated_count` 符合预期；
5. 完整门禁和业务连接测试通过后移除旧密钥；
6. 若仍存在旧 Key ID，移除旧密钥后的启动必须失败，禁止静默跳过。

## 迁移与发布

- 发布前必须取得数据库备份并记录备份时间、校验和及恢复演练证据；
- 首次启动自动迁移旧明文，失败时记录错误分类但不记录原文；
- 服务只有在迁移完成、所有密文可认证解密后才加载配置并对外监听；
- 重复启动会重新校验全部记录，已使用主密钥的密文保持可读，新出现的明文或旧 Key 会再次迁移；
- 不提供“密文认证失败时按明文尝试”的兼容路径。

## 回滚

数据库已经转为密文后，不允许直接回滚到不认识 `gjsec:v1` 的旧应用版本。回滚顺序为：停止写入 → 保留当前及旧解密密钥 → 优先以前向修复恢复服务；若必须回滚代码，则恢复发布前数据库备份，再回滚应用 Commit。禁止为了回滚把明文凭证导出到普通文件。

## 测试与验收

- 加密后密文不包含原始 Key；
- AAD 上下文变化、篡改密文、未知 Key ID 均失败；
- 明文迁移和重复迁移安全；
- 主密钥轮换可重加密，旧 Key 移除后构成吊销；
- API 掩码、租户隔离和现有连接测试行为不回归；
- 生产缺少或错误配置 Vault Key 时拒绝启动；
- 注册/OpenAPI API 保持 167，跨模块租户隔离保持 18；
- `npm run verify`、Playwright、依赖审计、仓库安全和 `git diff --check` 全部通过。

## 后果

- 关闭模型和来源 API Key 明文 at-rest 风险，为后续真实 AI/Connector 接入提供前置条件；
- 密钥丢失将导致凭证不可恢复，因此备份、轮换和密钥托管成为正式运维责任；
- 当前环境变量 Adapter 不是最终云 KMS，后续可替换实现但不得绕过 `SecretVault`。
