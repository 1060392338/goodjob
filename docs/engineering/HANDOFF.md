# 会话交接

更新时间：2026-07-15

## 当前工作位置

- 仓库：`C:\Users\Administrator\Documents\Codex\2026-07-13\hi\GoodJob`
- 分支：`codex/phase-1-route-modularization`
- GitHub：`https://github.com/1060392338/goodjob.git`
- L-0011 基线：`c2c1e52`
- L-0011 实现 Commit：`356200a`
- 当前闭环文档：本文件所在 HEAD
- 禁止推送 Gitee `origin`。

## L-0011 已完成内容

1. 新增 `REQ-GJ-AI-ORCH-001 / TASK-GJ-0102` 和 ADR-0010。
2. 新增 `backend/src/ai/ai-workflow-engine.ts`：
   - LangGraph.js 编排读取、评分、暂停、恢复和决定分支；
   - `ModelGateway` 是唯一模型调用入口；
   - 运行时模型配置 Resolver，Checkpoint 只保存配置 ID；
   - `approve/reject/rerun` 人工决定；
   - 恢复主体校验、写入权限复检、稳定幂等键和步骤审计；
   - MemorySaver 与进程内 Effect Store 仅用于技术验证。
3. 新增专项测试，覆盖 8 个运行、8 次 Mock 模型调用、3 次模拟写入。
4. 顺序/并发重复确认、驳回、读/写越权的额外写入为 0。
5. 新 Engine 实例可通过共享 Checkpointer 恢复暂停运行。
6. API Key 不进入公开 Snapshot、审计或 Checkpoint；真实模型外呼和真实 CRM 写入为 0。
7. 精确锁定 LangGraph 1.4.8、Checkpoint 1.1.3、Core 1.1.48、Zod 3.25.76，并纳入依赖策略门禁。
8. 无新增 HTTP API、数据库表或前端页面。

## 不得隐式改变的边界

- GoodJob 原业务和当前页面仍是唯一基线，不进行重写。
- LangGraph.js 只能是编排层，节点不得直接调用模型厂商 SDK。
- 模型调用必须经过 `ModelGateway`。
- 领域权限、租户范围和写入必须由 GoodJob 领域端口负责。
- AI 写操作必须保持“预览 → 确认 → 权限复检 → 幂等执行 → 审计”。
- Checkpoint 不得保存 API Key；MemorySaver 不得用于正式环境。
- R-012/R-013 未关闭前不得使用真实模型/来源 Key。
- 当前技术验证不等于阶段 4/5 功能已完成。

## L-0011 测试证据

```text
npm run test:workflow:ai --workspace backend PASS
  - workflow runs 8
  - mock model calls 8
  - simulated writes 3
  - duplicate/rejected/unauthorized extra writes 0
  - real outbound calls 0
  - secret in checkpoint false
npm run verify                              PASS
npm run test:security                       PASS，API 167，tenant isolation 18
npm run test:e2e                            最终 PASS，37/37
npm run audit:dependencies                  最终 PASS，0 vulnerabilities
npm run test:repo-security（代码暂存后）    PASS，最终 130 files
git diff --cached --check                   PASS
```

中间异常已在 `docs/engineering/evidence/L-0011-ai-workflow-engine.md` 留痕：E2E 首次进程中断、audit 一次 TLS 中断、TypeScript 首次类型失败均未通过删测或放宽门禁处理。

## GitHub 交付规则

仅推送 GitHub：

```powershell
git -c http.proxy=http://127.0.0.1:7897 `
    -c https.proxy=http://127.0.0.1:7897 `
    push github codex/phase-1-route-modularization
```

不得执行：

```powershell
git push origin
```

## 下一开发循环建议

L-0012：模型/来源凭证 `SecretVault` 边界与迁移策略。

1. 先登记 REQ/TASK/ADR，不直接改数据库。
2. 建立可注入 SecretVault，覆盖加密、解密、掩码、轮换、吊销和错误分类。
3. 设计旧明文数据迁移、双读/双写窗口、回滚和损坏密文启动门禁。
4. 只使用测试 Key 和 Mock Vault，不接真实云 KMS。
5. 扩展仓库/安全测试，证明日志、错误、备份和 API 响应无明文 Key。
6. 关闭真实凭证前置风险后，再接线索评分预览/确认 API 和前端体验。

## 持续风险

- R-004：前后端超大模块仍需继续拆分。
- R-005：Repository/Unit of Work 与 MySQL 增量持久化未完成。
- R-008：前端主包仍约 1.394 MB。
- R-011：`pending` 邮件缺少运维处置界面。
- R-012/R-013：模型与来源 API Key 明文 at-rest。
- R-014：正式工作流 MySQL 状态、事务、并发和崩溃恢复未实现。
- GitHub Actions、历史 Secret Scan、分支保护和部署凭证轮换尚未闭环。
