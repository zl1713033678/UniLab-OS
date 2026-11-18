# UniLab-OS · 特性孵化器与设计台账 (`docs/specs/`)

> **强制维护契约（Mandatory Maintenance Protocol）**
> 1. **只记思路、按需孵化**：一特性一独立 `SPEC-XXX.md` 文件。新想法在此沉淀业务场景、接口与方案设计，**未经明确指令严禁编写或改动业务代码**。
> 2. **完成状态与时间戳强制回写**：某项特性获准开发并验收通过后，**必须同步更新本索引表及对应 Spec 头部**，回填精确完成时间戳（`YYYY-MM-DD HH:mm:ss+08:00`）与关联代码，并刷新 [`docs/STATUS.md`](../STATUS.md)。

---

## 特性孵化总览索引表 (Spec Backlog Index)

| 编号 | 特性文档 | 核心目标摘要 | 提出日期 | 当前状态 | 完成时间戳 | 关联代码/备注 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`SPEC-001`** | [`SPEC-001-jwt-auth-hardening.md`](./SPEC-001-jwt-auth-hardening.md) | 真实密码哈希、Bearer JWT 中间件与角色权限持久化加固 | `2026-10-19` | `📝 规划中 (PLANNED)` | *待落地后回填* | 关联 `BUG-001` / `BUG-002` / `BUG-003` |
| **`SPEC-002`** | [`SPEC-002-reservation-gantt-view.md`](./SPEC-002-reservation-gantt-view.md) | 仪器预约日/周时间轴甘特图视图与拖拽排班交互 | `2026-10-19` | `📝 规划中 (PLANNED)` | *待落地后回填* | 源自原 `HANDOFF.md` 迭代建议 |
| **`SPEC-003`** | [`SPEC-003-object-storage-attachments.md`](./SPEC-003-object-storage-attachments.md) | LIMS 原始谱图与 ELN 实验附件接入 MinIO / 本地对象存储 | `2026-10-19` | `📝 规划中 (PLANNED)` | *待落地后回填* | 源自原 `HANDOFF.md` 迭代建议 |
