# 会话交接

更新时间：2026-07-15

## 当前工作位置

- 仓库：`C:\Users\Administrator\Documents\Codex\2026-07-13\hi\GoodJob`
- 分支：`codex/phase-1-route-modularization`
- GitHub：`https://github.com/1060392338/goodjob.git`
- L-0009 基线：`e3a3055`
- L-0009 代码 Commit：`59594d1`
- 当前待完成：提交 L-0009 闭环文档并推送 GitHub。
- 禁止推送 Gitee `origin`。

## L-0009 已完成内容

1. 新增 `ADR-0008`，冻结线索来源配置与 `LeadSourceConnector` 边界。
2. 迁移 4 个 API：
   - `GET /api/lead-finder/providers`
   - `POST /api/lead-finder/source-config`
   - `POST /api/lead-finder/source-config/test`
   - `DELETE /api/lead-finder/source-config/:provider`
3. 新增 `backend/src/connectors/lead-source-connector.ts`：
   - 生产实现装配既有 Provider 注册表；
   - Trace ID；
   - `unconfigured/authentication/timeout/rate_limited/invalid_response/provider_error/security_rejected`；
   - 自定义 Base URL SSRF 拒绝；
   - 原始/URL 编码 Key、Authorization 和常见查询参数脱敏。
4. 新增 `lead-source-config-service.ts` 和 `lead-source-config-routes.ts`。
5. 配置继续按 `ownerId` 用户级隔离；公开响应只返回尾四位掩码。
6. 分页/检查点契约已预留，但完整搜索和断点恢复未迁移、不得宣称完成。
7. `server.ts` 5974 → 5823，净减少 151 行；无数据库迁移、无新生产依赖。

## 不得隐式改变的语义

- GoodJob 现有行为是唯一业务基线，不进行 MVP 式重写。
- 来源配置仍为个人配置，不是团队共享配置。
- Provider 元数据、AI 搜索状态、成功响应和 167 个 API 操作保持兼容。
- 掩码 Key 更新必须保留服务端原 Key，不能把 `****xxxx` 当真实凭证保存。
- 自定义私网/本机 Base URL 必须在真实 Connector/Provider 调用前拒绝。
- 专项测试不得连接真实第三方数据源或使用真实 Key。
- 完整来源搜索仍是阶段 3 backlog；当前 Connector 单页适配不能被描述为已支持分页恢复。
- 钉钉、企微、飞书必须通过未来 `CollaborationAdapter`，不得直接写厂商调用。

## L-0009 测试证据

```text
npm run test:connector:lead-source --workspace backend      PASS
npm run test:routes:lead-source-config --workspace backend PASS
npm run test:routes                                         PASS
npm run test --workspace backend                            PASS
npm run test:security                                       PASS，API 167，tenant isolation 18
npm run build --workspace backend                           PASS
npm run verify                                              PASS
npm run test:e2e                                            PASS，37/37
npm run audit:dependencies                                  PASS，0 vulnerabilities
npm run test:repo-security（闭环文档暂存后）                PASS，122 files
git diff --check / git diff --cached --check                PASS
```

专项测试证明：

- 7 类 Connector 错误；
- Key、URL 编码 Key、Authorization 和查询参数脱敏；
- 自定义私网地址在外呼前拒绝；
- 4 个配置 API 的读/存/测/删租户隔离；
- 掩码 Key 保留；
- Mock 真实外呼次数为 0；
- cursor/checkpoint/nextCursor/nextCheckpoint/exhausted 契约存在，未实现时明确失败。

## 已登记风险

- R-004：`server.ts` 已继续缩减，但 `prototype-api.ts` 约 11745 行。
- R-005：MySQL Store 仍是全量持久化，Repository/Unit of Work 未完成。
- R-006：完整网页采集仍需来源白名单、采集许可、恶意内容隔离、Prompt 注入防护、审计和人工确认。
- R-011：`pending` 邮件缺少运维处置界面。
- R-012：模型 API Key 明文 at-rest。
- R-013：线索来源 API Key 明文 at-rest。

真实模型或数据源 Key 投入前，R-012/R-013 必须采用 KMS/信封加密或外部 Secret 引用，并补齐最小读取权限、轮换和吊销。

## GitHub 交付规则

仅推送 GitHub：

```powershell
git -c http.proxy=http://127.0.0.1:7897 `
    -c https.proxy=http://127.0.0.1:7897 `
    push github codex/phase-1-route-modularization
```

推送后校验：

```powershell
git ls-remote github refs/heads/codex/phase-1-route-modularization
git rev-parse HEAD
git status --short
```

不得执行：

```powershell
git push origin
```

## 下一开发循环

建议 L-0010：前端 `prototype-api.ts` 单一领域渐进拆分。

1. Orient：阅读 `AGENTS.md`、本交接、`PROJECT_STATUS.md`、`FEATURES.json`、ADR-0005、风险 R-004/R-008。
2. Select：只冻结“线索来源中心”前端切片，包括 Provider 类型、4 个配置 API 调用、状态刷新和按钮事件；不迁移完整搜索页面。
3. Plan：保持 DOM ID、提示文案、请求体/响应体、加载状态、移动端和 E2E 选择器兼容。
4. Test first：先增加模块 self-test/契约测试，再迁移生产代码；不得更换状态管理框架或重做 UI。
5. Gate：继续保持 API 167、tenant isolation 18+、audit high 0、`verify` 和 Playwright 37/37。

## 仍未闭环的外部事项

- GitHub Actions Linux/Node 22 实跑；
- GitHub 历史 Secret Scan；
- 分支保护与必需检查；
- 部署实例清单和历史凭证轮换；
- Public/Private 仓库决策；
- AI/来源 Key at-rest 加密；
- MySQL Repository/Unit of Work；
- 完整阶段 3 线索 Connector 管道；
- 完整阶段 4 AI Gateway；
- 真实第三方线索厂商；
- 真实钉钉、企微、飞书企业凭证。
