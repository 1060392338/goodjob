# L-0010 交付证据：前端线索来源中心模块边界

- 日期：2026-07-15
- 分支：`codex/phase-1-route-modularization`
- 关联：`REQ-GJ-FE-001 / TASK-GJ-0005`
- 关联架构：`REQ-GJ-ARCH-001 / TASK-GJ-0003`
- 基线 Commit：`3662a11`
- 代码 Commit：`487438b`
- 设计：`ADR-0009`
- 状态：本地 DoD 完成

## Orient / Select

阶段 2 的后端已完成多个单领域切片，但 `frontend/src/prototype-api.ts` 仍约 11745 行。L-0010 只选择“线索来源中心”的类型、选择状态和 4 个配置 API 客户端边界，不迁移完整搜索、不重写页面、不接入真实供应商或模型。

## DoR

- [x] 现有页面和 GoodJob 行为是唯一基线，不进行推倒重写。
- [x] Provider 类型、默认选择、保存、测试、删除和刷新语义已冻结。
- [x] API URL、方法、请求体、DOM 标识、文案、按钮加载状态和移动端行为已冻结。
- [x] `REQ-GJ-FE-001 / TASK-GJ-0005`、ADR、测试、回滚和非目标已登记。
- [x] 无数据库迁移、无真实模型/第三方数据源凭证、无新增生产依赖。

## Test first

先新增 `lead-source-center-test.ts` 并执行专项测试。首次按预期失败：`ERR_MODULE_NOT_FOUND`，证明测试在生产模块创建前生效。完成模块后专项测试通过，覆盖 8 组状态规则和 4 个 API 契约。

前端统一 self-test 首次发现 `/api/lead-finder/providers` 已迁出超大文件；处理方式是让 self-test 同时读取新领域模块并新增模块边界标识，没有删除、跳过或放宽原断言。

## 实现

### 新增 `frontend/src/lead-source-center.ts`

- 导出 `LeadProviderStatus` 和来源中心状态类型；
- 集中默认选择规则：仅选择 `ready && enabled`，并排除 `ai_search`；
- 集中 Provider 刷新、用户切换、保存后选中和删除后移除等纯状态转换；
- 通过注入现有 `api` 函数建立来源配置客户端；
- 冻结 4 个接口的 URL、方法与请求体。

### 调整 `frontend/src/prototype-api.ts`

- 删除重复的 Provider 类型定义；
- 使用 `createLeadSourceCenterClient(api)` 装配客户端；
- 读取、保存、测试和删除改为调用新模块；
- DOM、Modal、Toast、导航和按钮状态继续保留原实现；
- 完整 `/api/lead-finder/search` 执行路径未迁移。

### 测试入口

- 新增 `test:self`；
- 新增 `test:lead-source-center`；
- 前端 `test` 统一执行 self-test 与来源中心专项测试；
- self-test 检查范围扩展到新领域模块，检查项 39 → 41。

## 行为兼容证据

- [x] 默认来源仍排除按 Token 计费的 `ai_search`。
- [x] 用户手动选择后，Provider 状态刷新不会覆盖选择。
- [x] 保存配置后仍自动选择该来源。
- [x] 测试时输入新 Key 仍先保存再测试。
- [x] 删除配置后仍从已选来源移除。
- [x] 4 个配置 API 的 URL、方法和请求体不变。
- [x] DOM ID、提示文案、Modal、Toast、按钮加载状态和导航未重写。
- [x] 移动端及完整业务流程由 Playwright 37/37 证明未回归。

## 规模与影响

- `prototype-api.ts`：11745 → 11717 行，净减少 28 行；
- 新增独立生产模块和专项测试文件；
- API 操作：167；
- 跨模块租户隔离：18；
- 前端生产包仍约 1.394 MB，R-008 继续 Open；
- 无后端、数据库和外部配置变化；
- 无新增生产依赖。

## 验证证据

| 命令 | 结果 |
|---|---|
| `npm run test:lead-source-center --workspace frontend` | PASS；8 组状态规则；4 个 API 契约 |
| `npm run test --workspace frontend` | PASS；self-test 41 项 + 来源中心专项测试 |
| `npm run build --workspace frontend` | PASS；596 modules transformed |
| `npm run verify` | PASS；路由、双端测试、安全、工作簿与构建通过 |
| `npm run test:security` | PASS；API 167；跨模块租户隔离 18 |
| `npm run test:e2e` | PASS；Playwright 37/37 |
| `npm run audit:dependencies` | PASS；0 vulnerabilities |
| `npm run test:repo-security`（代码暂存后） | PASS；125 files |
| `git diff --check` / `git diff --cached --check` | PASS |

## Review

- 权限与租户：本循环不改变后端鉴权和用户级来源配置语义；前端仍通过统一 `api` 处理 CSRF、Cookie 和 401。
- 安全：新模块不读取、记录或回显 API Key；只传递用户输入给既有后端安全边界。
- 兼容：没有更改 API、DOM、文案、状态提示和搜索执行路径。
- 性能：仅做结构提取，没有实现代码分割；主包体积风险 R-008 未关闭。
- 回滚：回滚 Commit `487438b` 即可恢复内联类型、状态和 API 调用；无数据回滚。

## 后续

建议 L-0011 在阶段 2 内执行 LangGraph.js 技术验证与 ADR：只使用 Mock ModelGateway，验证线索分析工作流的暂停、恢复、人工确认、权限复检、幂等和审计；不得接真实模型或直接写生产 CRM 数据。
