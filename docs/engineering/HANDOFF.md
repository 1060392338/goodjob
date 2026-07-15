# 会话交接

更新时间：2026-07-15

## 当前工作位置

- 仓库：`C:\Users\Administrator\Documents\Codex\2026-07-13\hi\GoodJob`
- 分支：`codex/phase-1-route-modularization`
- GitHub：`https://github.com/1060392338/goodjob.git`
- L-0012 基线：`9a900a5`
- L-0012 实现 Commit：`a3e2dcc`
- 当前闭环文档：本文件所在 HEAD
- 禁止推送 Gitee `origin`。

## L-0012 已完成内容

1. 新增 `REQ-GJ-SEC-003 / TASK-GJ-0006` 和 ADR-0011。
2. 建立统一 `SecretVault` 边界，当前 Adapter 使用 AES-256-GCM：
   - 随机 IV 和认证标签；
   - AAD 绑定凭证类型、记录 ID、Owner ID、Team ID；
   - 密文格式 `gjsec:v1:<keyId>:<iv>:<authTag>:<ciphertext>:gcm`；
   - 跨用户、跨团队、跨记录解密和密文篡改均失败。
3. 模型与来源 API Key 在 MySQL 中只写入密文；API 响应继续只返回掩码。
4. 新增凭证迁移状态表与 100 条批次检查点，支持中断恢复、重复校验、旧 Key 重加密和并发迁移锁。
5. 损坏密文、未知/吊销 Key、上下文不匹配均拒绝启动，不允许回退为明文。
6. 新主 Key + 过渡解密 Key 支持轮换；完成重加密后可移除旧 Key 完成吊销。
7. MySQL/生产模式缺少主密钥或配置格式错误时拒绝启动。
8. 未使用真实模型、来源凭证或云 KMS；真实外呼均为 0。

## 不得隐式改变的边界

- GoodJob 原业务和当前页面仍是唯一基线，不进行 MVP 式推倒重写。
- 已迁移为密文的数据库不得直接搭配旧应用运行。
- 回滚优先前向修复；如必须回滚代码，应先停止写入并恢复发布前数据库备份。
- 禁止把明文凭证导出到普通文件或日志。
- L-0012 只完成本地代码与门禁；真实部署仍需数据库备份恢复、迁移状态和密钥托管验证。
- 未完成真实部署验证前，不接入真实模型、来源或协作平台凭证。
- LangGraph.js 只负责编排；模型调用仍必须经过 `ModelGateway`。

## L-0012 测试证据

```text
npm run test:vault --workspace backend     PASS
npm run verify                             PASS
npm run test:security                      PASS，API 167，tenant isolation 18
npm run test:e2e                           PASS，37/37
npm run audit:dependencies                 PASS，0 vulnerabilities
npm run test:repo-security                 PASS，暂存后 135 files
git diff --cached --check                  PASS
真实模型/来源/云 KMS 外呼                  0
```

Test-first 失败、迁移边界、轮换/吊销和回滚细节见 `docs/engineering/evidence/L-0012-secret-vault.md`。

## GitHub 交付规则

仅推送 GitHub：

```powershell
git -c http.proxy=http://127.0.0.1:7897 `
    -c https.proxy=http://127.0.0.1:7897 `
    push github codex/phase-1-route-modularization
```

不得执行 `git push origin`。

## 下一开发循环

L-0013：Repository / Unit of Work 与 MySQL 增量持久化边界。

1. 先选择一个低耦合、已有测试的领域，不一次性重写 `CrmStore`。
2. 建立 Repository 接口、memory/MySQL Adapter 和 Unit of Work/事务端口。
3. 同一份契约测试验证 memory 与 MySQL 行为。
4. 验证按行增量写、失败回滚、唯一键或乐观并发、租户隔离。
5. 领域服务和路由不得依赖 MySQL 驱动。
6. 保持 API 167、tenant isolation 18、E2E 37/37 和 audit 0。

## 持续风险

- R-004：`server.ts` 和 `prototype-api.ts` 仍需继续拆分。
- R-005：Repository/Unit of Work 与 MySQL 增量持久化未完成。
- R-008：前端主包仍约 1.394 MB。
- R-011：`pending` 邮件缺少运维处置界面。
- R-012/R-013：本地代码和门禁完成；真实部署仍需备份恢复、迁移状态和密钥托管验证。
- R-014：正式 AI 工作流 MySQL 状态、事务、并发和崩溃恢复未实现。
- GitHub Actions、历史 Secret Scan、分支保护和部署凭证轮换尚未闭环。
