# ADR-0001：定点数复式记账与跨科双费率预授权结算模型

- **状态**：已采纳（Accepted）
- **日期**：2026-10-19
- **关联代码**：`backend/models.py`, `backend/billing_engine.py`

## 1. 背景与问题（Context）
科研院所大型仪器平台需要同时满足「行政科室资产归口核算产值」与「跨科室课题组统筹经费并控制成员配额」两套维度。若使用浮点数记账或直接覆盖余额字段，极易产生精度舍入漂移、爽约白占机时或重复扣费。

## 2. 核心决策（Decision）
1. **强制定点数**：所有金额、费率、配额与电流字段在 ORM 与计算层统一使用 `Numeric(12, 4)` 与 `Decimal`（`ROUND_HALF_UP`）。
2. **Append-Only 复式流水**：每笔资金变动写入 `BillingLedger`，同时记录借方（`project_id` + `operator_user_id`）与贷方（`beneficiary_dept_id`），并以 `idempotency_key` 唯一索引防止弱网重放或重复结算。
3. **预授权冻结与多退少补**：预约时按 `reserved_hours * applied_rate` 冻结（`HOLD`），下机按 `max(reserved_hours * penalty_factor, actual_active_hours) * applied_rate` 实扣（`SETTLE_FMS`）并生成 `REFUND` 流水退还多余冻结款；按操作人与资源归口科室是否一致自动判定 `INTERNAL`/`EXTERNAL` 双费率。

## 3. 后果与权衡（Consequences）
- **收益**：账目全链路可审计、零浮点误差，支持跨科协同分账与配额拦截。
- **代价与约束**：任何资金变更必须经过 `billing_engine.py` 并生成幂等键，禁止绕过账本直接修改 `Project.available_balance`；后续切至高并发 PostgreSQL 时需补充行级锁（见 `BUG-004`）。
