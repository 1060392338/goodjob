# 会话交接

更新时间：2026-07-15

## 当前工作位置

- 仓库：`C:\Users\Administrator\Documents\Codex\2026-07-13\hi\GoodJob`
- 分支：`codex/phase-1-route-modularization`
- 最近完成循环：`L-0008`
- 需求/任务：`REQ-GJ-ARCH-001 / TASK-GJ-0003`
- 基线 Commit：`6194cee`
- 代码交付 Commit：`9160a90`
- 证据：`docs/engineering/evidence/L-0008-ai-config-model-gateway.md`
- 总体状态：L-0008 已完成本地 DoD；阶段 2 与 `REQ-GJ-ARCH-001` 继续 `in_progress`；`REQ-GJ-AI-001` 仍为 backlog

## L-0008 已完成内容

- AI 配置读取、保存、删除、连接测试 4 个 API 已迁出 `server.ts`。
- 新增可注入 `ModelGateway`，统一 OpenAI-compatible、Anthropic、Gemini。
- Gateway 提供 Trace ID、超时、SSRF 地址检查、错误分类、响应信封校验和 Key 脱敏。
- 翻译、AI 搜客、官网 AI 解析的底层调用已统一经过生产 Gateway；这些业务路由尚未迁移。
- 配置按 `ownerId` 隔离；外租户 ID 不可读取、覆盖、测试或删除。
- 连接测试必须返回严格 `{ "ok": true }`，非法结构化内容判定失败。
- 新增两组测试：
  - `backend/src/gateways/model-gateway-test.ts`
  - `backend/src/routes/ai-config-routes-test.ts`
- `server.ts` 6258 → 5974 行，净减少 284 行。
- 无数据库结构变化，无新生产依赖，无真实模型外呼或真实密钥。

## 不得隐式改变的语义

- 所有模型传输必须通过 `ModelGateway`，业务代码不得重新直接调用厂商 SDK/HTTP。
- 私网/本机模型地址默认禁止；只有显式 `ALLOW_PRIVATE_AI_ENDPOINTS=true` 可放行。
- 原始 API Key 不得出现在 HTTP 响应、日志或错误；Gemini 查询参数也必须脱敏。
- AI 配置当前是用户私有，不是团队共享；如需团队共享必须先新增 ADR 和权限矩阵。
- 完整 AI 功能尚未开始：Prompt/Schema 版本、用量、自动重试、审计和金标评测仍属阶段 4。
- 真实模型 Key 投入前必须处理 R-012 的 at-rest 明文风险。
- 真实社交/协作平台发送必须走阶段 6 `CollaborationAdapter`，不得从 AI 或现有 `/social-touch` 绕过。

## L-0008 验证

```text
npm run test:gateway:model --workspace backend  PASS
npm run test:routes:ai-config --workspace backend PASS
npm run test:routes                          PASS
npm run test --workspace backend             PASS
npm run test:security                        PASS，API 167，tenant isolation 18
npm run build --workspace backend            PASS
npm run verify                               PASS
npm run test:e2e                             PASS，37/37
npm run audit:dependencies                   PASS，0 vulnerabilities
npm run test:repo-security（暂存新文件后）    PASS，114 files
git diff --check                             PASS
```

依赖审计首次因 npm Registry TLS 中断失败，使用本机代理重试后通过；不得把首次失败从证据中删除。

## GitHub 交付规则

- GitHub 是唯一交付远端：`https://github.com/1060392338/goodjob.git`。
- 禁止推送 Gitee `origin`。
- 当前分支推送命令：

```powershell
git -c http.proxy=http://127.0.0.1:7897 `
    -c https.proxy=http://127.0.0.1:7897 `
    push github codex/phase-1-route-modularization
```

## 下一开发循环

建议启动 **L-0009：线索来源配置与 LeadSourceConnector 装配边界**，继续阶段 2：

1. Orient：阅读 `ADR-0003`、`ADR-0005`、`ADR-0007`、本交接、风险 R-004/R-005/R-006/R-012。
2. Select：只冻结以下 4 个现有 API，先确认实际代码行和 OpenAPI 契约：
   - `GET /api/lead-finder/providers`
   - `POST /api/lead-finder/source-config`
   - `POST /api/lead-finder/source-config/test`
   - `DELETE /api/lead-finder/source-config/:provider`
3. Plan：定义 `LeadSourceConnector` 与连接器错误分类；明确配置归属、密钥脱敏、SSRF、限流、分页/检查点和禁止未授权外呼。
4. Test first：先建 Mock/契约和失败注入，再迁移路由；测试不得连接真实第三方数据源。
5. Scope control：不同时迁移完整搜索、网站采集、AI 评分、前端拆分或 Collaboration Adapter。
6. Gate：继续保持 API 167、tenant isolation 18+、audit high 0、`verify` 和 E2E 37/37。

## 持续风险与阻塞

- R-005：MySQL Store 仍是全量持久化，Repository/Unit of Work 未完成。
- R-006：AI/网页采集仍需来源白名单、内容隔离、Prompt 注入防护、审计和人工确认。
- R-008：前端主包约 1.394 MB。
- R-009：GitHub Actions、历史 Secret Scan、分支保护和部署凭证轮换未闭环。
- R-011：`pending` 邮件缺少运维处置界面。
- R-012：模型 API Key 仍明文 at-rest；当前不得使用正式生产 Key。
- GitHub 仓库 Public/Private 决策仍需项目负责人确认。
- 第三方线索厂商和真实钉钉、企微、飞书企业凭证均未指定。
