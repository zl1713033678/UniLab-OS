/**
 * 多层级角色界面可视策略（默认值 + 超级管理员配置元数据）
 */

export const ROLE_META = [
  { id: 'ADMIN', weight: 1, label: '平台负责人 / 超级管理员', locked: true },
  { id: 'DEPT_HEAD', weight: 2, label: '科室主任' },
  { id: 'PI', weight: 3, label: '课题组负责人 (PI)' },
  { id: 'STAFF', weight: 4, label: '所内职工 / 仪器管理员' },
  { id: 'OBSERVER', weight: 5, label: '只读观察员 / 访客' },
];

export const MODULE_VISIBILITY_DEFS = [
  { key: 'profile', label: '个人档案', alwaysForAdmin: true },
  { key: 'equipments', label: '仪器目录与平面图监控', alwaysForAdmin: true },
  { key: 'samples', label: '测样报告审核 (LIMS)' },
  { key: 'consumables', label: '耗材管理' },
  { key: 'labs', label: '课题组与组织架构' },
  { key: 'people', label: '成员目录' },
  { key: 'billing', label: '财务中心' },
  { key: 'eln', label: '成果与记录 (ELN)' },
  { key: 'entrance', label: '门禁与物联网网关' },
  { key: 'roles', label: '系统设置与权限', alwaysForAdmin: true },
];

export const FLOORPLAN_VISIBILITY_DEFS = [
  { key: 'view_all_depts', label: '查看全院 1F/2F/3F 房间（关闭后仅可见归口本科室空间）' },
  { key: 'show_telemetry', label: '显示实时电流 / 电压遥测数值' },
  { key: 'show_heatmap', label: '允许开启房间负荷热力透视' },
  { key: 'edit_rooms', label: '允许新增/重命名房间及拖拽调整平面图坐标' },
  { key: 'control_device_status', label: '允许在房间抽屉手动切换状态与解除 FAULT 锁' },
  { key: 'handle_hardware_discovery', label: '接收未知硬件自动发现弹窗并分配科室' },
];

export const DATA_VISIBILITY_DEFS = [
  { key: 'show_sidebar_balance', label: '显示左侧边栏当前项目余额卡片' },
  { key: 'show_global_finance', label: '显示全平台科室服务产值汇总与 ERP 对账' },
  { key: 'show_org_management', label: '显示组织机构增删改管理面板' },
  { key: 'export_reports', label: '允许导出设备使用履历 CSV / 多表 Excel 报表' },
];

export const DEFAULT_ROLE_VISIBILITY_POLICIES = {
  ADMIN: {
    modules: {
      profile: true,
      equipments: true,
      samples: true,
      consumables: true,
      labs: true,
      people: true,
      billing: true,
      eln: true,
      entrance: true,
      roles: true,
    },
    floorplan: {
      view_all_depts: true,
      show_telemetry: true,
      show_heatmap: true,
      edit_rooms: true,
      control_device_status: true,
      handle_hardware_discovery: true,
    },
    data: {
      show_sidebar_balance: true,
      show_global_finance: true,
      show_org_management: true,
      export_reports: true,
    },
  },
  DEPT_HEAD: {
    modules: {
      profile: true,
      equipments: true,
      samples: true,
      consumables: true,
      labs: true,
      people: true,
      billing: true,
      eln: true,
      entrance: true,
      roles: false,
    },
    floorplan: {
      view_all_depts: true,
      show_telemetry: true,
      show_heatmap: true,
      edit_rooms: true,
      control_device_status: true,
      handle_hardware_discovery: true,
    },
    data: {
      show_sidebar_balance: true,
      show_global_finance: true,
      show_org_management: true,
      export_reports: true,
    },
  },
  PI: {
    modules: {
      profile: true,
      equipments: true,
      samples: true,
      consumables: true,
      labs: true,
      people: true,
      billing: true,
      eln: true,
      entrance: false,
      roles: false,
    },
    floorplan: {
      view_all_depts: true,
      show_telemetry: true,
      show_heatmap: true,
      edit_rooms: false,
      control_device_status: false,
      handle_hardware_discovery: false,
    },
    data: {
      show_sidebar_balance: true,
      show_global_finance: false,
      show_org_management: false,
      export_reports: true,
    },
  },
  STAFF: {
    modules: {
      profile: true,
      equipments: true,
      samples: true,
      consumables: true,
      labs: true,
      people: true,
      billing: false,
      eln: true,
      entrance: false,
      roles: false,
    },
    floorplan: {
      view_all_depts: true,
      show_telemetry: true,
      show_heatmap: true,
      edit_rooms: false,
      control_device_status: true,
      handle_hardware_discovery: false,
    },
    data: {
      show_sidebar_balance: true,
      show_global_finance: false,
      show_org_management: false,
      export_reports: true,
    },
  },
  OBSERVER: {
    modules: {
      profile: true,
      equipments: true,
      samples: false,
      consumables: false,
      labs: false,
      people: false,
      billing: false,
      eln: true,
      entrance: false,
      roles: false,
    },
    floorplan: {
      view_all_depts: true,
      show_telemetry: true,
      show_heatmap: true,
      edit_rooms: false,
      control_device_status: false,
      handle_hardware_discovery: false,
    },
    data: {
      show_sidebar_balance: false,
      show_global_finance: false,
      show_org_management: false,
      export_reports: false,
    },
  },
};

export function resolveRoleVisibilityPolicy(policies, operator) {
  const roleId = operator?.system_role || 'STAFF';
  const base =
    DEFAULT_ROLE_VISIBILITY_POLICIES[roleId] || DEFAULT_ROLE_VISIBILITY_POLICIES.STAFF;
  const custom = policies?.[roleId] || {};
  return {
    modules: { ...base.modules, ...(custom.modules || {}) },
    floorplan: { ...base.floorplan, ...(custom.floorplan || {}) },
    data: { ...base.data, ...(custom.data || {}) },
  };
}

export function getFirstAccessibleModule(policy) {
  const order = [
    'equipments',
    'profile',
    'samples',
    'consumables',
    'labs',
    'people',
    'billing',
    'eln',
    'entrance',
    'roles',
  ];
  return order.find((id) => policy?.modules?.[id]) || 'profile';
}
