# UniLab-OS · 大型仪器共享与综合实验室管理系统

**UniLab-OS** 是一套面向科研院所与高校集约化中心构建的 **大型仪器共享与综合实验室管理系统**，融合了 **FMS（仪器机时调度与边缘电流监控）**、**LIMS（样品送检流转与试剂耗材管理）**、**ELN（电子实验记录本与保密隔离）**、**多层级矩阵式 RBAC 权限管理** 以及 **不可篡改复式财务核算引擎**。

---

## 核心特性

### 1. 四级组织架构与跨科项目矩阵
- **四级组织体系**：支持 `一级总院/所内用户 » 二级行政科室 » 三级课题组/专业实验室 » 四级人员` 的多级组织管理与路径筛选。
- **资产与经费分离核算**：
  - **行政科室（Department）**：负责人员归属、仪器设备资产归口、耗材管理，并作为内部跨科结算的受益方（贷方）。
  - **跨科项目组（Project）**：负责经费预算、预授权冻结（Hold）、个人消费配额上限（`spending_limit`）控制与科研数据保密隔离，作为结算付款方（借方）。

### 2. 多层级 RBAC 权限与全生命周期增删改查 (CRUD)
- 内置 5 级角色体系：**平台负责人/超级管理员 (`ADMIN`)**、**科室主任 (`DEPT_HEAD`)**、**课题组负责人 (`PI`)**、**所内职工/仪器管理员 (`STAFF`)**、**观察员 (`OBSERVER`)**。
- 支持对 **组织机构、课题组项目、成员配额、人员档案、仪器设备、机时预约（含取消解冻退费）、试剂耗材（含库存补货与调价）、送检样品（含撤回退费）、ELN 实验记录（含签名锁定与 PI/超管解锁）** 的完整增删改查权限分级控制。
- **跨科保密数据隔离**：对启用保密隔离的项目，即使某员工所属行政科室的科主任（`DEPT_HEAD`）也无法越权查阅其未加入项目的 ELN 正文与 LIMS 原始检测谱图（COA）。

### 3. 差异化双费率与复式记账引擎
- **科内/跨科双费率自动判定**：操作人所属行政科室与资源（仪器/承检室/耗材）归口科室一致时自动执行 **科内优惠价 (`INTERNAL`)**，跨科借用时自动执行 **跨科协同标准价 (`EXTERNAL`)**。
- **高精度定点数核算**：所有金额、单价、配额及电流数值强制采用 `Numeric(12, 4)` 定点数，杜绝浮点精度误差。
- **机时预授权冻结与多退少补**：
  - 预约时按 `预约时长 × 适用单价` 自动冻结项目可用余额与个人配额（`HOLD`）。
  - 下机结算按 `max(预约时长 × 爽约惩罚系数 0.5, 实际高负载有效机时) × 适用单价` 实扣（`SETTLE_FMS`），并自动原路解冻退回多余冻结款（`REFUND`）。

### 4. 物联网硬件与外部 ERP 标准网关
- 内置 `X-Lab-Hardware-Token` 硬件鉴权与 `seq_id` 全局防重放幂等控制：
  - **ESP32 智能插座电流遥测上报**：`POST /api/v1/ext/iot/telemetry`
  - **RFID 终端读卡器刷卡开机核验**：`POST /api/v1/ext/access/rfid-verify`
  - **大型分析仪器本地 Agent 谱图回传**：`POST /api/v1/ext/lims/instrument-ingest`
  - **外部财务 ERP 经费拨款入账同步**：`POST /api/v1/ext/erp/grant-deposit`

---

## 快速开始

### 环境要求
- **Python**: 3.10+
- **Node.js**: 18.0+

### 1. 启动后端服务 (FastAPI)
```bash
# 在项目根目录下安装依赖
pip install -r backend/requirements.txt

# 启动后端服务 (首次启动将自动创建 SQLite 数据库并写入演示种子数据)
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
```
- 后端 API 地址：`http://127.0.0.1:8000`
- Swagger 交互文档：`http://127.0.0.1:8000/docs`

### 2. 启动前端服务 (React + Vite)
```bash
cd frontend
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```
- 前端管理界面：`http://127.0.0.1:5173`

---

## 内置演示账号

所有内置演示账号默认登录密码均为：`123456`（支持在登录页一键切换，或在系统右上角切换当前身份）：

| 登录账号 | 姓名 | 系统角色 | 所属行政科室 | 三级课题组 | 权限说明 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `admin` | 林总工 | `ADMIN` | 公共精密分析测试中心 | 平台中枢管理组 | 平台负责人/超级管理员，拥有全量增删改查权限 |
| `pi_zhang` | 张教授 | `DEPT_HEAD` | 先进材料与微纳加工室 | 超精密微纳加工组 | 材料室主任兼保密项目 `PRJ-2026-01` 负责人(PI) |
| `head_wang` | 王主任 | `DEPT_HEAD` | 生物医药与合成生物学室 | 合成生物学科研室 | 生医室科主任（非 `PRJ-2026-01` 成员，可验证跨科保密拦截） |
| `chen_res` | 陈博士 | `STAFF` | 生物医药与合成生物学室 | 纳米递送载体课题组 | 生医室骨干实验员（跨科加入 `PRJ-2026-01`） |
| `liu_ana` | 刘工 | `STAFF` | 公共精密分析测试中心 | 质谱与联用表征组 | 分析中心工程师（`PRJ-2026-02` 负责人） |

---

## 目录结构与文档索引

```text
UniLab-OS/
├── README.md                         # 项目总览与快速启动说明
├── HANDOFF.md                        # 项目交接文档與架构清单
├── docs/
│   ├── SYSTEM_MANUAL.md              # 系统功能手册与多层级增删改查权限矩阵
│   └── HARDWARE_INTEGRATION_SPEC.md  # 物联网硬件与外部 ERP 接口规范说明
├── backend/
│   ├── models.py                     # SQLAlchemy 2.0 数据库模型
│   ├── billing_engine.py             # 复式记账、预授权冻结与跨科双费率结算引擎
│   ├── external_gateway.py           # 物联网边缘硬件与 ERP 接入网关
│   ├── main.py                       # FastAPI 应用入口、RBAC 权限校验与业务路由
│   └── requirements.txt              # 后端依赖列表
└── frontend/
    ├── src/
    │   ├── App.jsx                   # 应用式 LIMS 管理系统主界面
    │   ├── permissions.js            # 前端多层级 RBAC 权限判定工具
    │   ├── index.css                 # 全局样式定义
    │   └── main.jsx                  # 前端入口
    ├── package.json
    └── vite.config.js
```

更多详细业务规则与接口契约请参阅：
- [系统功能与权限管理手册 (`docs/SYSTEM_MANUAL.md`)](./docs/SYSTEM_MANUAL.md)
- [物联网硬件与第三方网关规范 (`docs/HARDWARE_INTEGRATION_SPEC.md`)](./docs/HARDWARE_INTEGRATION_SPEC.md)
- [项目交接文档 (`HANDOFF.md`)](./HANDOFF.md)
