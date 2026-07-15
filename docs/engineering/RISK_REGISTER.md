# 风险登记册

更新时间：2026-07-15

| ID | 风险 | 等级 | 状态 | 缓解措施 | 目标阶段 |
|---|---|---|---|---|---|
| R-001 | 仓库包含默认登录账号说明或历史示例凭证，可能被误用于真实环境 | Critical | Verification | 当前分支已删除说明与密码预填，并增加生产配置门禁；待 GitHub 历史扫描、部署实例确认及必要轮换 | 阶段 0 |
| R-002 | 原仓库无 `.gitignore`，依赖、环境文件和运行缓存可能误提交 | High | Mitigated | 已新增 `.gitignore` 与仓库安全检查；远端 CI 待实跑 | 阶段 0 |
| R-003 | Windows 下测试与 E2E 脚本使用 Unix 环境变量语法 | High | Mitigated | 已使用 `cross-env`，Windows 本地验证通过；Linux 由 GitHub Actions 待验证 | 阶段 0 |
| R-004 | 后端 `server.ts` 与前端 `prototype-api.ts` 文件过大，修改影响面和冲突风险高 | High | Mitigating | ADR-0005 规定渐进拆分；L-0004~L-0007 已迁移系统/认证/客户/线索共 22 个 API，建立邮件 Gateway、外联幂等和转化回滚测试；`server.ts` 6526→6258；后续继续 AI/集成、前端模块与 Repository 边界 | 阶段 2 |
| R-005 | MySQL Store 具有原型阶段全量持久化特征，扩展性与数据竞争风险高 | High | Open | 设计正式迁移与按表/按行增量持久化；恢复演练 | 阶段 2 |
| R-006 | AI/网页采集可能造成敏感数据泄漏、提示注入或不合规采集 | Critical | Open | Gateway 脱敏、来源白名单、恶意内容隔离、审计、人工确认 | 阶段 1/3/4 |
| R-007 | WhatsApp/Twilio/Puppeteer 等依赖安装包含大型浏览器下载，影响 CI 可重复性 | Medium | Open | CI 跳过非必要 Puppeteer 下载；WhatsApp 独立可选运行时 | 阶段 2 |
| R-008 | 前端主包约 1.394 MB，首屏和维护性存在风险 | Medium | Open | 建立性能基线并按模块动态拆包；工作簿能力后续评估按需加载 | 阶段 2/7 |
| R-009 | GitHub 远端、质量门禁与保护规则未完全闭环 | High | Mitigating | 已建立 `github` 远端并推送 master/开发分支；待完成 Actions 实跑、历史 Secret Scan、分支保护与部署凭证确认 | 阶段 0 |
| R-010 | npm Registry 的 `xlsx@0.18.5` 存在 Prototype Pollution 与 ReDoS High 漏洞 | High | Closed | 已升级到 SheetJS 官方 `0.20.3`、锁定完整性、集中安全解析并增加恶意输入/兼容测试；依赖审计为 0 | 阶段 0 |
| R-011 | SMTP 超时或发送成功后最终持久化失败会留下结果不确定的 `pending` 外联请求，人工使用新键仍可能造成重复邮件 | High | Open | 发送前持久化 pending；相同键返回 409 且不自动重发；保存外部消息 ID；后续增加运维查询、人工确认、受控重试和告警 | 阶段 2/7 |

任何 Critical 风险在关闭或正式签署接受前不得发布内部正式版。
