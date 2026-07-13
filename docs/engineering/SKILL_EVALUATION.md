# GitHub 开发 Skill 评估记录

评估日期：2026-07-13

目标是补强 GoodJob 的正式工程开发，而不是安装大量重复或高权限 Skill。任何第三方 Skill 在安装前必须经过安全审查；本轮未安装第三方 Skill。

| 来源 | 观察 | 决策 | 原因 |
|---|---|---|---|
| [HarnessEngineering/skills](https://github.com/HarnessEngineering/skills) | 提供以测试驱动、实现、审查为中心的开发工作流 | **采用方法，不直接安装** | 与当前 Harness/Loop 闭环一致；但命令和运行环境面向其自身工作流，GoodJob 已由 `AGENTS.md`、质量门禁和证据模板实现等价控制 |
| [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) | 覆盖深度研究、测试驱动、架构与前端等通用 Agent 能力 | **候选，按需单项评估** | 可在后续性能、前端拆分、研究任务中借鉴；禁止整包安装，避免重复规则和权限面扩大 |
| [feynmanbox/traceability-matrix-skill](https://github.com/feynmanbox/traceability-matrix-skill) | 聚焦需求追踪矩阵、覆盖和缺口识别 | **暂不安装，吸收检查项** | GoodJob 已有 `FEATURES.json` 和 `TRACEABILITY.md`；当前收益主要是检查思路，不值得增加运行时依赖 |
| [openclaw/skills](https://github.com/openclaw/skills) 中 harness-creator | 用于生成 OpenClaw Skill 的 Harness | **不用** | 目标是构建 Agent Skill，而不是交付 CRM；生态、权限和产物不匹配 |
| 未知来源的单文件 Architect/Engineering Gist | 常见于个人 Gist 或聚合目录 | **不用** | 来源、维护、许可证和权限边界难以审计，且容易与仓库协作契约冲突 |

## 当前采用组合

1. 仓库内 `AGENTS.md` 作为唯一开发协作契约；
2. Harness Engineering：测试、工具、文档、可观察状态和质量门禁先于功能扩张；
3. Loop Engineering：每次严格执行 Orient → Select → Plan → Implement → Verify → Review → Record；
4. GitHub Skill 只作为可审查的辅助能力，不能覆盖项目 ADR、权限和测试门禁；
5. 如后续确需安装，先使用安全审查流程检查命令执行、网络访问、文件写入、凭证读取和供应链来源，再固定版本/Commit。
