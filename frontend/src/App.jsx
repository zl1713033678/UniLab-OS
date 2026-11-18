import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Cpu,
  ShieldCheck,
  FlaskConical,
  FileText,
  Landmark,
  Radio,
  Users,
  Building2,
  Boxes,
  LogOut,
  UserCheck,
  LayoutGrid,
  List,
  Menu,
  Wifi,
  WifiOff,
} from 'lucide-react';
import {
  apiGet,
  apiPost,
  apiPut,
  apiDelete,
  DEFAULT_HW_TOKEN,
  useLabWebSocket,
} from './api/client';
import ConfirmDialog from './components/ui/ConfirmDialog';
import ToastRegion from './components/ui/ToastRegion';
import ResponsiveDrawer from './components/ui/ResponsiveDrawer';
import AuthView from './components/AuthView';
import ProfileView from './modules/ProfileView';
import EquipmentsView from './modules/EquipmentsView';
import SamplesView from './modules/SamplesView';
import ConsumablesView from './modules/ConsumablesView';
import LabsView from './modules/LabsView';
import PeopleView from './modules/PeopleView';
import BillingView from './modules/BillingView';
import ElnView from './modules/ElnView';
import EntranceView from './modules/EntranceView';
import RolesView from './modules/RolesView';

const SESSION_KEY = 'unilab_os_session';

const INITIAL_ROLES_CONFIG = [
  {
    id: 'ADMIN',
    weight: 1,
    label: '平台负责人/超级管理员',
    perms: {
      global_all: true,
      global_org: true,
      role_group: true,
      people_edit_all: true,
      people_role_all: true,
      people_view_contact: true,
      people_edit_sub: true,
      eq_edit_all: true,
      eq_status_all: true,
      eq_records_all: true,
      eq_incharge_edit: true,
      lims_submit: true,
      lims_coa_issue: true,
      eln_confidential_bypass: true,
      billing_manage: true,
      billing_erp_sync: true,
    },
  },
  {
    id: 'DEPT_HEAD',
    weight: 2,
    label: '科室主任',
    perms: {
      global_all: false,
      global_org: true,
      role_group: false,
      people_edit_all: false,
      people_role_all: false,
      people_view_contact: true,
      people_edit_sub: true,
      eq_edit_all: false,
      eq_status_all: false,
      eq_records_all: true,
      eq_incharge_edit: true,
      lims_submit: true,
      lims_coa_issue: true,
      eln_confidential_bypass: false,
      billing_manage: true,
      billing_erp_sync: false,
    },
  },
  {
    id: 'PI',
    weight: 3,
    label: '课题组负责人 (PI)',
    perms: {
      global_all: false,
      global_org: false,
      role_group: false,
      people_edit_all: false,
      people_role_all: false,
      people_view_contact: true,
      people_edit_sub: true,
      eq_edit_all: false,
      eq_status_all: false,
      eq_records_all: false,
      eq_incharge_edit: false,
      lims_submit: true,
      lims_coa_issue: false,
      eln_confidential_bypass: false,
      billing_manage: true,
      billing_erp_sync: true,
    },
  },
  {
    id: 'STAFF',
    weight: 4,
    label: '所内职工 / 仪器负责人',
    perms: {
      global_all: false,
      global_org: false,
      role_group: false,
      people_edit_all: false,
      people_role_all: false,
      people_view_contact: true,
      people_edit_sub: false,
      eq_edit_all: false,
      eq_status_all: false,
      eq_records_all: false,
      eq_incharge_edit: true,
      lims_submit: true,
      lims_coa_issue: true,
      eln_confidential_bypass: false,
      billing_manage: false,
      billing_erp_sync: false,
    },
  },
  {
    id: 'OBSERVER',
    weight: 5,
    label: '目前成员 (只读观察员)',
    perms: {
      global_all: false,
      global_org: false,
      role_group: false,
      people_edit_all: false,
      people_role_all: false,
      people_view_contact: true,
      people_edit_sub: false,
      eq_edit_all: false,
      eq_status_all: false,
      eq_records_all: false,
      eq_incharge_edit: false,
      lims_submit: false,
      lims_coa_issue: false,
      eln_confidential_bypass: false,
      billing_manage: false,
      billing_erp_sync: false,
    },
  },
];

const NAV_MODULES = [
  { id: 'profile', label: '个人档案', icon: UserCheck },
  { id: 'equipments', label: '仪器目录', icon: Cpu },
  { id: 'samples', label: '测样报告审核', icon: FlaskConical },
  { id: 'consumables', label: '耗材管理', icon: Boxes },
  { id: 'labs', label: '课题组', icon: Building2 },
  { id: 'people', label: '成员目录', icon: Users },
  { id: 'billing', label: '财务中心', icon: Landmark },
  { id: 'eln', label: '成果与记录', icon: FileText },
  { id: 'entrance', label: '门禁管理', icon: Radio },
  { id: 'roles', label: '权限管理', icon: ShieldCheck },
];

function readInitialSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return { isAuthenticated: false, operatorId: 1, projectId: 1 };
    const parsed = JSON.parse(raw);
    return {
      isAuthenticated: Boolean(parsed?.isAuthenticated),
      operatorId: Number(parsed?.operatorId) || 1,
      projectId: Number(parsed?.projectId) || 1,
    };
  } catch {
    return { isAuthenticated: false, operatorId: 1, projectId: 1 };
  }
}

export default function App() {
  const initialSession = useMemo(() => readInitialSession(), []);

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
  const [wsStatus, setWsStatus] = useState('connecting');
  const [notice, setNotice] = useState({ type: '', text: '' });
  const [confirmState, setConfirmState] = useState({
    open: false,
    title: '',
    description: '',
    confirmLabel: '确认',
    tone: 'danger',
    onConfirm: null,
  });

  // 初始进入状态：默认进入现代化认证门户（保留 sessionStorage 刷新态）
  const [isAuthenticated, setIsAuthenticated] = useState(initialSession.isAuthenticated);
  const [operatorId, setOperatorId] = useState(initialSession.operatorId);
  const [projectId, setProjectId] = useState(initialSession.projectId);

  const [loginForm, setLoginForm] = useState({ username: 'admin', password: '123456' });
  const [registerForm, setRegisterForm] = useState({
    username: '',
    password: '123456',
    full_name: '',
    email: '',
    home_dept_id: 1,
    sub_group_name: '综合实验中心',
    system_role: 'STAFF',
    rfid_card_id: '',
    join_project_id: 1,
  });

  const [sidebarMode, setSidebarMode] = useState('list');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeModule, setActiveModule] = useState('profile');

  // 模块内部状态
  const [profileUserId, setProfileUserId] = useState(initialSession.operatorId);
  const [profilePrimaryTab, setProfilePrimaryTab] = useState('follow');

  const [eqPrimaryTab, setEqPrimaryTab] = useState('list');
  const [eqSecondaryTab, setEqSecondaryTab] = useState('all');
  const [selectedDeviceId, setSelectedDeviceId] = useState(null);
  const [eqDetailTab, setEqDetailTab] = useState('dashboard');
  const [eqSearchKeyword, setEqSearchKeyword] = useState('');
  const [eqSearchDeptId, setEqSearchDeptId] = useState('0');

  const [samplePrimaryTab, setSamplePrimaryTab] = useState('list');
  const [consPrimaryTab, setConsPrimaryTab] = useState('list');

  const [labsPrimaryTab, setLabsPrimaryTab] = useState('list');
  const [selectedLabProjectId, setSelectedLabProjectId] = useState(initialSession.projectId);
  const [labDetailTab, setLabDetailTab] = useState('members');

  const [peoplePrimaryTab, setPeoplePrimaryTab] = useState('list');
  const [peopleSecondaryTab, setPeopleSecondaryTab] = useState('all');
  const [peopleOrgFilterDeptId, setPeopleOrgFilterDeptId] = useState(0);
  const [peopleSearchName, setPeopleSearchName] = useState('');

  const [billingPrimaryTab, setBillingPrimaryTab] = useState('accounts');
  const [elnPrimaryTab, setElnPrimaryTab] = useState('list');
  const [entranceTab, setEntranceTab] = useState('rfid');

  const [rolesPrimaryTab, setRolesPrimaryTab] = useState('list');
  const [rolesConfig, setRolesConfig] = useState(INITIAL_ROLES_CONFIG);
  const [editingRoleId, setEditingRoleId] = useState('ADMIN');

  // 业务表单状态
  const [memberForm, setMemberForm] = useState({
    target_user_id: 4,
    project_role: 'RESEARCHER',
    spending_limit: '8000.0000',
  });
  const [orgNodeForm, setOrgNodeForm] = useState({
    code: 'LAB-WOOD-01',
    name: '复合材料与微纳表征室',
    parent_id: 1,
    level_type: 'LAB_GROUP',
    manager_name: '张教授',
  });
  const [roleUpdateForm, setRoleUpdateForm] = useState({
    target_user_id: 4,
    system_role: 'STAFF',
    status: 'ACTIVE',
    sub_group_name: '纳米递送载体课题组',
  });
  const [resForm, setResForm] = useState({
    device_id: 1,
    hours_from_now: 1,
    duration_hours: 2,
  });
  const [checkoutHoursMap, setCheckoutHoursMap] = useState({});
  const [sampleForm, setSampleForm] = useState({
    name: '高纯纳米纤维素复合样 #B2',
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
  const [coaJsonText, setCoaJsonText] = useState(
    '{"纯度_percent": 99.4, "粒径均值_nm": 65.2, "结论": "合格"}'
  );
  const [elnForm, setElnForm] = useState({
    title: 'EXP-2026-002: 微纳载体表面修饰条件测定',
    markdown_content: '1. 样品预处理与流道清洗；\n2. 恒温反应参数记录与质谱送样对标。',
    conditions_text: '{"temp_c": 37.0, "stir_rpm": 600, "solvent": "PBS 7.4"}',
    linked_reservation_id: '',
    linked_sample_id: '',
  });

  const [editingDeviceId, setEditingDeviceId] = useState(null);
  const [deviceForm, setDeviceForm] = useState({
    code: 'XRD-03',
    name: '高分辨X射线衍射仪',
    owner_dept_id: 1,
    pos_x: 65,
    pos_y: 35,
    status: 'IDLE',
    standby_current_threshold: '1.5000',
    internal_hourly_rate: '100.0000',
    external_hourly_rate: '240.0000',
  });

  const [editingConsumableId, setEditingConsumableId] = useState(null);
  const [consumableForm, setConsumableForm] = useState({
    code: 'CONS-STD-01',
    name: '色谱级甲醇标准试剂',
    spec: '4L / 瓶',
    owner_dept_id: 3,
    stock_qty: '30.0000',
    safety_threshold: '8.0000',
    internal_unit_price: '120.0000',
    external_unit_price: '200.0000',
  });

  const [editingProjectId, setEditingProjectId] = useState(null);
  const [projectForm, setProjectForm] = useState({
    code: 'PRJ-2026-03',
    name: '新型木质素基功能复合材料研发课题',
    lead_dept_id: 1,
    pi_user_id: 2,
    initial_budget: '30000.0000',
    is_confidential: true,
  });

  const [editingDeptId, setEditingDeptId] = useState(null);
  const [editingUserId, setEditingUserId] = useState(null);
  const [userEditForm, setUserEditForm] = useState({
    full_name: '',
    email: '',
    rfid_card_id: '',
    home_dept_id: 1,
    sub_group_name: '',
    system_role: 'STAFF',
    status: 'ACTIVE',
  });
  const [editingElnId, setEditingElnId] = useState(null);

  // 硬件网关模拟器状态
  const [hwToken, setHwToken] = useState(DEFAULT_HW_TOKEN);
  const [simTelemetry, setSimTelemetry] = useState({
    device_code: 'CNC-01',
    rms_current_amps: '6.8500',
    power_state: 'RUNNING',
    operator_rfid: 'CARD_889203',
    project_code_override: 'PRJ-2026-01',
    seq_id: `ESP32_MSG_${Math.floor(100000 + Math.random() * 900000)}`,
  });
  const [simRfid, setSimRfid] = useState({
    device_code: 'CNC-01',
    rfid_card_id: 'CARD_889203',
    project_code: 'PRJ-2026-01',
    seq_id: `RFID_REQ_${Math.floor(100000 + Math.random() * 900000)}`,
  });
  const [simIngest, setSimIngest] = useState({
    barcode: 'SMP-20261018-NANO01',
    instrument_code: 'LCMS-01',
    operator_rfid: 'CARD_889204',
    raw_metrics_text:
      '{"峰面积比": 1.984, "信噪比_SNR": 420.5, "检出限_ng_mL": 0.05, "判定": "PASS"}',
    seq_id: `AGENT_COA_${Math.floor(100000 + Math.random() * 900000)}`,
  });
  const [simErp, setSimErp] = useState({
    project_code: 'PRJ-2026-01',
    amount: '15000.0000',
    erp_voucher_no: 'ERP-2026-VOUCHER-889',
    operator_username: 'pi_zhang',
  });
  const [simResponseLog, setSimResponseLog] = useState('');

  // 同步会话态到 sessionStorage
  useEffect(() => {
    try {
      if (isAuthenticated) {
        sessionStorage.setItem(
          SESSION_KEY,
          JSON.stringify({ isAuthenticated: true, operatorId, projectId })
        );
      } else {
        sessionStorage.removeItem(SESSION_KEY);
      }
    } catch {
      // 忽略无痕模式下的存储受限
    }
  }, [isAuthenticated, operatorId, projectId]);

  // 动态页面标题（WCAG 2.4.2）
  useEffect(() => {
    if (!isAuthenticated) {
      document.title = '登录 | UniLab-OS 大型仪器共享与综合实验室管理系统';
      return;
    }
    const mod = NAV_MODULES.find((m) => m.id === activeModule);
    document.title = `${mod?.label || '工作台'} | UniLab-OS 大型仪器共享与综合实验室管理系统`;
  }, [isAuthenticated, activeModule]);

  const fetchBootstrap = useCallback(
    async (opId = operatorId, prjId = projectId) => {
      setLoading(true);
      try {
        const json = await apiGet(
          `/api/v1/bootstrap?operator_user_id=${opId}&project_id=${prjId}`
        );
        setData(json);
      } catch (err) {
        setNotice({ type: 'error', text: err.message });
      } finally {
        setLoading(false);
      }
    },
    [operatorId, projectId]
  );

  useEffect(() => {
    fetchBootstrap(operatorId, projectId);
  }, [fetchBootstrap, operatorId, projectId]);

  // WebSocket 实时设备遥测与状态广播同步
  useLabWebSocket(
    isAuthenticated,
    useCallback((devicesUpdate) => {
      setData((prev) => ({
        ...prev,
        devices: prev.devices.map((d) => {
          const hit = devicesUpdate.find((u) => u.id === d.id || u.code === d.code);
          return hit ? { ...d, ...hit } : d;
        }),
      }));
    }, []),
    setWsStatus
  );

  const currentOperator = useMemo(
    () => data.users.find((u) => u.id === Number(operatorId)),
    [data.users, operatorId]
  );
  const profileUser = useMemo(
    () => data.users.find((u) => u.id === Number(profileUserId)) || currentOperator,
    [data.users, profileUserId, currentOperator]
  );
  const currentProject = useMemo(
    () => data.projects.find((p) => p.id === Number(projectId)),
    [data.projects, projectId]
  );
  const selectedLabProject = useMemo(
    () => data.projects.find((p) => p.id === Number(selectedLabProjectId)) || currentProject,
    [data.projects, selectedLabProjectId, currentProject]
  );
  const selectedDevice = useMemo(
    () => data.devices.find((d) => d.id === Number(selectedDeviceId)) || data.devices[0],
    [data.devices, selectedDeviceId]
  );

  // 打开通用确认弹窗
  const requestConfirm = ({ title, description, confirmLabel, tone = 'danger', onConfirm }) => {
    setConfirmState({ open: true, title, description, confirmLabel, tone, onConfirm });
  };

  const roleCnLabel = (role) => {
    switch (role) {
      case 'ADMIN':
        return '平台负责人/超级管理员, 所内职工, 目前成员';
      case 'DEPT_HEAD':
        return '科室主任, 仪器负责人, 所内职工, 目前成员';
      case 'PI':
        return '课题组负责人(PI), 所内职工, 目前成员, 教师';
      case 'OBSERVER':
        return '只读观察员, 外部协作成员';
      default:
        return '仪器负责人, 所内职工, 目前成员, 科研人员';
    }
  };

  const openUserProfile = (uid) => {
    setProfileUserId(uid);
    setActiveModule('profile');
    setDrawerOpen(false);
  };

  const openDeviceDetail = (devId, subTab = 'dashboard') => {
    setSelectedDeviceId(devId);
    setResForm((prev) => ({ ...prev, device_id: devId }));
    setEqPrimaryTab('detail');
    setEqDetailTab(subTab);
    setActiveModule('equipments');
    setDrawerOpen(false);
  };

  const openLabDetail = (prjId, subTab = 'members') => {
    setSelectedLabProjectId(prjId);
    setLabsPrimaryTab('detail');
    setLabDetailTab(subTab);
    setActiveModule('labs');
    setDrawerOpen(false);
  };

  // ==================== 登录 / 注册 ====================
  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await apiPost('/api/v1/auth/login', loginForm);
      setOperatorId(res.user.id);
      setProfileUserId(res.user.id);
      if (res.default_project_id) setProjectId(res.default_project_id);
      setIsAuthenticated(true);
      setNotice({ type: 'success', text: `欢迎登录：${res.user.full_name}` });
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    }
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await apiPost('/api/v1/auth/register', {
        ...registerForm,
        home_dept_id: Number(registerForm.home_dept_id),
        join_project_id: registerForm.join_project_id ? Number(registerForm.join_project_id) : null,
      });
      await fetchBootstrap(res.user.id, res.default_project_id || 1);
      setOperatorId(res.user.id);
      setProfileUserId(res.user.id);
      setIsAuthenticated(true);
      setPeoplePrimaryTab('list');
      setNotice({ type: 'success', text: `成员【${res.user.full_name}】注册成功` });
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    }
  };

  const handleSaveOrgNode = async (e) => {
    e.preventDefault();
    try {
      if (editingDeptId) {
        const res = await apiPut(`/api/v1/org/departments/${editingDeptId}`, {
          operator_user_id: Number(operatorId),
          code: orgNodeForm.code,
          name: orgNodeForm.name,
          manager_name: orgNodeForm.manager_name,
        });
        setNotice({ type: 'success', text: `组织机构【${res.name}】修改已保存` });
        setEditingDeptId(null);
      } else {
        const res = await apiPost('/api/v1/org/departments', {
          operator_user_id: Number(operatorId),
          code: orgNodeForm.code,
          name: orgNodeForm.name,
          parent_id: orgNodeForm.parent_id ? Number(orgNodeForm.parent_id) : null,
          level_type: orgNodeForm.level_type,
          manager_name: orgNodeForm.manager_name,
        });
        setNotice({ type: 'success', text: `组织机构【${res.name}】创建成功` });
      }
      setLabsPrimaryTab('org_list');
      fetchBootstrap();
      if (!isAuthenticated) setIsAuthenticated(true);
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    }
  };

  // ==================== 业务增删改查处理器 ====================
  const handleSaveDevice = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        operator_user_id: Number(operatorId),
        code: deviceForm.code,
        name: deviceForm.name,
        owner_dept_id: Number(deviceForm.owner_dept_id),
        pos_x: Number(deviceForm.pos_x),
        pos_y: Number(deviceForm.pos_y),
        status: deviceForm.status,
        standby_current_threshold: deviceForm.standby_current_threshold,
        internal_hourly_rate: deviceForm.internal_hourly_rate,
        external_hourly_rate: deviceForm.external_hourly_rate,
      };
      if (editingDeviceId) {
        const res = await apiPut(`/api/v1/fms/devices/${editingDeviceId}`, payload);
        setNotice({ type: 'success', text: `仪器【${res.name}】修改已保存` });
      } else {
        const res = await apiPost('/api/v1/fms/devices', payload);
        setNotice({ type: 'success', text: `新增仪器【${res.name}】成功` });
      }
      setEditingDeviceId(null);
      setEqPrimaryTab('list');
      fetchBootstrap();
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    }
  };

  const requestDeleteDevice = (dev) => {
    requestConfirm({
      title: `确认删除/报废仪器【${dev.name}】？`,
      description: `资产编号 ${dev.code} 将从当前台账中移除（存在未完结预约时后台会自动保护阻断）。`,
      confirmLabel: '确认删除仪器',
      onConfirm: async () => {
        try {
          await apiDelete(`/api/v1/fms/devices/${dev.id}?operator_user_id=${operatorId}`);
          setNotice({ type: 'success', text: `仪器【${dev.name}】已删除/报废` });
          if (selectedDeviceId === dev.id) setEqPrimaryTab('list');
          fetchBootstrap();
        } catch (err) {
          setNotice({ type: 'error', text: err.message });
        }
      },
    });
  };

  const requestCancelOrDeleteReservation = (resObj) => {
    const isCancel = resObj.status === 'RESERVED';
    requestConfirm({
      title: isCancel ? `确认取消预约单 #${resObj.id}？` : `确认删除机时记录 #${resObj.id}？`,
      description: isCancel
        ? `取消后将自动释放预授权冻结款 ¥${resObj.hold_amount} 并原路退回项目可用余额与个人配额。`
        : `删除后该条机时历史记录将从列表移除，此操作不可撤销。`,
      confirmLabel: isCancel ? '确认取消并退费' : '确认删除',
      onConfirm: async () => {
        try {
          await apiDelete(`/api/v1/fms/reservations/${resObj.id}?operator_user_id=${operatorId}`);
          setNotice({
            type: 'success',
            text: isCancel
              ? `已取消预约单 #${resObj.id}，预授权冻结款 ¥${resObj.hold_amount} 已原路解冻退回`
              : `已删除机时记录 #${resObj.id}`,
          });
          fetchBootstrap();
        } catch (err) {
          setNotice({ type: 'error', text: err.message });
        }
      },
    });
  };

  const handleSaveConsumable = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        operator_user_id: Number(operatorId),
        code: consumableForm.code,
        name: consumableForm.name,
        spec: consumableForm.spec,
        owner_dept_id: Number(consumableForm.owner_dept_id),
        stock_qty: consumableForm.stock_qty,
        safety_threshold: consumableForm.safety_threshold,
        internal_unit_price: consumableForm.internal_unit_price,
        external_unit_price: consumableForm.external_unit_price,
      };
      if (editingConsumableId) {
        await apiPut(`/api/v1/lims/consumables/${editingConsumableId}`, payload);
        setNotice({ type: 'success', text: `耗材【${consumableForm.name}】修改/补货已保存` });
      } else {
        await apiPost('/api/v1/lims/consumables', payload);
        setNotice({ type: 'success', text: `新增耗材【${consumableForm.name}】成功` });
      }
      setEditingConsumableId(null);
      setConsPrimaryTab('list');
      fetchBootstrap();
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    }
  };

  const requestDeleteConsumable = (c) => {
    requestConfirm({
      title: `确认删除耗材【${c.name}】？`,
      description: `编码 ${c.code}（当前库存 ${c.stock_qty}）将被移除，操作不可恢复。`,
      confirmLabel: '确认删除耗材',
      onConfirm: async () => {
        try {
          await apiDelete(`/api/v1/lims/consumables/${c.id}?operator_user_id=${operatorId}`);
          setNotice({ type: 'success', text: `耗材【${c.name}】已删除` });
          fetchBootstrap();
        } catch (err) {
          setNotice({ type: 'error', text: err.message });
        }
      },
    });
  };

  const requestDeleteSample = (smp) => {
    const isRecall = smp.status === 'REGISTERED';
    requestConfirm({
      title: isRecall ? `确认撤回待检样品 ${smp.barcode}？` : `确认删除样品记录 ${smp.barcode}？`,
      description: isRecall
        ? `撤回后检测费 ¥${smp.total_test_fee} 将原路退还给付款项目与个人配额。`
        : `样品【${smp.name}】的历史检测记录将被删除，此操作不可撤销。`,
      confirmLabel: isRecall ? '确认撤回并退费' : '确认删除',
      onConfirm: async () => {
        try {
          await apiDelete(`/api/v1/lims/samples/${smp.id}?operator_user_id=${operatorId}`);
          setNotice({
            type: 'success',
            text: isRecall
              ? `已撤回待检样品 ${smp.barcode}，检测费 ¥${smp.total_test_fee} 已退回项目余额`
              : `已删除样品记录 ${smp.barcode}`,
          });
          fetchBootstrap();
        } catch (err) {
          setNotice({ type: 'error', text: err.message });
        }
      },
    });
  };

  const handleSaveProject = async (e) => {
    e.preventDefault();
    try {
      if (editingProjectId) {
        await apiPut(`/api/v1/org/projects/${editingProjectId}`, {
          operator_user_id: Number(operatorId),
          code: projectForm.code,
          name: projectForm.name,
          lead_dept_id: Number(projectForm.lead_dept_id),
          pi_user_id: Number(projectForm.pi_user_id),
          is_confidential: Boolean(projectForm.is_confidential),
        });
        setNotice({ type: 'success', text: `课题组项目【${projectForm.name}】已更新` });
      } else {
        await apiPost('/api/v1/org/projects', {
          operator_user_id: Number(operatorId),
          code: projectForm.code,
          name: projectForm.name,
          lead_dept_id: Number(projectForm.lead_dept_id),
          pi_user_id: Number(projectForm.pi_user_id),
          initial_budget: projectForm.initial_budget,
          is_confidential: Boolean(projectForm.is_confidential),
        });
        setNotice({ type: 'success', text: `新课题组项目【${projectForm.name}】创建成功` });
      }
      setEditingProjectId(null);
      setLabsPrimaryTab('list');
      fetchBootstrap();
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    }
  };

  const requestDeleteProject = (prj) => {
    requestConfirm({
      title: `确认删除课题组项目【${prj.name}】？`,
      description: `项目编号 ${prj.code} 将被删除（存在未结算预约时系统会自动拦截保护）。`,
      confirmLabel: '确认删除项目',
      onConfirm: async () => {
        try {
          await apiDelete(`/api/v1/org/projects/${prj.id}?operator_user_id=${operatorId}`);
          setNotice({ type: 'success', text: `课题组项目【${prj.name}】已删除` });
          if (projectId === prj.id && data.projects.length > 1) {
            const nextPrj = data.projects.find((p) => p.id !== prj.id);
            if (nextPrj) setProjectId(nextPrj.id);
          }
          setLabsPrimaryTab('list');
          fetchBootstrap();
        } catch (err) {
          setNotice({ type: 'error', text: err.message });
        }
      },
    });
  };

  const requestRemoveProjectMember = (pm) => {
    requestConfirm({
      title: `确认移出项目成员【${pm.user_name}】？`,
      description: `移出后该成员将不再能使用该项目经费发起预约、送样或查阅该项目保密数据。`,
      confirmLabel: '确认移出',
      onConfirm: async () => {
        try {
          await apiDelete(`/api/v1/org/project-members/${pm.id}?operator_user_id=${operatorId}`);
          setNotice({ type: 'success', text: `已将成员【${pm.user_name}】移出项目` });
          fetchBootstrap();
        } catch (err) {
          setNotice({ type: 'error', text: err.message });
        }
      },
    });
  };

  const requestDeleteDepartment = (dept) => {
    requestConfirm({
      title: `确认删除组织机构【${dept.name}】？`,
      description: `机构编码 ${dept.code} 将被删除（若下属仍挂载人员、设备或项目，后台会自动阻断）。`,
      confirmLabel: '确认删除机构',
      onConfirm: async () => {
        try {
          await apiDelete(`/api/v1/org/departments/${dept.id}?operator_user_id=${operatorId}`);
          setNotice({ type: 'success', text: `组织机构【${dept.name}】已删除` });
          fetchBootstrap();
        } catch (err) {
          setNotice({ type: 'error', text: err.message });
        }
      },
    });
  };

  const handleSaveUserEdit = async (e) => {
    e.preventDefault();
    try {
      const res = await apiPut(`/api/v1/org/users/${editingUserId}`, {
        operator_user_id: Number(operatorId),
        ...userEditForm,
        home_dept_id: Number(userEditForm.home_dept_id),
      });
      setNotice({ type: 'success', text: `成员【${res.full_name}】资料与权限已更新` });
      setEditingUserId(null);
      setPeoplePrimaryTab('list');
      fetchBootstrap();
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    }
  };

  const requestDeleteUser = (u) => {
    requestConfirm({
      title: `确认删除成员【${u.full_name}】？`,
      description: `账号 ${u.username} 将被删除，请确保已妥善交接名下仪器或项目权限。`,
      confirmLabel: '确认删除成员',
      onConfirm: async () => {
        try {
          await apiDelete(`/api/v1/org/users/${u.id}?operator_user_id=${operatorId}`);
          setNotice({ type: 'success', text: `成员【${u.full_name}】已删除` });
          if (profileUserId === u.id) setProfileUserId(operatorId);
          setActiveModule('people');
          fetchBootstrap();
        } catch (err) {
          setNotice({ type: 'error', text: err.message });
        }
      },
    });
  };

  const handleUpdateUserRole = async (e) => {
    e.preventDefault();
    try {
      const res = await apiPost('/api/v1/org/users/role', {
        operator_user_id: Number(operatorId),
        target_user_id: Number(roleUpdateForm.target_user_id),
        system_role: roleUpdateForm.system_role,
        status: roleUpdateForm.status,
        sub_group_name: roleUpdateForm.sub_group_name,
      });
      setNotice({ type: 'success', text: `已更新【${res.full_name}】角色为 ${res.system_role}` });
      fetchBootstrap();
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    }
  };

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
      setNotice({
        type: 'success',
        text: `成员配额已保存（角色: ${res.project_role}, 限额: ¥${res.spending_limit}）`,
      });
      fetchBootstrap();
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
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
      setNotice({
        type: 'success',
        text: `预约成功 (#${res.reservation_id})，费率 [${res.rate_type}] ¥${res.applied_rate}/h，已冻结 ¥${res.hold_amount}`,
      });
      fetchBootstrap();
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    }
  };

  const handleCheckin = async (reservationId) => {
    try {
      const res = await apiPost(`/api/v1/fms/reservations/${reservationId}/checkin`, {
        operator_user_id: Number(operatorId),
        project_id: Number(projectId),
        checkin_method: 'WEB_MANUAL',
      });
      setNotice({ type: 'success', text: `预约单 #${res.reservation_id} 已上机签到` });
      fetchBootstrap();
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
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
      setNotice({
        type: 'success',
        text: `下机结算完成 (#${res.reservation_id})：实扣 ¥${res.settled_amount}，退回冻结 ¥${res.refunded_hold}`,
      });
      fetchBootstrap();
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
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
      setNotice({
        type: 'success',
        text: `送样登记成功（条码: ${res.barcode}，实扣检测费 ¥${res.total_test_fee}）`,
      });
      fetchBootstrap();
      setSamplePrimaryTab('list');
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    }
  };

  const handleUpdateCOA = async (e) => {
    e.preventDefault();
    if (!coaSampleId) {
      setNotice({ type: 'error', text: '请选择样品' });
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
      setNotice({ type: 'success', text: `样品 ${res.barcode} 测样报告已签发` });
      fetchBootstrap();
      setSamplePrimaryTab('list');
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
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
      setNotice({
        type: 'success',
        text: `领用成功（单价 ¥${res.unit_price}，实扣 ¥${res.total_cost}，剩余库存 ${res.remaining_stock}）`,
      });
      fetchBootstrap();
      setConsPrimaryTab('list');
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    }
  };

  const handleSaveELN = async (e) => {
    e.preventDefault();
    try {
      const parsedCond = JSON.parse(elnForm.conditions_text || '{}');
      if (editingElnId) {
        const res = await apiPut(`/api/v1/eln/records/${editingElnId}`, {
          operator_user_id: Number(operatorId),
          title: elnForm.title,
          markdown_content: elnForm.markdown_content,
          conditions: parsedCond,
          linked_reservation_id: elnForm.linked_reservation_id
            ? Number(elnForm.linked_reservation_id)
            : null,
          linked_sample_id: elnForm.linked_sample_id ? Number(elnForm.linked_sample_id) : null,
        });
        setNotice({ type: 'success', text: `实验记录 #${res.eln_id} 修改已保存` });
        setEditingElnId(null);
      } else {
        const res = await apiPost('/api/v1/eln/records', {
          operator_user_id: Number(operatorId),
          project_id: Number(projectId),
          title: elnForm.title,
          markdown_content: elnForm.markdown_content,
          conditions: parsedCond,
          linked_reservation_id: elnForm.linked_reservation_id
            ? Number(elnForm.linked_reservation_id)
            : null,
          linked_sample_id: elnForm.linked_sample_id ? Number(elnForm.linked_sample_id) : null,
        });
        setNotice({ type: 'success', text: `实验记录 #${res.eln_id} 已保存` });
      }
      fetchBootstrap();
      setElnPrimaryTab('list');
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    }
  };

  const handleLockELN = async (elnId) => {
    try {
      const res = await apiPost(`/api/v1/eln/records/${elnId}/lock`, {
        operator_user_id: Number(operatorId),
        project_id: Number(projectId),
      });
      setNotice({ type: 'success', text: `实验记录 #${res.eln_id} 已签名锁定` });
      fetchBootstrap();
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    }
  };

  const handleUnlockELN = async (elnId) => {
    try {
      await apiPost(`/api/v1/eln/records/${elnId}/unlock`, {
        operator_user_id: Number(operatorId),
        project_id: Number(projectId),
      });
      setNotice({ type: 'success', text: `实验记录 #${elnId} 已由PI/管理员解锁，可重新编辑` });
      fetchBootstrap();
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    }
  };

  const requestDeleteELN = (eln) => {
    requestConfirm({
      title: `确认删除实验记录 #${eln.id}？`,
      description: `标题「${eln.title}」将从 ELN 记录本永久移除。`,
      confirmLabel: '确认删除记录',
      onConfirm: async () => {
        try {
          await apiDelete(`/api/v1/eln/records/${eln.id}?operator_user_id=${operatorId}`);
          setNotice({ type: 'success', text: `实验记录 #${eln.id} 已删除` });
          fetchBootstrap();
        } catch (err) {
          setNotice({ type: 'error', text: err.message });
        }
      },
    });
  };

  // ==================== 硬件与 ERP 网关调用 ====================
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
      setSimResponseLog(JSON.stringify(res, null, 2));
      setNotice({
        type: 'success',
        text: `设备 ${res.device_code} 状态更新为 ${res.computed_status}${
          res.idempotent_replay ? '（幂等重放）' : ''
        }`,
      });
      fetchBootstrap();
    } catch (err) {
      setSimResponseLog(`ERROR: ${err.message}`);
      setNotice({ type: 'error', text: err.message });
    }
  };

  const triggerSimRfid = async () => {
    try {
      const res = await apiPost('/api/v1/ext/access/rfid-verify', simRfid, {
        'X-Lab-Hardware-Token': hwToken,
      });
      setSimResponseLog(JSON.stringify(res, null, 2));
      setNotice({ type: res.authorized ? 'success' : 'error', text: res.reason });
      fetchBootstrap();
    } catch (err) {
      setSimResponseLog(`ERROR: ${err.message}`);
      setNotice({ type: 'error', text: err.message });
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
      setSimResponseLog(JSON.stringify(res, null, 2));
      setNotice({ type: 'success', text: `样品 ${res.barcode} 数据已入库` });
      fetchBootstrap();
    } catch (err) {
      setSimResponseLog(`ERROR: ${err.message}`);
      setNotice({ type: 'error', text: err.message });
    }
  };

  const triggerSimErpDeposit = async () => {
    try {
      const res = await apiPost('/api/v1/ext/erp/grant-deposit', simErp, {
        'X-Lab-Hardware-Token': hwToken,
      });
      setSimResponseLog(JSON.stringify(res, null, 2));
      setNotice({
        type: 'success',
        text: `项目 ${res.project_code} 拨款入账完成，可用余额 ¥${res.available_balance}`,
      });
      fetchBootstrap();
    } catch (err) {
      setSimResponseLog(`ERROR: ${err.message}`);
      setNotice({ type: 'error', text: err.message });
    }
  };

  const toggleRolePerm = (permKey) => {
    setRolesConfig((prev) =>
      prev.map((r) =>
        r.id === editingRoleId ? { ...r, perms: { ...r.perms, [permKey]: !r.perms[permKey] } } : r
      )
    );
  };

  // ==================== 侧边栏复用内容 ====================
  const renderSidebarContent = () => (
    <div className="space-y-3">
      {/* 1. 当前登录用户卡片 */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 flex items-start gap-2.5 shadow-sm">
        <button
          type="button"
          aria-label="打开我的个人档案"
          onClick={() => openUserProfile(operatorId)}
          className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-sm hover:opacity-90"
        >
          {currentOperator?.full_name?.slice(0, 1) || 'U'}
        </button>
        <div className="min-w-0 flex-1 leading-tight">
          <button
            type="button"
            onClick={() => openUserProfile(operatorId)}
            className="font-bold text-xs text-slate-900 hover:text-blue-700 truncate block"
          >
            {currentOperator?.full_name || '加载中...'}
          </button>
          <button
            type="button"
            onClick={() => {
              setLabsPrimaryTab('my_lab');
              setActiveModule('labs');
              setDrawerOpen(false);
            }}
            className="text-[11px] text-blue-700 hover:underline truncate block mt-0.5"
          >
            {currentOperator?.home_dept_name}
          </button>
          <span className="text-[10px] text-slate-500 block mt-0.5 truncate">
            {currentOperator?.sub_group_name || '综合实验中心'}
          </span>
        </div>
      </div>

      {/* 2. 模块导航菜单 */}
      <div className="bg-white border border-slate-200 rounded-xl p-2.5 space-y-2 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 pb-1.5 px-1">
          <span className="text-[11px] font-semibold text-slate-500">功能菜单</span>
          <div className="flex items-center gap-1" role="group" aria-label="菜单视图模式">
            <button
              type="button"
              aria-pressed={sidebarMode === 'icon'}
              aria-label="图标网格模式"
              onClick={() => setSidebarMode('icon')}
              className={`p-1 rounded-md transition ${
                sidebarMode === 'icon'
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-slate-400 hover:text-slate-700'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-pressed={sidebarMode === 'list'}
              aria-label="列表模式"
              onClick={() => setSidebarMode('list')}
              className={`p-1 rounded-md transition ${
                sidebarMode === 'list'
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-slate-400 hover:text-slate-700'
              }`}
            >
              <List className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>

        <nav aria-label="系统主模块">
          {sidebarMode === 'list' ? (
            <ul className="space-y-0.5">
              {NAV_MODULES.map((m) => {
                const Icon = m.icon;
                const active = activeModule === m.id;
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      aria-current={active ? 'page' : undefined}
                      onClick={() => {
                        setActiveModule(m.id);
                        setDrawerOpen(false);
                      }}
                      className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs transition ${
                        active
                          ? 'bg-blue-600 text-white font-semibold shadow-sm'
                          : 'text-slate-700 hover:bg-blue-50 hover:text-blue-700'
                      }`}
                    >
                      <Icon
                        className={`w-3.5 h-3.5 shrink-0 ${active ? 'text-white' : 'text-blue-600'}`}
                        aria-hidden="true"
                      />
                      <span className="truncate">{m.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <ul className="grid grid-cols-2 gap-1.5 pt-0.5">
              {NAV_MODULES.map((m) => {
                const Icon = m.icon;
                const active = activeModule === m.id;
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      aria-current={active ? 'page' : undefined}
                      onClick={() => {
                        setActiveModule(m.id);
                        setDrawerOpen(false);
                      }}
                      className={`w-full flex flex-col items-center justify-center p-2 rounded-lg border text-center transition ${
                        active
                          ? 'bg-blue-600 text-white border-blue-600 font-semibold shadow-sm'
                          : 'bg-slate-50/70 text-slate-700 border-slate-200 hover:bg-blue-50'
                      }`}
                    >
                      <Icon
                        className={`w-4 h-4 mb-1 ${active ? 'text-white' : 'text-blue-600'}`}
                        aria-hidden="true"
                      />
                      <span className="text-[11px] truncate w-full">{m.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </nav>
      </div>

      {/* 3. 当前项目财务余额卡片 */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-1.5 text-[11px] shadow-sm">
        <div className="font-bold text-slate-900 truncate">
          {currentProject?.code} · {currentOperator?.home_dept_name}
        </div>
        <div className="flex items-center justify-between text-slate-600">
          <span>可用余额:</span>
          <strong className="text-emerald-700 font-mono tabular-nums">
            ¥{currentProject?.available_balance || '0.0000'}
          </strong>
        </div>
        <div className="flex items-center justify-between text-slate-500">
          <span>预约冻结:</span>
          <strong className="text-amber-600 font-mono tabular-nums">
            ¥{currentProject?.frozen_balance || '0.0000'}
          </strong>
        </div>
      </div>

      {/* 4. 快捷入口 */}
      <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100 text-[11px] overflow-hidden shadow-sm">
        {[
          {
            label: '您负责仪器的使用记录',
            action: () => {
              setActiveModule('equipments');
              setEqPrimaryTab('records');
            },
          },
          {
            label: '所有仪器的预约情况',
            action: () => {
              setActiveModule('equipments');
              setEqPrimaryTab('reserv');
            },
          },
          {
            label: '实验室 2D 平面监控',
            action: () => {
              setActiveModule('equipments');
              setEqPrimaryTab('map');
            },
          },
          {
            label: '全平台财务收支明细',
            action: () => {
              setActiveModule('billing');
              setBillingPrimaryTab('transactions');
            },
          },
          {
            label: '所有仪器的送样情况',
            action: () => {
              setActiveModule('samples');
              setSamplePrimaryTab('list');
            },
          },
        ].map((sc) => (
          <button
            key={sc.label}
            type="button"
            onClick={() => {
              sc.action();
              setDrawerOpen(false);
            }}
            className="w-full text-left px-3 py-2 text-blue-700 hover:bg-blue-50 hover:underline block truncate transition"
          >
            {sc.label}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <>
      {/* 无障碍跳过导航链接 */}
      <a href="#main-content" className="skip-link visually-hidden no-print">
        跳转到主内容区
      </a>

      {/* 顶层悬浮通知 */}
      <ToastRegion notice={notice} onClose={() => setNotice({ type: '', text: '' })} />

      {/* 原生模态确认框 */}
      <ConfirmDialog
        open={confirmState.open}
        title={confirmState.title}
        description={confirmState.description}
        confirmLabel={confirmState.confirmLabel}
        tone={confirmState.tone}
        onConfirm={() => {
          const fn = confirmState.onConfirm;
          setConfirmState((prev) => ({ ...prev, open: false, onConfirm: null }));
          fn?.();
        }}
        onCancel={() =>
          setConfirmState((prev) => ({ ...prev, open: false, onConfirm: null }))
        }
      />

      {!isAuthenticated ? (
        <AuthView
          users={data.users}
          departments={data.departments}
          projects={data.projects}
          loginForm={loginForm}
          setLoginForm={setLoginForm}
          registerForm={registerForm}
          setRegisterForm={setRegisterForm}
          orgNodeForm={orgNodeForm}
          setOrgNodeForm={setOrgNodeForm}
          onLoginSubmit={handleLoginSubmit}
          onRegisterSubmit={handleRegisterSubmit}
          onCreateOrgNode={handleSaveOrgNode}
          onQuickLoginUser={(u) => {
            setOperatorId(u.id);
            setProfileUserId(u.id);
            setIsAuthenticated(true);
            setNotice({ type: 'success', text: `已切换身份登录：${u.full_name}` });
          }}
          onEnterDemoDirectly={() => {
            setIsAuthenticated(true);
            setNotice({ type: 'info', text: '已直接进入 UniLab-OS 演示工作台' });
          }}
        />
      ) : (
        <div className="min-h-screen bg-[#f1f5f9] text-slate-900 flex flex-col text-xs">
          {/* 移动端侧栏抽屉 */}
          <ResponsiveDrawer
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            title="UniLab-OS 导航"
          >
            {renderSidebarContent()}
          </ResponsiveDrawer>

          {/* 顶部工作台导航栏 */}
          <header className="bg-gradient-to-r from-slate-900 via-blue-950 to-blue-900 text-white px-3 sm:px-5 h-12 flex items-center justify-between gap-2 shadow-md shrink-0 no-print">
            <div className="flex items-center gap-2 min-w-0">
              <button
                type="button"
                aria-label="打开导航菜单"
                aria-expanded={drawerOpen}
                onClick={() => setDrawerOpen(true)}
                className="lg:hidden p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white"
              >
                <Menu className="w-4 h-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => openUserProfile(operatorId)}
                className="flex items-center gap-2 font-bold text-sm tracking-wide hover:text-blue-200 transition truncate"
              >
                <Cpu className="w-4 h-4 text-blue-300 shrink-0" aria-hidden="true" />
                <span className="truncate">大型仪器共享与综合实验室管理系统</span>
              </button>
              <span className="hidden sm:inline-block text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-200 border border-blue-400/30 font-mono">
                UniLab-OS
              </span>
            </div>

            <div className="flex items-center gap-2 sm:gap-3 text-xs shrink-0">
              {/* WebSocket 实时状态指示 */}
              <span
                className={`hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] border ${
                  wsStatus === 'connected'
                    ? 'bg-emerald-500/15 border-emerald-400/30 text-emerald-200'
                    : 'bg-amber-500/15 border-amber-400/30 text-amber-200'
                }`}
              >
                {wsStatus === 'connected' ? (
                  <Wifi className="w-3 h-3" aria-hidden="true" />
                ) : (
                  <WifiOff className="w-3 h-3" aria-hidden="true" />
                )}
                <span>{wsStatus === 'connected' ? '实时同步' : '重连中'}</span>
              </span>

              {/* 结算项目切换 */}
              <div className="hidden md:flex items-center gap-1.5 bg-white/10 border border-white/15 rounded-lg px-2.5 py-1">
                <label htmlFor="header-project-select" className="text-blue-200 text-[11px]">
                  结算项目:
                </label>
                <select
                  id="header-project-select"
                  value={projectId}
                  onChange={(e) => setProjectId(Number(e.target.value))}
                  className="bg-transparent text-white font-medium text-[11px] cursor-pointer"
                >
                  {data.projects.map((p) => (
                    <option key={p.id} value={p.id} className="text-slate-900">
                      {p.code} (可用 ¥{p.available_balance})
                    </option>
                  ))}
                </select>
              </div>

              {/* 身份切换 */}
              <div className="flex items-center gap-1.5 bg-white/10 border border-white/15 rounded-lg px-2.5 py-1">
                <label htmlFor="header-operator-select" className="text-blue-200 text-[11px]">
                  身份:
                </label>
                <select
                  id="header-operator-select"
                  value={operatorId}
                  onChange={(e) => {
                    const uid = Number(e.target.value);
                    setOperatorId(uid);
                    setProfileUserId(uid);
                  }}
                  className="bg-transparent text-white font-medium text-[11px] cursor-pointer"
                >
                  {data.users.map((u) => (
                    <option key={u.id} value={u.id} className="text-slate-900">
                      {u.full_name} [{u.system_role}]
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={() => openUserProfile(operatorId)}
                className="hidden sm:inline text-blue-100 hover:text-white hover:underline"
              >
                我的档案
              </button>
              <button
                type="button"
                onClick={() => setActiveModule('roles')}
                className="hidden sm:inline text-blue-100 hover:text-white hover:underline"
              >
                系统设置
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsAuthenticated(false);
                  setNotice({ type: 'info', text: '您已安全登出工作台' });
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white transition"
              >
                <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">登出</span>
              </button>
            </div>
          </header>

          {/* 主体容器 */}
          <div className="flex-1 flex min-h-0">
            <aside className="hidden lg:flex w-60 bg-[#e8eef7] border-r border-slate-200 p-3 flex-col justify-between shrink-0 overflow-y-auto custom-scrollbar no-print">
              {renderSidebarContent()}
            </aside>

            <main
              id="main-content"
              tabIndex={-1}
              className="flex-1 bg-white p-4 sm:p-6 overflow-y-auto min-w-0 custom-scrollbar"
            >
              {loading && (
                <div
                  role="status"
                  className="mb-3 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-[11px] font-medium no-print"
                >
                  正在同步最新实验台账...
                </div>
              )}

              {activeModule === 'profile' && (
                <ProfileView
                  data={data}
                  currentOperator={currentOperator}
                  currentProject={currentProject}
                  profileUser={profileUser}
                  profilePrimaryTab={profilePrimaryTab}
                  setProfilePrimaryTab={setProfilePrimaryTab}
                  roleCnLabel={roleCnLabel}
                  onGoPeopleList={() => setActiveModule('people')}
                  onFilterPeopleByDept={(deptId) => {
                    setPeopleOrgFilterDeptId(deptId);
                    setActiveModule('people');
                  }}
                  onGoMyLab={() => {
                    setLabsPrimaryTab('my_lab');
                    setActiveModule('labs');
                  }}
                  onGoEditUser={(u) => {
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
                    setActiveModule('people');
                  }}
                  onGoConfigQuota={(uid) => {
                    setMemberForm((prev) => ({ ...prev, target_user_id: uid }));
                    setLabsPrimaryTab('add_member');
                    setActiveModule('labs');
                  }}
                  onRequestDeleteUser={requestDeleteUser}
                  onOpenDeviceDetail={openDeviceDetail}
                  onGoAddSampleForDevice={(dev) => {
                    setSampleForm((prev) => ({
                      ...prev,
                      target_dept_id: dev.owner_dept_id,
                      test_item_name: `${dev.name} 标准测试`,
                    }));
                    setSamplePrimaryTab('add');
                    setActiveModule('samples');
                  }}
                  onGoELN={() => setActiveModule('eln')}
                  onCheckin={handleCheckin}
                  onCheckout={handleCheckout}
                />
              )}

              {activeModule === 'equipments' && (
                <EquipmentsView
                  data={data}
                  currentOperator={currentOperator}
                  eqPrimaryTab={eqPrimaryTab}
                  setEqPrimaryTab={setEqPrimaryTab}
                  eqSecondaryTab={eqSecondaryTab}
                  setEqSecondaryTab={setEqSecondaryTab}
                  selectedDevice={selectedDevice}
                  eqDetailTab={eqDetailTab}
                  setEqDetailTab={setEqDetailTab}
                  eqSearchKeyword={eqSearchKeyword}
                  setEqSearchKeyword={setEqSearchKeyword}
                  eqSearchDeptId={eqSearchDeptId}
                  setEqSearchDeptId={setEqSearchDeptId}
                  editingDeviceId={editingDeviceId}
                  setEditingDeviceId={setEditingDeviceId}
                  deviceForm={deviceForm}
                  setDeviceForm={setDeviceForm}
                  resForm={resForm}
                  setResForm={setResForm}
                  checkoutHoursMap={checkoutHoursMap}
                  setCheckoutHoursMap={setCheckoutHoursMap}
                  onOpenDeviceDetail={openDeviceDetail}
                  onSaveDevice={handleSaveDevice}
                  onRequestDeleteDevice={requestDeleteDevice}
                  onCreateReservation={handleCreateReservation}
                  onCheckin={handleCheckin}
                  onCheckout={handleCheckout}
                  onRequestCancelOrDeleteReservation={requestCancelOrDeleteReservation}
                  onGoAddSampleForDevice={(dev) => {
                    setSampleForm((prev) => ({
                      ...prev,
                      target_dept_id: dev.owner_dept_id,
                      test_item_name: `${dev.name} 送样检测`,
                    }));
                    setSamplePrimaryTab('add');
                    setActiveModule('samples');
                  }}
                />
              )}

              {activeModule === 'samples' && (
                <SamplesView
                  data={data}
                  currentOperator={currentOperator}
                  samplePrimaryTab={samplePrimaryTab}
                  setSamplePrimaryTab={setSamplePrimaryTab}
                  sampleForm={sampleForm}
                  setSampleForm={setSampleForm}
                  coaSampleId={coaSampleId}
                  setCoaSampleId={setCoaSampleId}
                  coaJsonText={coaJsonText}
                  setCoaJsonText={setCoaJsonText}
                  onCreateSample={handleCreateSample}
                  onUpdateCOA={handleUpdateCOA}
                  onRequestDeleteSample={requestDeleteSample}
                />
              )}

              {activeModule === 'consumables' && (
                <ConsumablesView
                  data={data}
                  currentOperator={currentOperator}
                  consPrimaryTab={consPrimaryTab}
                  setConsPrimaryTab={setConsPrimaryTab}
                  editingConsumableId={editingConsumableId}
                  setEditingConsumableId={setEditingConsumableId}
                  consumableForm={consumableForm}
                  setConsumableForm={setConsumableForm}
                  claimForm={claimForm}
                  setClaimForm={setClaimForm}
                  onSaveConsumable={handleSaveConsumable}
                  onClaimConsumable={handleClaimConsumable}
                  onRequestDeleteConsumable={requestDeleteConsumable}
                />
              )}

              {activeModule === 'labs' && (
                <LabsView
                  data={data}
                  currentOperator={currentOperator}
                  currentProject={currentProject}
                  labsPrimaryTab={labsPrimaryTab}
                  setLabsPrimaryTab={setLabsPrimaryTab}
                  selectedLabProject={selectedLabProject}
                  labDetailTab={labDetailTab}
                  setLabDetailTab={setLabDetailTab}
                  editingProjectId={editingProjectId}
                  setEditingProjectId={setEditingProjectId}
                  projectForm={projectForm}
                  setProjectForm={setProjectForm}
                  editingDeptId={editingDeptId}
                  setEditingDeptId={setEditingDeptId}
                  orgNodeForm={orgNodeForm}
                  setOrgNodeForm={setOrgNodeForm}
                  memberForm={memberForm}
                  setMemberForm={setMemberForm}
                  onSaveProject={handleSaveProject}
                  onRequestDeleteProject={requestDeleteProject}
                  onSaveOrgNode={handleSaveOrgNode}
                  onRequestDeleteDepartment={requestDeleteDepartment}
                  onUpsertMember={handleUpsertMember}
                  onRequestRemoveProjectMember={requestRemoveProjectMember}
                  onOpenLabDetail={openLabDetail}
                  onOpenUserProfile={openUserProfile}
                />
              )}

              {activeModule === 'people' && (
                <PeopleView
                  data={data}
                  currentOperator={currentOperator}
                  peoplePrimaryTab={peoplePrimaryTab}
                  setPeoplePrimaryTab={setPeoplePrimaryTab}
                  peopleSecondaryTab={peopleSecondaryTab}
                  setPeopleSecondaryTab={setPeopleSecondaryTab}
                  peopleOrgFilterDeptId={peopleOrgFilterDeptId}
                  setPeopleOrgFilterDeptId={setPeopleOrgFilterDeptId}
                  peopleSearchName={peopleSearchName}
                  setPeopleSearchName={setPeopleSearchName}
                  editingUserId={editingUserId}
                  setEditingUserId={setEditingUserId}
                  userEditForm={userEditForm}
                  setUserEditForm={setUserEditForm}
                  registerForm={registerForm}
                  setRegisterForm={setRegisterForm}
                  onSaveUserEdit={handleSaveUserEdit}
                  onRegisterSubmit={handleRegisterSubmit}
                  onOpenUserProfile={openUserProfile}
                  onRequestDeleteUser={requestDeleteUser}
                />
              )}

              {activeModule === 'billing' && (
                <BillingView
                  data={data}
                  billingPrimaryTab={billingPrimaryTab}
                  setBillingPrimaryTab={setBillingPrimaryTab}
                  simErp={simErp}
                  setSimErp={setSimErp}
                  onTriggerSimErpDeposit={triggerSimErpDeposit}
                  onOpenLabDetail={openLabDetail}
                />
              )}

              {activeModule === 'eln' && (
                <ElnView
                  data={data}
                  currentOperator={currentOperator}
                  elnPrimaryTab={elnPrimaryTab}
                  setElnPrimaryTab={setElnPrimaryTab}
                  editingElnId={editingElnId}
                  setEditingElnId={setEditingElnId}
                  elnForm={elnForm}
                  setElnForm={setElnForm}
                  onSaveELN={handleSaveELN}
                  onLockELN={handleLockELN}
                  onUnlockELN={handleUnlockELN}
                  onRequestDeleteELN={requestDeleteELN}
                />
              )}

              {activeModule === 'entrance' && (
                <EntranceView
                  entranceTab={entranceTab}
                  setEntranceTab={setEntranceTab}
                  hwToken={hwToken}
                  setHwToken={setHwToken}
                  simRfid={simRfid}
                  setSimRfid={setSimRfid}
                  simTelemetry={simTelemetry}
                  setSimTelemetry={setSimTelemetry}
                  simIngest={simIngest}
                  setSimIngest={setSimIngest}
                  simResponseLog={simResponseLog}
                  onTriggerSimRfid={triggerSimRfid}
                  onTriggerSimTelemetry={triggerSimTelemetry}
                  onTriggerSimIngest={triggerSimIngest}
                />
              )}

              {activeModule === 'roles' && (
                <RolesView
                  data={data}
                  rolesPrimaryTab={rolesPrimaryTab}
                  setRolesPrimaryTab={setRolesPrimaryTab}
                  rolesConfig={rolesConfig}
                  editingRoleId={editingRoleId}
                  setEditingRoleId={setEditingRoleId}
                  toggleRolePerm={toggleRolePerm}
                  roleUpdateForm={roleUpdateForm}
                  setRoleUpdateForm={setRoleUpdateForm}
                  onSaveRolesNotice={(label) =>
                    setNotice({ type: 'success', text: `角色【${label}】权限配置已保存` })
                  }
                  onUpdateUserRole={handleUpdateUserRole}
                />
              )}
            </main>
          </div>

          {/* 底部状态栏 */}
          <footer className="bg-slate-200/90 border-t border-slate-300 px-4 h-8 flex items-center justify-between text-[11px] text-slate-600 shrink-0 no-print">
            <span>release-2.25.0 · UniLab-OS</span>
            <span>大型仪器共享与综合实验室管理系统 © 2026 版权所有</span>
          </footer>
        </div>
      )}
    </>
  );
}
