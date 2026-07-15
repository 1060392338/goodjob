# 会话交接

更新时间：2026-07-15

## 可恢复结论

阶段 3 已完成 L-0017、L-0018、L-0019，当前可从 L-0020 直接继续。所有实现、测试、ADR、Evidence、风险和门禁结果均已落库；GitHub 是唯一交付远端，禁止操作 Gitee。

## 当前工作位置

- 仓库：`C:\Users\Administrator\Documents\Codex\2026-07-13\hi\GoodJob`
- 分支：`codex/phase-3-lead-pipeline`
- 当前阶段：阶段 3——获客数据管道
- 当前 Loop：`L-0020`（第三方 API Connector 插件边界）
- 当前 REQ/TASK：`REQ-GJ-LEAD-001 / TASK-GJ-0201`
- L-0017 实现：`308cb67`
- L-0018 实现：`db6c711`
- L-0019 Test-first：`603c664`、`3058c32`；实现：`3b0c366`

## 最近完成：L-0019

- 安全 Web Connector 专项 PASS；
- `npm run verify` PASS，repository security 169、API operations 167、tenant isolation 18；
- dependency audit 0 vulnerabilities；
- Playwright 37/37；
- 真实外呼 0；
- Evidence：`docs/engineering/evidence/L-0019-public-web-search-connector.md`。

## 下一 Loop：L-0020

目标：建立第三方 API Provider 插件与统一 Lead Connector 之间的稳定边界。

必须覆盖：

1. Provider 插件描述、能力与配置 schema；
2. 认证材料只通过显式 credential handle/调用边界，不进入记录、错误、checkpoint 或日志；
3. Provider 原始字段映射为统一候选记录和逐记录血缘；
4. cursor/page/token 等分页语义隔离；
5. Retry-After、指数退避、最大重试和可重试/不可重试错误分类；
6. tenant + connector + provider 额度与请求预算；
7. checkpoint 上下文绑定、故障恢复、幂等和完整重跑 duplicate writes 0；
8. Mock Provider 全量验证，真实供应商、真实凭证和真实外呼保持 0。

## 启动顺序

1. 检查 Git 状态和最近提交；
2. 阅读 DEVELOPMENT_PLAN、PROJECT_STATUS、FEATURES、TRACEABILITY、RISK_REGISTER；
3. 参考 ADR-0016、ADR-0018 和现有 file/web Connector；
4. 创建 L-0020 ADR、Evidence 和失败契约测试；
5. 保存 Test-first/Red 独立 Commit；
6. 实现 Provider 插件边界并按失败逐项转绿；
7. 执行专项、build、`verify`、audit、E2E、`git diff --check`；
8. 创建实现 Commit、文档收口 Commit并推送 GitHub；
9. 进入 L-0021 阶段 3 全量验收。

## 暂停条件

仅在需要真实供应商选型、真实凭证、真实外呼、不可逆业务规则、生产数据库或真实客户数据时请求确认。其余 Mock/契约开发可自主继续。
