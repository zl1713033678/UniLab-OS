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
  Play,
  Square,
  RefreshCw,
  Building2,
  Boxes,
  Settings,
  Plus,
  Search,
  Printer,
  Download,
  UserCheck,
  KeyRound,
  FolderTree,
  CreditCard,
  LogOut,
  ChevronRight,
  LayoutGrid,
  List,
  Edit3,
  Eye,
  Check,
  Trash2,
  Unlock,
} from 'lucide-react';
import {
  canCreateOrg,
  canEditOrg,
  canDeleteOrg,
  canCreateProject,
  canEditProject,
  canDeleteProject,
  canEditUser,
  canDeleteUser,
  canCreateDevice,
  canEditDevice,
  canDeleteDevice,
  canCancelOrDeleteReservation,
  canCreateConsumable,
  canEditConsumable,
  canDeleteConsumable,
  canDeleteSample,
  canEditELN,
  canUnlockELN,
  canDeleteELN,
} from './permissions';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8000';
const DEFAULT_HW_TOKEN = 'UNILAB_HW_SECRET_2026';

// 角色列表与细粒度权限勾选配置（对标 /lims/!roles 与 /lims/!roles/perms）
const INITIAL_ROLES_CONFIG = [
  {
    id: 'ADMIN',
    weight: 1,
    label: '平台负责人/超级管理员',
    isDefault: false,
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
    isDefault: false,
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
    isDefault: false,
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
    isDefault: true,
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
    isDefault: true,
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

export default function App() {
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
  const [notice, setNotice] = useState({ type: '', text: '' });

  // 登录与注册状态
  const [isAuthenticated, setIsAuthenticated] = useState(true);
  const [authTab, setAuthTab] = useState('login'); // 'login' | 'register_user' | 'register_lab'
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

  // 当前登录操作人与绑定项目上下文
  const [operatorId, setOperatorId] = useState(1); // 默认林总工/管理员
  const [projectId, setProjectId] = useState(1);

  // 左侧导航模式 ('list' | 'icon') 与主模块路由
  const [sidebarMode, setSidebarMode] = useState('list');
  const [activeModule, setActiveModule] = useState('profile');
  // 'profile' | 'equipments' | 'samples' | 'consumables' | 'labs' | 'people' | 'billing' | 'eln' | 'entrance' | 'roles'

  // 各模块内部一级/二级 Tab 状态与钻取目标状态
  const [profileUserId, setProfileUserId] = useState(1);
  const [profilePrimaryTab, setProfilePrimaryTab] = useState('follow');
  // 'follow' | 'dc_record' | 'eq_record' | 'eq_reserv' | 'eq_sample' | 'eq_charge' | 'eq_training'

  const [eqPrimaryTab, setEqPrimaryTab] = useState('list'); // 'list' | 'records' | 'reserv' | 'map' | 'detail'
  const [eqSecondaryTab, setEqSecondaryTab] = useState('all'); // 'all' | 'IDLE' | 'RUNNING' | 'FAULT'
  const [selectedDeviceId, setSelectedDeviceId] = useState(null);
  const [eqDetailTab, setEqDetailTab] = useState('dashboard'); // 'dashboard' | 'reserv' | 'records' | 'charge'
  const [showEqSearch, setShowEqSearch] = useState(false);
  const [eqSearchKeyword, setEqSearchKeyword] = useState('');
  const [eqSearchDeptId, setEqSearchDeptId] = useState('0');

  const [samplePrimaryTab, setSamplePrimaryTab] = useState('list'); // 'list' | 'add' | 'coa'
  const [sampleSecondaryTab, setSampleSecondaryTab] = useState('all'); // 'all' | 'REGISTERED' | 'COMPLETED'

  const [consPrimaryTab, setConsPrimaryTab] = useState('list'); // 'list' | 'claim'
  const [consSecondaryTab, setConsSecondaryTab] = useState('all'); // 'all' | 'normal' | 'low'

  const [labsPrimaryTab, setLabsPrimaryTab] = useState('list'); // 'list' | 'my_lab' | 'detail' | 'add_member' | 'add_org'
  const [labsSecondaryTab, setLabsSecondaryTab] = useState('all'); // 'all' | 'confidential' | 'open'
  const [selectedLabProjectId, setSelectedLabProjectId] = useState(1);
  const [labDetailTab, setLabDetailTab] = useState('members'); // 'members' | 'eq_record' | 'eq_reserv' | 'eq_sample' | 'billing'

  const [peoplePrimaryTab, setPeoplePrimaryTab] = useState('list'); // 'list' | 'add'
  const [peopleSecondaryTab, setPeopleSecondaryTab] = useState('all'); // 'all' | 'ACTIVE' | 'HEAD_PI' | 'STAFF' | 'OBSERVER'
  const [peopleOrgFilterDeptId, setPeopleOrgFilterDeptId] = useState(0);
  const [peopleSearchName, setPeopleSearchName] = useState('');
  const [showPeopleSearch, setShowPeopleSearch] = useState(false);

  const [billingPrimaryTab, setBillingPrimaryTab] = useState('accounts'); // 'departments' | 'accounts' | 'transactions' | 'deposit'

  const [elnPrimaryTab, setElnPrimaryTab] = useState('list'); // 'list' | 'add'
  const [elnSecondaryTab, setElnSecondaryTab] = useState('all'); // 'all' | 'locked' | 'draft'

  const [entranceTab, setEntranceTab] = useState('rfid'); // 'rfid' | 'telemetry' | 'ingest' | 'erp'

  const [rolesPrimaryTab, setRolesPrimaryTab] = useState('list'); // 'list' | 'perms' | 'user_role'
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
  const [coaJsonText, setCoaJsonText] = useState('{"纯度_percent": 99.4, "粒径均值_nm": 65.2, "结论": "合格"}');
  const [elnForm, setElnForm] = useState({
    title: 'EXP-2026-002: 微纳载体表面修饰条件测定',
    markdown_content: '1. 样品预处理与流道清洗；\n2. 恒温反应参数记录与质谱送样对标。',
    conditions_text: '{"temp_c": 37.0, "stir_rpm": 600, "solvent": "PBS 7.4"}',
    linked_reservation_id: '',
    linked_sample_id: '',
  });

  // 新增/编辑已有项目、设备、耗材、人员、组织机构、ELN 表单状态
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

  // 门禁与硬件接口参数
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
    raw_metrics_text: '{"峰面积比": 1.984, "信噪比_SNR": 420.5, "检出限_ng_mL": 0.05, "判定": "PASS"}',
    seq_id: `AGENT_COA_${Math.floor(10000 + Math.random() * 90000)}`,
  });
  const [simErp, setSimErp] = useState({
    project_code: 'PRJ-2026-01',
    amount: '15000.0000',
    erp_voucher_no: 'ERP-2026-VOUCHER-889',
    operator_username: 'pi_zhang',
  });
  const [simResponseLog, setSimResponseLog] = useState('');

  // 拉取后台数据
  const fetchBootstrap = async (opId = operatorId, prjId = projectId) => {
    setLoading(true);
    try {
      const res = await fetch(
        `${API_BASE}/api/v1/bootstrap?operator_user_id=${opId}&project_id=${prjId}`
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.detail || '数据加载失败');
      setData(json);
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBootstrap(operatorId, projectId);
  }, [operatorId, projectId]);

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

  const apiPost = async (path, bodyObj, customHeaders = {}) => {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...customHeaders },
      body: JSON.stringify(bodyObj),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.detail || JSON.stringify(json));
    return json;
  };

  const apiPut = async (path, bodyObj) => {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyObj),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.detail || JSON.stringify(json));
    return json;
  };

  const apiDelete = async (path) => {
    const res = await fetch(`${API_BASE}${path}`, { method: 'DELETE' });
    const json = await res.json();
    if (!res.ok) throw new Error(json.detail || JSON.stringify(json));
    return json;
  };

  // ==================== 已有项目与资产增删改查处理器 ====================

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

  const handleDeleteDevice = async (dev) => {
    try {
      await apiDelete(`/api/v1/fms/devices/${dev.id}?operator_user_id=${operatorId}`);
      setNotice({ type: 'success', text: `仪器【${dev.name}】已删除/报废` });
      if (selectedDeviceId === dev.id) setEqPrimaryTab('list');
      fetchBootstrap();
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    }
  };

  const handleCancelOrDeleteReservation = async (resObj) => {
    try {
      await apiDelete(`/api/v1/fms/reservations/${resObj.id}?operator_user_id=${operatorId}`);
      setNotice({
        type: 'success',
        text:
          resObj.status === 'RESERVED'
            ? `已取消预约单 #${resObj.id}，预授权冻结款 ¥${resObj.hold_amount} 已原路解冻退回`
            : `已删除机时记录 #${resObj.id}`,
      });
      fetchBootstrap();
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    }
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

  const handleDeleteConsumable = async (c) => {
    try {
      await apiDelete(`/api/v1/lims/consumables/${c.id}?operator_user_id=${operatorId}`);
      setNotice({ type: 'success', text: `耗材【${c.name}】已删除` });
      fetchBootstrap();
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    }
  };

  const handleDeleteSample = async (smp) => {
    try {
      await apiDelete(`/api/v1/lims/samples/${smp.id}?operator_user_id=${operatorId}`);
      setNotice({
        type: 'success',
        text:
          smp.status === 'REGISTERED'
            ? `已撤回待检样品 ${smp.barcode}，检测费 ¥${smp.total_test_fee} 已退回项目余额`
            : `已删除样品记录 ${smp.barcode}`,
      });
      fetchBootstrap();
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    }
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

  const handleDeleteProject = async (prj) => {
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
  };

  const handleRemoveProjectMember = async (pm) => {
    try {
      await apiDelete(`/api/v1/org/project-members/${pm.id}?operator_user_id=${operatorId}`);
      setNotice({ type: 'success', text: `已将成员【${pm.user_name}】移出项目` });
      fetchBootstrap();
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    }
  };

  const handleDeleteDepartment = async (dept) => {
    try {
      await apiDelete(`/api/v1/org/departments/${dept.id}?operator_user_id=${operatorId}`);
      setNotice({ type: 'success', text: `组织机构【${dept.name}】已删除` });
      fetchBootstrap();
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    }
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

  const handleDeleteUser = async (u) => {
    try {
      await apiDelete(`/api/v1/org/users/${u.id}?operator_user_id=${operatorId}`);
      setNotice({ type: 'success', text: `成员【${u.full_name}】已删除` });
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

  const handleDeleteELN = async (elnId) => {
    try {
      await apiDelete(`/api/v1/eln/records/${elnId}?operator_user_id=${operatorId}`);
      setNotice({ type: 'success', text: `实验记录 #${elnId} 已删除` });
      fetchBootstrap();
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    }
  };

  // 打开指定成员的个人档案页
  const openUserProfile = (uid) => {
    setProfileUserId(uid);
    setActiveModule('profile');
  };

  // 打开指定仪器详情页
  const openDeviceDetail = (devId, subTab = 'dashboard') => {
    setSelectedDeviceId(devId);
    setResForm((prev) => ({ ...prev, device_id: devId }));
    setEqPrimaryTab('detail');
    setEqDetailTab(subTab);
    setActiveModule('equipments');
  };

  // 打开指定课题组/项目详情页
  const openLabDetail = (prjId, subTab = 'members') => {
    setSelectedLabProjectId(prjId);
    setLabsPrimaryTab('detail');
    setLabDetailTab(subTab);
    setActiveModule('labs');
  };

  // CSV 导出工具
  const exportTableToCSV = (filename, headers, rows) => {
    const csvContent =
      '\uFEFF' +
      [headers.join(','), ...rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))].join(
        '\n'
      );
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ==================== 业务提交函数 ====================

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
      setNotice({ type: 'success', text: `成员【${res.user.full_name}】注册成功` });
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    }
  };

  const handleCreateOrgNode = async (e) => {
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
      fetchBootstrap();
      if (!isAuthenticated) setIsAuthenticated(true);
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    }
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

  const handleCreateELN = async (e) => {
    e.preventDefault();
    try {
      const parsedCond = JSON.parse(elnForm.conditions_text || '{}');
      if (editingElnId) {
        const res = await apiPut(`/api/v1/eln/records/${editingElnId}`, {
          operator_user_id: Number(operatorId),
          title: elnForm.title,
          markdown_content: elnForm.markdown_content,
          conditions: parsedCond,
          linked_reservation_id: elnForm.linked_reservation_id ? Number(elnForm.linked_reservation_id) : null,
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
          linked_reservation_id: elnForm.linked_reservation_id ? Number(elnForm.linked_reservation_id) : null,
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
      setNotice({ type: 'success', text: `设备 ${res.device_code} 状态更新为 ${res.computed_status}` });
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
      setNotice({ type: 'success', text: `项目 ${res.project_code} 拨款入账完成，可用余额 ¥${res.available_balance}` });
      fetchBootstrap();
    } catch (err) {
      setSimResponseLog(`ERROR: ${err.message}`);
      setNotice({ type: 'error', text: err.message });
    }
  };

  // 左侧菜单配置（对标 criwi-yiqi.cn/lims 导航项）
  const navModules = [
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

  // ==================== 登录 / 注册新用户 / 注册新课题组界面 ====================
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#f2f5f9] text-slate-800 flex flex-col justify-between text-xs">
        {/* 顶部条 */}
        <header className="bg-[#1e40af] text-white px-5 h-10 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2 font-bold tracking-wide text-sm">
            <Cpu className="w-4 h-4" />
            <span>大型仪器共享与综合实验室管理系统 · UniLab-OS</span>
          </div>
          <div className="flex items-center gap-4 text-xs text-blue-100">
            <span>语言: 中文</span>
            <span>|</span>
            <button onClick={() => setIsAuthenticated(true)} className="hover:text-white underline">
              直接进入系统工作台
            </button>
          </div>
        </header>

        {/* 中部标准应用式登录与注册面板 */}
        <div className="max-w-3xl w-full mx-auto my-8 bg-white border border-slate-300 rounded shadow-sm overflow-hidden">
          {/* 一级 Tab 栏（对标：登录 | 注册新用户 | 注册新课题组） */}
          <div className="bg-slate-100 border-b border-slate-300 px-4 pt-2 flex items-center justify-between">
            <div className="flex gap-1">
              {[
                { id: 'login', label: '系统登录' },
                { id: 'register_user', label: '注册新用户' },
                { id: 'register_lab', label: '注册新课题组' },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setAuthTab(t.id)}
                  className={`px-4 py-2 rounded-t border-t border-l border-r text-xs font-semibold ${
                    authTab === t.id
                      ? 'bg-white border-slate-300 text-blue-700 -mb-px'
                      : 'bg-slate-200/70 border-transparent text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="p-6">
            {notice.text && (
              <div
                className={`mb-4 px-3 py-2 rounded border text-xs flex items-center justify-between ${
                  notice.type === 'error'
                    ? 'bg-rose-50 border-rose-200 text-rose-700'
                    : 'bg-blue-50 border-blue-200 text-blue-700'
                }`}
              >
                <span>{notice.text}</span>
                <button onClick={() => setNotice({ type: '', text: '' })}>✕</button>
              </div>
            )}

            {authTab === 'login' && (
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                <form onSubmit={handleLoginSubmit} className="md:col-span-6 space-y-3.5">
                  <div className="font-bold text-slate-800 text-sm border-b border-slate-200 pb-2">
                    账号登录
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-1">登录帐号</label>
                    <input
                      type="text"
                      value={loginForm.username}
                      onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })}
                      className="w-full border border-slate-300 rounded px-2.5 py-1.5 focus:outline-none focus:border-blue-600"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-1">密码</label>
                    <input
                      type="password"
                      value={loginForm.password}
                      onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                      className="w-full border border-slate-300 rounded px-2.5 py-1.5 focus:outline-none focus:border-blue-600"
                      required
                    />
                  </div>
                  <div className="pt-1 flex items-center gap-2">
                    <button
                      type="submit"
                      className="px-5 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white font-semibold"
                    >
                      登录系统
                    </button>
                    <button
                      type="button"
                      onClick={() => setAuthTab('register_user')}
                      className="px-3 py-1.5 rounded border border-slate-300 hover:bg-slate-50 text-slate-700"
                    >
                      注册新用户
                    </button>
                  </div>
                </form>

                {/* 右侧快速切换登录身份 */}
                <div className="md:col-span-6 border-l border-slate-200 pl-6 space-y-2">
                  <div className="font-bold text-slate-800 text-sm border-b border-slate-200 pb-2">
                    内置测试帐号快捷登录
                  </div>
                  <div className="space-y-1.5">
                    {data.users.map((u) => (
                      <div
                        key={u.id}
                        className="flex items-center justify-between p-2 rounded border border-slate-200 hover:bg-blue-50/40"
                      >
                        <div>
                          <span className="font-bold text-slate-800">{u.full_name}</span>
                          <span className="text-slate-400 ml-1">({u.username})</span>
                          <div className="text-[11px] text-slate-500">
                            {u.home_dept_name} » {u.sub_group_name || '核心实验组'}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setOperatorId(u.id);
                            setProfileUserId(u.id);
                            setIsAuthenticated(true);
                          }}
                          className="px-2.5 py-1 rounded bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-600 hover:text-white font-medium"
                        >
                          选择登录
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {authTab === 'register_user' && (
              <form onSubmit={handleRegisterSubmit} className="space-y-3">
                <div className="font-bold text-slate-800 text-sm border-b border-slate-200 pb-2">
                  注册新用户
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-slate-600 mb-1">登录帐号 *</label>
                    <input
                      type="text"
                      value={registerForm.username}
                      onChange={(e) => setRegisterForm({ ...registerForm, username: e.target.value })}
                      className="w-full border border-slate-300 rounded px-2.5 py-1.5"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-1">姓名 *</label>
                    <input
                      type="text"
                      value={registerForm.full_name}
                      onChange={(e) => setRegisterForm({ ...registerForm, full_name: e.target.value })}
                      className="w-full border border-slate-300 rounded px-2.5 py-1.5"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-1">登录密码 *</label>
                    <input
                      type="password"
                      value={registerForm.password}
                      onChange={(e) => setRegisterForm({ ...registerForm, password: e.target.value })}
                      className="w-full border border-slate-300 rounded px-2.5 py-1.5"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-1">电子邮箱</label>
                    <input
                      type="email"
                      value={registerForm.email}
                      onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })}
                      className="w-full border border-slate-300 rounded px-2.5 py-1.5"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-1">组织机构 (行政科室) *</label>
                    <select
                      value={registerForm.home_dept_id}
                      onChange={(e) =>
                        setRegisterForm({ ...registerForm, home_dept_id: e.target.value })
                      }
                      className="w-full border border-slate-300 rounded px-2.5 py-1.5"
                    >
                      {data.departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          所内用户 » 集约化中心 » {d.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-1">所属课题组/研究室</label>
                    <input
                      type="text"
                      value={registerForm.sub_group_name}
                      onChange={(e) =>
                        setRegisterForm({ ...registerForm, sub_group_name: e.target.value })
                      }
                      className="w-full border border-slate-300 rounded px-2.5 py-1.5"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-1">人员角色</label>
                    <select
                      value={registerForm.system_role}
                      onChange={(e) =>
                        setRegisterForm({ ...registerForm, system_role: e.target.value })
                      }
                      className="w-full border border-slate-300 rounded px-2.5 py-1.5"
                    >
                      <option value="STAFF">所内职工 / 科研人员</option>
                      <option value="PI">课题组负责人 (PI)</option>
                      <option value="DEPT_HEAD">科室主任</option>
                      <option value="OBSERVER">目前成员 (观察员)</option>
                      <option value="ADMIN">平台负责人/超级管理员</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-1">关联财务项目</label>
                    <select
                      value={registerForm.join_project_id}
                      onChange={(e) =>
                        setRegisterForm({ ...registerForm, join_project_id: e.target.value })
                      }
                      className="w-full border border-slate-300 rounded px-2.5 py-1.5"
                    >
                      {data.projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.code} - {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="pt-2">
                  <button
                    type="submit"
                    className="px-5 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white font-semibold"
                  >
                    提交注册
                  </button>
                </div>
              </form>
            )}

            {authTab === 'register_lab' && (
              <form onSubmit={handleCreateOrgNode} className="space-y-3">
                <div className="font-bold text-slate-800 text-sm border-b border-slate-200 pb-2">
                  注册新课题组 / 实验室机构
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-slate-600 mb-1">课题组编码 *</label>
                    <input
                      type="text"
                      value={orgNodeForm.code}
                      onChange={(e) => setOrgNodeForm({ ...orgNodeForm, code: e.target.value })}
                      className="w-full border border-slate-300 rounded px-2.5 py-1.5 font-mono"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-1">课题组名称 *</label>
                    <input
                      type="text"
                      value={orgNodeForm.name}
                      onChange={(e) => setOrgNodeForm({ ...orgNodeForm, name: e.target.value })}
                      className="w-full border border-slate-300 rounded px-2.5 py-1.5"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-1">上级组织机构</label>
                    <select
                      value={orgNodeForm.parent_id}
                      onChange={(e) =>
                        setOrgNodeForm({ ...orgNodeForm, parent_id: e.target.value })
                      }
                      className="w-full border border-slate-300 rounded px-2.5 py-1.5"
                    >
                      {data.departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name} ({d.code})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-1">建立者 / 负责人</label>
                    <input
                      type="text"
                      value={orgNodeForm.manager_name}
                      onChange={(e) =>
                        setOrgNodeForm({ ...orgNodeForm, manager_name: e.target.value })
                      }
                      className="w-full border border-slate-300 rounded px-2.5 py-1.5"
                    />
                  </div>
                </div>
                <div className="pt-2">
                  <button
                    type="submit"
                    className="px-5 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white font-semibold"
                  >
                    提交课题组注册
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>

        <footer className="bg-slate-200 border-t border-slate-300 px-5 h-8 flex items-center justify-between text-[11px] text-slate-600">
          <span>release-2.25.0 · UniLab-OS</span>
          <span>大型仪器共享管理系统 © 2026 版权所有</span>
        </footer>
      </div>
    );
  }

  // 计算当前查看档案用户的统计指标
  const profileUserReservations = data.reservations.filter(
    (r) => r.operator_user_id === profileUser?.id
  );
  const profileUserSamples = data.samples.filter(
    (s) => s.submitter_user_id === profileUser?.id
  );
  const profileUserMemberships = data.project_members.filter(
    (pm) => pm.user_id === profileUser?.id
  );
  const profileUserElns = data.eln_records.filter(
    (e) => e.author_user_id === profileUser?.id
  );
  const profileUserLedgers = data.ledgers.filter(
    (l) => l.operator_user_id === profileUser?.id
  );

  // 过滤仪器列表
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

  // 过滤成员列表
  const filteredUsers = data.users.filter((u) => {
    if (peopleOrgFilterDeptId !== 0 && u.home_dept_id !== Number(peopleOrgFilterDeptId)) {
      return false;
    }
    if (peopleSecondaryTab === 'ACTIVE' && u.status !== 'ACTIVE') return false;
    if (peopleSecondaryTab === 'HEAD_PI' && !['ADMIN', 'DEPT_HEAD', 'PI'].includes(u.system_role))
      return false;
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

  const currentEditingRole =
    rolesConfig.find((r) => r.id === editingRoleId) || rolesConfig[0];

  const toggleRolePerm = (permKey) => {
    setRolesConfig((prev) =>
      prev.map((r) =>
        r.id === editingRoleId
          ? { ...r, perms: { ...r.perms, [permKey]: !r.perms[permKey] } }
          : r
      )
    );
  };

  // ==================== 主应用界面 (对标 criwi-yiqi.cn/lims 布局与交互逻辑) ====================
  return (
    <div className="min-h-screen bg-[#f2f5f9] text-slate-800 flex flex-col text-xs select-none">
      {/* ==================== 顶部紧凑导航条 (#header) ==================== */}
      <header className="bg-gradient-to-r from-[#1d4ed8] via-[#1e40af] to-[#1e3a8a] text-white px-4 h-10 flex items-center justify-between shadow-sm shrink-0">
        <div className="flex items-center gap-2.5">
          <div
            onClick={() => openUserProfile(operatorId)}
            className="flex items-center gap-2 cursor-pointer font-bold text-sm tracking-wide"
          >
            <Cpu className="w-4 h-4 text-blue-200" />
            <span>大型仪器共享与综合实验室管理系统</span>
          </div>
          <span className="text-[11px] px-1.5 py-0.2 rounded bg-blue-900/70 text-blue-200 border border-blue-700 font-mono">
            UniLab-OS
          </span>
        </div>

        {/* 右侧工具菜单 (#top_menu) */}
        <div className="flex items-center gap-2.5 text-xs">
          {/* 当前绑定项目财务账号切换 */}
          <div className="flex items-center gap-1 bg-blue-900/60 border border-blue-700/80 rounded px-2 py-0.5">
            <span className="text-blue-200 text-[11px]">结算项目:</span>
            <select
              value={projectId}
              onChange={(e) => setProjectId(Number(e.target.value))}
              className="bg-transparent text-white font-medium text-[11px] focus:outline-none cursor-pointer"
            >
              {data.projects.map((p) => (
                <option key={p.id} value={p.id} className="text-slate-800">
                  {p.code} (可用 ¥{p.available_balance})
                </option>
              ))}
            </select>
          </div>

          {/* 当前登录身份切换 */}
          <div className="flex items-center gap-1 bg-blue-900/60 border border-blue-700/80 rounded px-2 py-0.5">
            <span className="text-blue-200 text-[11px]">当前身份:</span>
            <select
              value={operatorId}
              onChange={(e) => {
                const uid = Number(e.target.value);
                setOperatorId(uid);
                setProfileUserId(uid);
              }}
              className="bg-transparent text-white font-medium text-[11px] focus:outline-none cursor-pointer"
            >
              {data.users.map((u) => (
                <option key={u.id} value={u.id} className="text-slate-800">
                  {u.full_name} [{u.system_role}]
                </option>
              ))}
            </select>
          </div>

          <span className="text-blue-400">|</span>
          <button
            onClick={() => openUserProfile(operatorId)}
            className="hover:underline text-blue-100 hover:text-white"
          >
            我的档案
          </button>
          <span className="text-blue-400">•</span>
          <button
            onClick={() => setActiveModule('roles')}
            className="hover:underline text-blue-100 hover:text-white"
          >
            系统设置
          </button>
          <span className="text-blue-400">•</span>
          <button
            onClick={() => setIsAuthenticated(false)}
            className="hover:underline text-blue-100 hover:text-white flex items-center gap-1"
          >
            <LogOut className="w-3 h-3" /> 登出
          </button>
        </div>
      </header>

      {/* ==================== 主体容器：左侧栏 (#sidebar) + 右侧工作区 (#center) ==================== */}
      <div className="flex-1 flex min-h-0">
        {/* 左侧栏 (#sidebar, width: 204px) */}
        <aside className="w-52 bg-[#e8eef7] border-r border-slate-300 flex flex-col justify-between shrink-0">
          <div className="p-2 space-y-2 overflow-y-auto">
            {/* 1. 当前登录用户卡片 (sidebar_current_user) */}
            <div className="bg-white border border-slate-300/90 rounded p-2.5 flex items-start gap-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
              <div
                onClick={() => openUserProfile(operatorId)}
                className="w-9 h-9 rounded bg-blue-600 text-white flex items-center justify-center font-bold text-sm cursor-pointer shrink-0"
              >
                {currentOperator?.full_name?.slice(0, 1) || 'U'}
              </div>
              <div className="min-w-0 flex-1 leading-tight">
                <button
                  onClick={() => openUserProfile(operatorId)}
                  className="font-bold text-slate-900 hover:text-blue-600 truncate block"
                >
                  {currentOperator?.full_name}
                </button>
                <button
                  onClick={() => {
                    setLabsPrimaryTab('my_lab');
                    setActiveModule('labs');
                  }}
                  className="text-[11px] text-blue-700 hover:underline truncate block mt-0.5"
                >
                  {currentOperator?.home_dept_name}
                </button>
                <span className="text-[10px] text-slate-500 block mt-0.5">
                  {currentOperator?.sub_group_name || '综合实验中心'}
                </span>
              </div>
            </div>

            {/* 2. 模块导航列表 (sidebar_menu，支持图标模式 / 列表模式切换) */}
            <div className="bg-white border border-slate-300/90 rounded p-2 space-y-1.5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-1 px-1">
                <span className="text-[11px] font-semibold text-slate-500">功能菜单</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setSidebarMode('icon')}
                    className={`p-1 rounded ${
                      sidebarMode === 'icon'
                        ? 'bg-blue-100 text-blue-700'
                        : 'text-slate-400 hover:text-slate-700'
                    }`}
                    title="图标模式"
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setSidebarMode('list')}
                    className={`p-1 rounded ${
                      sidebarMode === 'list'
                        ? 'bg-blue-100 text-blue-700'
                        : 'text-slate-400 hover:text-slate-700'
                    }`}
                    title="列表模式"
                  >
                    <List className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {sidebarMode === 'list' ? (
                <div className="space-y-0.5">
                  {navModules.map((m) => {
                    const Icon = m.icon;
                    const active = activeModule === m.id;
                    return (
                      <button
                        key={m.id}
                        onClick={() => setActiveModule(m.id)}
                        className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-xs transition ${
                          active
                            ? 'bg-blue-600 text-white font-semibold shadow-sm'
                            : 'text-slate-700 hover:bg-blue-50 hover:text-blue-700'
                        }`}
                      >
                        <Icon className={`w-3.5 h-3.5 ${active ? 'text-white' : 'text-blue-600'}`} />
                        <span>{m.label}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-1.5 pt-1">
                  {navModules.map((m) => {
                    const Icon = m.icon;
                    const active = activeModule === m.id;
                    return (
                      <button
                        key={m.id}
                        onClick={() => setActiveModule(m.id)}
                        className={`flex flex-col items-center justify-center p-2 rounded border text-center transition ${
                          active
                            ? 'bg-blue-600 text-white border-blue-600 font-semibold'
                            : 'bg-slate-50/70 text-slate-700 border-slate-200 hover:bg-blue-50'
                        }`}
                      >
                        <Icon className={`w-4 h-4 mb-1 ${active ? 'text-white' : 'text-blue-600'}`} />
                        <span className="text-[11px] truncate w-full">{m.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 3. 课题组/财务余额小组件 (sidebar_billing_lab) */}
            <div className="bg-white border border-slate-300/90 rounded p-2.5 space-y-1 text-[11px]">
              <div className="font-bold text-slate-800 truncate">
                {currentProject?.code} · {currentOperator?.home_dept_name}
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span>总可用余额:</span>
                <strong className="text-emerald-700 font-mono">
                  ¥{currentProject?.available_balance || '0.0000'}
                </strong>
              </div>
              <div className="flex items-center justify-between text-slate-500">
                <span>预约已冻结:</span>
                <strong className="text-amber-600 font-mono">
                  ¥{currentProject?.frozen_balance || '0.0000'}
                </strong>
              </div>
            </div>

            {/* 4. 快捷入口列表 (sidebar_shortcuts，对标参考站左侧快捷链接) */}
            <div className="bg-white border border-slate-300/90 rounded divide-y divide-slate-100 text-[11px]">
              {[
                {
                  label: '您负责的所有仪器的使用记录',
                  action: () => {
                    setActiveModule('equipments');
                    setEqPrimaryTab('records');
                  },
                },
                {
                  label: '所有仪器的使用记录',
                  action: () => {
                    setActiveModule('equipments');
                    setEqPrimaryTab('records');
                  },
                },
                {
                  label: '您负责的所有仪器的预约情况',
                  action: () => {
                    setActiveModule('equipments');
                    setEqPrimaryTab('reserv');
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
                  label: '所有仪器的使用收费',
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
              ].map((sc, i) => (
                <button
                  key={i}
                  onClick={sc.action}
                  className={`w-full text-left px-2.5 py-1.5 text-blue-700 hover:bg-blue-50 hover:underline block truncate ${
                    i % 2 === 0 ? 'bg-slate-50/60' : 'bg-white'
                  }`}
                >
                  {sc.label}
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* ==================== 右侧核心业务工作区 (#center) ==================== */}
        <main className="flex-1 bg-white p-4 overflow-y-auto min-w-0 select-text">
          {/* 操作结果提示条 */}
          {notice.text && (
            <div
              className={`mb-3 px-3 py-2 rounded border text-xs flex items-center justify-between ${
                notice.type === 'error'
                  ? 'bg-rose-50 border-rose-300 text-rose-800'
                  : 'bg-emerald-50 border-emerald-300 text-emerald-800'
              }`}
            >
              <span>{notice.text}</span>
              <button
                onClick={() => setNotice({ type: '', text: '' })}
                className="text-slate-500 hover:text-slate-800 ml-3"
              >
                ✕
              </button>
            </div>
          )}

          {/* ==================== 模块 1：个人档案 (!people/profile/index.225) ==================== */}
          {activeModule === 'profile' && profileUser && (
            <div className="space-y-3">
              {/* 顶部一级 Tab: 成员列表 | [当前用户名] */}
              <div className="border-b border-slate-300 flex items-center gap-1 pt-1">
                <button
                  onClick={() => setActiveModule('people')}
                  className="px-4 py-1.5 rounded-t border border-b-0 border-slate-300 bg-slate-100 text-slate-600 hover:bg-slate-200 font-medium"
                >
                  成员列表
                </button>
                <button className="px-4 py-1.5 rounded-t border border-b-0 border-slate-300 bg-white text-blue-700 font-bold -mb-px">
                  {profileUser.full_name}
                </button>
              </div>

              {/* 个人档案头部信息网格 (user_grid) */}
              <div className="p-3 bg-slate-50/60 border border-slate-200 rounded flex flex-wrap items-start gap-4">
                <div className="w-16 h-16 rounded bg-blue-600 text-white flex items-center justify-center text-2xl font-bold shrink-0 shadow-sm">
                  {profileUser.full_name.slice(0, 1)}
                </div>

                <div className="flex-1 min-w-[260px] space-y-1.5">
                  <div className="flex items-baseline gap-2">
                    <h2 className="text-base font-bold text-slate-900">{profileUser.full_name}</h2>
                    <span className="text-slate-500 font-mono">({profileUser.username})</span>
                    <button
                      onClick={() => {
                        setLabsPrimaryTab('my_lab');
                        setActiveModule('labs');
                      }}
                      className="text-blue-700 hover:underline font-medium"
                    >
                      {profileUser.home_dept_name}
                    </button>
                  </div>

                  <div className="text-slate-700">{roleCnLabel(profileUser.system_role)}</div>

                  <div className="text-slate-600 flex flex-wrap gap-x-6 gap-y-1">
                    <span>人员类型: 教师/科研人员 - 所内职工</span>
                    <span>
                      电子邮箱:{' '}
                      <a href={`mailto:${profileUser.email}`} className="text-blue-700 hover:underline">
                        {profileUser.email}
                      </a>
                    </span>
                    <span className="font-mono">RFID卡号: {profileUser.rfid_card_id}</span>
                  </div>

                  <div className="text-slate-600">
                    组织机构:{' '}
                    <button
                      onClick={() => {
                        setPeopleOrgFilterDeptId(0);
                        setActiveModule('people');
                      }}
                      className="text-blue-700 hover:underline"
                    >
                      所内用户
                    </button>{' '}
                    »{' '}
                    <button
                      onClick={() => {
                        setPeopleOrgFilterDeptId(profileUser.home_dept_id);
                        setActiveModule('people');
                      }}
                      className="text-blue-700 hover:underline"
                    >
                      {profileUser.home_dept_name}
                    </button>{' '}
                    »{' '}
                    <span className="text-slate-800 font-medium">
                      {profileUser.sub_group_name || '综合实验中心'}
                    </span>
                  </div>

                  {/* 四宫格统计指标条 (ul.stat) */}
                  <div className="pt-1 flex flex-wrap gap-2">
                    {[
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
                        onClick: () => setActiveModule('eln'),
                      },
                      {
                        num: 0,
                        unit: '次',
                        label: '违规总次数',
                        onClick: () => setProfilePrimaryTab('eq_record'),
                      },
                    ].map((st, idx) => (
                      <button
                        key={idx}
                        onClick={st.onClick}
                        className="w-24 border border-slate-300 bg-white hover:border-blue-500 rounded px-2.5 py-1.5 text-center transition"
                      >
                        <div className="text-sm font-bold text-blue-700">
                          {st.num} <span className="text-[11px] font-normal text-slate-500">{st.unit}</span>
                        </div>
                        <div className="text-[11px] text-slate-600">{st.label}</div>
                      </button>
                    ))}
                  </div>

                  {/* 操作按钮行（按多层级权限展示） */}
                  <div className="pt-1.5 flex items-center gap-2">
                    {canEditUser(currentOperator, profileUser) && (
                      <button
                        onClick={() => {
                          setEditingUserId(profileUser.id);
                          setUserEditForm({
                            full_name: profileUser.full_name,
                            email: profileUser.email,
                            rfid_card_id: profileUser.rfid_card_id,
                            home_dept_id: profileUser.home_dept_id,
                            sub_group_name: profileUser.sub_group_name || '核心实验组',
                            system_role: profileUser.system_role,
                            status: profileUser.status || 'ACTIVE',
                          });
                          setPeoplePrimaryTab('edit');
                          setActiveModule('people');
                        }}
                        className="px-3 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white font-medium flex items-center gap-1"
                      >
                        <Edit3 className="w-3 h-3" /> 修改成员资料
                      </button>
                    )}
                    {canEditProject(currentOperator, currentProject, data.project_members) && (
                      <button
                        onClick={() => {
                          setMemberForm((prev) => ({ ...prev, target_user_id: profileUser.id }));
                          setLabsPrimaryTab('add_member');
                          setActiveModule('labs');
                        }}
                        className="px-3 py-1 rounded border border-slate-300 bg-white hover:bg-slate-50 text-slate-700"
                      >
                        配置项目配额
                      </button>
                    )}
                    {canDeleteUser(currentOperator, profileUser) && (
                      <button
                        onClick={() => handleDeleteUser(profileUser)}
                        className="px-3 py-1 rounded border border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-700 flex items-center gap-1"
                      >
                        <Trash2 className="w-3 h-3" /> 删除该成员
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* 档案子模块一级 Tabs (primary_tabs) */}
              <div className="border-b border-slate-300 flex flex-wrap gap-1">
                {[
                  { id: 'follow', label: '关注仪器' },
                  { id: 'dc_record', label: '进出记录' },
                  { id: 'eq_record', label: '仪器使用' },
                  { id: 'eq_reserv', label: '仪器预约' },
                  { id: 'eq_sample', label: '仪器送样' },
                  { id: 'eq_charge', label: '仪器收费' },
                  { id: 'eq_training', label: '仪器培训 / 项目授权' },
                ].map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setProfilePrimaryTab(t.id)}
                    className={`px-3.5 py-1.5 rounded-t border border-b-0 text-xs font-medium ${
                      profilePrimaryTab === t.id
                        ? 'bg-white border-slate-300 text-blue-700 font-bold -mb-px'
                        : 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* 二级计数 Tab */}
              <div className="flex items-center justify-between bg-slate-100 border border-slate-200 px-3 py-1.5 rounded">
                <span className="font-semibold text-blue-700">
                  {profilePrimaryTab === 'follow' && `仪器 (${data.devices.length})`}
                  {profilePrimaryTab === 'dc_record' && `门禁与RFID刷卡记录 (${profileUserReservations.length})`}
                  {profilePrimaryTab === 'eq_record' && `使用记录 (${profileUserReservations.length})`}
                  {profilePrimaryTab === 'eq_reserv' && `预约记录 (${profileUserReservations.length})`}
                  {profilePrimaryTab === 'eq_sample' && `送样记录 (${profileUserSamples.length})`}
                  {profilePrimaryTab === 'eq_charge' && `收费明细 (${profileUserLedgers.length})`}
                  {profilePrimaryTab === 'eq_training' && `已授权项目与配额 (${profileUserMemberships.length})`}
                </span>
              </div>

              {/* 子标签 1: 关注仪器表格 */}
              {profilePrimaryTab === 'follow' && (
                <table className="w-full border-collapse border border-slate-200 text-xs">
                  <thead className="bg-slate-100 text-slate-700 border-b border-slate-300">
                    <tr>
                      <th className="py-2 px-3 text-left w-10">#</th>
                      <th className="py-2 px-3 text-left">仪器名称</th>
                      <th className="py-2 px-3 text-center">控制 / 电流状态</th>
                      <th className="py-2 px-3 text-center">当前使用者</th>
                      <th className="py-2 px-3 text-left">放置地点</th>
                      <th className="py-2 px-3 text-left">联系人</th>
                      <th className="py-2 px-3 text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {data.devices.map((dev) => {
                      const activeRes = data.reservations.find(
                        (r) => r.device_id === dev.id && ['RESERVED', 'ACTIVE'].includes(r.status)
                      );
                      return (
                        <tr key={dev.id} className="hover:bg-blue-50/40">
                          <td className="py-2.5 px-3">
                            <div className="w-8 h-8 rounded bg-blue-50 border border-blue-200 text-blue-700 flex items-center justify-center font-mono font-bold text-[10px]">
                              {dev.code.split('-')[0]}
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            <button
                              onClick={() => openDeviceDetail(dev.id)}
                              className="font-bold text-blue-700 hover:underline text-left block"
                            >
                              {dev.name}
                            </button>
                            <div className="text-[11px] text-slate-500 font-mono">({dev.code})</div>
                            <div className="mt-1 flex items-center gap-1">
                              <button
                                onClick={() => openDeviceDetail(dev.id, 'reserv')}
                                className="px-1.5 py-0.2 rounded bg-emerald-600 text-white text-[10px] hover:bg-emerald-700"
                              >
                                预约
                              </button>
                              <button
                                onClick={() => {
                                  setSampleForm((prev) => ({
                                    ...prev,
                                    target_dept_id: dev.owner_dept_id,
                                    test_item_name: `${dev.name} 标准测试`,
                                  }));
                                  setSamplePrimaryTab('add');
                                  setActiveModule('samples');
                                }}
                                className="px-1.5 py-0.2 rounded bg-amber-500 text-white text-[10px] hover:bg-amber-600"
                              >
                                送样
                              </button>
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-[11px] font-mono ${
                                dev.status === 'IDLE'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : dev.status === 'FAULT'
                                  ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                  : 'bg-blue-50 text-blue-700 border border-blue-200'
                              }`}
                            >
                              {dev.status} ({dev.current_amps}A)
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-center text-slate-600">
                            {activeRes ? activeRes.operator_name : '--'}
                          </td>
                          <td className="py-2.5 px-3 text-slate-600">
                            实验中心 · {dev.owner_dept_name}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="text-blue-700">林总工, 张教授</span>
                          </td>
                          <td className="py-2.5 px-3 text-right whitespace-nowrap">
                            <button
                              onClick={() => openDeviceDetail(dev.id)}
                              className="text-blue-700 hover:underline"
                            >
                              详情
                            </button>
                            <span className="mx-1.5 text-slate-300">•</span>
                            <button
                              onClick={() => openDeviceDetail(dev.id, 'reserv')}
                              className="text-blue-700 hover:underline"
                            >
                              预约
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}

              {/* 子标签 2/3/4: 进出记录 / 仪器使用 / 仪器预约 */}
              {['dc_record', 'eq_record', 'eq_reserv'].includes(profilePrimaryTab) && (
                <table className="w-full border-collapse border border-slate-200 text-xs">
                  <thead className="bg-slate-100 text-slate-700 border-b border-slate-300">
                    <tr>
                      <th className="py-2 px-3 text-left">单号</th>
                      <th className="py-2 px-3 text-left">仪器编号/名称</th>
                      <th className="py-2 px-3 text-left">关联项目</th>
                      <th className="py-2 px-3 text-left">起止时间</th>
                      <th className="py-2 px-3 text-left">预约/有效时长</th>
                      <th className="py-2 px-3 text-left">费率/金额</th>
                      <th className="py-2 px-3 text-left">状态</th>
                      <th className="py-2 px-3 text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {profileUserReservations.map((r) => (
                      <tr key={r.id} className="hover:bg-blue-50/40">
                        <td className="py-2 px-3 font-mono">#{r.id}</td>
                        <td className="py-2 px-3 font-semibold text-blue-700">{r.device_code}</td>
                        <td className="py-2 px-3 font-mono">{r.project_code}</td>
                        <td className="py-2 px-3 font-mono text-[11px] text-slate-500">
                          {r.start_time.slice(0, 16).replace('T', ' ')}
                        </td>
                        <td className="py-2 px-3 font-mono">
                          {r.reserved_hours}h / {r.actual_active_hours}h
                        </td>
                        <td className="py-2 px-3 font-mono">
                          [{r.rate_type}] ¥{r.status === 'COMPLETED' ? r.settled_amount : r.hold_amount}
                        </td>
                        <td className="py-2 px-3 font-mono">{r.status}</td>
                        <td className="py-2 px-3 text-right">
                          {r.status === 'RESERVED' && (
                            <button
                              onClick={() => handleCheckin(r.id)}
                              className="text-emerald-700 hover:underline mr-2 font-semibold"
                            >
                              上机签到
                            </button>
                          )}
                          {r.status !== 'COMPLETED' && (
                            <button
                              onClick={() => handleCheckout(r.id, r.actual_active_hours)}
                              className="text-blue-700 hover:underline font-semibold"
                            >
                              下机结算
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {/* 子标签 5: 仪器送样 */}
              {profilePrimaryTab === 'eq_sample' && (
                <table className="w-full border-collapse border border-slate-200 text-xs">
                  <thead className="bg-slate-100 text-slate-700 border-b border-slate-300">
                    <tr>
                      <th className="py-2 px-3 text-left">样品条码</th>
                      <th className="py-2 px-3 text-left">样品名称</th>
                      <th className="py-2 px-3 text-left">检测项目</th>
                      <th className="py-2 px-3 text-left">承检科室</th>
                      <th className="py-2 px-3 text-left">费用</th>
                      <th className="py-2 px-3 text-left">状态</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {profileUserSamples.map((s) => (
                      <tr key={s.id} className="hover:bg-blue-50/40">
                        <td className="py-2 px-3 font-mono font-semibold text-blue-700">
                          {s.barcode}
                        </td>
                        <td className="py-2 px-3">{s.name}</td>
                        <td className="py-2 px-3">{s.test_item_name}</td>
                        <td className="py-2 px-3">{s.target_dept_name}</td>
                        <td className="py-2 px-3 font-mono">
                          [{s.rate_type}] ¥{s.total_test_fee}
                        </td>
                        <td className="py-2 px-3 font-mono">{s.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {/* 子标签 6: 仪器收费 */}
              {profilePrimaryTab === 'eq_charge' && (
                <table className="w-full border-collapse border border-slate-200 text-xs">
                  <thead className="bg-slate-100 text-slate-700 border-b border-slate-300">
                    <tr>
                      <th className="py-2 px-3 text-left">流水号</th>
                      <th className="py-2 px-3 text-left">类型</th>
                      <th className="py-2 px-3 text-left">项目账号</th>
                      <th className="py-2 px-3 text-left">受益科室</th>
                      <th className="py-2 px-3 text-left">金额</th>
                      <th className="py-2 px-3 text-left">摘要</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {profileUserLedgers.map((l) => (
                      <tr key={l.id} className="hover:bg-blue-50/40">
                        <td className="py-2 px-3 font-mono">{l.idempotency_key}</td>
                        <td className="py-2 px-3 font-mono">{l.tx_type}</td>
                        <td className="py-2 px-3 font-mono">{l.project_code}</td>
                        <td className="py-2 px-3">{l.beneficiary_dept_name}</td>
                        <td className="py-2 px-3 font-mono font-bold">¥{l.amount}</td>
                        <td className="py-2 px-3 text-slate-600">{l.memo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {/* 子标签 7: 仪器培训 / 项目授权 */}
              {profilePrimaryTab === 'eq_training' && (
                <table className="w-full border-collapse border border-slate-200 text-xs">
                  <thead className="bg-slate-100 text-slate-700 border-b border-slate-300">
                    <tr>
                      <th className="py-2 px-3 text-left">授权项目编号</th>
                      <th className="py-2 px-3 text-left">项目内角色</th>
                      <th className="py-2 px-3 text-left">个人配额上限</th>
                      <th className="py-2 px-3 text-left">已使用配额</th>
                      <th className="py-2 px-3 text-left">剩余可用配额</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {profileUserMemberships.map((pm) => (
                      <tr key={pm.id} className="hover:bg-blue-50/40">
                        <td className="py-2 px-3 font-mono font-bold text-blue-700">
                          {pm.project_code}
                        </td>
                        <td className="py-2 px-3 font-mono">{pm.project_role}</td>
                        <td className="py-2 px-3 font-mono">¥{pm.spending_limit}</td>
                        <td className="py-2 px-3 font-mono text-amber-700">¥{pm.used_quota}</td>
                        <td className="py-2 px-3 font-mono text-emerald-700 font-bold">
                          ¥{(Number(pm.spending_limit) - Number(pm.used_quota)).toFixed(4)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* ==================== 模块 2：仪器目录 (!equipments/index & 仪器详情) ==================== */}
          {activeModule === 'equipments' && (
            <div className="space-y-3">
              {/* 一级 Tab */}
              <div className="border-b border-slate-300 flex flex-wrap items-center gap-1 pt-1">
                {[
                  { id: 'list', label: '仪器列表' },
                  { id: 'records', label: '所有仪器的使用记录' },
                  { id: 'reserv', label: '仪器预约管理' },
                  { id: 'map', label: '实验室平面图监控' },
                  ...(canCreateDevice(currentOperator) || editingDeviceId
                    ? [{ id: 'upsert_device', label: editingDeviceId ? '修改仪器信息' : '添加新仪器' }]
                    : []),
                ].map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      if (t.id !== 'upsert_device') setEditingDeviceId(null);
                      setEqPrimaryTab(t.id);
                    }}
                    className={`px-4 py-1.5 rounded-t border border-b-0 font-medium ${
                      eqPrimaryTab === t.id
                        ? 'bg-white border-slate-300 text-blue-700 font-bold -mb-px'
                        : 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
                {eqPrimaryTab === 'detail' && selectedDevice && (
                  <button className="px-4 py-1.5 rounded-t border border-b-0 border-slate-300 bg-white text-blue-700 font-bold -mb-px">
                    {selectedDevice.name} ({selectedDevice.code})
                  </button>
                )}
              </div>

              {/* 视图 2-Upsert: 添加 / 修改仪器表单 */}
              {eqPrimaryTab === 'upsert_device' && (
                <form
                  onSubmit={handleSaveDevice}
                  className="max-w-xl p-4 bg-slate-50 border border-slate-200 rounded space-y-3"
                >
                  <div className="font-bold text-slate-800 border-b border-slate-200 pb-2">
                    {editingDeviceId ? `修改仪器配置 (#${editingDeviceId})` : '添加新仪器设备'}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-600 mb-1">仪器资产编号 *</label>
                      <input
                        type="text"
                        value={deviceForm.code}
                        onChange={(e) => setDeviceForm({ ...deviceForm, code: e.target.value })}
                        className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-white font-mono"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 mb-1">仪器名称 *</label>
                      <input
                        type="text"
                        value={deviceForm.name}
                        onChange={(e) => setDeviceForm({ ...deviceForm, name: e.target.value })}
                        className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-white"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 mb-1">归口行政科室 *</label>
                      <select
                        value={deviceForm.owner_dept_id}
                        onChange={(e) =>
                          setDeviceForm({ ...deviceForm, owner_dept_id: e.target.value })
                        }
                        disabled={currentOperator?.system_role !== 'ADMIN'}
                        className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-white"
                      >
                        {data.departments.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-slate-600 mb-1">设备运行状态</label>
                      <select
                        value={deviceForm.status}
                        onChange={(e) => setDeviceForm({ ...deviceForm, status: e.target.value })}
                        className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-white font-mono"
                      >
                        <option value="IDLE">IDLE (正常空闲)</option>
                        <option value="RESERVED">RESERVED (已预约)</option>
                        <option value="RUNNING">RUNNING (运行中)</option>
                        <option value="FAULT">FAULT (故障停机)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-slate-600 mb-1">科内优惠时薪 (元/h)</label>
                      <input
                        type="number"
                        step="1"
                        value={deviceForm.internal_hourly_rate}
                        onChange={(e) =>
                          setDeviceForm({ ...deviceForm, internal_hourly_rate: e.target.value })
                        }
                        className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 mb-1">跨科标准时薪 (元/h)</label>
                      <input
                        type="number"
                        step="1"
                        value={deviceForm.external_hourly_rate}
                        onChange={(e) =>
                          setDeviceForm({ ...deviceForm, external_hourly_rate: e.target.value })
                        }
                        className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 mb-1">待机电流阈值 (A)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={deviceForm.standby_current_threshold}
                        onChange={(e) =>
                          setDeviceForm({
                            ...deviceForm,
                            standby_current_threshold: e.target.value,
                          })
                        }
                        className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-white font-mono"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-slate-600 mb-1">平面图 X%</label>
                        <input
                          type="number"
                          value={deviceForm.pos_x}
                          onChange={(e) => setDeviceForm({ ...deviceForm, pos_x: e.target.value })}
                          className="w-full border border-slate-300 rounded px-2 py-1.5 bg-white font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-600 mb-1">平面图 Y%</label>
                        <input
                          type="number"
                          value={deviceForm.pos_y}
                          onChange={(e) => setDeviceForm({ ...deviceForm, pos_y: e.target.value })}
                          className="w-full border border-slate-300 rounded px-2 py-1.5 bg-white font-mono"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="submit"
                      className="px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white font-semibold"
                    >
                      {editingDeviceId ? '保存仪器修改' : '确认添加仪器'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingDeviceId(null);
                        setEqPrimaryTab('list');
                      }}
                      className="px-4 py-1.5 rounded border border-slate-300 bg-white text-slate-600"
                    >
                      取消
                    </button>
                  </div>
                </form>
              )}

              {/* 视图 2A: 仪器列表 */}
              {eqPrimaryTab === 'list' && (
                <div className="space-y-2.5">
                  {/* 二级分类 Tab */}
                  <div className="flex flex-wrap gap-1 border-b border-slate-200 pb-2">
                    {[
                      { id: 'all', label: '全部设备' },
                      { id: 'IDLE', label: '正常空闲' },
                      { id: 'RESERVED', label: '已预约' },
                      { id: 'RUNNING', label: '运行中' },
                      { id: 'FAULT', label: '故障设备' },
                    ].map((st) => (
                      <button
                        key={st.id}
                        onClick={() => setEqSecondaryTab(st.id)}
                        className={`px-3 py-1 rounded text-xs ${
                          eqSecondaryTab === st.id
                            ? 'bg-blue-600 text-white font-semibold'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {st.label}
                      </button>
                    ))}
                  </div>

                  {/* 工具条 (panel) */}
                  <div className="bg-slate-100 border border-slate-200 p-2 rounded flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      {canCreateDevice(currentOperator) && (
                        <button
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
                          className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-medium flex items-center gap-1"
                        >
                          <Plus className="w-3.5 h-3.5" /> 添加仪器
                        </button>
                      )}
                      <button
                        onClick={() => setEqPrimaryTab('reserv')}
                        className="px-3 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white font-medium flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" /> 预约登记
                      </button>
                      <button
                        onClick={() => setShowEqSearch(!showEqSearch)}
                        className="px-3 py-1 rounded border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 flex items-center gap-1"
                      >
                        <Search className="w-3.5 h-3.5" /> 搜索筛选
                      </button>
                      <button
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
                        className="px-3 py-1 rounded border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 flex items-center gap-1"
                      >
                        <Download className="w-3.5 h-3.5" /> 导出Excel
                      </button>
                      <button
                        onClick={() => window.print()}
                        className="px-3 py-1 rounded border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 flex items-center gap-1"
                      >
                        <Printer className="w-3.5 h-3.5" /> 打印
                      </button>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-slate-600">
                      <span>
                        共有 <strong className="text-blue-700">{data.devices.length}</strong> 台仪器,{' '}
                        <strong className="text-emerald-700">
                          {data.devices.filter((d) => d.status === 'RUNNING').length}
                        </strong>{' '}
                        台正在使用
                      </span>
                      <input
                        type="text"
                        placeholder="仪器名称或编号..."
                        value={eqSearchKeyword}
                        onChange={(e) => setEqSearchKeyword(e.target.value)}
                        className="border border-slate-300 rounded px-2 py-1 bg-white w-40"
                      />
                    </div>
                  </div>

                  {/* 展开式多条件搜索面板 */}
                  {showEqSearch && (
                    <div className="p-3 bg-slate-50 border border-slate-300 rounded grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-slate-600 mb-1">归口组织机构</label>
                        <select
                          value={eqSearchDeptId}
                          onChange={(e) => setEqSearchDeptId(e.target.value)}
                          className="w-full border border-slate-300 rounded px-2 py-1 bg-white"
                        >
                          <option value="0">全部机构</option>
                          {data.departments.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-slate-600 mb-1">仪器名称/编号</label>
                        <input
                          type="text"
                          value={eqSearchKeyword}
                          onChange={(e) => setEqSearchKeyword(e.target.value)}
                          className="w-full border border-slate-300 rounded px-2 py-1 bg-white"
                        />
                      </div>
                      <div className="flex items-end gap-2">
                        <button
                          onClick={() => {
                            setEqSearchDeptId('0');
                            setEqSearchKeyword('');
                          }}
                          className="px-3 py-1 rounded border border-slate-300 bg-white text-slate-600"
                        >
                          重置条件
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 仪器目录主表 */}
                  <table className="w-full border-collapse border border-slate-200 text-xs">
                    <thead className="bg-slate-100 text-slate-700 border-b border-slate-300">
                      <tr>
                        <th className="py-2 px-3 text-left w-12">图标</th>
                        <th className="py-2 px-3 text-left">仪器名称 / 编号</th>
                        <th className="py-2 px-3 text-center">控制与电流</th>
                        <th className="py-2 px-3 text-left">收费标准 (科内 / 跨科)</th>
                        <th className="py-2 px-3 text-center">当前使用者</th>
                        <th className="py-2 px-3 text-left">放置地点</th>
                        <th className="py-2 px-3 text-right">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {filteredDevices.map((dev) => {
                        const isInternal = currentOperator?.home_dept_id === dev.owner_dept_id;
                        const activeRes = data.reservations.find(
                          (r) => r.device_id === dev.id && ['RESERVED', 'ACTIVE'].includes(r.status)
                        );
                        return (
                          <tr key={dev.id} className="hover:bg-blue-50/40">
                            <td className="py-2.5 px-3">
                              <div className="w-8 h-8 rounded bg-blue-50 border border-blue-200 text-blue-700 flex items-center justify-center font-mono font-bold text-[10px]">
                                {dev.code.split('-')[0]}
                              </div>
                            </td>
                            <td className="py-2.5 px-3">
                              <button
                                onClick={() => openDeviceDetail(dev.id)}
                                className="font-bold text-blue-700 hover:underline text-left"
                              >
                                {dev.name}
                              </button>
                              <div className="text-[11px] text-slate-500 font-mono">
                                ({dev.code})
                              </div>
                              <div className="mt-1 flex gap-1">
                                <button
                                  onClick={() => openDeviceDetail(dev.id, 'reserv')}
                                  className="px-1.5 py-0.2 rounded bg-emerald-600 text-white text-[10px]"
                                >
                                  预约
                                </button>
                                <button
                                  onClick={() => {
                                    setSampleForm((prev) => ({
                                      ...prev,
                                      target_dept_id: dev.owner_dept_id,
                                      test_item_name: `${dev.name} 送样检测`,
                                    }));
                                    setSamplePrimaryTab('add');
                                    setActiveModule('samples');
                                  }}
                                  className="px-1.5 py-0.2 rounded bg-amber-500 text-white text-[10px]"
                                >
                                  送样
                                </button>
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-center font-mono">
                              <span
                                className={`px-2 py-0.5 rounded border text-[11px] ${
                                  dev.status === 'IDLE'
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : dev.status === 'FAULT'
                                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                                    : 'bg-blue-50 text-blue-700 border-blue-200'
                                }`}
                              >
                                {dev.status} · {dev.current_amps}A
                              </span>
                            </td>
                            <td className="py-2.5 px-3 font-mono">
                              <div>
                                科内: ¥{dev.internal_hourly_rate}/h | 跨科: ¥{dev.external_hourly_rate}/h
                              </div>
                              <div className="text-[11px] text-blue-700">
                                当前适用: {isInternal ? `科内价 ¥${dev.internal_hourly_rate}/h` : `跨科价 ¥${dev.external_hourly_rate}/h`}
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              {activeRes ? activeRes.operator_name : '--'}
                            </td>
                            <td className="py-2.5 px-3 text-slate-600">
                              实验中心 · {dev.owner_dept_name}
                            </td>
                            <td className="py-2.5 px-3 text-right whitespace-nowrap">
                              <button
                                onClick={() => openDeviceDetail(dev.id)}
                                className="text-blue-700 hover:underline"
                              >
                                查看
                              </button>
                              {canEditDevice(currentOperator, dev) && (
                                <>
                                  <span className="mx-1.5 text-slate-300">•</span>
                                  <button
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
                                    className="text-blue-700 hover:underline"
                                  >
                                    修改
                                  </button>
                                </>
                              )}
                              {canDeleteDevice(currentOperator, dev) && (
                                <>
                                  <span className="mx-1.5 text-slate-300">•</span>
                                  <button
                                    onClick={() => handleDeleteDevice(dev)}
                                    className="text-rose-600 hover:underline"
                                  >
                                    删除
                                  </button>
                                </>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* 视图 2B: 单台仪器详情页 (对标 /lims/!equipments/equipment/index.113) */}
              {eqPrimaryTab === 'detail' && selectedDevice && (
                <div className="space-y-3">
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded flex flex-wrap items-start gap-4">
                    <div className="w-16 h-16 rounded bg-blue-600 text-white flex items-center justify-center font-mono font-bold text-sm shrink-0">
                      {selectedDevice.code}
                    </div>
                    <div className="flex-1 space-y-1.5">
                      <div className="flex items-baseline gap-2">
                        <h2 className="text-base font-bold text-slate-900">
                          {selectedDevice.name}
                        </h2>
                        <span className="text-slate-500">({selectedDevice.status})</span>
                      </div>
                      <div className="text-slate-600">
                        归属组织: 所内用户 » 集约化中心 »{' '}
                        <span className="text-blue-700 font-medium">
                          {selectedDevice.owner_dept_name}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2 pt-1">
                        {[
                          { num: 12, unit: '人', label: '关注者' },
                          { num: data.users.length, unit: '人', label: '授权使用者' },
                          {
                            num: data.reservations.filter((r) => r.device_id === selectedDevice.id)
                              .length,
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
                        ].map((st, i) => (
                          <div
                            key={i}
                            className="w-24 border border-slate-300 bg-white rounded px-2.5 py-1 text-center"
                          >
                            <div className="text-sm font-bold text-blue-700">
                              {st.num}{' '}
                              <span className="text-[10px] font-normal text-slate-500">
                                {st.unit}
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-600">{st.label}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* 仪器详情子标签 */}
                  <div className="border-b border-slate-300 flex gap-1">
                    {[
                      { id: 'dashboard', label: '常规信息' },
                      { id: 'reserv', label: '使用预约' },
                      { id: 'records', label: '使用记录与结算' },
                    ].map((t) => (
                      <button
                        key={t.id}
                        onClick={() => setEqDetailTab(t.id)}
                        className={`px-3.5 py-1.5 rounded-t border border-b-0 ${
                          eqDetailTab === t.id
                            ? 'bg-white border-slate-300 text-blue-700 font-bold -mb-px'
                            : 'bg-slate-100 border-slate-200 text-slate-600'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>

                  {eqDetailTab === 'dashboard' && (
                    <table className="w-full max-w-2xl border border-slate-200 text-xs">
                      <tbody className="divide-y divide-slate-200">
                        <tr>
                          <td className="py-2 px-3 bg-slate-50 font-semibold w-36">仪器编号</td>
                          <td className="py-2 px-3 font-mono">{selectedDevice.code}</td>
                          <td className="py-2 px-3 bg-slate-50 font-semibold w-36">当前运行状态</td>
                          <td className="py-2 px-3 font-mono">{selectedDevice.status}</td>
                        </tr>
                        <tr>
                          <td className="py-2 px-3 bg-slate-50 font-semibold">待机电流阈值</td>
                          <td className="py-2 px-3 font-mono">
                            {selectedDevice.standby_current_threshold} A
                          </td>
                          <td className="py-2 px-3 bg-slate-50 font-semibold">当前实时电流</td>
                          <td className="py-2 px-3 font-mono text-blue-700 font-bold">
                            {selectedDevice.current_amps} A
                          </td>
                        </tr>
                        <tr>
                          <td className="py-2 px-3 bg-slate-50 font-semibold">科内机时单价</td>
                          <td className="py-2 px-3 font-mono">
                            ¥{selectedDevice.internal_hourly_rate} / 小时
                          </td>
                          <td className="py-2 px-3 bg-slate-50 font-semibold">跨科协同单价</td>
                          <td className="py-2 px-3 font-mono">
                            ¥{selectedDevice.external_hourly_rate} / 小时
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  )}

                  {eqDetailTab === 'reserv' && (
                    <form
                      onSubmit={handleCreateReservation}
                      className="max-w-lg p-4 bg-slate-50 border border-slate-200 rounded space-y-3"
                    >
                      <div className="font-bold text-slate-800">
                        预约仪器：{selectedDevice.name} ({selectedDevice.code})
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-slate-600 mb-1">几小时后开始</label>
                          <input
                            type="number"
                            step="0.5"
                            value={resForm.hours_from_now}
                            onChange={(e) =>
                              setResForm({ ...resForm, hours_from_now: e.target.value })
                            }
                            className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-white font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-600 mb-1">预约时长 (小时)</label>
                          <input
                            type="number"
                            step="0.5"
                            min="0.5"
                            value={resForm.duration_hours}
                            onChange={(e) =>
                              setResForm({ ...resForm, duration_hours: e.target.value })
                            }
                            className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-white font-mono"
                          />
                        </div>
                      </div>
                      <button
                        type="submit"
                        className="px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white font-semibold"
                      >
                        提交预约并冻结预算
                      </button>
                    </form>
                  )}

                  {eqDetailTab === 'records' && (
                    <table className="w-full border-collapse border border-slate-200 text-xs">
                      <thead className="bg-slate-100 border-b border-slate-300">
                        <tr>
                          <th className="py-2 px-3 text-left">单号</th>
                          <th className="py-2 px-3 text-left">使用人</th>
                          <th className="py-2 px-3 text-left">项目</th>
                          <th className="py-2 px-3 text-left">预约/有效机时</th>
                          <th className="py-2 px-3 text-left">冻结/实结金额</th>
                          <th className="py-2 px-3 text-left">状态</th>
                          <th className="py-2 px-3 text-right">操作</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {data.reservations
                          .filter((r) => r.device_id === selectedDevice.id)
                          .map((r) => (
                            <tr key={r.id}>
                              <td className="py-2 px-3 font-mono">#{r.id}</td>
                              <td className="py-2 px-3">{r.operator_name}</td>
                              <td className="py-2 px-3 font-mono">{r.project_code}</td>
                              <td className="py-2 px-3 font-mono">
                                {r.reserved_hours}h / {r.actual_active_hours}h
                              </td>
                              <td className="py-2 px-3 font-mono">
                                ¥{r.hold_amount} / ¥{r.settled_amount}
                              </td>
                              <td className="py-2 px-3 font-mono">{r.status}</td>
                              <td className="py-2 px-3 text-right">
                                {r.status === 'RESERVED' && (
                                  <button
                                    onClick={() => handleCheckin(r.id)}
                                    className="text-emerald-700 hover:underline mr-2"
                                  >
                                    签到
                                  </button>
                                )}
                                {r.status !== 'COMPLETED' && (
                                  <button
                                    onClick={() => handleCheckout(r.id, r.actual_active_hours)}
                                    className="text-blue-700 hover:underline"
                                  >
                                    下机结算
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* 视图 2C: 所有仪器的使用记录 / 预约管理 */}
              {(eqPrimaryTab === 'records' || eqPrimaryTab === 'reserv') && (
                <div className="space-y-4">
                  {eqPrimaryTab === 'reserv' && (
                    <form
                      onSubmit={handleCreateReservation}
                      className="p-3.5 bg-slate-50 border border-slate-200 rounded flex flex-wrap items-end gap-3"
                    >
                      <div>
                        <label className="block text-slate-600 mb-1">预约仪器</label>
                        <select
                          value={resForm.device_id}
                          onChange={(e) => setResForm({ ...resForm, device_id: e.target.value })}
                          className="border border-slate-300 rounded px-2.5 py-1.5 bg-white"
                        >
                          {data.devices.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.code} - {d.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-slate-600 mb-1">几小时后开始</label>
                        <input
                          type="number"
                          step="0.5"
                          value={resForm.hours_from_now}
                          onChange={(e) =>
                            setResForm({ ...resForm, hours_from_now: e.target.value })
                          }
                          className="w-28 border border-slate-300 rounded px-2.5 py-1.5 bg-white font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-600 mb-1">预约时长(h)</label>
                        <input
                          type="number"
                          step="0.5"
                          min="0.5"
                          value={resForm.duration_hours}
                          onChange={(e) =>
                            setResForm({ ...resForm, duration_hours: e.target.value })
                          }
                          className="w-28 border border-slate-300 rounded px-2.5 py-1.5 bg-white font-mono"
                        />
                      </div>
                      <button
                        type="submit"
                        className="px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white font-semibold"
                      >
                        提交预约
                      </button>
                    </form>
                  )}

                  <table className="w-full border-collapse border border-slate-200 text-xs">
                    <thead className="bg-slate-100 text-slate-700 border-b border-slate-300">
                      <tr>
                        <th className="py-2 px-3 text-left">记录号</th>
                        <th className="py-2 px-3 text-left">仪器编号</th>
                        <th className="py-2 px-3 text-left">操作人</th>
                        <th className="py-2 px-3 text-left">结算项目</th>
                        <th className="py-2 px-3 text-left">预约时长</th>
                        <th className="py-2 px-3 text-left">实际有效时长</th>
                        <th className="py-2 px-3 text-left">单价 / 费率</th>
                        <th className="py-2 px-3 text-left">冻结 / 实扣</th>
                        <th className="py-2 px-3 text-left">状态</th>
                        <th className="py-2 px-3 text-right">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {data.reservations.map((r) => (
                        <tr key={r.id} className="hover:bg-blue-50/40">
                          <td className="py-2 px-3 font-mono">#{r.id}</td>
                          <td className="py-2 px-3 font-mono font-bold text-blue-700">
                            {r.device_code}
                          </td>
                          <td className="py-2 px-3">{r.operator_name}</td>
                          <td className="py-2 px-3 font-mono">{r.project_code}</td>
                          <td className="py-2 px-3 font-mono">{r.reserved_hours}h</td>
                          <td className="py-2 px-3 font-mono">
                            {r.status === 'COMPLETED' ? (
                              `${r.actual_active_hours}h`
                            ) : (
                              <input
                                type="number"
                                step="0.25"
                                value={checkoutHoursMap[r.id] ?? r.actual_active_hours}
                                onChange={(e) =>
                                  setCheckoutHoursMap({
                                    ...checkoutHoursMap,
                                    [r.id]: e.target.value,
                                  })
                                }
                                className="w-20 border border-slate-300 rounded px-1.5 py-0.5 font-mono"
                              />
                            )}
                          </td>
                          <td className="py-2 px-3 font-mono">
                            ¥{r.applied_rate}/h ({r.rate_type})
                          </td>
                          <td className="py-2 px-3 font-mono">
                            ¥{r.hold_amount} /{' '}
                            <strong className="text-emerald-700">¥{r.settled_amount}</strong>
                          </td>
                          <td className="py-2 px-3 font-mono">{r.status}</td>
                          <td className="py-2 px-3 text-right whitespace-nowrap">
                            {r.status === 'RESERVED' && (
                              <button
                                onClick={() => handleCheckin(r.id)}
                                className="px-2 py-0.5 rounded bg-emerald-600 text-white mr-1.5"
                              >
                                签到
                              </button>
                            )}
                            {r.status !== 'COMPLETED' && (
                              <button
                                onClick={() => handleCheckout(r.id, r.actual_active_hours)}
                                className="px-2 py-0.5 rounded bg-blue-600 text-white mr-1.5"
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
                                onClick={() => handleCancelOrDeleteReservation(r)}
                                className="px-2 py-0.5 rounded border border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100"
                              >
                                {r.status === 'RESERVED' ? '取消预约' : '删除'}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* 视图 2D: 实验室 2D 平面图监控 */}
              {eqPrimaryTab === 'map' && (
                <div className="relative h-96 w-full rounded border border-slate-300 bg-[#f8fafc] bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:20px_20px] overflow-hidden">
                  {data.devices.map((dev) => (
                    <div
                      key={dev.id}
                      style={{ left: `${dev.pos_x}%`, top: `${dev.pos_y}%` }}
                      onClick={() => openDeviceDetail(dev.id)}
                      className="cursor-pointer absolute -translate-x-1/2 -translate-y-1/2 w-52 p-2.5 rounded bg-white border border-slate-300 shadow hover:border-blue-600"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-blue-700">{dev.code}</span>
                        <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-slate-100 border">
                          {dev.status}
                        </span>
                      </div>
                      <div className="font-semibold text-slate-800 truncate mt-0.5">{dev.name}</div>
                      <div className="text-[11px] text-slate-500">{dev.owner_dept_name}</div>
                      <div className="mt-1 pt-1 border-t border-slate-100 flex justify-between font-mono text-[11px]">
                        <span className="text-blue-700">电流: {dev.current_amps}A</span>
                        <span>¥{dev.internal_hourly_rate}/h</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ==================== 模块 3：测样报告审核 (!samples) ==================== */}
          {activeModule === 'samples' && (
            <div className="space-y-3">
              <div className="border-b border-slate-300 flex gap-1 pt-1">
                {[
                  { id: 'list', label: '送样检测台账' },
                  { id: 'add', label: '登记新送样' },
                  { id: 'coa', label: '测样报告(COA)签发' },
                ].map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setSamplePrimaryTab(t.id)}
                    className={`px-4 py-1.5 rounded-t border border-b-0 font-medium ${
                      samplePrimaryTab === t.id
                        ? 'bg-white border-slate-300 text-blue-700 font-bold -mb-px'
                        : 'bg-slate-100 border-slate-200 text-slate-600'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {samplePrimaryTab === 'list' && (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between bg-slate-100 border border-slate-200 p-2 rounded">
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => setSamplePrimaryTab('add')}
                        className="px-3 py-1 rounded bg-blue-600 text-white font-medium flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" /> 添加送样
                      </button>
                      <button
                        onClick={() => setSamplePrimaryTab('coa')}
                        className="px-3 py-1 rounded border border-slate-300 bg-white text-slate-700"
                      >
                        签发COA报告
                      </button>
                    </div>
                    <span>
                      共有 <strong className="text-blue-700">{data.samples.length}</strong> 份送检样品
                    </span>
                  </div>

                  <table className="w-full border-collapse border border-slate-200 text-xs">
                    <thead className="bg-slate-100 border-b border-slate-300">
                      <tr>
                        <th className="py-2 px-3 text-left">条码编号</th>
                        <th className="py-2 px-3 text-left">样品名称</th>
                        <th className="py-2 px-3 text-left">检测项目</th>
                        <th className="py-2 px-3 text-left">送检人 / 项目</th>
                        <th className="py-2 px-3 text-left">承检科室</th>
                        <th className="py-2 px-3 text-left">收费金额</th>
                        <th className="py-2 px-3 text-left">状态</th>
                        <th className="py-2 px-3 text-left">COA 检测报告指标</th>
                        <th className="py-2 px-3 text-right">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {data.samples.map((s) => (
                        <tr key={s.id} className="hover:bg-blue-50/40">
                          <td className="py-2 px-3 font-mono font-bold text-blue-700">
                            {s.barcode}
                          </td>
                          <td className="py-2 px-3 font-semibold">{s.name}</td>
                          <td className="py-2 px-3">
                            {s.test_item_name} (x{s.sample_count})
                          </td>
                          <td className="py-2 px-3">
                            {s.submitter_name} ({s.project_code})
                          </td>
                          <td className="py-2 px-3">{s.target_dept_name}</td>
                          <td className="py-2 px-3 font-mono">
                            [{s.rate_type}] ¥{s.total_test_fee}
                          </td>
                          <td className="py-2 px-3 font-mono">{s.status}</td>
                          <td className="py-2 px-3 font-mono text-[11px]">
                            {s.coa_accessible ? (
                              <span className="text-emerald-700">
                                {JSON.stringify(s.coa_metrics)}
                              </span>
                            ) : (
                              <span className="text-rose-600 flex items-center gap-1 font-sans">
                                <Lock className="w-3 h-3" /> 保密项目数据隔离
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-right whitespace-nowrap">
                            <button
                              onClick={() => {
                                setCoaSampleId(s.id);
                                setSamplePrimaryTab('coa');
                              }}
                              className="text-blue-700 hover:underline mr-2"
                            >
                              {s.status === 'COMPLETED' ? '重签COA' : '签发COA'}
                            </button>
                            {canDeleteSample(currentOperator, s, data.projects) && (
                              <button
                                onClick={() => handleDeleteSample(s)}
                                className="text-rose-600 hover:underline"
                              >
                                {s.status === 'REGISTERED' ? '撤回送样' : '删除'}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {samplePrimaryTab === 'add' && (
                <form
                  onSubmit={handleCreateSample}
                  className="max-w-xl p-4 bg-slate-50 border border-slate-200 rounded space-y-3"
                >
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-600 mb-1">样品名称 *</label>
                      <input
                        type="text"
                        value={sampleForm.name}
                        onChange={(e) => setSampleForm({ ...sampleForm, name: e.target.value })}
                        className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-white"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 mb-1">承检科室 *</label>
                      <select
                        value={sampleForm.target_dept_id}
                        onChange={(e) =>
                          setSampleForm({ ...sampleForm, target_dept_id: e.target.value })
                        }
                        className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-white"
                      >
                        {data.departments.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-slate-600 mb-1">检测项目 *</label>
                      <input
                        type="text"
                        value={sampleForm.test_item_name}
                        onChange={(e) =>
                          setSampleForm({ ...sampleForm, test_item_name: e.target.value })
                        }
                        className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-white"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 mb-1">样品份数</label>
                      <input
                        type="number"
                        min="1"
                        value={sampleForm.sample_count}
                        onChange={(e) =>
                          setSampleForm({ ...sampleForm, sample_count: e.target.value })
                        }
                        className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 mb-1">科内单价 (元)</label>
                      <input
                        type="number"
                        value={sampleForm.internal_test_price}
                        onChange={(e) =>
                          setSampleForm({ ...sampleForm, internal_test_price: e.target.value })
                        }
                        className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 mb-1">跨科单价 (元)</label>
                      <input
                        type="number"
                        value={sampleForm.external_test_price}
                        onChange={(e) =>
                          setSampleForm({ ...sampleForm, external_test_price: e.target.value })
                        }
                        className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-white font-mono"
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded bg-blue-600 text-white font-semibold"
                  >
                    提交送样并扣费
                  </button>
                </form>
              )}

              {samplePrimaryTab === 'coa' && (
                <form
                  onSubmit={handleUpdateCOA}
                  className="max-w-xl p-4 bg-slate-50 border border-slate-200 rounded space-y-3"
                >
                  <div>
                    <label className="block text-slate-600 mb-1">选择样品</label>
                    <select
                      value={coaSampleId}
                      onChange={(e) => setCoaSampleId(e.target.value)}
                      className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-white"
                    >
                      <option value="">-- 请选择 --</option>
                      {data.samples.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.barcode} - {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-1">检测结果指标 (JSON)</label>
                    <textarea
                      rows={3}
                      value={coaJsonText}
                      onChange={(e) => setCoaJsonText(e.target.value)}
                      className="w-full border border-slate-300 rounded p-2 bg-white font-mono"
                    />
                  </div>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded bg-emerald-600 text-white font-semibold"
                  >
                    签发测样报告
                  </button>
                </form>
              )}
            </div>
          )}

          {/* ==================== 模块 4：耗材管理 (!consumables) ==================== */}
          {activeModule === 'consumables' && (
            <div className="space-y-3">
              <div className="border-b border-slate-300 flex gap-1 pt-1">
                <button
                  onClick={() => {
                    setEditingConsumableId(null);
                    setConsPrimaryTab('list');
                  }}
                  className={`px-4 py-1.5 rounded-t border border-b-0 font-medium ${
                    consPrimaryTab === 'list'
                      ? 'bg-white border-slate-300 text-blue-700 font-bold -mb-px'
                      : 'bg-slate-100 border-slate-200 text-slate-600'
                  }`}
                >
                  耗材库存台账
                </button>
                {(canCreateConsumable(currentOperator) || editingConsumableId) && (
                  <button
                    onClick={() => setConsPrimaryTab('upsert')}
                    className={`px-4 py-1.5 rounded-t border border-b-0 font-medium ${
                      consPrimaryTab === 'upsert'
                        ? 'bg-white border-slate-300 text-blue-700 font-bold -mb-px'
                        : 'bg-slate-100 border-slate-200 text-slate-600'
                    }`}
                  >
                    {editingConsumableId ? '修改耗材/补货' : '添加新耗材'}
                  </button>
                )}
              </div>

              {consPrimaryTab === 'upsert' ? (
                <form
                  onSubmit={handleSaveConsumable}
                  className="max-w-xl p-4 bg-slate-50 border border-slate-200 rounded space-y-3"
                >
                  <div className="font-bold text-slate-800 border-b border-slate-200 pb-2">
                    {editingConsumableId ? '修改耗材信息 / 库存补货' : '新增试剂耗材品类'}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-600 mb-1">耗材编码 *</label>
                      <input
                        type="text"
                        value={consumableForm.code}
                        onChange={(e) =>
                          setConsumableForm({ ...consumableForm, code: e.target.value })
                        }
                        className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-white font-mono"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 mb-1">耗材名称 *</label>
                      <input
                        type="text"
                        value={consumableForm.name}
                        onChange={(e) =>
                          setConsumableForm({ ...consumableForm, name: e.target.value })
                        }
                        className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-white"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 mb-1">规格型号 *</label>
                      <input
                        type="text"
                        value={consumableForm.spec}
                        onChange={(e) =>
                          setConsumableForm({ ...consumableForm, spec: e.target.value })
                        }
                        className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-white"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 mb-1">归口行政科室</label>
                      <select
                        value={consumableForm.owner_dept_id}
                        onChange={(e) =>
                          setConsumableForm({ ...consumableForm, owner_dept_id: e.target.value })
                        }
                        disabled={currentOperator?.system_role !== 'ADMIN'}
                        className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-white"
                      >
                        {data.departments.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-slate-600 mb-1">当前库存余量</label>
                      <input
                        type="number"
                        step="1"
                        value={consumableForm.stock_qty}
                        onChange={(e) =>
                          setConsumableForm({ ...consumableForm, stock_qty: e.target.value })
                        }
                        className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 mb-1">安全库存阈值</label>
                      <input
                        type="number"
                        step="1"
                        value={consumableForm.safety_threshold}
                        onChange={(e) =>
                          setConsumableForm({
                            ...consumableForm,
                            safety_threshold: e.target.value,
                          })
                        }
                        className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 mb-1">科内领用单价 (元)</label>
                      <input
                        type="number"
                        step="1"
                        value={consumableForm.internal_unit_price}
                        onChange={(e) =>
                          setConsumableForm({
                            ...consumableForm,
                            internal_unit_price: e.target.value,
                          })
                        }
                        className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 mb-1">跨科领用单价 (元)</label>
                      <input
                        type="number"
                        step="1"
                        value={consumableForm.external_unit_price}
                        onChange={(e) =>
                          setConsumableForm({
                            ...consumableForm,
                            external_unit_price: e.target.value,
                          })
                        }
                        className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-white font-mono"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      className="px-4 py-1.5 rounded bg-blue-600 text-white font-semibold"
                    >
                      保存耗材
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingConsumableId(null);
                        setConsPrimaryTab('list');
                      }}
                      className="px-4 py-1.5 rounded border border-slate-300 bg-white text-slate-600"
                    >
                      取消
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <form
                    onSubmit={handleClaimConsumable}
                    className="p-3 bg-slate-100 border border-slate-200 rounded flex flex-wrap items-end justify-between gap-3"
                  >
                    <div className="flex flex-wrap items-end gap-3">
                      <div>
                        <label className="block text-slate-600 mb-1">选择领用耗材</label>
                        <select
                          value={claimForm.consumable_id}
                          onChange={(e) =>
                            setClaimForm({ ...claimForm, consumable_id: e.target.value })
                          }
                          className="border border-slate-300 rounded px-2.5 py-1.5 bg-white"
                        >
                          {data.consumables.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.code} - {c.name} (余量:{c.stock_qty})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-slate-600 mb-1">领用数量</label>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={claimForm.quantity}
                          onChange={(e) => setClaimForm({ ...claimForm, quantity: e.target.value })}
                          className="w-28 border border-slate-300 rounded px-2.5 py-1.5 bg-white font-mono"
                        />
                      </div>
                      <button
                        type="submit"
                        className="px-4 py-1.5 rounded bg-blue-600 text-white font-semibold"
                      >
                        确认领用并记账
                      </button>
                    </div>
                    {canCreateConsumable(currentOperator) && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingConsumableId(null);
                          setConsumableForm({
                            code: 'CONS-STD-01',
                            name: '色谱级甲醇标准试剂',
                            spec: '4L / 瓶',
                            owner_dept_id: currentOperator?.home_dept_id || 1,
                            stock_qty: '30.0000',
                            safety_threshold: '8.0000',
                            internal_unit_price: '120.0000',
                            external_unit_price: '200.0000',
                          });
                          setConsPrimaryTab('upsert');
                        }}
                        className="px-3 py-1.5 rounded bg-emerald-600 text-white font-medium flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" /> 添加耗材品类
                      </button>
                    )}
                  </form>

                  <table className="w-full border-collapse border border-slate-200 text-xs">
                    <thead className="bg-slate-100 border-b border-slate-300">
                      <tr>
                        <th className="py-2 px-3 text-left">耗材编号</th>
                        <th className="py-2 px-3 text-left">名称</th>
                        <th className="py-2 px-3 text-left">规格型号</th>
                        <th className="py-2 px-3 text-left">归口科室</th>
                        <th className="py-2 px-3 text-left">当前库存 / 安全阈值</th>
                        <th className="py-2 px-3 text-left">科内单价 / 跨科单价</th>
                        <th className="py-2 px-3 text-right">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {data.consumables.map((c) => {
                        const low = Number(c.stock_qty) <= Number(c.safety_threshold);
                        return (
                          <tr key={c.id} className="hover:bg-blue-50/40">
                            <td className="py-2 px-3 font-mono font-bold text-blue-700">
                              {c.code}
                            </td>
                            <td className="py-2 px-3 font-semibold">{c.name}</td>
                            <td className="py-2 px-3 font-mono">{c.spec}</td>
                            <td className="py-2 px-3">{c.owner_dept_name}</td>
                            <td className="py-2 px-3 font-mono">
                              <span
                                className={low ? 'text-rose-600 font-bold' : 'text-emerald-700'}
                              >
                                {c.stock_qty}
                              </span>{' '}
                              / {c.safety_threshold} {low && '(库存不足预警)'}
                            </td>
                            <td className="py-2 px-3 font-mono">
                              ¥{c.internal_unit_price} / ¥{c.external_unit_price}
                            </td>
                            <td className="py-2 px-3 text-right whitespace-nowrap">
                              {canEditConsumable(currentOperator, c) && (
                                <button
                                  onClick={() => {
                                    setEditingConsumableId(c.id);
                                    setConsumableForm({
                                      code: c.code,
                                      name: c.name,
                                      spec: c.spec,
                                      owner_dept_id: c.owner_dept_id,
                                      stock_qty: c.stock_qty,
                                      safety_threshold: c.safety_threshold,
                                      internal_unit_price: c.internal_unit_price,
                                      external_unit_price: c.external_unit_price,
                                    });
                                    setConsPrimaryTab('upsert');
                                  }}
                                  className="text-blue-700 hover:underline mr-2"
                                >
                                  修改/补货
                                </button>
                              )}
                              {canDeleteConsumable(currentOperator, c) && (
                                <button
                                  onClick={() => handleDeleteConsumable(c)}
                                  className="text-rose-600 hover:underline"
                                >
                                  删除
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          )}

          {/* ==================== 模块 5：课题组与项目 (!labs/index & !labs/lab/index.10) ==================== */}
          {activeModule === 'labs' && (
            <div className="space-y-3">
              <div className="border-b border-slate-300 flex flex-wrap gap-1 pt-1">
                {[
                  { id: 'list', label: '课题组项目目录' },
                  { id: 'my_lab', label: '我的课题组' },
                  { id: 'add_member', label: '成员配额设置' },
                  { id: 'org_list', label: '组织机构管理' },
                  ...(canCreateProject(currentOperator) || editingProjectId
                    ? [
                        {
                          id: 'upsert_project',
                          label: editingProjectId ? '修改课题组项目' : '新建课题组项目',
                        },
                      ]
                    : []),
                  ...(canCreateOrg(currentOperator) || editingDeptId
                    ? [
                        {
                          id: 'add_org',
                          label: editingDeptId ? '修改组织机构' : '添加组织机构',
                        },
                      ]
                    : []),
                ].map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      if (t.id !== 'upsert_project') setEditingProjectId(null);
                      if (t.id !== 'add_org') setEditingDeptId(null);
                      setLabsPrimaryTab(t.id);
                    }}
                    className={`px-4 py-1.5 rounded-t border border-b-0 font-medium ${
                      labsPrimaryTab === t.id
                        ? 'bg-white border-slate-300 text-blue-700 font-bold -mb-px'
                        : 'bg-slate-100 border-slate-200 text-slate-600'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
                {labsPrimaryTab === 'detail' && selectedLabProject && (
                  <button className="px-4 py-1.5 rounded-t border border-b-0 border-slate-300 bg-white text-blue-700 font-bold -mb-px">
                    {selectedLabProject.name}
                  </button>
                )}
              </div>

              {/* 新建 / 修改课题组项目表单 */}
              {labsPrimaryTab === 'upsert_project' && (
                <form
                  onSubmit={handleSaveProject}
                  className="max-w-xl p-4 bg-slate-50 border border-slate-200 rounded space-y-3"
                >
                  <div className="font-bold text-slate-800 border-b border-slate-200 pb-2">
                    {editingProjectId ? `修改课题组项目 (#${editingProjectId})` : '新建课题组项目 / 经费账户'}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-600 mb-1">项目编号 *</label>
                      <input
                        type="text"
                        value={projectForm.code}
                        onChange={(e) => setProjectForm({ ...projectForm, code: e.target.value })}
                        className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-white font-mono"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 mb-1">课题组项目名称 *</label>
                      <input
                        type="text"
                        value={projectForm.name}
                        onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })}
                        className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-white"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 mb-1">依托行政科室</label>
                      <select
                        value={projectForm.lead_dept_id}
                        onChange={(e) =>
                          setProjectForm({ ...projectForm, lead_dept_id: e.target.value })
                        }
                        className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-white"
                      >
                        {data.departments.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-slate-600 mb-1">项目负责人 (PI)</label>
                      <select
                        value={projectForm.pi_user_id}
                        onChange={(e) =>
                          setProjectForm({ ...projectForm, pi_user_id: e.target.value })
                        }
                        className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-white"
                      >
                        {data.users.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.full_name} ({u.home_dept_name})
                          </option>
                        ))}
                      </select>
                    </div>
                    {!editingProjectId && (
                      <div>
                        <label className="block text-slate-600 mb-1">初始预算拨款 (元)</label>
                        <input
                          type="number"
                          step="1000"
                          value={projectForm.initial_budget}
                          onChange={(e) =>
                            setProjectForm({ ...projectForm, initial_budget: e.target.value })
                          }
                          className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-white font-mono"
                        />
                      </div>
                    )}
                    <div className="flex items-center pt-5">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(projectForm.is_confidential)}
                          onChange={(e) =>
                            setProjectForm({ ...projectForm, is_confidential: e.target.checked })
                          }
                          className="accent-blue-600"
                        />
                        <span className="font-medium text-slate-700">启用跨科严格保密数据隔离</span>
                      </label>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      className="px-4 py-1.5 rounded bg-blue-600 text-white font-semibold"
                    >
                      保存项目
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingProjectId(null);
                        setLabsPrimaryTab('list');
                      }}
                      className="px-4 py-1.5 rounded border border-slate-300 bg-white text-slate-600"
                    >
                      取消
                    </button>
                  </div>
                </form>
              )}

              {/* 组织机构管理列表 (支持修改/删除机构) */}
              {labsPrimaryTab === 'org_list' && (
                <div className="space-y-2.5">
                  <div className="bg-slate-100 border border-slate-200 p-2 rounded flex items-center justify-between">
                    {canCreateOrg(currentOperator) && (
                      <button
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
                        className="px-3 py-1 rounded bg-blue-600 text-white font-medium"
                      >
                        + 添加组织机构
                      </button>
                    )}
                    <span>共有 {data.departments.length} 个组织机构节点</span>
                  </div>
                  <table className="w-full border-collapse border border-slate-200 text-xs">
                    <thead className="bg-slate-100 border-b border-slate-300">
                      <tr>
                        <th className="py-2 px-3 text-left">机构编码</th>
                        <th className="py-2 px-3 text-left">组织机构名称</th>
                        <th className="py-2 px-3 text-left">上级路径</th>
                        <th className="py-2 px-3 text-left">负责人</th>
                        <th className="py-2 px-3 text-right">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {data.departments.map((d) => (
                        <tr key={d.id} className="hover:bg-blue-50/40">
                          <td className="py-2 px-3 font-mono font-bold text-blue-700">{d.code}</td>
                          <td className="py-2 px-3 font-semibold">{d.name}</td>
                          <td className="py-2 px-3 text-slate-600">
                            所内用户 » 集约化中心 » {d.name}
                          </td>
                          <td className="py-2 px-3">{d.manager_name || '-'}</td>
                          <td className="py-2 px-3 text-right whitespace-nowrap">
                            {canEditOrg(currentOperator, d) && (
                              <button
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
                                className="text-blue-700 hover:underline mr-2"
                              >
                                修改
                              </button>
                            )}
                            {canDeleteOrg(currentOperator, d) && (
                              <button
                                onClick={() => handleDeleteDepartment(d)}
                                className="text-rose-600 hover:underline"
                              >
                                删除
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {labsPrimaryTab === 'list' && (
                <div className="space-y-2.5">
                  <div className="bg-slate-100 border border-slate-200 p-2 rounded flex items-center justify-between">
                    <div className="flex gap-1.5">
                      {canCreateProject(currentOperator) && (
                        <button
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
                          className="px-3 py-1 rounded bg-blue-600 text-white font-medium flex items-center gap-1"
                        >
                          <Plus className="w-3.5 h-3.5" /> 新建课题组项目
                        </button>
                      )}
                      {canCreateOrg(currentOperator) && (
                        <button
                          onClick={() => setLabsPrimaryTab('add_org')}
                          className="px-3 py-1 rounded border border-slate-300 bg-white text-slate-700"
                        >
                          + 添加组织机构
                        </button>
                      )}
                      <button
                        onClick={() => setLabsPrimaryTab('add_member')}
                        className="px-3 py-1 rounded border border-slate-300 bg-white text-slate-700"
                      >
                        成员配额授权
                      </button>
                    </div>
                    <span>
                      共有 <strong className="text-blue-700">{data.departments.length}</strong> 个科室机构,{' '}
                      <strong className="text-blue-700">{data.projects.length}</strong> 个跨科项目组,{' '}
                      <strong className="text-blue-700">{data.users.length}</strong> 位成员
                    </span>
                  </div>

                  {/* 课题组/项目列表表 (对标 table_labs_list) */}
                  <table className="w-full border-collapse border border-slate-200 text-xs">
                    <thead className="bg-slate-100 border-b border-slate-300">
                      <tr>
                        <th className="py-2 px-3 text-left">名称</th>
                        <th className="py-2 px-3 text-left">组织机构层级</th>
                        <th className="py-2 px-3 text-center">建立者 / PI</th>
                        <th className="py-2 px-3 text-left">可用经费 / 总预算</th>
                        <th className="py-2 px-3 text-center">保密属性</th>
                        <th className="py-2 px-3 text-right">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {data.projects.map((p) => {
                        const leadDept = data.departments.find((d) => d.id === p.lead_dept_id);
                        const piUser = data.users.find((u) => u.id === p.pi_user_id);
                        return (
                          <tr key={p.id} className="hover:bg-blue-50/40">
                            <td className="py-2.5 px-3">
                              <button
                                onClick={() => openLabDetail(p.id)}
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
                              <button
                                onClick={() => piUser && openUserProfile(piUser.id)}
                                className="text-blue-700 hover:underline"
                              >
                                {piUser?.full_name || '-'}
                              </button>
                            </td>
                            <td className="py-2.5 px-3 font-mono">
                              <strong className="text-emerald-700">¥{p.available_balance}</strong> / ¥
                              {p.total_budget}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              {p.is_confidential ? (
                                <span className="px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 text-[11px]">
                                  严格保密隔离
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px]">
                                  公共开放
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right whitespace-nowrap">
                              <button
                                onClick={() => openLabDetail(p.id)}
                                className="text-blue-700 hover:underline"
                              >
                                详情
                              </button>
                              {canEditProject(currentOperator, p, data.project_members) && (
                                <>
                                  <span className="mx-1.5 text-slate-300">•</span>
                                  <button
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
                                    className="text-blue-700 hover:underline"
                                  >
                                    修改
                                  </button>
                                </>
                              )}
                              {canDeleteProject(currentOperator, p, data.project_members) && (
                                <>
                                  <span className="mx-1.5 text-slate-300">•</span>
                                  <button
                                    onClick={() => handleDeleteProject(p)}
                                    className="text-rose-600 hover:underline"
                                  >
                                    删除
                                  </button>
                                </>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* 我的课题组 或 课题组详情 (!labs/lab/index.10) */}
              {(labsPrimaryTab === 'my_lab' || labsPrimaryTab === 'detail') && selectedLabProject && (
                <div className="space-y-3">
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded flex items-start gap-4">
                    <div className="w-14 h-14 rounded bg-blue-600 text-white flex items-center justify-center font-bold text-sm shrink-0">
                      课题组
                    </div>
                    <div className="space-y-1">
                      <h2 className="text-base font-bold text-slate-900">
                        {selectedLabProject.name} ({selectedLabProject.code})
                      </h2>
                      <div className="text-slate-600">
                        组织路径: 所内用户 » 集约化中心 »{' '}
                        {data.departments.find((d) => d.id === selectedLabProject.lead_dept_id)?.name}
                      </div>
                      <div className="font-mono text-xs text-slate-700">
                        总预算: ¥{selectedLabProject.total_budget} | 冻结: ¥
                        {selectedLabProject.frozen_balance} | 可用余额:{' '}
                        <strong className="text-emerald-700">
                          ¥{selectedLabProject.available_balance}
                        </strong>
                      </div>
                    </div>
                  </div>

                  <div className="border-b border-slate-300 flex gap-1">
                    {[
                      { id: 'members', label: '课题组成员与配额' },
                      { id: 'eq_reserv', label: '仪器预约' },
                      { id: 'eq_sample', label: '仪器送样' },
                      { id: 'billing', label: '财务明细' },
                    ].map((t) => (
                      <button
                        key={t.id}
                        onClick={() => setLabDetailTab(t.id)}
                        className={`px-3.5 py-1.5 rounded-t border border-b-0 ${
                          labDetailTab === t.id
                            ? 'bg-white border-slate-300 text-blue-700 font-bold -mb-px'
                            : 'bg-slate-100 border-slate-200 text-slate-600'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>

                  {labDetailTab === 'members' && (
                    <div className="space-y-2">
                      <div className="bg-slate-100 border border-slate-200 p-2 rounded">
                        <button
                          onClick={() => setLabsPrimaryTab('add_member')}
                          className="px-3 py-1 rounded bg-blue-600 text-white font-medium"
                        >
                          + 添加成员 / 调整配额
                        </button>
                      </div>
                      <table className="w-full border-collapse border border-slate-200 text-xs">
                        <thead className="bg-slate-100 border-b border-slate-300">
                          <tr>
                            <th className="py-2 px-3 text-left">姓名</th>
                            <th className="py-2 px-3 text-left">项目内角色</th>
                            <th className="py-2 px-3 text-left">消费配额上限</th>
                            <th className="py-2 px-3 text-left">已使用配额</th>
                            <th className="py-2 px-3 text-left">剩余可用配额</th>
                            <th className="py-2 px-3 text-right">操作</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {data.project_members
                            .filter((pm) => pm.project_id === selectedLabProject.id)
                            .map((pm) => (
                              <tr key={pm.id} className="hover:bg-blue-50/40">
                                <td className="py-2 px-3">
                                  <button
                                    onClick={() => openUserProfile(pm.user_id)}
                                    className="font-bold text-blue-700 hover:underline"
                                  >
                                    {pm.user_name}
                                  </button>
                                </td>
                                <td className="py-2 px-3 font-mono">{pm.project_role}</td>
                                <td className="py-2 px-3 font-mono">¥{pm.spending_limit}</td>
                                <td className="py-2 px-3 font-mono text-amber-700">
                                  ¥{pm.used_quota}
                                </td>
                                <td className="py-2 px-3 font-mono font-bold text-emerald-700">
                                  ¥{(Number(pm.spending_limit) - Number(pm.used_quota)).toFixed(4)}
                                </td>
                                <td className="py-2 px-3 text-right whitespace-nowrap">
                                  <button
                                    onClick={() => {
                                      setMemberForm({
                                        target_user_id: pm.user_id,
                                        project_role: pm.project_role,
                                        spending_limit: pm.spending_limit,
                                      });
                                      setLabsPrimaryTab('add_member');
                                    }}
                                    className="text-blue-700 hover:underline mr-2"
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
                                        onClick={() => handleRemoveProjectMember(pm)}
                                        className="text-rose-600 hover:underline"
                                      >
                                        移出成员
                                      </button>
                                    )}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {labDetailTab === 'eq_reserv' && (
                    <table className="w-full border-collapse border border-slate-200 text-xs">
                      <thead className="bg-slate-100 border-b border-slate-300">
                        <tr>
                          <th className="py-2 px-3 text-left">单号</th>
                          <th className="py-2 px-3 text-left">设备</th>
                          <th className="py-2 px-3 text-left">操作人</th>
                          <th className="py-2 px-3 text-left">预约/有效时长</th>
                          <th className="py-2 px-3 text-left">金额</th>
                          <th className="py-2 px-3 text-left">状态</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {data.reservations
                          .filter((r) => r.project_id === selectedLabProject.id)
                          .map((r) => (
                            <tr key={r.id}>
                              <td className="py-2 px-3 font-mono">#{r.id}</td>
                              <td className="py-2 px-3 font-mono">{r.device_code}</td>
                              <td className="py-2 px-3">{r.operator_name}</td>
                              <td className="py-2 px-3 font-mono">
                                {r.reserved_hours}h / {r.actual_active_hours}h
                              </td>
                              <td className="py-2 px-3 font-mono">
                                ¥{r.status === 'COMPLETED' ? r.settled_amount : r.hold_amount}
                              </td>
                              <td className="py-2 px-3 font-mono">{r.status}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  )}

                  {labDetailTab === 'eq_sample' && (
                    <table className="w-full border-collapse border border-slate-200 text-xs">
                      <thead className="bg-slate-100 border-b border-slate-300">
                        <tr>
                          <th className="py-2 px-3 text-left">条码</th>
                          <th className="py-2 px-3 text-left">样品名称</th>
                          <th className="py-2 px-3 text-left">送检人</th>
                          <th className="py-2 px-3 text-left">费用</th>
                          <th className="py-2 px-3 text-left">状态</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {data.samples
                          .filter((s) => s.project_id === selectedLabProject.id)
                          .map((s) => (
                            <tr key={s.id}>
                              <td className="py-2 px-3 font-mono">{s.barcode}</td>
                              <td className="py-2 px-3">{s.name}</td>
                              <td className="py-2 px-3">{s.submitter_name}</td>
                              <td className="py-2 px-3 font-mono">¥{s.total_test_fee}</td>
                              <td className="py-2 px-3 font-mono">{s.status}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  )}

                  {labDetailTab === 'billing' && (
                    <table className="w-full border-collapse border border-slate-200 text-xs">
                      <thead className="bg-slate-100 border-b border-slate-300">
                        <tr>
                          <th className="py-2 px-3 text-left">流水号</th>
                          <th className="py-2 px-3 text-left">类型</th>
                          <th className="py-2 px-3 text-left">经办人</th>
                          <th className="py-2 px-3 text-left">受益科室</th>
                          <th className="py-2 px-3 text-left">发生额</th>
                          <th className="py-2 px-3 text-left">交易后可用余额</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {data.ledgers
                          .filter((l) => l.project_id === selectedLabProject.id)
                          .map((l) => (
                            <tr key={l.id}>
                              <td className="py-2 px-3 font-mono">{l.idempotency_key}</td>
                              <td className="py-2 px-3 font-mono">{l.tx_type}</td>
                              <td className="py-2 px-3">{l.operator_name}</td>
                              <td className="py-2 px-3">{l.beneficiary_dept_name}</td>
                              <td className="py-2 px-3 font-mono font-bold">¥{l.amount}</td>
                              <td className="py-2 px-3 font-mono">¥{l.balance_after}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {labsPrimaryTab === 'add_member' && (
                <form
                  onSubmit={handleUpsertMember}
                  className="max-w-lg p-4 bg-slate-50 border border-slate-200 rounded space-y-3"
                >
                  <div className="font-bold text-slate-800">
                    配置项目【{currentProject?.code}】成员权限与消费配额
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-1">选择成员</label>
                    <select
                      value={memberForm.target_user_id}
                      onChange={(e) =>
                        setMemberForm({ ...memberForm, target_user_id: e.target.value })
                      }
                      className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-white"
                    >
                      {data.users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.full_name} ({u.home_dept_name})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-600 mb-1">项目角色</label>
                      <select
                        value={memberForm.project_role}
                        onChange={(e) =>
                          setMemberForm({ ...memberForm, project_role: e.target.value })
                        }
                        className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-white font-mono"
                      >
                        <option value="PI">PI (负责人)</option>
                        <option value="RESEARCHER">RESEARCHER (研究人员)</option>
                        <option value="OBSERVER">OBSERVER (只读观察员)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-slate-600 mb-1">个人消费配额上限 (元)</label>
                      <input
                        type="number"
                        step="100"
                        value={memberForm.spending_limit}
                        onChange={(e) =>
                          setMemberForm({ ...memberForm, spending_limit: e.target.value })
                        }
                        className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-white font-mono"
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded bg-blue-600 text-white font-semibold"
                  >
                    保存设置
                  </button>
                </form>
              )}

              {labsPrimaryTab === 'add_org' && (
                <form
                  onSubmit={handleCreateOrgNode}
                  className="max-w-lg p-4 bg-slate-50 border border-slate-200 rounded space-y-3"
                >
                  <div className="font-bold text-slate-800">添加组织机构 / 课题组</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-600 mb-1">机构编码 *</label>
                      <input
                        type="text"
                        value={orgNodeForm.code}
                        onChange={(e) => setOrgNodeForm({ ...orgNodeForm, code: e.target.value })}
                        className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-white font-mono"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 mb-1">负责人</label>
                      <input
                        type="text"
                        value={orgNodeForm.manager_name}
                        onChange={(e) =>
                          setOrgNodeForm({ ...orgNodeForm, manager_name: e.target.value })
                        }
                        className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-white"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-1">机构/课题组名称 *</label>
                    <input
                      type="text"
                      value={orgNodeForm.name}
                      onChange={(e) => setOrgNodeForm({ ...orgNodeForm, name: e.target.value })}
                      className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-white"
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded bg-blue-600 text-white font-semibold"
                  >
                    保存机构
                  </button>
                </form>
              )}
            </div>
          )}

          {/* ==================== 模块 6：成员目录 (!people/list/index) ==================== */}
          {activeModule === 'people' && (
            <div className="space-y-3">
              {/* 一级 Tab */}
              <div className="border-b border-slate-300 flex gap-1 pt-1">
                <button
                  onClick={() => {
                    setEditingUserId(null);
                    setPeoplePrimaryTab('list');
                  }}
                  className={`px-4 py-1.5 rounded-t border border-b-0 font-medium ${
                    peoplePrimaryTab === 'list'
                      ? 'bg-white border-slate-300 text-blue-700 font-bold -mb-px'
                      : 'bg-slate-100 border-slate-200 text-slate-600'
                  }`}
                >
                  成员列表
                </button>
                <button
                  onClick={() => {
                    setEditingUserId(null);
                    setPeoplePrimaryTab('add');
                  }}
                  className={`px-4 py-1.5 rounded-t border border-b-0 font-medium ${
                    peoplePrimaryTab === 'add'
                      ? 'bg-white border-slate-300 text-blue-700 font-bold -mb-px'
                      : 'bg-slate-100 border-slate-200 text-slate-600'
                  }`}
                >
                  添加新成员
                </button>
                {peoplePrimaryTab === 'edit' && editingUserId && (
                  <button className="px-4 py-1.5 rounded-t border border-b-0 border-slate-300 bg-white text-blue-700 font-bold -mb-px">
                    修改成员信息 (#{editingUserId})
                  </button>
                )}
              </div>

              {peoplePrimaryTab === 'edit' && editingUserId && (
                <form
                  onSubmit={handleSaveUserEdit}
                  className="max-w-xl p-4 bg-slate-50 border border-slate-200 rounded space-y-3"
                >
                  <div className="font-bold text-slate-800 border-b border-slate-200 pb-2">
                    修改成员资料与角色权限
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-600 mb-1">真实姓名 *</label>
                      <input
                        type="text"
                        value={userEditForm.full_name}
                        onChange={(e) =>
                          setUserEditForm({ ...userEditForm, full_name: e.target.value })
                        }
                        className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-white"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 mb-1">电子邮箱</label>
                      <input
                        type="text"
                        value={userEditForm.email}
                        onChange={(e) =>
                          setUserEditForm({ ...userEditForm, email: e.target.value })
                        }
                        className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 mb-1">实体 RFID 卡号 *</label>
                      <input
                        type="text"
                        value={userEditForm.rfid_card_id}
                        onChange={(e) =>
                          setUserEditForm({ ...userEditForm, rfid_card_id: e.target.value })
                        }
                        className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-white font-mono"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 mb-1">三级课题组</label>
                      <input
                        type="text"
                        value={userEditForm.sub_group_name}
                        onChange={(e) =>
                          setUserEditForm({ ...userEditForm, sub_group_name: e.target.value })
                        }
                        className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 mb-1">所属行政科室</label>
                      <select
                        value={userEditForm.home_dept_id}
                        onChange={(e) =>
                          setUserEditForm({ ...userEditForm, home_dept_id: e.target.value })
                        }
                        disabled={currentOperator?.system_role !== 'ADMIN'}
                        className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-white"
                      >
                        {data.departments.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-slate-600 mb-1">系统角色</label>
                      <select
                        value={userEditForm.system_role}
                        onChange={(e) =>
                          setUserEditForm({ ...userEditForm, system_role: e.target.value })
                        }
                        disabled={!['ADMIN', 'DEPT_HEAD'].includes(currentOperator?.system_role)}
                        className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-white font-mono"
                      >
                        <option value="STAFF">STAFF (科研人员)</option>
                        <option value="PI">PI (课题组负责人)</option>
                        <option value="DEPT_HEAD">DEPT_HEAD (科室主任)</option>
                        <option value="OBSERVER">OBSERVER (观察员)</option>
                        {currentOperator?.system_role === 'ADMIN' && (
                          <option value="ADMIN">ADMIN (超级管理员)</option>
                        )}
                      </select>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      className="px-4 py-1.5 rounded bg-blue-600 text-white font-semibold"
                    >
                      保存成员修改
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingUserId(null);
                        setPeoplePrimaryTab('list');
                      }}
                      className="px-4 py-1.5 rounded border border-slate-300 bg-white text-slate-600"
                    >
                      取消
                    </button>
                  </div>
                </form>
              )}

              {peoplePrimaryTab === 'list' && (
                <div className="space-y-2.5">
                  {/* 二级分类 Tab (对标：所有成员 | 已激活成员 | 教师/PI | 科研人员 | 观察员) */}
                  <div className="flex flex-wrap gap-1 border-b border-slate-200 pb-2">
                    {[
                      { id: 'all', label: '所有成员' },
                      { id: 'ACTIVE', label: '已激活成员' },
                      { id: 'HEAD_PI', label: '科主任 / 教师(PI)' },
                      { id: 'STAFF', label: '所内职工 / 实验员' },
                      { id: 'OBSERVER', label: '观察员' },
                    ].map((t) => (
                      <button
                        key={t.id}
                        onClick={() => setPeopleSecondaryTab(t.id)}
                        className={`px-3 py-1 rounded text-xs ${
                          peopleSecondaryTab === t.id
                            ? 'bg-blue-600 text-white font-semibold'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>

                  {/* 多级组织机构面包屑筛选器 (tag_selector) */}
                  <div className="flex flex-wrap items-center gap-1.5 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded text-xs">
                    <span className="text-slate-500 font-medium">组织机构层级:</span>
                    <button
                      onClick={() => setPeopleOrgFilterDeptId(0)}
                      className={`px-2 py-0.5 rounded ${
                        peopleOrgFilterDeptId === 0
                          ? 'bg-blue-600 text-white font-semibold'
                          : 'bg-white border border-slate-300 text-slate-700'
                      }`}
                    >
                      全部 » 所内用户 » 集约化中心
                    </button>
                    {data.departments.map((d) => (
                      <React.Fragment key={d.id}>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                        <button
                          onClick={() => setPeopleOrgFilterDeptId(d.id)}
                          className={`px-2 py-0.5 rounded ${
                            peopleOrgFilterDeptId === d.id
                              ? 'bg-blue-600 text-white font-semibold'
                              : 'bg-white border border-slate-300 text-slate-700 hover:border-blue-400'
                          }`}
                        >
                          {d.name}
                        </button>
                      </React.Fragment>
                    ))}
                  </div>

                  {/* 工具条 (panel) */}
                  <div className="bg-slate-100 border border-slate-200 p-2 rounded flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setPeoplePrimaryTab('add')}
                        className="px-3 py-1 rounded bg-blue-600 text-white font-medium flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" /> 添加新成员
                      </button>
                      <button
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
                        className="px-3 py-1 rounded border border-slate-300 bg-white text-slate-700 flex items-center gap-1"
                      >
                        <Download className="w-3.5 h-3.5" /> 导出Excel
                      </button>
                      <button
                        onClick={() => window.print()}
                        className="px-3 py-1 rounded border border-slate-300 bg-white text-slate-700 flex items-center gap-1"
                      >
                        <Printer className="w-3.5 h-3.5" /> 打印
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <span>
                        共有 <strong className="text-blue-700">{filteredUsers.length}</strong> 位成员
                      </span>
                      <input
                        type="text"
                        placeholder="搜索姓名或账号..."
                        value={peopleSearchName}
                        onChange={(e) => setPeopleSearchName(e.target.value)}
                        className="border border-slate-300 rounded px-2 py-1 bg-white w-40"
                      />
                    </div>
                  </div>

                  {/* 成员表格 (table_people_users) */}
                  <table className="w-full border-collapse border border-slate-200 text-xs">
                    <thead className="bg-slate-100 text-slate-700 border-b border-slate-300">
                      <tr>
                        <th className="py-2 px-3 text-left w-10">头像</th>
                        <th className="py-2 px-3 text-left">姓名 (账号)</th>
                        <th className="py-2 px-3 text-left">联系方式 / RFID卡</th>
                        <th className="py-2 px-3 text-left">多级组织机构</th>
                        <th className="py-2 px-3 text-left">用户角色</th>
                        <th className="py-2 px-3 text-center">状态</th>
                        <th className="py-2 px-3 text-right">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {filteredUsers.map((u) => (
                        <tr key={u.id} className="hover:bg-blue-50/40">
                          <td className="py-2.5 px-3">
                            <div
                              onClick={() => openUserProfile(u.id)}
                              className="cursor-pointer w-8 h-8 rounded bg-blue-600 text-white flex items-center justify-center font-bold"
                            >
                              {u.full_name.slice(0, 1)}
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            <button
                              onClick={() => openUserProfile(u.id)}
                              className="font-bold text-blue-700 hover:underline text-left block"
                            >
                              {u.full_name}
                            </button>
                            <span className="text-[11px] text-slate-500 font-mono">
                              {u.username}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            <div>{u.email}</div>
                            <div className="text-[11px] font-mono text-slate-500">
                              RFID: {u.rfid_card_id}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-slate-600">
                            所内用户 » {u.home_dept_name} »{' '}
                            <span className="text-slate-900 font-medium">
                              {u.sub_group_name || '综合实验中心'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-mono text-[11px]">
                              {u.system_role}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[11px]">
                              {u.status || 'ACTIVE'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right whitespace-nowrap">
                            <button
                              onClick={() => openUserProfile(u.id)}
                              className="text-blue-700 hover:underline"
                            >
                              档案
                            </button>
                            {canEditUser(currentOperator, u) && (
                              <>
                                <span className="mx-1.5 text-slate-300">•</span>
                                <button
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
                                  className="text-blue-700 hover:underline"
                                >
                                  修改
                                </button>
                              </>
                            )}
                            {canDeleteUser(currentOperator, u) && (
                              <>
                                <span className="mx-1.5 text-slate-300">•</span>
                                <button
                                  onClick={() => handleDeleteUser(u)}
                                  className="text-rose-600 hover:underline"
                                >
                                  删除
                                </button>
                              </>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {peoplePrimaryTab === 'add' && (
                <form
                  onSubmit={handleRegisterSubmit}
                  className="max-w-xl p-4 bg-slate-50 border border-slate-200 rounded space-y-3"
                >
                  <div className="font-bold text-slate-800">添加新成员</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-600 mb-1">登录账号 *</label>
                      <input
                        type="text"
                        value={registerForm.username}
                        onChange={(e) =>
                          setRegisterForm({ ...registerForm, username: e.target.value })
                        }
                        className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-white"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 mb-1">真实姓名 *</label>
                      <input
                        type="text"
                        value={registerForm.full_name}
                        onChange={(e) =>
                          setRegisterForm({ ...registerForm, full_name: e.target.value })
                        }
                        className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-white"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 mb-1">所属行政科室 *</label>
                      <select
                        value={registerForm.home_dept_id}
                        onChange={(e) =>
                          setRegisterForm({ ...registerForm, home_dept_id: e.target.value })
                        }
                        className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-white"
                      >
                        {data.departments.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-slate-600 mb-1">三级课题组</label>
                      <input
                        type="text"
                        value={registerForm.sub_group_name}
                        onChange={(e) =>
                          setRegisterForm({ ...registerForm, sub_group_name: e.target.value })
                        }
                        className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 mb-1">系统角色</label>
                      <select
                        value={registerForm.system_role}
                        onChange={(e) =>
                          setRegisterForm({ ...registerForm, system_role: e.target.value })
                        }
                        className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-white"
                      >
                        <option value="STAFF">STAFF (科研人员)</option>
                        <option value="PI">PI (课题组负责人)</option>
                        <option value="DEPT_HEAD">DEPT_HEAD (科室主任)</option>
                        <option value="OBSERVER">OBSERVER (观察员)</option>
                        <option value="ADMIN">ADMIN (超级管理员)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-slate-600 mb-1">初始关联项目</label>
                      <select
                        value={registerForm.join_project_id}
                        onChange={(e) =>
                          setRegisterForm({ ...registerForm, join_project_id: e.target.value })
                        }
                        className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-white"
                      >
                        {data.projects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.code}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded bg-blue-600 text-white font-semibold"
                  >
                    保存新成员
                  </button>
                </form>
              )}
            </div>
          )}

          {/* ==================== 模块 7：财务中心 (!billing/department/index.1) ==================== */}
          {activeModule === 'billing' && (
            <div className="space-y-3">
              {/* 一级 Tab (对标：财务帐号 | 明细 | 财务部门列表 | ERP拨款) */}
              <div className="border-b border-slate-300 flex gap-1 pt-1">
                {[
                  { id: 'accounts', label: '财务帐号' },
                  { id: 'transactions', label: '收支明细' },
                  { id: 'departments', label: '财务部门产值列表' },
                  { id: 'deposit', label: '经费充值/ERP调账' },
                ].map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setBillingPrimaryTab(t.id)}
                    className={`px-4 py-1.5 rounded-t border border-b-0 font-medium ${
                      billingPrimaryTab === t.id
                        ? 'bg-white border-slate-300 text-blue-700 font-bold -mb-px'
                        : 'bg-slate-100 border-slate-200 text-slate-600'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* 视图 7A: 财务帐号双层表头表格 (1:1 对标 /lims/!billing/department/index.1) */}
              {billingPrimaryTab === 'accounts' && (
                <div className="space-y-2.5">
                  <div className="bg-slate-100 border border-slate-200 p-2 rounded flex flex-wrap items-center justify-between gap-2">
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => setBillingPrimaryTab('deposit')}
                        className="px-3 py-1 rounded bg-blue-600 text-white font-medium flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" /> 经费拨款入账
                      </button>
                      <button
                        onClick={() =>
                          exportTableToCSV(
                            'billing_accounts.csv',
                            ['项目编号', '课题组名称', '总预算', '冻结金额', '可用余额'],
                            data.projects.map((p) => [
                              p.code,
                              p.name,
                              p.total_budget,
                              p.frozen_balance,
                              p.available_balance,
                            ])
                          )
                        }
                        className="px-3 py-1 rounded border border-slate-300 bg-white text-slate-700"
                      >
                        导出Excel
                      </button>
                    </div>
                    <div className="font-mono text-xs">
                      总预算:{' '}
                      <strong className="text-blue-700">
                        ¥
                        {data.projects
                          .reduce((acc, p) => acc + Number(p.total_budget), 0)
                          .toFixed(2)}
                      </strong>
                      , 可用余额:{' '}
                      <strong className="text-emerald-700">
                        ¥
                        {data.projects
                          .reduce((acc, p) => acc + Number(p.available_balance), 0)
                          .toFixed(2)}
                      </strong>
                    </div>
                  </div>

                  <table className="w-full border-collapse border border-slate-300 text-xs">
                    <thead className="bg-slate-100 text-slate-700">
                      <tr className="border-b border-slate-300">
                        <th rowSpan={2} className="py-2 px-3 text-left border-r border-slate-300">
                          课题组 / 项目账号
                        </th>
                        <th rowSpan={2} className="py-2 px-3 text-left border-r border-slate-300">
                          依托组织机构
                        </th>
                        <th colSpan={2} className="py-1.5 px-3 text-center border-r border-slate-300">
                          转入
                        </th>
                        <th colSpan={2} className="py-1.5 px-3 text-center border-r border-slate-300">
                          转出
                        </th>
                        <th rowSpan={2} className="py-2 px-3 text-right border-r border-slate-300">
                          可用余额
                        </th>
                        <th rowSpan={2} className="py-2 px-3 text-right">
                          操作
                        </th>
                      </tr>
                      <tr className="border-b border-slate-300">
                        <th className="py-1.5 px-3 text-right border-r border-slate-200">
                          ERP拨款充值
                        </th>
                        <th className="py-1.5 px-3 text-right border-r border-slate-300">
                          退回解冻
                        </th>
                        <th className="py-1.5 px-3 text-right border-r border-slate-200">
                          预约冻结(Hold)
                        </th>
                        <th className="py-1.5 px-3 text-right border-r border-slate-300">
                          实际消费扣费
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 font-mono">
                      {data.projects.map((p) => {
                        const dept = data.departments.find((d) => d.id === p.lead_dept_id);
                        const consumed = (
                          Number(p.total_budget) -
                          Number(p.available_balance) -
                          Number(p.frozen_balance)
                        ).toFixed(4);
                        return (
                          <tr key={p.id} className="hover:bg-blue-50/40">
                            <td className="py-2.5 px-3 font-sans border-r border-slate-200">
                              <button
                                onClick={() => openLabDetail(p.id, 'billing')}
                                className="font-bold text-blue-700 hover:underline text-left block"
                              >
                                {p.name}
                              </button>
                              <span className="font-mono text-[11px] text-slate-500">{p.code}</span>
                            </td>
                            <td className="py-2.5 px-3 font-sans text-slate-600 border-r border-slate-200">
                              所内用户 » {dept?.name}
                            </td>
                            <td className="py-2.5 px-3 text-right border-r border-slate-200">
                              ¥{p.total_budget}
                            </td>
                            <td className="py-2.5 px-3 text-right border-r border-slate-200">
                              ¥0.0000
                            </td>
                            <td className="py-2.5 px-3 text-right text-amber-700 border-r border-slate-200">
                              ¥{p.frozen_balance}
                            </td>
                            <td className="py-2.5 px-3 text-right text-rose-700 border-r border-slate-200">
                              ¥{consumed}
                            </td>
                            <td className="py-2.5 px-3 text-right font-bold text-emerald-700 border-r border-slate-200">
                              ¥{p.available_balance}
                            </td>
                            <td className="py-2.5 px-3 text-right font-sans">
                              <button
                                onClick={() => {
                                  setSimErp((prev) => ({ ...prev, project_code: p.code }));
                                  setBillingPrimaryTab('deposit');
                                }}
                                className="text-blue-700 hover:underline mr-2"
                              >
                                充值
                              </button>
                              <button
                                onClick={() => openLabDetail(p.id, 'billing')}
                                className="text-blue-700 hover:underline"
                              >
                                明细
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* 视图 7B: 收支明细流水 */}
              {billingPrimaryTab === 'transactions' && (
                <table className="w-full border-collapse border border-slate-200 text-xs">
                  <thead className="bg-slate-100 border-b border-slate-300">
                    <tr>
                      <th className="py-2 px-3 text-left">凭证幂等号</th>
                      <th className="py-2 px-3 text-left">类型</th>
                      <th className="py-2 px-3 text-left">借方：项目 / 经办人</th>
                      <th className="py-2 px-3 text-left">贷方：受益财务部门</th>
                      <th className="py-2 px-3 text-left">费率</th>
                      <th className="py-2 px-3 text-right">金额</th>
                      <th className="py-2 px-3 text-right">交易后余额</th>
                      <th className="py-2 px-3 text-left">备注</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 font-mono">
                    {data.ledgers.map((l) => (
                      <tr key={l.id} className="hover:bg-blue-50/40">
                        <td className="py-2 px-3 text-blue-700">{l.idempotency_key}</td>
                        <td className="py-2 px-3">{l.tx_type}</td>
                        <td className="py-2 px-3 font-sans">
                          {l.project_code} ({l.operator_name})
                        </td>
                        <td className="py-2 px-3 font-sans">{l.beneficiary_dept_name}</td>
                        <td className="py-2 px-3">{l.rate_type}</td>
                        <td className="py-2 px-3 text-right font-bold">¥{l.amount}</td>
                        <td className="py-2 px-3 text-right">¥{l.balance_after}</td>
                        <td className="py-2 px-3 font-sans text-slate-600 max-w-xs truncate">
                          {l.memo}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {/* 视图 7C: 财务部门产值列表 */}
              {billingPrimaryTab === 'departments' && (
                <table className="w-full border-collapse border border-slate-200 text-xs">
                  <thead className="bg-slate-100 border-b border-slate-300">
                    <tr>
                      <th className="py-2 px-3 text-left">财务部门编码</th>
                      <th className="py-2 px-3 text-left">名称</th>
                      <th className="py-2 px-3 text-left">组织机构</th>
                      <th className="py-2 px-3 text-right">科内结算收入</th>
                      <th className="py-2 px-3 text-right">跨科创收收入</th>
                      <th className="py-2 px-3 text-right">累计总产值</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {data.dept_revenue_summary.map((d) => (
                      <tr key={d.dept_id} className="hover:bg-blue-50/40">
                        <td className="py-2.5 px-3 font-mono font-bold text-blue-700">
                          {d.dept_code}
                        </td>
                        <td className="py-2.5 px-3 font-semibold">{d.dept_name}</td>
                        <td className="py-2.5 px-3 text-slate-600">
                          所内用户 » 集约化中心 » {d.dept_name}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono">¥{d.internal_revenue}</td>
                        <td className="py-2.5 px-3 text-right font-mono text-amber-700">
                          ¥{d.external_revenue}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700">
                          ¥{d.total_revenue}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {/* 视图 7D: ERP 拨款充值 */}
              {billingPrimaryTab === 'deposit' && (
                <div className="max-w-lg p-4 bg-slate-50 border border-slate-200 rounded space-y-3">
                  <div className="font-bold text-slate-800">项目经费充值 / ERP 凭证同步</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-600 mb-1">项目编号</label>
                      <select
                        value={simErp.project_code}
                        onChange={(e) => setSimErp({ ...simErp, project_code: e.target.value })}
                        className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-white font-mono"
                      >
                        {data.projects.map((p) => (
                          <option key={p.id} value={p.code}>
                            {p.code} - {p.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-slate-600 mb-1">充值金额 (元)</label>
                      <input
                        type="text"
                        value={simErp.amount}
                        onChange={(e) => setSimErp({ ...simErp, amount: e.target.value })}
                        className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-white font-mono"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-1">ERP 财务凭证号 (幂等校验)</label>
                    <input
                      type="text"
                      value={simErp.erp_voucher_no}
                      onChange={(e) => setSimErp({ ...simErp, erp_voucher_no: e.target.value })}
                      className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-white font-mono"
                    />
                  </div>
                  <button
                    onClick={triggerSimErpDeposit}
                    className="px-4 py-1.5 rounded bg-blue-600 text-white font-semibold"
                  >
                    确认充值入账
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ==================== 模块 8：成果与实验记录 (!eln) ==================== */}
          {activeModule === 'eln' && (
            <div className="space-y-3">
              <div className="border-b border-slate-300 flex gap-1 pt-1">
                <button
                  onClick={() => setElnPrimaryTab('list')}
                  className={`px-4 py-1.5 rounded-t border border-b-0 font-medium ${
                    elnPrimaryTab === 'list'
                      ? 'bg-white border-slate-300 text-blue-700 font-bold -mb-px'
                      : 'bg-slate-100 border-slate-200 text-slate-600'
                  }`}
                >
                  实验记录列表
                </button>
                <button
                  onClick={() => setElnPrimaryTab('add')}
                  className={`px-4 py-1.5 rounded-t border border-b-0 font-medium ${
                    elnPrimaryTab === 'add'
                      ? 'bg-white border-slate-300 text-blue-700 font-bold -mb-px'
                      : 'bg-slate-100 border-slate-200 text-slate-600'
                  }`}
                >
                  新建实验记录
                </button>
              </div>

              {elnPrimaryTab === 'list' && (
                <div className="space-y-2.5">
                  <div className="bg-slate-100 border border-slate-200 p-2 rounded flex items-center justify-between">
                    <button
                      onClick={() => setElnPrimaryTab('add')}
                      className="px-3 py-1 rounded bg-blue-600 text-white font-medium"
                    >
                      + 新建实验记录
                    </button>
                    <span>共有 {data.eln_records.length} 篇记录</span>
                  </div>

                  <table className="w-full border-collapse border border-slate-200 text-xs">
                    <thead className="bg-slate-100 border-b border-slate-300">
                      <tr>
                        <th className="py-2 px-3 text-left">编号</th>
                        <th className="py-2 px-3 text-left">实验记录标题</th>
                        <th className="py-2 px-3 text-left">作者 / 所属项目</th>
                        <th className="py-2 px-3 text-left">实验内容与参数</th>
                        <th className="py-2 px-3 text-left">归集总成本</th>
                        <th className="py-2 px-3 text-right">状态 / 操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {data.eln_records.map((e) => (
                        <tr key={e.id} className="hover:bg-blue-50/40">
                          <td className="py-2.5 px-3 font-mono font-bold text-blue-700">
                            #{e.id}
                          </td>
                          <td className="py-2.5 px-3 font-semibold">{e.title}</td>
                          <td className="py-2.5 px-3">
                            {e.author_name} ({e.project_code})
                          </td>
                          <td className="py-2.5 px-3 max-w-md">
                            {e.accessible ? (
                              <div className="whitespace-pre-wrap text-slate-700">
                                {e.markdown_content}
                              </div>
                            ) : (
                              <span className="text-rose-600 flex items-center gap-1">
                                <Lock className="w-3.5 h-3.5" /> 保密项目正文隔离
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 font-mono font-bold text-emerald-700">
                            ¥{e.synthesized_total_cost}
                          </td>
                          <td className="py-2.5 px-3 text-right whitespace-nowrap">
                            {e.is_locked ? (
                              <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-mono text-[11px] mr-1.5">
                                已锁定
                              </span>
                            ) : (
                              <button
                                onClick={() => handleLockELN(e.id)}
                                className="px-2 py-0.5 rounded bg-blue-600 text-white mr-1.5"
                              >
                                签名锁定
                              </button>
                            )}
                            {canEditELN(currentOperator, e, data.projects) && (
                              <button
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
                                className="text-blue-700 hover:underline mr-2"
                              >
                                编辑
                              </button>
                            )}
                            {canUnlockELN(currentOperator, e, data.projects) && (
                              <button
                                onClick={() => handleUnlockELN(e.id)}
                                className="text-amber-700 hover:underline mr-2"
                              >
                                解锁
                              </button>
                            )}
                            {canDeleteELN(currentOperator, e, data.projects) && (
                              <button
                                onClick={() => handleDeleteELN(e.id)}
                                className="text-rose-600 hover:underline"
                              >
                                删除
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {elnPrimaryTab === 'add' && (
                <form
                  onSubmit={handleCreateELN}
                  className="max-w-xl p-4 bg-slate-50 border border-slate-200 rounded space-y-3"
                >
                  <div>
                    <label className="block text-slate-600 mb-1">实验标题 *</label>
                    <input
                      type="text"
                      value={elnForm.title}
                      onChange={(e) => setElnForm({ ...elnForm, title: e.target.value })}
                      className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-white"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-1">实验正文 *</label>
                    <textarea
                      rows={4}
                      value={elnForm.markdown_content}
                      onChange={(e) =>
                        setElnForm({ ...elnForm, markdown_content: e.target.value })
                      }
                      className="w-full border border-slate-300 rounded p-2 bg-white font-mono"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-600 mb-1">关联机时预约单</label>
                      <select
                        value={elnForm.linked_reservation_id}
                        onChange={(e) =>
                          setElnForm({ ...elnForm, linked_reservation_id: e.target.value })
                        }
                        className="w-full border border-slate-300 rounded px-2 py-1.5 bg-white"
                      >
                        <option value="">-- 无 --</option>
                        {data.reservations.map((r) => (
                          <option key={r.id} value={r.id}>
                            #{r.id} {r.device_code}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-slate-600 mb-1">关联送检样品</label>
                      <select
                        value={elnForm.linked_sample_id}
                        onChange={(e) =>
                          setElnForm({ ...elnForm, linked_sample_id: e.target.value })
                        }
                        className="w-full border border-slate-300 rounded px-2 py-1.5 bg-white"
                      >
                        <option value="">-- 无 --</option>
                        {data.samples.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.barcode}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded bg-blue-600 text-white font-semibold"
                  >
                    保存记录
                  </button>
                </form>
              )}
            </div>
          )}

          {/* ==================== 模块 9：门禁与硬件物联 (!entrance) ==================== */}
          {activeModule === 'entrance' && (
            <div className="space-y-3">
              <div className="border-b border-slate-300 flex gap-1 pt-1">
                {[
                  { id: 'rfid', label: '门禁/终端RFID刷卡控制' },
                  { id: 'telemetry', label: '智能插座电流上报' },
                  { id: 'ingest', label: '仪器数据自动抓取' },
                ].map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setEntranceTab(t.id)}
                    className={`px-4 py-1.5 rounded-t border border-b-0 font-medium ${
                      entranceTab === t.id
                        ? 'bg-white border-slate-300 text-blue-700 font-bold -mb-px'
                        : 'bg-slate-100 border-slate-200 text-slate-600'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {entranceTab === 'rfid' && (
                <div className="max-w-lg p-4 bg-slate-50 border border-slate-200 rounded space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-600 mb-1">受控仪器编码</label>
                      <input
                        type="text"
                        value={simRfid.device_code}
                        onChange={(e) => setSimRfid({ ...simRfid, device_code: e.target.value })}
                        className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 mb-1">RFID 卡号</label>
                      <input
                        type="text"
                        value={simRfid.rfid_card_id}
                        onChange={(e) => setSimRfid({ ...simRfid, rfid_card_id: e.target.value })}
                        className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-white font-mono"
                      />
                    </div>
                  </div>
                  <button
                    onClick={triggerSimRfid}
                    className="px-4 py-1.5 rounded bg-blue-600 text-white font-semibold"
                  >
                    执行刷卡开机核验
                  </button>
                </div>
              )}

              {entranceTab === 'telemetry' && (
                <div className="max-w-lg p-4 bg-slate-50 border border-slate-200 rounded space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-slate-600 mb-1">仪器编码</label>
                      <input
                        type="text"
                        value={simTelemetry.device_code}
                        onChange={(e) =>
                          setSimTelemetry({ ...simTelemetry, device_code: e.target.value })
                        }
                        className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 mb-1">实测电流 (A)</label>
                      <input
                        type="text"
                        value={simTelemetry.rms_current_amps}
                        onChange={(e) =>
                          setSimTelemetry({ ...simTelemetry, rms_current_amps: e.target.value })
                        }
                        className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 mb-1">物理状态</label>
                      <select
                        value={simTelemetry.power_state}
                        onChange={(e) =>
                          setSimTelemetry({ ...simTelemetry, power_state: e.target.value })
                        }
                        className="w-full border border-slate-300 rounded px-2 py-1.5 bg-white font-mono"
                      >
                        <option value="RUNNING">RUNNING</option>
                        <option value="IDLE">IDLE</option>
                        <option value="FAULT">FAULT</option>
                      </select>
                    </div>
                  </div>
                  <button
                    onClick={triggerSimTelemetry}
                    className="px-4 py-1.5 rounded bg-blue-600 text-white font-semibold"
                  >
                    上报终端电流数据
                  </button>
                </div>
              )}

              {entranceTab === 'ingest' && (
                <div className="max-w-lg p-4 bg-slate-50 border border-slate-200 rounded space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-600 mb-1">样品条码</label>
                      <input
                        type="text"
                        value={simIngest.barcode}
                        onChange={(e) => setSimIngest({ ...simIngest, barcode: e.target.value })}
                        className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 mb-1">分析仪器编码</label>
                      <input
                        type="text"
                        value={simIngest.instrument_code}
                        onChange={(e) =>
                          setSimIngest({ ...simIngest, instrument_code: e.target.value })
                        }
                        className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-white font-mono"
                      />
                    </div>
                  </div>
                  <textarea
                    rows={2}
                    value={simIngest.raw_metrics_text}
                    onChange={(e) =>
                      setSimIngest({ ...simIngest, raw_metrics_text: e.target.value })
                    }
                    className="w-full border border-slate-300 rounded p-2 bg-white font-mono"
                  />
                  <button
                    onClick={triggerSimIngest}
                    className="px-4 py-1.5 rounded bg-blue-600 text-white font-semibold"
                  >
                    回传测样数据
                  </button>
                </div>
              )}

              {simResponseLog && (
                <pre className="p-3 rounded bg-slate-900 text-emerald-300 font-mono text-xs overflow-x-auto">
                  {simResponseLog}
                </pre>
              )}
            </div>
          )}

          {/* ==================== 模块 10：权限管理 (!roles & !roles/perms.14) ==================== */}
          {activeModule === 'roles' && (
            <div className="space-y-3">
              {/* 一级 Tab (对标 /lims/!roles 与 /lims/!roles/perms) */}
              <div className="border-b border-slate-300 flex gap-1 pt-1">
                <button
                  onClick={() => setRolesPrimaryTab('list')}
                  className={`px-4 py-1.5 rounded-t border border-b-0 font-medium ${
                    rolesPrimaryTab === 'list'
                      ? 'bg-white border-slate-300 text-blue-700 font-bold -mb-px'
                      : 'bg-slate-100 border-slate-200 text-slate-600'
                  }`}
                >
                  角色设置
                </button>
                <button
                  onClick={() => setRolesPrimaryTab('perms')}
                  className={`px-4 py-1.5 rounded-t border border-b-0 font-medium ${
                    rolesPrimaryTab === 'perms'
                      ? 'bg-white border-slate-300 text-blue-700 font-bold -mb-px'
                      : 'bg-slate-100 border-slate-200 text-slate-600'
                  }`}
                >
                  {currentEditingRole.label}权限设置
                </button>
                <button
                  onClick={() => setRolesPrimaryTab('user_role')}
                  className={`px-4 py-1.5 rounded-t border border-b-0 font-medium ${
                    rolesPrimaryTab === 'user_role'
                      ? 'bg-white border-slate-300 text-blue-700 font-bold -mb-px'
                      : 'bg-slate-100 border-slate-200 text-slate-600'
                  }`}
                >
                  成员角色分配
                </button>
              </div>

              {/* 视图 10A: 角色列表 (对标 /lims/!roles) */}
              {rolesPrimaryTab === 'list' && (
                <div className="space-y-2 max-w-2xl">
                  {rolesConfig.map((r) => (
                    <div
                      key={r.id}
                      className="p-2.5 bg-slate-50 border border-slate-200 rounded flex items-center justify-between hover:bg-blue-50/40"
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-6 text-center font-mono text-slate-400">
                          #{r.weight}
                        </span>
                        <span className="font-bold text-slate-800 w-48">{r.label}</span>
                        <span className="font-mono text-[11px] text-slate-500">({r.id})</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setEditingRoleId(r.id);
                            setRolesPrimaryTab('perms');
                          }}
                          className="px-3 py-1 rounded border border-slate-300 bg-white hover:bg-blue-600 hover:text-white hover:border-blue-600 text-slate-700 font-medium transition"
                        >
                          修改权限
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* 视图 10B: 分组勾选式角色权限设置 (1:1 对标 /lims/!roles/perms.14) */}
              {rolesPrimaryTab === 'perms' && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 bg-slate-100 border border-slate-200 p-2 rounded">
                    <span className="text-slate-600">当前编辑角色:</span>
                    <select
                      value={editingRoleId}
                      onChange={(e) => setEditingRoleId(e.target.value)}
                      className="border border-slate-300 rounded px-2.5 py-1 bg-white font-bold text-blue-700"
                    >
                      {rolesConfig.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.label} ({r.id})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* 全局权限组 */}
                  <div className="border border-slate-200 rounded overflow-hidden">
                    <div className="bg-slate-100 px-3 py-2 font-bold text-slate-800 border-b border-slate-200">
                      全局与组织机构管理
                    </div>
                    <div className="p-3 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      {[
                        { key: 'global_all', label: '管理所有内容' },
                        { key: 'global_org', label: '管理多级组织机构' },
                        { key: 'role_group', label: '管理权限分组与角色权重' },
                      ].map((item) => (
                        <label key={item.key} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!!currentEditingRole.perms[item.key]}
                            onChange={() => toggleRolePerm(item.key)}
                            className="accent-blue-600"
                          />
                          <span>{item.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* 成员管理权限组 (含 管理(所有) / 管理(下属)) */}
                  <div className="border border-slate-200 rounded overflow-hidden">
                    <div className="bg-slate-100 px-3 py-2 font-bold text-slate-800 border-b border-slate-200">
                      成员管理
                    </div>
                    <div className="p-3 space-y-3">
                      <div>
                        <div className="font-semibold text-slate-600 border-b border-slate-100 pb-1 mb-2">
                          管理 (所有)
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                          {[
                            { key: 'people_edit_all', label: '添加/修改所有成员信息' },
                            { key: 'people_role_all', label: '修改所有成员的角色' },
                            { key: 'people_view_contact', label: '查看所有成员的联系方式' },
                          ].map((item) => (
                            <label key={item.key} className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={!!currentEditingRole.perms[item.key]}
                                onChange={() => toggleRolePerm(item.key)}
                                className="accent-blue-600"
                              />
                              <span>{item.label}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div className="font-semibold text-slate-600 border-b border-slate-100 pb-1 mb-2">
                          管理 (下属机构/本课题组)
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={!!currentEditingRole.perms.people_edit_sub}
                              onChange={() => toggleRolePerm('people_edit_sub')}
                              className="accent-blue-600"
                            />
                            <span>添加/修改下属机构成员及项目配额</span>
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 仪器管理权限组 (含 管理(所有) / 管理(负责)) */}
                  <div className="border border-slate-200 rounded overflow-hidden">
                    <div className="bg-slate-100 px-3 py-2 font-bold text-slate-800 border-b border-slate-200">
                      仪器管理
                    </div>
                    <div className="p-3 space-y-3">
                      <div>
                        <div className="font-semibold text-slate-600 border-b border-slate-100 pb-1 mb-2">
                          管理 (所有)
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                          {[
                            { key: 'eq_edit_all', label: '添加/修改所有机构的仪器' },
                            { key: 'eq_status_all', label: '修改所有仪器的状态设置' },
                            { key: 'eq_records_all', label: '查看/核算所有仪器的使用记录' },
                          ].map((item) => (
                            <label key={item.key} className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={!!currentEditingRole.perms[item.key]}
                                onChange={() => toggleRolePerm(item.key)}
                                className="accent-blue-600"
                              />
                              <span>{item.label}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div className="font-semibold text-slate-600 border-b border-slate-100 pb-1 mb-2">
                          管理 (负责)
                        </div>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!!currentEditingRole.perms.eq_incharge_edit}
                            onChange={() => toggleRolePerm('eq_incharge_edit')}
                            className="accent-blue-600"
                          />
                          <span>管理负责仪器的预约、签到与使用记录</span>
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* 送样、实验记录与财务中心权限组 */}
                  <div className="border border-slate-200 rounded overflow-hidden">
                    <div className="bg-slate-100 px-3 py-2 font-bold text-slate-800 border-b border-slate-200">
                      测样、实验记录与财务中心
                    </div>
                    <div className="p-3 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      {[
                        { key: 'lims_submit', label: '发起样品送检与耗材领用' },
                        { key: 'lims_coa_issue', label: '审核签发测样报告(COA)' },
                        { key: 'eln_confidential_bypass', label: '豁免查阅跨科保密项目数据' },
                        { key: 'billing_manage', label: '管理财务部门与项目配额' },
                        { key: 'billing_erp_sync', label: '执行财务充值与ERP调账' },
                      ].map((item) => (
                        <label key={item.key} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!!currentEditingRole.perms[item.key]}
                            onChange={() => toggleRolePerm(item.key)}
                            className="accent-blue-600"
                          />
                          <span>{item.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <button
                      onClick={() =>
                        setNotice({
                          type: 'success',
                          text: `角色【${currentEditingRole.label}】权限配置已保存`,
                        })
                      }
                      className="px-5 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white font-semibold"
                    >
                      保存权限设置
                    </button>
                  </div>
                </div>
              )}

              {/* 视图 10C: 成员角色与三级机构变更 */}
              {rolesPrimaryTab === 'user_role' && (
                <form
                  onSubmit={handleUpdateUserRole}
                  className="max-w-lg p-4 bg-slate-50 border border-slate-200 rounded space-y-3"
                >
                  <div>
                    <label className="block text-slate-600 mb-1">目标成员</label>
                    <select
                      value={roleUpdateForm.target_user_id}
                      onChange={(e) =>
                        setRoleUpdateForm({ ...roleUpdateForm, target_user_id: e.target.value })
                      }
                      className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-white"
                    >
                      {data.users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.full_name} ({u.username}) - 当前: {u.system_role}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-600 mb-1">授予系统角色</label>
                      <select
                        value={roleUpdateForm.system_role}
                        onChange={(e) =>
                          setRoleUpdateForm({ ...roleUpdateForm, system_role: e.target.value })
                        }
                        className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-white"
                      >
                        <option value="ADMIN">平台负责人/超级管理员 (ADMIN)</option>
                        <option value="DEPT_HEAD">科室主任 (DEPT_HEAD)</option>
                        <option value="PI">课题组负责人 (PI)</option>
                        <option value="STAFF">所内职工/科研人员 (STAFF)</option>
                        <option value="OBSERVER">目前成员/观察员 (OBSERVER)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-slate-600 mb-1">所属三级课题组</label>
                      <input
                        type="text"
                        value={roleUpdateForm.sub_group_name}
                        onChange={(e) =>
                          setRoleUpdateForm({
                            ...roleUpdateForm,
                            sub_group_name: e.target.value,
                          })
                        }
                        className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-white"
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded bg-blue-600 text-white font-semibold"
                  >
                    更新成员角色
                  </button>
                </form>
              )}
            </div>
          )}
        </main>
      </div>

      {/* ==================== 底部状态栏 (#footer) ==================== */}
      <footer className="bg-[#e2e8f0] border-t border-slate-300 px-4 h-7 flex items-center justify-between text-[11px] text-slate-600 shrink-0">
        <span>release-2.25.0 · UniLab-OS</span>
        <span>大型仪器共享与综合实验室管理系统 © 2026 版权所有. 保留所有权利.</span>
      </footer>
    </div>
  );
}
