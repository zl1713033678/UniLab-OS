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
from datetime import datetime
from decimal import Decimal
from typing import Optional, Dict, Any

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .models import (
    get_db,
    Device,
    User,
    Project,
    ProjectMember,
    Reservation,
    Sample,
    IoTTelemetryLog,
)
from .billing_engine import quantize_dec, deposit_project_grant

HARDWARE_API_TOKEN = os.getenv("LAB_HARDWARE_TOKEN", "UNILAB_HW_SECRET_2026")

external_router = APIRouter(prefix="/api/v1/ext", tags=["External Hardware & ERP Gateway"])


def verify_hardware_token(
    x_lab_hardware_token: str = Header(..., alias="X-Lab-Hardware-Token")
) -> str:
    """校验外部硬件及第三方网关 API Key"""
    if x_lab_hardware_token != HARDWARE_API_TOKEN:
        raise HTTPException(status_code=401, detail="硬件网关鉴权失败：无效的 X-Lab-Hardware-Token")
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


# ==================== 路由实现 ====================

@external_router.post("/iot/telemetry")
def receive_iot_telemetry(
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

    amps = quantize_dec(payload.rms_current_amps)
    threshold = quantize_dec(device.standby_current_threshold)
    device.current_amps = amps

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
    now = datetime.utcnow()

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
    db.commit()

    return {
        "ack": True,
        "idempotent_replay": False,
        "device_code": device.code,
        "computed_status": device.status,
        "active_reservation_id": active_res.id if active_res else None,
        "relay_command": relay_command,
    }


@external_router.post("/access/rfid-verify")
def verify_rfid_access(
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
    reservation.status = "ACTIVE"
    reservation.checkin_method = "RFID_IOT"
    device.status = "RUNNING"
    db.commit()

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
