# Changelog · 版本演进与修复归档

本项目的重要功能里程碑与已完成的安全、逻辑、UI 重构均归档于此。当前活跃未修缺陷请查阅 [`docs/BUGS.md`](./docs/BUGS.md)。

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
