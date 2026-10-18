import React, { useState, useEffect, useMemo } from 'react';
import {
  Cpu,
  ShieldCheck,
  FlaskConical,
  FileText,
  Landmark,
  Radio,
  Users,
  Lock,
  CheckCircle2,
  AlertTriangle,
  Play,
  Square,
  RefreshCw,
  Terminal,
  Zap,
  CreditCard,
  Layers,
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8000';
const DEFAULT_HW_TOKEN = 'UNILAB_HW_SECRET_2026';

export default function App() {
  // 全局数据快照与加载状态
  const [data, setData] = useState({
    departments: [],
    users: [],
    projects: [],
    project_members: [],
    devices: [],
    reservations: [],
    consumables: [],
    samples: [],
    eln_records: [],
    ledgers: [],
    dept_revenue_summary: [],
  });
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('FMS');
  const [banner, setBanner] = useState({ type: 'info', text: '欢迎进入 UniLab-OS 综合实验室矩阵管理与跨科财务结算平台' });

  // 顶部强制绑定的操作上下文 (operator_user_id, project_id)
  const [operatorId, setOperatorId] = useState(4); // 默认：生医室陈博士 (跨科实验员)
  const [projectId, setProjectId] = useState(1);   // 默认：PRJ-2026-01 纳米靶向载体保密项目

  // Module 0: 成员配额表单
  const [memberForm, setMemberForm] = useState({
    target_user_id: 3,
    project_role: 'RESEARCHER',
    spending_limit: '5000.0000',
  });

  // Module A: FMS 预约与结算表单
  const [resForm, setResForm] = useState({
    device_id: 2,
    hours_from_now: 1,
    duration_hours: 2,
  });
  const [checkoutHoursMap, setCheckoutHoursMap] = useState({});

  // Module B: LIMS 样品登记、耗材领用与 COA 录入表单
  const [sampleForm, setSampleForm] = useState({
    name: '高纯纳米金溶胶待测样 #B2',
    target_dept_id: 3,
    test_item_name: 'FE-SEM 形貌与能谱元素分析',
    sample_count: 1,
    internal_test_price: '90.0000',
    external_test_price: '210.0000',
  });
  const [claimForm, setClaimForm] = useState({
    consumable_id: 1,
    quantity: '2.0000',
  });
  const [coaSampleId, setCoaSampleId] = useState('');
  const [coaJsonText, setCoaJsonText] = useState('{"纯度_percent": 99.4, "粒径均值_nm": 65.2, "结论": "PASS"}');

  // Module C: ELN 创建表单
  const [elnForm, setElnForm] = useState({
    title: 'EXP-2026-002: 跨科室微纳载体表面修饰条件筛选',
    markdown_content: '### 实验记录\n1. 采用材料室微流控芯片完成混合；\n2. 送检分析中心完成质谱定性定量。',
    conditions_text: '{"temp_c": 37.0, "stir_rpm": 600, "solvent": "PBS 7.4"}',
    linked_reservation_id: '',
    linked_sample_id: '',
  });

  // 硬件模拟器 (Simulator Console) 表单状态
  const [hwToken, setHwToken] = useState(DEFAULT_HW_TOKEN);
  const [simTelemetry, setSimTelemetry] = useState({
    device_code: 'CNC-01',
    rms_current_amps: '6.8500',
    power_state: 'RUNNING',
    operator_rfid: 'CARD_889203',
    project_code_override: 'PRJ-2026-01',
    seq_id: `ESP32_MSG_${Math.floor(10000 + Math.random() * 90000)}`,
  });
  const [simRfid, setSimRfid] = useState({
    device_code: 'CNC-01',
    rfid_card_id: 'CARD_889203',
    project_code: 'PRJ-2026-01',
    seq_id: `RFID_REQ_${Math.floor(10000 + Math.random() * 90000)}`,
  });
  const [simIngest, setSimIngest] = useState({
    barcode: 'SMP-20261018-NANO01',
    instrument_code: 'LCMS-01',
    operator_rfid: 'CARD_889204',
    raw_metrics_text: '{"峰面积比": 1.984, "信噪比_SNR": 420.5, "质谱检出限_ng_mL": 0.05, "自动判定": "PASS"}',
    seq_id: `AGENT_COA_${Math.floor(10000 + Math.random() * 90000)}`,
  });
  const [simErp, setSimErp] = useState({
    project_code: 'PRJ-2026-01',
    amount: '15000.0000',
    erp_voucher_no: 'ERP-2026-VOUCHER-889',
    operator_username: 'pi_zhang',
  });
  const [simResponseLog, setSimResponseLog] = useState('// 硬件网关调试响应日志将在此处实时输出...');

  // 拉取全量工作台数据
  const fetchBootstrap = async (opId = operatorId, prjId = projectId) => {
    setLoading(true);
    try {
      const res = await fetch(
        `${API_BASE}/api/v1/bootstrap?operator_user_id=${opId}&project_id=${prjId}`
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.detail || '加载初始化数据失败');
      setData(json);
    } catch (err) {
      setBanner({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBootstrap(operatorId, projectId);
  }, [operatorId, projectId]);

  // 当前选中的操作员、项目及对应的矩阵配额白名单信息
  const currentOperator = useMemo(
    () => data.users.find((u) => u.id === Number(operatorId)),
    [data.users, operatorId]
  );
  const currentProject = useMemo(
    () => data.projects.find((p) => p.id === Number(projectId)),
    [data.projects, projectId]
  );
  const currentMembership = useMemo(
    () =>
      data.project_members.find(
        (pm) => pm.user_id === Number(operatorId) && pm.project_id === Number(projectId)
      ),
    [data.project_members, operatorId, projectId]
  );

  // 通用 POST 请求包装器
  const apiPost = async (path, bodyObj, customHeaders = {}) => {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...customHeaders,
      },
      body: JSON.stringify(bodyObj),
    });
    const json = await res.json();
    if (!res.ok) {
      throw new Error(json.detail || JSON.stringify(json));
    }
    return json;
  };


  // ==================== 核心业务交互处理器 ====================

  const handleUpsertMember = async (e) => {
    e.preventDefault();
    try {
      const res = await apiPost('/api/v1/org/project-members', {
        operator_user_id: Number(operatorId),
        project_id: Number(projectId),
        target_user_id: Number(memberForm.target_user_id),
        project_role: memberForm.project_role,
        spending_limit: memberForm.spending_limit,
      });
      setBanner({
        type: 'success',
        text: `已成功更新项目成员权限与消费配额（成员ID: ${res.user_id}, 角色: ${res.project_role}, 限额: ¥${res.spending_limit}）`,
      });
      fetchBootstrap();
    } catch (err) {
      setBanner({ type: 'error', text: err.message });
    }
  };

  const handleCreateReservation = async (e) => {
    e.preventDefault();
    try {
      const start = new Date(Date.now() + Number(resForm.hours_from_now) * 3600 * 1000);
      const end = new Date(start.getTime() + Number(resForm.duration_hours) * 3600 * 1000);
      const res = await apiPost('/api/v1/fms/reservations', {
        operator_user_id: Number(operatorId),
        project_id: Number(projectId),
        device_id: Number(resForm.device_id),
        start_time: start.toISOString(),
        end_time: end.toISOString(),
      });
      setBanner({
        type: 'success',
        text: `机时预约成功 (#${res.reservation_id})！自动识别费率: [${res.rate_type}] @ ¥${res.applied_rate}/h，已冻结经费 ¥${res.hold_amount}`,
      });
      fetchBootstrap();
    } catch (err) {
      setBanner({ type: 'error', text: err.message });
    }
  };

  const handleCheckin = async (reservationId) => {
    try {
      const res = await apiPost(`/api/v1/fms/reservations/${reservationId}/checkin`, {
        operator_user_id: Number(operatorId),
        project_id: Number(projectId),
        checkin_method: 'WEB_MANUAL',
      });
      setBanner({
        type: 'success',
        text: `预约单 #${res.reservation_id} 已上机签到，设备切换至 [${res.device_status}] 高负载计费状态`,
      });
      fetchBootstrap();
    } catch (err) {
      setBanner({ type: 'error', text: err.message });
    }
  };

  const handleCheckout = async (reservationId, defaultHours) => {
    try {
      const actualHours = checkoutHoursMap[reservationId] ?? defaultHours ?? '1.5000';
      const res = await apiPost(`/api/v1/fms/reservations/${reservationId}/checkout`, {
        operator_user_id: Number(operatorId),
        project_id: Number(projectId),
        actual_active_hours: String(actualHours),
      });
      setBanner({
        type: 'success',
        text: `下机结算完成 (#${res.reservation_id})：实扣 ¥${res.settled_amount} [${res.rate_type}]，自动退回多余冻结款 ¥${res.refunded_hold}`,
      });
      fetchBootstrap();
    } catch (err) {
      setBanner({ type: 'error', text: err.message });
    }
  };

  const handleCreateSample = async (e) => {
    e.preventDefault();
    try {
      const res = await apiPost('/api/v1/lims/samples', {
        operator_user_id: Number(operatorId),
        project_id: Number(projectId),
        name: sampleForm.name,
        target_dept_id: Number(sampleForm.target_dept_id),
        test_item_name: sampleForm.test_item_name,
        sample_count: Number(sampleForm.sample_count),
        internal_test_price: sampleForm.internal_test_price,
        external_test_price: sampleForm.external_test_price,
      });
      setBanner({
        type: 'success',
        text: `样品登记成功！条码: ${res.barcode}，适用费率 [${res.rate_type}]，已实时扣除检测费 ¥${res.total_test_fee}`,
      });
      fetchBootstrap();
    } catch (err) {
      setBanner({ type: 'error', text: err.message });
    }
  };

  const handleUpdateCOA = async (e) => {
    e.preventDefault();
    if (!coaSampleId) {
      setBanner({ type: 'error', text: '请先选择需要录入 COA 报告的样品' });
      return;
    }
    try {
      const parsedMetrics = JSON.parse(coaJsonText);
      const res = await apiPost(`/api/v1/lims/samples/${coaSampleId}/coa`, {
        operator_user_id: Number(operatorId),
        project_id: Number(projectId),
        status: 'COMPLETED',
        coa_metrics: parsedMetrics,
      });
      setBanner({
        type: 'success',
        text: `样品 ${res.barcode} COA 检测报告已签发完成！`,
      });
      fetchBootstrap();
    } catch (err) {
      setBanner({ type: 'error', text: `COA 提交失败: ${err.message}` });
    }
  };

  const handleClaimConsumable = async (e) => {
    e.preventDefault();
    try {
      const res = await apiPost('/api/v1/lims/consumables/claim', {
        operator_user_id: Number(operatorId),
        project_id: Number(projectId),
        consumable_id: Number(claimForm.consumable_id),
        quantity: claimForm.quantity,
      });
      setBanner({
        type: 'success',
        text: `耗材领用成功！适用 [${res.rate_type}] 单价 ¥${res.unit_price}，实扣 ¥${res.total_cost}，剩余库存 ${res.remaining_stock}`,
      });
      fetchBootstrap();
    } catch (err) {
      setBanner({ type: 'error', text: err.message });
    }
  };

  const handleCreateELN = async (e) => {
    e.preventDefault();
    try {
      const parsedCond = JSON.parse(elnForm.conditions_text || '{}');
      const res = await apiPost('/api/v1/eln/records', {
        operator_user_id: Number(operatorId),
        project_id: Number(projectId),
        title: elnForm.title,
        markdown_content: elnForm.markdown_content,
        conditions: parsedCond,
        linked_reservation_id: elnForm.linked_reservation_id ? Number(elnForm.linked_reservation_id) : null,
        linked_sample_id: elnForm.linked_sample_id ? Number(elnForm.linked_sample_id) : null,
      });
      setBanner({
        type: 'success',
        text: `ELN 实验记录 #${res.eln_id} 已保存，自动挂载综合实验成本: ¥${res.synthesized_total_cost}`,
      });
      fetchBootstrap();
    } catch (err) {
      setBanner({ type: 'error', text: `创建 ELN 失败: ${err.message}` });
    }
  };

  const handleLockELN = async (elnId) => {
    try {
      const res = await apiPost(`/api/v1/eln/records/${elnId}/lock`, {
        operator_user_id: Number(operatorId),
        project_id: Number(projectId),
      });
      setBanner({
        type: 'success',
        text: `ELN 记录 #${res.eln_id} 已完成电子签名并永久审计锁定 (${res.signed_at})`,
      });
      fetchBootstrap();
    } catch (err) {
      setBanner({ type: 'error', text: err.message });
    }
  };

  // ==================== 硬件与第三方模拟器调用 ====================

  const triggerSimTelemetry = async () => {
    try {
      const payload = {
        device_code: simTelemetry.device_code,
        hardware_timestamp: Math.floor(Date.now() / 1000),
        rms_current_amps: simTelemetry.rms_current_amps,
        power_state: simTelemetry.power_state,
        operator_rfid: simTelemetry.operator_rfid || null,
        project_code_override: simTelemetry.project_code_override || null,
        seq_id: simTelemetry.seq_id,
      };
      const res = await apiPost('/api/v1/ext/iot/telemetry', payload, {
        'X-Lab-Hardware-Token': hwToken,
      });
      setSimResponseLog(JSON.stringify({ endpoint: '/api/v1/ext/iot/telemetry', request: payload, response: res }, null, 2));
      setBanner({
        type: 'success',
        text: `IoT 报文上报成功：设备 ${res.device_code} 状态 [${res.computed_status}]，继电器指令 [${res.relay_command}] (幂等重放: ${res.idempotent_replay})`,
      });
      fetchBootstrap();
    } catch (err) {
      setSimResponseLog(`ERROR: ${err.message}`);
      setBanner({ type: 'error', text: err.message });
    }
  };

  const triggerSimRfid = async () => {
    try {
      const res = await apiPost('/api/v1/ext/access/rfid-verify', simRfid, {
        'X-Lab-Hardware-Token': hwToken,
      });
      setSimResponseLog(JSON.stringify({ endpoint: '/api/v1/ext/access/rfid-verify', request: simRfid, response: res }, null, 2));
      setBanner({
        type: res.authorized ? 'success' : 'error',
        text: `RFID 刷卡响应：${res.reason} (解锁秒数: ${res.relay_unlock_seconds}s)`,
      });
      fetchBootstrap();
    } catch (err) {
      setSimResponseLog(`ERROR: ${err.message}`);
      setBanner({ type: 'error', text: err.message });
    }
  };

  const triggerSimIngest = async () => {
    try {
      const payload = {
        barcode: simIngest.barcode,
        instrument_code: simIngest.instrument_code,
        operator_rfid: simIngest.operator_rfid,
        raw_metrics: JSON.parse(simIngest.raw_metrics_text),
        seq_id: simIngest.seq_id,
      };
      const res = await apiPost('/api/v1/ext/lims/instrument-ingest', payload, {
        'X-Lab-Hardware-Token': hwToken,
      });
      setSimResponseLog(JSON.stringify({ endpoint: '/api/v1/ext/lims/instrument-ingest', request: payload, response: res }, null, 2));
      setBanner({
        type: 'success',
        text: `大型仪器 Agent 自动抓取入库成功：样品 ${res.barcode} 状态已更新为 [${res.updated_status}]`,
      });
      fetchBootstrap();
    } catch (err) {
      setSimResponseLog(`ERROR: ${err.message}`);
      setBanner({ type: 'error', text: err.message });
    }
  };

  const triggerSimErpDeposit = async () => {
    try {
      const res = await apiPost('/api/v1/ext/erp/grant-deposit', simErp, {
        'X-Lab-Hardware-Token': hwToken,
      });
      setSimResponseLog(JSON.stringify({ endpoint: '/api/v1/ext/erp/grant-deposit', request: simErp, response: res }, null, 2));
      setBanner({
        type: 'success',
        text: `ERP 经费拨款入账成功：项目 ${res.project_code} 最新可用余额 ¥${res.available_balance} (幂等重放: ${res.idempotent_replay})`,
      });
      fetchBootstrap();
    } catch (err) {
      setSimResponseLog(`ERROR: ${err.message}`);
      setBanner({ type: 'error', text: err.message });
    }
  };

  const statusBadgeColor = (status) => {
    switch (status) {
      case 'IDLE':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
      case 'RESERVED':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      case 'RUNNING':
      case 'ACTIVE':
        return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40';
      case 'OVERTIME_RUNNING':
        return 'bg-purple-500/20 text-purple-300 border-purple-500/40';
      case 'FAULT':
        return 'bg-rose-500/20 text-rose-300 border-rose-500/40';
      default:
        return 'bg-slate-700 text-slate-300 border-slate-600';
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* 顶部全局身份与跨科室项目上下文切换栏 */}
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-30 px-6 py-3">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold tracking-wider text-white">UniLab-OS</h1>
                <span className="text-xs px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800 font-mono">
                  MATRIX-RBAC + DOUBLE-ENTRY v1.0
                </span>
              </div>
              <p className="text-xs text-slate-400">
                综合实验室线上管理平台 · 行政科室管资产 / 跨科项目管经费与保密隔离
              </p>
            </div>
          </div>

          {/* 强制操作上下文选择器 */}
          <div className="flex flex-wrap items-center gap-3 bg-slate-950/90 border border-slate-800 rounded-lg px-3 py-2">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-cyan-400" />
              <span className="text-xs text-slate-400">当前操作员:</span>
              <select
                value={operatorId}
                onChange={(e) => setOperatorId(Number(e.target.value))}
                className="bg-slate-900 border border-slate-700 text-xs rounded px-2.5 py-1.5 text-slate-100 focus:outline-none focus:border-cyan-500"
              >
                {data.users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name} [{u.home_dept_name} | RFID:{u.rfid_card_id}]
                  </option>
                ))}
              </select>
            </div>

            <div className="h-4 w-px bg-slate-800 hidden sm:block" />

            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-amber-400" />
              <span className="text-xs text-slate-400">绑定项目账户:</span>
              <select
                value={projectId}
                onChange={(e) => setProjectId(Number(e.target.value))}
                className="bg-slate-900 border border-slate-700 text-xs rounded px-2.5 py-1.5 text-slate-100 focus:outline-none focus:border-cyan-500"
              >
                {data.projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} - {p.name} (可用: ¥{p.available_balance})
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={() => fetchBootstrap()}
              className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
              title="刷新实时状态"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
            </button>
          </div>
        </div>

        {/* 操作员在当前项目下的白名单状态条 */}
        <div className="max-w-7xl mx-auto mt-2.5 pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between text-xs gap-2">
          <div className="flex flex-wrap items-center gap-4">
            <span>
              行政归属科室:{' '}
              <strong className="text-cyan-300">{currentOperator?.home_dept_name || '-'}</strong>
            </span>
            <span>
              系统角色: <strong className="text-slate-200">{currentOperator?.system_role || '-'}</strong>
            </span>
            {currentMembership ? (
              <span className="px-2 py-0.5 rounded bg-emerald-950/90 border border-emerald-700/60 text-emerald-300">
                ✓ 已在项目白名单 | 项目内角色: <strong>{currentMembership.project_role}</strong> | 个人已用配额:{' '}
                <strong>¥{currentMembership.used_quota}</strong> / 限额: <strong>¥{currentMembership.spending_limit}</strong>
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded bg-rose-950/90 border border-rose-700/60 text-rose-300">
                ✕ 当前员工不在项目【{currentProject?.code}】成员白名单中（发起消费或查阅保密 ELN/COA 将被拦截）
              </span>
            )}
          </div>
          {currentProject && (
            <div className="flex items-center gap-4 font-mono">
              <span>总预算: ¥{currentProject.total_budget}</span>
              <span className="text-amber-300">预约冻结(Hold): ¥{currentProject.frozen_balance}</span>
              <span className="text-emerald-400 font-semibold">可用余额: ¥{currentProject.available_balance}</span>
            </div>
          )}
        </div>
      </header>


      {/* 全局实时反馈通知栏 */}
      {banner.text && (
        <div
          className={`px-6 py-2 text-xs font-medium border-b flex items-center justify-between ${
            banner.type === 'error'
              ? 'bg-rose-950/90 border-rose-800 text-rose-200'
              : banner.type === 'success'
              ? 'bg-emerald-950/90 border-emerald-800 text-emerald-200'
              : 'bg-slate-900 border-slate-800 text-cyan-200'
          }`}
        >
          <div className="max-w-7xl mx-auto w-full flex items-center justify-between">
            <span>{banner.text}</span>
            <button onClick={() => setBanner({ type: 'info', text: '' })} className="text-slate-400 hover:text-white">
              ✕
            </button>
          </div>
        </div>
      )}

      {/* 模块导航栏 */}
      <div className="bg-slate-900/50 border-b border-slate-800 px-6">
        <div className="max-w-7xl mx-auto flex flex-wrap gap-1 py-2">
          {[
            { id: 'FMS', label: 'Module A · FMS 机时调度与平面图', icon: Cpu },
            { id: 'LIMS', label: 'Module B · LIMS 样品流转与耗材库', icon: FlaskConical },
            { id: 'ELN', label: 'Module C · ELN 实验记录与保密隔离', icon: FileText },
            { id: 'MATRIX', label: 'Module 0 · 跨科室项目矩阵与配额', icon: ShieldCheck },
            { id: 'BILLING', label: 'Module D · 复式记账总账与科室产值', icon: Landmark },
            { id: 'SIMULATOR', label: 'Hardware & ERP 外部接口模拟器', icon: Radio },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-md text-xs font-medium transition ${
                  active
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 主内容区 */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">
        {/* ==================== MODULE A: FMS ==================== */}
        {activeTab === 'FMS' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* 左侧：实验室 2D 平面图与设备实时电流状态 */}
            <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Zap className="w-4 h-4 text-cyan-400" />
                    实验室平面图与边缘电流监控节点 (2D Lab Floor Map)
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    科内自用享优惠价 (INTERNAL)，跨科室借用自动执行协同标准价 (EXTERNAL)
                  </p>
                </div>
                <span className="text-[11px] font-mono text-slate-400">
                  操作员科室ID: {currentOperator?.home_dept_id}
                </span>
              </div>

              {/* 2D 坐标画布 */}
              <div className="relative h-72 w-full rounded-lg bg-slate-950 border border-slate-800 overflow-hidden bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:20px_20px]">
                {data.devices.map((dev) => {
                  const isInternal = currentOperator?.home_dept_id === dev.owner_dept_id;
                  return (
                    <div
                      key={dev.id}
                      style={{ left: `${dev.pos_x}%`, top: `${dev.pos_y}%` }}
                      className="absolute -translate-x-1/2 -translate-y-1/2 w-48 p-2.5 rounded-lg bg-slate-900/95 border border-slate-700 shadow-lg hover:border-cyan-500/60 transition"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-bold text-white">{dev.code}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border font-mono ${statusBadgeColor(dev.status)}`}>
                          {dev.status}
                        </span>
                      </div>
                      <div className="text-xs text-slate-200 truncate mt-1">{dev.name}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">归口: {dev.owner_dept_name}</div>
                      <div className="mt-1.5 pt-1.5 border-t border-slate-800 flex items-center justify-between text-[11px] font-mono">
                        <span className="text-cyan-400">⚡ {dev.current_amps}A</span>
                        <span className={isInternal ? 'text-emerald-400' : 'text-amber-400'}>
                          {isInternal ? `科内 ¥${dev.internal_hourly_rate}/h` : `跨科 ¥${dev.external_hourly_rate}/h`}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 设备双费率明細表 */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="text-slate-400 border-b border-slate-800 bg-slate-950/50">
                    <tr>
                      <th className="py-2 px-3">设备编号</th>
                      <th className="py-2 px-3">名称 / 归口行政科室</th>
                      <th className="py-2 px-3">待机阈值 / 当前电流</th>
                      <th className="py-2 px-3">科内价 / 跨科价</th>
                      <th className="py-2 px-3">当前操作人适用价</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {data.devices.map((d) => {
                      const isInternal = currentOperator?.home_dept_id === d.owner_dept_id;
                      return (
                        <tr key={d.id} className="hover:bg-slate-800/30">
                          <td className="py-2 px-3 font-mono font-semibold text-cyan-300">{d.code}</td>
                          <td className="py-2 px-3">
                            <div>{d.name}</div>
                            <div className="text-[11px] text-slate-400">{d.owner_dept_name}</div>
                          </td>
                          <td className="py-2 px-3 font-mono">
                            {d.standby_current_threshold}A / <span className="text-cyan-400">{d.current_amps}A</span>
                          </td>
                          <td className="py-2 px-3 font-mono">
                            ¥{d.internal_hourly_rate} / ¥{d.external_hourly_rate}
                          </td>
                          <td className="py-2 px-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[11px] font-mono ${
                                isInternal
                                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                                  : 'bg-amber-950 text-amber-300 border border-amber-700'
                              }`}
                            >
                              {isInternal ? `INTERNAL ¥${d.internal_hourly_rate}/h` : `EXTERNAL ¥${d.external_hourly_rate}/h`}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 右侧：机时预约冻结 + 签到/下机结算控制台 */}
            <div className="lg:col-span-5 space-y-6">
              <form
                onSubmit={handleCreateReservation}
                className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3"
              >
                <h3 className="text-sm font-semibold text-white">新建机时预约（自动预授权冻结 Hold）</h3>
                <div className="grid grid-cols-1 gap-3 text-xs">
                  <div>
                    <label className="block text-slate-400 mb-1">选择预约设备</label>
                    <select
                      value={resForm.device_id}
                      onChange={(e) => setResForm({ ...resForm, device_id: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2"
                    >
                      {data.devices.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.code} - {d.name} ({d.owner_dept_name})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-400 mb-1">几小时后开始 (Offset Hours)</label>
                      <input
                        type="number"
                        step="0.5"
                        value={resForm.hours_from_now}
                        onChange={(e) => setResForm({ ...resForm, hours_from_now: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-1.5 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1">预约时长 (小时)</label>
                      <input
                        type="number"
                        step="0.5"
                        min="0.5"
                        value={resForm.duration_hours}
                        onChange={(e) => setResForm({ ...resForm, duration_hours: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-1.5 font-mono"
                      />
                    </div>
                  </div>
                </div>
                <button
                  type="submit"
                  className="w-full py-2 rounded bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-semibold text-xs transition"
                >
                  提交预约并执行项目经费预授权冻结 (Hold)
                </button>
              </form>

              {/* 实验任务单列表与双因子签到/下机结算 */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
                <h3 className="text-sm font-semibold text-white">实验机时任务单 (ExperimentSession) 与下机核算</h3>
                <p className="text-[11px] text-slate-400">
                  计费公式: <code className="text-cyan-300">max(预约时长×爽约系数0.5, 实际高负载小时数) × 适用单价</code>
                </p>
                <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                  {data.reservations.map((r) => (
                    <div
                      key={r.id}
                      className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-cyan-300">
                          #{r.id} · {r.device_code} ({r.project_code})
                        </span>
                        <span className={`px-2 py-0.5 rounded border text-[10px] font-mono ${statusBadgeColor(r.status)}`}>
                          {r.status}
                        </span>
                      </div>
                      <div className="flex flex-wrap justify-between text-slate-400 text-[11px] gap-2">
                        <span>操作人: {r.operator_name}</span>
                        <span className="font-mono">
                          [{r.rate_type}] ¥{r.applied_rate}/h
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 pt-1 border-t border-slate-800/80 font-mono text-[11px]">
                        <div>预约: {r.reserved_hours}h</div>
                        <div>有效运行: {r.actual_active_hours}h</div>
                        <div className="text-amber-300">冻结: ¥{r.hold_amount}</div>
                      </div>
                      {r.status === 'COMPLETED' ? (
                        <div className="text-[11px] text-emerald-400 font-mono">
                          ✓ 已完成结算：实扣 ¥{r.settled_amount} (签到方式: {r.checkin_method || 'WEB_MANUAL'})
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 pt-1">
                          {r.status === 'RESERVED' && (
                            <button
                              onClick={() => handleCheckin(r.id)}
                              className="flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-600/30"
                            >
                              <Play className="w-3 h-3" /> 手动上机签到
                            </button>
                          )}
                          <input
                            type="number"
                            step="0.25"
                            placeholder="实际有效时长(h)"
                            value={checkoutHoursMap[r.id] ?? r.actual_active_hours}
                            onChange={(e) =>
                              setCheckoutHoursMap({ ...checkoutHoursMap, [r.id]: e.target.value })
                            }
                            className="w-28 bg-slate-900 border border-slate-700 rounded px-2 py-1 font-mono text-[11px]"
                          />
                          <button
                            onClick={() => handleCheckout(r.id, r.actual_active_hours)}
                            className="flex items-center gap-1 px-2.5 py-1 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300 hover:bg-amber-500/30"
                          >
                            <Square className="w-3 h-3" /> 下机结算并解冻
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}


        {/* ==================== MODULE B: LIMS ==================== */}
        {activeTab === 'LIMS' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* 左侧：样品登记、COA 报告签发与样品列表 */}
            <div className="lg:col-span-7 space-y-6">
              <form
                onSubmit={handleCreateSample}
                className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3 text-xs"
              >
                <h3 className="text-sm font-semibold text-white">样品送检登记（自动生成 Barcode 并实时跨科/科内扣费）</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 mb-1">样品名称</label>
                    <input
                      type="text"
                      value={sampleForm.name}
                      onChange={(e) => setSampleForm({ ...sampleForm, name: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-1.5"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">承检受益行政科室</label>
                    <select
                      value={sampleForm.target_dept_id}
                      onChange={(e) => setSampleForm({ ...sampleForm, target_dept_id: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-1.5"
                    >
                      {data.departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name} ({d.code})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">检测项目名称</label>
                    <input
                      type="text"
                      value={sampleForm.test_item_name}
                      onChange={(e) => setSampleForm({ ...sampleForm, test_item_name: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-1.5"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-slate-400 mb-1">样品份数</label>
                      <input
                        type="number"
                        min="1"
                        value={sampleForm.sample_count}
                        onChange={(e) => setSampleForm({ ...sampleForm, sample_count: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1">科内单价</label>
                      <input
                        type="number"
                        value={sampleForm.internal_test_price}
                        onChange={(e) => setSampleForm({ ...sampleForm, internal_test_price: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1">跨科单价</label>
                      <input
                        type="number"
                        value={sampleForm.external_test_price}
                        onChange={(e) => setSampleForm({ ...sampleForm, external_test_price: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 font-mono"
                      />
                    </div>
                  </div>
                </div>
                <button
                  type="submit"
                  className="w-full py-2 rounded bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-semibold transition"
                >
                  登记送检样品并实时扣减项目余额与个人配额
                </button>
              </form>

              {/* 样品与 COA 报告列表 */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
                <h3 className="text-sm font-semibold text-white">样品流转台账与标准化检测报告 (COA)</h3>
                <div className="space-y-3">
                  {data.samples.map((s) => (
                    <div key={s.id} className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 text-xs space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <span className="font-mono font-bold text-cyan-300">{s.barcode}</span>
                          <span className="ml-2 font-medium text-white">{s.name}</span>
                        </div>
                        <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-[11px]">
                          {s.status} | [{s.rate_type}] ¥{s.total_test_fee}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 flex flex-wrap gap-4">
                        <span>归属项目: {s.project_code}</span>
                        <span>送检人: {s.submitter_name}</span>
                        <span>承检科室: {s.target_dept_name}</span>
                        <span>检测项: {s.test_item_name} (x{s.sample_count})</span>
                      </div>
                      <div className="p-2.5 rounded bg-slate-900 border border-slate-800 font-mono text-[11px]">
                        <div className="text-slate-400 mb-1">COA 结构化检测谱图/指标:</div>
                        {s.coa_accessible ? (
                          <pre className="text-emerald-300 whitespace-pre-wrap">
                            {JSON.stringify(s.coa_metrics, null, 2)}
                          </pre>
                        ) : (
                          <div className="text-rose-400 flex items-center gap-1.5">
                            <Lock className="w-3.5 h-3.5" />
                            {s.coa_metrics._redacted}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 右侧：COA 手动签发 + 试剂耗材库存与扫码领用 */}
            <div className="lg:col-span-5 space-y-6">
              <form
                onSubmit={handleUpdateCOA}
                className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3 text-xs"
              >
                <h3 className="text-sm font-semibold text-white">人工录入/签发样品 COA 报告</h3>
                <div>
                  <label className="block text-slate-400 mb-1">选择目标样品</label>
                  <select
                    value={coaSampleId}
                    onChange={(e) => setCoaSampleId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-1.5"
                  >
                    <option value="">-- 请选择样品 --</option>
                    {data.samples.map((s) => (
                      <option key={s.id} value={s.id}>
                        #{s.id} {s.barcode} - {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">结构化指标 JSON</label>
                  <textarea
                    rows={3}
                    value={coaJsonText}
                    onChange={(e) => setCoaJsonText(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded p-2 font-mono"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-2 rounded bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-semibold transition"
                >
                  签发 COA 检测报告并置为 COMPLETED
                </button>
              </form>

              {/* 耗材领用与安全库存预警 */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4 text-xs">
                <h3 className="text-sm font-semibold text-white">试剂耗材库存台账与跨科差价领用</h3>
                <div className="space-y-2">
                  {data.consumables.map((c) => {
                    const lowStock = Number(c.stock_qty) <= Number(c.safety_threshold);
                    const isInternal = currentOperator?.home_dept_id === c.owner_dept_id;
                    return (
                      <div key={c.id} className="p-3 rounded bg-slate-950 border border-slate-800 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-100">
                            {c.name} <span className="font-mono text-slate-400">({c.spec})</span>
                          </span>
                          <span
                            className={`font-mono px-2 py-0.5 rounded ${
                              lowStock
                                ? 'bg-rose-950 text-rose-300 border border-rose-700'
                                : 'bg-slate-800 text-emerald-300'
                            }`}
                          >
                            库存: {c.stock_qty} {lowStock ? '⚠️低于安全阈值' : ''}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                          <span>归口: {c.owner_dept_name}</span>
                          <span>
                            科内 ¥{c.internal_unit_price} / 跨科 ¥{c.external_unit_price} (当前适用:{' '}
                            <strong className="text-cyan-300">
                              {isInternal ? `¥${c.internal_unit_price}` : `¥${c.external_unit_price}`}
                            </strong>
                            )
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <form onSubmit={handleClaimConsumable} className="pt-3 border-t border-slate-800 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-400 mb-1">选择耗材</label>
                      <select
                        value={claimForm.consumable_id}
                        onChange={(e) => setClaimForm({ ...claimForm, consumable_id: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5"
                      >
                        {data.consumables.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.code} - {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1">领用数量</label>
                      <input
                        type="number"
                        step="1"
                        min="1"
                        value={claimForm.quantity}
                        onChange={(e) => setClaimForm({ ...claimForm, quantity: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 font-mono"
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    className="w-full py-2 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold transition"
                  >
                    扫码/确认领用耗材并实时记入复式账本
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}


        {/* ==================== MODULE C: ELN ==================== */}
        {activeTab === 'ELN' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* 左侧：ELN 记录列表（自动根据当前查看者是否在保密项目白名单中执行脱敏/放行） */}
            <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-white">
                    ELN 电子实验记录本（支持跨模块挂载成本与保密隔离）
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    提示：切换顶部操作员为「王主任 (生医室科主任-非纳米项目成员)」可直观验证跨科保密项目隔离拦截效果
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                {data.eln_records.map((e) => (
                  <div key={e.id} className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="font-mono text-cyan-400 font-bold">ELN #{e.id}</span>
                        <span className="ml-2 text-sm font-semibold text-white">{e.title}</span>
                      </div>
                      {e.is_locked ? (
                        <span className="px-2.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-700 font-mono flex items-center gap-1">
                          <Lock className="w-3 h-3" /> 已签名审计锁定
                        </span>
                      ) : (
                        <button
                          onClick={() => handleLockELN(e.id)}
                          className="px-2.5 py-1 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300 hover:bg-amber-500/30 font-medium"
                        >
                          签署并审计锁定 (Sign & Lock)
                        </button>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-4 text-[11px] text-slate-400 font-mono">
                      <span>项目: {e.project_code}</span>
                      <span>作者: {e.author_name}</span>
                      <span>关联机时单: {e.linked_reservation_id ? `#${e.linked_reservation_id}` : '无'}</span>
                      <span>关联样品: {e.linked_sample_id ? `#${e.linked_sample_id}` : '无'}</span>
                      <span className="text-emerald-400 font-semibold">
                        关联实验综合耗费成本: ¥{e.synthesized_total_cost}
                      </span>
                    </div>

                    {e.accessible ? (
                      <div className="space-y-2">
                        <div className="p-3 rounded bg-slate-900 border border-slate-800 whitespace-pre-wrap text-slate-200 leading-relaxed">
                          {e.markdown_content}
                        </div>
                        <div className="p-2.5 rounded bg-slate-900/70 border border-slate-800 font-mono text-[11px] text-cyan-300">
                          实验条件参数 JSON: {JSON.stringify(e.conditions_json)}
                        </div>
                      </div>
                    ) : (
                      <div className="p-4 rounded-lg bg-rose-950/50 border border-rose-800/80 text-rose-200 flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
                        <span>{e.markdown_content}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* 右侧：撰写新 ELN 并一键挂载 FMS 机时与 LIMS 样品 */}
            <div className="lg:col-span-5">
              <form
                onSubmit={handleCreateELN}
                className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3 text-xs"
              >
                <h3 className="text-sm font-semibold text-white">撰写新 ELN 记录并挂载机时/样品成本</h3>
                <div>
                  <label className="block text-slate-400 mb-1">实验标题</label>
                  <input
                    type="text"
                    value={elnForm.title}
                    onChange={(e) => setElnForm({ ...elnForm, title: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-1.5"
                    required
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Markdown 实验记录正文</label>
                  <textarea
                    rows={5}
                    value={elnForm.markdown_content}
                    onChange={(e) => setElnForm({ ...elnForm, markdown_content: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded p-2.5 font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">结构化实验条件 JSON</label>
                  <input
                    type="text"
                    value={elnForm.conditions_text}
                    onChange={(e) => setElnForm({ ...elnForm, conditions_text: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-1.5 font-mono"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 mb-1">挂载 FMS 预约机时单</label>
                    <select
                      value={elnForm.linked_reservation_id}
                      onChange={(e) => setElnForm({ ...elnForm, linked_reservation_id: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5"
                    >
                      <option value="">-- 不挂载 --</option>
                      {data.reservations.map((r) => (
                        <option key={r.id} value={r.id}>
                          #{r.id} {r.device_code} (¥{r.status === 'COMPLETED' ? r.settled_amount : r.hold_amount})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">挂载 LIMS 检测样品</label>
                    <select
                      value={elnForm.linked_sample_id}
                      onChange={(e) => setElnForm({ ...elnForm, linked_sample_id: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5"
                    >
                      <option value="">-- 不挂载 --</option>
                      {data.samples.map((s) => (
                        <option key={s.id} value={s.id}>
                          #{s.id} {s.barcode} (¥{s.total_test_fee})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <button
                  type="submit"
                  className="w-full py-2 rounded bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-semibold transition"
                >
                  保存 ELN 实验记录并自动核算科研产出成本
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ==================== MODULE 0: MATRIX ORG & QUOTA ==================== */}
        {activeTab === 'MATRIX' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-semibold text-white">
                跨科室项目成员白名单与个人消费配额矩阵 (ProjectMember Matrix)
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="text-slate-400 border-b border-slate-800 bg-slate-950/60">
                    <tr>
                      <th className="py-2.5 px-3">项目编码</th>
                      <th className="py-2.5 px-3">成员姓名</th>
                      <th className="py-2.5 px-3">项目内角色</th>
                      <th className="py-2.5 px-3">个人消费配额上限</th>
                      <th className="py-2.5 px-3">已累计占用配额</th>
                      <th className="py-2.5 px-3">剩余可用配额</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {data.project_members.map((pm) => {
                      const rem = (Number(pm.spending_limit) - Number(pm.used_quota)).toFixed(4);
                      return (
                        <tr key={pm.id} className="hover:bg-slate-800/30">
                          <td className="py-2.5 px-3 font-mono text-cyan-300">{pm.project_code}</td>
                          <td className="py-2.5 px-3 font-medium">{pm.user_name}</td>
                          <td className="py-2.5 px-3 font-mono">{pm.project_role}</td>
                          <td className="py-2.5 px-3 font-mono">¥{pm.spending_limit}</td>
                          <td className="py-2.5 px-3 font-mono text-amber-300">¥{pm.used_quota}</td>
                          <td className="py-2.5 px-3 font-mono text-emerald-400 font-semibold">¥{rem}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="lg:col-span-4">
              <form
                onSubmit={handleUpsertMember}
                className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3 text-xs"
              >
                <h3 className="text-sm font-semibold text-white">PI 授权拉人入项 / 调整个人消费配额</h3>
                <p className="text-[11px] text-slate-400">
                  需当前顶部操作员为该项目 PI（如张教授）或系统管理员方可提交修改
                </p>
                <div>
                  <label className="block text-slate-400 mb-1">目标员工</label>
                  <select
                    value={memberForm.target_user_id}
                    onChange={(e) => setMemberForm({ ...memberForm, target_user_id: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-1.5"
                  >
                    {data.users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.full_name} ({u.home_dept_name})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">授予项目内角色</label>
                  <select
                    value={memberForm.project_role}
                    onChange={(e) => setMemberForm({ ...memberForm, project_role: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-1.5 font-mono"
                  >
                    <option value="PI">PI (项目负责人)</option>
                    <option value="RESEARCHER">RESEARCHER (核心实验员)</option>
                    <option value="OBSERVER">OBSERVER (只读成员)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">个人最高消费配额 (Numeric 12,4)</label>
                  <input
                    type="number"
                    step="100"
                    value={memberForm.spending_limit}
                    onChange={(e) => setMemberForm({ ...memberForm, spending_limit: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-1.5 font-mono"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-2 rounded bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-semibold transition"
                >
                  保存成员矩阵权限与配额
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ==================== MODULE D: DOUBLE-ENTRY BILLING LEDGER ==================== */}
        {activeTab === 'BILLING' && (
          <div className="space-y-6">
            {/* 各行政科室内部服务产值统计卡片 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {data.dept_revenue_summary.map((dept) => (
                <div
                  key={dept.dept_id}
                  className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-cyan-400">{dept.dept_code}</span>
                    <span className="text-[11px] text-slate-400">贷方受益科室产值</span>
                  </div>
                  <div className="text-sm font-semibold text-white">{dept.dept_name}</div>
                  <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs font-mono">
                    <span className="text-slate-400">科内自用: ¥{dept.internal_revenue}</span>
                    <span className="text-amber-300">跨科创收: ¥{dept.external_revenue}</span>
                  </div>
                  <div className="text-base font-bold font-mono text-emerald-400">
                    累计总产值: ¥{dept.total_revenue}
                  </div>
                </div>
              ))}
            </div>

            {/* 不可篡改复式记账流水表 */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
              <h3 className="text-sm font-semibold text-white">
                不可篡改复式记账总账流水 (Append-Only Double-Entry BillingLedger)
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="text-slate-400 border-b border-slate-800 bg-slate-950/60">
                    <tr>
                      <th className="py-2.5 px-3">幂等键 (Idempotency Key)</th>
                      <th className="py-2.5 px-3">交易类型</th>
                      <th className="py-2.5 px-3">借方：付款项目 / 经办人</th>
                      <th className="py-2.5 px-3">贷方：受益行政科室</th>
                      <th className="py-2.5 px-3">费率类型</th>
                      <th className="py-2.5 px-3">发生金额</th>
                      <th className="py-2.5 px-3">交易后可用 / 冻结</th>
                      <th className="py-2.5 px-3">摘要说明</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 font-mono text-[11px]">
                    {data.ledgers.map((l) => (
                      <tr key={l.id} className="hover:bg-slate-800/30">
                        <td className="py-2 px-3 text-cyan-300">{l.idempotency_key}</td>
                        <td className="py-2 px-3">
                          <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-200">{l.tx_type}</span>
                        </td>
                        <td className="py-2 px-3 font-sans">
                          <div className="font-mono text-white">{l.project_code}</div>
                          <div className="text-slate-400">{l.operator_name}</div>
                        </td>
                        <td className="py-2 px-3 font-sans text-emerald-300">{l.beneficiary_dept_name}</td>
                        <td className="py-2 px-3">
                          <span
                            className={
                              l.rate_type === 'INTERNAL' ? 'text-emerald-400' : 'text-amber-400'
                            }
                          >
                            {l.rate_type}
                          </span>
                        </td>
                        <td className="py-2 px-3 font-bold text-white">¥{l.amount}</td>
                        <td className="py-2 px-3 text-slate-300">
                          ¥{l.balance_after} / <span className="text-amber-300">¥{l.frozen_after}</span>
                        </td>
                        <td className="py-2 px-3 font-sans text-slate-300 max-w-xs truncate" title={l.memo}>
                          {l.memo}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ==================== HARDWARE & ERP SIMULATOR CONSOLE ==================== */}
        {activeTab === 'SIMULATOR' && (
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 text-xs">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-cyan-400" />
                <span className="font-semibold text-white">
                  硬件网关鉴权 Header (X-Lab-Hardware-Token):
                </span>
              </div>
              <input
                type="text"
                value={hwToken}
                onChange={(e) => setHwToken(e.target.value)}
                className="w-72 bg-slate-950 border border-slate-700 rounded px-3 py-1.5 font-mono text-cyan-300"
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 text-xs">
              {/* 模拟器 1: ESP32 电流与状态遥测上报 */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
                <h3 className="text-sm font-semibold text-cyan-300">
                  1. POST /api/v1/ext/iot/telemetry (ESP32 电流与状态上报)
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 mb-1">设备编码 (device_code)</label>
                    <input
                      type="text"
                      value={simTelemetry.device_code}
                      onChange={(e) => setSimTelemetry({ ...simTelemetry, device_code: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">有效值电流 (rms_current_amps)</label>
                    <input
                      type="text"
                      value={simTelemetry.rms_current_amps}
                      onChange={(e) => setSimTelemetry({ ...simTelemetry, rms_current_amps: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">物理状态 (power_state)</label>
                    <select
                      value={simTelemetry.power_state}
                      onChange={(e) => setSimTelemetry({ ...simTelemetry, power_state: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 font-mono"
                    >
                      <option value="RUNNING">RUNNING</option>
                      <option value="IDLE">IDLE</option>
                      <option value="FAULT">FAULT</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">幂等序列号 (seq_id)</label>
                    <div className="flex gap-1">
                      <input
                        type="text"
                        value={simTelemetry.seq_id}
                        onChange={(e) => setSimTelemetry({ ...simTelemetry, seq_id: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 font-mono"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setSimTelemetry({
                            ...simTelemetry,
                            seq_id: `ESP32_MSG_${Math.floor(10000 + Math.random() * 90000)}`,
                          })
                        }
                        className="px-2 bg-slate-800 rounded text-slate-300"
                      >
                        新ID
                      </button>
                    </div>
                  </div>
                </div>
                <button
                  onClick={triggerSimTelemetry}
                  className="w-full py-2 rounded bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-semibold"
                >
                  模拟发送 ESP32 电流跳变报文 (+0.25h 有效机时)
                </button>
              </div>

              {/* 模拟器 2: RFID 刷卡鉴权 */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
                <h3 className="text-sm font-semibold text-emerald-300">
                  2. POST /api/v1/ext/access/rfid-verify (终端 RFID 刷卡开机核验)
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 mb-1">设备编码</label>
                    <input
                      type="text"
                      value={simRfid.device_code}
                      onChange={(e) => setSimRfid({ ...simRfid, device_code: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">RFID 卡号 (如 CARD_889203)</label>
                    <input
                      type="text"
                      value={simRfid.rfid_card_id}
                      onChange={(e) => setSimRfid({ ...simRfid, rfid_card_id: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 font-mono"
                    />
                  </div>
                </div>
                <button
                  onClick={triggerSimRfid}
                  className="w-full py-2 rounded bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-semibold"
                >
                  模拟硬件读卡器刷卡请求并联动上机签到
                </button>
              </div>

              {/* 模拟器 3: 大型分析仪器 COA 自动回传 */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
                <h3 className="text-sm font-semibold text-amber-300">
                  3. POST /api/v1/ext/lims/instrument-ingest (大型仪器 Agent 自动回传谱图)
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 mb-1">样品条码 (barcode)</label>
                    <input
                      type="text"
                      value={simIngest.barcode}
                      onChange={(e) => setSimIngest({ ...simIngest, barcode: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">分析仪器编码</label>
                    <input
                      type="text"
                      value={simIngest.instrument_code}
                      onChange={(e) => setSimIngest({ ...simIngest, instrument_code: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 font-mono"
                    />
                  </div>
                </div>
                <textarea
                  rows={2}
                  value={simIngest.raw_metrics_text}
                  onChange={(e) => setSimIngest({ ...simIngest, raw_metrics_text: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded p-2 font-mono"
                />
                <button
                  onClick={triggerSimIngest}
                  className="w-full py-2 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold"
                >
                  模拟仪器本地 Agent 上传结构化 COA 结果
                </button>
              </div>

              {/* 模拟器 4: 外部 ERP 经费拨款同步 */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
                <h3 className="text-sm font-semibold text-purple-300">
                  4. POST /api/v1/ext/erp/grant-deposit (外部财务 ERP 经费拨款入账)
                </h3>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-slate-400 mb-1">项目编码</label>
                    <input
                      type="text"
                      value={simErp.project_code}
                      onChange={(e) => setSimErp({ ...simErp, project_code: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">拨款金额</label>
                    <input
                      type="text"
                      value={simErp.amount}
                      onChange={(e) => setSimErp({ ...simErp, amount: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">ERP 凭证号(幂等)</label>
                    <input
                      type="text"
                      value={simErp.erp_voucher_no}
                      onChange={(e) => setSimErp({ ...simErp, erp_voucher_no: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 font-mono"
                    />
                  </div>
                </div>
                <button
                  onClick={triggerSimErpDeposit}
                  className="w-full py-2 rounded bg-purple-500 hover:bg-purple-400 text-slate-950 font-semibold"
                >
                  模拟外部财务系统同步项目拨款 (DEPOSIT)
                </button>
              </div>
            </div>

            {/* 网关调试输出面板 */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="text-xs text-slate-400 mb-2 font-mono">
                Gateway Request / Response Inspector:
              </div>
              <pre className="p-3 rounded bg-slate-950 border border-slate-800 text-xs font-mono text-emerald-300 overflow-x-auto max-h-64">
                {simResponseLog}
              </pre>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
