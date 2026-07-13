# L-0003 工作簿安全与依赖修复证据

- 日期：2026-07-13
- 分支：`codex/phase-0-workbook-security`
- 基线提交：`e5c38b4`
- 交付提交：本循环提交（提交后由 Git 历史反查）
- 本地环境：Windows；Node `v24.14.0`；npm `11.9.0`

## 依赖证据

| 项目 | 值 |
|---|---|
| 包 | `xlsx@0.20.3` |
| 来源 | SheetJS 官方 CDN `xlsx-0.20.3.tgz` |
| 完整性 | package-lock 中固定 SHA-512 |
| `npm audit --audit-level=high` | PASS，0 vulnerabilities |

## 安全边界

- 允许格式：XLSX、XLS、CSV；
- 文件上限：5 MB；
- 客户行数上限：2000；题库行数上限：500；
- 默认列数上限：128；单元格字符上限：32767；
- XLSX/XLS 扩展名与文件签名一致性校验；
- 危险表头拒绝；解析行使用无原型对象。

## 验证

| 命令/场景 | 结果 |
|---|---|
| `npm run test:dependency-policy` | PASS：版本、官方来源、SHA-512 完整性 |
| `npm run audit:dependencies` | PASS：0 vulnerabilities |
| `npm run test:workbook-security` | PASS：XLSX/XLS/CSV、危险表头、伪造格式、损坏文件、行列/单元格限制 |
| 导入导出聚焦 E2E | PASS，3/3 |
| `npm run verify` | PASS |
| `npm run test:e2e` | PASS，37/37 |
| `git diff --check` | PASS |

## 已知警告

- 前端主包约 1.394 MB / gzip 444 KB，仍超过 500 KB 警戒值，由 R-008 继续跟踪。
- GitHub Actions Linux/Node 22 尚待目标远端提供后实跑。
