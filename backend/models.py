# -*- coding: utf-8 -*-
"""
UniLab-OS 数据库模型定义模块 (SQLAlchemy 2.0)
所有金额、费率、配额及电流数值强制采用 Numeric(12, 4) 定点数，严禁使用 Float。
"""

import os
from datetime import datetime
from decimal import Decimal
from typing import Optional, List

from sqlalchemy import (
    create_engine,
    Column,
    Integer,
    String,
    Boolean,
    DateTime,
    ForeignKey,
    Numeric,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import declarative_base, sessionmaker, relationship

# 默认使用本地 SQLite，生产环境可通过环境变量 DATABASE_URL 无缝切换至 PostgreSQL
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./unilab_os.db")

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args, future=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine, future=True)

Base = declarative_base()


def get_db():
    """FastAPI 数据库会话依赖注入生成器"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


class Department(Base):
    """行政科室与多层级组织架构表：支持 院/中心 -> 行政科室 -> 课题组/专业实验室 多级管理"""
    __tablename__ = "departments"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(32), unique=True, nullable=False, index=True, comment="科室/组织编码")
    name = Column(String(128), nullable=False, comment="科室/组织名称")
    parent_id = Column(Integer, ForeignKey("departments.id"), nullable=True, comment="上级组织ID(支持多层级树)")
    level_type = Column(String(32), nullable=False, default="DEPT", comment="层级类型: INSTITUTE(院级)/DEPT(行政科室)/LAB_GROUP(课题组)")
    manager_name = Column(String(64), nullable=True, default="", comment="负责人姓名")

    users = relationship("User", back_populates="home_department")
    devices = relationship("Device", back_populates="owner_department")
    consumables = relationship("Consumable", back_populates="owner_department")


class User(Base):
    """实验室人员表：唯一归属一个行政科室，可加入多个跨科室虚拟项目组，支持注册登录与RBAC角色管理"""
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(64), unique=True, nullable=False, index=True, comment="登录账号")
    password_hash = Column(String(128), nullable=False, default="123456", comment="登录密码凭证")
    full_name = Column(String(64), nullable=False, comment="姓名")
    email = Column(String(128), nullable=True, default="", comment="电子邮箱")
    rfid_card_id = Column(String(64), unique=True, nullable=False, index=True, comment="实体RFID卡号")
    system_role = Column(String(32), nullable=False, default="STAFF", comment="系统角色: ADMIN/DEPT_HEAD/PI/STAFF/OBSERVER")
    status = Column(String(32), nullable=False, default="ACTIVE", comment="账号状态: ACTIVE/DISABLED/PENDING")
    sub_group_name = Column(String(64), nullable=True, default="核心实验组", comment="所属三级课题组/专业组")
    home_dept_id = Column(Integer, ForeignKey("departments.id"), nullable=False, comment="所属行政科室ID")
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    home_department = relationship("Department", back_populates="users")
    project_memberships = relationship("ProjectMember", back_populates="user")


class Project(Base):
    """跨科室项目组（经费账户）：管钱、管科研实验数据隔离"""
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(64), unique=True, nullable=False, index=True, comment="项目编号")
    name = Column(String(128), nullable=False, comment="项目名称")
    lead_dept_id = Column(Integer, ForeignKey("departments.id"), nullable=False, comment="依托主科室ID")
    pi_user_id = Column(Integer, ForeignKey("users.id"), nullable=False, comment="项目负责人(PI)用户ID")
    total_budget = Column(Numeric(12, 4), nullable=False, default=Decimal("0.0000"), comment="总预算额度")
    frozen_balance = Column(Numeric(12, 4), nullable=False, default=Decimal("0.0000"), comment="预约已冻结额度")
    available_balance = Column(Numeric(12, 4), nullable=False, default=Decimal("0.0000"), comment="当前可用余额")
    is_confidential = Column(Boolean, nullable=False, default=True, comment="是否启用严格保密隔离")

    lead_department = relationship("Department")
    pi_user = relationship("User")
    members = relationship("ProjectMember", back_populates="project", cascade="all, delete-orphan")


class ProjectMember(Base):
    """跨科室项目成员与个人消费配额表"""
    __tablename__ = "project_members"
    __table_args__ = (
        UniqueConstraint("project_id", "user_id", name="uq_project_user_matrix"),
    )

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True, comment="项目ID")
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True, comment="成员用户ID")
    project_role = Column(String(32), nullable=False, default="RESEARCHER", comment="项目角色: PI/RESEARCHER/OBSERVER")
    spending_limit = Column(Numeric(12, 4), nullable=False, default=Decimal("0.0000"), comment="个人最高消费配额")
    used_quota = Column(Numeric(12, 4), nullable=False, default=Decimal("0.0000"), comment="个人已累计消耗配额(含冻结)")

    project = relationship("Project", back_populates="members")
    user = relationship("User", back_populates="project_memberships")


class Device(Base):
    """FMS 设备台账与双费率模型"""
    __tablename__ = "devices"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(64), unique=True, nullable=False, index=True, comment="设备资产编号")
    name = Column(String(128), nullable=False, comment="设备名称")
    owner_dept_id = Column(Integer, ForeignKey("departments.id"), nullable=False, comment="归口管理行政科室ID")
    pos_x = Column(Integer, nullable=False, default=100, comment="实验室平面图X坐标")
    pos_y = Column(Integer, nullable=False, default=100, comment="实验室平面图Y坐标")
    status = Column(
        String(32),
        nullable=False,
        default="IDLE",
        comment="设备状态: IDLE/RESERVED/RUNNING/OVERTIME_RUNNING/FAULT",
    )
    standby_current_threshold = Column(
        Numeric(12, 4), nullable=False, default=Decimal("1.5000"), comment="待机电流判定阈值(A)"
    )
    current_amps = Column(Numeric(12, 4), nullable=False, default=Decimal("0.1000"), comment="当前实时电流(A)")
    internal_hourly_rate = Column(
        Numeric(12, 4), nullable=False, default=Decimal("50.0000"), comment="本科室人员自用优惠时薪"
    )
    external_hourly_rate = Column(
        Numeric(12, 4), nullable=False, default=Decimal("120.0000"), comment="跨科室人员协同标准时薪"
    )
    penalty_factor = Column(
        Numeric(12, 4), nullable=False, default=Decimal("0.5000"), comment="爽约最低计费系数(默认0.5)"
    )

    owner_department = relationship("Department", back_populates="devices")


class Reservation(Base):
    """FMS 机时预约与实验任务单 (ExperimentSession)"""
    __tablename__ = "reservations"

    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(Integer, ForeignKey("devices.id"), nullable=False, index=True, comment="预约设备ID")
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True, comment="付款项目ID")
    operator_user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True, comment="操作员用户ID")
    start_time = Column(DateTime, nullable=False, comment="预约开始时间")
    end_time = Column(DateTime, nullable=False, comment="预约结束时间")
    reserved_hours = Column(Numeric(12, 4), nullable=False, comment="预约总时长(小时)")
    actual_active_hours = Column(
        Numeric(12, 4), nullable=False, default=Decimal("0.0000"), comment="硬件有效高负载运行小时数"
    )
    status = Column(
        String(32),
        nullable=False,
        default="RESERVED",
        comment="状态: RESERVED/ACTIVE/COMPLETED/CANCELLED",
    )
    rate_type = Column(String(16), nullable=False, default="INTERNAL", comment="适用费率类型: INTERNAL/EXTERNAL")
    applied_rate = Column(Numeric(12, 4), nullable=False, default=Decimal("0.0000"), comment="适用小时单价")
    hold_amount = Column(Numeric(12, 4), nullable=False, default=Decimal("0.0000"), comment="预授权冻结金额")
    settled_amount = Column(Numeric(12, 4), nullable=False, default=Decimal("0.0000"), comment="最终结算实扣金额")
    checkin_method = Column(String(32), nullable=True, comment="签到方式: RFID_IOT / WEB_MANUAL")
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    device = relationship("Device")
    project = relationship("Project")
    operator = relationship("User")


class Consumable(Base):
    """LIMS 试剂耗材库存与双单价模型"""
    __tablename__ = "consumables"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(64), unique=True, nullable=False, index=True, comment="耗材编码")
    name = Column(String(128), nullable=False, comment="耗材名称")
    spec = Column(String(64), nullable=False, comment="规格型号")
    owner_dept_id = Column(Integer, ForeignKey("departments.id"), nullable=False, comment="归口管理科室ID")
    stock_qty = Column(Numeric(12, 4), nullable=False, default=Decimal("0.0000"), comment="当前库存余量")
    safety_threshold = Column(Numeric(12, 4), nullable=False, default=Decimal("10.0000"), comment="安全库存预警阈值")
    internal_unit_price = Column(Numeric(12, 4), nullable=False, default=Decimal("10.0000"), comment="科内领用单价")
    external_unit_price = Column(Numeric(12, 4), nullable=False, default=Decimal("20.0000"), comment="跨科领用单价")

    owner_department = relationship("Department", back_populates="consumables")


class Sample(Base):
    """LIMS 样品全生命周期与 COA 报告表"""
    __tablename__ = "samples"

    id = Column(Integer, primary_key=True, index=True)
    barcode = Column(String(64), unique=True, nullable=False, index=True, comment="样品唯一条码")
    name = Column(String(128), nullable=False, comment="样品名称")
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True, comment="归属项目ID")
    submitter_user_id = Column(Integer, ForeignKey("users.id"), nullable=False, comment="送检人ID")
    target_dept_id = Column(Integer, ForeignKey("departments.id"), nullable=False, comment="承检受益科室ID")
    test_item_name = Column(String(128), nullable=False, comment="检测项目名称")
    sample_count = Column(Integer, nullable=False, default=1, comment="样品份数")
    internal_test_price = Column(Numeric(12, 4), nullable=False, comment="科内检测单价")
    external_test_price = Column(Numeric(12, 4), nullable=False, comment="跨科检测单价")
    rate_type = Column(String(16), nullable=False, default="INTERNAL", comment="适用费率: INTERNAL/EXTERNAL")
    applied_unit_price = Column(Numeric(12, 4), nullable=False, comment="实际执行单价")
    total_test_fee = Column(Numeric(12, 4), nullable=False, comment="检测总费用")
    status = Column(
        String(32), nullable=False, default="REGISTERED", comment="状态: REGISTERED/PROCESSING/COMPLETED"
    )
    coa_metrics_json = Column(Text, nullable=False, default="{}", comment="结构化检测指标JSON(COA)")
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True, comment="报告出具时间")

    project = relationship("Project")
    submitter = relationship("User")
    target_department = relationship("Department")


class ELNRecord(Base):
    """ELN 电子实验记录本（支持跨模块挂载机时与样品、项目级保密隔离及签名锁死）"""
    __tablename__ = "eln_records"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False, comment="实验记录标题")
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True, comment="所属项目ID")
    author_user_id = Column(Integer, ForeignKey("users.id"), nullable=False, comment="实验记录作者ID")
    markdown_content = Column(Text, nullable=False, comment="富文本/Markdown实验正文")
    conditions_json = Column(Text, nullable=False, default="{}", comment="结构化实验条件参数JSON")
    linked_reservation_id = Column(Integer, ForeignKey("reservations.id"), nullable=True, comment="关联FMS机时单ID")
    linked_sample_id = Column(Integer, ForeignKey("samples.id"), nullable=True, comment="关联LIMS样品ID")
    is_locked = Column(Boolean, nullable=False, default=False, comment="是否已审计签名锁定")
    signed_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True, comment="签名锁定人ID")
    signed_at = Column(DateTime, nullable=True, comment="签名锁定时间戳")
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    project = relationship("Project")
    author = relationship("User", foreign_keys=[author_user_id])
    signer = relationship("User", foreign_keys=[signed_by_user_id])
    linked_reservation = relationship("Reservation")
    linked_sample = relationship("Sample")


class BillingLedger(Base):
    """不可篡改复式记账流水表 (Append-Only)：同时记录借方(付款项目与操作人)和贷方(受益行政科室)"""
    __tablename__ = "billing_ledgers"

    id = Column(Integer, primary_key=True, index=True)
    idempotency_key = Column(String(128), unique=True, nullable=False, index=True, comment="全局唯一幂等键")
    tx_type = Column(
        String(32),
        nullable=False,
        comment="交易类型: DEPOSIT/HOLD/SETTLE_FMS/SETTLE_LIMS/REFUND",
    )
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True, comment="借方：付款项目ID")
    operator_user_id = Column(Integer, ForeignKey("users.id"), nullable=False, comment="借方经办人：消费成员ID")
    beneficiary_dept_id = Column(
        Integer, ForeignKey("departments.id"), nullable=False, index=True, comment="贷方：提供服务的受益行政科室ID"
    )
    rate_type = Column(String(16), nullable=False, default="INTERNAL", comment="费率类型: INTERNAL/EXTERNAL")
    amount = Column(Numeric(12, 4), nullable=False, comment="交易发生金额(定点数)")
    balance_after = Column(Numeric(12, 4), nullable=False, comment="交易后项目可用余额")
    frozen_after = Column(Numeric(12, 4), nullable=False, comment="交易后项目冻结余额")
    reference_type = Column(String(32), nullable=False, comment="关联业务类型: FMS/LIMS_SAMPLE/LIMS_CONSUMABLE/ERP_SYNC")
    reference_id = Column(String(64), nullable=False, comment="关联业务单据编号")
    memo = Column(String(255), nullable=False, default="", comment="复式记账摘要说明")
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    project = relationship("Project")
    operator = relationship("User")
    beneficiary_department = relationship("Department")


class IoTTelemetryLog(Base):
    """物联网边缘节点上报遥测与幂等日志表"""
    __tablename__ = "iot_telemetry_logs"

    id = Column(Integer, primary_key=True, index=True)
    seq_id = Column(String(128), unique=True, nullable=False, index=True, comment="硬件报文唯一序列号(防重放)")
    device_id = Column(Integer, ForeignKey("devices.id"), nullable=False, index=True, comment="关联设备ID")
    hardware_timestamp = Column(Integer, nullable=False, comment="硬件端Unix时间戳")
    rms_current_amps = Column(Numeric(12, 4), nullable=False, comment="有效值电流(A)")
    power_state = Column(String(32), nullable=False, comment="上报物理状态")
    operator_rfid = Column(String(64), nullable=True, comment="刷卡操作员RFID")
    project_code_override = Column(String(64), nullable=True, comment="硬件端指定项目编码")
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
