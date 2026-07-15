# ADR-0017：CSV/Excel 线索 Connector 与共享工作簿安全边界

- 日期：2026-07-15
- 状态：Accepted
- 关联：REQ-GJ-LEAD-001 / TASK-GJ-0201 / L-0018

## 背景

前端已有 XLSX、XLS、CSV 的大小、签名、行列、单元格、危险表头和 Prototype Pollution 防护，但后端获客管道尚无文件 Connector。若后端复制一套解析逻辑，安全修复会产生漂移；若文件 Connector 直接写 CRM，则会绕过 L-0017 的规范化、血缘、幂等和检查点。

## 决策

1. 把工作簿读取和安全校验提取为内部共享 workspace package，前端与后端使用同一实现；前端只保留浏览器文件检查及导出能力。
2. 新增 FileLeadIngestionConnector，仅实现 LeadIngestionConnector，不得直接访问 Store/Repository。
3. Connector 支持 CSV/XLSX/XLS、固定页大小和 cursor；文件摘要、批次 ID、工作表、源行号和映射版本必须写入安全血缘 payload。
4. 字段映射显式配置并带版本；必填 company 缺失、危险公式或 secret-like 表头形成行级问题。
5. 默认 reject_batch：预检发现问题时在返回任何记录前拒绝整个批次，保证 Sink 写入 0；显式 skip_invalid 时只输出有效记录，并提供完整行级报告。
6. 同一文件、映射版本和行号生成确定性 externalId；通过 L-0017 的稳定键与 checkpoint 保证重跑不重复创建。
7. Connector 不执行真实网络调用，不接收或持久化 API key/token/password/secret。

## 安全与限制

- 文件大小、扩展名、XLSX ZIP 签名、XLS OLE 签名、最大行列和单元格长度由共享解析器统一限制；
- 危险对象表头和 secret-like 表头失败关闭；
- CSV/工作簿中的公式注入前缀和可执行公式样式值拒绝；
- raw payload 只包含映射后的业务字段及不可变血缘，不保存整行未映射原文；
- checkpoint 中只保存文件摘要、映射版本、页 cursor 等非敏感信息。

## 备选方案

- 复制前端解析器到后端：拒绝，安全修复会漂移。
- 浏览器解析后直接提交线索数组：拒绝，无法形成统一服务端检查点和可信文件血缘。
- 忽略坏行继续处理且不报告：拒绝，会造成静默数据遗漏。
- 默认部分导入：拒绝，业务方未显式选择时可能误以为整批成功。

## 回滚

删除文件 Connector 与共享 package，恢复前端原工作簿实现和 package 配置即可。该循环不修改数据库 schema、公开 API 或真实外部系统，无数据迁移回滚步骤。
