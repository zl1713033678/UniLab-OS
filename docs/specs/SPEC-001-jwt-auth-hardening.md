# SPEC-001 · 生产级密码哈希、Bearer JWT 鉴权中间件与角色权限持久化

- **状态**：`📝 规划中 (PLANNED) — 仅沉淀开发思路，暂不执行代码`
- **提出时间**：`2026-10-19 17:03:00+08:00`
- **开发完成时间**：`[待开发完成后回填 YYYY-MM-DD HH:mm:ss+08:00]`
- **原始需求描述**：
  > 将目前原型阶段的明文密码与请求体 `operator_user_id` 传递方式升级为生产级 `Authorization: Bearer` JWT 鉴权中间件，并闭环修复 `BUG-001`、`BUG-002`、`BUG-003`。

---

## 1. 业务痛点与核心场景拆解
1. 当前 `/api/v1/auth/login` 存在 `123456` 通用密码兜底，且返回伪 JWT 字符串未参与后续接口校验。
2. 所有业务路由直接从请求体/查询参数读取 `operator_user_id`，存在横向/纵向越权篡改风险。
3. 自助注册接口允许直接提交 `ADMIN` 角色，缺少默认降级为 `STAFF`/`PENDING` 的审批流。
4. 前端角色矩阵勾选未在后端落库，页面刷新后配置丢失。

## 2. 架构与算法设计（遵循 AGENTS.md 红线）
1. **密码哈希**：引入 `argon2` 或 `bcrypt` 对 `User.password_hash` 进行不可逆加盐哈希；Seed 数据仅在开发环境显式标记演示口令，移除通用后门。
2. **JWT 依赖注入**：新增 `get_current_user` FastAPI 依赖，从 `Authorization: Bearer <token>` 解析 `user_id` 与 `token_version`，禁止业务接口信任客户端伪造的 `operator_user_id`。
3. **注册最小权限**：公开 `/api/v1/auth/register` 强制锁定初始角色为 `STAFF`（或入库 `PENDING` 待科主任/超管审批）。
4. **细粒度权限落库**：新增 `RolePermission` 表持久化 5 级角色权限项，并在关键路由校验权限位。

## 3. 分阶段实施路线图与验收打卡表
- [ ] **Phase 1：后端密码哈希与 JWT `get_current_user` 依赖落地**（先补全 Red 安全越权测试）
- [ ] **Phase 2：自助注册角色收口与 `RolePermission` 落库联调**
- [ ] **Phase 3：前端携带 `Bearer` Token 与 401 自动跳转登录门户**
