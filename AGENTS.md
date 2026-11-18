# AGENTS.md · UniLab-OS 研发与 AI 协作宪章

> 修改本项目前，**必须先阅读本文档与 [`docs/STATUS.md`](./docs/STATUS.md)**，严守以下领域不变量、现代 Web 规范与门禁流程。

## 1. 核心代码地图

```text
UniLab-OS/
├── backend/
│   ├── models.py             # SQLAlchemy 2.0 ORM（含 LabRoom/DeviceUsageLog/SystemSetting，Numeric(12,4)）
│   ├── billing_engine.py     # 双费率判定、HOLD 冻结、SETTLE/REFUND 与幂等复式账本
│   ├── lab_services.py       # 房间/设备序列化、5级角色可视策略、WS Hub、施密特状态机、Excel/CSV与mDNS
│   ├── external_gateway.py   # /api/v1/ext/* 严格网关 + /api/v1/telemetry/ingest ESP32 兼容接入
│   ├── main.py               # FastAPI 路由、lifespan 离线巡检、系统设置、报表与静态托管
│   └── test_fusion.py        # 融合端到端回归测试（独立临时库隔离执行）
├── hardware/
│   ├── esp32/main/main.ino   # ESP32 + ACS712 电流采集与 mDNS 遥测固件模板（脱敏占位符）
│   └── simulate_esp32.py     # ESP32 四阶段迟滞与 --new 自动发现仿真脚本
└── frontend/src/
    ├── api/client.js         # API 请求、防公式注入 CSV 导出与 /ws/lab-status 自动重连
    ├── constants/visibilityPolicies.js # 5 级系统权限可视层级默认值与元数据
    ├── permissions.js        # 前端多层级 RBAC 与归口范围判定函数
    ├── components/           # AuthView、FloorplanTwin（SVG 1F/2F/3F 孪生）与 ui/* 现代 Web 原语
    ├── modules/              # 10 大业务模块视图（含系统设置可视层级与硬件网关控制台）
    └── App.jsx               # 顶层状态协调、权限分级裁剪、WS 同步与路由分发
```

## 2. 不可违背的领域与工程红线（Hard Invariants）

1. **定点数财务红线**：所有金额、单价、配额、时长、额定容量与电流/电压字段必须使用 `Numeric(12, 4)` 与 `Decimal`（经 `quantize_dec` 量化），严禁引入 `float` 金融计算。
2. **不可篡改复式账本**：`BillingLedger` 与 `DeviceUsageLog` 仅允许 Append-Only 写入；`BillingLedger` 须携带全局唯一 `idempotency_key`。
3. **跨科保密隔离与防自锁兜底**：`Project.is_confidential` 严控 ELN/COA 访问（仅项目成员或 `ADMIN` 可见）；超级管理员可视策略强制保留 `roles`/`profile`/`equipments` 防自锁死。
4. **FAULT 人工锁定与离线解耦**：设备进入 `FAULT` 后，物联网遥测不得自动清除告警，仅授权人员在平台端手动切换解除；心跳超时仅置 `is_online=False` 并在无进行中预约时安全归位 `IDLE`。
5. **前端现代 Web 规范**：工具栏须使用 `role="toolbar"` + `focusgroup`（配 roving-tabindex 回退）且开关使用 `aria-pressed` 不改文案；弹窗使用原生 `<dialog>.showModal()`；表单须绑定 `htmlFor`/`id` 与 `:user-invalid`；不得裸写 `::-webkit-scrollbar`。

## 3. 文档、排障与特性孵化门禁

1. **特性孵化禁令（Spec Gate）**：[`docs/specs/`](./docs/specs/README.md) 中 `PLANNED` 文档仅沉淀方案，**未经明确指令严禁修改业务代码**；交付后必须回填时间戳并刷新 `docs/STATUS.md`。
2. **科学排障闭环（Bug Fix Gate）**：新发现缺陷先登记 [`docs/BUGS.md`](./docs/BUGS.md) → 先写失败测试复现（Red）→ 最小修复（Green）→ 验收后移入 [`CHANGELOG.md`](./CHANGELOG.md)。
3. **状态快照覆写**：[`docs/STATUS.md`](./docs/STATUS.md) 始终覆写更新（≤80 行），禁止以补丁形式追加相互矛盾的旧结论。

## 4. 构建与验证必跑命令

- **后端回归测试**：`python -X utf8 -m unittest backend/test_fusion.py -v`
- **前端静态扫描（Modern Web）**：`npx.cmd -y modern-web-guidance@latest legacy-scan frontend/src --json`
- **前端生产构建**：`cd frontend && npm run build`
- **文档体检校验**：`python "<dev-docs-skill>/scripts/verify_docs.py" "E:\code\Lab\UniLab-OS"`
