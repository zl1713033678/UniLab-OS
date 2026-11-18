# UniLab-OS 外部硬件与第三方系统标准接入规范 (Hardware & External Integration Spec)

本文档定义了 **UniLab-OS 综合实验室线上管理平台** 与物理硬件节点（ESP32 电流互感器节点、RC522/PN532 RFID 刷卡终端、智能断路器/继电器）、大型精密仪器数据采集 Agent 以及外部医院/高校财务 ERP 系统的标准接入契约。

---

## 1. 安全鉴权与全局幂等机制

### 1.1 API Key 鉴权 Header
所有发往 `/api/v1/ext/*` 的请求必须在 HTTP Header 中携带硬件网关密钥：
```http
X-Lab-Hardware-Token: UNILAB_HW_SECRET_2026
Content-Type: application/json
```
> 生产环境可通过环境变量 `LAB_HARDWARE_TOKEN` 注入高强度密钥。若未携带或密钥不匹配，网关直接返回 `401 Unauthorized`。

### 1.2 防重放与幂等保障 (`seq_id` / `idempotency_key`)
- 边缘硬件在弱网 Wi-Fi 环境下重传报文时，必须保持 `seq_id` 不变。
- 后端通过 `iot_telemetry_logs.seq_id` 与 `billing_ledgers.idempotency_key` 唯一索引拦截重复请求，重放请求将安全返回 `idempotent_replay: true` 而不会重复累加机时或重复入账。

---

## 2. 标准接口契约详解

### 接口 1：物联网边缘节点状态与电流上报 (`POST /api/v1/ext/iot/telemetry`)
- **适用硬件：** ESP32-S3 + SCT-013 非侵入式电流互感器 / ACS712 霍尔电流传感器 + 本地 Mosquitto MQTT-to-HTTP Bridge。
- **上报周期：** 建议每 15 分钟一个心跳步长，或在电流跨越 `standby_current_threshold`（待机阈值）及刷卡事件发生时立即触发上报。
- **Request Payload:**
```json
{
  "device_code": "CNC-01",
  "hardware_timestamp": 1760688000,
  "rms_current_amps": "6.8500",
  "power_state": "RUNNING",
  "operator_rfid": "CARD_889203",
  "project_code_override": "PRJ-2026-01",
  "seq_id": "ESP32_MSG_90012"
}
```
- **Response Payload:**
```json
{
  "ack": true,
  "idempotent_replay": false,
  "device_code": "CNC-01",
  "computed_status": "RUNNING",
  "active_reservation_id": 1,
  "relay_command": "KEEP_ON"
}
```
- **硬件端继电器执行逻辑 (`relay_command`)：**
  - `KEEP_ON`：保持固态继电器（SSR）闭合供电。
  - `ALLOW_START`：处于合法预约窗口待机状态，允许随时启动负载。
  - `CUTOFF_POWER`：未预约私自开机或设备故障，硬件端收到后应立即断开继电器并鸣响蜂鸣器告警。

---

### 接口 2：终端 RFID 刷卡开机核验 (`POST /api/v1/ext/access/rfid-verify`)
- **适用硬件：** 设备电源控制盒上的 RC522 / PN532 读卡器。
- **业务联动：** 校验刷卡人 `rfid_card_id` 是否在当前预约单的跨科室项目白名单（`ProjectMember`）中且非 `OBSERVER`。核验通过后自动将预约状态由 `RESERVED` 切换为 `ACTIVE`（标记 `checkin_method = "RFID_IOT"`），并返回继电器解锁时长。
- **Request Payload:**
```json
{
  "device_code": "CNC-01",
  "rfid_card_id": "CARD_889203",
  "project_code": "PRJ-2026-01",
  "seq_id": "RFID_REQ_10086"
}
```
- **Response Payload:**
```json
{
  "authorized": true,
  "reason": "RFID 双因子核验通过，允许通电开机",
  "operator_name": "陈博士 (生医室骨干实验员)",
  "project_code": "PRJ-2026-01",
  "reservation_id": 1,
  "relay_unlock_seconds": 3600
}
```

---

### 接口 3：大型分析仪器检测数据自动抓取入库 (`POST /api/v1/ext/lims/instrument-ingest`)
- **适用软件：** 部署在 LC-MS、GC-MS、FE-SEM、流式细胞仪工控机上的 Python Watchdog 文件监控 Agent。
- **业务联动：** 仪器生成结果文件后，Agent 提取文件名中的样品条码 `barcode` 与关键定量指标，调用本接口自动写入 `Sample.coa_metrics_json` 并将样品状态推进至 `COMPLETED`。
- **Request Payload:**
```json
{
  "barcode": "SMP-20261018-NANO01",
  "instrument_code": "LCMS-01",
  "operator_rfid": "CARD_889204",
  "raw_metrics": {
    "峰面积比": 1.984,
    "信噪比_SNR": 420.5,
    "质谱检出限_ng_mL": 0.05,
    "自动判定": "PASS"
  },
  "seq_id": "AGENT_COA_70021"
}
```

---

### 接口 4：外部财务/ERP 经费卡拨款同步 (`POST /api/v1/ext/erp/grant-deposit`)
- **适用系统：** 高校/科研院所/医院财务处 ERP 经费管理系统 Webhook。
- **业务联动：** 根据 `erp_voucher_no` 生成唯一幂等键 `BILL_ERP_DEPOSIT_{erp_voucher_no}`，在 `BillingLedger` 写入 `DEPOSIT` 流水，并同步增加项目 `total_budget` 与 `available_balance`。
- **Request Payload:**
```json
{
  "project_code": "PRJ-2026-01",
  "amount": "15000.0000",
  "erp_voucher_no": "ERP-2026-VOUCHER-889",
  "operator_username": "pi_zhang"
}
```
