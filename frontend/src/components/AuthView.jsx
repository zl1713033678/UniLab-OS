import React, { useState } from 'react';
import {
  Cpu,
  ShieldCheck,
  Database,
  Radio,
  Eye,
  EyeOff,
  ArrowRight,
  Sparkles,
  UserPlus,
  Building2,
  LogIn,
} from 'lucide-react';
import TabBar from './ui/TabBar';
import { FormField, INPUT_CLS } from './ui/FormField';

export default function AuthView({
  users,
  departments,
  projects,
  loginForm,
  setLoginForm,
  registerForm,
  setRegisterForm,
  orgNodeForm,
  setOrgNodeForm,
  onLoginSubmit,
  onRegisterSubmit,
  onCreateOrgNode,
  onQuickLoginUser,
  onEnterDemoDirectly,
}) {
  const [authTab, setAuthTab] = useState('login');
  const [showLoginPwd, setShowLoginPwd] = useState(false);
  const [showRegPwd, setShowRegPwd] = useState(false);

  const authTabs = [
    { id: 'login', label: '系统登录' },
    { id: 'register_user', label: '注册新用户' },
    { id: 'register_lab', label: '注册新课题组' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50/40 to-slate-100 text-slate-900 flex flex-col justify-between">
      {/* 顶部栏 */}
      <header className="bg-gradient-to-r from-slate-900 via-blue-950 to-blue-900 text-white px-4 sm:px-6 h-12 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-blue-500/20 border border-blue-400/30 flex items-center justify-center shrink-0">
            <Cpu className="w-4 h-4 text-blue-300" aria-hidden="true" />
          </div>
          <span className="font-bold tracking-wide text-sm truncate">
            UniLab-OS · 大型仪器共享与综合实验室管理系统
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs shrink-0">
          <span className="hidden sm:inline text-blue-200/80">标准科研内网门户</span>
          <button
            type="button"
            onClick={onEnterDemoDirectly}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white font-medium border border-white/15 transition"
          >
            <span>直接进入工作台</span>
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      </header>

      {/* 主内容区 */}
      <main id="main-content" tabIndex={-1} className="flex-1 flex items-center justify-center p-4 sm:p-8">
        <div className="max-w-5xl w-full grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* 左侧平台概览面板 */}
          <section
            aria-label="平台核心能力"
            className="lg:col-span-5 rounded-2xl bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 text-white p-6 sm:p-7 flex flex-col justify-between shadow-xl border border-slate-800"
          >
            <div className="space-y-5">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/20 border border-blue-400/30 text-blue-200 text-[11px] font-medium">
                <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                <span>FMS · LIMS · ELN · 复式核算一体化</span>
              </div>

              <div>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
                  科研院所大型仪器与综合实验平台
                </h1>
                <p className="mt-2 text-xs text-slate-300 leading-relaxed">
                  打通仪器预约与边缘电流遥测、样品送检与 COA 报告隔离、电子实验记录本与跨科项目复式财务结算闭环。
                </p>
              </div>

              <ul className="space-y-3 pt-2 text-xs text-slate-200">
                <li className="flex items-start gap-2.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" aria-hidden="true" />
                  <div>
                    <strong className="text-white block">多层级 RBAC 与跨科保密隔离</strong>
                    <span className="text-slate-400">
                      支持 5 级角色权责控制，保密项目的 ELN 正文与 COA 谱图仅限白名单成员查阅。
                    </span>
                  </div>
                </li>
                <li className="flex items-start gap-2.5">
                  <Database className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" aria-hidden="true" />
                  <div>
                    <strong className="text-white block">双费率预授权与定点数复式记账</strong>
                    <span className="text-slate-400">
                      自动区分科内优惠与跨科协同费率，下机按实际高负载机时多退少补。
                    </span>
                  </div>
                </li>
                <li className="flex items-start gap-2.5">
                  <Radio className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
                  <div>
                    <strong className="text-white block">物联网边缘监控与 WebSocket 实时同步</strong>
                    <span className="text-slate-400">
                      集成 RFID 刷卡开机、ESP32 电流遥测断电保护及财务 ERP 凭证幂等拨款。
                    </span>
                  </div>
                </li>
              </ul>
            </div>

            <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-between text-[11px] text-slate-400">
              <span>演示默认密码：<code className="font-mono text-blue-200">123456</code></span>
              <span className="font-mono">v2.25 · Numeric(12,4)</span>
            </div>
          </section>

          {/* 右侧登录与注册卡片 */}
          <section
            aria-label="身份认证与注册"
            className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl shadow-lg overflow-hidden flex flex-col"
          >
            <div className="bg-slate-50/90 px-4 pt-3">
              <TabBar
                label="认证方式切换"
                tabs={authTabs}
                activeId={authTab}
                onChange={setAuthTab}
              />
            </div>

            <div className="p-5 sm:p-6 flex-1">
              {authTab === 'login' && (
                <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                  <form
                    onSubmit={onLoginSubmit}
                    aria-labelledby="signin-heading"
                    className="md:col-span-6 space-y-4"
                  >
                    <h2 id="signin-heading" className="text-sm font-bold text-slate-900 pb-2 border-b border-slate-100 flex items-center gap-1.5">
                      <LogIn className="w-4 h-4 text-blue-600" aria-hidden="true" />
                      <span>账号密码登录</span>
                    </h2>

                    <FormField
                      label="登录账号"
                      required
                      errorText="请输入您的登录账号。"
                    >
                      {(props) => (
                        <input
                          {...props}
                          type="text"
                          name="username"
                          autoComplete="username"
                          spellCheck={false}
                          autoCapitalize="none"
                          autoCorrect="off"
                          enterKeyHint="next"
                          value={loginForm.username}
                          onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })}
                          className={INPUT_CLS}
                          required
                        />
                      )}
                    </FormField>

                    <FormField
                      label="密码"
                      required
                      errorText="请输入登录密码。"
                    >
                      {(props) => (
                        <div className="relative">
                          <input
                            {...props}
                            type={showLoginPwd ? 'text' : 'password'}
                            name="password"
                            autoComplete="current-password"
                            enterKeyHint="done"
                            value={loginForm.password}
                            onChange={(e) =>
                              setLoginForm({ ...loginForm, password: e.target.value })
                            }
                            className={`${INPUT_CLS} pr-9`}
                            required
                          />
                          <button
                            type="button"
                            aria-pressed={showLoginPwd}
                            aria-label={showLoginPwd ? '隐藏密码' : '显示密码'}
                            onClick={() => setShowLoginPwd((v) => !v)}
                            className="absolute inset-y-0 right-1.5 my-auto h-7 w-7 flex items-center justify-center rounded text-slate-500 hover:text-slate-800 hover:bg-slate-100"
                          >
                            {showLoginPwd ? (
                              <EyeOff className="w-3.5 h-3.5" aria-hidden="true" />
                            ) : (
                              <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                            )}
                          </button>
                        </div>
                      )}
                    </FormField>

                    <div className="pt-1 flex flex-wrap items-center gap-2">
                      <button
                        type="submit"
                        className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition"
                      >
                        登录系统
                      </button>
                      <button
                        type="button"
                        onClick={() => setAuthTab('register_user')}
                        className="px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium transition"
                      >
                        注册新用户
                      </button>
                    </div>
                  </form>

                  {/* 内置测试账号快捷切换 */}
                  <div className="md:col-span-6 md:border-l border-slate-200 md:pl-5 space-y-2.5">
                    <h2 className="text-sm font-bold text-slate-900 pb-2 border-b border-slate-100">
                      内置角色一键体验
                    </h2>
                    <div className="space-y-2 max-h-72 overflow-y-auto custom-scrollbar pr-1">
                      {users.map((u) => (
                        <div
                          key={u.id}
                          className="flex items-center justify-between gap-2 p-2.5 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-blue-50/60 hover:border-blue-200 transition"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-xs text-slate-900 truncate">
                                {u.full_name}
                              </span>
                              <span className="px-1.5 py-0.2 rounded bg-blue-100/80 text-blue-800 font-mono text-[10px]">
                                {u.system_role}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500 truncate mt-0.5">
                              {u.home_dept_name} · <span className="font-mono">{u.username}</span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => onQuickLoginUser(u)}
                            className="shrink-0 px-2.5 py-1.5 rounded-lg bg-white border border-blue-200 text-blue-700 hover:bg-blue-600 hover:text-white hover:border-blue-600 text-[11px] font-semibold transition"
                          >
                            登录
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {authTab === 'register_user' && (
                <form
                  onSubmit={onRegisterSubmit}
                  aria-labelledby="signup-heading"
                  className="space-y-4"
                >
                  <h2 id="signup-heading" className="text-sm font-bold text-slate-900 pb-2 border-b border-slate-100 flex items-center gap-1.5">
                    <UserPlus className="w-4 h-4 text-blue-600" aria-hidden="true" />
                    <span>注册新实验室成员</span>
                  </h2>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <FormField label="登录账号" required errorText="请填写登录账号。">
                      {(props) => (
                        <input
                          {...props}
                          type="text"
                          name="username"
                          autoComplete="username"
                          spellCheck={false}
                          autoCapitalize="none"
                          autoCorrect="off"
                          value={registerForm.username}
                          onChange={(e) =>
                            setRegisterForm({ ...registerForm, username: e.target.value })
                          }
                          className={INPUT_CLS}
                          required
                        />
                      )}
                    </FormField>

                    <FormField label="姓名" required errorText="请填写您的真实姓名。">
                      {(props) => (
                        <input
                          {...props}
                          type="text"
                          name="full_name"
                          autoComplete="name"
                          value={registerForm.full_name}
                          onChange={(e) =>
                            setRegisterForm({ ...registerForm, full_name: e.target.value })
                          }
                          className={INPUT_CLS}
                          required
                        />
                      )}
                    </FormField>

                    <FormField
                      label="设置密码"
                      required
                      hint="建议至少 6 位，支持浏览器自动生成与保存。"
                      errorText="请设置至少 6 位登录密码。"
                    >
                      {(props) => (
                        <div className="relative">
                          <input
                            {...props}
                            type={showRegPwd ? 'text' : 'password'}
                            name="new-password"
                            autoComplete="new-password"
                            minLength={6}
                            value={registerForm.password}
                            onChange={(e) =>
                              setRegisterForm({ ...registerForm, password: e.target.value })
                            }
                            className={`${INPUT_CLS} pr-9`}
                            required
                          />
                          <button
                            type="button"
                            aria-pressed={showRegPwd}
                            aria-label={showRegPwd ? '隐藏密码' : '显示密码'}
                            onClick={() => setShowRegPwd((v) => !v)}
                            className="absolute inset-y-0 right-1.5 my-auto h-7 w-7 flex items-center justify-center rounded text-slate-500 hover:text-slate-800 hover:bg-slate-100"
                          >
                            {showRegPwd ? (
                              <EyeOff className="w-3.5 h-3.5" aria-hidden="true" />
                            ) : (
                              <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                            )}
                          </button>
                        </div>
                      )}
                    </FormField>

                    <FormField label="电子邮箱" errorText="请输入有效的电子邮箱地址。">
                      {(props) => (
                        <input
                          {...props}
                          type="email"
                          name="email"
                          autoComplete="email"
                          spellCheck={false}
                          value={registerForm.email}
                          onChange={(e) =>
                            setRegisterForm({ ...registerForm, email: e.target.value })
                          }
                          className={INPUT_CLS}
                        />
                      )}
                    </FormField>

                    <FormField label="组织机构 (行政科室)" required>
                      {(props) => (
                        <select
                          {...props}
                          name="home_dept_id"
                          value={registerForm.home_dept_id}
                          onChange={(e) =>
                            setRegisterForm({ ...registerForm, home_dept_id: e.target.value })
                          }
                          className={INPUT_CLS}
                        >
                          {departments.map((d) => (
                            <option key={d.id} value={d.id}>
                              所内用户 » 集约化中心 » {d.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </FormField>

                    <FormField label="所属课题组/研究室">
                      {(props) => (
                        <input
                          {...props}
                          type="text"
                          name="sub_group_name"
                          value={registerForm.sub_group_name}
                          onChange={(e) =>
                            setRegisterForm({ ...registerForm, sub_group_name: e.target.value })
                          }
                          className={INPUT_CLS}
                        />
                      )}
                    </FormField>

                    <FormField label="人员角色">
                      {(props) => (
                        <select
                          {...props}
                          name="system_role"
                          value={registerForm.system_role}
                          onChange={(e) =>
                            setRegisterForm({ ...registerForm, system_role: e.target.value })
                          }
                          className={INPUT_CLS}
                        >
                          <option value="STAFF">所内职工 / 科研人员</option>
                          <option value="PI">课题组负责人 (PI)</option>
                          <option value="DEPT_HEAD">科室主任</option>
                          <option value="OBSERVER">目前成员 (观察员)</option>
                          <option value="ADMIN">平台负责人/超级管理员</option>
                        </select>
                      )}
                    </FormField>

                    <FormField label="关联财务项目">
                      {(props) => (
                        <select
                          {...props}
                          name="join_project_id"
                          value={registerForm.join_project_id}
                          onChange={(e) =>
                            setRegisterForm({ ...registerForm, join_project_id: e.target.value })
                          }
                          className={INPUT_CLS}
                        >
                          {projects.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.code} - {p.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </FormField>
                  </div>

                  <div className="pt-1">
                    <button
                      type="submit"
                      className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition"
                    >
                      完成注册并进入工作台
                    </button>
                  </div>
                </form>
              )}

              {authTab === 'register_lab' && (
                <form
                  onSubmit={onCreateOrgNode}
                  aria-labelledby="reg-lab-heading"
                  className="space-y-4"
                >
                  <h2 id="reg-lab-heading" className="text-sm font-bold text-slate-900 pb-2 border-b border-slate-100 flex items-center gap-1.5">
                    <Building2 className="w-4 h-4 text-blue-600" aria-hidden="true" />
                    <span>注册新课题组 / 实验室机构</span>
                  </h2>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <FormField label="课题组编码" required errorText="请填写机构编码。">
                      {(props) => (
                        <input
                          {...props}
                          type="text"
                          name="code"
                          spellCheck={false}
                          value={orgNodeForm.code}
                          onChange={(e) => setOrgNodeForm({ ...orgNodeForm, code: e.target.value })}
                          className={`${INPUT_CLS} font-mono`}
                          required
                        />
                      )}
                    </FormField>

                    <FormField label="课题组名称" required errorText="请填写机构名称。">
                      {(props) => (
                        <input
                          {...props}
                          type="text"
                          name="name"
                          value={orgNodeForm.name}
                          onChange={(e) => setOrgNodeForm({ ...orgNodeForm, name: e.target.value })}
                          className={INPUT_CLS}
                          required
                        />
                      )}
                    </FormField>

                    <FormField label="上级组织机构">
                      {(props) => (
                        <select
                          {...props}
                          name="parent_id"
                          value={orgNodeForm.parent_id}
                          onChange={(e) =>
                            setOrgNodeForm({ ...orgNodeForm, parent_id: e.target.value })
                          }
                          className={INPUT_CLS}
                        >
                          {departments.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.name} ({d.code})
                            </option>
                          ))}
                        </select>
                      )}
                    </FormField>

                    <FormField label="建立者 / 负责人">
                      {(props) => (
                        <input
                          {...props}
                          type="text"
                          name="manager_name"
                          value={orgNodeForm.manager_name}
                          onChange={(e) =>
                            setOrgNodeForm({ ...orgNodeForm, manager_name: e.target.value })
                          }
                          className={INPUT_CLS}
                        />
                      )}
                    </FormField>
                  </div>

                  <div className="pt-1">
                    <button
                      type="submit"
                      className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition"
                    >
                      提交课题组注册
                    </button>
                  </div>
                </form>
              )}
            </div>
          </section>
        </div>
      </main>

      <footer className="bg-white/80 border-t border-slate-200 px-5 h-9 flex items-center justify-between text-[11px] text-slate-500">
        <span>release-2.25.0 · UniLab-OS</span>
        <span>大型仪器共享与综合实验室管理系统 © 2026</span>
      </footer>
    </div>
  );
}
