# AGENTS.md · UniLab-OS 研发与 AI 协作宪章

> 修改本项目前，**必须先阅读本文档与 [`docs/STATUS.md`](./docs/STATUS.md)**，严守以下领域不变量、现代 Web 规范与门禁流程。

## 1. 核心代码地图

```text
UniLab-OS/
├── backend/
│   ├── models.py             # SQLAlchemy 2.0 ORM 模型（Numeric(12,4) 定点数）
│   ├── billing_engine.py     # 双费率判定、HOLD 冻结、SETTLE/REFUND 与幂等复式账本
│   ├── external_gateway.py   # /api/v1/ext/* 硬件遥测、RFID、仪器入库与 ERP 网关
│   └── main.py               # FastAPI 路由、RBAC 校验、种子数据、WS 广播与静态托管
└── frontend/
    ├── index.html            # 浅色主题壳层（动态更新 document.title）
    └── src/
        ├── api/client.js     # API 请求封装、CSV 导出与 /ws/lab-status 自动重连
        ├── permissions.js    # 前端多层级 RBAC 与归口范围判定函数
        ├── components/       # AuthView 门户 + ui/ 原生模态框/抽屉/表格/表单/通知原语
        ├── modules/          # 10 大业务模块视图（Profile/Equipments/Samples/...）
        └── App.jsx           # 顶层状态协调、会话恢复与路由分发
```

## 2. 不可违背的领域与工程红线（Hard Invariants）

1. **定点数财务红线**：所有金额、单价、配额、时长与电流字段必须使用 `Numeric(12, 4)` 与 `Decimal`（经 `quantize_dec` 量化），严禁引入 `float` 运算。
2. **不可篡改复式账本**：`BillingLedger` 仅允许 Append-Only 写入，且每笔交易必须携带全局唯一 `idempotency_key`；`HOLD`/`SETTLE`/`REFUND` 须同时更新项目余额与 `ProjectMember.used_quota`。
3. **跨科保密隔离**：启用 `Project.is_confidential` 时，非项目白名单成员（含无关科室 `DEPT_HEAD`）不得获取 ELN 正文与 LIMS 原始 COA 指标，仅 `ADMIN` 豁免。
4. **双费率判定与并发保护**：`operator.home_dept_id == resource.owner_dept_id` 走 `INTERNAL`，否则走 `EXTERNAL`；设备与组织删除必须阻断未完结预约/挂载资源。
5. **前端现代 Web 规范**：危险操作必须经原生 `<dialog>`（`ConfirmDialog`）二次确认；表单须绑定 `htmlFor`/`id`、交互后 `:user-invalid` 与密码 `autocomplete`；不得裸写 `::-webkit-scrollbar` 而不配标准属性与 `@supports` 回退。

## 3. 文档、排障与特性孵化门禁

1. **特性孵化禁令（Spec Gate）**：[`docs/specs/`](./docs/specs/README.md) 中 `PLANNED` 文档仅沉淀方案，**未经明确指令严禁修改业务代码**；交付后必须回填时间戳并刷新 `docs/STATUS.md`。
2. **科学排障闭环（Bug Fix Gate）**：新发现缺陷先登记 [`docs/BUGS.md`](./docs/BUGS.md) → 先写失败测试复现（Red）→ 最小修复（Green）→ 验收后移入 [`CHANGELOG.md`](./CHANGELOG.md)。
3. **状态快照覆写**：[`docs/STATUS.md`](./docs/STATUS.md) 始终覆写更新（≤80 行），禁止以补丁形式追加相互矛盾的旧结论。

## 4. 构建与验证必跑命令

- **前端静态扫描（Modern Web）**：`npx.cmd -y modern-web-guidance@latest legacy-scan frontend/src --json`
- **前端生产构建**：`cd frontend && npm run build`
- **后端导入与探活**：`python -X utf8 -c "from fastapi.testclient import TestClient; from backend.main import app; print(TestClient(app).get('/health').json())"`
- **文档体检校验**：`python "<dev-docs-skill>/scripts/verify_docs.py" "E:\code\Lab\UniLab-OS"`
