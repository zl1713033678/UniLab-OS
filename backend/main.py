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

class AuthLoginRequest(BaseModel):
    username: str
    password: str = "123456"


class AuthRegisterRequest(BaseModel):
    username: str
    password: str
    full_name: str
    email: Optional[str] = ""
    home_dept_id: int
    sub_group_name: Optional[str] = "综合科研组"
    system_role: str = "STAFF"
    rfid_card_id: Optional[str] = None
    join_project_id: Optional[int] = None


class UserRoleUpdateRequest(BaseModel):
    operator_user_id: int
    target_user_id: int
    system_role: str
    status: str = "ACTIVE"
    home_dept_id: Optional[int] = None
    sub_group_name: Optional[str] = None


class DepartmentCreateRequest(BaseModel):
    operator_user_id: int
    code: str
    name: str
    parent_id: Optional[int] = None
    level_type: str = "LAB_GROUP"
    manager_name: Optional[str] = ""


class ProjectCreateRequest(BaseModel):
    operator_user_id: int
    code: str
    name: str
    lead_dept_id: int
    pi_user_id: Optional[int] = None
    initial_budget: Decimal = Decimal("20000.0000")
    is_confidential: bool = True


class ProjectUpdateRequest(BaseModel):
    operator_user_id: int
    code: Optional[str] = None
    name: str
    lead_dept_id: int
    pi_user_id: int
    is_confidential: bool


class DepartmentUpdateRequest(BaseModel):
    operator_user_id: int
    code: str
    name: str
    manager_name: Optional[str] = ""


class UserUpdateRequest(BaseModel):
    operator_user_id: int
    full_name: str
    email: Optional[str] = ""
    rfid_card_id: str
    home_dept_id: int
    sub_group_name: Optional[str] = "核心实验组"
    system_role: str
    status: str = "ACTIVE"


class FMSDeviceUpsertRequest(BaseModel):
    operator_user_id: int
    code: str
    name: str
    owner_dept_id: int
    pos_x: int = 50
    pos_y: int = 50
    status: str = "IDLE"
    standby_current_threshold: Decimal = Decimal("1.5000")
    internal_hourly_rate: Decimal = Decimal("80.0000")
    external_hourly_rate: Decimal = Decimal("200.0000")


class LIMSConsumableUpsertRequest(BaseModel):
    operator_user_id: int
    code: str
    name: str
    spec: str
    owner_dept_id: int
    stock_qty: Decimal = Decimal("20.0000")
    safety_threshold: Decimal = Decimal("5.0000")
    internal_unit_price: Decimal = Decimal("50.0000")
    external_unit_price: Decimal = Decimal("100.0000")


class ELNUpdateRequest(BaseModel):
    operator_user_id: int
    title: str
    markdown_content: str
    conditions: Dict[str, Any] = {}
    linked_reservation_id: Optional[int] = None
    linked_sample_id: Optional[int] = None


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
        {
            "id": d.id,
            "code": d.code,
            "name": d.name,
            "parent_id": getattr(d, "parent_id", None),
            "level_type": getattr(d, "level_type", "DEPT") or "DEPT",
            "manager_name": getattr(d, "manager_name", "") or "",
        }
        for d in db.query(Department).order_by(Department.id.asc()).all()
    ]
    users = [
        {
            "id": u.id,
            "username": u.username,
            "full_name": u.full_name,
            "email": getattr(u, "email", "") or f"{u.username}@unilab.edu.cn",
            "rfid_card_id": u.rfid_card_id,
            "system_role": u.system_role,
            "status": getattr(u, "status", "ACTIVE") or "ACTIVE",
            "sub_group_name": getattr(u, "sub_group_name", "核心实验组") or "核心实验组",
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


@app.post("/api/v1/auth/login")
def auth_login(
    req: AuthLoginRequest,
    db: Session = Depends(get_db),
):
    """用户账号密码登录鉴权接口，返回用户信息及可访问项目上下文"""
    user = db.query(User).filter(User.username == req.username.strip()).first()
    if not user:
        raise HTTPException(status_code=401, detail=f"账号【{req.username}】不存在，请检查用户名或先注册新账号")

    stored_pwd = getattr(user, "password_hash", "123456") or "123456"
    if req.password and req.password != stored_pwd and req.password != "123456":
        raise HTTPException(status_code=401, detail="登录密码错误（演示账号默认通用密码为 123456）")

    user_status = getattr(user, "status", "ACTIVE") or "ACTIVE"
    if user_status == "DISABLED":
        raise HTTPException(status_code=403, detail="该账号已被管理员禁用，请联系系统管理员授权")

    memberships = (
        db.query(ProjectMember)
        .filter(ProjectMember.user_id == user.id)
        .all()
    )
    default_project_id = memberships[0].project_id if memberships else 1

    return {
        "token": f"UNILAB_JWT_{user.id}_{uuid.uuid4().hex[:12]}",
        "user": {
            "id": user.id,
            "username": user.username,
            "full_name": user.full_name,
            "email": getattr(user, "email", "") or f"{user.username}@unilab.edu.cn",
            "rfid_card_id": user.rfid_card_id,
            "system_role": user.system_role,
            "status": user_status,
            "sub_group_name": getattr(user, "sub_group_name", "核心实验组") or "核心实验组",
            "home_dept_id": user.home_dept_id,
            "home_dept_name": user.home_department.name if user.home_department else "",
        },
        "default_project_id": default_project_id,
    }


@app.post("/api/v1/auth/register")
def auth_register(
    req: AuthRegisterRequest,
    db: Session = Depends(get_db),
):
    """新用户自助注册并绑定行政科室与初始项目权限"""
    uname = req.username.strip()
    if not uname or len(uname) < 2:
        raise HTTPException(status_code=400, detail="登录账号长度至少为 2 个字符")
    if db.query(User).filter(User.username == uname).first():
        raise HTTPException(status_code=409, detail=f"登录账号【{uname}】已被注册，请更换其他账号")

    dept = db.query(Department).filter(Department.id == req.home_dept_id).first()
    if not dept:
        raise HTTPException(status_code=404, detail="所选所属行政科室不存在")

    rfid = (req.rfid_card_id or "").strip()
    if not rfid:
        rfid = f"CARD_{uuid.uuid4().hex[:6].upper()}"
    elif db.query(User).filter(User.rfid_card_id == rfid).first():
        raise HTTPException(status_code=409, detail=f"RFID 卡号【{rfid}】已被其他人员绑定")

    allowed_roles = {"ADMIN", "DEPT_HEAD", "PI", "STAFF", "OBSERVER"}
    role = req.system_role if req.system_role in allowed_roles else "STAFF"

    new_user = User(
        username=uname,
        password_hash=req.password or "123456",
        full_name=req.full_name.strip(),
        email=req.email or f"{uname}@unilab.edu.cn",
        rfid_card_id=rfid,
        system_role=role,
        status="ACTIVE",
        sub_group_name=req.sub_group_name or "综合科研组",
        home_dept_id=dept.id,
    )
    db.add(new_user)
    db.flush()

    default_prj_id = 2
    if req.join_project_id:
        prj = db.query(Project).filter(Project.id == req.join_project_id).first()
        if prj:
            default_prj_id = prj.id
            proj_role = "PI" if role in ("ADMIN", "PI") else ("OBSERVER" if role == "OBSERVER" else "RESEARCHER")
            default_limit = Decimal("10000.0000") if proj_role != "OBSERVER" else Decimal("0.0000")
            pm = ProjectMember(
                project_id=prj.id,
                user_id=new_user.id,
                project_role=proj_role,
                spending_limit=default_limit,
                used_quota=Decimal("0.0000"),
            )
            db.add(pm)

    db.commit()
    db.refresh(new_user)
    return {
        "token": f"UNILAB_JWT_{new_user.id}_{uuid.uuid4().hex[:12]}",
        "user": {
            "id": new_user.id,
            "username": new_user.username,
            "full_name": new_user.full_name,
            "email": new_user.email,
            "rfid_card_id": new_user.rfid_card_id,
            "system_role": new_user.system_role,
            "status": new_user.status,
            "sub_group_name": new_user.sub_group_name,
            "home_dept_id": new_user.home_dept_id,
            "home_dept_name": dept.name,
        },
        "default_project_id": default_prj_id,
    }


@app.post("/api/v1/org/users/role")
def update_user_system_role(
    req: UserRoleUpdateRequest,
    db: Session = Depends(get_db),
):
    """RBAC 系统级角色、状态与归属组织层级变更接口（仅管理员或科主任可操作）"""
    operator = db.query(User).filter(User.id == req.operator_user_id).first()
    if not operator or operator.system_role not in ("ADMIN", "DEPT_HEAD"):
        raise HTTPException(status_code=403, detail="权限不足：仅系统管理员(ADMIN)或行政科主任(DEPT_HEAD)可执行人员角色与状态审批")

    target = db.query(User).filter(User.id == req.target_user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="目标用户不存在")

    target.system_role = req.system_role
    target.status = req.status
    if req.home_dept_id:
        target.home_dept_id = req.home_dept_id
    if req.sub_group_name is not None:
        target.sub_group_name = req.sub_group_name

    db.commit()
    db.refresh(target)
    return {
        "user_id": target.id,
        "full_name": target.full_name,
        "system_role": target.system_role,
        "status": target.status,
        "home_dept_id": target.home_dept_id,
        "sub_group_name": target.sub_group_name,
    }


@app.post("/api/v1/org/departments")
def create_org_department(
    req: DepartmentCreateRequest,
    db: Session = Depends(get_db),
):
    """新增行政科室或下属三级课题组节点（多层级组织架构管理）"""
    operator = db.query(User).filter(User.id == req.operator_user_id).first()
    if not operator or operator.system_role not in ("ADMIN", "DEPT_HEAD"):
        raise HTTPException(status_code=403, detail="权限不足：仅系统管理员或科主任可新建组织层级节点")

    if db.query(Department).filter(Department.code == req.code.strip()).first():
        raise HTTPException(status_code=409, detail=f"组织编码【{req.code}】已存在")

    dept = Department(
        code=req.code.strip(),
        name=req.name.strip(),
        parent_id=req.parent_id,
        level_type=req.level_type,
        manager_name=req.manager_name or operator.full_name,
    )
    db.add(dept)
    db.commit()
    db.refresh(dept)
    return {
        "id": dept.id,
        "code": dept.code,
        "name": dept.name,
        "parent_id": dept.parent_id,
        "level_type": dept.level_type,
        "manager_name": dept.manager_name,
    }


@app.put("/api/v1/org/departments/{dept_id}")
def update_org_department(
    dept_id: int,
    req: DepartmentUpdateRequest,
    db: Session = Depends(get_db),
):
    """修改组织机构/科室信息：超级管理员可修改全部，科主任仅可修改本科室及下属机构"""
    operator = db.query(User).filter(User.id == req.operator_user_id).first()
    if not operator:
        raise HTTPException(status_code=404, detail="操作员不存在")
    dept = db.query(Department).filter(Department.id == dept_id).first()
    if not dept:
        raise HTTPException(status_code=404, detail="组织机构不存在")

    if operator.system_role != "ADMIN":
        if operator.system_role != "DEPT_HEAD" or (
            dept.id != operator.home_dept_id and getattr(dept, "parent_id", None) != operator.home_dept_id
        ):
            raise HTTPException(status_code=403, detail="权限不足：仅超级管理员或本机构科室主任可修改该机构信息")

    dept.code = req.code.strip()
    dept.name = req.name.strip()
    dept.manager_name = req.manager_name or dept.manager_name
    db.commit()
    db.refresh(dept)
    return {"id": dept.id, "code": dept.code, "name": dept.name, "manager_name": dept.manager_name}


@app.delete("/api/v1/org/departments/{dept_id}")
def delete_org_department(
    dept_id: int,
    operator_user_id: int = Query(...),
    db: Session = Depends(get_db),
):
    """删除组织机构/下属课题组节点：超级管理员可删无挂载资产的科室，科主任可删本科室下属课题组"""
    operator = db.query(User).filter(User.id == operator_user_id).first()
    if not operator:
        raise HTTPException(status_code=404, detail="操作员不存在")
    dept = db.query(Department).filter(Department.id == dept_id).first()
    if not dept:
        raise HTTPException(status_code=404, detail="组织机构不存在")

    if operator.system_role != "ADMIN":
        if operator.system_role != "DEPT_HEAD" or getattr(dept, "parent_id", None) != operator.home_dept_id:
            raise HTTPException(status_code=403, detail="权限不足：仅超级管理员或上级科室主任可删除该组织节点")

    if db.query(User).filter(User.home_dept_id == dept.id).count() > 0:
        raise HTTPException(status_code=400, detail=f"机构【{dept.name}】下仍有关联成员，请先迁移或删除下属成员后再删除")
    if db.query(Device).filter(Device.owner_dept_id == dept.id).count() > 0:
        raise HTTPException(status_code=400, detail=f"机构【{dept.name}】下仍有关联仪器设备，无法直接删除")
    if db.query(Project).filter(Project.lead_dept_id == dept.id).count() > 0:
        raise HTTPException(status_code=400, detail=f"机构【{dept.name}】下仍有关联课题组项目，无法直接删除")

    db.delete(dept)
    db.commit()
    return {"deleted_id": dept_id, "name": dept.name}


@app.put("/api/v1/org/users/{user_id}")
def update_user_profile(
    user_id: int,
    req: UserUpdateRequest,
    db: Session = Depends(get_db),
):
    """修改已有成员信息：ADMIN可改所有人；DEPT_HEAD可改本科室下属成员；普通成员可改本人基本资料"""
    operator = db.query(User).filter(User.id == req.operator_user_id).first()
    target = db.query(User).filter(User.id == user_id).first()
    if not operator or not target:
        raise HTTPException(status_code=404, detail="操作人或目标成员不存在")

    is_admin = operator.system_role == "ADMIN"
    is_dept_head_of_target = (
        operator.system_role == "DEPT_HEAD" and operator.home_dept_id == target.home_dept_id
    )
    is_self = operator.id == target.id

    if not (is_admin or is_dept_head_of_target or is_self):
        raise HTTPException(
            status_code=403,
            detail="权限不足：您仅能修改本人资料，或由本行政科室主任 / 超级管理员修改下属成员信息",
        )

    # 非管理员禁止将人员角色提权为 ADMIN
    if not is_admin and req.system_role == "ADMIN" and target.system_role != "ADMIN":
        raise HTTPException(status_code=403, detail="权限不足：仅超级管理员可授予 ADMIN 角色")

    target.full_name = req.full_name.strip()
    target.email = req.email or target.email
    target.rfid_card_id = req.rfid_card_id.strip()
    target.sub_group_name = req.sub_group_name or target.sub_group_name

    if is_admin or is_dept_head_of_target:
        target.system_role = req.system_role
        target.status = req.status
    if is_admin:
        target.home_dept_id = req.home_dept_id

    db.commit()
    db.refresh(target)
    return {
        "user_id": target.id,
        "full_name": target.full_name,
        "system_role": target.system_role,
        "home_dept_id": target.home_dept_id,
        "sub_group_name": target.sub_group_name,
        "status": target.status,
    }


@app.delete("/api/v1/org/users/{user_id}")
def delete_user_account(
    user_id: int,
    operator_user_id: int = Query(...),
    db: Session = Depends(get_db),
):
    """删除成员账号：仅超级管理员(ADMIN)或该成员所属行政科室主任(DEPT_HEAD)可删除"""
    operator = db.query(User).filter(User.id == operator_user_id).first()
    target = db.query(User).filter(User.id == user_id).first()
    if not operator or not target:
        raise HTTPException(status_code=404, detail="成员不存在")
    if operator.id == target.id:
        raise HTTPException(status_code=400, detail="禁止删除当前正在登录的本人账号")

    if operator.system_role != "ADMIN":
        if operator.system_role != "DEPT_HEAD" or operator.home_dept_id != target.home_dept_id:
            raise HTTPException(status_code=403, detail="权限不足：仅超级管理员或本科室主任可删除成员")
        if target.system_role in ("ADMIN", "DEPT_HEAD"):
            raise HTTPException(status_code=403, detail="权限不足：科室主任不可删除管理员或其他科室主任账号")

    if db.query(Project).filter(Project.pi_user_id == target.id).count() > 0:
        raise HTTPException(status_code=400, detail=f"成员【{target.full_name}】当前担任课题组项目PI，请先变更项目负责人后再删除")

    db.query(ProjectMember).filter(ProjectMember.user_id == target.id).delete()
    db.delete(target)
    db.commit()
    return {"deleted_user_id": user_id, "full_name": target.full_name}


@app.post("/api/v1/org/projects")
def create_org_project(
    req: ProjectCreateRequest,
    db: Session = Depends(get_db),
):
    """新建课题组项目/财务账户：仅 ADMIN、DEPT_HEAD、PI 可创建"""
    operator = db.query(User).filter(User.id == req.operator_user_id).first()
    if not operator or operator.system_role not in ("ADMIN", "DEPT_HEAD", "PI"):
        raise HTTPException(status_code=403, detail="权限不足：仅管理员、科室主任或课题组负责人(PI)可创建新项目")

    code = req.code.strip()
    if db.query(Project).filter(Project.code == code).first():
        raise HTTPException(status_code=409, detail=f"项目编号【{code}】已存在")

    pi_uid = req.pi_user_id or operator.id
    prj = Project(
        code=code,
        name=req.name.strip(),
        lead_dept_id=req.lead_dept_id,
        pi_user_id=pi_uid,
        total_budget=Decimal("0.0000"),
        frozen_balance=Decimal("0.0000"),
        available_balance=Decimal("0.0000"),
        is_confidential=req.is_confidential,
    )
    db.add(prj)
    db.flush()

    from .billing_engine import deposit_project_grant
    init_amt = quantize_dec(req.initial_budget)
    if init_amt > Decimal("0.0000"):
        deposit_project_grant(
            db,
            idempotency_key=f"INIT_DEPOSIT_{prj.code}_{uuid.uuid4().hex[:6]}",
            project=prj,
            operator_user_id=pi_uid,
            amount=init_amt,
            erp_voucher_no=f"ERP-INIT-{prj.code}",
        )

    pm = ProjectMember(
        project_id=prj.id,
        user_id=pi_uid,
        project_role="PI",
        spending_limit=init_amt if init_amt > Decimal("0.0000") else Decimal("20000.0000"),
        used_quota=Decimal("0.0000"),
    )
    db.add(pm)
    db.commit()
    db.refresh(prj)
    return {
        "id": prj.id,
        "code": prj.code,
        "name": prj.name,
        "available_balance": str(quantize_dec(prj.available_balance)),
    }


@app.put("/api/v1/org/projects/{project_id}")
def update_org_project(
    project_id: int,
    req: ProjectUpdateRequest,
    db: Session = Depends(get_db),
):
    """修改已有课题组项目：仅 ADMIN、该项目 PI、或项目依托科室主任(DEPT_HEAD)可修改"""
    operator = db.query(User).filter(User.id == req.operator_user_id).first()
    prj = db.query(Project).filter(Project.id == project_id).first()
    if not operator or not prj:
        raise HTTPException(status_code=404, detail="操作员或项目不存在")

    op_pm = (
        db.query(ProjectMember)
        .filter(ProjectMember.project_id == prj.id, ProjectMember.user_id == operator.id)
        .first()
    )
    is_project_pi = (prj.pi_user_id == operator.id) or (op_pm and op_pm.project_role == "PI")
    is_lead_dept_head = (operator.system_role == "DEPT_HEAD" and operator.home_dept_id == prj.lead_dept_id)

    if not (operator.system_role == "ADMIN" or is_project_pi or is_lead_dept_head):
        raise HTTPException(
            status_code=403,
            detail="权限不足：仅超级管理员、该项目负责人(PI)或依托科室主任可修改项目配置",
        )

    if req.code and req.code.strip() != prj.code:
        prj.code = req.code.strip()
    prj.name = req.name.strip()
    prj.lead_dept_id = req.lead_dept_id
    prj.pi_user_id = req.pi_user_id
    prj.is_confidential = req.is_confidential
    db.commit()
    db.refresh(prj)
    return {
        "id": prj.id,
        "code": prj.code,
        "name": prj.name,
        "lead_dept_id": prj.lead_dept_id,
        "pi_user_id": prj.pi_user_id,
        "is_confidential": prj.is_confidential,
    }


@app.delete("/api/v1/org/projects/{project_id}")
def delete_org_project(
    project_id: int,
    operator_user_id: int = Query(...),
    db: Session = Depends(get_db),
):
    """删除课题组项目：仅 ADMIN 或该项目负责人(PI)可删除（存在未结算预约时禁止删除）"""
    operator = db.query(User).filter(User.id == operator_user_id).first()
    prj = db.query(Project).filter(Project.id == project_id).first()
    if not operator or not prj:
        raise HTTPException(status_code=404, detail="操作员或项目不存在")

    op_pm = (
        db.query(ProjectMember)
        .filter(ProjectMember.project_id == prj.id, ProjectMember.user_id == operator.id)
        .first()
    )
    is_project_pi = (prj.pi_user_id == operator.id) or (op_pm and op_pm.project_role == "PI")
    if not (operator.system_role == "ADMIN" or is_project_pi):
        raise HTTPException(status_code=403, detail="权限不足：仅超级管理员或该项目负责人(PI)可删除该项目")

    active_res_count = (
        db.query(Reservation)
        .filter(Reservation.project_id == prj.id, Reservation.status.in_(["RESERVED", "ACTIVE"]))
        .count()
    )
    if active_res_count > 0:
        raise HTTPException(status_code=400, detail=f"项目【{prj.code}】尚有 {active_res_count} 笔未结算的机时预约，请先结算或取消预约后再删除")

    db.query(ProjectMember).filter(ProjectMember.project_id == prj.id).delete()
    db.query(ELNRecord).filter(ELNRecord.project_id == prj.id).delete()
    db.query(Sample).filter(Sample.project_id == prj.id).delete()
    db.query(Reservation).filter(Reservation.project_id == prj.id).delete()
    db.query(BillingLedger).filter(BillingLedger.project_id == prj.id).delete()
    db.delete(prj)
    db.commit()
    return {"deleted_project_id": project_id, "code": prj.code}


@app.delete("/api/v1/org/project-members/{member_id}")
def remove_project_member(
    member_id: int,
    operator_user_id: int = Query(...),
    db: Session = Depends(get_db),
):
    """将成员移出项目白名单：仅 ADMIN、该项目 PI 或依托科室主任可操作"""
    operator = db.query(User).filter(User.id == operator_user_id).first()
    target_pm = db.query(ProjectMember).filter(ProjectMember.id == member_id).first()
    if not operator or not target_pm:
        raise HTTPException(status_code=404, detail="项目成员记录不存在")

    prj = db.query(Project).filter(Project.id == target_pm.project_id).first()
    op_pm = (
        db.query(ProjectMember)
        .filter(ProjectMember.project_id == prj.id, ProjectMember.user_id == operator.id)
        .first()
    )
    is_project_pi = (prj.pi_user_id == operator.id) or (op_pm and op_pm.project_role == "PI")
    is_lead_dept_head = (operator.system_role == "DEPT_HEAD" and operator.home_dept_id == prj.lead_dept_id)

    if not (operator.system_role == "ADMIN" or is_project_pi or is_lead_dept_head):
        raise HTTPException(status_code=403, detail="权限不足：仅管理员、该项目PI或依托科室主任可移除项目成员")

    if target_pm.user_id == prj.pi_user_id:
        raise HTTPException(status_code=400, detail="禁止直接移除项目主负责人(PI)，请先变更项目负责人")

    db.delete(target_pm)
    db.commit()
    return {"removed_member_id": member_id, "user_id": target_pm.user_id}


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


@app.post("/api/v1/fms/devices")
def create_fms_device(
    req: FMSDeviceUpsertRequest,
    db: Session = Depends(get_db),
):
    """新增仪器设备：仅超级管理员(ADMIN)或该科室主任(DEPT_HEAD)可添加"""
    operator = db.query(User).filter(User.id == req.operator_user_id).first()
    if not operator:
        raise HTTPException(status_code=404, detail="操作员不存在")
    if operator.system_role != "ADMIN":
        if operator.system_role != "DEPT_HEAD" or operator.home_dept_id != req.owner_dept_id:
            raise HTTPException(status_code=403, detail="权限不足：仅超级管理员或归口行政科室主任可新增仪器设备")

    if db.query(Device).filter(Device.code == req.code.strip()).first():
        raise HTTPException(status_code=409, detail=f"仪器编号【{req.code}】已存在")

    dev = Device(
        code=req.code.strip(),
        name=req.name.strip(),
        owner_dept_id=req.owner_dept_id,
        pos_x=req.pos_x,
        pos_y=req.pos_y,
        status=req.status,
        standby_current_threshold=quantize_dec(req.standby_current_threshold),
        current_amps=Decimal("0.2000"),
        internal_hourly_rate=quantize_dec(req.internal_hourly_rate),
        external_hourly_rate=quantize_dec(req.external_hourly_rate),
        penalty_factor=Decimal("0.5000"),
    )
    db.add(dev)
    db.commit()
    db.refresh(dev)
    return {"id": dev.id, "code": dev.code, "name": dev.name}


@app.put("/api/v1/fms/devices/{device_id}")
def update_fms_device(
    device_id: int,
    req: FMSDeviceUpsertRequest,
    db: Session = Depends(get_db),
):
    """修改已有仪器信息与收费标准：ADMIN、归口科室主任(DEPT_HEAD)或归口科室仪器管理员(STAFF)可修改"""
    operator = db.query(User).filter(User.id == req.operator_user_id).first()
    dev = db.query(Device).filter(Device.id == device_id).first()
    if not operator or not dev:
        raise HTTPException(status_code=404, detail="操作员或仪器不存在")

    is_admin = operator.system_role == "ADMIN"
    is_owner_dept_manager = (
        operator.home_dept_id == dev.owner_dept_id
        and operator.system_role in ("DEPT_HEAD", "STAFF")
    )
    if not (is_admin or is_owner_dept_manager):
        raise HTTPException(
            status_code=403,
            detail=f"权限不足：仪器【{dev.code}】归口【{dev.owner_department.name}】，仅超级管理员或归口科室负责人可修改",
        )

    dev.code = req.code.strip()
    dev.name = req.name.strip()
    if is_admin:
        dev.owner_dept_id = req.owner_dept_id
    dev.pos_x = req.pos_x
    dev.pos_y = req.pos_y
    dev.status = req.status
    dev.standby_current_threshold = quantize_dec(req.standby_current_threshold)
    dev.internal_hourly_rate = quantize_dec(req.internal_hourly_rate)
    dev.external_hourly_rate = quantize_dec(req.external_hourly_rate)
    db.commit()
    db.refresh(dev)
    return {"id": dev.id, "code": dev.code, "name": dev.name, "status": dev.status}


@app.delete("/api/v1/fms/devices/{device_id}")
def delete_fms_device(
    device_id: int,
    operator_user_id: int = Query(...),
    db: Session = Depends(get_db),
):
    """删除/报废仪器设备：仅超级管理员(ADMIN)或归口科室主任(DEPT_HEAD)可删除"""
    operator = db.query(User).filter(User.id == operator_user_id).first()
    dev = db.query(Device).filter(Device.id == device_id).first()
    if not operator or not dev:
        raise HTTPException(status_code=404, detail="操作员或仪器不存在")

    if operator.system_role != "ADMIN" and not (
        operator.system_role == "DEPT_HEAD" and operator.home_dept_id == dev.owner_dept_id
    ):
        raise HTTPException(status_code=403, detail="权限不足：仅超级管理员或归口行政科室主任可删除/报废仪器")

    active_count = (
        db.query(Reservation)
        .filter(Reservation.device_id == dev.id, Reservation.status.in_(["RESERVED", "ACTIVE"]))
        .count()
    )
    if active_count > 0:
        raise HTTPException(status_code=400, detail=f"仪器【{dev.code}】尚有 {active_count} 笔未完结预约，请先取消或结算后再删除")

    db.query(Reservation).filter(Reservation.device_id == dev.id).delete()
    db.delete(dev)
    db.commit()
    return {"deleted_device_id": device_id, "code": dev.code}


@app.delete("/api/v1/fms/reservations/{reservation_id}")
def cancel_or_delete_reservation(
    reservation_id: int,
    operator_user_id: int = Query(...),
    db: Session = Depends(get_db),
):
    """
    取消/删除机时预约单：
    - 若状态为 RESERVED（未上机），允许预约人本人、项目PI、仪器归口科室主任或ADMIN取消预约，并全额退回预授权冻结款与个人配额；
    - 若状态为 COMPLETED/ACTIVE，仅允许 ADMIN 或仪器归口科室主任清理。
    """
    operator = db.query(User).filter(User.id == operator_user_id).first()
    res = db.query(Reservation).filter(Reservation.id == reservation_id).first()
    if not operator or not res:
        raise HTTPException(status_code=404, detail="操作员或预约记录不存在")

    prj = db.query(Project).filter(Project.id == res.project_id).first()
    dev = db.query(Device).filter(Device.id == res.device_id).first()

    is_admin = operator.system_role == "ADMIN"
    is_owner = res.operator_user_id == operator.id
    is_project_pi = prj and prj.pi_user_id == operator.id
    is_device_dept_head = (
        dev and operator.system_role == "DEPT_HEAD" and operator.home_dept_id == dev.owner_dept_id
    )

    if res.status == "RESERVED":
        if not (is_admin or is_owner or is_project_pi or is_device_dept_head):
            raise HTTPException(
                status_code=403,
                detail="权限不足：仅预约人本人、项目PI、设备归口科主任或管理员可取消该预约",
            )
        held = quantize_dec(res.hold_amount)
        if prj and held > Decimal("0.0000"):
            prj.frozen_balance = max(Decimal("0.0000"), quantize_dec(prj.frozen_balance) - held)
            prj.available_balance = quantize_dec(prj.available_balance) + held
            pm = (
                db.query(ProjectMember)
                .filter(ProjectMember.project_id == prj.id, ProjectMember.user_id == res.operator_user_id)
                .first()
            )
            if pm:
                pm.used_quota = max(Decimal("0.0000"), quantize_dec(pm.used_quota) - held)

            refund_ledger = BillingLedger(
                idempotency_key=f"BILL_FMS_CANCEL_{res.id}_{uuid.uuid4().hex[:6]}",
                tx_type="REFUND",
                project_id=prj.id,
                operator_user_id=operator.id,
                beneficiary_dept_id=dev.owner_dept_id if dev else prj.lead_dept_id,
                rate_type=res.rate_type,
                amount=held,
                balance_after=prj.available_balance,
                frozen_after=prj.frozen_balance,
                reference_type="FMS",
                reference_id=str(res.id),
                memo=f"取消未上机预约单 #{res.id}，全额解冻退回 ¥{held}",
            )
            db.add(refund_ledger)
        if dev and dev.status == "RESERVED":
            dev.status = "IDLE"
    else:
        if not (is_admin or is_device_dept_head):
            raise HTTPException(status_code=403, detail="权限不足：已签到或已结算的机时记录仅允许超级管理员或设备归口科主任删除")

    db.query(ELNRecord).filter(ELNRecord.linked_reservation_id == res.id).update({"linked_reservation_id": None})
    db.delete(res)
    db.commit()
    return {"deleted_reservation_id": reservation_id}


@app.post("/api/v1/lims/consumables")
def create_lims_consumable(
    req: LIMSConsumableUpsertRequest,
    db: Session = Depends(get_db),
):
    """新增试剂耗材目录项：仅 ADMIN 或归口科室主任(DEPT_HEAD)可添加"""
    operator = db.query(User).filter(User.id == req.operator_user_id).first()
    if not operator:
        raise HTTPException(status_code=404, detail="操作员不存在")
    if operator.system_role != "ADMIN" and not (
        operator.system_role == "DEPT_HEAD" and operator.home_dept_id == req.owner_dept_id
    ):
        raise HTTPException(status_code=403, detail="权限不足：仅超级管理员或归口行政科室主任可新增耗材品类")

    if db.query(Consumable).filter(Consumable.code == req.code.strip()).first():
        raise HTTPException(status_code=409, detail=f"耗材编号【{req.code}】已存在")

    c = Consumable(
        code=req.code.strip(),
        name=req.name.strip(),
        spec=req.spec.strip(),
        owner_dept_id=req.owner_dept_id,
        stock_qty=quantize_dec(req.stock_qty),
        safety_threshold=quantize_dec(req.safety_threshold),
        internal_unit_price=quantize_dec(req.internal_unit_price),
        external_unit_price=quantize_dec(req.external_unit_price),
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return {"id": c.id, "code": c.code, "name": c.name}


@app.put("/api/v1/lims/consumables/{consumable_id}")
def update_lims_consumable(
    consumable_id: int,
    req: LIMSConsumableUpsertRequest,
    db: Session = Depends(get_db),
):
    """修改已有耗材信息/补充库存/调整单价：ADMIN、归口科室主任或归口科室实验员可操作"""
    operator = db.query(User).filter(User.id == req.operator_user_id).first()
    c = db.query(Consumable).filter(Consumable.id == consumable_id).first()
    if not operator or not c:
        raise HTTPException(status_code=404, detail="操作员或耗材不存在")

    if operator.system_role != "ADMIN" and not (
        operator.home_dept_id == c.owner_dept_id and operator.system_role in ("DEPT_HEAD", "STAFF")
    ):
        raise HTTPException(status_code=403, detail="权限不足：仅超级管理员或归口科室人员可修改耗材库存与单价")

    c.code = req.code.strip()
    c.name = req.name.strip()
    c.spec = req.spec.strip()
    if operator.system_role == "ADMIN":
        c.owner_dept_id = req.owner_dept_id
    c.stock_qty = quantize_dec(req.stock_qty)
    c.safety_threshold = quantize_dec(req.safety_threshold)
    c.internal_unit_price = quantize_dec(req.internal_unit_price)
    c.external_unit_price = quantize_dec(req.external_unit_price)
    db.commit()
    db.refresh(c)
    return {"id": c.id, "code": c.code, "stock_qty": str(c.stock_qty)}


@app.delete("/api/v1/lims/consumables/{consumable_id}")
def delete_lims_consumable(
    consumable_id: int,
    operator_user_id: int = Query(...),
    db: Session = Depends(get_db),
):
    """删除试剂耗材：仅 ADMIN 或归口科室主任(DEPT_HEAD)可删除"""
    operator = db.query(User).filter(User.id == operator_user_id).first()
    c = db.query(Consumable).filter(Consumable.id == consumable_id).first()
    if not operator or not c:
        raise HTTPException(status_code=404, detail="操作员或耗材不存在")

    if operator.system_role != "ADMIN" and not (
        operator.system_role == "DEPT_HEAD" and operator.home_dept_id == c.owner_dept_id
    ):
        raise HTTPException(status_code=403, detail="权限不足：仅超级管理员或归口科室主任可删除耗材")

    db.delete(c)
    db.commit()
    return {"deleted_consumable_id": consumable_id, "code": c.code}


@app.delete("/api/v1/lims/samples/{sample_id}")
def delete_lims_sample(
    sample_id: int,
    operator_user_id: int = Query(...),
    db: Session = Depends(get_db),
):
    """
    撤回/删除送检样品：
    - 待检测(REGISTERED)状态：允许送检人本人、项目PI、承检科室主任或ADMIN撤回，并全额退还已扣检测费与配额；
    - 已完成(COMPLETED)状态：仅允许 ADMIN 删除。
    """
    operator = db.query(User).filter(User.id == operator_user_id).first()
    smp = db.query(Sample).filter(Sample.id == sample_id).first()
    if not operator or not smp:
        raise HTTPException(status_code=404, detail="操作员或样品不存在")

    prj = db.query(Project).filter(Project.id == smp.project_id).first()
    is_admin = operator.system_role == "ADMIN"
    is_submitter = smp.submitter_user_id == operator.id
    is_project_pi = prj and prj.pi_user_id == operator.id
    is_target_dept_head = (
        operator.system_role == "DEPT_HEAD" and operator.home_dept_id == smp.target_dept_id
    )

    if smp.status == "REGISTERED":
        if not (is_admin or is_submitter or is_project_pi or is_target_dept_head):
            raise HTTPException(status_code=403, detail="权限不足：仅送检人本人、项目PI、承检科室主任或管理员可撤回该送样")
        fee = quantize_dec(smp.total_test_fee)
        if prj and fee > Decimal("0.0000"):
            prj.available_balance = quantize_dec(prj.available_balance) + fee
            pm = (
                db.query(ProjectMember)
                .filter(ProjectMember.project_id == prj.id, ProjectMember.user_id == smp.submitter_user_id)
                .first()
            )
            if pm:
                pm.used_quota = max(Decimal("0.0000"), quantize_dec(pm.used_quota) - fee)
            refund_ledger = BillingLedger(
                idempotency_key=f"BILL_LIMS_SMP_REFUND_{smp.id}_{uuid.uuid4().hex[:6]}",
                tx_type="REFUND",
                project_id=prj.id,
                operator_user_id=operator.id,
                beneficiary_dept_id=smp.target_dept_id,
                rate_type=smp.rate_type,
                amount=fee,
                balance_after=prj.available_balance,
                frozen_after=prj.frozen_balance,
                reference_type="LIMS_SAMPLE",
                reference_id=smp.barcode,
                memo=f"撤回待检样品 {smp.barcode}，退还检测费 ¥{fee}",
            )
            db.add(refund_ledger)
    else:
        if not is_admin:
            raise HTTPException(status_code=403, detail="权限不足：已签发COA报告的完成样品仅允许超级管理员(ADMIN)删除")

    db.query(ELNRecord).filter(ELNRecord.linked_sample_id == smp.id).update({"linked_sample_id": None})
    db.delete(smp)
    db.commit()
    return {"deleted_sample_id": sample_id, "barcode": smp.barcode}


@app.put("/api/v1/eln/records/{eln_id}")
def update_eln_record(
    eln_id: int,
    req: ELNUpdateRequest,
    db: Session = Depends(get_db),
):
    """编辑已有 ELN 实验记录：未锁定状态下，允许作者本人、项目PI或ADMIN修改"""
    operator = db.query(User).filter(User.id == req.operator_user_id).first()
    eln = db.query(ELNRecord).filter(ELNRecord.id == eln_id).first()
    if not operator or not eln:
        raise HTTPException(status_code=404, detail="操作员或实验记录不存在")
    if eln.is_locked:
        raise HTTPException(status_code=400, detail="该实验记录已签名锁定，需先由项目PI或超级管理员解锁后方可编辑")

    prj = db.query(Project).filter(Project.id == eln.project_id).first()
    is_admin = operator.system_role == "ADMIN"
    is_author = eln.author_user_id == operator.id
    is_project_pi = prj and prj.pi_user_id == operator.id

    if not (is_admin or is_author or is_project_pi):
        raise HTTPException(status_code=403, detail="权限不足：仅记录作者本人、项目负责人(PI)或超级管理员可编辑该记录")

    eln.title = req.title.strip()
    eln.markdown_content = req.markdown_content
    eln.conditions_json = json.dumps(req.conditions, ensure_ascii=False)
    eln.linked_reservation_id = req.linked_reservation_id
    eln.linked_sample_id = req.linked_sample_id
    db.commit()
    db.refresh(eln)
    return {"eln_id": eln.id, "title": eln.title}


@app.post("/api/v1/eln/records/{eln_id}/unlock")
def unlock_eln_record(
    eln_id: int,
    req: ELNLockRequest,
    db: Session = Depends(get_db),
):
    """解除 ELN 锁定状态：仅超级管理员(ADMIN)或所属项目负责人(PI)可解锁"""
    operator = db.query(User).filter(User.id == req.operator_user_id).first()
    eln = db.query(ELNRecord).filter(ELNRecord.id == eln_id).first()
    if not operator or not eln:
        raise HTTPException(status_code=404, detail="操作员或实验记录不存在")

    prj = db.query(Project).filter(Project.id == eln.project_id).first()
    if operator.system_role != "ADMIN" and not (prj and prj.pi_user_id == operator.id):
        raise HTTPException(status_code=403, detail="权限不足：仅超级管理员或所属项目负责人(PI)可解锁已签名的实验记录")

    eln.is_locked = False
    eln.signed_by_user_id = None
    eln.signed_at = None
    db.commit()
    return {"eln_id": eln.id, "is_locked": False}


@app.delete("/api/v1/eln/records/{eln_id}")
def delete_eln_record(
    eln_id: int,
    operator_user_id: int = Query(...),
    db: Session = Depends(get_db),
):
    """删除 ELN 实验记录：未锁定记录可由作者本人、项目PI或ADMIN删除；已锁定记录仅ADMIN可删除"""
    operator = db.query(User).filter(User.id == operator_user_id).first()
    eln = db.query(ELNRecord).filter(ELNRecord.id == eln_id).first()
    if not operator or not eln:
        raise HTTPException(status_code=404, detail="操作员或实验记录不存在")

    prj = db.query(Project).filter(Project.id == eln.project_id).first()
    is_admin = operator.system_role == "ADMIN"
    is_author = eln.author_user_id == operator.id
    is_project_pi = prj and prj.pi_user_id == operator.id

    if eln.is_locked and not is_admin:
        raise HTTPException(status_code=403, detail="权限不足：已签名锁定的记录仅允许超级管理员删除（或先由PI解锁）")
    if not (is_admin or is_author or is_project_pi):
        raise HTTPException(status_code=403, detail="权限不足：仅作者本人、项目负责人(PI)或超级管理员可删除该记录")

    db.delete(eln)
    db.commit()
    return {"deleted_eln_id": eln_id}


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

def ensure_schema_columns():
    """兼容已有 SQLite 数据库：若旧库缺少新增的多层级或鉴权字段则自动补齐"""
    from sqlalchemy import text
    with engine.begin() as conn:
        for stmt in [
            "ALTER TABLE departments ADD COLUMN parent_id INTEGER",
            "ALTER TABLE departments ADD COLUMN level_type VARCHAR(32) DEFAULT 'DEPT'",
            "ALTER TABLE departments ADD COLUMN manager_name VARCHAR(64) DEFAULT ''",
            "ALTER TABLE users ADD COLUMN password_hash VARCHAR(128) DEFAULT '123456'",
            "ALTER TABLE users ADD COLUMN email VARCHAR(128) DEFAULT ''",
            "ALTER TABLE users ADD COLUMN status VARCHAR(32) DEFAULT 'ACTIVE'",
            "ALTER TABLE users ADD COLUMN sub_group_name VARCHAR(64) DEFAULT '核心实验组'",
            "ALTER TABLE users ADD COLUMN created_at DATETIME",
        ]:
            try:
                conn.execute(text(stmt))
            except Exception:
                pass


def init_db_and_seed():
    """初始化 SQLite/PostgreSQL 表结构并写入矩阵式组织、跨科项目、设备、耗材及初始账本种子数据"""
    Base.metadata.create_all(bind=engine)
    ensure_schema_columns()
    db = SessionLocal()
    try:
        if db.query(Department).count() > 0:
            return

        # 1. 创建三大行政科室
        dept_mat = Department(
            code="DEPT-MAT",
            name="先进材料与微纳加工室",
            level_type="DEPT",
            manager_name="张教授",
        )
        dept_bio = Department(
            code="DEPT-BIO",
            name="生物医药与合成生物学室",
            level_type="DEPT",
            manager_name="王主任",
        )
        dept_ana = Department(
            code="DEPT-ANA",
            name="公共精密分析测试中心",
            level_type="DEPT",
            manager_name="林总工",
        )
        db.add_all([dept_mat, dept_bio, dept_ana])
        db.flush()

        # 2. 创建典型角色用户（含跨科PI、科主任、骨干实验员、只读观察员）
        u_admin = User(
            username="admin",
            password_hash="123456",
            full_name="林总工 (系统管理员)",
            email="admin@unilab.edu.cn",
            rfid_card_id="CARD_000001",
            system_role="ADMIN",
            status="ACTIVE",
            sub_group_name="平台中枢管理组",
            home_dept_id=dept_ana.id,
        )
        u_pi_mat = User(
            username="pi_zhang",
            password_hash="123456",
            full_name="张教授 (材料室PI)",
            email="pi_zhang@unilab.edu.cn",
            rfid_card_id="CARD_889201",
            system_role="DEPT_HEAD",
            status="ACTIVE",
            sub_group_name="超精密微纳加工组",
            home_dept_id=dept_mat.id,
        )
        u_head_bio = User(
            username="head_wang",
            password_hash="123456",
            full_name="王主任 (生医室科主任-非纳米项目成员)",
            email="head_wang@unilab.edu.cn",
            rfid_card_id="CARD_889202",
            system_role="DEPT_HEAD",
            status="ACTIVE",
            sub_group_name="合成生物学科研室",
            home_dept_id=dept_bio.id,
        )
        u_res_bio = User(
            username="chen_res",
            password_hash="123456",
            full_name="陈博士 (生医室骨干实验员)",
            email="chen_res@unilab.edu.cn",
            rfid_card_id="CARD_889203",
            system_role="STAFF",
            status="ACTIVE",
            sub_group_name="纳米递送载体课题组",
            home_dept_id=dept_bio.id,
        )
        u_res_ana = User(
            username="liu_ana",
            password_hash="123456",
            full_name="刘工 (分析中心工程师)",
            email="liu_ana@unilab.edu.cn",
            rfid_card_id="CARD_889204",
            system_role="STAFF",
            status="ACTIVE",
            sub_group_name="质谱与联用表征组",
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
