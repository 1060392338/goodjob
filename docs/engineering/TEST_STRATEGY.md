# 测试策略与质量门禁

更新时间：2026-07-13

## 分层测试

1. **静态验证**：TypeScript 编译、构建、后续补充 lint。
2. **单元测试**：领域规则、转换、权限判断、幂等键、Prompt/Schema 处理。
3. **集成测试**：API、Store、数据库迁移、外部 Gateway/Connector/Adapter Mock。
4. **安全测试**：认证、CSRF、越权、SSRF、Webhook、密钥、Prompt 注入。
5. **E2E**：登录、客户、线索、商机、待办、导入、AI 确认执行等 P0 流程。
6. **AI Eval**：脱敏金标数据、版本化 Prompt、模型/成本/准确率对比。
7. **非功能测试**：性能、稳定性、备份恢复和外部依赖降级。

## 当前统一命令

```bash
npm run verify
npm run test:e2e
```

`npm run verify` 必须依次通过：

- 后端 self-test；
- 前端 self-test；
- 后端安全测试；
- 后端 TypeScript 构建；
- 前端 TypeScript + Vite 构建。

## 阈值

- 变更代码覆盖率目标 ≥80%，权限、幂等、数据转换、AI 工具等关键模块 ≥90%。
- P0 E2E 通过率 100%，P1 ≥95%。
- Critical/High 安全问题为 0。
- 未确认 AI 写操作执行次数为 0。
- AI 结构化输出 Schema 合法率 100%。
- AI 金标集初始不少于 100 条：字段抽取 Precision ≥95%、Recall ≥90%、去重 F1 ≥0.92、ICP 业务一致率 ≥80%。

## 证据格式

每次验证在 `docs/engineering/evidence/` 写入小型 Markdown 索引：

- 日期、分支、Commit；
- Node/npm/数据库环境；
- 执行命令；
- 通过/失败数量；
- 已知警告；
- 失败对应 BUG；
- 大型报告或 CI Artifact 链接。

测试失败时禁止把状态改为 `done`。
