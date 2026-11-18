import React from 'react';
import { Edit3, Trash2, KeyRound, Mail, CreditCard } from 'lucide-react';
import TabBar from '../components/ui/TabBar';
import DataTableShell from '../components/ui/DataTableShell';
import StatusBadge from '../components/ui/StatusBadge';
import { canEditUser, canDeleteUser, canEditProject } from '../permissions';

export default function ProfileView({
  data,
  currentOperator,
  currentProject,
  profileUser,
  profilePrimaryTab,
  setProfilePrimaryTab,
  roleCnLabel,
  onGoPeopleList,
  onFilterPeopleByDept,
  onGoMyLab,
  onGoEditUser,
  onGoConfigQuota,
  onRequestDeleteUser,
  onOpenDeviceDetail,
  onGoAddSampleForDevice,
  onGoELN,
  onCheckin,
  onCheckout,
}) {
  if (!profileUser) return null;

  const profileUserReservations = data.reservations.filter(
    (r) => r.operator_user_id === profileUser.id
  );
  const profileUserSamples = data.samples.filter(
    (s) => s.submitter_user_id === profileUser.id
  );
  const profileUserMemberships = data.project_members.filter(
    (pm) => pm.user_id === profileUser.id
  );
  const profileUserElns = data.eln_records.filter(
    (e) => e.author_user_id === profileUser.id
  );
  const profileUserLedgers = data.ledgers.filter(
    (l) => l.operator_user_id === profileUser.id
  );

  const primaryTabs = [
    { id: 'follow', label: '关注仪器', count: data.devices.length },
    { id: 'dc_record', label: '进出记录', count: profileUserReservations.length },
    { id: 'eq_record', label: '仪器使用', count: profileUserReservations.length },
    { id: 'eq_reserv', label: '仪器预约', count: profileUserReservations.length },
    { id: 'eq_sample', label: '仪器送样', count: profileUserSamples.length },
    { id: 'eq_charge', label: '仪器收费', count: profileUserLedgers.length },
    { id: 'eq_training', label: '仪器培训 / 项目授权', count: profileUserMemberships.length },
  ];

  const kpis = [
    {
      num: profileUserReservations.filter((r) => r.status !== 'COMPLETED').length,
      unit: '个',
      label: '待办事宜',
      onClick: () => setProfilePrimaryTab('eq_reserv'),
    },
    {
      num: profileUserMemberships.length,
      unit: '个',
      label: '上岗/项目授权',
      onClick: () => setProfilePrimaryTab('eq_training'),
    },
    {
      num: profileUserElns.length,
      unit: '篇',
      label: '实验记录/成果',
      onClick: onGoELN,
    },
    {
      num: 0,
      unit: '次',
      label: '违规总次数',
      onClick: () => setProfilePrimaryTab('eq_record'),
    },
  ];

  return (
    <div className="space-y-4">
      {/* 顶部面包屑导航 */}
      <div className="flex items-center justify-between gap-2 no-print">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <button
            type="button"
            onClick={onGoPeopleList}
            className="text-blue-700 hover:underline font-medium"
          >
            成员目录
          </button>
          <span aria-hidden="true">/</span>
          <span className="text-slate-900 font-semibold">{profileUser.full_name} 的个人档案</span>
        </div>
      </div>

      {/* 个人档案头部卡片 */}
      <section
        aria-label="成员基础信息"
        className="p-4 sm:p-5 bg-gradient-to-br from-white to-slate-50/90 border border-slate-200 rounded-xl shadow-sm flex flex-wrap items-start gap-4"
      >
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white flex items-center justify-center text-2xl font-bold shrink-0 shadow-md">
          {profileUser.full_name.slice(0, 1)}
        </div>

        <div className="flex-1 min-w-[260px] space-y-2">
          <div className="flex flex-wrap items-baseline gap-2">
            <h1 className="text-lg font-bold text-slate-900">{profileUser.full_name}</h1>
            <span className="text-xs text-slate-500 font-mono">@{profileUser.username}</span>
            <button
              type="button"
              onClick={onGoMyLab}
              className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-medium transition"
            >
              {profileUser.home_dept_name}
            </button>
          </div>

          <div className="text-xs text-slate-700 font-medium">
            {roleCnLabel(profileUser.system_role)}
          </div>

          <div className="text-xs text-slate-600 flex flex-wrap gap-x-5 gap-y-1.5">
            <span className="inline-flex items-center gap-1">
              <Mail className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
              <a
                href={`mailto:${profileUser.email}`}
                className="text-blue-700 hover:underline"
              >
                {profileUser.email || '未填写邮箱'}
              </a>
            </span>
            <span className="inline-flex items-center gap-1 font-mono">
              <CreditCard className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
              RFID: {profileUser.rfid_card_id}
            </span>
          </div>

          <div className="text-xs text-slate-600">
            组织机构：
            <button
              type="button"
              onClick={() => onFilterPeopleByDept(0)}
              className="text-blue-700 hover:underline"
            >
              所内用户
            </button>{' '}
            »{' '}
            <button
              type="button"
              onClick={() => onFilterPeopleByDept(profileUser.home_dept_id)}
              className="text-blue-700 hover:underline"
            >
              {profileUser.home_dept_name}
            </button>{' '}
            »{' '}
            <span className="text-slate-900 font-medium">
              {profileUser.sub_group_name || '综合实验中心'}
            </span>
          </div>

          {/* 四宫格统计指标卡 */}
          <div className="pt-1 grid grid-cols-2 sm:grid-cols-4 gap-2.5 max-w-xl">
            {kpis.map((st) => (
              <button
                key={st.label}
                type="button"
                onClick={st.onClick}
                className="border border-slate-200 bg-white hover:border-blue-400 hover:shadow-sm rounded-xl px-3 py-2 text-left transition"
              >
                <div className="text-base font-bold text-blue-700 tabular-nums">
                  {st.num}{' '}
                  <span className="text-[11px] font-normal text-slate-500">{st.unit}</span>
                </div>
                <div className="text-[11px] text-slate-600 mt-0.5">{st.label}</div>
              </button>
            ))}
          </div>

          {/* 操作按钮行 */}
          <div className="pt-1 flex flex-wrap items-center gap-2 no-print">
            {canEditUser(currentOperator, profileUser) && (
              <button
                type="button"
                onClick={() => onGoEditUser(profileUser)}
                className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium inline-flex items-center gap-1.5 shadow-sm transition"
              >
                <Edit3 className="w-3.5 h-3.5" aria-hidden="true" /> 修改成员资料
              </button>
            )}
            {canEditProject(currentOperator, currentProject, data.project_members) && (
              <button
                type="button"
                onClick={() => onGoConfigQuota(profileUser.id)}
                className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium inline-flex items-center gap-1.5 transition"
              >
                <KeyRound className="w-3.5 h-3.5" aria-hidden="true" /> 配置项目配额
              </button>
            )}
            {canDeleteUser(currentOperator, profileUser) && (
              <button
                type="button"
                onClick={() => onRequestDeleteUser(profileUser)}
                className="px-3 py-1.5 rounded-lg border border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-medium inline-flex items-center gap-1.5 transition"
              >
                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" /> 删除该成员
              </button>
            )}
          </div>
        </div>
      </section>

      {/* 一级子模块 Tabs */}
      <TabBar
        label="个人档案分类"
        tabs={primaryTabs}
        activeId={profilePrimaryTab}
        onChange={setProfilePrimaryTab}
      />

      {profilePrimaryTab === 'follow' && (
        <DataTableShell caption="关注仪器列表">
          <thead className="border-b border-slate-200 text-slate-700">
            <tr>
              <th scope="col" className="py-2.5 px-3 text-left w-14">代码</th>
              <th scope="col" className="py-2.5 px-3 text-left">仪器名称</th>
              <th scope="col" className="py-2.5 px-3 text-center">控制 / 电流状态</th>
              <th scope="col" className="py-2.5 px-3 text-center">当前使用者</th>
              <th scope="col" className="py-2.5 px-3 text-left">放置地点</th>
              <th scope="col" className="py-2.5 px-3 text-right no-print">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.devices.map((dev) => {
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
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <StatusBadge status={dev.status} suffix={`${dev.current_amps}A`} />
                  </td>
                  <td className="py-2.5 px-3 text-center text-slate-600">
                    {activeRes ? activeRes.operator_name : '--'}
                  </td>
                  <td className="py-2.5 px-3 text-slate-600">
                    实验中心 · {dev.owner_dept_name}
                  </td>
                  <td className="py-2.5 px-3 text-right whitespace-nowrap space-x-2 no-print">
                    <button
                      type="button"
                      onClick={() => onOpenDeviceDetail(dev.id, 'reserv')}
                      className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-medium"
                    >
                      预约
                    </button>
                    <button
                      type="button"
                      onClick={() => onGoAddSampleForDevice(dev)}
                      className="px-2 py-1 rounded bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-medium"
                    >
                      送样
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenDeviceDetail(dev.id)}
                      className="text-blue-700 hover:underline font-medium"
                    >
                      详情
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </DataTableShell>
      )}

      {['dc_record', 'eq_record', 'eq_reserv'].includes(profilePrimaryTab) && (
        <DataTableShell caption="门禁刷卡、仪器使用与预约记录">
          <thead className="border-b border-slate-200 text-slate-700">
            <tr>
              <th scope="col" className="py-2.5 px-3 text-left">单号</th>
              <th scope="col" className="py-2.5 px-3 text-left">仪器编号</th>
              <th scope="col" className="py-2.5 px-3 text-left">关联项目</th>
              <th scope="col" className="py-2.5 px-3 text-left">开始时间</th>
              <th scope="col" className="py-2.5 px-3 text-left">预约 / 有效时长</th>
              <th scope="col" className="py-2.5 px-3 text-left">费率 / 金额</th>
              <th scope="col" className="py-2.5 px-3 text-left">状态</th>
              <th scope="col" className="py-2.5 px-3 text-right no-print">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {profileUserReservations.map((r) => (
              <tr key={r.id} className="cv-row hover:bg-blue-50/40">
                <td className="py-2.5 px-3 font-mono">#{r.id}</td>
                <td className="py-2.5 px-3 font-mono font-semibold text-blue-700">{r.device_code}</td>
                <td className="py-2.5 px-3 font-mono">{r.project_code}</td>
                <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500">
                  {r.start_time.slice(0, 16).replace('T', ' ')}
                </td>
                <td className="py-2.5 px-3 font-mono tabular-nums">
                  {r.reserved_hours}h / {r.actual_active_hours}h
                </td>
                <td className="py-2.5 px-3 font-mono tabular-nums">
                  [{r.rate_type}] ¥{r.status === 'COMPLETED' ? r.settled_amount : r.hold_amount}
                </td>
                <td className="py-2.5 px-3">
                  <StatusBadge status={r.status} />
                </td>
                <td className="py-2.5 px-3 text-right whitespace-nowrap space-x-2 no-print">
                  {r.status === 'RESERVED' && (
                    <button
                      type="button"
                      onClick={() => onCheckin(r.id)}
                      className="text-emerald-700 hover:underline font-semibold"
                    >
                      上机签到
                    </button>
                  )}
                  {r.status !== 'COMPLETED' && r.status !== 'CANCELLED' && (
                    <button
                      type="button"
                      onClick={() => onCheckout(r.id, r.actual_active_hours)}
                      className="text-blue-700 hover:underline font-semibold"
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

      {profilePrimaryTab === 'eq_sample' && (
        <DataTableShell caption="个人送样检测记录">
          <thead className="border-b border-slate-200 text-slate-700">
            <tr>
              <th scope="col" className="py-2.5 px-3 text-left">样品条码</th>
              <th scope="col" className="py-2.5 px-3 text-left">样品名称</th>
              <th scope="col" className="py-2.5 px-3 text-left">检测项目</th>
              <th scope="col" className="py-2.5 px-3 text-left">承检科室</th>
              <th scope="col" className="py-2.5 px-3 text-left">费用</th>
              <th scope="col" className="py-2.5 px-3 text-left">状态</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {profileUserSamples.map((s) => (
              <tr key={s.id} className="cv-row hover:bg-blue-50/40">
                <td className="py-2.5 px-3 font-mono font-semibold text-blue-700">{s.barcode}</td>
                <td className="py-2.5 px-3">{s.name}</td>
                <td className="py-2.5 px-3">{s.test_item_name}</td>
                <td className="py-2.5 px-3">{s.target_dept_name}</td>
                <td className="py-2.5 px-3 font-mono tabular-nums">
                  [{s.rate_type}] ¥{s.total_test_fee}
                </td>
                <td className="py-2.5 px-3">
                  <StatusBadge status={s.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </DataTableShell>
      )}

      {profilePrimaryTab === 'eq_charge' && (
        <DataTableShell caption="个人消费与财务流水">
          <thead className="border-b border-slate-200 text-slate-700">
            <tr>
              <th scope="col" className="py-2.5 px-3 text-left">流水号</th>
              <th scope="col" className="py-2.5 px-3 text-left">类型</th>
              <th scope="col" className="py-2.5 px-3 text-left">项目账号</th>
              <th scope="col" className="py-2.5 px-3 text-left">受益科室</th>
              <th scope="col" className="py-2.5 px-3 text-right">金额</th>
              <th scope="col" className="py-2.5 px-3 text-left">摘要</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {profileUserLedgers.map((l) => (
              <tr key={l.id} className="cv-row hover:bg-blue-50/40">
                <td className="py-2.5 px-3 font-mono">{l.idempotency_key}</td>
                <td className="py-2.5 px-3 font-mono">{l.tx_type}</td>
                <td className="py-2.5 px-3 font-mono">{l.project_code}</td>
                <td className="py-2.5 px-3">{l.beneficiary_dept_name}</td>
                <td className="py-2.5 px-3 text-right font-mono font-bold tabular-nums">
                  ¥{l.amount}
                </td>
                <td className="py-2.5 px-3 text-slate-600">{l.memo}</td>
              </tr>
            ))}
          </tbody>
        </DataTableShell>
      )}

      {profilePrimaryTab === 'eq_training' && (
        <DataTableShell caption="已授权项目与个人消费配额">
          <thead className="border-b border-slate-200 text-slate-700">
            <tr>
              <th scope="col" className="py-2.5 px-3 text-left">授权项目编号</th>
              <th scope="col" className="py-2.5 px-3 text-left">项目内角色</th>
              <th scope="col" className="py-2.5 px-3 text-right">个人配额上限</th>
              <th scope="col" className="py-2.5 px-3 text-right">已使用配额</th>
              <th scope="col" className="py-2.5 px-3 text-right">剩余可用配额</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {profileUserMemberships.map((pm) => (
              <tr key={pm.id} className="cv-row hover:bg-blue-50/40">
                <td className="py-2.5 px-3 font-mono font-bold text-blue-700">{pm.project_code}</td>
                <td className="py-2.5 px-3 font-mono">{pm.project_role}</td>
                <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                  ¥{pm.spending_limit}
                </td>
                <td className="py-2.5 px-3 text-right font-mono text-amber-700 tabular-nums">
                  ¥{pm.used_quota}
                </td>
                <td className="py-2.5 px-3 text-right font-mono text-emerald-700 font-bold tabular-nums">
                  ¥{(Number(pm.spending_limit) - Number(pm.used_quota)).toFixed(4)}
                </td>
              </tr>
            ))}
          </tbody>
        </DataTableShell>
      )}
    </div>
  );
}
