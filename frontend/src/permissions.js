/**
 * 多层级权限判定工具函数 (RBAC + 组织归口 + 项目矩阵)
 *
 * 层级规则：
 * 1. ADMIN (平台负责人/超级管理员)：全平台所有资源的增删改查权限。
 * 2. DEPT_HEAD (科室主任)：
 *    - 可管理本科室及下属课题组机构信息；
 *    - 可添加/修改/删除本科室下属普通成员；
 *    - 可添加/修改/报废删除本科室归口仪器设备、耗材库存；
 *    - 可管理依托本科室的课题组项目，但无权查看未授权跨科保密项目的 ELN/COA 内容。
 * 3. PI (项目负责人)：
 *    - 可新建项目，修改/删除自己负责(PI)的项目；
 *    - 可添加/修改/移除自己项目内的成员与消费配额；
 *    - 可取消本项目下的未上机预约、撤回待检送样、编辑/解锁本项目下的实验记录。
 * 4. STAFF (所内职工/科研人员/仪器管理员)：
 *    - 可修改归口本科室仪器的常规运行参数与耗材库存补货；
 *    - 可签发承检科室的测样报告(COA)；
 *    - 可修改本人个人资料、取消本人未上机预约、撤回本人待检样品、编辑/删除本人未锁定实验记录。
 * 5. OBSERVER (观察员)：
 *    - 仅可浏览授权数据與修改本人基础联系资料，无权发起扣费或增删业务数据。
 */

export function isSuperAdmin(operator) {
  return operator?.system_role === 'ADMIN';
}

export function canCreateOrg(operator) {
  return ['ADMIN', 'DEPT_HEAD'].includes(operator?.system_role);
}

export function canEditOrg(operator, dept) {
  if (!operator || !dept) return false;
  if (operator.system_role === 'ADMIN') return true;
  return (
    operator.system_role === 'DEPT_HEAD' &&
    (dept.id === operator.home_dept_id || dept.parent_id === operator.home_dept_id)
  );
}

export function canDeleteOrg(operator, dept) {
  if (!operator || !dept) return false;
  if (operator.system_role === 'ADMIN') return true;
  return operator.system_role === 'DEPT_HEAD' && dept.parent_id === operator.home_dept_id;
}

export function canCreateProject(operator) {
  return ['ADMIN', 'DEPT_HEAD', 'PI'].includes(operator?.system_role);
}

export function canEditProject(operator, project, projectMembers = []) {
  if (!operator || !project) return false;
  if (operator.system_role === 'ADMIN') return true;
  if (project.pi_user_id === operator.id) return true;
  if (operator.system_role === 'DEPT_HEAD' && operator.home_dept_id === project.lead_dept_id) {
    return true;
  }
  const pm = projectMembers.find(
    (m) => m.project_id === project.id && m.user_id === operator.id
  );
  return pm?.project_role === 'PI';
}

export function canDeleteProject(operator, project, projectMembers = []) {
  if (!operator || !project) return false;
  if (operator.system_role === 'ADMIN') return true;
  if (project.pi_user_id === operator.id) return true;
  const pm = projectMembers.find(
    (m) => m.project_id === project.id && m.user_id === operator.id
  );
  return pm?.project_role === 'PI';
}

export function canEditUser(operator, targetUser) {
  if (!operator || !targetUser) return false;
  if (operator.system_role === 'ADMIN') return true;
  if (operator.id === targetUser.id) return true;
  return (
    operator.system_role === 'DEPT_HEAD' &&
    operator.home_dept_id === targetUser.home_dept_id
  );
}

export function canDeleteUser(operator, targetUser) {
  if (!operator || !targetUser || operator.id === targetUser.id) return false;
  if (operator.system_role === 'ADMIN') return true;
  return (
    operator.system_role === 'DEPT_HEAD' &&
    operator.home_dept_id === targetUser.home_dept_id &&
    !['ADMIN', 'DEPT_HEAD'].includes(targetUser.system_role)
  );
}

export function canCreateDevice(operator) {
  return ['ADMIN', 'DEPT_HEAD'].includes(operator?.system_role);
}

export function canEditDevice(operator, device) {
  if (!operator || !device) return false;
  if (operator.system_role === 'ADMIN') return true;
  return (
    operator.home_dept_id === device.owner_dept_id &&
    ['DEPT_HEAD', 'STAFF'].includes(operator.system_role)
  );
}

export function canDeleteDevice(operator, device) {
  if (!operator || !device) return false;
  if (operator.system_role === 'ADMIN') return true;
  return (
    operator.system_role === 'DEPT_HEAD' &&
    operator.home_dept_id === device.owner_dept_id
  );
}

export function canCancelOrDeleteReservation(operator, res, projects = [], devices = []) {
  if (!operator || !res) return false;
  if (operator.system_role === 'ADMIN') return true;
  const dev = devices.find((d) => d.id === res.device_id);
  const isDevDeptHead =
    dev && operator.system_role === 'DEPT_HEAD' && operator.home_dept_id === dev.owner_dept_id;
  if (isDevDeptHead) return true;
  if (res.status === 'RESERVED') {
    if (res.operator_user_id === operator.id) return true;
    const prj = projects.find((p) => p.id === res.project_id);
    if (prj && prj.pi_user_id === operator.id) return true;
  }
  return false;
}

export function canCreateConsumable(operator) {
  return ['ADMIN', 'DEPT_HEAD'].includes(operator?.system_role);
}

export function canEditConsumable(operator, consumable) {
  if (!operator || !consumable) return false;
  if (operator.system_role === 'ADMIN') return true;
  return (
    operator.home_dept_id === consumable.owner_dept_id &&
    ['DEPT_HEAD', 'STAFF'].includes(operator.system_role)
  );
}

export function canDeleteConsumable(operator, consumable) {
  if (!operator || !consumable) return false;
  if (operator.system_role === 'ADMIN') return true;
  return (
    operator.system_role === 'DEPT_HEAD' &&
    operator.home_dept_id === consumable.owner_dept_id
  );
}

export function canDeleteSample(operator, sample, projects = []) {
  if (!operator || !sample) return false;
  if (operator.system_role === 'ADMIN') return true;
  if (sample.status === 'REGISTERED') {
    if (sample.submitter_user_id === operator.id) return true;
    const prj = projects.find((p) => p.id === sample.project_id);
    if (prj && prj.pi_user_id === operator.id) return true;
    if (
      operator.system_role === 'DEPT_HEAD' &&
      operator.home_dept_id === sample.target_dept_id
    ) {
      return true;
    }
  }
  return false;
}

export function canEditELN(operator, eln, projects = []) {
  if (!operator || !eln || eln.is_locked) return false;
  if (operator.system_role === 'ADMIN') return true;
  if (eln.author_user_id === operator.id) return true;
  const prj = projects.find((p) => p.id === eln.project_id);
  return prj && prj.pi_user_id === operator.id;
}

export function canUnlockELN(operator, eln, projects = []) {
  if (!operator || !eln || !eln.is_locked) return false;
  if (operator.system_role === 'ADMIN') return true;
  const prj = projects.find((p) => p.id === eln.project_id);
  return prj && prj.pi_user_id === operator.id;
}

export function canDeleteELN(operator, eln, projects = []) {
  if (!operator || !eln) return false;
  if (operator.system_role === 'ADMIN') return true;
  if (eln.is_locked) return false;
  if (eln.author_user_id === operator.id) return true;
  const prj = projects.find((p) => p.id === eln.project_id);
  return prj && prj.pi_user_id === operator.id;
}
