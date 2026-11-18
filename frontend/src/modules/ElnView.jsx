import React from 'react';
import { Lock, Plus } from 'lucide-react';
import TabBar from '../components/ui/TabBar';
import DataTableShell from '../components/ui/DataTableShell';
import { FormField, INPUT_CLS } from '../components/ui/FormField';
import { canEditELN, canUnlockELN, canDeleteELN } from '../permissions';

export default function ElnView({
  data,
  currentOperator,
  elnPrimaryTab,
  setElnPrimaryTab,
  editingElnId,
  setEditingElnId,
  elnForm,
  setElnForm,
  onSaveELN,
  onLockELN,
  onUnlockELN,
  onRequestDeleteELN,
}) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-base font-bold text-slate-900">成果与电子实验记录本 (ELN)</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          关联 FMS 机时单与 LIMS 样品成本自动归集；支持电子签名锁定、PI/超管解锁与跨科保密隔离
        </p>
      </div>

      <TabBar
        label="实验记录本导航"
        tabs={[
          { id: 'list', label: '实验记录列表', count: data.eln_records.length },
          { id: 'add', label: editingElnId ? `编辑实验记录 (#${editingElnId})` : '新建实验记录' },
        ]}
        activeId={elnPrimaryTab}
        onChange={(id) => {
          if (id === 'list') setEditingElnId(null);
          setElnPrimaryTab(id);
        }}
      />

      {elnPrimaryTab === 'list' && (
        <div className="space-y-3">
          <div className="bg-slate-50 border border-slate-200 p-2.5 rounded-xl flex items-center justify-between no-print">
            <button
              type="button"
              onClick={() => {
                setEditingElnId(null);
                setElnPrimaryTab('add');
              }}
              className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium inline-flex items-center gap-1 shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" /> 新建实验记录
            </button>
            <span className="text-xs text-slate-600">
              共有 <strong className="text-blue-700">{data.eln_records.length}</strong> 篇记录
            </span>
          </div>

          <DataTableShell caption="ELN 电子实验记录列表">
            <thead className="border-b border-slate-200 text-slate-700">
              <tr>
                <th scope="col" className="py-2.5 px-3 text-left">编号</th>
                <th scope="col" className="py-2.5 px-3 text-left">实验记录标题</th>
                <th scope="col" className="py-2.5 px-3 text-left">作者 / 所属项目</th>
                <th scope="col" className="py-2.5 px-3 text-left">实验内容与参数</th>
                <th scope="col" className="py-2.5 px-3 text-right">归集总成本</th>
                <th scope="col" className="py-2.5 px-3 text-right no-print">状态 / 操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.eln_records.map((e) => (
                <tr key={e.id} className="cv-row hover:bg-blue-50/40 align-top">
                  <td className="py-2.5 px-3 font-mono font-bold text-blue-700">#{e.id}</td>
                  <td className="py-2.5 px-3 font-semibold">{e.title}</td>
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    {e.author_name}{' '}
                    <span className="font-mono text-slate-500">({e.project_code})</span>
                  </td>
                  <td className="py-2.5 px-3 max-w-md">
                    {e.accessible ? (
                      <div className="whitespace-pre-wrap text-slate-700 leading-relaxed">
                        {e.markdown_content}
                      </div>
                    ) : (
                      <span className="text-rose-700 inline-flex items-center gap-1 font-medium">
                        <Lock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" /> 保密项目正文隔离
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700 tabular-nums whitespace-nowrap">
                    ¥{e.synthesized_total_cost}
                  </td>
                  <td className="py-2.5 px-3 text-right whitespace-nowrap space-x-2 no-print">
                    {e.is_locked ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-medium">
                        <Lock className="w-3 h-3" aria-hidden="true" /> 已锁定
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onLockELN(e.id)}
                        className="px-2.5 py-1 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-medium"
                      >
                        签名锁定
                      </button>
                    )}
                    {canEditELN(currentOperator, e, data.projects) && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingElnId(e.id);
                          setElnForm({
                            title: e.title,
                            markdown_content: e.markdown_content,
                            conditions_text: JSON.stringify(e.conditions_json || {}),
                            linked_reservation_id: e.linked_reservation_id || '',
                            linked_sample_id: e.linked_sample_id || '',
                          });
                          setElnPrimaryTab('add');
                        }}
                        className="text-blue-700 hover:underline font-medium"
                      >
                        编辑
                      </button>
                    )}
                    {canUnlockELN(currentOperator, e, data.projects) && (
                      <button
                        type="button"
                        onClick={() => onUnlockELN(e.id)}
                        className="text-amber-700 hover:underline font-medium"
                      >
                        解锁
                      </button>
                    )}
                    {canDeleteELN(currentOperator, e, data.projects) && (
                      <button
                        type="button"
                        onClick={() => onRequestDeleteELN(e)}
                        className="text-rose-600 hover:underline font-medium"
                      >
                        删除
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTableShell>
        </div>
      )}

      {elnPrimaryTab === 'add' && (
        <form
          onSubmit={onSaveELN}
          className="max-w-xl p-5 bg-slate-50 border border-slate-200 rounded-xl space-y-4 shadow-sm"
        >
          <h2 className="font-bold text-sm text-slate-900 border-b border-slate-200 pb-2">
            {editingElnId ? `编辑实验记录 (#${editingElnId})` : '新建电子实验记录'}
          </h2>
          <FormField label="实验标题" required errorText="请填写实验记录标题。">
            {(props) => (
              <input
                {...props}
                type="text"
                value={elnForm.title}
                onChange={(e) => setElnForm({ ...elnForm, title: e.target.value })}
                className={INPUT_CLS}
                required
              />
            )}
          </FormField>
          <FormField label="实验正文 (Markdown)" required errorText="请填写实验正文内容。">
            {(props) => (
              <textarea
                {...props}
                rows={5}
                value={elnForm.markdown_content}
                onChange={(e) => setElnForm({ ...elnForm, markdown_content: e.target.value })}
                className={`${INPUT_CLS} font-mono`}
                required
              />
            )}
          </FormField>
          <FormField label="结构化实验条件参数 (JSON)" hint="例如温度、转速、溶剂体系">
            {(props) => (
              <input
                {...props}
                type="text"
                value={elnForm.conditions_text}
                onChange={(e) => setElnForm({ ...elnForm, conditions_text: e.target.value })}
                className={`${INPUT_CLS} font-mono`}
              />
            )}
          </FormField>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <FormField label="关联机时预约单">
              {(props) => (
                <select
                  {...props}
                  value={elnForm.linked_reservation_id}
                  onChange={(e) =>
                    setElnForm({ ...elnForm, linked_reservation_id: e.target.value })
                  }
                  className={INPUT_CLS}
                >
                  <option value="">-- 无 --</option>
                  {data.reservations.map((r) => (
                    <option key={r.id} value={r.id}>
                      #{r.id} {r.device_code}
                    </option>
                  ))}
                </select>
              )}
            </FormField>
            <FormField label="关联送检样品">
              {(props) => (
                <select
                  {...props}
                  value={elnForm.linked_sample_id}
                  onChange={(e) => setElnForm({ ...elnForm, linked_sample_id: e.target.value })}
                  className={INPUT_CLS}
                >
                  <option value="">-- 无 --</option>
                  {data.samples.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.barcode}
                    </option>
                  ))}
                </select>
              )}
            </FormField>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm"
            >
              保存记录
            </button>
            {editingElnId && (
              <button
                type="button"
                onClick={() => {
                  setEditingElnId(null);
                  setElnPrimaryTab('list');
                }}
                className="px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs"
              >
                取消编辑
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
