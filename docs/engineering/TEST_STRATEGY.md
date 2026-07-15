# 测试策略与质量门禁

更新时间：2026-07-15

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
npm run audit:dependencies
```

`npm run verify` 必须依次通过：

- 仓库敏感文件检查；
- 依赖版本、来源和完整性策略检查；
- 后端路由模块独立集成测试；
- 后端 self-test；`AiWorkflowEngine` 暂停/恢复、确认、权限、幂等和审计专项测试；
- 前端 self-test；
- 后端安全测试；
- 工作簿安全与 XLSX/XLS/CSV 兼容测试；
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


## 工作簿安全标准

- 只允许 XLSX、XLS、CSV，文件上限 5 MB；
- XLSX/XLS 必须通过文件签名与扩展名一致性检查；
- 客户导入最多 2000 行，题库最多 500 行；默认最多 128 列、单元格最多 32767 字符；
- 拒绝 `__proto__`、`prototype`、`constructor` 危险表头；
- 解析结果必须使用无原型对象；
- 依赖锁必须固定已批准版本、官方来源和 SHA-512 完整性；
- CI 必须执行 High/Critical 依赖审计；High/Critical 不为 0 时禁止合并。

## 路由模块化标准

- 每个路由模块不得导入或启动全局 Express app；由 Composition Root 显式注册；
- 模块必须可在最小 Express 应用中独立测试；
- 迁移不得改变 URL、方法、状态码、响应结构、认证、权限、CSRF、限流和缓存头；
- OpenAPI 文档操作数必须与注册路由操作数一致；当前基线固定为 167，计划增删接口必须同步 ADR、测试和文档；
- 每批迁移至少运行 `npm run test:routes`、`npm run test:security`、`npm run verify` 和 P0 E2E；
- 禁止通过修改断言接受未登记的契约变化。

## AI 工作流编排标准

- LangGraph.js 只负责编排；专项测试必须证明模型调用全部经过 Mock `ModelGateway`，真实外呼为 0；
- 未确认、驳回、读取越权、写入越权时领域写入必须为 0；
- 顺序和并发重复确认最多执行一次稳定幂等 Effect；
- 暂停运行必须能通过稳定 run/thread ID 恢复，并校验恢复用户和租户；
- 模型输出必须在人工确认前通过严格 Schema；非法 JSON/结构不得进入确认或写入；
- Checkpoint、公开 Snapshot、审计和错误不得包含 API Key；
- 每个 workflow/permission/lead/model/proposal/approval/effect/failure 事件必须包含 Trace ID；
- MemorySaver 只允许测试和本地技术验证；正式 MySQL 恢复必须另有迁移、事务、并发和崩溃恢复测试；
- LangGraph、Checkpoint、Core 和 Zod 必须精确锁定版本与 SHA-512 完整性，High/Critical audit 为 0。
