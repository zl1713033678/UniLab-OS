# -*- coding: utf-8 -*-
"""
UniLab-OS 外部硬件与第三方系统标准接入网关 (External Gateway)
包含：
1. X-Lab-Hardware-Token 硬件鉴权中间件与 seq_id 全局防重放幂等机制
2. 接口1: POST /api/v1/ext/iot/telemetry - ESP32/MQTT 边缘节点电流与状态上报
3. 接口2: POST /api/v1/ext/access/rfid-verify - 智能门禁/设备电源控制器 RFID 刷卡鉴权
4. 接口3: POST /api/v1/ext/lims/instrument-ingest - 大型分析仪器检测数据自动抓取入库
5. 接口4: POST /api/v1/ext/erp/grant-deposit - 外部医院/高校 ERP 经费卡拨款同步
"""

import json
import os
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional, Dict, Any, List

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .models import (
    get_db,
    Department,
    LabRoom,
    Device,
    User,
    Project,
    ProjectMember,
    Reservation,
    Sample,
    IoTTelemetryLog,
)
from .billing_engine import quantize_dec, deposit_project_grant
from .lab_services import (
    compute_schmitt_target_status,
    get_hardware_gateway_settings,
    record_device_usage_log,
    serialize_devices,
    serialize_rooms,
    ws_manager,
)

HARDWARE_API_TOKEN = os.getenv("LAB_HARDWARE_TOKEN", "UNILAB_HW_SECRET_2026")

external_router = APIRouter(prefix="/api/v1/ext", tags=["External Hardware & ERP Gateway"])
telemetry_ingest_router = APIRouter(prefix="/api/v1", tags=["ESP32 Telemetry Compatibility"])


def verify_hardware_token(
    x_lab_hardware_token: str = Header(..., alias="X-Lab-Hardware-Token")
) -> str:
    """校验外部硬件及第三方网关 API Key"""
    if x_lab_hardware_token != HARDWARE_API_TOKEN:
        raise HTTPException(status_code=401, detail="硬件网关鉴权失败：无效的 X-Lab-Hardware-Token")
    return x_lab_hardware_token


def verify_ingest_token(
    x_lab_hardware_token: Optional[str] = Header(None, alias="X-Lab-Hardware-Token"),
    db: Session = Depends(get_db),
) -> str:
    """支持通过后台开关控制是否要求 ESP32 兼容接入网关携带 X-Lab-Hardware-Token"""
    gw_settings = get_hardware_gateway_settings(db)
    if gw_settings.get("allow_open_esp32_ingest"):
        return x_lab_hardware_token or "OPEN_INGEST"
    if not x_lab_hardware_token or x_lab_hardware_token != HARDWARE_API_TOKEN:
        raise HTTPException(
            status_code=401,
            detail="硬件网关鉴权失败：请在请求头携带有效 X-Lab-Hardware-Token（或由管理员在系统设置中临时开启免检调试）",
        )
    return x_lab_hardware_token


# ==================== Pydantic 请求与响应契约 ====================

class IoTTelemetryPayload(BaseModel):
    device_code: str = Field(..., description="设备唯一资产编号，例如 CNC-01")
    hardware_timestamp: int = Field(..., description="硬件端 Unix 秒级时间戳")
    rms_current_amps: Decimal = Field(..., description="传感器采集的有效值电流(A)")
    power_state: str = Field(..., description="硬件物理上报状态: IDLE / RUNNING / FAULT")
    operator_rfid: Optional[str] = Field(None, description="当前刷卡操作人 RFID 卡号")
    project_code_override: Optional[str] = Field(None, description="终端面板指定项目编号")
    seq_id: str = Field(..., description="报文唯一序列号，用于防重放幂等控制")


class RFIDVerifyPayload(BaseModel):
    device_code: str = Field(..., description="请求解锁的设备编码")
    rfid_card_id: str = Field(..., description="刷卡人实体 RFID 卡号")
    project_code: Optional[str] = Field(None, description="可选指定的项目编号")
    seq_id: str = Field(..., description="刷卡请求唯一序列号")


class InstrumentIngestPayload(BaseModel):
    barcode: str = Field(..., description="样品唯一条码")
    instrument_code: str = Field(..., description="分析仪器编号")
    operator_rfid: str = Field(..., description="操作检测员 RFID 卡号")
    raw_metrics: Dict[str, Any] = Field(..., description="仪器自动解析出的结构化谱图/指标 JSON")
    seq_id: str = Field(..., description="采集报文唯一序列号")


class ERPGrantDepositPayload(BaseModel):
    project_code: str = Field(..., description="受资助项目编号")
    amount: Decimal = Field(..., description="拨款金额(定点数)")
    erp_voucher_no: str = Field(..., description="外部 ERP 财务凭证号(同时作为幂等要素)")
    operator_username: str = Field(..., description="经办财务或PI账号")


class TelemetryChannelPayload(BaseModel):
    device_code: str
    status: Optional[str] = None
    state: Optional[str] = None
    current: Optional[Decimal] = None
    rms_current_amps: Optional[Decimal] = None
    voltage: Optional[Decimal] = Decimal("220.0000")
    source_type: str = "ESP32_ACS712"
    operator_rfid: Optional[str] = None
    seq_id: Optional[str] = None
    raw_data: Optional[Dict[str, Any]] = None


class TelemetryIngestRequest(BaseModel):
    """兼容单通道扁平 JSON 与多通道 channels 数组的 ESP32 遥测接入契约"""
    channels: Optional[List[TelemetryChannelPayload]] = None
    device_code: Optional[str] = None
    status: Optional[str] = None
    state: Optional[str] = None
    current: Optional[Decimal] = None
    rms_current_amps: Optional[Decimal] = None
    voltage: Optional[Decimal] = Decimal("220.0000")
    source_type: str = "ESP32_ACS712"
    operator_rfid: Optional[str] = None
    seq_id: Optional[str] = None
    raw_data: Optional[Dict[str, Any]] = None


# ==================== 路由实现 ====================

@external_router.post("/iot/telemetry")
async def receive_iot_telemetry(
    payload: IoTTelemetryPayload,
    db: Session = Depends(get_db),
    _token: str = Depends(verify_hardware_token),
):
    """
    接口1：物联网边缘节点状态与电流上报接口 (IoT Telemetry & State Webhook)
    结合待机电流阈值与当前预约单，执行双因子状态机流转并下发继电器控制指令。
    """
    device = db.query(Device).filter(Device.code == payload.device_code).first()
    if not device:
        raise HTTPException(status_code=404, detail=f"未找到设备编码: {payload.device_code}")

    # 幂等性校验：若 seq_id 已处理过，直接返回当前状态且标记 idempotent_replay=True
    existing_log = db.query(IoTTelemetryLog).filter(IoTTelemetryLog.seq_id == payload.seq_id).first()
    if existing_log:
        active_res = (
            db.query(Reservation)
            .filter(
                Reservation.device_id == device.id,
                Reservation.status.in_(["RESERVED", "ACTIVE"]),
            )
            .order_by(Reservation.start_time.asc())
            .first()
        )
        return {
            "ack": True,
            "idempotent_replay": True,
            "device_code": device.code,
            "computed_status": device.status,
            "active_reservation_id": active_res.id if active_res else None,
            "relay_command": "KEEP_ON" if device.status in ("RUNNING", "OVERTIME_RUNNING") else "ALLOW_START",
        }

    previous_status = device.status
    amps = quantize_dec(payload.rms_current_amps)
    threshold = quantize_dec(device.standby_current_threshold)
    now = datetime.utcnow()
    device.current_amps = amps
    device.last_seen_at = now
    device.is_online = True
    device.telemetry_source = "IOT_GATEWAY"

    # 查找该设备当前生效或待签到的预约任务单
    active_res = (
        db.query(Reservation)
        .filter(
            Reservation.device_id == device.id,
            Reservation.status.in_(["RESERVED", "ACTIVE"]),
        )
        .order_by(Reservation.start_time.asc())
        .first()
    )

    relay_command = "KEEP_ON"

    if payload.power_state == "FAULT":
        device.status = "FAULT"
        relay_command = "CUTOFF_POWER"
    elif amps >= threshold:
        # 电流高于待机阈值，说明设备处于真实高负载运行
        if active_res:
            # 双因子自动激活：若原本处于 RESERVED 且带有合法 RFID 或已到预约窗口，自动切换为 ACTIVE
            if active_res.status == "RESERVED":
                active_res.status = "ACTIVE"
                active_res.checkin_method = "RFID_IOT"
            # 每次收到高负载遥测心跳，累加 0.25 小时（模拟15分钟遥测步长）有效运行机时
            active_res.actual_active_hours = quantize_dec(active_res.actual_active_hours) + Decimal("0.2500")
            if now > active_res.end_time or quantize_dec(active_res.actual_active_hours) > quantize_dec(active_res.reserved_hours):
                device.status = "OVERTIME_RUNNING"
            else:
                device.status = "RUNNING"
            relay_command = "KEEP_ON"
        else:
            # 无有效预约却出现高电流负载，判定为违规私自开机，下发断电指令
            device.status = "FAULT"
            relay_command = "CUTOFF_POWER"
    else:
        # 电流低于待机阈值
        if active_res and active_res.status == "RESERVED":
            device.status = "RESERVED"
            relay_command = "ALLOW_START"
        elif active_res and active_res.status == "ACTIVE":
            device.status = "RUNNING"
            relay_command = "KEEP_ON"
        else:
            device.status = "IDLE"
            relay_command = "CUTOFF_POWER"

    telemetry_log = IoTTelemetryLog(
        seq_id=payload.seq_id,
        device_id=device.id,
        hardware_timestamp=payload.hardware_timestamp,
        rms_current_amps=amps,
        power_state=payload.power_state,
        operator_rfid=payload.operator_rfid,
        project_code_override=payload.project_code_override,
    )
    db.add(telemetry_log)
    if previous_status != device.status:
        record_device_usage_log(
            db,
            device=device,
            previous_status=previous_status,
            new_status=device.status,
            amps=amps,
            voltage=quantize_dec(getattr(device, "voltage", Decimal("220.0000"))),
            source_type="IOT_GATEWAY",
            operator_name=payload.operator_rfid or "IOT_GATEWAY",
            raw_data=json.dumps({"seq_id": payload.seq_id, "power_state": payload.power_state}, ensure_ascii=False),
        )
    db.commit()

    await ws_manager.broadcast_state(
        "TELEMETRY_UPDATE",
        serialize_devices(db),
        serialize_rooms(db),
    )

    return {
        "ack": True,
        "idempotent_replay": False,
        "device_code": device.code,
        "computed_status": device.status,
        "active_reservation_id": active_res.id if active_res else None,
        "relay_command": relay_command,
    }


@external_router.post("/access/rfid-verify")
async def verify_rfid_access(
    payload: RFIDVerifyPayload,
    db: Session = Depends(get_db),
    _token: str = Depends(verify_hardware_token),
):
    """
    接口2：智能插座/门禁终端 RFID 刷卡开机鉴权接口
    校验刷卡人身份、跨科室项目成员白名单、预约单匹配情况，通过后自动完成硬件签到并下发继电器吸合时长。
    """
    device = db.query(Device).filter(Device.code == payload.device_code).first()
    if not device:
        raise HTTPException(status_code=404, detail=f"设备 {payload.device_code} 不存在")

    user = db.query(User).filter(User.rfid_card_id == payload.rfid_card_id).first()
    if not user:
        return {
            "authorized": False,
            "reason": f"未注册的未知 RFID 卡号: {payload.rfid_card_id}",
            "operator_name": None,
            "project_code": None,
            "reservation_id": None,
            "relay_unlock_seconds": 0,
        }

    # 查找该员工在该设备上的待签到或进行中预约
    res_query = db.query(Reservation).filter(
        Reservation.device_id == device.id,
        Reservation.operator_user_id == user.id,
        Reservation.status.in_(["RESERVED", "ACTIVE"]),
    )
    if payload.project_code:
        proj = db.query(Project).filter(Project.code == payload.project_code).first()
        if proj:
            res_query = res_query.filter(Reservation.project_id == proj.id)

    reservation = res_query.order_by(Reservation.start_time.asc()).first()
    if not reservation:
        return {
            "authorized": False,
            "reason": f"员工【{user.full_name}】当前在设备【{device.code}】上无有效预约单",
            "operator_name": user.full_name,
            "project_code": payload.project_code,
            "reservation_id": None,
            "relay_unlock_seconds": 0,
        }

    # 校验项目成员资格与只读属性
    membership = (
        db.query(ProjectMember)
        .filter(
            ProjectMember.project_id == reservation.project_id,
            ProjectMember.user_id == user.id,
        )
        .first()
    )
    if not membership or membership.project_role == "OBSERVER":
        return {
            "authorized": False,
            "reason": "操作人在该项目下无实验操作权限",
            "operator_name": user.full_name,
            "project_code": reservation.project.code,
            "reservation_id": reservation.id,
            "relay_unlock_seconds": 0,
        }

    # 状态机联动：刷卡通过后自动将预约置为 ACTIVE，设备置为 RUNNING
    prev_status = device.status
    reservation.status = "ACTIVE"
    reservation.checkin_method = "RFID_IOT"
    device.status = "RUNNING"
    device.last_seen_at = datetime.utcnow()
    device.is_online = True
    device.telemetry_source = "RFID_IOT"
    if prev_status != "RUNNING":
        record_device_usage_log(
            db,
            device=device,
            previous_status=prev_status,
            new_status="RUNNING",
            amps=quantize_dec(device.current_amps),
            voltage=quantize_dec(getattr(device, "voltage", Decimal("220.0000"))),
            source_type="RFID_IOT",
            operator_name=user.full_name,
            raw_data=json.dumps({"rfid": payload.rfid_card_id, "seq_id": payload.seq_id}, ensure_ascii=False),
        )
    db.commit()

    await ws_manager.broadcast_state("STATE_CHANGE", serialize_devices(db), serialize_rooms(db))

    return {
        "authorized": True,
        "reason": "RFID 双因子核验通过，允许通电开机",
        "operator_name": user.full_name,
        "project_code": reservation.project.code,
        "reservation_id": reservation.id,
        "relay_unlock_seconds": 3600,
    }


@external_router.post("/lims/instrument-ingest")
def ingest_instrument_coa_data(
    payload: InstrumentIngestPayload,
    db: Session = Depends(get_db),
    _token: str = Depends(verify_hardware_token),
):
    """
    接口3：大型分析仪器（如 LC-MS/GC-MS/XRD）本地文件抓取 Agent 自动回传 COA 结果接口
    """
    sample = db.query(Sample).filter(Sample.barcode == payload.barcode).first()
    if not sample:
        raise HTTPException(status_code=404, detail=f"未找到样品条码: {payload.barcode}")

    operator = db.query(User).filter(User.rfid_card_id == payload.operator_rfid).first()
    enriched_metrics = dict(payload.raw_metrics)
    enriched_metrics["_ingested_by_instrument"] = payload.instrument_code
    enriched_metrics["_ingested_seq_id"] = payload.seq_id
    if operator:
        enriched_metrics["_verified_operator"] = operator.full_name

    sample.coa_metrics_json = json.dumps(enriched_metrics, ensure_ascii=False)
    sample.status = "COMPLETED"
    sample.completed_at = datetime.utcnow()
    db.commit()

    return {
        "ack": True,
        "sample_id": sample.id,
        "barcode": sample.barcode,
        "updated_status": sample.status,
    }


@external_router.post("/erp/grant-deposit")
def sync_erp_grant_deposit(
    payload: ERPGrantDepositPayload,
    db: Session = Depends(get_db),
    _token: str = Depends(verify_hardware_token),
):
    """
    接口4：外部财务/ERP经费系统拨款入账同步接口（支持凭证号幂等防重）
    """
    project = db.query(Project).filter(Project.code == payload.project_code).first()
    if not project:
        raise HTTPException(status_code=404, detail=f"项目编号 {payload.project_code} 不存在")

    user = db.query(User).filter(User.username == payload.operator_username).first()
    operator_id = user.id if user else project.pi_user_id

    idempotency_key = f"BILL_ERP_DEPOSIT_{payload.erp_voucher_no}"
    is_replay, ledger = deposit_project_grant(
        db=db,
        idempotency_key=idempotency_key,
        project=project,
        operator_user_id=operator_id,
        amount=payload.amount,
        erp_voucher_no=payload.erp_voucher_no,
    )
    db.commit()

    return {
        "ack": True,
        "idempotent_replay": is_replay,
        "project_code": project.code,
        "available_balance": str(quantize_dec(project.available_balance)),
        "ledger_idempotency_key": ledger.idempotency_key,
    }


def _get_or_create_unassigned_room(db: Session, fallback_dept_id: int) -> LabRoom:
    room = (
        db.query(LabRoom)
        .filter((LabRoom.code == "UNASSIGNED") | (LabRoom.name == "未分配实验室"))
        .first()
    )
    if room:
        return room
    room = LabRoom(
        code="UNASSIGNED",
        name="未分配实验室",
        floor="1F",
        owner_dept_id=fallback_dept_id,
        pos_x=80,
        pos_y=600,
        width=280,
        height=130,
        power_capacity_amps=Decimal("32.0000"),
    )
    db.add(room)
    db.flush()
    return room


@telemetry_ingest_router.post("/telemetry/ingest")
async def ingest_esp32_telemetry(
    payload: TelemetryIngestRequest,
    db: Session = Depends(get_db),
    _token: str = Depends(verify_ingest_token),
):
    """
    ESP32 / ACS712 兼容型高速遥测接入接口：
    - 支持单通道扁平载荷与多通道 channels 数组
    - 修复 raw_data.current 优先回填后执行施密特迟滞判定 (BUG-004)
    - 遇到未知 device_code 自动发现入库至「未分配实验室」并触发前端弹窗指引
    """
    items: List[TelemetryChannelPayload] = []
    if payload.channels:
        items.extend(payload.channels)
    elif payload.device_code:
        items.append(
            TelemetryChannelPayload(
                device_code=payload.device_code,
                status=payload.status,
                state=payload.state,
                current=payload.current,
                rms_current_amps=payload.rms_current_amps,
                voltage=payload.voltage,
                source_type=payload.source_type,
                operator_rfid=payload.operator_rfid,
                seq_id=payload.seq_id,
                raw_data=payload.raw_data,
            )
        )
    else:
        raise HTTPException(status_code=400, detail="请提供 device_code 或 channels 遥测列表")

    gw_settings = get_hardware_gateway_settings(db)
    schmitt_high = quantize_dec(Decimal(str(gw_settings.get("schmitt_high_amps", "0.5000"))))
    schmitt_low = quantize_dec(Decimal(str(gw_settings.get("schmitt_low_amps", "0.0500"))))
    first_dept = db.query(Department).order_by(Department.id.asc()).first()
    if not first_dept:
        raise HTTPException(status_code=500, detail="系统尚未初始化基础组织科室")

    now = datetime.utcnow()
    results: List[Dict[str, Any]] = []
    discovered_devices: List[Dict[str, Any]] = []

    for ch in items:
        code = ch.device_code.strip()
        raw_dict = ch.raw_data or {}

        # BUG-004 修复：解析态优先回填 raw_data 中的 current / voltage
        raw_curr = ch.current if ch.current is not None else ch.rms_current_amps
        if raw_curr is None and "current" in raw_dict and raw_dict["current"] is not None:
            raw_curr = Decimal(str(raw_dict["current"]))
        amps = quantize_dec(raw_curr if raw_curr is not None else Decimal("0.0000"))

        raw_volt = ch.voltage
        if "voltage" in raw_dict and raw_dict["voltage"] is not None:
            raw_volt = Decimal(str(raw_dict["voltage"]))
        voltage = quantize_dec(raw_volt if raw_volt is not None else Decimal("220.0000"))

        reported_status = ch.status or ch.state
        device = db.query(Device).filter(Device.code == code).first()
        is_new_discovery = False

        if not device:
            is_new_discovery = True
            unassigned_room = _get_or_create_unassigned_room(db, first_dept.id)
            target_init = compute_schmitt_target_status(
                device=Device(status="IDLE", standby_current_threshold=Decimal("0.5000")),
                amps=amps,
                reported_status=reported_status,
                source_type=ch.source_type,
                schmitt_high=schmitt_high,
                schmitt_low=schmitt_low,
            )
            device = Device(
                code=code,
                name=f"未命名传感器节点 ({code})",
                owner_dept_id=first_dept.id,
                room_id=unassigned_room.id,
                pos_x=20,
                pos_y=75,
                status=target_init,
                standby_current_threshold=schmitt_high,
                current_amps=amps,
                voltage=voltage,
                last_seen_at=now,
                is_online=True,
                telemetry_source=ch.source_type,
                internal_hourly_rate=Decimal("50.0000"),
                external_hourly_rate=Decimal("100.0000"),
                penalty_factor=Decimal("0.5000"),
            )
            db.add(device)
            db.flush()
            record_device_usage_log(
                db,
                device=device,
                previous_status="NEW",
                new_status=device.status,
                amps=amps,
                voltage=voltage,
                source_type="AUTO_DISCOVERY",
                operator_name=ch.source_type,
                raw_data=json.dumps(raw_dict or {"device_code": code}, ensure_ascii=False),
            )
        else:
            prev_status = device.status
            target_status = compute_schmitt_target_status(
                device=device,
                amps=amps,
                reported_status=reported_status,
                source_type=ch.source_type,
                schmitt_high=schmitt_high,
                schmitt_low=schmitt_low,
            )
            # 若存在待签到预约且进入高负载，则同步联动激活预约
            if target_status == "RUNNING":
                active_res = (
                    db.query(Reservation)
                    .filter(
                        Reservation.device_id == device.id,
                        Reservation.status == "RESERVED",
                    )
                    .order_by(Reservation.start_time.asc())
                    .first()
                )
                if active_res:
                    active_res.status = "ACTIVE"
                    active_res.checkin_method = ch.source_type

            device.current_amps = amps
            device.voltage = voltage
            device.last_seen_at = now
            device.is_online = True
            device.telemetry_source = ch.source_type
            device.status = target_status

            if prev_status != target_status:
                record_device_usage_log(
                    db,
                    device=device,
                    previous_status=prev_status,
                    new_status=target_status,
                    amps=amps,
                    voltage=voltage,
                    source_type=ch.source_type,
                    operator_name=ch.operator_rfid or ch.source_type,
                    raw_data=json.dumps(raw_dict or {"current": str(amps)}, ensure_ascii=False),
                )

        seq = ch.seq_id or f"INGEST_{code}_{uuid.uuid4().hex[:10]}"
        if not db.query(IoTTelemetryLog).filter(IoTTelemetryLog.seq_id == seq).first():
            db.add(
                IoTTelemetryLog(
                    seq_id=seq,
                    device_id=device.id,
                    hardware_timestamp=int(now.timestamp()),
                    rms_current_amps=amps,
                    power_state=device.status,
                    operator_rfid=ch.operator_rfid,
                    project_code_override=None,
                )
            )

        results.append(
            {
                "device_code": device.code,
                "status": device.status,
                "current_amps": str(amps),
                "voltage": str(voltage),
                "newly_discovered": is_new_discovery,
            }
        )
        if is_new_discovery:
            discovered_devices.append(
                {
                    "id": device.id,
                    "code": device.code,
                    "name": device.name,
                    "current_amps": str(amps),
                    "voltage": str(voltage),
                    "source_type": ch.source_type,
                }
            )

    db.commit()

    all_devices = serialize_devices(db)
    all_rooms = serialize_rooms(db)
    if discovered_devices:
        await ws_manager.broadcast_state(
            "DEVICE_DISCOVERED",
            all_devices,
            all_rooms,
            extra={"discovered_device": discovered_devices[0]},
        )
    else:
        await ws_manager.broadcast_state("TELEMETRY_UPDATE", all_devices, all_rooms)

    return {
        "ack": True,
        "processed_count": len(results),
        "results": results,
    }
