# 会话交接

更新时间：2026-07-13

## 当前工作位置

- 仓库：GoodJob 本地克隆
- 分支：`codex/phase-0-engineering-harness`
- 基线：`9f7d154`
- 当前循环：L-0001

## 已做变更

- 跨平台脚本：后端与 Playwright 使用 `cross-env`。
- 根脚本增加 `test:security` 与 `verify`。
- 新增 `.gitignore`、`AGENTS.md`、`docs/engineering/` 和 `.github/` 治理文件。

## 下一步必须执行

1. 运行 `npm run verify`，记录到 `docs/engineering/evidence/L-0001-baseline.md`。
2. 安装 Playwright Chromium 后运行 `npm run test:e2e`。
3. 检查 `git diff`，确认未提交依赖和敏感数据。
4. 完成 `REQ-GJ-SEC-001`：处置管理员账号说明和历史凭证风险。
5. 获得 GitHub 目标仓库地址后添加远端并推送分支。

## 已知注意事项

- `npm ci` 会触发 WhatsApp/Puppeteer 浏览器下载；本轮曾长时间停留。CI 应设置 `PUPPETEER_SKIP_DOWNLOAD=true`，需要 WhatsApp Web 扫码功能时再单独准备运行时。
- `server.ts` 和 `prototype-api.ts` 很大，禁止在没有回归证据前直接大规模重构。
- 不要把默认测试账号当成生产账号；需要专门的安全处置循环。
