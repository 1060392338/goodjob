# 会话交接

更新时间：2026-07-15

## 可恢复结论

文档现已足以在新会话中恢复开发，不依赖聊天记录。阶段 3 的 L-0017~L-0020 已完成；当前唯一执行入口是 `L-0021` 阶段 3 全量验收与回顾。L-0021 已完成 ADR/Test-first 和真实 Red，尚未转绿。GitHub 是唯一交付远端，禁止操作 Gitee；GoodJob 现有业务行为是产品基线，不做 MVP 式推倒重写。

## 当前工作位置

- 仓库：`C:\Users\Administrator\Documents\Codex\2026-07-13\hi\GoodJob`
- 分支：`codex/phase-3-lead-pipeline`
- GitHub：`https://github.com/1060392338/goodjob.git`
- 当前阶段：阶段 3——获客数据管道
- 当前 Loop：`L-0021`（阶段 3 全量验收与回顾）
- 当前 REQ/TASK：`REQ-GJ-LEAD-001 / TASK-GJ-0201`
- Test-first Commit：`33e508c`
- L-0020 实现 Commit：`c361a26`
- L-0020 Evidence：`docs/engineering/evidence/L-0020-third-party-api-provider-boundary.md`
- L-0021 ADR：`docs/engineering/adr/ADR-0020-phase-3-machine-verifiable-acceptance.md`
- L-0021 执行清单：`docs/engineering/evidence/L-0021-phase-3-acceptance.md`

## L-0020 已完成事实

- 已建立 Provider Registry、Provider ID/version、版本化 Mapper 和统一 `LeadIngestionConnector` 边界；
- 认证只接收受控 `credentialHandle`，拒绝原始 API Key/Token 和 Secret-like 配置/响应；
- Provider opaque cursor 与 GoodJob checkpoint 隔离，checkpoint 绑定 tenant、connector、Provider、配置和 Mapper 版本；
- 支持 Retry-After、指数退避、最大重试、错误分类和 tenant + connector + provider 请求预算；
- Pipeline 故障恢复和完整重跑通过，duplicate writes 0；
- credential leaks 0，真实外呼 0；
- 未引入数据库 schema、公开 API、真实 Provider、真实凭证或真实网络变化。

## 最新本地验收

2026-07-15 在 Windows / Node.js v24.14.0 下：

```text
npm run test:connector:api-leads --workspace backend   PASS
npm run build --workspace backend                      PASS
npm run verify                                         PASS
npm run audit:dependencies                             PASS，0 vulnerabilities
npm run test:e2e                                       PASS，37/37
git diff --check                                       PASS
```

关键指标：repository security 174、REQ/TASK 16/16、OpenAPI operations 167、tenant isolation 18、frontend self-test 44、credential leaks 0、duplicate writes 0、真实外呼 0。

首次完整 `verify` 曾因测试服务器随机分配到 Fetch 禁用端口而在 `ai-config-routes-test.ts` 出现一次 `TypeError: fetch failed / bad port`；未修改代码直接复跑后完整 PASS。L-0021 必须复跑门禁；若再次出现，应登记并修复独立测试稳定性缺陷，不能以无限复跑代替验收。

## L-0021 Test-first 检查点

- 新增 `npm run test:phase3-acceptance`，校验统一 Connector、五个 Loop、追踪、Evidence、风险、回滚、Deferred 和 L-0022 交接；
- 首次运行退出码 1，真实失败 24 项；
- 当前阶段状态仍为 in_progress、L-0021 仍未 Done、根 verify 尚未接入新门禁，这些是预期 Red；
- 下一步必须按失败项转绿，不得删除或弱化阶段完成条件。

## 下一会话严格执行顺序

1. 读取本文件、`PROJECT_STATUS.md`、`DEVELOPMENT_PLAN.md`、`FEATURES.json` 和 L-0021 执行清单；
2. 检查 `git status --short --branch`、`git log --oneline -10`；不得 reset/clean 未识别变更；
3. 执行四组专项：统一 Pipeline、文件 Connector、Web Connector、API Provider Connector；
4. 审计三类 Connector 是否统一实现 `LeadIngestionConnector`，并逐项核对规范化、血缘、去重、checkpoint、恢复和租户隔离；
5. 执行完整 `npm run verify`、dependency audit、E2E 和 `git diff --check`；
6. 核对 REQ/TASK/ADR/Commit/Test/Evidence/风险/回滚/交接双向追踪；
7. 将真实客户文件、真实网页许可/网络、真实供应商、真实凭证和真实数据库演练明确标记为 Deferred；
8. 形成 L-0021 Evidence、阶段回顾和验收结论，创建独立 Commit 并只推送 GitHub；
9. 只有 L-0021 证据完整后，才能宣布阶段 3 完成并将执行位置切换到阶段 4 AI 获客闭环。

## L-0021 完成定义

- L-0017~L-0020 的验收条件逐项复核完成；
- 三类 Connector 与统一 Pipeline 专项全部 PASS；
- 失败恢复、完整重跑、duplicate writes 0、Secret/credential leaks 0、真实外呼 0；
- `verify`、audit、E2E、`git diff --check` 全部 PASS；
- 追踪矩阵、风险、回滚、实施日志、Evidence 和项目状态一致；
- 阶段结论只能是带明确外部 Deferred 项的验收结论，不能把未执行的真实环境验证写成完成。

## 暂停条件

出现以下情况必须暂停并向项目负责人确认：真实供应商选择、真实 API/模型凭证、真实网络采集、真实客户数据、生产数据库迁移、不可逆业务规则变化、公开 API 或 schema 破坏性变更。Mock、fixture、契约测试和文档验收可自主继续。

## 持续风险

- GitHub Actions、历史 Secret Scan、分支保护和部署凭证轮换尚缺远端证据；
- R-006 保持 Open：真实采集许可、真实网络和阶段 4 Prompt 注入红队未验证；
- R-013 保持 Verification：真实部署 SecretVault、备份恢复和供应商额度告警未验证；
- R-015 保持 Mitigating：Mock/fixture 已通过，真实客户数据回放和供应商验收未执行；
- 钉钉、企微、飞书当前只保留统一 Adapter 入口与 Mock 计划。
