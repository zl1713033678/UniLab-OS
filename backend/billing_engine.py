# -*- coding: utf-8 -*-
"""
UniLab-OS 跨科室内部核算与复式记账结算引擎 (Billing Engine)
负责：
1. 操作上下文 (operator_user_id, project_id) 矩阵权限与角色校验
2. 科内自用 (INTERNAL) vs 跨科协同 (EXTERNAL) 差异化费率自动判定
3. 个人项目消费配额 (spending_limit / used_quota) 与项目可用余额双重拦截
4. 不可篡改复式记账流水 (Append-Only BillingLedger) 及全局幂等性保障
"""

from decimal import Decimal, ROUND_HALF_UP
from typing import Tuple
from fastapi import HTTPException
from sqlalchemy.orm import Session

from .models import (
    User,
    Project,
    ProjectMember,
    BillingLedger,
)

FOUR_PLACES = Decimal("0.0001")


def quantize_dec(value: Decimal | str | int | float) -> Decimal:
    """将任意数值安全转换为保留4位小数的定点数 Decimal"""
    return Decimal(str(value)).quantize(FOUR_PLACES, rounding=ROUND_HALF_UP)


def verify_operation_context(
    db: Session,
    operator_user_id: int,
    project_id: int,
    require_write: bool = True,
) -> Tuple[User, Project, ProjectMember]:
    """
    强制校验操作上下文：
    检查操作员是否存在、项目是否存在，以及 (operator_user_id, project_id) 是否在 ProjectMember 白名单中。
    若 require_write=True，则 OBSERVER（只读成员）将被拦截。
    """
    user = db.query(User).filter(User.id == operator_user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail=f"操作员用户 ID={operator_user_id} 不存在")

    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail=f"归属项目 ID={project_id} 不存在")

    membership = (
        db.query(ProjectMember)
        .filter(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == operator_user_id,
        )
        .first()
    )
    if not membership:
        raise HTTPException(
            status_code=403,
            detail=f"权限拒绝：员工【{user.full_name}】不在项目【{project.code}】的跨科室成员白名单中",
        )

    if require_write and membership.project_role == "OBSERVER":
        raise HTTPException(
            status_code=403,
            detail=f"权限拒绝：员工【{user.full_name}】在项目【{project.code}】中仅为只读观察员(OBSERVER)，不可发起产生费用的操作或写入数据",
        )

    return user, project, membership


def determine_rate_type_and_price(
    operator_home_dept_id: int,
    resource_owner_dept_id: int,
    internal_price: Decimal,
    external_price: Decimal,
) -> Tuple[str, Decimal]:
    """
    差异化费率判定：
    若 操作人所属行政科室 == 资源归口行政科室，则享受科内优惠价 (INTERNAL)，否则执行跨科协同价 (EXTERNAL)。
    """
    if operator_home_dept_id == resource_owner_dept_id:
        return "INTERNAL", quantize_dec(internal_price)
    return "EXTERNAL", quantize_dec(external_price)


def check_budget_and_member_quota(
    project: Project,
    membership: ProjectMember,
    required_amount: Decimal,
) -> None:
    """校验项目可用余额及成员在该项目下的剩余消费配额"""
    req_amt = quantize_dec(required_amount)
    avail = quantize_dec(project.available_balance)
    if avail < req_amt:
        raise HTTPException(
            status_code=400,
            detail=f"项目经费余额不足：项目【{project.code}】当前可用余额 {avail} 元，本次需冻结/支出 {req_amt} 元",
        )

    remaining_quota = quantize_dec(membership.spending_limit) - quantize_dec(membership.used_quota)
    if remaining_quota < req_amt:
        raise HTTPException(
            status_code=400,
            detail=f"个人项目配额超限：您在该项目下剩余可用配额为 {remaining_quota} 元（配额上限 {membership.spending_limit} 元），本次需 {req_amt} 元",
        )


def create_hold_transaction(
    db: Session,
    *,
    idempotency_key: str,
    project: Project,
    membership: ProjectMember,
    operator_user_id: int,
    beneficiary_dept_id: int,
    rate_type: str,
    hold_amount: Decimal,
    reference_type: str,
    reference_id: str,
    memo: str,
) -> BillingLedger:
    """
    预约预授权冻结（HOLD）：
    扣减项目 available_balance，增加项目 frozen_balance，同时占用成员 used_quota，写入不可篡改流水。
    """
    existing = db.query(BillingLedger).filter(BillingLedger.idempotency_key == idempotency_key).first()
    if existing:
        return existing

    amt = quantize_dec(hold_amount)
    check_budget_and_member_quota(project, membership, amt)

    project.available_balance = quantize_dec(project.available_balance) - amt
    project.frozen_balance = quantize_dec(project.frozen_balance) + amt
    membership.used_quota = quantize_dec(membership.used_quota) + amt

    ledger = BillingLedger(
        idempotency_key=idempotency_key,
        tx_type="HOLD",
        project_id=project.id,
        operator_user_id=operator_user_id,
        beneficiary_dept_id=beneficiary_dept_id,
        rate_type=rate_type,
        amount=amt,
        balance_after=project.available_balance,
        frozen_after=project.frozen_balance,
        reference_type=reference_type,
        reference_id=reference_id,
        memo=memo,
    )
    db.add(ledger)
    db.flush()
    return ledger


def settle_fms_reservation(
    db: Session,
    *,
    reservation_id: int,
    project: Project,
    membership: ProjectMember,
    operator_user_id: int,
    beneficiary_dept_id: int,
    rate_type: str,
    applied_rate: Decimal,
    reserved_hours: Decimal,
    penalty_factor: Decimal,
    actual_active_hours: Decimal,
    hold_amount: Decimal,
) -> Tuple[Decimal, Decimal, BillingLedger]:
    """
    FMS 下机结算引擎：
    公式：Cost_FMS = max(预约时长 * 爽约系数, 实际硬件有效运行小时数) * 适用机时单价
    自动解冻原预授权金额，按实算金额完成跨科/科内复式记账，并多退少补更新项目余额与成员配额。
    """
    settle_key = f"BILL_FMS_SETTLE_{reservation_id}"
    existing = db.query(BillingLedger).filter(BillingLedger.idempotency_key == settle_key).first()
    if existing:
        refund_amt = max(Decimal("0.0000"), quantize_dec(hold_amount) - quantize_dec(existing.amount))
        return quantize_dec(existing.amount), refund_amt, existing

    min_billable_hours = quantize_dec(reserved_hours) * quantize_dec(penalty_factor)
    effective_hours = max(min_billable_hours, quantize_dec(actual_active_hours))
    cost_fms = quantize_dec(effective_hours * quantize_dec(applied_rate))
    held = quantize_dec(hold_amount)

    # 若超时运行导致实际费用高于原冻结款，需校验超出部分是否够扣
    extra_needed = cost_fms - held
    if extra_needed > Decimal("0.0000"):
        check_budget_and_member_quota(project, membership, extra_needed)

    # 1. 先从项目冻结余额中释放原 Hold 额度
    project.frozen_balance = quantize_dec(project.frozen_balance) - held

    # 2. 计算多退少补对可用余额和个人已用配额的影响
    refund_amount = Decimal("0.0000")
    if cost_fms <= held:
        refund_amount = quantize_dec(held - cost_fms)
        project.available_balance = quantize_dec(project.available_balance) + refund_amount
        membership.used_quota = quantize_dec(membership.used_quota) - refund_amount
    else:
        project.available_balance = quantize_dec(project.available_balance) - extra_needed
        membership.used_quota = quantize_dec(membership.used_quota) + extra_needed

    # 3. 记录机时正式结算流水 (SETTLE_FMS)
    settle_ledger = BillingLedger(
        idempotency_key=settle_key,
        tx_type="SETTLE_FMS",
        project_id=project.id,
        operator_user_id=operator_user_id,
        beneficiary_dept_id=beneficiary_dept_id,
        rate_type=rate_type,
        amount=cost_fms,
        balance_after=project.available_balance,
        frozen_after=project.frozen_balance,
        reference_type="FMS",
        reference_id=str(reservation_id),
        memo=f"FMS机时结算(预约{reserved_hours}h/有效{actual_active_hours}h/计费{quantize_dec(effective_hours)}h @ {applied_rate}/h)",
    )
    db.add(settle_ledger)

    # 4. 若存在多余冻结款释放，追加一条 REFUND 审计流水记录
    if refund_amount > Decimal("0.0000"):
        refund_ledger = BillingLedger(
            idempotency_key=f"BILL_FMS_REFUND_{reservation_id}",
            tx_type="REFUND",
            project_id=project.id,
            operator_user_id=operator_user_id,
            beneficiary_dept_id=beneficiary_dept_id,
            rate_type=rate_type,
            amount=refund_amount,
            balance_after=project.available_balance,
            frozen_after=project.frozen_balance,
            reference_type="FMS",
            reference_id=str(reservation_id),
            memo=f"FMS下机释放多余预授权冻结款(原冻结{held}元, 实结{cost_fms}元)",
        )
        db.add(refund_ledger)

    db.flush()
    return cost_fms, refund_amount, settle_ledger


def settle_lims_immediate(
    db: Session,
    *,
    idempotency_key: str,
    project: Project,
    membership: ProjectMember,
    operator_user_id: int,
    beneficiary_dept_id: int,
    rate_type: str,
    amount: Decimal,
    reference_type: str,
    reference_id: str,
    memo: str,
) -> BillingLedger:
    """
    LIMS 样品送检或试剂耗材领用实时结算（SETTLE_LIMS）：
    直接校验并扣减项目可用余额与成员配额，贷记承检/耗材归属科室。
    """
    existing = db.query(BillingLedger).filter(BillingLedger.idempotency_key == idempotency_key).first()
    if existing:
        return existing

    amt = quantize_dec(amount)
    check_budget_and_member_quota(project, membership, amt)

    project.available_balance = quantize_dec(project.available_balance) - amt
    membership.used_quota = quantize_dec(membership.used_quota) + amt

    ledger = BillingLedger(
        idempotency_key=idempotency_key,
        tx_type="SETTLE_LIMS",
        project_id=project.id,
        operator_user_id=operator_user_id,
        beneficiary_dept_id=beneficiary_dept_id,
        rate_type=rate_type,
        amount=amt,
        balance_after=project.available_balance,
        frozen_after=project.frozen_balance,
        reference_type=reference_type,
        reference_id=reference_id,
        memo=memo,
    )
    db.add(ledger)
    db.flush()
    return ledger


def deposit_project_grant(
    db: Session,
    *,
    idempotency_key: str,
    project: Project,
    operator_user_id: int,
    amount: Decimal,
    erp_voucher_no: str,
) -> Tuple[bool, BillingLedger]:
    """
    外部财务 ERP 经费拨款入账（DEPOSIT）：
    支持幂等重放检测，增加项目 total_budget 与 available_balance。
    """
    existing = db.query(BillingLedger).filter(BillingLedger.idempotency_key == idempotency_key).first()
    if existing:
        return True, existing

    amt = quantize_dec(amount)
    project.total_budget = quantize_dec(project.total_budget) + amt
    project.available_balance = quantize_dec(project.available_balance) + amt

    ledger = BillingLedger(
        idempotency_key=idempotency_key,
        tx_type="DEPOSIT",
        project_id=project.id,
        operator_user_id=operator_user_id,
        beneficiary_dept_id=project.lead_dept_id,
        rate_type="INTERNAL",
        amount=amt,
        balance_after=project.available_balance,
        frozen_after=project.frozen_balance,
        reference_type="ERP_SYNC",
        reference_id=erp_voucher_no,
        memo=f"外部ERP经费拨款入账(凭证号:{erp_voucher_no})",
    )
    db.add(ledger)
    db.flush()
    return False, ledger
