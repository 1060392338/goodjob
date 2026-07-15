# 会话交接

更新时间：2026-07-15

## 当前工作位置

- 仓库：`C:\Users\Administrator\Documents\Codex\2026-07-13\hi\GoodJob`
- 分支：`codex/phase-1-route-modularization`
- GitHub：`https://github.com/1060392338/goodjob.git`
- L-0010 基线：`3662a11`
- L-0010 代码 Commit：`487438b`
- 当前待完成：提交 L-0010 闭环文档并推送 GitHub。
- 禁止推送 Gitee `origin`。

## L-0010 已完成内容

1. 新增 `REQ-GJ-FE-001 / TASK-GJ-0005` 和 `ADR-0009`。
2. 新增 `frontend/src/lead-source-center.ts`：
   - Provider 类型；
   - 默认排除 `ai_search` 的来源选择规则；
   - 用户选择刷新保留、切换、保存后选中、删除后移除；
   - 4 个来源配置 API 客户端契约。
3. 新增 `lead-source-center-test.ts`，覆盖 8 组状态规则和 4 个 API 契约。
4. `prototype-api.ts` 改为装配新模块，DOM、Modal、Toast、导航、按钮状态和完整搜索路径不变。
5. 前端 `test` 统一执行 self-test 与来源中心专项测试；self-test 检查项 39 → 41。
6. `prototype-api.ts` 11745 → 11717 行，净减少 28 行。
7. 无后端、数据库和生产依赖变化。

## 不得隐式改变的语义

- GoodJob 原业务和当前页面是唯一基线，不进行重写。
- 来源配置仍按当前用户隔离；前端不得绕过统一 `api` 的 Cookie、CSRF 和 401 处理。
- 默认选择所有 ready/enabled 来源，但 `ai_search` 不自动选择。
- 用户手动选择后刷新 Provider 不得覆盖选择。
- 测试新 Key 仍先保存再测试；保存后自动选择；删除后取消选择。
- 完整来源搜索、分页、检查点、重试、幂等和来源证据仍属阶段 3 backlog。
- LangGraph.js 尚未引入，ModelGateway 仍是唯一模型外呼入口。

## L-0010 测试证据

```text
npm run test:lead-source-center --workspace frontend PASS，8 组状态，4 个 API 契约
npm run test --workspace frontend                    PASS，self-test 41 项
npm run build --workspace frontend                   PASS
npm run verify                                       PASS
npm run test:security                                PASS，API 167，tenant isolation 18
npm run test:e2e                                     PASS，37/37
npm run audit:dependencies                           PASS，0 vulnerabilities
npm run test:repo-security（代码暂存后）             PASS，125 files
git diff --check / git diff --cached --check         PASS
```

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

L-0011：LangGraph.js 技术验证与 ADR。

1. 新建 `AiWorkflowEngine` 边界，LangGraph 只负责编排，模型调用仍通过 `ModelGateway`。
2. 只使用 Mock 模型，验证线索读取、评分、人工确认、驳回、恢复和幂等模拟写入。
3. 人工未确认写入必须为 0；重复确认不得重复执行；越权工具调用必须拒绝。
4. 记录 workflow/run/step/tool/approval 审计契约。
5. 明确 MySQL 工作流状态方案；不得假设 LangGraph 官方 MySQL Checkpointer 已可直接使用。
6. 技术验证失败时不加入生产依赖，保留现有 ModelGateway 与领域服务方案。

## 持续风险

- R-004：前后端超大模块仍需继续拆分，L-0010 只完成首个前端领域切片。
- R-005：Repository/Unit of Work 与 MySQL 增量持久化未完成。
- R-008：前端主包仍约 1.394 MB，尚未进行代码分割。
- R-011：`pending` 邮件缺少运维处置界面。
- R-012/R-013：模型与来源 API Key 明文 at-rest。
- GitHub Actions、历史 Secret Scan、分支保护和部署凭证轮换尚未闭环。
