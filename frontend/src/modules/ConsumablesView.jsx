import React from 'react';
import { Plus, AlertTriangle } from 'lucide-react';
import TabBar from '../components/ui/TabBar';
import DataTableShell from '../components/ui/DataTableShell';
import { FormField, INPUT_CLS } from '../components/ui/FormField';
import {
  canCreateConsumable,
  canEditConsumable,
  canDeleteConsumable,
} from '../permissions';

export default function ConsumablesView({
  data,
  currentOperator,
  consPrimaryTab,
  setConsPrimaryTab,
  editingConsumableId,
  setEditingConsumableId,
  consumableForm,
  setConsumableForm,
  claimForm,
  setClaimForm,
  onSaveConsumable,
  onClaimConsumable,
  onRequestDeleteConsumable,
}) {
  const tabs = [
    { id: 'list', label: '耗材库存台账', count: data.consumables.length },
    ...(canCreateConsumable(currentOperator) || editingConsumableId
      ? [{ id: 'upsert', label: editingConsumableId ? '修改耗材/补货' : '添加新耗材' }]
      : []),
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-base font-bold text-slate-900">试剂耗材库存与申领记账</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          实时扣减库存并自动按归口科室执行科内/跨科单价复式结算，低于安全阈值时自动预警
        </p>
      </div>

      <TabBar
        label="耗材管理导航"
        tabs={tabs}
        activeId={consPrimaryTab}
        onChange={(id) => {
          if (id === 'list') setEditingConsumableId(null);
          setConsPrimaryTab(id);
        }}
      />

      {consPrimaryTab === 'upsert' ? (
        <form
          onSubmit={onSaveConsumable}
          className="max-w-xl p-5 bg-slate-50 border border-slate-200 rounded-xl space-y-4 shadow-sm"
        >
          <h2 className="font-bold text-sm text-slate-900 border-b border-slate-200 pb-2">
            {editingConsumableId ? '修改耗材信息 / 库存补货' : '新增试剂耗材品类'}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <FormField label="耗材编码" required errorText="请填写耗材编码。">
              {(props) => (
                <input
                  {...props}
                  type="text"
                  spellCheck={false}
                  value={consumableForm.code}
                  onChange={(e) => setConsumableForm({ ...consumableForm, code: e.target.value })}
                  className={`${INPUT_CLS} font-mono`}
                  required
                />
              )}
            </FormField>
            <FormField label="耗材名称" required errorText="请填写耗材名称。">
              {(props) => (
                <input
                  {...props}
                  type="text"
                  value={consumableForm.name}
                  onChange={(e) => setConsumableForm({ ...consumableForm, name: e.target.value })}
                  className={INPUT_CLS}
                  required
                />
              )}
            </FormField>
            <FormField label="规格型号" required errorText="请填写规格型号。">
              {(props) => (
                <input
                  {...props}
                  type="text"
                  value={consumableForm.spec}
                  onChange={(e) => setConsumableForm({ ...consumableForm, spec: e.target.value })}
                  className={INPUT_CLS}
                  required
                />
              )}
            </FormField>
            <FormField label="归口行政科室">
              {(props) => (
                <select
                  {...props}
                  value={consumableForm.owner_dept_id}
                  onChange={(e) =>
                    setConsumableForm({ ...consumableForm, owner_dept_id: e.target.value })
                  }
                  disabled={currentOperator?.system_role !== 'ADMIN'}
                  className={INPUT_CLS}
                >
                  {data.departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              )}
            </FormField>
            <FormField label="当前库存余量">
              {(props) => (
                <input
                  {...props}
                  type="number"
                  step="1"
                  value={consumableForm.stock_qty}
                  onChange={(e) =>
                    setConsumableForm({ ...consumableForm, stock_qty: e.target.value })
                  }
                  className={`${INPUT_CLS} font-mono`}
                />
              )}
            </FormField>
            <FormField label="安全库存阈值">
              {(props) => (
                <input
                  {...props}
                  type="number"
                  step="1"
                  value={consumableForm.safety_threshold}
                  onChange={(e) =>
                    setConsumableForm({ ...consumableForm, safety_threshold: e.target.value })
                  }
                  className={`${INPUT_CLS} font-mono`}
                />
              )}
            </FormField>
            <FormField label="科内领用单价 (元)">
              {(props) => (
                <input
                  {...props}
                  type="number"
                  step="1"
                  value={consumableForm.internal_unit_price}
                  onChange={(e) =>
                    setConsumableForm({ ...consumableForm, internal_unit_price: e.target.value })
                  }
                  className={`${INPUT_CLS} font-mono`}
                />
              )}
            </FormField>
            <FormField label="跨科领用单价 (元)">
              {(props) => (
                <input
                  {...props}
                  type="number"
                  step="1"
                  value={consumableForm.external_unit_price}
                  onChange={(e) =>
                    setConsumableForm({ ...consumableForm, external_unit_price: e.target.value })
                  }
                  className={`${INPUT_CLS} font-mono`}
                />
              )}
            </FormField>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm"
            >
              保存耗材
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingConsumableId(null);
                setConsPrimaryTab('list');
              }}
              className="px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs"
            >
              取消
            </button>
          </div>
        </form>
      ) : (
        <>
          <form
            onSubmit={onClaimConsumable}
            className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex flex-wrap items-end justify-between gap-3 no-print"
          >
            <div className="flex flex-wrap items-end gap-3">
              <FormField label="选择领用耗材" className="min-w-[230px]">
                {(props) => (
                  <select
                    {...props}
                    value={claimForm.consumable_id}
                    onChange={(e) =>
                      setClaimForm({ ...claimForm, consumable_id: e.target.value })
                    }
                    className={INPUT_CLS}
                  >
                    {data.consumables.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code} - {c.name} (余量:{c.stock_qty})
                      </option>
                    ))}
                  </select>
                )}
              </FormField>
              <FormField label="领用数量" className="w-28">
                {(props) => (
                  <input
                    {...props}
                    type="number"
                    min="1"
                    step="1"
                    value={claimForm.quantity}
                    onChange={(e) => setClaimForm({ ...claimForm, quantity: e.target.value })}
                    className={`${INPUT_CLS} font-mono`}
                  />
                )}
              </FormField>
              <button
                type="submit"
                className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm"
              >
                确认领用并记账
              </button>
            </div>
            {canCreateConsumable(currentOperator) && (
              <button
                type="button"
                onClick={() => {
                  setEditingConsumableId(null);
                  setConsumableForm({
                    code: 'CONS-STD-01',
                    name: '色谱级甲醇标准试剂',
                    spec: '4L / 瓶',
                    owner_dept_id: currentOperator?.home_dept_id || 1,
                    stock_qty: '30.0000',
                    safety_threshold: '8.0000',
                    internal_unit_price: '120.0000',
                    external_unit_price: '200.0000',
                  });
                  setConsPrimaryTab('upsert');
                }}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium inline-flex items-center gap-1 shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" /> 添加耗材品类
              </button>
            )}
          </form>

          <DataTableShell caption="试剂耗材库存与双单价台账">
            <thead className="border-b border-slate-200 text-slate-700">
              <tr>
                <th scope="col" className="py-2.5 px-3 text-left">耗材编号</th>
                <th scope="col" className="py-2.5 px-3 text-left">名称</th>
                <th scope="col" className="py-2.5 px-3 text-left">规格型号</th>
                <th scope="col" className="py-2.5 px-3 text-left">归口科室</th>
                <th scope="col" className="py-2.5 px-3 text-left">当前库存 / 安全阈值</th>
                <th scope="col" className="py-2.5 px-3 text-left">科内单价 / 跨科单价</th>
                <th scope="col" className="py-2.5 px-3 text-right no-print">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.consumables.map((c) => {
                const low = Number(c.stock_qty) <= Number(c.safety_threshold);
                return (
                  <tr key={c.id} className="cv-row hover:bg-blue-50/40">
                    <td className="py-2.5 px-3 font-mono font-bold text-blue-700">{c.code}</td>
                    <td className="py-2.5 px-3 font-semibold">{c.name}</td>
                    <td className="py-2.5 px-3 font-mono">{c.spec}</td>
                    <td className="py-2.5 px-3">{c.owner_dept_name}</td>
                    <td className="py-2.5 px-3 font-mono tabular-nums">
                      <span className={low ? 'text-rose-700 font-bold' : 'text-emerald-700 font-semibold'}>
                        {c.stock_qty}
                      </span>{' '}
                      / {c.safety_threshold}
                      {low && (
                        <span className="ml-2 inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-rose-50 border border-rose-200 text-rose-700 font-sans text-[10px] font-medium">
                          <AlertTriangle className="w-3 h-3" aria-hidden="true" /> 库存预警
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-mono tabular-nums">
                      ¥{c.internal_unit_price} / ¥{c.external_unit_price}
                    </td>
                    <td className="py-2.5 px-3 text-right whitespace-nowrap space-x-2 no-print">
                      {canEditConsumable(currentOperator, c) && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingConsumableId(c.id);
                            setConsumableForm({
                              code: c.code,
                              name: c.name,
                              spec: c.spec,
                              owner_dept_id: c.owner_dept_id,
                              stock_qty: c.stock_qty,
                              safety_threshold: c.safety_threshold,
                              internal_unit_price: c.internal_unit_price,
                              external_unit_price: c.external_unit_price,
                            });
                            setConsPrimaryTab('upsert');
                          }}
                          className="text-blue-700 hover:underline font-medium"
                        >
                          修改/补货
                        </button>
                      )}
                      {canDeleteConsumable(currentOperator, c) && (
                        <button
                          type="button"
                          onClick={() => onRequestDeleteConsumable(c)}
                          className="text-rose-600 hover:underline font-medium"
                        >
                          删除
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </DataTableShell>
        </>
      )}
    </div>
  );
}
