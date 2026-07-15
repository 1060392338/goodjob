# ADR-0014：静态原型前端的渐进式动态分包与性能预算

- 状态：Accepted
- 日期：2026-07-15
- 关联：REQ-GJ-FE-PERF-001 / TASK-GJ-0008 / R-008
- Loop：L-0015
- 基线 Commit：`e0f1ad4`

## 背景

GoodJob 当前正式入口是约 384 kB 的 `frontend/index.html` 静态原型，并由约 11,700 行的 `prototype-api.ts` 绑定交互；未使用的 React `main.tsx` 不是生产入口。基线构建把原型、SheetJS/XLSX 和 ECharts 合并为单个 1,394.14 kB（gzip 444.16 kB）JavaScript 包，任何登录页访问都会先下载工作簿和图表依赖。

## 决策

1. 不重写现有静态原型，不以 React `main.tsx` 替换正式入口，不改变 URL、DOM 标识、角色权限或业务流程。
2. 新增轻量 `bootstrap.ts`，由它动态导入 `prototype-api.ts`，建立可测量的生产入口边界。
3. 工作簿能力通过动态 `import("./workbook")` 在导入或导出动作发生时加载；加载失败清除 Promise 缓存，允许后续重试。
4. 仪表盘图表渲染迁入 `dashboard-chart.ts`，仅在真实渲染漏斗时加载；使用渲染版本号丢弃过期异步结果，并由控制器统一释放图表和 ResizeObserver。
5. 使用稳定命名将 XLSX、ECharts 和 ZRender 拆为独立 vendor chunk；不把全部 `node_modules` 合并为单一 vendor。
6. Vite 输出 manifest，Bundle Budget 读取真实产物并验证入口大小、核心包大小、动态边界、首屏依赖图和 modulepreload；不得通过提高 `chunkSizeWarningLimit` 冒充优化。
7. 本 Loop 只声明完成重依赖与特性边界拆分。受 384 kB 静态 HTML 和单文件全局状态约束，页面控制器仍未逐页迁移，继续由 R-004/R-008 后续切片处理。

## 性能门禁

- 生产入口 JavaScript 不超过 20 KiB；
- `prototype-api` 动态核心包不超过 450 KiB；
- `workbook` 和 `dashboard-chart` 必须是动态入口；
- XLSX、ECharts、ZRender 必须是稳定独立包且不进入首屏静态依赖图；
- 非重型 vendor 的任何 JavaScript 包不得超过 500 KiB；
- `index.html` 不得 modulepreload 工作簿或图表包。

## 验证

- `npm run test:bundle-budget --workspace frontend`；
- frontend self-test、lead-source contract、workbook security；
- `npm run verify`；
- `npm run test:e2e`；
- `npm run audit:dependencies`。

## 回滚

- 可将 `index.html` 入口恢复为 `prototype-api.ts`，并恢复工作簿/图表静态导入；
- 回滚不会改变 API、数据库或业务数据；
- 回滚前后都必须运行完整 E2E，避免异步事件处理器或下载行为回归；
- Bundle Budget 不应被删除；若暂时回滚动态边界，应让门禁明确失败并记录例外，而不是放宽阈值。

## 后果

- 登录页初始 JavaScript 显著下降，工作簿和图表只在需要时下载；
- 生产构建拥有可重复、可审计的性能门禁；
- 静态 HTML 仍约 384 kB，核心原型仍约 390 kB，尚未达到页面级控制器独立分包，后续必须继续渐进拆分。