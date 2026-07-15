# ADR-0009：前端线索来源中心渐进式模块边界

- 状态：Accepted
- 日期：2026-07-15
- 关联：`REQ-GJ-FE-001 / TASK-GJ-0005`
- 关联架构：`REQ-GJ-ARCH-001 / TASK-GJ-0003`
- 实施循环：`L-0010`

## 背景

`frontend/src/prototype-api.ts` 同时承担全局状态、API 调用、DOM 渲染和事件绑定，当前约 11745 行。线索来源中心的 Provider 类型、默认选择、配置读写、连接测试和删除逻辑全部内联，阶段 3 的完整获客管道继续扩展时会放大回归范围。

本循环仍属于阶段 2 的可维护架构基础。目标是在不改变 GoodJob 现有页面和行为的前提下，建立第一个可独立测试的前端领域模块；不代表阶段 3 的完整数据管道已经完成。

## 决策

1. 新建 `frontend/src/lead-source-center.ts`，集中维护：
   - `LeadProviderStatus` 公共类型；
   - 默认来源选择、刷新保留、切换、保存后选中和删除后移除等纯状态规则；
   - `GET /api/lead-finder/providers`；
   - `POST /api/lead-finder/source-config`；
   - `POST /api/lead-finder/source-config/test`；
   - `DELETE /api/lead-finder/source-config/:provider` 的客户端契约。
2. API 客户端通过现有 `api` 函数注入，不复制认证、CSRF、401 处理或错误解析。
3. `prototype-api.ts` 继续负责既有 DOM 渲染、Modal、Toast、按钮加载状态和导航；本循环不引入新状态管理框架，不重写 React 页面。
4. 保持以下现有语义：
   - 默认选择所有 `ready && enabled` 的来源，但排除按 Token 计费的 `ai_search`；
   - 用户手动选择后，刷新 Provider 状态不得覆盖其选择；
   - 保存配置后自动选择该来源；
   - 测试时若输入新 Key，先保存再测试；
   - 删除配置后从已选来源中移除；
   - API URL、方法、请求体、DOM 标识、文案和移动端行为不变。
5. 新增独立专项测试和 npm 脚本，并纳入前端 `test` 门禁。

## 本循环明确不做

- 不迁移完整 `/api/lead-finder/search` 搜索执行；
- 不实现分页、检查点、重试或幂等摄取；
- 不修改 Provider 后端契约；
- 不重做页面样式或更换状态管理框架；
- 不接入 LangGraph、真实模型或真实第三方数据源；
- 不修改 MySQL 数据结构。

## 测试与验收

- 专项测试覆盖 4 个 API 的 URL、方法和请求体；
- 覆盖默认排除 `ai_search`、用户选择刷新保留、切换、保存后选中和删除后移除；
- 前端 self-test、TypeScript 构建和 Playwright 37 条流程全部通过；
- API 操作保持 167，跨模块租户隔离不少于 18；
- `npm run verify`、`npm run test:e2e`、依赖审计、仓库安全检查和 `git diff --check` 全部通过。

## 回滚

回滚 L-0010 代码 Commit：删除 `lead-source-center.ts` 与专项测试，将类型、选择规则和 4 个 API 调用恢复到 `prototype-api.ts`。无后端、数据库或外部配置变更，不需要数据迁移回滚。

## 后果

- 线索来源中心获得独立类型、状态和 API 契约测试入口；
- `prototype-api.ts` 仍保留视图层，但后续可在独立循环继续迁移渲染和事件控制器；
- 阶段 3 可以复用稳定的前端 Provider 契约，不必继续在超大文件中复制请求规则。
