# -*- coding: utf-8 -*-
"""
UniLab-OS 综合实验室线上管理平台主入口 (FastAPI Main Application)
包含：
- Module 0: 科室-人员-跨科室项目矩阵权限与配额管理
- Module A: FMS 设备台账、冲突校验、预约冻结、双因子签到与下机结算
- Module B: LIMS 样品登记、耗材领用实时扣费、COA 报告生成与保密过滤
- Module C: ELN 电子实验记录本、跨模块成本汇总、严格保密隔离与审计锁死
- Module D: 复式记账总账、科室产值统计与 WebSocket 实时状态推送
"""

import json
import uuid
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Optional, List, Dict, Any

from fastapi import FastAPI, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from .models import (
    Base,
    engine,
    SessionLocal,
    get_db,
    Department,
    User,
    Project,
    ProjectMember,
    Device,
    Reservation,
    Consumable,
    Sample,
    ELNRecord,
    BillingLedger,
)
from .billing_engine import (
    quantize_dec,
    verify_operation_context,
    determine_rate_type_and_price,
    create_hold_transaction,
    settle_fms_reservation,
    settle_lims_immediate,
)
from .external_gateway import external_router

app = FastAPI(
    title="UniLab-OS 综合实验室线上管理平台",
    version="1.0.0",
    description="支持矩阵式RBAC、FMS机时调度、LIMS样品耗材、ELN保密隔离及跨科复式记账引擎",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册外部硬件与第三方系统网关路由
app.include_router(external_router)


# ==================== WebSocket 实时广播管理 ====================

class LabConnectionManager:
    """管理前端实验室平面图 WebSocket 实时连接"""
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast_state(self, event_name: str, devices_data: List[Dict[str, Any]]):
        payload = {
            "event": event_name,
            "devices": devices_data,
            "timestamp": datetime.utcnow().isoformat(),
        }
        stale = []
        for conn in self.active_connections:
            try:
                await conn.send_json(payload)
            except Exception:
                stale.append(conn)
        for conn in stale:
            self.disconnect(conn)


ws_manager = LabConnectionManager()


# ==================== Pydantic 请求模型 ====================

class ProjectMemberUpsertRequest(BaseModel):
    operator_user_id: int
    project_id: int
    target_user_id: int
    project_role: str = "RESEARCHER"
    spending_limit: Decimal


class FMSReservationCreateRequest(BaseModel):
    operator_user_id: int
    project_id: int
    device_id: int
    start_time: datetime
    end_time: datetime


class FMSCheckinRequest(BaseModel):
    operator_user_id: int
    project_id: int
    checkin_method: str = "WEB_MANUAL"


class FMSCheckoutRequest(BaseModel):
    operator_user_id: int
    project_id: int
    actual_active_hours: Decimal


class LIMSSampleCreateRequest(BaseModel):
    operator_user_id: int
    project_id: int
    name: str
    target_dept_id: int
    test_item_name: str
    sample_count: int = 1
    internal_test_price: Decimal = Decimal("80.0000")
    external_test_price: Decimal = Decimal("180.0000")


class LIMSSampleCOARequest(BaseModel):
    operator_user_id: int
    project_id: int
    status: str = "COMPLETED"
    coa_metrics: Dict[str, Any]


class LIMSConsumableClaimRequest(BaseModel):
    operator_user_id: int
    project_id: int
    consumable_id: int
    quantity: Decimal


class ELNCreateRequest(BaseModel):
    operator_user_id: int
    project_id: int
    title: str
    markdown_content: str
    conditions: Dict[str, Any] = {}
    linked_reservation_id: Optional[int] = None
    linked_sample_id: Optional[int] = None


class ELNLockRequest(BaseModel):
    operator_user_id: int
    project_id: int


# ==================== 辅助序列化与保密权限工具 ====================

def check_project_confidential_access(db: Session, viewer_user_id: Optional[int], project: Project) -> tuple[bool, Optional[str]]:
    """
    校验查看者是否有权访问某项目的保密内容（ELN 正文与 LIMS 详细谱图）：
    - 系统管理员 (ADMIN) 或该项目在册成员 (ProjectMember) 允许访问；
    - 若某员工所属的行政科主任 (DEPT_HEAD) 不在该保密项目的 ProjectMember 列表中，
      严禁其访问该项目的 ELN 实验记录正文与 LIMS 具体检测谱图。
    """
    if not viewer_user_id:
        return False, "未指定当前查看者身份"
    viewer = db.query(User).filter(User.id == viewer_user_id).first()
    if not viewer:
        return False, "查看者用户不存在"
    if viewer.system_role == "ADMIN":
        return True, None
    member = (
        db.query(ProjectMember)
        .filter(ProjectMember.project_id == project.id, ProjectMember.user_id == viewer.id)
        .first()
    )
    if member:
        return True, None
    if not project.is_confidential:
        return True, None
    return (
        False,
        f"保密隔离拦截：您（{viewer.full_name}，角色:{viewer.system_role}）不在保密项目【{project.code}】的成员列表中，仅可查看本科室人员机时与设备流水，无权查阅该项目 ELN 正文及 LIMS 谱图数据。",
    )


def compute_eln_synthesized_cost(db: Session, eln: ELNRecord) -> Decimal:
    """汇总计算单篇 ELN 关联的 FMS 机时费 + LIMS 样品检测费"""
    total = Decimal("0.0000")
    if eln.linked_reservation_id:
        res = db.query(Reservation).filter(Reservation.id == eln.linked_reservation_id).first()
        if res:
            amt = res.settled_amount if res.status == "COMPLETED" else res.hold_amount
            total += quantize_dec(amt)
    if eln.linked_sample_id:
        smp = db.query(Sample).filter(Sample.id == eln.linked_sample_id).first()
        if smp:
            total += quantize_dec(smp.total_test_fee)
    return quantize_dec(total)


def serialize_devices(db: Session) -> List[Dict[str, Any]]:
    """序列化全部设备台账状态"""
    devices = db.query(Device).order_by(Device.id.asc()).all()
    result = []
    for d in devices:
        result.append(
            {
                "id": d.id,
                "code": d.code,
                "name": d.name,
                "owner_dept_id": d.owner_dept_id,
                "owner_dept_name": d.owner_department.name if d.owner_department else "",
                "pos_x": d.pos_x,
                "pos_y": d.pos_y,
                "status": d.status,
                "standby_current_threshold": str(quantize_dec(d.standby_current_threshold)),
                "current_amps": str(quantize_dec(d.current_amps)),
                "internal_hourly_rate": str(quantize_dec(d.internal_hourly_rate)),
                "external_hourly_rate": str(quantize_dec(d.external_hourly_rate)),
                "penalty_factor": str(quantize_dec(d.penalty_factor)),
            }
        )
    return result


# ==================== 核心业务路由 ====================

@app.get("/api/v1/bootstrap")
def get_bootstrap_data(
    operator_user_id: Optional[int] = Query(None),
    project_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    """获取全量工作台初始化数据（含基于当前操作员上下文的 LIMS 谱图与 ELN 保密脱敏）"""
    departments = [
        {"id": d.id, "code": d.code, "name": d.name}
        for d in db.query(Department).order_by(Department.id.asc()).all()
    ]
    users = [
        {
            "id": u.id,
            "username": u.username,
            "full_name": u.full_name,
            "rfid_card_id": u.rfid_card_id,
            "system_role": u.system_role,
            "home_dept_id": u.home_dept_id,
            "home_dept_name": u.home_department.name if u.home_department else "",
        }
        for u in db.query(User).order_by(User.id.asc()).all()
    ]
    projects = [
        {
            "id": p.id,
            "code": p.code,
            "name": p.name,
            "lead_dept_id": p.lead_dept_id,
            "pi_user_id": p.pi_user_id,
            "total_budget": str(quantize_dec(p.total_budget)),
            "frozen_balance": str(quantize_dec(p.frozen_balance)),
            "available_balance": str(quantize_dec(p.available_balance)),
            "is_confidential": p.is_confidential,
        }
        for p in db.query(Project).order_by(Project.id.asc()).all()
    ]
    project_members = [
        {
            "id": pm.id,
            "project_id": pm.project_id,
            "project_code": pm.project.code if pm.project else "",
            "user_id": pm.user_id,
            "user_name": pm.user.full_name if pm.user else "",
            "user_home_dept_id": pm.user.home_dept_id if pm.user else None,
            "project_role": pm.project_role,
            "spending_limit": str(quantize_dec(pm.spending_limit)),
            "used_quota": str(quantize_dec(pm.used_quota)),
        }
        for pm in db.query(ProjectMember).order_by(ProjectMember.id.asc()).all()
    ]
    reservations = [
        {
            "id": r.id,
            "device_id": r.device_id,
            "device_code": r.device.code if r.device else "",
            "project_id": r.project_id,
            "project_code": r.project.code if r.project else "",
            "operator_user_id": r.operator_user_id,
            "operator_name": r.operator.full_name if r.operator else "",
            "start_time": r.start_time.isoformat(),
            "end_time": r.end_time.isoformat(),
            "reserved_hours": str(quantize_dec(r.reserved_hours)),
            "actual_active_hours": str(quantize_dec(r.actual_active_hours)),
            "status": r.status,
            "rate_type": r.rate_type,
            "applied_rate": str(quantize_dec(r.applied_rate)),
            "hold_amount": str(quantize_dec(r.hold_amount)),
            "settled_amount": str(quantize_dec(r.settled_amount)),
            "checkin_method": r.checkin_method,
        }
        for r in db.query(Reservation).order_by(Reservation.id.desc()).all()
    ]
    consumables = [
        {
            "id": c.id,
            "code": c.code,
            "name": c.name,
            "spec": c.spec,
            "owner_dept_id": c.owner_dept_id,
            "owner_dept_name": c.owner_department.name if c.owner_department else "",
            "stock_qty": str(quantize_dec(c.stock_qty)),
            "safety_threshold": str(quantize_dec(c.safety_threshold)),
            "internal_unit_price": str(quantize_dec(c.internal_unit_price)),
            "external_unit_price": str(quantize_dec(c.external_unit_price)),
        }
        for c in db.query(Consumable).order_by(Consumable.id.asc()).all()
    ]

    # 样品列表：若当前操作员无该项目保密访问权，则脱敏隐藏 COA 具体谱图指标
    samples_list = []
    for s in db.query(Sample).order_by(Sample.id.desc()).all():
        allowed, reason = check_project_confidential_access(db, operator_user_id, s.project)
        raw_coa = json.loads(s.coa_metrics_json or "{}")
        samples_list.append(
            {
                "id": s.id,
                "barcode": s.barcode,
                "name": s.name,
                "project_id": s.project_id,
                "project_code": s.project.code if s.project else "",
                "submitter_user_id": s.submitter_user_id,
                "submitter_name": s.submitter.full_name if s.submitter else "",
                "target_dept_id": s.target_dept_id,
                "target_dept_name": s.target_department.name if s.target_department else "",
                "test_item_name": s.test_item_name,
                "sample_count": s.sample_count,
                "rate_type": s.rate_type,
                "applied_unit_price": str(quantize_dec(s.applied_unit_price)),
                "total_test_fee": str(quantize_dec(s.total_test_fee)),
                "status": s.status,
                "coa_metrics": raw_coa if allowed else {"_redacted": reason},
                "coa_accessible": allowed,
                "completed_at": s.completed_at.isoformat() if s.completed_at else None,
            }
        )

    # ELN 列表：按项目保密边界脱敏
    eln_list = []
    for e in db.query(ELNRecord).order_by(ELNRecord.id.desc()).all():
        allowed, reason = check_project_confidential_access(db, operator_user_id, e.project)
        synth_cost = compute_eln_synthesized_cost(db, e)
        eln_list.append(
            {
                "id": e.id,
                "title": e.title,
                "project_id": e.project_id,
                "project_code": e.project.code if e.project else "",
                "author_user_id": e.author_user_id,
                "author_name": e.author.full_name if e.author else "",
                "markdown_content": e.markdown_content if allowed else f"🔒 [{reason}]",
                "conditions_json": json.loads(e.conditions_json or "{}") if allowed else {},
                "linked_reservation_id": e.linked_reservation_id,
                "linked_sample_id": e.linked_sample_id,
                "synthesized_total_cost": str(synth_cost),
                "is_locked": e.is_locked,
                "signed_by_user_id": e.signed_by_user_id,
                "signed_at": e.signed_at.isoformat() if e.signed_at else None,
                "accessible": allowed,
            }
        )

    ledgers = [
        {
            "id": l.id,
            "idempotency_key": l.idempotency_key,
            "tx_type": l.tx_type,
            "project_id": l.project_id,
            "project_code": l.project.code if l.project else "",
            "operator_user_id": l.operator_user_id,
            "operator_name": l.operator.full_name if l.operator else "",
            "beneficiary_dept_id": l.beneficiary_dept_id,
            "beneficiary_dept_name": l.beneficiary_department.name if l.beneficiary_department else "",
            "rate_type": l.rate_type,
            "amount": str(quantize_dec(l.amount)),
            "balance_after": str(quantize_dec(l.balance_after)),
            "frozen_after": str(quantize_dec(l.frozen_after)),
            "reference_type": l.reference_type,
            "reference_id": l.reference_id,
            "memo": l.memo,
            "created_at": l.created_at.isoformat(),
        }
        for l in db.query(BillingLedger).order_by(BillingLedger.id.desc()).all()
    ]

    # 统计各行政科室内部服务产值（SETTLE_FMS + SETTLE_LIMS）
    dept_revenue_summary = []
    for d in departments:
        internal_rev = (
            db.query(func.coalesce(func.sum(BillingLedger.amount), 0))
            .filter(
                BillingLedger.beneficiary_dept_id == d["id"],
                BillingLedger.tx_type.in_(["SETTLE_FMS", "SETTLE_LIMS"]),
                BillingLedger.rate_type == "INTERNAL",
            )
            .scalar()
        )
        external_rev = (
            db.query(func.coalesce(func.sum(BillingLedger.amount), 0))
            .filter(
                BillingLedger.beneficiary_dept_id == d["id"],
                BillingLedger.tx_type.in_(["SETTLE_FMS", "SETTLE_LIMS"]),
                BillingLedger.rate_type == "EXTERNAL",
            )
            .scalar()
        )
        total_rev = quantize_dec(internal_rev) + quantize_dec(external_rev)
        dept_revenue_summary.append(
            {
                "dept_id": d["id"],
                "dept_code": d["code"],
                "dept_name": d["name"],
                "internal_revenue": str(quantize_dec(internal_rev)),
                "external_revenue": str(quantize_dec(external_rev)),
                "total_revenue": str(total_rev),
            }
        )

    return {
        "departments": departments,
        "users": users,
        "projects": projects,
        "project_members": project_members,
        "devices": serialize_devices(db),
        "reservations": reservations,
        "consumables": consumables,
        "samples": samples_list,
        "eln_records": eln_list,
        "ledgers": ledgers,
        "dept_revenue_summary": dept_revenue_summary,
    }


@app.post("/api/v1/org/project-members")
def upsert_project_member(
    req: ProjectMemberUpsertRequest,
    db: Session = Depends(get_db),
):
    """Module 0: PI 或系统管理员拉人入项并设置/调整个人消费配额上限"""
    operator, project, op_member = verify_operation_context(
        db, req.operator_user_id, req.project_id, require_write=True
    )
    if op_member.project_role != "PI" and operator.system_role != "ADMIN":
        raise HTTPException(status_code=403, detail="仅项目负责人(PI)或系统管理员可配置项目成员及配额")

    target_user = db.query(User).filter(User.id == req.target_user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="目标员工不存在")

    member = (
        db.query(ProjectMember)
        .filter(
            ProjectMember.project_id == req.project_id,
            ProjectMember.user_id == req.target_user_id,
        )
        .first()
    )
    limit_dec = quantize_dec(req.spending_limit)
    if member:
        member.project_role = req.project_role
        member.spending_limit = limit_dec
    else:
        member = ProjectMember(
            project_id=req.project_id,
            user_id=req.target_user_id,
            project_role=req.project_role,
            spending_limit=limit_dec,
            used_quota=Decimal("0.0000"),
        )
        db.add(member)

    db.commit()
    db.refresh(member)
    return {
        "member_id": member.id,
        "project_id": member.project_id,
        "user_id": member.user_id,
        "project_role": member.project_role,
        "spending_limit": str(quantize_dec(member.spending_limit)),
        "used_quota": str(quantize_dec(member.used_quota)),
    }


@app.post("/api/v1/fms/reservations")
def create_fms_reservation(
    req: FMSReservationCreateRequest,
    db: Session = Depends(get_db),
):
    """Module A: 提交设备机时预约，校验时间冲突、跨科/科内双费率并执行预授权冻结(HOLD)"""
    if req.end_time <= req.start_time:
        raise HTTPException(status_code=400, detail="预约结束时间必须晚于开始时间")

    operator, project, membership = verify_operation_context(
        db, req.operator_user_id, req.project_id, require_write=True
    )
    device = db.query(Device).filter(Device.id == req.device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="预约设备不存在")
    if device.status == "FAULT":
        raise HTTPException(status_code=400, detail=f"设备【{device.code}】当前处于故障(FAULT)状态，禁止预约")

    # 时间段冲突检测
    conflict = (
        db.query(Reservation)
        .filter(
            Reservation.device_id == device.id,
            Reservation.status.in_(["RESERVED", "ACTIVE"]),
            Reservation.start_time < req.end_time,
            Reservation.end_time > req.start_time,
        )
        .first()
    )
    if conflict:
        raise HTTPException(
            status_code=409,
            detail=f"机时预约冲突：设备【{device.code}】在该时段已被预约(单号 #{conflict.id})",
        )

    duration_seconds = Decimal(str((req.end_time - req.start_time).total_seconds()))
    reserved_hours = quantize_dec(duration_seconds / Decimal("3600"))

    rate_type, applied_rate = determine_rate_type_and_price(
        operator.home_dept_id,
        device.owner_dept_id,
        device.internal_hourly_rate,
        device.external_hourly_rate,
    )
    hold_amount = quantize_dec(reserved_hours * applied_rate)

    reservation = Reservation(
        device_id=device.id,
        project_id=project.id,
        operator_user_id=operator.id,
        start_time=req.start_time,
        end_time=req.end_time,
        reserved_hours=reserved_hours,
        actual_active_hours=Decimal("0.0000"),
        status="RESERVED",
        rate_type=rate_type,
        applied_rate=applied_rate,
        hold_amount=hold_amount,
        settled_amount=Decimal("0.0000"),
    )
    db.add(reservation)
    db.flush()

    idem_key = f"BILL_FMS_HOLD_{reservation.id}"
    create_hold_transaction(
        db,
        idempotency_key=idem_key,
        project=project,
        membership=membership,
        operator_user_id=operator.id,
        beneficiary_dept_id=device.owner_dept_id,
        rate_type=rate_type,
        hold_amount=hold_amount,
        reference_type="FMS",
        reference_id=str(reservation.id),
        memo=f"FMS机时预约预授权冻结: 设备{device.code} ({reserved_hours}h @ {applied_rate}/h [{rate_type}])",
    )

    if device.status == "IDLE":
        device.status = "RESERVED"

    db.commit()
    return {
        "reservation_id": reservation.id,
        "status": reservation.status,
        "rate_type": rate_type,
        "applied_rate": str(applied_rate),
        "hold_amount": str(hold_amount),
        "ledger_idempotency_key": idem_key,
        "project_available_balance": str(quantize_dec(project.available_balance)),
        "project_frozen_balance": str(quantize_dec(project.frozen_balance)),
    }


@app.post("/api/v1/fms/reservations/{reservation_id}/checkin")
def checkin_fms_reservation(
    reservation_id: int,
    req: FMSCheckinRequest,
    db: Session = Depends(get_db),
):
    """Module A: 预约上机签到（支持网页端手动签到或硬件联动签到）"""
    verify_operation_context(db, req.operator_user_id, req.project_id, require_write=True)
    res = db.query(Reservation).filter(Reservation.id == reservation_id).first()
    if not res:
        raise HTTPException(status_code=404, detail="预约单不存在")
    if res.status != "RESERVED":
        raise HTTPException(status_code=400, detail=f"当前预约单状态为 {res.status}，无法重复签到")

    res.status = "ACTIVE"
    res.checkin_method = req.checkin_method
    res.device.status = "RUNNING"
    if quantize_dec(res.device.current_amps) < quantize_dec(res.device.standby_current_threshold):
        res.device.current_amps = quantize_dec(res.device.standby_current_threshold) + Decimal("3.2000")

    db.commit()
    return {
        "reservation_id": res.id,
        "reservation_status": res.status,
        "device_status": res.device.status,
    }


@app.post("/api/v1/fms/reservations/{reservation_id}/checkout")
def checkout_fms_reservation(
    reservation_id: int,
    req: FMSCheckoutRequest,
    db: Session = Depends(get_db),
):
    """Module A: 下机结算，自动计算 max(预约时长*爽约系数, 实际高负载时长)*单价，释放多余冻结款"""
    operator, project, membership = verify_operation_context(
        db, req.operator_user_id, req.project_id, require_write=True
    )
    res = db.query(Reservation).filter(Reservation.id == reservation_id).first()
    if not res:
        raise HTTPException(status_code=404, detail="预约单不存在")
    if res.status == "COMPLETED":
        raise HTTPException(status_code=400, detail="该预约单已完成结算，请勿重复下机")

    res.actual_active_hours = quantize_dec(req.actual_active_hours)
    settled_cost, refunded_hold, _ = settle_fms_reservation(
        db,
        reservation_id=res.id,
        project=project,
        membership=membership,
        operator_user_id=operator.id,
        beneficiary_dept_id=res.device.owner_dept_id,
        rate_type=res.rate_type,
        applied_rate=res.applied_rate,
        reserved_hours=res.reserved_hours,
        penalty_factor=res.device.penalty_factor,
        actual_active_hours=res.actual_active_hours,
        hold_amount=res.hold_amount,
    )
    res.settled_amount = settled_cost
    res.status = "COMPLETED"
    res.device.status = "IDLE"
    res.device.current_amps = Decimal("0.2000")

    db.commit()
    return {
        "reservation_id": res.id,
        "status": res.status,
        "settled_amount": str(settled_cost),
        "refunded_hold": str(refunded_hold),
        "rate_type": res.rate_type,
        "beneficiary_dept_id": res.device.owner_dept_id,
        "project_available_balance": str(quantize_dec(project.available_balance)),
        "project_frozen_balance": str(quantize_dec(project.frozen_balance)),
        "member_used_quota": str(quantize_dec(membership.used_quota)),
    }


@app.post("/api/v1/lims/samples")
def register_lims_sample(
    req: LIMSSampleCreateRequest,
    db: Session = Depends(get_db),
):
    """Module B: LIMS 样品送检登记，自动生成唯一 Barcode 并执行实时复式扣费"""
    operator, project, membership = verify_operation_context(
        db, req.operator_user_id, req.project_id, require_write=True
    )
    rate_type, unit_price = determine_rate_type_and_price(
        operator.home_dept_id,
        req.target_dept_id,
        req.internal_test_price,
        req.external_test_price,
    )
    total_fee = quantize_dec(unit_price * Decimal(str(req.sample_count)))
    barcode = f"SMP-{datetime.utcnow().strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"

    sample = Sample(
        barcode=barcode,
        name=req.name,
        project_id=project.id,
        submitter_user_id=operator.id,
        target_dept_id=req.target_dept_id,
        test_item_name=req.test_item_name,
        sample_count=req.sample_count,
        internal_test_price=quantize_dec(req.internal_test_price),
        external_test_price=quantize_dec(req.external_test_price),
        rate_type=rate_type,
        applied_unit_price=unit_price,
        total_test_fee=total_fee,
        status="REGISTERED",
        coa_metrics_json="{}",
    )
    db.add(sample)
    db.flush()

    idem_key = f"BILL_LIMS_SMP_{sample.id}"
    settle_lims_immediate(
        db,
        idempotency_key=idem_key,
        project=project,
        membership=membership,
        operator_user_id=operator.id,
        beneficiary_dept_id=req.target_dept_id,
        rate_type=rate_type,
        amount=total_fee,
        reference_type="LIMS_SAMPLE",
        reference_id=sample.barcode,
        memo=f"LIMS样品送检结算: {sample.barcode} ({req.test_item_name} x{req.sample_count} [{rate_type}])",
    )

    db.commit()
    return {
        "sample_id": sample.id,
        "barcode": sample.barcode,
        "status": sample.status,
        "rate_type": rate_type,
        "total_test_fee": str(total_fee),
        "ledger_idempotency_key": idem_key,
    }


@app.post("/api/v1/lims/samples/{sample_id}/coa")
def update_sample_coa(
    sample_id: int,
    req: LIMSSampleCOARequest,
    db: Session = Depends(get_db),
):
    """Module B: 录入/更新样品检测指标并生成标准化 COA 报告"""
    verify_operation_context(db, req.operator_user_id, req.project_id, require_write=True)
    sample = db.query(Sample).filter(Sample.id == sample_id).first()
    if not sample:
        raise HTTPException(status_code=404, detail="样品记录不存在")

    sample.status = req.status
    sample.coa_metrics_json = json.dumps(req.coa_metrics, ensure_ascii=False)
    if req.status == "COMPLETED":
        sample.completed_at = datetime.utcnow()

    db.commit()
    return {
        "sample_id": sample.id,
        "barcode": sample.barcode,
        "status": sample.status,
        "coa_metrics": req.coa_metrics,
        "completed_at": sample.completed_at.isoformat() if sample.completed_at else None,
    }


@app.post("/api/v1/lims/consumables/claim")
def claim_lims_consumable(
    req: LIMSConsumableClaimRequest,
    db: Session = Depends(get_db),
):
    """Module B: 扫码/手动领用试剂耗材，扣减库存并实时计入项目账单及个人配额"""
    operator, project, membership = verify_operation_context(
        db, req.operator_user_id, req.project_id, require_write=True
    )
    consumable = db.query(Consumable).filter(Consumable.id == req.consumable_id).first()
    if not consumable:
        raise HTTPException(status_code=404, detail="试剂耗材不存在")

    qty = quantize_dec(req.quantity)
    if qty <= Decimal("0.0000"):
        raise HTTPException(status_code=400, detail="领用数量必须大于 0")
    if quantize_dec(consumable.stock_qty) < qty:
        raise HTTPException(
            status_code=400,
            detail=f"耗材库存不足：【{consumable.name}】当前库存 {consumable.stock_qty}，请求领用 {qty}",
        )

    rate_type, unit_price = determine_rate_type_and_price(
        operator.home_dept_id,
        consumable.owner_dept_id,
        consumable.internal_unit_price,
        consumable.external_unit_price,
    )
    total_cost = quantize_dec(unit_price * qty)
    consumable.stock_qty = quantize_dec(consumable.stock_qty) - qty

    idem_key = f"BILL_LIMS_CONS_{consumable.id}_{uuid.uuid4().hex[:8].upper()}"
    settle_lims_immediate(
        db,
        idempotency_key=idem_key,
        project=project,
        membership=membership,
        operator_user_id=operator.id,
        beneficiary_dept_id=consumable.owner_dept_id,
        rate_type=rate_type,
        amount=total_cost,
        reference_type="LIMS_CONSUMABLE",
        reference_id=consumable.code,
        memo=f"LIMS耗材领用结算: {consumable.name} x{qty} @ {unit_price} [{rate_type}]",
    )

    db.commit()
    return {
        "consumable_id": consumable.id,
        "remaining_stock": str(quantize_dec(consumable.stock_qty)),
        "rate_type": rate_type,
        "unit_price": str(unit_price),
        "total_cost": str(total_cost),
        "ledger_idempotency_key": idem_key,
        "member_used_quota": str(quantize_dec(membership.used_quota)),
    }


@app.get("/api/v1/eln/records")
def list_eln_records(
    viewer_user_id: int = Query(...),
    project_id: int = Query(...),
    db: Session = Depends(get_db),
):
    """Module C: 查询特定项目下的 ELN 实验记录（严格校验跨科室科主任保密隔离边界）"""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")

    allowed, denial_reason = check_project_confidential_access(db, viewer_user_id, project)
    if not allowed:
        return {
            "access_granted": False,
            "denial_reason": denial_reason,
            "records": [],
        }

    records = (
        db.query(ELNRecord)
        .filter(ELNRecord.project_id == project_id)
        .order_by(ELNRecord.id.desc())
        .all()
    )
    out = []
    for r in records:
        out.append(
            {
                "id": r.id,
                "title": r.title,
                "markdown_content": r.markdown_content,
                "conditions_json": json.loads(r.conditions_json or "{}"),
                "linked_reservation_id": r.linked_reservation_id,
                "linked_sample_id": r.linked_sample_id,
                "synthesized_total_cost": str(compute_eln_synthesized_cost(db, r)),
                "is_locked": r.is_locked,
                "signed_at": r.signed_at.isoformat() if r.signed_at else None,
            }
        )
    return {
        "access_granted": True,
        "denial_reason": None,
        "records": out,
    }


@app.post("/api/v1/eln/records")
def create_eln_record(
    req: ELNCreateRequest,
    db: Session = Depends(get_db),
):
    """Module C: 创建 ELN 实验记录，支持一键挂载 FMS 机时单与 LIMS 样品"""
    operator, project, _ = verify_operation_context(
        db, req.operator_user_id, req.project_id, require_write=True
    )
    eln = ELNRecord(
        title=req.title,
        project_id=project.id,
        author_user_id=operator.id,
        markdown_content=req.markdown_content,
        conditions_json=json.dumps(req.conditions, ensure_ascii=False),
        linked_reservation_id=req.linked_reservation_id,
        linked_sample_id=req.linked_sample_id,
        is_locked=False,
    )
    db.add(eln)
    db.commit()
    db.refresh(eln)

    return {
        "eln_id": eln.id,
        "title": eln.title,
        "synthesized_total_cost": str(compute_eln_synthesized_cost(db, eln)),
        "is_locked": eln.is_locked,
    }


@app.post("/api/v1/eln/records/{eln_id}/lock")
def lock_eln_record(
    eln_id: int,
    req: ELNLockRequest,
    db: Session = Depends(get_db),
):
    """Module C: ELN 提交审计签名锁定（Sign & Lock），锁定后永久不可篡改"""
    operator, _, _ = verify_operation_context(
        db, req.operator_user_id, req.project_id, require_write=True
    )
    eln = db.query(ELNRecord).filter(ELNRecord.id == eln_id).first()
    if not eln:
        raise HTTPException(status_code=404, detail="ELN 记录不存在")
    if eln.is_locked:
        raise HTTPException(status_code=400, detail="该篇 ELN 记录已处于审计锁定状态，禁止重复修改")

    eln.is_locked = True
    eln.signed_by_user_id = operator.id
    eln.signed_at = datetime.utcnow()
    db.commit()

    return {
        "eln_id": eln.id,
        "is_locked": True,
        "signed_by_user_id": operator.id,
        "signed_at": eln.signed_at.isoformat(),
    }


@app.websocket("/ws/lab-status")
async def lab_status_websocket(websocket: WebSocket):
    """实时推送实验室平面图设备状态与电流遥测数据"""
    await ws_manager.connect(websocket)
    try:
        db = SessionLocal()
        try:
            await websocket.send_json(
                {
                    "event": "INITIAL_SNAPSHOT",
                    "devices": serialize_devices(db),
                    "timestamp": datetime.utcnow().isoformat(),
                }
            )
        finally:
            db.close()

        while True:
            _ = await websocket.receive_text()
            db = SessionLocal()
            try:
                await websocket.send_json(
                    {
                        "event": "STATE_CHANGE",
                        "devices": serialize_devices(db),
                        "timestamp": datetime.utcnow().isoformat(),
                    }
                )
            finally:
                db.close()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)


# ==================== 数据库建表与开箱即用演示数据初始化 ====================

def init_db_and_seed():
    """初始化 SQLite/PostgreSQL 表结构并写入矩阵式组织、跨科项目、设备、耗材及初始账本种子数据"""
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        if db.query(Department).count() > 0:
            return

        # 1. 创建三大行政科室
        dept_mat = Department(code="DEPT-MAT", name="先进材料与微纳加工室")
        dept_bio = Department(code="DEPT-BIO", name="生物医药与合成生物学室")
        dept_ana = Department(code="DEPT-ANA", name="公共精密分析测试中心")
        db.add_all([dept_mat, dept_bio, dept_ana])
        db.flush()

        # 2. 创建典型角色用户（含跨科PI、科主任、骨干实验员、只读观察员）
        u_admin = User(
            username="admin",
            full_name="林总工 (系统管理员)",
            rfid_card_id="CARD_000001",
            system_role="ADMIN",
            home_dept_id=dept_ana.id,
        )
        u_pi_mat = User(
            username="pi_zhang",
            full_name="张教授 (材料室PI)",
            rfid_card_id="CARD_889201",
            system_role="DEPT_HEAD",
            home_dept_id=dept_mat.id,
        )
        u_head_bio = User(
            username="head_wang",
            full_name="王主任 (生医室科主任-非纳米项目成员)",
            rfid_card_id="CARD_889202",
            system_role="DEPT_HEAD",
            home_dept_id=dept_bio.id,
        )
        u_res_bio = User(
            username="chen_res",
            full_name="陈博士 (生医室骨干实验员)",
            rfid_card_id="CARD_889203",
            system_role="STAFF",
            home_dept_id=dept_bio.id,
        )
        u_res_ana = User(
            username="liu_ana",
            full_name="刘工 (分析中心工程师)",
            rfid_card_id="CARD_889204",
            system_role="STAFF",
            home_dept_id=dept_ana.id,
        )
        db.add_all([u_admin, u_pi_mat, u_head_bio, u_res_bio, u_res_ana])
        db.flush()

        # 3. 创建跨科室虚拟项目组
        prj_nano = Project(
            code="PRJ-2026-01",
            name="纳米靶向药物载体跨科联合攻关 (保密项目)",
            lead_dept_id=dept_mat.id,
            pi_user_id=u_pi_mat.id,
            total_budget=Decimal("0.0000"),
            frozen_balance=Decimal("0.0000"),
            available_balance=Decimal("0.0000"),
            is_confidential=True,
        )
        prj_open = Project(
            code="PRJ-2026-02",
            name="高通量质谱公共方法学开发基金",
            lead_dept_id=dept_ana.id,
            pi_user_id=u_res_ana.id,
            total_budget=Decimal("0.0000"),
            frozen_balance=Decimal("0.0000"),
            available_balance=Decimal("0.0000"),
            is_confidential=False,
        )
        db.add_all([prj_nano, prj_open])
        db.flush()

        # 通过复式记账引擎为两个项目注入初始拨款 (DEPOSIT)
        from .billing_engine import deposit_project_grant

        deposit_project_grant(
            db,
            idempotency_key="SEED_DEPOSIT_PRJ_01",
            project=prj_nano,
            operator_user_id=u_pi_mat.id,
            amount=Decimal("50000.0000"),
            erp_voucher_no="ERP-2026-INIT-001",
        )
        deposit_project_grant(
            db,
            idempotency_key="SEED_DEPOSIT_PRJ_02",
            project=prj_open,
            operator_user_id=u_res_ana.id,
            amount=Decimal("30000.0000"),
            erp_voucher_no="ERP-2026-INIT-002",
        )

        # 4. 配置跨科室项目成员与个人消费配额 (注意：生医室王主任 u_head_bio 不在 PRJ-2026-01 中，用于演示保密隔离)
        pm1 = ProjectMember(
            project_id=prj_nano.id,
            user_id=u_pi_mat.id,
            project_role="PI",
            spending_limit=Decimal("30000.0000"),
            used_quota=Decimal("0.0000"),
        )
        pm2 = ProjectMember(
            project_id=prj_nano.id,
            user_id=u_res_bio.id,
            project_role="RESEARCHER",
            spending_limit=Decimal("8000.0000"),
            used_quota=Decimal("0.0000"),
        )
        pm3 = ProjectMember(
            project_id=prj_nano.id,
            user_id=u_res_ana.id,
            project_role="OBSERVER",
            spending_limit=Decimal("0.0000"),
            used_quota=Decimal("0.0000"),
        )
        pm4 = ProjectMember(
            project_id=prj_open.id,
            user_id=u_res_ana.id,
            project_role="PI",
            spending_limit=Decimal("20000.0000"),
            used_quota=Decimal("0.0000"),
        )
        pm5 = ProjectMember(
            project_id=prj_open.id,
            user_id=u_head_bio.id,
            project_role="RESEARCHER",
            spending_limit=Decimal("10000.0000"),
            used_quota=Decimal("0.0000"),
        )
        db.add_all([pm1, pm2, pm3, pm4, pm5])
        db.flush()

        # 5. 创建实验室设备台账（带平面图坐标与科内/跨科双费率）
        dev_cnc = Device(
            code="CNC-01",
            name="五轴超精密微纳加工中心",
            owner_dept_id=dept_mat.id,
            pos_x=18,
            pos_y=28,
            status="IDLE",
            standby_current_threshold=Decimal("2.0000"),
            current_amps=Decimal("0.3500"),
            internal_hourly_rate=Decimal("80.0000"),
            external_hourly_rate=Decimal("200.0000"),
            penalty_factor=Decimal("0.5000"),
        )
        dev_sem = Device(
            code="SEM-02",
            name="场发射扫描电子显微镜 (FE-SEM)",
            owner_dept_id=dept_mat.id,
            pos_x=52,
            pos_y=28,
            status="IDLE",
            standby_current_threshold=Decimal("1.8000"),
            current_amps=Decimal("0.4000"),
            internal_hourly_rate=Decimal("120.0000"),
            external_hourly_rate=Decimal("300.0000"),
            penalty_factor=Decimal("0.5000"),
        )
        dev_lcms = Device(
            code="LCMS-01",
            name="超高效液相色谱-三重四极杆质谱联用仪",
            owner_dept_id=dept_ana.id,
            pos_x=35,
            pos_y=68,
            status="IDLE",
            standby_current_threshold=Decimal("1.5000"),
            current_amps=Decimal("0.5000"),
            internal_hourly_rate=Decimal("100.0000"),
            external_hourly_rate=Decimal("260.0000"),
            penalty_factor=Decimal("0.5000"),
        )
        dev_seq = Device(
            code="SEQ-01",
            name="高通量单细胞测序工作站",
            owner_dept_id=dept_bio.id,
            pos_x=76,
            pos_y=62,
            status="IDLE",
            standby_current_threshold=Decimal("1.2000"),
            current_amps=Decimal("0.2500"),
            internal_hourly_rate=Decimal("90.0000"),
            external_hourly_rate=Decimal("220.0000"),
            penalty_factor=Decimal("0.5000"),
        )
        db.add_all([dev_cnc, dev_sem, dev_lcms, dev_seq])
        db.flush()

        # 6. 创建试剂耗材库存
        c1 = Consumable(
            code="CONS-PTFE-01",
            name="高纯聚四氟乙烯微流控芯片基底",
            spec="50mm x 50mm / 盒(10片)",
            owner_dept_id=dept_mat.id,
            stock_qty=Decimal("45.0000"),
            safety_threshold=Decimal("10.0000"),
            internal_unit_price=Decimal("60.0000"),
            external_unit_price=Decimal("110.0000"),
        )
        c2 = Consumable(
            code="CONS-ACN-HPLC",
            name="LC-MS级超纯乙腈 (Merck)",
            spec="4L / 瓶",
            owner_dept_id=dept_ana.id,
            stock_qty=Decimal("8.0000"),
            safety_threshold=Decimal("10.0000"),
            internal_unit_price=Decimal("150.0000"),
            external_unit_price=Decimal("240.0000"),
        )
        c3 = Consumable(
            code="CONS-LIPID-PEG",
            name="DSPE-PEG2000 脂质纳米粒试剂盒",
            spec="100mg / 支",
            owner_dept_id=dept_bio.id,
            stock_qty=Decimal("25.0000"),
            safety_threshold=Decimal("5.0000"),
            internal_unit_price=Decimal("320.0000"),
            external_unit_price=Decimal("500.0000"),
        )
        db.add_all([c1, c2, c3])
        db.flush()

        # 7. 创建一笔演示预约单（生医室陈博士跨科预约材料室 CNC-01，触发 EXTERNAL 跨科费率 200元/h）
        now = datetime.utcnow()
        seed_res = Reservation(
            device_id=dev_cnc.id,
            project_id=prj_nano.id,
            operator_user_id=u_res_bio.id,
            start_time=now - timedelta(hours=1),
            end_time=now + timedelta(hours=1),
            reserved_hours=Decimal("2.0000"),
            actual_active_hours=Decimal("0.0000"),
            status="RESERVED",
            rate_type="EXTERNAL",
            applied_rate=Decimal("200.0000"),
            hold_amount=Decimal("400.0000"),
            settled_amount=Decimal("0.0000"),
        )
        db.add(seed_res)
        db.flush()
        dev_cnc.status = "RESERVED"

        create_hold_transaction(
            db,
            idempotency_key=f"BILL_FMS_HOLD_{seed_res.id}",
            project=prj_nano,
            membership=pm2,
            operator_user_id=u_res_bio.id,
            beneficiary_dept_id=dept_mat.id,
            rate_type="EXTERNAL",
            hold_amount=Decimal("400.0000"),
            reference_type="FMS",
            reference_id=str(seed_res.id),
            memo="FMS机时预约预授权冻结: 生医室陈博士跨科预约材料室 CNC-01 (2.0h @ 200.0000/h [EXTERNAL])",
        )

        # 8. 创建一件演示送检样品（陈博士送检至分析中心，跨科价 180元/份）
        seed_smp = Sample(
            barcode="SMP-20261018-NANO01",
            name="LNP-siRNA 脂质体包封率待测液 #A1",
            project_id=prj_nano.id,
            submitter_user_id=u_res_bio.id,
            target_dept_id=dept_ana.id,
            test_item_name="LC-MS 脂质摩尔比与包封率定量",
            sample_count=2,
            internal_test_price=Decimal("80.0000"),
            external_test_price=Decimal("180.0000"),
            rate_type="EXTERNAL",
            applied_unit_price=Decimal("180.0000"),
            total_test_fee=Decimal("360.0000"),
            status="COMPLETED",
            coa_metrics_json=json.dumps(
                {
                    "PDI_分散系数": 0.082,
                    "平均粒径_nm": 78.4,
                    "包封率_EE_percent": 94.6,
                    "Zeta电位_mV": -4.2,
                    "质控结论": "PASS (符合临床前制剂标准)",
                },
                ensure_ascii=False,
            ),
            completed_at=now,
        )
        db.add(seed_smp)
        db.flush()

        settle_lims_immediate(
            db,
            idempotency_key=f"BILL_LIMS_SMP_{seed_smp.id}",
            project=prj_nano,
            membership=pm2,
            operator_user_id=u_res_bio.id,
            beneficiary_dept_id=dept_ana.id,
            rate_type="EXTERNAL",
            amount=Decimal("360.0000"),
            reference_type="LIMS_SAMPLE",
            reference_id=seed_smp.barcode,
            memo="LIMS样品送检结算: SMP-20261018-NANO01 (LC-MS定量 x2 [EXTERNAL])",
        )

        # 9. 创建一篇挂载了上述预约与样品的保密项目 ELN 实验记录
        seed_eln = ELNRecord(
            title="EXP-2026-001: 微流控芯片合成靶向 LNP 工艺参数优化",
            project_id=prj_nano.id,
            author_user_id=u_res_bio.id,
            markdown_content=(
                "### 1. 实验目的\n"
                "利用材料室 **CNC-01** 加工的 PTFE 微流控混合芯片，制备粒径可控的 LNP-siRNA 纳米颗粒。\n\n"
                "### 2. 关键现象与结果\n"
                "- 水相/有机相流速比设定为 `3:1`，总流速 `12 mL/min`。\n"
                "- 样品 `SMP-20261018-NANO01` 经分析中心 LC-MS 测定包封率达 **94.6%**，PDI 仅为 **0.082**。"
            ),
            conditions_json=json.dumps(
                {"flow_rate_ratio": "3:1", "total_flow_ml_min": 12.0, "temperature_c": 25.0, "ph": 4.0},
                ensure_ascii=False,
            ),
            linked_reservation_id=seed_res.id,
            linked_sample_id=seed_smp.id,
            is_locked=False,
        )
        db.add(seed_eln)
        db.commit()
    finally:
        db.close()


init_db_and_seed()
