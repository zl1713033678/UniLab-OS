import React from 'react';
import TabBar from '../components/ui/TabBar';
import { FormField, INPUT_CLS } from '../components/ui/FormField';

export default function RolesView({
  data,
  rolesPrimaryTab,
  setRolesPrimaryTab,
  rolesConfig,
  editingRoleId,
  setEditingRoleId,
  toggleRolePerm,
  roleUpdateForm,
  setRoleUpdateForm,
  onSaveRolesNotice,
  onUpdateUserRole,
}) {
  const currentEditingRole =
    rolesConfig.find((r) => r.id === editingRoleId) || rolesConfig[0];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-base font-bold text-slate-900">多层级 RBAC 权限与角色管理</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          配置平台 5 级角色权责边界，并支持调整成员系统角色与所属三级课题组
        </p>
      </div>

      <TabBar
        label="权限管理导航"
        tabs={[
          { id: 'list', label: '角色设置', count: rolesConfig.length },
          { id: 'perms', label: `${currentEditingRole.label}权限设置` },
          { id: 'user_role', label: '成员角色分配' },
        ]}
        activeId={rolesPrimaryTab}
        onChange={setRolesPrimaryTab}
      />

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
              <button
                type="button"
                onClick={() => {
                  setEditingRoleId(r.id);
                  setRolesPrimaryTab('perms');
                }}
                className="px-3.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-blue-600 hover:text-white hover:border-blue-600 text-slate-700 text-xs font-medium transition"
              >
                修改权限
              </button>
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
              成员管理
            </legend>
            <div className="p-3.5 space-y-3 text-xs">
              <div>
                <div className="font-semibold text-slate-600 border-b border-slate-100 pb-1 mb-2">
                  管理 (所有)
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    { key: 'people_edit_all', label: '添加/修改所有成员信息' },
                    { key: 'people_role_all', label: '修改所有成员的角色' },
                    { key: 'people_view_contact', label: '查看所有成员的联系方式' },
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
              </div>
              <div>
                <div className="font-semibold text-slate-600 border-b border-slate-100 pb-1 mb-2">
                  管理 (下属机构/本课题组)
                </div>
                <div className="flex items-center gap-2">
                  <input
                    id="perm-people_edit_sub"
                    type="checkbox"
                    checked={!!currentEditingRole.perms.people_edit_sub}
                    onChange={() => toggleRolePerm('people_edit_sub')}
                    className="accent-blue-600"
                  />
                  <label htmlFor="perm-people_edit_sub" className="cursor-pointer">
                    添加/修改下属机构成员及项目配额
                  </label>
                </div>
              </div>
            </div>
          </fieldset>

          <fieldset className="border border-slate-200 rounded-xl overflow-hidden bg-white">
            <legend className="px-3 py-2 w-full bg-slate-50 font-bold text-xs text-slate-800 border-b border-slate-200">
              仪器管理
            </legend>
            <div className="p-3.5 space-y-3 text-xs">
              <div>
                <div className="font-semibold text-slate-600 border-b border-slate-100 pb-1 mb-2">
                  管理 (所有)
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    { key: 'eq_edit_all', label: '添加/修改所有机构的仪器' },
                    { key: 'eq_status_all', label: '修改所有仪器的状态设置' },
                    { key: 'eq_records_all', label: '查看/核算所有仪器的使用记录' },
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
              </div>
              <div>
                <div className="font-semibold text-slate-600 border-b border-slate-100 pb-1 mb-2">
                  管理 (负责)
                </div>
                <div className="flex items-center gap-2">
                  <input
                    id="perm-eq_incharge_edit"
                    type="checkbox"
                    checked={!!currentEditingRole.perms.eq_incharge_edit}
                    onChange={() => toggleRolePerm('eq_incharge_edit')}
                    className="accent-blue-600"
                  />
                  <label htmlFor="perm-eq_incharge_edit" className="cursor-pointer">
                    管理负责仪器的预约、签到与使用记录
                  </label>
                </div>
              </div>
            </div>
          </fieldset>

          <fieldset className="border border-slate-200 rounded-xl overflow-hidden bg-white">
            <legend className="px-3 py-2 w-full bg-slate-50 font-bold text-xs text-slate-800 border-b border-slate-200">
              测样、实验记录与财务中心
            </legend>
            <div className="p-3.5 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              {[
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
              onClick={() => onSaveRolesNotice(currentEditingRole.label)}
              className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm"
            >
              保存权限设置
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
                  <option value="OBSERVER">目前成员/观察员 (OBSERVER)</option>
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
