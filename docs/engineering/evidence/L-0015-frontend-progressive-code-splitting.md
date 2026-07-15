# L-0015 证据：前端渐进式动态分包与 Bundle Budget

- 日期：2026-07-15
- 关联：REQ-GJ-FE-PERF-001 / TASK-GJ-0008
- ADR：ADR-0014
- 基线 Commit：`e0f1ad4`
- 实现 Commit：`1509f64`
- 状态：本地 DoD 完成

## 范围

- 保留 384 kB 静态原型和现有业务交互，不用未启用的 React `main.tsx` 重写正式入口；
- 新增轻量 `bootstrap.ts`，动态加载 `prototype-api.ts`；
- 工作簿导入/导出发生时才加载 `workbook` 与 XLSX；
- 仪表盘真实渲染漏斗时才加载 `dashboard-chart`、ECharts 与 ZRender；
- Vite 输出 manifest 和稳定 vendor chunk；
- 构建后自动执行 Bundle Budget，不提高 `chunkSizeWarningLimit`；
- 未声明完成逐页面控制器拆分，静态 HTML 和核心原型继续进入后续架构切片。

## Test-first 记录

1. 首次运行 `npm run test:bundle-budget --workspace frontend` 按预期失败：现有唯一 JavaScript 包为 `1,394.14 kB`，并明确报告 Vite manifest 和懒加载边界缺失。
2. 初次实现后构建产物已经拆分，但门禁发现 Vite 以 `index.html` 而不是 `src/bootstrap.ts` 作为 manifest 入口键。门禁改为验证真实 HTML entry、其 1.90 kB 产物和对 `prototype-api` 的动态导入；没有删除入口断言。
3. frontend self-test 首次因入口不再直接包含 `prototype-api.ts` 而失败。测试改为同时读取 `bootstrap.ts` 和新图表模块，并新增 `/src/bootstrap.ts`、`import("./prototype-api")`、工作簿与图表动态导入断言，而不是删除原有业务断言；断言数由 41 增至 44。
4. 首次完整 E2E 为 35/37。两条工作簿导出用例暴露包装函数递归调用，浏览器报告 `Maximum call stack size exceeded`。修正为通过懒加载模块调用真实 `downloadWorkbook`，先针对失败的 2 条用例复测通过，再执行完整 37/37。
5. 没有删除测试、跳过门禁、提高性能阈值或放宽业务断言。

## 构建证据

基线：

```text
index.html                          384.03 kB，gzip 67.07 kB
index JavaScript                 1,394.14 kB，gzip 444.16 kB
manifest                            不存在
```

L-0015：

```text
index entry                          1.90 kB，gzip   0.98 kB
prototype-api                     389.65 kB，gzip 107.43 kB
workbook feature                    3.54 kB，gzip   1.82 kB
vendor-xlsx                       492.35 kB，gzip 160.64 kB
dashboard-chart                     2.78 kB，gzip   1.52 kB
vendor-echarts                    321.17 kB，gzip 111.16 kB
vendor-zrender                    184.17 kB，gzip  62.71 kB
index.html                        384.03 kB，gzip  67.06 kB
```

解释：

- 初始 JavaScript 入口从 1,394.14 kB 降至 1.90 kB；
- 业务核心在入口触发的动态边界后加载，不与 XLSX/ECharts 合包；
- XLSX、ECharts、ZRender 均不在入口静态依赖图，也未由 `index.html` modulepreload；
- 所有非重型 vendor 包小于 500 KiB；
- 静态 HTML 体积未下降，页面控制器尚未逐页拆分，R-004/R-008 不能关闭。

## 验收结果

```text
npm run test:bundle-budget --workspace frontend  PASS
  entry <= 20 KiB
  prototype <= 450 KiB
  workbook/dashboard-chart dynamic entries       true
  XLSX/ECharts/ZRender outside initial graph      true
  heavy modulepreload                             0

npm run test --workspace frontend                 PASS
  self-test assertions                            44
  lead source states / API contracts              8 / 4

npm run test:workbook-security --workspace frontend PASS
  XLSX/XLS/CSV                                     1 / 1 / 1
  prototype pollution / row limits                protected

npm run verify                                     PASS
API operations                                     167
tenant isolation                                   18
npm run audit:dependencies                         PASS，0 vulnerabilities
npm run test:e2e                                   PASS，37/37（3.4 分钟）
真实模型/MySQL/协作平台调用                        0
```

## 安全与行为

- 工作簿安全解析仍集中在原 `workbook.ts`，安全测试未绕过；
- 动态加载失败会清除工作簿 Promise 缓存，后续用户动作可重试；
- 图表异步加载使用渲染版本号，旧结果不得覆盖新 Dashboard；控制器释放 ECharts 和 ResizeObserver；
- API 数量、租户隔离、角色权限、URL、DOM 标识和 37 条端到端行为不变；
- 没有新增真实外部调用或凭证。

## 风险与限制

- R-008 从 Open 调整为 Mitigating：首屏重依赖已拆离，但 384 kB HTML 和约 390 kB 核心原型仍需处理；
- R-004 保持 Mitigating：`prototype-api.ts` 仍是超大单文件和全局状态中心；
- 本 Loop 不声明“每个业务页面独立 chunk”完成；页面控制器拆分转入后续阶段；
- 构建预算使用 raw bytes；网络性能还需要阶段 7 在真实部署环境采集缓存、TTFB、LCP 和弱网指标。

## 回滚

1. 回滚实现 Commit `1509f64` 可恢复原静态入口和静态依赖；
2. 回滚不涉及数据库、API 或业务数据迁移；
3. Bundle Budget 不得被静默删除或放宽；回滚后应保留明确失败证据和例外记录；
4. 回滚后必须重跑工作簿专项和完整 E2E。

## 下一循环

L-0016：阶段 2 全量验收与收口。执行追踪矩阵双向审计、文档/代码一致性检查、风险复核、完整回归和阶段回顾；未完成的 Repository 全域迁移、页面控制器拆分、真实 MySQL/部署验证必须明确转入后续阶段。