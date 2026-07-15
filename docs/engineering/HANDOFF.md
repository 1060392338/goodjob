# 会话交接

更新时间：2026-07-15

## 当前工作位置

- 仓库：`C:\Users\Administrator\Documents\Codex\2026-07-13\hi\GoodJob`
- 分支：`codex/phase-3-lead-pipeline`
- GitHub：`https://github.com/1060392338/goodjob.git`
- 当前 Loop：L-0018（CSV/Excel Connector）
- 阶段 2 收口 Commit：`60cf336`
- L-0017 实现 Commit：`308cb67`
- 禁止推送 Gitee `origin`。

## L-0017 已完成内容

1. 新增 Connector、Sink、Checkpoint Store 统一契约和 `LeadIngestionPipeline`；
2. 完成规范化、稳定记录键、逐记录血缘、幂等 Sink、上下文绑定 checkpoint 和失败恢复；
3. Secret-like payload/checkpoint 失败关闭，错误租户/来源/版本上下文拒绝恢复；
4. CRM Sink 复用现有 `persistLeadFromSource` 幂等和来源血缘逻辑；
5. 未修改公开 API/数据表，真实外呼 0。

## L-0017 已通过门禁

- 专项：normalized fields 7；persisted 2；故障恢复 true；duplicate writes 0；Secret rejection true；真实外呼 0；
- `npm run verify`：PASS；repository security 158；API 167；tenant isolation 18；frontend self-test 44；Bundle Budget PASS；
- `npm run audit:dependencies`：0 vulnerabilities；
- `npm run test:e2e`：37/37；
- Evidence：`docs/engineering/evidence/L-0017-lead-ingestion-pipeline.md`。

## 当前执行：L-0018

目标：把 CSV、XLSX、XLS 作为统一 Connector Contract 的首个生产化数据入口。

1. ADR 与 Evidence 先登记；
2. Test-first 锁定格式兼容、版本化映射、文件/批次/行血缘、幂等、部分失败和检查点恢复；
3. 复用现有 workbook 安全解析，拒绝 Prototype Pollution、超限文件/行列和危险输入；
4. 只使用本地固定样本和 Mock Sink，真实外呼保持 0；
5. 完成后独立 Commit，再进入 L-0019。

## 持续风险与暂停条件

- R-015 保持 Mitigating：真实来源样本与供应商验收尚未完成；
- R-004/R-005/R-008/R-011/R-012/R-013/R-014 继续按登记状态跟踪；
- GitHub Actions、历史 Secret Scan、分支保护和部署凭证轮换尚未闭环；
- 仅在需要真实凭证、确定供应商、不可逆业务决策或生产操作时暂停并请求用户确认。
