import React, { useState } from 'react';
import { Eye, Lock, RotateCcw, Save, Settings2, ShieldAlert, ShieldCheck } from 'lucide-react';
import TabBar from '../components/ui/TabBar';
import { FormField, INPUT_CLS } from '../components/ui/FormField';
import {
  DATA_VISIBILITY_DEFS,
  DEFAULT_ROLE_VISIBILITY_POLICIES,
  FLOORPLAN_VISIBILITY_DEFS,
  MODULE_VISIBILITY_DEFS,
  ROLE_META,
} from '../constants/visibilityPolicies';

export default function RolesView({
  data,
  currentOperator,
  rolesPrimaryTab,
  setRolesPrimaryTab,
  rolesConfig,
  editingRoleId,
  setEditingRoleId,
  toggleRolePerm,
  visibilityPolicies,
  setVisibilityPolicies,
  hwGatewaySettings,
  setHwGatewaySettings,
  roleUpdateForm,
  setRoleUpdateForm,
  onSaveVisibilityPolicies,
  onResetVisibilityPolicies,
  onSaveHardwareSettings,
  onUpdateUserRole,
}) {
  const [visTargetRole, setVisTargetRole] = useState('DEPT_HEAD');

  if (currentOperator?.system_role !== 'ADMIN') {
    return (
      <div className="max-w-xl p-6 rounded-2xl border border-rose-200 bg-rose-50 text-rose-900 space-y-2">
        <div className="flex items-center gap-2 font-bold text-sm">
          <ShieldAlert className="w-5 h-5 text-rose-600" aria-hidden="true" />
          无权访问系统设置与权限配置中心
        </div>
        <p className="text-xs text-rose-800">
          仅【平台负责人 / 超级管理员 (ADMIN)】可为不同系统权限级别配置可视界面层级及物联网网关全局参数。
        </p>
      </div>
    );
  }

  const currentEditingRole =
    rolesConfig.find((r) => r.id === editingRoleId) || rolesConfig[0];

  const targetVisPolicy =
    visibilityPolicies?.[visTargetRole] || DEFAULT_ROLE_VISIBILITY_POLICIES[visTargetRole];

  const isLockedRole = visTargetRole === 'ADMIN';

  const toggleVisFlag = (group, key) => {
    if (isLockedRole && group === 'modules' && ['roles', 'profile', 'equipments'].includes(key)) {
      return;
    }
    setVisibilityPolicies((prev) => {
      const baseRole = prev?.[visTargetRole] || DEFAULT_ROLE_VISIBILITY_POLICIES[visTargetRole];
      return {
        ...prev,
        [visTargetRole]: {
          ...baseRole,
          [group]: {
            ...(baseRole?.[group] || {}),
            [key]: !baseRole?.[group]?.[key],
          },
        },
      };
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-base font-bold text-slate-900">系统设置与多级权限可视层级中心</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          超级管理员可分别为 5 级权限配置导航模块可见性、平面图交互层级、财务统计敏感区与硬件网关参数
        </p>
      </div>

      <TabBar
        label="系统设置与权限导航"
        tabs={[
          { id: 'visibility', label: '权限可视界面设置' },
          { id: 'hardware_gw', label: '硬件接入系统设置' },
          { id: 'list', label: '角色权重清单', count: rolesConfig.length },
          { id: 'perms', label: `${currentEditingRole.label}操作权限` },
          { id: 'user_role', label: '成员角色分配' },
        ]}
        activeId={rolesPrimaryTab}
        onChange={setRolesPrimaryTab}
      />

      {/* ==================== 1. 权限可视界面设置（超管核心模块） ==================== */}
      {rolesPrimaryTab === 'visibility' && (
        <div className="space-y-4">
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-slate-700 inline-flex items-center gap-1">
                <Eye className="w-3.5 h-3.5 text-blue-600" aria-hidden="true" />
                选择要配置可视内容的权限级别：
              </span>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="权限级别选择">
                {ROLE_META.map((rm) => {
                  const active = visTargetRole === rm.id;
                  return (
                    <button
                      key={rm.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setVisTargetRole(rm.id)}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition ${
                        active
                          ? 'bg-blue-600 border-blue-700 text-white shadow-sm'
                          : 'bg-white border-slate-300 text-slate-700 hover:bg-blue-50'
                      }`}
                    >
                      #{rm.weight} {rm.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onResetVisibilityPolicies}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-medium"
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                恢复推荐预设
              </button>
              <button
                type="button"
                onClick={() => onSaveVisibilityPolicies(visibilityPolicies, rolesConfig)}
                className="inline-flex items-center gap-1 px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm"
              >
                <Save className="w-3.5 h-3.5" aria-hidden="true" />
                保存并实时生效
              </button>
            </div>
          </div>

          {isLockedRole && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-center gap-2">
              <Lock className="w-4 h-4 text-amber-700 shrink-0" aria-hidden="true" />
              超级管理员 (ADMIN) 默认保留「系统设置与权限」「个人档案」「仪器目录」防锁死兜底入口，其余模块可按需调整。
            </div>
          )}

          {/* 组 A：一级菜单与工作区模块 */}
          <fieldset className="border border-slate-200 rounded-xl overflow-hidden bg-white">
            <legend className="px-3.5 py-2 w-full bg-slate-50 font-bold text-xs text-slate-800 border-b border-slate-200">
              1. 左侧功能菜单与快捷入口可见性（{ROLE_META.find((r) => r.id === visTargetRole)?.label}）
            </legend>
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
              {MODULE_VISIBILITY_DEFS.map((m) => {
                const locked = isLockedRole && m.alwaysForAdmin;
                const checked = !!targetVisPolicy?.modules?.[m.key];
                return (
                  <div
                    key={m.key}
                    className={`flex items-center gap-2 p-2.5 rounded-lg border ${
                      checked ? 'border-blue-200 bg-blue-50/40' : 'border-slate-200 bg-slate-50/50'
                    }`}
                  >
                    <input
                      id={`vis-mod-${visTargetRole}-${m.key}`}
                      type="checkbox"
                      checked={checked}
                      disabled={locked}
                      onChange={() => toggleVisFlag('modules', m.key)}
                      className="accent-blue-600"
                    />
                    <label
                      htmlFor={`vis-mod-${visTargetRole}-${m.key}`}
                      className="cursor-pointer font-medium text-slate-800 flex-1"
                    >
                      {m.label}
                      {locked && <span className="ml-1 text-[10px] text-amber-700">(防锁死锁定)</span>}
                    </label>
                  </div>
                );
              })}
            </div>
          </fieldset>

          {/* 组 B：实验室平面图监控交互层级 */}
          <fieldset className="border border-slate-200 rounded-xl overflow-hidden bg-white">
            <legend className="px-3.5 py-2 w-full bg-slate-50 font-bold text-xs text-slate-800 border-b border-slate-200">
              2. 实验室 1F/2F/3F 数字孪生平面图交互层级
            </legend>
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              {FLOORPLAN_VISIBILITY_DEFS.map((f) => {
                const checked = !!targetVisPolicy?.floorplan?.[f.key];
                return (
                  <div
                    key={f.key}
                    className={`flex items-start gap-2 p-2.5 rounded-lg border ${
                      checked ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200 bg-slate-50/50'
                    }`}
                  >
                    <input
                      id={`vis-fp-${visTargetRole}-${f.key}`}
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleVisFlag('floorplan', f.key)}
                      className="accent-emerald-600 mt-0.5"
                    />
                    <label
                      htmlFor={`vis-fp-${visTargetRole}-${f.key}`}
                      className="cursor-pointer font-medium text-slate-800"
                    >
                      {f.label}
                    </label>
                  </div>
                );
              })}
            </div>
          </fieldset>

          {/* 组 C：后台数据与财务敏感区 */}
          <fieldset className="border border-slate-200 rounded-xl overflow-hidden bg-white">
            <legend className="px-3.5 py-2 w-full bg-slate-50 font-bold text-xs text-slate-800 border-b border-slate-200">
              3. 财务敏感区、组织机构入口与报表导出可见性
            </legend>
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              {DATA_VISIBILITY_DEFS.map((d) => {
                const checked = !!targetVisPolicy?.data?.[d.key];
                return (
                  <div
                    key={d.key}
                    className={`flex items-start gap-2 p-2.5 rounded-lg border ${
                      checked ? 'border-indigo-200 bg-indigo-50/40' : 'border-slate-200 bg-slate-50/50'
                    }`}
                  >
                    <input
                      id={`vis-data-${visTargetRole}-${d.key}`}
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleVisFlag('data', d.key)}
                      className="accent-indigo-600 mt-0.5"
                    />
                    <label
                      htmlFor={`vis-data-${visTargetRole}-${d.key}`}
                      className="cursor-pointer font-medium text-slate-800"
                    >
                      {d.label}
                    </label>
                  </div>
                );
              })}
            </div>
          </fieldset>
        </div>
      )}

      {/* ==================== 2. 硬件接入与物联网系统设置 ==================== */}
      {rolesPrimaryTab === 'hardware_gw' && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSaveHardwareSettings(hwGatewaySettings);
          }}
          className="max-w-2xl p-5 bg-slate-50 border border-slate-200 rounded-xl space-y-4 shadow-sm"
        >
          <div className="flex items-center gap-2 border-b border-slate-200 pb-2.5">
            <Settings2 className="w-4 h-4 text-blue-600" aria-hidden="true" />
            <h2 className="font-bold text-sm text-slate-900">ESP32 硬件网关、施密特迟滞与 mDNS 参数设置</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <FormField label="硬件离线判定超时 (秒)">
              {(props) => (
                <input
                  {...props}
                  type="number"
                  min="5"
                  max="300"
                  value={hwGatewaySettings?.offline_timeout_seconds ?? 10}
                  onChange={(e) =>
                    setHwGatewaySettings({
                      ...hwGatewaySettings,
                      offline_timeout_seconds: Number(e.target.value),
                    })
                  }
                  className={`${INPUT_CLS} font-mono`}
                />
              )}
            </FormField>
            <FormField label="mDNS 局域网主机名 (.local)">
              {(props) => (
                <input
                  {...props}
                  type="text"
                  value={hwGatewaySettings?.mdns_host ?? 'smartlab'}
                  onChange={(e) =>
                    setHwGatewaySettings({
                      ...hwGatewaySettings,
                      mdns_host: e.target.value,
                    })
                  }
                  className={`${INPUT_CLS} font-mono`}
                />
              )}
            </FormField>
            <FormField label="施密特高电平开机阈值 (A)">
              {(props) => (
                <input
                  {...props}
                  type="number"
                  step="0.05"
                  value={hwGatewaySettings?.schmitt_high_amps ?? '0.5000'}
                  onChange={(e) =>
                    setHwGatewaySettings({
                      ...hwGatewaySettings,
                      schmitt_high_amps: e.target.value,
                    })
                  }
                  className={`${INPUT_CLS} font-mono`}
                />
              )}
            </FormField>
            <FormField label="施密特低电平关机阈值 (A)">
              {(props) => (
                <input
                  {...props}
                  type="number"
                  step="0.01"
                  value={hwGatewaySettings?.schmitt_low_amps ?? '0.0500'}
                  onChange={(e) =>
                    setHwGatewaySettings({
                      ...hwGatewaySettings,
                      schmitt_low_amps: e.target.value,
                    })
                  }
                  className={`${INPUT_CLS} font-mono`}
                />
              )}
            </FormField>
          </div>

          <div className="space-y-2 pt-1 text-xs">
            <div className="flex items-center gap-2">
              <input
                id="hw-open-ingest"
                type="checkbox"
                checked={!!hwGatewaySettings?.allow_open_esp32_ingest}
                onChange={(e) =>
                  setHwGatewaySettings({
                    ...hwGatewaySettings,
                    allow_open_esp32_ingest: e.target.checked,
                  })
                }
                className="accent-blue-600"
              />
              <label htmlFor="hw-open-ingest" className="cursor-pointer text-slate-800 font-medium">
                允许旧版未携带 <code className="font-mono">X-Lab-Hardware-Token</code> 的 ESP32 开发板访问兼容接口{' '}
                <code className="font-mono text-blue-700">/api/v1/telemetry/ingest</code>（生产建议关闭）
              </label>
            </div>
            <div className="flex items-center gap-2">
              <input
                id="hw-mdns-enabled"
                type="checkbox"
                checked={hwGatewaySettings?.mdns_enabled !== false}
                onChange={(e) =>
                  setHwGatewaySettings({
                    ...hwGatewaySettings,
                    mdns_enabled: e.target.checked,
                  })
                }
                className="accent-blue-600"
              />
              <label htmlFor="hw-mdns-enabled" className="cursor-pointer text-slate-800 font-medium">
                启用局域网 mDNS ZeroConf 服务发现广播（需服务端重启生效）
              </label>
            </div>
          </div>

          <button
            type="submit"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm"
          >
            <ShieldCheck className="w-4 h-4" aria-hidden="true" />
            保存硬件网关系统设置
          </button>
        </form>
      )}

      {rolesPrimaryTab === 'list' && (
        <div className="space-y-2.5 max-w-2xl">
          {rolesConfig.map((r) => (
            <div
              key={r.id}
              className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between hover:bg-blue-50/40 transition"
            >
              <div className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center font-mono text-xs text-slate-500">
                  #{r.weight}
                </span>
                <div>
                  <div className="font-bold text-slate-900 text-xs">{r.label}</div>
                  <div className="font-mono text-[11px] text-slate-500">{r.id}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setVisTargetRole(r.id);
                    setRolesPrimaryTab('visibility');
                  }}
                  className="px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-600 hover:text-white text-blue-700 text-xs font-medium transition"
                >
                  设置可视界面
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingRoleId(r.id);
                    setRolesPrimaryTab('perms');
                  }}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-800 hover:text-white text-slate-700 text-xs font-medium transition"
                >
                  操作权限
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {rolesPrimaryTab === 'perms' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 bg-slate-50 border border-slate-200 p-3 rounded-xl">
            <label htmlFor="editing-role-select" className="text-xs text-slate-600 font-medium">
              当前编辑角色：
            </label>
            <select
              id="editing-role-select"
              value={editingRoleId}
              onChange={(e) => setEditingRoleId(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-1.5 bg-white text-xs font-bold text-blue-700"
            >
              {rolesConfig.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label} ({r.id})
                </option>
              ))}
            </select>
          </div>

          <fieldset className="border border-slate-200 rounded-xl overflow-hidden bg-white">
            <legend className="px-3 py-2 w-full bg-slate-50 font-bold text-xs text-slate-800 border-b border-slate-200">
              全局与组织机构管理
            </legend>
            <div className="p-3.5 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              {[
                { key: 'global_all', label: '管理所有内容' },
                { key: 'global_org', label: '管理多级组织机构' },
                { key: 'role_group', label: '管理权限分组与角色权重' },
              ].map((item) => (
                <div key={item.key} className="flex items-center gap-2">
                  <input
                    id={`perm-${item.key}`}
                    type="checkbox"
                    checked={!!currentEditingRole.perms[item.key]}
                    onChange={() => toggleRolePerm(item.key)}
                    className="accent-blue-600"
                  />
                  <label htmlFor={`perm-${item.key}`} className="cursor-pointer">
                    {item.label}
                  </label>
                </div>
              ))}
            </div>
          </fieldset>

          <fieldset className="border border-slate-200 rounded-xl overflow-hidden bg-white">
            <legend className="px-3 py-2 w-full bg-slate-50 font-bold text-xs text-slate-800 border-b border-slate-200">
              成员与仪器测样财务权限
            </legend>
            <div className="p-3.5 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              {[
                { key: 'people_edit_all', label: '添加/修改所有成员信息' },
                { key: 'people_role_all', label: '修改所有成员的角色' },
                { key: 'people_view_contact', label: '查看所有成员的联系方式' },
                { key: 'people_edit_sub', label: '添加/修改下属机构成员及配额' },
                { key: 'eq_edit_all', label: '添加/修改所有机构的仪器' },
                { key: 'eq_status_all', label: '修改所有仪器的状态设置' },
                { key: 'eq_records_all', label: '查看/核算所有仪器的使用记录' },
                { key: 'eq_incharge_edit', label: '管理负责仪器的预约、签到与记录' },
                { key: 'lims_submit', label: '发起样品送检与耗材领用' },
                { key: 'lims_coa_issue', label: '审核签发测样报告(COA)' },
                { key: 'eln_confidential_bypass', label: '豁免查阅跨科保密项目数据' },
                { key: 'billing_manage', label: '管理财务部门与项目配额' },
                { key: 'billing_erp_sync', label: '执行财务充值与ERP调账' },
              ].map((item) => (
                <div key={item.key} className="flex items-center gap-2">
                  <input
                    id={`perm-${item.key}`}
                    type="checkbox"
                    checked={!!currentEditingRole.perms[item.key]}
                    onChange={() => toggleRolePerm(item.key)}
                    className="accent-blue-600"
                  />
                  <label htmlFor={`perm-${item.key}`} className="cursor-pointer">
                    {item.label}
                  </label>
                </div>
              ))}
            </div>
          </fieldset>

          <div>
            <button
              type="button"
              onClick={() => onSaveVisibilityPolicies(visibilityPolicies, rolesConfig)}
              className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm"
            >
              保存并持久化角色权限配置
            </button>
          </div>
        </div>
      )}

      {rolesPrimaryTab === 'user_role' && (
        <form
          onSubmit={onUpdateUserRole}
          className="max-w-lg p-5 bg-slate-50 border border-slate-200 rounded-xl space-y-4 shadow-sm"
        >
          <h2 className="font-bold text-sm text-slate-900 border-b border-slate-200 pb-2">
            成员角色与三级机构变更
          </h2>
          <FormField label="目标成员">
            {(props) => (
              <select
                {...props}
                value={roleUpdateForm.target_user_id}
                onChange={(e) =>
                  setRoleUpdateForm({ ...roleUpdateForm, target_user_id: e.target.value })
                }
                className={INPUT_CLS}
              >
                {data.users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name} ({u.username}) - 当前: {u.system_role}
                  </option>
                ))}
              </select>
            )}
          </FormField>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <FormField label="授予系统角色">
              {(props) => (
                <select
                  {...props}
                  value={roleUpdateForm.system_role}
                  onChange={(e) =>
                    setRoleUpdateForm({ ...roleUpdateForm, system_role: e.target.value })
                  }
                  className={INPUT_CLS}
                >
                  <option value="ADMIN">平台负责人/超级管理员 (ADMIN)</option>
                  <option value="DEPT_HEAD">科室主任 (DEPT_HEAD)</option>
                  <option value="PI">课题组负责人 (PI)</option>
                  <option value="STAFF">所内职工/科研人员 (STAFF)</option>
                  <option value="OBSERVER">只读观察员 (OBSERVER)</option>
                </select>
              )}
            </FormField>
            <FormField label="所属三级课题组">
              {(props) => (
                <input
                  {...props}
                  type="text"
                  value={roleUpdateForm.sub_group_name}
                  onChange={(e) =>
                    setRoleUpdateForm({ ...roleUpdateForm, sub_group_name: e.target.value })
                  }
                  className={INPUT_CLS}
                />
              )}
            </FormField>
          </div>
          <button
            type="submit"
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm"
          >
            更新成员角色
          </button>
        </form>
      )}
    </div>
  );
}
