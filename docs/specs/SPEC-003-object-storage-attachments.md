# SPEC-003 · LIMS 谱图与 ELN 实验附件对象存储集成

- **状态**：`📝 规划中 (PLANNED) — 仅沉淀开发思路，暂不执行代码`
- **提出时间**：`2026-10-19 17:03:00+08:00`
- **开发完成时间**：`[待开发完成后回填 YYYY-MM-DD HH:mm:ss+08:00]`
- **原始需求描述**：
  > 在 LIMS 样品 COA 报告与 ELN 实验记录中接入 MinIO / 本地对象存储，支持 PDF 报告、RAW 原始谱图文件与实验附图的安全上传下载。

---

## 1. 业务痛点与核心场景拆解
1. 当前 `Sample.coa_metrics_json` 与 `ELNRecord.markdown_content` 仅支持纯文本与 JSON 结构，无法挂载质谱/电镜原始大图与签章 PDF。
2. 保密项目的附件下载必须严格受项目白名单隔离保护，不可直接暴露静态公开 URL。

## 2. 架构与安全设计
- **存储抽象**：新增 `Attachment` 模型记录 `object_key`、`sha256`、`mime_type`、`size_bytes` 与归属 `project_id`。
- **防越权下载**：通过受控鉴权接口 `/api/v1/attachments/{id}/download` 校验项目保密白名单后流式输出或签发短效预签名 URL；禁止按文件名直接公开访问。
- **前端上传约束**：支持拖拽/选择上传、文件大小/扩展名提示与上传进度条（`<progress>`）。

## 3. 分阶段实施路线图
- [ ] **Phase 1：后端 `Attachment` 模型与本地/MinIO 存储适配器**
- [ ] **Phase 2：LIMS COA 与 ELN 编辑页集成附件上传、预览与保密鉴权下载**
