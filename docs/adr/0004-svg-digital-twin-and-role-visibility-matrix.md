# ADR-0004: 实验室 SVG 数字孪生平面图与可配置角色可视界面分层

- **状态**: `Accepted`
- **日期**: `2026-11-18`

## 1. 背景 (Context)
`UniLab-OS` 原有 2D 平面图仅用静态定位卡片展示设备，缺乏楼层/房间拓扑、能量负荷透视与物理空间拖拽管理；同时前端 10 个主模块向所有角色一视同仁暴露，超级管理员无法按实验室管理制度动态调整不同职级的可视页面内容。

参考 `Lab_Device_System` 的原生 SVG 蓝图、ESP32+mDNS 硬件自发现与后台报表方案时，同时需规避其原有缺陷（如 `1F/2F/3F` 房间未隔离、锁定态回退固定坐标、硬编码伪电流与无鉴权写接口）。

## 2. 决策 (Decision)
1. **独立 `LabRoom` 模型与楼层隔离 SVG 蓝图**：在 `backend/models.py` 增加 `LabRoom(floor, pos_x, pos_y, width, height, power_capacity_amps)` 并绑定 `Device.room_id`，在 `FloorplanTwin.jsx` 无论锁定或编辑态统一读取持久化坐标，依据真实 `current_amps` 渲染负荷条与热力图层。
2. **双路由共存的硬件遥测网关**：保留 `/api/v1/ext/iot/telemetry` 严格预约管控流，同时提供兼容 ESP32+ACS712 的 `/api/v1/telemetry/ingest`（默认强制校验 `X-Lab-Hardware-Token`，可在系统设置临时切换调试开关），支持 `raw_data.current` 优先回填、施密特迟滞、人工 `FAULT` 锁保护与未知节点自动发现。
3. **超管可配置的多级界面可视策略 (`SystemSetting`)**：将 5 级权限（`ADMIN`/`DEPT_HEAD`/`PI`/`STAFF`/`OBSERVER`）的模块菜单、平面图交互权限与敏感财务区可见性抽象为 JSON 策略存入 SQLite，通过 `/api/v1/system/visibility-policies`（仅 `ADMIN`）保存并经 `/ws/lab-status` 实时同步。

## 3. 后果 (Consequences)
- **正面影响**：既有 `unilab_os.db` 可通过 `ensure_schema_columns()` 无损自动补齐房间与遥测字段；超级管理员可即时调整不同角色的工作台可见范围且受 `ADMIN` 防锁死规则保护；所有关键行为已纳入 `backend/test_fusion.py` 自动化验证。
- **权衡与限制**：前端可见性裁剪主要承担界面降噪与操作分流职责，后端所有写路由与保密 ELN/COA 查询依然各自执行强制 RBAC 判定，后续仍须按 `SPEC-001` 推进 `Bearer JWT` 中间件改造。
