# 风险登记册

更新时间：2026-07-15

| ID | 风险 | 等级 | 状态 | 缓解措施 | 目标阶段 |
|---|---|---|---|---|---|
| R-001 | 仓库包含默认登录账号说明或历史示例凭证，可能被误用于真实环境 | Critical | Verification | 当前分支已删除说明与密码预填，并增加生产配置门禁；待 GitHub 历史扫描、部署实例确认及必要轮换 | 阶段 0 |
| R-002 | 原仓库无 `.gitignore`，依赖、环境文件和运行缓存可能误提交 | High | Mitigated | 已新增 `.gitignore` 与仓库安全检查；远端 CI 待实跑 | 阶段 0 |
| R-003 | Windows 下测试与 E2E 脚本使用 Unix 环境变量语法 | High | Mitigated | 已使用 `cross-env`，Windows 本地验证通过；Linux 由 GitHub Actions 待验证 | 阶段 0 |
| R-004 | 后端 `server.ts` 与前端 `prototype-api.ts` 文件过大，修改影响面和冲突风险高 | High | Mitigating | ADR-0005/0009 规定渐进拆分；L-0004~L-0009 已迁移后端 30 个 API 并建立外部边界；L-0010 提取首个前端来源中心类型/状态/API 模块，`prototype-api.ts` 11745→11717；后续继续视图/控制器与 Repository 边界 | 阶段 2 |
| R-005 | MySQL Store 具有原型阶段全量持久化特征，扩展性与数据竞争风险高 | High | Mitigating | L-0013 已将线索外联请求及完成事务迁入 Repository/Unit of Work，并将 `lead_outreach_requests` 移出快照替换；其他领域仍使用 `persistAll`，需逐域迁移和真实 MySQL 恢复演练 | 阶段 2 |
| R-006 | AI/网页采集可能造成敏感数据泄漏、提示注入或不合规采集 | Critical | Open | L-0008/L-0009 已完成模型和线索来源调用的 SSRF 拒绝、密钥脱敏与统一边界；仍需来源白名单、采集许可、恶意内容隔离、Prompt 注入防护、审计和人工确认 | 阶段 1/3/4 |
| R-007 | WhatsApp/Twilio/Puppeteer 等依赖安装包含大型浏览器下载，影响 CI 可重复性 | Medium | Open | CI 跳过非必要 Puppeteer 下载；WhatsApp 独立可选运行时 | 阶段 2 |
| R-008 | 前端主包约 1.394 MB，首屏和维护性存在风险 | Medium | Open | L-0010 只做结构拆分，生产构建仍约 1.394 MB；后续建立性能基线并按模块动态拆包，工作簿能力评估按需加载 | 阶段 2/7 |
| R-009 | GitHub 远端、质量门禁与保护规则未完全闭环 | High | Mitigating | 已建立 `github` 远端并推送 master/开发分支；待完成 Actions 实跑、历史 Secret Scan、分支保护与部署凭证确认 | 阶段 0 |
| R-010 | npm Registry 的 `xlsx@0.18.5` 存在 Prototype Pollution 与 ReDoS High 漏洞 | High | Closed | 已升级到 SheetJS 官方 `0.20.3`、锁定完整性、集中安全解析并增加恶意输入/兼容测试；依赖审计为 0 | 阶段 0 |
| R-011 | SMTP 超时或发送成功后最终持久化失败会留下结果不确定的 `pending` 外联请求，人工使用新键仍可能造成重复邮件 | High | Open | 发送前持久化 pending；相同键返回 409 且不自动重发；保存外部消息 ID；后续增加运维查询、人工确认、受控重试和告警 | 阶段 2/7 |
| R-012 | 模型 API Key 在数据库、备份或错误路径中泄漏 | Critical | Verification | L-0012 已通过 SecretVault、AES-256-GCM、上下文绑定、检查点迁移、轮换/吊销和启动门禁消除新增明文落库；待真实部署完成备份恢复、迁移状态和密钥托管验证 | 阶段 2/4 |
| R-013 | 线索来源 API Key 在数据库、备份或错误路径中泄漏 | Critical | Verification | L-0012 已通过同一 SecretVault 边界完成密文落库、迁移、轮换、吊销和租户上下文认证；待真实部署验证和供应商侧额度告警 | 阶段 2/3 |
| R-014 | AI 工作流 Checkpoint、审批重放或幂等记录设计不当，可能持久化密钥、造成越权恢复或重复写入 | Critical | Mitigating | L-0014/ADR-0013 已实现 6 张 MySQL 状态表、跨实例恢复、actor/tenant 校验、Effect 前权限复检、run/attempt 唯一决策、稳定幂等键/租约恢复和 Secret 拒绝；Fake Pool 并发/崩溃契约通过，仍需真实 MySQL 迁移、锁等待、断连与备份恢复演练 | 阶段 2/4/5 |

任何 Critical 风险在关闭或正式签署接受前不得发布内部正式版。
