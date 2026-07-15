# ADR-0015：机器可验证的工程追踪与阶段收口

- 状态：Accepted
- 日期：2026-07-15
- 关联：REQ-GJ-ENG-AUDIT-001 / TASK-GJ-0009
- Loop：L-0016
- 基线 Commit：`ba6ef0b`

## 背景

GoodJob 已建立 FEATURES、追踪矩阵、ADR、证据、状态、风险和交接文档，但一致性主要依靠人工维护。随着 Loop 增加，已出现部分 `done` 功能缺少 `completedAt` 或结构化 `verification`、状态文档保留旧事实等漂移。仅在阶段末人工阅读无法持续保证可追溯性。

## 决策

1. 新增仓库级工程追踪检查，并纳入根 `verify`。
2. 检查需求 ID、TASK ID 唯一，状态属于允许集合。
3. 所有功能必须能在追踪矩阵中定位；所有设计和证据路径必须存在。
4. 阶段 2 的 `done` 需求必须具备完成日期、结构化验证、证据、设计和追踪矩阵 Done 状态。
5. 阶段 2 完成证据必须记录本地存在的实现 Commit；文档提交本身由证据文件和 Git 历史继续反查。
6. `FEATURES.currentIteration` 必须在项目状态、开发计划和交接中出现。
7. 工程文档不得包含 Unicode 替换字符或连续问号占位。
8. 脚本只校验结构与引用存在，不把文字存在误当作业务测试通过；`verify`、E2E、audit 仍需独立执行。

## 阶段 2 收口判定

阶段 2 采用“范围验收完成，剩余工作显式转移”的判定：

- 已有模块边界、Gateway/Connector、SecretVault、Repository 首个切片、AI 工作流持久化和前端性能边界形成可复用基础；
- `REQ-GJ-ARCH-001` 仍保持 in_progress，不把剩余路由/页面控制器拆分混报完成；
- 全 Store Repository、真实 MySQL、部署凭证、GitHub 远端门禁和发布性能演练转入后续阶段；
- 阶段 2 收口不等于可发布，Critical 风险仍受发布门禁约束。

## 回滚

- 追踪脚本可独立回滚，不影响运行时业务；
- 若脚本误报，应前向修正规则或文档事实，不得从 `verify` 静默移除；
- 调整规则必须保留 Test-first 失败样例并更新本 ADR 或后续 ADR。

## 后果

- 文档链路从约定升级为持续集成可执行契约；
- 历史阶段文档需要一次性补齐结构化验证字段；
- 远端 PR/CI/Release 链路仍需 GitHub Actions 和发布阶段继续闭环。