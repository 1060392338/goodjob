# L-0012 证据：SecretVault 与凭证迁移安全

- 日期：2026-07-15
- 关联：`REQ-GJ-SEC-003 / TASK-GJ-0006`
- ADR：`ADR-0011`
- 基线 Commit：`9a900a5`
- 状态：实施与本地验收进行中

## 范围

- 模型与线索来源 API Key 的统一 SecretVault 边界；
- AES-256-GCM 本地 Adapter、上下文绑定、掩码、轮换和吊销语义；
- MySQL 明文凭证自动迁移、批次检查点和失败启动门禁；
- 生产配置门禁与运维配置示例；
- 不接真实云 KMS、不使用真实模型/来源凭证、不新增公开 HTTP API。

## Test-first 记录

1. 首次执行 `npm run test:vault --workspace backend` 时，测试因 `secret-vault.js` 模块不存在而以 `ERR_MODULE_NOT_FOUND` 失败；
2. 建立 SecretVault 与凭证存储模块后，专项测试通过；
3. 接入 MySQL Store 后，首次 TypeScript 构建发现 `rows` 查询助手不支持参数绑定，修正为参数化查询后通过；
4. 未删除、跳过或放宽测试。

## 专项验收

待完整门禁完成后填写最终计数和 Commit。

## 安全事实

- 测试 Key：仅运行时生成的固定测试数据；
- 真实模型/来源凭证：0；
- 真实云 KMS 外呼：0；
- 明文失败降级：禁止；
- 密文上下文：凭证类型、记录 ID、Owner、Team；
- 迁移检查点：表、记录 ID、迁移/轮换/校验计数、失败分类。

## 回滚证据

详见 ADR-0011。已迁移数据库不得直接搭配旧应用运行；必须以前向修复为优先，或先恢复发布前数据库备份再回滚代码。
