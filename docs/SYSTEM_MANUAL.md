# UniLab-OS 大型仪器共享与综合实验室管理系统说明文档

## 1. 系统定位与总体架构
UniLab-OS 面向科研院所与高校大型仪器共享平台，采用 **多层级组织机构管理（所/院 » 集约化中心/科室 » 课题组/实验室）** 与 **跨科室项目经费核算（复式记账）** 相结合的应用管理模式。

### 1.1 四级组织与项目矩阵
1. **一级机构**：所内用户 / 国家重点实验室总院
2. **二级机构（行政科室）**：负责仪器设备资产归口、耗材管理及科室内部/跨科服务产值统计（如：先进材料与微纳加工室、生物医药与合成生物学室、公共精密分析测试中心）。
3. **三级机构（课题组/专业实验室）**：负责人员日常行政归属与实验空间管理。
4. **跨科室项目财务账号（Project）**：负责经费预算、预约预授权冻结（Hold）、成员个人消费配额（`spending_limit`）控制及科研数据保密隔离。

---

## 2. 核心业务模块说明

### 2.1 个人档案 (`!people/profile`)
- 展示成员基本信息、工号/账号、实体 RFID 卡号、所属多级组织机构路径（如：`所内用户 » 集约化中心 » 综合实验中心`）、系统角色标签。
- 四项核心统计指标：**待办事宜**、**授权项目数**、**实验记录数**、**违规总次数**。
- 下设多维业务子标签页：**关注仪器**、**进出/刷卡记录**、**仪器使用**、**仪器预约**、**仪器送样**、**仪器收费**、**项目配额授权**。

### 2.2 仪器目录与机时管理 (`!equipments`)
- **分类筛选**：支持按正常设备、运行中设备、故障设备，以及按归口组织机构、仪器名称/编号检索。
- **差异化双费率自动判定**：
  - 当操作人所属行政科室与仪器归口科室一致时，自动适用 **科内优惠价 (`INTERNAL`)**；
  - 当跨科室预约借用时，自动适用 **跨科协同标准价 (`EXTERNAL`)**。
- **预授权冻结与下机多退少补**：
  - 提交预约时系统自动校验时间段冲突，并按 `预约时长 × 适用单价` 执行项目经费与个人配额冻结（`HOLD`）。
  - 下机结算公式：`实扣金额 = max(预约时长 × 爽约惩罚系数 0.5, 实际高负载有效机时) × 适用单价`，自动退回多余冻结款（`REFUND`）。

### 2.3 测样送检与耗材管理 (`!lims`)
- **样品送检登记**：自动生成全局唯一条码（Barcode），按科内/跨科检测单价实时扣减项目余额并贷记承检科室。
- **测样报告（COA）签发与保密隔离**：支持录入结构化检测指标并签发 `COMPLETED` 报告；对启用保密隔离的项目，非该项目白名单成员（含其他无关行政科主任）访问时自动脱敏隐藏谱图指标。
- **试剂耗材领用**：实时监控库存余量与安全库存阈值预警，扫码领用时按科内/跨科单价实时记账。

### 2.4 课题组与跨科项目目录 (`!labs`)
- 支持查看所有课题组/项目、我的课题组/项目、人员归属及项目成员消费配额（`Numeric(12, 4)` 定点数）。
- 项目负责人（PI）或系统管理员可在项目详情页中添加成员、分配项目内角色（`PI` / `RESEARCHER` / `OBSERVER`）及个人最高消费配额。

### 2.5 成员目录 (`!people/list`)
- 支持按全部成员、已激活成员、科主任/PI、科研人员、观察员分类管理，支持多级组织机构路径筛选、添加新成员及导出 CSV 报表。

### 2.6 财务中心 (`!billing`)
- **财务部门/科室产值**：统计各行政科室的科内自用结算额、跨科创收结算额及累计总产值。
- **财务账号管理**：按课题组/项目展示转入总额（初始预算 + ERP 拨款）、转出总额（预约冻结 + 累计消费）及当前可用余额。
- **不可篡改复式记账明细**：采用 Append-Only 模式记录每笔 `DEPOSIT`、`HOLD`、`SETTLE_FMS`、`SETTLE_LIMS`、`REFUND` 流水，具备全局唯一幂等键（`idempotency_key`）。

### 2.7 实验记录本 (`!eln`)
- 支持 Markdown 实验记录撰写、结构化实验条件存储，并可一键关联 FMS 机时单与 LIMS 送检样品自动汇总单次实验综合成本。
- 支持电子签名锁定（`Sign & Lock`），锁定后不可篡改。

### 2.8 门禁与物联网网关 (`!entrance`)
- 提供四大标准硬件与外部系统接入接口（需携带 `X-Lab-Hardware-Token`）：
  1. `POST /api/v1/ext/iot/telemetry`：ESP32 边缘电流传感器与物理状态上报。
  2. `POST /api/v1/ext/access/rfid-verify`：终端读卡器 RFID 刷卡开机双因子核验。
  3. `POST /api/v1/ext/lims/instrument-ingest`：大型分析仪器本地 Agent 谱图数据自动回传。
  4. `POST /api/v1/ext/erp/grant-deposit`：外部财务 ERP 经费拨款同步入账。

### 2.9 权限管理 (`!roles`) 与多层级增删改查矩阵
- 支持多角色层级配置（`平台负责人/超级管理员`、`科室主任`、`课题组PI`、`仪器负责人/科研人员`、`只读观察员`）。
- 细粒度勾选权限项按 **全局管理**、**成员管理（所有/下属）**、**仪器管理（所有/负责）**、**送样与保密记录管理**、**财务中心管理** 分组控制。

#### 各层级对已有数据的管理与删除权限边界
| 资源对象 | 新增权限 | 修改已有内容权限 | 删除 / 取消退费权限 |
| :--- | :--- | :--- | :--- |
| **组织机构 (`Department`)** | `ADMIN`、`DEPT_HEAD` | `ADMIN`、本机构/上级 `DEPT_HEAD` | `ADMIN`、上级 `DEPT_HEAD`（下属无挂载人员/设备/项目时可删） |
| **课题组项目 (`Project`)** | `ADMIN`、`DEPT_HEAD`、`PI` | `ADMIN`、该项目 `PI`、依托科室 `DEPT_HEAD` | `ADMIN`、该项目 `PI`（无未完结预约时可删） |
| **项目成员配额 (`ProjectMember`)** | `ADMIN`、该项目 `PI`、依托科室 `DEPT_HEAD` | `ADMIN`、该项目 `PI`、依托科室 `DEPT_HEAD` | `ADMIN`、该项目 `PI`、依托科室 `DEPT_HEAD`（可移出非主PI成员） |
| **成员目录 (`User`)** | `ADMIN`、`DEPT_HEAD`、自助注册 | `ADMIN`（全部）、`DEPT_HEAD`（本科室下属）、本人（基本资料） | `ADMIN`、`DEPT_HEAD`（仅限删除本科室普通成员） |
| **仪器设备 (`Device`)** | `ADMIN`、归口科室 `DEPT_HEAD` | `ADMIN`、归口科室 `DEPT_HEAD` 及仪器负责人 (`STAFF`) | `ADMIN`、归口科室 `DEPT_HEAD`（无未结算预约时可报废删除） |
| **仪器预约 (`Reservation`)** | 项目白名单内非观察员 | 上机签到、填写有效时长下机结算 | 未上机(`RESERVED`)：本人、项目 `PI`、设备归口 `DEPT_HEAD`、`ADMIN` 均可取消并自动全额解冻退费；已完结记录：仅 `ADMIN` 或归口 `DEPT_HEAD` 可删除 |
| **试剂耗材 (`Consumable`)** | `ADMIN`、归口科室 `DEPT_HEAD` | `ADMIN`、归口科室 `DEPT_HEAD` 及 `STAFF`（补货/改价） | `ADMIN`、归口科室 `DEPT_HEAD` |
| **送检样品 (`Sample`)** | 项目白名单内非观察员 | 承检科室人员或 `ADMIN` 签发/重签 COA 报告 | 待检测(`REGISTERED`)：送检人本人、项目 `PI`、承检 `DEPT_HEAD`、`ADMIN` 可撤回并自动退还检测费；已完成样品：仅 `ADMIN` 可删除 |
| **实验记录 (`ELNRecord`)** | 项目白名单内非观察员 | 未锁定时：作者本人、项目 `PI`、`ADMIN` 可编辑；已锁定时：项目 `PI` 或 `ADMIN` 可解锁 | 未锁定时：作者本人、项目 `PI`、`ADMIN` 可删除；已锁定时：仅 `ADMIN` 可删除 |

---

## 3. 服务启停与内网部署运维指南

### 3.1 本地开发调试启动（双端口热更新模式）
注意命令需在 `UniLab-OS` 项目根目录下执行（若在上级目录执行需附带 `--app-dir` 参数）：

1. **启动后端服务（端口 `8000`）**：
   ```powershell
   cd UniLab-OS
   pip install -r backend/requirements.txt
   python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
   ```
2. **启动前端开发服务（端口 `5173`）**：
   ```powershell
   cd UniLab-OS/frontend
   npm install
   npm run dev -- --host 127.0.0.1 --port 5173
   ```
   - 浏览器访问：`http://127.0.0.1:5173`
   - Swagger 接口文档：`http://127.0.0.1:8000/docs`

### 3.2 局域网/内网正式上线运行（单端口一体化模式）
前端已配置自适应相对路径请求，打包生成 `frontend/dist` 后由 FastAPI 自动挂载静态资源，仅需对外开放一个 `8000` 端口即可同时提供页面与 API 服务：

1. **Windows 一键打包并启动内网服务**：
   ```powershell
   cd UniLab-OS
   .\deploy_intranet.ps1
   ```
   *(或手动执行：`cd frontend && npm run build && cd .. && python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000`)*

2. **放行系统防火墙端口（首次上线执行一次）**：
   - **Windows（管理员 PowerShell）**：
     ```powershell
     New-NetFirewallRule -DisplayName "UniLab-OS-8000" -Direction Inbound -Protocol TCP -LocalPort 8000 -Action Allow
     ```
   - **Linux (ufw / firewalld)**：
     ```bash
     sudo ufw allow 8000/tcp
     ```

3. **内网访问与硬件接入地址**：
   - 局域网电脑浏览器：`http://<服务器内网固定IP>:8000`
   - 物联网终端/ERP网关：`http://<服务器内网固定IP>:8000/api/v1/ext/...`

4. **生产环境加固与守护建议**：
   - **后台常驻自启**：Windows 推荐使用 NSSM 注册为系统服务；Linux 推荐使用 `systemd` 守护进程。
   - **修改硬件网关密钥**：上线前设置环境变量 `LAB_HARDWARE_TOKEN` 替换默认密钥。
   - **数据库切换与备份**：中小规模可直接定时备份 `unilab_os.db`；高并发场景可配置环境变量 `DATABASE_URL="postgresql://user:pass@127.0.0.1:5432/unilab"` 无缝切换至 PostgreSQL。

### 3.3 停止与关闭服务操作
- **前台窗口运行中**：直接在对应的终端窗口按 **`Ctrl + C`** 停止。
- **后台静默运行中**：执行项目根目录下的一键停止脚本：
  ```powershell
  .\stop_service.ps1
  ```
  *(或执行 PowerShell 命令清理占用 `8000`/`5173` 端口的进程：`Get-NetTCPConnection -LocalPort 8000,5173 -ErrorAction SilentlyContinue | Where-Object { $_.OwningProcess -gt 4 } | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force }`；注意在 Windows 11 + PowerShell 7 下 `0.0.0.0` 监听套接字的 `State` 列可能为空，请勿附加 `-State Listen` 过滤条件。)*


