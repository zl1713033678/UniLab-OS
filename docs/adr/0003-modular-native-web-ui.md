# ADR-0003：前端模块化拆分与原生 Web 顶层交互/无障碍规范

- **状态**：已采纳（Accepted）
- **日期**：2026-11-18
- **关联代码**：`frontend/src/App.jsx`, `frontend/src/components/ui/*`, `frontend/src/modules/*`, `frontend/src/index.css`

## 1. 背景与问题（Context）
重构前 `frontend/src/App.jsx` 单文件高达 5,778 行，10 大模块视图全部耦合；全站 10 处删除/撤回操作无确认保护，95 个表单 `<label>` 未绑定 `htmlFor`，且使用非标准 `::-webkit-scrollbar` 与全局 `bg-slate-950` 冲突底色。

## 2. 核心决策（Decision）
1. **按业务域模块化拆分**：拆分为 `src/api/client.js`（含 `/ws/lab-status` 自动重连）、`src/components/AuthView.jsx`、`src/components/ui/` 基础原语与 `src/modules/` 10 个独立业务视图，并将初始入口调整为认证门户（`sessionStorage` 保持刷新会话）。
2. **优先使用浏览器原生顶层原语**：采用原生 `<dialog>` + `showModal()` 实现 `ConfirmDialog` 与移动端 `ResponsiveDrawer`，采用 `popover="manual"` + `aria-live` 实现 `ToastRegion`，避免手写焦点陷阱与 `z-index` 堆叠冲突。
3. **强制现代 Web 标准**：表单采用 `htmlFor`/`id`、`autocomplete` 与交互后 `:user-invalid`；表格补齐 `<caption>`、`<th scope>` 与吸顶表头；滚动条采用标准 `scrollbar-color`/`scrollbar-width` 并将 WebKit 回退隔离在 `@supports not (scrollbar-color: auto)` 中。

## 3. 后果与权衡（Consequences）
- **收益**：`modern-web-guidance legacy-scan` 复扫 0 告警，危险操作防误触、键盘可达性与重渲染性能显著提升。
- **代价与约束**：`frontend/src/App.jsx` 仍保留统一引导数据状态树与处理器回调，后续若需独立按需路由懒加载可在此基础上进一步拆出状态容器。
