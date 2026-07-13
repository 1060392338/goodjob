# 风险登记册

更新时间：2026-07-13

| ID | 风险 | 等级 | 状态 | 缓解措施 | 目标阶段 |
|---|---|---|---|---|---|
| R-001 | 仓库包含默认登录账号说明或历史示例凭证，可能被误用于真实环境 | Critical | Open | 审计内容；移除真实凭证；轮换/禁用；增加密钥扫描 | 阶段 0 |
| R-002 | 原仓库无 `.gitignore`，依赖、环境文件和运行缓存可能误提交 | High | Mitigating | 已新增 `.gitignore`；CI 增加仓库卫生检查 | 阶段 0 |
| R-003 | Windows 下测试与 E2E 脚本使用 Unix 环境变量语法 | High | Mitigating | 使用 `cross-env`，在 Windows 与 Linux 双环境验证 | 阶段 0 |
| R-004 | 后端 `server.ts` 与前端 `prototype-api.ts` 文件过大，修改影响面和冲突风险高 | High | Open | 先用回归测试锁定行为，再按领域拆分路由和组件 | 阶段 2 |
| R-005 | MySQL Store 具有原型阶段全量持久化特征，扩展性与数据竞争风险高 | High | Open | 设计正式迁移与按表/按行增量持久化；恢复演练 | 阶段 2 |
| R-006 | AI/网页采集可能造成敏感数据泄漏、提示注入或不合规采集 | Critical | Open | Gateway 脱敏、来源白名单、恶意内容隔离、审计、人工确认 | 阶段 1/3/4 |
| R-007 | WhatsApp/Twilio/Puppeteer 等依赖安装包含大型浏览器下载，影响 CI 可重复性 | Medium | Open | CI 跳过非必要 Puppeteer 下载；WhatsApp 独立可选运行时 | 阶段 2 |
| R-008 | 前端单包约 1.3 MB，首屏和维护性存在风险 | Medium | Open | 建立性能基线并按模块动态拆包 | 阶段 2/7 |
| R-009 | 尚未配置目标 GitHub 远端和保护规则 | High | Blocked | 获得仓库地址/权限后迁移并验证 Git 历史、Actions 和保护规则 | 阶段 0 |

任何 Critical 风险在关闭或正式签署接受前不得发布内部正式版。
