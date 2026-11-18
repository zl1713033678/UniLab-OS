import React from 'react';
import { Plus, Download, Printer, ChevronRight } from 'lucide-react';
import TabBar from '../components/ui/TabBar';
import DataTableShell from '../components/ui/DataTableShell';
import { FormField, INPUT_CLS } from '../components/ui/FormField';
import { exportTableToCSV } from '../api/client';
import { canEditUser, canDeleteUser } from '../permissions';

export default function PeopleView({
  data,
  currentOperator,
  peoplePrimaryTab,
  setPeoplePrimaryTab,
  peopleSecondaryTab,
  setPeopleSecondaryTab,
  peopleOrgFilterDeptId,
  setPeopleOrgFilterDeptId,
  peopleSearchName,
  setPeopleSearchName,
  editingUserId,
  setEditingUserId,
  userEditForm,
  setUserEditForm,
  registerForm,
  setRegisterForm,
  onSaveUserEdit,
  onRegisterSubmit,
  onOpenUserProfile,
  onRequestDeleteUser,
}) {
  const filteredUsers = data.users.filter((u) => {
    if (peopleOrgFilterDeptId !== 0 && u.home_dept_id !== Number(peopleOrgFilterDeptId)) {
      return false;
    }
    if (peopleSecondaryTab === 'ACTIVE' && u.status !== 'ACTIVE') return false;
    if (peopleSecondaryTab === 'HEAD_PI' && !['ADMIN', 'DEPT_HEAD', 'PI'].includes(u.system_role)) {
      return false;
    }
    if (peopleSecondaryTab === 'STAFF' && u.system_role !== 'STAFF') return false;
    if (peopleSecondaryTab === 'OBSERVER' && u.system_role !== 'OBSERVER') return false;
    if (
      peopleSearchName.trim() &&
      !u.full_name.toLowerCase().includes(peopleSearchName.toLowerCase()) &&
      !u.username.toLowerCase().includes(peopleSearchName.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  const tabs = [
    { id: 'list', label: '成员列表', count: data.users.length },
    { id: 'add', label: '添加新成员' },
    ...(peoplePrimaryTab === 'edit' && editingUserId
      ? [{ id: 'edit', label: `修改成员信息 (#${editingUserId})` }]
      : []),
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-base font-bold text-slate-900">成员目录与多级组织人员管理</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          按行政科室与角色分级筛选，支持实体 RFID 卡号维护、角色调整与 CSV 名单导出
        </p>
      </div>

      <TabBar
        label="成员目录导航"
        tabs={tabs}
        activeId={peoplePrimaryTab}
        onChange={(id) => {
          if (id !== 'edit') setEditingUserId(null);
          setPeoplePrimaryTab(id);
        }}
      />

      {peoplePrimaryTab === 'edit' && editingUserId && (
        <form
          onSubmit={onSaveUserEdit}
          className="max-w-xl p-5 bg-slate-50 border border-slate-200 rounded-xl space-y-4 shadow-sm"
        >
          <h2 className="font-bold text-sm text-slate-900 border-b border-slate-200 pb-2">
            修改成员资料与角色权限
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <FormField label="真实姓名" required errorText="请填写真实姓名。">
              {(props) => (
                <input
                  {...props}
                  type="text"
                  value={userEditForm.full_name}
                  onChange={(e) => setUserEditForm({ ...userEditForm, full_name: e.target.value })}
                  className={INPUT_CLS}
                  required
                />
              )}
            </FormField>
            <FormField label="电子邮箱" errorText="请输入有效邮箱。">
              {(props) => (
                <input
                  {...props}
                  type="email"
                  spellCheck={false}
                  value={userEditForm.email}
                  onChange={(e) => setUserEditForm({ ...userEditForm, email: e.target.value })}
                  className={INPUT_CLS}
                />
              )}
            </FormField>
            <FormField label="实体 RFID 卡号" required errorText="请填写 RFID 卡号。">
              {(props) => (
                <input
                  {...props}
                  type="text"
                  spellCheck={false}
                  value={userEditForm.rfid_card_id}
                  onChange={(e) =>
                    setUserEditForm({ ...userEditForm, rfid_card_id: e.target.value })
                  }
                  className={`${INPUT_CLS} font-mono`}
                  required
                />
              )}
            </FormField>
            <FormField label="三级课题组">
              {(props) => (
                <input
                  {...props}
                  type="text"
                  value={userEditForm.sub_group_name}
                  onChange={(e) =>
                    setUserEditForm({ ...userEditForm, sub_group_name: e.target.value })
                  }
                  className={INPUT_CLS}
                />
              )}
            </FormField>
            <FormField label="所属行政科室">
              {(props) => (
                <select
                  {...props}
                  value={userEditForm.home_dept_id}
                  onChange={(e) =>
                    setUserEditForm({ ...userEditForm, home_dept_id: e.target.value })
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
            <FormField label="系统角色">
              {(props) => (
                <select
                  {...props}
                  value={userEditForm.system_role}
                  onChange={(e) =>
                    setUserEditForm({ ...userEditForm, system_role: e.target.value })
                  }
                  disabled={!['ADMIN', 'DEPT_HEAD'].includes(currentOperator?.system_role)}
                  className={`${INPUT_CLS} font-mono`}
                >
                  <option value="STAFF">STAFF (科研人员)</option>
                  <option value="PI">PI (课题组负责人)</option>
                  <option value="DEPT_HEAD">DEPT_HEAD (科室主任)</option>
                  <option value="OBSERVER">OBSERVER (观察员)</option>
                  {currentOperator?.system_role === 'ADMIN' && (
                    <option value="ADMIN">ADMIN (超级管理员)</option>
                  )}
                </select>
              )}
            </FormField>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm"
            >
              保存成员修改
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingUserId(null);
                setPeoplePrimaryTab('list');
              }}
              className="px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs"
            >
              取消
            </button>
          </div>
        </form>
      )}

      {peoplePrimaryTab === 'list' && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5 no-print" role="group" aria-label="按成员角色筛选">
            {[
              { id: 'all', label: '所有成员' },
              { id: 'ACTIVE', label: '已激活成员' },
              { id: 'HEAD_PI', label: '科主任 / 教师(PI)' },
              { id: 'STAFF', label: '所内职工 / 实验员' },
              { id: 'OBSERVER', label: '观察员' },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={peopleSecondaryTab === t.id}
                onClick={() => setPeopleSecondaryTab(t.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  peopleSecondaryTab === t.id
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <nav
            aria-label="组织机构层级筛选"
            className="flex flex-wrap items-center gap-1.5 bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl text-xs no-print"
          >
            <span className="text-slate-500 font-medium">组织层级：</span>
            <button
              type="button"
              aria-current={peopleOrgFilterDeptId === 0 ? 'true' : undefined}
              onClick={() => setPeopleOrgFilterDeptId(0)}
              className={`px-2.5 py-1 rounded-md transition ${
                peopleOrgFilterDeptId === 0
                  ? 'bg-blue-600 text-white font-semibold'
                  : 'bg-white border border-slate-300 text-slate-700 hover:border-blue-400'
              }`}
            >
              全部 » 所内用户 » 集约化中心
            </button>
            {data.departments.map((d) => (
              <React.Fragment key={d.id}>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                <button
                  type="button"
                  aria-current={peopleOrgFilterDeptId === d.id ? 'true' : undefined}
                  onClick={() => setPeopleOrgFilterDeptId(d.id)}
                  className={`px-2.5 py-1 rounded-md transition ${
                    peopleOrgFilterDeptId === d.id
                      ? 'bg-blue-600 text-white font-semibold'
                      : 'bg-white border border-slate-300 text-slate-700 hover:border-blue-400'
                  }`}
                >
                  {d.name}
                </button>
              </React.Fragment>
            ))}
          </nav>

          <div className="bg-slate-50 border border-slate-200 p-2.5 rounded-xl flex flex-wrap items-center justify-between gap-2 no-print">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setPeoplePrimaryTab('add')}
                className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium inline-flex items-center gap-1 shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" /> 添加新成员
              </button>
              <button
                type="button"
                onClick={() =>
                  exportTableToCSV(
                    'people_list.csv',
                    ['姓名', '账号', 'RFID卡号', '行政科室', '课题组', '角色', '邮箱'],
                    filteredUsers.map((u) => [
                      u.full_name,
                      u.username,
                      u.rfid_card_id,
                      u.home_dept_name,
                      u.sub_group_name,
                      u.system_role,
                      u.email,
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

            <search className="flex items-center gap-2 text-xs">
              <span className="text-slate-600">
                共 <strong className="text-blue-700 tabular-nums">{filteredUsers.length}</strong> 位成员
              </span>
              <label htmlFor="people-search" className="visually-hidden">
                搜索成员姓名或账号
              </label>
              <input
                id="people-search"
                type="search"
                enterKeyHint="search"
                placeholder="搜索姓名或账号..."
                value={peopleSearchName}
                onChange={(e) => setPeopleSearchName(e.target.value)}
                className="border border-slate-300 rounded-lg px-3 py-1.5 bg-white w-44 text-xs"
              />
            </search>
          </div>

          <DataTableShell caption="实验室成员目录">
            <thead className="border-b border-slate-200 text-slate-700">
              <tr>
                <th scope="col" className="py-2.5 px-3 text-left w-12">头像</th>
                <th scope="col" className="py-2.5 px-3 text-left">姓名 (账号)</th>
                <th scope="col" className="py-2.5 px-3 text-left">联系方式 / RFID卡</th>
                <th scope="col" className="py-2.5 px-3 text-left">多级组织机构</th>
                <th scope="col" className="py-2.5 px-3 text-left">用户角色</th>
                <th scope="col" className="py-2.5 px-3 text-center">状态</th>
                <th scope="col" className="py-2.5 px-3 text-right no-print">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredUsers.map((u) => (
                <tr key={u.id} className="cv-row hover:bg-blue-50/40">
                  <td className="py-2.5 px-3">
                    <button
                      type="button"
                      aria-label={`查看 ${u.full_name} 的个人档案`}
                      onClick={() => onOpenUserProfile(u.id)}
                      className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 text-white flex items-center justify-center font-bold shadow-sm hover:opacity-90"
                    >
                      {u.full_name.slice(0, 1)}
                    </button>
                  </td>
                  <td className="py-2.5 px-3">
                    <button
                      type="button"
                      onClick={() => onOpenUserProfile(u.id)}
                      className="font-bold text-blue-700 hover:underline text-left block"
                    >
                      {u.full_name}
                    </button>
                    <span className="text-[11px] text-slate-500 font-mono">{u.username}</span>
                  </td>
                  <td className="py-2.5 px-3">
                    <div>{u.email || '-'}</div>
                    <div className="text-[11px] font-mono text-slate-500">RFID: {u.rfid_card_id}</div>
                  </td>
                  <td className="py-2.5 px-3 text-slate-600">
                    所内用户 » {u.home_dept_name} »{' '}
                    <span className="text-slate-900 font-medium">
                      {u.sub_group_name || '综合实验中心'}
                    </span>
                  </td>
                  <td className="py-2.5 px-3">
                    <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-mono text-[11px]">
                      {u.system_role}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px]">
                      {u.status || 'ACTIVE'}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right whitespace-nowrap space-x-2 no-print">
                    <button
                      type="button"
                      onClick={() => onOpenUserProfile(u.id)}
                      className="text-blue-700 hover:underline font-medium"
                    >
                      档案
                    </button>
                    {canEditUser(currentOperator, u) && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingUserId(u.id);
                          setUserEditForm({
                            full_name: u.full_name,
                            email: u.email,
                            rfid_card_id: u.rfid_card_id,
                            home_dept_id: u.home_dept_id,
                            sub_group_name: u.sub_group_name || '核心实验组',
                            system_role: u.system_role,
                            status: u.status || 'ACTIVE',
                          });
                          setPeoplePrimaryTab('edit');
                        }}
                        className="text-blue-700 hover:underline font-medium"
                      >
                        修改
                      </button>
                    )}
                    {canDeleteUser(currentOperator, u) && (
                      <button
                        type="button"
                        onClick={() => onRequestDeleteUser(u)}
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

      {peoplePrimaryTab === 'add' && (
        <form
          onSubmit={onRegisterSubmit}
          className="max-w-xl p-5 bg-slate-50 border border-slate-200 rounded-xl space-y-4 shadow-sm"
        >
          <h2 className="font-bold text-sm text-slate-900 border-b border-slate-200 pb-2">
            添加新成员
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <FormField label="登录账号" required errorText="请填写登录账号。">
              {(props) => (
                <input
                  {...props}
                  type="text"
                  spellCheck={false}
                  autoCapitalize="none"
                  value={registerForm.username}
                  onChange={(e) => setRegisterForm({ ...registerForm, username: e.target.value })}
                  className={INPUT_CLS}
                  required
                />
              )}
            </FormField>
            <FormField label="真实姓名" required errorText="请填写成员姓名。">
              {(props) => (
                <input
                  {...props}
                  type="text"
                  value={registerForm.full_name}
                  onChange={(e) => setRegisterForm({ ...registerForm, full_name: e.target.value })}
                  className={INPUT_CLS}
                  required
                />
              )}
            </FormField>
            <FormField label="所属行政科室" required>
              {(props) => (
                <select
                  {...props}
                  value={registerForm.home_dept_id}
                  onChange={(e) =>
                    setRegisterForm({ ...registerForm, home_dept_id: e.target.value })
                  }
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
            <FormField label="三级课题组">
              {(props) => (
                <input
                  {...props}
                  type="text"
                  value={registerForm.sub_group_name}
                  onChange={(e) =>
                    setRegisterForm({ ...registerForm, sub_group_name: e.target.value })
                  }
                  className={INPUT_CLS}
                />
              )}
            </FormField>
            <FormField label="系统角色">
              {(props) => (
                <select
                  {...props}
                  value={registerForm.system_role}
                  onChange={(e) =>
                    setRegisterForm({ ...registerForm, system_role: e.target.value })
                  }
                  className={INPUT_CLS}
                >
                  <option value="STAFF">STAFF (科研人员)</option>
                  <option value="PI">PI (课题组负责人)</option>
                  <option value="DEPT_HEAD">DEPT_HEAD (科室主任)</option>
                  <option value="OBSERVER">OBSERVER (观察员)</option>
                  <option value="ADMIN">ADMIN (超级管理员)</option>
                </select>
              )}
            </FormField>
            <FormField label="初始关联项目">
              {(props) => (
                <select
                  {...props}
                  value={registerForm.join_project_id}
                  onChange={(e) =>
                    setRegisterForm({ ...registerForm, join_project_id: e.target.value })
                  }
                  className={INPUT_CLS}
                >
                  {data.projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code}
                    </option>
                  ))}
                </select>
              )}
            </FormField>
          </div>
          <button
            type="submit"
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm"
          >
            保存新成员
          </button>
        </form>
      )}
    </div>
  );
}
