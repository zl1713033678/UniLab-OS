# UniLab-OS · 大型仪器共享与综合实验室管理系统

**UniLab-OS** 是面向科研院所与高校集约化中心构建的综合实验室管理系统，打通 **FMS（机时调度与边缘电流监控）**、**LIMS（样品送检与耗材库存）**、**ELN（电子实验记录与保密隔离）**、**多层级 RBAC** 与 **定点数复式财务核算**。

## 1. 核心架构速览

- **后端（`backend/`）**：FastAPI + SQLAlchemy 2.0 + WebSocket（`/ws/lab-status`），强制使用 `Numeric(12, 4)` 定点数与 `idempotency_key` 幂等复式账本。
- **前端（`frontend/`）**：React 18 + Vite 5 + Tailwind CSS 模块化应用（`src/api/`、`src/components/ui/`、`src/modules/`），采用原生 `<dialog>`、`popover="manual"` 与 WAI-ARIA 规范，支持内置角色快捷体验（默认密码 `123456`）。
- **外部网关（`backend/external_gateway.py`）**：提供 ESP32 电流遥测、RFID 刷卡开机、分析仪器谱图回传与 ERP 经费拨款同步接口（`/api/v1/ext/*`）。

## 2. 快速启动与关停

### 方式 A：单端口内网一体化模式（`0.0.0.0:8000`）

```powershell
# 编译前端并拉起 8000 单端口服务（首次内网放行需管理员放通 8000 TCP 端口）
.\deploy_intranet.ps1

# 仅拉起后端（frontend/dist 已存在时）
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000

# 一键停止 8000 / 5173 后台进程
.\stop_service.ps1
```

### 方式 B：双端口开发调试模式（`8000` + `5173`）

```powershell
pip install -r backend/requirements.txt
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload

cd frontend
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```

- Web 工作台：`http://127.0.0.1:8000`（开发模式 `http://127.0.0.1:5173`）｜ Swagger API：`http://127.0.0.1:8000/docs`

## 3. 环境变量配置速查（见 [`.env.example`](./.env.example)）

| 环境变量 | 默认值 | 说明 |
| :--- | :--- | :--- |
| `DATABASE_URL` | `sqlite:///./unilab_os.db` | SQLAlchemy 连接串，生产可切换 PostgreSQL |
| `LAB_HARDWARE_TOKEN` | `UNILAB_HW_SECRET_2026` | 外部硬件与 ERP 网关 `X-Lab-Hardware-Token` 密钥 |
| `VITE_API_BASE` | `""`（空，走相对路径） | 前端接口基地址，同源单端口部署保持空值 |

## 4. 项目文档导航地图

| 文档路径 | 用途与目标读者 |
| :--- | :--- |
| [`AGENTS.md`](./AGENTS.md) | **研发与 AI 协作宪章**：代码地图、领域红线、Spec/Bug 门禁与验证命令 |
| [`docs/STATUS.md`](./docs/STATUS.md) | **实时状态快照**：各模块真实成熟度矩阵（L1~L4）与下一步高优焦点 |
| [`docs/BUGS.md`](./docs/BUGS.md) | **活跃缺陷台账**：代码审计发现的未修缺陷与精确坐标 |
| [`docs/adr/`](./docs/adr/0001-double-entry-fixed-point-billing.md) | **架构决策记录 (ADR)**：核心技术选型背景、决策与权衡 |
| [`docs/specs/`](./docs/specs/README.md) | **特性孵化器 (Specs)**：待孵化特性设计台账（未经指令不写业务代码） |
| [`docs/guides/SYSTEM_MANUAL.md`](./docs/guides/SYSTEM_MANUAL.md) | **系统功能与运维手册**：业务规则、RBAC 权限矩阵与内网部署指南 |
| [`docs/guides/HARDWARE_INTEGRATION_SPEC.md`](./docs/guides/HARDWARE_INTEGRATION_SPEC.md) | **硬件与 ERP 网关规范**：ESP32 / RFID / 仪器 Agent / ERP 接口契约 |
| [`CHANGELOG.md`](./CHANGELOG.md) | **版本演进归档**：历史里程碑与已闭环改造记录 |
