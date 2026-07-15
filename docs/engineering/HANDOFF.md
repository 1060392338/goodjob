# 会话交接

更新时间：2026-07-15

## 可恢复结论

阶段 3 的 L-0017~L-0021 已全部完成，验收结论为 Accepted with explicit deferred external validation。下一会话不依赖聊天记录，可直接从 L-0022 开始阶段 4 AI 获客闭环。GitHub 是唯一交付远端，禁止操作 Gitee；GoodJob 现有业务行为仍是产品基线，不做 MVP 式推倒重写。

## 当前工作位置

- 仓库：`C:\Users\Administrator\Documents\Codex\2026-07-13\hi\GoodJob`
- 分支：`codex/phase-3-lead-pipeline`
- GitHub：`https://github.com/1060392338/goodjob.git`
- 已完成阶段：阶段 3——获客数据管道
- 当前 Loop：`L-0022`（阶段 4 AI 线索清洗/补全/去重/ICP 评分，Ready）
- 当前 REQ/TASK：`REQ-GJ-AI-LEAD-001 / TASK-GJ-0301`
- 阶段 3 Test-first 收口 Commit：`789a0e4`
- 阶段 3 Evidence：`docs/engineering/evidence/L-0021-phase-3-acceptance.md`
- 阶段 3 ADR：`docs/engineering/adr/ADR-0020-phase-3-machine-verifiable-acceptance.md`

## 阶段 3 完成事实

- L-0017：统一领域模型、规范化、稳定键、血缘、checkpoint、恢复和幂等；
- L-0018：CSV/XLSX/XLS 文件 Connector、安全解析、字段映射、部分失败与逐行血缘；
- L-0019：公开网页/搜索 Connector 的许可、robots、SSRF/DNS/重定向、限流和内容隔离；
- L-0020：第三方 API Provider Registry、credential handle、分页/cursor、退避、预算和错误分类；
- L-0021：机器可验证阶段验收、风险复核、回滚和外部 Deferred；
- 三类 Connector 均显式实现统一 `LeadIngestionConnector`。

## 最终验收

```text
四组阶段 3 专项                  PASS
npm run test:phase3-acceptance   PASS
npm run verify                   PASS
npm run audit:dependencies       PASS，0 vulnerabilities
npm run test:e2e                 PASS，37/37
git diff --check                 PASS
duplicate writes                0
credential leaks                0
真实外呼                         0
```

仓库门禁同时保持 OpenAPI 167、tenant isolation 18、frontend self-test 44、workbook security 和 Bundle Budget PASS。

## 下一会话严格入口：L-0022

1. 检查 `git status --short --branch` 和最近提交；
2. 阅读 `DEVELOPMENT_PLAN.md`、`PROJECT_STATUS.md`、`FEATURES.json` 和阶段 3 Evidence；
3. 为 L-0022 新建独立 ADR、Evidence 和 Test-first 契约；
4. 先定义 AI 输出 Schema、Prompt/Schema/模型版本、来源/置信度、金标数据集和人工采纳/驳回/重跑规则；
5. 使用现有 `ModelGateway` 和 LangGraph 工作流边界，不把 Python `openai` 模块或单一供应商 SDK 直接扩散到业务层；
6. Mock/本地评测可自主继续；遇到真实模型供应商、真实 API Key、生产调用、真实客户数据或不可逆评分规则时暂停确认。

## 外部 Deferred

- 真实客户文件回放；
- 真实网页许可、robots 法务依据和真实网络采集；
- 真实第三方线索供应商、合同、字段/额度和真实凭证；
- 真实数据库迁移、备份恢复和 SecretVault 部署验证；
- 真实模型调用与 Prompt 注入红队。

## 持续风险

- R-006 保持 Open；R-013 保持 Verification；R-015 保持 Mitigating；
- GitHub Actions、历史 Secret Scan、分支保护和部署凭证轮换尚缺远端证据；
- 任何未关闭或未正式接受的 Critical 风险继续阻止内部正式发布。
