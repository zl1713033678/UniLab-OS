# UniLab-OS 当前工程状态快照 (Single Source of Truth)

> **最后更新**：`2026-11-18` ｜ **当前基线**：`release-2.30.0` ｜ **版本库**：`main` ｜ **自动化测试**：`backend/test_fusion.py (5/5 通过) + Vite Build + legacy-scan`
> **维护规则**：本文件采用**覆写式更新**（上限 80 行），客观反映当前代码库的真伪成熟度边界与下一步焦点。

---

## 1. 模块成熟度真伪矩阵 (Truth Matrix)

> **成熟度定义**：`L1 [Demo模拟]` ｜ `L1.5 [混合原型]` ｜ `L2 [逻辑闭环]` ｜ `L3 [测试加固]` ｜ `L4 [生产就绪]`

| 模块 | 等级 | 已真实落地并验证的能力 (Real & Verified) | 仍属演示模拟或待补齐缺口 (Mock / Gap) |
| :--- | :---: | :--- | :--- |
| **认证与可配置多级 RBAC** | **L2** | 5 级角色界面可视裁剪与「系统设置->权限可视界面设置」`SystemSetting` 持久化 + WS 同步、`ADMIN` 防锁死、`test_fusion.py` 越权验证 | `backend/main.py` 登录保留 `123456` 演示兜底、缺全量 `Bearer JWT` 中间件、注册可选 `ADMIN`（见 `BUGS.md`） |
| **1F/2F/3F 数字孪生平面图与房间** | **L3** | SVG 1F/2F/3F 楼层隔离、`LabRoom` CRUD 与拖拽持久化、真电流热力透视、抽屉人工切态/`FAULT` 锁、`test_fusion.py` 全覆盖 | 缺少房间尺寸（宽高）在线可视化拉伸；跨楼层设备拖拽需通过编辑表单修改 |
| **组织与跨科项目** | **L2** | 四级组织树、项目预算/冻结/可用余额、成员白名单与配额上限、删除前挂载阻断 | 组织上级路径部分展示文案仍拼接固定前缀；缺并发悲观/乐观锁 |
| **FMS 调度与履历报表导出** | **L2.5** | 时段冲突检测、双费率计费、`DeviceUsageLog` 会话统计、防公式注入 CSV 与 3-Sheet 样式化 Excel 导出 | 尚无日/周甘特图视图；并发预约缺行级锁保护 |
| **ESP32 / IoT 与 ERP 外部网关** | **L2** | `/api/v1/ext/*` 严格鉴权 + `/api/v1/telemetry/ingest` 兼容接入、`raw_data.current` 回填、施密特迟滞、10s 心跳离线巡检、mDNS 广播与未知设备自动发现 | `hardware/esp32/main/main.ino` 为脱敏编译模板（未实机烧录），默认依赖硬件调试开关或演示 Token |
| **LIMS 送检与耗材 / ELN** | **L2** | 条码即时记账、COA/ELN 跨科保密隔离、关联机时/样品成本汇总、电子签名锁定与解锁 | COA 指标为 JSON 文本录入，未接入对象存储原始谱图附件 |
| **复式财务引擎** | **L2** | `Numeric(12,4)` 定点数核算、Append-Only `BillingLedger`、`idempotency_key` 防重与科室产值汇总 | 账本余额更新依赖单实例事务，缺少行级锁与 Hypothesis 守恒律属性测试 |
| **现代 Web 前端工程** | **L2.5** | 10 模块拆分 + `FloorplanTwin`、原生 `<dialog>`/`role="toolbar"`+`focusgroup`/无障碍抽屉、`legacy-scan` 与 `vite build` 清洁通过 | 尚无 Vitest / Playwright 浏览器端到端 UI 自动化测试 |

---

## 2. 质量、底座与孵化池状态

- **数据与运行底座**：默认本地 SQLite（`unilab_os.db`，未纳入 Git），支持 `DATABASE_URL` 切换 PostgreSQL；`ensure_schema_columns()` 自动兼容旧库平滑迁移房间与遥测字段；`frontend/dist` 已编译就绪并由 FastAPI 单端口托管。
- **活跃缺陷单**：`S0 = 2`、`S1 = 0`、`S2 = 1`（`BUG-003` 已修复归档，其余见 [`docs/BUGS.md`](./BUGS.md)）。
- **待孵化特性池**：共 `3` 项处于 `📝 PLANNED` 待命态（详见 [`docs/specs/README.md`](./specs/README.md)）。

---

## 3. 下一步高优行动清单 (Next 3 Priorities)

1. **[P0 安全止血]**：修复 `BUG-001` 与 `BUG-002`，移除通用密码 `123456` 后门、限制注册默认角色并接入统一 `Authorization: Bearer` 鉴权（对应 [`SPEC-001`](./specs/SPEC-001-jwt-auth-hardening.md)）。
2. **[P1 财务并发加固]**：补齐 `billing_engine.py` 账本守恒律 Hypothesis 属性测试与 PostgreSQL `SELECT ... FOR UPDATE` 行级锁（对应 `BUG-004`）。
3. **[按需特性孵化]**：在获准开发后按 [`SPEC-002`](./specs/SPEC-002-reservation-gantt-view.md) 与 [`SPEC-003`](./specs/SPEC-003-object-storage-attachments.md) 推进预约甘特图与附件存储。
