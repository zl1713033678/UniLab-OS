# Changelog · 版本演进与修复归档

本项目的重要功能里程碑与已完成的安全、逻辑、UI 重构均归档于此。当前活跃未修缺陷请查阅 [`docs/BUGS.md`](./docs/BUGS.md)。

---

## [2.0.0] - 2026-11-18

### Added
- **1F/2F/3F SVG 数字孪生平面图与房间空间拓扑（融合 `Lab_Device_System` 设计）**：
  - 新增 [`LabRoom`](./backend/models.py) 与 `Device` 空间遥测字段（`room_id`、`voltage`、`last_seen_at`、`is_online`、`telemetry_source`），通过 `ensure_schema_columns()` 平滑兼容旧数据库升级。
  - 前端 `EquipmentsView` 的「实验室平面图监控」升级为 [`FloorplanTwin.jsx`](./frontend/src/components/FloorplanTwin.jsx)，提供 1F/2F/3F 分层架构图、缩放复位、真电流热力透视、🔓 房间拖拽持久化、底部负荷 Dock、非模态右侧设备抽屉与未知硬件自动发现 `<dialog>` 向导。
- **可配置的 5 级权限可视界面层级（超级管理员系统设置）**：
  - 在 `RolesView`（「系统设置与多级权限中心」）新增「权限可视界面设置」与「硬件接入系统设置」，允许 `ADMIN` 为 `DEPT_HEAD`/`PI`/`STAFF`/`OBSERVER` 独立勾选可见菜单、平面图操作能力（科室范围、遥测、热力、房间拖拽、状态切换、硬件纳管）与财务/组织/导出区域。
  - 前端 [`App.jsx`](./frontend/src/App.jsx) 依据 `SystemSetting` 持久化策略动态裁剪侧边栏主模块、快捷入口、项目余额卡片、顶部「系统设置」及各子模块操作控件。
- **ESP32 硬件网关融合、后台巡检与多表报表**：
  - 新增兼容接口 `POST /api/v1/telemetry/ingest`（支持 `raw_data.current` 回填、施密特迟滞、`FAULT` 人工锁保护与未知设备自动发现），`lifespan` 异步心跳离线巡检（3s 间隔，分离 `is_online` 与预约业务态）及可选 `zeroconf` (`smartlab.local`) mDNS 服务广播。
  - 新增 `GET /api/v1/reports/usage`、防公式注入 CSV 导出（`/api/v1/reports/export-csv`）及 3-Sheet 样式化 Excel 导出（`/api/v1/reports/export-excel`）；在 [`EntranceView.jsx`](./frontend/src/modules/EntranceView.jsx) 增加 ESP32 节点心跳与审计流水面板，并迁入脱敏固件模板 [`hardware/esp32/main/main.ino`](./hardware/esp32/main/main.ino) 与 [`hardware/simulate_esp32.py`](./hardware/simulate_esp32.py)。
  - 新增 [`backend/test_fusion.py`](./backend/test_fusion.py) 覆盖 5 项回归验证并全部通过。

### Fixed
- **`BUG-003`（权限矩阵持久化与真实效用缺失）**：将「系统设置与权限」中的角色可视策略及操作权限矩阵持久化至 `SystemSetting` 表，接入 `/ws/lab-status` 实时广播并在前后两端强制执行可见与写操作约束。
- **规避原 `Lab_Device_System` 遗留缺陷**：彻底隔离 `1F`/`2F`/`3F` 房间数据并使锁定态直接读取真实持久坐标（`BUG-006`）；基于设备实测电流计算负荷热力（`BUG-007`）；实现 CSV/Excel 单元格公式注入转义（`BUG-008`）；移除固件中的硬编码内网 IP 与明文 Wi-Fi 凭证（`BUG-001`）。

---

## [Unreleased] - 2026-11-18

### Changed
- **前端现代化全面重构（`frontend/`）**：
  - 将 5,778 行单文件 `App.jsx` 拆分为 `src/api/client.js`、`src/components/AuthView.jsx`、`src/components/ui/*` 原语与 `src/modules/*` 10 个独立业务模块视图。
  - 将初始进入状态调整为现代化科研登录门户（支持密码显示切换、内置角色一键登录、`sessionStorage` 刷新保持与一键直达工作台）。
  - 接入 `/ws/lab-status` 自动重连 WebSocket 同步设备状态与实时电流。
- **文档治理体系升级（Docs-as-Code）**：
  - 按五层结构建立 `README.md`、`AGENTS.md`、`docs/STATUS.md`、`docs/BUGS.md`、`docs/adr/`、`docs/specs/`、`docs/guides/` 与 `CHANGELOG.md`，补充 `.env.example` 与 `.gitignore` 规则。

### Fixed & Accessibility
- **Dangerous Actions Gate**：为 10 处删除/撤回退费操作统一接入原生 `<dialog>` 模态确认框（`ConfirmDialog`），默认聚焦安全取消按钮。
- **Legacy Scan Clean**：补齐登录/注册表单 `autocomplete` 属性、95+ 表单控件 `htmlFor`/`id` 关联、`:user-invalid` 交互后验证、标准 `scrollbar-color`/`scrollbar-width`（隔离 WebKit `@supports` 回退）、顶层 `popover="manual"` 通知与 `aria-live` 播报、WAI-ARIA `TabBar` 与语义化 `DataTableShell`。
- **Visual & Print**：修复 `index.html` 深色 `<body>` 闪烁冲突，新增移动端原生抽屉 `ResponsiveDrawer`、`@media print` 报表打印样式与长表格 `content-visibility: auto` 优化。

---

## [1.0.0] - 2026-11-11

### Added
- **单端口内网一体化部署**（`0212803`, `4b68dc2`, `95b7dcd`）：支持前端相对 `API_BASE`、`frontend/dist` 静态托管、`deploy_intranet.ps1` 一键编译上线与 `stop_service.ps1` 服务关停脚本。
- **LIMS 高密度管理界面与全 CRUD 闭环**（`55e3cdc`）：完成多层级组织架构、跨科项目配额、仪器设备、预约取消解冻退费、耗材补货、样品撤回退费、ELN 编辑/锁定/解锁与交接文档。
- **核心业务与物联网网关底座**（`43ed486`）：上线 FastAPI + SQLAlchemy 2.0 `Numeric(12,4)` 定点数模型、复式记账引擎、`X-Lab-Hardware-Token` 硬件/ERP 网关与 WebSocket 广播。
