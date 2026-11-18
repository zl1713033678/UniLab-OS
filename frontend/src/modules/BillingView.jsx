import React from 'react';
import { Plus, Download } from 'lucide-react';
import TabBar from '../components/ui/TabBar';
import DataTableShell from '../components/ui/DataTableShell';
import { FormField, INPUT_CLS } from '../components/ui/FormField';
import { exportTableToCSV } from '../api/client';

export default function BillingView({
  data,
  billingPrimaryTab,
  setBillingPrimaryTab,
  simErp,
  setSimErp,
  onTriggerSimErpDeposit,
  onOpenLabDetail,
}) {
  const totalBudgetSum = data.projects.reduce((acc, p) => acc + Number(p.total_budget), 0);
  const totalAvailSum = data.projects.reduce((acc, p) => acc + Number(p.available_balance), 0);
  const totalFrozenSum = data.projects.reduce((acc, p) => acc + Number(p.frozen_balance), 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-base font-bold text-slate-900">财务中心与不可篡改复式记账总账</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          全链路采用 Numeric(12,4) 定点数核算，Append-Only 流水保障资金可追溯与跨科分账一致
        </p>
      </div>

      {/* 顶部资金概览 KPI 条 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-3.5 rounded-xl bg-white border border-slate-200 shadow-sm">
          <div className="text-[11px] text-slate-500 font-medium">平台项目总预算</div>
          <div className="text-lg font-bold text-blue-700 font-mono tabular-nums mt-0.5">
            ¥{totalBudgetSum.toFixed(2)}
          </div>
        </div>
        <div className="p-3.5 rounded-xl bg-white border border-slate-200 shadow-sm">
          <div className="text-[11px] text-slate-500 font-medium">预约冻结中余额 (Hold)</div>
          <div className="text-lg font-bold text-amber-600 font-mono tabular-nums mt-0.5">
            ¥{totalFrozenSum.toFixed(2)}
          </div>
        </div>
        <div className="p-3.5 rounded-xl bg-white border border-slate-200 shadow-sm">
          <div className="text-[11px] text-slate-500 font-medium">当前全盘可用余额</div>
          <div className="text-lg font-bold text-emerald-700 font-mono tabular-nums mt-0.5">
            ¥{totalAvailSum.toFixed(2)}
          </div>
        </div>
      </div>

      <TabBar
        label="财务中心导航"
        tabs={[
          { id: 'accounts', label: '财务账号总览', count: data.projects.length },
          { id: 'transactions', label: '收支明细流水', count: data.ledgers.length },
          { id: 'departments', label: '财务部门产值', count: data.dept_revenue_summary.length },
          { id: 'deposit', label: '经费充值 / ERP 调账' },
        ]}
        activeId={billingPrimaryTab}
        onChange={setBillingPrimaryTab}
      />

      {billingPrimaryTab === 'accounts' && (
        <div className="space-y-3">
          <div className="bg-slate-50 border border-slate-200 p-2.5 rounded-xl flex flex-wrap items-center justify-between gap-2 no-print">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setBillingPrimaryTab('deposit')}
                className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium inline-flex items-center gap-1 shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" /> 经费拨款入账
              </button>
              <button
                type="button"
                onClick={() =>
                  exportTableToCSV(
                    'billing_accounts.csv',
                    ['项目编号', '课题组名称', '总预算', '冻结金额', '可用余额'],
                    data.projects.map((p) => [
                      p.code,
                      p.name,
                      p.total_budget,
                      p.frozen_balance,
                      p.available_balance,
                    ])
                  )
                }
                className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs inline-flex items-center gap-1"
              >
                <Download className="w-3.5 h-3.5" aria-hidden="true" /> 导出 CSV
              </button>
            </div>
          </div>

          <DataTableShell caption="项目财务账号双层收支汇总表">
            <thead className="text-slate-700">
              <tr className="border-b border-slate-200">
                <th scope="col" rowSpan={2} className="py-2 px-3 text-left border-r border-slate-200">
                  课题组 / 项目账号
                </th>
                <th scope="col" rowSpan={2} className="py-2 px-3 text-left border-r border-slate-200">
                  依托组织机构
                </th>
                <th scope="colgroup" colSpan={2} className="py-1.5 px-3 text-center border-r border-slate-200">
                  转入
                </th>
                <th scope="colgroup" colSpan={2} className="py-1.5 px-3 text-center border-r border-slate-200">
                  转出
                </th>
                <th scope="col" rowSpan={2} className="py-2 px-3 text-right border-r border-slate-200">
                  可用余额
                </th>
                <th scope="col" rowSpan={2} className="py-2 px-3 text-right no-print">
                  操作
                </th>
              </tr>
              <tr className="border-b border-slate-200">
                <th scope="col" className="py-1.5 px-3 text-right border-r border-slate-200">
                  ERP 拨款充值
                </th>
                <th scope="col" className="py-1.5 px-3 text-right border-r border-slate-200">
                  退回解冻
                </th>
                <th scope="col" className="py-1.5 px-3 text-right border-r border-slate-200">
                  预约冻结(Hold)
                </th>
                <th scope="col" className="py-1.5 px-3 text-right border-r border-slate-200">
                  实际消费扣费
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
              {data.projects.map((p) => {
                const dept = data.departments.find((d) => d.id === p.lead_dept_id);
                const consumed = (
                  Number(p.total_budget) -
                  Number(p.available_balance) -
                  Number(p.frozen_balance)
                ).toFixed(4);
                return (
                  <tr key={p.id} className="cv-row hover:bg-blue-50/40">
                    <td className="py-2.5 px-3 font-sans border-r border-slate-100">
                      <button
                        type="button"
                        onClick={() => onOpenLabDetail(p.id, 'billing')}
                        className="font-bold text-blue-700 hover:underline text-left block"
                      >
                        {p.name}
                      </button>
                      <span className="font-mono text-[11px] text-slate-500">{p.code}</span>
                    </td>
                    <td className="py-2.5 px-3 font-sans text-slate-600 border-r border-slate-100">
                      所内用户 » {dept?.name}
                    </td>
                    <td className="py-2.5 px-3 text-right border-r border-slate-100">
                      ¥{p.total_budget}
                    </td>
                    <td className="py-2.5 px-3 text-right border-r border-slate-100">¥0.0000</td>
                    <td className="py-2.5 px-3 text-right text-amber-700 border-r border-slate-100">
                      ¥{p.frozen_balance}
                    </td>
                    <td className="py-2.5 px-3 text-right text-rose-700 border-r border-slate-100">
                      ¥{consumed}
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-emerald-700 border-r border-slate-100">
                      ¥{p.available_balance}
                    </td>
                    <td className="py-2.5 px-3 text-right font-sans whitespace-nowrap space-x-2 no-print">
                      <button
                        type="button"
                        onClick={() => {
                          setSimErp((prev) => ({ ...prev, project_code: p.code }));
                          setBillingPrimaryTab('deposit');
                        }}
                        className="text-blue-700 hover:underline font-medium"
                      >
                        充值
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenLabDetail(p.id, 'billing')}
                        className="text-blue-700 hover:underline font-medium"
                      >
                        明细
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </DataTableShell>
        </div>
      )}

      {billingPrimaryTab === 'transactions' && (
        <DataTableShell caption="不可篡改复式记账收支明细">
          <thead className="border-b border-slate-200 text-slate-700">
            <tr>
              <th scope="col" className="py-2.5 px-3 text-left">凭证幂等号</th>
              <th scope="col" className="py-2.5 px-3 text-left">类型</th>
              <th scope="col" className="py-2.5 px-3 text-left">借方：项目 / 经办人</th>
              <th scope="col" className="py-2.5 px-3 text-left">贷方：受益财务部门</th>
              <th scope="col" className="py-2.5 px-3 text-left">费率</th>
              <th scope="col" className="py-2.5 px-3 text-right">金额</th>
              <th scope="col" className="py-2.5 px-3 text-right">交易后余额</th>
              <th scope="col" className="py-2.5 px-3 text-left">备注</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
            {data.ledgers.map((l) => (
              <tr key={l.id} className="cv-row hover:bg-blue-50/40">
                <td className="py-2.5 px-3 text-blue-700">{l.idempotency_key}</td>
                <td className="py-2.5 px-3">{l.tx_type}</td>
                <td className="py-2.5 px-3 font-sans">
                  {l.project_code} ({l.operator_name})
                </td>
                <td className="py-2.5 px-3 font-sans">{l.beneficiary_dept_name}</td>
                <td className="py-2.5 px-3">{l.rate_type}</td>
                <td className="py-2.5 px-3 text-right font-bold">¥{l.amount}</td>
                <td className="py-2.5 px-3 text-right">¥{l.balance_after}</td>
                <td className="py-2.5 px-3 font-sans text-slate-600 max-w-xs single-line-cell" title={l.memo}>
                  {l.memo}
                </td>
              </tr>
            ))}
          </tbody>
        </DataTableShell>
      )}

      {billingPrimaryTab === 'departments' && (
        <DataTableShell caption="各行政科室科内/跨科产值统计">
          <thead className="border-b border-slate-200 text-slate-700">
            <tr>
              <th scope="col" className="py-2.5 px-3 text-left">财务部门编码</th>
              <th scope="col" className="py-2.5 px-3 text-left">名称</th>
              <th scope="col" className="py-2.5 px-3 text-left">组织机构</th>
              <th scope="col" className="py-2.5 px-3 text-right">科内结算收入</th>
              <th scope="col" className="py-2.5 px-3 text-right">跨科创收收入</th>
              <th scope="col" className="py-2.5 px-3 text-right">累计总产值</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.dept_revenue_summary.map((d) => (
              <tr key={d.dept_id} className="cv-row hover:bg-blue-50/40">
                <td className="py-2.5 px-3 font-mono font-bold text-blue-700">{d.dept_code}</td>
                <td className="py-2.5 px-3 font-semibold">{d.dept_name}</td>
                <td className="py-2.5 px-3 text-slate-600">
                  所内用户 » 集约化中心 » {d.dept_name}
                </td>
                <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                  ¥{d.internal_revenue}
                </td>
                <td className="py-2.5 px-3 text-right font-mono text-amber-700 tabular-nums">
                  ¥{d.external_revenue}
                </td>
                <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700 tabular-nums">
                  ¥{d.total_revenue}
                </td>
              </tr>
            ))}
          </tbody>
        </DataTableShell>
      )}

      {billingPrimaryTab === 'deposit' && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onTriggerSimErpDeposit();
          }}
          className="max-w-lg p-5 bg-slate-50 border border-slate-200 rounded-xl space-y-4 shadow-sm"
        >
          <h2 className="font-bold text-sm text-slate-900 border-b border-slate-200 pb-2">
            项目经费充值 / ERP 凭证同步
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <FormField label="项目编号">
              {(props) => (
                <select
                  {...props}
                  value={simErp.project_code}
                  onChange={(e) => setSimErp({ ...simErp, project_code: e.target.value })}
                  className={`${INPUT_CLS} font-mono`}
                >
                  {data.projects.map((p) => (
                    <option key={p.id} value={p.code}>
                      {p.code} - {p.name}
                    </option>
                  ))}
                </select>
              )}
            </FormField>
            <FormField label="充值金额 (元)" required>
              {(props) => (
                <input
                  {...props}
                  type="text"
                  inputMode="decimal"
                  value={simErp.amount}
                  onChange={(e) => setSimErp({ ...simErp, amount: e.target.value })}
                  className={`${INPUT_CLS} font-mono`}
                  required
                />
              )}
            </FormField>
          </div>
          <FormField
            label="ERP 财务凭证号 (幂等校验)"
            hint="相同凭证号重复提交将被幂等拦截，不会重复入账"
            required
          >
            {(props) => (
              <div className="flex gap-2">
                <input
                  {...props}
                  type="text"
                  spellCheck={false}
                  value={simErp.erp_voucher_no}
                  onChange={(e) => setSimErp({ ...simErp, erp_voucher_no: e.target.value })}
                  className={`${INPUT_CLS} font-mono`}
                  required
                />
                <button
                  type="button"
                  onClick={() =>
                    setSimErp({
                      ...simErp,
                      erp_voucher_no: `ERP-2026-${Math.floor(10000 + Math.random() * 90000)}`,
                    })
                  }
                  className="shrink-0 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs text-slate-700"
                >
                  新凭证号
                </button>
              </div>
            )}
          </FormField>
          <button
            type="submit"
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm"
          >
            确认充值入账
          </button>
        </form>
      )}
    </div>
  );
}
