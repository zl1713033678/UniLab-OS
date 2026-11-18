import React, { useState } from 'react';
import { Plus, Search, Download, Printer } from 'lucide-react';
import TabBar from '../components/ui/TabBar';
import DataTableShell from '../components/ui/DataTableShell';
import StatusBadge from '../components/ui/StatusBadge';
import { FormField, INPUT_CLS } from '../components/ui/FormField';
import { exportTableToCSV } from '../api/client';
import {
  canCreateDevice,
  canEditDevice,
  canDeleteDevice,
  canCancelOrDeleteReservation,
} from '../permissions';

export default function EquipmentsView({
  data,
  currentOperator,
  eqPrimaryTab,
  setEqPrimaryTab,
  eqSecondaryTab,
  setEqSecondaryTab,
  selectedDevice,
  eqDetailTab,
  setEqDetailTab,
  eqSearchKeyword,
  setEqSearchKeyword,
  eqSearchDeptId,
  setEqSearchDeptId,
  editingDeviceId,
  setEditingDeviceId,
  deviceForm,
  setDeviceForm,
  resForm,
  setResForm,
  checkoutHoursMap,
  setCheckoutHoursMap,
  onOpenDeviceDetail,
  onSaveDevice,
  onRequestDeleteDevice,
  onCreateReservation,
  onCheckin,
  onCheckout,
  onRequestCancelOrDeleteReservation,
  onGoAddSampleForDevice,
}) {
  const [showEqSearch, setShowEqSearch] = useState(false);

  const filteredDevices = data.devices.filter((d) => {
    if (eqSecondaryTab !== 'all' && d.status !== eqSecondaryTab) return false;
    if (eqSearchDeptId !== '0' && String(d.owner_dept_id) !== String(eqSearchDeptId)) return false;
    if (
      eqSearchKeyword.trim() &&
      !d.name.toLowerCase().includes(eqSearchKeyword.toLowerCase()) &&
      !d.code.toLowerCase().includes(eqSearchKeyword.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  const primaryTabs = [
    { id: 'list', label: '仪器列表', count: data.devices.length },
    { id: 'records', label: '使用记录', count: data.reservations.length },
    { id: 'reserv', label: '仪器预约管理' },
    { id: 'map', label: '实验室平面图监控' },
    ...(canCreateDevice(currentOperator) || editingDeviceId
      ? [{ id: 'upsert_device', label: editingDeviceId ? '修改仪器信息' : '添加新仪器' }]
      : []),
    ...(eqPrimaryTab === 'detail' && selectedDevice
      ? [{ id: 'detail', label: `${selectedDevice.name} (${selectedDevice.code})` }]
      : []),
  ];

  const statusFilters = [
    { id: 'all', label: '全部设备', count: data.devices.length },
    { id: 'IDLE', label: '正常空闲', count: data.devices.filter((d) => d.status === 'IDLE').length },
    { id: 'RESERVED', label: '已预约', count: data.devices.filter((d) => d.status === 'RESERVED').length },
    { id: 'RUNNING', label: '运行中', count: data.devices.filter((d) => d.status === 'RUNNING').length },
    { id: 'FAULT', label: '故障设备', count: data.devices.filter((d) => d.status === 'FAULT').length },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-base font-bold text-slate-900">仪器目录与机时调度</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            支持科内/跨科双费率自动判定、预授权冻结与实验室 2D 平面图实时遥测监控
          </p>
        </div>
      </div>

      <TabBar
        label="仪器管理模块导航"
        tabs={primaryTabs}
        activeId={eqPrimaryTab}
        onChange={(id) => {
          if (id !== 'upsert_device') setEditingDeviceId(null);
          setEqPrimaryTab(id);
        }}
      />

      {eqPrimaryTab === 'upsert_device' && (
        <form
          onSubmit={onSaveDevice}
          className="max-w-2xl p-5 bg-slate-50 border border-slate-200 rounded-xl space-y-4 shadow-sm"
        >
          <h2 className="font-bold text-sm text-slate-900 border-b border-slate-200 pb-2.5">
            {editingDeviceId ? `修改仪器配置 (#${editingDeviceId})` : '添加新仪器设备'}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <FormField label="仪器资产编号" required errorText="请填写仪器编码。">
              {(props) => (
                <input
                  {...props}
                  type="text"
                  name="device_code"
                  spellCheck={false}
                  value={deviceForm.code}
                  onChange={(e) => setDeviceForm({ ...deviceForm, code: e.target.value })}
                  className={`${INPUT_CLS} font-mono`}
                  required
                />
              )}
            </FormField>
            <FormField label="仪器名称" required errorText="请填写仪器名称。">
              {(props) => (
                <input
                  {...props}
                  type="text"
                  name="device_name"
                  value={deviceForm.name}
                  onChange={(e) => setDeviceForm({ ...deviceForm, name: e.target.value })}
                  className={INPUT_CLS}
                  required
                />
              )}
            </FormField>
            <FormField label="归口行政科室" required>
              {(props) => (
                <select
                  {...props}
                  value={deviceForm.owner_dept_id}
                  onChange={(e) => setDeviceForm({ ...deviceForm, owner_dept_id: e.target.value })}
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
            <FormField label="设备运行状态">
              {(props) => (
                <select
                  {...props}
                  value={deviceForm.status}
                  onChange={(e) => setDeviceForm({ ...deviceForm, status: e.target.value })}
                  className={`${INPUT_CLS} font-mono`}
                >
                  <option value="IDLE">IDLE (正常空闲)</option>
                  <option value="RESERVED">RESERVED (已预约)</option>
                  <option value="RUNNING">RUNNING (运行中)</option>
                  <option value="FAULT">FAULT (故障停机)</option>
                </select>
              )}
            </FormField>
            <FormField label="科内优惠时薪 (元/h)">
              {(props) => (
                <input
                  {...props}
                  type="number"
                  step="1"
                  value={deviceForm.internal_hourly_rate}
                  onChange={(e) =>
                    setDeviceForm({ ...deviceForm, internal_hourly_rate: e.target.value })
                  }
                  className={`${INPUT_CLS} font-mono`}
                />
              )}
            </FormField>
            <FormField label="跨科标准时薪 (元/h)">
              {(props) => (
                <input
                  {...props}
                  type="number"
                  step="1"
                  value={deviceForm.external_hourly_rate}
                  onChange={(e) =>
                    setDeviceForm({ ...deviceForm, external_hourly_rate: e.target.value })
                  }
                  className={`${INPUT_CLS} font-mono`}
                />
              )}
            </FormField>
            <FormField label="待机电流阈值 (A)">
              {(props) => (
                <input
                  {...props}
                  type="number"
                  step="0.1"
                  value={deviceForm.standby_current_threshold}
                  onChange={(e) =>
                    setDeviceForm({ ...deviceForm, standby_current_threshold: e.target.value })
                  }
                  className={`${INPUT_CLS} font-mono`}
                />
              )}
            </FormField>
            <div className="grid grid-cols-2 gap-2.5">
              <FormField label="平面图 X%">
                {(props) => (
                  <input
                    {...props}
                    type="number"
                    min="5"
                    max="95"
                    value={deviceForm.pos_x}
                    onChange={(e) => setDeviceForm({ ...deviceForm, pos_x: e.target.value })}
                    className={`${INPUT_CLS} font-mono`}
                  />
                )}
              </FormField>
              <FormField label="平面图 Y%">
                {(props) => (
                  <input
                    {...props}
                    type="number"
                    min="10"
                    max="90"
                    value={deviceForm.pos_y}
                    onChange={(e) => setDeviceForm({ ...deviceForm, pos_y: e.target.value })}
                    className={`${INPUT_CLS} font-mono`}
                  />
                )}
              </FormField>
            </div>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm"
            >
              {editingDeviceId ? '保存仪器修改' : '确认添加仪器'}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingDeviceId(null);
                setEqPrimaryTab('list');
              }}
              className="px-4 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs"
            >
              取消
            </button>
          </div>
        </form>
      )}

      {eqPrimaryTab === 'list' && (
        <div className="space-y-3">
          {/* 状态过滤胶囊 */}
          <div className="flex flex-wrap gap-1.5 no-print" role="group" aria-label="按设备状态筛选">
            {statusFilters.map((st) => (
              <button
                key={st.id}
                type="button"
                aria-pressed={eqSecondaryTab === st.id}
                onClick={() => setEqSecondaryTab(st.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition inline-flex items-center gap-1.5 ${
                  eqSecondaryTab === st.id
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <span>{st.label}</span>
                <span className="font-mono text-[10px] opacity-80">{st.count}</span>
              </button>
            ))}
          </div>

          {/* 工具条 */}
          <div className="bg-slate-50 border border-slate-200 p-2.5 rounded-xl flex flex-wrap items-center justify-between gap-2 no-print">
            <div className="flex flex-wrap items-center gap-2">
              {canCreateDevice(currentOperator) && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingDeviceId(null);
                    setDeviceForm({
                      code: 'XRD-03',
                      name: '高分辨X射线衍射仪',
                      owner_dept_id: currentOperator?.home_dept_id || 1,
                      pos_x: 65,
                      pos_y: 35,
                      status: 'IDLE',
                      standby_current_threshold: '1.5000',
                      internal_hourly_rate: '100.0000',
                      external_hourly_rate: '240.0000',
                    });
                    setEqPrimaryTab('upsert_device');
                  }}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium inline-flex items-center gap-1 shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" aria-hidden="true" /> 添加仪器
                </button>
              )}
              <button
                type="button"
                onClick={() => setEqPrimaryTab('reserv')}
                className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium inline-flex items-center gap-1 shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" /> 预约登记
              </button>
              <button
                type="button"
                aria-expanded={showEqSearch}
                onClick={() => setShowEqSearch((v) => !v)}
                className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs inline-flex items-center gap-1"
              >
                <Search className="w-3.5 h-3.5" aria-hidden="true" /> 高级筛选
              </button>
              <button
                type="button"
                onClick={() =>
                  exportTableToCSV(
                    'equipments.csv',
                    ['编号', '名称', '归口科室', '状态', '实时电流(A)', '科内时薪', '跨科时薪'],
                    filteredDevices.map((d) => [
                      d.code,
                      d.name,
                      d.owner_dept_name,
                      d.status,
                      d.current_amps,
                      d.internal_hourly_rate,
                      d.external_hourly_rate,
                    ])
                  )
                }
                className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs inline-flex items-center gap-1"
              >
                <Download className="w-3.5 h-3.5" aria-hidden="true" /> 导出 CSV
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs inline-flex items-center gap-1"
              >
                <Printer className="w-3.5 h-3.5" aria-hidden="true" /> 打印
              </button>
            </div>

            <search className="flex items-center gap-2 text-xs text-slate-600">
              <label htmlFor="eq-quick-search" className="visually-hidden">
                搜索仪器名称或编号
              </label>
              <input
                id="eq-quick-search"
                type="search"
                enterKeyHint="search"
                placeholder="搜索仪器名称或编号..."
                value={eqSearchKeyword}
                onChange={(e) => setEqSearchKeyword(e.target.value)}
                className="border border-slate-300 rounded-lg px-3 py-1.5 bg-white w-48 text-xs"
              />
            </search>
          </div>

          {showEqSearch && (
            <search className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl grid grid-cols-1 sm:grid-cols-3 gap-3 no-print">
              <FormField label="归口组织机构">
                {(props) => (
                  <select
                    {...props}
                    value={eqSearchDeptId}
                    onChange={(e) => setEqSearchDeptId(e.target.value)}
                    className={INPUT_CLS}
                  >
                    <option value="0">全部机构</option>
                    {data.departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                )}
              </FormField>
              <FormField label="仪器名称/编号">
                {(props) => (
                  <input
                    {...props}
                    type="search"
                    value={eqSearchKeyword}
                    onChange={(e) => setEqSearchKeyword(e.target.value)}
                    className={INPUT_CLS}
                  />
                )}
              </FormField>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={() => {
                    setEqSearchDeptId('0');
                    setEqSearchKeyword('');
                  }}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs"
                >
                  重置筛选条件
                </button>
              </div>
            </search>
          )}

          <DataTableShell caption="大型仪器设备目录与实时收费标准">
            <thead className="border-b border-slate-200 text-slate-700">
              <tr>
                <th scope="col" className="py-2.5 px-3 text-left w-14">代码</th>
                <th scope="col" className="py-2.5 px-3 text-left">仪器名称 / 编号</th>
                <th scope="col" className="py-2.5 px-3 text-center">控制与电流</th>
                <th scope="col" className="py-2.5 px-3 text-left">收费标准 (科内 / 跨科)</th>
                <th scope="col" className="py-2.5 px-3 text-center">当前使用者</th>
                <th scope="col" className="py-2.5 px-3 text-left">归口科室</th>
                <th scope="col" className="py-2.5 px-3 text-right no-print">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredDevices.map((dev) => {
                const isInternal = currentOperator?.home_dept_id === dev.owner_dept_id;
                const activeRes = data.reservations.find(
                  (r) => r.device_id === dev.id && ['RESERVED', 'ACTIVE'].includes(r.status)
                );
                return (
                  <tr key={dev.id} className="cv-row hover:bg-blue-50/40 transition-colors">
                    <td className="py-2.5 px-3">
                      <span className="inline-flex w-10 h-8 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 items-center justify-center font-mono font-bold text-[10px]">
                        {dev.code.split('-')[0]}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      <button
                        type="button"
                        onClick={() => onOpenDeviceDetail(dev.id)}
                        className="font-bold text-blue-700 hover:underline text-left block"
                      >
                        {dev.name}
                      </button>
                      <div className="text-[11px] text-slate-500 font-mono">{dev.code}</div>
                      <div className="mt-1 flex gap-1.5 no-print">
                        <button
                          type="button"
                          onClick={() => onOpenDeviceDetail(dev.id, 'reserv')}
                          className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-medium"
                        >
                          预约
                        </button>
                        <button
                          type="button"
                          onClick={() => onGoAddSampleForDevice(dev)}
                          className="px-2 py-0.5 rounded bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-medium"
                        >
                          送样
                        </button>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <StatusBadge status={dev.status} suffix={`${dev.current_amps}A`} />
                    </td>
                    <td className="py-2.5 px-3 font-mono tabular-nums">
                      <div>
                        科内 ¥{dev.internal_hourly_rate}/h · 跨科 ¥{dev.external_hourly_rate}/h
                      </div>
                      <div className="text-[11px] text-blue-700 font-sans mt-0.5">
                        当前适用：
                        {isInternal
                          ? `科内价 ¥${dev.internal_hourly_rate}/h`
                          : `跨科价 ¥${dev.external_hourly_rate}/h`}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      {activeRes ? activeRes.operator_name : '--'}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">{dev.owner_dept_name}</td>
                    <td className="py-2.5 px-3 text-right whitespace-nowrap space-x-2 no-print">
                      <button
                        type="button"
                        onClick={() => onOpenDeviceDetail(dev.id)}
                        className="text-blue-700 hover:underline font-medium"
                      >
                        查看
                      </button>
                      {canEditDevice(currentOperator, dev) && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingDeviceId(dev.id);
                            setDeviceForm({
                              code: dev.code,
                              name: dev.name,
                              owner_dept_id: dev.owner_dept_id,
                              pos_x: dev.pos_x,
                              pos_y: dev.pos_y,
                              status: dev.status,
                              standby_current_threshold: dev.standby_current_threshold,
                              internal_hourly_rate: dev.internal_hourly_rate,
                              external_hourly_rate: dev.external_hourly_rate,
                            });
                            setEqPrimaryTab('upsert_device');
                          }}
                          className="text-blue-700 hover:underline font-medium"
                        >
                          修改
                        </button>
                      )}
                      {canDeleteDevice(currentOperator, dev) && (
                        <button
                          type="button"
                          onClick={() => onRequestDeleteDevice(dev)}
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
        </div>
      )}

      {eqPrimaryTab === 'detail' && selectedDevice && (
        <div className="space-y-4">
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-wrap items-start gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white flex items-center justify-center font-mono font-bold text-sm shrink-0 shadow">
              {selectedDevice.code}
            </div>
            <div className="flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">{selectedDevice.name}</h2>
                <StatusBadge status={selectedDevice.status} suffix={`${selectedDevice.current_amps}A`} />
              </div>
              <div className="text-xs text-slate-600">
                归属组织：所内用户 » 集约化中心 »{' '}
                <span className="text-blue-700 font-medium">{selectedDevice.owner_dept_name}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-w-lg pt-1">
                {[
                  { num: 12, unit: '人', label: '关注者' },
                  { num: data.users.length, unit: '人', label: '授权使用者' },
                  {
                    num: data.reservations.filter((r) => r.device_id === selectedDevice.id).length,
                    unit: '次',
                    label: '总预约次数',
                  },
                  {
                    num: data.reservations
                      .filter((r) => r.device_id === selectedDevice.id)
                      .reduce((acc, r) => acc + Number(r.reserved_hours), 0)
                      .toFixed(1),
                    unit: '小时',
                    label: '累计机时',
                  },
                ].map((st) => (
                  <div
                    key={st.label}
                    className="border border-slate-200 bg-white rounded-lg px-2.5 py-1.5 text-center"
                  >
                    <div className="text-sm font-bold text-blue-700 tabular-nums">
                      {st.num}{' '}
                      <span className="text-[10px] font-normal text-slate-500">{st.unit}</span>
                    </div>
                    <div className="text-[10px] text-slate-600">{st.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <TabBar
            label="仪器详情子页签"
            tabs={[
              { id: 'dashboard', label: '常规信息' },
              { id: 'reserv', label: '使用预约' },
              { id: 'records', label: '使用记录与结算' },
            ]}
            activeId={eqDetailTab}
            onChange={setEqDetailTab}
          />

          {eqDetailTab === 'dashboard' && (
            <DataTableShell caption="仪器技术与收费参数" maxHeightClass="max-h-none">
              <tbody className="divide-y divide-slate-200">
                <tr>
                  <th scope="row" className="py-2.5 px-3 bg-slate-50 font-semibold w-40 text-left">
                    仪器编号
                  </th>
                  <td className="py-2.5 px-3 font-mono">{selectedDevice.code}</td>
                  <th scope="row" className="py-2.5 px-3 bg-slate-50 font-semibold w-40 text-left">
                    当前运行状态
                  </th>
                  <td className="py-2.5 px-3">
                    <StatusBadge status={selectedDevice.status} />
                  </td>
                </tr>
                <tr>
                  <th scope="row" className="py-2.5 px-3 bg-slate-50 font-semibold text-left">
                    待机电流阈值
                  </th>
                  <td className="py-2.5 px-3 font-mono tabular-nums">
                    {selectedDevice.standby_current_threshold} A
                  </td>
                  <th scope="row" className="py-2.5 px-3 bg-slate-50 font-semibold text-left">
                    当前实时电流
                  </th>
                  <td className="py-2.5 px-3 font-mono text-blue-700 font-bold tabular-nums">
                    {selectedDevice.current_amps} A
                  </td>
                </tr>
                <tr>
                  <th scope="row" className="py-2.5 px-3 bg-slate-50 font-semibold text-left">
                    科内机时单价
                  </th>
                  <td className="py-2.5 px-3 font-mono tabular-nums">
                    ¥{selectedDevice.internal_hourly_rate} / 小时
                  </td>
                  <th scope="row" className="py-2.5 px-3 bg-slate-50 font-semibold text-left">
                    跨科协同单价
                  </th>
                  <td className="py-2.5 px-3 font-mono tabular-nums">
                    ¥{selectedDevice.external_hourly_rate} / 小时
                  </td>
                </tr>
              </tbody>
            </DataTableShell>
          )}

          {eqDetailTab === 'reserv' && (
            <form
              onSubmit={onCreateReservation}
              className="max-w-lg p-5 bg-slate-50 border border-slate-200 rounded-xl space-y-3.5"
            >
              <h3 className="font-bold text-sm text-slate-900">
                预约仪器：{selectedDevice.name} ({selectedDevice.code})
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="几小时后开始">
                  {(props) => (
                    <input
                      {...props}
                      type="number"
                      step="0.5"
                      value={resForm.hours_from_now}
                      onChange={(e) => setResForm({ ...resForm, hours_from_now: e.target.value })}
                      className={`${INPUT_CLS} font-mono`}
                    />
                  )}
                </FormField>
                <FormField label="预约时长 (小时)">
                  {(props) => (
                    <input
                      {...props}
                      type="number"
                      step="0.5"
                      min="0.5"
                      value={resForm.duration_hours}
                      onChange={(e) => setResForm({ ...resForm, duration_hours: e.target.value })}
                      className={`${INPUT_CLS} font-mono`}
                    />
                  )}
                </FormField>
              </div>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm"
              >
                提交预约并冻结预算
              </button>
            </form>
          )}

          {eqDetailTab === 'records' && (
            <DataTableShell caption="该仪器的历史使用记录与结算单">
              <thead className="border-b border-slate-200 text-slate-700">
                <tr>
                  <th scope="col" className="py-2.5 px-3 text-left">单号</th>
                  <th scope="col" className="py-2.5 px-3 text-left">使用人</th>
                  <th scope="col" className="py-2.5 px-3 text-left">项目</th>
                  <th scope="col" className="py-2.5 px-3 text-left">预约 / 有效机时</th>
                  <th scope="col" className="py-2.5 px-3 text-left">冻结 / 实结金额</th>
                  <th scope="col" className="py-2.5 px-3 text-left">状态</th>
                  <th scope="col" className="py-2.5 px-3 text-right no-print">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.reservations
                  .filter((r) => r.device_id === selectedDevice.id)
                  .map((r) => (
                    <tr key={r.id} className="cv-row hover:bg-blue-50/40">
                      <td className="py-2 px-3 font-mono">#{r.id}</td>
                      <td className="py-2 px-3">{r.operator_name}</td>
                      <td className="py-2 px-3 font-mono">{r.project_code}</td>
                      <td className="py-2 px-3 font-mono tabular-nums">
                        {r.reserved_hours}h / {r.actual_active_hours}h
                      </td>
                      <td className="py-2 px-3 font-mono tabular-nums">
                        ¥{r.hold_amount} / ¥{r.settled_amount}
                      </td>
                      <td className="py-2 px-3">
                        <StatusBadge status={r.status} />
                      </td>
                      <td className="py-2 px-3 text-right space-x-2 no-print">
                        {r.status === 'RESERVED' && (
                          <button
                            type="button"
                            onClick={() => onCheckin(r.id)}
                            className="text-emerald-700 hover:underline font-medium"
                          >
                            签到
                          </button>
                        )}
                        {r.status !== 'COMPLETED' && r.status !== 'CANCELLED' && (
                          <button
                            type="button"
                            onClick={() => onCheckout(r.id, r.actual_active_hours)}
                            className="text-blue-700 hover:underline font-medium"
                          >
                            下机结算
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </DataTableShell>
          )}
        </div>
      )}

      {(eqPrimaryTab === 'records' || eqPrimaryTab === 'reserv') && (
        <div className="space-y-4">
          {eqPrimaryTab === 'reserv' && (
            <form
              onSubmit={onCreateReservation}
              className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-wrap items-end gap-3 no-print"
            >
              <FormField label="预约仪器" className="min-w-[220px]">
                {(props) => (
                  <select
                    {...props}
                    value={resForm.device_id}
                    onChange={(e) => setResForm({ ...resForm, device_id: e.target.value })}
                    className={INPUT_CLS}
                  >
                    {data.devices.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.code} - {d.name}
                      </option>
                    ))}
                  </select>
                )}
              </FormField>
              <FormField label="几小时后开始" className="w-32">
                {(props) => (
                  <input
                    {...props}
                    type="number"
                    step="0.5"
                    value={resForm.hours_from_now}
                    onChange={(e) => setResForm({ ...resForm, hours_from_now: e.target.value })}
                    className={`${INPUT_CLS} font-mono`}
                  />
                )}
              </FormField>
              <FormField label="预约时长(h)" className="w-32">
                {(props) => (
                  <input
                    {...props}
                    type="number"
                    step="0.5"
                    min="0.5"
                    value={resForm.duration_hours}
                    onChange={(e) => setResForm({ ...resForm, duration_hours: e.target.value })}
                    className={`${INPUT_CLS} font-mono`}
                  />
                )}
              </FormField>
              <button
                type="submit"
                className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm"
              >
                提交预约
              </button>
            </form>
          )}

          <DataTableShell caption="所有仪器预约与使用结算记录">
            <thead className="border-b border-slate-200 text-slate-700">
              <tr>
                <th scope="col" className="py-2.5 px-3 text-left">记录号</th>
                <th scope="col" className="py-2.5 px-3 text-left">仪器编号</th>
                <th scope="col" className="py-2.5 px-3 text-left">操作人</th>
                <th scope="col" className="py-2.5 px-3 text-left">结算项目</th>
                <th scope="col" className="py-2.5 px-3 text-left">预约时长</th>
                <th scope="col" className="py-2.5 px-3 text-left">实际有效时长</th>
                <th scope="col" className="py-2.5 px-3 text-left">单价 / 费率</th>
                <th scope="col" className="py-2.5 px-3 text-left">冻结 / 实扣</th>
                <th scope="col" className="py-2.5 px-3 text-left">状态</th>
                <th scope="col" className="py-2.5 px-3 text-right no-print">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.reservations.map((r) => (
                <tr key={r.id} className="cv-row hover:bg-blue-50/40">
                  <td className="py-2.5 px-3 font-mono">#{r.id}</td>
                  <td className="py-2.5 px-3 font-mono font-bold text-blue-700">{r.device_code}</td>
                  <td className="py-2.5 px-3">{r.operator_name}</td>
                  <td className="py-2.5 px-3 font-mono">{r.project_code}</td>
                  <td className="py-2.5 px-3 font-mono tabular-nums">{r.reserved_hours}h</td>
                  <td className="py-2.5 px-3 font-mono tabular-nums">
                    {r.status === 'COMPLETED' ? (
                      `${r.actual_active_hours}h`
                    ) : (
                      <input
                        type="number"
                        aria-label={`预约 #${r.id} 实际有效时长`}
                        step="0.25"
                        value={checkoutHoursMap[r.id] ?? r.actual_active_hours}
                        onChange={(e) =>
                          setCheckoutHoursMap({
                            ...checkoutHoursMap,
                            [r.id]: e.target.value,
                          })
                        }
                        className="w-20 border border-slate-300 rounded px-2 py-0.5 font-mono text-xs"
                      />
                    )}
                  </td>
                  <td className="py-2.5 px-3 font-mono tabular-nums">
                    ¥{r.applied_rate}/h ({r.rate_type})
                  </td>
                  <td className="py-2.5 px-3 font-mono tabular-nums">
                    ¥{r.hold_amount} /{' '}
                    <strong className="text-emerald-700">¥{r.settled_amount}</strong>
                  </td>
                  <td className="py-2.5 px-3">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="py-2.5 px-3 text-right whitespace-nowrap space-x-1.5 no-print">
                    {r.status === 'RESERVED' && (
                      <button
                        type="button"
                        onClick={() => onCheckin(r.id)}
                        className="px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-medium"
                      >
                        签到
                      </button>
                    )}
                    {r.status !== 'COMPLETED' && r.status !== 'CANCELLED' && (
                      <button
                        type="button"
                        onClick={() => onCheckout(r.id, r.actual_active_hours)}
                        className="px-2.5 py-1 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-medium"
                      >
                        下机结算
                      </button>
                    )}
                    {canCancelOrDeleteReservation(
                      currentOperator,
                      r,
                      data.projects,
                      data.devices
                    ) && (
                      <button
                        type="button"
                        onClick={() => onRequestCancelOrDeleteReservation(r)}
                        className="px-2.5 py-1 rounded-md border border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-700 text-[11px] font-medium"
                      >
                        {r.status === 'RESERVED' ? '取消预约' : '删除'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTableShell>
        </div>
      )}

      {eqPrimaryTab === 'map' && (
        <section aria-label="实验室 2D 设备平面图监控" className="space-y-2">
          <div className="text-xs text-slate-600 flex items-center justify-between">
            <span>点击平面图中的仪器卡片可查看详情、实时电流与预约</span>
            <span className="font-mono text-[11px] text-slate-500">
              在线设备 {data.devices.length} 台
            </span>
          </div>
          <div className="relative h-[26rem] w-full rounded-xl border border-slate-300 bg-[#f8fafc] bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:20px_20px] overflow-hidden shadow-inner">
            {data.devices.map((dev) => (
              <button
                key={dev.id}
                type="button"
                style={{ left: `${dev.pos_x}%`, top: `${dev.pos_y}%` }}
                onClick={() => onOpenDeviceDetail(dev.id)}
                className="text-left absolute -translate-x-1/2 -translate-y-1/2 w-56 p-3 rounded-xl bg-white border border-slate-300 shadow-md hover:border-blue-600 hover:shadow-lg transition"
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="font-mono font-bold text-blue-700 text-xs">{dev.code}</span>
                  <StatusBadge status={dev.status} showCode={false} />
                </div>
                <div className="font-semibold text-slate-900 single-line-cell mt-1 text-xs">
                  {dev.name}
                </div>
                <div className="text-[11px] text-slate-500 single-line-cell">
                  {dev.owner_dept_name}
                </div>
                <div className="mt-1.5 pt-1.5 border-t border-slate-100 flex justify-between font-mono text-[11px] tabular-nums">
                  <span className="text-blue-700 font-semibold">电流: {dev.current_amps}A</span>
                  <span className="text-slate-600">¥{dev.internal_hourly_rate}/h</span>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
