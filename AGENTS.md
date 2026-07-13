# AGENTS.md — GoodJob Engineering Harness

本文件是人类开发者与 AI Agent 的长期协作契约。任何开发会话开始前必须先阅读本文件及 `docs/engineering/README.md`。

## 产品目标

GoodJob 是外贸获客跟踪系统。本阶段不是 MVP，而是在现有 CRM 上建设可维护、可测试、可审计的内部正式版，重点包括：

1. AI 获客智能闭环；
2. 全局 AI 助手；
3. CSV/Excel、公开网页/搜索、第三方数据服务三类获客入口；
4. 钉钉、企业微信、飞书统一适配入口。

## 每次开发循环

严格执行以下 Loop Engineering 闭环：

1. **Orient**：阅读项目状态、功能台账、ADR、风险与上次交接。
2. **Select**：只选择一个已满足 DoR 的功能/缺陷，记录关联 REQ/TASK。
3. **Plan**：明确代码影响、数据/API 影响、风险、测试与回滚。
4. **Implement**：小步修改；禁止顺手扩展未登记范围。
5. **Verify**：运行与变更风险匹配的测试，保存命令、结果和证据。
6. **Review**：检查权限、数据范围、审计、失败处理、兼容和文档。
7. **Record**：更新功能台账、项目状态、实施日志、追踪矩阵和交接文档。
8. **Commit-ready**：只有证据齐全才可声明完成或提交 PR。

## 强制规则

- `main/master` 禁止直接开发；使用短生命周期分支。
- 每项代码变更必须对应 `REQ-*`/`BUG-*` 和 `TASK-*`。
- 每个 PR 必须说明：目的、关联项、设计、风险、测试命令、结果、数据迁移、回滚。
- AI 写操作必须“预览 → 用户确认 → 权限二次校验 → 幂等执行 → 审计”。
- 外部模型、采集、消息平台只能通过 Gateway/Connector/Adapter 接入。
- 不得提交 `.env`、密钥、真实账号、客户数据、会话缓存或测试报告大文件。
- 测试失败不得通过修改断言、跳过测试或删除覆盖来掩盖。
- 变更公共 API、数据模型、安全边界前必须新增或更新 ADR。
- 文档是交付物：功能状态和实际代码不一致视为缺陷。

## 验证命令

```bash
npm run verify
npm run test:e2e
```

- `verify`：前后端测试、后端安全测试、前后端构建。
- `test:e2e`：Playwright 端到端验证；首次需安装 Chromium。

## 关键文档

- `docs/engineering/PROJECT_STATUS.md`：当前阶段、指标、阻塞和下一步。
- `docs/engineering/FEATURES.json`：机器可读功能台账和验收条件。
- `docs/engineering/TRACEABILITY.md`：需求到发布证据链。
- `docs/engineering/IMPLEMENTATION_LOG.md`：每次循环做了什么、为何、如何验证。
- `docs/engineering/RISK_REGISTER.md`：风险、责任人与缓解措施。
- `docs/engineering/HANDOFF.md`：下一会话可直接接续的信息。
- `docs/engineering/adr/`：不可隐式改变的架构决策。
