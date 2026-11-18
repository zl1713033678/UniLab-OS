import React from 'react';
import { Plus } from 'lucide-react';
import TabBar from '../components/ui/TabBar';
import DataTableShell from '../components/ui/DataTableShell';
import StatusBadge from '../components/ui/StatusBadge';
import { FormField, INPUT_CLS } from '../components/ui/FormField';
import {
  canCreateOrg,
  canEditOrg,
  canDeleteOrg,
  canCreateProject,
  canEditProject,
  canDeleteProject,
} from '../permissions';

export default function LabsView({
  data,
  currentOperator,
  rolePolicy,
  currentProject,
  labsPrimaryTab,
  setLabsPrimaryTab,
  selectedLabProject,
  labDetailTab,
  setLabDetailTab,
  editingProjectId,
  setEditingProjectId,
  projectForm,
  setProjectForm,
  editingDeptId,
  setEditingDeptId,
  orgNodeForm,
  setOrgNodeForm,
  memberForm,
  setMemberForm,
  onSaveProject,
  onRequestDeleteProject,
  onSaveOrgNode,
  onRequestDeleteDepartment,
  onUpsertMember,
  onRequestRemoveProjectMember,
  onOpenLabDetail,
  onOpenUserProfile,
}) {
  const showOrgMgmt = rolePolicy?.data?.show_org_management !== false;
  const tabs = [
    { id: 'list', label: '课题组项目目录', count: data.projects.length },
    { id: 'my_lab', label: '我的课题组' },
    { id: 'add_member', label: '成员配额设置' },
    ...(showOrgMgmt
      ? [{ id: 'org_list', label: '组织机构管理', count: data.departments.length }]
      : []),
    ...(canCreateProject(currentOperator) || editingProjectId
      ? [{ id: 'upsert_project', label: editingProjectId ? '修改课题组项目' : '新建课题组项目' }]
      : []),
    ...(showOrgMgmt && (canCreateOrg(currentOperator) || editingDeptId)
      ? [{ id: 'add_org', label: editingDeptId ? '修改组织机构' : '添加组织机构' }]
      : []),
    ...(labsPrimaryTab === 'detail' && selectedLabProject
      ? [{ id: 'detail', label: selectedLabProject.name }]
      : []),
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-base font-bold text-slate-900">课题组、跨科项目与多级组织架构</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          管理行政科室资产归口、跨科室经费账号、个人消费配额上限与项目保密隔离属性
        </p>
      </div>

      <TabBar
        label="课题组与组织架构导航"
        tabs={tabs}
        activeId={labsPrimaryTab}
        onChange={(id) => {
          if (id !== 'upsert_project') setEditingProjectId(null);
          if (id !== 'add_org') setEditingDeptId(null);
          setLabsPrimaryTab(id);
        }}
      />

      {labsPrimaryTab === 'upsert_project' && (
        <form
          onSubmit={onSaveProject}
          className="max-w-xl p-5 bg-slate-50 border border-slate-200 rounded-xl space-y-4 shadow-sm"
        >
          <h2 className="font-bold text-sm text-slate-900 border-b border-slate-200 pb-2">
            {editingProjectId ? `修改课题组项目 (#${editingProjectId})` : '新建课题组项目 / 经费账户'}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <FormField label="项目编号" required errorText="请填写项目编号。">
              {(props) => (
                <input
                  {...props}
                  type="text"
                  spellCheck={false}
                  value={projectForm.code}
                  onChange={(e) => setProjectForm({ ...projectForm, code: e.target.value })}
                  className={`${INPUT_CLS} font-mono`}
                  required
                />
              )}
            </FormField>
            <FormField label="课题组项目名称" required errorText="请填写项目名称。">
              {(props) => (
                <input
                  {...props}
                  type="text"
                  value={projectForm.name}
                  onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })}
                  className={INPUT_CLS}
                  required
                />
              )}
            </FormField>
            <FormField label="依托行政科室">
              {(props) => (
                <select
                  {...props}
                  value={projectForm.lead_dept_id}
                  onChange={(e) => setProjectForm({ ...projectForm, lead_dept_id: e.target.value })}
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
            <FormField label="项目负责人 (PI)">
              {(props) => (
                <select
                  {...props}
                  value={projectForm.pi_user_id}
                  onChange={(e) => setProjectForm({ ...projectForm, pi_user_id: e.target.value })}
                  className={INPUT_CLS}
                >
                  {data.users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name} ({u.home_dept_name})
                    </option>
                  ))}
                </select>
              )}
            </FormField>
            {!editingProjectId && (
              <FormField label="初始预算拨款 (元)">
                {(props) => (
                  <input
                    {...props}
                    type="number"
                    step="1000"
                    value={projectForm.initial_budget}
                    onChange={(e) =>
                      setProjectForm({ ...projectForm, initial_budget: e.target.value })
                    }
                    className={`${INPUT_CLS} font-mono`}
                  />
                )}
              </FormField>
            )}
            <div className="flex items-center pt-5">
              <input
                id="prj-confidential"
                type="checkbox"
                checked={Boolean(projectForm.is_confidential)}
                onChange={(e) =>
                  setProjectForm({ ...projectForm, is_confidential: e.target.checked })
                }
                className="accent-blue-600 mr-2"
              />
              <label htmlFor="prj-confidential" className="text-xs font-medium text-slate-700 cursor-pointer">
                启用跨科严格保密数据隔离
              </label>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm"
            >
              保存项目
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingProjectId(null);
                setLabsPrimaryTab('list');
              }}
              className="px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs"
            >
              取消
            </button>
          </div>
        </form>
      )}

      {labsPrimaryTab === 'org_list' && (
        <div className="space-y-3">
          <div className="bg-slate-50 border border-slate-200 p-2.5 rounded-xl flex items-center justify-between no-print">
            {canCreateOrg(currentOperator) && (
              <button
                type="button"
                onClick={() => {
                  setEditingDeptId(null);
                  setOrgNodeForm({
                    code: 'LAB-WOOD-01',
                    name: '复合材料与微纳表征室',
                    parent_id: currentOperator?.home_dept_id || 1,
                    level_type: 'LAB_GROUP',
                    manager_name: currentOperator?.full_name || '',
                  });
                  setLabsPrimaryTab('add_org');
                }}
                className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium inline-flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" /> 添加组织机构
              </button>
            )}
            <span className="text-xs text-slate-600">
              共有 <strong className="text-blue-700">{data.departments.length}</strong> 个组织机构节点
            </span>
          </div>
          <DataTableShell caption="多级组织机构列表">
            <thead className="border-b border-slate-200 text-slate-700">
              <tr>
                <th scope="col" className="py-2.5 px-3 text-left">机构编码</th>
                <th scope="col" className="py-2.5 px-3 text-left">组织机构名称</th>
                <th scope="col" className="py-2.5 px-3 text-left">上级路径</th>
                <th scope="col" className="py-2.5 px-3 text-left">负责人</th>
                <th scope="col" className="py-2.5 px-3 text-right no-print">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.departments.map((d) => (
                <tr key={d.id} className="cv-row hover:bg-blue-50/40">
                  <td className="py-2.5 px-3 font-mono font-bold text-blue-700">{d.code}</td>
                  <td className="py-2.5 px-3 font-semibold">{d.name}</td>
                  <td className="py-2.5 px-3 text-slate-600">所内用户 » 集约化中心 » {d.name}</td>
                  <td className="py-2.5 px-3">{d.manager_name || '-'}</td>
                  <td className="py-2.5 px-3 text-right whitespace-nowrap space-x-2 no-print">
                    {canEditOrg(currentOperator, d) && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingDeptId(d.id);
                          setOrgNodeForm({
                            code: d.code,
                            name: d.name,
                            parent_id: d.parent_id || 1,
                            level_type: d.level_type || 'DEPT',
                            manager_name: d.manager_name || '',
                          });
                          setLabsPrimaryTab('add_org');
                        }}
                        className="text-blue-700 hover:underline font-medium"
                      >
                        修改
                      </button>
                    )}
                    {canDeleteOrg(currentOperator, d) && (
                      <button
                        type="button"
                        onClick={() => onRequestDeleteDepartment(d)}
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

      {labsPrimaryTab === 'list' && (
        <div className="space-y-3">
          <div className="bg-slate-50 border border-slate-200 p-2.5 rounded-xl flex flex-wrap items-center justify-between gap-2 no-print">
            <div className="flex flex-wrap gap-2">
              {canCreateProject(currentOperator) && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingProjectId(null);
                    setProjectForm({
                      code: `PRJ-2026-0${data.projects.length + 1}`,
                      name: '新型木质素基功能复合材料研发课题',
                      lead_dept_id: currentOperator?.home_dept_id || 1,
                      pi_user_id: currentOperator?.id || 2,
                      initial_budget: '30000.0000',
                      is_confidential: true,
                    });
                    setLabsPrimaryTab('upsert_project');
                  }}
                  className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium inline-flex items-center gap-1 shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" aria-hidden="true" /> 新建课题组项目
                </button>
              )}
              {canCreateOrg(currentOperator) && (
                <button
                  type="button"
                  onClick={() => setLabsPrimaryTab('add_org')}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs"
                >
                  + 添加组织机构
                </button>
              )}
              <button
                type="button"
                onClick={() => setLabsPrimaryTab('add_member')}
                className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs"
              >
                成员配额授权
              </button>
            </div>
            <span className="text-xs text-slate-600">
              <strong className="text-blue-700">{data.departments.length}</strong> 个科室 ·{' '}
              <strong className="text-blue-700">{data.projects.length}</strong> 个项目组 ·{' '}
              <strong className="text-blue-700">{data.users.length}</strong> 位成员
            </span>
          </div>

          <DataTableShell caption="课题组与跨科项目预算目录">
            <thead className="border-b border-slate-200 text-slate-700">
              <tr>
                <th scope="col" className="py-2.5 px-3 text-left">名称</th>
                <th scope="col" className="py-2.5 px-3 text-left">组织机构层级</th>
                <th scope="col" className="py-2.5 px-3 text-center">建立者 / PI</th>
                <th scope="col" className="py-2.5 px-3 text-left">可用经费 / 总预算</th>
                <th scope="col" className="py-2.5 px-3 text-center">保密属性</th>
                <th scope="col" className="py-2.5 px-3 text-right no-print">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.projects.map((p) => {
                const leadDept = data.departments.find((d) => d.id === p.lead_dept_id);
                const piUser = data.users.find((u) => u.id === p.pi_user_id);
                return (
                  <tr key={p.id} className="cv-row hover:bg-blue-50/40">
                    <td className="py-2.5 px-3">
                      <button
                        type="button"
                        onClick={() => onOpenLabDetail(p.id)}
                        className="font-bold text-blue-700 hover:underline text-left block"
                      >
                        {p.name}
                      </button>
                      <span className="font-mono text-[11px] text-slate-500">{p.code}</span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">
                      所内用户 » 集约化中心 » {leadDept?.name || '-'}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      {piUser ? (
                        <button
                          type="button"
                          onClick={() => onOpenUserProfile(piUser.id)}
                          className="text-blue-700 hover:underline"
                        >
                          {piUser.full_name}
                        </button>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-mono tabular-nums">
                      <strong className="text-emerald-700">¥{p.available_balance}</strong> / ¥
                      {p.total_budget}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <StatusBadge
                        status={p.is_confidential ? 'CONFIDENTIAL' : 'OPEN'}
                        showCode={false}
                      />
                    </td>
                    <td className="py-2.5 px-3 text-right whitespace-nowrap space-x-2 no-print">
                      <button
                        type="button"
                        onClick={() => onOpenLabDetail(p.id)}
                        className="text-blue-700 hover:underline font-medium"
                      >
                        详情
                      </button>
                      {canEditProject(currentOperator, p, data.project_members) && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingProjectId(p.id);
                            setProjectForm({
                              code: p.code,
                              name: p.name,
                              lead_dept_id: p.lead_dept_id,
                              pi_user_id: p.pi_user_id,
                              initial_budget: p.total_budget,
                              is_confidential: p.is_confidential,
                            });
                            setLabsPrimaryTab('upsert_project');
                          }}
                          className="text-blue-700 hover:underline font-medium"
                        >
                          修改
                        </button>
                      )}
                      {canDeleteProject(currentOperator, p, data.project_members) && (
                        <button
                          type="button"
                          onClick={() => onRequestDeleteProject(p)}
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

      {(labsPrimaryTab === 'my_lab' || labsPrimaryTab === 'detail') && selectedLabProject && (
        <div className="space-y-4">
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow">
              课题组
            </div>
            <div className="space-y-1 flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">
                  {selectedLabProject.name} ({selectedLabProject.code})
                </h2>
                <StatusBadge
                  status={selectedLabProject.is_confidential ? 'CONFIDENTIAL' : 'OPEN'}
                  showCode={false}
                />
              </div>
              <div className="text-xs text-slate-600">
                组织路径：所内用户 » 集约化中心 »{' '}
                {data.departments.find((d) => d.id === selectedLabProject.lead_dept_id)?.name}
              </div>
              <div className="font-mono text-xs text-slate-700 tabular-nums">
                总预算 ¥{selectedLabProject.total_budget} · 冻结 ¥
                {selectedLabProject.frozen_balance} · 可用余额{' '}
                <strong className="text-emerald-700">¥{selectedLabProject.available_balance}</strong>
              </div>
            </div>
          </div>

          <TabBar
            label="课题组详情子页签"
            tabs={[
              { id: 'members', label: '课题组成员与配额' },
              { id: 'eq_reserv', label: '仪器预约' },
              { id: 'eq_sample', label: '仪器送样' },
              { id: 'billing', label: '财务明细' },
            ]}
            activeId={labDetailTab}
            onChange={setLabDetailTab}
          />

          {labDetailTab === 'members' && (
            <div className="space-y-3">
              <div className="bg-slate-50 border border-slate-200 p-2.5 rounded-xl no-print">
                <button
                  type="button"
                  onClick={() => setLabsPrimaryTab('add_member')}
                  className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium"
                >
                  + 添加成员 / 调整配额
                </button>
              </div>
              <DataTableShell caption="项目成员白名单与个人消费配额">
                <thead className="border-b border-slate-200 text-slate-700">
                  <tr>
                    <th scope="col" className="py-2.5 px-3 text-left">姓名</th>
                    <th scope="col" className="py-2.5 px-3 text-left">项目内角色</th>
                    <th scope="col" className="py-2.5 px-3 text-right">消费配额上限</th>
                    <th scope="col" className="py-2.5 px-3 text-right">已使用配额</th>
                    <th scope="col" className="py-2.5 px-3 text-right">剩余可用配额</th>
                    <th scope="col" className="py-2.5 px-3 text-right no-print">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.project_members
                    .filter((pm) => pm.project_id === selectedLabProject.id)
                    .map((pm) => (
                      <tr key={pm.id} className="cv-row hover:bg-blue-50/40">
                        <td className="py-2.5 px-3">
                          <button
                            type="button"
                            onClick={() => onOpenUserProfile(pm.user_id)}
                            className="font-bold text-blue-700 hover:underline"
                          >
                            {pm.user_name}
                          </button>
                        </td>
                        <td className="py-2.5 px-3 font-mono">{pm.project_role}</td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                          ¥{pm.spending_limit}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-amber-700 tabular-nums">
                          ¥{pm.used_quota}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700 tabular-nums">
                          ¥{(Number(pm.spending_limit) - Number(pm.used_quota)).toFixed(4)}
                        </td>
                        <td className="py-2.5 px-3 text-right whitespace-nowrap space-x-2 no-print">
                          <button
                            type="button"
                            onClick={() => {
                              setMemberForm({
                                target_user_id: pm.user_id,
                                project_role: pm.project_role,
                                spending_limit: pm.spending_limit,
                              });
                              setLabsPrimaryTab('add_member');
                            }}
                            className="text-blue-700 hover:underline font-medium"
                          >
                            修改配额
                          </button>
                          {canEditProject(
                            currentOperator,
                            selectedLabProject,
                            data.project_members
                          ) &&
                            pm.user_id !== selectedLabProject.pi_user_id && (
                              <button
                                type="button"
                                onClick={() => onRequestRemoveProjectMember(pm)}
                                className="text-rose-600 hover:underline font-medium"
                              >
                                移出成员
                              </button>
                            )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </DataTableShell>
            </div>
          )}

          {labDetailTab === 'eq_reserv' && (
            <DataTableShell caption="项目关联仪器预约记录">
              <thead className="border-b border-slate-200 text-slate-700">
                <tr>
                  <th scope="col" className="py-2.5 px-3 text-left">单号</th>
                  <th scope="col" className="py-2.5 px-3 text-left">设备</th>
                  <th scope="col" className="py-2.5 px-3 text-left">操作人</th>
                  <th scope="col" className="py-2.5 px-3 text-left">预约 / 有效时长</th>
                  <th scope="col" className="py-2.5 px-3 text-right">金额</th>
                  <th scope="col" className="py-2.5 px-3 text-left">状态</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.reservations
                  .filter((r) => r.project_id === selectedLabProject.id)
                  .map((r) => (
                    <tr key={r.id} className="cv-row">
                      <td className="py-2.5 px-3 font-mono">#{r.id}</td>
                      <td className="py-2.5 px-3 font-mono">{r.device_code}</td>
                      <td className="py-2.5 px-3">{r.operator_name}</td>
                      <td className="py-2.5 px-3 font-mono tabular-nums">
                        {r.reserved_hours}h / {r.actual_active_hours}h
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                        ¥{r.status === 'COMPLETED' ? r.settled_amount : r.hold_amount}
                      </td>
                      <td className="py-2.5 px-3">
                        <StatusBadge status={r.status} />
                      </td>
                    </tr>
                  ))}
              </tbody>
            </DataTableShell>
          )}

          {labDetailTab === 'eq_sample' && (
            <DataTableShell caption="项目关联送检样品">
              <thead className="border-b border-slate-200 text-slate-700">
                <tr>
                  <th scope="col" className="py-2.5 px-3 text-left">条码</th>
                  <th scope="col" className="py-2.5 px-3 text-left">样品名称</th>
                  <th scope="col" className="py-2.5 px-3 text-left">送检人</th>
                  <th scope="col" className="py-2.5 px-3 text-right">费用</th>
                  <th scope="col" className="py-2.5 px-3 text-left">状态</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.samples
                  .filter((s) => s.project_id === selectedLabProject.id)
                  .map((s) => (
                    <tr key={s.id} className="cv-row">
                      <td className="py-2.5 px-3 font-mono">{s.barcode}</td>
                      <td className="py-2.5 px-3">{s.name}</td>
                      <td className="py-2.5 px-3">{s.submitter_name}</td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                        ¥{s.total_test_fee}
                      </td>
                      <td className="py-2.5 px-3">
                        <StatusBadge status={s.status} />
                      </td>
                    </tr>
                  ))}
              </tbody>
            </DataTableShell>
          )}

          {labDetailTab === 'billing' && (
            <DataTableShell caption="项目复式记账财务明细">
              <thead className="border-b border-slate-200 text-slate-700">
                <tr>
                  <th scope="col" className="py-2.5 px-3 text-left">流水号</th>
                  <th scope="col" className="py-2.5 px-3 text-left">类型</th>
                  <th scope="col" className="py-2.5 px-3 text-left">经办人</th>
                  <th scope="col" className="py-2.5 px-3 text-left">受益科室</th>
                  <th scope="col" className="py-2.5 px-3 text-right">发生额</th>
                  <th scope="col" className="py-2.5 px-3 text-right">交易后可用余额</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.ledgers
                  .filter((l) => l.project_id === selectedLabProject.id)
                  .map((l) => (
                    <tr key={l.id} className="cv-row">
                      <td className="py-2.5 px-3 font-mono">{l.idempotency_key}</td>
                      <td className="py-2.5 px-3 font-mono">{l.tx_type}</td>
                      <td className="py-2.5 px-3">{l.operator_name}</td>
                      <td className="py-2.5 px-3">{l.beneficiary_dept_name}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold tabular-nums">
                        ¥{l.amount}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                        ¥{l.balance_after}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </DataTableShell>
          )}
        </div>
      )}

      {labsPrimaryTab === 'add_member' && (
        <form
          onSubmit={onUpsertMember}
          className="max-w-lg p-5 bg-slate-50 border border-slate-200 rounded-xl space-y-4 shadow-sm"
        >
          <h2 className="font-bold text-sm text-slate-900 border-b border-slate-200 pb-2">
            配置项目【{currentProject?.code}】成员权限与消费配额
          </h2>
          <FormField label="选择成员">
            {(props) => (
              <select
                {...props}
                value={memberForm.target_user_id}
                onChange={(e) => setMemberForm({ ...memberForm, target_user_id: e.target.value })}
                className={INPUT_CLS}
              >
                {data.users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name} ({u.home_dept_name})
                  </option>
                ))}
              </select>
            )}
          </FormField>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <FormField label="项目角色">
              {(props) => (
                <select
                  {...props}
                  value={memberForm.project_role}
                  onChange={(e) => setMemberForm({ ...memberForm, project_role: e.target.value })}
                  className={`${INPUT_CLS} font-mono`}
                >
                  <option value="PI">PI (负责人)</option>
                  <option value="RESEARCHER">RESEARCHER (研究人员)</option>
                  <option value="OBSERVER">OBSERVER (只读观察员)</option>
                </select>
              )}
            </FormField>
            <FormField label="个人消费配额上限 (元)">
              {(props) => (
                <input
                  {...props}
                  type="number"
                  step="100"
                  value={memberForm.spending_limit}
                  onChange={(e) => setMemberForm({ ...memberForm, spending_limit: e.target.value })}
                  className={`${INPUT_CLS} font-mono`}
                />
              )}
            </FormField>
          </div>
          <button
            type="submit"
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm"
          >
            保存配额设置
          </button>
        </form>
      )}

      {labsPrimaryTab === 'add_org' && (
        <form
          onSubmit={onSaveOrgNode}
          className="max-w-lg p-5 bg-slate-50 border border-slate-200 rounded-xl space-y-4 shadow-sm"
        >
          <h2 className="font-bold text-sm text-slate-900 border-b border-slate-200 pb-2">
            {editingDeptId ? `修改组织机构 (#${editingDeptId})` : '添加组织机构 / 课题组'}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <FormField label="机构编码" required errorText="请填写机构编码。">
              {(props) => (
                <input
                  {...props}
                  type="text"
                  spellCheck={false}
                  value={orgNodeForm.code}
                  onChange={(e) => setOrgNodeForm({ ...orgNodeForm, code: e.target.value })}
                  className={`${INPUT_CLS} font-mono`}
                  required
                />
              )}
            </FormField>
            <FormField label="负责人">
              {(props) => (
                <input
                  {...props}
                  type="text"
                  value={orgNodeForm.manager_name}
                  onChange={(e) => setOrgNodeForm({ ...orgNodeForm, manager_name: e.target.value })}
                  className={INPUT_CLS}
                />
              )}
            </FormField>
          </div>
          <FormField label="机构/课题组名称" required errorText="请填写机构名称。">
            {(props) => (
              <input
                {...props}
                type="text"
                value={orgNodeForm.name}
                onChange={(e) => setOrgNodeForm({ ...orgNodeForm, name: e.target.value })}
                className={INPUT_CLS}
                required
              />
            )}
          </FormField>
          <div className="flex gap-2">
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm"
            >
              保存机构
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingDeptId(null);
                setLabsPrimaryTab('org_list');
              }}
              className="px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs"
            >
              取消
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
