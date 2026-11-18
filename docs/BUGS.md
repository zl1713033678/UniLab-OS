# UniLab-OS 活跃缺陷追踪台账 (`BUGS.md`)

> **维护契约**：
> 1. 本台账仅保留**当前尚未修复（`OPEN` / `IN_PROGRESS`）**的真实代码审计缺陷；修复并验通后移入 [`CHANGELOG.md`](../CHANGELOG.md)。
> 2. 修复必须遵循 **「先写失败测试复现 (Red) → 最小原子化修复 (Green) → 回归通过 → 清零归档」** 闭环。
> 3. **严重度定义**：`S0`（越权接管 / 资损 / 数据损坏）｜ `S1`（主流程算错 / 并发丢更新）｜ `S2`（边缘偏差 / 过渡简化）｜ `S3`（UI/体验瑕疵）。

---

## 活跃缺陷总表

| 编号 | 级别 | 所属模块 | 缺陷描述与触发证据 | 代码坐标 | 状态 |
| :--- | :---: | :--- | :--- | :--- | :---: |
| **`BUG-001`** | **S0** | 认证与鉴权 | 登录接口存在 `req.password != "123456"` 万能兜底，且明文对比 `password_hash`；返回的 `token` 未在后续路由做 `Authorization: Bearer` 校验，所有业务接口直接信任请求参数中的 `operator_user_id`（生产上线前必须阻断） | `backend/main.py:588-604` | `OPEN` |
| **`BUG-002`** | **S0** | 自助注册权限 | `auth_register` 允许注册请求直接传入 `system_role="ADMIN"` 并立即以 `ACTIVE` 状态写入，未做管理员审批或角色白名单降级限制 | `backend/main.py:643-656` | `OPEN` |
| **`BUG-003`** | **S1** | 角色权限配置 | 前端「权限管理」页签中的细粒度复选框矩阵（`INITIAL_ROLES_CONFIG`）仅更新前端 React 状态，刷新页面即重置，未持久化到后端数据库也未参与后端接口鉴权 | `frontend/src/App.jsx:51-165` | `OPEN` |
| **`BUG-004`** | **S2** | 质量与并发 | 仓库尚无自动化单元/集成测试，预约冲突检测与 `billing_engine.py` 扣费在 SQLite 默认隔离下未加显式行锁（PostgreSQL 切换时需配合 `SELECT ... FOR UPDATE`） | `backend/billing_engine.py:133-206` | `OPEN` |
