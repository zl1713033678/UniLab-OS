# UniLab-OS 当前工程状态快照 (Single Source of Truth)

> **最后更新**：`2026-11-18` ｜ **当前基线**：`release-2.25.0` ｜ **版本库**：`main` ｜ **自动化测试**：`尚无 pytest/vitest 套件（仅构建+TestClient探活+legacy-scan）`
> **维护规则**：本文件采用**覆写式更新**（上限 80 行），客观反映当前代码库的真伪成熟度边界与下一步焦点。

---

## 1. 模块成熟度真伪矩阵 (Truth Matrix)

> **成熟度定义**：`L1 [Demo模拟]` ｜ `L1.5 [混合原型]` ｜ `L2 [逻辑闭环]` ｜ `L3 [测试加固]` ｜ `L4 [生产就绪]`

| 模块 | 等级 | 已真实落地并验证的能力 (Real & Verified) | 仍属演示模拟或待补齐缺口 (Mock / Gap) |
| :--- | :---: | :--- | :--- |
| **认证与多层级 RBAC** | **L1.5** | 前后端多层级权限判定、账号登录/注册、内置角色体验与 `sessionStorage` 会话保持 | `backend/main.py` 明文比对且兜底 `123456`、未校验 `Bearer JWT` 中间件、注册可选 `ADMIN`（见 `BUGS.md`）；前端权限矩阵勾选仅存本地状态 |
| **组织与跨科项目** | **L2** | 四级组织树、项目预算/冻结/可用余额、成员白名单与配额上限、删除前挂载阻断 | 组织上级路径部分展示文案仍拼接固定前缀；缺并发悲观/乐观锁 |
| **FMS 仪器调度与平面图** | **L2** | 时段冲突检测、双费率计算、`HOLD`/`SETTLE_FMS`/`REFUND`、2D 平面图与 `/ws/lab-status` 实时同步 | 尚无日/周甘特图视图；无自动化并发预约回归测试 |
| **LIMS 送检与耗材** | **L2** | 条码生成、即时记账、安全库存预警、COA 报告签发与保密隔离、待检撤回退费 | COA 指标目前为 JSON 文本录入，未接入 MinIO/本地原始谱图文件存储 |
| **ELN 电子实验记录** | **L2** | Markdown 记录、关联机时与样品自动汇总总成本、电子签名锁定、PI/超管解锁与保密隔离 | 缺少富文本/附件上传与审计历史版本 diff |
| **复式财务引擎** | **L2** | `Numeric(12,4)` 定点数核算、Append-Only `BillingLedger`、`idempotency_key` 防重与科室产值汇总 | 账本余额更新依赖单实例事务，高并发下未加行级锁或 Hypothesis 属性测试 |
| **IoT 与 ERP 外部网关** | **L1.5** | 4 个 `/api/v1/ext/*` 真实接口、`X-Lab-Hardware-Token` 鉴权、`seq_id` 防重放与门禁状态机联动 | 无真实物理硬件接入验证，前端门禁模块为硬件报文模拟器；`seq_id` 默认令牌为演示值 |
| **现代 Web 前端工程** | **L2** | 10 模块拆分、`ConfirmDialog`/`ToastRegion`/无障碍表单与表格、`legacy-scan` 0 告警、Vite 构建通过 | 尚无 Vitest / Playwright 端到端自动化测试 |

---

## 2. 质量、底座与孵化池状态

- **数据与运行底座**：默认本地 SQLite（`unilab_os.db`，未纳入 Git），支持 `DATABASE_URL` 切换 PostgreSQL；`frontend/dist` 已编译就绪并由 FastAPI 单端口托管。
- **活跃缺陷单**：`S0 = 2`、`S1 = 1`、`S2 = 1`（审计确认未修项详见 [`docs/BUGS.md`](./BUGS.md)）。
- **待孵化特性池**：共 `3` 项处于 `📝 PLANNED` 待命态（详见 [`docs/specs/README.md`](./specs/README.md)）。

---

## 3. 下一步高优行动清单 (Next 3 Priorities)

1. **[P0 安全止血]**：修复 `BUG-001` 与 `BUG-002`，移除通用密码 `123456` 后门、限制注册默认角色并接入统一 `Authorization: Bearer` 鉴权（对应 [`SPEC-001`](./specs/SPEC-001-jwt-auth-hardening.md)）。
2. **[P1 质量加固]**：引入 `pytest` + `Hypothesis` 补齐 `billing_engine.py` 账本守恒律属性测试、RBAC 越权测试与并发预约锁验证（对应 `BUG-004`）。
3. **[按需特性孵化]**：在获准开发后按 [`SPEC-002`](./specs/SPEC-002-reservation-gantt-view.md) 与 [`SPEC-003`](./specs/SPEC-003-object-storage-attachments.md) 推进预约甘特图与附件存储。
