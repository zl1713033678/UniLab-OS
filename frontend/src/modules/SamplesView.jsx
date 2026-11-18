import React from 'react';
import { Plus, Lock } from 'lucide-react';
import TabBar from '../components/ui/TabBar';
import DataTableShell from '../components/ui/DataTableShell';
import StatusBadge from '../components/ui/StatusBadge';
import { FormField, INPUT_CLS } from '../components/ui/FormField';
import { canDeleteSample } from '../permissions';

export default function SamplesView({
  data,
  currentOperator,
  samplePrimaryTab,
  setSamplePrimaryTab,
  sampleForm,
  setSampleForm,
  coaSampleId,
  setCoaSampleId,
  coaJsonText,
  setCoaJsonText,
  onCreateSample,
  onUpdateCOA,
  onRequestDeleteSample,
}) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-base font-bold text-slate-900">测样报告审核与样品台账 (LIMS)</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          自动生成唯一条码并实时记账；保密隔离项目的原始 COA 检测指标仅授权项目白名单成员可查阅
        </p>
      </div>

      <TabBar
        label="样品与测样报告导航"
        tabs={[
          { id: 'list', label: '送样检测台账', count: data.samples.length },
          { id: 'add', label: '登记新送样' },
          { id: 'coa', label: '测样报告(COA)签发' },
        ]}
        activeId={samplePrimaryTab}
        onChange={setSamplePrimaryTab}
      />

      {samplePrimaryTab === 'list' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 border border-slate-200 p-2.5 rounded-xl no-print">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSamplePrimaryTab('add')}
                className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium inline-flex items-center gap-1 shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" /> 添加送样
              </button>
              <button
                type="button"
                onClick={() => setSamplePrimaryTab('coa')}
                className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium"
              >
                签发 COA 报告
              </button>
            </div>
            <span className="text-xs text-slate-600">
              共有 <strong className="text-blue-700 tabular-nums">{data.samples.length}</strong> 份送检样品
            </span>
          </div>

          <DataTableShell caption="LIMS 送检样品与 COA 报告台账">
            <thead className="border-b border-slate-200 text-slate-700">
              <tr>
                <th scope="col" className="py-2.5 px-3 text-left">条码编号</th>
                <th scope="col" className="py-2.5 px-3 text-left">样品名称</th>
                <th scope="col" className="py-2.5 px-3 text-left">检测项目</th>
                <th scope="col" className="py-2.5 px-3 text-left">送检人 / 项目</th>
                <th scope="col" className="py-2.5 px-3 text-left">承检科室</th>
                <th scope="col" className="py-2.5 px-3 text-left">收费金额</th>
                <th scope="col" className="py-2.5 px-3 text-left">状态</th>
                <th scope="col" className="py-2.5 px-3 text-left">COA 检测报告指标</th>
                <th scope="col" className="py-2.5 px-3 text-right no-print">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.samples.map((s) => (
                <tr key={s.id} className="cv-row hover:bg-blue-50/40">
                  <td className="py-2.5 px-3 font-mono font-bold text-blue-700">{s.barcode}</td>
                  <td className="py-2.5 px-3 font-semibold">{s.name}</td>
                  <td className="py-2.5 px-3">
                    {s.test_item_name} <span className="font-mono text-slate-500">(x{s.sample_count})</span>
                  </td>
                  <td className="py-2.5 px-3">
                    {s.submitter_name}{' '}
                    <span className="font-mono text-slate-500">({s.project_code})</span>
                  </td>
                  <td className="py-2.5 px-3">{s.target_dept_name}</td>
                  <td className="py-2.5 px-3 font-mono tabular-nums">
                    [{s.rate_type}] ¥{s.total_test_fee}
                  </td>
                  <td className="py-2.5 px-3">
                    <StatusBadge status={s.status} />
                  </td>
                  <td className="py-2.5 px-3 font-mono text-[11px] max-w-xs">
                    {s.coa_accessible ? (
                      <span className="text-emerald-800 break-all">
                        {JSON.stringify(s.coa_metrics)}
                      </span>
                    ) : (
                      <span className="text-rose-700 inline-flex items-center gap-1 font-sans font-medium">
                        <Lock className="w-3 h-3 shrink-0" aria-hidden="true" /> 保密项目数据隔离
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-right whitespace-nowrap space-x-2 no-print">
                    <button
                      type="button"
                      onClick={() => {
                        setCoaSampleId(String(s.id));
                        setSamplePrimaryTab('coa');
                      }}
                      className="text-blue-700 hover:underline font-medium"
                    >
                      {s.status === 'COMPLETED' ? '重签COA' : '签发COA'}
                    </button>
                    {canDeleteSample(currentOperator, s, data.projects) && (
                      <button
                        type="button"
                        onClick={() => onRequestDeleteSample(s)}
                        className="text-rose-600 hover:underline font-medium"
                      >
                        {s.status === 'REGISTERED' ? '撤回送样' : '删除'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTableShell>
        </div>
      )}

      {samplePrimaryTab === 'add' && (
        <form
          onSubmit={onCreateSample}
          className="max-w-xl p-5 bg-slate-50 border border-slate-200 rounded-xl space-y-4 shadow-sm"
        >
          <h2 className="font-bold text-sm text-slate-900 border-b border-slate-200 pb-2">
            登记新送检样品
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <FormField label="样品名称" required errorText="请填写样品名称。">
              {(props) => (
                <input
                  {...props}
                  type="text"
                  value={sampleForm.name}
                  onChange={(e) => setSampleForm({ ...sampleForm, name: e.target.value })}
                  className={INPUT_CLS}
                  required
                />
              )}
            </FormField>
            <FormField label="承检科室" required>
              {(props) => (
                <select
                  {...props}
                  value={sampleForm.target_dept_id}
                  onChange={(e) => setSampleForm({ ...sampleForm, target_dept_id: e.target.value })}
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
            <FormField label="检测项目" required errorText="请填写检测项目。">
              {(props) => (
                <input
                  {...props}
                  type="text"
                  value={sampleForm.test_item_name}
                  onChange={(e) => setSampleForm({ ...sampleForm, test_item_name: e.target.value })}
                  className={INPUT_CLS}
                  required
                />
              )}
            </FormField>
            <FormField label="样品份数">
              {(props) => (
                <input
                  {...props}
                  type="number"
                  min="1"
                  value={sampleForm.sample_count}
                  onChange={(e) => setSampleForm({ ...sampleForm, sample_count: e.target.value })}
                  className={`${INPUT_CLS} font-mono`}
                />
              )}
            </FormField>
            <FormField label="科内单价 (元)">
              {(props) => (
                <input
                  {...props}
                  type="number"
                  value={sampleForm.internal_test_price}
                  onChange={(e) =>
                    setSampleForm({ ...sampleForm, internal_test_price: e.target.value })
                  }
                  className={`${INPUT_CLS} font-mono`}
                />
              )}
            </FormField>
            <FormField label="跨科单价 (元)">
              {(props) => (
                <input
                  {...props}
                  type="number"
                  value={sampleForm.external_test_price}
                  onChange={(e) =>
                    setSampleForm({ ...sampleForm, external_test_price: e.target.value })
                  }
                  className={`${INPUT_CLS} font-mono`}
                />
              )}
            </FormField>
          </div>
          <button
            type="submit"
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm"
          >
            提交送样并扣费
          </button>
        </form>
      )}

      {samplePrimaryTab === 'coa' && (
        <form
          onSubmit={onUpdateCOA}
          className="max-w-xl p-5 bg-slate-50 border border-slate-200 rounded-xl space-y-4 shadow-sm"
        >
          <h2 className="font-bold text-sm text-slate-900 border-b border-slate-200 pb-2">
            签发 COA 检测报告
          </h2>
          <FormField label="选择样品" required errorText="请选择要签发报告的样品。">
            {(props) => (
              <select
                {...props}
                value={coaSampleId}
                onChange={(e) => setCoaSampleId(e.target.value)}
                className={INPUT_CLS}
                required
              >
                <option value="">-- 请选择样品 --</option>
                {data.samples.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.barcode} - {s.name}
                  </option>
                ))}
              </select>
            )}
          </FormField>
          <FormField label="检测结果指标 (JSON)" hint="需为合法 JSON 对象格式">
            {(props) => (
              <textarea
                {...props}
                rows={4}
                value={coaJsonText}
                onChange={(e) => setCoaJsonText(e.target.value)}
                className={`${INPUT_CLS} font-mono`}
              />
            )}
          </FormField>
          <button
            type="submit"
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm"
          >
            签发测样报告
          </button>
        </form>
      )}
    </div>
  );
}
