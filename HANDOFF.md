# UniLab-OS 项目交接文档 (Handoff Document)

## 1. 项目概述与当前状态
**UniLab-OS** 是一套面向科研院所与高校的大型仪器共享与综合实验室管理系统（FMS + LIMS + ELN + 跨科室复式财务结算 + 物联网硬件网关）。

当前版本已完成以下核心重构与升级：
1. **应用式 LIMS 管理界面重构**：参照科研院所大型仪器共享管理系统（Genee LIMS / CFMS 架构）重构前端界面，去除所有冗余宣传与说明文字，采用纯粹的高密度业务管理视图（顶部紧凑工具栏 + 左侧用户信息卡/列表与图标双模式菜单/课题组余额组件/快捷入口 + 右侧一级/二级页签与数据操作表）。
2. **注册与登录认证体系**：支持账号密码登录、新用户自助注册、新课题组机构注册，并提供内置测试角色一键切换登录。
3. **四级组织架构与跨科项目矩阵**：支持 `一级总院 » 二级行政科室 » 三级课题组 » 四级人员/跨科虚拟项目` 的多层级管理与路径筛选。
4. **全生命周期增删改查（CRUD）与多层级 RBAC 权限控制**：补齐对已有课题组项目、项目成员配额、组织机构、成员账号、仪器设备、机时预约（含取消解冻退费）、耗材库存、送检样品（含撤回退费）、实验记录（含编辑、签名锁定、PI/超管解锁、删除）的完整管理闭环。
5. **独立系统说明文档**：后台业务公式与功能说明已独立整理至 `docs/SYSTEM_MANUAL.md`，硬件对接协议整理于 `docs/HARDWARE_INTEGRATION_SPEC.md`。

---

## 2. 本地启动与运行方式

### 2.1 启动后端 (FastAPI + SQLAlchemy + SQLite)
在 `UniLab-OS` 根目录下执行：
```powershell
pip install -r backend/requirements.txt
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
```
- 后端服务地址：`http://127.0.0.1:8000`
- Swagger API 文档：`http://127.0.0.1:8000/docs`
- 数据库文件：`unilab_os.db`（首次启动自动建表、执行平滑字段迁移并注入演示种子数据）

### 2.2 启动前端 (React 18 + Vite + Tailwind CSS)
在 `UniLab-OS/frontend` 目录下执行：
```powershell
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```
- 前端访问地址：`http://127.0.0.1:5173`

### 2.3 内置测试账号（默认通用密码：`123456`）
| 账号 (`username`) | 姓名 | 系统角色 (`system_role`) | 所属二级行政科室 | 所属三级课题组 | 典型权限特征 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `admin` | 林总工 | `ADMIN` | 公共精密分析测试中心 | 平台中枢管理组 | 平台超级管理员，拥有全量增删改查及跨科保密豁免权 |
| `pi_zhang` | 张教授 | `DEPT_HEAD` / `PI` | 先进材料与微纳加工室 | 超精密微纳加工组 | 材料室主任兼保密项目 `PRJ-2026-01` 负责人(PI) |
| `head_wang` | 王主任 | `DEPT_HEAD` | 生物医药与合成生物学室 | 合成生物学科研室 | 生医室科主任（非 `PRJ-2026-01` 成员，用于验证跨科保密隔离） |
| `chen_res` | 陈博士 | `STAFF` | 生物医药与合成生物学室 | 纳米递送载体课题组 | 生医室骨干实验员（跨科加入 `PRJ-2026-01`，享8000元配额） |
| `liu_ana` | 刘工 | `STAFF` | 公共精密分析测试中心 | 质谱与联用表征组 | 分析中心工程师（`PRJ-2026-01` 只读观察员，`PRJ-2026-02` PI） |

---

## 3. 多层级增删改查 (CRUD) 权限矩阵

前端权限判定逻辑位于 `frontend/src/permissions.js`，后端二次鉴权位于 `backend/main.py` 与 `backend/billing_engine.py`：

| 业务实体 | 添加 / 新建 | 修改已有内容 | 删除 / 取消并退费 |
| :--- | :--- | :--- | :--- |
| **组织机构 (`Department`)** | `ADMIN`、`DEPT_HEAD` | `ADMIN`、本机构或上级 `DEPT_HEAD` | `ADMIN`、上级 `DEPT_HEAD`（存在下属人员/设备/项目时自动阻断保护） |
| **课题组项目 (`Project`)** | `ADMIN`、`DEPT_HEAD`、`PI` | `ADMIN`、该项目 `PI`、依托科室 `DEPT_HEAD` | `ADMIN`、该项目 `PI`（存在未结算预约时自动阻断保护） |
| **项目成员 (`ProjectMember`)** | `ADMIN`、该项目 `PI`、依托科室 `DEPT_HEAD` | `ADMIN`、该项目 `PI`、依托科室 `DEPT_HEAD` | `ADMIN`、该项目 `PI`、依托科室 `DEPT_HEAD`（禁止移除主PI本人） |
| **成员目录 (`User`)** | `ADMIN`、`DEPT_HEAD`、自助注册 | `ADMIN`（所有人）、`DEPT_HEAD`（本科室下属）、本人（基本资料） | `ADMIN`、`DEPT_HEAD`（仅限删除本科室普通成员，不可删本人或管理员） |
| **仪器设备 (`Device`)** | `ADMIN`、归口科室 `DEPT_HEAD` | `ADMIN`、归口科室 `DEPT_HEAD` 及 `STAFF` | `ADMIN`、归口科室 `DEPT_HEAD`（存在未完结预约时自动阻断保护） |
| **机时预约 (`Reservation`)** | 项目白名单非 `OBSERVER` 成员 | 上机签到、填写有效时长下机结算 | **未上机(`RESERVED`)**：本人、项目 `PI`、设备归口 `DEPT_HEAD`、`ADMIN` 均可取消并自动全额解冻退费；**已结算**：仅 `ADMIN` 或设备归口 `DEPT_HEAD` 可删 |
| **试剂耗材 (`Consumable`)** | `ADMIN`、归口科室 `DEPT_HEAD` | `ADMIN`、归口科室 `DEPT_HEAD` 及 `STAFF` | `ADMIN`、归口科室 `DEPT_HEAD` |
| **送检样品 (`Sample`)** | 项目白名单非 `OBSERVER` 成员 | 签发 / 重签 COA 检测报告 | **待检测(`REGISTERED`)**：送检人、项目 `PI`、承检 `DEPT_HEAD`、`ADMIN` 可撤回并自动原路退还检测费；**已完成**：仅 `ADMIN` 可删 |
| **实验记录 (`ELNRecord`)** | 项目白名单非 `OBSERVER` 成员 | **未锁定**：作者、项目 `PI`、`ADMIN` 可编辑；**已锁定**：项目 `PI` 或 `ADMIN` 可解锁 | **未锁定**：作者、项目 `PI`、`ADMIN` 可删；**已锁定**：仅 `ADMIN` 可删 |

---

## 4. 关键代码与目录结构
```text
UniLab-OS/
├── HANDOFF.md                        # 项目交接文档
├── docs/
│   ├── SYSTEM_MANUAL.md              # 系统功能与多层级权限说明手册
│   └── HARDWARE_INTEGRATION_SPEC.md  # 外部物联网硬件与ERP网关接口规范
├── backend/
│   ├── models.py                     # SQLAlchemy 2.0 数据模型 (含多级组织、用户鉴权、定点数账本)
│   ├── billing_engine.py             # 复式记账、预授权冻结(Hold)、多退少补与跨科双费率引擎
│   ├── external_gateway.py           # IoT电流遥测、RFID门禁、仪器Agent、ERP拨款同步网关
│   ├── main.py                       # FastAPI 核心路由、RBAC权限校验、完整CRUD接口及种子数据
│   └── requirements.txt              # Python 依赖清单
└── frontend/
    ├── src/
    │   ├── App.jsx                   # 应用式 LIMS 主界面 (10大业务模块 + 登录注册页)
    │   ├── permissions.js            # 前端多层级 RBAC 与归口范围权限判定工具
    │   ├── index.css                 # 样式与滚动条定义
    │   └── main.jsx                  # React 挂载入口
    ├── package.json
    └── vite.config.js
```

---

## 5. 后续迭代建议
1. **持久化令牌鉴权增强**：目前 `/api/v1/auth/login` 已返回 JWT 格式令牌并在请求中校验 `operator_user_id`；生产环境部署时可进一步将 JWT 放入 `Authorization: Bearer` 中间件统一解析。
2. **预约日历甘特图视图**：可在仪器详情的「使用预约」页签中进一步扩展按日/周展示的时间轴甘特图。
3. **附件与原始谱图文件存储**：可在 LIMS 样品 COA 与 ELN 实验记录中接入 MinIO/本地对象存储以支持 PDF/RAW 谱图文件上传下载。
